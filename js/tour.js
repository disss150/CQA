// «Презентация 5 минут»: пошаговая подсказка по плану защиты из задания хакатона.
// Каждый шаг готовит данные (оценивает нужный диалог, если он ещё не оценён) и открывает экран.
// Панель живёт в корневом контейнере и не исчезает при смене маршрута.
import { h, icon, button, go } from './ui.js';
import { store } from './store.js';
import { getConversation, evaluate } from './api.js';

const STEPS = [
  {
    title: 'Интерфейс и диалог', time: '1 мин',
    text: 'Карточка p1-ru-001: транскрипт слева, оценка справа. Нажмите на цитату-доказательство или ссылку #n — реплика подсветится в транскрипте.',
    prepare: () => ensureEvaluated('p1-ru-001'),
    hash: '#/conversation/p1-ru-001',
  },
  {
    title: 'Оценка, N/A и итог', time: '2 мин',
    text: 'p1-ru-002: «Выявление потребности» и «Идентификация» — N/A с причиной, их вес перераспределён. Итог 84,62 из 100, ниже — «Почему такой итог».',
    prepare: () => ensureEvaluated('p1-ru-002'),
    hash: '#/evaluate/p1-ru-002',
  },
  {
    title: 'Апелляция и решение', time: '1 мин',
    text: 'Оспорьте критерий 6 у p1-ru-001 (7 из 10) с комментарием. Затем вкладка «Очередь проверки» → «Изменить оценку» на 10 с причиной: итог 95,5 → 100, виден блок «было → стало».',
    prepare: () => ensureEvaluated('p1-ru-001'),
    hash: '#/appeals?conv=p1-ru-001&crit=6',
  },
  {
    title: 'Замена критерия', time: '1 мин',
    text: 'Измените или замените критерий в редакторе и нажмите «Сохранить и применить». Внизу — «Применить к выданным диалогам»: таблица покажет итоги «было / стало».',
    prepare: async () => {},
    hash: '#/checklist?apply=1',
  },
];

let root = null;
let panel = null;
let index = 0;

export function initTour(el) { root = el; }
export const tourOpen = () => !!panel;

async function ensureEvaluated(id) {
  if (store.getRecord(id)) return;
  const conv = await getConversation(id, store.groupId);
  if (!conv) return;
  const cl = store.activeChecklist();
  store.saveEvaluation(id, cl, await evaluate(conv, cl));
}

export function startTour() {
  index = 0;
  if (!panel) {
    panel = h('section', { class: 'cqa-tour', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'cqa-tour-title', 'aria-live': 'polite' });
    root.append(panel);
    // Класс на корне (а не :has()) — чтобы не пересчитывать стили всего приложения при каждом изменении
    root.classList.add('cqa-touring');
  }
  show();
}

export function closeTour() {
  panel?.remove();
  panel = null;
  root?.classList.remove('cqa-touring');
}

async function show() {
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const next = button(last ? 'Завершить' : 'Далее', { variant: 'primary', icon: last ? 'check' : 'arrowRight', onclick: () => (last ? closeTour() : move(1)) });
  panel.replaceChildren(
    h('div', { class: 'cqa-tour__head' },
      h('span', { class: 'cqa-tour__badge' }, icon('play', null, 12), 'Презентация 5 минут'),
      h('ol', { class: 'cqa-tour__dots', 'aria-label': `Шаг ${index + 1} из ${STEPS.length}` },
        STEPS.map((_, i) => h('li', { class: `cqa-tour__dot${i === index ? ' cqa-tour__dot--on' : ''}${i < index ? ' cqa-tour__dot--done' : ''}` }))),
      button('Закрыть презентацию', { icon: 'x', iconOnly: true, variant: 'ghost', size: 'sm', onclick: closeTour })),
    h('h2', { class: 'cqa-tour__title', id: 'cqa-tour-title' }, `${index + 1}. ${step.title}`, h('span', { class: 'cqa-tour__time' }, step.time)),
    h('p', { class: 'cqa-tour__text' }, step.text),
    h('div', { class: 'cqa-tour__actions' },
      index > 0 ? button('Назад', { icon: 'arrowLeft', onclick: () => move(-1) }) : h('span'),
      next));
  next.setAttribute('aria-busy', 'true');
  try {
    await step.prepare();
  } catch { /* экран сам покажет ошибку загрузки */ }
  next.removeAttribute('aria-busy');
  if (panel && STEPS[index] === step) {
    if (window.location.hash === step.hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else go(step.hash);
  }
}

function move(d) {
  index = Math.max(0, Math.min(STEPS.length - 1, index + d));
  show();
}

export const TOUR_STEPS = STEPS.length;
