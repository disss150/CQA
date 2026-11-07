// Результат оценки: быстрый итог, критерии с доказательствами, итоговый блок и «Почему такой итог».
import { h, icon, num, badge, button, answerBadge, answerInfo, grossBanner, formatDate, progress, linkifyRefs, copyEvidenceLink, SPEAKERS, timeline, APPEAL_STATUSES } from '../ui.js';
import { GROSS_TYPES } from '../results.js';
import { explainTotal } from '../explain.js';
import { countUp } from '../motion.js';
import { celebrateOnce } from '../fx.js';

/**
 * Кольцевой индикатор итога: два полукруга поворачиваются (только transform), счётчик идёт 900 мс.
 * При 100 баллах — однократный салют зелёными частицами (один раз на оценку).
 */
function totalRing(total, key) {
  const p = total === null ? 0 : Math.max(0, Math.min(1, total / 100));
  const tone = total === null ? 'na' : total >= 90 ? 'yes' : total >= 60 ? 'partial' : 'no';
  const d1 = p > 0 ? Math.round((900 * Math.min(p, 0.5)) / p) : 0;
  const el = h('div', {
    class: `cqa-ring cqa-ring--${tone}`, role: 'img', 'aria-label': `Итог ${num(total)} из 100`,
    style: `--cqa-r1:${(Math.min(p, 0.5) * 360).toFixed(1)}deg;--cqa-r2:${(Math.max(p - 0.5, 0) * 360).toFixed(1)}deg;--cqa-d1:${d1}ms;--cqa-d2:${900 - d1}ms`,
  },
  h('span', { class: 'cqa-ring__half cqa-ring__half--r' }, h('span', { class: 'cqa-ring__fill' })),
  h('span', { class: 'cqa-ring__half cqa-ring__half--l' }, h('span', { class: 'cqa-ring__fill' })),
  h('span', { class: 'cqa-ring__hole' }, h('span', { class: 'cqa-quick__value' }, countUp(total, { key, format: num, duration: 900 })), h('small', {}, 'из 100')));
  if (total === 100) {
    setTimeout(() => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      celebrateOnce(key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }, 900);
  }
  return el;
}

/**
 * @param {object} o
 * @param {object} o.record        запись из store (исходная оценка + снимок чек-листа)
 * @param {object} o.final         результат с учётом решений проверяющего
 * @param {object} [o.conversation] для цитат доказательств
 * @param {Array}  [o.appeals]
 * @param {(target) => void} [o.onEvidence]  target — номера реплик или {from,to}
 * @param {(criterionId) => void} [o.onAppeal]
 */
export function renderResult({ record, final, conversation, appeals = [], onEvidence, onAppeal }) {
  const cl = record.checklist;
  const original = record.result;
  const times = conversation ? timeline(conversation) : [];
  const own = appeals.filter((a) => a.evaluation_id === record.evaluation_id);
  const changedTotal = original.total !== final.total || own.some((a) => a.status !== 'open');
  const summaryId = `cqa-sum-${record.conversation_id.replace(/[^\w-]/g, '')}`;

  const evidenceItem = (n) => {
    const r = conversation?.transcript[n - 1];
    return h('li', { class: 'cqa-evidence' },
      h('button', { class: 'cqa-evidence__open', type: 'button', onclick: () => onEvidence?.([n]), 'aria-label': `Показать реплику ${n} в транскрипте` },
        h('span', { class: 'cqa-evidence__ref' }, icon('arrowRight', null, 12), `#${n}`, r ? ` · ${SPEAKERS[r.speaker] || r.speaker} · ${times[n - 1]?.display}` : ''),
        r ? h('span', { class: 'cqa-evidence__quote', lang: conversation.language === 'KZ' ? 'kk' : conversation.language === 'EN' ? 'en' : 'ru' }, `«${r.text}»`) : null),
      h('button', { type: 'button', class: 'cqa-replica__tool cqa-replica__tool--icon', onclick: () => copyEvidenceLink(record.conversation_id, n), 'aria-label': `Скопировать ссылку на реплику #${n}`, title: 'Скопировать ссылку на доказательство' }, icon('link', null, 14)));
  };

  const criterionCard = (c) => {
    const fc = final.criteria.find((x) => x.id === c.id) || {};
    const oc = original.criteria.find((x) => x.id === c.id) || {};
    const appeal = [...own].reverse().find((a) => a.criterion_id === c.id);
    const isGross = c.type === 'gross';
    const tone = answerInfo(c, fc.answer).tone;
    const weightChip = isGross
      ? h('span', { class: 'cqa-chip' }, 'без баллов')
      : fc.answer === 'na'
        ? h('span', { class: 'cqa-chip' }, `вес ${num(c.weight)} → перераспределён`)
        : h('span', { class: 'cqa-chip' }, Math.abs((fc.effective_weight || 0) - (Number(c.weight) || 0)) > 0.005 ? `вес ${num(c.weight)} → ${num(fc.effective_weight)}` : `вес ${num(c.weight)}`);

    return h('li', { class: `cqa-crit cqa-crit--${tone}` },
      h('div', { class: 'cqa-crit__head' },
        h('div', { class: 'cqa-crit__title' },
          h('h3', { class: 'cqa-h3 cqa-crit__name' }, h('span', { class: 'cqa-crit__num' }, String(c.id).padStart(2, '0')), c.name),
          h('div', { class: 'cqa-inline' }, answerBadge(c, fc.answer), fc.stub ? badge('Предварительно', 'warn', 'info') : null)),
        h('div', { class: 'cqa-crit__score' },
          isGross || fc.answer === 'na'
            ? h('span', { class: 'cqa-points cqa-points--none' }, isGross ? '—' : 'N/A')
            : h('span', { class: 'cqa-points' }, h('span', { class: 'cqa-points__value' }, num(fc.points)), h('span', { class: 'cqa-points__max' }, `/${num(fc.effective_weight)}`)),
          weightChip)),
      fc.overridden
        ? h('p', { class: 'cqa-override' }, icon('shield', null, 14), 'Исходно ', answerBadge(c, oc.answer), ` ${num(oc.points)} б. → решение проверяющего `, answerBadge(c, fc.answer))
        : null,
      fc.explanation ? h('p', { class: 'cqa-crit__text' }, linkifyRefs(fc.explanation, onEvidence)) : null,
      fc.answer === 'na' && fc.na_reason ? h('p', { class: 'cqa-note cqa-note--na' }, icon('minusCircle', null, 16), h('span', {}, h('strong', {}, 'Причина N/A: '), linkifyRefs(fc.na_reason, onEvidence))) : null,
      isGross && fc.answer === 'yes' ? h('p', { class: 'cqa-note cqa-note--no' }, icon('alert', null, 16), h('span', {}, h('strong', {}, 'Тип: '), GROSS_TYPES[final.gross_error.type] || 'не указан')) : null,
      fc.skipped_at
        ? h('p', { class: 'cqa-note' }, icon('search', null, 16), h('span', {},
          h('strong', {}, isGross ? 'Проверенный участок: ' : 'Действие пропущено. Проверенный участок: '),
          h('button', { class: 'cqa-link', type: 'button', onclick: () => onEvidence?.(fc.skipped_at) }, `реплики #${fc.skipped_at.from}–#${fc.skipped_at.to}`)))
        : null,
      fc.evidence_ids?.length ? h('ul', { class: 'cqa-evidence-list', 'aria-label': 'Реплики-доказательства' }, fc.evidence_ids.map(evidenceItem)) : null,
      fc.warning ? h('p', { class: 'cqa-note cqa-note--warn' }, icon('alert', null, 16), fc.warning) : null,
      appeal || onAppeal
        ? h('div', { class: 'cqa-crit__footer' },
          appeal ? h('span', { class: 'cqa-inline' }, badge(`${appeal.id}: ${APPEAL_STATUSES[appeal.status].label}`, APPEAL_STATUSES[appeal.status].tone, 'flag'), appeal.decision ? h('span', { class: 'cqa-hint' }, appeal.decision.reason) : null) : h('span'),
          onAppeal && (!appeal || appeal.status !== 'open') ? button(appeal ? 'Оспорить ещё раз' : 'Оспорить', { icon: 'flag', size: 'sm', variant: 'ghost', onclick: () => onAppeal(c.id) }) : null)
        : null);
  };

  const sectionName = Object.fromEntries((cl.sections || []).map((s) => [s.id, s.name]));
  const groups = [];
  for (const c of cl.criteria) {
    const key = c.section || '';
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(c);
    else groups.push({ key, items: [c] });
  }

  const why = explainTotal(cl, final);
  const WHY_ICON = { ok: 'checkCircle', down: 'xCircle', na: 'minusCircle', info: 'info' };

  return h('div', { class: 'cqa-result' },
    // Быстрый итог сверху: сразу видно балл и флаг, подробный разбор — внизу
    h('div', { class: 'cqa-card cqa-quick' },
      h('div', { class: 'cqa-quick__score' },
        totalRing(final.total, `ring-${record.evaluation_id}-${final.total}`),
        h('span', { class: 'cqa-quick__label' }, changedTotal ? 'Финальный итог' : 'Итог')),
      final.gross_error.flag ? badge('Грубая ошибка', 'no', 'alert') : badge('Грубых ошибок нет', 'yes', 'check'),
      h('button', { type: 'button', class: 'cqa-link cqa-quick__why', onclick: () => document.getElementById(summaryId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Почему такой итог')),
    grossBanner(final.gross_error),
    h('p', { class: 'cqa-muted cqa-result__meta' },
      `Чек-лист «${cl.name}», версия ${cl.version} · оценено ${formatDate(record.evaluated_at)}`, original.meta?.source === 'mock' ? ' · источник: моки' : ''),
    final.criteria.some((c) => c.stub) ? h('p', { class: 'cqa-note cqa-note--warn' }, icon('info', null, 16), 'Для новых критериев в демо-данных нет готовых ответов — показана предварительная оценка.') : null,
    groups.map((g) => h('section', { class: 'cqa-result__group' },
      h('h2', { class: 'cqa-eyebrow' }, sectionName[g.key] || 'Без секции'),
      h('ol', { class: 'cqa-crit-list' }, g.items.map(criterionCard)))),

    h('section', { class: 'cqa-card cqa-summary', id: summaryId, 'aria-label': 'Итог оценки' },
      h('div', { class: 'cqa-total' },
        h('span', { class: 'cqa-eyebrow' }, changedTotal ? 'Финальный итог' : 'Итог'),
        h('div', { class: 'cqa-total__row' },
          h('span', {}, h('span', { class: 'cqa-total__value' }, countUp(final.total, { key: `total-${record.evaluation_id}-${final.total}`, format: num, duration: 900 })), h('span', { class: 'cqa-total__max' }, final.total === null ? ' нет применимых критериев' : ' / 100')),
          changedTotal ? h('span', { class: 'cqa-inline cqa-hint' }, 'Исходный ', h('strong', {}, num(original.total)), icon('arrowRight', null, 14), 'после апелляций ', h('strong', {}, num(final.total))) : null),
        progress(final.total, 100, null, 'Итоговый балл')),
      final.sections?.length
        ? h('div', { class: 'cqa-sections' }, final.sections.map((s) => h('div', { class: 'cqa-section-stat' },
          h('div', { class: 'cqa-section-stat__head' }, h('span', {}, s.name), h('span', {}, s.points === null ? 'N/A' : `${num(s.points)} / ${num(s.max)}`)),
          progress(s.points, s.max, s.points === null ? 'na' : null, s.name))))
        : null,
      h('div', { class: `cqa-flag${final.gross_error.flag ? ' cqa-flag--on' : ''}` }, icon(final.gross_error.flag ? 'alert' : 'checkCircle', null, 16),
        final.gross_error.flag ? `Грубая ошибка: ${GROSS_TYPES[final.gross_error.type] || 'тип не указан'}` : 'Грубая ошибка: нет'),
      h('div', { class: 'cqa-why' },
        h('h3', { class: 'cqa-h3' }, 'Почему такой итог'),
        h('ul', { class: 'cqa-why__list' }, why.map((l) => h('li', { class: `cqa-why__item cqa-why__item--${l.tone}` }, icon(WHY_ICON[l.tone], null, 16),
          h('div', {}, l.text, l.items ? h('ul', { class: 'cqa-why__list' }, l.items.map((t) => h('li', {}, t))) : null)))))));
}
