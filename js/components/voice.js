// Голосовое сообщение в транскрипте: «play», волна из полосок, длительность, скорость 1× / 1,5× / 2×,
// свёрнутый текст. Волна рисуется из детерминированного seed (id диалога + номер реплики), а не из аудио.
// Одновременно звучит только одна запись на странице. Воспроизведение — только по действию пользователя.
import { h, icon } from '../ui.js';

const BARS = 36;
const SPEEDS = [1, 1.5, 2];

/** Адрес файла. Пути вида /audio/… лежат в public/audio/ — считаем от папки приложения (этот файл в js/components/), чтобы работало и при встраивании. */
export function voiceSrc(url) {
  if (typeof url === 'string' && url.startsWith('/audio/')) return new URL(`../../public${url}`, import.meta.url).href;
  return url;
}

export const isVoice = (r) => r?.type === 'voice';

const parseDur = (s) => {
  const m = String(s || '').match(/^(\d+):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : 0;
};
const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const speedLabel = (v) => `${String(v).replace('.', ',')}×`;

/** Высоты полосок 0.18…1 из seed: детерминированный ГПСЧ (mulberry32) + сглаживание соседей. */
export function waveHeights(seed, n = BARS) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 0x9e3779b9) | 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const raw = Array.from({ length: n }, () => rnd());
  return raw.map((v, i) => {
    const avg = (v * 2 + (raw[i - 1] ?? v) + (raw[i + 1] ?? v)) / 4;
    const edge = Math.min(1, (i + 1) / 4, (n - i) / 4); // тише по краям, как у записи голоса
    return +(0.18 + 0.82 * avg * (0.55 + 0.45 * edge)).toFixed(3);
  });
}

// --- Одна запись за раз: при старте любой <audio> остальные ставятся на паузу ---
let guard = false;
function exclusivePlayback() {
  if (guard) return;
  guard = true;
  document.addEventListener('play', (e) => {
    if (!(e.target instanceof HTMLMediaElement)) return;
    document.querySelectorAll('audio, video').forEach((m) => { if (m !== e.target && !m.paused) m.pause(); });
  }, true);
}

/**
 * Пузырь голосового сообщения. Возвращает { el, text, play(fromStart), expand(), available() }.
 * text — элемент с текстом реплики (поиск по транскрипту подсвечивает в нём совпадения).
 */
export function voiceMessage(conv, r, n) {
  exclusivePlayback();
  const total = parseDur(r.duration);
  const src = voiceSrc(r.audio_url);
  const audio = h('audio', { preload: 'metadata', src, 'aria-hidden': 'true' });
  let unavailable = !src;

  const playBtn = h('button', { type: 'button', class: 'cqa-voice__play', 'aria-label': `Воспроизвести голосовое сообщение #${n}` }, icon('play', null, 18));
  const bars = waveHeights(`${conv.conversation_id}#${n}`).map((v) => h('i', { class: 'cqa-voice__bar', style: `--cqa-bh:${v}` }));
  const wave = h('div', {
    class: 'cqa-voice__wave', role: 'slider', tabindex: '0', 'aria-label': `Перемотка голосового сообщения #${n}`,
    'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0', 'aria-valuetext': `0:00 из ${fmt(total)}`,
  }, bars);
  const time = h('span', { class: 'cqa-voice__time' }, fmt(total));
  let speedIdx = 0;
  const speed = h('button', { type: 'button', class: 'cqa-voice__speed', 'aria-label': 'Скорость воспроизведения: 1×' }, speedLabel(1));
  const error = h('p', { class: 'cqa-voice__error', role: 'status', hidden: true }, icon('alert', null, 14), 'Аудио недоступно');

  const textId = `cqa-voice-text-${conv.conversation_id}-${n}`;
  const text = h('p', { class: 'cqa-replica__text cqa-voice__text', id: textId, hidden: true }, r.text);
  const toggle = h('button', { type: 'button', class: 'cqa-voice__toggle', 'aria-expanded': 'false', 'aria-controls': textId }, 'Показать текст');

  const bubble = h('div', { class: 'cqa-voice' },
    h('span', { class: 'cqa-voice__label' }, icon('mic', null, 12), 'голосовое'),
    h('div', { class: 'cqa-voice__row' }, playBtn, wave, time, speed),
    error, audio);
  const el = h('div', { class: 'cqa-voice-wrap' }, bubble, toggle, text);

  // --- Текст: свёрнут, раскрывается кнопкой ---
  const setOpen = (open) => {
    text.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Скрыть текст' : 'Показать текст';
  };
  toggle.addEventListener('click', () => setOpen(text.hidden));

  // --- Прогресс: полоски окрашиваются по доле прослушанного ---
  const duration = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : total);
  let lit = 0;
  let frame = 0;
  const paint = () => {
    const d = duration();
    const t = audio.currentTime || 0;
    const on = d ? Math.min(BARS, Math.round((t / d) * BARS)) : 0;
    if (on !== lit) {
      bars.forEach((b, i) => b.classList.toggle('cqa-voice__bar--on', i < on));
      lit = on;
    }
    time.textContent = audio.paused && t === 0 ? fmt(d) : fmt(t);
    wave.setAttribute('aria-valuenow', String(Math.round(t)));
    wave.setAttribute('aria-valuetext', `${fmt(t)} из ${fmt(d)}`);
  };
  const loop = () => { paint(); frame = audio.paused ? 0 : requestAnimationFrame(loop); };
  const setPlaying = (on) => {
    bubble.classList.toggle('cqa-voice--playing', on);
    el.closest('.cqa-replica')?.classList.toggle('cqa-replica--playing', on);
    playBtn.replaceChildren(icon(on ? 'pause' : 'play', null, 18));
    playBtn.setAttribute('aria-label', `${on ? 'Пауза' : 'Воспроизвести'}: голосовое сообщение #${n}`);
  };
  audio.addEventListener('play', () => { setPlaying(true); if (!frame) frame = requestAnimationFrame(loop); });
  audio.addEventListener('pause', () => { setPlaying(false); paint(); });
  audio.addEventListener('ended', () => { audio.currentTime = 0; setPlaying(false); paint(); });
  audio.addEventListener('seeked', paint);
  audio.addEventListener('loadedmetadata', paint);

  // --- Нет файла: «Аудио недоступно» и текст, без падения ---
  const markUnavailable = () => {
    unavailable = true;
    bubble.classList.add('cqa-voice--error');
    error.hidden = false;
    playBtn.disabled = true;
    speed.disabled = true;
    wave.setAttribute('aria-disabled', 'true');
    wave.tabIndex = -1;
    setOpen(true);
  };
  audio.addEventListener('error', markUnavailable);
  if (unavailable) markUnavailable();

  // Если сервер не отдаёт Range-запросы, перемотка не работает: один раз грузим файл целиком.
  let blob = false;
  async function seekable() {
    if (audio.readyState < 1) {
      await new Promise((res) => { audio.addEventListener('loadedmetadata', res, { once: true }); audio.addEventListener('error', res, { once: true }); });
    }
    const s = audio.seekable;
    if (blob || (s.length && s.end(s.length - 1) > 0)) return;
    blob = true;
    try {
      const res = await fetch(src);
      if (!res.ok) return;
      const wasPaused = audio.paused;
      const at = audio.currentTime;
      audio.src = URL.createObjectURL(await res.blob());
      await new Promise((r2) => audio.addEventListener('loadedmetadata', r2, { once: true }));
      audio.currentTime = at;
      audio.playbackRate = SPEEDS[speedIdx];
      if (!wasPaused) audio.play().catch(() => {});
    } catch { /* перемотка недоступна, воспроизведение работает */ }
  }
  async function seekTo(sec) {
    if (unavailable) return;
    await seekable();
    audio.currentTime = Math.max(0, Math.min(duration(), sec));
    paint();
  }

  const play = (fromStart = false) => {
    if (unavailable) return;
    if (fromStart) { try { audio.currentTime = 0; } catch { /* метаданные ещё грузятся */ } }
    audio.playbackRate = SPEEDS[speedIdx];
    audio.play().catch(() => {});
  };
  playBtn.addEventListener('click', () => (audio.paused ? play() : audio.pause()));
  speed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[speedIdx];
    speed.textContent = speedLabel(SPEEDS[speedIdx]);
    speed.setAttribute('aria-label', `Скорость воспроизведения: ${speedLabel(SPEEDS[speedIdx])}`);
  });
  wave.addEventListener('click', (e) => {
    const rect = wave.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * duration());
  });
  wave.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 2, ArrowUp: 2, ArrowLeft: -2, ArrowDown: -2 }[e.key];
    if (step) { e.preventDefault(); seekTo((audio.currentTime || 0) + step); }
    else if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
    else if (e.key === 'End') { e.preventDefault(); seekTo(duration()); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); playBtn.click(); }
  });

  return { el, text, play, expand: () => setOpen(true), available: () => !unavailable };
}

/** Короткая метка для фрагментов и списков: иконка микрофона, «голосовое», длительность. */
export function voiceTag(r) {
  return h('span', { class: 'cqa-voice-tag' }, icon('mic', null, 12), 'голосовое', r.duration ? ` · ${fmt(parseDur(r.duration))}` : '');
}
