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
    loadSeating();
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
      errEl.textContent = 'Verkeerde wagwoord.';
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
      if (!res.ok) throw new Error(data.error || 'Invoer het misluk');
      resultEl.textContent = `${data.imported} gas(te) ingevoer.`;
      document.getElementById('csv-input').value = '';
      loadParties();
    } catch (err) {
      resultEl.textContent = `Fout: ${err.message}`;
    }
  });

  function attendingLabel(value) {
    if (value === 1) return '<span class="status-attending">Kom</span>';
    if (value === 0) return '<span class="status-declined">Kom nie</span>';
    return '<span class="status-pending">Wagtend</span>';
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
      <div class="card"><strong>${parties.length}</strong>Huishoudings</div>
      <div class="card"><strong>${totalGuests}</strong>Totale Gaste</div>
      <div class="card"><strong>${attending}</strong>Kom</div>
      <div class="card"><strong>${declined}</strong>Kom nie</div>
      <div class="card"><strong>${pending}</strong>Wagtend</div>
    `;
  }

  function renderTable(parties) {
    const tbody = document.getElementById('parties-table-body');
    if (!parties.length) {
      tbody.innerHTML = '<tr><td colspan="7">Nog geen groepe nie. Voeg een hierbo by of voer \'n CSV in.</td></tr>';
      return;
    }
    tbody.innerHTML = parties.map((p) => `
      <tr data-party-id="${p.id}">
        <td><strong>${escapeHtml(p.label)}</strong></td>
        <td>${p.guests.map((g) => `${escapeHtml(g.first_name)} ${escapeHtml(g.last_name)}${g.is_child ? ' (kind)' : ''}`).join('<br/>')}</td>
        <td>${p.guests.map((g) => attendingLabel(g.attending)).join('<br/>')}</td>
        <td>${p.guests.map((g) => escapeHtml(g.meal_choice || '—')).join('<br/>')}</td>
        <td>${p.guests.map((g) => escapeHtml(g.dietary_notes || '—')).join('<br/>')}</td>
        <td>${p.song_request ? `🎵 ${escapeHtml(p.song_request)}<br/>` : ''}${escapeHtml(p.message || '')}</td>
        <td>
          <button class="edit-btn" data-id="${p.id}">Wysig</button>
          <button class="delete-btn" data-id="${p.id}">Skrap</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Skrap hierdie groep en al sy gaste?')) return;
        await fetch(`/api/admin/parties/${btn.dataset.id}`, { method: 'DELETE' });
        loadParties();
      });
    });

    tbody.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditRow(btn.dataset.id, parties));
    });
  }

  function openEditRow(partyId, parties) {
    const party = parties.find((p) => String(p.id) === String(partyId));
    if (!party) return;
    const row = document.querySelector(`tr[data-party-id="${partyId}"]`);
    if (!row || row.nextElementSibling?.classList.contains('edit-row')) return;

    const editRow = document.createElement('tr');
    editRow.className = 'edit-row';
    editRow.innerHTML = `
      <td colspan="7">
        <div class="edit-panel">
          <label>Huishouding-etiket <input type="text" class="edit-label" value="${escapeHtml(party.label)}" /></label>
          <label>Maks gaste <input type="number" class="edit-max-guests" min="1" value="${party.max_guests}" /></label>
          <label>Notas <input type="text" class="edit-notes" value="${escapeHtml(party.notes || '')}" /></label>
          <div class="edit-guests">
            ${party.guests.map((g) => `
              <div class="edit-guest" data-guest-id="${g.id}">
                <input type="text" class="edit-guest-first" value="${escapeHtml(g.first_name)}" placeholder="Voornaam" />
                <input type="text" class="edit-guest-last" value="${escapeHtml(g.last_name)}" placeholder="Van" />
                <label class="checkbox-label"><input type="checkbox" class="edit-guest-child" ${g.is_child ? 'checked' : ''} /> Kind</label>
              </div>
            `).join('')}
          </div>
          <div class="edit-actions">
            <button type="button" class="save-edit-btn">Stoor</button>
            <button type="button" class="cancel-edit-btn">Kanselleer</button>
          </div>
        </div>
      </td>
    `;
    row.after(editRow);

    editRow.querySelector('.cancel-edit-btn').addEventListener('click', () => editRow.remove());
    editRow.querySelector('.save-edit-btn').addEventListener('click', async () => {
      const label = editRow.querySelector('.edit-label').value;
      const maxGuests = parseInt(editRow.querySelector('.edit-max-guests').value, 10) || 1;
      const notes = editRow.querySelector('.edit-notes').value;

      await fetch(`/api/admin/parties/${partyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, maxGuests, notes }),
      });

      const guestEls = editRow.querySelectorAll('.edit-guest');
      await Promise.all(Array.from(guestEls).map((el) => {
        const guestId = el.dataset.guestId;
        const firstName = el.querySelector('.edit-guest-first').value;
        const lastName = el.querySelector('.edit-guest-last').value;
        const isChild = el.querySelector('.edit-guest-child').checked;
        return fetch(`/api/admin/guests/${guestId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, isChild }),
        });
      }));

      loadParties();
    });
  }

  // ---------- Seating chart ----------

  let seatingData = { tables: [], unassigned: [] };

  async function loadSeating() {
    const res = await fetch('/api/admin/tables');
    seatingData = await res.json();
    renderTables();
    renderSeatingGuestList();
  }

  function allSeatingGuests() {
    const assigned = seatingData.tables.flatMap((t) => t.guests.map((g) => ({ ...g, tableName: t.name })));
    return [...assigned, ...seatingData.unassigned];
  }

  function renderTables() {
    const container = document.getElementById('tables-list');
    if (!seatingData.tables.length) {
      container.innerHTML = '<p class="hint">Nog geen tafels nie. Voeg een hierbo by.</p>';
      return;
    }
    container.innerHTML = seatingData.tables.map((t) => `
      <div class="table-card" data-table-id="${t.id}">
        <div class="table-card-header">
          <strong>${escapeHtml(t.name)}</strong>
          <span class="table-capacity">${t.guests.length} / ${t.capacity}</span>
          <button class="delete-table-btn" data-id="${t.id}">Verwyder tafel</button>
        </div>
        <ul class="table-guest-list">
          ${t.guests.map((g) => `
            <li>
              ${escapeHtml(g.first_name)} ${escapeHtml(g.last_name)}
              <button class="unassign-btn" data-guest-id="${g.id}">×</button>
            </li>
          `).join('') || '<li class="hint">Geen gaste toegewys nie</li>'}
        </ul>
      </div>
    `).join('');

    container.querySelectorAll('.delete-table-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Verwyder hierdie tafel? Toegewysde gaste word ontoegewys.')) return;
        await fetch(`/api/admin/tables/${btn.dataset.id}`, { method: 'DELETE' });
        loadSeating();
      });
    });

    container.querySelectorAll('.unassign-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/admin/guests/${btn.dataset.guestId}/table`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId: null }),
        });
        loadSeating();
      });
    });
  }

  function renderSeatingGuestList() {
    const filter = (document.getElementById('seating-filter').value || '').toLowerCase();
    const container = document.getElementById('seating-guest-list');
    const guests = allSeatingGuests().filter((g) =>
      `${g.first_name} ${g.last_name} ${g.party_label}`.toLowerCase().includes(filter)
    );

    if (!guests.length) {
      container.innerHTML = '<p class="hint">Geen gaste pas nie.</p>';
      return;
    }

    const tableOptions = seatingData.tables.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

    container.innerHTML = guests.map((g) => `
      <div class="seating-guest-row">
        <span>${escapeHtml(g.first_name)} ${escapeHtml(g.last_name)} <span class="hint">(${escapeHtml(g.party_label)})</span></span>
        <select class="assign-select" data-guest-id="${g.id}">
          <option value="">Nie toegewys nie</option>
          ${tableOptions}
        </select>
      </div>
    `).join('');

    container.querySelectorAll('.assign-select').forEach((sel) => {
      const guest = guests.find((g) => String(g.id) === sel.dataset.guestId);
      sel.value = guest?.table_id || '';
      sel.addEventListener('change', async () => {
        await fetch(`/api/admin/guests/${sel.dataset.guestId}/table`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId: sel.value ? parseInt(sel.value, 10) : null }),
        });
        loadSeating();
      });
    });
  }

  document.getElementById('add-table-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-table-name').value;
    const capacity = parseInt(document.getElementById('new-table-capacity').value, 10) || 8;
    await fetch('/api/admin/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, capacity }),
    });
    e.target.reset();
    document.getElementById('new-table-capacity').value = 8;
    loadSeating();
  });

  document.getElementById('seating-filter').addEventListener('input', renderSeatingGuestList);

  checkAuth();
})();
