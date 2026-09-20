'use strict';

/* Value Board front end. Vanilla JS, no build step, matching the rest of the hub. */

const API = {
  picks: (q) => fetch(`api/picks?${new URLSearchParams(q)}`).then(r => r.json()),
  parlay: (body) => post('api/parlay', body),
  auto: (body) => post('api/parlay/auto', body),
  importOdds: (body) => post('api/odds/import', body),
};

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: 'Bad response from server.' }));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

const state = {
  slate: null,
  filtered: [],
  shown: 40,
  slip: [],          // { marketId, selection, ...display }
  bankroll: 100,
  minEdge: 3,
};

const $ = (id) => document.getElementById(id);
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ------------------------------------------------------------------ load */

async function load() {
  const data = await API.picks({ minEdge: state.minEdge, bankroll: state.bankroll });
  if (data.error) {
    $('slate-meta').textContent = data.error;
    return;
  }
  state.slate = data;
  renderMeta();
  renderFixtures();
  populateMatchFilter();
  applyFilters();
}

function renderMeta() {
  const s = state.slate;
  const d = new Date(`${s.date}T12:00:00Z`);
  const nice = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $('slate-meta').textContent =
    `${nice} · Matchweek ${s.matchweek} · ${s.summary.fixtureCount} fixtures · ${s.summary.marketsPriced} markets priced`;

  $('foot-meta').textContent = s.board
    ? `${s.board.bookmaker} board · ${s.board.priceCount} prices · ${s.board.isLiveData ? 'live' : s.board.source}`
    : 'No price board loaded';

  const banner = $('banner');
  if (s.dataWarning) {
    banner.textContent = s.dataWarning;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

function renderFixtures() {
  $('fixtures').innerHTML = state.slate.fixtures.map((f) => {
    const e = f.expectations;
    return `
      <article class="fx">
        <div class="fx-top">
          <span class="fx-teams">${esc(f.home.name)} v ${esc(f.away.name)}</span>
          <span class="fx-time">${esc(f.localTime)}</span>
        </div>
        <div class="fx-meta">
          xG ${e.goals.home.toFixed(2)}–${e.goals.away.toFixed(2)} ·
          ${f.pickCount} picks ·
          ref ${esc(f.referee)}${f.refereeConfirmed ? '' : ' (assumed)'}
        </div>
        <div class="fx-grid">
          <div class="fx-stat"><b>${e.corners.total.toFixed(1)}</b><span>Corners</span></div>
          <div class="fx-stat"><b>${e.cards.total.toFixed(1)}</b><span>Cards</span></div>
          <div class="fx-stat"><b>${e.shots.total.toFixed(1)}</b><span>Shots</span></div>
          <div class="fx-stat"><b>${e.sot.total.toFixed(1)}</b><span>On target</span></div>
          <div class="fx-stat"><b>${e.fouls.total.toFixed(1)}</b><span>Fouls</span></div>
          <div class="fx-stat"><b>${e.goals.total.toFixed(2)}</b><span>Goals</span></div>
        </div>
      </article>`;
  }).join('');
}

function populateMatchFilter() {
  const sel = $('f-match');
  const current = sel.value;
  sel.innerHTML = '<option value="">All fixtures</option>' +
    state.slate.fixtures.map((f) => `<option value="${f.id}">${esc(f.home.short)} v ${esc(f.away.short)}</option>`).join('');
  sel.value = current;
}

/* --------------------------------------------------------------- filters */

function applyFilters() {
  if (!state.slate) return;
  const cat = $('f-category').value;
  const match = $('f-match').value;
  const family = $('f-family').value;
  const sort = $('f-sort').value;

  let list = state.slate.picks.slice();
  if (cat) list = list.filter((p) => p.category === cat);
  if (match) list = list.filter((p) => p.matchId === match);
  if (family) list = list.filter((p) => p.family === family);

  const sorters = {
    ev: (a, b) => b.ev - a.ev,
    edge: (a, b) => b.edge - a.edge,
    confidence: (a, b) => b.confidence - a.confidence,
    odds: (a, b) => a.odds - b.odds,
  };
  list.sort(sorters[sort] || sorters.ev);

  state.filtered = list;
  state.shown = 40;
  renderPicks();
}

function gradeClass(g) {
  if (g === 'A+' || g === 'A') return 'a';
  if (g === 'B') return 'b';
  return 'c';
}

function renderPicks() {
  const body = $('picks-body');
  const list = state.filtered.slice(0, state.shown);

  $('pick-count').textContent = `(${state.filtered.length})`;
  $('empty').hidden = state.filtered.length > 0;
  $('btn-more').hidden = state.shown >= state.filtered.length;

  body.innerHTML = list.map((p) => {
    const on = state.slip.some((l) => l.marketId === p.marketId && l.selection === selKeyOf(p));
    return `
      <tr>
        <td><button class="add-btn ${on ? 'on' : ''}" data-market="${esc(p.marketId)}" data-side="${esc(selKeyOf(p))}" aria-label="Add to slip">${on ? '✓' : '+'}</button></td>
        <td><span class="fx-tag">${esc(p.fixtureLabel)}</span></td>
        <td>
          <div class="sel">${esc(p.selection)}<span class="grade ${gradeClass(p.grade)}">${esc(p.grade)}</span></div>
          <small>${esc(p.category)}${p.note ? ' · ' + esc(p.note) : ''}</small>
        </td>
        <td class="num">${p.odds.toFixed(2)}</td>
        <td class="num">${pct(p.modelProb)}</td>
        <td class="num muted">${pct(p.marketFairProb)}</td>
        <td class="num pos">+${p.edgePct.toFixed(1)}</td>
        <td class="num pos">${p.evPct.toFixed(1)}%</td>
        <td class="num">${p.stake.toFixed(2)}</td>
        <td class="num muted">${p.confidence}</td>
      </tr>`;
  }).join('');
}

/** Picks carry `side`; the board keys selections by 'over'/'under'/'yes'/'no'. */
function selKeyOf(pick) {
  return pick.side;
}

/* ------------------------------------------------------------------ slip */

function toggleLeg(marketId, side) {
  const i = state.slip.findIndex((l) => l.marketId === marketId && l.selection === side);
  if (i >= 0) {
    state.slip.splice(i, 1);
  } else {
    const pick = state.slate.picks.find((p) => p.marketId === marketId && selKeyOf(p) === side);
    if (!pick) return;
    if (state.slip.length >= 12) return;
    state.slip.push({
      marketId, selection: side,
      label: pick.selection, fixture: pick.fixtureLabel,
      odds: pick.odds, edgePct: pick.edgePct,
    });
  }
  renderPicks();
  renderSlip();
  priceSlip();
}

function renderSlip() {
  $('slip-count').textContent = state.slip.length;
  const box = $('slip-legs');
  if (state.slip.length === 0) {
    box.innerHTML = '<p class="empty small">Add selections from the board, or let the builder pick.</p>';
    $('slip-math').hidden = true;
    return;
  }
  box.innerHTML = state.slip.map((l, i) => `
    <div class="leg">
      <div class="leg-body">
        <div class="leg-sel">${esc(l.label)}</div>
        <div class="leg-meta">${esc(l.fixture)} · +${l.edgePct.toFixed(1)}pp</div>
      </div>
      <span class="leg-odds">${l.odds.toFixed(2)}</span>
      <button class="leg-x" data-remove="${i}" aria-label="Remove">×</button>
    </div>`).join('');
}

let priceTimer = null;
function priceSlip() {
  clearTimeout(priceTimer);
  if (state.slip.length === 0) { $('slip-math').hidden = true; return; }
  priceTimer = setTimeout(async () => {
    const payout = Number($('sgp-price').value);
    try {
      const r = await API.parlay({
        legs: state.slip.map((l) => ({ marketId: l.marketId, selection: l.selection })),
        bankroll: state.bankroll,
        payoutOdds: Number.isFinite(payout) && payout > 1 ? payout : null,
      });
      renderMath(r);
    } catch (err) {
      $('slip-math').hidden = false;
      $('slip-math').innerHTML = `<div class="note">${esc(err.message)}</div>`;
    }
  }, 180);
}

function renderMath(r) {
  const box = $('slip-math');
  box.hidden = false;

  const corr = r.correlationUplift;
  const corrLine = r.sameGame
    ? `<div class="row"><span>Correlation effect</span><span class="${corr >= 0 ? 'pos' : 'neg'}">${corr >= 0 ? '+' : ''}${(corr * 100).toFixed(1)}%</span></div>`
    : '';

  let tail;
  if (r.priceKnown) {
    const good = r.ev > 0;
    tail = `
      <div class="row"><span>Price</span><span>${r.payoutOdds.toFixed(2)}</span></div>
      <div class="row"><span>Break-even price</span><span>${r.breakEvenOdds.toFixed(2)}</span></div>
      <div class="row big"><span>Expected value</span><span class="${good ? 'pos' : 'neg'}">${r.evPct.toFixed(1)}%</span></div>
      <div class="row"><span>Suggested stake</span><span>${r.stake.toFixed(2)}</span></div>
      <div class="note ${good ? 'good' : ''}">${good
        ? 'Positive expectation at this price. Stake is quarter-Kelly.'
        : 'Negative expectation at this price — the model says pass.'}</div>`;
  } else {
    tail = `
      <div class="row big"><span>Break-even price</span><span>${r.breakEvenOdds.toFixed(2)}</span></div>
      <div class="row"><span>Naive multiply</span><span class="muted">${r.combinedOdds.toFixed(2)}</span></div>
      <div class="note">Same-game slip: the book prices the correlation in, so it will not pay ${r.combinedOdds.toFixed(2)}. Take it only at <b>${r.breakEvenOdds.toFixed(2)}</b> or better. Enter the real price below for a true expected value.</div>`;
  }

  box.innerHTML = `
    <div class="row"><span>Legs</span><span>${r.legCount}</span></div>
    <div class="row"><span>True probability</span><span>${pct(r.probability, 2)}</span></div>
    <div class="row"><span>If independent</span><span class="muted">${pct(r.independentProbability, 2)}</span></div>
    ${corrLine}
    ${tail}`;
}

/* ------------------------------------------------------------ auto build */

async function autoBuild(mode) {
  const btn = mode === 'accumulator' ? $('btn-acca') : $('btn-sgp');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Building…';
  try {
    const r = await API.auto({ mode, bankroll: state.bankroll, minEdge: state.minEdge, minLegs: 3, maxLegs: 4 });
    const built = r[mode];
    if (!built) {
      $('slip-math').hidden = false;
      $('slip-math').innerHTML = '<div class="note">No combination clears the thresholds. Try lowering the minimum edge.</div>';
      return;
    }
    state.slip = built.legs.map((l) => ({
      marketId: l.marketId, selection: l.side,
      label: l.selection, fixture: l.fixtureLabel,
      odds: l.odds, edgePct: l.edgePct,
    }));
    renderPicks();
    renderSlip();
    renderMath(built);
  } catch (err) {
    $('slip-math').hidden = false;
    $('slip-math').innerHTML = `<div class="note">${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ---------------------------------------------------------------- events */

document.addEventListener('click', (e) => {
  const add = e.target.closest('.add-btn');
  if (add) { toggleLeg(add.dataset.market, add.dataset.side); return; }

  const rm = e.target.closest('[data-remove]');
  if (rm) {
    state.slip.splice(Number(rm.dataset.remove), 1);
    renderPicks(); renderSlip(); priceSlip();
  }
});

$('btn-more').addEventListener('click', () => { state.shown += 40; renderPicks(); });
$('btn-clear').addEventListener('click', () => { state.slip = []; renderPicks(); renderSlip(); $('slip-math').hidden = true; });
$('btn-acca').addEventListener('click', () => autoBuild('accumulator'));
$('btn-sgp').addEventListener('click', () => autoBuild('sameGame'));
$('sgp-price').addEventListener('input', priceSlip);

['f-category', 'f-match', 'f-family', 'f-sort'].forEach((id) =>
  $(id).addEventListener('change', applyFilters));

$('f-edge').addEventListener('input', (e) => {
  state.minEdge = Number(e.target.value);
  $('edge-val').textContent = `${state.minEdge.toFixed(1)}pp`;
});
$('f-edge').addEventListener('change', load);

$('f-bankroll').addEventListener('change', (e) => {
  state.bankroll = Math.max(1, Number(e.target.value) || 100);
  load().then(priceSlip);
});

$('btn-import').addEventListener('click', () => $('dlg-import').showModal());
$('btn-method').addEventListener('click', () => $('dlg-method').showModal());

$('btn-do-import').addEventListener('click', async () => {
  const text = $('import-text').value.trim();
  const status = $('import-status');
  if (!text) { status.textContent = 'Nothing to import.'; return; }
  status.textContent = 'Importing…';
  try {
    const r = await API.importOdds({ text });
    status.textContent = `Imported ${r.imported} prices${r.errors.length ? ` (${r.errors.length} lines skipped)` : ''}. Reloading…`;
    await load();
    setTimeout(() => $('dlg-import').close(), 700);
  } catch (err) {
    status.textContent = err.message;
  }
});

load().catch((err) => { $('slate-meta').textContent = `Failed to load: ${err.message}`; });
