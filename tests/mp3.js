// Длительность MP3 по заголовкам кадров (без зависимостей). Нужна тестам и скрипту подготовки данных.
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // MPEG-1 Layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG-2/2.5 Layer III
};
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Длительность в секундах. Бросает ошибку, если кадров нет. */
export function mp3Duration(buf) {
  let i = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3; // 3 — MPEG-1, 2 — MPEG-2, 0 — MPEG-2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 — Layer III
    const br = (buf[i + 2] >> 4) & 15;
    const sr = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) { i++; continue; }
    const rate = RATES[ver][sr];
    const kbps = BITRATES[ver === 3 ? 1 : 2][br];
    const samples = ver === 3 ? 1152 : 576;
    const len = Math.floor(((samples / 8) * kbps * 1000) / rate) + pad;
    if (len < 4) { i++; continue; }
    seconds += samples / rate;
    frames++;
    i += len;
  }
  if (!frames) throw new Error('в файле нет кадров MP3');
  return seconds;
}

/** «MM:SS» с округлением до секунды, минимум 00:01. */
export function mmss(sec) {
  const s = Math.max(1, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
