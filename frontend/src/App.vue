<script setup>
import './assets/agency.css';
import './assets/objects.css';
import AppSidebar from './components/AppSidebar.vue';
import AppNav from './components/AppNav.vue';
</script>

<template>
  <div class="bg-grid">
    <div class="line"></div>
    <div class="line"></div>
    <div class="line"></div>
    <div class="line"></div>
    <div class="line"></div>
  </div>

  <AppSidebar />

  <main class="main-content">
    <AppNav />

    <router-view v-slot="{ Component }">
      <transition name="page-slide" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
</template>

<style scoped>
/* Layout-CSS exakt nach dem Schema von fubsi-site */
.main-content {
  margin-left: 0;
  padding-top: 60px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .main-content {
    margin-left: 90px;
    padding-top: 0;
  }
}

/* PAGE TRANSITIONS (Fade & Slide wie in fubsi-site) */
.page-slide-enter-active,
.page-slide-leave-active {
  transition: all 0.45s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.page-slide-enter-from,
.page-slide-leave-to {
  opacity: 0;
  transform: translateX(80px);
}
</style>
