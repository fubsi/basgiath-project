# --- Build & Runtime Stage ---
FROM node:20-alpine

WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package*.json ./
RUN npm install

# Quellcode, Server-Middleware und Layer-JSONs kopieren & Frontend bauen
COPY . .
RUN npm run build

# Entrypoint-Skript ausführbar machen (befüllt leere gemountete Docker-Volumes automatisch)
RUN chmod +x entrypoint.sh

# Port 80 im Container freigeben (wird per docker-compose auf 4001 gemappt)
ENV PORT=80
EXPOSE 80

ENTRYPOINT ["/app/entrypoint.sh"]

# Node Live-Server starten (liefert dist/, /data/layers/*.json sowie /api/layers/mutate & SSE-Sync aus)
CMD ["node", "server.mjs"]
