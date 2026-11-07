// «Применить изменения» (контрольный этап) — блок в конце экрана «Чек-лист»:
// шаг 1 — сохранить черновик как новую версию, шаг 2 — переоценить выданные диалоги.
import { h, icon, num, badge, button, field, skeleton, errorState, emptyState, progress, setProgress, toast } from '../ui.js';
import { getConversations, evaluate } from '../api.js';
import { store } from '../store.js';
import { getDraft, isDirty, validate, weightSum, saveDraft, diffDraft, onDraftChange } from '../checklist-draft.js';

let lastRun = null; // { groupId, version, rows }

/** Монтирует шаги в container. Возвращает функцию очистки. */
export function mountApply(container) {
  const step1 = h('div', { class: 'cqa-step__body' });
  const step2 = h('div', { class: 'cqa-step__body' });
  const out = h('div', { 'aria-live': 'polite' });
  const groupInput = h('input', { class: 'cqa-input cqa-mono', value: store.groupId, autocomplete: 'off', spellcheck: 'false' });
  const runBtn = h('button', { class: 'cqa-btn cqa-btn--primary', type: 'submit' }, icon('refresh'), h('span', {}, 'Применить к выданным диалогам'));
  const runHint = h('p', { class: 'cqa-hint', 'aria-live': 'polite' });
  let running = false;

  const stepEl = (n, body, done) => h('li', { class: `cqa-card cqa-step${done ? ' cqa-step--done' : ''}` }, h('span', { class: 'cqa-step__num', 'aria-hidden': 'true' }, done ? icon('check', null, 18) : String(n)), body);
  const stepper = h('ol', { class: 'cqa-stepper' });

  function draw() {
    const d = getDraft();
    const active = store.activeChecklist();
    const dirty = isDirty();
    const errors = validate(d);
    const diff = diffDraft();

    // Шаг 1. Сохранить и применить черновик
    step1.replaceChildren(
      h('h2', { class: 'cqa-h2' }, 'Сохранить и применить'),
      dirty
        ? h('div', { class: 'cqa-screen__body' },
          h('p', { class: 'cqa-muted' }, `Черновик «${d.name}» отличается от версии ${store.getChecklist(d.id)?.version}. Сумма весов: ${num(weightSum(d))} из 100.`),
          h('ul', { class: 'cqa-diff', 'aria-label': 'Изменения в черновике' }, diff.map((x) => h('li', {},
            icon(x.kind === 'added' ? 'plus' : x.kind === 'removed' ? 'trash' : 'pencil', null, 16), x.text))),
          errors.length ? h('ul', { class: 'cqa-errors' }, errors.map((e) => h('li', {}, e.text))) : null,
          h('div', { class: 'cqa-actions' },
            button('Сохранить и применить', { icon: 'check', variant: 'primary', disabled: errors.length > 0, title: errors.length ? 'Исправьте ошибки в редакторе выше' : null, 'data-save-step': '', onclick: () => {
              // Сохраняет сам редактор: он перерисуется с новой версией и не потеряет поля ввода
              const editorSave = document.querySelector('.cqa-editor [data-save]');
              if (editorSave) editorSave.click();
              else { const saved = saveDraft(); toast(`Чек-лист сохранён: версия ${saved.version}`); }
            } })))
        : h('div', { class: 'cqa-screen__body' },
          h('p', { class: 'cqa-inline' }, 'Несохранённых изменений нет. Активна версия', badge(`v${active.version}`, 'info'), `«${active.name}».`),
          h('p', { class: 'cqa-hint' }, 'Чтобы заменить критерий, измените его в редакторе выше — изменения появятся здесь.')));

    // Шаг 2. Применить к выданным диалогам
    runBtn.disabled = dirty || running;
    runHint.textContent = dirty ? 'Сначала сохраните изменения чек-листа (шаг 1).' : `Все диалоги набора будут переоценены по «${active.name}», версия ${active.version}.`;
    stepper.replaceChildren(stepEl(1, step1, !dirty), stepEl(2, step2, !!lastRun && lastRun.version === active.version && !dirty));
  }

  step2.append(
    h('h2', { class: 'cqa-h2' }, 'Применить к выданным диалогам'),
    h('form', { class: 'cqa-form', onsubmit: async (e) => {
      e.preventDefault();
      if (isDirty() || running) return;
      running = true; draw();
      await run(groupInput.value.trim() || store.groupId, out);
      running = false; draw();
    } },
    field('Набор диалогов (group_id)', groupInput, 'Для контрольного набора организаторы сообщат свой group_id.'),
    runHint,
    h('div', { class: 'cqa-actions' }, runBtn)),
    out);

  container.append(h('section', { class: 'cqa-screen__body', id: 'cqa-apply', 'aria-labelledby': 'cqa-apply-title' },
    h('div', {},
      h('h2', { class: 'cqa-h2', id: 'cqa-apply-title' }, 'Применить изменения'),
      h('p', { class: 'cqa-muted' }, 'Контрольный этап: сохраните новую версию чек-листа и переоцените выданные диалоги. Итоги «было / стало» появятся ниже.')),
    stepper));

  draw();
  if (lastRun) out.replaceChildren(resultsTable(lastRun));
  const offDraft = onDraftChange(draw);
  return () => offDraft();
}

async function run(groupId, out) {
  out.replaceChildren(skeleton('result', `Загружаем набор ${groupId}…`));
  let records;
  try {
    ({ records } = await getConversations(groupId, { force: true }));
  } catch (e) {
    out.replaceChildren(errorState(e.message, () => run(groupId, out)));
    return;
  }
  if (!records.length) {
    out.replaceChildren(emptyState('Набор пуст', `В наборе ${groupId} нет диалогов. Проверьте group_id.`, null, 'database'));
    return;
  }
  store.setGroupId(groupId);
  store.setSetSize(records.length);
  const cl = store.activeChecklist();
  const label = h('p', { role: 'status' });
  const bar = progress(0, records.length, 'yes', 'Прогресс переоценки', true);
  out.replaceChildren(h('div', { class: 'cqa-card' }, label, bar));

  const rows = [];
  for (const [i, conv] of records.entries()) {
    label.textContent = `Оцениваем ${conv.conversation_id} (${i + 1} из ${records.length})…`;
    setProgress(bar, i, records.length);
    const prev = store.getRecord(conv.conversation_id);
    const before = prev ? { total: store.finalResult(conv.conversation_id).total, version: prev.checklist.version } : null;
    try {
      const rec = store.saveEvaluation(conv.conversation_id, cl, await evaluate(conv, cl));
      rows.push({ conv, before, after: rec.result });
    } catch (e) {
      rows.push({ conv, before, error: e.message });
    }
  }
  lastRun = { groupId, version: cl.version, rows };
  toast(`Переоценено ${rows.filter((r) => !r.error).length} из ${rows.length}`);
  out.replaceChildren(resultsTable(lastRun));
}

function resultsTable({ groupId, version, rows }) {
  const ok = rows.filter((r) => !r.error).length;
  return h('div', { class: 'cqa-screen__body' },
    h('p', { class: 'cqa-note' }, icon('checkCircle', null, 16), `Набор ${groupId}: переоценено ${ok} из ${rows.length} по версии ${version}.`),
    h('div', { class: 'cqa-table-wrap' },
      h('table', { class: 'cqa-table' },
        h('caption', { class: 'cqa-sr' }, 'Итоги до и после применения чек-листа'),
        h('thead', {}, h('tr', {}, ['Диалог', 'Язык', 'Было', 'Стало', 'Разница', 'Грубая ошибка'].map((t, i) => h('th', { scope: 'col', class: i >= 2 && i <= 4 ? 'cqa-table__num' : null }, t)))),
        h('tbody', {}, rows.map((r) => {
          const delta = r.after && r.before && r.after.total !== null && r.before.total !== null ? Math.round((r.after.total - r.before.total) * 100) / 100 : null;
          return h('tr', {},
            h('td', { 'data-label': 'Диалог' }, h('a', { class: 'cqa-mono', href: `#/conversation/${encodeURIComponent(r.conv.conversation_id)}` }, r.conv.conversation_id)),
            h('td', { 'data-label': 'Язык' }, badge(r.conv.language, 'muted')),
            h('td', { 'data-label': 'Было', class: 'cqa-table__num' }, r.before ? `${num(r.before.total)} (v${r.before.version})` : 'не оценён'),
            h('td', { 'data-label': 'Стало', class: 'cqa-table__num' }, r.error ? badge('Ошибка', 'no') : h('span', { class: 'cqa-score' }, num(r.after.total)), r.error ? ` ${r.error}` : ''),
            h('td', { 'data-label': 'Разница', class: 'cqa-table__num' }, delta === null ? '—' : badge(`${delta > 0 ? '+' : ''}${num(delta)}`, delta > 0 ? 'yes' : delta < 0 ? 'no' : 'muted')),
            h('td', { 'data-label': 'Грубая ошибка' }, r.after?.gross_error.flag ? badge('Да', 'no', 'alert') : 'нет'));
        })))));
}
