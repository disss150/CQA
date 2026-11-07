import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResult, applyDecisions } from '../js/results.js';
import { explainTotal, shortReason } from '../js/explain.js';
import { toCsv, dialogRows, dialogJson } from '../js/export.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const checklist = read('../mocks/checklist.json');
const mocks = read('../mocks/results.json');
const conversations = read('../mocks/conversations.json').data.records;
const result = (id) => {
  const m = mocks.find((r) => r.conversation_id === id);
  return buildResult(id, checklist, m.criteria, m.gross_error.type);
};
const record = (id) => ({ evaluation_id: `${id}@t`, conversation_id: id, checklist, evaluated_at: '2026-11-07T10:00:00Z', result: result(id) });

test('моки: p1-ru-001 — итог 95,5, секции 25 / 40 / 30,5', () => {
  const r = result('p1-ru-001');
  assert.equal(r.total, 95.5);
  assert.deepEqual(r.sections.map((s) => s.points), [25, 40, 30.5]);
  assert.equal(r.criteria.find((c) => c.id === 6).points, 10.5);
});

test('моки: все ссылки на реплики существуют', () => {
  for (const m of mocks) {
    const n = conversations.find((c) => c.conversation_id === m.conversation_id).transcript.length;
    for (const c of m.criteria) {
      const refs = [...`${c.explanation} ${c.na_reason || ''}`.matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
      for (const k of [...refs, ...c.evidence_ids]) assert.ok(k >= 1 && k <= n, `${m.conversation_id} критерий ${c.id}: #${k} вне диалога`);
    }
  }
});

test('«Почему такой итог»: снижение по критерию 6 с потерей 4,5', () => {
  const lines = explainTotal(checklist, result('p1-ru-001'));
  const down = lines.find((l) => l.tone === 'down');
  assert.match(down.text, /Ведение и завершение диалога — 30,5 из 35/);
  assert.match(down.items[0], /^Критерий 6 .* −4,5: один заметный сбой/);
  assert.equal(lines.filter((l) => l.tone === 'ok').length, 2);
});

test('«Почему такой итог»: N/A и грубая ошибка', () => {
  const na = explainTotal(checklist, result('p1-ru-002'));
  assert.ok(na.some((l) => l.tone === 'na' && /Критерий 3 «Идентификация» — N\/A, вес 20 перераспределён/.test(l.text)));
  const gross = explainTotal(checklist, result('p1-ru-003'));
  assert.ok(gross.some((l) => /Грубая ошибка: Предложение платной услуги в обход компании\. На балл не влияет/.test(l.text)));
});

test('«Почему такой итог»: отмечает решение проверяющего', () => {
  const rec = record('p1-ru-001');
  const appeal = { id: 'A-001', evaluation_id: rec.evaluation_id, criterion_id: 6, status: 'changed', decision: { answer: 10 } };
  const final = applyDecisions(rec, [appeal]);
  assert.equal(final.total, 100);
  assert.ok(explainTotal(checklist, final).some((l) => l.text.includes('изменён проверяющим по апелляции A-001')));
});

test('shortReason: первое предложение без ссылок, с ограничением длины', () => {
  assert.equal(shortReason('Оператор извинился (#5). Потом ещё.'), 'Оператор извинился');
  assert.equal(shortReason('а'.repeat(200), 10), `${'а'.repeat(9)}…`);
});

test('CSV: разделитель «;», кавычки, защита от формул, казахские буквы', () => {
  const csv = toCsv([{ a: 'x;y', b: 'он сказал "да"', c: '=СУММ(A1)', d: 'Әсел Қазан' }], [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]);
  const [head, row] = csv.split('\r\n');
  assert.equal(head, 'A;B;C;D');
  assert.equal(row, '"x;y";"он сказал ""да""";\'=СУММ(A1);Әсел Қазан');
});

test('CSV диалога: строка на критерий, десятичная запятая, итоги', () => {
  const rec = record('p1-ru-001');
  const rows = dialogRows({ conversation: conversations[0], record: rec, final: rec.result });
  assert.equal(rows.length, 8);
  const c6 = rows.find((r) => r.criterion_id === 6);
  assert.equal(c6.points, '10,5');
  assert.equal(c6.evidence, '#10 #11');
  assert.equal(c6.skipped_at, '#10–#11');
  assert.equal(c6.total, '95,5');
});

test('JSON диалога: формат результата API и модель', () => {
  const rec = record('p1-ru-003');
  const json = dialogJson({ conversation: conversations[4], record: rec, final: rec.result, appeals: [], groupId: 'DEV' });
  assert.equal(json.result.total, 20);
  assert.deepEqual(json.result.gross_error, { flag: true, type: 'bypass_service' });
  assert.deepEqual(Object.keys(json.result.criteria[0]).sort(), ['answer', 'effective_weight', 'evidence_ids', 'explanation', 'id', 'na_reason', 'points', 'skipped_at', 'weight']);
  assert.ok('cost_per_evaluation' in json.model);
});

test('все диалоги: сумма секций = итог, максимум после N/A = 100', () => {
  const expected = { 'p1-ru-001': 95.5, 'p1-kz-001': 100, 'p1-en-001': 80, 'p1-ru-002': 84.62, 'p1-ru-003': 20, 'p1-call-001': 100 };
  // Полный набор из 20 диалогов проверяет tests/mocks.test.js
  for (const m of mocks.filter((x) => x.conversation_id in expected)) {
    const r = result(m.conversation_id);
    assert.equal(r.total, expected[m.conversation_id], `${m.conversation_id}: итог`);
    const sumPoints = r.sections.reduce((s, x) => s + (x.points ?? 0), 0);
    const sumMax = r.sections.reduce((s, x) => s + x.max, 0);
    const sumEff = r.criteria.filter((c) => c.id !== 8).reduce((s, c) => s + c.effective_weight, 0);
    assert.ok(Math.abs(sumPoints - r.total) <= 0.02, `${m.conversation_id}: секции ${sumPoints} ≠ итог ${r.total}`);
    assert.ok(Math.abs(sumMax - 100) <= 0.02, `${m.conversation_id}: максимум секций ${sumMax}`);
    assert.ok(Math.abs(sumEff - 100) <= 0.02, `${m.conversation_id}: веса после N/A ${sumEff}`);
    for (const c of r.criteria.filter((x) => x.answer === 'na')) assert.equal(c.effective_weight, 0, `${m.conversation_id}: N/A с весом`);
  }
});

test('звонок p1-call-001: идентификация N/A с причиной и доказательствами', () => {
  const c3 = mocks.find((m) => m.conversation_id === 'p1-call-001').criteria.find((c) => c.id === 3);
  assert.equal(c3.answer, 'na');
  assert.match(c3.na_reason, /защищённого действия/);
  assert.deepEqual(c3.evidence_ids, [4, 7, 8]);
});
