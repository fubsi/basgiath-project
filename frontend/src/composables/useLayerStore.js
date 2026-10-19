import { reactive, computed } from 'vue';

const SESSION_CLIENT_ID = `bwc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
let sseSource = null;

const state = reactive({
  manifest: null,
  palette: null,
  loadedLayers: new Map(), // y -> decoded layer object
  loadingLayers: new Set(),
  isInitializing: true,
  isLoading3D: false,
  error: null,

  // Active Navigation / Selection State
  currentY: 88, // Default: Inside Dragon Rotunda with all 6 Dragon Statues & Amphitheater!
  onionSkinEnabled: true,
  showTerrain: true, // Include 3D Mountain Landscape
  mapOverlayOpacity: 0.25,
  showGridLines: true,
  selectedZone: 'all',

  // 3D Cutaway Range (Y-Min to Y-Max)
  cutawayMinY: -30,
  cutawayMaxY: 156,

  // Hovered Block Inspector State
  hoveredVoxel: null, // { x, y, z, blockId, blockInfo, adjacent: { x, y, z }, faceNormal }

  // Interactive Block Editor & Live Sync State
  editMode: false,
  editTool: 'add', // 'add' (Anliegend hinzufügen) | 'convert' (Block konvertieren) | 'remove' (Block entfernen) | 'pick' (Pipette)
  selectedBlockId: 2, // Default: Polished Deepslate (#2)
  enforceAdjacent2D: true, // In 2D 'add' mode, require target to be adjacent to an existing block
  isSavingEdit: false,
  sseConnected: false,
  lastSyncEvent: null, // { layers, timestamp, source }
  layerRevision: 0, // Incremented on any local or remote layer change to trigger fast 2D/3D refresh
  lastModifiedLayers: [], // Array of Y levels changed in the last update
  undoStack: [], // Array of { mutations: [{ x, y, z, prevBlockId, newBlockId }], timestamp }
  redoStack: [],

  // Material List Scope ('layer' | 'cutaway' | 'global')
  materialScope: 'layer',
  materialSearch: '',
  materialModFilter: 'ALL',
  checkedMaterials: JSON.parse(localStorage.getItem('bwc_checked_materials') || '{}')
});

function encodeCoordMapClient(coordMap) {
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

function decodeLayerData(raw) {
  const coordMap = new Map();

  // 1. Optional geometric shapes
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

  // 2. RLE runs: [z, startX, length, blockId]
  if (Array.isArray(raw.runs)) {
    for (const [z, startX, length, blockId] of raw.runs) {
      for (let i = 0; i < length; i++) {
        coordMap.set(`${startX + i},${z}`, Number(blockId));
      }
    }
  }

  // 3. Single blocks: [x, z, blockId]
  if (Array.isArray(raw.blocks)) {
    for (const [x, z, blockId] of raw.blocks) {
      coordMap.set(`${x},${z}`, Number(blockId));
    }
  }

  return {
    y: raw.y,
    label: raw.label || `Layer Y=${raw.y}`,
    zone: raw.zone || 'all',
    description: raw.description || '',
    totalBlocks: raw.totalBlocks ?? coordMap.size,
    materials: raw.materials || {},
    runs: raw.runs || [],
    blocks: raw.blocks || [],
    coordMap,
    revision: Date.now() + Math.random()
  };
}

function syncManifestLayerMaterials(y, totalBlocks, materials) {
  if (!state.manifest || !Array.isArray(state.manifest.layers)) return;
  const entry = state.manifest.layers.find((l) => l.y === y);
  if (!entry) return;

  const oldMaterials = entry.materials || {};
  const globalMats = state.manifest.globalMaterials || {};

  // Subtract old counts from globalMaterials
  for (const [bId, cnt] of Object.entries(oldMaterials)) {
    globalMats[bId] = Math.max(0, (globalMats[bId] || 0) - cnt);
    if (globalMats[bId] === 0) delete globalMats[bId];
  }
  // Add new counts to globalMaterials
  for (const [bId, cnt] of Object.entries(materials || {})) {
    globalMats[bId] = (globalMats[bId] || 0) + cnt;
  }

  const prevTotal = entry.totalBlocks || 0;
  entry.totalBlocks = totalBlocks;
  entry.materials = { ...materials };
  state.manifest.globalMaterials = { ...globalMats };
  state.manifest.totalBlocksAllLayers =
    Math.max(0, (state.manifest.totalBlocksAllLayers || 0) - prevTotal) + totalBlocks;
}

export function useLayerStore() {
  function connectLiveSyncSSE() {
    if (sseSource || typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    try {
      sseSource = new EventSource('/api/layers/events');

      sseSource.onopen = () => {
        state.sseConnected = true;
      };

      sseSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            state.sseConnected = true;
            return;
          }
          if (data.type === 'layer-updated' && Array.isArray(data.layers)) {
            const isFromSelf = data.clientId === SESSION_CLIENT_ID;
            state.lastSyncEvent = {
              layers: data.layers,
              timestamp: data.timestamp || Date.now(),
              source: isFromSelf ? 'local' : 'remote'
            };

            // Reload each affected layer.Y.json individually when modified by another session or external tool!
            // Even for self-initiated edits, if a layer wasn't loaded yet, ensure it stays fresh.
            if (!isFromSelf) {
              await Promise.all(
                data.layers.map((y) => reloadLayer(Number(y), data.timestamp || Date.now()))
              );
            }
          }
        } catch (err) {
          console.warn('Fehler beim Verarbeiten des Live-Sync SSE-Events:', err);
        }
      };

      sseSource.onerror = () => {
        state.sseConnected = false;
      };
    } catch (err) {
      console.warn('SSE-Verbindung konnte nicht aufgebaut werden:', err);
    }
  }

  async function initStore() {
    connectLiveSyncSSE();
    if (state.manifest && state.palette) return;
    state.isInitializing = true;
    state.error = null;
    try {
      const [manifestRes, paletteRes] = await Promise.all([
        fetch(`/data/manifest.json?t=${Date.now()}`, { cache: 'no-store' }),
        fetch('/data/palette.json')
      ]);
      if (!manifestRes.ok || !paletteRes.ok) {
        throw new Error('Manifest oder Blockpalette konnte nicht geladen werden.');
      }
      state.manifest = await manifestRes.json();
      state.palette = await paletteRes.json();

      await ensureLayerLoaded(state.currentY);
      const prevY = getPreviousAvailableY(state.currentY);
      if (prevY !== null) {
        await ensureLayerLoaded(prevY);
      }
    } catch (err) {
      console.error(err);
      state.error = err.message;
    } finally {
      state.isInitializing = false;
    }
  }

  async function ensureLayerLoaded(y) {
    if (state.loadedLayers.has(y) || state.loadingLayers.has(y)) {
      return state.loadedLayers.get(y);
    }
    state.loadingLayers.add(y);
    try {
      const res = await fetch(`/data/layers/layer.${y}.json`, { cache: 'no-cache' });
      if (!res.ok) return null;
      const raw = await res.json();
      const decoded = decodeLayerData(raw);
      state.loadedLayers.set(y, decoded);
      return decoded;
    } catch (err) {
      console.warn(`Layer.${y}.json konnte nicht geladen werden:`, err);
      return null;
    } finally {
      state.loadingLayers.delete(y);
    }
  }

  /**
   * Force-reloads a single layer.Y.json from the server and triggers 2D/3D reactive re-render.
   */
  async function reloadLayer(y, cacheBust = Date.now()) {
    try {
      const res = await fetch(`/data/layers/layer.${y}.json?t=${cacheBust}`, {
        cache: 'no-store'
      });
      if (!res.ok) return null;
      const raw = await res.json();
      const decoded = decodeLayerData(raw);
      state.loadedLayers.set(y, decoded);
      syncManifestLayerMaterials(y, decoded.totalBlocks, decoded.materials);
      state.lastModifiedLayers = [y];
      state.layerRevision++;
      return decoded;
    } catch (err) {
      console.warn(`Einzel-Reload von layer.${y}.json fehlgeschlagen:`, err);
      return null;
    }
  }

  async function loadAllLayersFor3D() {
    if (!state.manifest) await initStore();
    if (!state.manifest) return;
    state.isLoading3D = true;
    try {
      const missingLayers = state.manifest.layers
        .map((l) => l.y)
        .filter((y) => !state.loadedLayers.has(y));

      const batchSize = 16;
      for (let i = 0; i < missingLayers.length; i += batchSize) {
        const batch = missingLayers.slice(i, i + batchSize);
        await Promise.all(batch.map((y) => ensureLayerLoaded(y)));
      }
    } finally {
      state.isLoading3D = false;
    }
  }

  const availableYLevels = computed(() => {
    if (!state.manifest) return [];
    return state.manifest.layers.map((l) => l.y);
  });

  function getPreviousAvailableY(y) {
    const list = availableYLevels.value;
    const idx = list.indexOf(y);
    if (idx > 0) return list[idx - 1];
    return null;
  }

  function getNextAvailableY(y) {
    const list = availableYLevels.value;
    const idx = list.indexOf(y);
    if (idx >= 0 && idx < list.length - 1) return list[idx + 1];
    return null;
  }

  async function setCurrentY(y) {
    const list = availableYLevels.value;
    let targetY = y;
    if (list.length && !list.includes(y)) {
      targetY = list.reduce((prev, curr) =>
        Math.abs(curr - y) < Math.abs(prev - y) ? curr : prev
      );
    }
    state.currentY = targetY;
    await ensureLayerLoaded(targetY);
    const prevY = getPreviousAvailableY(targetY);
    if (prevY !== null) {
      ensureLayerLoaded(prevY);
    }
    const nextY = getNextAvailableY(targetY);
    if (nextY !== null) {
      ensureLayerLoaded(nextY);
    }
  }

  function stepY(deltaIndex) {
    const list = availableYLevels.value;
    if (!list.length) return;
    const currentIdx = list.indexOf(state.currentY);
    const nextIdx = Math.max(0, Math.min(list.length - 1, currentIdx + deltaIndex));
    setCurrentY(list[nextIdx]);
  }

  function getBlockInfo(blockId) {
    if (!state.palette || !state.palette.blocks) return null;
    return state.palette.blocks[String(blockId)] || null;
  }

  function isTerrainBlock(blockId) {
    const info = getBlockInfo(blockId);
    return Boolean(info?.isTerrain);
  }

  function getBlockAt(x, y, z) {
    const layer = state.loadedLayers.get(Number(y));
    if (!layer || !layer.coordMap) return null;
    const id = layer.coordMap.get(`${Math.round(x)},${Math.round(z)}`);
    return id !== undefined ? Number(id) : null;
  }

  /**
   * Returns true if (x, y, z) is directly adjacent (6-directional 3D neighbor: ±X, ±Z, ±Y)
   * to at least one existing block.
   */
  function isAdjacentCoordinate(x, y, z) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);

    // Check 4 horizontal neighbors on the same layer Y
    if (getBlockAt(rx + 1, ry, rz) !== null) return true;
    if (getBlockAt(rx - 1, ry, rz) !== null) return true;
    if (getBlockAt(rx, ry, rz + 1) !== null) return true;
    if (getBlockAt(rx, ry, rz - 1) !== null) return true;

    // Check vertical neighbors on Y - 1 and Y + 1
    if (getBlockAt(rx, ry - 1, rz) !== null) return true;
    if (getBlockAt(rx, ry + 1, rz) !== null) return true;

    return false;
  }

  /**
   * Mutates one or more blocks across any layer(s), updates local state immediately,
   * writes directly to /data/layers/layer.Y.json via POST /api/layers/mutate,
   * and broadcasts to all other sessions via SSE.
   */
  async function mutateBlocks(rawMutations, { recordHistory = true } = {}) {
    if (!Array.isArray(rawMutations) || rawMutations.length === 0) return false;

    // Ensure all target Y layers are loaded first
    const targetYs = Array.from(
      new Set(
        rawMutations
          .map((m) => Math.round(Number(m.y)))
          .filter((y) => Number.isFinite(y) && y >= -30 && y <= 156)
      )
    );
    await Promise.all(targetYs.map((y) => ensureLayerLoaded(y)));

    const effectiveMutations = [];
    const historyEntries = [];
    const modifiedLayerSet = new Set();

    for (const m of rawMutations) {
      const x = Math.round(Number(m.x));
      const y = Math.round(Number(m.y));
      const z = Math.round(Number(m.z));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (y < -30 || y > 156) continue;

      const newBlockId =
        m.blockId === null || m.blockId === undefined || Number(m.blockId) <= 0
          ? null
          : Math.round(Number(m.blockId));

      const layer = state.loadedLayers.get(y);
      if (!layer) continue;

      const key = `${x},${z}`;
      const prevBlockId = layer.coordMap.get(key) ?? null;
      if (prevBlockId === newBlockId) continue;

      if (newBlockId === null) {
        layer.coordMap.delete(key);
      } else {
        layer.coordMap.set(key, newBlockId);
      }

      effectiveMutations.push({ x, y, z, blockId: newBlockId });
      historyEntries.push({ x, y, z, prevBlockId, newBlockId });
      modifiedLayerSet.add(y);
    }

    if (effectiveMutations.length === 0) return false;

    // Re-encode only the modified layers in memory for immediate 0ms 2D/3D update
    const affectedLayers = Array.from(modifiedLayerSet);
    for (const y of affectedLayers) {
      const layer = state.loadedLayers.get(y);
      if (!layer) continue;
      const encoded = encodeCoordMapClient(layer.coordMap);
      layer.totalBlocks = encoded.totalBlocks;
      layer.materials = encoded.materials;
      layer.runs = encoded.runs;
      layer.blocks = encoded.blocks;
      layer.revision = Date.now() + Math.random();
      syncManifestLayerMaterials(y, encoded.totalBlocks, encoded.materials);
    }

    if (recordHistory) {
      state.undoStack.push({
        mutations: historyEntries,
        timestamp: Date.now()
      });
      if (state.undoStack.length > 100) state.undoStack.shift();
      state.redoStack = [];
    }

    state.lastModifiedLayers = affectedLayers;
    state.layerRevision++;

    // Refresh hoveredVoxel if it was at one of the modified coordinates
    if (state.hoveredVoxel) {
      const hv = state.hoveredVoxel;
      const updatedId = getBlockAt(hv.x, hv.y, hv.z);
      hv.blockId = updatedId;
      hv.blockInfo = updatedId ? getBlockInfo(updatedId) : null;
    }

    // Persist directly to /data/layers/layer.Y.json on server & trigger cross-session SSE sync
    state.isSavingEdit = true;
    try {
      const res = await fetch('/api/layers/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: SESSION_CLIENT_ID,
          mutations: effectiveMutations
        })
      });
      if (!res.ok) {
        throw new Error(`Server-Antwort ${res.status}`);
      }
      const data = await res.json();
      state.lastSyncEvent = {
        layers: data.affectedLayers || affectedLayers,
        timestamp: data.timestamp || Date.now(),
        source: 'local'
      };
      return true;
    } catch (err) {
      console.error('Fehler beim Speichern in layer.Y.json:', err);
      state.error = `Fehler beim Speichern in layer.Y.json: ${err.message}`;
      return false;
    } finally {
      state.isSavingEdit = false;
    }
  }

  /**
   * High-level helper to apply the active editTool at a target coordinate.
   */
  async function applyEditAt(x, y, z, toolOverride = null) {
    const tool = toolOverride || state.editTool;
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const existingBlockId = getBlockAt(rx, ry, rz);

    if (tool === 'pick') {
      if (existingBlockId !== null) {
        state.selectedBlockId = existingBlockId;
      }
      return false;
    }

    if (tool === 'remove') {
      if (existingBlockId === null) return false;
      return mutateBlocks([{ x: rx, y: ry, z: rz, blockId: null }]);
    }

    if (tool === 'convert') {
      if (existingBlockId === null || existingBlockId === state.selectedBlockId) return false;
      return mutateBlocks([{ x: rx, y: ry, z: rz, blockId: state.selectedBlockId }]);
    }

    if (tool === 'add') {
      // Only add if coordinate is currently empty
      if (existingBlockId !== null) return false;
      return mutateBlocks([{ x: rx, y: ry, z: rz, blockId: state.selectedBlockId }]);
    }

    return false;
  }

  async function undoEdit() {
    if (state.undoStack.length === 0) return;
    const last = state.undoStack.pop();
    const reverseMutations = last.mutations.map((m) => ({
      x: m.x,
      y: m.y,
      z: m.z,
      blockId: m.prevBlockId
    }));
    state.redoStack.push(last);
    await mutateBlocks(reverseMutations, { recordHistory: false });
  }

  async function redoEdit() {
    if (state.redoStack.length === 0) return;
    const next = state.redoStack.pop();
    const forwardMutations = next.mutations.map((m) => ({
      x: m.x,
      y: m.y,
      z: m.z,
      blockId: m.newBlockId
    }));
    state.undoStack.push(next);
    await mutateBlocks(forwardMutations, { recordHistory: false });
  }

  const currentLayerData = computed(() => {
    // Access state.layerRevision so computed re-evaluates when current layer is mutated
    void state.layerRevision;
    return state.loadedLayers.get(state.currentY) || null;
  });

  const previousLayerData = computed(() => {
    void state.layerRevision;
    const prevY = getPreviousAvailableY(state.currentY);
    if (prevY === null) return null;
    return state.loadedLayers.get(prevY) || null;
  });

  const paletteBlocksList = computed(() => {
    if (!state.palette || !state.palette.blocks) return [];
    return Object.entries(state.palette.blocks)
      .map(([id, info]) => ({
        paletteId: Number(id),
        ...info
      }))
      .sort((a, b) => a.paletteId - b.paletteId);
  });

  const availableMods = computed(() => {
    if (!state.palette) return ['ALL'];
    const mods = new Set(['ALL']);
    for (const b of Object.values(state.palette.blocks)) {
      mods.add(b.mod);
    }
    return Array.from(mods);
  });

  const computedMaterialList = computed(() => {
    void state.layerRevision;
    if (!state.manifest || !state.palette) return [];

    const rawCounts = {};

    if (state.materialScope === 'layer') {
      const layerMeta = state.manifest.layers.find((l) => l.y === state.currentY);
      const source = currentLayerData.value?.materials || layerMeta?.materials || {};
      for (const [id, count] of Object.entries(source)) {
        if (!state.showTerrain && isTerrainBlock(id)) continue;
        rawCounts[id] = (rawCounts[id] || 0) + count;
      }
    } else if (state.materialScope === 'cutaway') {
      for (const layerMeta of state.manifest.layers) {
        if (layerMeta.y >= state.cutawayMinY && layerMeta.y <= state.cutawayMaxY) {
          for (const [id, count] of Object.entries(layerMeta.materials || {})) {
            if (!state.showTerrain && isTerrainBlock(id)) continue;
            rawCounts[id] = (rawCounts[id] || 0) + count;
          }
        }
      }
    } else {
      for (const [id, count] of Object.entries(state.manifest.globalMaterials || {})) {
        if (!state.showTerrain && isTerrainBlock(id)) continue;
        rawCounts[id] = (rawCounts[id] || 0) + count;
      }
    }

    const search = state.materialSearch.trim().toLowerCase();
    const modFilter = state.materialModFilter;

    const entries = Object.entries(rawCounts)
      .map(([blockId, count]) => {
        const info = getBlockInfo(blockId) || {
          id: `unknown:${blockId}`,
          name: `Block #${blockId}`,
          mod: 'Vanilla',
          category: 'Sonstige',
          color: '#888888'
        };
        const stacks = Math.floor(count / 64);
        const remainder = count % 64;
        const shulkers = (count / 1728).toFixed(1);
        return {
          paletteId: Number(blockId),
          ...info,
          count,
          stacks,
          remainder,
          shulkers,
          checked: Boolean(state.checkedMaterials[info.id])
        };
      })
      .filter((item) => {
        if (modFilter !== 'ALL' && item.mod !== modFilter) return false;
        if (search) {
          return (
            item.name.toLowerCase().includes(search) ||
            item.id.toLowerCase().includes(search) ||
            item.mod.toLowerCase().includes(search) ||
            item.category.toLowerCase().includes(search)
          );
        }
        return true;
      })
      .sort((a, b) => b.count - a.count);

    return entries;
  });

  const totalScopeBlocks = computed(() => {
    return computedMaterialList.value.reduce((acc, item) => acc + item.count, 0);
  });

  function toggleMaterialChecked(blockTechId) {
    state.checkedMaterials[blockTechId] = !state.checkedMaterials[blockTechId];
    localStorage.setItem('bwc_checked_materials', JSON.stringify(state.checkedMaterials));
  }

  return {
    state,
    initStore,
    ensureLayerLoaded,
    reloadLayer,
    loadAllLayersFor3D,
    availableYLevels,
    getPreviousAvailableY,
    getNextAvailableY,
    setCurrentY,
    stepY,
    getBlockInfo,
    isTerrainBlock,
    getBlockAt,
    isAdjacentCoordinate,
    mutateBlocks,
    applyEditAt,
    undoEdit,
    redoEdit,
    currentLayerData,
    previousLayerData,
    paletteBlocksList,
    availableMods,
    computedMaterialList,
    totalScopeBlocks,
    toggleMaterialChecked
  };
}
