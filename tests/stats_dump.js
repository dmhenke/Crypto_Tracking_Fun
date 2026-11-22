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
process.stdout.write(JSON.stringify(out));
