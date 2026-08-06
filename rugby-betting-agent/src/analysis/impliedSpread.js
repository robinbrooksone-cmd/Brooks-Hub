const config = require('../config');

/**
 * Derives an implied point spread from a moneyline (h2h) win probability — useful
 * when a bookmaker's actual handicap/totals board isn't available, but their h2h
 * price is. This is NOT a real posted handicap line; it's what the win probability
 * *implies* about the expected margin, under a standard assumption used in sports
 * analytics: match margins are approximately normally distributed around the
 * expected margin, with some fixed standard deviation.
 *
 * sigma (RUGBY_MARGIN_STD_DEV, default 14.5) is a commonly-cited approximation for
 * rugby test-match margin variance, not a precisely verified constant — treat any
 * output from this module as a rough, transparent estimate, and recalibrate sigma
 * from real historical margins (once you have them) rather than trusting the
 * default blindly. It also breaks down at extreme win probabilities (>99% or <1%),
 * where the normal-margin assumption stops being a good approximation of a sport
 * with a bounded, discrete scoring system.
 */

// Peter Acklam's rational approximation for the inverse standard normal CDF.
// Accurate to about 1.15e-9 relative error — standard, well-documented algorithm.
function inverseNormalCdf(p) {
  if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * winProb: probability the favored/home side wins (0-1, excluding draw mass — strip
 * the draw out and renormalize onto the two match-winning outcomes first).
 * Returns the implied expected margin in points (positive = favorite side).
 */
function impliedMarginFromWinProb(winProb, sigma = config.analysis.rugbyMarginStdDev) {
  return inverseNormalCdf(winProb) * sigma;
}

/** Flags win probabilities where the normal-margin approximation gets unreliable. */
function isExtremeProb(winProb) {
  return winProb >= 0.99 || winProb <= 0.01;
}

module.exports = { inverseNormalCdf, impliedMarginFromWinProb, isExtremeProb };
