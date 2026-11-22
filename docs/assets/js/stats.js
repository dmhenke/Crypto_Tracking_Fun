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

  return { qnorm: qnorm, qt: qt, qchisq: qchisq, mean: mean, variance: variance, sd: sd, moments: moments,
           meanCI: meanCI, sdCI: sdCI, ols: ols, corCI: corCI, logReturns: logReturns, rolling: rolling, drawdown: drawdown };
});
