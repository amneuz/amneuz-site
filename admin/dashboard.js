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
const closeTrackModalFooter = document.getElementById('closeTrackModalFooter');

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_KEY = 'amneuz_admin_last_activity';

let timeoutId = null;
let currentSession = null;
let activeTrackId = null;
let activeTrack = null;
let saveTrackBtn = null;

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

function ensureSaveButton() {
  if (saveTrackBtn) {
    return saveTrackBtn;
  }

  const footer = document.querySelector('.modal-footer');

  saveTrackBtn = document.createElement('button');
  saveTrackBtn.id = 'saveTrackBtn';
  saveTrackBtn.type = 'button';
  saveTrackBtn.textContent = 'Save Changes';
  saveTrackBtn.style.background = '#f4f4f4';
  saveTrackBtn.style.color = '#050505';

  footer.insertBefore(saveTrackBtn, closeTrackModalFooter);

  saveTrackBtn.addEventListener('click', saveActiveTrack);

  return saveTrackBtn;
}

function addFormStyles() {
  if (document.getElementById('adminFormStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'adminFormStyles';
  style.textContent = `
    .admin-form-grid {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 24px;
    }

    .admin-form-cover {
      width: 180px;
      height: 180px;
      border-radius: 24px;
      object-fit: cover;
      background: rgba(255,255,255,.08);
    }

    .admin-form-note {
      margin-top: 18px;
      padding: 14px;
      border: 1px solid rgba(92,121,255,.24);
      border-radius: 16px;
      background: rgba(49,69,180,.08);
      color: rgba(226,232,255,.76);
      font-size: .9rem;
      line-height: 1.5;
    }

    .admin-fields {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 14px;
    }

    .admin-field {
      display: grid;
      gap: 7px;
    }

    .admin-field.full {
      grid-column: 1 / -1;
    }

    .admin-field label {
      color: rgba(255,255,255,.44);
      font-size: .68rem;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .admin-field input,
    .admin-field select,
    .admin-field textarea {
      width: 100%;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      background: rgba(255,255,255,.045);
      color: #fff;
      padding: 13px 14px;
      font: inherit;
      outline: none;
    }

    .admin-field textarea {
      min-height: 92px;
      resize: vertical;
    }

    .admin-field input:focus,
    .admin-field select:focus,
    .admin-field textarea:focus {
      border-color: rgba(92,121,255,.55);
      box-shadow: 0 0 0 3px rgba(92,121,255,.12);
    }

    .admin-field input[disabled] {
      opacity: .55;
      cursor: not-allowed;
    }

    .admin-checkboxes {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .admin-check {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      padding: 10px 13px;
      background: rgba(255,255,255,.035);
      color: rgba(255,255,255,.78);
      font-size: .82rem;
    }

    .admin-check input {
      width: auto;
    }

    .admin-save-status {
      grid-column: 1 / -1;
      min-height: 20px;
      color: #9fe6b8;
      font-size: .9rem;
    }

    .admin-save-status.error {
      color: #ff9f9f;
    }

    @media(max-width:760px) {
      .admin-form-grid {
        grid-template-columns: 1fr;
      }

      .admin-form-cover {
        width: 100%;
        height: auto;
        aspect-ratio: 1;
      }

      .admin-fields {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
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

function formInput(label, name, value, type, full, disabled) {
  return `
    <div class="admin-field ${full ? 'full' : ''}">
      <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(name)}"
        name="${escapeHtml(name)}"
        type="${escapeHtml(type || 'text')}"
        value="${escapeHtml(value || '')}"
        ${disabled ? 'disabled' : ''}
      >
    </div>
  `;
}

function formTextarea(label, name, value, full) {
  return `
    <div class="admin-field ${full ? 'full' : ''}">
      <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
      <textarea id="${escapeHtml(name)}" name="${escapeHtml(name)}">${escapeHtml(value || '')}</textarea>
    </div>
  `;
}

function formSelect(label, name, value, options) {
  return `
    <div class="admin-field">
      <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
      <select id="${escapeHtml(name)}" name="${escapeHtml(name)}">
        ${options.map(function(option) {
          return `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
        }).join('')}
      </select>
    </div>
  `;
}

function formCheckbox(label, name, checked) {
  return `
    <label class="admin-check">
      <input type="checkbox" name="${escapeHtml(name)}" ${checked ? 'checked' : ''}>
      ${escapeHtml(label)}
    </label>
  `;
}

function openModal() {
  ensureSaveButton();
  trackModal.classList.add('show');
  trackModal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  trackModal.classList.remove('show');
  trackModal.setAttribute('aria-hidden', 'true');
  trackModalTitle.textContent = 'Loading track...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
  activeTrackId = null;
  activeTrack = null;

  if (saveTrackBtn) {
    saveTrackBtn.disabled = false;
    saveTrackBtn.textContent = 'Save Changes';
  }
}

async function openTrackModal(trackId) {
  if (!trackId || !currentSession) return;

  addFormStyles();
  setLastActivity();

  activeTrackId = trackId;
  activeTrack = null;

  trackModalTitle.textContent = 'Loading track...';
  trackModalBody.innerHTML = '<p>Loading...</p>';
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
    activeTrack = track;

    trackModalTitle.textContent = track.displayTitle || track.title || 'Edit Track';

    trackModalBody.innerHTML = `
      <form id="trackEditForm" class="admin-form-grid">
        <div>
          <img class="admin-form-cover" src="${escapeHtml(track.coverUrl || '')}" alt="${escapeHtml(track.displayTitle || track.title || 'Track cover')}">

          <div class="admin-form-note">
            Editing safe catalog fields only. Stripe IDs, master paths and files stay locked for now.
          </div>
        </div>

        <div class="admin-fields">
          ${formInput('Catalog Code', 'catalogCode', track.catalogCode, 'text', false, true)}
          ${formInput('Legacy ID', 'legacyId', track.legacyId, 'text', false, true)}

          ${formInput('Title', 'title', track.title, 'text')}
          ${formInput('Artist', 'artist', track.artist, 'text')}

          ${formInput('Collaborators', 'collaborators', track.collaborators, 'text')}
          ${formSelect('Status', 'status', track.status, [
            { value: 'visible', label: 'Visible' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'upcoming', label: 'Upcoming' }
          ])}

          ${formSelect('Category', 'category', track.category, [
            { value: 'remixes', label: 'Remixes' },
            { value: 'originals', label: 'Originals' },
            { value: 'album', label: 'Album' }
          ])}
          ${formInput('Subgenre', 'subgenre', track.subgenre, 'text')}

          ${formInput('Key', 'key', track.key, 'text')}
          ${formInput('BPM', 'bpm', track.bpm, 'number')}

          ${formInput('Duration', 'durationLabel', track.durationLabel, 'text')}
          ${formInput('Release Year', 'releaseYear', track.releaseYear, 'number')}

          ${formInput('Price MXN', 'priceMxn', track.priceMxn, 'number')}
          ${formInput('Sort Order', 'sortOrder', track.sortOrder, 'number')}

          <div class="admin-checkboxes">
            ${formCheckbox('Featured', 'isFeatured', track.isFeatured)}
            ${formCheckbox('Latest Release', 'isLatestRelease', track.isLatestRelease)}
          </div>

          ${formInput('Slug', 'slug', track.slug, 'text', true)}

          ${formInput('SoundCloud URL', 'soundcloudUrl', track.soundcloudUrl, 'url', true)}
          ${formInput('Spotify URL', 'spotifyUrl', track.spotifyUrl, 'url', true)}
          ${formInput('Apple Music URL', 'appleMusicUrl', track.appleMusicUrl, 'url', true)}
          ${formInput('Tidal URL', 'tidalUrl', track.tidalUrl, 'url', true)}
          ${formInput('YouTube URL', 'youtubeUrl', track.youtubeUrl, 'url', true)}
          ${formInput('Beatport URL', 'beatportUrl', track.beatportUrl, 'url', true)}

          ${formTextarea('Short Description', 'descriptionShort', track.descriptionShort, true)}
          ${formTextarea('Long Description', 'descriptionLong', track.descriptionLong, true)}

          ${formInput('Stripe Price ID', 'stripePriceId', track.stripePriceId, 'text', true, true)}
          ${formInput('Master Path', 'masterPath', track.masterPath, 'text', true, true)}
          ${formInput('Filename', 'filename', track.filename, 'text', true, true)}
          ${formInput('Cover URL', 'rawCoverUrl', track.rawCoverUrl || track.coverUrl, 'text', true, true)}
          ${formInput('Preview URL', 'rawPreviewUrl', track.rawPreviewUrl || track.previewUrl, 'text', true, true)}

          <div class="admin-save-status" id="trackSaveStatus"></div>
        </div>
      </form>
    `;
  } catch (err) {
    trackModalTitle.textContent = 'Unable to load track';
    trackModalBody.innerHTML = `<p>${escapeHtml(err.message || 'Unable to load track')}</p>`;
  }
}

function getFormValue(form, name) {
  const field = form.elements[name];

  if (!field) {
    return '';
  }

  return field.value;
}

function getFormChecked(form, name) {
  const field = form.elements[name];
  return !!(field && field.checked);
}

async function saveActiveTrack() {
  if (!activeTrackId || !currentSession) {
    return;
  }

  const form = document.getElementById('trackEditForm');
  const saveStatus = document.getElementById('trackSaveStatus');

  if (!form) {
    return;
  }

  setLastActivity();

  if (saveStatus) {
    saveStatus.className = 'admin-save-status';
    saveStatus.textContent = 'Saving changes...';
  }

  saveTrackBtn.disabled = true;
  saveTrackBtn.textContent = 'Saving...';

  const payload = {
    title: getFormValue(form, 'title'),
    artist: getFormValue(form, 'artist'),
    collaborators: getFormValue(form, 'collaborators'),
    status: getFormValue(form, 'status'),
    category: getFormValue(form, 'category'),
    subgenre: getFormValue(form, 'subgenre'),
    key: getFormValue(form, 'key'),
    bpm: getFormValue(form, 'bpm'),
    durationLabel: getFormValue(form, 'durationLabel'),
    releaseYear: getFormValue(form, 'releaseYear'),
    priceMxn: getFormValue(form, 'priceMxn'),
    sortOrder: getFormValue(form, 'sortOrder'),
    isFeatured: getFormChecked(form, 'isFeatured'),
    isLatestRelease: getFormChecked(form, 'isLatestRelease'),
    slug: getFormValue(form, 'slug'),
    soundcloudUrl: getFormValue(form, 'soundcloudUrl'),
    spotifyUrl: getFormValue(form, 'spotifyUrl'),
    appleMusicUrl: getFormValue(form, 'appleMusicUrl'),
    tidalUrl: getFormValue(form, 'tidalUrl'),
    youtubeUrl: getFormValue(form, 'youtubeUrl'),
    beatportUrl: getFormValue(form, 'beatportUrl'),
    descriptionShort: getFormValue(form, 'descriptionShort'),
    descriptionLong: getFormValue(form, 'descriptionLong')
  };

  try {
    const response = await fetch(`/api/admin-track?id=${encodeURIComponent(activeTrackId)}`, {
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
      throw new Error(data.error || 'Unable to save track');
    }

    activeTrack = data.track;

    if (saveStatus) {
      saveStatus.className = 'admin-save-status';
      saveStatus.textContent = 'Changes saved successfully.';
    }

    trackModalTitle.textContent = data.track.displayTitle || data.track.title || 'Edit Track';

    await loadAdminTracks();
  } catch (err) {
    if (saveStatus) {
      saveStatus.className = 'admin-save-status error';
      saveStatus.textContent = err.message || 'Unable to save track.';
    }
  } finally {
    saveTrackBtn.disabled = false;
    saveTrackBtn.textContent = 'Save Changes';
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
closeTrackModalFooter.addEventListener('click', closeModal);

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