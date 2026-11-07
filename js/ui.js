// Помощники интерфейса. Все классы — с префиксом cqa-.
import { scaleMax } from './scoring.js';
import { GROSS_TYPES } from './results.js';
import { icon } from './icons.js';

export { icon };

/** h('button', { class: 'cqa-btn', onclick }, 'Текст') — DOM без innerHTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

let root = null;
export const setRoot = (el) => { root = el; };

export const go = (hash) => { window.location.hash = hash; };

/** Склонение по числу: plural(21, ['диалог', 'диалога', 'диалогов']) → «диалог». */
export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  return b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}
export const dialogs = (n) => `${n} ${plural(n, ['диалог', 'диалога', 'диалогов'])}`;

export const num = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const CHANNELS = { 'agent chat': 'Чат', 'voice call': 'Звонок' };
export const LANGS = { RU: 'Русский', KZ: 'Казахский', EN: 'Английский' };
export const SPEAKERS = { client: 'Клиент', operator: 'Оператор', bot: 'Бот', system: 'Система' };
export const STATUSES = {
  none: { label: 'Не оценён', tone: 'muted' },
  evaluated: { label: 'Оценён', tone: 'yes' },
  appeal: { label: 'На апелляции', tone: 'warn' },
  reviewed: { label: 'Пересмотрен', tone: 'info' },
};
export const APPEAL_STATUSES = {
  open: { label: 'На рассмотрении', tone: 'warn' },
  confirmed: { label: 'Оценка подтверждена', tone: 'info' },
  changed: { label: 'Оценка изменена', tone: 'yes' },
};

// --- Кнопки и бейджи ---

/** button('Текст', { icon: 'zap', variant: 'primary'|'secondary'|'ghost'|'danger', size: 'sm', ...props }) */
export function button(label, { icon: ic = null, variant = 'secondary', size = null, href = null, iconOnly = false, ...props } = {}) {
  const cls = `cqa-btn cqa-btn--${variant}${size ? ` cqa-btn--${size}` : ''}${iconOnly ? ' cqa-btn--icon' : ''} ${props.class || ''}`.trim();
  const content = [ic ? icon(ic) : null, iconOnly ? h('span', { class: 'cqa-sr' }, label) : h('span', {}, label)];
  if (href) return h('a', { ...props, class: cls, href }, content);
  return h('button', { type: 'button', ...props, class: cls, 'aria-label': iconOnly ? label : props['aria-label'], title: iconOnly ? label : props.title }, content);
}

export const badge = (text, tone = 'muted', ic = null) => h('span', { class: `cqa-badge cqa-badge--${tone}` }, ic ? icon(ic, null, 14) : null, text);

/** Бейдж статуса оценки. */
export function statusBadge(key) {
  const st = STATUSES[key] || STATUSES.none;
  const el = badge(st.label, st.tone);
  return el;
}

/** Подпись, цвет и иконка ответа по критерию. */
export function answerInfo(c, answer) {
  if (answer === null || answer === undefined) return { label: '—', tone: 'muted', icon: 'minusCircle' };
  if (c.type === 'gross') return answer === 'yes' ? { label: 'Да, выявлено', tone: 'no', icon: 'alert' } : { label: 'Нет', tone: 'yes', icon: 'checkCircle' };
  if (answer === 'na') return { label: 'N/A', tone: 'na', icon: 'minusCircle' };
  if (c.type === 'scale') {
    const max = scaleMax(c);
    const n = Number(answer);
    const tone = n >= max ? 'yes' : n <= 0 ? 'no' : 'partial';
    return { label: `${num(n)} из ${num(max)}`, tone, icon: tone === 'yes' ? 'checkCircle' : tone === 'no' ? 'xCircle' : 'minusCircle' };
  }
  return answer === 'yes' ? { label: 'Да', tone: 'yes', icon: 'checkCircle' } : { label: 'Нет', tone: 'no', icon: 'xCircle' };
}

export function answerBadge(c, answer) {
  const { label, tone, icon: ic } = answerInfo(c, answer);
  return badge(label, tone, ic);
}

/** Возможные ответы для критерия (форма проверяющего). */
export function answerOptions(c) {
  if (c.type === 'scale') {
    const opts = [...c.steps].sort((a, b) => b.value - a.value).map((s) => ({ value: Number(s.value), label: `${s.value} — ${s.label}` }));
    return c.na_allowed ? [...opts, { value: 'na', label: 'N/A' }] : opts;
  }
  if (c.type === 'gross') return [{ value: 'no', label: 'Нет — нарушений не выявлено' }, { value: 'yes', label: 'Да — выявлена грубая ошибка' }];
  const opts = [{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }];
  return c.na_allowed ? [...opts, { value: 'na', label: 'N/A' }] : opts;
}

export function grossBanner(gross) {
  if (!gross?.flag) return null;
  return h('div', { class: 'cqa-gross', role: 'alert' },
    icon('alert', null, 22),
    h('div', {}, h('strong', { class: 'cqa-gross__title' }, 'Грубая ошибка'), h('span', { class: 'cqa-gross__type' }, GROSS_TYPES[gross.type] || 'Тип не указан')),
    h('span', { class: 'cqa-gross__note' }, 'Итог не снижается, ошибка отмечена отдельно'));
}

/** Индикатор: заполняется анимацией (transform: scaleX) при появлении. live — обновляется через setProgress. */
export function progress(value, max = 100, tone = null, label = null, live = false) {
  const pct = max > 0 && value !== null ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const t = tone || (pct >= 90 ? 'yes' : pct >= 60 ? 'partial' : 'no');
  return h('div', { class: `cqa-progress cqa-progress--${t}${live ? ' cqa-progress--live' : ''}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(value ?? 0), 'aria-label': label },
    h('span', { class: 'cqa-progress__bar', style: `--cqa-p:${(pct / 100).toFixed(4)}` }));
}

export function setProgress(el, value, max) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  el.setAttribute('aria-valuenow', String(value));
  el.firstChild.style.setProperty('--cqa-p', pct.toFixed(4));
}

// --- Время реплик ---

/** Секунды от начала для каждой реплики + строка для показа. Исходная метка сохраняется. */
export function timeline(conv) {
  const parsed = conv.transcript.map((r) => parseTs(r.timestamp));
  const base = parsed.find((p) => p.abs !== null)?.abs ?? null;
  return parsed.map((p) => {
    const offset = p.abs !== null && base !== null ? (p.abs - base) / 1000 : p.rel;
    return { offset, display: p.clock || clock(offset), original: p.original, iso: p.abs !== null };
  });
}

function parseTs(ts) {
  const s = String(ts ?? '');
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const rel = m[3] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
    return { rel, abs: null, clock: s, original: s };
  }
  const abs = Date.parse(s);
  if (!Number.isNaN(abs)) {
    const t = s.match(/T(\d{2}:\d{2}:\d{2})/);
    return { rel: null, abs, clock: t ? t[1] : null, original: s };
  }
  return { rel: null, abs: null, clock: s || '—', original: s };
}

export function clock(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// --- Состояния экранов ---

/** Скелетон: 'table' | 'card' | 'form' | 'result' */
export function skeleton(kind = 'table', label = 'Загрузка…') {
  const line = (w = 100, cls = '') => h('span', { class: `cqa-skel ${cls}`, style: `width:${w}%` });
  const blocks = {
    table: () => [h('div', { class: 'cqa-stats' }, [1, 2, 3, 4].map(() => h('div', { class: 'cqa-card cqa-skel-card' }, line(50), line(30, 'cqa-skel--lg')))),
      h('div', { class: 'cqa-card cqa-skel-card' }, [1, 2, 3, 4, 5, 6].map((i) => line(100 - (i % 3) * 8, 'cqa-skel--row')))],
    card: () => h('div', { class: 'cqa-split' },
      h('div', { class: 'cqa-card cqa-skel-card' }, [70, 55, 80, 45, 65, 50].map((w, i) => h('span', { class: `cqa-skel cqa-skel--bubble${i % 2 ? ' cqa-skel--right' : ''}`, style: `width:${w}%` }))),
      h('div', { class: 'cqa-skel-stack' }, [1, 2, 3].map(() => h('div', { class: 'cqa-card cqa-skel-card' }, line(40), line(90), line(70))))),
    form: () => h('div', { class: 'cqa-card cqa-skel-card' }, line(30), line(100, 'cqa-skel--field'), line(30), line(100, 'cqa-skel--field'), line(20, 'cqa-skel--btn')),
    result: () => h('div', { class: 'cqa-skel-stack' }, [1, 2, 3].map(() => h('div', { class: 'cqa-card cqa-skel-card' }, line(45), line(95), line(60)))),
  };
  return h('div', { class: 'cqa-skeleton', role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' }, h('span', { class: 'cqa-sr' }, label), blocks[kind]());
}

export function loadingState(text = 'Загрузка…') {
  return h('div', { class: 'cqa-state cqa-state--loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'cqa-spinner', 'aria-hidden': 'true' }), h('span', {}, text));
}

export function errorState(message, onRetry, title = 'Не удалось загрузить данные') {
  return h('div', { class: 'cqa-state cqa-state--error', role: 'alert' },
    h('span', { class: 'cqa-state__icon' }, icon('wifiOff', null, 24)),
    h('strong', {}, title),
    h('p', {}, message || 'Неизвестная ошибка.'),
    onRetry ? button('Повторить', { icon: 'refresh', variant: 'primary', onclick: onRetry }) : null);
}

export function emptyState(title, text, action = null, ic = 'inbox') {
  return h('div', { class: 'cqa-state cqa-state--empty' },
    h('span', { class: 'cqa-state__icon' }, icon(ic, null, 24)),
    h('strong', {}, title), text ? h('p', {}, text) : null, action);
}

export function screenHeader(title, subtitle, ...actions) {
  return h('header', { class: 'cqa-screen__head' },
    h('div', { class: 'cqa-screen__titles' }, h('h1', { class: 'cqa-h1', tabindex: '-1' }, title), subtitle ? h('p', { class: 'cqa-muted' }, subtitle) : null),
    actions.filter(Boolean).length ? h('div', { class: 'cqa-actions' }, actions) : null);
}

// --- Формы ---

let uid = 0;
/** Поле с подписью, подсказкой и местом для ошибки под полем. */
export function field(label, control, hint = null) {
  const id = control.id || `cqa-f${++uid}`;
  control.id = id;
  const hintEl = hint ? h('p', { class: 'cqa-hint', id: `${id}-hint` }, hint) : null;
  const errEl = h('p', { class: 'cqa-field__error', id: `${id}-err`, 'aria-live': 'polite' });
  control.setAttribute('aria-describedby', [hint ? `${id}-hint` : null, `${id}-err`].filter(Boolean).join(' '));
  return h('div', { class: 'cqa-field' }, h('label', { class: 'cqa-label', for: id }, label), control, hintEl, errEl);
}

/** Показать/снять ошибку у поля, созданного через field(). */
export function setFieldError(control, message) {
  const err = document.getElementById(`${control.id}-err`);
  if (err) err.textContent = message || '';
  if (message) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
}

export const select = (options, value, props = {}) =>
  h('select', { class: 'cqa-input', ...props },
    options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value), disabled: o.disabled }, o.label)));

// --- Тосты, подтверждение, буфер обмена ---

export function toast(text, tone = 'yes') {
  if (!root) return;
  let region = root.querySelector('.cqa-toasts');
  if (!region) { region = h('div', { class: 'cqa-toasts', role: 'status', 'aria-live': 'polite' }); root.append(region); }
  const t = h('div', { class: `cqa-toast cqa-toast--${tone}` }, icon(tone === 'no' ? 'alert' : 'check'), h('span', {}, text));
  region.append(t);
  setTimeout(() => { t.classList.add('cqa-toast--out'); setTimeout(() => t.remove(), 200); }, 2600);
}

/** Модальное подтверждение на <dialog>. Возвращает Promise<boolean>. */
export function confirmDialog({ title, text, confirmLabel = 'Подтвердить', danger = false, details = null }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'cqa-dialog', 'aria-labelledby': 'cqa-dlg-title' });
    const done = (ok) => { dlg.close(); dlg.remove(); resolve(ok); };
    dlg.append(h('form', { method: 'dialog', class: 'cqa-dialog__body', onsubmit: (e) => { e.preventDefault(); done(true); } },
      h('div', { class: `cqa-dialog__icon${danger ? ' cqa-dialog__icon--danger' : ''}` }, icon(danger ? 'alert' : 'info', null, 22)),
      h('h2', { class: 'cqa-h2', id: 'cqa-dlg-title' }, title),
      text ? h('p', { class: 'cqa-muted' }, text) : null,
      details,
      h('div', { class: 'cqa-actions cqa-actions--end' },
        button('Отмена', { variant: 'secondary', onclick: () => done(false), 'data-cancel': '' }),
        h('button', { type: 'submit', class: `cqa-btn cqa-btn--${danger ? 'danger-solid' : 'primary'}` }, confirmLabel))));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    (root || document.body).append(dlg);
    dlg.showModal();
    dlg.querySelector('[data-cancel]').focus();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { class: 'cqa-sr', 'aria-hidden': 'true' });
    ta.value = text;
    (root || document.body).append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Прямая ссылка на реплику в карточке диалога. */
export const evidenceUrl = (conversationId, n) =>
  `${window.location.href.split('#')[0]}#/conversation/${encodeURIComponent(conversationId)}?r=${n}`;

export async function copyEvidenceLink(conversationId, n) {
  const ok = await copyText(evidenceUrl(conversationId, n));
  toast(ok ? `Ссылка на реплику #${n} скопирована` : 'Не удалось скопировать ссылку', ok ? 'yes' : 'no');
}

/** Текст с кликабельными ссылками «#5» и «#2–#5» на реплики. */
export function linkifyRefs(text, onRef) {
  if (!onRef) return text;
  const out = [];
  let last = 0;
  // Скобки вокруг ссылки держим на одной строке с ней: «(#5)», «(#2–#5)»
  for (const m of text.matchAll(/(\()?#(\d+)(?:\s?[–-]\s?#(\d+))?(\))?/g)) {
    out.push(text.slice(last, m.index));
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : null;
    const label = m[0].replace(/^\(|\)$/g, '');
    out.push(h('span', { class: 'cqa-nowrap' }, m[1] || '',
      h('button', { type: 'button', class: 'cqa-ref', onclick: () => onRef(to ? { from, to } : [from]), 'aria-label': to ? `Показать реплики ${from}–${to}` : `Показать реплику ${from}` }, label),
      m[4] || ''));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** value — строка или узел (например, countUp из motion.js). */
export function statTile(label, value, sub = null, ic = null, tone = null) {
  return h('div', { class: `cqa-card cqa-stat${tone ? ` cqa-stat--${tone}` : ''}` },
    h('span', { class: 'cqa-stat__label' }, ic ? icon(ic, null, 16) : null, label),
    h('span', { class: 'cqa-stat__value' }, value),
    sub ? h('span', { class: 'cqa-stat__sub' }, sub) : null);
}

/**
 * Кнопка с выпадающим меню на <details>: работает с клавиатуры, закрывается по Esc и клику вне.
 * items: [{ label, hint?, icon?, onclick }]
 */
export function menuButton(label, items, { icon: ic = null, disabled = false, title = null } = {}) {
  if (disabled) return button(label, { icon: ic, disabled: true, title });
  const menu = h('details', { class: 'cqa-menu' });
  const close = () => { menu.open = false; };
  const outside = (e) => { if (!menu.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') { close(); menu.querySelector('summary').focus(); } };
  menu.addEventListener('toggle', () => {
    const on = menu.open ? 'addEventListener' : 'removeEventListener';
    document[on]('pointerdown', outside, true);
    document[on]('keydown', esc);
    if (menu.open) menu.querySelector('.cqa-menu__item')?.focus();
  });
  menu.append(
    h('summary', { class: 'cqa-btn cqa-btn--secondary', 'aria-haspopup': 'menu' }, ic ? icon(ic) : null, h('span', {}, label), icon('chevronDown', null, 16)),
    h('div', { class: 'cqa-menu__list', role: 'menu' }, items.map((it) => h('button', {
      type: 'button', role: 'menuitem', class: 'cqa-menu__item', onclick: () => { close(); it.onclick(); },
    }, it.icon ? icon(it.icon, null, 16) : null, h('span', {}, h('span', { class: 'cqa-menu__label' }, it.label), it.hint ? h('span', { class: 'cqa-menu__hint' }, it.hint) : null)))));
  return menu;
}

/** Меню «Экспорт» с JSON и CSV. */
export const exportMenu = (onExport, opts = {}) => menuButton(opts.label || 'Экспорт', [
  { label: 'JSON', hint: 'формат API, для разработчиков', icon: 'fileText', onclick: () => onExport('json') },
  { label: 'CSV', hint: 'таблица для Excel', icon: 'chartBar', onclick: () => onExport('csv') },
], { icon: 'download', ...opts });
