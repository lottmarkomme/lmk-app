const ALLOWED_ORIGIN = "https://lottmarkomme.github.io";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function responseText(response: Record<string, any>) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Methode nicht erlaubt." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const apiKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  let protocolId = "";

  try {
    const input = await req.json();
    protocolId = String(input?.protocol_id || "");
    if (!uuidPattern.test(protocolId)) return json({ error: "Ungültige Protokoll-ID." }, 400);

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${jwt}` },
    });
    if (!userResponse.ok) return json({ error: "Anmeldung abgelaufen." }, 401);
    const user = await userResponse.json();

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: serviceHeaders },
    );
    const profiles = await profileResponse.json();
    const profile = profiles?.[0];
    if (!profile || !["spiess", "vorstand", "admin"].includes(profile.role)) {
      return json({ error: "Nur Spieß, Vorstand und Admin dürfen Protokolle auswerten." }, 403);
    }

    const protocolResponse = await fetch(
      `${supabaseUrl}/rest/v1/protokolle?select=*&id=eq.${protocolId}&limit=1`,
      { headers: serviceHeaders },
    );
    const protocol = (await protocolResponse.json())?.[0];
    if (!protocol) return json({ error: "Protokoll nicht gefunden." }, 404);
    if (protocol.status === "ready") return json({ success: true, summary: protocol.summary });

    const claimResponse = await fetch(
      `${supabaseUrl}/rest/v1/protokolle?id=eq.${protocolId}&status=neq.processing`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: "processing", error_message: null }),
      },
    );
    const claimed = await claimResponse.json();
    if (!claimResponse.ok) throw new Error(claimed?.message || "Auswertung konnte nicht gestartet werden.");
    if (!claimed.length) return json({ error: "Dieses Protokoll wird bereits ausgewertet." }, 409);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY ist in Supabase noch nicht eingerichtet.");

    const fileResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/protokolle/${filePath(protocol.storage_path)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!fileResponse.ok) throw new Error("Die hochgeladene Datei konnte nicht gelesen werden.");
    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Die Datei ist leer oder größer als 8 MB.");

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-6-astra",
        store: false,
        input: [{
          role: "user",
          content: [
            {
              type: "input_file",
              filename: protocol.original_name,
              file_data: `data:${protocol.mime_type};base64,${toBase64(bytes)}`,
            },
            {
              type: "input_text",
              text: "Werte dieses Protokoll eines deutschen Schützenzugs sorgfältig aus. Schreibe eine sachliche, gut verständliche Zusammenfassung auf Deutsch. Erfasse nur ausdrücklich beschlossene Entscheidungen und konkrete Aufgaben. Erfinde keine Namen, Termine, Zuständigkeiten oder Beschlüsse. Falls Angaben fehlen, verwende null. Die Zusammenfassung ist für alle Mitglieder bestimmt.",
            },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "protocol_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                decisions: { type: "array", items: { type: "string" } },
                action_items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      task: { type: "string" },
                      owner: { type: ["string", "null"] },
                      due_date: { type: ["string", "null"] },
                    },
                    required: ["task", "owner", "due_date"],
                  },
                },
              },
              required: ["summary", "decisions", "action_items"],
            },
          },
        },
      }),
    });
    const ai = await aiResponse.json();
    if (!aiResponse.ok) throw new Error(ai?.error?.message || "Die KI-Auswertung ist fehlgeschlagen.");
    const output = responseText(ai);
    if (!output) throw new Error("Die KI-Auswertung enthielt keinen Text.");
    const result = JSON.parse(output);

    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/protokolle?id=eq.${protocolId}`, {
      method: "PATCH",
      headers: { ...serviceHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "ready",
        summary: result.summary,
        decisions: result.decisions,
        action_items: result.action_items,
        analyzed_at: new Date().toISOString(),
        error_message: null,
      }),
    });
    if (!saveResponse.ok) throw new Error("Die Zusammenfassung konnte nicht gespeichert werden.");
    return json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    try {
      if (uuidPattern.test(protocolId) && supabaseUrl && serviceKey) {
        await fetch(`${supabaseUrl}/rest/v1/protokolle?id=eq.${protocolId}`, {
          method: "PATCH",
          headers: { ...serviceHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ status: "error", error_message: message.slice(0, 900) }),
        });
      }
    } catch (_) {}
    return json({ error: message }, message.includes("OPENAI_API_KEY") ? 503 : 500);
  }
});
