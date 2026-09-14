# Update 9 einrichten

Die Datenbankmigration und die Edge Function `analyze-protocol` werden über Supabase ausgerollt. Bestehende Daten und Einstellungen bleiben erhalten.

## 1. Cloudflare Workers AI in Supabase hinterlegen

Im Cloudflare Dashboard einen API-Token mit der Berechtigung **Workers AI – Read** erstellen. Danach im Supabase Dashboard unter **Edge Functions → Secrets** anlegen:

- `CLOUDFLARE_ACCOUNT_ID`: die Cloudflare Account-ID
- `CLOUDFLARE_API_TOKEN`: der Workers-AI-API-Token
- optional `CLOUDFLARE_AI_MODEL`: gewünschtes JSON-Mode-fähiges Modell; ohne Angabe nutzt die Funktion `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

Die Funktion sendet die private Protokolldatei zuerst an Cloudflares Markdown Conversion und danach den extrahierten Text an Workers AI. Schlüssel niemals in GitHub, den Browser-Code oder Google Apps Script kopieren. Das nicht mehr benötigte Supabase-Secret `OPENAI_API_KEY` kann nach einem erfolgreichen Test entfernt werden.

## 2. Google Apps Script aktualisieren

Den gesamten Inhalt des bestehenden Apps-Script-Projekts durch `scripts/google-apps-script.js` ersetzen und speichern. Die vorhandenen Script Properties bleiben unverändert:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `MAIL_JOB_TOKEN`
- `APP_URL`

Danach einmal `createWeeklyTrigger()` ausführen und die Berechtigung bestätigen. Die Funktion erstellt die beiden wöchentlichen Montagstrigger neu und ergänzt den Protokollversand im 15-Minuten-Takt.

`previewProtocolEmails()` legt Testentwürfe an, sobald mindestens ein fertig ausgewertetes, noch nicht versendetes Protokoll vorhanden ist. Beim echten Versand wird der Versand pro Mitglied gespeichert, sodass ein späterer Triggerlauf keine doppelten E-Mails erzeugt.

Die Protokoll-Zusammenfassung geht an **alle registrierten Mitglieder mit E-Mail-Adresse**, unabhängig von ihrer Teilnahmeantwort.
