// Экран 1. Диалоги: сводка, фильтры, поиск, экспорт набора.
import { h, icon, num, badge, statusBadge, button, field, select, screenHeader, skeleton, errorState, emptyState, statTile, exportMenu, CHANNELS, LANGS, dialogs, plural } from '../ui.js';
import { getConversations } from '../api.js';
import { store } from '../store.js';
import { exportSet } from '../export.js';
import { countUp } from '../motion.js';
import { startTour } from '../tour.js';
import { CONFIG } from '../config.js';

const filters = { q: '', language: '', channel: '', status: '' };
// «Оценён» включает пересмотренные после апелляции
const STATUS_FILTER = { none: ['none'], evaluated: ['evaluated', 'reviewed'], appeal: ['appeal'] };

export async function render(main) {
  const body = h('div', { class: 'cqa-screen__body' });
  const subtitle = h('span', {}, `Набор ${store.groupId}`);
  const exportSlot = h('div', { class: 'cqa-actions' });
  const tourBtn = button('Презентация 5 минут', { icon: 'play', variant: 'primary', onclick: startTour });
  main.append(h('div', { class: 'cqa-screen' }, screenHeader('Диалоги', subtitle, tourBtn, exportSlot), body));

  const load = async (force = false) => {
    body.replaceChildren(skeleton('table', 'Загружаем диалоги…'));
    exportSlot.replaceChildren();
    try {
      const data = await getConversations(store.groupId, { force });
      store.setSetSize(data.records.length);
      subtitle.textContent = `Набор ${data.groupId || store.groupId} · ${data.records.length} из ${num(data.total)} ${plural(data.total, ['записи', 'записей', 'записей'])}. Откройте диалог, чтобы увидеть транскрипт и оценку.`;
      if (!data.records.length) {
        body.replaceChildren(emptyState('В наборе нет диалогов', `Сервер вернул пустой набор ${store.groupId}. Проверьте group_id в настройках или обновите список.`,
          h('div', { class: 'cqa-actions' }, button('Обновить', { icon: 'refresh', variant: 'primary', onclick: () => load(true) }), button('Настройки', { href: '#/settings', icon: 'settings' }))));
        return;
      }
      exportSlot.replaceChildren(...exportButtons(data.records));
      body.replaceChildren(listView(data.records));
    } catch (e) {
      body.replaceChildren(errorState(e.message, () => load(true)));
    }
  };
  await load();
}

function exportButtons(records) {
  const run = (format) => {
    const items = records.filter((r) => store.getRecord(r.conversation_id)).map((r) => ({
      conversation: r, record: store.getRecord(r.conversation_id), final: store.finalResult(r.conversation_id), appeals: store.appealsFor(r.conversation_id), groupId: store.groupId,
    }));
    const notEvaluated = records.filter((r) => !store.getRecord(r.conversation_id)).map((r) => r.conversation_id);
    exportSet(items, store.groupId, notEvaluated, format);
  };
  const disabled = !records.some((r) => store.getRecord(r.conversation_id));
  const title = disabled ? 'Сначала оцените хотя бы один диалог' : null;
  return [exportMenu(run, { label: 'Экспорт набора', disabled, title })];
}

function stats(records) {
  const evaluated = records.filter((r) => store.getRecord(r.conversation_id));
  const finals = evaluated.map((r) => store.finalResult(r.conversation_id));
  const totals = finals.map((f) => f.total).filter((t) => t !== null);
  const avg = totals.length ? Math.round((totals.reduce((s, t) => s + t, 0) / totals.length) * 100) / 100 : null;
  const gross = finals.filter((f) => f.gross_error.flag).length;
  const ids = new Set(records.map((r) => r.conversation_id));
  const open = store.appeals().filter((a) => a.status === 'open' && ids.has(a.conversation_id)).length;
  // Числа считаются от 0 один раз за посещение страницы (ключи сбрасываются при смене маршрута)
  return h('div', { class: 'cqa-stats', role: 'group', 'aria-label': 'Сводка по набору' },
    statTile('Оценено', countUp(evaluated.length, { key: 'stat-evaluated', format: (v) => `${v} из ${records.length}` }), h('span', {}, `${Math.round((evaluated.length / records.length) * 100)}% набора`), 'checkCircle'),
    statTile('Средний итог', avg === null ? '—' : countUp(avg, { key: 'stat-avg', format: num }), avg === null ? 'нет оценённых диалогов' : 'по финальным итогам', 'chartBar'),
    statTile('Грубые ошибки', countUp(gross, { key: 'stat-gross' }), gross ? `${plural(gross, ['диалог', 'диалога', 'диалогов'])} с флагом` : 'не выявлено', 'alert', gross ? 'no' : null),
    statTile('Открытые апелляции', countUp(open, { key: 'stat-open' }), open ? h('a', { href: '#/review' }, 'Перейти в очередь проверки') : 'очередь пуста', 'flag', open ? 'warn' : null));
}

function listView(records) {
  const wrap = h('div', { class: 'cqa-screen__body' });
  const results = h('div', { 'aria-live': 'polite' });
  const reset = () => { Object.assign(filters, { q: '', language: '', channel: '', status: '' }); wrap.replaceWith(listView(records)); };
  const update = () => results.replaceChildren(table(records.filter(match), records.length, reset));

  const search = h('input', { class: 'cqa-input', type: 'search', placeholder: 'ID или текст реплики', value: filters.q, oninput: (e) => { filters.q = e.target.value; update(); } });
  const form = h('form', { class: 'cqa-filters', role: 'search', onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'cqa-field' }, h('label', { class: 'cqa-label', for: 'cqa-list-q' }, 'Поиск по ID и транскрипту'), h('div', { class: 'cqa-search' }, icon('search', null, 16), Object.assign(search, { id: 'cqa-list-q' }))),
    field('Язык', select([{ value: '', label: 'Все языки' }, ...Object.entries(LANGS).map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))], filters.language,
      { onchange: (e) => { filters.language = e.target.value; update(); } })),
    field('Канал', select([{ value: '', label: 'Все каналы' }, ...Object.entries(CHANNELS).map(([v, l]) => ({ value: v, label: l }))], filters.channel,
      { onchange: (e) => { filters.channel = e.target.value; update(); } })),
    field('Статус оценки', select([{ value: '', label: 'Все статусы' }, { value: 'none', label: 'Не оценён' }, { value: 'evaluated', label: 'Оценён' }, { value: 'appeal', label: 'На апелляции' }], filters.status,
      { onchange: (e) => { filters.status = e.target.value; update(); } })));

  update();
  wrap.append(stats(records), h('div', { class: 'cqa-toolbar' }, form), results);
  return wrap;
}

function match(r) {
  const q = filters.q.trim().toLowerCase();
  if (filters.language && r.language !== filters.language) return false;
  if (filters.channel && r.channel !== filters.channel) return false;
  if (filters.status && !STATUS_FILTER[filters.status].includes(store.status(r.conversation_id))) return false;
  if (!q) return true;
  return r.conversation_id.toLowerCase().includes(q) || r.transcript.some((t) => String(t.text).toLowerCase().includes(q));
}

function table(rows, total, reset) {
  if (!rows.length) {
    return emptyState('Ничего не найдено', 'Под выбранные фильтры не подходит ни один диалог. Измените запрос или сбросьте фильтры.',
      button('Сбросить фильтры', { icon: 'x', variant: 'primary', onclick: reset }), 'search');
  }
  return h('div', {},
    h('p', { class: 'cqa-hint cqa-table__count' }, rows.length === total ? `Показано ${dialogs(total)}` : `Найдено ${rows.length} из ${total}`),
    h('div', { class: 'cqa-table-wrap' },
      h('table', { class: 'cqa-table' },
        h('caption', { class: 'cqa-sr' }, 'Список диалогов'),
        h('thead', {}, h('tr', {}, ['ID', 'Канал', 'Язык', 'Реплик', 'Статус', 'Итог', ''].map((t, i) => h('th', { scope: 'col', class: i === 3 || i === 5 ? 'cqa-table__num' : null }, t || h('span', { class: 'cqa-sr' }, 'Действия'))))),
        h('tbody', {}, rows.map((r) => {
          const id = r.conversation_id;
          const final = store.finalResult(id);
          const href = `#/conversation/${encodeURIComponent(id)}`;
          return h('tr', {},
            h('td', { 'data-label': 'ID' }, h('span', { class: 'cqa-inline' }, h('a', { class: 'cqa-table__id cqa-mono', href }, id),
              CONFIG.DEMO_IDS.includes(id) ? badge('Для демо', 'info', 'play') : null)),
            h('td', { 'data-label': 'Канал' }, h('span', { class: 'cqa-inline' }, icon(r.channel === 'voice call' ? 'phone' : 'chat', null, 14), CHANNELS[r.channel] || r.channel,
              r.transcript.some((x) => x.type === 'voice') ? badge('голосовые', 'muted', 'mic') : null)),
            h('td', { 'data-label': 'Язык' }, badge(r.language, 'muted')),
            h('td', { 'data-label': 'Реплик', class: 'cqa-table__num' }, String(r.transcript.length)),
            h('td', { 'data-label': 'Статус' }, statusBadge(store.status(id))),
            h('td', { 'data-label': 'Итог', class: 'cqa-table__num' },
              h('span', { class: 'cqa-inline cqa-inline--end' },
                final?.gross_error.flag ? icon('alert', 'Грубая ошибка', 16) : null,
                final ? h('span', { class: 'cqa-score' }, num(final.total)) : h('span', { class: 'cqa-muted' }, '—'))),
            h('td', { class: 'cqa-table__actions' },
              button('Открыть', { href, size: 'sm' }),
              button(final ? 'Переоценить' : 'Оценить', { href: `#/evaluate/${encodeURIComponent(id)}`, size: 'sm', variant: final ? 'ghost' : 'soft', icon: 'zap' })));
        })))));
}
