<script setup>
import { computed, onMounted } from 'vue';
import { useLayerStore } from '../composables/useLayerStore';

const { state, initStore } = useLayerStore();

onMounted(() => {
  initStore();
});

const groupedBlocks = computed(() => {
  if (!state.palette?.blocks) return {};
  const groups = {};
  const globalCounts = state.manifest?.globalMaterials || {};
  for (const [numId, b] of Object.entries(state.palette.blocks)) {
    const cat = b.category || 'Sonstige';
    if (!groups[cat]) groups[cat] = [];
    const totalCount = globalCounts[numId] || 0;
    groups[cat].push({
      numId,
      ...b,
      totalCount,
      stacks: Math.ceil(totalCount / 64)
    });
  }
  return groups;
});
</script>

<template>
  <section class="palette-page">
    <div class="section-header">
      <span class="decorative-line"></span>
      <h2>ALL THE MODS 11 // ECHTE TEXTUREN & DRACHENFARBEN</h2>
    </div>

    <p class="palette-intro">
      Direkt aus deiner lokalen Instanz (<code>S:\CurseForge\Instances\All the Mods 11 - ATM11</code>) extrahierte Original-Texturen
      aus <em>Ice and Fire</em>, <em>Chisel</em>, <em>Forbidden &amp; Arcanus</em>, <em>Regions Unexplored</em> und <em>Vanilla 26.1.2</em>.
    </p>

    <div v-for="(blocks, category) in groupedBlocks" :key="category" class="category-block">
      <h3 class="cat-title text-accent">{{ category }}</h3>
      <div class="block-grid">
        <div v-for="b in blocks" :key="b.numId" class="block-card">
          <div
            class="swatch-large"
            :style="{
              backgroundImage: b.texture ? `url(${b.texture})` : 'none',
              backgroundColor: b.color
            }"
          >
            <span class="num-id font-mono">#{{ b.numId }}</span>
          </div>
          <div class="block-meta">
            <div class="block-top">
              <strong>{{ b.name }}</strong>
              <span class="badge">{{ b.mod }}</span>
            </div>
            <code class="block-id font-mono">{{ b.id }}</code>
            <div class="block-totals font-mono">
              <span>Gesamt im Modell: <strong>{{ b.totalCount.toLocaleString('de-DE') }}</strong> Blöcke</span>
              <span class="text-accent">{{ b.stacks.toLocaleString('de-DE') }} Stacks</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.palette-page {
  padding: 2rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.palette-intro {
  color: var(--text-muted);
  max-width: 860px;
}

.category-block {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.cat-title {
  margin: 0.5rem 0 0;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.block-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 0.9rem;
}

.block-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.9rem;
  display: flex;
  gap: 0.9rem;
  align-items: center;
}

.swatch-large {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background-size: cover;
  image-rendering: pixelated;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 4px;
  flex-shrink: 0;
}

.num-id {
  font-size: 0.65rem;
  background: rgba(0, 0, 0, 0.72);
  padding: 1px 4px;
  border-radius: 3px;
  color: #fff;
}

.block-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.block-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
}

.block-id {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.block-totals {
  display: flex;
  justify-content: space-between;
  font-size: 0.74rem;
  margin-top: 0.2rem;
  color: var(--text-muted);
}
</style>
