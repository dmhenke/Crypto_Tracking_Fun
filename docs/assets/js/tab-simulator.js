/* Simulator: lump sum or recurring purchases into several assets. URL keys: a, mode, amt, from, to, fee, tr */
(function () {
  "use strict";
  var A = window.App, $ = A.$, T = "simulator";
  var MODES = [{ v: "lump", t: "Lump sum" }, { v: "W", t: "Weekly" }, { v: "M", t: "Monthly" }];

  // Money-weighted (internal) rate of return, annualized, by bisection on the NPV.
  function irr(flows) {
    var t0 = Date.parse(flows[0].d), npv = function (r) { return flows.reduce(function (s, f) { return s + f.v / Math.pow(1 + r, (Date.parse(f.d) - t0) / (365.25 * 864e5)); }, 0); };
    var lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi);
    if (flo * fhi > 0) return NaN;
    for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2, fm = npv(mid); if (flo * fm <= 0) { hi = mid; } else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  }
  function periodStart(d, mode) {
    if (mode === "M") return d.slice(0, 7);
    if (mode === "W") return String(Math.floor((Date.parse(d) / 864e5 + 3) / 7));
    return "all";
  }
  function simulate(s, from, to, mode, amt, fee, tr) {
    var se = A.series(s, tr && A.isFund(s)), units = 0, invested = 0, flows = [], x = [], v = [], inv = [], last = null, first = null;
    for (var i = 0; i < se.date.length; i++) {
      var d = se.date[i]; if (d < from || d > to) continue;
      if (first === null) first = d;
      var key = periodStart(d, mode);
      if ((mode === "lump" && units === 0) || (mode !== "lump" && key !== last)) {
        units += amt * (1 - fee) / se.val[i]; invested += amt; flows.push({ d: d, v: -amt }); last = key;
      }
      x.push(d); v.push(units * se.val[i]); inv.push(invested);
    }
    if (!x.length) return null;
    var final = v[v.length - 1]; flows.push({ d: x[x.length - 1], v: final });
    var dd = Stats.drawdown(se.val.slice(se.date.indexOf(x[0]), se.date.indexOf(x[x.length - 1]) + 1));
    return { x: x, v: v, inv: inv, invested: invested, final: final, irr: irr(flows), first: first, buys: flows.length - 1, dd: dd.max };
  }
  function render() {
    var syms = A.get(T, "a", "BTC-USD,GBTC,IBIT").split(",").filter(function (s) { return A.data.P.assets[s]; });
    var mode = A.get(T, "mode", "W"), amt = Math.max(1, +A.get(T, "amt", mode === "lump" ? 10000 : 100)), fee = +A.get(T, "fee", "0") / 100, tr = A.get(T, "tr", "1") === "1";
    var from = A.get(T, "from", "2024-01-11"), to = A.get(T, "to", A.lastDate("GBTC"));
    $("simAmt").value = amt; $("simFrom").value = from; $("simTo").value = to; $("simFee").value = fee * 100; $("simFeeVal").textContent = A.fmt(fee * 100, 2) + "%"; $("simTR").checked = tr;
    A.assetChips($("simAssets"), A.symbols(), syms, function (v) { var i = syms.indexOf(v); if (i >= 0) syms.splice(i, 1); else syms.push(v); A.set(T, "a", syms.join(",")); render(); }, true);
    A.chips($("simMode"), MODES, mode, function (v) { A.set(T, "mode", v); A.set(T, "amt", v === "lump" ? 10000 : 100); render(); });
    var res = [], traces = [], late = [];
    syms.forEach(function (s) {
      var r = simulate(s, from, to, mode, amt, fee, tr); if (!r) return; r.s = s; res.push(r);
      if (r.first > from) late.push(A.short(s) + " (first price " + r.first + ")");
      traces.push({ x: r.x, y: r.v, name: A.short(s), mode: "lines", line: { color: A.color(s), width: 1.7, dash: A.dash(s) }, hovertemplate: "$%{y:,.0f}<extra>" + A.short(s) + "</extra>" });
    });
    if (mode !== "lump" && res.length) {
      var lng = res.reduce(function (a, b) { return a.x.length >= b.x.length ? a : b; });
      traces.push({ x: lng.x, y: lng.inv, name: "Invested", mode: "lines", line: { color: A.css("--global-text-color-light"), width: 1, dash: "dash" }, hovertemplate: "$%{y:,.0f}<extra>invested</extra>" });
    }
    var L = A.layout({ yaxis: { title: "Portfolio value ($)" } }); A.withEvents(traces, L, syms, from);
    A.plot("simChart", traces, L, "Hypothetical value of " + (mode === "lump" ? "a $" + amt + " lump sum" : "$" + amt + " " + (mode === "W" ? "weekly" : "monthly") + " purchases") + " from " + from + " to " + to + ".");
    res.sort(function (a, b) { return b.final - a.final; });
    $("simTbl").innerHTML = '<thead><tr><th>Asset</th><th class="num">Invested</th><th class="num">Value</th><th class="num">Gain</th><th class="num">' +
      A.tip("Annual return", "Money-weighted (internal) rate of return, annualized: the constant yearly rate that turns the purchases into the final value.") +
      '</th><th class="num">' + A.tip("Worst drop", "Largest peak-to-trough fall of the asset's price during the period.") + "</th></tr></thead><tbody>" +
      res.map(function (r) { var g = r.final / r.invested - 1;
        return "<tr><td>" + A.short(r.s) + '</td><td class="num">' + A.usd(r.invested) + '</td><td class="num">' + A.usd(r.final) + '</td><td class="num ' + A.cls(g) + '">' + A.spct(g) +
          '</td><td class="num ' + A.cls(r.irr) + '">' + A.spct(r.irr) + '</td><td class="num">' + A.pct(r.dd) + "</td></tr>"; }).join("") + "</tbody>";
    var best = res[0], worst = res[res.length - 1];
    $("simNote").innerHTML = res.length > 1 ? '<div class="callout callout-info"><strong class="callout-title">Same money, different vehicles</strong>' +
      "Over this period " + A.short(best.s) + " ended at " + A.usd(best.final) + " and " + A.short(worst.s) + " at " + A.usd(worst.final) + ", a difference of " + A.usd(best.final - worst.final) +
      ". Funds that hold the same coin differ mainly by fees and, before 2024, by the premium or discount they traded at." +
      (late.length ? " Started late because no earlier price exists: " + late.join(", ") + "." : "") + " Past results say nothing reliable about future returns.</div>" : "";
  }
  function init() {
    $("simAmt").onchange = function () { A.set(T, "amt", this.value); render(); };
    $("simFrom").onchange = function () { A.set(T, "from", this.value); render(); };
    $("simTo").onchange = function () { A.set(T, "to", this.value); render(); };
    $("simFee").oninput = function () { A.set(T, "fee", this.value); render(); };
    $("simTR").onchange = function () { A.set(T, "tr", this.checked ? "1" : "0"); render(); };
  }
  A.register(T, { init: init, render: render });
})();
