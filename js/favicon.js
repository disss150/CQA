// Анимированная иконка вкладки: знак-кубик рисуется на <canvas> 64×64 и ~11 раз в секунду
// подставляется в <link rel="icon" id="cqa-favicon"> как dataURL. Цикл вращения — 2,5 с.
// Вкладка скрыта или включено уменьшение движения — обновление остановлено, остаётся favicon.svg.
// Нет canvas — тихо остаёмся на статичной SVG-иконке.
import { GLYPH } from './components/logo.js';
import { reducedMotion } from './motion.js';

const SIZE = 64;
const FPS_MS = 90;          // ≈ 11 кадров в секунду
const CYCLE_MS = 2500;      // полный оборот
const TILT = (24 * Math.PI) / 180;

// Грани куба [-1..1]^3: угол o, рёбра u (вправо по грани) и v (вниз по грани), нормаль n.
export const FACES = [
  { o: [-1, 1, 1], u: [2, 0, 0], v: [0, -2, 0], n: [0, 0, 1], fill: '#34d399', glyph: true },
  { o: [1, 1, -1], u: [-2, 0, 0], v: [0, -2, 0], n: [0, 0, -1], fill: '#34d399', glyph: true },
  { o: [1, 1, 1], u: [0, 0, -2], v: [0, -2, 0], n: [1, 0, 0], fill: '#059669' },
  { o: [-1, 1, -1], u: [0, 0, 2], v: [0, -2, 0], n: [-1, 0, 0], fill: '#047857' },
  { o: [-1, 1, -1], u: [2, 0, 0], v: [0, 0, 2], n: [0, 1, 0], fill: '#a7f3d0' },
];

/** Ортографическая проекция: поворот вокруг Y на angle, наклон к зрителю на TILT. */
export function project([x, y, z], angle, size = SIZE) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const x1 = x * c + z * s;
  const z1 = -x * s + z * c;
  const y2 = y * Math.cos(TILT) - z1 * Math.sin(TILT);
  const z2 = y * Math.sin(TILT) + z1 * Math.cos(TILT);
  const k = size * 0.29;
  return [size / 2 + x1 * k, size / 2 - y2 * k, z2];
}

const add = (a, b) => a.map((v, i) => v + b[i]);

/** Видимые грани с аффинным отображением единичного квадрата грани на экран. */
export function visibleFaces(angle, size = SIZE) {
  return FACES.map((f) => {
    const nz = project(f.n, angle, size)[2] - project([0, 0, 0], angle, size)[2];
    const O = project(f.o, angle, size);
    const U = project(add(f.o, f.u), angle, size);
    const V = project(add(f.o, f.v), angle, size);
    return { ...f, nz, m: [U[0] - O[0], U[1] - O[1], V[0] - O[0], V[1] - O[1], O[0], O[1]] };
  }).filter((f) => f.nz > 0.02);
}

function drawGlyph(ctx) {
  const g = GLYPH;
  ctx.scale(1 / 24, 1 / 24);
  ctx.strokeStyle = g.color;
  ctx.lineWidth = g.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(g.ring.cx, g.ring.cy, g.ring.r, 0, Math.PI * 2);
  ctx.stroke();
  for (const line of [g.check, g.tail]) {
    ctx.beginPath();
    line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}

export function drawFrame(ctx, angle, flash = false) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (flash) {
    const glow = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 4, SIZE / 2, SIZE / 2, SIZE / 2);
    glow.addColorStop(0, 'rgba(52, 211, 153, .95)');
    glow.addColorStop(1, 'rgba(52, 211, 153, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  for (const f of visibleFaces(angle)) {
    ctx.setTransform(...f.m);
    ctx.fillStyle = flash ? '#d1fae5' : f.fill;
    ctx.fillRect(0, 0, 1, 1);
    if (f.glyph) { ctx.save(); drawGlyph(ctx); ctx.restore(); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Запуск. Возвращает { flash() } — вспышка на 2 кадра. */
export function initFavicon() {
  const link = document.getElementById('cqa-favicon');
  const api = { flash() {}, frames: 0 };
  if (!link) return api;
  let ctx = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    // Программный canvas: чтение пикселей без синхронизации с видеокартой
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || typeof canvas.toBlob !== 'function' || typeof FileReader !== 'function') return api;
    api.canvas = canvas;
  } catch {
    return api;
  }
  const fallback = link.getAttribute('href');
  let timer = null;
  let flashLeft = 0;

  // PNG кодируется асинхронно (toBlob + FileReader): синхронный toDataURL блокировал
  // главный поток до ~60 мс. Пока предыдущий кадр кодируется, новый не начинаем.
  let busy = false;
  const tick = () => {
    if (busy) return;
    try {
      const angle = ((performance.now() % CYCLE_MS) / CYCLE_MS) * Math.PI * 2;
      drawFrame(ctx, angle, flashLeft > 0);
      if (flashLeft > 0) flashLeft -= 1;
      busy = true;
      api.canvas.toBlob((blob) => {
        if (!blob) { busy = false; return; }
        const reader = new FileReader();
        reader.onload = () => {
          busy = false;
          if (!timer) return; // вкладку скрыли, пока кодировался кадр
          link.href = reader.result;
          api.frames += 1;
        };
        reader.onerror = () => { busy = false; };
        reader.readAsDataURL(blob);
      }, 'image/png');
    } catch {
      busy = false;
      stop();
      link.href = fallback;
    }
  };
  const start = () => { if (!timer && !document.hidden && !reducedMotion()) { link.type = 'image/png'; tick(); timer = setInterval(tick, FPS_MS); } };
  function stop() { clearInterval(timer); timer = null; }
  const sync = () => {
    if (document.hidden || reducedMotion()) {
      stop();
      if (reducedMotion()) { link.type = 'image/svg+xml'; link.href = fallback; }
    } else start();
  };
  document.addEventListener('visibilitychange', sync);
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', sync);
  sync();

  api.flash = () => { if (timer) { flashLeft = 2; tick(); } };
  api.running = () => !!timer;
  return api;
}
