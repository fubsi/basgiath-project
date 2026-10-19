# 🐉 Basgiath War College – Minecraft ATM 11 Blueprint & 3D Visualizer

Interaktives Planungs- und Visualisierungs-System (2D Blueprint, 3D Voxel Engine & ATM 11 Materialliste) für den Nachbau des **Basgiath War College** aus *Fourth Wing* in **Minecraft – All the Mods 11**.

## 📂 Projektstruktur

- [`docs/bauplan-basgiath.md`](./docs/bauplan-basgiath.md) – Inhaltlicher Mega-Build-Masterplan, Y-Level-Konzept (`Y = -50` bis `Y = 319`), Zonen-Analyse & ATM 11 Blockpalette (inkl. der 6 Drachenstatuen in der *Dragon Rotunda*).
- [`docs/website-architektur.md`](./docs/website-architektur.md) – Technische Dokumentation der `layer.Y.json`-Spezifikation und der 2D/3D-Web-Applikation.
- [`tools/generate-layers.mjs`](./tools/generate-layers.mjs) – Generator für `palette.json`, `manifest.json` und die `layer.{Y}.json`-Dateien.
- [`frontend/`](./frontend/) – Vue 3 + Vite + Three.js Web-App nach dem Schema von `fubsi-site`.

## 🛠 Lokale Entwicklung

```bash
# 1. Layer-Dateien neu generieren (optional)
node tools/generate-layers.mjs

# 2. Frontend installieren & starten
cd frontend
npm install
npm run dev
```

## 📦 Automatisches Deployment via Portainer

Das Repository ist analog zu `fubsi-site` für das direkte Git-Stack-Deployment in **Portainer** vorbereitet:

1. In Portainer zu **Stacks** → **Add stack** → **Repository** wechseln.
2. Repository-URL eintragen.
3. Compose path: `docker-compose.yml` (oder `frontend/docker-compose.yml`).
4. **Deploy the stack** klicken – die App wird im Multi-Stage-Container gebaut und über Nginx auf Port `4001` ausgeliefert.
