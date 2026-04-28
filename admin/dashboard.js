const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZHJoZ3F6cWF4ZmFva3Z4cWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTUyNzcsImV4cCI6MjA5MjY3MTI3N30.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusEl = document.getElementById('status');

const logoutBtn = document.getElementById('logoutBtn');

const SESSION_TIMEOUT_MS = 60 * 1000;

const ACTIVITY_KEY = 'amneuz_admin_last_activity';

let timeoutId = null;

function setLastActivity() {

  window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));

}

function getLastActivity() {

  const value = Number(window.localStorage.getItem(ACTIVITY_KEY) || '0');

  return Number.isFinite(value) ? value : 0;

}

async function logout() {

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

      await logout();

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

async function verifyAdmin() {

  const { data } = await supabaseClient.auth.getSession();

  if (!data || !data.session) {

    window.location.replace('./');

    return;

  }

  const lastActivity = getLastActivity();

  if (lastActivity && Date.now() - lastActivity >= SESSION_TIMEOUT_MS) {

    await logout();

    return;

  }

  setLastActivity();

  const response = await fetch('/api/admin-test', {

    headers: {

      Authorization: `Bearer ${data.session.access_token}`

    }

  });

  if (!response.ok) {

    await logout();

    return;

  }

  const result = await response.json().catch(function() {

    return {};

  });

  statusEl.textContent = `Verified admin: ${result.email || 'admin'}`;

  registerActivityListeners();

  scheduleSessionCheck();

}

logoutBtn.addEventListener('click', async function(event) {

  event.preventDefault();

  await logout();

});

verifyAdmin();