# --- Build Stage ---
FROM node:20-alpine AS build

# Arbeitsverzeichnis im Container festlegen
WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package*.json ./
RUN npm install

# Restlichen Quellcode kopieren und die App bauen
COPY . .
RUN npm run build

# --- Production Stage ---
FROM nginx:alpine

# Eigene Nginx-Konfiguration für Vue-Router (SPA) & JSON-Gzip-Kompression
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Das fertig gebaute Verzeichnis aus der Build-Stage in den Nginx-Webordner kopieren
COPY --from=build /app/dist /usr/share/nginx/html

# Port 80 im Container freigeben (wird per docker-compose gemappt)
EXPOSE 80

# Nginx starten
CMD ["nginx", "-g", "daemon off;"]
