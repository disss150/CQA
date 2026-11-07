// Редактор чек-листа (только на экране «Чек-лист»). Состояние — в checklist-draft.js.
import { h, icon, num, field, select, button, badge, formatDate, confirmDialog, toast, setFieldError } from '../ui.js';
import { store } from '../store.js';
import { round2 } from '../scoring.js';
import { getDraft, isDirty, validate, weightSum, saveDraft, discardDraft, duplicateDraft, loadDraft, notifyDraft } from '../checklist-draft.js';

const TYPES = [
  { value: 'yesno', label: 'Да / Нет' },
  { value: 'yesno_na', label: 'Да / Нет / N/A' },
  { value: 'scale', label: 'Шкала' },
  { value: 'gross', label: 'Грубая ошибка (флаг, без баллов)' },
];
const typeKey = (c) => (c.type === 'scale' ? 'scale' : c.type === 'gross' ? 'gross' : c.na_allowed ? 'yesno_na' : 'yesno');

function setType(c, key) {
  if (key === 'scale') {
    c.type = 'scale';
    if (!c.steps?.length) c.steps = [{ value: 10, label: 'Полностью' }, { value: 5, label: 'Частично' }, { value: 0, label: 'Нет' }];
  } else if (key === 'gross') {
    Object.assign(c, { type: 'gross', weight: 0, na_allowed: false, steps: [] });
  } else {
    Object.assign(c, { type: 'binary', na_allowed: key === 'yesno_na', steps: [] });
  }
}

export function mountChecklistEditor(container) {
  const root = h('div', { class: 'cqa-editor' });
  container.append(root);
  let message = '';

  const sumEl = h('div', { class: 'cqa-sum', 'aria-live': 'polite' });
  const errorsEl = h('div', { 'aria-live': 'polite' });
  // Две одинаковые группы кнопок: в карточке состояния сверху и в конце списка.
  // Ни одна не закреплена поверх контента.
  const saveBtns = [0].map(() => button('Сохранить и применить', { icon: 'check', variant: 'primary', onclick: save, 'data-save': '' }));
  const resetBtns = [0].map(() => button('Отменить', { variant: 'secondary', onclick: discard, 'aria-label': 'Отменить изменения' }));
  const msgEl = h('p', { class: 'cqa-editor__msg', role: 'status' });

  /** Обновляет сумму, ошибки у полей и кнопки — без перерисовки (фокус не теряется). */
  function refresh() {
    const d = getDraft();
    const sum = weightSum(d);
    const errors = validate(d);
    sumEl.className = `cqa-sum ${sum === 100 ? 'cqa-sum--ok' : 'cqa-sum--warn'}`;
    sumEl.replaceChildren(icon(sum === 100 ? 'checkCircle' : 'alert'), h('span', {},
      h('strong', {}, `Сумма весов: ${num(sum)} из 100`),
      sum === 100 ? ' — всё в порядке.' : ` — ${sum < 100 ? 'не хватает' : 'лишние'} ${num(Math.abs(round2(100 - sum)))}. Сохранение недоступно, пока сумма не равна 100.`));
    root.querySelectorAll('[data-err]').forEach((el) => setFieldError(el, ''));
    for (const e of errors) {
      const el = e.id === null ? (e.field === 'name' ? root.querySelector('#cqa-cl-name') : null) : root.querySelector(`#cqa-c${e.id}-${e.field}`);
      if (el) setFieldError(el, e.text.replace(/^Критерий \d+: /, ''));
    }
    errorsEl.replaceChildren(errors.length ? h('ul', { class: 'cqa-errors' }, errors.map((e) => h('li', {}, e.text))) : '');
    const dirty = isDirty();
    for (const b of saveBtns) {
      b.disabled = errors.length > 0 || !dirty;
      b.title = errors.length ? 'Исправьте ошибки, чтобы сохранить' : dirty ? '' : 'Нет изменений';
    }
    for (const b of resetBtns) b.disabled = !dirty;
    msgEl.textContent = dirty ? 'Есть несохранённые изменения.' : message;
    notifyDraft();
  }

  function render(focusId) {
    const d = getDraft();
    const saved = store.getChecklist(d.id);
    const active = store.activeChecklist();
    const nameInput = h('input', { id: 'cqa-cl-name', 'data-err': '', class: 'cqa-input', value: d.name, oninput: (e) => { d.name = e.target.value; refresh(); } });
    root.replaceChildren(
      h('section', { class: 'cqa-card' },
        h('div', { class: 'cqa-editor__toolbar' },
          store.checklists().length > 1
            ? field('Чек-лист', select(store.checklists().map((c) => ({ value: c.id, label: `${c.name} · v${c.version}${c.id === active.id ? ' (активный)' : ''}` })), d.id, { onchange: (e) => switchTo(e.target.value, e.target) }))
            : null,
          field('Название', nameInput),
          h('div', { class: 'cqa-actions' }, button('Создать копию', { icon: 'copy', variant: 'secondary', onclick: duplicate }))),
        h('p', { class: 'cqa-inline cqa-hint' },
          badge(`v${saved?.version ?? 1}`, 'info'),
          d.id === active.id ? badge('активный', 'yes') : badge('не активный', 'muted'),
          saved?.saved_at ? `сохранён ${formatDate(saved.saved_at)}` : 'исходная версия из PDF')),
      h('section', { class: 'cqa-card cqa-editor__status', 'aria-label': 'Состояние чек-листа' },
        sumEl, errorsEl,
        h('div', { class: 'cqa-editor__actions' }, msgEl, h('div', { class: 'cqa-actions' }, resetBtns[0], saveBtns[0]))),
      h('ol', { class: 'cqa-editor__list' }, d.criteria.map((c, i) => criterionForm(c, i, d))),
      h('div', { class: 'cqa-editor__actions cqa-editor__actions--bottom' },
        button('Добавить критерий', { icon: 'plus', variant: 'secondary', onclick: add })));
    refresh();
    if (focusId) root.querySelector(`#${focusId}`)?.focus();
  }

  function criterionForm(c, i, d) {
    const pid = `cqa-c${c.id}`;
    const isGross = c.type === 'gross';
    const naVisible = c.na_allowed && !isGross;
    return h('li', { class: 'cqa-card' },
      h('fieldset', { class: 'cqa-fieldset' },
        h('div', { class: 'cqa-editor__item-head' },
          h('legend', { class: 'cqa-legend' }, `Критерий ${i + 1}`, c.name ? ` · ${c.name}` : ''),
          h('div', { class: 'cqa-actions' },
            button(`Переместить критерий ${i + 1} выше`, { icon: 'chevronUp', iconOnly: true, size: 'sm', disabled: i === 0, id: `${pid}-up`, onclick: () => move(i, -1, 'up') }),
            button(`Переместить критерий ${i + 1} ниже`, { icon: 'chevronDown', iconOnly: true, size: 'sm', disabled: i === d.criteria.length - 1, id: `${pid}-down`, onclick: () => move(i, 1, 'down') }),
            button(`Удалить критерий ${i + 1}`, { icon: 'trash', iconOnly: true, size: 'sm', variant: 'danger', onclick: () => remove(i) }))),
        h('div', { class: 'cqa-grid cqa-grid--2' },
          field('Название', h('input', { id: `${pid}-name`, 'data-err': '', class: 'cqa-input', value: c.name, required: true, oninput: (e) => { c.name = e.target.value; refresh(); } })),
          field('Секция', select([{ value: '', label: 'Без секции' }, ...(d.sections || []).map((s) => ({ value: s.id, label: s.name }))], c.section || '',
            { id: `${pid}-section`, onchange: (e) => { c.section = e.target.value || null; refresh(); } }))),
        field('Формулировка (что считать «Да»)', h('textarea', { id: `${pid}-desc`, class: 'cqa-input', rows: '2', value: c.description, oninput: (e) => { c.description = e.target.value; refresh(); } })),
        h('div', { class: 'cqa-grid cqa-grid--3' },
          field('Тип ответа', select(TYPES, typeKey(c), { id: `${pid}-type`, onchange: (e) => { setType(c, e.target.value); render(`${pid}-type`); } })),
          field('Вес', h('input', {
            id: `${pid}-weight`, 'data-err': '', class: 'cqa-input', type: 'number', min: '0', step: '1', inputmode: 'decimal', value: String(c.weight), disabled: isGross,
            oninput: (e) => { c.weight = e.target.value === '' ? 0 : Number(e.target.value); refresh(); },
          }), isGross ? 'Без баллов, отдельный флаг.' : null),
          c.type === 'scale'
            ? h('label', { class: 'cqa-check' }, h('input', { id: `${pid}-na`, type: 'checkbox', checked: c.na_allowed, onchange: (e) => { c.na_allowed = e.target.checked; render(`${pid}-na`); } }), 'Разрешить N/A')
            : null),
        naVisible ? field('Когда ставить N/A', h('input', { id: `${pid}-nacond`, class: 'cqa-input', value: c.na_condition || '', oninput: (e) => { c.na_condition = e.target.value; refresh(); } })) : null,
        c.type === 'scale' ? stepsEditor(c, pid) : null));
  }

  function stepsEditor(c, pid) {
    // Невидимый якорь: setFieldError пишет ошибку шкалы в `${pid}-steps-err`.
    const anchor = h('span', { id: `${pid}-steps`, 'data-err': '', hidden: true });
    return h('div', { class: 'cqa-steps' },
      h('span', { class: 'cqa-eyebrow' }, 'Ступени шкалы'),
      h('p', { class: 'cqa-hint' }, 'Балл критерия = ступень / максимум шкалы × вес. Верхняя ступень даёт полный вес.'),
      h('ol', { class: 'cqa-steps__list' }, c.steps.map((s, k) => h('li', { class: 'cqa-steps__row' },
        h('input', { id: `${pid}-s${k}-v`, class: 'cqa-input cqa-input--num', type: 'number', min: '0', step: '1', value: String(s.value), 'aria-label': `Балл ступени ${k + 1}`,
          oninput: (e) => { s.value = e.target.value === '' ? NaN : Number(e.target.value); refresh(); } }),
        h('input', { id: `${pid}-s${k}-l`, class: 'cqa-input', value: s.label, 'aria-label': `Описание ступени ${k + 1}`, oninput: (e) => { s.label = e.target.value; refresh(); } }),
        button(`Удалить ступень ${k + 1}`, { icon: 'x', iconOnly: true, size: 'sm', variant: 'ghost', disabled: c.steps.length <= 1, onclick: () => { c.steps.splice(k, 1); render(`${pid}-addstep`); } })))),
      h('p',{ class: 'cqa-field__error', id: `${pid}-steps-err`, 'aria-live': 'polite' }),
      h('div', {}, button('Ступень', { icon: 'plus', size: 'sm', variant: 'secondary', id: `${pid}-addstep`, onclick: () => { c.steps.push({ value: 0, label: '' }); render(`${pid}-s${c.steps.length - 1}-v`); } })),
      anchor);
  }

  function add() {
    const d = getDraft();
    const id = Math.max(0, ...d.criteria.map((c) => Number(c.id) || 0)) + 1;
    const c = { id, section: d.sections?.[0]?.id || null, name: '', description: '', type: 'binary', na_allowed: false, na_condition: '', weight: 0, steps: [] };
    const grossAt = d.criteria.findIndex((x) => x.type === 'gross');
    d.criteria.splice(grossAt === -1 ? d.criteria.length : grossAt, 0, c);
    render(`cqa-c${id}-name`);
  }

  async function remove(i) {
    const d = getDraft();
    const c = d.criteria[i];
    const ok = await confirmDialog({ title: 'Удалить критерий?', text: `«${c.name || `Критерий ${i + 1}`}» пропадёт из черновика. Изменение вступит в силу после «Сохранить и применить».`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    d.criteria.splice(i, 1);
    render();
  }

  function move(i, delta, dir) {
    const d = getDraft();
    const [c] = d.criteria.splice(i, 1);
    d.criteria.splice(i + delta, 0, c);
    render(`cqa-c${c.id}-${dir}`);
  }

  function save() {
    try {
      const saved = saveDraft();
      message = `Сохранено: «${saved.name}», версия ${saved.version}. Новые оценки используют этот чек-лист.`;
      toast(`Чек-лист сохранён: версия ${saved.version}`);
      render();
    } catch (e) {
      toast(e.message, 'no');
    }
  }

  async function discard() {
    if (!(await confirmDialog({ title: 'Отменить изменения?', text: 'Черновик вернётся к сохранённой версии.', confirmLabel: 'Отменить изменения' }))) return;
    discardDraft();
    message = 'Изменения отменены.';
    render();
  }

  async function duplicate() {
    if (isDirty() && !(await confirmDialog({ title: 'Создать копию?', text: 'Несохранённые изменения текущего черновика пропадут.', confirmLabel: 'Создать копию' }))) return;
    duplicateDraft();
    message = 'Создана копия. Отредактируйте и нажмите «Сохранить и применить», чтобы сделать её активной.';
    render();
  }

  async function switchTo(id, sel) {
    if (isDirty() && !(await confirmDialog({ title: 'Переключить чек-лист?', text: 'Несохранённые изменения пропадут.', confirmLabel: 'Переключить' }))) { sel.value = getDraft().id; return; }
    loadDraft(id);
    message = '';
    render();
  }

  render();
  return () => root.remove();
}
