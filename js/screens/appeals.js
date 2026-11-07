// Экран 5. Подача апелляции и список апелляций со статусами.
import { h, icon, num, badge, button, answerBadge, field, select, setFieldError, formatDate, screenHeader, emptyState, toast, APPEAL_STATUSES } from '../ui.js';
import { store } from '../store.js';

const MIN_COMMENT = 10;
let statusFilter = '';

export function render(main, route) {
  const listSlot = h('section', { class: 'cqa-screen__body', 'aria-label': 'Список апелляций' });
  main.append(h('div', { class: 'cqa-screen' },
    screenHeader('Апелляции', 'Оспорьте оценку по одному критерию. Проверяющий увидит спорную оценку, ваш комментарий и фрагмент диалога во вкладке «Очередь проверки».'),
    appealTabs('file'),
    h('div', { class: 'cqa-grid cqa-grid--side' }, formView(route, () => drawList(listSlot)), listSlot)));
  drawList(listSlot);
}

function formView(route, onAdded) {
  const records = store.allRecords();
  const box = h('section', { class: 'cqa-card', 'aria-labelledby': 'cqa-appeal-form-title' }, h('h2', { class: 'cqa-h2', id: 'cqa-appeal-form-title' }, 'Новая апелляция'));
  if (!records.length) {
    box.append(emptyState('Нет оценённых диалогов', 'Апелляцию можно подать только на готовую оценку. Сначала оцените диалог.', button('Перейти к оценке', { href: '#/evaluate', icon: 'zap', variant: 'primary' }), 'flag'));
    return box;
  }

  let convId = records.some((r) => r.conversation_id === route.query.get('conv')) ? route.query.get('conv') : records[0].conversation_id;
  let critId = Number(route.query.get('crit')) || null;
  let touched = false;
  const critSlot = h('div');
  const preview = h('div', { 'aria-live': 'polite' });
  const comment = h('textarea', { class: 'cqa-input', rows: '4', required: true, placeholder: 'Почему вы не согласны с оценкой? Сошлитесь на реплики, например #7.' });
  const counter = h('span', { class: 'cqa-hint' });
  const submit = h('button', { type: 'submit', class: 'cqa-btn cqa-btn--primary' }, icon('flag'), h('span', {}, 'Сохранить апелляцию'));
  const msg = h('p', { role: 'status', class: 'cqa-editor__msg' });

  const commentError = () => {
    const len = comment.value.trim().length;
    if (!len) return 'Добавьте комментарий: без него апелляцию не сохранить.';
    if (len < MIN_COMMENT) return `Комментарий слишком короткий: минимум ${MIN_COMMENT} символов, сейчас ${len}.`;
    return '';
  };
  const validate = () => {
    counter.textContent = `${comment.value.trim().length} символов`;
    if (touched) setFieldError(comment, commentError());
  };
  comment.addEventListener('input', validate);
  comment.addEventListener('blur', () => { touched = true; validate(); });

  const drawCriteria = () => {
    const rec = store.getRecord(convId);
    const open = new Set(store.appeals().filter((a) => a.evaluation_id === rec.evaluation_id && a.status === 'open').map((a) => a.criterion_id));
    const crits = rec.checklist.criteria;
    if (!crits.some((c) => c.id === critId) || open.has(critId)) critId = crits.find((c) => !open.has(c.id))?.id ?? null;
    critSlot.replaceChildren(field('Критерий', select(crits.map((c) => ({ value: c.id, label: `${c.id}. ${c.name}${open.has(c.id) ? ' — уже на рассмотрении' : ''}`, disabled: open.has(c.id) })), critId,
      { onchange: (e) => { critId = Number(e.target.value); drawPreview(); } })));
    submit.disabled = critId === null;
    drawPreview();
  };

  const drawPreview = () => {
    const rec = store.getRecord(convId);
    const final = store.finalResult(convId);
    const def = rec.checklist.criteria.find((c) => c.id === critId);
    const fc = final.criteria.find((c) => c.id === critId);
    preview.replaceChildren(def && fc
      ? h('div', { class: 'cqa-quote' },
        h('p', { class: 'cqa-inline' }, h('strong', {}, 'Текущая оценка'), answerBadge(def, fc.answer), def.type === 'gross' ? '' : h('span', { class: 'cqa-hint' }, `${num(fc.points)} из ${num(fc.effective_weight)} б.`)),
        fc.explanation ? h('p', { class: 'cqa-hint' }, fc.explanation) : null,
        h('p', { class: 'cqa-inline cqa-hint' }, `Итог диалога сейчас: ${num(final.total)}`,
          h('a', { href: `#/conversation/${encodeURIComponent(convId)}${fc.evidence_ids.length ? `?r=${fc.evidence_ids.join(',')}` : ''}` }, 'Посмотреть в карточке')))
      : h('p', { class: 'cqa-note cqa-note--warn' }, icon('info', null, 16), 'Все критерии этого диалога уже на рассмотрении.'));
  };

  const form = h('form', { class: 'cqa-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    touched = true;
    const err = commentError();
    setFieldError(comment, err);
    if (err) { comment.focus(); return; }
    if (critId === null) return;
    try {
      const a = store.addAppeal({ conversationId: convId, criterionId: critId, comment: comment.value });
      comment.value = '';
      touched = false;
      validate();
      toast(`Апелляция ${a.id} отправлена в очередь проверки`);
      msg.replaceChildren(`Апелляция ${a.id} сохранена. `, h('a', { href: `#/review/${a.id}` }, 'Открыть в очереди проверки'));
      drawCriteria();
      onAdded();
    } catch (err2) {
      msg.textContent = err2.message;
    }
  } },
  field('Диалог', select(records.map((r) => ({ value: r.conversation_id, label: `${r.conversation_id} · итог ${num(store.finalResult(r.conversation_id).total)}` })), convId,
    { onchange: (e) => { convId = e.target.value; critId = null; drawCriteria(); } })),
  critSlot, preview,
  field('Комментарий', comment, `Обязательное поле, минимум ${MIN_COMMENT} символов. Ссылки вида #7 помогут проверяющему.`),
  h('div', { class: 'cqa-actions' }, submit, counter),
  msg);

  drawCriteria();
  validate();
  box.append(form);
  return box;
}

function drawList(slot) {
  const all = store.appeals();
  const rows = all.filter((a) => !statusFilter || (statusFilter === 'done' ? a.status !== 'open' : a.status === statusFilter)).slice().reverse();
  slot.replaceChildren(
    h('div', { class: 'cqa-list-head' },
      h('h2', { class: 'cqa-h2' }, `Все апелляции (${all.length})`),
      field('Статус', select([{ value: '', label: 'Все' }, { value: 'open', label: 'На рассмотрении' }, { value: 'done', label: 'Рассмотренные' }], statusFilter,
        { onchange: (e) => { statusFilter = e.target.value; drawList(slot); } }))),
    !all.length
      ? emptyState('Апелляций пока нет', 'Выберите диалог и критерий в форме слева и опишите, с чем вы не согласны.', null, 'flag')
      : !rows.length
        ? emptyState('Нет апелляций с таким статусом', 'Выберите другой статус в фильтре.', button('Показать все', { onclick: () => { statusFilter = ''; drawList(slot); } }), 'search')
        : h('ul', { class: 'cqa-appeal-cards' }, rows.map((a) => appealCard(a))));
}

/** Вкладки раздела «Апелляции»: подать и очередь проверки. */
export function appealTabs(active) {
  const open = store.appeals().filter((a) => a.status === 'open').length;
  return h('nav', { class: 'cqa-tabs', 'aria-label': 'Апелляции' },
    h('a', { class: 'cqa-tabs__tab', href: '#/appeals', 'aria-current': active === 'file' ? 'page' : null }, icon('flag', null, 16), 'Подать'),
    h('a', { class: 'cqa-tabs__tab', href: '#/review', 'aria-current': active === 'queue' ? 'page' : null }, icon('shield', null, 16), 'Очередь проверки',
      open ? h('span', { class: 'cqa-nav__count' }, String(open)) : null));
}

/** «Было → стало» после решения проверяющего: ответ, баллы критерия и итог диалога. */
export function beforeAfter(a, compact = false) {
  const def = a.criterion;
  const changed = a.decision?.action === 'change';
  const cell = (label, answer, points, total, side) => h('div', { class: `cqa-ba__cell cqa-ba__cell--${side}` },
    h('span', { class: 'cqa-eyebrow' }, label),
    h('span', { class: 'cqa-inline' }, answerBadge(def, answer), def.type === 'gross' ? null : h('span', { class: 'cqa-ba__pts' }, `${num(points)} б.`)),
    h('span', { class: 'cqa-ba__total' }, 'итог ', h('strong', {}, num(total))));
  return h('div', { class: `cqa-ba${compact ? ' cqa-ba--compact' : ''}`, role: 'group', 'aria-label': 'Было и стало' },
    cell('Было', a.original.answer, a.original.points, a.total_before, 'before'),
    h('span', { class: 'cqa-ba__arrow', 'aria-hidden': 'true' }, icon('arrowRight', null, 20)),
    cell(changed ? 'Стало' : 'Подтверждено', changed ? a.decision.answer : a.original.answer, changed ? a.points_after : a.original.points, a.total_after, 'after'));
}

export function appealCard(a) {
  const st = APPEAL_STATUSES[a.status];
  return h('li', { class: 'cqa-card cqa-appeal-card' },
    h('div', { class: 'cqa-appeal-card__head' }, h('strong', {}, a.id), badge(st.label, st.tone)),
    h('p', {}, h('span', { class: 'cqa-mono' }, a.conversation_id), h('span', { class: 'cqa-hint' }, `· ${a.criterion_name}`)),
    a.decision ? beforeAfter(a, true) : h('p', {}, 'Оспорено: ', answerBadge(a.criterion, a.original.answer)),
    h('p', { class: 'cqa-hint' }, `«${a.comment}» · ${formatDate(a.created_at)}`),
    h('div', { class: 'cqa-actions' },
      button(a.status === 'open' ? 'Рассмотреть' : 'Решение', { href: `#/review/${a.id}`, size: 'sm', variant: a.status === 'open' ? 'primary' : 'secondary', icon: 'shield' }),
      button('Карточка', { href: `#/conversation/${encodeURIComponent(a.conversation_id)}`, size: 'sm' })));
}
