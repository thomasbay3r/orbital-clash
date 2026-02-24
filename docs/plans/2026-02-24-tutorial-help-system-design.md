# Tutorial/Hilfe-System Design

**Datum:** 2026-02-24
**Status:** Genehmigt

## Ziel

Ein abschaltbares Tutorial-System das Spielern Features erklärt wenn sie diese zum ersten Mal sehen, plus ein Hilfe-Screen mit Kompaktübersicht.

## Architektur

Hybrid-Ansatz: Fullscreen-Overlays für komplexe Screens + dezente Banner für einfache Screens.

### 1. Hilfe-Screen (H-Taste vom Menü)

Eigener Screen erreichbar vom Hauptmenü. Kompakte scrollbare Übersicht:
- **Steuerung**: WASD, Maus, Shift=Boost, Rechtsklick=Spezial, V=Emotes, T=Chat
- **Schiffe**: 4 Klassen mit Kurzbeschreibung (HP/Speed/Waffe/Spezial)
- **Modi**: 8 Spielmodi mit 1-Satz-Beschreibung
- **Mutatoren**: Was jeder Mutator bewirkt
- **Social**: Freunde, Party, Chat erklärt
- **"Tutorial zurücksetzen"**-Button unten

### 2. First-Encounter Overlays (blockierend)

Halbtransparentes Overlay mit Erklärungstext, nur beim allerersten Besuch:

| Screen | Overlay-Text |
|--------|-------------|
| Schiff/Map/Modus-Wahl (game-config) | "Wähle dein Schiff (1-4), Karte (Q/E), Modus (Z/C)" |
| Mod-Select | "Wähle Waffen-, Schiff- und Passiv-Mod für deinen Loadout" |
| Einstellungen (settings) | "Stelle Schwierigkeit (Q/E), Bot-Anzahl (W/S) und Mutatoren ein" |
| Erstes Gameplay (playing) | "WASD=Bewegen, Maus=Zielen, Klick=Schießen. Vorsicht vor Gravitationsfeldern!" |

Jedes Overlay hat: **[Enter] OK** + **[T] Tutorial aus**

### 3. First-Encounter Banner (nicht-blockierend)

Dezentes Banner oben (~40px hoch, halbtransparent), nur beim ersten Besuch:

| Screen | Banner-Text |
|--------|------------|
| Profil | "Hier siehst du deinen Fortschritt. C=Challenges, K=Cosmetics" |
| Herausforderungen | "Schließe tägliche und wöchentliche Challenges für XP ab" |
| Cosmetics | "Schalte Skins, Trails und Effekte durch Leveln frei. 1-4=Kategorie" |
| Freunde | "Suche Spieler, füge Freunde hinzu, sieh wer online ist" |
| Party-Lobby | "Warte auf Mitspieler. Leader wählt Einstellungen" |
| Emote-Wheel | "Wähle ein Emote (1-8). V zum Öffnen/Schließen" |
| Scoreboard | "Enter=Rematch, Escape=Menü" |

Jedes Banner hat: **[Enter] OK** + **[T] Tutorial aus**

### 4. Speicherung (Hybrid: localStorage + D1)

**Für eingeloggte Nutzer:**
- DB: `accounts`-Tabelle bekommt 2 neue Spalten:
  - `tutorial_enabled` (INTEGER, default 1)
  - `tutorial_seen` (TEXT, JSON-Array von Screen-IDs, default "[]")
- Beim Login: Tutorial-State vom Server laden, mit localStorage mergen
- Bei Fortschritt: localStorage sofort + API-Call `PATCH /api/tutorial` async

**Für Gäste:**
- Nur localStorage (keine geräteübergreifende Persistenz)

**Sync-Logik:**
- Login → Server-State holen → Union mit localStorage bilden → beide Seiten updaten
- Jedes Tutorial-Event → localStorage first, dann Server async
- Funktioniert offline (localStorage first)

**localStorage Keys:**
- `tutorialEnabled`: boolean (default: true)
- `tutorialSeen`: JSON-Array von Screen-IDs

### 5. Settings-Integration

Im Einstellungs-Screen: Toggle **"Tutorial: AN/AUS"** (Taste [H])

### 6. i18n

Alle Tutorial-Texte in DE und EN (bestehende `translations`-Objekte in game.ts erweitern).

## Screen-IDs

```
game-config, mod-select, settings, first-gameplay,
profile, challenges, cosmetics, friends,
party-lobby, emote-wheel, scoreboard
```

## Technische Entscheidungen

- Tutorial-State als Teil des Game-Objekts (nicht separater Singleton)
- Overlay/Banner-Rendering in bestehende draw-Methoden integriert
- Keine neuen Dateien — alles in game.ts + constants.ts + index.ts (Server)
- Tutorial-Hints als Config-Objekt in constants.ts für einfache Wartung
