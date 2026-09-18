# Empfehlungsprogramm Putzfrauenservice

Kundenseite:   /            (index.html, für bestehende Kunden: Link erstellen und teilen)
Empfehlungsseite: /willkommen (willkommen/index.html, Landeseite für die empfohlene Person)
Adminbereich:  /admin       (admin/index.html, nicht indexiert)
Backend:       api/empfehlung.js  → speichert Empfehlung in Firestore + Mail via Resend
               api/admin.js       → Lesen/Bearbeiten, nur mit Zugangscode (serverseitig geprüft)

## Schritt 1: Code zu GitHub

Variante A, ohne Kommandozeile: auf github.com ein neues privates Repository anlegen
(z.B. empfehlung-pfs), dort "Add file" -> "Upload files", den entpackten Ordnerinhalt
hineinziehen, "Commit changes".

Variante B, mit Kommandozeile: im entpackten Ordner `bash push-zu-github.sh empfehlung-pfs`
ausführen. Mit installierter GitHub CLI (gh) wird das Repository automatisch erstellt und
hochgeladen, sonst zeigt das Skript die zwei nötigen git-Befehle an.

## Schritt 2: Deployment auf Vercel
1. Auf vercel.com: Add New Project -> das GitHub-Repository importieren (Framework: Other, kein Build-Befehl).
2. Settings → Environment Variables:
   FIREBASE_SERVICE_ACCOUNT  JSON des Service-Accounts aus Firebase-Projekt aktionuhpfs
                             (Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren)
   ADMIN_CODE                Zugangscode für den Adminbereich (eigener, starker Code)
   RESEND_API_KEY            wie beim Mitarbeitervorteil
   MAIL_FROM                 verifizierter Absender, z.B. Clean Service <empfehlung@clean-service.ch>
   MAIL_TO                   optional, Standard putzfrauenservice@clean-service.ch
   ADMIN_URL                 optional, z.B. https://<projekt>.vercel.app/admin (Link in der Benachrichtigung)
   FIRESTORE_COLLECTION      optional, Standard empfehlungen_pfs
   FIRESTORE_CODES           optional, Standard empfehler_codes_pfs (persönliche Empfehlungscodes)
3. Neu deployen, eine Testempfehlung senden und im Adminbereich prüfen.
4. Das Logo ist bereits in beiden Seiten eingebettet (assets/logo-clean-service.png liegt zusätzlich bei).
5. Vercel-Adresse im Signatur-Generator bei der Aktion "Weiterempfehlung Putzfrauenservice" eintragen.

Die Firestore-Daten sind für Browser nicht direkt lesbar: Zugriff läuft ausschliesslich über die
Vercel-Funktionen mit Service-Account. Die Firestore-Regeln für die Sammlung können daher komplett
gesperrt bleiben (allow read, write: if false).

Empfehlungscodes: Jede Kundin und jeder Kunde kann auf der Seite einen persönlichen Code
erstellen (Name + Telefonnummer). Der geteilte Link lautet dann ?code=XXXXXX. Meldet sich
jemand darüber, erscheint die Empfehlung im Adminbereich mit diesem Code und wird unter
"Botschafter" samt Linkaufrufen ausgewertet. Dieselbe Telefonnummer erhält immer denselben Code.
Der ältere Link ?von=Vorname%20Nachname funktioniert weiterhin.
