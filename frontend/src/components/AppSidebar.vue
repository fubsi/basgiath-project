<script setup>
import { useLayerStore } from '../composables/useLayerStore';

const { state } = useLayerStore();
</script>

<template>
  <aside class="sidebar">
    <div class="logo-box" title="Basgiath War College // ATM 11">
      <span class="logo-title">BWC</span>
      <span class="logo-sub">ATM11</span>
    </div>

    <div class="sidebar-divider"></div>

    <div class="y-indicator" title="Aktuelle Bau-Ebene (Y-Level)">
      <span class="y-label">LAYER</span>
      <span class="y-val font-mono">Y={{ state.currentY }}</span>
    </div>

    <div class="sidebar-bottom">
      <div class="status-dot" title="layer.Y.json Stream aktiv"></div>
      <span class="vertical-tag">FOURTH WING</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  background-color: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.2rem;
  z-index: 100;
}

.logo-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.logo-title {
  font-weight: 700;
  font-size: 1.35rem;
  letter-spacing: 2px;
  color: var(--accent);
}

.logo-sub {
  font-size: 0.62rem;
  letter-spacing: 3px;
  color: var(--text-muted);
  margin-top: 2px;
}

.sidebar-divider {
  display: none;
}

.y-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(229, 169, 60, 0.08);
  border: 1px solid var(--border-gold);
  padding: 0.25rem 0.55rem;
  border-radius: 4px;
}

.y-label {
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.y-val {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--accent);
}

.sidebar-bottom {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.vertical-tag {
  font-size: 0.68rem;
  letter-spacing: 0.2em;
  color: var(--text-muted);
}

@media (min-width: 768px) {
  .sidebar {
    width: 90px;
    height: 100vh;
    flex-direction: column;
    border-bottom: none;
    border-right: 1px solid var(--border-subtle);
    padding: 1.5rem 0;
  }

  .sidebar-divider {
    display: block;
    width: 36px;
    height: 1px;
    background: var(--border-subtle);
  }

  .sidebar-bottom {
    flex-direction: column;
    gap: 1.5rem;
  }

  .vertical-tag {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
  }
}
</style>
