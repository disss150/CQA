// Настройки: источник данных, модель, хранилище и сброс локальных данных (с подтверждением).
import { h, icon, button, screenHeader, confirmDialog, toast } from '../ui.js';
import { getThemePref, setThemePref } from '../theme.js';
import { CONFIG } from '../config.js';
import { costText } from './evaluate.js';
import { store } from '../store.js';

export function render(main) {
  const m = CONFIG.MODEL;
  const counts = store.counts();
  const row = (dt, dd) => [h('dt', {}, dt), h('dd', {}, dd)];

  main.append(h('div', { class: 'cqa-screen' },
    screenHeader('Настройки', 'Параметры прототипа. Значения задаются в js/config.js; здесь они показаны для проверки.'),
    h('div', { class: 'cqa-settings' },
      themeSection(),
      h('section', { class: 'cqa-card' },
        h('h2', { class: 'cqa-h2' }, 'Данные'),
        h('dl', { class: 'cqa-dl' },
          row('Источник', CONFIG.DATA_SOURCE === 'api' ? 'API через серверный прокси' : 'Моки (mocks/)'),
          row('Набор (group_id)', h('span', { class: 'cqa-mono' }, store.groupId)),
          row('Адрес прокси', h('span', { class: 'cqa-mono' }, CONFIG.API_BASE)),
          row('Ссылка DEV', 'хранится на сервере: переменная CQA_DEV_URL в Vercel (в браузер не передаётся)'))),
      h('section', { class: 'cqa-card' },
        h('h2', { class: 'cqa-h2' }, 'Модель оценки'),
        h('dl', { class: 'cqa-dl' },
          row('Модель', m.name),
          row('Провайдер', m.provider),
          row('Стоимость одной оценки', costText(m))),
        h('p', { class: 'cqa-hint' }, 'Модель, провайдер и стоимость берутся из js/config.js → MODEL.')),
      h('section', { class: 'cqa-card' },
        h('h2', { class: 'cqa-h2' }, 'Хранилище'),
        h('p', { class: 'cqa-muted' }, store.persistent
          ? `Данные сохраняются в этом браузере: чек-листов ${counts.checklists}, оценок ${counts.results}, апелляций ${counts.appeals}.`
          : 'localStorage недоступен: данные живут до перезагрузки страницы.')),
      h('section', { class: 'cqa-card cqa-danger', 'aria-labelledby': 'cqa-danger-title' },
        h('h2', { class: 'cqa-h2', id: 'cqa-danger-title' }, 'Сброс локальных данных'),
        h('p', { class: 'cqa-muted' }, 'Удаляет сохранённые версии чек-листа, все оценки и апелляции из этого браузера. Моки и файлы проекта не меняются. Пригодится перед репетицией демо.'),
        h('div', {}, button('Сбросить локальные данные', { icon: 'trash', variant: 'danger', onclick: reset }))))));
}

function themeSection() {
  const pref = getThemePref();
  const option = (value, label, ic) => h('label', {},
    h('input', { type: 'radio', name: 'cqa-theme', value, checked: pref === value, onchange: () => { setThemePref(value); toast(`Тема: ${label.toLowerCase()}`); } }),
    icon(ic, null, 16), label);
  return h('section', { class: 'cqa-card', 'aria-labelledby': 'cqa-theme-title' },
    h('h2', { class: 'cqa-h2', id: 'cqa-theme-title' }, 'Оформление'),
    h('div', { class: 'cqa-segmented', role: 'radiogroup', 'aria-labelledby': 'cqa-theme-title' },
      option('system', 'Системная', 'cpu'), option('light', 'Светлая', 'sun'), option('dark', 'Тёмная', 'moon')),
    h('p', { class: 'cqa-hint' }, 'По умолчанию тема следует настройке системы. Выбор сохраняется в этом браузере.'));
}

async function reset() {
  const c = store.counts();
  const ok = await confirmDialog({
    title: 'Сбросить локальные данные?',
    text: `Будут удалены: версии чек-листа (${c.checklists}), оценки (${c.results}), апелляции (${c.appeals}). Действие нельзя отменить.`,
    confirmLabel: 'Сбросить',
    danger: true,
  });
  if (!ok) return;
  store.resetAll();
  toast('Локальные данные сброшены');
  window.location.hash = '#/list';
  window.location.reload();
}
