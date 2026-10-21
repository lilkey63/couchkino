# 🍿 Couchkino – so geht's online

Zusammen YouTube schauen (synchron), mit Video-, Sprach- und Textchat, Emoji-Reaktionen und Playlist mit 👍/👎-Abstimmung. Kein Account nötig – Raum erstellen, Link schicken, fertig.

---

## 1. Auf GitHub hochladen (einmalig, ca. 5 Min.)

1. Auf **github.com** ein kostenloses Konto machen (falls noch keins).
2. Oben rechts **+ → New repository** → Name z. B. `couchkino` → **Create repository**.
3. Auf der neuen Seite auf **„uploading an existing file“** klicken.
4. Den **Inhalt** des entpackten `couchkino`-Ordners reinziehen
   (alle Dateien) – **nicht** `node_modules`.
5. Unten **Commit changes** klicken.

## 2. Bei Render online stellen (kostenlos)

1. Auf **render.com** → **Get Started** → mit GitHub anmelden.
2. **+ New → Web Service** → dein `couchkino`-Repo auswählen.
3. Einstellungen:
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. **Deploy Web Service** klicken und ~2 Minuten warten.
5. Oben steht dann deine Adresse, z. B. `https://couchkino-xyz.onrender.com` – **das ist deine Seite!** 🎉

> **Gut zu wissen:** Der Gratis-Server schläft nach 15 Min. ohne Besucher ein. Beim ersten Öffnen danach dauert es ca. 1 Minute, bis die Seite lädt – danach läuft alles normal.

## 3. Benutzen

1. Seite öffnen → Namen eingeben → **Neuen Raum erstellen**.
2. Oben auf **🔗 Link kopieren** → Link an deine Freundin schicken.
3. YouTube-Link unten einfügen → läuft bei euch beiden gleichzeitig.
   - Pause, Spulen, Geschwindigkeit → passiert bei beiden.
   - Weitere Videos landen in der Playlist. Der andere bekommt einen Hinweis und kann direkt 👍 oder 👎 drücken.
   - **Meiste 👍 läuft als Nächstes**, Videos mit mehr 👎 als 👍 werden übersprungen.
   - YouTube-Links aus dem Chat kann man mit **+ zur Playlist** direkt reinwerfen.
4. Unten rechts Mikro 🎙️ und Kamera 🎥 an/aus – oder nur schreiben. Über ⚙️ wählst du die Kamera (z. B. das iPhone).

**Tipp:** Mit Kopfhörern gibt's kein Echo vom Video im Sprachchat.

---

## Falls der Videochat mal nicht verbindet (optional)

In den meisten WLANs klappt es sofort. Bei manchen Handynetzen oder strengen Firmen-/Schul-WLANs braucht WebRTC einen „TURN-Server“ als Umweg:

1. Bei **metered.ca** (Open Relay, kostenlos) ein Konto machen und eine TURN-App anlegen – dort stehen URL, Benutzername und Passwort.
2. Bei Render in deinem Service → **Environment** → diese drei Variablen hinzufügen:
   - `TURN_URLS` = die TURN-Adressen, mit Komma getrennt (z. B. `turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp`)
   - `TURN_USERNAME` = dein Benutzername
   - `TURN_CREDENTIAL` = dein Passwort
3. Speichern – Render startet automatisch neu.

## Lokal auf dem Laptop testen (optional)

Node.js von **nodejs.org** installieren, dann im Ordner:

```
npm install
npm start
```

→ `http://localhost:3000` öffnen. (Kamera übers Handy geht nur in der Online-Version mit https.)

---

## Nächster Schritt: Netflix, Disney+ & Prime

Die Streaming-Dienste lassen sich nicht in fremde Webseiten einbauen. Dafür kommt als Schritt 2 eine kleine Browser-Erweiterung für Chrome/Edge, die Play/Pause/Spulen auf netflix.com usw. zwischen euch synchron hält – und mit diesem Server und Chat zusammenarbeitet.
