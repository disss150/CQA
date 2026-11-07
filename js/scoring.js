// Временный расчёт итога на клиенте. Позже переедет на сервер.
// Правила — «Порядок расчёта» из чек-листа:
//  «Да» = полный вес, «Нет» = 0; шкала: ступень / максимум шкалы × вес;
//  N/A исключается, вес применимых × 100 / сумма их весов; итог до 2 знаков;
//  нет применимых критериев с весом → итог не считается (null);
//  критерий грубой ошибки (type "gross") баллов не даёт и в сумму не входит.

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export const isScored = (c) => c.type !== 'gross';

export function scaleMax(c) {
  const values = (c.steps || []).map((s) => Number(s.value)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

/** Доля полного веса (0..1) для ответа, плюс предупреждение, если ответ некорректен. */
function ratioOf(c, answer) {
  if (answer === null || answer === undefined || answer === '') {
    return { ratio: 0, warning: 'Нет ответа — засчитано 0.' };
  }
  if (c.type === 'scale') {
    const max = scaleMax(c);
    const n = Number(answer);
    if (typeof answer !== 'number' && !(typeof answer === 'string' && answer.trim() !== '' && Number.isFinite(n))) {
      return { ratio: 0, warning: `Для шкалы нужен балл, получено «${answer}» — засчитано 0.` };
    }
    if (max <= 0) return { ratio: 0, warning: 'У шкалы нет ступени больше 0 — засчитано 0.' };
    const clamped = Math.min(Math.max(n, 0), max);
    const onScale = (c.steps || []).some((s) => Number(s.value) === n);
    return { ratio: clamped / max, warning: onScale ? null : `Балл ${n} не совпадает со ступенями шкалы.` };
  }
  if (answer === 'yes') return { ratio: 1, warning: null };
  if (answer === 'no') return { ratio: 0, warning: null };
  return { ratio: 0, warning: `Для «Да/Нет» получено «${answer}» — засчитано 0.` };
}

/**
 * @param {{criteria: Array, sections?: Array}} checklist
 * @param {Record<string|number, 'yes'|'no'|'na'|number>} answers  ответы по id критерия
 * @returns {{total: number|null, applicableWeight: number, criteria: Array, sections: Array, warnings: string[]}}
 */
export function score(checklist, answers) {
  const rows = checklist.criteria.filter(isScored).map((c) => {
    const weight = Math.max(0, Number(c.weight) || 0);
    let answer = answers[c.id];
    let warning = null;
    if (answer === 'na' && !c.na_allowed) {
      warning = 'N/A для этого критерия не разрешён — засчитано «Нет».';
      answer = 'no';
    }
    const applicable = answer !== 'na';
    const r = applicable ? ratioOf(c, answer) : { ratio: 0, warning: null };
    return { c, weight, applicable, ratio: r.ratio, warning: warning || r.warning };
  });

  const applicableWeight = rows.filter((r) => r.applicable).reduce((s, r) => s + r.weight, 0);
  const factor = applicableWeight > 0 ? 100 / applicableWeight : 0;

  const criteria = rows.map((r) => {
    const effective = r.applicable ? r.weight * factor : 0;
    return {
      id: r.c.id,
      section: r.c.section || null,
      weight: r.weight,
      applicable: r.applicable,
      effectiveWeight: round2(effective),
      rawPoints: r.ratio * effective,
      points: round2(r.ratio * effective),
      warning: r.warning,
    };
  });

  const total = applicableWeight > 0 ? round2(criteria.reduce((s, r) => s + r.rawPoints, 0)) : null;

  const order = (checklist.sections || []).map((s) => s.id);
  const names = Object.fromEntries((checklist.sections || []).map((s) => [s.id, s.name]));
  const bySection = new Map();
  for (const r of criteria) {
    const key = r.section || '';
    const acc = bySection.get(key) || { id: key || null, name: names[key] || 'Без секции', points: 0, max: 0, applicable: false };
    acc.points += r.rawPoints;
    acc.max += r.applicable ? r.weight * factor : 0;
    acc.applicable = acc.applicable || r.applicable;
    bySection.set(key, acc);
  }
  const sections = [...bySection.values()]
    .sort((a, b) => idx(order, a.id) - idx(order, b.id))
    .map((s) => ({ ...s, points: s.applicable && total !== null ? round2(s.points) : null, max: round2(s.max) }));

  const warnings = criteria.filter((r) => r.warning).map((r) => `Критерий ${r.id}: ${r.warning}`);
  return { total, applicableWeight, criteria: criteria.map(({ rawPoints, ...rest }) => rest), sections, warnings };
}

const idx = (order, id) => (order.indexOf(id) === -1 ? order.length : order.indexOf(id));

/** Флаг грубой ошибки: «Да» по любому критерию типа gross. Баллы не затрагивает. */
export function grossFlag(checklist, answers) {
  return checklist.criteria.some((c) => c.type === 'gross' && answers[c.id] === 'yes');
}
