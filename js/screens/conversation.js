// Экран 4. Карточка диалога: транскрипт слева, результат справа.
import { h, icon, num, go, badge, statusBadge, button, answerBadge, formatDate, skeleton, errorState, emptyState, exportMenu, CHANNELS, LANGS, STATUSES, APPEAL_STATUSES } from '../ui.js';
import { getConversation, evaluate } from '../api.js';
import { store } from '../store.js';
import { exportDialog } from '../export.js';
import { createTranscript } from '../components/transcript.js';
import { renderResult } from '../components/result-view.js';

export async function render(main, route) {
  const id = route.param;
  const view = h('div', { class: 'cqa-screen' });
  main.append(view);

  const load = async () => {
    view.replaceChildren(skeleton('card', 'Загружаем диалог…'));
    let conv;
    try {
      conv = await getConversation(id, store.groupId);
    } catch (e) {
      view.replaceChildren(errorState(e.message, load));
      return;
    }
    if (!conv) {
      view.replaceChildren(emptyState('Диалог не найден', `Диалога «${id}» нет в наборе ${store.groupId}. Возможно, ссылка устарела или выбран другой набор.`, button('К списку диалогов', { href: '#/list', icon: 'arrowLeft', variant: 'primary' }), 'search'));
      return;
    }
    draw(conv);
  };

  function draw(conv) {
    const transcript = createTranscript(conv);
    const panel = h('div', { class: 'cqa-panel' });
    const statusSlot = h('span');
    const actions = h('div', { class: 'cqa-actions' });

    const head = h('header', { class: 'cqa-screen__head' },
      h('div', { class: 'cqa-screen__titles' },
        h('a', { class: 'cqa-back', href: '#/list' }, icon('arrowLeft', null, 16), 'К списку'),
        h('h1', { class: 'cqa-h1 cqa-mono', tabindex: '-1' }, conv.conversation_id),
        h('p', { class: 'cqa-chips' },
          badge(CHANNELS[conv.channel] || conv.channel, 'info', conv.channel === 'voice call' ? 'phone' : 'chat'),
          badge(`${conv.language} · ${LANGS[conv.language] || ''}`.trim(), 'muted'),
          badge(`${conv.transcript.length} реплик`, 'muted'),
          voiceCount(conv) ? badge(`голосовых: ${voiceCount(conv)}`, 'muted', 'mic') : null,
          statusSlot)),
      actions);

    const onEvidence = (target) => transcript.show(target, { seekAudio: true });
    const onAppeal = (critId) => go(`#/appeals?conv=${encodeURIComponent(id)}&crit=${critId}`);
    const item = () => ({ conversation: conv, record: store.getRecord(id), final: store.finalResult(id), appeals: store.appealsFor(id), groupId: store.groupId });

    function renderPanel() {
      statusSlot.replaceChildren(statusBadge(store.status(id)));
      const rec = store.getRecord(id);
      actions.replaceChildren(...(rec ? [
        exportMenu((format) => exportDialog(item(), format)),
        button('Переоценить', { icon: 'zap', href: `#/evaluate/${encodeURIComponent(id)}` }),
      ] : []));
      if (!rec) {
        const cl = store.activeChecklist();
        panel.replaceChildren(emptyState('Диалог ещё не оценён', `Запустите оценку по активному чек-листу «${cl.name}» v${cl.version}, чтобы увидеть баллы и доказательства.`,
          button('Оценить', { icon: 'zap', variant: 'primary', onclick: run }), 'zap'));
        return;
      }
      const appeals = store.appealsFor(id);
      panel.replaceChildren(...[
        renderResult({ record: rec, final: store.finalResult(id), conversation: conv, appeals, onEvidence, onAppeal }),
        appealsHistory(rec, appeals),
        rec.previous ? h('p', { class: 'cqa-hint' }, `Предыдущая оценка: итог ${num(rec.previous.total)} по «${rec.previous.checklist_name}» v${rec.previous.checklist_version} (${formatDate(rec.previous.evaluated_at)}).`) : null,
      ].filter(Boolean));
    }

    async function run() {
      panel.replaceChildren(skeleton('result', 'Оцениваем диалог…'));
      try {
        const cl = store.activeChecklist();
        store.saveEvaluation(id, cl, await evaluate(conv, cl));
        renderPanel();
      } catch (e) {
        panel.replaceChildren(errorState(e.message, run, 'Оценка не выполнена'));
      }
    }

    view.replaceChildren(head, h('div', { class: 'cqa-split' },
      h('div', { class: 'cqa-split__left' }, transcript.el),
      h('div', { class: 'cqa-split__right' }, panel)));
    renderPanel();

    // Переход по ссылке на доказательство: ?r=3,5 или ?from=2&to=5
    const r = route.query.get('r');
    const from = Number(route.query.get('from'));
    if (r) requestAnimationFrame(() => transcript.show(r.split(',').map(Number).filter(Boolean), { seekAudio: true }));
    else if (from) requestAnimationFrame(() => transcript.show({ from, to: Number(route.query.get('to')) || from }));
  }

  await load();
}

function appealsHistory(rec, appeals) {
  if (!appeals.length) return null;
  return h('section', { class: 'cqa-card', 'aria-label': 'Апелляции по диалогу' },
    h('h2', { class: 'cqa-h2' }, 'Апелляции'),
    h('ol', { class: 'cqa-history__list' }, appeals.map((a) => {
      const def = a.criterion;
      const st = APPEAL_STATUSES[a.status];
      return h('li', { class: 'cqa-history__item' },
        h('p', {}, h('strong', {}, `${a.id} · ${a.criterion_name}`), badge(st.label, st.tone),
          a.evaluation_id !== rec.evaluation_id ? badge('к прежней оценке', 'muted') : null),
        h('p', {}, 'Исходная оценка: ', answerBadge(def, a.original.answer), def.type === 'gross' ? '' : `${num(a.original.points)} б.`),
        a.decision
          ? h('p', {}, 'Решение: ', a.decision.action === 'change' ? ['изменено на ', answerBadge(def, a.decision.answer)] : 'оценка подтверждена', h('span', { class: 'cqa-hint' }, `причина: ${a.decision.reason}`))
          : h('p', { class: 'cqa-hint' }, `Комментарий: ${a.comment}`),
        a.decision ? h('p', {}, 'Итог: ', h('strong', {}, num(a.total_before)), icon('arrowRight', null, 14), h('strong', {}, num(a.total_after))) : null,
        h('a', { href: `#/review/${a.id}` }, a.status === 'open' ? 'Рассмотреть' : 'Подробнее о решении'));
    })));
}

const voiceCount = (conv) => conv.transcript.filter((r) => r.type === 'voice').length;
