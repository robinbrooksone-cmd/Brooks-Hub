(function () {
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function checkAuth() {
    const res = await fetch('/api/admin/me');
    const data = await res.json();
    if (data.loggedIn) {
      showDashboard();
    } else {
      document.getElementById('login-screen').hidden = false;
      document.getElementById('dashboard').hidden = true;
    }
  }

  function showDashboard() {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('dashboard').hidden = false;
    loadParties();
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.hidden = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error();
      showDashboard();
    } catch {
      errEl.textContent = 'Incorrect password.';
      errEl.hidden = false;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  document.getElementById('add-party-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('new-party-label').value;
    const firstName = document.getElementById('new-guest-first').value;
    const lastName = document.getElementById('new-guest-last').value;
    const isChild = document.getElementById('new-guest-child').checked;

    await fetch('/api/admin/parties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        guests: [{ firstName, lastName, isChild }],
      }),
    });

    e.target.reset();
    loadParties();
  });

  document.getElementById('csv-import-btn').addEventListener('click', async () => {
    const csv = document.getElementById('csv-input').value;
    const resultEl = document.getElementById('csv-result');
    try {
      const res = await fetch('/api/admin/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      resultEl.textContent = `Imported ${data.imported} guest(s).`;
      document.getElementById('csv-input').value = '';
      loadParties();
    } catch (err) {
      resultEl.textContent = `Error: ${err.message}`;
    }
  });

  function attendingLabel(value) {
    if (value === 1) return '<span class="status-attending">Attending</span>';
    if (value === 0) return '<span class="status-declined">Declined</span>';
    return '<span class="status-pending">Pending</span>';
  }

  async function loadParties() {
    const res = await fetch('/api/admin/parties');
    const data = await res.json();
    renderSummary(data.parties);
    renderTable(data.parties);
  }

  function renderSummary(parties) {
    const totalGuests = parties.reduce((sum, p) => sum + p.guests.length, 0);
    const attending = parties.reduce((sum, p) => sum + p.guests.filter((g) => g.attending === 1).length, 0);
    const declined = parties.reduce((sum, p) => sum + p.guests.filter((g) => g.attending === 0).length, 0);
    const pending = totalGuests - attending - declined;

    document.getElementById('summary-cards').innerHTML = `
      <div class="card"><strong>${parties.length}</strong>Households</div>
      <div class="card"><strong>${totalGuests}</strong>Total Guests</div>
      <div class="card"><strong>${attending}</strong>Attending</div>
      <div class="card"><strong>${declined}</strong>Declined</div>
      <div class="card"><strong>${pending}</strong>Pending</div>
    `;
  }

  function renderTable(parties) {
    const tbody = document.getElementById('parties-table-body');
    if (!parties.length) {
      tbody.innerHTML = '<tr><td colspan="7">No parties yet. Add one above or import a CSV.</td></tr>';
      return;
    }
    tbody.innerHTML = parties.map((p) => `
      <tr>
        <td><strong>${escapeHtml(p.label)}</strong></td>
        <td>${p.guests.map((g) => `${escapeHtml(g.first_name)} ${escapeHtml(g.last_name)}${g.is_child ? ' (child)' : ''}`).join('<br/>')}</td>
        <td>${p.guests.map((g) => attendingLabel(g.attending)).join('<br/>')}</td>
        <td>${p.guests.map((g) => escapeHtml(g.meal_choice || '—')).join('<br/>')}</td>
        <td>${p.guests.map((g) => escapeHtml(g.dietary_notes || '—')).join('<br/>')}</td>
        <td>${p.song_request ? `🎵 ${escapeHtml(p.song_request)}<br/>` : ''}${escapeHtml(p.message || '')}</td>
        <td><button class="delete-btn" data-id="${p.id}">Delete</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this party and all its guests?')) return;
        await fetch(`/api/admin/parties/${btn.dataset.id}`, { method: 'DELETE' });
        loadParties();
      });
    });
  }

  checkAuth();
})();
