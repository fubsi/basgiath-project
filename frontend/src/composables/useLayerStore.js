import { reactive, computed } from 'vue';

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
  hoveredVoxel: null, // { x, y, z, blockId, blockInfo }

  // Material List Scope ('layer' | 'cutaway' | 'global')
  materialScope: 'layer',
  materialSearch: '',
  materialModFilter: 'ALL',
  checkedMaterials: JSON.parse(localStorage.getItem('bwc_checked_materials') || '{}')
});

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
              coordMap.set(`${x},${z}`, s.block);
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
              coordMap.set(`${x},${z}`, s.block);
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
        coordMap.set(`${startX + i},${z}`, blockId);
      }
    }
  }

  // 3. Single blocks: [x, z, blockId]
  if (Array.isArray(raw.blocks)) {
    for (const [x, z, blockId] of raw.blocks) {
      coordMap.set(`${x},${z}`, blockId);
    }
  }

  return {
    y: raw.y,
    label: raw.label || `Layer Y=${raw.y}`,
    zone: raw.zone || 'all',
    description: raw.description || '',
    totalBlocks: raw.totalBlocks || coordMap.size,
    materials: raw.materials || {},
    runs: raw.runs || [],
    blocks: raw.blocks || [],
    coordMap
  };
}

export function useLayerStore() {
  async function initStore() {
    if (state.manifest && state.palette) return;
    state.isInitializing = true;
    state.error = null;
    try {
      const [manifestRes, paletteRes] = await Promise.all([
        fetch('/data/manifest.json'),
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
      const res = await fetch(`/data/layers/layer.${y}.json`);
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
    // Snap to closest available layer if exact y not present
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

  const currentLayerData = computed(() => {
    return state.loadedLayers.get(state.currentY) || null;
  });

  const previousLayerData = computed(() => {
    const prevY = getPreviousAvailableY(state.currentY);
    if (prevY === null) return null;
    return state.loadedLayers.get(prevY) || null;
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
          paletteId: blockId,
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
    loadAllLayersFor3D,
    availableYLevels,
    getNextAvailableY,
    setCurrentY,
    stepY,
    getBlockInfo,
    isTerrainBlock,
    currentLayerData,
    previousLayerData,
    availableMods,
    computedMaterialList,
    totalScopeBlocks,
    toggleMaterialChecked
  };
}
