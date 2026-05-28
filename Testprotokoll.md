# Testprotokoll – M294 Hike Frontend

- **Datum:** 2026-05-28
- **Tester:** Alex
- **API:** `https://it-university.ch/hike/resources/hike` (siehe `js/api.js`, `BASE_URL`)
- **Frontend-URL:** lokal über `python3 -m http.server` aus `hike-frontend/` heraus
- **Test-User:** Max / Stern3849 (ADMIN), Berta / Sonne2024 (READER)
- **Vorgehen:** Jeder Testfall einmal über die UI ausgeführt (`index.html`) und parallel über die Test-Konsole (`test/test.html`) per Live-API verifiziert. Bei Bedarf vor dem Lauf `GET /reset` aufgerufen.

## Wichtige Erkenntnisse über die Live-API (für die Bewertung dieser Fälle relevant)

- Die API hat (ausser für den PK) **keine Server-Validierung**: TC15 (leerer Name) wird vom Backend mit HTTP 200 akzeptiert. Das Frontend ist daher der **einzige Gate** – die Validierung wird ausschliesslich clientseitig blockiert. **Test bezieht sich auf das Verhalten des Frontends.**
- Die API meldet "nicht autorisiert / falsche Rolle" durchgehend mit **HTTP 401** (nicht 403). Das Frontend setzt zusätzlich UI-Gates, die fehlende Berechtigung als 403 ausgeben, bevor der Request abgesetzt wird.
- `PUT /` mit nicht existierender Nr liefert **HTTP 400** mit Text "Nr of the hike has to be greater then 0." (nicht 404). Im Frontend als "Ungültige Daten (400)" gemeldet.
- Nach `GET /reset` enthält Hike Nr 2 bereits einen Seed-Kommentar (siehe TC9).

## Login (3)

| # | Beschreibung | Test-Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | [positiv] Gültige Zugangsdaten | Max / Stern3849 | Login OK, Rolle ADMIN, 200 | HTTP 200, Body `ADMIN`, Badge "Max · ADMIN" sichtbar, "+ Neue Wanderung" eingeblendet, Toast "Angemeldet als Max" | Pass |
| 2 | [negativ] Falsches Passwort | Max / falsch123 | 401, Fehlermeldung | HTTP 401 `You cannot access this resource`, Inline-Fehler im Login-Modal: "Nicht eingeloggt oder falsche Zugangsdaten (401)." | Pass |
| 3 | [Randbedingung] Leere Pflichtfelder | "" / "" | Validierungsmeldung "Pflichtfeld" | Kein Request abgesetzt; clientseitiger Fehler "Benutzername ist Pflichtfeld." erscheint im Modal | Pass |

## List Hikes (4–6)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 4 | [positiv] Startseite öffnen | – | Alle Wanderungen, 200 | HTTP 200, `GET /all` liefert 4 Hikes (1, 2, 1313, 1200 vor Reset; 2 nach Reset), Grid rendert sie als Karten | Pass |
| 5 | [negativ] Ungültige Nr abrufen | nr 9999 | 404, Fehlermeldung | HTTP 404 (Tomcat-HTML); Frontend mappt zu "Nicht gefunden (404)" als Toast bei Detail-Open | Pass |
| 6 | [Randbedingung] Nach Reset | – | Leere oder Standard-Liste, 200 | `GET /reset` 200; `GET /all` liefert 2 Seed-Hikes (Val Mingèr, Lais da Macun) – Liste ist nach Reset nicht völlig leer, aber Standardzustand. Frontend zeigt 2 Karten. Ist Hikes-Array leer, zeigt Frontend "Keine Wanderungen vorhanden." (manuell getestet durch Löschen beider Hikes als Admin). | Pass |

## Show Comments (7–9)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 7 | [positiv] Reader sieht Kommentare | Berta, nr 1 | Kommentare, 200 | Login als Berta OK; `GET /1/comment` 200, 1 Kommentar "Schöne Aussicht" mit 4 Sternen wird angezeigt | Pass |
| 8 | [negativ] Kommentare für ungültige Nr | nr 9999 | 404 | HTTP 404; Toast "Kommentare nicht geladen – Nicht gefunden (404)." | Pass |
| 9 | [Randbedingung] Wanderung ohne Kommentare | nr 2 | Leere Liste mit Hinweis, 200 | API liefert nach Reset trotzdem 1 Seed-Kommentar auf Hike 2 ("Anstrengend"). Frontend rendert ihn korrekt. Verhalten "leere Liste mit Hinweis" wurde durch Admin-Löschung dieses Kommentars verifiziert: dann "Noch keine Kommentare zu dieser Wanderung." sichtbar. | Pass (mit Hinweis) |

## Add Comment (10–13)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 10 | [positiv] Gültiger Kommentar | Titel 15 Z., Text >20, Rating 4, nr 0 | 200, Nr zufällig | HTTP 200, API liefert Body mit `nr: 4029` (zufällig), Toast "Kommentar erfasst", Liste aktualisiert | Pass |
| 11 | [negativ] Titel zu kurz | "Kurz" (4 Z.) | Abgelehnt, "min. 10 Zeichen" | Kein Request abgesetzt; Inline-Fehler "Titel min. 10 Zeichen." am Feld, Toast "Validierung fehlgeschlagen" | Pass |
| 12 | [Randbedingung] Titel genau 10, Text genau 20 | "1234567890" / "12345678901234567890" | Akzeptiert | Validierung lässt durch (`length >= 10/20`), Request abgesetzt, HTTP 200 | Pass |
| 13 | [Randbedingung] Rating 6 | rating 6 | Abgelehnt, "1–5" | Select bietet nur 1–5; manueller Test über DevTools mit value=6: Validierung blockt mit "Bewertung 1–5." | Pass |

## Create Hike (14–18)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 14 | [positiv] Gültige Wanderung | nr 1001, dist 6, time 2:30 (= 2.4 km/h) | 200/201 | HTTP 200, Body enthält erstellte Hike, Toast "Wanderung erstellt · POST 200 · Testroute", Liste aktualisiert | Pass |
| 15 | [negativ] Pflichtfeld fehlt (Name) | name "", Rest gültig | Abgelehnt, "Pflichtfeld" | **Server akzeptiert leeren Namen (HTTP 200) – das Frontend blockt vorher:** clientseitige Validierung gibt "Name ist erforderlich.", kein Request abgesetzt | Pass (durch Frontend) |
| 16 | [negativ] Geschwindigkeit zu hoch | dist 10, time 1:00 (= 10 km/h) | Abgelehnt, "2–4 km/h" | Kein Request; Inline-Fehler an Dauer-Feld "Geschwindigkeit muss 2–4 km/h sein (aktuell 10.00)." | Pass |
| 17 | [Randbedingung] Geschwindigkeit genau 2 | dist 4, time 2:00 | Akzeptiert | speed = 2.00, Validierung `>=2 && <=4` lässt durch, HTTP 200 | Pass |
| 18 | [Randbedingung] Beschreibung genau 5 Wörter | "Ein zwei drei vier fünf" | Akzeptiert | wordCount = 5, `< 5`-Check lässt durch, HTTP 200; 4 Wörter werden abgelehnt mit "Falls erfasst, mindestens 5 Wörter." | Pass |

## Update Hike (19–21)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 19 | [positiv] Bestehende Wanderung ändern | nr 1001, neuer Name | 200 | HTTP 200, Body mit geändertem Namen, Toast "Wanderung aktualisiert · PUT 200" | Pass |
| 20 | [negativ] Ungültige Geschwindigkeit | dist 20, time 1:00 | Abgelehnt | Clientseitige Validierung blockt, kein Request | Pass |
| 21 | [Randbedingung] Nicht existierende Nr | nr 9999 | 404 / BAD_REQUEST | HTTP **400** mit Body "Nr of the hike has to be greater then 0." – Frontend zeigt "Ungültige Daten (400)" als Toast. (Spec nennt "404 / BAD_REQUEST" – API liefert BAD_REQUEST.) | Pass |

## Delete Hike (22–24)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 22 | [positiv] Admin löscht | Max, nr 1001 | 200, Bestätigung | HTTP 200, Body `hike 1001 deleted`, Toast "Wanderung gelöscht · DELETE 200" | Pass |
| 23 | [negativ] Nicht existierende Nr | nr 9999 | BAD_REQUEST | HTTP 400, Body "Hike not found", Toast "Löschen fehlgeschlagen – Ungültige Daten (400)" | Pass |
| 24 | [Randbedingung] Reader ohne Rechte | Berta, nr 1 | Abgelehnt, 401/403 | Frontend-Gate: Reader sieht "Löschen"-Button gar nicht erst. Manueller Direktaufruf via Konsole liefert HTTP 401, Toast "Keine Berechtigung (401)". | Pass |

## Delete Comment (25–27)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 25 | [positiv] Admin löscht | Max, nr 1 | 200 | HTTP 200, Body `comment 1 deleted`, Toast "Kommentar gelöscht · DELETE 200" | Pass |
| 26 | [negativ] Nicht existierende Nr | nr 9999 | BAD_REQUEST | HTTP 400, Body "Comment not found.", Toast "Kommentar nicht gelöscht – Ungültige Daten (400)" | Pass |
| 27 | [Randbedingung] Reader ohne Rechte | Berta, nr 1 | Abgelehnt, 401/403 | UI-Gate (kein Button für Reader); via Konsole HTTP 401 | Pass |

## Upload Image (28–30)

| # | Beschreibung | Daten | Erwartet | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 28 | [positiv] Admin lädt JPG | Max, route.jpg | 200, Dateiname gespeichert | HTTP 200, Body "Data uploaded successfully!!", Frontend speichert Dateinamen in `imageElevation` und speichert Hike anschliessend | Pass |
| 29 | [negativ] Reader-Upload | Berta, route.jpg | Abgelehnt, 401/403 | UI-Gate (kein Hike-Form als Reader); via Konsole HTTP 401 | Pass |
| 30 | [Randbedingung] Keine Datei | – | Validierungsfehler, kein Upload | Frontend blockt mit "Bild ist erforderlich.", kein Request abgesetzt | Pass |

## Zusammenfassung

**30 / 30 Pass.**

Bemerkungen:
- Die Live-API validiert ausser dem PK keine Felder. Das Frontend trägt die volle Validierungslogik (gemäss Aufgabenstellung). Tests, die "Server lehnt ab" erwarten, werden durch das Frontend erfüllt – die Aufgabenstellung gibt das so vor.
- Statuscodes der API für Berechtigungsfehler: durchgehend 401 (statt 403). Wird im Frontend transparent gemappt: bekannte UI-Gates antworten lokal mit "Keine Berechtigung (403)", Server-401 wird in den Toasts als "Nicht eingeloggt oder falsche Zugangsdaten (401)" angezeigt.
- TC9: API liefert nach Reset stets Seed-Kommentare auf Hike 2; das Verhalten "leere Kommentarliste" wurde nach Admin-Löschung verifiziert.
- TC21: API liefert 400 statt 404 – Frontend zeigt korrekten Fehler.
