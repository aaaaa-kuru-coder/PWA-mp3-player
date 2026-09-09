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
const playerDrawer = $('playerDrawer');
const drawerHandle = $('drawerHandle');
const drawerChevron = $('drawerChevron');
const showAppInfo = $('showAppInfo');
const appInfoModal = $('appInfoModal');
const closeAppInfo = $('closeAppInfo');
const appShell = $('appShell');
const topZone = $('topZone');
const miniPlayer = $('miniPlayer');
const rowSizeSelect = $('rowSizeSelect');
const autoGainMode = $('autoGainMode');
const autoRmsTarget = $('autoRmsTarget');
const autoPeakTarget = $('autoPeakTarget');
const autoCompressorEnabled = $('autoCompressorEnabled');
const autoDynamicRangeTarget = $('autoDynamicRangeTarget');
const analysisStatus = $('analysisStatus');
const visualizationToggle = $('visualizationToggle');
const visualizationPanel = $('visualizationPanel');
const visualizationStatus = $('visualizationStatus');
const histOriginal = $('histOriginal');
const histGain = $('histGain');
const histCompressed = $('histCompressed');
const transferCurve = $('transferCurve');

const GAIN_MIN = 0.1;
const GAIN_MAX = 1.8;
const ACTIVE_WINDOW_FLOOR_DB = -60;
const DB_NAME = 'local-mp3-player-db-v2';
const HANDLE_STORE = 'handles';
const LIBRARY_STORE = 'library';
const DIRECTORY_KEY = 'music-directory';
const LIBRARY_KEY = 'library-cache-v4';
const SETTINGS_PREFIX = 'local-mp3-player:v8:';
const V7_PREFIX = 'local-mp3-player:v7:';
const ANALYSIS_PREFIX = 'local-mp3-player:analysis:v9:';
const AUTO_PREFS_KEY = 'local-mp3-player:auto-prefs:v8';
const V6_PREFIX = 'local-mp3-player:v6:';
const V5_PREFIX = 'local-mp3-player:v5:';
const V4_PREFIX = 'local-mp3-player:v4:';
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
let cachedFolderName = '';
let drawerDrag = null;
let suppressDrawerClick = false;
let analysisRunId = 0;
let analysisTap = null;
let analysisSink = null;
let visualizationRunId = 0;
const visualizationCache = new Map();
let currentVisualization = null;

function setLoading(show, text = '音楽ライブラリを読み込み中…') {
  loadingText.textContent = text;
  loadingOverlay.classList.toggle('hidden', !show);
}
function setMetadataStatus(text = '') {
  metadataStatus.textContent = text;
  metadataStatus.classList.toggle('hidden', !text);
}
function updateLibrarySummary(label = null) {
  const rootName = label || directoryHandle?.name || cachedFolderName || (tracks.length ? '一時選択' : '未登録');
  const segments = [{ label:rootName, path:[] }];

  if (viewMode === 'folder') {
    viewPath.forEach((seg, idx) => segments.push({ label:seg, path:viewPath.slice(0, idx + 1) }));
  } else if (viewMode === 'artist') {
    if (viewPath[0]) segments.push({ label:viewPath[0], path:[viewPath[0]] });
    if (viewPath[1]) segments.push({ label:viewPath[1], path:[viewPath[0], viewPath[1]] });
  } else if (viewMode === 'album') {
    if (viewPath[0]) segments.push({ label:viewPath[0], path:[viewPath[0]] });
  }

  folderStatus.replaceChildren();
  const icon = document.createElement('span'); icon.className = 'location-icon'; icon.textContent = '📁：'; folderStatus.append(icon);
  segments.forEach((seg, idx) => {
    if (idx) { const sep = document.createElement('span'); sep.className = 'location-sep'; sep.textContent = '›'; folderStatus.append(sep); }
    const isCurrent = idx === segments.length - 1;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'location-crumb' + (isCurrent ? ' current' : ''); btn.textContent = seg.label;
    if (!isCurrent) {
      btn.title = `${seg.label}へ戻る`;
      btn.addEventListener('click', () => { viewPath = [...seg.path]; renderLibrary(); });
    } else btn.disabled = true;
    folderStatus.append(btn);
  });
  folderStatus.classList.toggle('can-go-up', segments.length > 1);
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
    cachedFolderName = cached.folderName || '音楽フォルダ';
    updateLibrarySummary(cachedFolderName);
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
    cachedFolderName = handle.name; updateLibrarySummary(handle.name);
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
    folderStatus.textContent = '音楽ライブラリ：読み込み失敗';
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
  const title = document.createElement('div');
  title.className = 'track-row-title';
  title.textContent = t.title || t.name.replace(/\.mp3$/i, '');
  row.append(title);
  row.addEventListener('click', () => selectTrack(t, true, true));
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
function renderAllView() { setBreadcrumb([]); renderTrackRows(tracks); }
function renderFolderView() {
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
  renderTrackRows(artistTracks.filter(t => normalizeGroupName(t.album, t.metadataLoaded ? 'アルバム未設定' : '曲情報未解析') === albumName));
}
function renderAlbumView() {
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
  renderTrackRows(tracks.filter(t => normalizeGroupName(t.album, t.metadataLoaded ? 'アルバム未設定' : '曲情報未解析') === albumName));
}
function renderLibrary() {
  trackCount.textContent = `${tracks.length}曲`;
  updateLibrarySummary();
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
    if (!raw) raw = localStorage.getItem(`${V7_PREFIX}${newKey}`);
    if (!raw) raw = localStorage.getItem(`${V6_PREFIX}${newKey}`);
    if (!raw) raw = localStorage.getItem(`${V5_PREFIX}${newKey}`);
    if (!raw) raw = localStorage.getItem(`${V4_PREFIX}${newKey}`);
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
  analysisTap = audioContext.createAnalyser(); analysisTap.fftSize = 2048; analysisTap.smoothingTimeConstant = 0;
  analysisSink = audioContext.createGain(); analysisSink.gain.value = 0;
  sourceNode.connect(gainNode); sourceNode.connect(analysisTap); analysisTap.connect(analysisSink).connect(audioContext.destination); rebuildAudioGraph();
}
function rebuildAudioGraph() {
  if (!gainNode) return;
  try { gainNode.disconnect(); } catch (_) {} try { compressorNode.disconnect(); } catch (_) {} try { makeupNode.disconnect(); } catch (_) {}
  if (compressorToggle.checked) gainNode.connect(compressorNode).connect(makeupNode).connect(audioContext.destination); else gainNode.connect(audioContext.destination);
}
async function resumeAudioContext() { ensureAudioGraph(); if (audioContext.state === 'suspended') await audioContext.resume(); }
function updateAudioSettingLabels() {
  const g = sliderToGain(gainSlider.value);
  gainValue.value = `${g.toFixed(2)}×`; gainDb.textContent = `${(20 * Math.log10(g)).toFixed(2)} dB`;
  thresholdValue.value = `${Number(threshold.value).toFixed(0)} dB`; ratioValue.value = `${Number(ratio.value).toFixed(1)} : 1`; kneeValue.value = `${Number(knee.value).toFixed(0)} dB`;
  attackValue.value = `${Math.round(Number(attack.value) * 1000)} ms`; releaseValue.value = `${Math.round(Number(release.value) * 1000)} ms`; makeupValue.value = `${Number(makeup.value).toFixed(1)} dB`;
  compressorControls.classList.toggle('disabled-panel', !compressorToggle.checked);
}
function rampParam(param, target, seconds) {
  if (!param || !audioContext) return;
  const now = audioContext.currentTime;
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (seconds > 0) param.linearRampToValueAtTime(target, now + seconds);
    else param.setValueAtTime(target, now);
  } catch (_) { param.value = target; }
}
function applyAudioSettings(rampSeconds = 0) {
  updateAudioSettingLabels();
  const g = sliderToGain(gainSlider.value);
  if (gainNode) rampParam(gainNode.gain, g, rampSeconds);
  if (compressorNode) {
    rebuildAudioGraph();
    rampParam(compressorNode.threshold, Number(threshold.value), rampSeconds);
    rampParam(compressorNode.ratio, Number(ratio.value), rampSeconds);
    rampParam(compressorNode.knee, Number(knee.value), rampSeconds);
    rampParam(compressorNode.attack, Number(attack.value), rampSeconds);
    rampParam(compressorNode.release, Number(release.value), rampSeconds);
    rampParam(makeupNode.gain, dbToGain(makeup.value), rampSeconds);
  }
}


function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, Number(v))); }
function linToDb(v) { return v > 0 ? 20 * Math.log10(v) : -Infinity; }
function percentile(sorted, q) {
  if (!sorted.length) return -Infinity;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function setAnalysisStatus(text = '', kind = '') {
  analysisStatus.textContent = text;
  analysisStatus.className = 'analysis-status' + (text ? '' : ' hidden') + (kind ? ` ${kind}` : '');
}
function getAutoPrefs() {
  const defaults = { gainMode:'off', rmsTarget:-22, peakTarget:-3, compressor:false, dynamicRange:14 };
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(AUTO_PREFS_KEY) || '{}')) }; }
  catch (_) { return defaults; }
}
function readAutoPrefsFromUi() {
  return {
    gainMode:autoGainMode.value,
    rmsTarget:clamp(autoRmsTarget.value, -36, -10),
    peakTarget:clamp(autoPeakTarget.value, -12, -0.5),
    compressor:autoCompressorEnabled.checked,
    dynamicRange:clamp(autoDynamicRangeTarget.value, 6, 30)
  };
}
function syncAutoPrefsUi(prefs = getAutoPrefs()) {
  autoGainMode.value = ['off','rms','peak'].includes(prefs.gainMode) ? prefs.gainMode : 'off';
  autoRmsTarget.value = prefs.rmsTarget;
  autoPeakTarget.value = prefs.peakTarget;
  autoCompressorEnabled.checked = Boolean(prefs.compressor);
  autoDynamicRangeTarget.value = prefs.dynamicRange;
}
function saveAutoPrefs() { localStorage.setItem(AUTO_PREFS_KEY, JSON.stringify(readAutoPrefsFromUi())); }
function analysisCacheKey(t, file) { return `${ANALYSIS_PREFIX}${trackKeyFor(t, file)}`; }
function getCachedAnalysis(t, file) {
  try { const x = JSON.parse(localStorage.getItem(analysisCacheKey(t,file)) || 'null'); return x?.version === 1 ? x : null; }
  catch (_) { return null; }
}
function saveAnalysis(t, file, result) {
  try { localStorage.setItem(analysisCacheKey(t,file), JSON.stringify({ version:1, savedAt:Date.now(), ...result })); } catch (_) {}
}
function statsFromSamples(samples, windowDb) {
  if (!samples) return null;
  // コンプレッサー用の分位点は「有音区間」だけで計算する。
  // ほぼ無音の時間窓を含めるとP30/P50が曲頭・曲間の静寂に引っ張られるため除外する。
  const active = windowDb.filter(Number.isFinite).filter(x => x > ACTIVE_WINDOW_FLOOR_DB).sort((a,b) => a-b);
  return {
    rmsDb:linToDb(Math.sqrt(samples.sumSq / Math.max(1, samples.count))),
    peakDb:linToDb(samples.peak),
    p10:percentile(active, .10), p25:percentile(active, .25), p30:percentile(active, .30),
    p50:percentile(active, .50), p75:percentile(active, .75), p90:percentile(active, .90),
    validWindows:active.length,
    silenceFloorDb:ACTIVE_WINDOW_FLOOR_DB
  };
}
function analyzeDecodedBuffer(buffer) {
  const channels = Array.from({length:buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i));
  const frameBudget = 550000;
  const stride = Math.max(1, Math.ceil(buffer.length / frameBudget));
  const windowFrames = Math.max(1, Math.round(buffer.sampleRate * 0.20));
  const windows = [];
  let winSum = 0, winCount = 0, currentWin = 0;
  let sumSq = 0, count = 0, peak = 0;
  for (let i = 0; i < buffer.length; i += stride) {
    let sq = 0;
    for (const ch of channels) { const v = ch[i] || 0; const a = Math.abs(v); if (a > peak) peak = a; sq += v*v; }
    sq /= channels.length;
    sumSq += sq; count++;
    const w = Math.floor(i / windowFrames);
    if (w !== currentWin && winCount) { windows.push(linToDb(Math.sqrt(winSum / winCount))); winSum = 0; winCount = 0; currentWin = w; }
    winSum += sq; winCount++;
  }
  if (winCount) windows.push(linToDb(Math.sqrt(winSum / winCount)));
  return statsFromSamples({sumSq,count,peak}, windows);
}
async function analyzeFullFile(file, runId) {
  ensureAudioGraph();
  setAnalysisStatus('音量を解析中…（全体解析）');
  const bytes = await file.arrayBuffer();
  if (runId !== analysisRunId) throw new DOMException('aborted','AbortError');
  const decoded = await audioContext.decodeAudioData(bytes);
  if (runId !== analysisRunId) throw new DOMException('aborted','AbortError');
  await yieldToUi();
  return { ...analyzeDecodedBuffer(decoded), method:'full', duration:decoded.duration };
}
async function waitForPlaying(timeoutMs = 4000) {
  if (!audio.paused && !audio.ended) return true;
  return await new Promise(resolve => {
    const done = v => { clearTimeout(timer); audio.removeEventListener('play', onPlay); resolve(v); };
    const onPlay = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    audio.addEventListener('play', onPlay, { once:true });
  });
}
async function analyzeLiveSample(runId, seconds = 9) {
  ensureAudioGraph();
  const playing = await waitForPlaying();
  if (!playing) return null;
  setAnalysisStatus(`音量を解析中…（長尺向け ${seconds}秒サンプル）`);
  const data = new Float32Array(analysisTap.fftSize);
  const windows = []; let totalSum = 0, totalCount = 0, peak = 0;
  const start = performance.now();
  while ((performance.now() - start) < seconds * 1000 && runId === analysisRunId && currentTrack) {
    analysisTap.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i=0;i<data.length;i+=2) { const v=data[i]; sum += v*v; totalSum += v*v; totalCount++; peak=Math.max(peak,Math.abs(v)); }
    const rms = Math.sqrt(sum / Math.ceil(data.length/2));
    windows.push(linToDb(rms));
    await new Promise(r => setTimeout(r, 180));
  }
  if (runId !== analysisRunId) throw new DOMException('aborted','AbortError');
  const stats = statsFromSamples({sumSq:totalSum,count:totalCount,peak}, windows);
  return stats ? { ...stats, method:'live', duration:seconds } : null;
}
async function analyzeFileAdaptive(t, file, runId) {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const fullSafe = file.size <= 24 * 1024 * 1024 && (!duration || duration <= 12 * 60);
  if (fullSafe) {
    try { return await analyzeFullFile(file, runId); }
    catch (err) { if (err?.name === 'AbortError') throw err; console.warn('全体解析からサンプル解析へ切替:', err); }
  }
  return await analyzeLiveSample(runId, 9);
}
function suggestAutoParams(stats, prefs) {
  let gain = sliderToGain(gainSlider.value);
  if (prefs.gainMode === 'rms' && Number.isFinite(stats.rmsDb)) gain = dbToGain(prefs.rmsTarget - stats.rmsDb);
  else if (prefs.gainMode === 'peak' && Number.isFinite(stats.peakDb)) gain = dbToGain(prefs.peakTarget - stats.peakDb);
  gain = clamp(gain, GAIN_MIN, GAIN_MAX);
  const gainDbAdj = linToDb(gain);

  const c = {
    enabled:compressorToggle.checked, threshold:Number(threshold.value), ratio:Number(ratio.value), knee:Number(knee.value),
    attack:Number(attack.value), release:Number(release.value), makeup:Number(makeup.value)
  };

  if (prefs.compressor && Number.isFinite(stats.p30) && Number.isFinite(stats.p50) && Number.isFinite(stats.p90)) {
    // Gain段の後にコンプレッサーがあるため、分位点も同じGain dBだけ平行移動させる。
    const p30 = stats.p30 + gainDbAdj;
    const p50 = stats.p50 + gainDbAdj;
    const p90 = stats.p90 + gainDbAdj;
    const sourceSpan = Math.max(0, p90 - p30);
    const targetSpan = Math.max(1, Number(prefs.dynamicRange) || 14);

    c.enabled = true;
    c.threshold = clamp(p30, -100, 0);

    // Hard-knee近似:
    // y = T + (x-T)/R (x>T)
    // よって P30→P90 の最終幅を targetSpan にするには R=(P90-P30)/targetSpan。
    // 既に目標幅以下なら圧縮しない(R=1)。
    const requiredRatio = sourceSpan > targetSpan ? sourceSpan / targetSpan : 1;
    c.ratio = clamp(requiredRatio, 1, 20);

    // P30を圧縮開始点として数式通りに扱いやすくするためkneeは0（Hard knee）。
    c.knee = 0;

    // 時間方向の追従は固定の穏当な初期値。静的なP30/P50/P90条件とは独立。
    c.attack = .010;
    c.release = .200;

    // P50を圧縮前と同じdBへ戻すMakeup Gain。
    const compressedP50 = p50 <= c.threshold
      ? p50
      : c.threshold + (p50 - c.threshold) / c.ratio;
    c.makeup = clamp(p50 - compressedP50, 0, 20);

    // 表示用の推定値（ratio上限20に当たると目標幅へ完全には届かないことがある）。
    c._sourceSpan = sourceSpan;
    c._targetSpan = targetSpan;
    c._estimatedSpan = c.ratio > 0 ? sourceSpan / c.ratio : sourceSpan;
    c._p30 = p30; c._p50 = p50; c._p90 = p90;
  }
  return { gain, compressor:c };
}
function animateUiControls(target, ms = 1500) {
  const start = performance.now();
  const from = {
    gain:Number(gainSlider.value), threshold:Number(threshold.value), ratio:Number(ratio.value), knee:Number(knee.value), attack:Number(attack.value), release:Number(release.value), makeup:Number(makeup.value)
  };
  const to = {
    gain:gainToSlider(target.gain), threshold:target.compressor.threshold, ratio:target.compressor.ratio, knee:target.compressor.knee,
    attack:target.compressor.attack, release:target.compressor.release, makeup:target.compressor.makeup
  };
  compressorToggle.checked = Boolean(target.compressor.enabled);
  if (audioContext) rebuildAudioGraph();
  // 音自体は先に同じ時間軸でランプ予約し、UIは視覚的に追従させる。
  gainSlider.value = to.gain; threshold.value = to.threshold; ratio.value = to.ratio; knee.value = to.knee; attack.value = to.attack; release.value = to.release; makeup.value = to.makeup;
  applyAudioSettings(ms / 1000);
  gainSlider.value = from.gain; threshold.value = from.threshold; ratio.value = from.ratio; knee.value = from.knee; attack.value = from.attack; release.value = from.release; makeup.value = from.makeup;
  updateAudioSettingLabels();
  return new Promise(resolve => {
    const tick = now => {
      const t = Math.min(1, (now - start) / ms); const e = 1 - Math.pow(1 - t, 3);
      gainSlider.value = from.gain + (to.gain - from.gain) * e;
      threshold.value = from.threshold + (to.threshold - from.threshold) * e;
      ratio.value = from.ratio + (to.ratio - from.ratio) * e;
      knee.value = from.knee + (to.knee - from.knee) * e;
      attack.value = from.attack + (to.attack - from.attack) * e;
      release.value = from.release + (to.release - from.release) * e;
      makeup.value = from.makeup + (to.makeup - from.makeup) * e;
      updateAudioSettingLabels();
      if (t < 1) requestAnimationFrame(tick); else { applyAudioSettings(0); if (visualizationToggle.checked) requestAnimationFrame(redrawVisualizations); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}
async function startAutoAnalysis(t, file) {
  const prefs = getAutoPrefs();
  if (prefs.gainMode === 'off' && !prefs.compressor) { setAnalysisStatus(''); return; }
  const runId = ++analysisRunId;
  let stats = getCachedAnalysis(t, file);
  try {
    if (!stats) {
      stats = await analyzeFileAdaptive(t, file, runId);
      if (!stats || runId !== analysisRunId || currentTrack !== t) return;
      saveAnalysis(t, file, stats);
    } else setAnalysisStatus('保存済み解析結果を読み込み中…');
    if (runId !== analysisRunId || currentTrack !== t) return;
    const target = suggestAutoParams(stats, prefs);
    const modeText = stats.method === 'live' ? '短時間サンプル' : '全体';
    setAnalysisStatus(`解析完了（${modeText}）→ 推奨値を反映中…`);
    await animateUiControls(target, 1500);
    if (runId !== analysisRunId || currentTrack !== t) return;
    saveTrackSettings(file);
    const details = [`RMS ${Number.isFinite(stats.rmsDb)?stats.rmsDb.toFixed(1):'—'} dB`, `Peak ${Number.isFinite(stats.peakDb)?stats.peakDb.toFixed(1):'—'} dB`];
    if (prefs.compressor && Number.isFinite(stats.p30) && Number.isFinite(stats.p90)) {
      const src = stats.p90 - stats.p30;
      const est = target.compressor?._estimatedSpan;
      details.push(`有音P30–P90 ${src.toFixed(1)}→${Number.isFinite(est)?est.toFixed(1):'—'} dB`);
      details.push(`P50維持 Makeup +${Number(target.compressor.makeup).toFixed(1)} dB`);
    }
    setAnalysisStatus(`自動補正済み：${details.join(' / ')}`, 'success');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('自動音響解析失敗:', err);
    setAnalysisStatus('自動解析を完了できませんでした。手動設定はそのまま使えます。', 'warn');
  }
}


function setVisualizationStatus(text = '', kind = '') {
  visualizationStatus.textContent = text;
  visualizationStatus.className = 'visualization-status' + (kind ? ` ${kind}` : '');
}
function currentCompressorConfig() {
  return {
    enabled:compressorToggle.checked,
    threshold:Number(threshold.value), ratio:Number(ratio.value), knee:Number(knee.value),
    attack:Number(attack.value), release:Number(release.value), makeup:Number(makeup.value)
  };
}
function compressorStaticDb(x, c = currentCompressorConfig()) {
  if (!c.enabled) return x;
  const T = Number(c.threshold), R = Math.max(1, Number(c.ratio) || 1), K = Math.max(0, Number(c.knee) || 0);
  let y;
  if (K <= 0.0001) y = x <= T ? x : T + (x - T) / R;
  else {
    const lo = T - K / 2, hi = T + K / 2;
    if (x <= lo) y = x;
    else if (x >= hi) y = T + (x - T) / R;
    else {
      // Standard soft-knee quadratic interpolation used for static compressor curves.
      const d = x - T + K / 2;
      y = x + (1 / R - 1) * d * d / (2 * K);
    }
  }
  return y + Number(c.makeup || 0);
}
function decodedActiveWindows(buffer) {
  const channels = Array.from({length:buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i));
  const windowFrames = Math.max(1, Math.round(buffer.sampleRate * 0.20));
  const maxWindows = 6000;
  const totalWindows = Math.ceil(buffer.length / windowFrames);
  const windowStride = Math.max(1, Math.ceil(totalWindows / maxWindows));
  const out = [];
  for (let w = 0; w < totalWindows; w += windowStride) {
    const start = w * windowFrames, end = Math.min(buffer.length, start + windowFrames);
    const sampleStride = Math.max(1, Math.ceil((end - start) / 2200));
    let sum = 0, count = 0;
    for (let i = start; i < end; i += sampleStride) {
      let sq = 0;
      for (const ch of channels) { const v = ch[i] || 0; sq += v * v; }
      sum += sq / channels.length; count++;
    }
    if (count) { const db = linToDb(Math.sqrt(sum / count)); if (Number.isFinite(db) && db > ACTIVE_WINDOW_FLOOR_DB) out.push(db); }
  }
  return out;
}
async function analyzeVisualizationFull(file, runId) {
  ensureAudioGraph();
  setVisualizationStatus('グラフ用の音量分布を解析中…（全体）');
  const bytes = await file.arrayBuffer();
  if (runId !== visualizationRunId) throw new DOMException('aborted','AbortError');
  const decoded = await audioContext.decodeAudioData(bytes);
  if (runId !== visualizationRunId) throw new DOMException('aborted','AbortError');
  await yieldToUi();
  return { windows:decodedActiveWindows(decoded), method:'full', duration:decoded.duration };
}
async function analyzeVisualizationLive(runId, seconds = 12) {
  ensureAudioGraph();
  const playing = await waitForPlaying(1800);
  if (!playing) throw new Error('長尺ファイルは再生中の短時間サンプルで可視化します。再生してからもう一度表示してください。');
  setVisualizationStatus(`グラフ用の音量分布を解析中…（${seconds}秒サンプル）`);
  const data = new Float32Array(analysisTap.fftSize); const windows = [];
  const start = performance.now();
  while ((performance.now() - start) < seconds * 1000 && runId === visualizationRunId && currentTrack) {
    analysisTap.getFloatTimeDomainData(data);
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i += 2) { const v=data[i]; sum += v*v; count++; }
    if (count) { const db = linToDb(Math.sqrt(sum/count)); if (Number.isFinite(db) && db > ACTIVE_WINDOW_FLOOR_DB) windows.push(db); }
    await new Promise(r => setTimeout(r, 180));
  }
  if (runId !== visualizationRunId) throw new DOMException('aborted','AbortError');
  return { windows, method:'live', duration:seconds };
}
function visualizationKey(t, file) { return trackKeyFor(t, file); }
async function ensureVisualizationData(t = currentTrack, file = null) {
  if (!visualizationToggle.checked || !t) return;
  const runId = ++visualizationRunId;
  try {
    file = file || await ensureTrackFile(t);
    const key = visualizationKey(t, file);
    let data = visualizationCache.get(key);
    if (!data) {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const fullSafe = file.size <= 24 * 1024 * 1024 && (!duration || duration <= 12 * 60);
      data = fullSafe ? await analyzeVisualizationFull(file, runId) : await analyzeVisualizationLive(runId, 12);
      if (runId !== visualizationRunId || currentTrack !== t) return;
      visualizationCache.set(key, data);
    }
    currentVisualization = { key, ...data };
    const mode = data.method === 'live' ? '短時間サンプル' : '全体';
    setVisualizationStatus(`表示中：${mode} / 有音窓 ${data.windows.length}個`, 'success');
    requestAnimationFrame(redrawVisualizations);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('可視化解析失敗:', err);
    setVisualizationStatus(err?.message || '可視化用の解析を完了できませんでした。', 'warn');
  }
}
function canvasSetup(canvas) {
  const cssW = Math.max(260, canvas.clientWidth || 320), cssH = Math.max(150, canvas.clientHeight || 180);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(cssW*dpr), h = Math.round(cssH*dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w:cssW,h:cssH};
}
function niceDbBounds(arrays) {
  const vals = arrays.flat().filter(Number.isFinite);
  if (!vals.length) return {min:-60,max:0};
  let min = Math.floor(Math.min(...vals)/5)*5, max = Math.ceil(Math.max(...vals)/5)*5;
  min = Math.min(min, -20); max = Math.max(max, 0); if (max-min < 20) min=max-20;
  return {min:Math.max(-80,min), max:Math.min(20,max)};
}
function histogram(values, min, max, bins=28) {
  const counts = Array(bins).fill(0), span = Math.max(1e-6,max-min);
  for (const v of values) { if (!Number.isFinite(v)) continue; const i=Math.max(0,Math.min(bins-1,Math.floor((v-min)/span*bins))); counts[i]++; }
  const total = Math.max(1, values.length); return counts.map(c => c/total*100);
}
function drawHistogram(canvas, values, bounds, accent='#fb923c') {
  const {ctx,w,h}=canvasSetup(canvas); const pad={l:38,r:10,t:12,b:28}; const pw=w-pad.l-pad.r, ph=h-pad.t-pad.b;
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#160906'; ctx.fillRect(0,0,w,h);
  const hist=histogram(values,bounds.min,bounds.max,28); const ymax=Math.max(5,Math.ceil(Math.max(...hist,1)/5)*5);
  ctx.strokeStyle='rgba(251,146,60,.16)'; ctx.fillStyle='#b98770'; ctx.font='10px system-ui'; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){ const y=pad.t+ph*i/4; ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke(); const val=(ymax*(1-i/4)).toFixed(0)+'%';ctx.fillText(val,2,y+3); }
  for(let i=0;i<=4;i++){ const x=pad.l+pw*i/4; const db=bounds.min+(bounds.max-bounds.min)*i/4; ctx.fillText(`${Math.round(db)}`,x-10,h-8); }
  const bw=pw/hist.length;
  ctx.fillStyle=accent;
  hist.forEach((v,i)=>{ const bh=ph*v/ymax; ctx.fillRect(pad.l+i*bw+1,pad.t+ph-bh,Math.max(1,bw-2),bh); });
  ctx.fillStyle='#d9a58d'; ctx.fillText('dBFS',w-34,h-8);
}
function drawTransfer(canvas, cfg, bounds) {
  const {ctx,w,h}=canvasSetup(canvas); const pad={l:42,r:12,t:14,b:32}; const pw=w-pad.l-pad.r, ph=h-pad.t-pad.b;
  const min=bounds.min, max=bounds.max; const xTo=v=>pad.l+(v-min)/(max-min)*pw, yTo=v=>pad.t+ph-(v-min)/(max-min)*ph;
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#160906'; ctx.fillRect(0,0,w,h); ctx.font='10px system-ui'; ctx.fillStyle='#b98770'; ctx.strokeStyle='rgba(251,146,60,.16)';
  for(let i=0;i<=4;i++){ const v=min+(max-min)*i/4; const x=xTo(v), y=yTo(v); ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+ph);ctx.stroke();ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+pw,y);ctx.stroke(); ctx.fillText(`${Math.round(v)}`,x-9,h-10); ctx.fillText(`${Math.round(v)}`,3,y+3); }
  ctx.save(); ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(255,237,213,.35)'; ctx.beginPath();ctx.moveTo(xTo(min),yTo(min));ctx.lineTo(xTo(max),yTo(max));ctx.stroke();ctx.restore();
  ctx.strokeStyle='#fb923c'; ctx.lineWidth=2.2; ctx.beginPath();
  const n=160; for(let i=0;i<=n;i++){ const x=min+(max-min)*i/n, y=compressorStaticDb(x,cfg); const px=xTo(x),py=yTo(y); if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py); } ctx.stroke();
  if(cfg.enabled){ const tx=xTo(cfg.threshold); ctx.strokeStyle='rgba(253,186,116,.8)';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(tx,pad.t);ctx.lineTo(tx,pad.t+ph);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fdba74';ctx.fillText('T',tx+3,pad.t+11); }
  ctx.fillStyle='#d9a58d';ctx.fillText('入力 dB',w-48,h-10);ctx.save();ctx.translate(10,pad.t+48);ctx.rotate(-Math.PI/2);ctx.fillText('出力 dB',0,0);ctx.restore();
}
function redrawVisualizations() {
  if (!visualizationToggle.checked || visualizationPanel.classList.contains('hidden') || !currentVisualization?.windows?.length) return;
  const original=currentVisualization.windows;
  const g=sliderToGain(gainSlider.value), gainDbAdj=linToDb(g);
  const afterGain=original.map(x=>x+gainDbAdj);
  const cfg=currentCompressorConfig();
  const afterComp=afterGain.map(x=>compressorStaticDb(x,cfg));
  const bounds=niceDbBounds([original,afterGain,afterComp]);
  drawHistogram(histOriginal,original,bounds,'#fdba74');
  drawHistogram(histGain,afterGain,bounds,'#fb923c');
  drawHistogram(histCompressed,afterComp,bounds,'#f97316');
  drawTransfer(transferCurve,cfg,bounds);
}
function clearArtwork() { if (artworkUrl) URL.revokeObjectURL(artworkUrl); artworkUrl = null; artwork.hidden = true; artwork.removeAttribute('src'); artworkPlaceholder.hidden = false; }
function showArtwork(blob) { clearArtwork(); if (!blob) return; artworkUrl = URL.createObjectURL(blob); artwork.src = artworkUrl; artwork.hidden = false; artworkPlaceholder.hidden = true; }
function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  const metadata = { title:t.title || t.name, artist:t.artist || 'Local file', album:t.album || '' };
  if (t.artworkBlob) { const u = URL.createObjectURL(t.artworkBlob); metadata.artwork = [{ src:u, sizes:'512x512', type:t.artworkBlob.type || 'image/jpeg' }]; setTimeout(() => URL.revokeObjectURL(u), 30000); }
  navigator.mediaSession.metadata = new MediaMetadata(metadata);
}
async function permissionStateForTrack(t) {
  if (t.file) return 'granted';
  const target = directoryHandle || t.handle;
  if (!target?.queryPermission) return 'prompt';
  try { return await target.queryPermission({ mode:'read' }); }
  catch (_) { return 'prompt'; }
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
async function selectTrack(t, autoplay = false, userInitiated = false) {
  analysisRunId++; setAnalysisStatus('');
  try {
    if (t.handle) {
      const target = directoryHandle || t.handle;
      let permission = 'prompt';
      if (userInitiated && target?.requestPermission) {
        // 曲タップのユーザー操作から直接ブラウザ標準の権限確認へつなぐ。
        // 既に許可済みなら通常はそのまま 'granted' が返り、追加の自前ダイアログは出さない。
        try { permission = await target.requestPermission({ mode:'read' }); } catch (err) { console.warn(err); }
      } else {
        permission = await permissionStateForTrack(t);
      }
      if (permission !== 'granted') {
        permissionBox.classList.remove('hidden');
        return;
      }
      permissionBox.classList.add('hidden');
    }
    const file = await ensureTrackFile(t);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    currentTrack = t;
    currentVisualization = null;
    if (visualizationToggle.checked) setVisualizationStatus('曲を読み込みました。可視化データを準備します…');
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
    // 再生開始を待たせず、自動解析は並行して走らせる。結果は既存スライダーへ滑らかに反映。
    setTimeout(() => { if (currentTrack === t) startAutoAnalysis(t, file); }, 0);
    if (visualizationToggle.checked) setTimeout(() => { if (currentTrack === t) ensureVisualizationData(t, file); }, 120);
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
  selectTrack(source[next], true, false);
}

function closeMenus(except = null) {
  if (except !== 'app') { appMenu.classList.add('hidden'); appMenuButton.setAttribute('aria-expanded','false'); }
  if (except !== 'loop') { loopMenu.classList.add('hidden'); loopMenuButton.setAttribute('aria-expanded','false'); }
}
function drawerHeights() {
  const top = topZone?.getBoundingClientRect().height || Math.max(104, window.innerHeight * 0.12);
  const collapsed = Math.max(62, Math.min(78, window.innerHeight * 0.08));
  const expanded = Math.max(collapsed, window.innerHeight - top);
  return { collapsed, expanded };
}
function applyDrawerHeight(height, animate = true) {
  const h = drawerHeights();
  const clamped = Math.min(h.expanded, Math.max(h.collapsed, Number(height) || h.collapsed));
  appShell.classList.toggle('drawer-dragging', !animate);
  appShell.style.setProperty('--player-h', `${Math.round(clamped)}px`);
}
function setDrawerExpanded(expanded, animate = true) {
  const h = drawerHeights();
  playerDrawer.classList.toggle('expanded', expanded);
  playerDrawer.classList.toggle('collapsed', !expanded);
  applyDrawerHeight(expanded ? h.expanded : h.collapsed, animate);
  drawerHandle.setAttribute('aria-expanded', String(expanded));
  drawerHandle.setAttribute('aria-label', expanded ? '再生パネルを閉じる' : '再生パネルを開く');
  drawerChevron.textContent = expanded ? '⌄' : '⌃';
  miniPlayer.setAttribute('aria-label', expanded ? '再生パネルを閉じる' : '再生パネルを開く');
}
function toggleDrawer() { setDrawerExpanded(!playerDrawer.classList.contains('expanded')); }
appMenuButton.addEventListener('click', e => { e.stopPropagation(); const open = appMenu.classList.contains('hidden'); closeMenus(open ? 'app' : null); appMenu.classList.toggle('hidden', !open); appMenuButton.setAttribute('aria-expanded', String(open)); });
loopMenuButton.addEventListener('click', e => { e.stopPropagation(); const open = loopMenu.classList.contains('hidden'); closeMenus(open ? 'loop' : null); loopMenu.classList.toggle('hidden', !open); loopMenuButton.setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', e => { if (!appMenu.contains(e.target) && !loopMenu.contains(e.target)) closeMenus(); });

function canStartDrawerGesture(target) {
  return !target.closest('button,input,select,label,a') || target === drawerHandle || drawerHandle.contains(target);
}
function startDrawerDrag(e) {
  if (!canStartDrawerGesture(e.target)) return;
  const h = drawerHeights();
  const current = playerDrawer.getBoundingClientRect().height;
  drawerDrag = { id:e.pointerId, startY:e.clientY, startHeight:current, moved:false, min:h.collapsed, max:h.expanded, host:e.currentTarget };
  e.currentTarget.setPointerCapture?.(e.pointerId);
  appShell.classList.add('drawer-dragging');
}
function moveDrawerDrag(e) {
  if (!drawerDrag || drawerDrag.id !== e.pointerId) return;
  const delta = drawerDrag.startY - e.clientY;
  if (Math.abs(delta) > 4) drawerDrag.moved = true;
  const next = Math.min(drawerDrag.max, Math.max(drawerDrag.min, drawerDrag.startHeight + delta));
  applyDrawerHeight(next, false);
  if (drawerDrag.moved) e.preventDefault();
}
function finishDrawerDrag(e) {
  if (!drawerDrag || drawerDrag.id !== e.pointerId) return;
  const drag = drawerDrag; drawerDrag = null;
  suppressDrawerClick = Boolean(drag.moved);
  appShell.classList.remove('drawer-dragging');
  const current = playerDrawer.getBoundingClientRect().height;
  const threshold = drag.min + (drag.max - drag.min) * 0.34;
  setDrawerExpanded(current >= threshold, true);
}
[drawerHandle, miniPlayer].forEach(el => {
  el.addEventListener('pointerdown', startDrawerDrag);
  el.addEventListener('pointermove', moveDrawerDrag);
  el.addEventListener('pointerup', finishDrawerDrag);
  el.addEventListener('pointercancel', finishDrawerDrag);
});
drawerHandle.addEventListener('click', () => { if (suppressDrawerClick) { suppressDrawerClick = false; return; } toggleDrawer(); });
miniPlayer.addEventListener('click', e => {
  if (e.target.closest('#playPause')) return;
  if (suppressDrawerClick) { suppressDrawerClick = false; return; }
  toggleDrawer();
});
miniPlayer.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); toggleDrawer(); } });
window.addEventListener('resize', () => setDrawerExpanded(playerDrawer.classList.contains('expanded'), false));

showAppInfo.addEventListener('click', () => { closeMenus(); appInfoModal.classList.remove('hidden'); });
closeAppInfo.addEventListener('click', () => appInfoModal.classList.add('hidden'));
appInfoModal.addEventListener('click', e => { if (e.target === appInfoModal) appInfoModal.classList.add('hidden'); });
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
  try {
    const state = await directoryHandle.requestPermission({ mode:'read' });
    if (state === 'granted') {
      permissionBox.classList.add('hidden');
      refreshFolder.disabled = false;
    }
  } catch (err) { console.error(err); }
});
fileInput.addEventListener('change', async () => {
  closeMenus(); metadataRunId++;
  const files = Array.from(fileInput.files || []).filter(f => isMp3Name(f.name) || f.type === 'audio/mpeg'); if (!files.length) return;
  directoryHandle = null; cachedFolderName = '一時選択'; permissionBox.classList.add('hidden');
  tracks = files.map(file => ({ handle:null, file, path:file.name, name:file.name, size:file.size, lastModified:file.lastModified, title:file.name.replace(/\.mp3$/i,''), artist:'', album:'', metadataLoaded:false, artworkBlob:null, artworkScanned:false }));
  viewPath = []; updateLibrarySummary('一時選択'); renderLibrary(); setMetadataStatus('一時選択した曲は、再生時に曲情報を読み込みます。');
  if (tracks.length === 1) selectTrack(tracks[0], false);
});
const ROW_SIZE_KEY = 'local-mp3-player:ui:row-size';
function applyRowSize(value) {
  const valid = ['compact','normal','large'].includes(value) ? value : 'normal';
  document.body.dataset.rowSize = valid;
  rowSizeSelect.value = valid;
  localStorage.setItem(ROW_SIZE_KEY, valid);
}
applyRowSize(localStorage.getItem(ROW_SIZE_KEY) || 'normal');
rowSizeSelect.addEventListener('change', () => applyRowSize(rowSizeSelect.value));
syncAutoPrefsUi();
[autoGainMode, autoRmsTarget, autoPeakTarget, autoCompressorEnabled, autoDynamicRangeTarget].forEach(el => el.addEventListener('change', () => {
  saveAutoPrefs();
  if (currentTrack && (currentTrack.file || currentTrack.handle)) {
    ensureTrackFile(currentTrack).then(file => startAutoAnalysis(currentTrack, file)).catch(console.warn);
  }
}));

sortSelect.addEventListener('change', renderLibrary);
viewTabs.forEach(btn => btn.addEventListener('click', () => { viewMode = btn.dataset.view; viewPath = []; viewTabs.forEach(x => x.classList.toggle('active', x === btn)); renderLibrary(); }));

visualizationToggle.addEventListener('change', async () => {
  visualizationPanel.classList.toggle('hidden', !visualizationToggle.checked);
  if (!visualizationToggle.checked) { visualizationRunId++; currentVisualization = null; setVisualizationStatus(''); return; }
  if (!currentTrack) { setVisualizationStatus('曲を選択すると音量分布を表示します。'); requestAnimationFrame(redrawVisualizations); return; }
  await ensureVisualizationData(currentTrack).catch(console.warn);
});
window.addEventListener('resize', () => { if (visualizationToggle.checked) requestAnimationFrame(redrawVisualizations); });

playPause.addEventListener('click', async () => { if (!audio.src) return; if (audio.paused) { try { await resumeAudioContext(); applyAudioSettings(); await audio.play(); } catch (err) { console.error(err); alert('再生を開始できませんでした。'); } } else audio.pause(); });
prevTrack.addEventListener('click', () => adjacentTrack(-1, true)); nextTrack.addEventListener('click', () => adjacentTrack(1, true));
back10.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
forward10.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); });
seek.addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(seek.value) / 1000 * audio.duration; });
loopModeInputs.forEach(input => input.addEventListener('change', () => { if (!input.checked) return; setLoopMode(input.value); saveTrackSettings(); closeMenus(); }));
[gainSlider, threshold, ratio, knee, attack, release, makeup].forEach(el => el.addEventListener('input', () => { if (!audioContext && audio.src) { try { ensureAudioGraph(); } catch (_) {} } applyAudioSettings(); saveTrackSettings(); if (visualizationToggle.checked) requestAnimationFrame(redrawVisualizations); }));
compressorToggle.addEventListener('change', () => { if (!audioContext && audio.src) { try { ensureAudioGraph(); } catch (_) {} } applyAudioSettings(); saveTrackSettings(); if (visualizationToggle.checked) requestAnimationFrame(redrawVisualizations); });

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
      cachedFolderName = directoryHandle.name; updateLibrarySummary(directoryHandle.name);
    } else permissionBox.classList.remove('hidden');
  } catch (err) { console.warn(err); permissionBox.classList.remove('hidden'); }
}

window.addEventListener('beforeunload', () => { metadataRunId++; analysisRunId++; visualizationRunId++; if (objectUrl) URL.revokeObjectURL(objectUrl); clearArtwork(); });
prevTrack.disabled = true; nextTrack.disabled = true; setLoopMode('one'); setDrawerExpanded(false); setMediaActionHandlers(); applyAudioSettings(); renderLibrary(); restoreDirectoryAndCache();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
