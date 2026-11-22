// Dumps quantiles and pairwise statistics computed by docs/assets/js/stats.js
// so tests/validate_stats.R can compare them with R. Usage: node tests/stats_dump.js
const S = require("../docs/assets/js/stats.js");
const P = require("../docs/data/prices.json");
const out = { q: [], pairs: [] };
for (const df of [3, 5, 8, 10, 20, 50, 100, 250, 1000]) for (const p of [0.005, 0.025, 0.05, 0.95, 0.975, 0.995])
  out.q.push({ df, p, qt: S.qt(p, df), qchisq: S.qchisq(p, df), qnorm: S.qnorm(p) });
function matched(a, b, from) {
  const A = P.assets[a], B = P.assets[b], mb = new Map(B.date.map((d, i) => [d, B.close[i]]));
  const d = [], x = [], y = [];
  A.date.forEach((dt, i) => { if (dt >= from && mb.has(dt)) { d.push(dt); y.push(A.close[i]); x.push(mb.get(dt)); } });
  return { d, x: S.logReturns(x), y: S.logReturns(y) };
}
for (const [y, x, from, level] of [["GBTC","BTC-USD","2025-11-21",0.95],["ETH-USD","BTC-USD","2022-01-01",0.95],["ADA-USD","BTC-USD","2024-06-01",0.99],["ETHE","ETH-USD","2021-01-01",0.90]]) {
  const m = matched(y, x, from), o = S.ols(m.x, m.y, level), c = S.corCI(m.x, m.y, level), v = S.sdCI(m.y, level), mu = S.meanCI(m.y, level), mo = S.moments(m.y);
  out.pairs.push({ y, x, from, level, rx: m.x, ry: m.y, ols: o, cor: c, sd: v, mean: mu, mom: mo });
}

// ---- extended checks (robust inference, p-values, grouped tests) ----
const ext = { p: [], hac: [], anova: null, ccf: null, boot: null };
for (const [x, a, b] of [[0.3, 2, 5], [0.7, 0.5, 0.5], [0.05, 10, 30], [0.99, 3, 200]]) ext.p.push({ kind: "pbeta", x, a, b, v: S.pbeta(x, a, b) });
for (const [t, df] of [[0.5, 5], [2.1, 20], [-3.3, 250], [1.96, 1000]]) ext.p.push({ kind: "pt2", t, df, v: S.pt2(t, df) });
for (const [F, d1, d2] of [[1.2, 4, 100], [3.5, 6, 1500], [0.4, 2, 30]]) ext.p.push({ kind: "pf", F, d1, d2, v: S.pf(F, d1, d2) });
const pr = out.pairs[1];   // ETH ~ BTC since 2022
for (const L of [0, 5, null]) { const h = S.olsHAC(pr.rx, pr.ry, 0.95, L); ext.hac.push({ lag: h.lag, se_alpha: h.se_alpha, se_beta: h.se_beta, beta_lo: h.beta_lo, beta_hi: h.beta_hi, p_beta0: h.p_beta0 }); }
// trend regression (fee drag style): log ratio on time index
const tt = pr.ry.map((_, i) => i), lr = []; let acc = 0; pr.ry.forEach((v, i) => { acc += v - pr.rx[i]; lr.push(acc); });
const ht = S.olsHAC(tt, lr, 0.95, 10); ext.trend = { y: lr, se_beta: ht.se_beta, beta: ht.beta };
// weekday ANOVA on BTC returns
const B = P.assets["BTC-USD"], rb = S.logReturns(B.close), wd = B.date.slice(1).map(d => new Date(d + "T00:00:00Z").getUTCDay());
const groups = [0,1,2,3,4,5,6].map(k => rb.filter((_, i) => wd[i] === k));
ext.anova = { r: rb, wd, res: S.anova1(groups) };
ext.ccf = { res: S.crossCorr(pr.rx, pr.ry, [-2, -1, 0, 1, 2], 0.95) };
// bootstrap sanity: iid normal sample -> block bootstrap CI for the mean should be close to the t interval
const R = S.rng(7), z = []; for (let i = 0; i < 2000; i += 2) { const u = R(), v = R(), m = Math.sqrt(-2 * Math.log(u)); z.push(m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)); }
const bs = S.blockBootstrap(z.length, [idx => S.mean(idx.map(i => z[i]))], 0.95, 2000, 1, 99)[0], tci = S.meanCI(z, 0.95);
ext.boot = { boot_lo: bs.lo, boot_hi: bs.hi, t_lo: tci.lo, t_hi: tci.hi };
ext.hacmean = [0, 5, null].map(L => { const h = S.hacMean(pr.ry, 0.95, L); return { lag: h.lag, se: h.se, lo: h.lo, hi: h.hi }; });
ext.wilson = [[2, 26], [237, 255], [50, 50]].map(([k, n]) => Object.assign({ k, n }, S.wilson(k, n, 0.95)));
out.ext = ext;
process.stdout.write(JSON.stringify(out));
