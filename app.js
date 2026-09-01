'use strict';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const fileInput = $('fileInput');
const chooseFolder = $('chooseFolder');
const refreshFolder = $('refreshFolder');
const grantFolderPermission = $('grantFolderPermission');
const folderStatus = $('folderStatus');
const permissionBox = $('permissionBox');
const directoryUnsupported = $('directoryUnsupported');
const loadingOverlay = $('loadingOverlay');
const loadingText = $('loadingText');
const trackList = $('trackList');
const trackCount = $('trackCount');
const sortSelect = $('sortSelect');
const sortLabel = $('sortLabel');
const breadcrumb = $('breadcrumb');
const viewTabs = Array.from(document.querySelectorAll('.view-tab'));
const trackName = $('trackName');
const trackArtist = $('trackArtist');
const trackMeta = $('trackMeta');
const artwork = $('artwork');
const artworkPlaceholder = $('artworkPlaceholder');
const playPause = $('playPause');
const prevTrack = $('prevTrack');
const nextTrack = $('nextTrack');
const back10 = $('back10');
const forward10 = $('forward10');
const seek = $('seek');
const currentTimeEl = $('currentTime');
const durationEl = $('duration');
const loopToggle = $('loopToggle');
const gainSlider = $('gain');
const gainValue = $('gainValue');
const gainDb = $('gainDb');
const compressorToggle = $('compressorToggle');
const compressorControls = $('compressorControls');
const threshold = $('threshold');
const thresholdValue = $('thresholdValue');
const ratio = $('ratio');
const ratioValue = $('ratioValue');
const knee = $('knee');
const kneeValue = $('kneeValue');
const attack = $('attack');
const attackValue = $('attackValue');
const release = $('release');
const releaseValue = $('releaseValue');
const makeup = $('makeup');
const makeupValue = $('makeupValue');

const GAIN_MIN = 1 / 3;
const GAIN_MAX = 1.5;
const DB_NAME = 'local-mp3-player-db-v2';
const DB_STORE = 'handles';
const DIRECTORY_KEY = 'music-directory';
const SETTINGS_PREFIX = 'local-mp3-player:v3:';
const LEGACY_PREFIX = 'local-mp3-player:v2:';

let directoryHandle = null;
let tracks = [];
let sortedTracks = [];
let currentTrack = null;
let objectUrl = null;
let artworkUrl = null;
let audioContext = null;
let sourceNode = null;
let gainNode = null;
let compressorNode = null;
let makeupNode = null;
let viewMode = 'all';
let viewPath = [];

function setLoading(show, text = '音楽ライブラリを読み込み中…') {
  loadingText.textContent = text;
  loadingOverlay.classList.toggle('hidden', !show);
}
function sliderToGain(value) {
  const t = Number(value) / 1000;
  return GAIN_MIN * Math.pow(GAIN_MAX / GAIN_MIN, t);
}
function gainToSlider(gain) {
  const safe = Math.min(GAIN_MAX, Math.max(GAIN_MIN, Number(gain) || 1));
  return Math.round(1000 * Math.log(safe / GAIN_MIN) / Math.log(GAIN_MAX / GAIN_MIN));
}
function dbToGain(db) { return Math.pow(10, Number(db) / 20); }
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function bytes(n) {
  if (!Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB']; let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function isMp3(file) { return /\.mp3$/i.test(file.name) || file.type === 'audio/mpeg'; }
function baseTrackKey(file) { return `${file.name}|${file.size}|${file.lastModified}`; }
function trackKey(file, path = '') { return `${path || file.name}|${file.size}|${file.lastModified}`; }
function storageKey(key) { return `${SETTINGS_PREFIX}${key}`; }
function legacyStorageKey(file) { return `${LEGACY_PREFIX}${baseTrackKey(file)}`; }
function cmp(a, b) { return String(a || '').localeCompare(String(b || ''), 'ja', { numeric:true, sensitivity:'base' }); }
function normalizeGroupName(value, fallback) { return (value || '').trim() || fallback; }

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
async function idbSet(key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function decodeText(bytes, encodingByte) {
  if (!bytes.length) return '';
  try {
    if (encodingByte === 0) return new TextDecoder('windows-1252').decode(bytes).replace(/\0+$/g, '').trim();
    if (encodingByte === 3) return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/g, '').trim();
    if (encodingByte === 1 || encodingByte === 2) return new TextDecoder('utf-16').decode(bytes).replace(/\0+$/g, '').trim();
  } catch (_) {}
  return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/g, '').trim();
}
function synchsafe4(a,b,c,d) { return (a << 21) | (b << 14) | (c << 7) | d; }
function uint32be(view, off) { return view.getUint32(off, false); }
function findTerminator(bytes, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < bytes.length; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
    return bytes.length;
  }
  const i = bytes.indexOf(0, start);
  return i < 0 ? bytes.length : i + 1;
}
async function readId3(file) {
  const result = { title:'', artist:'', album:'', artworkBlob:null };
  try {
    const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (header.length < 10 || String.fromCharCode(...header.slice(0,3)) !== 'ID3') return result;
    const version = header[3];
    const tagSize = synchsafe4(header[6], header[7], header[8], header[9]);
    const maxRead = Math.min(file.size, 10 + tagSize, 12 * 1024 * 1024);
    const data = new Uint8Array(await file.slice(0, maxRead).arrayBuffer());
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let p = 10;
    while (p + 10 <= data.length) {
      const id = String.fromCharCode(data[p],data[p+1],data[p+2],data[p+3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4 ? synchsafe4(data[p+4],data[p+5],data[p+6],data[p+7]) : uint32be(view, p + 4);
      if (!size || p + 10 + size > data.length) break;
      const body = data.slice(p + 10, p + 10 + size);
      if ((id === 'TIT2' || id === 'TPE1' || id === 'TALB') && body.length > 1) {
        const text = decodeText(body.slice(1), body[0]);
        if (id === 'TIT2') result.title = text;
        if (id === 'TPE1') result.artist = text;
        if (id === 'TALB') result.album = text;
      } else if (id === 'APIC' && body.length > 4 && !result.artworkBlob) {
        const enc = body[0];
        let i = 1;
        const mimeEnd = body.indexOf(0, i);
        if (mimeEnd > i) {
          const mime = new TextDecoder('ascii').decode(body.slice(i, mimeEnd));
          i = mimeEnd + 1;
          i += 1;
          i = findTerminator(body, i, enc);
          if (i < body.length) result.artworkBlob = new Blob([body.slice(i)], { type: mime || 'image/jpeg' });
        }
      }
      p += 10 + size;
    }
  } catch (err) { console.warn('ID3解析をスキップ:', file.name, err); }
  return result;
}

async function makeTrack(file, path = '') {
  const tag = await readId3(file);
  return {
    file,
    key: trackKey(file, path),
    legacyKey: baseTrackKey(file),
    path,
    title: tag.title || file.name.replace(/\.mp3$/i, ''),
    artist: tag.artist || '',
    album: tag.album || '',
    artworkBlob: tag.artworkBlob
  };
}
async function mapLimit(items, limit, worker, onProgress) {
  const out = new Array(items.length); let cursor = 0; let done = 0;
  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i], i);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, run));
  return out;
}
async function collectFiles(handle, prefix = '', found = []) {
  for await (const [name, child] of handle.entries()) {
    if (child.kind === 'file') {
      const file = await child.getFile();
      if (isMp3(file)) found.push({ file, path: prefix + name });
    } else if (child.kind === 'directory') {
      await collectFiles(child, `${prefix}${name}/`, found);
    }
  }
  return found;
}

async function loadDirectory(handle) {
  folderStatus.textContent = `「${handle.name}」を読み込み中…`;
  refreshFolder.disabled = true;
  permissionBox.classList.add('hidden');
  setLoading(true, 'フォルダを探索中…');
  try {
    const files = await collectFiles(handle);
    if (!files.length) {
      tracks = [];
      folderStatus.textContent = `登録フォルダ: ${handle.name}`;
      renderLibrary();
      return;
    }
    tracks = await mapLimit(
      files,
      4,
      ({file,path}) => makeTrack(file, path),
      (done, total) => setLoading(true, `曲情報を読み込み中… ${done}/${total}`)
    );
    folderStatus.textContent = `登録フォルダ: ${handle.name}`;
    refreshFolder.disabled = false;
    viewPath = [];
    renderLibrary();
  } catch (err) {
    console.error(err);
    folderStatus.textContent = 'フォルダの読み込みに失敗しました';
    if (err && err.name === 'NotAllowedError') permissionBox.classList.remove('hidden');
  } finally {
    refreshFolder.disabled = !directoryHandle;
    setLoading(false);
  }
}

function sortTrackArray(list) {
  const field = sortSelect.value;
  const value = (t) => field === 'filename' ? t.file.name : (t[field] || '');
  return [...list].sort((a,b) => cmp(value(a), value(b)) || cmp(a.file.name, b.file.name));
}
function makeTrackRow(t) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'track-row' + (currentTrack?.key === t.key ? ' active' : '');
  const left = document.createElement('div');
  const title = document.createElement('div'); title.className = 'track-row-title'; title.textContent = t.title;
  const sub = document.createElement('div'); sub.className = 'track-row-sub';
  sub.textContent = [t.artist, t.album, t.path && t.path !== t.file.name ? t.path : ''].filter(Boolean).join(' ・ ') || t.file.name;
  const size = document.createElement('div'); size.className = 'track-row-size'; size.textContent = bytes(t.file.size);
  left.append(title, sub); row.append(left, size);
  row.addEventListener('click', () => selectTrack(t, true));
  return row;
}
function makeFolderRow(name, subtitle, onClick) {
  const row = document.createElement('button'); row.type = 'button'; row.className = 'folder-row';
  const left = document.createElement('div');
  const title = document.createElement('div'); title.className = 'folder-row-title'; title.textContent = name;
  const sub = document.createElement('div'); sub.className = 'folder-row-sub'; sub.textContent = subtitle;
  const arrow = document.createElement('div'); arrow.className = 'folder-row-arrow'; arrow.textContent = '›';
  left.append(title, sub); row.append(left, arrow); row.addEventListener('click', onClick); return row;
}
function setBreadcrumb(parts) {
  breadcrumb.replaceChildren();
  if (!parts.length) { breadcrumb.classList.add('hidden'); return; }
  breadcrumb.classList.remove('hidden');
  parts.forEach((part, i) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'crumb' + (i === parts.length - 1 ? ' current' : ''); btn.textContent = part.label;
    if (i < parts.length - 1) btn.addEventListener('click', part.onClick);
    breadcrumb.append(btn);
    if (i < parts.length - 1) { const sep = document.createElement('span'); sep.className = 'crumb-sep'; sep.textContent = '›'; breadcrumb.append(sep); }
  });
}
function renderTrackRows(list) {
  const sorted = sortTrackArray(list);
  sortedTracks = sorted;
  for (const t of sorted) trackList.append(makeTrackRow(t));
}
function groupCountText(list) { return `${list.length}曲`; }

function renderAllView() {
  setBreadcrumb([]);
  sortLabel.classList.remove('hidden');
  renderTrackRows(tracks);
}
function renderFolderView() {
  sortLabel.classList.add('hidden');
  const pathPrefix = viewPath.length ? `${viewPath.join('/')}/` : '';
  const immediateFolders = new Map();
  const directTracks = [];
  for (const t of tracks) {
    if (!t.path.startsWith(pathPrefix)) continue;
    const rest = t.path.slice(pathPrefix.length);
    const parts = rest.split('/');
    if (parts.length === 1) directTracks.push(t);
    else {
      const name = parts[0];
      if (!immediateFolders.has(name)) immediateFolders.set(name, []);
      immediateFolders.get(name).push(t);
    }
  }
  const rootLabel = directoryHandle?.name || '選択ファイル';
  const crumbs = [{ label:rootLabel, onClick:() => { viewPath = []; renderLibrary(); } }];
  viewPath.forEach((seg, idx) => crumbs.push({ label:seg, onClick:() => { viewPath = viewPath.slice(0, idx + 1); renderLibrary(); } }));
  setBreadcrumb(crumbs);
  sortedTracks = sortTrackArray(directTracks);
  for (const [name, list] of [...immediateFolders.entries()].sort((a,b) => cmp(a[0], b[0]))) {
    trackList.append(makeFolderRow(name, groupCountText(list), () => { viewPath.push(name); renderLibrary(); }));
  }
  renderTrackRows(directTracks);
}
function renderArtistView() {
  sortLabel.classList.add('hidden');
  const artistName = viewPath[0] || null;
  const albumName = viewPath[1] || null;
  if (!artistName) {
    setBreadcrumb([]);
    const groups = new Map();
    for (const t of tracks) {
      const key = normalizeGroupName(t.artist, 'アーティスト未設定');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    sortedTracks = [];
    for (const [name, list] of [...groups.entries()].sort((a,b) => cmp(a[0], b[0]))) {
      trackList.append(makeFolderRow(name, groupCountText(list), () => { viewPath = [name]; renderLibrary(); }));
    }
    return;
  }
  const artistTracks = tracks.filter(t => normalizeGroupName(t.artist, 'アーティスト未設定') === artistName);
  if (!albumName) {
    setBreadcrumb([
      { label:'アーティスト', onClick:() => { viewPath = []; renderLibrary(); } },
      { label:artistName, onClick:() => {} }
    ]);
    const groups = new Map();
    for (const t of artistTracks) {
      const key = normalizeGroupName(t.album, 'アルバム未設定');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    sortedTracks = [];
    for (const [name, list] of [...groups.entries()].sort((a,b) => cmp(a[0], b[0]))) {
      trackList.append(makeFolderRow(name, groupCountText(list), () => { viewPath = [artistName, name]; renderLibrary(); }));
    }
    return;
  }
  setBreadcrumb([
    { label:'アーティスト', onClick:() => { viewPath = []; renderLibrary(); } },
    { label:artistName, onClick:() => { viewPath = [artistName]; renderLibrary(); } },
    { label:albumName, onClick:() => {} }
  ]);
  const list = artistTracks.filter(t => normalizeGroupName(t.album, 'アルバム未設定') === albumName);
  sortLabel.classList.remove('hidden');
  renderTrackRows(list);
}
function renderAlbumView() {
  sortLabel.classList.add('hidden');
  const albumName = viewPath[0] || null;
  if (!albumName) {
    setBreadcrumb([]);
    const groups = new Map();
    for (const t of tracks) {
      const key = normalizeGroupName(t.album, 'アルバム未設定');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    sortedTracks = [];
    for (const [name, list] of [...groups.entries()].sort((a,b) => cmp(a[0], b[0]))) {
      const artists = [...new Set(list.map(t => normalizeGroupName(t.artist, 'アーティスト未設定')))];
      const sub = artists.length <= 2 ? `${artists.join(' / ')} ・ ${list.length}曲` : `${artists.length}アーティスト ・ ${list.length}曲`;
      trackList.append(makeFolderRow(name, sub, () => { viewPath = [name]; renderLibrary(); }));
    }
    return;
  }
  setBreadcrumb([
    { label:'アルバム', onClick:() => { viewPath = []; renderLibrary(); } },
    { label:albumName, onClick:() => {} }
  ]);
  sortLabel.classList.remove('hidden');
  renderTrackRows(tracks.filter(t => normalizeGroupName(t.album, 'アルバム未設定') === albumName));
}
function renderLibrary() {
  trackCount.textContent = `${tracks.length}曲`;
  trackList.replaceChildren();
  if (!tracks.length) {
    setBreadcrumb([]);
    const empty = document.createElement('div'); empty.className = 'empty-list'; empty.textContent = 'MP3が見つかりません'; trackList.append(empty); sortedTracks = []; return;
  }
  if (viewMode === 'folder') renderFolderView();
  else if (viewMode === 'artist') renderArtistView();
  else if (viewMode === 'album') renderAlbumView();
  else renderAllView();
}

function defaultSettings() {
  return { gain:1, loop:true, compressor:{ enabled:false, threshold:-35, ratio:2.5, knee:20, attack:0.01, release:0.25, makeup:0 } };
}
function getSettings() {
  const base = defaultSettings();
  if (!currentTrack) return base;
  try {
    let raw = localStorage.getItem(storageKey(currentTrack.key));
    if (!raw) raw = localStorage.getItem(legacyStorageKey(currentTrack.file));
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return { ...base, ...parsed, compressor:{ ...base.compressor, ...(parsed.compressor || {}) } };
  } catch (_) { return base; }
}
function saveTrackSettings() {
  if (!currentTrack) return;
  const payload = {
    gain:sliderToGain(gainSlider.value), loop:loopToggle.checked,
    compressor:{ enabled:compressorToggle.checked, threshold:Number(threshold.value), ratio:Number(ratio.value), knee:Number(knee.value), attack:Number(attack.value), release:Number(release.value), makeup:Number(makeup.value) }
  };
  localStorage.setItem(storageKey(currentTrack.key), JSON.stringify(payload));
}
function loadTrackSettings() {
  const s = getSettings();
  gainSlider.value = gainToSlider(s.gain); loopToggle.checked = Boolean(s.loop); audio.loop = loopToggle.checked;
  compressorToggle.checked = Boolean(s.compressor.enabled);
  threshold.value = s.compressor.threshold; ratio.value = s.compressor.ratio; knee.value = s.compressor.knee;
  attack.value = s.compressor.attack; release.value = s.compressor.release; makeup.value = s.compressor.makeup;
  applyAudioSettings();
}

function ensureAudioGraph() {
  if (audioContext) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API非対応です。');
  audioContext = new AudioCtx();
  sourceNode = audioContext.createMediaElementSource(audio);
  gainNode = audioContext.createGain();
  compressorNode = audioContext.createDynamicsCompressor();
  makeupNode = audioContext.createGain();
  sourceNode.connect(gainNode);
  rebuildAudioGraph();
}
function rebuildAudioGraph() {
  if (!gainNode) return;
  try { gainNode.disconnect(); } catch (_) {}
  try { compressorNode.disconnect(); } catch (_) {}
  try { makeupNode.disconnect(); } catch (_) {}
  if (compressorToggle.checked) gainNode.connect(compressorNode).connect(makeupNode).connect(audioContext.destination);
  else gainNode.connect(audioContext.destination);
}
async function resumeAudioContext() {
  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();
}
function applyAudioSettings() {
  const g = sliderToGain(gainSlider.value);
  gainValue.value = `${g.toFixed(2)}×`; gainDb.textContent = `${(20 * Math.log10(g)).toFixed(2)} dB`;
  thresholdValue.value = `${Number(threshold.value).toFixed(0)} dB`;
  ratioValue.value = `${Number(ratio.value).toFixed(1)} : 1`;
  kneeValue.value = `${Number(knee.value).toFixed(0)} dB`;
  attackValue.value = `${Math.round(Number(attack.value) * 1000)} ms`;
  releaseValue.value = `${Math.round(Number(release.value) * 1000)} ms`;
  makeupValue.value = `${Number(makeup.value).toFixed(1)} dB`;
  compressorControls.classList.toggle('disabled-panel', !compressorToggle.checked);
  if (gainNode) gainNode.gain.value = g;
  if (compressorNode) {
    compressorNode.threshold.value = Number(threshold.value); compressorNode.ratio.value = Number(ratio.value);
    compressorNode.knee.value = Number(knee.value); compressorNode.attack.value = Number(attack.value); compressorNode.release.value = Number(release.value);
    makeupNode.gain.value = dbToGain(makeup.value); rebuildAudioGraph();
  }
}

function clearArtwork() {
  if (artworkUrl) URL.revokeObjectURL(artworkUrl); artworkUrl = null;
  artwork.hidden = true; artwork.removeAttribute('src'); artworkPlaceholder.hidden = false;
}
function showArtwork(blob) {
  clearArtwork();
  if (!blob) return;
  artworkUrl = URL.createObjectURL(blob); artwork.src = artworkUrl; artwork.hidden = false; artworkPlaceholder.hidden = true;
}
function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  const metadata = { title:t.title, artist:t.artist || 'Local file', album:t.album || '' };
  if (t.artworkBlob) {
    const u = URL.createObjectURL(t.artworkBlob);
    metadata.artwork = [{ src:u, sizes:'512x512', type:t.artworkBlob.type || 'image/jpeg' }];
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
  navigator.mediaSession.metadata = new MediaMetadata(metadata);
}

async function selectTrack(t, autoplay = false) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  currentTrack = t; objectUrl = URL.createObjectURL(t.file); audio.src = objectUrl; audio.load();
  trackName.textContent = t.title; trackArtist.textContent = t.artist || 'アーティスト情報なし';
  trackMeta.textContent = [t.album, bytes(t.file.size), t.path || t.file.name].filter(Boolean).join(' ・ ');
  showArtwork(t.artworkBlob); playPause.disabled = false; prevTrack.disabled = false; nextTrack.disabled = false;
  loadTrackSettings(); updateMediaSession(t); renderLibrary();
  if (autoplay) { try { await resumeAudioContext(); applyAudioSettings(); await audio.play(); } catch (err) { console.warn(err); } }
}
function playbackList() {
  if (sortedTracks.length) return sortedTracks;
  return sortTrackArray(tracks);
}
function adjacentTrack(delta) {
  const list = playbackList();
  if (!currentTrack || !list.length) return;
  let idx = list.findIndex(t => t.key === currentTrack.key);
  if (idx < 0) idx = sortTrackArray(tracks).findIndex(t => t.key === currentTrack.key);
  const source = idx >= 0 && list.some(t => t.key === currentTrack.key) ? list : sortTrackArray(tracks);
  idx = source.findIndex(t => t.key === currentTrack.key);
  if (idx < 0) return;
  selectTrack(source[(idx + delta + source.length) % source.length], true);
}

chooseFolder.addEventListener('click', async () => {
  if (!('showDirectoryPicker' in window)) return;
  try {
    directoryHandle = await window.showDirectoryPicker({ mode:'read', id:'local-mp3-music-folder', startIn:'music' });
    await idbSet(DIRECTORY_KEY, directoryHandle);
    await loadDirectory(directoryHandle);
  } catch (err) { if (err.name !== 'AbortError') console.error(err); }
});
refreshFolder.addEventListener('click', () => directoryHandle && loadDirectory(directoryHandle));
grantFolderPermission.addEventListener('click', async () => {
  if (!directoryHandle) return;
  try {
    const state = await directoryHandle.requestPermission({ mode:'read' });
    if (state === 'granted') await loadDirectory(directoryHandle);
  } catch (err) { console.error(err); }
});
fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []).filter(isMp3);
  if (!files.length) return;
  directoryHandle = null;
  folderStatus.textContent = `手動選択: ${files.length}曲`;
  setLoading(true, '曲情報を読み込み中…');
  try {
    tracks = await mapLimit(files, 4, (file) => makeTrack(file, file.name), (done,total) => setLoading(true, `曲情報を読み込み中… ${done}/${total}`));
    viewPath = [];
    renderLibrary();
    if (tracks.length === 1) selectTrack(tracks[0], false);
  } finally { setLoading(false); }
});
sortSelect.addEventListener('change', renderLibrary);
viewTabs.forEach(btn => btn.addEventListener('click', () => {
  viewMode = btn.dataset.view;
  viewPath = [];
  viewTabs.forEach(x => x.classList.toggle('active', x === btn));
  renderLibrary();
}));

playPause.addEventListener('click', async () => {
  if (!audio.src) return;
  if (audio.paused) { try { await resumeAudioContext(); applyAudioSettings(); await audio.play(); } catch (err) { console.error(err); alert('再生を開始できませんでした。'); } }
  else audio.pause();
});
prevTrack.addEventListener('click', () => adjacentTrack(-1)); nextTrack.addEventListener('click', () => adjacentTrack(1));
back10.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
forward10.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); });
seek.addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(seek.value) / 1000 * audio.duration; });
loopToggle.addEventListener('change', () => { audio.loop = loopToggle.checked; saveTrackSettings(); });
[gainSlider, threshold, ratio, knee, attack, release, makeup].forEach(el => el.addEventListener('input', () => {
  if (!audioContext && audio.src) { try { ensureAudioGraph(); } catch (_) {} }
  applyAudioSettings(); saveTrackSettings();
}));
compressorToggle.addEventListener('change', () => {
  if (!audioContext && audio.src) { try { ensureAudioGraph(); } catch (_) {} }
  applyAudioSettings(); saveTrackSettings();
});

audio.addEventListener('play', () => { playPause.textContent = '❚❚'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { playPause.textContent = '▶'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('loadedmetadata', () => { durationEl.textContent = formatTime(audio.duration); });
audio.addEventListener('timeupdate', () => {
  currentTimeEl.textContent = formatTime(audio.currentTime); durationEl.textContent = formatTime(audio.duration);
  if (Number.isFinite(audio.duration) && audio.duration > 0) seek.value = Math.round(audio.currentTime / audio.duration * 1000);
  if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
    try { navigator.mediaSession.setPositionState({ duration:audio.duration, playbackRate:audio.playbackRate, position:Math.min(audio.currentTime,audio.duration) }); } catch (_) {}
  }
});

function setMediaActionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const safeSet = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {} };
  safeSet('play', async () => { await resumeAudioContext(); await audio.play(); }); safeSet('pause', () => audio.pause());
  safeSet('previoustrack', () => adjacentTrack(-1)); safeSet('nexttrack', () => adjacentTrack(1));
  safeSet('seekbackward', d => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
  safeSet('seekforward', d => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (d.seekOffset || 10)); });
  safeSet('seekto', d => { if (Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
}

async function restoreDirectory() {
  if (!('showDirectoryPicker' in window)) {
    chooseFolder.disabled = true;
    directoryUnsupported.classList.remove('hidden');
    return;
  }
  try { directoryHandle = await idbGet(DIRECTORY_KEY); } catch (err) { console.warn(err); }
  if (!directoryHandle) return;
  folderStatus.textContent = `前回のフォルダ: ${directoryHandle.name}`;
  refreshFolder.disabled = false;
  try {
    const state = await directoryHandle.queryPermission({ mode:'read' });
    if (state === 'granted') await loadDirectory(directoryHandle);
    else permissionBox.classList.remove('hidden');
  } catch (err) {
    console.warn(err);
    permissionBox.classList.remove('hidden');
  }
}

window.addEventListener('beforeunload', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); clearArtwork(); });
prevTrack.disabled = true; nextTrack.disabled = true; loopToggle.checked = true; audio.loop = true;
setMediaActionHandlers(); applyAudioSettings(); renderLibrary(); restoreDirectory();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
