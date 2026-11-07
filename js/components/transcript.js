// Транскрипт: поиск, подсветка реплик, копирование ссылки, аудиоплеер для звонков, голосовые сообщения.
import { h, icon, button, SPEAKERS, timeline, clock, copyEvidenceLink } from '../ui.js';
import { isVoice, voiceMessage, voiceTag } from './voice.js';

const KNOWN = ['client', 'operator', 'bot', 'system'];

/** Текст с подсветкой совпадений <mark>. */
function marked(text, q) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out = [];
  let i = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    out.push(text.slice(i, at), h('mark', {}, text.slice(at, at + q.length)));
    i = at + q.length;
  }
  out.push(text.slice(i));
  return out;
}

/** voice: 'player' — пузырь с плеером (полный транскрипт), 'tag' — метка и текст (фрагменты). */
function replica(conv, r, n, t, onSeek, voice = 'tag') {
  const role = KNOWN.includes(r.speaker) ? r.speaker : 'system';
  const vm = isVoice(r) && voice === 'player' ? voiceMessage(conv, r, n) : null;
  const li = h('li', { class: `cqa-replica cqa-replica--${role}${isVoice(r) ? ' cqa-replica--voice' : ''}`, 'data-n': n, tabindex: '-1', 'aria-label': `Реплика ${n}, ${SPEAKERS[r.speaker] || r.speaker}` },
    h('div', { class: 'cqa-replica__meta' },
      h('span', { class: 'cqa-replica__num' }, `#${n}`),
      h('span', { class: 'cqa-replica__who' }, SPEAKERS[r.speaker] || r.speaker),
      h('time', { class: 'cqa-replica__time', title: `Исходная метка: ${t.original}`, datetime: t.iso ? t.original : null },
        t.display, t.iso ? ` · ${clock(t.offset)}` : ''),
      h('span', { class: 'cqa-replica__tools' },
        onSeek && t.offset !== null
          ? h('button', { type: 'button', class: 'cqa-replica__tool', onclick: () => onSeek(n), 'aria-label': `Воспроизвести запись с ${clock(t.offset)}, реплика ${n}` }, icon('play', null, 12), clock(t.offset))
          : null,
        h('button', { type: 'button', class: 'cqa-replica__tool cqa-replica__tool--icon', onclick: () => copyEvidenceLink(conv.conversation_id, n), 'aria-label': `Скопировать ссылку на реплику #${n}`, title: 'Скопировать ссылку на доказательство' }, icon('link', null, 14)))),
    isVoice(r) && !vm ? voiceTag(r) : null,
    vm ? vm.el : h('p', { class: 'cqa-replica__text' }, r.text));
  if (vm) li.cqaVoice = vm;
  return li;
}

/** Полный транскрипт. Возвращает { el, show(ids | {from,to}, {seekAudio}) }. */
export function createTranscript(conv) {
  const times = timeline(conv);
  let audio = null;
  let player = null;

  if (conv.audio_url) {
    const status = h('p', { class: 'cqa-hint', 'aria-live': 'polite' }, 'Нажмите ▶ у реплики, чтобы перейти к её времени в записи.');
    audio = h('audio', { class: 'cqa-audio', controls: true, preload: 'metadata', src: conv.audio_url, 'aria-label': 'Запись звонка' });
    audio.addEventListener('error', () => {
      status.replaceChildren('Запись не загрузилась. ', h('a', { href: conv.audio_url, target: '_blank', rel: 'noopener' }, 'Открыть ссылку на запись'));
    });
    audio.addEventListener('timeupdate', () => markPlaying(audio.currentTime));
    // Эквалайзер: 6 полосок двигаются только во время воспроизведения (transform: scaleY)
    const eq = h('span', { class: 'cqa-eq', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5, 6].map(() => h('i')));
    player = h('div', { class: 'cqa-player' }, h('span', { class: 'cqa-player__title' }, icon('phone', null, 16), 'Запись звонка', eq), audio, status);
    const playing = (on) => player.classList.toggle('cqa-player--playing', on);
    audio.addEventListener('playing', () => playing(true));
    for (const ev of ['pause', 'ended', 'waiting', 'emptied']) audio.addEventListener(ev, () => playing(false));
  }

  const list = h('ol', { class: 'cqa-replicas' },
    conv.transcript.map((r, i) => replica(conv, r, i + 1, times[i], audio ? (n) => seek(n, true) : null, 'player')));
  const items = () => [...list.querySelectorAll('.cqa-replica')];

  // --- Поиск по транскрипту ---
  const count = h('span', { class: 'cqa-transcript__count', 'aria-live': 'polite' });
  const input = h('input', { class: 'cqa-input', type: 'search', placeholder: 'Поиск по транскрипту', 'aria-label': 'Поиск по транскрипту', autocomplete: 'off' });
  let hits = [];
  let cur = -1;
  const prev = button('Предыдущее совпадение', { icon: 'chevronUp', iconOnly: true, size: 'sm', disabled: true, onclick: () => step(-1) });
  const next = button('Следующее совпадение', { icon: 'chevronDown', iconOnly: true, size: 'sm', disabled: true, onclick: () => step(1) });

  function search() {
    const q = input.value.trim().toLowerCase();
    hits = [];
    items().forEach((li, i) => {
      const text = conv.transcript[i].text;
      const p = li.querySelector('.cqa-replica__text');
      p.replaceChildren(...[].concat(marked(text, q)));
      const match = !!q && text.toLowerCase().includes(q);
      li.classList.toggle('cqa-replica--dim', !!q && !match);
      if (match) { hits.push(i + 1); li.cqaVoice?.expand(); } // текст голосового раскрывается, чтобы совпадение было видно
    });
    cur = hits.length ? 0 : -1;
    prev.disabled = next.disabled = hits.length < 2;
    count.textContent = q ? (hits.length ? `1 из ${hits.length}` : 'нет') : '';
    if (hits.length) focusHit();
  }
  function step(d) {
    if (!hits.length) return;
    cur = (cur + d + hits.length) % hits.length;
    count.textContent = `${cur + 1} из ${hits.length}`;
    focusHit();
  }
  function focusHit() {
    list.querySelectorAll('.cqa-mark--current').forEach((m) => m.classList.remove('cqa-mark--current'));
    const li = list.children[hits[cur] - 1];
    li.querySelector('mark')?.classList.add('cqa-mark--current');
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });

  const searchBar = h('div', { class: 'cqa-transcript__search', role: 'search' },
    h('div', { class: 'cqa-search' }, icon('search', null, 16), input), count, prev, next);

  const el = h('section', { class: 'cqa-card cqa-transcript', 'aria-label': 'Транскрипт диалога' }, searchBar, player, list);

  let shown = 0;
  function markPlaying(sec) {
    let current = 0;
    times.forEach((t, i) => { if (t.offset !== null && t.offset <= sec + 0.05) current = i + 1; });
    items().forEach((li) => li.classList.toggle('cqa-replica--playing', Number(li.dataset.n) === current));
    // Во время воспроизведения текущая реплика подкручивается в видимую область списка (если он прокручивается)
    if (current && current !== shown && !audio.paused && list.scrollHeight > list.clientHeight + 4) {
      list.children[current - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    shown = current;
  }

  async function seek(n, play) {
    const t = times[n - 1];
    if (!audio || !t || t.offset === null) return;
    show([n]);
    await ensureSeekable();
    audio.currentTime = t.offset;
    if (play) audio.play().catch(() => {});
  }

  // Если сервер не отдаёт Range-запросы, перемотка не работает: один раз грузим запись целиком.
  let blobLoaded = false;
  async function ensureSeekable() {
    if (blobLoaded) return;
    if (audio.readyState < 1) await new Promise((r) => { audio.addEventListener('loadedmetadata', r, { once: true }); audio.addEventListener('error', r, { once: true }); audio.load(); });
    const s = audio.seekable;
    if (s.length && s.end(s.length - 1) > 0) return;
    blobLoaded = true;
    try {
      const res = await fetch(conv.audio_url);
      if (!res.ok) return;
      audio.src = URL.createObjectURL(await res.blob());
      await new Promise((r) => audio.addEventListener('loadedmetadata', r, { once: true }));
    } catch { /* остаётся обычный плеер */ }
  }

  /** Подсветить и прокрутить к репликам. target — номера (с 1) или диапазон {from, to}. */
  function show(target, { seekAudio = false } = {}) {
    const ns = Array.isArray(target) ? target : range(target);
    items().forEach((li) => li.classList.remove('cqa-replica--hl', 'cqa-replica--range'));
    const cls = Array.isArray(target) ? 'cqa-replica--hl' : 'cqa-replica--range';
    const found = ns.map((n) => list.children[n - 1]).filter(Boolean);
    if (!found.length) return;
    void list.offsetWidth; // перезапуск анимации вспышки
    found.forEach((li) => li.classList.add(cls));
    found[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    found[0].focus({ preventScroll: true });
    // Голосовое сообщение по ссылке #n запускается с начала (клик пользователя — воспроизведение разрешено)
    if (seekAudio && Array.isArray(target)) found[0].cqaVoice?.play(true);
    if (seekAudio && audio) {
      const t = times[ns[0] - 1];
      ensureSeekable().then(() => { if (t && t.offset !== null) audio.currentTime = t.offset; });
    }
  }

  return { el, show };
}

const range = (r) => (r && r.from ? Array.from({ length: Math.max(0, r.to - r.from + 1) }, (_, i) => r.from + i) : []);

/** Фрагмент для проверяющего: нужные реплики ± контекст, пропуски — многоточием. */
export function renderFragment(conv, ids, context = 1) {
  const times = timeline(conv);
  const keep = new Set();
  ids.forEach((n) => { for (let k = n - context; k <= n + context; k++) if (k >= 1 && k <= conv.transcript.length) keep.add(k); });
  const sorted = [...keep].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(h('li', { class: 'cqa-replica cqa-replica--gap', 'aria-hidden': 'true' }, '…'));
    const li = replica(conv, conv.transcript[n - 1], n, times[n - 1], null);
    if (ids.includes(n)) li.classList.add('cqa-replica--hl');
    out.push(li);
  });
  return h('ol', { class: 'cqa-replicas cqa-replicas--fragment' }, out);
}

export { range as replicaRange };
