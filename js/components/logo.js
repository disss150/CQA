// 3D-знак CQA: изумрудный кубик на CSS 3D (preserve-3d), на фронтальной грани — «Q» с галочкой вместо хвоста.
// Собственный учебный знак, не связан с логотипами компаний.
// Вращение: базовое 7 с; при наведении добавляется второй вращающийся слой (ускорение без рывка);
// при клике — один полный оборот и зелёная вспышка.

const NS = 'http://www.w3.org/2000/svg';

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

export function createLogo() {
  const span = (cls, ...kids) => { const el = document.createElement('span'); el.className = cls; el.append(...kids); return el; };
  const face = (side, withGlyph) => span(`cqa-logo__face cqa-logo__face--${side}`, ...(withGlyph ? [glyph()] : []));
  const cube = span('cqa-logo__cube', face('front', true), face('back', true), face('right'), face('left'), face('top'), face('bottom'));
  const el = span('cqa-logo', span('cqa-logo__glow'), span('cqa-logo__tilt', span('cqa-logo__spin', span('cqa-logo__boost', span('cqa-logo__turn', cube)))));
  el.setAttribute('aria-hidden', 'true');

  const flash = () => {
    el.classList.remove('cqa-logo--turn');
    void el.offsetWidth;
    el.classList.add('cqa-logo--turn');
  };
  el.addEventListener('animationend', (e) => { if (e.animationName === 'cqa-logo-turn') el.classList.remove('cqa-logo--turn'); });
  el.addEventListener('pointerdown', flash);
  return { el, flash };
}
