<script setup>
import { useRouter } from 'vue-router';
import { useLayerStore } from '../composables/useLayerStore';

const router = useRouter();
const { setCurrentY } = useLayerStore();

function openLayerInVisualizer(y) {
  setCurrentY(y);
  router.push('/');
}

const scaleRows = [
  {
    name: 'Dragon Rotunda (Maßstabs-Anker)',
    size: 'Ø 111 Blöcke (Höhe: 85 Blöcke)',
    yRange: 'Y = 80 bis 165',
    jumpY: 88,
    desc: 'Beinhaltet das Battle-Brief-Amphitheater, die Kontinent-Reliefkarte & die 6 kolossalen farbigen Drachenstatuen (je 25–35 Blöcke hoch).'
  },
  {
    name: 'Riders Quadrant (Zitadelle Gesamt)',
    size: '420 × 460 Blöcke',
    yRange: 'Y = 75 bis 230',
    jumpY: 80,
    desc: 'Umfasst First-Years, Dorms, Gathering Hall, Academic Wing, die Nordburg und den 190 × 220 Blöcke großen Appellplatz.'
  },
  {
    name: 'Das Parapet & Die Schlucht',
    size: '210 Blöcke lang, 1–2 Blöcke breit',
    yRange: 'Y = -30 (Fluss) bis Y = 70 (Brücke)',
    jumpY: 70,
    desc: '100 Blöcke freier Fall über dem reißenden Gebirgsfluss; verbindet den Nordwest-Turm des Heiler-Quadranten mit dem Reiterquadranten.'
  },
  {
    name: 'Südlicher Hauptkomplex (Zitadelle)',
    size: '520 × 720 Blöcke',
    yRange: 'Y = 55 bis 185',
    jumpY: 56,
    desc: 'Infantry Quadrant (Süd), Healer Quadrant (NW), Bell Tower (NO) sowie das 460 Blöcke lange Administration Building inkl. Gen. Sorrengails Büro.'
  },
  {
    name: 'Scribe Quadrant (Underground)',
    size: '450 × 550 Blöcke (unterirdisch)',
    yRange: 'Y = -50 bis +45',
    jumpY: 10,
    desc: 'Halbkreisförmiges Hauptarchiv mit 7 strahlenförmigen Bücher-Katakomben, Create-Bücheraufzügen und Geheimgängen.'
  },
  {
    name: 'The Gauntlet & Flight Field',
    size: '450 × 550 Blöcke Plateau',
    yRange: 'Y = 130 bis 255',
    jumpY: 150,
    desc: 'Vertikaler Kletterparcours mit animierten Create-Rotoren und riesigem Drachen-Flugfeld im Nordosten.'
  }
];
</script>

<template>
  <section class="overview-page">
    <div class="hero-banner">
      <div>
        <p class="smol-text">MINECRAFT ALL THE MODS 11 // MEGA-BUILD MASTERPLAN</p>
        <h1 class="massive-text">
          BASGIATH <span class="fx-shine-sweep">WAR COLLEGE</span>
          <span class="fx-blink-caret text-accent">_</span>
        </h1>
        <p class="hero-lead">
          Maßstabsgetreue Planung (`1.800 × 2.500 Blöcke`) basierend auf der Originalkarte aus <em>Fourth Wing</em>.
          Jede Horizontalebene wird dynamisch über <code>layer.Y.json</code> geladen und in 2D, 3D sowie als ATM 11 Stückliste ausgewertet.
        </p>
      </div>

      <img src="/basgiath-map.jpg" alt="Basgiath Map" class="map-preview" />
    </div>

    <div class="section-header">
      <span class="decorative-line"></span>
      <h2>PROPORTIONALER MEGA-BUILD MASSSTAB & Y-LEVELS</h2>
    </div>

    <div class="scale-grid">
      <div v-for="row in scaleRows" :key="row.name" class="scale-card">
        <div class="card-top">
          <h3>{{ row.name }}</h3>
          <span class="badge font-mono">{{ row.size }}</span>
        </div>
        <div class="card-y font-mono text-blue">{{ row.yRange }}</div>
        <p class="card-desc">{{ row.desc }}</p>
        <button class="btn-tactical" @click="openLayerInVisualizer(row.jumpY)">
          Im 2D/3D Viewer öffnen (layer.{{ row.jumpY }}.json) →
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.overview-page {
  padding: 2rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.hero-banner {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 2rem;
  align-items: center;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  padding: 2rem;
  border-radius: 8px;
}

.hero-lead {
  color: var(--text-muted);
  max-width: 760px;
  line-height: 1.6;
  margin-top: 1rem;
}

.map-preview {
  width: 100%;
  border-radius: 6px;
  border: 1px solid var(--border-gold);
}

.scale-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.2rem;
}

.scale-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 1.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.card-top h3 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text-white);
}

.card-y {
  font-size: 0.8rem;
}

.card-desc {
  margin: 0;
  font-size: 0.86rem;
  color: var(--text-muted);
  line-height: 1.5;
  flex: 1;
}

@media (max-width: 960px) {
  .hero-banner {
    grid-template-columns: 1fr;
  }
}
</style>
