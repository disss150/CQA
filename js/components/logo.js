// 3D-знак CQA: изумрудный кубик на CSS 3D (preserve-3d), на фронтальной грани — «Q» с галочкой вместо хвоста.
// Собственный учебный знак, не связан с логотипами компаний.
// Вращение: базовое 7 с; при наведении добавляется второй вращающийся слой (ускорение без рывка).
// Кубик — кнопка: клик скрывает его (уменьшение + оборот + затухание), следующий клик возвращает
// (появление из точки + зелёная вспышка). Состояние хранится в localStorage.
// Скрытие и появление — через Web Animations API: при prefers-reduced-motion CSS-анимации выключены
// глобально, а плавное затухание по заданию должно остаться.
import { reducedMotion } from '../motion.js';

const NS = 'http://www.w3.org/2000/svg';
const KEY = 'cqa.logo';
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const HIDE_MS = 450;
const SHOW_MS = 500;
const GLOW_MS = 600;

/** Глиф «Q-галочка» в координатах 24×24 — общий для CSS-знака, favicon.svg и canvas. */
export const GLYPH = {
  ring: { cx: 11, cy: 11, r: 6.5 },
  check: [[8.2, 11.3], [10.3, 13.4], [14, 9.2]],
  tail: [[15.2, 15.2], [18.8, 18.8]],
  color: '#06392b',
  width: 2.6,
};

function glyph() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const g = GLYPH;
  const pts = (list) => list.map((p) => p.join(' ')).join(' L');
  svg.innerHTML = `<g fill="none" stroke="${g.color}" stroke-width="${g.width}" stroke-linecap="round" stroke-linejoin="round">`
    + `<circle cx="${g.ring.cx}" cy="${g.ring.cy}" r="${g.ring.r}"/><path d="M${pts(g.check)}"/><path d="M${pts(g.tail)}"/></g>`;
  return svg;
}

const readHidden = () => { try { return localStorage.getItem(KEY) === 'hidden'; } catch { return false; } };
const saveHidden = (hidden) => { try { localStorage.setItem(KEY, hidden ? 'hidden' : 'shown'); } catch { /* хранилище недоступно */ } };

/** Знак-кнопка. Возвращает { el: <button>, logo: <span.cqa-logo>, flash(), isHidden() }. */
export function createLogo() {
  const span = (cls, ...kids) => { const el = document.createElement('span'); el.className = cls; el.append(...kids); return el; };
  const face = (side, withGlyph) => span(`cqa-logo__face cqa-logo__face--${side}`, ...(withGlyph ? [glyph()] : []));
  const cube = span('cqa-logo__cube', face('front', true), face('back', true), face('right'), face('left'), face('top'), face('bottom'));
  const pop = span('cqa-logo__pop', span('cqa-logo__tilt', span('cqa-logo__spin', span('cqa-logo__boost', span('cqa-logo__turn', cube)))));
  const glow = span('cqa-logo__glow');
  const logo = span('cqa-logo', glow, pop);
  logo.id = 'cqa-logo';
  logo.setAttribute('aria-hidden', 'true');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cqa-logo-btn';
  btn.setAttribute('aria-controls', logo.id);
  btn.append(logo);

  let hidden = readHidden();
  let busy = false;
  const label = () => {
    btn.setAttribute('aria-label', hidden ? 'Показать логотип' : 'Скрыть логотип');
    btn.setAttribute('aria-expanded', String(!hidden));
    btn.title = hidden ? 'Показать логотип' : 'Скрыть логотип';
  };
  const setHiddenClass = () => logo.classList.toggle('cqa-logo--hidden', hidden);
  setHiddenClass();
  label();

  /** Анимация, которая всегда завершается: если WAAPI нет или анимацию отменили — не зависаем. */
  const run = (el, frames, opts) => {
    if (typeof el.animate !== 'function') return Promise.resolve(null);
    const a = el.animate(frames, opts);
    return a.finished.then(() => a, () => a);
  };

  async function toggle() {
    if (busy) return; // повторные клики во время анимации игнорируются
    busy = true;
    btn.setAttribute('aria-busy', 'true');
    const still = reducedMotion(); // только затухание и появление, без вращения и масштаба
    const opts = (ms) => ({ duration: ms, easing: EASE, fill: 'both' });
    try {
      if (!hidden) {
        hidden = true;
        label();
        saveHidden(true);
        const anims = await Promise.all([
          run(logo, [{ opacity: 1 }, { opacity: 0 }], opts(HIDE_MS)),
          still ? null : run(pop, [{ transform: 'scale(1) rotateY(0deg)' }, { transform: 'scale(0) rotateY(360deg)' }], opts(HIDE_MS)),
        ]);
        setHiddenClass(); // итоговое состояние держит класс, анимации можно снять
        anims.forEach((a) => a?.cancel());
      } else {
        hidden = false;
        label();
        saveHidden(false);
        const fade = run(logo, [{ opacity: 0 }, { opacity: 1 }], opts(SHOW_MS));
        const grow = still ? null : run(pop, [{ transform: 'scale(0) rotateY(-360deg)' }, { transform: 'scale(1) rotateY(0deg)' }], opts(SHOW_MS));
        setHiddenClass(); // класс снят сразу: вращение продолжается, кадры держит анимация (fill: both)
        const anims = await Promise.all([fade, grow]);
        anims.forEach((a) => a?.cancel());
        // Короткая зелёная вспышка свечения (это изменение прозрачности, поэтому остаётся и при reduced-motion)
        run(glow, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: GLOW_MS, easing: 'ease-out' });
      }
    } finally {
      busy = false;
      btn.removeAttribute('aria-busy');
    }
  }
  btn.addEventListener('click', toggle);

  // Оборот и вспышка после оценки диалога — только когда знак виден
  const flash = () => {
    if (hidden || busy) return;
    logo.classList.remove('cqa-logo--turn');
    void logo.offsetWidth;
    logo.classList.add('cqa-logo--turn');
  };
  logo.addEventListener('animationend', (e) => { if (e.animationName === 'cqa-logo-turn') logo.classList.remove('cqa-logo--turn'); });
  return { el: btn, logo, flash, isHidden: () => hidden };
}
