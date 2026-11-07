// API-клиент — единственная точка связи с данными.
// Режим выбирается CONFIG.DATA_SOURCE. В режиме 'api' браузер ходит только на свой сервер (CONFIG.API_BASE).
import { CONFIG } from './config.js';
import { buildResult } from './results.js';
import { scaleMax } from './scoring.js';

const isMock = () => CONFIG.DATA_SOURCE !== 'api';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Для проверки состояний экранов: ?cqa_mock=error | empty
const scenario = (() => {
  try { return new URLSearchParams(window.location.search).get('cqa_mock') || ''; } catch { return ''; }
})();

async function getJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  } catch {
    throw new Error('Нет связи с сервером. Откройте приложение через статический сервер (например, npx serve).');
  }
  if (!res.ok) throw new Error(`Сервер ответил ${res.status} ${res.statusText}`.trim());
  try { return await res.json(); } catch { throw new Error('Сервер вернул ответ не в формате JSON.'); }
}

function unwrap(payload) {
  if (!payload || payload.isSuccess !== true) throw new Error(payload?.error || 'Запрос не выполнен (isSuccess = false).');
  const records = payload.data?.records;
  if (!Array.isArray(records)) throw new Error('В ответе нет массива data.records.');
  return { groupId: payload.data.dataset_group_id, total: payload.data.total_records ?? records.length, records };
}

const sets = new Map(); // group_id → Promise<{groupId,total,records}>

/** Набор диалогов по group_id. Кэшируется; force — перезапросить. */
export function getConversations(groupId = CONFIG.GROUP_ID, { force = false } = {}) {
  if (force || !sets.has(groupId)) {
    const p = loadSet(groupId);
    sets.set(groupId, p);
    p.catch(() => sets.delete(groupId));
  }
  return sets.get(groupId);
}

async function loadSet(groupId) {
  if (!isMock()) {
    return unwrap(await getJson(`${CONFIG.API_BASE}/conversations?group_id=${encodeURIComponent(groupId)}`));
  }
  await wait(CONFIG.MOCK_DELAY_MS / 2);
  if (scenario === 'error') throw new Error('Мок-ошибка: сервер данных недоступен (cqa_mock=error).');
  const data = unwrap(await getJson(CONFIG.MOCK_BASE + 'conversations.json'));
  return scenario === 'empty' ? { ...data, total: 0, records: [] } : { ...data, groupId };
}

/** Один диалог: ищем в загруженных наборах, иначе грузим набор по умолчанию. */
export async function getConversation(id, groupId = CONFIG.GROUP_ID) {
  for (const p of sets.values()) {
    const found = (await p.catch(() => ({ records: [] }))).records.find((r) => r.conversation_id === id);
    if (found) return found;
  }
  const { records } = await getConversations(groupId);
  return records.find((r) => r.conversation_id === id) || null;
}

let defaultChecklist = null;
/** Исходный чек-лист из PDF (mocks/checklist.json). Сохранённые версии живут в store.js. */
export function getDefaultChecklist() {
  defaultChecklist ||= getJson(CONFIG.MOCK_BASE + 'checklist.json').catch((e) => { defaultChecklist = null; throw e; });
  return defaultChecklist;
}

let mockResults = null;

/** Оценка диалога по чек-листу. Возвращает результат в формате API (баллы и итог посчитаны). */
export async function evaluate(conversation, checklist) {
  const id = conversation.conversation_id;
  if (!isMock()) {
    const raw = await getJson(`${CONFIG.API_BASE}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: id, checklist }),
    });
    // Пока расчёт временно на клиенте: пересчитываем итог по scoring.js.
    return buildResult(id, checklist, raw.criteria || [], raw.gross_error?.type || null);
  }

  await wait(CONFIG.MOCK_DELAY_MS);
  if (scenario === 'error') throw new Error('Мок-ошибка: сервис оценки недоступен (cqa_mock=error).');
  mockResults ||= getJson(CONFIG.MOCK_BASE + 'results.json').catch((e) => { mockResults = null; throw e; });
  const [all, base] = await Promise.all([mockResults, getDefaultChecklist()]);
  const mock = all.find((r) => r.conversation_id === id);
  const items = checklist.criteria.map((c) => adaptMock(c, mock, base, conversation));
  return { ...buildResult(id, checklist, items, mock?.gross_error?.type || null), meta: { source: 'mock' } };
}

// --- Мок-оценщик: берёт готовый ответ из mocks/results.json и подгоняет под текущий тип критерия ---

function adaptMock(c, mock, base, conversation) {
  const original = base.criteria.find((b) => b.id === c.id);
  const m = mock?.criteria.find((x) => x.id === c.id);
  // Ответ переиспользуем, только если это тот же критерий (тот же id и название).
  if (!m || !original || original.name.trim() !== c.name.trim()) return stub(c, conversation);

  let answer = m.answer;
  let note = '';
  if (answer === 'na' && !c.na_allowed) { answer = 'no'; note = ' N/A для критерия больше не разрешён — засчитано «Нет».'; }
  if (c.type === 'scale' && typeof answer !== 'number' && answer !== 'na') {
    answer = answer === 'yes' ? scaleMax(c) : Math.min(...c.steps.map((s) => Number(s.value)));
  } else if (c.type === 'scale' && typeof answer === 'number') {
    const ratio = answer / (scaleMax(original) || 1);
    answer = nearestStep(c, ratio);
  } else if (c.type !== 'scale' && typeof answer === 'number') {
    answer = answer >= scaleMax(original) ? 'yes' : 'no';
  }
  return { ...m, answer, explanation: m.explanation + note };
}

function nearestStep(c, ratio) {
  const max = scaleMax(c) || 1;
  return c.steps.map((s) => Number(s.value)).reduce((best, v) => (Math.abs(v / max - ratio) < Math.abs(best / max - ratio) ? v : best));
}

function stub(c, conversation) {
  const n = conversation.transcript.length;
  let lastOperator = 0;
  conversation.transcript.forEach((r, i) => { if (r.speaker === 'operator') lastOperator = i + 1; });
  const answer = c.type === 'scale' ? scaleMax(c) : c.type === 'gross' ? 'no' : 'yes';
  return {
    id: c.id,
    answer,
    explanation: 'Предварительная оценка: для этого критерия в демо-данных (mocks/results.json) нет готового ответа.',
    evidence_ids: c.type === 'gross' || !lastOperator ? [] : [lastOperator],
    skipped_at: c.type === 'gross' ? { from: 1, to: n } : null,
    na_reason: null,
    stub: true,
  };
}
