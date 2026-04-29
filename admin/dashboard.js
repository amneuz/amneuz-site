const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZHJoZ3F6cWFva3Z4cWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTUyNzcsImV4cCI6MjA5MjY3MTI3N30.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

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

let timeoutId = null;
let currentSession = null;
let activeTrackForSave = null;

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
  window.location.replace('./');
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

function ensureTracksSection() {
  let section = document.getElementById('tracksSection');

  if (section) {
    return section;
  }

  const main = document.querySelector('main') || document.body;

  section = document.createElement('section');
  section.id = 'tracksSection';
  section.className = 'admin-tracks-section';
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

  const style = document.createElement('style');
  style.textContent = `
    .admin-tracks-section {
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

    .admin-tracks-list {
      display: grid;
      gap: 14px;
    }

    .admin-track-card {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: 16px;
      align-items: center;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 22px;
      background: rgba(0,0,0,.24);
      padding: 14px;
    }

    .admin-track-cover {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      object-fit: cover;
      background: rgba(255,255,255,.08);
    }

    .admin-track-title {
      margin: 0;
      color: #fff;
      font-size: 1.14rem;
      letter-spacing: -.02em;
    }

    .admin-track-meta {
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

    .admin-track-side {
      min-width: 128px;
      text-align: right;
    }

    .admin-track-price {
      margin: 0;
      color: #fff;
      font-weight: 700;
      font-size: 1.05rem;
    }

    .admin-track-code {
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
      .admin-section-header {
        flex-direction: column;
      }

      .admin-header-actions {
        justify-content: flex-start;
      }

      .admin-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .admin-track-card {
        grid-template-columns: 64px 1fr;
      }

      .admin-track-cover {
        width: 64px;
        height: 64px;
      }

      .admin-track-side {
        grid-column: 1 / -1;
        text-align: left;
      }

      .admin-track-actions {
        justify-content: flex-start;
      }

      .new-track-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);

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
  trackModal.classList.remove('show');
  trackModal.setAttribute('aria-hidden', 'true');
  trackModalTitle.textContent = 'Loading track...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
  activeTrackForSave = null;
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

async function openTrackModal(trackId) {
  if (!trackId || !currentSession) return;

  setLastActivity();

  trackModalTitle.textContent = 'Loading track...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
  activeTrackForSave = null;
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
        </div>

        <div class="track-detail-fields">
          ${detailField('Catalog Code', track.catalogCode)}
          ${detailField('Legacy ID', track.legacyId)}
          ${detailField('Title', track.title)}
          ${detailField('Artist', track.artist)}
          ${detailField('Collaborators', track.collaborators)}

          ${editableSelect('Status', 'statusInput', track.status, [
            { value: 'visible', label: 'Visible' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'upcoming', label: 'Upcoming' }
          ])}

          ${detailField('Category', track.category)}
          ${editableInput('Subgenre', 'subgenreInput', track.subgenre, 'text')}
          ${editableInput('Key', 'keyInput', track.key, 'text')}
          ${editableInput('BPM', 'bpmInput', track.bpm, 'text')}
          ${editableInput('Duration', 'durationLabelInput', track.durationLabel, 'text')}
          ${detailField('Release Year', track.releaseYear)}
          ${editableInput('Price MXN', 'priceMxnInput', track.priceMxn, 'number')}
          ${detailField('Sort Order', track.sortOrder)}

          <div class="detail-field full">
            <p class="detail-label">Display Flags</p>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              ${editableCheckbox('Featured', 'isFeaturedInput', track.isFeatured)}
              ${editableCheckbox('Latest Release', 'isLatestReleaseInput', track.isLatestRelease)}
            </div>
          </div>

          ${detailField('Stripe Price ID', track.stripePriceId, true)}
          ${detailField('Master Path', track.masterPath, true)}
          ${detailField('Filename', track.filename, true)}
          ${detailField('Cover URL', track.rawCoverUrl || track.coverUrl, true)}
          ${detailField('Preview URL', track.rawPreviewUrl || track.previewUrl, true)}

          ${editableInput('SoundCloud URL', 'soundcloudUrlInput', track.soundcloudUrl, 'url', true)}
          ${detailField('Spotify', track.spotifyUrl, true)}
          ${detailField('Apple Music', track.appleMusicUrl, true)}
          ${detailField('Tidal', track.tidalUrl, true)}
          ${editableInput('YouTube URL', 'youtubeUrlInput', track.youtubeUrl, 'url', true)}
          ${detailField('Beatport', track.beatportUrl, true)}

          <div class="detail-field full">
            <p class="detail-label">Short Description</p>
            <textarea id="shortDescriptionInput" class="admin-edit-textarea">${escapeHtml(track.descriptionShort || '')}</textarea>
          </div>

          ${detailField('Long Description', track.descriptionLong, true)}
        </div>
      </div>
    `;

    bindEditableChangeListeners();
    bindCoverUpload();
    bindPreviewUpload();
    bindMasterUpload();
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

async function saveTrackSafeChanges() {
  if (saveTrackModalFooter.dataset.mode === 'close') {
    closeModal();
    return;
  }

  if (saveTrackModalFooter.dataset.mode === 'create') {
    await createNewTrack();
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
    title: track.title,
    artist: track.artist,
    collaborators: track.collaborators,
    status: valueOf('statusInput', track.status),
    category: track.category,
    subgenre: valueOf('subgenreInput', track.subgenre),
    key: valueOf('keyInput', track.key),
    bpm: valueOf('bpmInput', track.bpm),
    durationLabel: valueOf('durationLabelInput', track.durationLabel),
    releaseYear: track.releaseYear,
    priceMxn: valueOf('priceMxnInput', track.priceMxn),
    sortOrder: track.sortOrder,
    isFeatured: checkedOf('isFeaturedInput', track.isFeatured),
    isLatestRelease: checkedOf('isLatestReleaseInput', track.isLatestRelease),
    slug: track.slug,
    soundcloudUrl: valueOf('soundcloudUrlInput', track.soundcloudUrl),
    spotifyUrl: track.spotifyUrl,
    appleMusicUrl: track.appleMusicUrl,
    tidalUrl: track.tidalUrl,
    youtubeUrl: valueOf('youtubeUrlInput', track.youtubeUrl),
    beatportUrl: track.beatportUrl,
    descriptionShort: valueOf('shortDescriptionInput', track.descriptionShort),
    descriptionLong: track.descriptionLong
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

    setSaveStatus('Saved.', 'ok');
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

  if (file.size > 50 * 1024 * 1024) {
    setSaveStatus('Master file is too large. Current bucket limit is 50MB.', 'error');
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

async function verifyAdmin() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data || !data.session) {
    window.location.replace('./');
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

  await loadAdminTracks();

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
  if (event.key === 'Escape' && trackModal.classList.contains('show')) {
    closeModal();
  }
});

verifyAdmin();