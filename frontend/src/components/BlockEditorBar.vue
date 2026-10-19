<script setup>
import { ref, computed, watch } from 'vue';
import { useLayerStore } from '../composables/useLayerStore';

const {
  state,
  paletteBlocksList,
  getBlockInfo,
  getBlockAt,
  isAdjacentCoordinate,
  mutateBlocks,
  applyEditAt,
  undoEdit,
  redoEdit,
  reloadLayer
} = useLayerStore();

const manualX = ref(0);
const manualY = ref(state.currentY);
const manualZ = ref(0);

// Keep manual coordinate inputs synced when user hovers a voxel
watch(
  () => state.hoveredVoxel,
  (hv) => {
    if (hv) {
      manualX.value = hv.x;
      manualY.value = hv.y;
      manualZ.value = hv.z;
    }
  }
);

watch(
  () => state.currentY,
  (y) => {
    if (!state.hoveredVoxel) {
      manualY.value = y;
    }
  }
);

const activeBlockInfo = computed(() => getBlockInfo(state.selectedBlockId));

const manualTargetBlockId = computed(() => {
  void state.layerRevision;
  return getBlockAt(manualX.value, manualY.value, manualZ.value);
});

const manualTargetAdjacent = computed(() => {
  void state.layerRevision;
  return isAdjacentCoordinate(manualX.value, manualY.value, manualZ.value);
});

async function handleManualAction(action) {
  const x = Math.round(Number(manualX.value));
  const y = Math.round(Number(manualY.value));
  const z = Math.round(Number(manualZ.value));
  if (action === 'remove') {
    await mutateBlocks([{ x, y, z, blockId: null }]);
  } else if (action === 'convert') {
    await mutateBlocks([{ x, y, z, blockId: state.selectedBlockId }]);
  } else if (action === 'add') {
    await applyEditAt(x, y, z, 'add');
  }
}

async function placeAtNeighbor(dx, dy, dz) {
  const tx = Math.round(Number(manualX.value)) + dx;
  const ty = Math.round(Number(manualY.value)) + dy;
  const tz = Math.round(Number(manualZ.value)) + dz;
  await mutateBlocks([{ x: tx, y: ty, z: tz, blockId: state.selectedBlockId }]);
  manualX.value = tx;
  manualY.value = ty;
  manualZ.value = tz;
}
</script>

<template>
  <div class="editor-bar">
    <!-- Row 1: Tool Selector + Undo/Redo + Live Sync Status -->
    <div class="editor-top-row">
      <div class="tool-group">
        <span class="editor-label font-mono">WERKZEUG:</span>
        <button
          class="tool-btn"
          :class="{ active: state.editTool === 'add' }"
          @click="state.editTool = 'add'"
          title="Platziert neuen Block an der anliegenden Koordinate (3D: angeklickte Blockseite | 2D: freies Nachbarfeld)"
        >
          ➕ Anliegend Hinzufügen
        </button>
        <button
          class="tool-btn"
          :class="{ active: state.editTool === 'convert' }"
          @click="state.editTool = 'convert'"
          title="Konvertiert den angeklickten Block direkt in den gewählten Ziel-Block"
        >
          🔄 Block Konvertieren
        </button>
        <button
          class="tool-btn tool-danger"
          :class="{ active: state.editTool === 'remove' }"
          @click="state.editTool = 'remove'"
          title="Entfernt den angeklickten Block direkt aus der layer.Y.json"
        >
          🗑️ Block Entfernen
        </button>
        <button
          class="tool-btn"
          :class="{ active: state.editTool === 'pick' }"
          @click="state.editTool = 'pick'"
          title="Pipette: Klicke auf einen Block, um seinen Typ als aktiven Block zu übernehmen"
        >
          💧 Pipette
        </button>
      </div>

      <div class="history-group font-mono">
        <label class="adj-toggle" title="In der 2D-Ansicht beim Hinzufügen nur anliegende Nachbar-Koordinaten erlauben">
          <input type="checkbox" v-model="state.enforceAdjacent2D" />
          <span>2D: Nur anliegende Koordinaten</span>
        </label>

        <button
          class="btn-tactical btn-sm"
          :disabled="state.undoStack.length === 0"
          @click="undoEdit"
          title="Letzte Änderung rückgängig machen (Strg+Z)"
        >
          ↩️ Undo ({{ state.undoStack.length }})
        </button>
        <button
          class="btn-tactical btn-sm"
          :disabled="state.redoStack.length === 0"
          @click="redoEdit"
          title="Wiederherstellen (Strg+Y)"
        >
          ↪️ Redo ({{ state.redoStack.length }})
        </button>
        <button
          class="btn-tactical btn-sm"
          @click="reloadLayer(state.currentY)"
          title="Aktuelle layer.Y.json frisch vom Server neu laden"
        >
          🔄 Layer Y={{ state.currentY }} Reload
        </button>

        <div class="sync-pill" :class="{ online: state.sseConnected, saving: state.isSavingEdit }">
          <span class="sync-dot"></span>
          <span v-if="state.isSavingEdit">Schreibe layer.Y.json...</span>
          <span v-else-if="state.sseConnected">
            Live-Sync Aktiv
            <template v-if="state.lastSyncEvent">
              ({{ state.lastSyncEvent.source === 'remote' ? 'Externer Sync' : 'Gespeichert' }}: Y={{ state.lastSyncEvent.layers.join(',') }})
            </template>
          </span>
          <span v-else>Verbinde Sync...</span>
        </div>
      </div>
    </div>

    <!-- Row 2: Active Block Palette Strip + Coordinate Quick-Editor -->
    <div class="editor-bottom-row">
      <!-- Active Block Preview -->
      <div class="active-block-card" v-if="activeBlockInfo">
        <img
          v-if="activeBlockInfo.texture"
          :src="activeBlockInfo.texture"
          class="active-block-tex"
          alt=""
        />
        <span
          v-else
          class="active-block-swatch"
          :style="{ backgroundColor: activeBlockInfo.color }"
        ></span>
        <div class="active-block-meta">
          <div class="active-block-title">
            <span class="badge">#{{ state.selectedBlockId }}</span>
            <strong>{{ activeBlockInfo.name }}</strong>
          </div>
          <div class="active-block-sub font-mono">
            {{ activeBlockInfo.id }} · {{ activeBlockInfo.mod }}
          </div>
        </div>
      </div>

      <!-- Horizontal Visual Block Palette -->
      <div class="palette-strip">
        <button
          v-for="b in paletteBlocksList"
          :key="b.paletteId"
          class="palette-chip"
          :class="{ selected: state.selectedBlockId === b.paletteId }"
          @click="state.selectedBlockId = b.paletteId"
          :title="`#${b.paletteId} ${b.name} (${b.id})`"
        >
          <img v-if="b.texture" :src="b.texture" class="chip-tex" alt="" />
          <span v-else class="chip-color" :style="{ backgroundColor: b.color }"></span>
          <span class="chip-id font-mono">#{{ b.paletteId }}</span>
        </button>
      </div>

      <!-- Direct Coordinate & Adjacent Block Control -->
      <div class="coord-editor font-mono">
        <span class="coord-label">KOORD:</span>
        <label class="coord-in">
          X <input type="number" v-model.number="manualX" />
        </label>
        <label class="coord-in">
          Y <input type="number" min="-30" max="156" v-model.number="manualY" />
        </label>
        <label class="coord-in">
          Z <input type="number" v-model.number="manualZ" />
        </label>

        <button
          v-if="manualTargetBlockId !== null"
          class="btn-tactical btn-sm"
          @click="handleManualAction('convert')"
          title="Block an dieser Koordinate in den gewählten Block konvertieren"
        >
          🔄 Konvertieren
        </button>
        <button
          v-if="manualTargetBlockId !== null"
          class="btn-tactical btn-sm btn-danger-outline"
          @click="handleManualAction('remove')"
          title="Block an dieser Koordinate entfernen"
        >
          🗑️ Entfernen
        </button>
        <button
          v-if="manualTargetBlockId === null"
          class="btn-tactical btn-sm"
          :disabled="state.enforceAdjacent2D && !manualTargetAdjacent"
          @click="handleManualAction('add')"
          title="Neuen Block an dieser Koordinate einfügen"
        >
          ➕ Setzen
        </button>

        <!-- Quick Adjacent Neighbor Placement Buttons (+X/-X/+Y/-Y/+Z/-Z) -->
        <div class="neighbor-btns" title="Neuen Block direkt an anliegender Nachbar-Koordinate hinzufügen">
          <span class="coord-label">ANLIEGEND+:</span>
          <button class="nb-btn" @click="placeAtNeighbor(-1, 0, 0)">-X</button>
          <button class="nb-btn" @click="placeAtNeighbor(1, 0, 0)">+X</button>
          <button class="nb-btn" @click="placeAtNeighbor(0, -1, 0)">-Y</button>
          <button class="nb-btn" @click="placeAtNeighbor(0, 1, 0)">+Y</button>
          <button class="nb-btn" @click="placeAtNeighbor(0, 0, -1)">-Z</button>
          <button class="nb-btn" @click="placeAtNeighbor(0, 0, 1)">+Z</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-bar {
  background: linear-gradient(180deg, rgba(24, 27, 36, 0.96) 0%, rgba(15, 17, 23, 0.98) 100%);
  border: 1px solid var(--border-gold);
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
}

.editor-top-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tool-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.editor-label {
  font-size: 0.72rem;
  color: var(--accent);
  font-weight: 700;
  margin-right: 0.25rem;
}

.tool-btn {
  background: rgba(15, 16, 20, 0.9);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.36rem 0.7rem;
  border-radius: 4px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s ease;
}

.tool-btn:hover {
  color: var(--text-white);
  border-color: var(--accent);
}

.tool-btn.active {
  background: rgba(229, 169, 60, 0.22);
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 10px rgba(229, 169, 60, 0.25);
}

.tool-btn.tool-danger.active {
  background: rgba(239, 68, 68, 0.22);
  color: #f87171;
  border-color: #ef4444;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
}

.history-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.adj-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  cursor: pointer;
  margin-right: 0.25rem;
}

.btn-sm {
  padding: 0.28rem 0.55rem;
  font-size: 0.72rem;
}

.btn-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger-outline {
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
}

.sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.sync-pill.online {
  border-color: rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.sync-pill.saving {
  border-color: var(--accent);
  color: var(--accent);
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6b7280;
}

.sync-pill.online .sync-dot {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.sync-pill.saving .sync-dot {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

.editor-bottom-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.active-block-card {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  background: rgba(11, 12, 16, 0.85);
  border: 1px solid var(--border-gold);
  border-radius: 5px;
  padding: 0.32rem 0.65rem;
  min-width: 220px;
}

.active-block-tex {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.active-block-swatch {
  width: 26px;
  height: 26px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.active-block-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--text-white);
}

.active-block-sub {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.palette-strip {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  overflow-x: auto;
  flex: 1;
  min-width: 260px;
  padding: 0.2rem 0.1rem;
}

.palette-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: rgba(15, 16, 20, 0.9);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 3px 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;
}

.palette-chip:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.palette-chip.selected {
  background: rgba(229, 169, 60, 0.24);
  border-color: var(--accent);
  box-shadow: 0 0 8px rgba(229, 169, 60, 0.35);
}

.chip-tex,
.chip-color {
  width: 20px;
  height: 20px;
  image-rendering: pixelated;
  border-radius: 2px;
}

.chip-id {
  font-size: 0.58rem;
  color: var(--text-muted);
}

.palette-chip.selected .chip-id {
  color: var(--accent);
  font-weight: 700;
}

.coord-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  background: rgba(11, 12, 16, 0.82);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.3rem 0.55rem;
  font-size: 0.72rem;
}

.coord-label {
  color: var(--text-muted);
  font-size: 0.66rem;
}

.coord-in {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--accent);
}

.coord-in input {
  width: 54px;
  background: #0b0c10;
  border: 1px solid var(--border-subtle);
  color: var(--text-white);
  border-radius: 3px;
  padding: 0.18rem 0.3rem;
  font-family: inherit;
  font-size: 0.72rem;
}

.neighbor-btns {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: 0.2rem;
  padding-left: 0.35rem;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.nb-btn {
  background: rgba(30, 34, 45, 0.9);
  border: 1px solid var(--border-subtle);
  color: var(--text-white);
  border-radius: 3px;
  padding: 0.16rem 0.35rem;
  font-family: inherit;
  font-size: 0.66rem;
  cursor: pointer;
}

.nb-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
