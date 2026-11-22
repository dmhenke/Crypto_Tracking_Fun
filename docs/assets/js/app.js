/* Crypto Tracking dashboard. Data: data/prices.json and data/summary.json (written daily by scripts/daily_update.R).
 * Statistics: assets/js/stats.js (validated against R by tests/validate_stats.R). */
(function () {
  "use strict";
  var ORDER = ["BTC-USD", "GBTC", "ETH-USD", "ETHE", "ADA-USD"];
  var CVAR = { "BTC-USD": "--c-btc", "GBTC": "--c-gbtc", "ETH-USD": "--c-eth", "ETHE": "--c-ethe", "ADA-USD": "--c-ada" };
  var TRUST_OF = { "GBTC": "BTC-USD", "ETHE": "ETH-USD" };
  var P, S, current = "overview";
  var $ = function (id) { return document.getElementById(id); };
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var color = function (s) { return css(CVAR[s]); };
  var isTrust = function (s) { return P.assets[s].source === "yahoo"; };

  // ---- formatting ------------------------------------------------------------------
  function fmt(x, d) { if (x == null || !isFinite(x)) return "–"; return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(x, d) { return fmt(100 * x, d == null ? 1 : d) + "%"; }
  function spct(x, d) { return (x >= 0 ? "+" : "") + pct(x, d); }
  function px(x) { return "$" + (x >= 1000 ? fmt(x, 0) : x >= 1 ? fmt(x, 2) : fmt(x, 4)); }
  function cls(x) { return x >= 0 ? "up" : "down"; }
  function days(a, b) { return (Date.parse(b) - Date.parse(a)) / 864e5; }
  function shiftDate(d, n) { var t = new Date(Date.parse(d) + n * 864e5); return t.toISOString().slice(0, 10); }

  // ---- theme toggle (same behaviour as SolarPergola: system -> light -> dark) --------
  (function () {
    var root = document.documentElement, toggle = $("theme-toggle"), icon = $("theme-icon");
    var media = window.matchMedia("(prefers-color-scheme: dark)"), ICONS = { system: "◑", light: "☀", dark: "☽" };
    function read() { try { return localStorage.getItem("theme-setting") || "system"; } catch (e) { return "system"; } }
    function apply(setting) {
      root.setAttribute("data-theme", setting === "system" ? (media.matches ? "dark" : "light") : setting);
      root.setAttribute("data-theme-setting", setting);
      icon.textContent = ICONS[setting]; toggle.title = "Theme: " + setting;
      if (P) render(current);
    }
    apply(read());
    toggle.addEventListener("click", function () {
      var order = ["system", "light", "dark"], next = order[(order.indexOf(read()) + 1) % 3];
      try { localStorage.setItem("theme-setting", next); } catch (e) {}
      apply(next);
    });
    media.addEventListener("change", function () { if (read() === "system") apply("system"); });
  })();

  // ---- plotly theming ----------------------------------------------------------------
  var CFG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] };
  function axis(extra) { return Object.assign({ gridcolor: css("--global-divider-color"), zerolinecolor: css("--global-text-color-light"), linecolor: css("--global-divider-color") }, extra || {}); }
  function layout(extra, rangeButtons) {
    var L = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, -apple-system, sans-serif", size: 12, color: css("--global-text-color") },
      margin: { l: 60, r: 18, t: 40, b: 44 }, hovermode: "x unified",
      hoverlabel: { bgcolor: css("--global-card-bg-color"), bordercolor: css("--global-divider-color"), font: { color: css("--global-text-color") } },
      legend: { orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom" },
      xaxis: axis(), yaxis: axis()
    };
    if (rangeButtons !== false) L.xaxis.rangeselector = {
      x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", bgcolor: css("--global-surface-color"), activecolor: css("--global-divider-color"),
      font: { family: "JetBrains Mono, monospace", size: 11 },
      buttons: [{ count: 3, label: "3M", step: "month", stepmode: "backward" }, { count: 1, label: "1Y", step: "year", stepmode: "backward" },
                { count: 3, label: "3Y", step: "year", stepmode: "backward" }, { step: "all", label: "All" }] };
    return deepMerge(L, extra || {});
  }
  function deepMerge(a, b) { Object.keys(b).forEach(function (k) { a[k] = (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") ? deepMerge(a[k], b[k]) : b[k]; }); return a; }
  function hexA(hex, a) { var h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16) + "," + a + ")"; }

  // ---- chips ---------------------------------------------------------------------------
  function chips(el, items, active, onPick, multi) {
    el.innerHTML = items.map(function (it) {
      var on = multi ? active.indexOf(it.v) >= 0 : it.v === active;
      return '<button class="filter-btn' + (on ? " active" : "") + '" data-v="' + it.v + '">' + (it.dot ? '<span class="dot" style="background:' + it.dot + '"></span>' : "") + it.t + "</button>";
    }).join("");
    el.querySelectorAll("button").forEach(function (b) { b.onclick = function () { onPick(b.getAttribute("data-v")); }; });
  }

  // ---- series helpers --------------------------------------------------------------------
  function series(sym, adj) { var a = P.assets[sym]; return { date: a.date, val: (adj && a.adjclose) ? a.adjclose : a.close }; }
  function idxOnOrBefore(dates, d) { var lo = 0, hi = dates.length - 1, ans = -1; while (lo <= hi) { var m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; }
  function fold(sym, ref, adj) {
    var s = series(sym, adj), i = idxOnOrBefore(s.date, ref), note = "";
    if (i < 0) { i = 0; note = " (from listing " + s.date[0] + ")"; }
    var base = s.val[i];
    return { x: s.date.slice(i), y: s.val.slice(i).map(function (v) { return v / base; }), base: base, baseDate: s.date[i], note: note };
  }
  function toMap(x, y) { var m = new Map(); x.forEach(function (d, i) { m.set(d, y[i]); }); return m; }

  // ===================================== OVERVIEW =====================================
  var foldOn = ["BTC-USD", "GBTC", "ETH-USD", "ETHE"];
  function renderKpis() {
    $("kpis").innerHTML = ORDER.map(function (s) {
      var L = S.latest[s];
      var c = function (v, lab) { return '<span class="' + cls(v) + '">' + lab + " " + spct(v / 100) + "</span>"; };
      return '<div class="stat-card"><span class="stat-card__label"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color(s) + ';margin-right:6px"></span>' + s + "</span>" +
        '<span class="stat-card__val">' + px(L.close) + "</span>" +
        '<span class="chg-row">' + c(L.chg_1d, "1D") + c(L.chg_7d, "7D") + c(L.chg_30d, "30D") + c(L.chg_365d, "1Y") + "</span>" +
        '<span class="stat-card__desc">' + L.label + " · close " + L.date + "</span></div>";
    }).join("");
  }
  function renderOverview() {
    renderKpis();
    var ref = $("refDate").value || P.ref_date, adj = $("totalRet").checked;
    chips($("foldAssets"), ORDER.map(function (s) { return { v: s, t: s, dot: color(s) }; }), foldOn, function (v) {
      var i = foldOn.indexOf(v); if (i >= 0) foldOn.splice(i, 1); else foldOn.push(v); renderOverview(); }, true);
    var rows = [], traces = ORDER.filter(function (s) { return foldOn.indexOf(s) >= 0; }).map(function (s) {
      var f = fold(s, ref, adj && isTrust(s)), last = f.y[f.y.length - 1], yrs = days(f.baseDate, f.x[f.x.length - 1]) / 365.25;
      rows.push("<tr><td>" + s + f.note + '</td><td class="num">' + f.baseDate + '</td><td class="num">' + px(f.base) + '</td><td class="num">' + px(f.base * last) +
        '</td><td class="num ' + cls(last - 1) + '">' + fmt(last, 3) + '×</td><td class="num ' + cls(last - 1) + '">' + (yrs > 0.25 ? spct(Math.pow(last, 1 / yrs) - 1) : "–") + "</td></tr>");
      return { x: f.x, y: f.y, name: s + f.note, type: "scatter", mode: "lines", line: { color: color(s), width: 1.8 },
               hovertemplate: "%{y:.3f}×<extra>" + s + "</extra>" };
    });
    Plotly.react("foldChart", traces, layout({ yaxis: { title: "Fold change", type: $("foldLog").checked ? "log" : "linear" },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1, line: { dash: "dot", color: css("--global-text-color-light"), width: 1 } }] }), CFG);
    $("foldTbl").innerHTML = '<thead><tr><th>Asset</th><th class="num">Base date</th><th class="num">Base price</th><th class="num">Latest</th><th class="num">Fold change</th><th class="num">Annualized</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
  }

  // ====================================== TRUSTS ======================================
  var RATIOS = [
    { id: "BTC/GBTC", a: "BTC-USD", b: "GBTC", note: "Coinbase BTC close ÷ GBTC close: the bitcoin price implied per share. It drifts upward as the trust's fee reduces the bitcoin held per share." },
    { id: "ETH/ETHE", a: "ETH-USD", b: "ETHE", note: "Coinbase ETH close ÷ ETHE close." },
    { id: "BTC/ETH", a: "BTC-USD", b: "ETH-USD", note: "BTC priced in ETH (the ratio in the original R script)." },
    { id: "ETH/BTC", a: "ETH-USD", b: "BTC-USD", note: "ETH priced in BTC." },
    { id: "ADA/BTC", a: "ADA-USD", b: "BTC-USD", note: "ADA priced in BTC." },
    { id: "GBTC $vol ÷ BTC $vol", a: "GBTC", b: "BTC-USD", vol: true, note: "Dollar-volume ratio: GBTC shares × close ÷ (Coinbase BTC volume × close). The original script divided raw volumes, which mixes shares with BTC. Shown on a log scale." },
    { id: "ETHE $vol ÷ ETH $vol", a: "ETHE", b: "ETH-USD", vol: true, note: "Dollar-volume ratio for the Ethereum pair. Shown on a log scale." }
  ];
  var ratioId = "BTC/GBTC";
  function renderTrusts() {
    var ref = $("refDate").value || P.ref_date, adj = $("totalRet").checked; $("spreadRef").textContent = ref;
    var traces = [["BTC-USD", "GBTC"], ["ETH-USD", "ETHE"]].map(function (pr) {
      var fc = fold(pr[0], ref, false), ft = fold(pr[1], ref, adj), mc = toMap(fc.x, fc.y), x = [], y = [];
      ft.x.forEach(function (d, i) { if (mc.has(d)) { x.push(d); y.push(mc.get(d) - ft.y[i]); } });
      return { x: x, y: y, name: pr[0] + " − " + pr[1], type: "scatter", mode: "lines", line: { color: color(pr[0]), width: 1.6 }, hovertemplate: "%{y:+.3f}<extra>" + pr[0] + " − " + pr[1] + "</extra>" };
    });
    Plotly.react("spreadChart", traces, layout({ yaxis: { title: "Fold-change difference" } }), CFG);

    chips($("ratioChips"), RATIOS.map(function (r) { return { v: r.id, t: r.id }; }), ratioId, function (v) { ratioId = v; renderTrusts(); });
    var r = RATIOS.filter(function (o) { return o.id === ratioId; })[0], A = P.assets[r.a], B = P.assets[r.b];
    var val = function (s, i) { return r.vol ? s.close[i] * s.volume[i] : s.close[i]; }, mb = new Map(), x2 = [], y2 = [];
    B.date.forEach(function (d, i) { mb.set(d, val(B, i)); });
    A.date.forEach(function (d, i) { var v = mb.get(d); if (v > 0 && val(A, i) > 0) { x2.push(d); y2.push(val(A, i) / v); } });
    Plotly.react("ratioChart", [{ x: x2, y: y2, type: "scatter", mode: "lines", name: r.id, line: { color: color(r.a), width: 1.6 } }],
      layout({ showlegend: false, yaxis: { title: r.id, type: (r.vol || $("ratioLog").checked) ? "log" : "linear" } }), CFG);
    $("ratioNote").textContent = r.note;
  }

  // ====================================== PRICES ======================================
  var priceSym = "BTC-USD";
  function renderPrices() {
    chips($("priceChips"), ORDER.map(function (s) { return { v: s, t: s, dot: color(s) }; }), priceSym, function (v) { priceSym = v; renderPrices(); });
    var a = P.assets[priceSym], dd = Stats.drawdown(a.close), c = color(priceSym);
    var traces = [
      { x: a.date, y: a.close, name: "Close", type: "scatter", mode: "lines", line: { color: c, width: 1.6 } },
      { x: a.date, y: a.volume, name: "Volume", type: "bar", yaxis: "y2", marker: { color: hexA(c, 0.45) } },
      { x: a.date, y: dd.series.map(function (v) { return 100 * v; }), name: "Drawdown", type: "scatter", mode: "lines", yaxis: "y3", fill: "tozeroy",
        line: { color: css("--global-down"), width: 1 }, fillcolor: hexA(css("--global-down"), 0.15), hovertemplate: "%{y:.1f}%" }
    ];
    if (a.adjclose) traces.splice(1, 0, { x: a.date, y: a.adjclose, name: "Adj. close (total return)", type: "scatter", mode: "lines", line: { color: css("--global-text-color-light"), width: 1, dash: "dot" } });
    Plotly.react("priceChart", traces, layout({
      yaxis: { title: "USD", type: $("priceLog").checked ? "log" : "linear", domain: [0.42, 1] },
      yaxis2: axis({ title: isTrust(priceSym) ? "Shares" : priceSym.split("-")[0], domain: [0.24, 0.38] }),
      yaxis3: axis({ title: "Drawdown %", domain: [0, 0.2] })
    }), CFG);
    var ath = a.close.indexOf(Math.max.apply(null, a.close)), n = a.close.length;
    var r1 = Stats.logReturns(a.close.slice(Math.max(0, n - 366))), k = isTrust(priceSym) ? 252 : 365, v = Stats.sdCI(r1, 0.95);
    $("priceStats").innerHTML = [
      ["All-time high in data", px(a.close[ath]), a.date[ath]],
      ["Below the high", pct(dd.series[n - 1]), "latest close " + px(a.close[n - 1]) + " on " + a.date[n - 1]],
      ["Maximum drawdown", pct(dd.max), a.date[dd.peak] + " → " + a.date[dd.trough]],
      ["Volatility, last 365 days", pct(v.est * Math.sqrt(k)), "95% CI " + pct(v.lo * Math.sqrt(k)) + " – " + pct(v.hi * Math.sqrt(k)) + ", annualized on " + k + " days"]
    ].map(function (r) { return '<div class="stat-card"><span class="stat-card__label">' + r[0] + '</span><span class="stat-card__val">' + r[1] + '</span><span class="stat-card__desc">' + r[2] + "</span></div>"; }).join("");
  }

  // ===================================== ANALYSIS =====================================
  var AN = { y: "GBTC", x: "BTC-USD", win: "1Y", freq: "D", level: 0.95 };
  var WINS = [{ v: "90D", d: 90 }, { v: "1Y", d: 365 }, { v: "2Y", d: 730 }, { v: "3Y", d: 1095 }, { v: "All", d: null }];
  function lastCommon() { return [AN.y, AN.x].map(function (s) { var d = P.assets[s].date; return d[d.length - 1]; }).sort()[0]; }
  function setWindow(v) {
    AN.win = v; var w = WINS.filter(function (o) { return o.v === v; })[0], to = lastCommon();
    $("winTo").value = to; $("winFrom").value = w.d ? shiftDate(to, -w.d) : "2021-01-01";
  }
  function periodKey(d, f) {
    if (f === "M") return d.slice(0, 7);
    if (f === "W") { var t = Date.parse(d) / 864e5; return String(Math.floor((t + 3) / 7)); }   // Monday-start weeks
    return d;
  }
  function matched() {
    var A = series(AN.y, $("anTR").checked && isTrust(AN.y)), B = series(AN.x, $("anTR").checked && isTrust(AN.x));
    var mb = toMap(B.date, B.val), from = $("winFrom").value, to = $("winTo").value, d = [], y = [], x = [];
    A.date.forEach(function (dt, i) { if (dt >= from && dt <= to && mb.has(dt)) { d.push(dt); y.push(A.val[i]); x.push(mb.get(dt)); } });
    var daily = { d: d.slice(), y: y.slice(), x: x.slice() };
    if (AN.freq !== "D") {                          // keep the last observation of each period
      var dd = [], yy = [], xx = [];
      for (var i = 0; i < d.length; i++) {
        if (i === d.length - 1 || periodKey(d[i], AN.freq) !== periodKey(d[i + 1], AN.freq)) { dd.push(d[i]); yy.push(y[i]); xx.push(x[i]); }
      }
      d = dd; y = yy; x = xx;
    }
    return { d: d, y: y, x: x, daily: daily };
  }
  function card(label, val, desc) { return '<div class="stat-card"><span class="stat-card__label">' + label + '</span><span class="stat-card__val">' + val + '</span><span class="stat-card__desc">' + desc + "</span></div>"; }
  function renderAnalysis() {
    var opts = ORDER.map(function (s) { return '<option value="' + s + '" title="' + P.assets[s].label + '">' + s + "</option>"; }).join("");
    if (!$("selY").options.length) { $("selY").innerHTML = opts; $("selX").innerHTML = opts; }
    $("selY").value = AN.y; $("selX").value = AN.x;
    chips($("winChips"), WINS.map(function (w) { return { v: w.v, t: w.v }; }), AN.win, function (v) { setWindow(v); renderAnalysis(); });
    chips($("freqChips"), [{ v: "D", t: "Daily" }, { v: "W", t: "Weekly" }, { v: "M", t: "Monthly" }], AN.freq, function (v) {
      AN.freq = v; $("roll").value = v === "D" ? 60 : v === "W" ? 26 : 12; renderAnalysis(); });
    chips($("lvlChips"), [{ v: "0.9", t: "90%" }, { v: "0.95", t: "95%" }, { v: "0.99", t: "99%" }], String(AN.level), function (v) { AN.level = +v; renderAnalysis(); });

    var m = matched(), L = AN.level, lv = Math.round(L * 100) + "%";
    var ry = Stats.logReturns(m.y), rx = Stats.logReturns(m.x), n = ry.length;
    var unit = { D: "days", W: "weeks", M: "months" }[AN.freq];
    var roll = Math.min(+$("roll").value, Math.max(10, Math.floor(n / 2)));
    $("rollVal").textContent = roll + " " + unit; $("lblY").textContent = AN.y + " ~ " + AN.x;
    if (AN.y === AN.x || n < 20) {
      $("anCards").innerHTML = "";
      $("anCallout").innerHTML = '<div class="callout callout-warning"><strong class="callout-title">Not enough data</strong>' +
        (AN.y === AN.x ? "Choose two different assets." : "Only " + n + " matched returns in this window; at least 20 are needed. Widen the window or use a higher frequency.") + "</div>";
      ["scatter", "hist", "rollChart", "ddChart"].forEach(function (id) { Plotly.purge(id); });
      return;
    }
    var yrs = days(m.d[0], m.d[m.d.length - 1]) / 365.25, ppy = n / yrs, sq = Math.sqrt(ppy);
    var o = Stats.ols(rx, ry, L), c = Stats.corCI(rx, ry, L), vy = Stats.sdCI(ry, L), vx = Stats.sdCI(rx, L), mu = Stats.meanCI(ry, L), mo = Stats.moments(ry);
    var te = Stats.sd(ry.map(function (v, i) { return v - rx[i]; })) * sq;
    var ddy = Stats.drawdown(m.daily.y), ddx = Stats.drawdown(m.daily.x);
    var ci = function (lo, hi, f) { return lv + " CI " + f(lo) + " – " + f(hi); };
    var f3 = function (v) { return fmt(v, 3); }, p1 = function (v) { return pct(v, 1); };
    $("anCards").innerHTML = [
      card("Beta (y on x)", fmt(o.beta, 3), ci(o.beta_lo, o.beta_hi, f3)),
      card("Correlation", fmt(c.est, 3), ci(c.lo, c.hi, f3)),
      card("R²", fmt(o.r2, 3), "share of y's variance explained by x"),
      card("Alpha, annualized", spct(o.alpha * ppy), ci(o.alpha_lo * ppy, o.alpha_hi * ppy, p1)),
      card("Volatility " + AN.y, pct(vy.est * sq), ci(vy.lo * sq, vy.hi * sq, p1)),
      card("Volatility " + AN.x, pct(vx.est * sq), ci(vx.lo * sq, vx.hi * sq, p1)),
      card("Mean log return " + AN.y, spct(mu.est * ppy), "annualized; " + ci(mu.lo * ppy, mu.hi * ppy, p1)),
      card("Tracking error", pct(te), "annualized SD of (y − x) returns"),
      card("Max drawdown", pct(ddy.max) + '<span class="unit"> y</span>', AN.x + ": " + pct(ddx.max)),
      card("Skew / excess kurtosis", fmt(mo.skew, 2) + " / " + fmt(mo.exkurt, 1), "of y returns; normal = 0 / 0"),
      card("Observations", fmt(n, 0), m.d[0] + " → " + m.d[m.d.length - 1] + " · " + fmt(ppy, 0) + " per year")
    ].join("");

    // plain-language reading
    var b1 = o.beta_lo > 1 ? "more than one-for-one" : o.beta_hi < 1 ? "less than one-for-one" : "not distinguishable from one-for-one";
    var a0 = o.alpha_lo > 0 ? "positive and its interval excludes zero" : o.alpha_hi < 0 ? "negative and its interval excludes zero" : "not distinguishable from zero";
    var html = '<div class="callout callout-info"><strong class="callout-title">Reading these numbers</strong>' +
      "Over " + m.d[0] + " to " + m.d[m.d.length - 1] + ", a 1% " + { D: "daily", W: "weekly", M: "monthly" }[AN.freq] + " move in " + AN.x + " went with a " +
      fmt(o.beta, 2) + "% move in " + AN.y + " (" + lv + " CI " + fmt(o.beta_lo, 2) + " to " + fmt(o.beta_hi, 2) + "): " + b1 + ". " +
      "The correlation is " + fmt(c.est, 2) + ", so " + AN.x + " explains about " + pct(o.r2, 0) + " of the variation in " + AN.y + "'s returns. " +
      "Annualized alpha is " + spct(o.alpha * ppy) + ", " + a0 + ".</div>";
    var trustPair = TRUST_OF[AN.y] === AN.x || TRUST_OF[AN.x] === AN.y;
    if (trustPair && AN.freq === "D") html += '<div class="callout callout-warning"><strong class="callout-title">Different closing times bias daily betas downward</strong>' +
      "The trust closes at 16:00 ET and Coinbase's daily bar at 00:00 UTC, and weekend crypto moves land in the trust's Monday return. Daily returns therefore understate the link. Switch to <strong>Weekly</strong> to see how much of the gap is timing.</div>";
    $("anCallout").innerHTML = html;

    // scatter with fit and mean-response band
    var xs = rx.map(function (v) { return 100 * v; }), ys = ry.map(function (v) { return 100 * v; });
    var xmin = Math.min.apply(null, rx), xmax = Math.max.apply(null, rx), grid = [];
    for (var g = 0; g <= 60; g++) grid.push(xmin + (xmax - xmin) * g / 60);
    var fit = grid.map(function (x) { return o.alpha + o.beta * x; });
    var half = grid.map(function (x) { return o.t * o.sigma * Math.sqrt(1 / n + (x - o.mx) * (x - o.mx) / o.sxx); });
    var th = css("--global-theme-color");
    Plotly.react("scatter", [
      { x: xs, y: ys, type: "scattergl", mode: "markers", name: "periods", text: m.d.slice(1),
        marker: { size: 5, color: m.d.slice(1).map(function (d, i) { return i; }), colorscale: [[0, hexA(css("--global-text-color-light"), 0.35)], [1, th]], opacity: 0.75 },
        hovertemplate: "%{text}<br>x %{x:.2f}%<br>y %{y:.2f}%<extra></extra>" },
      { x: grid.map(function (v) { return 100 * v; }), y: fit.map(function (v, i) { return 100 * (v + half[i]); }), mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: grid.map(function (v) { return 100 * v; }), y: fit.map(function (v, i) { return 100 * (v - half[i]); }), mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: hexA(th, 0.2), name: lv + " CI", hoverinfo: "skip" },
      { x: grid.map(function (v) { return 100 * v; }), y: fit.map(function (v) { return 100 * v; }), mode: "lines", name: "OLS fit, β = " + fmt(o.beta, 3), line: { color: th, width: 2 }, hoverinfo: "skip" }
    ], layout({ hovermode: "closest", xaxis: { title: AN.x + " return (%)" }, yaxis: { title: AN.y + " return (%)" } }, false), CFG);

    // histogram with normal overlay
    var my = Stats.mean(ys), sy = Stats.sd(ys), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), nx = [], ny = [];
    for (var k = 0; k <= 120; k++) { var xv = lo + (hi - lo) * k / 120; nx.push(xv); ny.push(Math.exp(-0.5 * Math.pow((xv - my) / sy, 2)) / (sy * Math.sqrt(2 * Math.PI))); }
    Plotly.react("hist", [
      { x: ys, type: "histogram", histnorm: "probability density", nbinsx: Math.min(80, Math.max(15, Math.round(Math.sqrt(n) * 1.5))), name: AN.y, marker: { color: hexA(color(AN.y), 0.6), line: { color: color(AN.y), width: 0.5 } } },
      { x: nx, y: ny, mode: "lines", name: "Normal fit", line: { color: css("--global-text-color"), width: 1.5, dash: "dot" } }
    ], layout({ hovermode: "closest", bargap: 0.02, xaxis: { title: AN.y + " return (%)" }, yaxis: { title: "Density" } }, false), CFG);

    // rolling correlation (with band) and beta
    var R = Stats.rolling(rx, ry, roll, L), rd = m.d.slice(1);
    Plotly.react("rollChart", [
      { x: rd, y: R.hi, mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip" },
      { x: rd, y: R.lo, mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: hexA(th, 0.18), name: "Correlation " + lv + " CI", hoverinfo: "skip" },
      { x: rd, y: R.r, mode: "lines", name: "Correlation", line: { color: th, width: 1.6 }, hovertemplate: "r %{y:.3f}" },
      { x: rd, y: R.beta, mode: "lines", name: "Beta", yaxis: "y2", line: { color: color(AN.y), width: 1.6 }, hovertemplate: "β %{y:.3f}" }
    ], layout({
      yaxis: { title: "Correlation", domain: [0.54, 1] }, yaxis2: axis({ title: "Beta", domain: [0, 0.44] }),
      shapes: [{ type: "line", xref: "paper", yref: "y2", x0: 0, x1: 1, y0: 1, y1: 1, line: { dash: "dot", color: css("--global-text-color-light"), width: 1 } }]
    }), CFG);

    // drawdowns in window (daily matched closes)
    Plotly.react("ddChart", [AN.y, AN.x].map(function (s, j) {
      var dd = j === 0 ? ddy : ddx;
      return { x: m.daily.d, y: dd.series.map(function (v) { return 100 * v; }), mode: "lines", name: s, line: { color: color(s), width: 1.5 }, hovertemplate: "%{y:.1f}%" };
    }), layout({ yaxis: { title: "Drawdown (%)" } }), CFG);
  }
  function initAnalysis() {
    $("selY").onchange = function () { AN.y = this.value; setWindow(AN.win); renderAnalysis(); };
    $("selX").onchange = function () { AN.x = this.value; setWindow(AN.win); renderAnalysis(); };
    $("swap").onclick = function () { var t = AN.y; AN.y = AN.x; AN.x = t; renderAnalysis(); };
    ["winFrom", "winTo"].forEach(function (id) { $(id).onchange = function () { AN.win = null; renderAnalysis(); }; });
    $("roll").oninput = renderAnalysis; $("anTR").onchange = renderAnalysis;
  }

  // ===================================== CARDANO =====================================
  var E0 = 532, T0 = Date.parse("2025-01-04T21:44:51Z"), ELEN = 432000e3;
  var epochAt = function (t) { return E0 + Math.floor((t - T0) / ELEN); };
  var epochStart = function (e) { return new Date(T0 + (e - E0) * ELEN); };
  function tickEpoch() {
    var now = Date.now(), e = epochAt(now), st = epochStart(e).getTime(), nx = st + ELEN, left = nx - now;
    $("epochNum").textContent = "Epoch " + e;
    $("epochBar").style.width = (100 * (now - st) / ELEN) + "%";
    var d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, mi = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1e3) % 60;
    $("epochTxt").textContent = pct((now - st) / ELEN) + " complete · epoch " + (e + 1) + " starts in " + d + "d " + h + "h " + mi + "m " + s + "s (" + new Date(nx).toLocaleString() + ")";
  }
  function renderCardano() {
    var e = epochAt(Date.now()), rows = [];
    for (var k = e + 2; k >= Math.max(E0, e - 12); k--) {
      var st = epochStart(k);
      rows.push("<tr><td>" + k + (k === e ? ' <span class="badge badge-success">current</span>' : "") + '</td><td class="num">' + st.toISOString().replace("T", " ").slice(0, 16) + ' UTC</td><td class="num">' + st.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) + "</td></tr>");
    }
    $("epochTbl").innerHTML = '<thead><tr><th>Epoch</th><th class="num">Start (UTC)</th><th class="num">Start (local)</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
    if (RW.length) renderRewards();
  }
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += ch;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    var hdr = rows.shift().map(function (h) { return h.trim(); });
    return rows.filter(function (r) { return r.length > 1; }).map(function (r) { var o = {}; hdr.forEach(function (h, i) { o[h] = (r[i] || "").trim(); }); return o; });
  }
  var RW = [];
  var num = function (v) { return parseFloat(String(v).replace(/[^0-9.\-eE]/g, "")); };
  async function loadFiles(files) {
    var seen = new Set(RW.map(function (r) { return r._key; }));
    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi], fileDate = (file.name.match(/\d{4}-\d{2}-\d{2}/) || [""])[0], recs = parseCSV(await file.text());
      recs.forEach(function (r) {
        var key = JSON.stringify(Object.keys(r).filter(function (k) { return !/wallet|address/i.test(k); }).map(function (k) { return [k, r[k]]; }));
        if (seen.has(key)) return; seen.add(key);                // same de-duplication idea as Proj_Cardano_Rewards.R
        r._key = key; r._file = file.name; r._fileDate = fileDate; RW.push(r);
      });
    }
    if (!RW.length) return;
    var cols = Object.keys(RW[0]).filter(function (c) { return c[0] !== "_"; });
    var numeric = cols.filter(function (c) { return !/epoch/i.test(c) && RW.some(function (r) { return r[c] !== "" && !isNaN(num(r[c])); }); });
    var src = cols.filter(function (c) { return /epoch/i.test(c); }).map(function (c) { return "epoch:" + c; })
      .concat(cols.filter(function (c) { return RW.some(function (r) { return /\d{4}/.test(r[c]) && !isNaN(Date.parse(r[c])); }); }), ["_fileDate"]);
    var label = function (o) { return o === "_fileDate" ? "date in file name" : o.indexOf("epoch:") === 0 ? o.slice(6) + " (epoch number)" : o + " (date)"; };
    $("rwCol").innerHTML = numeric.map(function (o) { return '<option value="' + o + '">' + o + "</option>"; }).join("");
    var pref = numeric.filter(function (c) { return /reward|amount|ada/i.test(c); })[0]; if (pref) $("rwCol").value = pref;
    $("rwDate").innerHTML = src.map(function (o) { return '<option value="' + o + '">' + label(o) + "</option>"; }).join("");
    $("rwControls").hidden = false; $("rwChart").hidden = false; $("rwStats").hidden = false;
    renderRewards();
  }
  function renderRewards() {
    var col = $("rwCol").value, dc = $("rwDate").value;
    var epochOf = function (r) {
      if (dc.indexOf("epoch:") === 0) return parseInt(r[dc.slice(6)], 10);
      var t = Date.parse(dc === "_fileDate" ? r._fileDate + "T12:00:00Z" : r[dc]); return isNaN(t) ? NaN : epochAt(t);
    };
    var by = new Map();
    RW.forEach(function (r) { var e = epochOf(r), v = num(r[col]); if (!isNaN(e) && !isNaN(v)) by.set(e, (by.get(e) || 0) + v); });
    var eps = Array.from(by.keys()).sort(function (a, b) { return a - b; }), vals = eps.map(function (e) { return by.get(e); });
    var tot = vals.reduce(function (a, b) { return a + b; }, 0);
    var mc = vals.length >= 3 ? Stats.meanCI(vals, 0.95) : null;
    $("rwStats").innerHTML = card("Total", fmt(tot, 3), col) + card("Epochs", eps.length, eps.length ? eps[0] + " → " + eps[eps.length - 1] : "") +
      card("Mean per epoch", mc ? fmt(mc.est, 3) : "–", mc ? "95% CI " + fmt(mc.lo, 3) + " – " + fmt(mc.hi, 3) : "needs 3+ epochs");
    Plotly.react("rwChart", [{ x: eps.map(String), y: vals, type: "bar", name: col, marker: { color: color("ADA-USD") } }],
      layout({ showlegend: false, hovermode: "closest", xaxis: { title: "Epoch", type: "category" }, yaxis: { title: col } }, false), CFG);
    var cols = Object.keys(RW[0]).filter(function (c) { return c[0] !== "_"; }).slice(0, 6);
    $("rwTbl").innerHTML = "<thead><tr><th>Epoch</th>" + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      RW.slice(0, 300).map(function (r) { var e = epochOf(r); return "<tr><td>" + (isNaN(e) ? "–" : e) + "</td>" + cols.map(function (c) { return "<td>" + r[c] + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody>";
  }
  function initDrop() {
    var d = $("drop"), inp = $("fileIn");
    d.onclick = function () { inp.click(); }; inp.onchange = function () { loadFiles(inp.files); };
    d.ondragover = function (e) { e.preventDefault(); d.classList.add("hover"); };
    d.ondragleave = function () { d.classList.remove("hover"); };
    d.ondrop = function (e) { e.preventDefault(); d.classList.remove("hover"); loadFiles(e.dataTransfer.files); };
    $("rwCol").onchange = renderRewards; $("rwDate").onchange = renderRewards;
  }

  // ====================================== TABS ======================================
  var RENDER = { overview: renderOverview, trusts: renderTrusts, prices: renderPrices, analysis: renderAnalysis, cardano: renderCardano };
  function render(tab) { try { RENDER[tab](); } catch (e) { console.error(e); } }
  function activate(tab) {
    if (!RENDER[tab]) tab = "overview";
    current = tab;
    document.querySelectorAll(".tab-button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === tab); });
    document.querySelectorAll(".navbar__links a[data-tab]").forEach(function (a) { a.classList.toggle("is-current", a.getAttribute("data-tab") === tab); });
    document.querySelectorAll(".tab-content").forEach(function (s) { s.classList.toggle("active", s.id === "tab-" + tab); });
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
    if (P) render(tab);
  }
  document.querySelectorAll("[data-tab]").forEach(function (el) {
    el.addEventListener("click", function (ev) { ev.preventDefault(); activate(el.getAttribute("data-tab")); });
  });
  window.addEventListener("hashchange", function () { activate(location.hash.slice(1)); });
  activate(location.hash.slice(1) || "overview");

  // ====================================== BOOT ======================================
  Promise.all(["data/prices.json", "data/summary.json"].map(function (u) {
    return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
  })).then(function (res) {
    P = res[0]; S = res[1];
    $("meta-crypto").textContent = S.latest["BTC-USD"].date;
    $("meta-nyse").textContent = S.latest["GBTC"].date;
    $("meta-run").textContent = S.generated_utc.replace("T", " ").replace("Z", " UTC");
    var ri = $("refDate"); ri.value = P.ref_date; ri.min = "2021-01-01"; ri.max = S.latest["BTC-USD"].date;
    ["refDate", "totalRet", "foldLog"].forEach(function (id) { $(id).onchange = renderOverview; });
    $("ratioLog").onchange = renderTrusts; $("priceLog").onchange = renderPrices;
    setWindow("1Y"); initAnalysis(); initDrop();
    tickEpoch(); setInterval(tickEpoch, 1000);
    render(current);
  }).catch(function (e) {
    $("kpis").innerHTML = '<div class="callout callout-danger"><strong class="callout-title">Could not load data</strong>' + e.message +
      ". If you opened the file directly, serve the docs/ folder with a web server (python3 -m http.server).</div>";
  });
})();
