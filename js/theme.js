// Тема оформления: 'system' (по умолчанию), 'light', 'dark'.
// Атрибут data-theme ставится на корневой контейнер (не на html) — для встраивания в Dynamics 365.
// Только если страница сама объявила себя хостом (<html data-cqa-standalone>, как index.html),
// тема переносится и на страницу: цвет фона и полос прокрутки без белых краёв.
import { h, icon } from './ui.js';

const KEY = 'cqa.theme';
let root = null;
let media = null;
let current = null;
const toggles = new Set();

export function getThemePref() {
  try { return window.localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function setThemePref(value) {
  try { window.localStorage.setItem(KEY, value); } catch { /* без хранилища тема живёт до перезагрузки */ }
  current = value;
  apply();
}

function apply() {
  if (!root) return;
  const pref = current || getThemePref();
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const host = document.documentElement;
  if (host.hasAttribute('data-cqa-standalone')) {
    host.style.colorScheme = dark ? 'dark' : 'light';
    host.style.backgroundColor = getComputedStyle(root).backgroundColor;
  }
  toggles.forEach((t) => t.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему'));
}

export function initTheme(el) {
  root = el;
  current = getThemePref();
  media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  media?.addEventListener?.('change', apply);
  apply();
}

export const resolvedTheme = () => root?.dataset.theme || 'light';

/** Кнопка в шапке: солнце и луна переходят друг в друга (поворот + масштаб + прозрачность). */
export function themeToggle() {
  const btn = h('button', {
    type: 'button', class: 'cqa-btn cqa-btn--on-dark cqa-btn--icon cqa-btn--sm cqa-theme-toggle',
    onclick: () => setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark'),
  },
  h('span', { class: 'cqa-theme-toggle__sun' }, icon('sun', null, 18)),
  h('span', { class: 'cqa-theme-toggle__moon' }, icon('moon', null, 18)));
  btn.title = 'Светлая / тёмная тема';
  toggles.add(btn);
  apply();
  return btn;
}
