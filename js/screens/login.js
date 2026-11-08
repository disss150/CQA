// Вход в прототип: имя и должность, без пароля. Показывается, пока пользователь не вошёл или после «Выйти».
import { h, icon, field, select, button, setFieldError } from '../ui.js';
import { ROLES, signIn } from '../user.js';

export function render(main) {
  const name = h('input', { class: 'cqa-input', id: 'cqa-login-name', type: 'text', required: true, maxlength: '40', autocomplete: 'name', placeholder: 'Например, Диас' });
  const role = select(ROLES.map((r) => ({ value: r, label: r })), ROLES[0], { id: 'cqa-login-role' });

  const form = h('form', {
    class: 'cqa-card cqa-login', 'aria-labelledby': 'cqa-login-title', novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      if (!name.value.trim()) {
        setFieldError(name, 'Введите имя.');
        name.focus();
        return;
      }
      signIn(name.value, role.value);
    },
  },
  h('div', { class: 'cqa-login__icon' }, icon('user', null, 24)),
  h('h1', { class: 'cqa-h1', id: 'cqa-login-title', tabindex: '-1' }, 'Вход'),
  h('p', { class: 'cqa-muted' }, 'Укажите имя и должность — они будут видны в шапке. Пароль не нужен: это учебный прототип, профиль хранится только в этом браузере.'),
  field('Имя', name),
  field('Должность', role),
  h('div', { class: 'cqa-actions' }, button('Войти', { type: 'submit', variant: 'primary', icon: 'arrowRight' })));

  name.addEventListener('input', () => setFieldError(name, ''));
  main.append(h('div', { class: 'cqa-screen cqa-login-wrap' }, form));
  requestAnimationFrame(() => name.focus());
}
