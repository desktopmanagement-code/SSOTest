# Profilgenerator (Node.js)

Node.js-Anwendung, die ein Profil aus JSON-Daten in ein HTML-Dokument rendert und optional als PDF exportiert.

## Features

- HTML-Template mit Platzhaltern (`{{...}}`) über eine eingebaute {{ }}-Template-Engine
- Optionale Abschnitte werden automatisch ausgeblendet (z. B. `Zertifizierungen`)
- 0..n Einträge pro Abschnitt (z. B. Projekterfahrungen)
- Firmen-Branding über JSON-Konfiguration (Farbe, Logo, CSS)
- Ausgabe als HTML und optional PDF (über lokales Chromium/Chrome)

## Projektstruktur

```text
src/
├─ assets/logos/            # Firmenlogos
├─ config/                  # Firmenkonfigurationen
├─ data/                    # Beispielprofile
├─ styles/                  # Basis- und Firmen-CSS
├─ templates/
│  └─ profile.template.html # Bearbeitbares HTML-Template
└─ index.js                 # Generator-Logik
output/                     # Generierte Dateien
```

## Installation

```bash
npm install
```

## Nutzung

### 1) Standard-HTML erzeugen

```bash
npm run generate
```

- Nutzt standardmäßig:
  - Profil: `src/data/profile-with-certs.json`
  - Firma: `company-a`
- Schreibt:
  - `output/profile.html`
  - `output/profile.css`

### 2) Profil ohne Zertifizierungen erzeugen

```bash
npm run generate:no-certs
```

Hier fehlt im JSON der Bereich `certifications`; der Abschnitt `Zertifizierungen` erscheint daher nicht im HTML.

### 3) PDF exportieren

Empfohlen über Script:

```bash
npm run generate:pdf
```

Alternativ über das Standard-Script:

```bash
npm run generate -- --pdf
```

Hinweis: Je nach npm-Version wird `npm run generate --pdf` intern als npm-Flag interpretiert.
Der Generator unterstützt dafür einen Fallback und behandelt diesen Aufruf ebenfalls als PDF-Export.
Am zuverlässigsten bleibt aber `npm run generate -- --pdf` oder `npm run generate:pdf`.
Zusätzlich wird `output/profile.pdf` erzeugt.

Falls kein Browser automatisch gefunden wird:

```bash
node src/index.js --pdf --browser-path "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
```

Alternativ per Umgebungsvariable:

```bash
set PROFILE_PDF_BROWSER=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe
npm run generate -- --pdf
```

Hinweis zu Chrome-Fenstern:
Der PDF-Export startet Chrome/Edge mit einem temporären Profil im Headless-Modus (`--headless=new`).
Damit sollte kein sichtbares Startseiten-Fenster mehr aufgehen.

## CLI-Optionen

```text
--company <name>       Firmenkonfig aus src/config/<name>.json
--profile <path>       Profil-JSON
--template <path>      HTML-Template (mit {{ }} Platzhaltern)
--output-html <path>   Zielpfad für HTML
--output-pdf <path>    Zielpfad für PDF
--browser-path <path>  Expliziter Pfad zu Chrome/Chromium/Edge
--pdf                  PDF-Erzeugung aktivieren
```

## Anpassung pro Firma

`src/config/company-a.json`:

```json
{
  "companyName": "Firma A GmbH",
  "primaryColor": "#0055A4",
  "logoPath": "src/assets/logos/company-a.svg",
  "cssFile": "src/styles/company-a.css"
}
```

Für eine neue Firma einfach neue Config, neues Logo und optional neues CSS anlegen.

## Template-Prinzip

Das Template in `src/templates/profile.template.html` kann von Fachanwendern angepasst werden.

Beispiele:

- Einzelwert: `{{personal.name}}`
- Liste: `{{#each qualifications}}...{{/each}}`
- Optionaler Abschnitt: `{{#if (hasItems certifications)}}...{{/if}}`

Damit verschwinden leere Abschnitte vollständig.

## Profil-Editor (Formular statt JSON von Hand)

Wenn du die JSON nicht manuell schreiben möchtest, kannst du den integrierten Editor nutzen:

```bash
npm run ui
```

Dann im Browser öffnen: `http://localhost:5050`

Dort kannst du alle Profilfelder, Projekterfahrungen und Listen ausfüllen und mit **START** den Generator auslösen.
Die UI erzeugt intern eine JSON (`output/ui-profile.json`) und startet denselben Prozess wie die CLI.


### Neue Firmen-Config hinzufügen (z. B. `AQS.json`)

1. Datei anlegen: `src/config/AQS.json`
2. Inhalt wie bei `company-a.json` (inkl. `logoPath`, `cssFile`)
3. UI neu starten: `npm run ui`

Wichtig:
- Im UI musst du **nichts mehr manuell im HTML ändern**. Die Firmenliste wird automatisch aus `src/config/*.json` geladen.
- Der `company`-Wert muss dem Dateinamen ohne `.json` entsprechen (z. B. `AQS`).
- Falls ein Name nicht passt, zeigt die API jetzt die verfügbaren Config-Namen im Fehlertext.

cd C:\PFAD\ZU\SSOTest
git switch codex/create-node.js-app-for-dynamic-form-to-pdf
git pull


git stash -u
git pull
git stash pop

npm install
npm run generate:no-certs

von lokal nach git

git status
git add -A
git commit -m "Update package.json / local adjustments"
