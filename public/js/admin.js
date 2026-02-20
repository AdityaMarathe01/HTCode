document.addEventListener('DOMContentLoaded', () => {

  // Redirect to login if not authenticated
  const dashboard = document.getElementById('dashboard');
  const logoutBtn = document.getElementById('logoutBtn');
  const reportsTable = document.querySelector('#reportsTable tbody');
  const token = localStorage.getItem('admin_jwt');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('admin_jwt');
      window.location.href = '/login.html';
    });
  }

  // Initialize UI: show admin name and load reports immediately
  try { showAdminNameFromToken(token); } catch (e) { /* ignore */ }
  // kick off loading reports
  loadReports();

  function showAdminNameFromToken(token) {
    // simple JWT payload extraction without verification (UI only)
    try {
      const parts = token.split('.');
      if (parts.length < 2) return;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const name = payload.username || payload.sub || 'Admin';
      document.getElementById('adminName').textContent = name;
      document.getElementById('adminGreeting').style.display = 'block';
    } catch (e) { /* ignore */ }
  }

  async function loadReports() {
    const token = localStorage.getItem('admin_jwt');
    if (!token) return;
    const res = await fetch('/api/admin/reports', { headers: { Authorization: 'Bearer ' + token }});
    if (!res.ok) {
      reportsTable.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#d32f2f;font-weight:600;">Failed to load reports. Please check your login or server.</td></tr>';
      return;
    }
    const j = await res.json();
    // Remove any existing filter/bulk UI to avoid duplicates
    const prevFilter = document.getElementById('severityFilter');
    if (!prevFilter) {
      let filterHtml = `
        <div class="d-flex mb-2 align-items-center gap-2">
          <label class="fw-bold">Filter by Severity:</label>
          <select id="severityFilter" class="form-select form-select-sm" style="width:auto;">
            <option value="">All</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
          <button id="bulkVerify" class="btn btn-success btn-sm ms-2">Verify Selected</button>
          <button id="bulkDelete" class="btn btn-outline-primary btn-sm ms-1">Delete Selected</button>
        </div>
      `;
      reportsTable.parentElement.insertAdjacentHTML('beforebegin', filterHtml);
    }
    // Render rows
    let filtered = j.reports;
    const renderRows = (rows) => {
      reportsTable.innerHTML = '';
      if (!rows || rows.length === 0) {
        reportsTable.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#1976d2;font-weight:600;">No reports found.</td></tr>';
        return;
      }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        // Support multiple images per report (comma-separated image_path)
        let images = [];
        if (r.image_path && r.image_path.includes(',')) {
          images = r.image_path.split(',').map(s => s.trim());
        } else if (r.image_path) {
          images = [r.image_path];
        }
        let imagesHtml = images.map(img => `<a href="${img}" target="_blank"><img src="${img}" class="report-image" style="margin-right:8px;"></a>`).join('');
        // Format date/time in IST with label
        let dt = new Date(r.created_at + 'Z');
        let ist = new Date(dt.getTime() + (5.5 * 60 * 60 * 1000));
        let dateStr = ist.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' });
        let timeStr = ist.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
        let whenHtml = `<span class='fw-bold'>Date:</span> ${dateStr}<br><span class='fw-bold'>Time (IST):</span> ${timeStr}`;
        // Severity color: 'high' is red, 'moderate' is yellow, 'low' is blue
        let sevColor = r.severity === 'high' ? 'bg-danger text-white' : (r.severity === 'moderate' ? 'bg-warning text-dark' : 'bg-primary text-white');
                tr.innerHTML = `
                  <td><input type="checkbox" class="rowCheck" data-id="${r.id}"></td>
                  <td>${r.id}</td>
                  <td style="white-space:nowrap;">${imagesHtml}</td>
                  <td><strong>${r.name || '—'}</strong><br>${r.phone || '—'}<br><span class="badge ${sevColor}">${r.severity.charAt(0).toUpperCase() + r.severity.slice(1)}</span></td>
                  <td>
                    <span class="text-primary"><span class='fw-bold'>Lat:</span> ${r.latitude.toFixed(5)}<br><span class='fw-bold'>Long:</span> ${r.longitude.toFixed(5)}</span>
                    <br><span class="text-muted small" id="addr-${r.id}">${r.address || '—'}</span>
                  </td>
                  <td>${whenHtml}</td>
                  <td>
                    <div class="table-actions">
                      ${r.verified ? `<span class="btn-verified" title="Verified"><small>Verified</small></span>` : `<button class="verifyBtn" data-id="${r.id}">Verify</button>`}
                      <button class="deleteBtn" data-id="${r.id}">Delete</button>
                    </div>
                  </td>
                `;
        reportsTable.appendChild(tr);
        // Display address from backend (already geocoded)
        // If you want to split city/district/state, parse rep.address here
        const addrEl = document.getElementById(`addr-${r.id}`);
        if (addrEl) {
          addrEl.textContent = r.address || '—';
        }
      });
    };
    renderRows(filtered);
    // Filtering
    const filterHandler = function() {
      const val = this.value;
      filtered = val ? j.reports.filter(r => r.severity === val) : j.reports;
      renderRows(filtered);
      attachRowHandlers();
    };
    document.getElementById('severityFilter').addEventListener('change', filterHandler);
    // Bulk verify
    document.getElementById('bulkVerify').addEventListener('click', async function() {
      const ids = Array.from(document.querySelectorAll('.rowCheck:checked')).map(cb => cb.dataset.id);
      for (const id of ids) {
        const token = localStorage.getItem('admin_jwt');
        await fetch(`/api/admin/verify/${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      }
      loadReports();
    });
    // Bulk delete
    document.getElementById('bulkDelete').addEventListener('click', async function() {
      if (!confirm('Delete selected reports?')) return;
      const ids = Array.from(document.querySelectorAll('.rowCheck:checked')).map(cb => cb.dataset.id);
      for (const id of ids) {
        const token = localStorage.getItem('admin_jwt');
        await fetch(`/api/admin/report/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      }
      loadReports();
    });
    // Attach individual row handlers after render
    function attachRowHandlers() {
      document.querySelectorAll('.verifyBtn').forEach(b => b.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const token = localStorage.getItem('admin_jwt');
        await fetch(`/api/admin/verify/${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
        loadReports();
      }));
      document.querySelectorAll('.deleteBtn').forEach(b => b.addEventListener('click', async (e) => {
        if (!confirm('Delete this report?')) return;
        const id = e.currentTarget.dataset.id;
        const token = localStorage.getItem('admin_jwt');
        await fetch(`/api/admin/report/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
        loadReports();
      }));
    }
    attachRowHandlers();
  }
});
