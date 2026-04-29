const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZHJoZ3F6cWF4ZmFva3Z4cWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTUyNzcsImV4cCI6MjA5MjY3MTI3N30.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

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
      <button class="admin-secondary-btn" type="button" id="refreshTracksBtn">Refresh</button>
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

    @media (max-width: 760px) {
      .admin-section-header {
        flex-direction: column;
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
      track.masterPath ? '<span class="admin-tag">Master linked</span>' : '<span class="admin-tag hidden">No master</span>'
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
          <img class="track-detail-cover" src="${escapeHtml(track.coverUrl || '')}" alt="${escapeHtml(track.displayTitle || track.title || 'Track cover')}">
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
          ${detailField('Price', money(track.priceMxn))}
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

async function saveTrackSafeChanges() {
  if (saveTrackModalFooter.dataset.mode === 'close') {
    closeModal();
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
    priceMxn: track.priceMxn,
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