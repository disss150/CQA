// Vercel serverless-функция: прокси GET /api/conversations?group_id=DEV → API организаторов.
// Браузер ходит только на свой домен (без CORS). Адрес организаторов хранится на сервере
// в переменной окружения CQA_DEV_URL и в браузер не попадает.
// Подменяется только параметр group_id; другой адрес запросить через прокси нельзя.

const GROUP_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TIMEOUT_MS = 15000;

/** Адрес запроса к организаторам: базовая ссылка из окружения + нужный group_id. */
export function upstreamUrl(base, groupId) {
  const url = new URL(base);
  url.searchParams.set('group_id', groupId);
  return url.toString();
}

const fail = (res, status, error) => res.status(status).json({ error, isSuccess: false, data: null });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(res, 405, 'Метод не поддерживается: только GET.');
  }

  const base = process.env.CQA_DEV_URL;
  if (!base) return fail(res, 503, 'Прокси не настроен: задайте CQA_DEV_URL в переменных окружения Vercel.');

  const groupId = String(req.query?.group_id ?? 'DEV');
  if (!GROUP_RE.test(groupId)) return fail(res, 400, 'Некорректный group_id: только латиница, цифры, «-» и «_».');

  let target;
  try {
    target = upstreamUrl(base, groupId);
  } catch {
    return fail(res, 500, 'CQA_DEV_URL задан некорректно.');
  }

  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { return fail(res, 502, `API организаторов вернул не JSON (HTTP ${upstream.status}).`); }
    return res.status(upstream.ok ? 200 : upstream.status).json(body);
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return fail(res, timeout ? 504 : 502, timeout ? 'API организаторов не ответил за 15 секунд.' : 'Нет связи с API организаторов.');
  }
}
