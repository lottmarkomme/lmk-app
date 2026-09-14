# Update 9 einrichten

Die Datenbankmigration und die Edge Function `analyze-protocol` werden über Supabase ausgerollt. Bestehende Daten und Einstellungen bleiben erhalten.

## 1. OpenAI-Schlüssel in Supabase hinterlegen

Im Supabase Dashboard unter **Edge Functions → Secrets** anlegen:

- `OPENAI_API_KEY`: ein aktiver OpenAI API-Schlüssel
- optional `OPENAI_MODEL`: gewünschtes Modell; ohne Angabe nutzt die Funktion `gpt-6-astra`

Den Schlüssel niemals in GitHub, den Browser-Code oder Google Apps Script kopieren.

## 2. Google Apps Script aktualisieren

Den gesamten Inhalt des bestehenden Apps-Script-Projekts durch `scripts/google-apps-script.js` ersetzen und speichern. Die vorhandenen Script Properties bleiben unverändert:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `MAIL_JOB_TOKEN`
- `APP_URL`

Danach einmal `createWeeklyTrigger()` ausführen und die Berechtigung bestätigen. Die Funktion erstellt die beiden wöchentlichen Montagstrigger neu und ergänzt den Protokollversand im 15-Minuten-Takt.

`previewProtocolEmails()` legt Testentwürfe an, sobald mindestens ein fertig ausgewertetes, noch nicht versendetes Protokoll vorhanden ist. Beim echten Versand wird der Versand pro Mitglied gespeichert, sodass ein späterer Triggerlauf keine doppelten E-Mails erzeugt.

Die Protokoll-Zusammenfassung geht an **alle registrierten Mitglieder mit E-Mail-Adresse**, unabhängig von ihrer Teilnahmeantwort.
