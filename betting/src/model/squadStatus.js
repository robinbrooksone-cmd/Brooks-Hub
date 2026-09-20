'use strict';

/**
 * Squad verification.
 *
 * This module exists because of a specific failure: the model happily priced
 * and recommended props for players who had left their clubs in a transfer
 * window the squad data predated. Nothing in the pipeline objected, because
 * every layer downstream of the roster assumes the roster is right.
 *
 * A confident pick on a player who is not at the club is worse than no pick at
 * all, so the gate fails CLOSED. Player markets from an unverified squad are
 * still computed - they are useful once the roster is refreshed - but they are
 * flagged and withheld from recommendations until someone confirms the squad.
 */

/** Premier League transfer window closes. Extend as seasons are added. */
const WINDOW_CLOSES = [
  '2025-09-01',
  '2026-02-02',
  '2026-09-01',
];

/** The most recent window to have closed on or before `asOf`. */
function lastWindowClose(asOf) {
  const date = typeof asOf === 'string' ? asOf : asOf.toISOString().slice(0, 10);
  const past = WINDOW_CLOSES.filter((w) => w <= date).sort();
  return past.length ? past[past.length - 1] : null;
}

/**
 * Assess a squad file against the fixture date.
 *
 * A squad is trustworthy only if it was verified AFTER the last window closed.
 * Verification before that means it cannot possibly reflect the current roster.
 */
function assessSquad(playersFile, asOf) {
  const meta = playersFile._squadVerification || {};
  const verifiedAt = meta.verifiedAt || null;
  const windowClose = lastWindowClose(asOf);

  const players = playersFile.players || [];
  const unverified = players.filter((p) => !p.verifiedAt || (windowClose && p.verifiedAt < windowClose));

  const verified = Boolean(verifiedAt) && (!windowClose || verifiedAt >= windowClose);

  let reason = null;
  if (!verifiedAt) {
    reason = 'Squad data has never been verified against a confirmed roster.';
  } else if (windowClose && verifiedAt < windowClose) {
    reason = `Squad last verified ${verifiedAt}, before the transfer window closed on ${windowClose}. Transfers since then are not reflected.`;
  }

  return {
    verified,
    verifiedAt,
    lastWindowClose: windowClose,
    reason,
    playerCount: players.length,
    unverifiedCount: unverified.length,
    unverifiedIds: unverified.map((p) => p.id),
    note: meta.note || null,
  };
}

/** Player markets are those tied to a named individual. */
function isPlayerMarket(market) {
  return Boolean(market.playerId);
}

module.exports = { WINDOW_CLOSES, lastWindowClose, assessSquad, isPlayerMarket };
