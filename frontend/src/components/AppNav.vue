<script setup>
import { useLayerStore } from '../composables/useLayerStore';

const { state } = useLayerStore();
</script>

<template>
  <header class="app-nav">
    <div class="nav-brand">
      <span class="decorative-line"></span>
      <span class="brand-text">BASGIATH WAR COLLEGE // <strong class="text-accent">BLUEPRINT SYSTEM</strong></span>
    </div>

    <nav class="nav-links">
      <router-link to="/" class="nav-item" active-class="active">
        01 // 2D & 3D VISUALIZER
      </router-link>
      <router-link to="/overview" class="nav-item" active-class="active">
        02 // MASTERPLAN & ZONEN
      </router-link>
      <router-link to="/palette" class="nav-item" active-class="active">
        03 // ATM 11 PALETTE & DRACHEN
      </router-link>
    </nav>

    <div class="nav-stats font-mono" v-if="state.manifest">
      <span class="badge">{{ state.manifest.totalLayers }} layer.Y.json</span>
      <span class="badge badge-blue">{{ state.manifest.totalBlocksAllLayers.toLocaleString('de-DE') }} Blöcke</span>
    </div>
  </header>
</template>

<style scoped>
.app-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(15, 16, 20, 0.88);
  backdrop-filter: blur(8px);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 1.4rem;
}

.nav-item {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 0.35rem 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.nav-item:hover {
  color: var(--text-white);
}

.nav-item.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.nav-stats {
  display: flex;
  gap: 0.5rem;
}
</style>
