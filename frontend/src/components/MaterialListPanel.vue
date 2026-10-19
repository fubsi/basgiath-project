<script setup>
import { ref } from 'vue';
import { useLayerStore } from '../composables/useLayerStore';

const {
  state,
  availableMods,
  computedMaterialList,
  totalScopeBlocks,
  toggleMaterialChecked
} = useLayerStore();

const copied = ref(false);

function copyMaterialList() {
  const scopeTitle =
    state.materialScope === 'layer'
      ? `Layer Y=${state.currentY}`
      : state.materialScope === 'cutaway'
        ? `Bereich Y=${state.cutawayMinY} bis Y=${state.cutawayMaxY}`
        : 'Gesamtes Projekt';

  const lines = [
    `=== BASGIATH WAR COLLEGE (ATM 11) - MATERIALLISTE (${scopeTitle}) ===`,
    `Gesamtblöcke: ${totalScopeBlocks.value.toLocaleString('de-DE')} (${Math.ceil(totalScopeBlocks.value / 64)} Stacks / ${(totalScopeBlocks.value / 1728).toFixed(1)} Shulker-Boxen)`,
    '----------------------------------------------------------------------',
    ...computedMaterialList.value.map(
      (m) =>
        `[${m.checked ? 'x' : ' '}] ${m.name} (${m.id}) [${m.mod}]: ${m.count.toLocaleString('de-DE')} Blöcke (${m.stacks} Stacks + ${m.remainder} | ${m.shulkers} SB)`
    )
  ];

  navigator.clipboard.writeText(lines.join('\n'));
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <aside class="material-panel">
    <div class="panel-header">
      <div class="header-title-row">
        <div class="section-header">
          <span class="decorative-line"></span>
          <h2>ATM 11 MATERIALLISTE</h2>
        </div>
        <button class="btn-tactical btn-copy" @click="copyMaterialList" title="Materialliste in Zwischenablage kopieren">
          {{ copied ? '✓ KOPIERT' : '📋 EXPORT' }}
        </button>
      </div>

      <!-- Scope Switcher -->
      <div class="scope-tabs">
        <button
          class="scope-tab"
          :class="{ active: state.materialScope === 'layer' }"
          @click="state.materialScope = 'layer'"
        >
          Layer Y={{ state.currentY }}
        </button>
        <button
          class="scope-tab"
          :class="{ active: state.materialScope === 'cutaway' }"
          @click="state.materialScope = 'cutaway'"
        >
          3D-Schnitt ({{ state.cutawayMinY }}..{{ state.cutawayMaxY }})
        </button>
        <button
          class="scope-tab"
          :class="{ active: state.materialScope === 'global' }"
          @click="state.materialScope = 'global'"
        >
          Gesamtprojekt
        </button>
      </div>

      <!-- Summary KPIs -->
      <div class="kpi-row font-mono">
        <div class="kpi-box">
          <span class="kpi-label">BLÖCKE</span>
          <span class="kpi-val text-white">{{ totalScopeBlocks.toLocaleString('de-DE') }}</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">STACKS (64)</span>
          <span class="kpi-val text-accent">{{ Math.ceil(totalScopeBlocks / 64).toLocaleString('de-DE') }}</span>
        </div>
        <div class="kpi-box">
          <span class="kpi-label">SHULKER (27S)</span>
          <span class="kpi-val text-blue">{{ (totalScopeBlocks / 1728).toFixed(1) }}</span>
        </div>
      </div>

      <!-- Search & Mod Filter -->
      <div class="filter-row">
        <input
          v-model="state.materialSearch"
          type="text"
          class="search-input"
          placeholder="Block, ID oder Drachenfarbe suchen..."
        />
        <select v-model="state.materialModFilter" class="mod-select">
          <option v-for="mod in availableMods" :key="mod" :value="mod">
            {{ mod === 'ALL' ? 'Alle Mods' : mod }}
          </option>
        </select>
      </div>
    </div>

    <!-- Scrollable Block List with Real ATM11 Block Textures -->
    <div class="material-list">
      <div
        v-for="item in computedMaterialList"
        :key="item.id"
        class="material-item"
        :class="{
          'is-checked': item.checked,
          'is-selected-brush': state.editMode && Number(state.selectedBlockId) === Number(item.paletteId)
        }"
        @click="state.editMode ? (state.selectedBlockId = Number(item.paletteId)) : toggleMaterialChecked(item.id)"
      >
        <div class="item-top">
          <input
            type="checkbox"
            :checked="item.checked"
            class="item-check"
            @click.stop="toggleMaterialChecked(item.id)"
          />
          <img
            v-if="item.texture"
            :src="item.texture"
            :alt="item.name"
            class="block-tex-icon"
          />
          <span
            v-else
            class="color-swatch"
            :style="{ backgroundColor: item.color }"
          ></span>
          <div class="item-info">
            <div class="item-name">#{{ item.paletteId }} {{ item.name }}</div>
            <div class="item-tech font-mono">{{ item.id }}</div>
          </div>
          <span class="badge mod-tag">{{ item.mod }}</span>
        </div>

        <div class="item-stats font-mono">
          <span class="stat-blocks">
            <strong>{{ item.count.toLocaleString('de-DE') }}</strong> Blöcke
          </span>
          <span class="stat-stacks text-accent">
            {{ item.stacks }} Stk <template v-if="item.remainder > 0">+ {{ item.remainder }}</template>
          </span>
          <span class="stat-shulker text-blue">{{ item.shulkers }} SB</span>
        </div>

        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{
              width: Math.max(3, Math.min(100, (item.count / Math.max(1, totalScopeBlocks)) * 100)) + '%',
              backgroundColor: item.color
            }"
          ></div>
        </div>
      </div>

      <div v-if="computedMaterialList.length === 0" class="empty-state">
        Keine Blöcke für diesen Filter auf Ebene Y={{ state.currentY }} gefunden.
      </div>
    </div>
  </aside>
</template>

<style scoped>
.material-panel {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 580px;
  max-height: calc(100vh - 150px);
  overflow: hidden;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.header-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-copy {
  padding: 0.28rem 0.65rem;
  font-size: 0.72rem;
}

.scope-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
  background: #0f1014;
  padding: 0.25rem;
  border-radius: 5px;
  border: 1px solid var(--border-subtle);
}

.scope-tab {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.4rem 0.3rem;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.scope-tab:hover {
  color: var(--text-white);
}

.scope-tab.active {
  background: rgba(229, 169, 60, 0.18);
  color: var(--accent);
  border: 1px solid var(--border-gold);
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.45rem;
}

.kpi-box {
  background: rgba(15, 16, 20, 0.7);
  border: 1px solid var(--border-subtle);
  padding: 0.45rem 0.55rem;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
}

.kpi-label {
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.kpi-val {
  font-size: 0.92rem;
  font-weight: 700;
  margin-top: 2px;
}

.filter-row {
  display: flex;
  gap: 0.45rem;
}

.search-input {
  flex: 1;
  background: #0f1014;
  border: 1px solid var(--border-subtle);
  color: var(--text-white);
  padding: 0.45rem 0.65rem;
  border-radius: 4px;
  font-size: 0.78rem;
  font-family: 'Space Grotesk', sans-serif;
}

.search-input:focus,
.mod-select:focus {
  outline: none;
  border-color: var(--accent);
}

.mod-select {
  background: #0f1014;
  border: 1px solid var(--border-subtle);
  color: var(--text-white);
  padding: 0.45rem 0.5rem;
  border-radius: 4px;
  font-size: 0.76rem;
  font-family: 'Space Grotesk', sans-serif;
}

.material-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.material-item {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.material-item:hover {
  border-color: var(--border-gold);
  background: var(--bg-panel-hover);
}

.material-item.is-selected-brush {
  border-color: var(--accent);
  background: rgba(229, 169, 60, 0.14);
  box-shadow: 0 0 10px rgba(229, 169, 60, 0.22);
}

.material-item.is-checked {
  opacity: 0.48;
  border-color: rgba(34, 197, 94, 0.35);
}

.material-item.is-checked .item-name {
  text-decoration: line-through;
}

.item-top {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.item-check {
  accent-color: var(--accent);
  cursor: pointer;
}

.block-tex-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  image-rendering: pixelated;
  flex-shrink: 0;
  background: #0f1014;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-white);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-tech {
  font-size: 0.68rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mod-tag {
  font-size: 0.64rem;
  padding: 0.12rem 0.4rem;
  flex-shrink: 0;
}

.item-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.74rem;
  margin-top: 0.45rem;
  padding-top: 0.35rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.06);
}

.progress-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  margin-top: 0.4rem;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
}

.empty-state {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.82rem;
  padding: 2rem 1rem;
}
</style>
