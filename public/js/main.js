(function () {
  let content = null;
  let selectedParty = null;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function renderHero() {
    const { couple, wedding } = content;
    document.getElementById('couple-names').textContent = `${couple.partnerOne} & ${couple.partnerTwo}`;
    document.getElementById('wedding-date').textContent = wedding.displayDate;
    document.getElementById('intro-message').textContent = wedding.introMessage || '';
    document.getElementById('footer-hashtag').textContent = couple.hashtag || '';
    const heroPhoto = document.getElementById('hero-photo');
    if (wedding.heroPhoto) {
      heroPhoto.src = wedding.heroPhoto;
      heroPhoto.onerror = () => { heroPhoto.hidden = true; };
      heroPhoto.onload = () => { heroPhoto.hidden = false; };
    } else {
      heroPhoto.hidden = true;
    }
    startCountdown(wedding.date);
  }

  function startCountdown(dateStr) {
    const target = new Date(dateStr).getTime();
    const el = document.getElementById('countdown');
    if (!target || Number.isNaN(target)) return;

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        el.innerHTML = '<div class="unit"><strong>It\'s the big day!</strong></div>';
        clearInterval(timer);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      el.innerHTML = `
        <div class="unit"><strong>${d}</strong>days</div>
        <div class="unit"><strong>${h}</strong>hrs</div>
        <div class="unit"><strong>${m}</strong>min</div>
      `;
    }
    tick();
    const timer = setInterval(tick, 60000);
  }

  function renderStory() {
    const { story } = content;
    document.getElementById('story-heading').textContent = story.heading || 'Our Story';
    const el = document.getElementById('story-timeline');
    if (!story.timeline || !story.timeline.length) {
      el.innerHTML = '<p class="empty-note">The story is coming soon.</p>';
      return;
    }
    el.innerHTML = story.timeline.map((item) => `
      <div class="timeline-item">
        <div class="date">${escapeHtml(item.date)}</div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.text)}</p>
        </div>
      </div>
    `).join('');
  }

  function renderWeddingParty() {
    const el = document.getElementById('wedding-party-grid');
    const party = content.weddingParty || [];
    if (!party.length) {
      el.innerHTML = '<p class="empty-note">Wedding party details coming soon.</p>';
      return;
    }
    el.innerHTML = party.map((p) => `
      <div class="card">
        ${p.photo ? `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.name)}" />` : ''}
        <h3>${escapeHtml(p.name)}</h3>
        <div class="role">${escapeHtml(p.role)}</div>
        <p>${escapeHtml(p.bio)}</p>
      </div>
    `).join('');
  }

  function renderSchedule() {
    const el = document.getElementById('schedule-list');
    const schedule = content.schedule || [];
    if (!schedule.length) {
      el.innerHTML = '<p class="empty-note">Schedule coming soon.</p>';
      return;
    }
    el.innerHTML = schedule.map((s) => `
      <div class="schedule-item">
        <div class="time">${escapeHtml(s.time)}</div>
        <h3>${escapeHtml(s.event)}</h3>
        <p>${s.mapUrl ? `<a href="${escapeHtml(s.mapUrl)}" target="_blank" rel="noopener">${escapeHtml(s.venueName)}</a>` : escapeHtml(s.venueName)}<br/>${escapeHtml(s.address)}</p>
        <p>${escapeHtml(s.details)}</p>
      </div>
    `).join('');
  }

  function renderAttire() {
    const { attire } = content;
    document.getElementById('attire-heading').textContent = attire.heading || 'What to Wear';
    document.getElementById('attire-content').innerHTML = `
      ${attire.dressCode ? `<div class="dress-code">${escapeHtml(attire.dressCode)}</div>` : ''}
      <p>${escapeHtml(attire.details)}</p>
      ${attire.photo ? `<img src="${escapeHtml(attire.photo)}" alt="Attire inspiration" style="max-width:280px;border-radius:12px;margin-top:1rem;" />` : ''}
    `;
  }

  function renderTravel() {
    const { travel } = content;
    document.getElementById('travel-heading').textContent = travel.heading || 'Travel & Accommodation';
    document.getElementById('travel-intro').textContent = travel.intro || '';
    document.getElementById('transport-notes').textContent = travel.transportNotes || '';
    const el = document.getElementById('accommodations-grid');
    const list = travel.accommodations || [];
    if (!list.length) {
      el.innerHTML = '<p class="empty-note">Accommodation suggestions coming soon.</p>';
      return;
    }
    el.innerHTML = list.map((a) => `
      <div class="card">
        <h3>${escapeHtml(a.name)}</h3>
        <p>${escapeHtml(a.description)}</p>
        <p>${escapeHtml(a.address)}</p>
        ${a.priceRange ? `<p><strong>${escapeHtml(a.priceRange)}</strong></p>` : ''}
        ${a.link ? `<a href="${escapeHtml(a.link)}" target="_blank" rel="noopener">Book / Info</a>` : ''}
      </div>
    `).join('');
  }

  function renderGallery() {
    const { gallery } = content;
    document.getElementById('gallery-heading').textContent = gallery.heading || 'Gallery';
    const el = document.getElementById('gallery-grid');
    const photos = gallery.photos || [];
    if (!photos.length) {
      el.innerHTML = '<p class="empty-note">Photos coming soon — check back after the wedding!</p>';
      return;
    }
    el.innerHTML = photos.map((src) => `<img src="${escapeHtml(src)}" alt="Wedding photo" loading="lazy" />`).join('');
  }

  function renderRegistry() {
    const { registry } = content;
    document.getElementById('registry-heading').textContent = registry.heading || 'Registry';
    document.getElementById('registry-intro').textContent = registry.intro || '';
    const el = document.getElementById('registry-links');
    const links = registry.links || [];
    if (!links.length) {
      el.innerHTML = '<p class="empty-note">Registry coming soon.</p>';
      return;
    }
    el.innerHTML = links.map((l) => `<a class="btn btn-primary" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.name)}</a>`).join('');
  }

  function renderFaq() {
    const el = document.getElementById('faq-list');
    const faq = content.faq || [];
    if (!faq.length) {
      el.innerHTML = '<p class="empty-note">FAQs coming soon.</p>';
      return;
    }
    el.innerHTML = faq.map((f) => `
      <div class="faq-item">
        <h3>${escapeHtml(f.question)}</h3>
        <p>${escapeHtml(f.answer)}</p>
      </div>
    `).join('');
  }

  function renderRsvpIntro() {
    const { rsvp } = content;
    document.getElementById('rsvp-heading').textContent = rsvp.heading || 'RSVP';
    document.getElementById('rsvp-intro').textContent = rsvp.intro || '';
    if (rsvp.isOpen === false) {
      document.getElementById('rsvp-closed-message').hidden = false;
      document.getElementById('rsvp-closed-message').textContent = rsvp.closedMessage || 'RSVPs are closed.';
      document.getElementById('rsvp-search-step').hidden = true;
      return;
    }
  }

  // ---------- RSVP interactive flow ----------

  function wireRsvp() {
    const input = document.getElementById('rsvp-name-input');
    const resultsEl = document.getElementById('rsvp-search-results');
    let debounceTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) {
        resultsEl.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(() => searchParties(q), 300);
    });

    async function searchParties(q) {
      try {
        const res = await fetch(`/api/rsvp/search?name=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.parties.length) {
          resultsEl.innerHTML = '<p class="empty-note">No matching invitation found. Double check the spelling, or contact us directly.</p>';
          return;
        }
        resultsEl.innerHTML = data.parties.map((p) => `
          <div class="rsvp-search-result" data-party-id="${p.id}">
            <strong>${escapeHtml(p.label)}</strong><br/>
            <small>${p.guests.map((g) => escapeHtml(`${g.first_name} ${g.last_name}`)).join(', ')}</small>
          </div>
        `).join('');
        resultsEl.querySelectorAll('.rsvp-search-result').forEach((card) => {
          card.addEventListener('click', () => {
            const partyId = card.getAttribute('data-party-id');
            const party = data.parties.find((p) => String(p.id) === partyId);
            openRsvpForm(party);
          });
        });
      } catch (err) {
        resultsEl.innerHTML = '<p class="empty-note">Something went wrong searching. Please try again.</p>';
      }
    }

    document.getElementById('rsvp-back-btn').addEventListener('click', () => {
      selectedParty = null;
      document.getElementById('rsvp-form').hidden = true;
      document.getElementById('rsvp-search-step').hidden = false;
      input.value = '';
      resultsEl.innerHTML = '';
    });

    document.getElementById('rsvp-form').addEventListener('submit', submitRsvp);
  }

  function openRsvpForm(party) {
    selectedParty = party;
    document.getElementById('rsvp-search-step').hidden = true;
    document.getElementById('rsvp-form').hidden = false;
    document.getElementById('rsvp-form-party-label').textContent = party.label;

    const mealOptions = (content.rsvp && content.rsvp.mealOptions) || [];
    const guestListEl = document.getElementById('rsvp-guest-list');
    guestListEl.innerHTML = party.guests.map((g) => `
      <div class="rsvp-guest-row" data-guest-id="${g.id}">
        <div class="guest-name">${escapeHtml(g.first_name)} ${escapeHtml(g.last_name)}</div>
        <div class="attending-toggle">
          <label><input type="radio" name="attending-${g.id}" value="yes" checked /> Joyfully attending</label>
          <label><input type="radio" name="attending-${g.id}" value="no" /> Can't make it</label>
        </div>
        ${mealOptions.length ? `
          <label>Meal choice
            <select class="meal-choice">
              <option value="">Select a meal</option>
              ${mealOptions.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
            </select>
          </label>
        ` : ''}
        <label>Dietary restrictions / allergies
          <input type="text" class="dietary-notes" placeholder="e.g. gluten-free, nut allergy" />
        </label>
      </div>
    `).join('');
  }

  async function submitRsvp(e) {
    e.preventDefault();
    if (!selectedParty) return;

    const guests = Array.from(document.querySelectorAll('#rsvp-guest-list .rsvp-guest-row')).map((row) => {
      const guestId = Number(row.getAttribute('data-guest-id'));
      const attending = row.querySelector('input[type="radio"]:checked')?.value === 'yes';
      const mealChoice = row.querySelector('.meal-choice')?.value || null;
      const dietaryNotes = row.querySelector('.dietary-notes')?.value || null;
      return { id: guestId, attending, mealChoice, dietaryNotes };
    });

    const songRequest = document.getElementById('rsvp-song').value;
    const message = document.getElementById('rsvp-message').value;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/rsvp/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId: selectedParty.id, guests, songRequest, message }),
      });
      if (!res.ok) throw new Error('submit failed');
      document.getElementById('rsvp-form').hidden = true;
      document.getElementById('rsvp-success').hidden = false;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit RSVP';
      alert('Something went wrong submitting your RSVP. Please try again.');
    }
  }

  async function init() {
    const res = await fetch('/api/content');
    content = await res.json();

    renderHero();
    renderStory();
    renderWeddingParty();
    renderSchedule();
    renderAttire();
    renderTravel();
    renderGallery();
    renderRegistry();
    renderFaq();
    renderRsvpIntro();
    wireRsvp();
  }

  init();
})();
