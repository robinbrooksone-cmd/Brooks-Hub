'use strict';

const {
  countVector,
  gammaFrailtyNodes,
  residualDispersion,
  negBinPmf,
  tailAtLeast,
  overLine,
  clampProb,
} = require('../lib/stats');

/**
 * Joint model for per-team count markets (corners, cards, shots, shots on
 * target) built on a shared "game state" frailty.
 *
 *   H | Z ~ NB(muH * Z, phiResid)      A | Z ~ NB(muA * Z, phiResid)
 *   Z ~ Gamma(mean 1, var phiShared)
 *
 * Conditional on Z the two sides are independent, so the joint is a simple
 * quadrature over Z. Integrating Z back out leaves each marginal as exactly
 * NB(mu, phiTotal) — the distribution we calibrated to real match data — while
 * inducing genuine positive correlation between the two teams.
 *
 * This matters for the "both teams to get X+ corners" and "both teams to get
 * X+ cards" lines. Pricing those as P(H>=x) * P(A>=x) assumes independence and
 * systematically UNDER-prices them: stretched, end-to-end games give both sides
 * corners, and a card-happy referee in a niggly game books both sides. The
 * shared factor is the whole point of those markets.
 */
function jointCountModel({ muHome, muAway, phiTotal, phiShared, maxK = 32, nodes = 320 }) {
  const phiResid = residualDispersion(phiTotal, phiShared);
  const { nodes: z, weights: w } = gammaFrailtyNodes(phiShared, nodes);

  // Pre-compute the conditional tail P(X >= k | Z = z) for every node.
  const condTail = (mu) => {
    const table = [];
    for (let i = 0; i < z.length; i++) {
      const m = mu * z[i];
      const vec = new Array(maxK + 1);
      let acc = 0;
      for (let k = 0; k <= maxK; k++) {
        vec[k] = negBinPmf(k, m, phiResid);
        acc += vec[k];
      }
      if (acc < 1) vec[maxK] += 1 - acc;
      // Convert to upper tails once; every query below is a tail query.
      const tails = new Array(maxK + 2).fill(0);
      for (let k = maxK; k >= 0; k--) tails[k] = tails[k + 1] + vec[k];
      table.push(tails);
    }
    return table;
  };

  const homeTails = condTail(muHome);
  const awayTails = condTail(muAway);

  const marginalHome = countVector(muHome, phiTotal, maxK);
  const marginalAway = countVector(muAway, phiTotal, maxK);
  const totalVec = convolveWithFrailty(muHome, muAway, phiResid, z, w, maxK);

  return {
    phiResid,
    marginalHome,
    marginalAway,
    total: totalVec,

    /** P(home >= hk AND away >= ak) with the shared factor integrated out. */
    bothAtLeast(hk, ak) {
      let p = 0;
      for (let i = 0; i < z.length; i++) {
        const ph = homeTails[i][Math.min(Math.max(hk, 0), maxK + 1)] || 0;
        const pa = awayTails[i][Math.min(Math.max(ak, 0), maxK + 1)] || 0;
        p += w[i] * ph * pa;
      }
      return clampProb(p);
    },

    /** P(at least one side reaches k) — the complement-style line. */
    eitherAtLeast(k) {
      let p = 0;
      for (let i = 0; i < z.length; i++) {
        const ph = homeTails[i][Math.min(Math.max(k, 0), maxK + 1)] || 0;
        const pa = awayTails[i][Math.min(Math.max(k, 0), maxK + 1)] || 0;
        p += w[i] * (1 - (1 - ph) * (1 - pa));
      }
      return clampProb(p);
    },

    /** Implied correlation between the two teams' counts, for reporting. */
    correlation() {
      let eh = 0, ea = 0, eh2 = 0, ea2 = 0, eha = 0;
      for (let i = 0; i < z.length; i++) {
        const mh = muHome * z[i];
        const ma = muAway * z[i];
        const vh = mh + phiResid * mh * mh;
        const va = ma + phiResid * ma * ma;
        eh += w[i] * mh;
        ea += w[i] * ma;
        eh2 += w[i] * (vh + mh * mh);
        ea2 += w[i] * (va + ma * ma);
        eha += w[i] * mh * ma; // independent given Z
      }
      const cov = eha - eh * ea;
      const sd = Math.sqrt((eh2 - eh * eh) * (ea2 - ea * ea));
      return sd > 0 ? cov / sd : 0;
    },
  };
}

/**
 * Distribution of the match total (home + away) under the shared frailty.
 * Not simply NB(muH+muA, phiTotal): the shared factor makes the two sides
 * co-move, which fattens the tails of the total beyond the independent sum.
 */
function convolveWithFrailty(muHome, muAway, phiResid, z, w, maxK) {
  const size = 2 * maxK + 1;
  const out = new Array(size).fill(0);
  for (let i = 0; i < z.length; i++) {
    const mh = muHome * z[i];
    const ma = muAway * z[i];
    const hv = new Array(maxK + 1);
    const av = new Array(maxK + 1);
    for (let k = 0; k <= maxK; k++) {
      hv[k] = negBinPmf(k, mh, phiResid);
      av[k] = negBinPmf(k, ma, phiResid);
    }
    for (let a = 0; a <= maxK; a++) {
      if (hv[a] < 1e-12) continue;
      for (let b = 0; b <= maxK; b++) {
        out[a + b] += w[i] * hv[a] * av[b];
      }
    }
  }
  const sum = out.reduce((s, v) => s + v, 0);
  if (sum > 0) for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/** Convenience wrappers so market builders read cleanly. */
const over = (vec, line) => overLine(vec, line);
const under = (vec, line) => clampProb(1 - overLine(vec, line));
const atLeast = (vec, k) => tailAtLeast(vec, k);

module.exports = { jointCountModel, convolveWithFrailty, over, under, atLeast };
