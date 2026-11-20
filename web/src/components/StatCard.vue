<template>
  <div class="stat-card" :class="`tone-${tone}`">
    <div class="stat-icon">
      <el-icon :size="22"><component :is="icon" /></el-icon>
    </div>
    <div class="stat-body">
      <div class="stat-label">{{ label }}</div>
      <div class="stat-value">
        <span>{{ value }}</span>
        <span v-if="suffix" class="stat-suffix">{{ suffix }}</span>
      </div>
      <div v-if="hint" class="stat-hint">{{ hint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    icon?: string;
    suffix?: string;
    hint?: string;
    tone?: 'brand' | 'green' | 'amber' | 'rose' | 'sky';
  }>(),
  { icon: 'DataLine', suffix: '', hint: '', tone: 'brand' },
);
</script>

<style scoped>
.stat-card {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.stat-card::after {
  content: '';
  position: absolute;
  inset: 0 0 auto auto;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  transform: translate(40%, -55%);
  opacity: 0.16;
  background: var(--tone-color);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--tone-color);
  background: color-mix(in srgb, var(--tone-color) 14%, transparent);
}
.stat-body {
  min-width: 0;
}
.stat-label {
  font-size: 12.5px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.stat-value {
  font-size: 25px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--text-1);
  line-height: 1.15;
}
.stat-suffix {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-3);
  margin-left: 4px;
}
.stat-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}

.tone-brand {
  --tone-color: #6366f1;
}
.tone-green {
  --tone-color: #10b981;
}
.tone-amber {
  --tone-color: #f59e0b;
}
.tone-rose {
  --tone-color: #f43f5e;
}
.tone-sky {
  --tone-color: #0ea5e9;
}
</style>
