// Экран 6. Очередь проверки: спорная оценка, комментарий, фрагмент, решение и пересчёт.
import { h, icon, num, badge, button, answerBadge, answerOptions, field, select, setFieldError, formatDate, screenHeader, skeleton, errorState, emptyState, linkifyRefs, toast, APPEAL_STATUSES } from '../ui.js';
import { GROSS_TYPES } from '../results.js';
import { getConversation } from '../api.js';
import { store } from '../store.js';
import { renderFragment, replicaRange } from '../components/transcript.js';
import { appealCard, appealTabs, beforeAfter } from './appeals.js';

export async function render(main, route) {
  if (!route.param) return queue(main);
  const view = h('div', { class: 'cqa-screen' });
  main.append(view);
  const a = store.getAppeal(route.param);
  if (!a) {
    view.append(emptyState('Апелляция не найдена', `Апелляции «${route.param}» нет. Возможно, локальные данные были сброшены.`, button('К очереди проверки', { href: '#/review', icon: 'arrowLeft', variant: 'primary' }), 'search'));
    return;
  }

  view.append(screenHeader(`Апелляция ${a.id}`, `${a.conversation_id} · критерий ${a.criterion_id}. ${a.criterion_name}`,
    button('К очереди', { href: '#/review', icon: 'arrowLeft' }),
    button('Полный диалог', { href: `#/conversation/${encodeURIComponent(a.conversation_id)}`, icon: 'messages' })), appealTabs('queue'));
  const body = h('div', { class: 'cqa-screen__body' });
  view.append(body);

  const load = async () => {
    body.replaceChildren(skeleton('card', 'Загружаем фрагмент диалога…'));
    let conv;
    try {
      conv = await getConversation(a.conversation_id, store.groupId);
    } catch (e) {
      body.replaceChildren(errorState(e.message, load));
      return;
    }
    const rec = store.getRecord(a.conversation_id);
    const def = a.criterion;
    const o = a.original;
    const ids = [...new Set([...(o.evidence_ids || []), ...replicaRange(o.skipped_at)])].sort((x, y) => x - y);
    const stale = !rec || rec.evaluation_id !== a.evaluation_id;

    const disputed = h('section', { class: 'cqa-card' },
      h('span', { class: 'cqa-eyebrow' }, 'Спорная оценка'),
      h('h2', { class: 'cqa-h2' }, def.name),
      h('p', { class: 'cqa-inline' }, answerBadge(def, o.answer), def.type === 'gross' ? h('span', { class: 'cqa-chip' }, 'без баллов') : h('span', { class: 'cqa-chip' }, `${num(o.points)} из ${num(o.effective_weight)} · вес ${num(def.weight)}`)),
      h('p', { class: 'cqa-hint' }, def.description),
      o.explanation ? h('p', {}, h('strong', {}, 'Обоснование: '), o.explanation) : null,
      o.na_reason ? h('p', {}, h('strong', {}, 'Причина N/A: '), o.na_reason) : null,
      o.skipped_at ? h('p', {}, h('strong', {}, 'Проверенный участок: '), `реплики #${o.skipped_at.from}–#${o.skipped_at.to}`) : null,
      h('span', { class: 'cqa-eyebrow' }, 'Комментарий апелляции'),
      h('blockquote', { class: 'cqa-quote' }, linkifyRefs(a.comment, null), h('footer', { class: 'cqa-hint' }, formatDate(a.created_at))));

    const fragment = h('section', { class: 'cqa-card' },
      h('span', { class: 'cqa-eyebrow' }, 'Фрагмент диалога'),
      conv
        ? (ids.length ? renderFragment(conv, ids) : h('p', { class: 'cqa-muted' }, 'В оценке нет ссылок на реплики. Откройте полный диалог.'))
        : emptyState('Диалог не найден', 'Транскрипт недоступен в текущем наборе.', null, 'search'));

    body.replaceChildren(h('div', { class: 'cqa-grid cqa-grid--2' }, h('div', { class: 'cqa-screen__body' }, disputed, decisionBlock(a, def, stale, load)), fragment));
  };
  await load();
}

function decisionBlock(a, def, stale, rerender) {
  const box = h('section', { class: 'cqa-card', 'aria-labelledby': 'cqa-decision-title' }, h('h2', { class: 'cqa-h2', id: 'cqa-decision-title' }, 'Решение проверяющего'));

  if (a.status !== 'open') {
    const st = APPEAL_STATUSES[a.status];
    box.append(
      h('p', { class: 'cqa-inline' }, badge(st.label, st.tone), h('span', { class: 'cqa-hint' }, formatDate(a.decision.decided_at))),
      beforeAfter(a),
      h('dl', { class: 'cqa-dl' },
        h('dt', {}, 'Исходная оценка'), h('dd', {}, answerBadge(def, a.original.answer)),
        h('dt', {}, 'Решение'), h('dd', {}, a.decision.action === 'change' ? ['Изменено на ', answerBadge(def, a.decision.answer)] : 'Оценка подтверждена'),
        a.decision.gross_type ? [h('dt', {}, 'Тип грубой ошибки'), h('dd', {}, GROSS_TYPES[a.decision.gross_type])] : null,
        h('dt', {}, 'Причина'), h('dd', {}, a.decision.reason),
        h('dt', {}, 'Итог диалога'), h('dd', { class: 'cqa-score' }, num(a.total_before), icon('arrowRight', null, 16), num(a.total_after))));
    return box;
  }
  if (stale) {
    box.append(h('p', { class: 'cqa-note cqa-note--warn' }, icon('info', null, 16), 'Диалог переоценён после подачи апелляции. Решение уже не повлияет на текущий итог. Подайте новую апелляцию к новой оценке.'));
    return box;
  }

  let action = 'confirm';
  const options = answerOptions(def).filter((op) => String(op.value) !== String(a.original.answer));
  let answer = options[0]?.value;
  let grossType = Object.keys(GROSS_TYPES)[0];
  const changeSlot = h('div', { class: 'cqa-form' });
  const previewEl = h('p', { class: 'cqa-preview', 'aria-live': 'polite' });
  const reason = h('textarea', { class: 'cqa-input', rows: '3', required: true, placeholder: 'Почему оценка подтверждена или изменена' });
  let touched = false;
  const reasonError = () => (reason.value.trim().length < 3 ? 'Укажите причину решения: она будет видна в карточке диалога.' : '');
  reason.addEventListener('input', () => { if (touched) setFieldError(reason, reasonError()); });
  reason.addEventListener('blur', () => { touched = true; setFieldError(reason, reasonError()); });

  const updatePreview = () => {
    const now = store.finalResult(a.conversation_id);
    if (action === 'confirm') { previewEl.replaceChildren(icon('info', null, 16), 'Итог останется ', h('strong', {}, num(now.total))); return; }
    const next = store.previewDecision(a.id, answer, def.type === 'gross' && answer === 'yes' ? grossType : null);
    previewEl.replaceChildren(...['Итог: ', h('strong', {}, num(now.total)), icon('arrowRight', null, 16), h('strong', {}, num(next.total)),
      next.gross_error.flag !== now.gross_error.flag ? h('span', { class: 'cqa-hint' }, `грубая ошибка: ${next.gross_error.flag ? 'да' : 'нет'}`) : null].filter(Boolean));
  };

  const drawChange = () => {
    changeSlot.replaceChildren(...(action === 'change' ? [
      field('Новая оценка', select(options, answer, { onchange: (e) => { const v = e.target.value; answer = def.type === 'scale' && v !== 'na' ? Number(v) : v; drawChange(); } })),
      def.type === 'gross' && answer === 'yes'
        ? field('Тип грубой ошибки', select(Object.entries(GROSS_TYPES).map(([v, l]) => ({ value: v, label: l })), grossType, { onchange: (e) => { grossType = e.target.value; updatePreview(); } }))
        : null,
    ].filter(Boolean) : []));
    updatePreview();
  };

  const radio = (value, label) => h('label', { class: 'cqa-radio-card' },
    h('input', { type: 'radio', name: 'cqa-decision', value, checked: action === value, onchange: () => { action = value; drawChange(); } }), label);

  box.append(h('form', { class: 'cqa-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    touched = true;
    const err = reasonError();
    setFieldError(reason, err);
    if (err) { reason.focus(); return; }
    try {
      const done = store.decideAppeal(a.id, { action, answer, gross_type: def.type === 'gross' && answer === 'yes' && action === 'change' ? grossType : null, reason: reason.value });
      toast(`Решение сохранено: итог ${num(done.total_before)} → ${num(done.total_after)}`);
      rerender();
    } catch (err2) {
      toast(err2.message, 'no');
    }
  } },
  h('fieldset', { class: 'cqa-fieldset' }, h('legend', { class: 'cqa-label' }, 'Решение'),
    h('div', { class: 'cqa-radio-cards' }, radio('confirm', 'Подтвердить оценку'), options.length ? radio('change', 'Изменить оценку') : null)),
  changeSlot,
  field('Причина', reason, 'Обязательное поле. Будет видно в карточке диалога.'),
  previewEl,
  h('div', { class: 'cqa-actions' }, h('button', { class: 'cqa-btn cqa-btn--primary', type: 'submit' }, icon('check'), h('span', {}, 'Сохранить решение')))));
  drawChange();
  return box;
}

function queue(main) {
  const all = store.appeals();
  const open = all.filter((a) => a.status === 'open');
  const done = all.filter((a) => a.status !== 'open');
  main.append(h('div', { class: 'cqa-screen' },
    screenHeader('Апелляции', 'Очередь проверки: апелляции, которые ждут решения. Откройте апелляцию, чтобы подтвердить или изменить оценку.'),
    appealTabs('queue'),
    h('section', { class: 'cqa-screen__body', 'aria-label': 'На рассмотрении' },
      h('h2', { class: 'cqa-h2' }, `На рассмотрении (${open.length})`),
      open.length ? h('ul', { class: 'cqa-appeal-cards' }, open.map(appealCard))
        : emptyState('Очередь пуста', all.length ? 'Все апелляции рассмотрены. Новые появятся здесь после подачи.' : 'Апелляций ещё не было. Подайте первую из карточки диалога или во вкладке «Подать».',
          button('Подать апелляцию', { href: '#/appeals', icon: 'flag', variant: 'primary' }), 'shield')),
    done.length ? h('section', { class: 'cqa-screen__body', 'aria-label': 'Рассмотренные' },
      h('h2', { class: 'cqa-h2' }, `Рассмотренные (${done.length})`),
      h('ul', { class: 'cqa-appeal-cards' }, done.slice().reverse().map(appealCard))) : null));
}
