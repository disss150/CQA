// Точка входа: каркас, строка контекста, hash-роутер, горячие клавиши. Всё рисуется внутри #cqa-root.
import { CONFIG } from './config.js';
import { store } from './store.js';
import { h, icon, button, setRoot, skeleton, errorState, dialogs } from './ui.js';
import { isDirty, onDraftChange } from './checklist-draft.js';
import { getConversations } from './api.js';
import { initTheme, themeToggle } from './theme.js';
import { initMotion, resetCountUps, reducedMotion } from './motion.js';
import { initFavicon } from './favicon.js';
import { createLogo } from './components/logo.js';
import { initFx, burst, prepareSpots } from './fx.js';
import { initTour, closeTour, tourOpen } from './tour.js';
import * as list from './screens/list.js';
import * as checklist from './screens/checklist.js';
import * as evaluate from './screens/evaluate.js';
import * as conversation from './screens/conversation.js';
import * as appeals from './screens/appeals.js';
import * as review from './screens/review.js';
import * as settings from './screens/settings.js';

// #/control — старый адрес шагов «Применить изменения»: теперь это конец экрана «Чек-лист»
const ROUTES = { list, checklist, evaluate, conversation, appeals, review, control: checklist, settings };
// Пять разделов — одинаково в шапке и в нижней панели на телефоне
const NAV = [
  ['list', 'Диалоги', 'messages'],
  ['evaluate', 'Оценка', 'zap'],
  ['appeals', 'Апелляции', 'flag'],
  ['checklist', 'Чек-лист', 'listChecks'],
  ['settings', 'Настройки', 'settings'],
];
// Какой пункт навигации подсвечивать для вложенных экранов
const NAV_OF = { conversation: 'list', review: 'appeals', control: 'checklist' };

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [name, ...rest] = path.split('/');
  return { name: ROUTES[name] ? name : 'list', param: rest.length ? decodeURIComponent(rest.join('/')) : null, query: new URLSearchParams(qs || '') };
}

export function mount(root) {
  const count = () => h('span', { class: 'cqa-nav__count', hidden: true, 'aria-label': 'открытых апелляций' });

  const nav = h('nav', { class: 'cqa-nav', id: 'cqa-nav', 'aria-label': 'Разделы' }, h('ul', { class: 'cqa-nav__list' },
    NAV.map(([key, label, ic]) => h('li', {}, h('a', { class: 'cqa-nav__link', href: `#/${key}`, 'data-key': key }, icon(ic, null, 16), label, key === 'appeals' ? count() : null)))));
  const tabbar = h('nav', { class: 'cqa-tabbar', 'aria-label': 'Разделы' },
    NAV.map(([key, label, ic]) => h('a', { class: 'cqa-tabbar__link', href: `#/${key}`, 'data-key': key },
      h('span', { class: 'cqa-tabbar__icon' }, icon(ic, null, 22), key === 'appeals' ? count() : null), h('span', {}, label))));

  // Строка контекста: по одной подписи на значение; на телефоне свёрнута в одну кнопку
  const contextItems = h('div', { class: 'cqa-context__items', id: 'cqa-context-items' });
  const contextToggle = h('button', { type: 'button', class: 'cqa-context__toggle', 'aria-expanded': 'false', 'aria-controls': 'cqa-context-items',
    onclick: () => setContextOpen(contextToggle.getAttribute('aria-expanded') !== 'true') });
  const setContextOpen = (open) => {
    contextToggle.setAttribute('aria-expanded', String(open));
    contextItems.classList.toggle('cqa-context__items--open', open);
  };
  const main = h('main', { class: 'cqa-main', id: 'cqa-main', tabindex: '-1' });
  const logo = createLogo();
  const favicon = initFavicon();

  // Шапка свёрнута: виден только кубик в левом верхнем углу. Нажатие на кубик раскрывает всё остальное —
  // название, переключатель темы, панель разделов и строку контекста; повторное нажатие сворачивает обратно.
  // Сам кубик не скрывается никогда. Кубик — кнопка рядом со ссылкой на главную (кнопку нельзя вкладывать в ссылку).
  const navWrap = h('div', { class: 'cqa-nav-wrap' }, h('div', { class: 'cqa-nav-wrap__inner' }, nav));
  const navToggle = h('button', { type: 'button', class: 'cqa-logo-btn', 'aria-controls': 'cqa-header-extra' }, logo.el);
  let chromeOpen = false;
  const syncChrome = () => {
    root.classList.toggle('cqa-chrome-closed', !chromeOpen);
    // Свёрнутые элементы не получают фокус и не читаются скринридером
    root.querySelectorAll('.cqa-brand__link, .cqa-header__tools, .cqa-nav-wrap, .cqa-context').forEach((el) => { el.inert = !chromeOpen; });
    const label = chromeOpen ? 'Свернуть шапку' : 'Развернуть шапку: название, разделы и настройки';
    navToggle.setAttribute('aria-expanded', String(chromeOpen));
    navToggle.setAttribute('aria-label', label);
    navToggle.title = chromeOpen ? 'Свернуть шапку' : 'Развернуть шапку';
  };
  navToggle.addEventListener('click', () => { chromeOpen = !chromeOpen; syncChrome(); });

  root.replaceChildren(
    h('a', { class: 'cqa-skip', href: '#cqa-main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'К содержимому'),
    h('header', { class: 'cqa-header' },
      h('div', { class: 'cqa-header__top' },
        h('div', { class: 'cqa-brand' },
          navToggle,
          h('a', { class: 'cqa-brand__link', href: '#/list', 'aria-label': 'CQA — на главную, к списку диалогов' },
            h('span', { class: 'cqa-brand__text' }, h('strong', { class: 'cqa-brand__title' }, 'Оценка качества диалогов'),
              h('span', { class: 'cqa-brand__sub' }, 'Учебный прототип хакатона · не продукт компании')))),
        h('div', { class: 'cqa-header__tools', id: 'cqa-header-extra' }, themeToggle())),
      navWrap),
    h('div', { class: 'cqa-context' }, h('div', { class: 'cqa-context__clip' }, h('div', { class: 'cqa-context__inner', 'aria-label': 'Текущий контекст работы' }, contextToggle, contextItems))),
    main,
    h('footer', { class: 'cqa-footer' }, 'CQA — учебный прототип для хакатона. Данные демонстрационные. Горячие клавиши: ?'),
    tabbar);

  syncChrome();
  initMotion(root);
  initFx(root);
  prepareSpots(main);
  initTour(root);
  // Вспышка favicon по клику и после оценки; знак делает оборот после оценки
  root.addEventListener('pointerdown', () => favicon.flash());
  document.addEventListener('cqa:evaluated', () => { favicon.flash(); logo.flash(); });
  logo.el.addEventListener('pointerdown', () => {
    const r = logo.el.getBoundingClientRect();
    burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 24, kind: 'sparks' });
  });

  function renderContext() {
    const cl = store.activeChecklist();
    const open = store.appeals().filter((a) => a.status === 'open').length;
    root.querySelectorAll('.cqa-nav__count').forEach((c) => { c.hidden = !open; c.textContent = String(open); });
    const dirty = isDirty();
    const size = store.setSize !== null ? ` · ${dialogs(store.setSize)}` : '';
    contextToggle.replaceChildren(...[icon('database', null, 16),
      h('span', { class: 'cqa-context__summary' }, h('strong', {}, store.groupId), ` · ${cl.name} · v${cl.version}`),
      dirty ? h('span', { class: 'cqa-context__dot', role: 'img', 'aria-label': 'есть несохранённые изменения' }) : null,
      icon('chevronDown', null, 16)].filter(Boolean));
    contextItems.replaceChildren(...[
      h('span', { class: 'cqa-context__item', title: 'Набор диалогов (group_id)' }, icon('database', null, 16), h('strong', {}, store.groupId), size),
      h('span', { class: 'cqa-context__item', title: 'Активный чек-лист' }, icon('listChecks', null, 16), h('strong', {}, cl.name), ` · v${cl.version}`),
      h('span', { class: 'cqa-context__item', title: 'Источник данных' }, icon('cpu', null, 16), h('strong', {}, CONFIG.DATA_SOURCE === 'api' ? 'API организаторов' : 'Демо-данные')),
      dirty ? h('a', { class: 'cqa-context__item', href: '#/checklist' }, icon('pencil', null, 16), 'Есть несохранённые изменения чек-листа') : null,
    ].filter(Boolean));
  }

  let cleanup = null;
  let first = true;
  const vt = typeof document.startViewTransition === 'function';
  root.classList.toggle('cqa-vt', vt);

  const render = async () => {
    const route = parse();
    const active = NAV_OF[route.name] || route.name;
    root.querySelectorAll('[data-key]').forEach((a) => {
      if (a.dataset.key === active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    setContextOpen(false);
    try { cleanup?.(); } catch { /* экран уже убран */ }
    cleanup = null;
    resetCountUps();
    renderContext();

    // Синхронная часть экрана монтируется сразу; данные догружаются после.
    let screen;
    const swap = () => {
      main.replaceChildren();
      screen = ROUTES[route.name].render(main, route);
    };
    try {
      // View Transitions API: плавная смена экрана; без поддержки — CSS-появление (fade + сдвиг)
      if (vt && !first && !reducedMotion()) {
        const t = document.startViewTransition(swap);
        // Быстрая смена экранов пропускает предыдущий переход — это штатно, не ошибка
        t.ready.catch(() => {});
        t.finished.catch(() => {});
        await t.updateCallbackDone;
      } else swap();
      first = false;
      const res = await screen;
      if (typeof res === 'function') cleanup = res;
    } catch (e) {
      console.error(e);
      main.replaceChildren(errorState(`Экран не открылся: ${e.message}`, render));
    }
    renderContext();
    main.querySelector('.cqa-h1')?.focus({ preventScroll: true });
  };
  store.onChange(renderContext);
  onDraftChange(renderContext);
  window.addEventListener('hashchange', () => { render(); root.scrollIntoView({ block: 'start' }); });
  initHotkeys(root, main, () => setContextOpen(false));
  return render();
}

// --- Горячие клавиши: / — поиск, ? — список клавиш, Esc — закрыть ---

function initHotkeys(root, main, closeContext) {
  let help = null;
  const showHelp = () => {
    if (help?.open) return;
    const row = (keys, text) => h('div', { class: 'cqa-keys__row' }, h('span', { class: 'cqa-keys__keys' }, keys.map((k) => h('kbd', { class: 'cqa-kbd' }, k))), h('span', {}, text));
    help = h('dialog', { class: 'cqa-dialog', 'aria-labelledby': 'cqa-keys-title' },
      h('div', { class: 'cqa-dialog__body' },
        h('h2', { class: 'cqa-h2', id: 'cqa-keys-title' }, 'Горячие клавиши'),
        h('div', { class: 'cqa-keys' },
          row(['/'], 'Поиск: по диалогам на списке, по транскрипту в карточке'),
          row(['?'], 'Этот список клавиш'),
          row(['Esc'], 'Закрыть окно, меню или презентацию')),
        h('div', { class: 'cqa-actions cqa-actions--end' }, button('Закрыть', { variant: 'primary', onclick: () => help.close() }))));
    help.addEventListener('close', () => help.remove());
    root.append(help);
    help.showModal();
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      // Нативные <dialog> закрываются сами; здесь — меню, контекст и презентация
      const menu = root.querySelector('details.cqa-menu[open]');
      if (menu) { menu.open = false; return; }
      if (tourOpen()) { closeTour(); return; }
      closeContext();
      return;
    }
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || root.querySelector('dialog[open]')) return;
    // По физической клавише тоже: в русской раскладке на месте «/» стоит «.»
    const slash = e.key === '/' || (e.code === 'Slash' && !e.shiftKey);
    const question = e.key === '?' || (e.code === 'Slash' && e.shiftKey);
    if (question) { e.preventDefault(); showHelp(); return; }
    if (slash) {
      const search = main.querySelector('input[type="search"]');
      if (search) { e.preventDefault(); search.focus(); search.select(); }
    }
  });
}

async function start() {
  const root = document.getElementById('cqa-root');
  if (!root) return;
  root.classList.add('cqa-app');
  setRoot(root);
  initTheme(root);
  root.replaceChildren(h('div', { class: 'cqa-main' }, skeleton('table', 'Запуск…')));
  try {
    await store.init();
  } catch (e) {
    root.replaceChildren(h('div', { class: 'cqa-main' }, errorState(`Не удалось загрузить исходный чек-лист: ${e.message}`, start)));
    return;
  }
  mount(root);
  // Размер набора для строки контекста; ошибку загрузки покажет сам экран
  getConversations(store.groupId).then((d) => store.setSetSize(d.records.length)).catch(() => {});
}

start();
