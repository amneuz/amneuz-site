const SUPABASE_URL = 'https://lydrhgqzqaxfaokvxqhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZHJoZ3F6cWF4ZmFva3Z4cWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwOTUyNzcsImV4cCI6MjA5MjY3MTI3N30.Tjx1Oqke6FHvd2wKa-PehA_RVkHiY9r2LNeb1SlaC1I';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const statusEl = document.getElementById('status');
const logoutBtn = document.getElementById('logoutBtn');

async function verifyAdmin() {
  const { data } = await supabase.auth.getSession();

  if (!data || !data.session) {
    window.location.href = './';
    return;
  }

  const response = await fetch('/api/admin-test', {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`
    }
  });

  const result = await response.json().catch(function() {
    return {};
  });

  if (!response.ok) {
    await supabase.auth.signOut();
    window.location.href = './';
    return;
  }

  statusEl.textContent = `Verified admin: ${result.email}`;
}

logoutBtn.addEventListener('click', async function() {
  await supabase.auth.signOut();
  window.location.href = './';
});

verifyAdmin();