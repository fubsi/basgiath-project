import { createRouter, createWebHistory } from 'vue-router';
import VisualizerView from '../views/VisualizerView.vue';
import OverviewView from '../views/OverviewView.vue';
import PaletteView from '../views/PaletteView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'visualizer',
      component: VisualizerView
    },
    {
      path: '/overview',
      name: 'overview',
      component: OverviewView
    },
    {
      path: '/palette',
      name: 'palette',
      component: PaletteView
    }
  ]
});

export default router;
