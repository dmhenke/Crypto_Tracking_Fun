/* Forecast: lognormal range forecasts with a rolling-origin backtest. URL keys: s, h, m */
(function () {
  "use strict";
  var A = window.App, $ = A.$, T = "forecast";
  var METHODS = [
    { v: "rw", t: "Random walk", d: "No expected change; spread from the last 90 daily returns." },
    { v: "drift", t: "Random walk + trend", d: "Adds the average daily return of the last 365 observations." },
    { v: "ewma", t: "EWMA volatility", d: "No expected change; spread from exponentially weighted volatility (λ = 0.94), which reacts faster to calm and turbulent spells." }
  ];
  var HS = [{ v: "D", t: "1 day" }, { v: "W", t: "1 week" }, { v: "M", t: "1 month" }];
  function steps(s, h) { var fund = A.isFund(s); return h === "D" ? 1 : h === "W" ? (fund ? 5 : 7) : (fund ? 21 : 30); }

  function model(p, method) {                         // returns function(t) -> {mu, sigma} using data up to index t
    var r = Stats.logReturns(p), ew = new Array(r.length), v = Stats.variance(r.slice(0, 30));
    for (var i = 0; i < r.length; i++) { ew[i] = v; v = 0.94 * v + 0.06 * r[i] * r[i]; }   // ew[i]: variance known before r[i]
    return function (t) {                              // origin at price index t; returns r[0..t-1] are known
      var past90 = r.slice(Math.max(0, t - 90), t), sig = method === "ewma" ? Math.sqrt(t < r.length ? 0.94 * ew[t - 1] + 0.06 * r[t - 1] * r[t - 1] : v) : Stats.sd(past90);
      var mu = method === "drift" ? Stats.mean(r.slice(Math.max(0, t - 365), t)) : 0;
      return { mu: mu, sigma: sig };
    };
  }
  function backtest(p, H, method) {
    var f = model(p, method), z80 = Stats.qnorm(0.9), z95 = Stats.qnorm(0.975), n = 0, c80 = 0, c95 = 0, ae = 0, ape = 0, w95 = 0, hit = [];
    for (var t = 365; t + H < p.length; t += H) {
      var q = f(t), s = q.sigma * Math.sqrt(H), med = p[t] * Math.exp(q.mu * H), act = p[t + H];
      var in80 = Math.abs(Math.log(act / med)) <= z80 * s, in95 = Math.abs(Math.log(act / med)) <= z95 * s;
      n++; c80 += in80; c95 += in95; ae += Math.abs(act - med); ape += Math.abs(act / med - 1); w95 += (Math.exp(z95 * s) - Math.exp(-z95 * s));
      hit.push(in95);
    }
    return { n: n, mae: ae / n, mape: ape / n, cov80: Stats.wilson(c80, n, 0.95), cov95: Stats.wilson(c95, n, 0.95), width95: w95 / n };
  }
  function addSteps(d, k, fund) {
    var t = new Date(d + "T00:00:00Z"), out = [];
    while (out.length < k) { t = new Date(t.getTime() + 864e5); var wd = t.getUTCDay(); if (!fund || (wd !== 0 && wd !== 6)) out.push(t.toISOString().slice(0, 10)); }
    return out;
  }
  function render() {
    var coinsFirst = A.symbols();
    var s = A.get(T, "s", "ETH-USD"), h = A.get(T, "h", "W"), mth = A.get(T, "m", "rw");
    if (!A.data.P.assets[s]) s = "ETH-USD";
    A.assetChips($("fcAsset"), coinsFirst, s, function (v) { A.set(T, "s", v); render(); });
    A.chips($("fcH"), HS, h, function (v) { A.set(T, "h", v); render(); });
    A.chips($("fcM"), METHODS.map(function (o) { return { v: o.v, t: o.t, title: o.d }; }), mth, function (v) { A.set(T, "m", v); render(); });
    var a = A.meta(s), p = a.close, H = steps(s, h), n = p.length, fund = A.isFund(s);
    var bt = METHODS.map(function (o) { return Object.assign({ m: o }, backtest(p, H, o.v)); }), cur = bt.filter(function (b) { return b.m.v === mth; })[0];
    // current forecast fan
    var q = model(p, mth)(n), z80 = Stats.qnorm(0.9), z95 = Stats.qnorm(0.975), fd = addSteps(a.date[n - 1], H, fund), last = p[n - 1];
    var band = function (z, sign) { return fd.map(function (d, i) { var k = i + 1; return last * Math.exp(q.mu * k + sign * z * q.sigma * Math.sqrt(k)); }); };
    var med = fd.map(function (d, i) { return last * Math.exp(q.mu * (i + 1)); }), th = A.css("--global-theme-color"), nh = Math.max(60, 12 * H), hx = a.date.slice(Math.max(0, n - nh));
    var fx = [a.date[n - 1]].concat(fd), pre = function (arr) { return [last].concat(arr); };
    var traces = [
      { x: hx, y: p.slice(Math.max(0, n - nh)), name: A.short(s) + " close", mode: "lines", line: { color: A.color(s), width: 1.6 } },
      { x: fx, y: pre(band(z95, 1)), mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: fx, y: pre(band(z95, -1)), mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: A.hexA(th, 0.15), name: "95% range", hovertemplate: "95% low $%{y:,.2f}<extra></extra>" },
      { x: fx, y: pre(band(z80, 1)), mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: fx, y: pre(band(z80, -1)), mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: A.hexA(th, 0.3), name: "80% range", hovertemplate: "80% low $%{y:,.2f}<extra></extra>" },
      { x: fx, y: pre(med), name: "Median", mode: "lines", line: { color: th, width: 1.5, dash: "dash" } }
    ];
    var L = A.layout({ yaxis: { title: "USD", type: "log" } }); A.withEvents(traces, L, [s], hx[0]);
    var e80 = band(z80, -1)[H - 1], f80 = band(z80, 1)[H - 1], e95 = band(z95, -1)[H - 1], f95 = band(z95, 1)[H - 1];
    A.plot("fcChart", traces, L, "Recent closes of " + A.short(s) + " and the " + METHODS.filter(function (o) { return o.v === mth; })[0].t + " range for " + fd[H - 1] +
      ": 80% " + A.px(e80) + " to " + A.px(f80) + ", 95% " + A.px(e95) + " to " + A.px(f95) + ".");
    $("fcCards").innerHTML = [
      A.card("80% range for " + fd[H - 1], A.px(e80) + " – " + A.px(f80), "from " + A.px(last) + " on " + a.date[n - 1]),
      A.card("95% range", A.px(e95) + " – " + A.px(f95), "width " + A.pct(f95 / last - e95 / last, 0) + " of today's price"),
      A.card("Measured 95% coverage", A.pct(cur.cov95.est, 0), "95% CI " + A.pct(cur.cov95.lo, 0) + " – " + A.pct(cur.cov95.hi, 0) + " over " + cur.n + " past forecasts",
        "Share of past 95% ranges from this model that contained the actual price. If it is well below 95%, the ranges are too narrow."),
      A.card("Typical miss of the median", A.px(cur.mae), "mean absolute error; " + A.pct(cur.mape, 1) + " of price")
    ].join("");
    $("fcTbl").innerHTML = '<thead><tr><th>Model</th><th class="num">Forecasts</th><th class="num">' + A.tip("MAE", "Mean absolute error of the median forecast, in dollars.") +
      '</th><th class="num">MAPE</th><th class="num">80% coverage (95% CI)</th><th class="num">95% coverage (95% CI)</th><th class="num">Avg 95% width</th></tr></thead><tbody>' +
      bt.map(function (b) {
        var ok = function (c, nom) { return c.lo <= nom && nom <= c.hi ? "" : ' style="color:var(--global-warning-block)"'; };
        return "<tr><td>" + b.m.t + '</td><td class="num">' + b.n + '</td><td class="num">' + A.px(b.mae) + '</td><td class="num">' + A.pct(b.mape, 1) +
          '</td><td class="num"' + ok(b.cov80, 0.8) + ">" + A.pct(b.cov80.est, 0) + " (" + A.pct(b.cov80.lo, 0) + " – " + A.pct(b.cov80.hi, 0) + ')</td><td class="num"' + ok(b.cov95, 0.95) + ">" +
          A.pct(b.cov95.est, 0) + " (" + A.pct(b.cov95.lo, 0) + " – " + A.pct(b.cov95.hi, 0) + ')</td><td class="num">' + A.pct(b.width95, 0) + "</td></tr>";
      }).join("") + "</tbody>";
    var err = function (k) { return { type: "data", symmetric: false, array: bt.map(function (b) { return 100 * (b[k].hi - b[k].est); }), arrayminus: bt.map(function (b) { return 100 * (b[k].est - b[k].lo); }), color: A.css("--global-text-color"), thickness: 1 }; };
    A.plot("fcCal", [
      { x: bt.map(function (b) { return b.m.t; }), y: bt.map(function (b) { return 100 * b.cov80.est; }), type: "bar", name: "80% range", marker: { color: A.hexA(th, 0.55) }, error_y: err("cov80") },
      { x: bt.map(function (b) { return b.m.t; }), y: bt.map(function (b) { return 100 * b.cov95.est; }), type: "bar", name: "95% range", marker: { color: th }, error_y: err("cov95") }
    ], A.layout({ barmode: "group", hovermode: "closest", yaxis: { title: "Actual coverage (%)", range: [50, 100] },
      shapes: [80, 95].map(function (v) { return { type: "line", xref: "paper", x0: 0, x1: 1, y0: v, y1: v, line: { dash: "dot", color: A.css("--global-text-color-light"), width: 1 } }; }) }, false),
      "Measured coverage of 80% and 95% ranges by model; dotted lines mark the nominal levels.");
  }
  A.register(T, { init: function () {}, render: render });
})();
