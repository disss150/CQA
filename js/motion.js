// Интерактивные анимации: волна от курсора, свечение иконок при нажатии, счёт чисел, пульс бейджа.
// Один делегированный обработчик на корневом контейнере — без дублирования по компонентам.
// Анимируются только transform и opacity (стили — в css/cqa.css, раздел «Интерактивные анимации»).

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!media?.matches;

/** Что получает волну и свечение. Самый вложенный подходящий элемент выигрывает. */
const HOSTS = [
  '.cqa-btn', '.cqa-nav__link', '.cqa-tabbar__link', '.cqa-sheet__link', '.cqa-menu__item', '.cqa-replica__tool',
  '.cqa-evidence__open', '.cqa-ref', '.cqa-radio-card', '.cqa-segmented label', '.cqa-context__toggle', '.cqa-back',
  'a[href]', 'button', 'summary', '.cqa-crit', '.cqa-card',
].join(', ');

export function initMotion(root) {
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const host = e.target.closest(HOSTS);
    if (!host || !root.contains(host) || host.disabled || host.getAttribute('aria-disabled') === 'true') return;
    // Клик в поле ввода внутри карточки — не повод для волны
    if (e.target.closest('input, textarea, select, audio') && !host.matches('.cqa-radio-card, .cqa-segmented label')) return;
    press(host);
    ripple(host, e.clientX, e.clientY);
  });
  // Нажатие с клавиатуры: волна из центра
  root.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches?.('button, a, summary')) return;
    const host = e.target.closest(HOSTS);
    if (!host) return;
    const r = host.getBoundingClientRect();
    press(host);
    ripple(host, r.left + r.width / 2, r.top + r.height / 2);
  });
  // Вкладка скрыта — фоновые анимации на паузе
  const sync = () => root.toggleAttribute('data-paused', document.hidden);
  document.addEventListener('visibilitychange', sync);
  sync();
}

/** Свечение иконок: класс на 600 мс, перезапуск при повторном нажатии. */
export function press(host) {
  if (reducedMotion()) return;
  host.classList.remove('cqa-press');
  void host.offsetWidth;
  host.classList.add('cqa-press');
  clearTimeout(host.cqaPressTimer);
  host.cqaPressTimer = setTimeout(() => host.classList.remove('cqa-press'), 650);
}

/** Волна из точки (x, y) в координатах окна. */
export function ripple(host, x, y) {
  if (reducedMotion()) return;
  if (getComputedStyle(host).position === 'static') host.classList.add('cqa-ripple-pos');
  host.classList.add('cqa-ripple-on');
  let layer = host.querySelector(':scope > .cqa-ripple-host');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'cqa-ripple-host';
    layer.setAttribute('aria-hidden', 'true');
    host.prepend(layer);
  }
  const r = host.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const dot = document.createElement('span');
  dot.className = 'cqa-ripple';
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${x - r.left - size / 2}px`;
  dot.style.top = `${y - r.top - size / 2}px`;
  layer.append(dot);
  const done = () => dot.remove();
  dot.addEventListener('animationend', done, { once: true });
  setTimeout(done, 700);
}

// --- Счёт чисел: один раз на странице ---

const counted = new Set();
/** Вызывается при смене маршрута: на новой странице числа снова считаются. */
export const resetCountUps = () => counted.clear();

/**
 * Число в span плавно считается от 0 до значения за 800 мс — только при первом показе на странице.
 * Повторный рендер с тем же key сразу показывает итог.
 */
export function countUp(to, { key, format = String, duration = 800 } = {}) {
  const el = document.createElement('span');
  el.className = 'cqa-count';
  el.dataset.countTo = String(to);
  const final = () => { el.textContent = format(to); };
  if (!Number.isFinite(to) || reducedMotion() || (key && counted.has(key))) { final(); return el; }
  if (key) counted.add(key);
  const t0 = performance.now();
  el.textContent = format(0);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / duration);
    if (k >= 1) { final(); return; }
    const eased = 1 - (1 - k) ** 3;
    el.textContent = format(Number.isInteger(to) ? Math.round(to * eased) : Math.round(to * eased * 10) / 10);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return el;
}

// --- Пульс: не больше одного пульсирующего бейджа на экране ---

/** Следит за содержимым и оставляет пульс только у первого элемента с data-pulse. */
export function watchPulse(container) {
  let pending = false;
  const update = () => {
    pending = false;
    const all = [...container.querySelectorAll('[data-pulse]')];
    all.forEach((el, i) => el.classList.toggle('cqa-badge--pulse', i === 0));
  };
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  new MutationObserver(schedule).observe(container, { childList: true, subtree: true });
  schedule();
}
