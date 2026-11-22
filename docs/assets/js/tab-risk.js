/* Risk: correlation heatmap and rolling volatility. URL keys: hw, hf, ha, ra, rw */
(function () {
  "use strict";
  var A = window.App, $ = A.$, T = "risk";
  var WINS = [{ v: "90D", d: 90 }, { v: "1Y", d: 365 }, { v: "3Y", d: 1095 }, { v: "All", d: null }];
  function periodKey(d, f) { if (f === "M") return d.slice(0, 7); if (f === "W") return String(Math.floor((Date.parse(d) / 864e5 + 3) / 7)); return d; }
  function list(k, d) { return A.get(T, k, d).split(",").filter(function (s) { return A.data.P.assets[s]; }); }

  function renderHeat() {
    var w = A.get(T, "hw", "1Y"), f = A.get(T, "hf", "D"), syms = list("ha", A.symbols().join(","));
    A.chips($("hmWin"), WINS.map(function (o) { return { v: o.v, t: o.v }; }), w, function (v) { A.set(T, "hw", v); renderHeat(); });
    A.chips($("hmFreq"), [{ v: "D", t: "Daily" }, { v: "W", t: "Weekly" }], f, function (v) { A.set(T, "hf", v); renderHeat(); });
    A.assetChips($("hmAssets"), A.symbols(), syms, function (v) { var i = syms.indexOf(v); if (i >= 0) syms.splice(i, 1); else syms.push(v); A.set(T, "ha", syms.join(",")); renderHeat(); }, true);
    var to = syms.map(A.lastDate).sort()[0], wd = WINS.filter(function (o) { return o.v === w; })[0].d, from = wd ? A.shiftDate(to, -wd) : "2021-01-01";
    var z = [], txt = [], hov = [];
    syms.forEach(function (a, i) {
      z.push([]); txt.push([]); hov.push([]);
      syms.forEach(function (b, j) {
        if (i === j) { z[i].push(1); txt[i].push("1"); hov[i].push(A.short(a)); return; }
        var m = A.match(A.series(a, true), A.series(b, true), from, to), d = [], pa = [], pb = [];
        for (var k = 0; k < m.d.length; k++) if (f === "D" || k === m.d.length - 1 || periodKey(m.d[k], f) !== periodKey(m.d[k + 1], f)) { d.push(m.d[k]); pa.push(m.a[k]); pb.push(m.b[k]); }
        if (pa.length < 12) { z[i].push(null); txt[i].push(""); hov[i].push("too few observations"); return; }
        var c = Stats.corCI(Stats.logReturns(pa), Stats.logReturns(pb), 0.95);
        z[i].push(c.est); txt[i].push(A.fmt(c.est, 2));
        hov[i].push(A.short(a) + " vs " + A.short(b) + "<br>r = " + A.fmt(c.est, 3) + " (95% CI " + A.fmt(c.lo, 2) + " – " + A.fmt(c.hi, 2) + ")<br>n = " + (pa.length - 1));
      });
    });
    var labels = syms.map(A.short), th = A.css("--global-theme-color"), bg = A.css("--global-card-bg-color");
    A.plot("heat", [{ type: "heatmap", z: z, x: labels, y: labels, text: txt, texttemplate: "%{text}", customdata: hov, hovertemplate: "%{customdata}<extra></extra>",
      zmin: -1, zmax: 1, colorscale: [[0, A.css("--global-down")], [0.5, bg], [1, th]], xgap: 2, ygap: 2, colorbar: { title: "r", thickness: 12 } }],
      A.layout({ hovermode: "closest", margin: { l: 70, r: 20, t: 20, b: 60 }, yaxis: { autorange: "reversed", gridcolor: "rgba(0,0,0,0)" }, xaxis: { gridcolor: "rgba(0,0,0,0)", side: "bottom" } }, false),
      "Correlation matrix of " + ({ D: "daily", W: "weekly" })[f] + " returns over " + from + " to " + to + " for " + labels.join(", ") + ".");
  }
  function renderVol() {
    var syms = list("ra", "BTC-USD,ETH-USD,ADA-USD,GBTC"), w = +A.get(T, "rw", "30");
    A.assetChips($("rvAssets"), A.symbols(), syms, function (v) { var i = syms.indexOf(v); if (i >= 0) syms.splice(i, 1); else syms.push(v); A.set(T, "ra", syms.join(",")); renderVol(); }, true);
    A.chips($("rvWin"), [30, 60, 90].map(function (v) { return { v: String(v), t: v + "-day" }; }), String(w), function (v) { A.set(T, "rw", v); renderVol(); });
    var rows = [], traces = syms.map(function (s) {
      var a = A.meta(s), r = Stats.logReturns(a.close), k = a.kind === "fund" ? 252 : 365, x = [], y = [];
      for (var i = w - 1; i < r.length; i++) { x.push(a.date[i + 1]); y.push(100 * Stats.sd(r.slice(i - w + 1, i + 1)) * Math.sqrt(k)); }
      var v = Stats.sdCI(r.slice(-w), 0.95), v1 = Stats.sdCI(r.slice(-Math.min(r.length, a.kind === "fund" ? 252 : 365)), 0.95);
      rows.push("<tr><td>" + A.short(s) + '</td><td class="num">' + A.pct(v.est * Math.sqrt(k)) + '</td><td class="num">' + A.pct(v.lo * Math.sqrt(k)) + " – " + A.pct(v.hi * Math.sqrt(k)) +
        '</td><td class="num">' + A.pct(v1.est * Math.sqrt(k)) + '</td><td class="num">' + A.pct(Math.min.apply(null, y) / 100) + " – " + A.pct(Math.max.apply(null, y) / 100) + "</td></tr>");
      return { x: x, y: y, name: A.short(s), mode: "lines", line: { color: A.color(s), width: 1.5, dash: A.dash(s) }, hovertemplate: "%{y:.0f}%<extra>" + A.short(s) + "</extra>" };
    });
    var L = A.layout({ yaxis: { title: "Annualized volatility (%)" } }); A.withEvents(traces, L, syms, null);
    A.plot("rvChart", traces, L, "Rolling " + w + "-day annualized volatility for " + syms.map(A.short).join(", ") + ".");
    $("rvTbl").innerHTML = '<thead><tr><th>Asset</th><th class="num">Last ' + w + ' days</th><th class="num">95% CI</th><th class="num">Last year</th><th class="num">Range of rolling value</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
  }
  A.register(T, { init: function () {}, render: function () { renderHeat(); renderVol(); } });
})();
