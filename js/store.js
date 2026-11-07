// Состояние приложения: чек-листы, результаты оценок, апелляции.
// На этом этапе хранится в localStorage (в try/catch); без него всё работает в памяти до перезагрузки.
import { CONFIG } from './config.js';
import { getDefaultChecklist } from './api.js';
import { applyDecisions } from './results.js';

const KEY = 'cqa.state.v1';
const clone = (x) => JSON.parse(JSON.stringify(x));

let state = { checklists: [], activeChecklistId: null, results: {}, appeals: [], groupId: CONFIG.GROUP_ID };
let persistent = true;
let setSize = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* слушатель не должен ломать сохранение */ } });

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    persistent = false;
    return null;
  }
}

function write() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    persistent = false;
  }
  emit();
}

export const store = {
  async init() {
    const saved = read();
    if (saved && Array.isArray(saved.checklists) && saved.checklists.length) state = { ...state, ...saved };
    if (!state.checklists.length) {
      const base = clone(await getDefaultChecklist());
      state.checklists = [base];
      state.activeChecklistId = base.id;
      write();
    }
  },

  get persistent() { return persistent; },

  /** Подписка на любые изменения состояния. Возвращает функцию отписки. */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Сколько диалогов в текущем наборе (для строки контекста), null — ещё не загружен. */
  get setSize() { return setSize; },
  setSetSize(n) { if (setSize !== n) { setSize = n; emit(); } },

  /** Сводка для настроек и подтверждения сброса. */
  counts() { return { checklists: state.checklists.length, results: Object.keys(state.results).length, appeals: state.appeals.length }; },

  get groupId() { return state.groupId; },
  setGroupId(id) { const next = id || CONFIG.GROUP_ID; if (next !== state.groupId) setSize = null; state.groupId = next; write(); },

  // --- Чек-листы ---
  checklists() { return state.checklists; },
  getChecklist(id) { return state.checklists.find((c) => c.id === id) || null; },
  activeChecklist() { return this.getChecklist(state.activeChecklistId) || state.checklists[0]; },

  /** «Сохранить и применить»: новая версия, становится активной. */
  saveChecklist(draft) {
    const prev = this.getChecklist(draft.id);
    const saved = { ...clone(draft), version: (prev?.version || 0) + 1, saved_at: new Date().toISOString() };
    state.checklists = prev ? state.checklists.map((c) => (c.id === saved.id ? saved : c)) : [...state.checklists, saved];
    state.activeChecklistId = saved.id;
    write();
    return saved;
  },

  duplicateChecklist(id) {
    const src = this.getChecklist(id);
    const copy = { ...clone(src), id: `cl-${Date.now().toString(36)}`, name: `${src.name} (копия)`, version: 1, saved_at: new Date().toISOString() };
    state.checklists.push(copy);
    write();
    return copy;
  },

  // --- Результаты ---
  getRecord(conversationId) { return state.results[conversationId] || null; },
  allRecords() { return Object.values(state.results); },

  saveEvaluation(conversationId, checklist, result) {
    const prev = state.results[conversationId];
    const record = {
      evaluation_id: `${conversationId}@${Date.now().toString(36)}`,
      conversation_id: conversationId,
      checklist: clone(checklist),
      evaluated_at: new Date().toISOString(),
      result,
      previous: prev ? { total: this.finalResult(conversationId).total, checklist_name: prev.checklist.name, checklist_version: prev.checklist.version, evaluated_at: prev.evaluated_at } : null,
    };
    state.results[conversationId] = record;
    write();
    try { document.dispatchEvent(new CustomEvent('cqa:evaluated', { detail: { conversationId } })); } catch { /* вне браузера */ }
    return record;
  },

  /** Итог с учётом решений проверяющего. */
  finalResult(conversationId) {
    const rec = this.getRecord(conversationId);
    return rec ? applyDecisions(rec, state.appeals) : null;
  },

  /** Статус для списка: none | evaluated | appeal | reviewed */
  status(conversationId) {
    const rec = this.getRecord(conversationId);
    if (!rec) return 'none';
    const own = state.appeals.filter((a) => a.evaluation_id === rec.evaluation_id);
    if (own.some((a) => a.status === 'open')) return 'appeal';
    if (own.length) return 'reviewed';
    return 'evaluated';
  },

  // --- Апелляции ---
  appeals() { return state.appeals; },
  getAppeal(id) { return state.appeals.find((a) => a.id === id) || null; },
  appealsFor(conversationId) { return state.appeals.filter((a) => a.conversation_id === conversationId); },

  addAppeal({ conversationId, criterionId, comment }) {
    const rec = this.getRecord(conversationId);
    if (!rec) throw new Error('Диалог ещё не оценён.');
    const crit = rec.result.criteria.find((c) => c.id === criterionId);
    const def = rec.checklist.criteria.find((c) => c.id === criterionId);
    if (!crit || !def) throw new Error('Критерий не найден в оценке.');
    const final = this.finalResult(conversationId);
    if (state.appeals.some((a) => a.evaluation_id === rec.evaluation_id && a.criterion_id === criterionId && a.status === 'open')) {
      throw new Error('По этому критерию уже есть открытая апелляция.');
    }
    const n = state.appeals.length + 1;
    const appeal = {
      id: `A-${String(n).padStart(3, '0')}`,
      conversation_id: conversationId,
      evaluation_id: rec.evaluation_id,
      criterion_id: criterionId,
      criterion_name: def.name,
      criterion: clone(def),
      original: clone(final.criteria.find((c) => c.id === criterionId)),
      total_before: final.total,
      comment: comment.trim(),
      created_at: new Date().toISOString(),
      status: 'open',
      decision: null,
      total_after: null,
    };
    state.appeals.push(appeal);
    write();
    return appeal;
  },

  /** decision: { action: 'confirm' | 'change', answer?, gross_type?, reason } */
  decideAppeal(id, decision) {
    const a = this.getAppeal(id);
    if (!a || a.status !== 'open') throw new Error('Апелляция уже рассмотрена или не найдена.');
    a.status = decision.action === 'change' ? 'changed' : 'confirmed';
    a.decision = {
      action: decision.action,
      answer: decision.action === 'change' ? decision.answer : a.original.answer,
      gross_type: decision.gross_type || null,
      reason: decision.reason.trim(),
      decided_at: new Date().toISOString(),
    };
    const fin = this.finalResult(a.conversation_id);
    a.total_after = fin?.total ?? null;
    a.points_after = fin?.criteria.find((c) => c.id === a.criterion_id)?.points ?? null;
    write();
    return a;
  },

  /** Предпросмотр итога, если проверяющий изменит ответ. */
  previewDecision(id, answer, grossType) {
    const a = this.getAppeal(id);
    const rec = a && this.getRecord(a.conversation_id);
    if (!rec) return null;
    const draft = { ...a, status: 'changed', decision: { answer, gross_type: grossType || null } };
    return applyDecisions(rec, [...state.appeals.filter((x) => x.id !== id), draft]);
  },

  resetAll() {
    try { window.localStorage.removeItem(KEY); } catch { /* недоступно */ }
    state = { checklists: [], activeChecklistId: null, results: {}, appeals: [], groupId: CONFIG.GROUP_ID };
  },
};
