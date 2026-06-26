(function () {
  let content = null;
  let selectedParty = null;

  const PAGES = ['home', 'story', 'wedding-party', 'details', 'attire', 'travel', 'registry', 'faq', 'rsvp'];

  function getPageFromHash() {
    const page = window.location.hash.replace('#', '');
    return PAGES.includes(page) ? page : 'home';
  }

  function showPage(page) {
    PAGES.forEach((p) => {
      const section = document.querySelector(`[data-page="${p}"]`);
      if (section) section.hidden = p !== page;
    });
    document.querySelectorAll('[data-tab]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-tab') === page);
    });
    document.getElementById('site-nav').classList.remove('nav-open');
    document.getElementById('nav-toggle').setAttribute('aria-expanded', 'false');
    window.scrollTo(0, 0);
  }

  function wireNav() {
    document.querySelectorAll('[data-tab]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-tab');
        if (page === window.location.hash.replace('#', '')) {
          showPage(page);
        } else {
          window.location.hash = page;
        }
      });
    });
    window.addEventListener('hashchange', () => showPage(getPageFromHash()));

    document.getElementById('nav-toggle').addEventListener('click', () => {
      const nav = document.getElementById('site-nav');
      const isOpen = nav.classList.toggle('nav-open');
      document.getElementById('nav-toggle').setAttribute('aria-expanded', String(isOpen));
    });
  }

  function initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
  }

  function wirePhotoLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    let photos = [];
    let index = 0;

    function render() {
      lightboxImg.src = photos[index].src;
      lightboxImg.alt = photos[index].alt;
    }

    function open(trigger) {
      const all = Array.from(document.querySelectorAll('.lightbox-trigger'));
      photos = all.map((img) => ({ src: img.src, alt: img.alt }));
      index = all.indexOf(trigger);
      render();
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    function close() {
      lightbox.hidden = true;
      document.body.style.overflow = '';
    }

    function step(delta) {
      index = (index + delta + photos.length) % photos.length;
      render();
    }

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('.lightbox-trigger');
      if (!trigger) return;
      open(trigger);
    });

    document.addEventListener('keydown', (e) => {
      const trigger = e.target.closest && e.target.closest('.lightbox-trigger');
      if (trigger && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open(trigger);
        return;
      }
      if (lightbox.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    document.getElementById('lightbox-close').addEventListener('click', close);
    document.getElementById('lightbox-prev').addEventListener('click', () => step(-1));
    document.getElementById('lightbox-next').addEventListener('click', () => step(1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  }

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
      document.querySelector('.hero').style.setProperty('--hero-bg', `url("${wedding.heroPhoto}")`);
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
        el.innerHTML = '<div class="unit"><strong>Dit is die groot dag!</strong></div>';
        clearInterval(timer);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      el.innerHTML = `
        <div class="unit"><strong>${d}</strong>dae</div>
        <div class="unit"><strong>${h}</strong>ure</div>
        <div class="unit"><strong>${m}</strong>min</div>
      `;
    }
    tick();
    const timer = setInterval(tick, 60000);
  }

  function renderStory() {
    const { story } = content;
    document.getElementById('story-heading').textContent = story.heading || 'Ons Storie';
    const el = document.getElementById('story-timeline');
    if (!story.timeline || !story.timeline.length) {
      el.innerHTML = '<p class="empty-note">Die storie kom binnekort.</p>';
      return;
    }
    el.innerHTML = story.timeline.map((item, i) => `
      <div class="timeline-item reveal" style="transition-delay:${(i % 6) * 0.08}s">
        <div class="date">${escapeHtml(item.date)}</div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.text)}</p>
          ${item.photo ? `<img class="timeline-photo lightbox-trigger" tabindex="0" role="button" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.title)}" aria-label="Vergroot foto: ${escapeHtml(item.title)}" onerror="this.remove()" />` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderWeddingParty() {
    const el = document.getElementById('wedding-party-columns');
    const party = content.weddingParty || [];
    if (!party.length) {
      el.innerHTML = '<p class="empty-note">Bruidsparty-besonderhede kom binnekort.</p>';
      return;
    }
    const columns = [
      { side: 'partnerOne', heading: 'Strooimeisies' },
      { side: 'partnerTwo', heading: 'Strooijonkers' },
    ];
    el.innerHTML = columns.map((col) => {
      const members = party.filter((p) => p.side === col.side);
      if (!members.length) return '';
      return `
        <div class="wedding-party-column">
          <h3 class="wedding-party-column-heading">${escapeHtml(col.heading)}</h3>
          <div class="wedding-party-list">
            ${members.map((p, i) => `
              <div class="wedding-party-row reveal" style="transition-delay:${(i % 6) * 0.08}s">
                ${p.photo ? `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.name)}" onerror="this.remove()" />` : ''}
                <div>
                  <h4>${escapeHtml(p.name)}</h4>
                  <div class="role">${escapeHtml(p.role)}</div>
                  ${p.bio ? `<p>${escapeHtml(p.bio)}</p>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSchedule() {
    const el = document.getElementById('schedule-list');
    const schedule = content.schedule || [];
    if (!schedule.length) {
      el.innerHTML = '<p class="empty-note">Program kom binnekort.</p>';
      return;
    }
    el.innerHTML = schedule.map((day, i) => `
      <div class="schedule-day reveal" style="transition-delay:${i * 0.1}s">
        <h3 class="schedule-day-heading">${escapeHtml(day.date)}</h3>
        <p class="schedule-day-venue">
          ${day.mapUrl ? `<a href="${escapeHtml(day.mapUrl)}" target="_blank" rel="noopener">${escapeHtml(day.venueName)}</a>` : escapeHtml(day.venueName)}<br/>${escapeHtml(day.address)}
        </p>
        <div class="schedule-events">
          ${(day.events || []).map((e) => `
            <div class="schedule-event">
              <div class="time">${escapeHtml(e.time)}</div>
              <div>
                <h4>${escapeHtml(e.title)}</h4>
                ${e.details ? `<p>${escapeHtml(e.details)}</p>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderAttire() {
    const { attire } = content;
    document.getElementById('attire-heading').textContent = attire.heading || 'Wat om te Dra';
    document.getElementById('attire-content').innerHTML = `
      ${attire.dressCode ? `<div class="dress-code">${escapeHtml(attire.dressCode)}</div>` : ''}
      <p>${escapeHtml(attire.details)}</p>
      ${attire.photo ? `<img src="${escapeHtml(attire.photo)}" alt="Kleredrag-inspirasie" style="max-width:280px;border-radius:12px;margin-top:1rem;" />` : ''}
    `;
  }

  function renderTravel() {
    const { travel } = content;
    document.getElementById('travel-heading').textContent = travel.heading || 'Reis & Verblyf';
    document.getElementById('travel-intro').textContent = travel.intro || '';
    document.getElementById('transport-notes').textContent = travel.transportNotes || '';
    const el = document.getElementById('accommodations-grid');
    const list = travel.accommodations || [];
    if (!list.length) {
      el.innerHTML = '<p class="empty-note">Verblyf-voorstelle kom binnekort.</p>';
      return;
    }
    el.innerHTML = list.map((a, i) => `
      <div class="card reveal" style="transition-delay:${(i % 6) * 0.08}s">
        <h3>${escapeHtml(a.name)}</h3>
        <p>${escapeHtml(a.description)}</p>
        <p>${escapeHtml(a.address)}</p>
        <div class="card-links">
          ${a.link ? `<a href="${escapeHtml(a.link)}" target="_blank" rel="noopener">Bespreek / Inligting</a>` : ''}
          ${a.mapUrl ? `<a href="${escapeHtml(a.mapUrl)}" target="_blank" rel="noopener">Wys Roete</a>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderRegistry() {
    const { registry } = content;
    document.getElementById('registry-heading').textContent = registry.heading || 'Geskenklys';
    document.getElementById('registry-intro').textContent = registry.intro || '';
    document.getElementById('registry-note').textContent = registry.note || '';

    const bankEl = document.getElementById('registry-bank-details');
    const bank = registry.bankDetails;
    if (bank && (bank.bank || bank.accountName || bank.accountNumber)) {
      bankEl.hidden = false;
      bankEl.innerHTML = `
        ${bank.bank ? `<div class="bank-row"><span>Bank</span><strong>${escapeHtml(bank.bank)}</strong></div>` : ''}
        ${bank.accountName ? `<div class="bank-row"><span>Rekeninghouer</span><strong>${escapeHtml(bank.accountName)}</strong></div>` : ''}
        ${bank.accountNumber ? `<div class="bank-row"><span>Rekeningnommer</span><strong>${escapeHtml(bank.accountNumber)}</strong></div>` : ''}
      `;
    } else {
      bankEl.hidden = true;
    }

    const el = document.getElementById('registry-links');
    const links = registry.links || [];
    if (!links.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = links.map((l) => `<a class="btn btn-primary" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.name)}</a>`).join('');
  }

  function renderFaq() {
    const el = document.getElementById('faq-list');
    const faq = content.faq || [];
    if (!faq.length) {
      el.innerHTML = '<p class="empty-note">Vrae kom binnekort.</p>';
      return;
    }
    el.innerHTML = faq.map((f, i) => `
      <div class="faq-item reveal" style="transition-delay:${(i % 6) * 0.08}s">
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
      document.getElementById('rsvp-closed-message').textContent = rsvp.closedMessage || "RSVP's is gesluit.";
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
          resultsEl.innerHTML = '<p class="empty-note">Geen ooreenstemmende uitnodiging gevind nie. Gaan die spelling na, of kontak ons direk.</p>';
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
        resultsEl.innerHTML = '<p class="empty-note">Iets het verkeerd geloop met soek. Probeer asseblief weer.</p>';
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
          <label><input type="radio" name="attending-${g.id}" value="yes" checked /> Sal met graagte bywoon</label>
          <label><input type="radio" name="attending-${g.id}" value="no" /> Kan nie kom nie</label>
        </div>
        ${mealOptions.length ? `
          <label>Ete-keuse
            <select class="meal-choice">
              <option value="">Kies 'n ete</option>
              ${mealOptions.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
            </select>
          </label>
        ` : ''}
        <label>Dieetbeperkings / allergieë
          <input type="text" class="dietary-notes" placeholder="bv. glutenvry, neutallergie" />
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
    submitBtn.textContent = 'Word ingedien…';

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
      submitBtn.textContent = 'Dien RSVP In';
      alert('Iets het verkeerd geloop met die indien van jou RSVP. Probeer asseblief weer.');
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
    renderRegistry();
    renderFaq();
    renderRsvpIntro();
    wireRsvp();
    wireNav();
    wirePhotoLightbox();
    initReveal();
    showPage(getPageFromHash());
  }

  init();
})();
