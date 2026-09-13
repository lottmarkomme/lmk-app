# Wochenmails – Update 7

Im bestehenden Google-Apps-Script-Projekt den bisherigen Code vollständig durch `scripts/google-apps-script.js` ersetzen. Nicht zusätzlich anhängen.

Alle Script Properties und vorhandenen Versandmarker behalten: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, MAIL_JOB_TOKEN und APP_URL. APP_URL ist die HTTPS-Adresse der App. Keine Schlüssel ins Repository schreiben.

`previewWeeklyEmails()` ausführen und Entwürfe kontrollieren. Es werden zwei Entwürfe je registriertem Mitglied erzeugt, keine E-Mails versendet. Danach `createWeeklyTrigger()` einmal ausführen. Nur die beiden bekannten Wochenmail-Trigger werden ersetzt; Versand montags ab 9 Uhr Europe/Berlin. Bereits in dieser Woche versendete Mail-Arten werden nicht nochmals gesendet.

Jedes Mitglied erhält seine offenen und bezahlten Strafen einschließlich Zahlungsübersicht, auch ohne offene Strafen. Orange kennzeichnet offene Strafen, Grün einen ausgeglichenen Stand. Die zweite Mail zeigt die nächsten drei zukünftigen Treffen und Events gemeinsam nach Datum sortiert. Wenn weniger oder keine Termine vorhanden sind, wird dies entsprechend dargestellt; die Mail entfällt nicht.

Die Supabase-Funktion wurde kompatibel erweitert: `upcoming` enthält die nächsten drei Termine, das bisherige `meetings`-Feld bleibt für alte Scripts erhalten. Bestandsdaten, Token und Konfiguration werden nicht verändert.
