import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createLayerApiMiddleware } from './server/layerApiMiddleware.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, 'public/data');

function basgiathLayerSyncPlugin() {
  return {
    name: 'basgiath-layer-sync-api',
    configureServer(server) {
      server.middlewares.use(createLayerApiMiddleware(dataDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createLayerApiMiddleware(dataDir));
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), basgiathLayerSyncPlugin()]
});
