// Профиль пользователя прототипа: имя и должность. Без пароля и без сервера — это учебный прототип,
// профиль хранится только в этом браузере (localStorage, в try/catch). «Выйти» удаляет профиль.
const KEY = 'cqa.user';
export const ROLES = ['Оператор', 'Старший оператор', 'Проверяющий', 'Руководитель'];

let cached;
const listeners = new Set();

/** Текущий пользователь { name, role } или null. */
export function getUser() {
  if (cached !== undefined) return cached;
  try {
    const u = JSON.parse(localStorage.getItem(KEY) || 'null');
    cached = u && typeof u.name === 'string' && u.name.trim() ? { name: u.name.trim().slice(0, 40), role: ROLES.includes(u.role) ? u.role : ROLES[0] } : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function signIn(name, role) {
  cached = { name: String(name).trim().slice(0, 40), role: ROLES.includes(role) ? role : ROLES[0] };
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* хранилище недоступно — профиль живёт до перезагрузки */ }
  listeners.forEach((fn) => fn(cached));
}

export function signOut() {
  cached = null;
  try { localStorage.removeItem(KEY); } catch { /* хранилище недоступно */ }
  listeners.forEach((fn) => fn(null));
}

export function onUserChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
