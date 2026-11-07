// Экран «Чек-лист»: редактор критериев и в конце — шаги «Применить изменения» (контрольный этап).
// Старый адрес #/control открывает этот же экран и прокручивает к шагам.
import { h, screenHeader } from '../ui.js';
import { mountChecklistEditor } from '../components/checklist-editor.js';
import { mountApply } from './control.js';

export function render(main, route) {
  const body = h('div', { class: 'cqa-screen__body' });
  const apply = h('div');
  main.append(h('div', { class: 'cqa-screen' },
    screenHeader('Чек-лист', 'Критерии, веса, типы ответа и правила N/A. «Сохранить и применить» делает версию активной для новых оценок. В конце страницы — переоценка выданных диалогов.'),
    body, apply));
  const offEditor = mountChecklistEditor(body);
  const offApply = mountApply(apply);
  if (route?.name === 'control' || route?.query?.get('apply')) {
    requestAnimationFrame(() => document.getElementById('cqa-apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  return () => { offEditor(); offApply(); };
}
