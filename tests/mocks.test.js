// Демо-набор DEV: 20 диалогов. Каждый проверяет своё правило чек-листа.
// Итоги в results.json должны совпадать с расчётом scoring.js, доказательства — ссылаться на реальные реплики.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildResult } from '../js/results.js';
import { CONFIG } from '../js/config.js';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const checklist = read('mocks/checklist.json');
const set = read('mocks/conversations.json').data;
const mocks = read('mocks/results.json');
const conv = (id) => set.records.find((r) => r.conversation_id === id);
const mock = (id) => mocks.find((r) => r.conversation_id === id);
const ans = (id, crit) => mock(id).criteria.find((c) => c.id === crit).answer;
const calc = (id) => { const m = mock(id); return buildResult(id, checklist, m.criteria, m.gross_error.type); };

/** Секунды для «мм:сс» и ISO 8601. */
const secs = (ts) => { const m = String(ts).match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : Date.parse(ts) / 1000; };

const EXPECTED = {
  'p1-ru-001': 95.5, 'p1-kz-001': 100, 'p1-en-001': 80, 'p1-ru-002': 84.62, 'p1-ru-003': 20, 'p1-call-001': 100,
  'p1-ru-004': 63.13, 'p1-ru-005': 60, 'p1-ru-006': 89.41, 'p1-ru-007': 91.82, 'p1-ru-008': 13.75, 'p1-ru-009': 76.47,
  'p1-ru-010': 100, 'p1-ru-011': 52.94, 'p1-kz-002': 77.69, 'p1-kz-003': 92.31, 'p1-en-002': 94.12, 'p1-en-003': 33.33,
  'p1-call-002': 86.67, 'p1-call-kz-001': 95,
};

test('набор: 20 диалогов, у каждого есть результат, total_records совпадает', () => {
  assert.equal(set.records.length, 20);
  assert.equal(set.total_records, 20);
  assert.deepEqual(new Set(set.records.map((r) => r.conversation_id)), new Set(Object.keys(EXPECTED)));
  assert.deepEqual(new Set(mocks.map((r) => r.conversation_id)), new Set(Object.keys(EXPECTED)));
});

test('итог и баллы в results.json = расчёт scoring.js, секции сходятся', () => {
  for (const m of mocks) {
    const r = calc(m.conversation_id);
    assert.equal(m.total, EXPECTED[m.conversation_id], `${m.conversation_id}: ожидаемый итог`);
    assert.equal(r.total, m.total, `${m.conversation_id}: итог в моке ≠ scoring.js`);
    for (const c of m.criteria) {
      const s = r.criteria.find((x) => x.id === c.id);
      assert.equal(s.points, c.points, `${m.conversation_id} к${c.id}: баллы`);
      assert.equal(s.warning, null, `${m.conversation_id} к${c.id}: ${s.warning}`);
    }
    const sum = r.sections.reduce((s, x) => s + (x.points ?? 0), 0);
    assert.ok(Math.abs(sum - r.total) <= 0.02, `${m.conversation_id}: секции ${sum} ≠ ${r.total}`);
    assert.ok(Math.abs(r.sections.reduce((s, x) => s + x.max, 0) - 100) <= 0.02, `${m.conversation_id}: максимум ≠ 100`);
    assert.equal(r.gross_error.flag, m.gross_error.flag, `${m.conversation_id}: флаг грубой ошибки`);
  }
});

test('ответы допустимы: N/A только где разрешён и с причиной, шкала — ступени чек-листа', () => {
  for (const m of mocks) {
    assert.equal(m.criteria.length, checklist.criteria.length, `${m.conversation_id}: число критериев`);
    for (const c of m.criteria) {
      const def = checklist.criteria.find((x) => x.id === c.id);
      if (c.answer === 'na') {
        assert.ok(def.na_allowed, `${m.conversation_id} к${c.id}: N/A не разрешён`);
        assert.ok(c.na_reason, `${m.conversation_id} к${c.id}: нет причины N/A`);
      } else if (def.type === 'scale') {
        assert.ok(def.steps.some((s) => s.value === c.answer), `${m.conversation_id} к${c.id}: ${c.answer} не ступень`);
      } else assert.ok(['yes', 'no'].includes(c.answer), `${m.conversation_id} к${c.id}: ${c.answer}`);
      assert.ok(c.explanation.length > 10, `${m.conversation_id} к${c.id}: нет объяснения`);
    }
  }
});

test('доказательства, skipped_at и ссылки #n указывают на реальные реплики', () => {
  for (const m of mocks) {
    const n = conv(m.conversation_id).transcript.length;
    for (const c of m.criteria) {
      for (const e of c.evidence_ids) assert.ok(Number.isInteger(e) && e >= 1 && e <= n, `${m.conversation_id} к${c.id}: #${e} из ${n}`);
      if (c.skipped_at) assert.ok(c.skipped_at.from >= 1 && c.skipped_at.from <= c.skipped_at.to && c.skipped_at.to <= n, `${m.conversation_id} к${c.id}: skipped_at`);
      for (const [, k] of `${c.explanation} ${c.na_reason || ''}`.matchAll(/#(\d+)/g)) assert.ok(+k >= 1 && +k <= n, `${m.conversation_id} к${c.id}: ссылка #${k}`);
      if (c.answer === 'yes' && c.id !== 8 || typeof c.answer === 'number') assert.ok(c.evidence_ids.length, `${m.conversation_id} к${c.id}: нет доказательств`);
    }
  }
});

test('транскрипты: формат, порядок таймкодов, ISO 8601 у звонков, записи звонков на месте', () => {
  for (const r of set.records) {
    const times = r.transcript.map((x) => secs(x.timestamp));
    times.forEach((t, i) => {
      assert.ok(Number.isFinite(t), `${r.conversation_id} #${i + 1}: таймкод`);
      if (i) assert.ok(t >= times[i - 1], `${r.conversation_id} #${i + 1}: таймкод идёт назад`);
    });
    for (const x of r.transcript) {
      assert.ok(['client', 'operator', 'bot', 'system'].includes(x.speaker), `${r.conversation_id}: speaker ${x.speaker}`);
      assert.ok(String(x.text).trim(), `${r.conversation_id}: пустая реплика`);
    }
    if (r.channel === 'voice call') {
      assert.ok(r.transcript.every((x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(x.timestamp)), `${r.conversation_id}: не ISO 8601`);
      assert.ok(r.audio_url && existsSync(new URL(r.audio_url, root)), `${r.conversation_id}: нет записи ${r.audio_url}`);
    } else assert.equal(r.audio_url, null);
  }
});

test('разнообразие: языки, каналы, итоги', () => {
  const by = (k) => new Set(set.records.map((r) => r[k]));
  assert.deepEqual(by('language'), new Set(['RU', 'KZ', 'EN']));
  assert.deepEqual(by('channel'), new Set(['agent chat', 'voice call']));
  for (const id of ['p1-kz-001', 'p1-kz-002', 'p1-kz-003', 'p1-call-kz-001']) assert.match(conv(id).transcript.map((x) => x.text).join(' '), /[әғқңөұүһі]/i, `${id}: нет казахских букв`);
  assert.ok(new Set(mocks.map((m) => m.total)).size >= 15, 'итоги слишком похожи');
  assert.equal(mocks.filter((m) => m.gross_error.flag).length, 4);
});

test('«Для демо»: грубая ошибка, N/A, эталон, обрыв звонка', () => {
  assert.deepEqual(CONFIG.DEMO_IDS, ['p1-ru-004', 'p1-ru-007', 'p1-ru-010', 'p1-call-002']);
  for (const id of CONFIG.DEMO_IDS) assert.ok(conv(id), `${id} нет в наборе`);
});

// --- Каждый диалог проверяет своё правило ---

test('p1-ru-004: оскорбление, эмпатия «Нет»', () => {
  assert.deepEqual(mock('p1-ru-004').gross_error, { flag: true, type: 'insult' });
  assert.equal(ans('p1-ru-004', 5), 'no');
});

test('p1-ru-005: раскрытие данных родственнику, идентификация «Нет»', () => {
  assert.deepEqual(mock('p1-ru-005').gross_error, { flag: true, type: 'data_disclosure' });
  assert.equal(ans('p1-ru-005', 3), 'no');
});

test('p1-ru-006: 6 минут без ответа (порог 3 мин) → управление диалогом 4', () => {
  const t = conv('p1-ru-006').transcript;
  const c6 = mock('p1-ru-006').criteria.find((c) => c.id === 6);
  const gap = secs(t[c6.skipped_at.to - 1].timestamp) - secs(t[c6.skipped_at.from - 1].timestamp);
  assert.ok(gap > 180, `пауза ${gap} с не больше порога`);
  assert.equal(c6.answer, 4);
});

test('p1-ru-007: клиент ушёл — консультация и завершение N/A', () => {
  assert.equal(ans('p1-ru-007', 4), 'na');
  assert.equal(ans('p1-ru-007', 7), 'na');
  assert.match(conv('p1-ru-007').transcript.at(-1).text, /закрыт системой/);
});

test('p1-ru-008: оператор не подключился, чат закрыт по таймауту', () => {
  const t = conv('p1-ru-008').transcript;
  assert.ok(!t.some((x) => x.speaker === 'operator'));
  assert.match(t.at(-1).text, /таймауту/);
  assert.equal(ans('p1-ru-008', 1), 'no');
  assert.equal(ans('p1-ru-008', 7), 'no');
});

test('p1-ru-009 и p1-en-001: смена контакта без проверки → идентификация «Нет»', () => {
  assert.equal(ans('p1-ru-009', 3), 'no');
  assert.equal(ans('p1-en-001', 3), 'no');
  assert.match(conv('p1-en-001').transcript[1].text, /lost access to the old one/);
});

test('p1-ru-010: эталон из 20 реплик, итог 100', () => {
  assert.equal(conv('p1-ru-010').transcript.length, 20);
  assert.equal(calc('p1-ru-010').total, 100);
});

test('p1-ru-011: противоречивые сроки → управление 0, консультация 10', () => {
  assert.equal(ans('p1-ru-011', 6), 0);
  assert.equal(ans('p1-ru-011', 4), 10);
});

test('p1-ru-002: оператор не попрощался → завершение «Нет»', () => {
  assert.equal(ans('p1-ru-002', 7), 'no');
  assert.equal(conv('p1-ru-002').transcript.at(-1).text, 'Чат закрыт оператором');
});

test('p1-kz-002: ответ по-русски на казахский → установление контакта «Нет»', () => assert.equal(ans('p1-kz-002', 1), 'no'));
test('p1-kz-003: вопрос о тарифе → идентификация N/A', () => assert.equal(ans('p1-kz-003', 3), 'na'));
test('p1-en-002: эмпатия «Да», консультация 15', () => { assert.equal(ans('p1-en-002', 5), 'yes'); assert.equal(ans('p1-en-002', 4), 15); });
test('p1-en-003: перевод на личную карту → услуга в обход компании', () => assert.deepEqual(mock('p1-en-003').gross_error, { flag: true, type: 'bypass_service' }));
test('p1-call-002: обрыв звонка → завершение N/A', () => { assert.equal(ans('p1-call-002', 7), 'na'); assert.match(conv('p1-call-002').transcript.at(-1).text, /прерван/); });
test('p1-call-kz-001: звонок на казахском, идентификация по ИИН', () => {
  assert.equal(conv('p1-call-kz-001').language, 'KZ');
  assert.equal(ans('p1-call-kz-001', 3), 'yes');
  assert.match(conv('p1-call-kz-001').transcript[4].text, /ЖСН/);
});

// --- Голосовые сообщения: p1-ru-004 и p1-kz-002 ---
import { statSync } from 'node:fs';
import { mp3Duration, mmss } from './mp3.js';

const VOICE_IDS = ['p1-ru-004', 'p1-kz-002'];

test('голосовые: клиент и оператор — только голосом, системные и бот — текстом, в остальных диалогах голосовых нет', () => {
  for (const r of set.records) {
    for (const [i, x] of r.transcript.entries()) {
      const voiceExpected = VOICE_IDS.includes(r.conversation_id) && ['client', 'operator'].includes(x.speaker);
      assert.equal(x.type === 'voice', voiceExpected, `${r.conversation_id} #${i + 1}: type ${x.type}`);
      if (!voiceExpected) assert.ok(!('audio_url' in x) && !('duration' in x), `${r.conversation_id} #${i + 1}: лишние поля`);
    }
  }
});

test('голосовые: формат полей, файл есть, до 200 КБ, duration = длительность mp3, у каждого своя', () => {
  const seen = new Set();
  for (const id of VOICE_IDS) {
    const t = conv(id).transcript;
    for (const [i, x] of t.entries()) {
      if (x.type !== 'voice') continue;
      const n = i + 1;
      assert.equal(x.audio_url, `/audio/${id}/${n}.mp3`);
      assert.match(x.duration, /^\d{2}:\d{2}$/);
      assert.match(x.timestamp, /^\d{2}:\d{2}$/, `${id} #${n}: timestamp остаётся MM:SS`);
      assert.ok(x.text.trim().length > 1);
      const file = new URL(`public${x.audio_url}`, root);
      assert.ok(existsSync(file), `${id} #${n}: нет файла`);
      assert.ok(statSync(file).size <= 200 * 1024, `${id} #${n}: больше 200 КБ`);
      const sec = mp3Duration(readFileSync(file));
      assert.equal(x.duration, mmss(sec), `${id} #${n}: duration ${x.duration}, файл ${sec.toFixed(2)} с`);
      seen.add(sec.toFixed(2));
      // Сообщение нельзя отправить раньше, чем оно записано
      assert.ok(secs(x.timestamp) - secs(t[i - 1].timestamp) >= secs(x.duration), `${id} #${n}: пауза короче записи`);
    }
  }
  assert.equal(seen.size, 17, 'длительности должны различаться');
});

test('голосовые: оценка по тексту, интонация не оценивается; итоги не изменились', () => {
  assert.equal(calc('p1-ru-004').total, 63.13);
  assert.equal(calc('p1-kz-002').total, 77.69);
  for (const id of VOICE_IDS) {
    for (const c of mock(id).criteria) assert.match(c.explanation, /по тексту/, `${id} к${c.id}: нет пометки «по тексту»`);
    for (const k of [5, 6]) assert.match(mock(id).criteria.find((c) => c.id === k).explanation, /интонаци/, `${id} к${k}: не сказано про интонацию`);
  }
});
