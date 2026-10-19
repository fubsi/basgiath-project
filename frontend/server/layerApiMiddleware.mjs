import fs from 'fs';
import path from 'path';

/**
 * Encodes a Map<"x,z", blockId> into compact RLE runs (len >= 3) and single blocks (len < 3),
 * and computes material counts.
 */
function encodeCoordMap(coordMap) {
  const rows = new Map();
  const materials = {};

  for (const [key, blockId] of coordMap.entries()) {
    const commaIdx = key.indexOf(',');
    const x = Number(key.slice(0, commaIdx));
    const z = Number(key.slice(commaIdx + 1));
    if (!Number.isFinite(x) || !Number.isFinite(z) || !blockId) continue;

    if (!rows.has(z)) rows.set(z, []);
    rows.get(z).push({ x, blockId: Number(blockId) });
    materials[blockId] = (materials[blockId] || 0) + 1;
  }

  const runs = [];
  const blocks = [];

  const sortedZ = Array.from(rows.keys()).sort((a, b) => a - b);
  for (const z of sortedZ) {
    const row = rows.get(z).sort((a, b) => a.x - b.x);
    let i = 0;
    while (i < row.length) {
      const startX = row[i].x;
      const blockId = row[i].blockId;
      let len = 1;
      while (
        i + len < row.length &&
        row[i + len].x === startX + len &&
        row[i + len].blockId === blockId
      ) {
        len++;
      }
      if (len >= 3) {
        runs.push([z, startX, len, blockId]);
      } else {
        for (let k = 0; k < len; k++) {
          blocks.push([startX + k, z, blockId]);
        }
      }
      i += len;
    }
  }

  return {
    totalBlocks: coordMap.size,
    materials,
    runs,
    blocks
  };
}

/**
 * Decodes a raw layer.Y.json object into a Map<"x,z", blockId>.
 */
function decodeRawLayerToMap(raw) {
  const coordMap = new Map();

  if (Array.isArray(raw.shapes)) {
    for (const s of raw.shapes) {
      if (s.type === 'circle') {
        const rMaxSq = s.r * s.r;
        const rMin = s.filled ? 0 : Math.max(0, s.r - (s.thickness || 2));
        const rMinSq = rMin * rMin;
        for (let z = s.cz - s.r; z <= s.cz + s.r; z++) {
          for (let x = s.cx - s.r; x <= s.cx + s.r; x++) {
            const dSq = (x - s.cx) * (x - s.cx) + (z - s.cz) * (z - s.cz);
            if (dSq <= rMaxSq && dSq >= rMinSq) {
              coordMap.set(`${x},${z}`, Number(s.block));
            }
          }
        }
      } else if (s.type === 'rect') {
        const minX = Math.min(s.x1, s.x2);
        const maxX = Math.max(s.x1, s.x2);
        const minZ = Math.min(s.z1, s.z2);
        const maxZ = Math.max(s.z1, s.z2);
        const t = s.thickness || 1;
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            if (s.filled || x < minX + t || x > maxX - t || z < minZ + t || z > maxZ - t) {
              coordMap.set(`${x},${z}`, Number(s.block));
            }
          }
        }
      }
    }
  }

  if (Array.isArray(raw.runs)) {
    for (const [z, startX, length, blockId] of raw.runs) {
      for (let i = 0; i < length; i++) {
        coordMap.set(`${startX + i},${z}`, Number(blockId));
      }
    }
  }

  if (Array.isArray(raw.blocks)) {
    for (const [x, z, blockId] of raw.blocks) {
      coordMap.set(`${x},${z}`, Number(blockId));
    }
  }

  return coordMap;
}

/**
 * Creates a Connect/Express/Node HTTP middleware that handles:
 *  - GET  /api/layers/events  (Server-Sent Events for real-time cross-session layer reload)
 *  - POST /api/layers/mutate  (Direct block add / convert / remove persisted to layer.Y.json & manifest.json)
 */
export function createLayerApiMiddleware(dataDir) {
  const layersDir = path.join(dataDir, 'layers');
  const manifestPath = path.join(dataDir, 'manifest.json');

  const sseClients = new Set();
  const recentInternalWrites = new Map(); // filename -> timestamp
  let writeChain = Promise.resolve();

  function broadcastEvent(payload) {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(msg);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  // Heartbeat every 20s to keep SSE connections alive through proxies / nginx / docker
  const heartbeatTimer = setInterval(() => {
    for (const res of sseClients) {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        sseClients.delete(res);
      }
    }
  }, 20000);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  // Watch layers directory for any external file edits so all sessions stay in sync
  const pendingExternalLayers = new Set();
  let externalDebounce = null;

  if (fs.existsSync(layersDir)) {
    try {
      const watcher = fs.watch(layersDir, (eventType, filename) => {
        if (!filename || !filename.startsWith('layer.') || !filename.endsWith('.json')) return;
        const lastInternal = recentInternalWrites.get(filename) || 0;
        if (Date.now() - lastInternal < 1200) return; // Ignore our own atomic write

        const match = filename.match(/^layer\.(-?\d+)\.json$/);
        if (!match) return;
        const y = Number(match[1]);
        if (!Number.isFinite(y)) return;

        pendingExternalLayers.add(y);
        if (externalDebounce) clearTimeout(externalDebounce);
        externalDebounce = setTimeout(() => {
          const layers = Array.from(pendingExternalLayers);
          pendingExternalLayers.clear();
          if (layers.length > 0) {
            broadcastEvent({
              type: 'layer-updated',
              layers,
              source: 'external-fs',
              timestamp: Date.now()
            });
          }
        }, 180);
      });
      if (watcher && typeof watcher.unref === 'function') {
        watcher.unref();
      }
    } catch (err) {
      console.warn('Could not attach fs.watch to layersDir:', err.message);
    }
  }

  async function applyMutations(mutations, clientId) {
    // Group mutations by Y layer
    const byY = new Map();
    for (const m of mutations) {
      const x = Math.round(Number(m.x));
      const y = Math.round(Number(m.y));
      const z = Math.round(Number(m.z));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (y < -30 || y > 156) continue;

      const blockId =
        m.blockId === null || m.blockId === undefined || Number(m.blockId) <= 0
          ? null
          : Math.round(Number(m.blockId));

      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x, y, z, blockId });
    }

    const affectedLayers = [];
    const updatedLayerSummaries = new Map();

    for (const [y, layerMutations] of byY.entries()) {
      const filename = `layer.${y}.json`;
      const filePath = path.join(layersDir, filename);

      let raw = {
        y,
        label: `Layer Y=${y}`,
        zone: 'all',
        description: `Bearbeitete Ebene Y=${y}`,
        totalBlocks: 0,
        materials: {},
        shapes: [],
        runs: [],
        blocks: []
      };

      if (fs.existsSync(filePath)) {
        raw = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
      }

      const coordMap = decodeRawLayerToMap(raw);
      let changedCount = 0;

      for (const { x, z, blockId } of layerMutations) {
        const key = `${x},${z}`;
        const prev = coordMap.get(key) ?? null;
        if (blockId === null) {
          if (prev !== null) {
            coordMap.delete(key);
            changedCount++;
          }
        } else if (prev !== blockId) {
          coordMap.set(key, blockId);
          changedCount++;
        }
      }

      if (changedCount === 0) continue;

      const encoded = encodeCoordMap(coordMap);
      const updatedLayer = {
        y: raw.y ?? y,
        label: raw.label || `Layer Y=${y}`,
        zone: raw.zone || 'all',
        description: raw.description || '',
        totalBlocks: encoded.totalBlocks,
        materials: encoded.materials,
        shapes: [],
        runs: encoded.runs,
        blocks: encoded.blocks
      };

      recentInternalWrites.set(filename, Date.now());
      await fs.promises.writeFile(filePath, JSON.stringify(updatedLayer));
      recentInternalWrites.set(filename, Date.now());

      affectedLayers.push(y);
      updatedLayerSummaries.set(y, {
        totalBlocks: encoded.totalBlocks,
        materials: encoded.materials
      });
    }

    // Update manifest.json material counts & timestamp if any layer changed
    if (affectedLayers.length > 0 && fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
        if (Array.isArray(manifest.layers)) {
          for (const layerEntry of manifest.layers) {
            const summary = updatedLayerSummaries.get(layerEntry.y);
            if (summary) {
              layerEntry.totalBlocks = summary.totalBlocks;
              layerEntry.materials = summary.materials;
            }
          }
          // Recompute globalMaterials and totalBlocksAllLayers
          const globalMaterials = {};
          let globalTotalBlocks = 0;
          for (const l of manifest.layers) {
            globalTotalBlocks += l.totalBlocks || 0;
            for (const [bId, cnt] of Object.entries(l.materials || {})) {
              globalMaterials[bId] = (globalMaterials[bId] || 0) + cnt;
            }
          }
          manifest.globalMaterials = globalMaterials;
          manifest.totalBlocksAllLayers = globalTotalBlocks;
          manifest.updatedAt = new Date().toISOString();
          await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        }
      } catch (err) {
        console.warn('Could not update manifest.json after layer edit:', err.message);
      }
    }

    if (affectedLayers.length > 0) {
      broadcastEvent({
        type: 'layer-updated',
        layers: affectedLayers,
        clientId: clientId || null,
        timestamp: Date.now()
      });
    }

    return {
      ok: true,
      affectedLayers,
      timestamp: Date.now()
    };
  }

  return function layerApiMiddleware(req, res, next) {
    const urlObj = new URL(req.url, 'http://localhost');

    // 1. SSE Endpoint: GET /api/layers/events
    if (req.method === 'GET' && urlObj.pathname === '/api/layers/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // 2. Mutation Endpoint: POST /api/layers/mutate
    if (req.method === 'POST' && urlObj.pathname === '/api/layers/mutate') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          req.destroy();
        }
      });
      req.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Ungültiges JSON-Format.' }));
          return;
        }

        const mutations = Array.isArray(parsed.mutations)
          ? parsed.mutations
          : parsed.mutation
            ? [parsed.mutation]
            : [];

        if (mutations.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Keine Block-Änderungen übergeben.' }));
          return;
        }

        // Serialize writes through writeChain so concurrent edits never collide
        writeChain = writeChain
          .then(() => applyMutations(mutations, parsed.clientId))
          .then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          })
          .catch((err) => {
            console.error('Error mutating layer JSON:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          });
      });
      return;
    }

    if (typeof next === 'function') {
      next();
    }
  };
}
