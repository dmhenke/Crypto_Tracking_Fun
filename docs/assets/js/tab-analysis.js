/* Analysis: return relationship explorer, rolling stats, lead-lag, weekday effects, drawdowns.
 * URL keys: y, x, win, from, to, f, lvl, ci, roll, ny, tr */
(function () {
  "use strict";
  var A = window.App, $ = A.$, T = "analysis";
  var WINS = [{ v: "90D", d: 90 }, { v: "1Y", d: 365 }, { v: "2Y", d: 730 }, { v: "3Y", d: 1095 }, { v: "All", d: null }];
  var CIS = [{ v: "N", t: "Normal theory" }, { v: "H", t: "Newey-West" }, { v: "B", t: "Block bootstrap" }];
  var CI_HINT = { N: "Classical formulas; assume independent, roughly normal returns.", H: "Robust to autocorrelation and changing volatility; applies to beta, alpha and the mean.", B: "1,000 block resamples; no normality assumption. Slower on long windows." };
  var st = function (k, d) { return A.get(T, k, d); };

  function lastCommon(y, x) { return [A.lastDate(y), A.lastDate(x)].sort()[0]; }
  function setWindow(v) {
    var w = WINS.filter(function (o) { return o.v === v; })[0] || WINS[1], to = lastCommon(st("y"), st("x"));
    A.set(T, "win", w.v); A.set(T, "to", to); A.set(T, "from", w.d ? A.shiftDate(to, -w.d) : "2021-01-01");
  }
  function pairHasFund(y, x) { return A.isFund(y) || A.isFund(x); }
  function priceSeries(s, other, useNY, tr) {
    if (useNY && !A.isFund(s) && A.isFund(other) && A.nyclose(s)) return A.nyclose(s);
    return A.series(s, tr && A.isFund(s));
  }
  function periodKey(d, f) { if (f === "M") return d.slice(0, 7); if (f === "W") return String(Math.floor((Date.parse(d) / 864e5 + 3) / 7)); return d; }
  function matched(useNY, freq) {
    var y = st("y"), x = st("x"), tr = st("tr", "1") === "1";
    var m = A.match(priceSeries(y, x, useNY, tr), priceSeries(x, y, useNY, tr), st("from"), st("to"));
    var daily = { d: m.d.slice(), y: m.a.slice(), x: m.b.slice() };
    if (freq && freq !== "D") {
      var d = [], yy = [], xx = [];
      for (var i = 0; i < m.d.length; i++) if (i === m.d.length - 1 || periodKey(m.d[i], freq) !== periodKey(m.d[i + 1], freq)) { d.push(m.d[i]); yy.push(m.a[i]); xx.push(m.b[i]); }
      return { d: d, y: yy, x: xx, daily: daily };
    }
    return { d: m.d, y: m.a, x: m.b, daily: daily };
  }

  function render() {
    var y = st("y"), x = st("x"), f = st("f", "D"), L = +st("lvl", "0.95"), ci = st("ci", "N"), useNY = st("ny", "1") === "1";
    $("selY").value = y; $("selX").value = x; $("winFrom").value = st("from"); $("winTo").value = st("to");
    $("anNY").checked = useNY; $("anTR").checked = st("tr", "1") === "1";
    A.chips($("winChips"), WINS.map(function (w) { return { v: w.v, t: w.v }; }), st("win"), function (v) { setWindow(v); render(); });
    A.chips($("freqChips"), [{ v: "D", t: "Daily" }, { v: "W", t: "Weekly" }, { v: "M", t: "Monthly" }], f, function (v) {
      A.set(T, "f", v); A.set(T, "roll", v === "D" ? 60 : v === "W" ? 26 : 12); render(); });
    A.chips($("lvlChips"), [{ v: "0.9", t: "90%" }, { v: "0.95", t: "95%" }, { v: "0.99", t: "99%" }], String(L), function (v) { A.set(T, "lvl", v); render(); });
    A.chips($("ciChips"), CIS, ci, function (v) { A.set(T, "ci", v); render(); });
    $("ciHint").textContent = CI_HINT[ci];

    var m = matched(useNY, f), lv = Math.round(L * 100) + "%", ry = Stats.logReturns(m.y), rx = Stats.logReturns(m.x), n = ry.length;
    var unit = { D: "days", W: "weeks", M: "months" }[f], roll = Math.min(+st("roll", 60), Math.max(10, Math.floor(n / 2)));
    $("roll").value = roll; $("rollVal").textContent = roll + " " + unit; $("lblY").textContent = A.short(y) + " ~ " + A.short(x);
    var ids = ["scatter", "hist", "rollChart", "ddChart", "leadChart", "wdChart"];
    if (y === x || n < 20) {
      $("anCards").innerHTML = "";
      $("anCallout").innerHTML = '<div class="callout callout-warning"><strong class="callout-title">Not enough data</strong>' +
        (y === x ? "Choose two different assets." : "Only " + n + " matched returns in this window; at least 20 are needed. Widen the window or use a higher frequency.") + "</div>";
      ids.forEach(function (id) { Plotly.purge(id); }); $("wdTbl").innerHTML = ""; return;
    }
    var yrs = A.days(m.d[0], m.d[m.d.length - 1]) / 365.25, ppy = n / yrs, sq = Math.sqrt(ppy);
    var o = Stats.ols(rx, ry, L), c = Stats.corCI(rx, ry, L), vy = Stats.sdCI(ry, L), vx = Stats.sdCI(rx, L), mu = Stats.meanCI(ry, L), mo = Stats.moments(ry);
    var diff = ry.map(function (v, i) { return v - rx[i]; }), te = Stats.sd(diff) * sq;
    var note = "";
    if (ci === "H") {
      var h = Stats.olsHAC(rx, ry, L), hm = Stats.hacMean(ry, L);
      o = Object.assign({}, o, { beta_lo: h.beta_lo, beta_hi: h.beta_hi, alpha_lo: h.alpha_lo, alpha_hi: h.alpha_hi }); mu = hm;
      note = " Newey-West lag " + h.lag + "; correlation and volatility use normal theory.";
    } else if (ci === "B") {
      var bs = Stats.blockBootstrap(n, function (idx) {
        var X = idx.map(function (i) { return rx[i]; }), Y = idx.map(function (i) { return ry[i]; }), oo = Stats.ols(X, Y, L);
        return [oo.beta, oo.alpha, Stats.corCI(X, Y, L).est, Stats.sd(Y), Stats.sd(X), Stats.mean(Y)];
      }, L, 1000, null, 20260101 + n);
      o = Object.assign({}, o, { beta_lo: bs[0].lo, beta_hi: bs[0].hi, alpha_lo: bs[1].lo, alpha_hi: bs[1].hi });
      c = { est: c.est, lo: bs[2].lo, hi: bs[2].hi }; vy = { est: vy.est, lo: bs[3].lo, hi: bs[3].hi }; vx = { est: vx.est, lo: bs[4].lo, hi: bs[4].hi }; mu = { est: mu.est, lo: bs[5].lo, hi: bs[5].hi };
      note = " Block length " + Math.max(1, Math.round(Math.pow(n, 1 / 3))) + ", 1,000 resamples, fixed seed.";
    }
    var ddy = Stats.drawdown(m.daily.y), ddx = Stats.drawdown(m.daily.x);
    var civ = function (lo, hi, fn) { return lv + " CI " + fn(lo) + " – " + fn(hi); }, f3 = function (v) { return A.fmt(v, 3); }, f4 = function (v) { return A.fmt(v, Math.abs(c.est) > 0.995 ? 4 : 3); }, p1 = function (v) { return A.pct(v, 1); };
    $("anCards").innerHTML = [
      A.card("Beta (y on x)", A.fmt(o.beta, 3), civ(o.beta_lo, o.beta_hi, f3), "How much y moves, on average, for a 1-unit move in x (slope of the regression of y's returns on x's)."),
      A.card("Correlation", f4(c.est), civ(c.lo, c.hi, f4), "Pearson correlation of the two return series: 1 means they move in lockstep."),
      A.card("R²", A.fmt(o.r2, 3), "share of y's variance explained by x"),
      A.card("Alpha, annualized", A.spct(o.alpha * ppy), civ(o.alpha_lo * ppy, o.alpha_hi * ppy, p1), "Return of y not explained by its beta to x, per year. For a fund vs. its coin this is mostly fees and tracking."),
      A.card("Volatility " + A.short(y), A.pct(vy.est * sq), civ(vy.lo * sq, vy.hi * sq, p1), "Annualized standard deviation of y's returns."),
      A.card("Volatility " + A.short(x), A.pct(vx.est * sq), civ(vx.lo * sq, vx.hi * sq, p1)),
      A.card("Mean log return " + A.short(y), A.spct(mu.est * ppy), "annualized; " + civ(mu.lo * ppy, mu.hi * ppy, p1), "Average log return per year. Its interval is wide because returns are noisy: average returns are much harder to pin down than volatility."),
      A.card("Tracking error", A.pct(te), "annualized SD of (y − x) returns", "How much the two returns differ day to day, per year."),
      A.card("Max drawdown", A.pct(ddy.max), A.short(y) + "; " + A.short(x) + ": " + A.pct(ddx.max)),
      A.card("Skew / excess kurtosis", A.fmt(mo.skew, 2) + " / " + A.fmt(mo.exkurt, 1), "of y returns; normal = 0 / 0", "Excess kurtosis above 0 means fatter tails than a normal distribution: more extreme days."),
      A.card("Observations", A.fmt(n, 0), m.d[0] + " → " + m.d[m.d.length - 1] + " · " + A.fmt(ppy, 0) + " per year")
    ].join("");

    var b1 = o.beta_lo > 1 ? "more than one-for-one" : o.beta_hi < 1 ? "less than one-for-one" : "not distinguishable from one-for-one";
    var a0 = o.alpha_lo > 0 ? "positive (its interval excludes zero)" : o.alpha_hi < 0 ? "negative (its interval excludes zero)" : "not distinguishable from zero";
    var usedNY = useNY && pairHasFund(y, x) && (A.nyclose(y) || A.nyclose(x));
    var html = '<div class="callout callout-info"><strong class="callout-title">Reading these numbers</strong>' +
      "Over " + m.d[0] + " to " + m.d[m.d.length - 1] + ", a 1% " + { D: "daily", W: "weekly", M: "monthly" }[f] + " move in " + A.short(x) + " went with a " +
      A.fmt(o.beta, 2) + "% move in " + A.short(y) + " (" + lv + " CI " + A.fmt(o.beta_lo, 2) + " to " + A.fmt(o.beta_hi, 2) + "), " + b1 + ". " +
      A.short(x) + " explains about " + A.pct(o.r2, 0) + " of the variation in " + A.short(y) + ". Annualized alpha is " + A.spct(o.alpha * ppy) + ", " + a0 + "." + note +
      (usedNY ? " Coin prices are taken at 16:00 ET to line up with the NYSE close." : "") + "</div>";
    if (pairHasFund(y, x) && f === "D" && !usedNY)
      html += '<div class="callout callout-warning"><strong class="callout-title">Different closing times bias daily betas downward</strong>' +
        "With Coinbase's 00:00 UTC close, part of each crypto move lands in the next day's fund return. Turn on <strong>Coins at 16:00 ET</strong>, or switch to weekly returns.</div>";
    $("anCallout").innerHTML = html;

    // scatter with fit and mean-response band (normal theory band)
    var on = Stats.ols(rx, ry, L), xmin = Math.min.apply(null, rx), xmax = Math.max.apply(null, rx), grid = [];
    for (var g = 0; g <= 60; g++) grid.push(xmin + (xmax - xmin) * g / 60);
    var half = grid.map(function (v) { return on.t * on.sigma * Math.sqrt(1 / n + (v - on.mx) * (v - on.mx) / on.sxx); });
    var th = A.css("--global-theme-color"), gx = grid.map(function (v) { return 100 * v; });
    A.plot("scatter", [
      { x: rx.map(function (v) { return 100 * v; }), y: ry.map(function (v) { return 100 * v; }), mode: "markers", name: "periods", text: m.d.slice(1),
        marker: { size: 5, color: m.d.slice(1).map(function (d, i) { return i; }), colorscale: [[0, A.hexA(A.css("--global-text-color-light"), 0.35)], [1, th]], opacity: 0.75 },
        hovertemplate: "%{text}<br>x %{x:.2f}%<br>y %{y:.2f}%<extra></extra>" },
      { x: gx, y: grid.map(function (v, i) { return 100 * (on.alpha + on.beta * v + half[i]); }), mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: gx, y: grid.map(function (v, i) { return 100 * (on.alpha + on.beta * v - half[i]); }), mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: A.hexA(th, 0.2), name: lv + " CI", hoverinfo: "skip" },
      { x: gx, y: grid.map(function (v) { return 100 * (on.alpha + on.beta * v); }), mode: "lines", name: "OLS fit, β = " + A.fmt(on.beta, 3), line: { color: th, width: 2 }, hoverinfo: "skip" }
    ], A.layout({ hovermode: "closest", xaxis: { title: A.short(x) + " return (%)" }, yaxis: { title: A.short(y) + " return (%)" } }, false),
      n + " period returns of " + A.short(y) + " against " + A.short(x) + "; fitted beta " + A.fmt(on.beta, 3) + ".");

    var ys = ry.map(function (v) { return 100 * v; }), my = Stats.mean(ys), sy = Stats.sd(ys), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), nx = [], ny = [];
    for (var k = 0; k <= 120; k++) { var xv = lo + (hi - lo) * k / 120; nx.push(xv); ny.push(Math.exp(-0.5 * Math.pow((xv - my) / sy, 2)) / (sy * Math.sqrt(2 * Math.PI))); }
    A.plot("hist", [
      { x: ys, type: "histogram", histnorm: "probability density", nbinsx: Math.min(80, Math.max(15, Math.round(Math.sqrt(n) * 1.5))), name: A.short(y), marker: { color: A.hexA(A.color(y), 0.6), line: { color: A.color(y), width: 0.5 } } },
      { x: nx, y: ny, mode: "lines", name: "Normal fit", line: { color: A.css("--global-text-color"), width: 1.5, dash: "dot" } }
    ], A.layout({ hovermode: "closest", bargap: 0.02, xaxis: { title: A.short(y) + " return (%)" }, yaxis: { title: "Density" } }, false),
      "Histogram of " + A.short(y) + " returns; skew " + A.fmt(mo.skew, 2) + ", excess kurtosis " + A.fmt(mo.exkurt, 1) + ".");

    var R = Stats.rolling(rx, ry, roll, L), rd = m.d.slice(1), rt = [
      { x: rd, y: R.hi, mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: rd, y: R.lo, mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: A.hexA(th, 0.18), name: "Correlation " + lv + " CI", hoverinfo: "skip" },
      { x: rd, y: R.r, mode: "lines", name: "Correlation", line: { color: th, width: 1.6 }, hovertemplate: "r %{y:.3f}" },
      { x: rd, y: R.beta, mode: "lines", name: "Beta", yaxis: "y2", line: { color: A.color(y), width: 1.6 }, hovertemplate: "β %{y:.3f}" }];
    var RL = A.layout({ yaxis: { title: "Correlation", domain: [0.54, 1] }, yaxis2: A.axis({ title: "Beta", domain: [0, 0.44] }),
      shapes: [{ type: "line", xref: "paper", yref: "y2", x0: 0, x1: 1, y0: 1, y1: 1, line: { dash: "dot", color: A.css("--global-text-color-light"), width: 1 } }] });
    A.withEvents(rt, RL, [y, x], rd[0]);
    A.plot("rollChart", rt, RL, "Rolling " + roll + "-" + unit.slice(0, -1) + " correlation and beta of " + A.short(y) + " on " + A.short(x) + ".");

    var dt = [y, x].map(function (s, j) { var dd = j === 0 ? ddy : ddx;
      return { x: m.daily.d, y: dd.series.map(function (v) { return 100 * v; }), mode: "lines", name: A.short(s), line: { color: A.color(s), width: 1.5, dash: A.dash(s) }, hovertemplate: "%{y:.1f}%" }; });
    var DL = A.layout({ yaxis: { title: "Drawdown (%)" } }); A.withEvents(dt, DL, [y, x], m.daily.d[0]);
    A.plot("ddChart", dt, DL, "Drawdowns within the window: " + A.short(y) + " " + A.pct(ddy.max) + ", " + A.short(x) + " " + A.pct(ddx.max) + ".");

    renderLeadLag(L); renderWeekday(L);
  }

  function renderLeadLag(L) {
    var y = st("y"), x = st("x"), lags = [-3, -2, -1, 0, 1, 2, 3], series = [], th = A.css("--global-theme-color");
    var variants = [{ ny: false, name: "Coinbase 00:00 UTC close", color: A.css("--global-text-color-light") }];
    if (pairHasFund(y, x) && (A.nyclose(y) || A.nyclose(x))) variants.push({ ny: true, name: "Coinbase at 16:00 ET", color: th });
    var summary = [], res = [];
    variants.forEach(function (v) {
      var m = matched(v.ny, "D"), cc = Stats.crossCorr(Stats.logReturns(m.x), Stats.logReturns(m.y), lags, L); res.push(cc);
      series.push({ x: lags, y: cc.map(function (c) { return c.r; }), type: "bar", name: v.name, marker: { color: v.color },
        error_y: { type: "data", symmetric: false, array: cc.map(function (c) { return c.hi - c.r; }), arrayminus: cc.map(function (c) { return c.r - c.lo; }), color: A.css("--global-text-color"), thickness: 1 },
        hovertemplate: "lag %{x}: r = %{y:.3f}<extra>" + v.name + "</extra>" });
      summary.push(v.name + ": same-day r = " + A.fmt(cc[3].r, 3) + ", next-day r = " + A.fmt(cc[4].r, 3));
    });
    A.plot("leadChart", series, A.layout({ barmode: "group", hovermode: "closest", xaxis: { title: "k (days): x's return today vs. y's return k days later", dtick: 1 }, yaxis: { title: "Correlation" } }, false),
      "Cross-correlation of daily returns. " + summary.join("; ") + ".");
    var html = "";
    if (variants.length > 1) {
      var u = res[0], s2 = res[1], sig = function (c) { return c.lo > 0 || c.hi < 0; };
      var artifact = s2[3].r > u[3].r && Math.abs(s2[4].r) < Math.abs(u[4].r);
      html = '<div class="callout callout-info"><strong class="callout-title">What the timing comparison shows</strong>' + summary.join(". ") + ". " +
        (artifact ? "Measured at the same instant, the same-day link is stronger and the next-day link is weaker. Most of the apparent lead comes from the different closing times, not slow price discovery." +
          (sig(s2[4]) ? " A small next-day correlation remains (its interval excludes zero)." : " The remaining next-day correlation is not distinguishable from zero.")
                  : "Aligning the prices to the same instant does not remove the cross-day correlation in this window, so it is not just a closing-time effect.") + "</div>";
    }
    $("leadNote").innerHTML = html;
  }

  function renderWeekday(L) {
    var y = st("y"), s = A.series(y, st("tr", "1") === "1" && A.isFund(y)), from = st("from"), to = st("to");
    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], g = [[], [], [], [], [], [], []];
    for (var i = 1; i < s.date.length; i++) { var d = s.date[i]; if (d < from || d > to) continue; g[new Date(d + "T00:00:00Z").getUTCDay()].push(Math.log(s.val[i] / s.val[i - 1])); }
    var keep = [1, 2, 3, 4, 5, 6, 0].filter(function (k) { return g[k].length >= 5; });
    if (keep.length < 2) { Plotly.purge("wdChart"); $("wdTbl").innerHTML = ""; $("wdNote").innerHTML = ""; return; }
    var bonf = $("wdBonf").checked, Lk = bonf ? 1 - (1 - L) / keep.length : L, an = Stats.anova1(keep.map(function (k) { return g[k]; }));
    var rows = keep.map(function (k) { var c = Stats.meanCI(g[k], Lk), v = Stats.sdCI(g[k], L); return { day: DAYS[k], n: g[k].length, m: c.est, lo: c.lo, hi: c.hi, sd: v.est }; });
    A.plot("wdChart", [{ x: rows.map(function (r) { return r.day; }), y: rows.map(function (r) { return 100 * r.m; }), type: "bar", name: "Mean return",
      marker: { color: rows.map(function (r) { return r.m >= 0 ? A.hexA(A.css("--global-up"), 0.7) : A.hexA(A.css("--global-down"), 0.7); }) },
      error_y: { type: "data", symmetric: false, array: rows.map(function (r) { return 100 * (r.hi - r.m); }), arrayminus: rows.map(function (r) { return 100 * (r.m - r.lo); }), color: A.css("--global-text-color"), thickness: 1 },
      hovertemplate: "%{x}: %{y:.3f}%<extra></extra>" }],
      A.layout({ hovermode: "closest", showlegend: false, yaxis: { title: "Mean daily log return (%)" } }, false),
      "Mean daily return of " + A.short(y) + " by weekday; ANOVA " + A.pval(an.p) + ".");
    $("wdTbl").innerHTML = '<thead><tr><th>Day</th><th class="num">n</th><th class="num">Mean</th><th class="num">' + Math.round(Lk * 1000) / 10 + '% CI</th><th class="num">SD</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + r.day + '</td><td class="num">' + r.n + '</td><td class="num">' + A.pct(r.m, 3) + '</td><td class="num">' + A.pct(r.lo, 2) + " – " + A.pct(r.hi, 2) + '</td><td class="num">' + A.pct(r.sd, 2) + "</td></tr>"; }).join("") + "</tbody>";
    var any = rows.some(function (r) { return r.lo > 0 || r.hi < 0; });
    $("wdNote").innerHTML = '<div class="callout ' + (an.p < 1 - L ? "callout-warning" : "callout-info") + '"><strong class="callout-title">One-way ANOVA: F(' + an.df1 + ", " + an.df2 + ") = " + A.fmt(an.F, 2) + ", " + A.pval(an.p) + "</strong>" +
      (an.p < 1 - L ? "Average returns differ across weekdays at the " + Math.round(L * 100) + "% level in this window. Check whether the pattern holds in other windows before relying on it." :
        "No evidence that average returns differ by weekday in this window.") +
      (any ? " At least one weekday's interval excludes zero" + (bonf ? " even after the Bonferroni adjustment." : "; turn on the Bonferroni adjustment to allow for testing several days at once.") : "") +
      (A.isFund(y) ? " Monday's sample includes Friday-to-Monday moves, so its spread is wider by design." : "") + "</div>";
  }

  function init() {
    var opts = A.symbols().map(function (s) { return '<option value="' + s + '">' + A.short(s) + " — " + A.meta(s).label + "</option>"; }).join("");
    $("selY").innerHTML = opts; $("selX").innerHTML = opts;
    if (!A.get(T, "y")) A.state[T] = Object.assign({ y: "GBTC", x: "BTC-USD" }, A.state[T] || {});
    if (!A.get(T, "from")) setWindow(A.get(T, "win", "1Y"));
    $("selY").onchange = function () { A.set(T, "y", this.value); if (st("win")) setWindow(st("win")); render(); };
    $("selX").onchange = function () { A.set(T, "x", this.value); if (st("win")) setWindow(st("win")); render(); };
    $("swap").onclick = function () { var t = st("y"); A.set(T, "y", st("x")); A.set(T, "x", t); render(); };
    $("winFrom").onchange = function () { A.set(T, "win", ""); A.set(T, "from", this.value); render(); };
    $("winTo").onchange = function () { A.set(T, "win", ""); A.set(T, "to", this.value); render(); };
    $("roll").oninput = function () { A.set(T, "roll", this.value); render(); };
    $("anNY").onchange = function () { A.set(T, "ny", this.checked ? "1" : "0"); render(); };
    $("anTR").onchange = function () { A.set(T, "tr", this.checked ? "1" : "0"); render(); };
    $("wdBonf").onchange = function () { renderWeekday(+st("lvl", "0.95")); };
  }
  A.register(T, { init: init, render: render });
})();
