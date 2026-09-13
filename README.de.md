[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md)

# Super Boring Battleship Game

> Ein leichtgewichtiges 3D-Seekampfspiel des Zweiten Weltkriegs für Einzelspieler und zwei Spieler im LAN von **koko**, mit bewusst bedächtiger Schiffsführung, gut lesbarer Ballistik und modularen Schäden.

[Neueste Windows-Verzeichnisversion (ZIP) herunterladen](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest)

## Über das Spiel

Version 0.7.7 bietet Einzelgefechte gegen die KI, gemeinsame KI-Gefechte für zwei Spieler und zeitlich unbegrenzte Seeerprobungen; ein normales Gefecht ist auf 15–20 Minuten ausgelegt. Kommandiere Zerstörer, leichte Kreuzer und Schlachtschiffe, organisiere die Schadensabwehr und setze Geschütze, Torpedos, Wasserbomben sowie Trägerflugzeuge ein. Das Projekt ist für durchschnittliche PCs ausgelegt und nutzt TypeScript, Babylon.js, Vite und Electron.

Das Spiel ist noch ein Prototyp in Entwicklung. Grafik, Balance, Schiffsmodelle und Fortschrittssystem werden weiter verbessert.

## Aktuelle Funktionen

- Eigene, historisch orientierte Low-Poly-Modelle für 15 Schiffsklassen, unterschiedliche Waffen und interne Anlagen sowie sechs Flugzeugtypen des Zweiten Weltkriegs. Die freie Ausrüstung bleibt erhalten; es sind keine maßgetreuen Werftplan-Rekonstruktionen. [Modellhinweise](docs/historical-models-ships.md).

- LAN-Koop für zwei Spieler mit Raumsuche, manueller Eingabe der IPv4-Adresse als Ausweichverbindung, Auswahl gespeicherter Ausrüstungen und autoritativer Host-Simulation gegen die KI.
- Historisch angelehnte Maschinenbefehle, langsame Ruderverstellung, Fahrtverlust in Kurven und Modulschäden.
- Sichtbare Geschossbahnen, Streuung, Nachladen, unabhängige Turmausrichtung, HE/AP-Durchschlag und Abteilungsschäden.
- Torpedosektoren, schmale/breite Fächer, Scharfschaltentfernung, Reichweite, Vorhalt und beschädigbare Werfer.
- Nebel, Hydroakustik, Brände, Wassereinbruch, besatzungsabhängige Reparatur, wiederherstellbare Trefferpunkte und zonenabhängige Kollisionen.
- Nicht allwissende optische KI-Aufklärung mit Kontaktverlust und verblassenden Markierungen der letzten bekannten Position.
- KI-gesteuerte Flugzeuge; der Spieler befiehlt Auswahlrahmen, Bewegung, Schutz, Patrouille, Abfangen und Schiffsangriffe.
- Arsenal ohne Echtgeld, Inventar, Werft, lokales Kapitänsprofil und Erforschung historischer Ausrüstung.
- Oberfläche in 简体中文, 繁體中文, English, 日本語, Español, Deutsch und Русский.

## Wichtigste Steuerung

| Taste | Aktion |
|---|---|
| `W` / `S` | Maschinenbefehl erhöhen oder senken |
| `A` / `D` | Ruder Backbord / Steuerbord |
| Maus / Rad | Kamera bewegen / Zielentfernung ändern |
| `R` / `Space` | Zielfernrohr umschalten / ausgewählte Waffe feuern |
| `1` / `2` / `3` | Hauptbatterie / Torpedos / Marineflieger |
| `Q` | Munition oder Torpedofächer wechseln |
| `E` / `F` / `G` | Nebel / Hydroakustik / Wasserbomben |
| `H` | Halten, um den Rumpf zu reparieren |
| `M` / `F3` / `Esc` | Taktische Karte / Debug / verlassen oder pausieren |

## Windows-Schnellstart

Lade das neueste Windows-x64-ZIP unter [Releases](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest) herunter, entpacke es vollständig in einen Ordner und starte `Super Boring Battleship Game.exe`. Verschiebe die EXE nicht aus dem Ordner mit `resources` und den DLL-Dateien. Keine Installation ist nötig. SmartScreen kann vor dem unsignierten Indie-Testbuild warnen.

## Entwicklung

Benötigt werden Node.js 24.x und npm.

```bash
npm install
npm test
npm run build
npm run desktop:dist
npm run desktop:zip
```

`desktop:dist` erzeugt die Verzeichnisversion unter `release/win-unpacked`; `desktop:zip` erzeugt das Veröffentlichungs-ZIP mit dem vollständigen Verzeichnis.

## Urheberrecht

Originalcode und -grafik © 2026 **Arsenic-er (koko)**. Alle Rechte vorbehalten; derzeit wird keine Open-Source-Lizenz gewährt. Drittsoftware und Fusion Pixel Font behalten ihre jeweiligen Lizenzen. Siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
