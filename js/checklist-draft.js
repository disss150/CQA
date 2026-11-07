// Черновик чек-листа: один на редактор («Чек-лист») и экран «Применить изменения».
import { store } from './store.js';
import { round2 } from './scoring.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const fmt = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

let draft = null;
const listeners = new Set();

export function getDraft() {
  if (!draft || !store.getChecklist(draft.id)) draft = clone(store.activeChecklist());
  return draft;
}
export const isDirty = () => !!draft && JSON.stringify(draft) !== JSON.stringify(store.getChecklist(draft.id));
export const onDraftChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const notifyDraft = () => listeners.forEach((fn) => fn());

export function loadDraft(id) { draft = clone(store.getChecklist(id)); notifyDraft(); return draft; }
export function discardDraft() { return loadDraft(getDraft().id); }
export function duplicateDraft() { draft = clone(store.duplicateChecklist(getDraft().id)); notifyDraft(); return draft; }

export const weightSum = (cl) => round2(cl.criteria.filter((c) => c.type !== 'gross').reduce((s, c) => s + (Number(c.weight) || 0), 0));

/**
 * Ошибки чек-листа. { id: id критерия | null, field: 'name'|'weight'|'steps'|null, text }
 */
export function validate(cl) {
  const errors = [];
  if (!cl.name.trim()) errors.push({ id: null, field: 'name', text: 'Укажите название чек-листа.' });
  if (!cl.criteria.some((c) => c.type !== 'gross')) errors.push({ id: null, field: null, text: 'Нужен хотя бы один критерий с баллами.' });
  cl.criteria.forEach((c, i) => {
    const label = `Критерий ${i + 1}`;
    if (!c.name.trim()) errors.push({ id: c.id, field: 'name', text: `${label}: укажите название.` });
    if (c.type !== 'gross' && !(Number(c.weight) >= 0)) errors.push({ id: c.id, field: 'weight', text: `${label}: вес — число не меньше 0.` });
    if (c.type === 'scale') {
      const vals = c.steps.map((s) => Number(s.value));
      let text = null;
      if (c.steps.length < 2) text = 'у шкалы минимум 2 ступени.';
      else if (vals.some((v) => !Number.isFinite(v) || v < 0)) text = 'баллы ступеней — числа не меньше 0.';
      else if (new Set(vals).size !== vals.length) text = 'баллы ступеней не должны повторяться.';
      else if (Math.max(...vals) <= 0) text = 'верхняя ступень должна быть больше 0.';
      if (text) errors.push({ id: c.id, field: 'steps', text: `${label}: ${text}` });
    }
  });
  const sum = weightSum(cl);
  if (sum !== 100) errors.push({ id: null, field: 'sum', text: `Сумма весов ${fmt(sum)}, а должна быть 100.` });
  return errors;
}

/** Сохранить черновик как новую активную версию. */
export function saveDraft() {
  const d = getDraft();
  if (validate(d).length) throw new Error('В чек-листе есть ошибки.');
  const saved = store.saveChecklist(d);
  draft = clone(saved);
  notifyDraft();
  return saved;
}

const TYPE_LABEL = { binary: 'Да/Нет', scale: 'шкала', gross: 'грубая ошибка' };
const typeText = (c) => `${TYPE_LABEL[c.type] || c.type}${c.type !== 'gross' && c.na_allowed ? ' + N/A' : ''}`;

/** Человекочитаемый список отличий черновика от сохранённой версии. */
export function diffDraft() {
  const d = getDraft();
  const saved = store.getChecklist(d.id);
  if (!saved) return [];
  const out = [];
  const before = new Map(saved.criteria.map((c) => [c.id, c]));
  const after = new Map(d.criteria.map((c) => [c.id, c]));
  if (saved.name !== d.name) out.push({ kind: 'changed', text: `Название: «${saved.name}» → «${d.name}»` });
  for (const [id, c] of before) if (!after.has(id)) out.push({ kind: 'removed', text: `Удалён критерий ${id}: «${c.name}»` });
  for (const [id, c] of after) {
    const o = before.get(id);
    if (!o) { out.push({ kind: 'added', text: `Добавлен критерий ${id}: «${c.name || 'без названия'}», ${typeText(c)}, вес ${fmt(Number(c.weight) || 0)}` }); continue; }
    const parts = [];
    if (o.name !== c.name) parts.push(`название «${o.name}» → «${c.name}»`);
    if (Number(o.weight) !== Number(c.weight)) parts.push(`вес ${fmt(o.weight)} → ${fmt(Number(c.weight) || 0)}`);
    if (typeText(o) !== typeText(c)) parts.push(`тип ${typeText(o)} → ${typeText(c)}`);
    if (JSON.stringify(o.steps) !== JSON.stringify(c.steps) && c.type === 'scale' && o.type === 'scale') parts.push('ступени шкалы');
    if (o.description !== c.description || (o.na_condition || '') !== (c.na_condition || '')) parts.push('формулировка');
    if ((o.section || null) !== (c.section || null)) parts.push('секция');
    if (parts.length) out.push({ kind: 'changed', text: `Критерий ${id}: ${parts.join(', ')}` });
  }
  const order = (cl) => cl.criteria.map((c) => c.id).filter((id) => before.has(id) && after.has(id)).join(',');
  if (order(saved) !== order(d)) out.push({ kind: 'changed', text: 'Изменён порядок критериев' });
  return out;
}
