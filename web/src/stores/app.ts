import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const THEME_KEY = 'dybee-theme';
const SIDEBAR_KEY = 'dybee-sidebar-collapsed';

export type ThemeMode = 'light' | 'dark';

export const useAppStore = defineStore('app', () => {
  const storedTheme = (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'light';
  const theme = ref<ThemeMode>(storedTheme);
  const collapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1');

  function applyTheme(mode: ThemeMode) {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
  }
  applyTheme(theme.value);

  watch(
    theme,
    (v) => {
      localStorage.setItem(THEME_KEY, v);
      applyTheme(v);
    },
    { immediate: false },
  );

  watch(collapsed, (v) => localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0'));

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }
  function toggleSidebar() {
    collapsed.value = !collapsed.value;
  }

  return { theme, collapsed, toggleTheme, toggleSidebar };
});
