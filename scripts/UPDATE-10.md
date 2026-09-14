# Update 10: vollständige Protokoll-Zusammenfassungen

Die KI erfasst jetzt jeden Tagesordnungspunkt und jedes weitere eigenständige Gesprächsthema. Pro Punkt werden Details, Ergebnis und Status ausgegeben. Beschlüsse und Aufgaben bleiben zusätzlich als eigene Übersichten erhalten.

## Google Apps Script aktualisieren

Den Inhalt des Apps-Script-Projekts erneut vollständig durch `scripts/google-apps-script.js` ersetzen und speichern. Vorhandene Script Properties und Trigger bleiben erhalten; `createWeeklyTrigger()` muss für dieses Update nicht erneut ausgeführt werden.

Neue Protokoll-E-Mails enthalten anschließend den Abschnitt **Alle besprochenen Punkte**. Bereits verschickte E-Mails werden nicht automatisch erneut versendet.

Spieß, Vorstand und Admin können ein vorhandenes Protokoll in der App über **Neu auswerten** mit dem verbesserten Schema erneut analysieren. Dadurch wird ein bereits erfolgter E-Mail-Versand nicht wiederholt.
