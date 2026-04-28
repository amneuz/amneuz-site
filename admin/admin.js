const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZHJoZ3F6cWF4ZmFva3Z4cWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTUyNzcsImV4cCI6MjA5MjY3MTI3N30.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const statusEl = document.getElementById('status');

function setStatus(message, type) {
  statusEl.textContent = message || '';
  statusEl.className = type ? `status ${type}` : 'status';
}

async function testAdminAccess(session) {
  const response = await fetch('/api/admin-test', {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  const data = await response.json().catch(function() {
    return {};
  });

  if (!response.ok) {
    throw new Error(data.error || 'Admin verification failed');
  }

  return data;
}

async function checkExistingSession() {
  const { data } = await supabase.auth.getSession();

  if (!data || !data.session) {
    return;
  }

  try {
    await testAdminAccess(data.session);
    setStatus('Admin session active. Redirecting...', 'ok');
    window.location.href = './dashboard.html';
  } catch (err) {
    await supabase.auth.signOut();
    setStatus('', '');
  }
}

loginForm.addEventListener('submit', async function(event) {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setStatus('Enter your email and password.', 'error');
    return;
  }

  loginBtn.disabled = true;
  setStatus('Checking access...', '');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data || !data.session) {
      throw new Error(error ? error.message : 'Unable to log in');
    }

    await testAdminAccess(data.session);

    setStatus('Access confirmed. Redirecting...', 'ok');
    window.location.href = './dashboard.html';
  } catch (err) {
    await supabase.auth.signOut();
    setStatus(err.message || 'Unable to log in', 'error');
  } finally {
    loginBtn.disabled = false;
  }
});

checkExistingSession();