/* Funds: premium/discount to holdings, fee drag (Grayscale vs iShares), coin-minus-fund spread, ratios.
 * URL keys: drag, ratio, rlog */
(function () {
  "use strict";
  var A = window.App, $ = A.$;

  // ---- premium / discount -----------------------------------------------------------
  // Reported figures used to check the reconstruction (sources in docs/data/events.json and README).
  var CHECKS = [
    { fund: "GBTC", date: "2023-08-28", reported: -0.25, label: "day before the court ruling (reported ≈ −25%)" },
    { fund: "GBTC", date: "2023-08-29", reported: -0.175, label: "day of the court ruling (reported ≈ −17% to −18%)" }
  ];
  function renderPremium() {
    var F = A.data.F.funds, names = Object.keys(F), traces = [], cards = [];
    names.forEach(function (s) {
      var f = F[s], p = f.premium.map(function (v) { return v == null ? null : 100 * v; });
      traces.push({ x: f.date, y: p, name: A.short(s), mode: "lines", line: { color: A.color(s), width: 1.5 }, hovertemplate: "%{y:.2f}%<extra>" + A.short(s) + "</extra>" });
      var n = p.length, last = p[n - 1], minI = 0, maxI = 0;
      p.forEach(function (v, i) { if (v < p[minI]) minI = i; if (v > p[maxI]) maxI = i; });
      cards.push(A.card(A.short(s) + " latest", A.spct(last / 100, 2), "close " + f.date[n - 1] + " · holds " + A.fmt(f.units[n - 1], 6) + " " + A.short(f.underlying) + "/share",
        "Market price divided by the estimated value of the crypto per share at 16:00 ET, minus 1."));
      cards.push(A.card(A.short(s) + " widest discount", A.spct(p[minI] / 100, 1), "on " + f.date[minI] + "; highest premium " + A.spct(p[maxI] / 100, 1) + " on " + f.date[maxI]));
      cards.push(A.card(A.short(s) + " as an ETF", A.spct(f.check.etf_era_median_premium, 2), "median since " + f.etf_since + "; middle half within " +
        A.fmt(100 * f.check.etf_era_iqr, 2) + " pp", "Once a fund can create and redeem shares, arbitrage keeps it near zero. A median near 0% here is the check that the reconstruction is right."));
    });
    $("premCards").innerHTML = cards.join("");
    var L = A.layout({ yaxis: { title: "Premium (+) / discount (−), %" },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: A.css("--global-text-color-light"), width: 1 } }] });
    A.withEvents(traces, L, names, null);
    A.plot("premChart", traces, L, "Estimated premium or discount to holdings for " + names.join(" and ") + ".");
    // live check against reported figures
    var g = F.GBTC, rows = CHECKS.map(function (c) {
      var i = g.date.indexOf(c.date); return i < 0 ? "" : "<li>" + c.date + ", " + c.label + ": reconstructed <strong>" + A.spct(g.premium[i], 1) + "</strong></li>";
    }).join("");
    var fees = function (s) { return F[s].fees.map(function (f) { return A.pct(f.rate, 1) + " from " + f.from; }).join(", then "); };
    $("premMethod").innerHTML = '<div class="callout callout-info"><strong class="callout-title">How this is estimated, and how it is checked</strong>' +
      "Grayscale publishes the crypto held per share each day, but not as a downloadable history. The page starts from a published value (GBTC: " +
      A.fmt(g.anchor.units_per_share, 8) + " BTC/share on " + g.anchor.date + "; ETHE: " + A.fmt(F.ETHE.anchor.units_per_share, 8) + " ETH/share on " + F.ETHE.anchor.date + ") " +
      "and rolls it through the fee schedule (GBTC " + fees("GBTC") + "; ETHE " + fees("ETHE") + "), which accrues daily. The value of the holdings uses Coinbase's price at 16:00 ET, the NYSE close. " +
      "<ul style=\"margin:0.6rem 0 0 1.2rem\">" + rows +
      "<li>As ETFs, both funds' median premiums are within ±0.05% of zero, as arbitrage requires.</li>" +
      "<li>The July 2024 spin-offs of about 10% of each fund into the Grayscale Mini Trusts are already reflected in Yahoo's adjusted price history, so they are not subtracted again. The flat ETF-era premium across those dates confirms this.</li></ul></div>";
  }

  // ---- fee drag -----------------------------------------------------------------------
  var DRAGS = [{ v: "GBTC|IBIT", a: "GBTC", b: "IBIT" }, { v: "ETHE|ETHA", a: "ETHE", b: "ETHA" }];
  function feeNow(s) { var f = A.meta(s).fees; return f[f.length - 1].rate; }
  function renderDrag() {
    var pick = A.get("trusts", "drag", "GBTC|IBIT"), d = DRAGS.filter(function (o) { return o.v === pick; })[0] || DRAGS[0];
    A.chips($("dragChips"), DRAGS.map(function (o) { return { v: o.v, t: A.short(o.a) + " vs " + A.short(o.b) }; }), d.v, function (v) { A.set("trusts", "drag", v); renderDrag(); });
    var sa = A.series(d.a, true), sb = A.series(d.b, true), start = A.meta(d.b).date[0] > A.meta(d.a).date[0] ? A.meta(d.b).date[0] : A.meta(d.a).date[0];
    start = start < A.meta(d.b).etf_since ? A.meta(d.b).etf_since : start;
    start = A.shiftDate(start, 30);   // skip the first month: GBTC/ETHE's leftover discount closed then, which is not fee drag
    var m = A.match(sa, sb, start), n = m.d.length;
    var gA = m.a.map(function (v) { return 10000 * v / m.a[0]; }), gB = m.b.map(function (v) { return 10000 * v / m.b[0]; });
    var t = m.d.map(function (x) { return A.days(m.d[0], x); }), lr = m.a.map(function (v, i) { return Math.log(v / m.a[0]) - Math.log(m.b[i] / m.b[0]); });
    var h = Stats.olsHAC(t, lr, 0.95), ann = function (b) { return Math.exp(365.25 * b) - 1; };
    var expected = -(feeNow(d.a) - feeNow(d.b)), est = ann(h.beta), lo = ann(h.beta_lo), hi = ann(h.beta_hi);
    $("dragCards").innerHTML = [
      A.card("Measured drag per year", A.spct(est, 2), "95% CI " + A.spct(lo, 2) + " to " + A.spct(hi, 2) + " (Newey-West)",
        "Slope of log(" + A.short(d.a) + " ÷ " + A.short(d.b) + ") total return against time, annualized. Newey-West standard errors allow for autocorrelated daily noise."),
      A.card("Fee schedules imply", A.spct(expected, 2), A.short(d.a) + " " + A.pct(feeNow(d.a), 2) + " vs " + A.short(d.b) + " " + A.pct(feeNow(d.b), 2) + " a year"),
      A.card("$10,000 since " + m.d[0], A.usd(gA[n - 1]) + " vs " + A.usd(gB[n - 1]), "gap " + A.usd(gA[n - 1] - gB[n - 1]) + " (" + A.spct(gA[n - 1] / gB[n - 1] - 1, 2) + ")")
    ].join("");
    var traces = [
      { x: m.d, y: gA, name: A.short(d.a), mode: "lines", line: { color: A.color(d.a), width: 1.6, dash: "dot" }, hovertemplate: "$%{y:,.0f}<extra>" + A.short(d.a) + "</extra>" },
      { x: m.d, y: gB, name: A.short(d.b), mode: "lines", line: { color: A.color(d.b), width: 1.6 }, hovertemplate: "$%{y:,.0f}<extra>" + A.short(d.b) + "</extra>" },
      { x: m.d, y: lr.map(function (v) { return 100 * v; }), name: "Cumulative gap (%)", mode: "lines", yaxis: "y2", line: { color: A.css("--global-down"), width: 1.4 }, hovertemplate: "%{y:.2f}%<extra>gap</extra>" },
      { x: m.d, y: t.map(function (x) { return 100 * (h.alpha + h.beta * x); }), name: "Trend", mode: "lines", yaxis: "y2", line: { color: A.css("--global-text-color-light"), width: 1, dash: "dash" }, hoverinfo: "skip" }
    ];
    var L = A.layout({ yaxis: { title: "Growth of $10,000 (total return)", domain: [0.4, 1] }, yaxis2: A.axis({ title: "Gap, %", domain: [0, 0.32] }) });
    A.withEvents(traces, L, [d.a, d.b], m.d[0]);
    A.plot("dragChart", traces, L, "Growth of $10,000 in " + A.short(d.a) + " and " + A.short(d.b) + " since " + m.d[0] + ", with the cumulative gap. Measured drag " + A.spct(est, 2) + " per year.");
    var inCI = expected >= lo && expected <= hi;
    var stake = d.a === "ETHE" ? " ETHE also stakes most of its ether and pays the net rewards out in cash (total return here reinvests them), which offsets part of its fee. ETHA does not stake." : "";
    $("dragNote").innerHTML = '<div class="callout ' + (inCI ? "callout-success" : "callout-info") + '"><strong class="callout-title">' +
      (inCI ? "The measured drag matches the fee difference" : "The measured drag differs from the headline fee difference") + "</strong>" +
      "Measured: " + A.spct(est, 2) + " a year (" + A.spct(lo, 2) + " to " + A.spct(hi, 2) + "); fee schedules: " + A.spct(expected, 2) + ". " +
      (inCI ? "The fee schedule's figure lies inside the interval." : "The fee schedule's figure lies outside the interval. Besides the fee, the gap includes tracking differences, premium noise and the waiver that reduced iShares' fee in its first year.") + stake + "</div>";
  }

  // ---- spread and ratios ----------------------------------------------------------------
  function renderSpread() {
    var ref = A.get("overview", "ref", A.data.P.ref_date), tr = A.get("overview", "tr", "1") === "1"; $("spreadRef").textContent = ref;
    var funds = A.symbols(function (m) { return m.kind === "fund"; }), traces = funds.map(function (f) {
      // both legs start from the same base date: the reference date, or the fund's first trading day if later
      var c = A.meta(f).underlying, base = A.meta(f).date[0] > ref ? A.meta(f).date[0] : ref;
      var fc = A.fold(c, base, false), ff = A.fold(f, base, tr), mc = A.toMap(fc.x, fc.y), x = [], y = [];
      ff.x.forEach(function (d, i) { if (mc.has(d)) { x.push(d); y.push(mc.get(d) - ff.y[i]); } });
      return { x: x, y: y, name: A.short(c) + " − " + A.short(f) + (base > ref ? " (from " + base + ")" : ""), mode: "lines", line: { color: A.color(f), width: 1.5, dash: A.dash(f) }, hovertemplate: "%{y:+.3f}<extra>" + A.short(c) + " − " + A.short(f) + "</extra>" };
    });
    var L = A.layout({ yaxis: { title: "Fold-change difference" } });
    A.withEvents(traces, L, funds, ref);
    A.plot("spreadChart", traces, L, "Coin minus fund fold-change difference since " + ref + ".");
  }
  function ratios() {
    var r = [];
    A.symbols(function (m) { return m.kind === "fund"; }).forEach(function (f) {
      var c = A.meta(f).underlying;
      r.push({ id: A.short(c) + "/" + A.short(f), a: c, b: f, note: "Coinbase " + A.short(c) + " close ÷ " + A.short(f) + " close: the coin price implied per share. It drifts up as the fee reduces the coin held per share." });
    });
    r.push({ id: "BTC/ETH", a: "BTC-USD", b: "ETH-USD", note: "BTC priced in ETH (the ratio in the original R script)." });
    r.push({ id: "ETH/BTC", a: "ETH-USD", b: "BTC-USD", note: "ETH priced in BTC." });
    r.push({ id: "SOL/ETH", a: "SOL-USD", b: "ETH-USD", note: "SOL priced in ETH." });
    r.push({ id: "ADA/BTC", a: "ADA-USD", b: "BTC-USD", note: "ADA priced in BTC." });
    r.push({ id: "GBTC $vol ÷ IBIT $vol", a: "GBTC", b: "IBIT", vol: true, note: "Dollar trading volume of GBTC relative to IBIT (log scale): how trading migrated to the cheaper fund." });
    r.push({ id: "GBTC $vol ÷ BTC $vol", a: "GBTC", b: "BTC-USD", vol: true, note: "GBTC dollar volume ÷ Coinbase BTC dollar volume (log scale). The original script divided raw volumes, which mixes shares with BTC." });
    return r;
  }
  function renderRatio() {
    var R = ratios(), id = A.get("trusts", "ratio", R[0].id), r = R.filter(function (o) { return o.id === id; })[0] || R[0], lg = A.get("trusts", "rlog", "0") === "1";
    $("ratioLog").checked = lg;
    A.chips($("ratioChips"), R.map(function (o) { return { v: o.id, t: o.id }; }), r.id, function (v) { A.set("trusts", "ratio", v); renderRatio(); });
    var Aa = A.meta(r.a), Bb = A.meta(r.b), val = function (s, i) { return r.vol ? s.close[i] * s.volume[i] : s.close[i]; }, mb = new Map(), x = [], y = [];
    Bb.date.forEach(function (d, i) { mb.set(d, val(Bb, i)); });
    Aa.date.forEach(function (d, i) { var v = mb.get(d); if (v > 0 && val(Aa, i) > 0) { x.push(d); y.push(val(Aa, i) / v); } });
    var traces = [{ x: x, y: y, mode: "lines", name: r.id, line: { color: A.color(r.b), width: 1.5 } }];
    var L = A.layout({ showlegend: false, yaxis: { title: r.id, type: (r.vol || lg) ? "log" : "linear" } });
    A.withEvents(traces, L, [r.a, r.b], x[0]);
    A.plot("ratioChart", traces, L, "Ratio " + r.id + " over time.");
    $("ratioNote").textContent = r.note;
  }
  function render() { renderPremium(); renderDrag(); renderSpread(); renderRatio(); }
  function init() { $("ratioLog").onchange = function () { A.set("trusts", "rlog", this.checked ? "1" : "0"); renderRatio(); }; }
  A.register("trusts", { init: init, render: render });
})();
