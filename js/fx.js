// Спецэффекты: курсорная подсветка карточек, магнитные основные кнопки, салют и искры.
// Подсветка и магнит двигаются только через transform (CSS-переменные в style). Салют и искры —
// отдельный canvas поверх страницы, удаляется после анимации. Всё выключено при prefers-reduced-motion.
import { reducedMotion } from './motion.js';

const SPOT = '.cqa-card, .cqa-crit';
const MAGNET = '.cqa-btn--primary';
const MAGNET_PX = 4;
const GREENS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669'];
let root = null;

export function initFx(el) {
  root = el;
  if (!window.matchMedia?.('(hover: hover)').matches) return;
  let spotHost = null;
  let magnetHost = null;
  let last = null;
  let frame = 0;

  const apply = () => {
    frame = 0;
    if (!last) return;
    if (spotHost) {
      const r = spotHost.getBoundingClientRect();
      const layer = spotLayer(spotHost);
      layer.style.setProperty('--cqa-sx', `${(last.clientX - r.left).toFixed(0)}px`);
      layer.style.setProperty('--cqa-sy', `${(last.clientY - r.top).toFixed(0)}px`);
    }
    if (magnetHost) {
      const r = magnetHost.getBoundingClientRect();
      const dx = ((last.clientX - (r.left + r.width / 2)) / (r.width / 2)) * MAGNET_PX;
      const dy = ((last.clientY - (r.top + r.height / 2)) / (r.height / 2)) * MAGNET_PX;
      magnetHost.style.setProperty('--cqa-mx', `${Math.max(-MAGNET_PX, Math.min(MAGNET_PX, dx)).toFixed(1)}px`);
      magnetHost.style.setProperty('--cqa-my', `${Math.max(-MAGNET_PX, Math.min(MAGNET_PX, dy)).toFixed(1)}px`);
    }
  };
  const releaseMagnet = () => {
    if (!magnetHost) return;
    magnetHost.style.removeProperty('--cqa-mx');
    magnetHost.style.removeProperty('--cqa-my');
    magnetHost.classList.remove('cqa-magnet');
    magnetHost = null;
  };

  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reducedMotion()) return;
    const card = e.target.closest(SPOT);
    if (spotHost && spotHost !== card) spotHost.classList.remove('cqa-spot-on');
    spotHost = card;
    card?.classList.add('cqa-spot-on');
    const btn = e.target.closest(MAGNET);
    if (magnetHost !== btn) { releaseMagnet(); if (btn && !btn.disabled) { magnetHost = btn; btn.classList.add('cqa-magnet'); } }
    last = e;
    if (!frame) frame = requestAnimationFrame(apply);
  });
  root.addEventListener('pointerout', (e) => {
    if (spotHost && !spotHost.contains(e.relatedTarget)) { spotHost.classList.remove('cqa-spot-on'); spotHost = null; }
    if (magnetHost && !magnetHost.contains(e.relatedTarget)) releaseMagnet();
  });
}

/**
 * Готовит слои подсветки заранее, в простое после отрисовки экрана: вставка слоя и изоляция
 * при первом наведении заставляли перерастеризовать карточку (кадры до 140 мс).
 */
export function prepareSpots(container) {
  if (reducedMotion() || !window.matchMedia?.('(hover: hover)').matches) return;
  let pending = false;
  const run = () => {
    pending = false;
    container.querySelectorAll(`:is(${SPOT}):not(.cqa-spot-ready)`).forEach((el) => spotLayer(el));
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(run, { timeout: 1000 });
  };
  // Карточки появляются и без смены маршрута (результат оценки, апелляции) — следим за содержимым
  new MutationObserver(schedule).observe(container, { childList: true, subtree: true });
  schedule();
}

/** Слой подсветки: круг с радиальным градиентом двигается transform-ом под содержимым карточки. */
function spotLayer(host) {
  let layer = host.querySelector(':scope > .cqa-spot');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'cqa-spot';
    layer.setAttribute('aria-hidden', 'true');
    layer.append(document.createElement('i'));
    host.classList.add('cqa-ripple-on');
    if (getComputedStyle(host).position === 'static') host.classList.add('cqa-ripple-pos');
    host.prepend(layer);
    host.classList.add('cqa-spot-ready');
  }
  return layer;
}

/**
 * Частицы из точки (x, y) в координатах окна.
 * kind: 'confetti' — салют зелёными частицами 1,5 с; 'sparks' — короткие искры у знака.
 */
export function burst({ x = window.innerWidth / 2, y = window.innerHeight * 0.3, count = 110, kind = 'confetti' } = {}) {
  if (!root || reducedMotion() || document.hidden) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.className = 'cqa-fx';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  root.append(canvas);
  ctx.scale(dpr, dpr);

  const sparks = kind === 'sparks';
  const life = sparks ? 700 : 1500;
  const parts = Array.from({ length: count }, () => {
    const a = sparks ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = sparks ? 2 + Math.random() * 4 : 7 + Math.random() * 9;
    return {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      w: sparks ? 3 : 6 + Math.random() * 6, h: sparks ? 3 : 4 + Math.random() * 4,
      color: GREENS[Math.floor(Math.random() * GREENS.length)],
      round: sparks || Math.random() < 0.35,
    };
  });

  const t0 = performance.now();
  const step = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.min(1, Math.max(0, (life - t) / 400));
    for (const p of parts) {
      p.vy += sparks ? 0.06 : 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}

const celebrated = new Set();
/** Салют один раз на оценку (ключ — evaluation_id), из точки на экране. */
export function celebrateOnce(key, point = {}) {
  if (celebrated.has(key)) return;
  celebrated.add(key);
  burst({ ...point, count: 120 });
}
