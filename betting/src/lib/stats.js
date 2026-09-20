'use strict';

/**
 * Statistical primitives for football market pricing.
 *
 * Everything here is deterministic and dependency-free so the model can be
 * unit-tested and audited. Counts in football are over-dispersed relative to
 * Poisson (corners and shots especially), so the workhorse distribution is the
 * negative binomial, parameterised by mean `mu` and dispersion `phi` where
 *
 *     Var(X) = mu + phi * mu^2
 *
 * phi = 0 collapses to Poisson. This parameterisation matters because phi is
 * what we can actually calibrate from published match data (mean and variance
 * of corners/cards/shots), and because a NB(mu, phi) is exactly a Poisson whose
 * rate has been multiplied by a Gamma(mean 1, var phi) "frailty". That identity
 * is what makes the joint `both teams` models in model/counts.js work.
 */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Log-gamma via the Lanczos approximation (g=7, n=9). */
function logGamma(z) {
  if (z < 0.5) {
    // Reflection formula for the left half-plane.
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Poisson pmf. */
function poissonPmf(k, lambda) {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1));
}

/**
 * Negative binomial pmf in (mean, dispersion) form.
 * phi <= 0 is treated as the Poisson limit.
 */
function negBinPmf(k, mu, phi) {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (mu <= 0) return k === 0 ? 1 : 0;
  if (!phi || phi <= 1e-9) return poissonPmf(k, mu);
  const r = 1 / phi; // "size" / number of failures
  const logP =
    logGamma(k + r) -
    logGamma(r) -
    logGamma(k + 1) +
    r * Math.log(r / (r + mu)) +
    k * Math.log(mu / (r + mu));
  return Math.exp(logP);
}

/**
 * Probability vector [P(X=0) .. P(X=maxK)] plus the residual tail mass folded
 * into the final slot, so the vector always sums to 1.
 */
function countVector(mu, phi, maxK = 30) {
  const v = new Array(maxK + 1).fill(0);
  let acc = 0;
  for (let k = 0; k <= maxK; k++) {
    v[k] = negBinPmf(k, mu, phi);
    acc += v[k];
  }
  // Residual mass above maxK; keep the vector proper rather than renormalising
  // (renormalising would quietly distort the high lines we care about).
  if (acc < 1) v[maxK] += 1 - acc;
  return v;
}

/** P(X >= k) from a probability vector. */
function tailAtLeast(vec, k) {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i < vec.length; i++) s += vec[i];
  return clampProb(s);
}

/** P(X <= k) from a probability vector. */
function tailAtMost(vec, k) {
  let s = 0;
  for (let i = 0; i <= Math.min(k, vec.length - 1); i++) s += vec[i];
  return clampProb(s);
}

/**
 * P(X > line) for a half-point line such as 2.5, and P(X >= n) for an integer
 * line expressed as "n or more". Betting lines are quoted as x.5 precisely to
 * avoid pushes, so `over(vec, 2.5)` === P(X >= 3).
 */
function overLine(vec, line) {
  return tailAtLeast(vec, Math.floor(line) + 1);
}

function underLine(vec, line) {
  return 1 - overLine(vec, line);
}

/**
 * Discrete quadrature nodes for a Gamma(mean 1, variance phi) frailty.
 *
 * Used to induce correlation between two count variables that share a latent
 * "game tempo" factor. Returns {nodes, weights} with sum(w) = 1 and
 * sum(w*z) = 1 enforced exactly, so mixing over these nodes preserves the
 * intended marginal mean.
 */
function gammaFrailtyNodes(phi, n = 320) {
  if (!phi || phi <= 1e-9) return { nodes: [1], weights: [1] };
  const shape = 1 / phi; // rate is also 1/phi so the mean is 1
  const sd = Math.sqrt(phi);
  const hi = Math.max(4, 1 + 12 * sd);
  const lo = Math.max(1e-6, Math.min(1e-3, 1 / (hi * 200)));

  // Log-spaced grid: Gamma is right-skewed and for large phi puts real mass
  // near zero, which a linear grid resolves badly.
  const logLo = Math.log(lo);
  const logHi = Math.log(hi);
  const step = (logHi - logLo) / (n - 1);

  const nodes = new Array(n);
  const weights = new Array(n);
  const logNorm = shape * Math.log(shape) - logGamma(shape);

  let wSum = 0;
  for (let i = 0; i < n; i++) {
    const z = Math.exp(logLo + i * step);
    const logPdf = logNorm + (shape - 1) * Math.log(z) - shape * z;
    // dz = z * dlog(z) for a log-spaced grid.
    const w = Math.exp(logPdf) * z * step;
    nodes[i] = z;
    weights[i] = w;
    wSum += w;
  }
  for (let i = 0; i < n; i++) weights[i] /= wSum;

  // Enforce E[Z] = 1 exactly by rescaling the nodes; a small correction, but it
  // keeps every marginal mean in the model exact rather than approximately right.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += weights[i] * nodes[i];
  if (mean > 0) for (let i = 0; i < n; i++) nodes[i] /= mean;

  return { nodes, weights };
}

/**
 * Split a total over-dispersion into a shared component and the independent
 * team-specific residual, given that the two multiply:
 *
 *   Var(Z_shared * Z_team) = (1+phiShared)(1+phiTeam) - 1 = phiTotal
 *
 * Returns the phi the *conditional* distribution must use so that, after
 * integrating out the shared factor, the marginal still has variance
 * mu + phiTotal*mu^2.
 */
function residualDispersion(phiTotal, phiShared) {
  if (phiShared <= 0) return phiTotal;
  const resid = (phiTotal - phiShared) / (1 + phiShared);
  return Math.max(0, resid);
}

/** Standard normal cdf (Abramowitz & Stegun 26.2.17, ~1e-7 absolute). */
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Inverse standard normal cdf (Acklam's rational approximation). */
function normalInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * P(X > h, Y > k) for a standard bivariate normal with correlation r.
 *
 * Uses the classical identity
 *   Phi2(h,k,r) = Phi(h)Phi(k) + (1/2pi) * integral_0^r exp(-(h^2-2*t*h*k+k^2)
 *                 / (2(1-t^2))) / sqrt(1-t^2) dt
 * integrated by Simpson's rule. The integrand is smooth away from |r|=1, so
 * this is accurate to roughly 1e-10 and needs no hard-coded quadrature tables.
 *
 * This gives an exact two-leg parlay probability, which in turn powers the fast
 * pairwise approximation used while searching combinations.
 */
function bivariateNormalUpper(h, k, r) {
  const rho = Math.max(-0.999999, Math.min(0.999999, r));
  const ph = 1 - normalCdf(h);
  const pk = 1 - normalCdf(k);
  if (Math.abs(rho) < 1e-12) return ph * pk;

  const n = 240; // even, for Simpson
  const step = rho / n;
  const f = (t) => {
    const om = 1 - t * t;
    return Math.exp(-(h * h - 2 * t * h * k + k * k) / (2 * om)) / Math.sqrt(om);
  };

  let sum = f(0) + f(rho);
  for (let i = 1; i < n; i++) sum += f(i * step) * (i % 2 === 1 ? 4 : 2);
  const integral = (step / 3) * sum;

  // Phi2(h,k,r) = P(X<=h, Y<=k); convert to the upper orthant.
  const phi2 = normalCdf(h) * normalCdf(k) + integral / (2 * Math.PI);
  return clampProb(1 - normalCdf(h) - normalCdf(k) + phi2);
}

function clampProb(p) {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** Deterministic PRNG (mulberry32) so parlay simulations are reproducible. */
function makeRng(seed = 20260920) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller pair from a uniform generator. */
function standardNormalPair(rng) {
  let u1 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  const u2 = rng();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

/**
 * Cholesky decomposition with a ridge fallback. Correlation matrices assembled
 * from pairwise heuristics are not guaranteed positive-definite, so we nudge
 * the diagonal until the factorisation succeeds rather than failing the request.
 */
function cholesky(matrix) {
  const n = matrix.length;
  for (let attempt = 0; attempt < 12; attempt++) {
    const ridge = attempt === 0 ? 0 : Math.pow(10, -9 + attempt);
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = matrix[i][j] + (i === j ? ridge : 0);
        for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
        if (i === j) {
          if (sum <= 1e-12) { ok = false; break; }
          L[i][i] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
    if (ok) return L;
  }
  // Last resort: independence.
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

module.exports = {
  logGamma,
  poissonPmf,
  negBinPmf,
  countVector,
  tailAtLeast,
  tailAtMost,
  overLine,
  underLine,
  gammaFrailtyNodes,
  residualDispersion,
  normalCdf,
  normalInv,
  bivariateNormalUpper,
  clampProb,
  makeRng,
  standardNormalPair,
  cholesky,
};
