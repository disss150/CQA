import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import handler, { upstreamUrl } from '../api/conversations.js';

// Поддельный API организаторов
let server;
let base;
const seen = [];
before(async () => {
  server = createServer((req, res) => {
    seen.push(req.url);
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('group_id') === 'BROKEN') { res.writeHead(200); res.end('<html>oops'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '', isSuccess: true, data: { dataset_group_id: u.searchParams.get('group_id'), total_records: 0, records: [] } }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/get?token=abc&group_id=DEV`;
});
after(() => server.close());

// Минимальная замена req/res Vercel
function call(query, method = 'GET') {
  return new Promise((resolve) => {
    const out = { status: 200, headers: {} };
    const res = {
      setHeader: (k, v) => { out.headers[k] = v; },
      status(code) { out.status = code; return this; },
      json(body) { out.body = body; resolve(out); return this; },
    };
    handler({ method, query }, res);
  });
}

test('подменяет только group_id, остальные параметры ссылки сохраняются', () => {
  assert.equal(upstreamUrl('https://api.example.com/get?token=abc&group_id=DEV', 'CTRL1'), 'https://api.example.com/get?token=abc&group_id=CTRL1');
});

test('без CQA_DEV_URL — 503 с понятной ошибкой', async () => {
  delete process.env.CQA_DEV_URL;
  const r = await call({ group_id: 'DEV' });
  assert.equal(r.status, 503);
  assert.equal(r.body.isSuccess, false);
  assert.match(r.body.error, /CQA_DEV_URL/);
});

test('проксирует ответ организаторов как есть', async () => {
  process.env.CQA_DEV_URL = base;
  const r = await call({ group_id: 'CTRL1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.isSuccess, true);
  assert.equal(r.body.data.dataset_group_id, 'CTRL1');
  assert.match(seen.at(-1), /token=abc/);
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('отклоняет некорректный group_id и чужие методы', async () => {
  process.env.CQA_DEV_URL = base;
  assert.equal((await call({ group_id: '../../etc' })).status, 400);
  assert.equal((await call({ group_id: 'DEV&x=1' })).status, 400);
  assert.equal((await call({ group_id: 'DEV' }, 'POST')).status, 405);
});

test('не-JSON от организаторов — 502', async () => {
  process.env.CQA_DEV_URL = base;
  const r = await call({ group_id: 'BROKEN' });
  assert.equal(r.status, 502);
  assert.equal(r.body.isSuccess, false);
});
