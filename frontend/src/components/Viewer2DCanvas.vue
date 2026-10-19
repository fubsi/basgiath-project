<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useLayerStore } from '../composables/useLayerStore';

const {
  state,
  currentLayerData,
  previousLayerData,
  getBlockInfo,
  isTerrainBlock,
  getBlockAt,
  isAdjacentCoordinate,
  mutateBlocks,
  applyEditAt
} = useLayerStore();

const canvasRef = ref(null);
const containerRef = ref(null);
let resizeObserver = null;

// Cache of HTMLImageElement for each blockId
const blockImages = new Map();

function preloadBlockTextures() {
  if (!state.palette?.blocks) return;
  for (const [blockId, info] of Object.entries(state.palette.blocks)) {
    if (info.texture && !blockImages.has(Number(blockId))) {
      const img = new Image();
      img.src = info.texture;
      img.onload = () => {
        blockImages.set(Number(blockId), img);
        drawCanvas();
      };
    }
  }
}

// Camera pan & zoom state (World block coordinates)
const cam = ref({
  cx: 0,      // World X at screen center
  cz: 110,    // World Z at screen center
  zoom: 1.35  // Pixels per Minecraft block
});

const isDragging = ref(false);
const isBrushPainting = ref(false);
const paintedCoords = new Map(); // "x,z" -> blockId|null
const dragStart = ref({ x: 0, y: 0, cx: 0, cz: 0, moved: false });
const mouseWorld = ref({ x: 0, z: 0 });
const mapImage = new Image();
let mapLoaded = false;

mapImage.src = '/basgiath-map.jpg';
mapImage.onload = () => {
  mapLoaded = true;
  drawCanvas();
};

function focusZone(zoneId) {
  state.selectedZone = zoneId;
  if (zoneId === 'dragon-rotunda') {
    cam.value = { cx: 0, cz: 0, zoom: 5.5 };
  } else if (zoneId === 'parapet') {
    cam.value = { cx: -25, cz: 155, zoom: 2.5 };
  } else if (zoneId === 'south-campus') {
    cam.value = { cx: 0, cz: 390, zoom: 1.6 };
  } else if (zoneId === 'scribe-quadrant') {
    cam.value = { cx: -130, cz: 350, zoom: 2.5 };
  } else if (zoneId === 'threshing-valley') {
    cam.value = { cx: -265, cz: -115, zoom: 2.2 };
  } else if (zoneId === 'gauntlet-flight-field') {
    cam.value = { cx: 95, cz: -185, zoom: 1.9 };
  } else {
    cam.value = { cx: 0, cz: 140, zoom: 0.9 };
  }
  drawCanvas();
}

function zoomBy(factor) {
  cam.value.zoom = Math.max(0.35, Math.min(28, cam.value.zoom * factor));
  drawCanvas();
}

function worldToScreen(wx, wz, width, height) {
  return {
    sx: width / 2 + (wx - cam.value.cx) * cam.value.zoom,
    sy: height / 2 + (wz - cam.value.cz) * cam.value.zoom
  };
}

function screenToWorld(sx, sy, width, height) {
  return {
    wx: Math.floor(cam.value.cx + (sx - width / 2) / cam.value.zoom),
    wz: Math.floor(cam.value.cz + (sy - height / 2) / cam.value.zoom)
  };
}

function canPlaceAt2D(wx, wz) {
  const existing = getBlockAt(wx, state.currentY, wz);
  if (existing !== null) return false;
  if (!state.enforceAdjacent2D) return true;
  return isAdjacentCoordinate(wx, state.currentY, wz);
}

function drawCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return;

  ctx.imageSmoothingEnabled = false;

  // 1. Background Clear
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, width, height);

  // 2. Original Map Overlay (calibrated to world bounds X=-310..310, Z=-320..620)
  if (mapLoaded && state.mapOverlayOpacity > 0.01) {
    ctx.save();
    ctx.globalAlpha = state.mapOverlayOpacity;
    const topLeft = worldToScreen(-310, -320, width, height);
    const bottomRight = worldToScreen(310, 620, width, height);
    ctx.drawImage(
      mapImage,
      topLeft.sx,
      topLeft.sy,
      bottomRight.sx - topLeft.sx,
      bottomRight.sy - topLeft.sy
    );
    ctx.restore();
  }

  // 3. Tactical Coordinate Grid
  if (state.showGridLines) {
    const step = cam.value.zoom >= 6 ? 1 : cam.value.zoom >= 1.5 ? 16 : 64;
    const tl = screenToWorld(0, 0, width, height);
    const br = screenToWorld(width, height, width, height);

    ctx.strokeStyle = step === 1 ? 'rgba(255,255,255,0.06)' : 'rgba(229, 169, 60, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const startX = Math.floor(tl.wx / step) * step;
    for (let x = startX; x <= br.wx; x += step) {
      const { sx } = worldToScreen(x, 0, width, height);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }

    const startZ = Math.floor(tl.wz / step) * step;
    for (let z = startZ; z <= br.wz; z += step) {
      const { sy } = worldToScreen(0, z, width, height);
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // Origin Axis (X=0, Z=0 = Center of Dragon Rotunda)
    const origin = worldToScreen(0, 0, width, height);
    ctx.strokeStyle = 'rgba(229, 169, 60, 0.32)';
    ctx.beginPath();
    ctx.moveTo(origin.sx, 0);
    ctx.lineTo(origin.sx, height);
    ctx.moveTo(0, origin.sy);
    ctx.lineTo(width, origin.sy);
    ctx.stroke();
  }

  const blockSize = Math.max(1, cam.value.zoom);
  const useTextures = cam.value.zoom >= 4.0;

  // 4. Draw Onion-Skin Layer (Y - 1) if enabled
  const prevLayer = previousLayerData.value;
  if (state.onionSkinEnabled && prevLayer) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (const [z, startX, len, blockId] of prevLayer.runs) {
      if (!state.showTerrain && isTerrainBlock(blockId)) continue;
      const info = getBlockInfo(blockId);
      ctx.fillStyle = info ? info.color : '#555';
      const { sx, sy } = worldToScreen(startX, z, width, height);
      ctx.fillRect(sx, sy, len * cam.value.zoom, blockSize);
    }
    for (const [x, z, blockId] of prevLayer.blocks) {
      if (!state.showTerrain && isTerrainBlock(blockId)) continue;
      const info = getBlockInfo(blockId);
      ctx.fillStyle = info ? info.color : '#555';
      const { sx, sy } = worldToScreen(x, z, width, height);
      ctx.fillRect(sx, sy, blockSize, blockSize);
    }
    ctx.restore();
  }

  // 5. Draw Active Layer (layer.Y.json) with Real Block Textures when zoomed in!
  const layer = currentLayerData.value;
  if (layer) {
    for (const [z, startX, len, blockId] of layer.runs) {
      if (!state.showTerrain && isTerrainBlock(blockId)) continue;
      const { sx, sy } = worldToScreen(startX, z, width, height);
      const runW = Math.ceil(len * cam.value.zoom);
      if (sx + runW < 0 || sx > width || sy + blockSize < 0 || sy > height) continue;

      const texImg = useTextures ? blockImages.get(blockId) : null;
      if (texImg) {
        for (let i = 0; i < len; i++) {
          const bx = sx + i * cam.value.zoom;
          if (bx + blockSize >= 0 && bx <= width) {
            ctx.drawImage(texImg, Math.floor(bx), Math.floor(sy), Math.ceil(blockSize), Math.ceil(blockSize));
          }
        }
      } else {
        const info = getBlockInfo(blockId);
        ctx.fillStyle = info ? info.color : '#888';
        ctx.fillRect(sx, sy, runW, Math.ceil(blockSize));
      }
    }

    for (const [x, z, blockId] of layer.blocks) {
      if (!state.showTerrain && isTerrainBlock(blockId)) continue;
      const { sx, sy } = worldToScreen(x, z, width, height);
      if (sx + blockSize < 0 || sx > width || sy + blockSize < 0 || sy > height) continue;

      const texImg = useTextures ? blockImages.get(blockId) : null;
      if (texImg) {
        ctx.drawImage(texImg, Math.floor(sx), Math.floor(sy), Math.ceil(blockSize), Math.ceil(blockSize));
      } else {
        const info = getBlockInfo(blockId);
        ctx.fillStyle = info ? info.color : '#888';
        ctx.fillRect(sx, sy, Math.ceil(blockSize), Math.ceil(blockSize));
      }
    }
  }

  // 6. Tactical Zone Labels on Canvas
  const landmarks = [
    { x: 0, z: 0, title: 'DRAGON ROTUNDA (Ø 111)', sub: '6 Drachenstatuen' },
    { x: -110, z: -25, title: 'RIDERS COURTYARD', sub: 'Appellplatz' },
    { x: 85, z: -15, title: 'ACADEMIC WING', sub: 'Challenges & Lehrsäle' },
    { x: 75, z: 58, title: 'GATHERING HALL', sub: 'Speisesaal' },
    { x: -115, z: 155, title: 'THE PARAPET', sub: '210 Blöcke Brücke' },
    { x: -90, z: 280, title: 'HEALER QUADRANT', sub: 'Nordwest-Flügel' },
    { x: 75, z: 260, title: 'BELL TOWER', sub: 'Glockenturm' },
    { x: 90, z: 390, title: 'ADMINISTRATION', sub: 'Ostflügel' },
    { x: 140, z: 485, title: 'SORRENGAIL OFFICE', sub: 'Relief-Karte' },
    { x: 0, z: 520, title: 'INFANTRY QUADRANT', sub: 'Südkasernen' },
    { x: -130, z: 350, title: 'SCRIBE ARCHIVE', sub: 'Underground (Y=10)' },
    { x: 200, z: -170, title: 'FLIGHT FIELD', sub: 'Drachen-Plateau (Y=148)' },
    { x: -265, z: -115, title: 'FIELDS / DRESCHEN', sub: 'West-Tal (Y=16)' }
  ];

  ctx.font = '600 11px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  for (const lm of landmarks) {
    const { sx, sy } = worldToScreen(lm.x, lm.z, width, height);
    if (sx < -100 || sx > width + 100 || sy < -50 || sy > height + 50) continue;
    ctx.fillStyle = 'rgba(15, 16, 20, 0.82)';
    ctx.fillRect(sx - 68, sy - 14, 136, 26);
    ctx.strokeStyle = 'rgba(229, 169, 60, 0.55)';
    ctx.strokeRect(sx - 68, sy - 14, 136, 26);
    ctx.fillStyle = '#e5a93c';
    ctx.fillText(lm.title, sx, sy - 1);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '400 9px "JetBrains Mono", monospace';
    ctx.fillText(lm.sub, sx, sy + 9);
    ctx.font = '600 11px "Space Grotesk", sans-serif';
  }

  // 7. Hovered Block / Edit Cursor Highlight
  const wx = mouseWorld.value.x;
  const wz = mouseWorld.value.z;
  const { sx, sy } = worldToScreen(wx, wz, width, height);

  if (state.editMode) {
    const existingId = getBlockAt(wx, state.currentY, wz);
    if (state.editTool === 'add') {
      const allowed = canPlaceAt2D(wx, wz);
      if (allowed) {
        // Draw ghost block preview
        const activeInfo = getBlockInfo(state.selectedBlockId);
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = activeInfo ? activeInfo.color : '#22c55e';
        ctx.fillRect(sx, sy, Math.ceil(blockSize), Math.ceil(blockSize));
        ctx.restore();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 1, sy - 1, blockSize + 2, blockSize + 2);
      } else {
        ctx.strokeStyle = existingId !== null ? '#f59e0b' : 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - 1, sy - 1, blockSize + 2, blockSize + 2);
      }
    } else if (state.editTool === 'convert') {
      ctx.strokeStyle = existingId !== null ? '#e5a93c' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 1, sy - 1, blockSize + 2, blockSize + 2);
    } else if (state.editTool === 'remove') {
      ctx.strokeStyle = existingId !== null ? '#ef4444' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 1, sy - 1, blockSize + 2, blockSize + 2);
    } else if (state.editTool === 'pick') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 1, sy - 1, blockSize + 2, blockSize + 2);
    }
  } else if (state.hoveredVoxel) {
    const hPos = worldToScreen(state.hoveredVoxel.x, state.hoveredVoxel.z, width, height);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(hPos.sx - 1, hPos.sy - 1, blockSize + 2, blockSize + 2);
  }
}

function recordBrushStrokeAt(wx, wz) {
  const key = `${wx},${wz}`;
  if (paintedCoords.has(key)) return;
  const existing = getBlockAt(wx, state.currentY, wz);

  if (state.editTool === 'add') {
    if (canPlaceAt2D(wx, wz)) {
      paintedCoords.set(key, state.selectedBlockId);
      mutateBlocks([{ x: wx, y: state.currentY, z: wz, blockId: state.selectedBlockId }]);
    }
  } else if (state.editTool === 'convert') {
    if (existing !== null && existing !== state.selectedBlockId) {
      paintedCoords.set(key, state.selectedBlockId);
      mutateBlocks([{ x: wx, y: state.currentY, z: wz, blockId: state.selectedBlockId }]);
    }
  } else if (state.editTool === 'remove') {
    if (existing !== null) {
      paintedCoords.set(key, null);
      mutateBlocks([{ x: wx, y: state.currentY, z: wz, blockId: null }]);
    }
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const { wx, wz } = screenToWorld(sx, sy, canvas.width, canvas.height);

  // Shift + Left-Click in Edit Mode starts continuous brush painting
  if (state.editMode && e.shiftKey) {
    isBrushPainting.value = true;
    paintedCoords.clear();
    recordBrushStrokeAt(wx, wz);
    drawCanvas();
    return;
  }

  isDragging.value = true;
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    cx: cam.value.cx,
    cz: cam.value.cz,
    moved: false
  };
}

function onMouseMove(e) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const { wx, wz } = screenToWorld(sx, sy, canvas.width, canvas.height);
  mouseWorld.value = { x: wx, z: wz };

  if (isBrushPainting.value && state.editMode) {
    recordBrushStrokeAt(wx, wz);
    drawCanvas();
    return;
  }

  if (isDragging.value) {
    const dx = e.clientX - dragStart.value.x;
    const dy = e.clientY - dragStart.value.y;
    if (Math.hypot(dx, dy) > 4) {
      dragStart.value.moved = true;
    }
    if (dragStart.value.moved) {
      cam.value.cx = dragStart.value.cx - dx / cam.value.zoom;
      cam.value.cz = dragStart.value.cz - dy / cam.value.zoom;
      drawCanvas();
      return;
    }
  }

  const layer = currentLayerData.value;
  if (layer && layer.coordMap) {
    const blockId = layer.coordMap.get(`${wx},${wz}`);
    if (blockId !== undefined && (state.showTerrain || !isTerrainBlock(blockId))) {
      state.hoveredVoxel = {
        x: wx,
        y: state.currentY,
        z: wz,
        blockId,
        blockInfo: getBlockInfo(blockId)
      };
    } else {
      state.hoveredVoxel = {
        x: wx,
        y: state.currentY,
        z: wz,
        blockId: null,
        blockInfo: null
      };
    }
  }
  drawCanvas();
}

async function onMouseUp(e) {
  if (isBrushPainting.value) {
    isBrushPainting.value = false;
    paintedCoords.clear();
    return;
  }

  if (isDragging.value) {
    const wasClick = !dragStart.value.moved && e && e.type === 'mouseup' && e.button === 0;
    isDragging.value = false;

    if (wasClick && state.editMode && canvasRef.value) {
      const rect = canvasRef.value.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wz } = screenToWorld(sx, sy, canvasRef.value.width, canvasRef.value.height);

      if (state.editTool === 'add') {
        if (canPlaceAt2D(wx, wz)) {
          await applyEditAt(wx, state.currentY, wz, 'add');
        }
      } else {
        await applyEditAt(wx, state.currentY, wz, state.editTool);
      }
      drawCanvas();
    }
  }
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.18 : 0.85;
  zoomBy(factor);
}

function resizeCanvas() {
  if (!canvasRef.value || !containerRef.value) return;
  const w = containerRef.value.clientWidth;
  const h = containerRef.value.clientHeight;
  if (w <= 0 || h <= 0) return;
  canvasRef.value.width = w;
  canvasRef.value.height = h;
  drawCanvas();
}

watch(
  () => [
    state.palette,
    state.currentY,
    state.layerRevision,
    currentLayerData.value,
    previousLayerData.value,
    state.onionSkinEnabled,
    state.showTerrain,
    state.mapOverlayOpacity,
    state.showGridLines,
    state.editMode,
    state.editTool,
    state.selectedBlockId
  ],
  () => {
    preloadBlockTextures();
    drawCanvas();
  }
);

onMounted(async () => {
  await nextTick();
  preloadBlockTextures();
  resizeCanvas();
  if (window.ResizeObserver && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(containerRef.value);
  }
  window.addEventListener('resize', resizeCanvas);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas);
  if (resizeObserver) resizeObserver.disconnect();
});

defineExpose({ focusZone });
</script>

<template>
  <div class="viewer-2d-wrap" ref="containerRef">
    <!-- Top Floating Controls -->
    <div class="canvas-toolbar">
      <div class="toolbar-group">
        <button class="btn-tactical" @click="focusZone('all')">Gesamtkarte</button>
        <button class="btn-tactical" @click="focusZone('dragon-rotunda')">Dragon Rotunda (Textur-Zoom)</button>
        <button class="btn-tactical" @click="focusZone('threshing-valley')">West-Tal (Dreschen)</button>
        <button class="btn-tactical" @click="focusZone('parapet')">Parapet</button>
        <button class="btn-tactical" @click="focusZone('south-campus')">Süd-Campus</button>
      </div>

      <div class="toolbar-group">
        <label class="toggle-label">
          <input type="checkbox" v-model="state.showTerrain" />
          <span>Berg-Terrain</span>
        </label>
        <label class="toggle-label">
          <input type="checkbox" v-model="state.onionSkinEnabled" />
          <span>Onion-Skin (Y-1)</span>
        </label>
        <label class="toggle-label">
          <span>Karte:</span>
          <input
            type="range"
            min="0"
            max="0.85"
            step="0.05"
            v-model.number="state.mapOverlayOpacity"
            class="mini-slider"
          />
        </label>
        <button class="btn-tactical" @click="zoomBy(1.3)">＋</button>
        <button class="btn-tactical" @click="zoomBy(0.75)">－</button>
      </div>
    </div>

    <canvas
      ref="canvasRef"
      class="blueprint-canvas"
      :class="{ 'edit-cursor': state.editMode }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
    ></canvas>

    <!-- Bottom HUD: Coordinates & Hovered ATM11 Block with Real Texture -->
    <div class="canvas-hud font-mono">
      <div class="hud-coords">
        <span class="text-muted">MC-KOORDINATEN:</span>
        <span class="text-blue">X: {{ mouseWorld.x }}</span>
        <span class="text-accent">Y: {{ state.currentY }}</span>
        <span class="text-blue">Z: {{ mouseWorld.z }}</span>
        <span class="text-muted">| Datei: <code>/data/layers/layer.{{ state.currentY }}.json</code></span>
      </div>

      <div v-if="state.hoveredVoxel?.blockInfo" class="hud-block">
        <img
          v-if="state.hoveredVoxel.blockInfo.texture"
          :src="state.hoveredVoxel.blockInfo.texture"
          class="hud-tex-icon"
          alt=""
        />
        <span
          v-else
          class="hud-swatch"
          :style="{ backgroundColor: state.hoveredVoxel.blockInfo.color }"
        ></span>
        <strong>#{{ state.hoveredVoxel.blockId }} {{ state.hoveredVoxel.blockInfo.name }}</strong>
        <span class="text-muted">({{ state.hoveredVoxel.blockInfo.id }})</span>
        <span class="badge">{{ state.hoveredVoxel.blockInfo.mod }}</span>
      </div>
      <div v-else-if="state.editMode" class="hud-block text-accent">
        <strong>EDITIER-MODUS:</strong> Klick = {{ state.editTool === 'add' ? 'Block anliegend hinzufügen' : state.editTool === 'convert' ? 'Block konvertieren' : state.editTool === 'remove' ? 'Block entfernen' : 'Pipette' }} · Shift+Ziehen = Pinsel · Ziehen = Karte bewegen
      </div>
      <div v-else class="hud-block text-muted">
        Maus über einen Block bewegen für ATM 11 Block-Inspektor (ab Zoom 4x mit echten Block-Texturen!)
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewer-2d-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 640px;
  flex: 1;
  background: #0b0c10;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
}

.blueprint-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.blueprint-canvas.edit-cursor {
  cursor: crosshair;
}

.blueprint-canvas:active {
  cursor: grabbing;
}

.canvas-toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  z-index: 10;
  pointer-events: none;
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid var(--border-subtle);
  padding: 0.35rem 0.55rem;
  border-radius: 5px;
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: var(--text-white);
  padding: 0 0.4rem;
  cursor: pointer;
}

.mini-slider {
  width: 75px;
  accent-color: var(--accent);
}

.canvas-hud {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  background: rgba(15, 16, 20, 0.92);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.5rem 0.85rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.76rem;
  pointer-events: none;
}

.hud-coords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.hud-block {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hud-tex-icon {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  image-rendering: pixelated;
}

.hud-swatch {
  width: 15px;
  height: 15px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
</style>
