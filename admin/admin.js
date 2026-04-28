const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZHJoZ3F6cWF4ZmFva3Z4cWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTUyNzcsImV4cCI6MjA5MjY3MTI3N30.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const statusEl = document.getElementById('status');

let supabaseClient = null;

function setStatus(message, type) {
  statusEl.textContent = message || '';
  statusEl.className = type ? `status ${type}` : 'status';
}

function initSupabase() {
  if (!window.supabase || !window.supabase.createClient) {
    setStatus('Login service is not available. Refresh and try again.', 'error');
    return false;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

async function testAdminAccess(session) {
  const response = await fetch('/api/admin-test', {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (!response.ok) {
    throw new Error('Admin access could not be verified.');
  }

  return response.json();
}

async function checkExistingSession() {
  if (!supabaseClient) {
    return;
  }

  const { data } = await supabaseClient.auth.getSession();

  if (!data || !data.session) {
    return;
  }

  try {
    await testAdminAccess(data.session);
    setStatus('Admin session active. Redirecting...', 'ok');
    window.location.href = './dashboard.html';
  } catch (err) {
    await supabaseClient.auth.signOut();
    setStatus('', '');
  }
}

loginForm.addEventListener('submit', async function(event) {
  event.preventDefault();

  if (!supabaseClient) {
    setStatus('Login service is not ready. Refresh and try again.', 'error');
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setStatus('Enter your email and password.', 'error');
    return;
  }

  loginBtn.disabled = true;
  setStatus('Checking access...', '');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data || !data.session) {
      throw new Error('Unable to log in. Check your credentials.');
    }

    await testAdminAccess(data.session);

    setStatus('Access confirmed. Redirecting...', 'ok');
    window.location.href = './dashboard.html';
  } catch (err) {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }

    passwordInput.value = '';
    setStatus('Unable to log in. Check your credentials.', 'error');
  } finally {
    loginBtn.disabled = false;
  }
});

if (initSupabase()) {
  checkExistingSession();
}