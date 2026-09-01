'use strict';

const audio = document.getElementById('audio');
const fileInput = document.getElementById('fileInput');
const trackName = document.getElementById('trackName');
const trackMeta = document.getElementById('trackMeta');
const playPause = document.getElementById('playPause');
const back10 = document.getElementById('back10');
const forward10 = document.getElementById('forward10');
const seek = document.getElementById('seek');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const loopToggle = document.getElementById('loopToggle');
const gainSlider = document.getElementById('gain');
const gainValue = document.getElementById('gainValue');
const gainDb = document.getElementById('gainDb');

let objectUrl = null;
let currentTrackKey = null;
let audioContext = null;
let sourceNode = null;
let gainNode = null;

// 指数マッピング: slider 0..1000 -> gain 1/3..1.5
const GAIN_MIN = 1 / 3;
const GAIN_MAX = 1.5;

function sliderToGain(value) {
  const t = Number(value) / 1000;
  return GAIN_MIN * Math.pow(GAIN_MAX / GAIN_MIN, t);
}

function gainToSlider(gain) {
  const safe = Math.min(GAIN_MAX, Math.max(GAIN_MIN, Number(gain) || 1));
  return Math.round(1000 * Math.log(safe / GAIN_MIN) / Math.log(GAIN_MAX / GAIN_MIN));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function bytes(n) {
  if (!Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function trackKey(file) {
  // 音声内容そのものは保存しない。ローカル設定識別用のメタデータだけ。
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function storageKey(key) {
  return `local-mp3-player:v1:${key}`;
}

function saveTrackSettings() {
  if (!currentTrackKey) return;
  const payload = {
    gain: sliderToGain(gainSlider.value),
    loop: loopToggle.checked
  };
  localStorage.setItem(storageKey(currentTrackKey), JSON.stringify(payload));
}

function loadTrackSettings() {
  let settings = { gain: 1, loop: false };
  if (currentTrackKey) {
    try {
      const raw = localStorage.getItem(storageKey(currentTrackKey));
      if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (_) {}
  }
  gainSlider.value = gainToSlider(settings.gain);
  loopToggle.checked = Boolean(settings.loop);
  audio.loop = loopToggle.checked;
  applyGain();
}

function ensureAudioGraph() {
  if (audioContext) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('このブラウザは Web Audio API に対応していません。');
  audioContext = new AudioCtx();
  sourceNode = audioContext.createMediaElementSource(audio);
  gainNode = audioContext.createGain();
  sourceNode.connect(gainNode).connect(audioContext.destination);
}

async function resumeAudioContext() {
  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();
}

function applyGain() {
  const gain = sliderToGain(gainSlider.value);
  gainValue.value = `${gain.toFixed(2)}×`;
  gainDb.textContent = `${(20 * Math.log10(gain)).toFixed(2)} dB`;
  if (gainNode) gainNode.gain.value = gain;
}

function updateMediaSession(file) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: file.name.replace(/\.mp3$/i, ''),
    artist: 'Local file',
    album: 'Local MP3 Player'
  });
}

function setMediaActionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const safeSet = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  };
  safeSet('play', async () => { await resumeAudioContext(); await audio.play(); });
  safeSet('pause', () => audio.pause());
  safeSet('seekbackward', (details) => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); });
  safeSet('seekforward', (details) => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10)); });
  safeSet('seekto', (details) => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; });
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  currentTrackKey = trackKey(file);

  audio.src = objectUrl;
  audio.load();
  trackName.textContent = file.name;
  trackMeta.textContent = `${bytes(file.size)} ・ 端末内ローカルファイル`;
  playPause.disabled = false;
  loadTrackSettings();
  updateMediaSession(file);
});

playPause.addEventListener('click', async () => {
  if (!audio.src) return;
  if (audio.paused) {
    try {
      await resumeAudioContext();
      applyGain();
      await audio.play();
    } catch (err) {
      console.error(err);
      alert('再生を開始できませんでした。ブラウザの音声再生許可やファイル形式を確認してください。');
    }
  } else {
    audio.pause();
  }
});

back10.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
forward10.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); });

audio.addEventListener('play', () => {
  playPause.textContent = '❚❚';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  playPause.textContent = '▶';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('ended', () => { if (!audio.loop) playPause.textContent = '▶'; });
audio.addEventListener('loadedmetadata', () => { durationEl.textContent = formatTime(audio.duration); });
audio.addEventListener('timeupdate', () => {
  currentTimeEl.textContent = formatTime(audio.currentTime);
  durationEl.textContent = formatTime(audio.duration);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
  if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) });
    } catch (_) {}
  }
});

seek.addEventListener('input', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
});

loopToggle.addEventListener('change', () => {
  audio.loop = loopToggle.checked;
  saveTrackSettings();
});

gainSlider.addEventListener('input', () => {
  if (!audioContext && audio.src) {
    try { ensureAudioGraph(); } catch (_) {}
  }
  applyGain();
  saveTrackSettings();
});

window.addEventListener('beforeunload', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

setMediaActionHandlers();
applyGain();

// Service Worker はアプリ本体だけをキャッシュ。MP3はキャッシュ対象にしない。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  });
}
