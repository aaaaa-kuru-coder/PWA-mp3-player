'use strict';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const fileInput = $('fileInput');
const chooseFolder = $('chooseFolder');
const refreshFolder = $('refreshFolder');
const analyzeMetadataButton = $('analyzeMetadata');
const grantFolderPermission = $('grantFolderPermission');
const folderStatus = $('folderStatus');
const metadataStatus = $('metadataStatus');
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
const appMenuButton = $('appMenuButton');
const appMenu = $('appMenu');
const loopMenuButton = $('loopMenuButton');
const loopMenu = $('loopMenu');
const loopModeLabel = $('loopModeLabel');
const loopModeInputs = Array.from(document.querySelectorAll('input[name="loopMode"]'));
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
const HANDLE_STORE = 'handles';
const LIBRARY_STORE = 'library';
const DIRECTORY_KEY = 'music-directory';
const LIBRARY_KEY = 'library-cache-v4';
const SETTINGS_PREFIX = 'local-mp3-player:v4:';
const V3_PREFIX = 'local-mp3-player:v3:';
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
let metadataRunId = 0;
let cacheSaveTimer = null;

function setLoading(show, text = '音楽ライブラリを読み込み中…') {
  loadingText.textContent = text;
  loadingOverlay.classList.toggle('hidden', !show);
}
function setMetadataStatus(text = '') {
  metadataStatus.textContent = text;
  metadataStatus.classList.toggle('hidden', !text);
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
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB']; let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function isMp3Name(name) { return /\.mp3$/i.test(name || ''); }
function baseTrackKey(file) { return `${file.name}|${file.size}|${file.lastModified}`; }
function trackKeyFor(t, file = null) {
  if (t.path && file) return `${t.path}|${file.size}|${file.lastModified}`;
  if (t.path) return `${t.path}|${t.size || 0}|${t.lastModified || 0}`;
  return file ? baseTrackKey(file) : t.name;
}
function storageKey(key) { return `${SETTINGS_PREFIX}${key}`; }
function v3StorageKey(key) { return `${V3_PREFIX}${key}`; }
function legacyStorageKey(file) { return `${LEGACY_PREFIX}${baseTrackKey(file)}`; }
function cmp(a, b) { return String(a || '').localeCompare(String(b || ''), 'ja', { numeric:true, sensitivity:'base' }); }
function normalizeGroupName(value, fallback) { return (value || '').trim() || fallback; }
function yieldToUi() { return new Promise(resolve => setTimeout(resolve, 0)); }

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) db.createObjectStore(LIBRARY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(storeName, key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
async function idbSet(storeName, key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function serializableTrack(t) {
  if (!t.handle) return null;
  return {
    handle:t.handle,
    path:t.path,
    name:t.name,
    size:t.size || 0,
    lastModified:t.lastModified || 0,
    title:t.title || t.name.replace(/\.mp3$/i, ''),
    artist:t.artist || '',
    album:t.album || '',
    metadataLoaded:Boolean(t.metadataLoaded)
  };
}
async function saveLibraryCache() {
  if (!directoryHandle) return;
  const cached = tracks.map(serializableTrack).filter(Boolean);
  await idbSet(LIBRARY_STORE, LIBRARY_KEY, { folderName:directoryHandle.name, savedAt:Date.now(), tracks:cached });
}
function scheduleCacheSave() {
  clearTimeout(cacheSaveTimer);
  cacheSaveTimer = setTimeout(() => saveLibraryCache().catch(console.warn), 350);
}
async function loadLibraryCache() {
  try {
    const cached = await idbGet(LIBRARY_STORE, LIBRARY_KEY);
    if (!cached?.tracks?.length) return false;
    tracks = cached.tracks.map(t => ({ ...t, file:null, artworkBlob:null, artworkScanned:false }));
    folderStatus.textContent = `キャッシュ済み: ${cached.folderName || '音楽フォルダ'} ・ ${tracks.length}曲`;
    viewPath = [];
    renderLibrary();
    return true;
  } catch (err) {
    console.warn('ライブラリキャッシュの読み込み失敗:', err);
    return false;
  }
}

function decodeText(data, encodingByte) {
  if (!data.length) return '';
  try {
    if (encodingByte === 0) return new TextDecoder('windows-1252').decode(data).replace(/\0+$/g, '').trim();
    if (encodingByte === 3) return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
    if (encodingByte === 1 || encodingByte === 2) return new TextDecoder('utf-16').decode(data).replace(/\0+$/g, '').trim();
  } catch (_) {}
  return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
}
function synchsafe4(a,b,c,d) { return (a << 21) | (b << 14) | (c << 7) | d; }
function uint32be(view, off) { return view.getUint32(off, false); }
function findTerminator(data, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < data.length; i += 2) if (data[i] === 0 && data[i + 1] === 0) return i + 2;
    return data.length;
  }
  const i = data.indexOf(0, start);
  return i < 0 ? data.length : i + 1;
}
async function readId3(file, includeArtwork = false) {
  const result = { title:'', artist:'', album:'', artworkBlob:null };
  try {
    const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (header.length < 10 || String.fromCharCode(...header.slice(0,3)) !== 'ID3') return result;
    const version = header[3];
    const tagSize = synchsafe4(header[6], header[7], header[8], header[9]);
    const tagEnd = Math.min(file.size, 10 + tagSize);
    let p = 10;
    let guard = 0;
    while (p + 10 <= tagEnd && guard++ < 5000) {
      const fh = new Uint8Array(await file.slice(p, p + 10).arrayBuffer());
      if (fh.length < 10) break;
      const id = String.fromCharCode(fh[0],fh[1],fh[2],fh[3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4 ? synchsafe4(fh[4],fh[5],fh[6],fh[7]) : uint32be(new DataView(fh.buffer), 4);
      if (!size || p + 10 + size > tagEnd) break;
      if (id === 'TIT2' || id === 'TPE1' || id === 'TALB') {
        const body = new Uint8Array(await file.slice(p + 10, p + 10 + size).arrayBuffer());
        if (body.length > 1) {
          const text = decodeText(body.slice(1), body[0]);
          if (id === 'TIT2') result.title = text;
          if (id === 'TPE1') result.artist = text;
          if (id === 'TALB') result.album = text;
        }
      } else if (includeArtwork && id === 'APIC' && !result.artworkBlob && size <= 20 * 1024 * 1024) {
        const body = new Uint8Array(await file.slice(p + 10, p + 10 + size).arrayBuffer());
        if (body.length > 4) {
          const enc = body[0];
          let i = 1;
          const mimeEnd = body.indexOf(0, i);
          if (mimeEnd > i) {
            const mime = new TextDecoder('ascii').decode(body.slice(i, mimeEnd));
            i = mimeEnd + 1;
            i += 1;
            i = findTerminator(body, i, enc);
            if (i < body.length) result.artworkBlob = new Blob([body.slice(i)], { type:mime || 'image/jpeg' });
          }
        }
      }
      p += 10 + size;
      if (!includeArtwork && result.title && result.artist && result.album) break;
    }
  } catch (err) { console.warn('ID3解析をスキップ:', file.name, err); }
  return result;
}

async function collectHandles(handle, prefix = '', found = [], progress = null) {
  for await (const [name, child] of handle.entries()) {
    if (child.kind === 'file') {
      if (isMp3Name(name)) {
        found.push({ handle:child, path:prefix + name, name });
        if (progress && found.length % 25 === 0) progress(found.length);
      }
    } else if (child.kind === 'directory') {
      await collectHandles(child, `${prefix}${name}/`, found, progress);
    }
  }
  return found;
}

async function refreshLibraryStructure(handle) {
  metadataRunId++;
  permissionBox.classList.add('hidden');
  refreshFolder.disabled = true;
  analyzeMetadataButton.disabled = true;
  setLoading(true, 'フォルダ構造を確認中…');
  try {
    const found = await collectHandles(handle, '', [], count => setLoading(true, `フォルダ構造を確認中… ${count}曲`));
    const oldByPath = new Map(tracks.filter(t => t.handle).map(t => [t.path, t]));
    const next = found.map(entry => {
      const old = oldByPath.get(entry.path);
      if (old) return { ...old, handle:entry.handle, name:entry.name, file:null, artworkBlob:null, artworkScanned:false };
      return {
        handle:entry.handle, file:null, path:entry.path, name:entry.name,
        size:0, lastModified:0,
        title:entry.name.replace(/\.mp3$/i, ''), artist:'', album:'', metadataLoaded:false, artworkBlob:null, artworkScanned:false
      };
    });
    tracks = next;
    viewPath = [];
    folderStatus.textContent = `登録フォルダ: ${handle.name} ・ ${tracks.length}曲`;
    renderLibrary();
    await saveLibraryCache();
    setLoading(false);
    refreshFolder.disabled = false;
    analyzeMetadataButton.disabled = !tracks.some(t => !t.metadataLoaded);
    if (tracks.some(t => !t.metadataLoaded)) {
      setMetadataStatus(`未解析 ${tracks.filter(t => !t.metadataLoaded).length}曲。曲一覧は使用できます。`);
      setTimeout(() => enrichMetadataInBackground(false), 80);
    } else setMetadataStatus('');
  } catch (err) {
    console.error(err);
    folderStatus.textContent = 'フォルダ構造の読み込みに失敗しました';
    if (err?.name === 'NotAllowedError') permissionBox.classList.remove('hidden');
    setLoading(false);
  } finally {
    refreshFolder.disabled = !directoryHandle;
  }
}

async function enrichTrackMetadata(t, includeArtwork = false) {
  let file = t.file;
  if (!file && t.handle) file = await t.handle.getFile();
  if (!file) return null;
  const tag = await readId3(file, includeArtwork);
  t.size = file.size;
  t.lastModified = file.lastModified;
  t.title = tag.title || t.title || file.name.replace(/\.mp3$/i, '');
  t.artist = tag.artist || t.artist || '';
  t.album = tag.album || t.album || '';
  t.metadataLoaded = true;
  if (includeArtwork) t.artworkBlob = tag.artworkBlob;
  return file;
}

async function enrichMetadataInBackground(force = false) {
  const runId = ++metadataRunId;
  const candidates = tracks.filter(t => t.handle && (force || !t.metadataLoaded));
  if (!candidates.length) { setMetadataStatus(''); analyzeMetadataButton.disabled = true; return; }
  analyzeMetadataButton.disabled = true;
  let done = 0;
  let dirty = 0;
  setMetadataStatus(`曲情報をバックグラウンド解析中… 0/${candidates.length}`);
  for (const t of candidates) {
    if (runId !== metadataRunId) return;
    try { await enrichTrackMetadata(t, false); } catch (err) { console.warn('曲情報取得失敗:', t.path, err); }
    done++; dirty++;
    if (done % 5 === 0 || done === candidates.length) {
      setMetadataStatus(`曲情報をバックグラウンド解析中… ${done}/${candidates.length}`);
      renderLibrary();
    }
    if (dirty >= 10) { dirty = 0; await saveLibraryCache().catch(console.warn); }
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  if (runId !== metadataRunId) return;
  await saveLibraryCache().catch(console.warn);
  setMetadataStatus('曲情報の解析が完了しました');
  setTimeout(() => { if (runId === metadataRunId) setMetadataStatus(''); }, 2500);
  analyzeMetadataButton.disabled = false;
  renderLibrary();
}

function sortTrackArray(list) {
  const field = sortSelect.value;
  const value = (t) => field === 'filename' ? t.name : (t[field] || '');
  return [...list].sort((a,b) => cmp(value(a), value(b)) || cmp(a.name, b.name));
}
function makeTrackRow(t) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'track-row' + (currentTrack?.path === t.path ? ' active' : '');
  const left = document.createElement('div');
  const title = document.createElement('div'); title.className = 'track-row-title'; title.textContent = t.title || t.name.replace(/\.mp3$/i, '');
  const sub = document.createElement('div'); sub.className = 'track-row-sub';
  const info = [t.artist, t.album, t.path && t.path !== t.name ? t.path : ''].filter(Boolean);
  sub.textContent = info.join(' ・ ') || (t.metadataLoaded ? t.name : `${t.name} ・ 曲情報未解析`);
  const right = document.createElement('div'); right.className = 'track-row-size'; right.textContent = bytes(t.size) || (t.metadataLoaded ? '' : '…');
  left.append(title, sub); row.append(left, right);
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
  const sorted = sortTrackArray(list); sortedTracks = sorted;
  for (const t of sorted) trackList.append(makeTrackRow(t));
}
function groupCountText(list) { return `${list.length}曲`; }
function renderAllView() { setBreadcrumb([]); sortLabel.classList.remove('hidden'); renderTrackRows(tracks); }
function renderFolderView() {
  sortLabel.classList.add('hidden');
  const pathPrefix = viewPath.length ? `${viewPath.join('/')}/` : '';
  const immediateFolders = new Map(); const directTracks = [];
  for (const t of tracks) {
    if (!t.path.startsWith(pathPrefix)) continue;
    const rest = t.path.slice(pathPrefix.length); const parts = rest.split('/');
    if (parts.length === 1) directTracks.push(t);
    else { const name = parts[0]; if (!immediateFolders.has(name)) immediateFolders.set(name, []); immediateFolders.get(name).push(t); }
  }
  const rootLabel = directoryHandle?.name || '音楽フォルダ';
  const crumbs = [{ label:rootLabel, onClick:() => { viewPath = []; renderLibrary(); } }];
  viewPath.forEach((seg, idx) => crumbs.push({ label:seg, onClick:() => { viewPath = viewPath.slice(0, idx + 1); renderLibrary(); } }));
  setBreadcrumb(crumbs); sortedTracks = sortTrackArray(directTracks);
  for (const [name, list] of [...immediateFolders.entries()].sort((a,b) => cmp(a[0], b[0]))) trackList.append(makeFolderRow(name, groupCountText(list), () => { viewPath.push(name); renderLibrary(); }));
  renderTrackRows(directTracks);
}
function renderArtistView() {
  sortLabel.classList.add('hidden');
  const artistName = viewPath[0] || null; const albumName = viewPath[1] || null;
  if (!artistName) {
    setBreadcrumb([]); const groups = new Map();
    for (const t of tracks) { const key = normalizeGroupName(t.artist, t.metadataLoaded ? 'アーティスト未設定' : '曲情報未解析'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); }
    sortedTracks = [];
    for (const [name, list] of [...groups.entries()].sort((a,b) => cmp(a[0], b[0]))) trackList.append(makeFolderRow(name, groupCountText(list), () => { viewPath = [name]; renderLibrary(); }));
    return;
  }
  const artistTracks = tracks.filter(t => normalizeGroupName(t.artist, t.metadataLoaded ? 'アーティスト未設定' : '曲情報未解析') === artistName);
  if (!albumName) {
    setBreadcrumb([{ label:'アーティスト', onClick:() => { viewPath = []; renderLibrary(); } }, { label:artistName, onClick:() => {} }]);
    const groups = new Map();
    for (const t of artistTracks) { const key = normalizeGroupName(t.album, t.metadataLoaded ? 'アルバム未設定' : '曲情報未解析'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); }
    sortedTracks = [];
    for (const [name, list] of [...groups.entries()].sort((a,b) => cmp(a[0], b[0]))) trackList.append(makeFolderRow(name, groupCountText(list), () => { viewPath = [artistName, name]; renderLibrary(); }));
    return;
  }
  setBreadcrumb([{ label:'アーティスト', onClick:() => { viewPath = []; renderLibrary(); } }, { label:artistName, onClick:() => { viewPath = [artistName]; renderLibrary(); } }, { label:albumName, onClick:() => {} }]);
  sortLabel.classList.remove('hidden');
  renderTrackRows(artistTracks.filter(t => normalizeGroupName(t.album, t.metadataLoaded ? 'アルバム未設定' : '曲情報未解析') === albumName));
}
function renderAlbumView() {
  sortLabel.classList.add('hidden');
  const albumName = viewPath[0] || null;
  if (!albumName) {
    setBreadcrumb([]); const groups = new Map();
    for (const t of tracks) { const key = normalizeGroupName(t.album, t.metadataLoaded ? 'アルバム未設定' : '曲情報未解析'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); }
    sortedTracks = [];
    for (const [name, list] of [...groups.entries()].sort((a,b) => cmp(a[0], b[0]))) {
      const artists = [...new Set(list.map(t => normalizeGroupName(t.artist, t.metadataLoaded ? 'アーティスト未設定' : '曲情報未解析')))];
      const sub = artists.length <= 2 ? `${artists.join(' / ')} ・ ${list.length}曲` : `${artists.length}アーティスト ・ ${list.length}曲`;
      trackList.append(makeFolderRow(name, sub, () => { viewPath = [name]; renderLibrary(); }));
    }
    return;
  }
  setBreadcrumb([{ label:'アルバム', onClick:() => { viewPath = []; renderLibrary(); } }, { label:albumName, onClick:() => {} }]);
  sortLabel.classList.remove('hidden');
  renderTrackRows(tracks.filter(t => normalizeGroupName(t.album, t.metadataLoaded ? 'アルバム未設定' : '曲情報未解析') === albumName));
}
function renderLibrary() {
  trackCount.textContent = `${tracks.length}曲`;
  trackList.replaceChildren();
  analyzeMetadataButton.disabled = !tracks.some(t => t.handle && !t.metadataLoaded);
  if (!tracks.length) { setBreadcrumb([]); const empty = document.createElement('div'); empty.className = 'empty-list'; empty.textContent = 'MP3が見つかりません'; trackList.append(empty); sortedTracks = []; return; }
  if (viewMode === 'folder') renderFolderView();
  else if (viewMode === 'artist') renderArtistView();
  else if (viewMode === 'album') renderAlbumView();
  else renderAllView();
}

function defaultSettings() {
  return { gain:1, loopMode:'one', compressor:{ enabled:false, threshold:-35, ratio:2.5, knee:20, attack:0.01, release:0.25, makeup:0 } };
}
function currentLoopMode() { return loopModeInputs.find(x => x.checked)?.value || 'one'; }
function setLoopMode(mode) {
  const valid = ['one','list','off'].includes(mode) ? mode : 'one';
  loopModeInputs.forEach(x => { x.checked = x.value === valid; });
  audio.loop = valid === 'one';
  loopModeLabel.textContent = valid === 'one' ? '🔂 1曲ループ' : valid === 'list' ? '🔁 一覧ループ' : '➡️ ループなし';
}
function getSettings(file = null) {
  const base = defaultSettings(); if (!currentTrack) return base;
  try {
    const newKey = trackKeyFor(currentTrack, file);
    let raw = localStorage.getItem(storageKey(newKey));
    if (!raw) raw = localStorage.getItem(v3StorageKey(newKey));
    if (!raw && file) raw = localStorage.getItem(legacyStorageKey(file));
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const loopMode = parsed.loopMode || (parsed.loop === false ? 'off' : 'one');
    return { ...base, ...parsed, loopMode, compressor:{ ...base.compressor, ...(parsed.compressor || {}) } };
  } catch (_) { return base; }
}
function saveTrackSettings(file = null) {
  if (!currentTrack) return;
  const payload = {
    gain:sliderToGain(gainSlider.value), loopMode:currentLoopMode(),
    compressor:{ enabled:compressorToggle.checked, threshold:Number(threshold.value), ratio:Number(ratio.value), knee:Number(knee.value), attack:Number(attack.value), release:Number(release.value), makeup:Number(makeup.value) }
  };
  localStorage.setItem(storageKey(trackKeyFor(currentTrack, file)), JSON.stringify(payload));
}
function loadTrackSettings(file = null) {
  const s = getSettings(file);
  gainSlider.value = gainToSlider(s.gain); setLoopMode(s.loopMode);
  compressorToggle.checked = Boolean(s.compressor.enabled);
  threshold.value = s.compressor.threshold; ratio.value = s.compressor.ratio; knee.value = s.compressor.knee;
  attack.value = s.compressor.attack; release.value = s.compressor.release; makeup.value = s.compressor.makeup;
  applyAudioSettings();
}

function ensureAudioGraph() {
  if (audioContext) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API非対応です。');
  audioContext = new AudioCtx(); sourceNode = audioContext.createMediaElementSource(audio); gainNode = audioContext.createGain(); compressorNode = audioContext.createDynamicsCompressor(); makeupNode = audioContext.createGain();
  sourceNode.connect(gainNode); rebuildAudioGraph();
}
function rebuildAudioGraph() {
  if (!gainNode) return;
  try { gainNode.disconnect(); } catch (_) {} try { compressorNode.disconnect(); } catch (_) {} try { makeupNode.disconnect(); } catch (_) {}
  if (compressorToggle.checked) gainNode.connect(compressorNode).connect(makeupNode).connect(audioContext.destination); else gainNode.connect(audioContext.destination);
}
async function resumeAudioContext() { ensureAudioGraph(); if (audioContext.state === 'suspended') await audioContext.resume(); }
function applyAudioSettings() {
  const g = sliderToGain(gainSlider.value);
  gainValue.value = `${g.toFixed(2)}×`; gainDb.textContent = `${(20 * Math.log10(g)).toFixed(2)} dB`;
  thresholdValue.value = `${Number(threshold.value).toFixed(0)} dB`; ratioValue.value = `${Number(ratio.value).toFixed(1)} : 1`; kneeValue.value = `${Number(knee.value).toFixed(0)} dB`;
  attackValue.value = `${Math.round(Number(attack.value) * 1000)} ms`; releaseValue.value = `${Math.round(Number(release.value) * 1000)} ms`; makeupValue.value = `${Number(makeup.value).toFixed(1)} dB`;
  compressorControls.classList.toggle('disabled-panel', !compressorToggle.checked);
  if (gainNode) gainNode.gain.value = g;
  if (compressorNode) { compressorNode.threshold.value = Number(threshold.value); compressorNode.ratio.value = Number(ratio.value); compressorNode.knee.value = Number(knee.value); compressorNode.attack.value = Number(attack.value); compressorNode.release.value = Number(release.value); makeupNode.gain.value = dbToGain(makeup.value); rebuildAudioGraph(); }
}

function clearArtwork() { if (artworkUrl) URL.revokeObjectURL(artworkUrl); artworkUrl = null; artwork.hidden = true; artwork.removeAttribute('src'); artworkPlaceholder.hidden = false; }
function showArtwork(blob) { clearArtwork(); if (!blob) return; artworkUrl = URL.createObjectURL(blob); artwork.src = artworkUrl; artwork.hidden = false; artworkPlaceholder.hidden = true; }
function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  const metadata = { title:t.title || t.name, artist:t.artist || 'Local file', album:t.album || '' };
  if (t.artworkBlob) { const u = URL.createObjectURL(t.artworkBlob); metadata.artwork = [{ src:u, sizes:'512x512', type:t.artworkBlob.type || 'image/jpeg' }]; setTimeout(() => URL.revokeObjectURL(u), 30000); }
  navigator.mediaSession.metadata = new MediaMetadata(metadata);
}
async function ensureTrackFile(t) {
  if (t.file) return t.file;
  if (!t.handle) throw new Error('この曲のファイルハンドルがありません。');
  try { return await t.handle.getFile(); }
  catch (err) {
    if (err?.name === 'NotAllowedError') permissionBox.classList.remove('hidden');
    throw err;
  }
}
async function selectTrack(t, autoplay = false) {
  try {
    const file = await ensureTrackFile(t);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    currentTrack = t;
    let tag = { title:'', artist:'', album:'', artworkBlob:t.artworkBlob || null };
    if (!t.artworkScanned) {
      tag = await readId3(file, true);
      t.artworkScanned = true;
    }
    t.size = file.size; t.lastModified = file.lastModified;
    t.title = tag.title || t.title || file.name.replace(/\.mp3$/i, ''); t.artist = tag.artist || t.artist || ''; t.album = tag.album || t.album || ''; t.metadataLoaded = true;
    if (tag.artworkBlob) t.artworkBlob = tag.artworkBlob;
    if (t.handle) scheduleCacheSave();
    objectUrl = URL.createObjectURL(file); audio.src = objectUrl; audio.load();
    trackName.textContent = t.title; trackArtist.textContent = t.artist || 'アーティスト情報なし';
    trackMeta.textContent = [t.album, bytes(file.size), t.path || file.name].filter(Boolean).join(' ・ ');
    showArtwork(t.artworkBlob); playPause.disabled = false; prevTrack.disabled = false; nextTrack.disabled = false;
    loadTrackSettings(file); updateMediaSession(t); renderLibrary();
    if (autoplay) { await resumeAudioContext(); applyAudioSettings(); await audio.play(); }
  } catch (err) { console.error(err); if (err?.name !== 'NotAllowedError') alert('このMP3を開けませんでした。'); }
}
function playbackList() { return sortedTracks.length ? sortedTracks : sortTrackArray(tracks); }
function adjacentTrack(delta, wrap = true) {
  const list = playbackList(); if (!currentTrack || !list.length) return;
  let idx = list.findIndex(t => t.path === currentTrack.path); const source = idx >= 0 ? list : sortTrackArray(tracks);
  idx = source.findIndex(t => t.path === currentTrack.path); if (idx < 0) return;
  let next = idx + delta;
  if (wrap) next = (next + source.length) % source.length;
  if (next < 0 || next >= source.length) return;
  selectTrack(source[next], true);
}

function closeMenus(except = null) {
  if (except !== 'app') { appMenu.classList.add('hidden'); appMenuButton.setAttribute('aria-expanded','false'); }
  if (except !== 'loop') { loopMenu.classList.add('hidden'); loopMenuButton.setAttribute('aria-expanded','false'); }
}
appMenuButton.addEventListener('click', e => { e.stopPropagation(); const open = appMenu.classList.contains('hidden'); closeMenus(open ? 'app' : null); appMenu.classList.toggle('hidden', !open); appMenuButton.setAttribute('aria-expanded', String(open)); });
loopMenuButton.addEventListener('click', e => { e.stopPropagation(); const open = loopMenu.classList.contains('hidden'); closeMenus(open ? 'loop' : null); loopMenu.classList.toggle('hidden', !open); loopMenuButton.setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', e => { if (!appMenu.contains(e.target) && !loopMenu.contains(e.target)) closeMenus(); });

chooseFolder.addEventListener('click', async () => {
  closeMenus(); if (!('showDirectoryPicker' in window)) return;
  try {
    directoryHandle = await window.showDirectoryPicker({ mode:'read', id:'local-mp3-music-folder', startIn:'music' });
    await idbSet(HANDLE_STORE, DIRECTORY_KEY, directoryHandle);
    await refreshLibraryStructure(directoryHandle);
  } catch (err) { if (err.name !== 'AbortError') console.error(err); }
});
refreshFolder.addEventListener('click', async () => { closeMenus(); if (!directoryHandle) return; await refreshLibraryStructure(directoryHandle); });
analyzeMetadataButton.addEventListener('click', () => { closeMenus(); enrichMetadataInBackground(false); });
grantFolderPermission.addEventListener('click', async () => {
  if (!directoryHandle) return;
  try { const state = await directoryHandle.requestPermission({ mode:'read' }); if (state === 'granted') { permissionBox.classList.add('hidden'); refreshFolder.disabled = false; } }
  catch (err) { console.error(err); }
});
fileInput.addEventListener('change', async () => {
  closeMenus(); metadataRunId++;
  const files = Array.from(fileInput.files || []).filter(f => isMp3Name(f.name) || f.type === 'audio/mpeg'); if (!files.length) return;
  directoryHandle = null; permissionBox.classList.add('hidden'); folderStatus.textContent = `一時選択: ${files.length}曲`;
  tracks = files.map(file => ({ handle:null, file, path:file.name, name:file.name, size:file.size, lastModified:file.lastModified, title:file.name.replace(/\.mp3$/i,''), artist:'', album:'', metadataLoaded:false, artworkBlob:null, artworkScanned:false }));
  viewPath = []; renderLibrary(); setMetadataStatus('一時選択した曲は、再生時に曲情報を読み込みます。');
  if (tracks.length === 1) selectTrack(tracks[0], false);
});
sortSelect.addEventListener('change', renderLibrary);
viewTabs.forEach(btn => btn.addEventListener('click', () => { viewMode = btn.dataset.view; viewPath = []; viewTabs.forEach(x => x.classList.toggle('active', x === btn)); renderLibrary(); }));

playPause.addEventListener('click', async () => { if (!audio.src) return; if (audio.paused) { try { await resumeAudioContext(); applyAudioSettings(); await audio.play(); } catch (err) { console.error(err); alert('再生を開始できませんでした。'); } } else audio.pause(); });
prevTrack.addEventListener('click', () => adjacentTrack(-1, true)); nextTrack.addEventListener('click', () => adjacentTrack(1, true));
back10.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
forward10.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); });
seek.addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(seek.value) / 1000 * audio.duration; });
loopModeInputs.forEach(input => input.addEventListener('change', () => { if (!input.checked) return; setLoopMode(input.value); saveTrackSettings(); closeMenus(); }));
[gainSlider, threshold, ratio, knee, attack, release, makeup].forEach(el => el.addEventListener('input', () => { if (!audioContext && audio.src) { try { ensureAudioGraph(); } catch (_) {} } applyAudioSettings(); saveTrackSettings(); }));
compressorToggle.addEventListener('change', () => { if (!audioContext && audio.src) { try { ensureAudioGraph(); } catch (_) {} } applyAudioSettings(); saveTrackSettings(); });

audio.addEventListener('play', () => { playPause.textContent = '❚❚'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { playPause.textContent = '▶'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('loadedmetadata', () => { durationEl.textContent = formatTime(audio.duration); });
audio.addEventListener('timeupdate', () => {
  currentTimeEl.textContent = formatTime(audio.currentTime); durationEl.textContent = formatTime(audio.duration);
  if (Number.isFinite(audio.duration) && audio.duration > 0) seek.value = Math.round(audio.currentTime / audio.duration * 1000);
  if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) { try { navigator.mediaSession.setPositionState({ duration:audio.duration, playbackRate:audio.playbackRate, position:Math.min(audio.currentTime,audio.duration) }); } catch (_) {} }
});
audio.addEventListener('ended', () => {
  const mode = currentLoopMode();
  if (mode === 'list') adjacentTrack(1, true);
  else if (mode === 'off') { playPause.textContent = '▶'; }
});

function setMediaActionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const safeSet = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {} };
  safeSet('play', async () => { await resumeAudioContext(); await audio.play(); }); safeSet('pause', () => audio.pause()); safeSet('previoustrack', () => adjacentTrack(-1, true)); safeSet('nexttrack', () => adjacentTrack(1, true));
  safeSet('seekbackward', d => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); }); safeSet('seekforward', d => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (d.seekOffset || 10)); }); safeSet('seekto', d => { if (Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
}

async function restoreDirectoryAndCache() {
  await loadLibraryCache();
  if (!('showDirectoryPicker' in window)) { chooseFolder.disabled = true; directoryUnsupported.classList.remove('hidden'); return; }
  try { directoryHandle = await idbGet(HANDLE_STORE, DIRECTORY_KEY); } catch (err) { console.warn(err); }
  if (!directoryHandle) return;
  refreshFolder.disabled = false;
  try {
    const state = await directoryHandle.queryPermission({ mode:'read' });
    if (state === 'granted') {
      permissionBox.classList.add('hidden');
      if (!tracks.length) folderStatus.textContent = `登録フォルダ: ${directoryHandle.name} ・ 右上メニューから更新してください`;
      else folderStatus.textContent = `キャッシュ表示: ${directoryHandle.name} ・ ${tracks.length}曲`;
    } else permissionBox.classList.remove('hidden');
  } catch (err) { console.warn(err); permissionBox.classList.remove('hidden'); }
}

window.addEventListener('beforeunload', () => { metadataRunId++; if (objectUrl) URL.revokeObjectURL(objectUrl); clearArtwork(); });
prevTrack.disabled = true; nextTrack.disabled = true; setLoopMode('one'); setMediaActionHandlers(); applyAudioSettings(); renderLibrary(); restoreDirectoryAndCache();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
