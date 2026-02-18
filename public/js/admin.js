document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginMsg = document.getElementById('loginMsg');
  const loginCard = document.getElementById('loginCard');
  const dashboard = document.getElementById('dashboard');
  const logoutBtn = document.getElementById('logoutBtn');
  const reportsTable = document.querySelector('#reportsTable tbody');

  function showLoginError(t) { loginMsg.innerHTML = `<div class="alert alert-danger">${t}</div>`; }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMsg.textContent = '';
    const fd = new FormData(loginForm);
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }) });
      const j = await r.json();
      if (!r.ok) return showLoginError(j.error || 'Login failed');
      localStorage.setItem('udaan_token', j.token);
      loginCard.classList.add('d-none');
      dashboard.classList.remove('d-none');
      loadReports();
    } catch (err) { showLoginError(err.message); }
  });

  // If token exists on load, try to use it and show dashboard
  (async function tryResumeSession(){
    const token = localStorage.getItem('udaan_token');
    if (!token) return;
    // attempt to load reports and show dashboard
    loginCard.classList.add('d-none');
    dashboard.classList.remove('d-none');
    try {
      await loadReports();
    } catch (e) {
      // If loading fails, clear token and show login
      localStorage.removeItem('udaan_token');
      loginCard.classList.remove('d-none');
      dashboard.classList.add('d-none');
      showLoginError('Session expired — please login again');
    }
  })();

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('udaan_token');
      loginCard.classList.remove('d-none');
      dashboard.classList.add('d-none');
      loginMsg.innerHTML = '<div class="alert alert-info">Logged out</div>';
    });
  }

  async function loadReports() {
    const token = localStorage.getItem('udaan_token');
    if (!token) return;
    const res = await fetch('/api/admin/reports', { headers: { Authorization: 'Bearer ' + token }});
    if (!res.ok) { showLoginError('Session expired or unauthorized'); return; }
    const j = await res.json();
    reportsTable.innerHTML = '';
    j.reports.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td><a href="${r.image_path}" target="_blank"><img src="${r.image_path}" style="height:80px;object-fit:cover;border-radius:4px"></a></td>
        <td><strong>${r.name || '—'}</strong><br>${r.phone || '—'}<br>Severity: ${r.severity}</td>
        <td>${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}</td>
        <td>${r.created_at}</td>
        <td>
          ${r.verified ? '<span class="badge bg-success">Verified</span>' : `<button class="btn btn-sm btn-success verifyBtn" data-id="${r.id}">Verify</button>`}
          <button class="btn btn-sm btn-danger ms-1 deleteBtn" data-id="${r.id}">Delete</button>
        </td>
      `;
      reportsTable.appendChild(tr);
    });

    document.querySelectorAll('.verifyBtn').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const token = localStorage.getItem('udaan_token');
      await fetch(`/api/admin/verify/${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      loadReports();
    }));

    document.querySelectorAll('.deleteBtn').forEach(b => b.addEventListener('click', async (e) => {
      if (!confirm('Delete this report?')) return;
      const id = e.currentTarget.dataset.id;
      const token = localStorage.getItem('udaan_token');
      await fetch(`/api/admin/report/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      loadReports();
    }));
  }
});
