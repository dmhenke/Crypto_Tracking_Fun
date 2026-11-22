/* Small statistics library for the dashboard (no dependencies).
 * Validated against R (lm, confint, cor.test, t.test, qt, qchisq) by tests/validate_stats.R.
 * Exposed as window.Stats in the browser and module.exports in Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Stats = factory();
})(this, function () {
  "use strict";

  // ---- quantile functions ----------------------------------------------------
  // Normal quantile: Acklam's rational approximation (|rel. error| < 1.2e-9).
  function qnorm(p) {
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
        b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
        c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
        d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00],
        pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  // Student t quantile: Cornish-Fisher expansion in 1/df (accurate to <1e-4 for df >= 8).
  function qt(p, df) {
    var z = qnorm(p), z2 = z * z, z3 = z2 * z, z5 = z3 * z2, z7 = z5 * z2, z9 = z7 * z2;
    return z + (z3 + z) / (4 * df) + (5*z5 + 16*z3 + 3*z) / (96 * df * df)
             + (3*z7 + 19*z5 + 17*z3 - 15*z) / (384 * Math.pow(df, 3))
             + (79*z9 + 776*z7 + 1482*z5 - 1920*z3 - 945*z) / (92160 * Math.pow(df, 4));
  }
  // log-gamma (Lanczos, g = 7) and regularized lower incomplete gamma P(a, x)
  function lgamma(z) {
    var g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
             12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1; var x = g[0]; for (var i = 1; i < 9; i++) x += g[i] / (z + i);
    var t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function pgamma(a, x) {
    if (x <= 0) return 0;
    var lg = lgamma(a), i;
    if (x < a + 1) {                         // series
      var ap = a, sum = 1 / a, del = sum;
      for (i = 0; i < 500; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lg);
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;   // continued fraction (Lentz)
    for (i = 1; i < 500; i++) {
      var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var del2 = d * c; h *= del2;
      if (Math.abs(del2 - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lg) * h;
  }
  // Chi-square quantile: Wilson-Hilferty start, then Newton steps on the exact CDF.
  function qchisq(p, df) {
    var z = qnorm(p), h = 2 / (9 * df), x = Math.max(df * Math.pow(1 - h + z * Math.sqrt(h), 3), 1e-8), k = df / 2;
    for (var it = 0; it < 30; it++) {
      var f = pgamma(k, x / 2) - p;
      var dens = Math.exp((k - 1) * Math.log(x) - x / 2 - k * Math.log(2) - lgamma(k));
      var step = f / dens, nx = x - step;
      x = nx > 0 ? nx : x / 2;
      if (Math.abs(step) < 1e-12 * x) break;
    }
    return x;
  }

  // ---- descriptive -------------------------------------------------------------
  function mean(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i]; return s / x.length; }
  function variance(x) { var m = mean(x), s = 0; for (var i = 0; i < x.length; i++) s += (x[i]-m)*(x[i]-m); return s / (x.length - 1); }
  function sd(x) { return Math.sqrt(variance(x)); }
  function moments(x) {                       // sample skewness and excess kurtosis (moment estimators)
    var n = x.length, m = mean(x), m2 = 0, m3 = 0, m4 = 0;
    for (var i = 0; i < n; i++) { var d = x[i]-m; m2 += d*d; m3 += d*d*d; m4 += d*d*d*d; }
    m2 /= n; m3 /= n; m4 /= n;
    return { skew: m3 / Math.pow(m2, 1.5), exkurt: m4 / (m2*m2) - 3 };
  }

  // ---- inference -----------------------------------------------------------------
  function meanCI(x, level) {
    var n = x.length, m = mean(x), se = sd(x) / Math.sqrt(n), t = qt(1 - (1-level)/2, n - 1);
    return { est: m, lo: m - t*se, hi: m + t*se, se: se };
  }
  function sdCI(x, level) {                   // exact under normality, via chi-square
    var n = x.length, s2 = variance(x), a = (1-level)/2;
    return { est: Math.sqrt(s2), lo: Math.sqrt((n-1)*s2 / qchisq(1-a, n-1)), hi: Math.sqrt((n-1)*s2 / qchisq(a, n-1)) };
  }
  function ols(x, y, level) {                 // y = a + b x + e
    var n = x.length, mx = mean(x), my = mean(y), sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < n; i++) { var dx = x[i]-mx, dy = y[i]-my; sxx += dx*dx; sxy += dx*dy; syy += dy*dy; }
    var b = sxy / sxx, a = my - b*mx, sse = syy - b*sxy, s2 = sse / (n-2);
    var seb = Math.sqrt(s2 / sxx), sea = Math.sqrt(s2 * (1/n + mx*mx/sxx)), t = qt(1 - (1-level)/2, n - 2);
    return { n: n, beta: b, beta_lo: b - t*seb, beta_hi: b + t*seb, se_beta: seb,
             alpha: a, alpha_lo: a - t*sea, alpha_hi: a + t*sea, se_alpha: sea,
             r2: 1 - sse/syy, sigma: Math.sqrt(s2), mx: mx, sxx: sxx, t: t };
  }
  function corCI(x, y, level) {               // Pearson r with Fisher-z interval (as cor.test)
    var n = x.length, mx = mean(x), my = mean(y), sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < n; i++) { var dx = x[i]-mx, dy = y[i]-my; sxx += dx*dx; syy += dy*dy; sxy += dx*dy; }
    var r = sxy / Math.sqrt(sxx*syy), z = 0.5*Math.log((1+r)/(1-r)), se = 1/Math.sqrt(n-3), q = qnorm(1-(1-level)/2);
    return { est: r, lo: Math.tanh(z - q*se), hi: Math.tanh(z + q*se) };
  }

  // ---- time-series helpers ---------------------------------------------------------
  function logReturns(v) { var r = []; for (var i = 1; i < v.length; i++) r.push(Math.log(v[i]/v[i-1])); return r; }
  function rolling(x, y, w, level) {          // rolling correlation (Fisher CI) and beta, window of w returns
    var out = { r: [], lo: [], hi: [], beta: [] };
    for (var i = 0; i < x.length; i++) {
      if (i < w - 1) { out.r.push(null); out.lo.push(null); out.hi.push(null); out.beta.push(null); continue; }
      var xs = x.slice(i-w+1, i+1), ys = y.slice(i-w+1, i+1), c = corCI(xs, ys, level);
      var mx = mean(xs), my = mean(ys), sxx = 0, sxy = 0;
      for (var k = 0; k < w; k++) { sxx += (xs[k]-mx)*(xs[k]-mx); sxy += (xs[k]-mx)*(ys[k]-my); }
      out.r.push(c.est); out.lo.push(c.lo); out.hi.push(c.hi); out.beta.push(sxy/sxx);
    }
    return out;
  }
  function drawdown(v) {                      // running drawdown and the maximum, with peak/trough indexes
    var peak = v[0], pi = 0, dd = [], mdd = 0, mp = 0, mt = 0;
    for (var i = 0; i < v.length; i++) {
      if (v[i] > peak) { peak = v[i]; pi = i; }
      var d = v[i]/peak - 1; dd.push(d);
      if (d < mdd) { mdd = d; mp = pi; mt = i; }
    }
    return { series: dd, max: mdd, peak: mp, trough: mt };
  }

  // ---- distribution functions (for p-values) -------------------------------------
  function betacf(a, b, x) {                  // continued fraction for the incomplete beta (Lentz)
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, h, m, m2, aa, del;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; h = d;
    for (m = 1; m <= 1000; m++) {
      m2 = 2 * m; aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  function pbeta(x, a, b) {                   // regularized incomplete beta I_x(a, b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function pt2(t, df) { return pbeta(df / (df + t * t), df / 2, 0.5); }          // two-sided p for |T| >= |t|
  function pf(F, d1, d2) { return F <= 0 ? 1 : 1 - pbeta(d1 * F / (d1 * F + d2), d1 / 2, d2 / 2); } // upper tail

  // ---- robust inference ------------------------------------------------------------
  // OLS with Newey-West (Bartlett kernel) covariance; matches sandwich::NeweyWest(fit, lag, prewhite = FALSE, adjust = FALSE).
  function nwLag(n) { return Math.floor(4 * Math.pow(n / 100, 2 / 9)); }
  function olsHAC(x, y, level, lag) {
    var o = ols(x, y, level), n = x.length, L = lag == null ? nwLag(n) : lag;
    var e = x.map(function (xi, i) { return y[i] - o.alpha - o.beta * xi; });
    var S = [[0, 0], [0, 0]];                 // meat: sum_l w_l sum_t (u_t u_{t-l}' + u_{t-l} u_t'), u_t = e_t [1, x_t]
    for (var l = 0; l <= L; l++) {
      var w = l === 0 ? 1 : 1 - l / (L + 1), s00 = 0, s01 = 0, s10 = 0, s11 = 0;
      for (var t = l; t < n; t++) {
        var a0 = e[t], a1 = e[t] * x[t], b0 = e[t - l], b1 = e[t - l] * x[t - l];
        s00 += a0 * b0; s01 += a0 * b1; s10 += a1 * b0; s11 += a1 * b1;
      }
      if (l === 0) { S[0][0] += s00; S[0][1] += s01; S[1][0] += s10; S[1][1] += s11; }
      else { S[0][0] += w * 2 * s00; S[0][1] += w * (s01 + s10); S[1][0] += w * (s10 + s01); S[1][1] += w * 2 * s11; }
    }
    var sx = 0, sxx = 0; for (var i = 0; i < n; i++) { sx += x[i]; sxx += x[i] * x[i]; }
    var det = n * sxx - sx * sx, B = [[sxx / det, -sx / det], [-sx / det, n / det]];   // (X'X)^-1
    var M = [[0, 0], [0, 0]], V = [[0, 0], [0, 0]], r, c, k;
    for (r = 0; r < 2; r++) for (c = 0; c < 2; c++) for (k = 0; k < 2; k++) M[r][c] += B[r][k] * S[k][c];
    for (r = 0; r < 2; r++) for (c = 0; c < 2; c++) for (k = 0; k < 2; k++) V[r][c] += M[r][k] * B[k][c];
    var tq = qt(1 - (1 - level) / 2, n - 2), sea = Math.sqrt(V[0][0]), seb = Math.sqrt(V[1][1]);
    return Object.assign({}, o, { lag: L, se_alpha: sea, se_beta: seb, alpha_lo: o.alpha - tq * sea, alpha_hi: o.alpha + tq * sea,
                                  beta_lo: o.beta - tq * seb, beta_hi: o.beta + tq * seb, p_beta0: pt2(o.beta / seb, n - 2) });
  }
  // Seeded RNG (mulberry32) so bootstrap results are reproducible for a given input.
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Moving-block bootstrap of paired observations; returns percentile intervals for each statistic.
  function blockBootstrap(n, stats, level, B, blockLen, seed) {
    B = B || 1000; blockLen = blockLen || Math.max(1, Math.round(Math.pow(n, 1 / 3))); var R = rng(seed || 12345);
    // stats: array of functions idx -> number, or one function idx -> array of numbers
    var multi = typeof stats === "function", idx = new Array(n);
    var K = multi ? stats(Array.from({ length: n }, function (_, i) { return i; })).length : stats.length;
    var draws = Array.from({ length: K }, function () { return []; });
    for (var b = 0; b < B; b++) {
      for (var i = 0; i < n; ) { var s = Math.floor(R() * (n - blockLen + 1)); for (var j = 0; j < blockLen && i < n; j++) idx[i++] = s + j; }
      if (multi) { var v = stats(idx); for (var k = 0; k < K; k++) draws[k].push(v[k]); }
      else for (var k2 = 0; k2 < K; k2++) draws[k2].push(stats[k2](idx));
    }
    var a = (1 - level) / 2;
    return draws.map(function (d) { d.sort(function (p, q) { return p - q; });
      var q = function (p) { var h = (d.length - 1) * p, lo = Math.floor(h); return d[lo] + (h - lo) * ((d[Math.min(lo + 1, d.length - 1)]) - d[lo]); };
      return { lo: q(a), hi: q(1 - a) }; });
  }

  // Newey-West standard error of a mean (long-run variance, Bartlett weights).
  function hacMean(y, level, lag) {
    var n = y.length, m = mean(y), L = lag == null ? nwLag(n) : lag, lr = 0;
    for (var l = 0; l <= L; l++) { var g = 0; for (var t = l; t < n; t++) g += (y[t] - m) * (y[t - l] - m); g /= n; lr += (l === 0 ? 1 : 2 * (1 - l / (L + 1))) * g; }
    var se = Math.sqrt(lr / n), tq = qt(1 - (1 - level) / 2, n - 1);
    return { est: m, se: se, lo: m - tq * se, hi: m + tq * se, lag: L };
  }
  // Wilson score interval for a proportion (e.g. forecast-interval coverage).
  function wilson(k, n, level) {
    var z = qnorm(1 - (1 - level) / 2), p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return { est: p, lo: c - h, hi: c + h };
  }

  // ---- grouped comparisons ------------------------------------------------------------
  function anova1(groups) {                    // one-way ANOVA; groups: array of numeric arrays
    var all = [].concat.apply([], groups), N = all.length, k = groups.length, gm = mean(all), ssb = 0, ssw = 0;
    groups.forEach(function (g) { var m = mean(g); ssb += g.length * (m - gm) * (m - gm); g.forEach(function (v) { ssw += (v - m) * (v - m); }); });
    var d1 = k - 1, d2 = N - k, F = (ssb / d1) / (ssw / d2);
    return { F: F, df1: d1, df2: d2, p: pf(F, d1, d2) };
  }
  function crossCorr(x, y, lags, level) {      // r_k = cor(x_t, y_{t+k}); positive k: x leads y
    return lags.map(function (k) {
      var xs = [], ys = [];
      for (var t = 0; t < x.length; t++) { var u = t + k; if (u >= 0 && u < y.length) { xs.push(x[t]); ys.push(y[u]); } }
      var c = corCI(xs, ys, level); return { lag: k, n: xs.length, r: c.est, lo: c.lo, hi: c.hi };
    });
  }

  return { qnorm: qnorm, qt: qt, qchisq: qchisq, pbeta: pbeta, pt2: pt2, pf: pf, mean: mean, variance: variance, sd: sd, moments: moments,
           meanCI: meanCI, sdCI: sdCI, ols: ols, olsHAC: olsHAC, nwLag: nwLag, corCI: corCI, blockBootstrap: blockBootstrap, rng: rng,
           anova1: anova1, crossCorr: crossCorr, hacMean: hacMean, wilson: wilson, logReturns: logReturns, rolling: rolling, drawdown: drawdown };
});
