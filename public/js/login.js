// Handles login form submission and redirects to dashboard on success

document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const msg = document.getElementById('loginMsg');
  msg.textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('admin_jwt', data.token);
      window.location.href = '/admin.html';
    } else {
      msg.textContent = data.error || 'Login failed';
      msg.style.color = '#d32f2f';
    }
  } catch (err) {
    msg.textContent = 'Network error';
    msg.style.color = '#d32f2f';
  }
});

// If already logged in, redirect to dashboard
document.addEventListener('DOMContentLoaded', function() {
  const jwt = localStorage.getItem('admin_jwt');
  if (jwt) {
    window.location.href = '/admin.html';
  }
});
