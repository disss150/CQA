// Экран 3. Оценка: выбор диалога и чек-листа, запуск, результат, модель и стоимость.
import { h, icon, num, go, button, field, select, screenHeader, skeleton, errorState, emptyState, exportMenu, CHANNELS } from '../ui.js';
import { CONFIG } from '../config.js';
import { getConversations, evaluate } from '../api.js';
import { store } from '../store.js';
import { exportDialog } from '../export.js';
import { renderResult } from '../components/result-view.js';

/** Подвал с моделью и стоимостью одной оценки (значения — из CONFIG.MODEL). */
export function costText(m = CONFIG.MODEL) {
  return m.costPerEvaluation === null || m.costPerEvaluation === undefined
    ? 'уточняется'
    : `≈ ${Number(m.costPerEvaluation).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ${m.currency}`;
}

export function modelFooter() {
  const m = CONFIG.MODEL;
  return h('footer', { class: 'cqa-model', 'aria-label': 'Модель оценки' },
    h('span', { class: 'cqa-model__item' }, icon('cpu', null, 16), 'Модель: ', h('strong', {}, m.name)),
    h('span', { class: 'cqa-model__item' }, 'Провайдер: ', h('strong', {}, m.provider)),
    h('span', { class: 'cqa-model__item' }, 'Стоимость одной оценки: ', h('strong', {}, costText(m))));
}

export async function render(main, route) {
  const body = h('div', { class: 'cqa-screen__body' });
  main.append(h('div', { class: 'cqa-screen' },
    screenHeader('Оценка диалога', `Набор ${store.groupId}. Выберите диалог и чек-лист, затем запустите оценку оператора.`), body, modelFooter()));

  const load = async () => {
    body.replaceChildren(skeleton('form', 'Загружаем диалоги…'));
    let records;
    try {
      ({ records } = await getConversations(store.groupId));
      store.setSetSize(records.length);
    } catch (e) {
      body.replaceChildren(errorState(e.message, load));
      return;
    }
    if (!records.length) {
      body.replaceChildren(emptyState('Нечего оценивать', `В наборе ${store.groupId} нет диалогов. Проверьте group_id в настройках.`, button('Открыть настройки', { href: '#/settings', icon: 'settings', variant: 'primary' })));
      return;
    }
    body.replaceChildren(...view(records, route));
  };
  await load();
}

function view(records, route) {
  let convId = records.some((r) => r.conversation_id === route.param) ? route.param : records[0].conversation_id;
  let checklistId = store.activeChecklist().id;
  const output = h('div', { class: 'cqa-screen__body', 'aria-live': 'polite' });
  const note = h('p', { class: 'cqa-hint' });
  const runBtn = h('button', { class: 'cqa-btn cqa-btn--primary', type: 'submit' }, icon('zap'), h('span', {}, 'Оценить'));

  const conversation = () => records.find((r) => r.conversation_id === convId);
  const showExisting = () => {
    const rec = store.getRecord(convId);
    note.textContent = rec ? `Диалог уже оценён: итог ${num(store.finalResult(convId).total)}. Повторная оценка заменит результат.` : 'Диалог ещё не оценён.';
    output.replaceChildren(rec ? resultBlock(rec, conversation()) : emptyState('Результата пока нет', 'Нажмите «Оценить», чтобы получить баллы, объяснения и реплики-доказательства.', null, 'zap'));
  };

  const form = h('form', {
    class: 'cqa-card',
    onsubmit: async (e) => {
      e.preventDefault();
      const checklist = store.getChecklist(checklistId);
      const conv = conversation();
      runBtn.disabled = true;
      runBtn.setAttribute('aria-busy', 'true');
      note.textContent = `Оцениваем ${conv.conversation_id} по чек-листу «${checklist.name}», версия ${checklist.version}…`;
      output.replaceChildren(skeleton('result', 'Оценка выполняется…'));
      try {
        const result = await evaluate(conv, checklist);
        const rec = store.saveEvaluation(conv.conversation_id, checklist, result);
        note.textContent = 'Оценка готова.';
        output.replaceChildren(resultBlock(rec, conv));
      } catch (err) {
        note.textContent = '';
        output.replaceChildren(errorState(err.message, () => form.requestSubmit(), 'Оценка не выполнена'));
      } finally {
        runBtn.disabled = false;
        runBtn.removeAttribute('aria-busy');
      }
    },
  },
  h('div', { class: 'cqa-grid cqa-grid--2' },
    field('Диалог', select(records.map((r) => ({ value: r.conversation_id, label: `${r.conversation_id} · ${CHANNELS[r.channel] || r.channel} · ${r.language}` })), convId,
      { onchange: (e) => { convId = e.target.value; window.history.replaceState(null, '', `#/evaluate/${encodeURIComponent(convId)}`); showExisting(); } })),
    field('Чек-лист', select(store.checklists().map((c) => ({ value: c.id, label: `${c.name} · v${c.version}${c.id === store.activeChecklist().id ? ' (активный)' : ''}` })), checklistId,
      { onchange: (e) => { checklistId = e.target.value; } }))),
  h('div', { class: 'cqa-actions' }, runBtn, note));

  showExisting();
  return [form, output];
}

function resultBlock(rec, conv) {
  const id = rec.conversation_id;
  const item = () => ({ conversation: conv, record: store.getRecord(id), final: store.finalResult(id), appeals: store.appealsFor(id), groupId: store.groupId });
  const openCard = (target) => {
    const q = Array.isArray(target) ? `r=${target.join(',')}` : `from=${target.from}&to=${target.to}`;
    go(`#/conversation/${encodeURIComponent(id)}?${q}`);
  };
  return h('div', { class: 'cqa-screen__body' },
    h('div', { class: 'cqa-card__head' },
      h('p', { class: 'cqa-hint' }, 'Нажмите на реплику-доказательство или ссылку #n, чтобы увидеть её в транскрипте.'),
      h('div', { class: 'cqa-actions' },
        exportMenu((format) => exportDialog(item(), format)))),
    renderResult({ record: rec, final: store.finalResult(id), conversation: conv, appeals: store.appealsFor(id), onEvidence: openCard }));
}
