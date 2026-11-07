// Сборка результата оценки и пересчёт после решений по апелляциям.
import { score } from './scoring.js';

export const GROSS_TYPES = {
  insult: 'Оскорбление клиента',
  bypass_service: 'Предложение платной услуги в обход компании',
  data_disclosure: 'Раскрытие конфиденциальной информации',
};

/**
 * Собирает результат в формате API: баллы и итог считает scoring.js.
 * items — [{ id, answer, explanation, evidence_ids, skipped_at, na_reason, ... }]
 */
export function buildResult(conversationId, checklist, items, grossType = null) {
  const byItem = new Map(items.map((i) => [i.id, i]));
  const answers = Object.fromEntries(items.map((i) => [i.id, i.answer]));
  const s = score(checklist, answers);
  const scored = new Map(s.criteria.map((r) => [r.id, r]));

  const criteria = checklist.criteria.map((c) => {
    const it = byItem.get(c.id) || {};
    const r = scored.get(c.id);
    return {
      ...it,
      id: c.id,
      answer: it.answer ?? null,
      points: r ? r.points : 0,
      weight: Number(c.weight) || 0,
      effective_weight: r ? r.effectiveWeight : 0,
      explanation: it.explanation || '',
      evidence_ids: it.evidence_ids || [],
      skipped_at: it.skipped_at || null,
      na_reason: it.na_reason || null,
      warning: r ? r.warning : null,
    };
  });

  const flag = checklist.criteria.some((c) => c.type === 'gross' && answers[c.id] === 'yes');
  return {
    conversation_id: conversationId,
    criteria,
    gross_error: { flag, type: flag ? grossType : null },
    total: s.total,
    sections: s.sections,
  };
}

/** Финальный результат: исходная оценка + изменённые проверяющим ответы. */
export function applyDecisions(record, appeals) {
  const changed = appeals.filter((a) => a.evaluation_id === record.evaluation_id && a.status === 'changed');
  if (!changed.length) return record.result;
  let grossType = record.result.gross_error.type;
  const items = record.result.criteria.map((c) => {
    const a = changed.findLast((x) => x.criterion_id === c.id); // действует последнее решение
    if (!a) return c;
    if (a.decision.gross_type) grossType = a.decision.gross_type;
    return { ...c, answer: a.decision.answer, overridden: { from: c.answer, appeal_id: a.id } };
  });
  return buildResult(record.conversation_id, record.checklist, items, grossType);
}
