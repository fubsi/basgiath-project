# --- Build & Runtime Stage ---
FROM node:20-alpine

WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package*.json ./
RUN npm install

# Quellcode, Server-Middleware und Layer-JSONs kopieren & Frontend bauen
COPY . .
RUN npm run build

# Port 80 im Container freigeben (wird per docker-compose auf 4001 gemappt)
ENV PORT=80
EXPOSE 80

# Node Live-Server starten (liefert dist/, /data/layers/*.json sowie /api/layers/mutate & SSE-Sync aus)
CMD ["node", "server.mjs"]
