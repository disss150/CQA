// «Почему такой итог»: короткие фразы по секциям. Чистые функции, без DOM.
import { round2 } from './scoring.js';
import { GROSS_TYPES } from './results.js';

const fmt = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** Первое предложение без ссылок на реплики, не длиннее max символов. */
export function shortReason(text, max = 90) {
  const first = String(text || '').split(/(?<=[.!?])\s/)[0].replace(/\s*\(#[^)]*\)/g, '').replace(/[.。]$/, '').trim();
  if (!first) return '';
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function reasonFor(def, c) {
  if (def.type === 'scale') {
    const step = (def.steps || []).find((s) => Number(s.value) === Number(c.answer));
    if (step?.label) return lcFirst(shortReason(step.label));
  }
  const why = shortReason(c.explanation);
  return why ? lcFirst(why) : 'ответ «Нет»';
}

const end = (s) => (/[.…!?]$/.test(s) ? s : `${s}.`);

/**
 * @returns {Array<{ tone: 'ok'|'down'|'na'|'info', text: string, items?: string[] }>}
 */
export function explainTotal(checklist, result) {
  const lines = [];
  const byId = new Map(checklist.criteria.map((c) => [c.id, c]));
  const sections = checklist.sections?.length ? checklist.sections : [{ id: null, name: 'Критерии' }];

  for (const s of sections) {
    const crits = result.criteria.filter((c) => {
      const def = byId.get(c.id);
      return def && def.type !== 'gross' && (s.id === null || (def.section || null) === s.id);
    });
    if (!crits.length) continue;
    const sec = result.sections?.find((x) => x.id === s.id);
    const lost = crits.filter((c) => c.answer !== 'na' && c.effective_weight - c.points > 0.004);
    const na = crits.filter((c) => c.answer === 'na');
    const head = sec && sec.points !== null ? `${s.name} — ${fmt(sec.points)} из ${fmt(sec.max)}` : s.name;

    if (lost.length) {
      const items = lost.map((c) => end(`Критерий ${c.id} «${byId.get(c.id).name}» −${fmt(round2(c.effective_weight - c.points))}: ${reasonFor(byId.get(c.id), c)}`));
      lines.push({ tone: 'down', text: `${head}. Снижено:`, items });
    } else if (crits.some((c) => c.answer !== 'na')) {
      lines.push({ tone: 'ok', text: `${head}. Без потерь.` });
    }
    for (const c of na) {
      lines.push({ tone: 'na', text: end(`Критерий ${c.id} «${byId.get(c.id).name}» — N/A, вес ${fmt(c.weight)} перераспределён между остальными${c.na_reason ? `. ${shortReason(c.na_reason, 160)}` : ''}`) });
    }
  }

  for (const c of result.criteria.filter((x) => x.overridden)) {
    const def = byId.get(c.id);
    if (def) lines.push({ tone: 'info', text: `Критерий ${c.id} изменён проверяющим по апелляции ${c.overridden.appeal_id}.` });
  }
  if (result.gross_error?.flag) {
    lines.push({ tone: 'down', text: `Грубая ошибка: ${GROSS_TYPES[result.gross_error.type] || 'тип не указан'}. На балл не влияет, отмечена отдельно.` });
  }
  if (result.total === null) lines.unshift({ tone: 'na', text: 'Нет применимых критериев с весом — итог не рассчитывается.' });
  return lines;
}
