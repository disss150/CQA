import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { score, round2, grossFlag } from '../js/scoring.js';

const checklist = JSON.parse(readFileSync(new URL('../mocks/checklist.json', import.meta.url), 'utf8'));
const pts = (res, id) => res.criteria.find((c) => c.id === id).points;
const eff = (res, id) => res.criteria.find((c) => c.id === id).effectiveWeight;
const ALL_YES = { 1: 'yes', 2: 'yes', 3: 'yes', 4: 20, 5: 'yes', 6: 10, 7: 'yes', 8: 'no' };

test('все критерии выполнены → 100', () => {
  assert.equal(score(checklist, ALL_YES).total, 100);
});

test('«Да» даёт полный вес, «Нет» — 0', () => {
  const res = score(checklist, { ...ALL_YES, 1: 'no', 3: 'no' });
  assert.equal(pts(res, 1), 0);
  assert.equal(pts(res, 2), 15);
  assert.equal(res.total, 70);
});

test('шкала пересчитывается пропорционально весу: критерий 6, ступень 7 → 10,5 из 15', () => {
  const res = score(checklist, { ...ALL_YES, 6: 7 });
  assert.equal(pts(res, 6), 10.5);
  assert.equal(eff(res, 6), 15);
  assert.equal(res.total, 95.5);
});

test('шкала критерия 4: каждая ступень даёт свою долю веса', () => {
  for (const [step, expected] of [[20, 20], [15, 15], [10, 10], [5, 5], [0, 0]]) {
    assert.equal(pts(score(checklist, { ...ALL_YES, 4: step }), 4), expected);
  }
});

test('шкала с весом не равным максимуму: ступень 4 из 10 при весе 15 → 6', () => {
  assert.equal(pts(score(checklist, { ...ALL_YES, 6: 4 }), 6), 6);
});

test('N/A исключает критерий и перераспределяет вес: максимум остаётся 100', () => {
  const res = score(checklist, { ...ALL_YES, 3: 'na' });
  assert.equal(res.applicableWeight, 80);
  assert.equal(eff(res, 1), 12.5);
  assert.equal(eff(res, 3), 0);
  assert.equal(res.total, 100);
  const sumEff = res.criteria.reduce((s, c) => s + c.effectiveWeight, 0);
  assert.equal(round2(sumEff), 100);
});

test('N/A + частичные ответы: пример p1-ru-002 → 84,62', () => {
  const res = score(checklist, { 1: 'yes', 2: 'na', 3: 'na', 4: 15, 5: 'yes', 6: 10, 7: 'no', 8: 'no' });
  assert.equal(res.applicableWeight, 65);
  assert.equal(pts(res, 1), 15.38);
  assert.equal(pts(res, 4), 23.08);
  assert.equal(res.total, 84.62);
});

test('N/A там, где он не разрешён, засчитывается как «Нет» с предупреждением', () => {
  const res = score(checklist, { ...ALL_YES, 1: 'na' });
  assert.equal(res.applicableWeight, 100);
  assert.equal(pts(res, 1), 0);
  assert.equal(res.total, 90);
  assert.match(res.warnings[0], /не разрешён/);
});

test('нет применимых критериев с весом → итог не считается', () => {
  const onlyNa = {
    criteria: [
      { id: 1, type: 'binary', na_allowed: true, weight: 50 },
      { id: 2, type: 'binary', na_allowed: true, weight: 50 },
      { id: 3, type: 'binary', na_allowed: false, weight: 0 },
      { id: 4, type: 'gross', weight: 0 },
    ],
  };
  const res = score(onlyNa, { 1: 'na', 2: 'na', 3: 'yes', 4: 'yes' });
  assert.equal(res.total, null);
  assert.equal(score({ criteria: [] }, {}).total, null);
});

test('итог округляется до 2 знаков', () => {
  const thirds = { criteria: [1, 2, 3].map((id) => ({ id, type: 'binary', na_allowed: false, weight: 1 })) };
  assert.equal(score(thirds, { 1: 'yes', 2: 'no', 3: 'no' }).total, 33.33);
  assert.equal(score(thirds, { 1: 'yes', 2: 'yes', 3: 'no' }).total, 66.67);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.675), 2.68);
});

test('итог считается из неокруглённых баллов', () => {
  // 3 × 33,333… = 100, а не 3 × 33,33 = 99,99
  const thirds = { criteria: [1, 2, 3].map((id) => ({ id, type: 'binary', na_allowed: false, weight: 1 })) };
  assert.equal(score(thirds, { 1: 'yes', 2: 'yes', 3: 'yes' }).total, 100);
});

test('грубая ошибка не даёт баллов и не меняет итог, но ставит флаг', () => {
  const clean = score(checklist, ALL_YES);
  const gross = score(checklist, { ...ALL_YES, 8: 'yes' });
  assert.equal(gross.total, clean.total);
  assert.equal(gross.criteria.some((c) => c.id === 8), false);
  assert.equal(grossFlag(checklist, { ...ALL_YES, 8: 'yes' }), true);
  assert.equal(grossFlag(checklist, ALL_YES), false);
});

test('сумма весов не 100 → всё равно нормируется к 100', () => {
  const cl = { criteria: [{ id: 1, type: 'binary', weight: 30 }, { id: 2, type: 'binary', weight: 20 }] };
  assert.equal(score(cl, { 1: 'yes', 2: 'no' }).total, 60);
});

test('балл вне шкалы ограничивается максимумом и даёт предупреждение', () => {
  const res = score(checklist, { ...ALL_YES, 6: 12 });
  assert.equal(pts(res, 6), 15);
  assert.ok(res.warnings.some((w) => w.includes('не совпадает')));
});

test('пустой ответ засчитывается как 0 с предупреждением', () => {
  const { 5: _, ...rest } = ALL_YES;
  const res = score(checklist, rest);
  assert.equal(pts(res, 5), 0);
  assert.equal(res.total, 85);
});

test('итоги по секциям', () => {
  const res = score(checklist, { 1: 'yes', 2: 'na', 3: 'na', 4: 15, 5: 'yes', 6: 10, 7: 'no', 8: 'no' });
  const start = res.sections.find((s) => s.id === 'start');
  assert.equal(start.points, 15.38);
  assert.equal(start.max, 15.38);
  assert.equal(res.sections.some((s) => s.id === 'gross'), false);
});
