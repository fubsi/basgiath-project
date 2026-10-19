<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useLayerStore } from '../composables/useLayerStore';
import Viewer2DCanvas from '../components/Viewer2DCanvas.vue';
import Viewer3DVoxel from '../components/Viewer3DVoxel.vue';
import MaterialListPanel from '../components/MaterialListPanel.vue';
import BlockEditorBar from '../components/BlockEditorBar.vue';

const {
  state,
  initStore,
  availableYLevels,
  setCurrentY,
  stepY,
  currentLayerData,
  undoEdit,
  redoEdit
} = useLayerStore();

// Default to full '3d' view so it occupies 100% of the viewport area (user can switch to '2d' or 'split' anytime)
const viewMode = ref('3d');

const quickBookmarks = [
  { y: -30, label: 'Y=-30 Schlucht-Fluss' },
  { y: 0, label: 'Y=0 Wardstone-Obelisk' },
  { y: 10, label: 'Y=10 Scribe Archiv' },
  { y: 16, label: 'Y=16 West-Tal (Dreschen)' },
  { y: 55, label: 'Y=55 Süd-Campus' },
  { y: 70, label: 'Y=70 Das Parapet' },
  { y: 80, label: 'Y=80 Rotunda & Reiter-EG' },
  { y: 88, label: 'Y=88 Drachenstatuen & Ränge' },
  { y: 98, label: 'Y=98 Drachen-Schwingen' },
  { y: 118, label: 'Y=118 Rotunda Kuppel' },
  { y: 140, label: 'Y=140 Violet & Xadens Baum' },
  { y: 150, label: 'Y=150 Gauntlet & Flight Field' }
];

function onGlobalKeyDown(e) {
  if (!state.editMode) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redoEdit();
    } else {
      undoEdit();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redoEdit();
  }
}

onMounted(() => {
  initStore();
  window.addEventListener('keydown', onGlobalKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeyDown);
});
</script>

<template>
  <section class="visualizer-page">
    <!-- Top Control Deck: View Mode + Edit Mode Toggle + Layer.Y.json Navigator -->
    <div class="control-deck">
      <div class="deck-left">
        <div class="mode-switch">
          <button
            class="btn-tactical"
            :class="{ active: viewMode === '3d' }"
            @click="viewMode = '3d'"
          >
            🧊 3D VOXEL VIEW (VOLLBILD)
          </button>
          <button
            class="btn-tactical"
            :class="{ active: viewMode === '2d' }"
            @click="viewMode = '2d'"
          >
            🗺️ 2D BLUEPRINT (VOLLBILD)
          </button>
          <button
            class="btn-tactical"
            :class="{ active: viewMode === 'split' }"
            @click="viewMode = 'split'"
          >
            ⚡ 2D + 3D SPLIT
          </button>
        </div>

        <!-- Edit Mode Toggle Button -->
        <button
          class="btn-tactical btn-edit-toggle"
          :class="{ active: state.editMode }"
          @click="state.editMode = !state.editMode"
          title="Interaktiven Block-Editor aktivieren: Blöcke direkt in 2D/3D hinzufügen, konvertieren oder entfernen (speichert live in layer.Y.json)"
        >
          {{ state.editMode ? '🛠️ EDITIER-MODUS AKTIV' : '✏️ EDITIER-MODUS STARTEN' }}
        </button>

        <div class="layer-info-box" v-if="currentLayerData">
          <span class="badge">layer.{{ state.currentY }}.json</span>
          <strong class="layer-title">{{ currentLayerData.label }}</strong>
          <span class="text-muted layer-desc">— {{ currentLayerData.description }}</span>
        </div>
      </div>

      <!-- Y-Level Stepper & Slider + Live Sync Indicator -->
      <div class="deck-right font-mono">
        <span
          class="live-sync-badge"
          :class="{ connected: state.sseConnected }"
          title="Sessionübergreifender Echtzeit-Sync für alle layer.Y.json Dateien"
        >
          <span class="dot"></span>
          {{ state.sseConnected ? 'LIVE-SYNC' : 'OFFLINE' }}
        </span>
        <button class="btn-tactical" @click="stepY(-1)" title="Eine Ebene tiefer">▼ Y-</button>
        <select
          class="y-select font-mono"
          :value="state.currentY"
          @change="setCurrentY(Number($event.target.value))"
        >
          <option v-for="y in availableYLevels" :key="y" :value="y">
            layer.{{ y }}.json (Y={{ y }})
          </option>
        </select>
        <button class="btn-tactical" @click="stepY(1)" title="Eine Ebene höher">▲ Y+</button>
      </div>
    </div>

    <!-- Collapsible Interactive Block Editor Bar -->
    <BlockEditorBar v-if="state.editMode" />

    <!-- Quick Y-Level Bookmark Bar -->
    <div class="bookmark-bar">
      <span class="smol-text">SCHNELLWAHL EBENE:</span>
      <button
        v-for="bm in quickBookmarks"
        :key="bm.y"
        class="bookmark-chip font-mono"
        :class="{ active: state.currentY === bm.y }"
        @click="setCurrentY(bm.y)"
      >
        {{ bm.label }}
      </button>
    </div>

    <!-- Main Workspace Grid: 2D/3D Viewers on Left (100% available space) + Material List Panel on Right -->
    <div class="workspace-grid">
      <div class="viewports-area" :class="`mode-${viewMode}`">
        <div v-if="viewMode === '2d' || viewMode === 'split'" class="viewport-cell">
          <Viewer2DCanvas />
        </div>
        <div v-if="viewMode === '3d' || viewMode === 'split'" class="viewport-cell">
          <Viewer3DVoxel />
        </div>
      </div>

      <!-- Always-visible ATM 11 Material List alongside the 2D & 3D Views -->
      <div class="material-sidebar-area">
        <MaterialListPanel />
      </div>
    </div>
  </section>
</template>

<style scoped>
.visualizer-page {
  padding: 0.9rem 1.4rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1;
  width: 100%;
  min-height: calc(100vh - 62px);
}

.control-deck {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.65rem 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
}

.deck-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}

.mode-switch {
  display: flex;
  gap: 0.4rem;
}

.btn-edit-toggle {
  border-color: var(--border-gold);
  color: var(--accent);
  font-weight: 700;
}

.btn-edit-toggle.active {
  background: rgba(229, 169, 60, 0.25);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 0 14px rgba(229, 169, 60, 0.35);
}

.layer-info-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.85rem;
}

.layer-title {
  color: var(--text-white);
}

.layer-desc {
  font-size: 0.78rem;
}

.deck-right {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.live-sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.68rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.live-sync-badge.connected {
  border-color: rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.live-sync-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6b7280;
}

.live-sync-badge.connected .dot {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.y-select {
  background: #0f1014;
  border: 1px solid var(--border-gold);
  color: var(--accent);
  padding: 0.42rem 0.75rem;
  border-radius: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.bookmark-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0;
}

.bookmark-chip {
  background: rgba(25, 28, 36, 0.85);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.26rem 0.6rem;
  border-radius: 4px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.bookmark-chip:hover {
  color: var(--text-white);
  border-color: var(--accent);
}

.bookmark-chip.active {
  background: rgba(229, 169, 60, 0.16);
  color: var(--accent);
  border-color: var(--accent);
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 1rem;
  flex: 1;
  width: 100%;
  height: calc(100vh - 190px);
  min-height: 640px;
}

.viewports-area {
  display: grid;
  gap: 1rem;
  width: 100%;
  height: 100%;
  min-width: 0;
}

.viewports-area.mode-2d,
.viewports-area.mode-3d {
  grid-template-columns: minmax(0, 1fr);
}

.viewports-area.mode-split {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.viewport-cell {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
}

.material-sidebar-area {
  height: 100%;
  min-height: 0;
}

@media (max-width: 1280px) {
  .workspace-grid {
    grid-template-columns: 1fr;
    height: auto;
  }

  .viewports-area.mode-split {
    grid-template-columns: 1fr;
  }
}
</style>
