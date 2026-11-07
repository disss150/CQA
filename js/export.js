// Экспорт результатов в JSON и CSV. Сборка строк — чистые функции (тестируются в Node).
import { CONFIG } from './config.js';
import { GROSS_TYPES } from './results.js';

const ANSWER = { yes: 'Да', no: 'Нет', na: 'N/A' };
const answerText = (a) => (a === null || a === undefined ? '' : ANSWER[a] ?? String(a));
const decimal = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

/**
 * Один диалог в виде объекта для JSON.
 * item: { conversation, record, final, appeals, groupId }
 */
export function dialogJson({ conversation, record, final, appeals = [], groupId }) {
  return {
    conversation_id: record.conversation_id,
    dataset_group_id: groupId,
    channel: conversation?.channel ?? null,
    language: conversation?.language ?? null,
    checklist: { id: record.checklist.id, name: record.checklist.name, version: record.checklist.version },
    evaluated_at: record.evaluated_at,
    model: { name: CONFIG.MODEL.name, cost_per_evaluation: CONFIG.MODEL.costPerEvaluation, currency: CONFIG.MODEL.currency },
    result: strip(record.result),
    final_result: strip(final),
    appeals: appeals.filter((a) => a.evaluation_id === record.evaluation_id).map((a) => ({
      id: a.id, criterion_id: a.criterion_id, status: a.status, comment: a.comment, created_at: a.created_at,
      original_answer: a.original.answer, decision: a.decision, total_before: a.total_before, total_after: a.total_after,
    })),
  };
}

// Формат результата API: без служебных полей интерфейса.
function strip(r) {
  return {
    conversation_id: r.conversation_id,
    criteria: r.criteria.map(({ id, answer, points, weight, effective_weight, explanation, evidence_ids, skipped_at, na_reason }) =>
      ({ id, answer, points, weight, effective_weight, explanation, evidence_ids, skipped_at, na_reason })),
    gross_error: r.gross_error,
    total: r.total,
  };
}

export function setJson(items, groupId, notEvaluated = []) {
  return {
    dataset_group_id: groupId,
    exported_at: new Date().toISOString(),
    evaluated: items.length,
    not_evaluated: notEvaluated,
    dialogs: items.map(dialogJson),
  };
}

export const CSV_COLUMNS = [
  ['conversation_id', 'ID диалога'], ['channel', 'Канал'], ['language', 'Язык'], ['checklist', 'Чек-лист'], ['checklist_version', 'Версия'],
  ['evaluated_at', 'Оценено'], ['criterion_id', '№ критерия'], ['criterion', 'Критерий'], ['answer', 'Ответ'], ['final_answer', 'Ответ после апелляций'],
  ['points', 'Баллы'], ['final_points', 'Баллы после апелляций'], ['weight', 'Вес'], ['effective_weight', 'Вес после N/A'],
  ['explanation', 'Обоснование'], ['evidence', 'Реплики-доказательства'], ['skipped_at', 'Проверенный участок'], ['na_reason', 'Причина N/A'],
  ['total', 'Итог'], ['final_total', 'Финальный итог'], ['gross_error', 'Грубая ошибка'],
];

/** Строки CSV: одна строка на критерий. */
export function dialogRows({ conversation, record, final }) {
  const cl = record.checklist;
  return cl.criteria.map((def) => {
    const o = record.result.criteria.find((c) => c.id === def.id) || {};
    const f = final.criteria.find((c) => c.id === def.id) || {};
    return {
      conversation_id: record.conversation_id,
      channel: conversation?.channel ?? '',
      language: conversation?.language ?? '',
      checklist: cl.name,
      checklist_version: cl.version,
      evaluated_at: record.evaluated_at,
      criterion_id: def.id,
      criterion: def.name,
      answer: answerText(o.answer),
      final_answer: answerText(f.answer),
      points: def.type === 'gross' ? '' : decimal(o.points),
      final_points: def.type === 'gross' ? '' : decimal(f.points),
      weight: decimal(def.weight),
      effective_weight: def.type === 'gross' ? '' : decimal(f.effective_weight),
      explanation: f.explanation || '',
      evidence: (f.evidence_ids || []).map((n) => `#${n}`).join(' '),
      skipped_at: f.skipped_at ? `#${f.skipped_at.from}–#${f.skipped_at.to}` : '',
      na_reason: f.na_reason || '',
      total: decimal(record.result.total),
      final_total: decimal(final.total),
      gross_error: final.gross_error.flag ? GROSS_TYPES[final.gross_error.type] || 'да' : 'нет',
    };
  });
}

/** CSV для Excel с русской локалью: разделитель «;», текст в кавычках, защита от формул. */
export function toCsv(rows, columns = CSV_COLUMNS) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(([, title]) => cell(title)).join(';')];
  for (const r of rows) lines.push(columns.map(([key]) => cell(r[key])).join(';'));
  return lines.join('\r\n');
}

/** Скачать файл в браузере. BOM — чтобы Excel открыл CSV в UTF-8 (казахские буквы). */
export function download(filename, text, mime) {
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' : '', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  (document.getElementById('cqa-root') || document.body).append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export function exportDialog(item, format) {
  const base = `cqa-${item.record.conversation_id}-${stamp()}`;
  if (format === 'csv') download(`${base}.csv`, toCsv(dialogRows(item)), 'text/csv;charset=utf-8');
  else download(`${base}.json`, JSON.stringify(dialogJson(item), null, 2), 'application/json');
}

export function exportSet(items, groupId, notEvaluated, format) {
  const base = `cqa-${groupId}-${stamp()}`;
  if (format === 'csv') download(`${base}.csv`, toCsv(items.flatMap(dialogRows)), 'text/csv;charset=utf-8');
  else download(`${base}.json`, JSON.stringify(setJson(items, groupId, notEvaluated), null, 2), 'application/json');
}
