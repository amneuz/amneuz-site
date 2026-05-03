const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJseWRyaGdxcXFheGZhb2t2eHFocyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc3MDk1Mjc3LCJleHAiOjIwOTI2NzEyNzd9.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const greetingTitle = document.getElementById('greetingTitle');
const statusEl = document.getElementById('status');
const substatusEl = document.getElementById('substatus');
const logoutBtn = document.getElementById('logoutBtn');

const trackModal = document.getElementById('trackModal');
const trackModalTitle = document.getElementById('trackModalTitle');
const trackModalBody = document.getElementById('trackModalBody');
const closeTrackModal = document.getElementById('closeTrackModal');
const saveTrackModalFooter = document.getElementById('saveTrackModalFooter');
const trackSaveStatus = document.getElementById('trackSaveStatus');

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_KEY = 'amneuz_admin_last_activity';
const ADMIN_CATALOG_TAB_KEY = 'amneuz_admin_catalog_tab';

let timeoutId = null;
let currentSession = null;
let activeTrackForSave = null;
let activeAlbumForSave = null;
let previewBuilderState = null;

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function setLastActivity() {
  window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

function getLastActivity() {
  const value = Number(window.localStorage.getItem(ACTIVITY_KEY) || '0');
  return Number.isFinite(value) ? value : 0;
}

function money(value) {
  return '$' + Number(value || 0).toFixed(0) + ' MXN';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabel(status) {
  const value = String(status || 'unknown').toLowerCase();

  if (value === 'visible') return 'Visible';
  if (value === 'hidden') return 'Hidden';
  if (value === 'upcoming') return 'Upcoming';

  return value;
}

function releaseTypeLabel(value) {
  const type = String(value || 'album').toLowerCase();

  if (type === 'ep') return 'EP';
  return 'Album';
}

async function sendAudit(action) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (currentSession && currentSession.access_token) {
      headers.Authorization = `Bearer ${currentSession.access_token}`;
    }

    await fetch('/api/admin-login-audit', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        email: currentSession && currentSession.user ? currentSession.user.email : ''
      })
    });
  } catch (err) {}
}

async function logout(action) {
  if (action) {
    await sendAudit(action);
  }

  try {
    await supabaseClient.auth.signOut();
  } catch (err) {}

  window.localStorage.removeItem(ACTIVITY_KEY);
  window.location.replace('/admin/');
}

function scheduleSessionCheck() {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  timeoutId = window.setTimeout(async function() {
    const lastActivity = getLastActivity();
    const inactiveFor = Date.now() - lastActivity;

    if (!lastActivity || inactiveFor >= SESSION_TIMEOUT_MS) {
      await logout('admin.logout.timeout');
      return;
    }

    scheduleSessionCheck();
  }, 30 * 1000);
}

function registerActivityListeners() {
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function(eventName) {
    window.addEventListener(eventName, function() {
      setLastActivity();
    }, { passive: true });
  });
}

function ensureAdminStyles() {
  if (document.getElementById('adminDynamicStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'adminDynamicStyles';
  style.textContent = `
    .admin-catalog-tabs {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 28px;
      padding: 6px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      background: rgba(0,0,0,.18);
      width: fit-content;
      max-width: 100%;
    }

    .admin-catalog-tab {
      border: 1px solid transparent;
      border-radius: 999px;
      background: transparent;
      color: rgba(255,255,255,.58);
      padding: 10px 15px 8px;
      font-size: .7rem;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .admin-catalog-tab:hover {
      color: #fff;
      background: rgba(255,255,255,.06);
    }

    .admin-catalog-tab.active {
      color: #fff;
      border-color: rgba(255,255,255,.18);
      background: rgba(255,255,255,.1);
    }

    .admin-catalog-panel {
      display: none;
    }

    .admin-catalog-panel.active {
      display: block;
    }

    .admin-tracks-section,
    .admin-albums-section {
      margin-top: 28px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 24px;
      background: rgba(255,255,255,.035);
      padding: 24px;
    }

    .admin-section-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 22px;
    }

    .admin-eyebrow {
      margin: 0 0 8px;
      color: rgba(255,255,255,.48);
      font-size: .72rem;
      letter-spacing: .22em;
      text-transform: uppercase;
    }

    .admin-section-header h2 {
      margin: 0;
      font-size: 1.75rem;
      letter-spacing: -.03em;
    }

    .admin-muted {
      color: rgba(255,255,255,.58);
      line-height: 1.5;
      margin: 8px 0 0;
    }

    .admin-header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .admin-secondary-btn {
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 999px;
      background: rgba(255,255,255,.04);
      color: #f4f4f4;
      padding: 10px 14px 8px;
      font-size: .7rem;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .admin-secondary-btn:hover {
      background: rgba(255,255,255,.1);
    }

    .admin-create-btn {
      border-color: rgba(103,174,135,.42);
      background: rgba(61,132,92,.16);
      color: rgba(208,255,224,.96);
    }

    .admin-create-btn:hover {
      background: rgba(61,132,92,.28);
    }

    .admin-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .admin-stat {
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 18px;
      background: rgba(0,0,0,.18);
      padding: 14px;
    }

    .admin-stat strong {
      display: block;
      font-size: 1.35rem;
      color: #fff;
    }

    .admin-stat span {
      display: block;
      margin-top: 4px;
      color: rgba(255,255,255,.52);
      font-size: .72rem;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .admin-tracks-list,
    .admin-albums-list {
      display: grid;
      gap: 14px;
    }

    .admin-track-card,
    .admin-album-card {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: 16px;
      align-items: center;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 22px;
      background: rgba(0,0,0,.24);
      padding: 14px;
    }

    .admin-track-cover,
    .admin-album-cover {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      object-fit: cover;
      background: rgba(255,255,255,.08);
    }

    .admin-track-title,
    .admin-album-title {
      margin: 0;
      color: #fff;
      font-size: 1.14rem;
      letter-spacing: -.02em;
    }

    .admin-track-meta,
    .admin-album-meta {
      margin: 7px 0 0;
      color: rgba(255,255,255,.58);
      font-size: .86rem;
      line-height: 1.4;
    }

    .admin-track-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .admin-tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 5px 9px 4px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.13);
      color: rgba(255,255,255,.74);
      background: rgba(255,255,255,.04);
      font-size: .66rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
    }

    .admin-tag.visible {
      border-color: rgba(92, 255, 151, .28);
      color: rgba(176, 255, 203, .92);
      background: rgba(68, 255, 139, .075);
    }

    .admin-tag.hidden,
    .admin-tag.upcoming {
      border-color: rgba(255,255,255,.16);
      color: rgba(255,255,255,.55);
    }

    .admin-track-side,
    .admin-album-side {
      min-width: 128px;
      text-align: right;
    }

    .admin-track-price,
    .admin-album-price {
      margin: 0;
      color: #fff;
      font-weight: 700;
      font-size: 1.05rem;
    }

    .admin-track-code,
    .admin-album-type {
      margin: 7px 0 0;
      color: rgba(255,255,255,.48);
      font-size: .72rem;
      letter-spacing: .1em;
      text-transform: uppercase;
    }

    .admin-track-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .admin-mini-btn {
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 999px;
      background: rgba(255,255,255,.035);
      color: rgba(255,255,255,.72);
      padding: 7px 10px 6px;
      font-size: .64rem;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
      cursor: pointer;
      opacity: .9;
    }

    .admin-mini-btn:hover {
      color: #fff;
      background: rgba(255,255,255,.1);
    }

    .upload-cover-btn {
      width: 100%;
      margin-top: 12px;
      border: 1px solid rgba(92,121,255,.34);
      border-radius: 999px;
      background: rgba(49,69,180,.12);
      color: rgba(226,232,255,.94);
      padding: 11px 14px 9px;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .upload-cover-btn:hover {
      background: rgba(49,69,180,.22);
    }

    .upload-preview-btn {
      border-color: rgba(103,174,135,.38);
      background: rgba(61,132,92,.12);
      color: rgba(208,255,224,.94);
    }

    .upload-preview-btn:hover {
      background: rgba(61,132,92,.22);
    }

    .upload-master-btn {
      border-color: rgba(255,255,255,.36);
      background: rgba(255,255,255,.08);
      color: rgba(255,255,255,.94);
    }

    .upload-master-btn:hover {
      background: rgba(255,255,255,.16);
    }

    .generate-preview-btn {
      border-color: rgba(120,160,255,.34);
      background: rgba(77,108,255,.12);
      color: rgba(226,232,255,.94);
    }

    .generate-preview-btn:hover {
      background: rgba(77,108,255,.22);
    }

    .generate-preview-btn:disabled {
      cursor: not-allowed;
      border-color: rgba(255,255,255,.12);
      background: rgba(255,255,255,.035);
      color: rgba(255,255,255,.32);
    }

    .generate-preview-help {
      margin: 8px 0 0;
      color: rgba(255,255,255,.5);
      font-size: .78rem;
      line-height: 1.45;
    }

    .preview-builder-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 22px;
      background: rgba(0,0,0,.68);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .preview-builder-overlay.open {
      display: flex;
    }

    .preview-builder-panel {
      width: min(94vw, 860px);
      max-height: 90vh;
      overflow: auto;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 26px;
      background: rgba(7,7,7,.94);
      box-shadow: 0 24px 90px rgba(0,0,0,.55);
      padding: 26px;
    }

    .preview-builder-panel h2 {
      margin: 0;
      color: #fff;
      font-size: 1.65rem;
      letter-spacing: -.03em;
    }

    .preview-builder-track {
      margin: 12px 0 0;
      color: rgba(226,232,255,.9);
      font-size: .82rem;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
    }

    .preview-builder-file {
      margin: 8px 0 0;
      color: rgba(255,255,255,.48);
      font-size: .8rem;
      line-height: 1.45;
      word-break: break-word;
    }

    .preview-builder-copy {
      margin: 16px 0 0;
      color: rgba(255,255,255,.64);
      line-height: 1.55;
    }

    .preview-builder-status {
      min-height: 22px;
      margin: 18px 0 0;
      color: rgba(255,255,255,.62);
      font-size: .86rem;
      line-height: 1.5;
    }

    .preview-builder-status.ok {
      color: rgba(159,230,184,.95);
    }

    .preview-builder-status.error {
      color: rgba(255,142,142,.95);
    }

    .preview-builder-wave {
      position: relative;
      margin-top: 20px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 20px;
      background: rgba(255,255,255,.035);
      overflow: hidden;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }

    .preview-builder-wave.dragging {
      cursor: grabbing;
    }

    .preview-builder-canvas {
      display: block;
      width: 100%;
      height: 190px;
    }

    .preview-builder-region {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 0;
      border-left: 1px solid rgba(159,230,184,.8);
      border-right: 1px solid rgba(159,230,184,.8);
      background: rgba(103,174,135,.16);
      box-shadow: 0 0 28px rgba(103,174,135,.18);
      pointer-events: none;
    }

    .preview-builder-region:before {
      content: "";
      position: absolute;
      inset: 0;
      border: 1px solid rgba(159,230,184,.28);
    }

    .preview-builder-time {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 12px;
      color: rgba(255,255,255,.58);
      font-size: .82rem;
      line-height: 1.45;
    }

    .preview-builder-controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 22px;
    }

    .preview-builder-controls .admin-secondary-btn {
      min-width: 150px;
    }

    .preview-builder-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 14px;
    }

    .new-track-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .new-track-field {
      display: grid;
      gap: 8px;
    }

    .new-track-field.full {
      grid-column: 1 / -1;
    }

    .new-track-field label {
      color: rgba(255,255,255,.58);
      font-size: .72rem;
      letter-spacing: .14em;
      text-transform: uppercase;
    }

    .new-track-field input,
    .new-track-field select,
    .new-track-field textarea {
      width: 100%;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 14px;
      background: rgba(0,0,0,.28);
      color: #f4f4f4;
      padding: 12px 13px 10px;
      outline: none;
    }

    .new-track-field textarea {
      min-height: 94px;
      resize: vertical;
    }

    .new-track-note {
      grid-column: 1 / -1;
      border: 1px solid rgba(92,121,255,.24);
      border-radius: 18px;
      background: rgba(49,69,180,.08);
      color: rgba(226,232,255,.8);
      padding: 14px;
      line-height: 1.45;
      font-size: .9rem;
    }

    @media (max-width: 760px) {
      .admin-catalog-tabs {
        width: 100%;
      }

      .admin-catalog-tab {
        flex: 1;
        text-align: center;
      }

      .admin-section-header {
        flex-direction: column;
      }

      .admin-header-actions {
        justify-content: flex-start;
      }

      .admin-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .admin-track-card,
      .admin-album-card {
        grid-template-columns: 64px 1fr;
      }

      .admin-track-cover,
      .admin-album-cover {
        width: 64px;
        height: 64px;
      }

      .admin-track-side,
      .admin-album-side {
        grid-column: 1 / -1;
        text-align: left;
      }

      .admin-track-actions {
        justify-content: flex-start;
      }

      .new-track-grid {
        grid-template-columns: 1fr;
      }

      .preview-builder-panel {
        padding: 22px;
        border-radius: 22px;
      }

      .preview-builder-canvas {
        height: 142px;
      }

      .preview-builder-time {
        flex-direction: column;
        gap: 4px;
      }

      .preview-builder-controls {
        display: grid;
        grid-template-columns: 1fr;
      }

      .preview-builder-actions {
        justify-content: stretch;
      }

      .preview-builder-actions .admin-secondary-btn {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}

function ensurePreviewBuilderOverlay() {
  ensureAdminStyles();

  let overlay = document.getElementById('previewBuilderOverlay');

  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = 'previewBuilderOverlay';
  overlay.className = 'preview-builder-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="preview-builder-panel" role="dialog" aria-modal="true" aria-labelledby="previewBuilderTitle">
      <h2 id="previewBuilderTitle">Preview Builder</h2>
      <p id="previewBuilderTrack" class="preview-builder-track"></p>
      <p id="previewBuilderFile" class="preview-builder-file"></p>
      <p class="preview-builder-copy">Drag the fixed selection across the waveform. The preview duration is always 30 seconds.</p>
      <p id="previewBuilderStatus" class="preview-builder-status"></p>
      <div id="previewBuilderWave" class="preview-builder-wave">
        <canvas id="previewBuilderCanvas" class="preview-builder-canvas"></canvas>
        <div id="previewBuilderRegion" class="preview-builder-region"></div>
      </div>
      <div class="preview-builder-time">
        <span id="previewBuilderTimeRange">00:00 – 00:00</span>
        <span id="previewBuilderDuration">Duration unavailable</span>
      </div>
      <div class="preview-builder-controls">
        <button id="previewBuilderPlay" class="admin-secondary-btn" type="button" disabled>Play Selection</button>
        <button id="previewBuilderSave" class="admin-secondary-btn admin-create-btn" type="button" disabled>Save Preview</button>
      </div>
      <div class="preview-builder-actions">
        <button id="previewBuilderClose" class="admin-secondary-btn" type="button">Cancel / Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(event) {
    if (event.target === overlay) {
      closePreviewBuilder();
    }
  });

  const closeBtn = document.getElementById('previewBuilderClose');

  if (closeBtn) {
    closeBtn.addEventListener('click', closePreviewBuilder);
  }

  const playBtn = document.getElementById('previewBuilderPlay');
  const saveBtn = document.getElementById('previewBuilderSave');
  const wave = document.getElementById('previewBuilderWave');

  if (playBtn) {
    playBtn.addEventListener('click', togglePreviewBuilderPlayback);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', savePreviewBuilder);
  }

  if (wave) {
    wave.addEventListener('pointerdown', beginPreviewBuilderDrag);
    wave.addEventListener('pointermove', movePreviewBuilderDrag);
    wave.addEventListener('pointerup', endPreviewBuilderDrag);
    wave.addEventListener('pointercancel', endPreviewBuilderDrag);
  }

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && overlay.classList.contains('open')) {
      closePreviewBuilder();
    }
  });

  return overlay;
}

function previewBuilderElement(id) {
  return document.getElementById(id);
}

function setPreviewBuilderStatus(message, type) {
  const status = previewBuilderElement('previewBuilderStatus');

  if (!status) {
    return;
  }

  status.textContent = message || '';
  status.className = type ? `preview-builder-status ${type}` : 'preview-builder-status';
}

function formatPreviewTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = Math.floor(safeSeconds % 60);

  return String(minutes).padStart(2, '0') + ':' + String(remainingSeconds).padStart(2, '0');
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updatePreviewBuilderButtons() {
  const playBtn = previewBuilderElement('previewBuilderPlay');
  const saveBtn = previewBuilderElement('previewBuilderSave');
  const state = previewBuilderState;
  const isReady = !!(state && state.audioBuffer && !state.loading && !state.saving);

  if (playBtn) {
    playBtn.disabled = !isReady;
    playBtn.textContent = state && state.playing ? 'Pause Selection' : 'Play Selection';
  }

  if (saveBtn) {
    saveBtn.disabled = !isReady;
    saveBtn.textContent = state && state.saving ? 'Saving...' : 'Save Preview';
  }
}

function getPreviewAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('Audio decoding is not supported in this browser');
  }

  if (!previewBuilderState.audioContext) {
    previewBuilderState.audioContext = new AudioContextClass();
  }

  return previewBuilderState.audioContext;
}

function requestMasterDownload(track) {
  return fetch(`/api/admin-track?id=${encodeURIComponent(track.id)}&action=create-master-download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.access_token}`
    },
    body: JSON.stringify({})
  }).then(function(response) {
    return response.json().catch(function() {
      return {};
    }).then(function(data) {
      if (!response.ok) {
        throw new Error(data.error || 'Unable to access master');
      }

      if (!data.signedUrl) {
        throw new Error('Missing secure master access');
      }

      return data;
    });
  });
}

function updatePreviewBuilderRegion() {
  const state = previewBuilderState;
  const region = previewBuilderElement('previewBuilderRegion');
  const timeRange = previewBuilderElement('previewBuilderTimeRange');
  const durationLabel = previewBuilderElement('previewBuilderDuration');

  if (!state || !state.audioBuffer || !region) {
    return;
  }

  const duration = state.audioBuffer.duration || 0;
  const selectionDuration = state.selectionDuration || 0;
  const selectionStart = clampNumber(state.selectionStart || 0, 0, Math.max(0, duration - selectionDuration));
  const startPercent = duration ? selectionStart / duration * 100 : 0;
  const widthPercent = duration ? selectionDuration / duration * 100 : 0;

  state.selectionStart = selectionStart;
  region.style.left = startPercent + '%';
  region.style.width = widthPercent + '%';

  if (timeRange) {
    timeRange.textContent = `${formatPreviewTime(selectionStart)} – ${formatPreviewTime(selectionStart + selectionDuration)}`;
  }

  if (durationLabel) {
    durationLabel.textContent = `${formatPreviewTime(duration)} total · ${Math.round(selectionDuration)}s selected`;
  }
}

function drawPreviewBuilderWaveform() {
  const state = previewBuilderState;
  const canvas = previewBuilderElement('previewBuilderCanvas');

  if (!state || !state.audioBuffer || !canvas) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 640));
  const height = Math.max(120, Math.floor(rect.height || 190));
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const channel = state.audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channel.length / width));
  const center = height / 2;
  const amp = height * .42;

  ctx.fillStyle = 'rgba(255,255,255,.055)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,.44)';
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 2) {
    const start = x * samplesPerPixel;
    const end = Math.min(channel.length, start + samplesPerPixel);
    let min = 1;
    let max = -1;

    for (let i = start; i < end; i++) {
      const sample = channel[i] || 0;

      if (sample < min) {
        min = sample;
      }

      if (sample > max) {
        max = sample;
      }
    }

    ctx.beginPath();
    ctx.moveTo(x + .5, center + min * amp);
    ctx.lineTo(x + .5, center + max * amp);
    ctx.stroke();
  }

  updatePreviewBuilderRegion();
}

function previewBuilderPointerStart(event) {
  const state = previewBuilderState;
  const wave = previewBuilderElement('previewBuilderWave');

  if (!state || !state.audioBuffer || !wave) {
    return 0;
  }

  const rect = wave.getBoundingClientRect();
  const x = clampNumber(event.clientX - rect.left, 0, rect.width);

  return rect.width ? x / rect.width * state.audioBuffer.duration : 0;
}

function setPreviewBuilderSelectionFromPointer(event) {
  const state = previewBuilderState;

  if (!state || !state.audioBuffer) {
    return;
  }

  const pointerSeconds = previewBuilderPointerStart(event);
  const dragOffset = Number.isFinite(state.dragOffset) ? state.dragOffset : state.selectionDuration / 2;
  const maxStart = Math.max(0, state.audioBuffer.duration - state.selectionDuration);

  state.selectionStart = clampNumber(pointerSeconds - dragOffset, 0, maxStart);
  updatePreviewBuilderRegion();
}

function beginPreviewBuilderDrag(event) {
  const state = previewBuilderState;
  const wave = previewBuilderElement('previewBuilderWave');

  if (!state || !state.audioBuffer || !wave) {
    return;
  }

  event.preventDefault();
  stopPreviewBuilderPlayback();

  const pointerSeconds = previewBuilderPointerStart(event);
  const insideSelection = pointerSeconds >= state.selectionStart && pointerSeconds <= state.selectionStart + state.selectionDuration;

  state.dragging = true;
  state.dragOffset = insideSelection ? pointerSeconds - state.selectionStart : state.selectionDuration / 2;
  wave.classList.add('dragging');
  wave.setPointerCapture(event.pointerId);
  setPreviewBuilderSelectionFromPointer(event);
}

function movePreviewBuilderDrag(event) {
  const state = previewBuilderState;

  if (!state || !state.dragging) {
    return;
  }

  event.preventDefault();
  setPreviewBuilderSelectionFromPointer(event);
}

function endPreviewBuilderDrag(event) {
  const state = previewBuilderState;
  const wave = previewBuilderElement('previewBuilderWave');

  if (!state || !state.dragging) {
    return;
  }

  state.dragging = false;

  if (wave) {
    wave.classList.remove('dragging');

    try {
      wave.releasePointerCapture(event.pointerId);
    } catch (err) {}
  }
}

async function loadPreviewBuilderAudio(track) {
  const state = previewBuilderState;

  if (!state || state.track !== track) {
    return;
  }

  try {
    setPreviewBuilderStatus('Requesting secure master access...');
    const masterData = await requestMasterDownload(track);

    if (!previewBuilderState || previewBuilderState.track !== track) {
      return;
    }

    const fileLabel = previewBuilderElement('previewBuilderFile');

    if (fileLabel) {
      fileLabel.textContent = masterData.filename ? `Master file: ${masterData.filename}` : 'Master file ready for secure preview generation';
    }

    setPreviewBuilderStatus('Loading master...');
    const fileResponse = await fetch(masterData.signedUrl);

    if (!fileResponse.ok) {
      throw new Error('Unable to load master');
    }

    const arrayBuffer = await fileResponse.arrayBuffer();

    if (!previewBuilderState || previewBuilderState.track !== track) {
      return;
    }

    setPreviewBuilderStatus('Decoding audio...');
    const audioContext = getPreviewAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    if (!previewBuilderState || previewBuilderState.track !== track) {
      return;
    }

    const duration = audioBuffer.duration || 0;

    if (!duration) {
      throw new Error('Unable to decode audio duration');
    }

    state.audioBuffer = audioBuffer;
    state.selectionStart = 0;
    state.selectionDuration = Math.min(30, duration);
    state.loading = false;

    drawPreviewBuilderWaveform();
    updatePreviewBuilderButtons();

    if (duration < 30) {
      setPreviewBuilderStatus('Ready. This track is shorter than 30 seconds, so the full duration will be used.', 'ok');
    } else {
      setPreviewBuilderStatus('Ready. Drag the 30-second selection.', 'ok');
    }
  } catch (err) {
    if (previewBuilderState && previewBuilderState.track === track) {
      previewBuilderState.loading = false;
      setPreviewBuilderStatus(err.message || 'Unable to build preview.', 'error');
      updatePreviewBuilderButtons();
    }
  }
}

function openPreviewBuilder(track) {
  if (!track || !track.masterPath) {
    return;
  }

  if (previewBuilderState) {
    closePreviewBuilder();
  }

  const overlay = ensurePreviewBuilderOverlay();
  const trackName = document.getElementById('previewBuilderTrack');
  const fileName = document.getElementById('previewBuilderFile');

  if (trackName) {
    trackName.textContent = track.displayTitle || track.title || 'Untitled track';
  }

  if (fileName) {
    fileName.textContent = track.filename ? `Master file: ${track.filename}` : 'Master file available';
  }

  previewBuilderState = {
    track,
    audioContext: null,
    audioBuffer: null,
    source: null,
    playTimeout: null,
    selectionStart: 0,
    selectionDuration: 30,
    playing: false,
    loading: true,
    saving: false,
    dragging: false,
    dragOffset: 15
  };

  setPreviewBuilderStatus('Requesting secure master access...');
  updatePreviewBuilderButtons();
  updatePreviewBuilderRegion();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  loadPreviewBuilderAudio(track);
}

function closePreviewBuilder() {
  const overlay = document.getElementById('previewBuilderOverlay');

  if (!overlay) {
    return;
  }

  stopPreviewBuilderPlayback();

  if (previewBuilderState && previewBuilderState.audioContext) {
    previewBuilderState.audioContext.close().catch(function() {});
  }

  previewBuilderState = null;

  const trackName = document.getElementById('previewBuilderTrack');
  const fileName = document.getElementById('previewBuilderFile');
  const canvas = document.getElementById('previewBuilderCanvas');
  const region = document.getElementById('previewBuilderRegion');
  const timeRange = document.getElementById('previewBuilderTimeRange');
  const durationLabel = document.getElementById('previewBuilderDuration');

  if (trackName) {
    trackName.textContent = '';
  }

  if (fileName) {
    fileName.textContent = '';
  }

  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  if (region) {
    region.style.left = '0';
    region.style.width = '0';
  }

  if (timeRange) {
    timeRange.textContent = '00:00 – 00:00';
  }

  if (durationLabel) {
    durationLabel.textContent = 'Duration unavailable';
  }

  setPreviewBuilderStatus('');
  updatePreviewBuilderButtons();
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function stopPreviewBuilderPlayback() {
  const state = previewBuilderState;

  if (!state) {
    return;
  }

  if (state.playTimeout) {
    clearTimeout(state.playTimeout);
    state.playTimeout = null;
  }

  if (state.source) {
    try {
      state.source.onended = null;
      state.source.stop(0);
      state.source.disconnect();
    } catch (err) {}

    state.source = null;
  }

  state.playing = false;
  updatePreviewBuilderButtons();
}

async function togglePreviewBuilderPlayback() {
  const state = previewBuilderState;

  if (!state || !state.audioBuffer || state.loading || state.saving) {
    return;
  }

  if (state.playing) {
    stopPreviewBuilderPlayback();
    return;
  }

  try {
    const audioContext = getPreviewAudioContext();

    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(function() {});
    }

    const source = audioContext.createBufferSource();
    const duration = state.selectionDuration;

    source.buffer = state.audioBuffer;
    source.connect(audioContext.destination);
    source.onended = function() {
      if (previewBuilderState === state) {
        stopPreviewBuilderPlayback();
      }
    };

    state.source = source;
    state.playing = true;
    updatePreviewBuilderButtons();
    source.start(0, state.selectionStart, duration);
    state.playTimeout = setTimeout(function() {
      if (previewBuilderState === state) {
        stopPreviewBuilderPlayback();
      }
    }, duration * 1000 + 80);
  } catch (err) {
    setPreviewBuilderStatus('Unable to play selection.', 'error');
    stopPreviewBuilderPlayback();
  }
}

function getPreviewSelectionData() {
  const state = previewBuilderState;
  const audioBuffer = state.audioBuffer;
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(state.selectionStart * sampleRate);
  const frameCount = Math.min(
    Math.floor(state.selectionDuration * sampleRate),
    audioBuffer.length - startSample
  );
  const channelCount = Math.min(2, audioBuffer.numberOfChannels || 1);
  const channels = [];

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    channels.push(audioBuffer.getChannelData(channelIndex).slice(startSample, startSample + frameCount));
  }

  if (channels.length === 1) {
    channels.push(channels[0]);
  }

  return {
    sampleRate,
    frameCount,
    channels
  };
}

function floatChunkToInt16(channel, start, end) {
  const chunk = new Int16Array(end - start);

  for (let index = start; index < end; index++) {
    const sample = Math.max(-1, Math.min(1, channel[index] || 0));
    chunk[index - start] = sample < 0 ? sample * 32768 : sample * 32767;
  }

  return chunk;
}

function encodeMp3Preview(selection) {
  if (!window.lamejs || !window.lamejs.Mp3Encoder) {
    throw new Error('MP3 encoder unavailable');
  }

  const channels = selection.channels.length > 1 ? 2 : 1;
  const encoder = new window.lamejs.Mp3Encoder(channels, selection.sampleRate, 160);
  const chunks = [];
  const blockSize = 1152;

  for (let start = 0; start < selection.frameCount; start += blockSize) {
    const end = Math.min(selection.frameCount, start + blockSize);
    const left = floatChunkToInt16(selection.channels[0], start, end);
    const right = channels > 1 ? floatChunkToInt16(selection.channels[1], start, end) : null;
    const encoded = channels > 1 ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left);

    if (encoded.length) {
      chunks.push(encoded);
    }
  }

  const flushed = encoder.flush();

  if (flushed.length) {
    chunks.push(flushed);
  }

  return {
    blob: new Blob(chunks, { type: 'audio/mpeg' }),
    mimeType: 'audio/mpeg',
    extension: 'mp3'
  };
}

function writeWavString(view, offset, value) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodeWavPreview(selection) {
  const channels = selection.channels.length > 1 ? 2 : 1;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + selection.frameCount * blockAlign);
  const view = new DataView(buffer);

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + selection.frameCount * blockAlign, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, selection.sampleRate, true);
  view.setUint32(28, selection.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, selection.frameCount * blockAlign, true);

  let offset = 44;

  for (let frame = 0; frame < selection.frameCount; frame++) {
    for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
      const channel = selection.channels[channelIndex] || selection.channels[0];
      const sample = Math.max(-1, Math.min(1, channel[frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  }

  return {
    blob: new Blob([buffer], { type: 'audio/wav' }),
    mimeType: 'audio/wav',
    extension: 'wav'
  };
}

function safePreviewFileName(track, extension) {
  const base = String(track.catalogCode || track.legacyId || track.title || 'amneuz-preview')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'amneuz-preview';

  return `${base}-preview.${extension}`;
}

async function savePreviewBuilder() {
  const state = previewBuilderState;

  if (!state || !state.track || !state.audioBuffer || state.saving || !currentSession) {
    return;
  }

  stopPreviewBuilderPlayback();
  state.saving = true;
  updatePreviewBuilderButtons();

  try {
    setPreviewBuilderStatus('Encoding preview...');
    const selection = getPreviewSelectionData();
    let encoded;
    let usedFallback = false;

    try {
      encoded = encodeMp3Preview(selection);
    } catch (err) {
      usedFallback = true;
      setPreviewBuilderStatus('MP3 encoder unavailable. Saving WAV preview...');
      encoded = encodeWavPreview(selection);
    }

    const fileBase64 = await fileToBase64(encoded.blob);

    setPreviewBuilderStatus(usedFallback ? 'Uploading WAV preview...' : 'Uploading preview...');

    const response = await fetch('/api/admin-upload-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        trackId: state.track.id,
        fileName: safePreviewFileName(state.track, encoded.extension),
        mimeType: encoded.mimeType,
        fileBase64,
        source: 'preview_builder',
        previewStartSeconds: state.selectionStart,
        previewDurationSeconds: state.selectionDuration
      })
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to save preview');
    }

    if (activeTrackForSave && activeTrackForSave.id === state.track.id) {
      activeTrackForSave.previewUrl = data.previewUrl;
      activeTrackForSave.rawPreviewUrl = data.previewUrl;
    }

    setPreviewBuilderStatus('Preview saved.', 'ok');
    setSaveStatus('Preview saved.', 'ok');
    setFooterButtonToClose();
    await loadAdminTracks();
    setTimeout(function() {
      if (previewBuilderState === state) {
        closePreviewBuilder();
      }
    }, 700);
  } catch (err) {
    state.saving = false;
    setPreviewBuilderStatus(err.message || 'Unable to save preview.', 'error');
    updatePreviewBuilderButtons();
  }
}

function updateGeneratePreviewState(track) {
  const generatePreviewBtn = document.getElementById('generatePreviewBtn');
  const generatePreviewHelp = document.getElementById('generatePreviewHelp');
  const hasMaster = !!(track && track.masterPath);

  if (generatePreviewBtn) {
    generatePreviewBtn.disabled = !hasMaster;
  }

  if (generatePreviewHelp) {
    generatePreviewHelp.textContent = hasMaster
      ? 'Generate a 30-second preview from the uploaded master.'
      : 'Upload a master first to generate a preview.';
  }
}

function bindGeneratePreview() {
  const generatePreviewBtn = document.getElementById('generatePreviewBtn');

  if (!generatePreviewBtn) {
    return;
  }

  updateGeneratePreviewState(activeTrackForSave);

  generatePreviewBtn.addEventListener('click', function() {
    if (generatePreviewBtn.disabled) {
      return;
    }

    openPreviewBuilder(activeTrackForSave);
  });
}

function ensureCatalogTabs() {
  ensureAdminStyles();

  let tabs = document.getElementById('catalogTabs');

  if (tabs) {
    return tabs;
  }

  const main = document.querySelector('main') || document.body;

  tabs = document.createElement('div');
  tabs.id = 'catalogTabs';
  tabs.className = 'admin-catalog-tabs';
  tabs.innerHTML = `
    <button class="admin-catalog-tab active" type="button" data-admin-tab="tracks">Tracks</button>
    <button class="admin-catalog-tab" type="button" data-admin-tab="albums">Albums & EPs</button>
  `;

  main.appendChild(tabs);

  tabs.querySelectorAll('.admin-catalog-tab').forEach(function(button) {
    button.addEventListener('click', function() {
      setActiveCatalogTab(button.getAttribute('data-admin-tab') || 'tracks');
    });
  });

  return tabs;
}

function setActiveCatalogTab(tabName) {
  const activeTab = tabName === 'albums' ? 'albums' : 'tracks';

  document.querySelectorAll('.admin-catalog-tab').forEach(function(button) {
    button.classList.toggle('active', button.getAttribute('data-admin-tab') === activeTab);
  });

  const tracksSection = document.getElementById('tracksSection');
  const albumsSection = document.getElementById('albumsSection');

  if (tracksSection) {
    tracksSection.classList.toggle('active', activeTab === 'tracks');
  }

  if (albumsSection) {
    albumsSection.classList.toggle('active', activeTab === 'albums');
  }

  try {
    window.localStorage.setItem(ADMIN_CATALOG_TAB_KEY, activeTab);
  } catch (err) {}
}

function getSavedCatalogTab() {
  try {
    return window.localStorage.getItem(ADMIN_CATALOG_TAB_KEY) || 'tracks';
  } catch (err) {
    return 'tracks';
  }
}

function ensureTracksSection() {
  ensureAdminStyles();

  let section = document.getElementById('tracksSection');

  if (section) {
    return section;
  }

  const main = document.querySelector('main') || document.body;

  section = document.createElement('section');
  section.id = 'tracksSection';
  section.className = 'admin-tracks-section admin-catalog-panel active';
  section.innerHTML = `
    <div class="admin-section-header">
      <div>
        <p class="admin-eyebrow">Catalog</p>
        <h2>Tracks</h2>
        <p class="admin-muted">Live catalog data from Supabase.</p>
      </div>

      <div class="admin-header-actions">
        <button class="admin-secondary-btn admin-create-btn" type="button" id="newTrackBtn">New Track</button>
        <button class="admin-secondary-btn" type="button" id="refreshTracksBtn">Refresh</button>
      </div>
    </div>

    <div class="admin-stats" id="tracksStats"></div>
    <div class="admin-tracks-list" id="tracksList">
      <p class="admin-muted">Loading tracks...</p>
    </div>
  `;

  main.appendChild(section);

  return section;
}

function ensureAlbumsSection() {
  ensureAdminStyles();

  let section = document.getElementById('albumsSection');

  if (section) {
    return section;
  }

  const main = document.querySelector('main') || document.body;

  section = document.createElement('section');
  section.id = 'albumsSection';
  section.className = 'admin-albums-section admin-catalog-panel';
  section.innerHTML = `
    <div class="admin-section-header">
      <div>
        <p class="admin-eyebrow">Release Groups</p>
        <h2>Albums & EPs</h2>
        <p class="admin-muted">Grouped releases that can be sold as complete products.</p>
      </div>

      <div class="admin-header-actions">
        <button class="admin-secondary-btn admin-create-btn" type="button" id="newAlbumBtn">New Album / EP</button>
        <button class="admin-secondary-btn" type="button" id="refreshAlbumsBtn">Refresh</button>
      </div>
    </div>

    <div class="admin-albums-list" id="albumsList">
      <p class="admin-muted">Loading albums...</p>
    </div>
  `;

  main.appendChild(section);

  return section;
}

function renderStats(tracks) {
  const statsEl = document.getElementById('tracksStats');

  if (!statsEl) return;

  const total = tracks.length;
  const visible = tracks.filter(function(track) { return track.status === 'visible'; }).length;
  const featured = tracks.filter(function(track) { return track.isFeatured; }).length;
  const latest = tracks.filter(function(track) { return track.isLatestRelease; }).length;

  statsEl.innerHTML = `
    <div class="admin-stat">
      <strong>${total}</strong>
      <span>Total tracks</span>
    </div>
    <div class="admin-stat">
      <strong>${visible}</strong>
      <span>Visible</span>
    </div>
    <div class="admin-stat">
      <strong>${featured}</strong>
      <span>Featured</span>
    </div>
    <div class="admin-stat">
      <strong>${latest}</strong>
      <span>Latest</span>
    </div>
  `;
}

function renderTracks(tracks) {
  const listEl = document.getElementById('tracksList');

  if (!listEl) return;

  if (!tracks.length) {
    listEl.innerHTML = '<p class="admin-muted">No tracks found yet.</p>';
    return;
  }

  listEl.innerHTML = tracks.map(function(track) {
    const meta = [
      track.subgenre,
      track.key,
      track.bpm ? track.bpm + ' BPM' : '',
      track.duration || '',
      track.releaseYear || ''
    ].filter(Boolean).join(' · ');

    const tags = [
      `<span class="admin-tag ${escapeHtml(track.status || '')}">${escapeHtml(statusLabel(track.status))}</span>`,
      track.isFeatured ? '<span class="admin-tag">Featured</span>' : '',
      track.isLatestRelease ? '<span class="admin-tag">Latest release</span>' : '',
      track.stripePriceId ? '<span class="admin-tag">Stripe linked</span>' : '<span class="admin-tag hidden">No Stripe</span>',
      track.masterPath ? '<span class="admin-tag">Master linked</span>' : '<span class="admin-tag hidden">No master</span>',
      track.previewUrl ? '<span class="admin-tag">Preview linked</span>' : '<span class="admin-tag hidden">No preview</span>'
    ].filter(Boolean).join('');

    return `
      <article class="admin-track-card">
        <img class="admin-track-cover" src="${escapeHtml(track.coverUrl || '')}" alt="${escapeHtml(track.displayTitle || track.title || 'Track cover')}">
        <div>
          <h3 class="admin-track-title">${escapeHtml(track.displayTitle || track.title)}</h3>
          <p class="admin-track-meta">${escapeHtml(meta || 'No metadata')}</p>
          <div class="admin-track-tags">${tags}</div>
        </div>
        <div class="admin-track-side">
          <p class="admin-track-price">${escapeHtml(money(track.priceMxn))}</p>
          <p class="admin-track-code">${escapeHtml(track.catalogCode || track.legacyId || '')}</p>
          <div class="admin-track-actions">
            <button class="admin-mini-btn edit-track-btn" type="button" data-track-id="${escapeHtml(track.id)}">Edit</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.edit-track-btn').forEach(function(button) {
    button.addEventListener('click', function() {
      const trackId = button.getAttribute('data-track-id');
      openTrackModal(trackId);
    });
  });
}

function renderAlbums(albums) {
  const listEl = document.getElementById('albumsList');

  if (!listEl) return;

  if (!albums.length) {
    listEl.innerHTML = '<p class="admin-muted">No albums or EPs found yet.</p>';
    return;
  }

  listEl.innerHTML = albums.map(function(album) {
    const meta = [
      releaseTypeLabel(album.releaseType),
      album.releaseYear || '',
      album.status ? statusLabel(album.status) : '',
      album.stripePriceId ? 'Stripe linked' : 'No Stripe'
    ].filter(Boolean).join(' · ');

    const tags = [
      `<span class="admin-tag ${escapeHtml(album.status || '')}">${escapeHtml(statusLabel(album.status))}</span>`,
      `<span class="admin-tag">${escapeHtml(releaseTypeLabel(album.releaseType))}</span>`,
      album.isFeatured ? '<span class="admin-tag">Featured</span>' : '',
      album.isLatestRelease ? '<span class="admin-tag">Latest release</span>' : '',
      album.stripePriceId ? '<span class="admin-tag">Stripe linked</span>' : '<span class="admin-tag hidden">No Stripe</span>'
    ].filter(Boolean).join('');

    return `
      <article class="admin-album-card">
        <img class="admin-album-cover" src="${escapeHtml(album.coverUrl || '')}" alt="${escapeHtml(album.displayTitle || album.title || 'Album cover')}">
        <div>
          <h3 class="admin-album-title">${escapeHtml(album.displayTitle || album.title)}</h3>
          <p class="admin-album-meta">${escapeHtml(meta || 'No metadata')}</p>
          <div class="admin-track-tags">${tags}</div>
        </div>
        <div class="admin-album-side">
          <p class="admin-album-price">${escapeHtml(money(album.priceMxn))}</p>
          <p class="admin-album-type">${escapeHtml(releaseTypeLabel(album.releaseType))}</p>
          <div class="admin-track-actions">
            <button class="admin-mini-btn edit-album-btn" type="button" data-album-id="${escapeHtml(album.id)}">Edit</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.edit-album-btn').forEach(function(button) {
    button.addEventListener('click', function() {
      const albumId = button.getAttribute('data-album-id');
      openAlbumModal(albumId);
    });
  });
}

function detailField(label, value, full) {
  return `
    <div class="detail-field ${full ? 'full' : ''}">
      <p class="detail-label">${escapeHtml(label)}</p>
      <p class="detail-value">${escapeHtml(value || '—')}</p>
    </div>
  `;
}

function editableInput(label, id, value, type, full) {
  return `
    <div class="detail-field ${full ? 'full' : ''}">
      <p class="detail-label">${escapeHtml(label)}</p>
      <input
        id="${escapeHtml(id)}"
        class="admin-edit-input"
        type="${escapeHtml(type || 'text')}"
        value="${escapeHtml(value || '')}"
      >
    </div>
  `;
}

function editableSelect(label, id, value, options, full) {
  return `
    <div class="detail-field ${full ? 'full' : ''}">
      <p class="detail-label">${escapeHtml(label)}</p>
      <select id="${escapeHtml(id)}" class="admin-edit-input">
        ${options.map(function(option) {
          return `<option value="${escapeHtml(option.value)}" ${String(value || '') === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
        }).join('')}
      </select>
    </div>
  `;
}

function editableCheckbox(label, id, checked) {
  return `
    <label style="display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:10px 13px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.78);font-size:.82rem;">
      <input id="${escapeHtml(id)}" type="checkbox" ${checked ? 'checked' : ''}>
      ${escapeHtml(label)}
    </label>
  `;
}

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function newTrackField(label, id, type, value, full) {
  return `
    <div class="new-track-field ${full ? 'full' : ''}">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <input id="${escapeHtml(id)}" type="${escapeHtml(type || 'text')}" value="${escapeHtml(value || '')}">
    </div>
  `;
}

function newTrackSelect(label, id, value, options, full) {
  return `
    <div class="new-track-field ${full ? 'full' : ''}">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <select id="${escapeHtml(id)}">
        ${options.map(function(option) {
          return `<option value="${escapeHtml(option.value)}" ${String(value || '') === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
        }).join('')}
      </select>
    </div>
  `;
}

function newTrackTextarea(label, id, value, full) {
  return `
    <div class="new-track-field ${full ? 'full' : ''}">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <textarea id="${escapeHtml(id)}">${escapeHtml(value || '')}</textarea>
    </div>
  `;
}

function openModal() {
  trackModal.classList.add('show');
  trackModal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  closePreviewBuilder();
  trackModal.classList.remove('show');
  trackModal.setAttribute('aria-hidden', 'true');
  trackModalTitle.textContent = 'Loading track...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
  activeTrackForSave = null;
  activeAlbumForSave = null;
  setSaveStatus('', '');
  resetSaveButton();
}

function setSaveStatus(message, type) {
  trackSaveStatus.textContent = message || '';
  trackSaveStatus.className = type ? `modal-save-status ${type}` : 'modal-save-status';
}

function resetSaveButton() {
  saveTrackModalFooter.disabled = false;
  saveTrackModalFooter.textContent = 'Save Changes';
  saveTrackModalFooter.dataset.mode = 'save';
}

function setFooterButtonToClose() {
  saveTrackModalFooter.disabled = false;
  saveTrackModalFooter.textContent = 'Close';
  saveTrackModalFooter.dataset.mode = 'close';
}

function markUnsavedChanges() {
  if (saveTrackModalFooter.dataset.mode === 'close') {
    resetSaveButton();
    setSaveStatus('', '');
  }
}

function bindEditableChangeListeners() {
  trackModalBody.querySelectorAll('input, textarea, select').forEach(function(field) {
    field.addEventListener('input', markUnsavedChanges);
    field.addEventListener('change', markUnsavedChanges);
  });
}

function openNewTrackModal() {
  setLastActivity();

  activeTrackForSave = null;
  activeAlbumForSave = null;
  setSaveStatus('', '');

  trackModalTitle.textContent = 'New Track';

  saveTrackModalFooter.disabled = false;
  saveTrackModalFooter.textContent = 'Create Track';
  saveTrackModalFooter.dataset.mode = 'create';

  trackModalBody.innerHTML = `
    <div class="new-track-grid">
      <div class="new-track-note">
        This will create a new hidden track in Supabase and automatically create a one-time MXN Product + Price in Stripe. After creating it, upload cover, preview and master from the track editor.
      </div>

      ${newTrackField('Title *', 'newTitleInput', 'text', '', false)}
      ${newTrackField('Artist *', 'newArtistInput', 'text', 'AMNEUZ', false)}
      ${newTrackField('Collaborators', 'newCollaboratorsInput', 'text', '', false)}

      ${newTrackSelect('Category *', 'newCategoryInput', 'remixes', [
        { value: 'remixes', label: 'Remixes' },
        { value: 'originals', label: 'Originals' },
        { value: 'album', label: 'Album' }
      ], false)}

      ${newTrackSelect('Status *', 'newStatusInput', 'hidden', [
        { value: 'hidden', label: 'Hidden' },
        { value: 'upcoming', label: 'Upcoming' },
        { value: 'visible', label: 'Visible' }
      ], false)}

      ${newTrackField('Price MXN *', 'newPriceInput', 'number', '99', false)}
      ${newTrackField('Subgenre', 'newSubgenreInput', 'text', '', false)}
      ${newTrackField('Key', 'newKeyInput', 'text', '', false)}
      ${newTrackField('BPM', 'newBpmInput', 'number', '', false)}
      ${newTrackField('Duration Label', 'newDurationInput', 'text', '', false)}
      ${newTrackField('Release Year', 'newReleaseYearInput', 'number', new Date().getFullYear(), false)}
      ${newTrackField('Release Date', 'newReleaseDateInput', 'date', '', false)}
      ${newTrackField('Sort Order', 'newSortOrderInput', 'number', '', false)}

      ${newTrackField('SoundCloud URL', 'newSoundcloudInput', 'url', '', true)}
      ${newTrackField('Spotify URL', 'newSpotifyInput', 'url', '', true)}
      ${newTrackField('Apple Music URL', 'newAppleMusicInput', 'url', '', true)}
      ${newTrackField('Tidal URL', 'newTidalInput', 'url', '', true)}
      ${newTrackField('YouTube URL', 'newYoutubeInput', 'url', '', true)}
      ${newTrackField('Beatport URL', 'newBeatportInput', 'url', '', true)}

      ${newTrackTextarea('Short Description', 'newShortDescriptionInput', 'Official WAV extended mix, direct from AMNEUZ.', true)}
      ${newTrackTextarea('Long Description', 'newLongDescriptionInput', '', true)}
    </div>
  `;

  openModal();
}

function openNewAlbumModal() {
  setLastActivity();

  activeTrackForSave = null;
  activeAlbumForSave = null;
  setSaveStatus('', '');

  trackModalTitle.textContent = 'New Album / EP';

  saveTrackModalFooter.disabled = false;
  saveTrackModalFooter.textContent = 'Create Album / EP';
  saveTrackModalFooter.dataset.mode = 'create-album';

  trackModalBody.innerHTML = `
    <div class="new-track-grid">
      <div class="new-track-note">
        This will create a grouped release in Supabase and automatically create a one-time MXN Product + Price in Stripe. After creating it, open the album editor to upload cover.
      </div>

      ${newTrackField('Title *', 'albumTitleInput', 'text', '', false)}
      ${newTrackField('Artist *', 'albumArtistInput', 'text', 'AMNEUZ', false)}
      ${newTrackField('Collaborators', 'albumCollaboratorsInput', 'text', '', false)}

      ${newTrackSelect('Release Type *', 'albumReleaseTypeInput', 'album', [
        { value: 'album', label: 'Album' },
        { value: 'ep', label: 'EP' }
      ], false)}

      ${newTrackSelect('Status *', 'albumStatusInput', 'hidden', [
        { value: 'hidden', label: 'Hidden' },
        { value: 'upcoming', label: 'Upcoming' },
        { value: 'visible', label: 'Visible' }
      ], false)}

      ${newTrackField('Price MXN *', 'albumPriceInput', 'number', '399', false)}
      ${newTrackField('Release Year', 'albumReleaseYearInput', 'number', new Date().getFullYear(), false)}
      ${newTrackField('Release Date', 'albumReleaseDateInput', 'date', '', false)}
      ${newTrackField('Sort Order', 'albumSortOrderInput', 'number', '', false)}

      ${newTrackField('SoundCloud URL', 'albumSoundcloudInput', 'url', '', true)}
      ${newTrackField('Spotify URL', 'albumSpotifyInput', 'url', '', true)}
      ${newTrackField('Apple Music URL', 'albumAppleMusicInput', 'url', '', true)}
      ${newTrackField('Tidal URL', 'albumTidalInput', 'url', '', true)}
      ${newTrackField('YouTube URL', 'albumYoutubeInput', 'url', '', true)}
      ${newTrackField('Beatport URL', 'albumBeatportInput', 'url', '', true)}

      <div class="detail-field full">
        <p class="detail-label">Display Flags</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          ${editableCheckbox('Featured', 'albumFeaturedInput', false)}
          ${editableCheckbox('Latest Release', 'albumLatestReleaseInput', false)}
        </div>
      </div>

      ${newTrackTextarea('Short Description', 'albumShortDescriptionInput', 'Official release by AMNEUZ.', true)}
      ${newTrackTextarea('Long Description', 'albumLongDescriptionInput', '', true)}
    </div>
  `;

  openModal();
}

async function openAlbumModal(albumId) {
  if (!albumId || !currentSession) return;

  setLastActivity();

  trackModalTitle.textContent = 'Loading album...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
  activeTrackForSave = null;
  activeAlbumForSave = null;
  setSaveStatus('', '');
  resetSaveButton();
  openModal();

  try {
    const response = await fetch('/api/admin-tracks?resource=albums', {
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`
      }
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load albums');
    }

    const albums = Array.isArray(data.albums) ? data.albums : [];
    const album = albums.find(function(item) {
      return item.id === albumId;
    });

    if (!album) {
      throw new Error('Album not found');
    }

    activeAlbumForSave = album;

    trackModalTitle.textContent = album.displayTitle || album.title || 'Album details';

    trackModalBody.innerHTML = `
      <div class="track-detail-grid">
        <div>
          <img id="albumModalCover" class="track-detail-cover" src="${escapeHtml(album.coverUrl || '')}" alt="${escapeHtml(album.displayTitle || album.title || 'Album cover')}">

          <button id="uploadAlbumCoverBtn" class="upload-cover-btn" type="button">Upload Album Cover</button>
          <input id="albumCoverFileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">
        </div>

        <div class="track-detail-fields">
          ${editableInput('Title', 'albumTitleInput', album.title, 'text')}
          ${editableInput('Artist', 'albumArtistInput', album.artist, 'text')}
          ${editableInput('Collaborators', 'albumCollaboratorsInput', album.collaborators, 'text')}

          ${editableSelect('Release Type', 'albumReleaseTypeInput', album.releaseType, [
            { value: 'album', label: 'Album' },
            { value: 'ep', label: 'EP' }
          ])}

          ${editableSelect('Status', 'albumStatusInput', album.status, [
            { value: 'visible', label: 'Visible' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'upcoming', label: 'Upcoming' }
          ])}

          ${editableInput('Price MXN', 'albumPriceInput', album.priceMxn, 'number')}
          ${editableInput('Release Year', 'albumReleaseYearInput', album.releaseYear, 'number')}
          ${editableInput('Release Date', 'albumReleaseDateInput', album.releaseDate, 'date')}
          ${editableInput('Sort Order', 'albumSortOrderInput', album.sortOrder, 'number')}

          <div class="detail-field full">
            <p class="detail-label">Display Flags</p>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              ${editableCheckbox('Featured', 'albumFeaturedInput', album.isFeatured)}
              ${editableCheckbox('Latest Release', 'albumLatestReleaseInput', album.isLatestRelease)}
            </div>
          </div>

          ${detailField('Stripe Product ID', album.stripeProductId, true)}
          ${detailField('Stripe Price ID', album.stripePriceId, true)}
          ${detailField('Cover URL', album.rawCoverUrl || album.coverUrl, true)}

          ${editableInput('SoundCloud URL', 'albumSoundcloudInput', album.soundcloudUrl, 'url', true)}
          ${editableInput('Spotify URL', 'albumSpotifyInput', album.spotifyUrl, 'url', true)}
          ${editableInput('Apple Music URL', 'albumAppleMusicInput', album.appleMusicUrl, 'url', true)}
          ${editableInput('Tidal URL', 'albumTidalInput', album.tidalUrl, 'url', true)}
          ${editableInput('YouTube URL', 'albumYoutubeInput', album.youtubeUrl, 'url', true)}
          ${editableInput('Beatport URL', 'albumBeatportInput', album.beatportUrl, 'url', true)}

          <div class="detail-field full">
            <p class="detail-label">Short Description</p>
            <textarea id="albumShortDescriptionInput" class="admin-edit-textarea">${escapeHtml(album.descriptionShort || '')}</textarea>
          </div>

          <div class="detail-field full">
            <p class="detail-label">Long Description</p>
            <textarea id="albumLongDescriptionInput" class="admin-edit-textarea">${escapeHtml(album.descriptionLong || '')}</textarea>
          </div>
        </div>
      </div>
    `;

    bindEditableChangeListeners();
    bindAlbumCoverUpload();
  } catch (err) {
    trackModalTitle.textContent = 'Unable to load album';
    trackModalBody.innerHTML = `<p>${escapeHtml(err.message || 'Unable to load album')}</p>`;
    activeAlbumForSave = null;
  }
}

async function openTrackModal(trackId) {
  if (!trackId || !currentSession) return;

  setLastActivity();

  trackModalTitle.textContent = 'Loading track...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
  activeTrackForSave = null;
  activeAlbumForSave = null;
  setSaveStatus('', '');
  resetSaveButton();
  openModal();

  try {
    const response = await fetch(`/api/admin-track?id=${encodeURIComponent(trackId)}`, {
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`
      }
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load track');
    }

    const track = data.track;
    activeTrackForSave = track;
    const hasMaster = !!track.masterPath;

    trackModalTitle.textContent = track.displayTitle || track.title || 'Track details';

    trackModalBody.innerHTML = `
      <div class="track-detail-grid">
        <div>
          <img id="trackModalCover" class="track-detail-cover" src="${escapeHtml(track.coverUrl || '')}" alt="${escapeHtml(track.displayTitle || track.title || 'Track cover')}">

          <button id="uploadCoverBtn" class="upload-cover-btn" type="button">Upload Cover</button>
          <input id="coverFileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">

          <button id="uploadPreviewBtn" class="upload-cover-btn upload-preview-btn" type="button">Upload Preview</button>
          <input id="previewFileInput" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/webm,audio/mp4,audio/aac,audio/ogg" style="display:none;">

          <button id="uploadMasterBtn" class="upload-cover-btn upload-master-btn" type="button">Upload Master</button>
          <input id="masterFileInput" type="file" accept="audio/wav,audio/x-wav,audio/wave,audio/flac,audio/aiff,audio/x-aiff,application/octet-stream,.wav,.flac,.aif,.aiff" style="display:none;">

          <button id="generatePreviewBtn" class="upload-cover-btn generate-preview-btn" type="button" ${hasMaster ? '' : 'disabled'}>Generate Preview</button>
          <p id="generatePreviewHelp" class="generate-preview-help">${hasMaster ? 'Generate a 30-second preview from the uploaded master.' : 'Upload a master first to generate a preview.'}</p>
        </div>

        <div class="track-detail-fields">
          ${detailField('Catalog Code', track.catalogCode)}
          ${detailField('Legacy ID', track.legacyId)}

          ${editableInput('Title', 'titleInput', track.title, 'text')}
          ${editableInput('Artist', 'artistInput', track.artist, 'text')}
          ${editableInput('Collaborators', 'collaboratorsInput', track.collaborators, 'text')}

          ${editableSelect('Status', 'statusInput', track.status, [
            { value: 'visible', label: 'Visible' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'upcoming', label: 'Upcoming' }
          ])}

          ${editableSelect('Category', 'categoryInput', track.category, [
            { value: 'remixes', label: 'Remixes' },
            { value: 'originals', label: 'Originals' },
            { value: 'album', label: 'Album' }
          ])}

          ${editableInput('Subgenre', 'subgenreInput', track.subgenre, 'text')}
          ${editableInput('Key', 'keyInput', track.key, 'text')}
          ${editableInput('BPM', 'bpmInput', track.bpm, 'text')}
          ${editableInput('Duration', 'durationLabelInput', track.durationLabel, 'text')}
          ${editableInput('Release Year', 'releaseYearInput', track.releaseYear, 'number')}
          ${editableInput('Release Date', 'releaseDateInput', dateInputValue(track.releaseDate || track.release_date), 'date')}
          ${editableInput('Price MXN', 'priceMxnInput', track.priceMxn, 'number')}
          ${editableInput('Sort Order', 'sortOrderInput', track.sortOrder, 'number')}

          <div class="detail-field full">
            <p class="detail-label">Display Flags</p>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              ${editableCheckbox('Featured', 'isFeaturedInput', track.isFeatured)}
              ${editableCheckbox('Latest Release', 'isLatestReleaseInput', track.isLatestRelease)}
            </div>
          </div>

          ${detailField('Stripe Product ID', track.stripeProductId, true)}
          ${detailField('Stripe Price ID', track.stripePriceId, true)}
          ${detailField('Master Path', track.masterPath, true)}
          ${detailField('Filename', track.filename, true)}
          ${detailField('Cover URL', track.rawCoverUrl || track.coverUrl, true)}
          ${detailField('Preview URL', track.rawPreviewUrl || track.previewUrl, true)}

          ${editableInput('SoundCloud URL', 'soundcloudUrlInput', track.soundcloudUrl, 'url', true)}
          ${editableInput('Spotify URL', 'spotifyUrlInput', track.spotifyUrl, 'url', true)}
          ${editableInput('Apple Music URL', 'appleMusicUrlInput', track.appleMusicUrl, 'url', true)}
          ${editableInput('Tidal URL', 'tidalUrlInput', track.tidalUrl, 'url', true)}
          ${editableInput('YouTube URL', 'youtubeUrlInput', track.youtubeUrl, 'url', true)}
          ${editableInput('Beatport URL', 'beatportUrlInput', track.beatportUrl, 'url', true)}

          <div class="detail-field full">
            <p class="detail-label">Short Description</p>
            <textarea id="shortDescriptionInput" class="admin-edit-textarea">${escapeHtml(track.descriptionShort || '')}</textarea>
          </div>

          <div class="detail-field full">
            <p class="detail-label">Long Description</p>
            <textarea id="longDescriptionInput" class="admin-edit-textarea">${escapeHtml(track.descriptionLong || '')}</textarea>
          </div>
        </div>
      </div>
    `;

    bindEditableChangeListeners();
    bindCoverUpload();
    bindPreviewUpload();
    bindMasterUpload();
    bindGeneratePreview();
  } catch (err) {
    trackModalTitle.textContent = 'Unable to load track';
    trackModalBody.innerHTML = `<p>${escapeHtml(err.message || 'Unable to load track')}</p>`;
    activeTrackForSave = null;
  }
}

function valueOf(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : fallback;
}

function checkedOf(id, fallback) {
  const el = document.getElementById(id);
  return el ? el.checked : fallback;
}

function newValueOf(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

async function createNewTrack() {
  if (!currentSession) {
    setSaveStatus('Session not found.', 'error');
    return;
  }

  const payload = {
    title: newValueOf('newTitleInput'),
    artist: newValueOf('newArtistInput') || 'AMNEUZ',
    collaborators: newValueOf('newCollaboratorsInput'),
    category: newValueOf('newCategoryInput') || 'remixes',
    status: newValueOf('newStatusInput') || 'hidden',
    priceMxn: newValueOf('newPriceInput'),
    subgenre: newValueOf('newSubgenreInput'),
    key: newValueOf('newKeyInput'),
    bpm: newValueOf('newBpmInput'),
    durationLabel: newValueOf('newDurationInput'),
    releaseYear: newValueOf('newReleaseYearInput'),
    releaseDate: newValueOf('newReleaseDateInput'),
    sortOrder: newValueOf('newSortOrderInput'),
    soundcloudUrl: newValueOf('newSoundcloudInput'),
    spotifyUrl: newValueOf('newSpotifyInput'),
    appleMusicUrl: newValueOf('newAppleMusicInput'),
    tidalUrl: newValueOf('newTidalInput'),
    youtubeUrl: newValueOf('newYoutubeInput'),
    beatportUrl: newValueOf('newBeatportInput'),
    descriptionShort: newValueOf('newShortDescriptionInput'),
    descriptionLong: newValueOf('newLongDescriptionInput')
  };

  if (!payload.title) {
    setSaveStatus('Title is required.', 'error');
    return;
  }

  if (!payload.priceMxn || Number(payload.priceMxn) <= 0) {
    setSaveStatus('Price MXN is required.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Creating track and Stripe product...', '');

  saveTrackModalFooter.disabled = true;
  saveTrackModalFooter.textContent = 'Creating...';

  try {
    const response = await fetch('/api/admin-tracks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to create track');
    }

    setSaveStatus('Track created. Stripe product and price linked.', 'ok');

    await loadAdminTracks();

    if (data.track && data.track.id) {
      setTimeout(function() {
        openTrackModal(data.track.id);
      }, 500);
    } else {
      setFooterButtonToClose();
    }
  } catch (err) {
    setSaveStatus(err.message || 'Unable to create track.', 'error');
    saveTrackModalFooter.disabled = false;
    saveTrackModalFooter.textContent = 'Create Track';
    saveTrackModalFooter.dataset.mode = 'create';
  }
}

function albumPayloadFromForm(existingAlbum) {
  return {
    slug: existingAlbum && existingAlbum.slug ? existingAlbum.slug : '',
    title: valueOf('albumTitleInput', existingAlbum ? existingAlbum.title : ''),
    artist: valueOf('albumArtistInput', existingAlbum ? existingAlbum.artist : 'AMNEUZ'),
    collaborators: valueOf('albumCollaboratorsInput', existingAlbum ? existingAlbum.collaborators : ''),
    releaseType: valueOf('albumReleaseTypeInput', existingAlbum ? existingAlbum.releaseType : 'album'),
    status: valueOf('albumStatusInput', existingAlbum ? existingAlbum.status : 'hidden'),
    priceMxn: valueOf('albumPriceInput', existingAlbum ? existingAlbum.priceMxn : ''),
    releaseYear: valueOf('albumReleaseYearInput', existingAlbum ? existingAlbum.releaseYear : ''),
    releaseDate: valueOf('albumReleaseDateInput', existingAlbum ? existingAlbum.releaseDate : ''),
    sortOrder: valueOf('albumSortOrderInput', existingAlbum ? existingAlbum.sortOrder : ''),
    isFeatured: checkedOf('albumFeaturedInput', existingAlbum ? existingAlbum.isFeatured : false),
    isLatestRelease: checkedOf('albumLatestReleaseInput', existingAlbum ? existingAlbum.isLatestRelease : false),
    soundcloudUrl: valueOf('albumSoundcloudInput', existingAlbum ? existingAlbum.soundcloudUrl : ''),
    spotifyUrl: valueOf('albumSpotifyInput', existingAlbum ? existingAlbum.spotifyUrl : ''),
    appleMusicUrl: valueOf('albumAppleMusicInput', existingAlbum ? existingAlbum.appleMusicUrl : ''),
    tidalUrl: valueOf('albumTidalInput', existingAlbum ? existingAlbum.tidalUrl : ''),
    youtubeUrl: valueOf('albumYoutubeInput', existingAlbum ? existingAlbum.youtubeUrl : ''),
    beatportUrl: valueOf('albumBeatportInput', existingAlbum ? existingAlbum.beatportUrl : ''),
    descriptionShort: valueOf('albumShortDescriptionInput', existingAlbum ? existingAlbum.descriptionShort : ''),
    descriptionLong: valueOf('albumLongDescriptionInput', existingAlbum ? existingAlbum.descriptionLong : '')
  };
}

async function createNewAlbum() {
  if (!currentSession) {
    setSaveStatus('Session not found.', 'error');
    return;
  }

  const payload = albumPayloadFromForm(null);

  if (!payload.title) {
    setSaveStatus('Title is required.', 'error');
    return;
  }

  if (!payload.priceMxn || Number(payload.priceMxn) <= 0) {
    setSaveStatus('Price MXN is required.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Creating album and Stripe product...', '');

  saveTrackModalFooter.disabled = true;
  saveTrackModalFooter.textContent = 'Creating...';

  try {
    const response = await fetch('/api/admin-tracks?resource=albums', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to create album');
    }

    setSaveStatus('Album created. Stripe product and price linked.', 'ok');

    await loadAdminAlbums();

    if (data.album && data.album.id) {
      setTimeout(function() {
        openAlbumModal(data.album.id);
      }, 500);
    } else {
      setFooterButtonToClose();
    }
  } catch (err) {
    setSaveStatus(err.message || 'Unable to create album.', 'error');
    saveTrackModalFooter.disabled = false;
    saveTrackModalFooter.textContent = 'Create Album / EP';
    saveTrackModalFooter.dataset.mode = 'create-album';
  }
}

async function saveAlbumChanges() {
  const album = activeAlbumForSave;

  if (!album || !album.id || !currentSession) {
    setSaveStatus('No album loaded.', 'error');
    return;
  }

  const payload = albumPayloadFromForm(album);

  if (!payload.title) {
    setSaveStatus('Title is required.', 'error');
    return;
  }

  if (!payload.priceMxn || Number(payload.priceMxn) <= 0) {
    setSaveStatus('Price MXN is required.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Saving album...', '');

  saveTrackModalFooter.disabled = true;
  saveTrackModalFooter.textContent = 'Saving...';

  try {
    const response = await fetch(`/api/admin-tracks?resource=albums&id=${encodeURIComponent(album.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to save album');
    }

    activeAlbumForSave = data.album;

    setSaveStatus(data.stripePriceChanged ? 'Saved. Stripe price updated.' : 'Saved.', 'ok');
    trackModalTitle.textContent = data.album.displayTitle || data.album.title || 'Album details';
    setFooterButtonToClose();

    await loadAdminAlbums();
  } catch (err) {
    setSaveStatus(err.message || 'Unable to save album.', 'error');
    resetSaveButton();
  }
}

async function saveTrackSafeChanges() {
  if (saveTrackModalFooter.dataset.mode === 'close') {
    closeModal();
    return;
  }

  if (saveTrackModalFooter.dataset.mode === 'create') {
    await createNewTrack();
    return;
  }

  if (saveTrackModalFooter.dataset.mode === 'create-album') {
    await createNewAlbum();
    return;
  }

  if (activeAlbumForSave && activeAlbumForSave.id) {
    await saveAlbumChanges();
    return;
  }

  const track = activeTrackForSave;

  if (!track || !track.id || !currentSession) {
    setSaveStatus('No track loaded.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Saving...', '');

  saveTrackModalFooter.disabled = true;
  saveTrackModalFooter.textContent = 'Saving...';

  const payload = {
    title: valueOf('titleInput', track.title),
    artist: valueOf('artistInput', track.artist),
    collaborators: valueOf('collaboratorsInput', track.collaborators),
    status: valueOf('statusInput', track.status),
    category: valueOf('categoryInput', track.category),
    subgenre: valueOf('subgenreInput', track.subgenre),
    key: valueOf('keyInput', track.key),
    bpm: valueOf('bpmInput', track.bpm),
    durationLabel: valueOf('durationLabelInput', track.durationLabel),
    releaseYear: valueOf('releaseYearInput', track.releaseYear),
    releaseDate: valueOf('releaseDateInput', dateInputValue(track.releaseDate || track.release_date)),
    priceMxn: valueOf('priceMxnInput', track.priceMxn),
    sortOrder: valueOf('sortOrderInput', track.sortOrder),
    isFeatured: checkedOf('isFeaturedInput', track.isFeatured),
    isLatestRelease: checkedOf('isLatestReleaseInput', track.isLatestRelease),
    slug: track.slug,
    soundcloudUrl: valueOf('soundcloudUrlInput', track.soundcloudUrl),
    spotifyUrl: valueOf('spotifyUrlInput', track.spotifyUrl),
    appleMusicUrl: valueOf('appleMusicUrlInput', track.appleMusicUrl),
    tidalUrl: valueOf('tidalUrlInput', track.tidalUrl),
    youtubeUrl: valueOf('youtubeUrlInput', track.youtubeUrl),
    beatportUrl: valueOf('beatportUrlInput', track.beatportUrl),
    descriptionShort: valueOf('shortDescriptionInput', track.descriptionShort),
    descriptionLong: valueOf('longDescriptionInput', track.descriptionLong)
  };

  try {
    const response = await fetch(`/api/admin-track?id=${encodeURIComponent(track.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to save changes');
    }

    activeTrackForSave = data.track;

    setSaveStatus(data.stripePriceChanged ? 'Saved. Stripe price updated.' : 'Saved.', 'ok');
    trackModalTitle.textContent = data.track.displayTitle || data.track.title || 'Track details';
    setFooterButtonToClose();

    await loadAdminTracks();
  } catch (err) {
    setSaveStatus(err.message || 'Unable to save.', 'error');
    resetSaveButton();
  }
}

function bindCoverUpload() {
  const uploadCoverBtn = document.getElementById('uploadCoverBtn');
  const coverFileInput = document.getElementById('coverFileInput');

  if (!uploadCoverBtn || !coverFileInput) {
    return;
  }

  uploadCoverBtn.addEventListener('click', function() {
    coverFileInput.click();
  });

  coverFileInput.addEventListener('change', async function() {
    const file = coverFileInput.files && coverFileInput.files[0];

    if (!file) {
      return;
    }

    await uploadCoverFile(file);
    coverFileInput.value = '';
  });
}

function bindAlbumCoverUpload() {
  const uploadAlbumCoverBtn = document.getElementById('uploadAlbumCoverBtn');
  const albumCoverFileInput = document.getElementById('albumCoverFileInput');

  if (!uploadAlbumCoverBtn || !albumCoverFileInput) {
    return;
  }

  uploadAlbumCoverBtn.addEventListener('click', function() {
    albumCoverFileInput.click();
  });

  albumCoverFileInput.addEventListener('change', async function() {
    const file = albumCoverFileInput.files && albumCoverFileInput.files[0];

    if (!file) {
      return;
    }

    await uploadAlbumCoverFile(file);
    albumCoverFileInput.value = '';
  });
}

function bindPreviewUpload() {
  const uploadPreviewBtn = document.getElementById('uploadPreviewBtn');
  const previewFileInput = document.getElementById('previewFileInput');

  if (!uploadPreviewBtn || !previewFileInput) {
    return;
  }

  uploadPreviewBtn.addEventListener('click', function() {
    previewFileInput.click();
  });

  previewFileInput.addEventListener('change', async function() {
    const file = previewFileInput.files && previewFileInput.files[0];

    if (!file) {
      return;
    }

    await uploadPreviewFile(file);
    previewFileInput.value = '';
  });
}

function bindMasterUpload() {
  const uploadMasterBtn = document.getElementById('uploadMasterBtn');
  const masterFileInput = document.getElementById('masterFileInput');

  if (!uploadMasterBtn || !masterFileInput) {
    return;
  }

  uploadMasterBtn.addEventListener('click', function() {
    masterFileInput.click();
  });

  masterFileInput.addEventListener('change', async function() {
    const file = masterFileInput.files && masterFileInput.files[0];

    if (!file) {
      return;
    }

    await uploadMasterFile(file);
    masterFileInput.value = '';
  });
}

function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();

    reader.onload = function() {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';

      resolve(base64);
    };

    reader.onerror = function() {
      reject(new Error('Unable to read file'));
    };

    reader.readAsDataURL(file);
  });
}

async function uploadAlbumCoverFile(file) {
  const album = activeAlbumForSave;
  const uploadAlbumCoverBtn = document.getElementById('uploadAlbumCoverBtn');

  if (!album || !album.id || !currentSession) {
    setSaveStatus('No album loaded.', 'error');
    return;
  }

  if (!file.type || ['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) {
    setSaveStatus('Album cover must be JPG, PNG, or WEBP.', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setSaveStatus('Album cover file is too large. Max 5MB.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Uploading album cover...', '');

  if (uploadAlbumCoverBtn) {
    uploadAlbumCoverBtn.disabled = true;
    uploadAlbumCoverBtn.textContent = 'Uploading...';
  }

  try {
    const fileBase64 = await fileToBase64(file);

    const response = await fetch('/api/admin-upload-cover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        resource: 'album',
        albumId: album.id,
        fileName: file.name,
        mimeType: file.type,
        fileBase64
      })
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to upload album cover');
    }

    const modalCover = document.getElementById('albumModalCover');

    if (modalCover && data.coverUrl) {
      modalCover.src = data.coverUrl;
    }

    activeAlbumForSave.coverUrl = data.coverUrl;
    activeAlbumForSave.rawCoverUrl = data.coverUrl;

    setSaveStatus('Album cover uploaded.', 'ok');
    setFooterButtonToClose();

    await loadAdminAlbums();
  } catch (err) {
    setSaveStatus(err.message || 'Unable to upload album cover.', 'error');
  } finally {
    if (uploadAlbumCoverBtn) {
      uploadAlbumCoverBtn.disabled = false;
      uploadAlbumCoverBtn.textContent = 'Upload Album Cover';
    }
  }
}

async function uploadCoverFile(file) {
  const track = activeTrackForSave;
  const uploadCoverBtn = document.getElementById('uploadCoverBtn');

  if (!track || !track.id || !currentSession) {
    setSaveStatus('No track loaded.', 'error');
    return;
  }

  if (!file.type || ['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) {
    setSaveStatus('Cover must be JPG, PNG, or WEBP.', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setSaveStatus('Cover file is too large. Max 5MB.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Uploading cover...', '');

  if (uploadCoverBtn) {
    uploadCoverBtn.disabled = true;
    uploadCoverBtn.textContent = 'Uploading...';
  }

  try {
    const fileBase64 = await fileToBase64(file);

    const response = await fetch('/api/admin-upload-cover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        trackId: track.id,
        fileName: file.name,
        mimeType: file.type,
        fileBase64
      })
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to upload cover');
    }

    const modalCover = document.getElementById('trackModalCover');

    if (modalCover && data.coverUrl) {
      modalCover.src = data.coverUrl;
    }

    activeTrackForSave.coverUrl = data.coverUrl;
    activeTrackForSave.rawCoverUrl = data.coverUrl;

    setSaveStatus('Cover uploaded.', 'ok');
    setFooterButtonToClose();

    await loadAdminTracks();
  } catch (err) {
    setSaveStatus(err.message || 'Unable to upload cover.', 'error');
  } finally {
    if (uploadCoverBtn) {
      uploadCoverBtn.disabled = false;
      uploadCoverBtn.textContent = 'Upload Cover';
    }
  }
}

async function uploadPreviewFile(file) {
  const track = activeTrackForSave;
  const uploadPreviewBtn = document.getElementById('uploadPreviewBtn');

  if (!track || !track.id || !currentSession) {
    setSaveStatus('No track loaded.', 'error');
    return;
  }

  const allowedTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg'
  ];

  if (!file.type || allowedTypes.indexOf(file.type) === -1) {
    setSaveStatus('Preview must be MP3, WAV, M4A, AAC, OGG, or WEBM.', 'error');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    setSaveStatus('Preview file is too large. Max 25MB.', 'error');
    return;
  }

  setLastActivity();
  setSaveStatus('Uploading preview...', '');

  if (uploadPreviewBtn) {
    uploadPreviewBtn.disabled = true;
    uploadPreviewBtn.textContent = 'Uploading...';
  }

  try {
    const fileBase64 = await fileToBase64(file);

    const response = await fetch('/api/admin-upload-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        trackId: track.id,
        fileName: file.name,
        mimeType: file.type,
        fileBase64
      })
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to upload preview');
    }

    activeTrackForSave.previewUrl = data.previewUrl;
    activeTrackForSave.rawPreviewUrl = data.previewUrl;

    setSaveStatus('Preview uploaded.', 'ok');
    setFooterButtonToClose();

    await loadAdminTracks();
  } catch (err) {
    setSaveStatus(err.message || 'Unable to upload preview.', 'error');
  } finally {
    if (uploadPreviewBtn) {
      uploadPreviewBtn.disabled = false;
      uploadPreviewBtn.textContent = 'Upload Preview';
    }
  }
}

function getMasterMimeType(file) {
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();

  if (type) {
    return type;
  }

  if (name.endsWith('.wav')) {
    return 'audio/wav';
  }

  if (name.endsWith('.flac')) {
    return 'audio/flac';
  }

  if (name.endsWith('.aif') || name.endsWith('.aiff')) {
    return 'audio/aiff';
  }

  return '';
}

function isAllowedMasterFile(file) {
  const name = String(file.name || '').toLowerCase();
  const type = getMasterMimeType(file);

  const allowedTypes = [
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/flac',
    'audio/aiff',
    'audio/x-aiff',
    'application/octet-stream'
  ];

  const allowedExtension =
    name.endsWith('.wav') ||
    name.endsWith('.flac') ||
    name.endsWith('.aif') ||
    name.endsWith('.aiff');

  return allowedTypes.indexOf(type) > -1 || allowedExtension;
}

async function uploadMasterFile(file) {
  const track = activeTrackForSave;
  const uploadMasterBtn = document.getElementById('uploadMasterBtn');

  if (!track || !track.id || !currentSession) {
    setSaveStatus('No track loaded.', 'error');
    return;
  }

  if (!isAllowedMasterFile(file)) {
    setSaveStatus('Master must be WAV, FLAC, or AIFF.', 'error');
    return;
  }

  if (file.size > 150 * 1024 * 1024) {

  setSaveStatus('Master file is too large. Current bucket limit is 150MB.', 'error');

  return;

}

  setLastActivity();
  setSaveStatus('Preparing secure master upload...', '');

  if (uploadMasterBtn) {
    uploadMasterBtn.disabled = true;
    uploadMasterBtn.textContent = 'Preparing...';
  }

  try {
    const mimeType = getMasterMimeType(file) || 'application/octet-stream';

    const createResponse = await fetch(`/api/admin-track?id=${encodeURIComponent(track.id)}&action=create-master-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        fileName: file.name,
        mimeType,
        fileSize: file.size
      })
    });

    const uploadData = await createResponse.json().catch(function() {
      return {};
    });

    if (!createResponse.ok) {
      throw new Error(uploadData.error || 'Unable to prepare master upload');
    }

    if (!uploadData.path || !uploadData.token) {
      throw new Error('Missing signed upload data');
    }

    setSaveStatus('Uploading master directly to Supabase...', '');

    if (uploadMasterBtn) {
      uploadMasterBtn.textContent = 'Uploading...';
    }

    const { error: uploadError } = await supabaseClient
      .storage
      .from(uploadData.bucket || 'masters')
      .uploadToSignedUrl(uploadData.path, uploadData.token, file, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      throw new Error(uploadError.message || 'Unable to upload master');
    }

    setSaveStatus('Finalizing master upload...', '');

    if (uploadMasterBtn) {
      uploadMasterBtn.textContent = 'Finalizing...';
    }

    const finalizeResponse = await fetch(`/api/admin-track?id=${encodeURIComponent(track.id)}&action=finalize-master-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        path: uploadData.path,
        fileName: file.name
      })
    });

    const finalizeData = await finalizeResponse.json().catch(function() {
      return {};
    });

    if (!finalizeResponse.ok) {
      throw new Error(finalizeData.error || 'Unable to finalize master upload');
    }

    activeTrackForSave.masterPath = finalizeData.masterPath;
    activeTrackForSave.filename = finalizeData.filename;
    updateGeneratePreviewState(activeTrackForSave);

    setSaveStatus('Master uploaded.', 'ok');
    setFooterButtonToClose();

    await loadAdminTracks();
  } catch (err) {
    setSaveStatus(err.message || 'Unable to upload master.', 'error');
  } finally {
    if (uploadMasterBtn) {
      uploadMasterBtn.disabled = false;
      uploadMasterBtn.textContent = 'Upload Master';
    }
  }
}

async function loadAdminTracks() {
  ensureTracksSection();

  const listEl = document.getElementById('tracksList');

  if (listEl) {
    listEl.innerHTML = '<p class="admin-muted">Loading tracks...</p>';
  }

  try {
    const response = await fetch('/api/admin-tracks', {
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`
      }
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load tracks');
    }

    const tracks = Array.isArray(data.tracks) ? data.tracks : [];

    renderStats(tracks);
    renderTracks(tracks);
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = `<p class="admin-muted">Unable to load tracks. ${escapeHtml(err.message || '')}</p>`;
    }
  }
}

async function loadAdminAlbums() {
  ensureAlbumsSection();

  const listEl = document.getElementById('albumsList');

  if (listEl) {
    listEl.innerHTML = '<p class="admin-muted">Loading albums...</p>';
  }

  try {
    const response = await fetch('/api/admin-tracks?resource=albums', {
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`
      }
    });

    const data = await response.json().catch(function() {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load albums');
    }

    const albums = Array.isArray(data.albums) ? data.albums : [];

    renderAlbums(albums);
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = `<p class="admin-muted">Unable to load albums. ${escapeHtml(err.message || '')}</p>`;
    }
  }
}

async function verifyAdmin() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data || !data.session) {
    window.location.replace('/admin/');
    return;
  }

  currentSession = data.session;

  const lastActivity = getLastActivity();

  if (lastActivity && Date.now() - lastActivity >= SESSION_TIMEOUT_MS) {
    await logout('admin.logout.timeout');
    return;
  }

  setLastActivity();

  const response = await fetch('/api/admin-test', {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`
    }
  });

  if (!response.ok) {
    await logout(null);
    return;
  }

  const result = await response.json().catch(function() {
    return {};
  });

  greetingTitle.textContent = `${getGreeting()}, AMNEUZ.`;
  statusEl.textContent = `Verified admin: ${result.email || 'admin'}`;
  substatusEl.textContent = 'Session expires after 30 minutes of inactivity.';

  registerActivityListeners();
  scheduleSessionCheck();

  ensureCatalogTabs();

  await loadAdminTracks();
  await loadAdminAlbums();

  setActiveCatalogTab(getSavedCatalogTab());

  const refreshTracksBtn = document.getElementById('refreshTracksBtn');

  if (refreshTracksBtn) {
    refreshTracksBtn.addEventListener('click', function() {
      setLastActivity();
      loadAdminTracks();
    });
  }

  const newTrackBtn = document.getElementById('newTrackBtn');

  if (newTrackBtn) {
    newTrackBtn.addEventListener('click', function() {
      openNewTrackModal();
    });
  }

  const refreshAlbumsBtn = document.getElementById('refreshAlbumsBtn');

  if (refreshAlbumsBtn) {
    refreshAlbumsBtn.addEventListener('click', function() {
      setLastActivity();
      loadAdminAlbums();
    });
  }

  const newAlbumBtn = document.getElementById('newAlbumBtn');

  if (newAlbumBtn) {
    newAlbumBtn.addEventListener('click', function() {
      openNewAlbumModal();
    });
  }
}

logoutBtn.addEventListener('click', async function(event) {
  event.preventDefault();
  await logout('admin.logout.manual');
});

closeTrackModal.addEventListener('click', closeModal);
saveTrackModalFooter.addEventListener('click', saveTrackSafeChanges);

trackModal.addEventListener('click', function(event) {
  if (event.target === trackModal) {
    closeModal();
  }
});

document.addEventListener('keydown', function(event) {
  const previewOverlay = document.getElementById('previewBuilderOverlay');

  if (previewOverlay && previewOverlay.classList.contains('open')) {
    return;
  }

  if (event.key === 'Escape' && trackModal.classList.contains('show')) {
    closeModal();
  }
});

window.addEventListener('resize', function() {
  const previewOverlay = document.getElementById('previewBuilderOverlay');

  if (previewOverlay && previewOverlay.classList.contains('open') && previewBuilderState && previewBuilderState.audioBuffer) {
    drawPreviewBuilderWaveform();
  }
});

verifyAdmin();
