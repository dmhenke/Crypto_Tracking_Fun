/* Overview: daily brief, latest prices, growth since a reference date. URL keys: ref, a, tr, log */
(function () {
  "use strict";
  var A = window.App, $ = A.$;
  var SEV = { 3: ["badge-danger", "unusual"], 2: ["badge-warning", "notable"], 1: ["badge-neutral", "routine"] };

  function renderBrief() {
    var items = A.data.S.brief || [];
    $("brief").innerHTML = items.map(function (b) {
      var s = SEV[b.severity] || SEV[1];
      return '<li><span class="badge ' + s[0] + '">' + s[1] + "</span><span>" + A.esc(b.text) + "</span></li>";
    }).join("") || "<li>No brief for this run.</li>";
  }
  function renderKpis() {
    var L = A.data.S.latest;
    $("kpis").innerHTML = A.symbols().map(function (s) {
      var l = L[s], m = A.meta(s);
      var c = function (v, lab) { return '<span class="' + A.cls(v) + '">' + lab + " " + A.spct(v / 100) + "</span>"; };
      return '<div class="stat-card"><span class="stat-card__label"><span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + A.color(s) + ';margin-right:6px"></span>' +
        A.short(s) + (m.kind === "fund" ? " · fund" : "") + '</span><span class="stat-card__val">' + A.px(l.close) + '</span><span class="chg-row">' +
        c(l.chg_1d, "1D") + c(l.chg_7d, "7D") + c(l.chg_30d, "30D") + c(l.chg_365d, "1Y") + '</span><span class="stat-card__desc">' + m.label + " · " + l.date + "</span></div>";
    }).join("");
  }
  function render() {
    renderBrief(); renderKpis();
    var ref = A.get("overview", "ref", A.data.P.ref_date), tr = A.get("overview", "tr", "1") === "1", lg = A.get("overview", "log", "0") === "1";
    var on = A.get("overview", "a", "BTC-USD,GBTC,IBIT,ETH-USD,ETHE,ETHA").split(",").filter(function (s) { return A.data.P.assets[s]; });
    $("refDate").value = ref; $("totalRet").checked = tr; $("foldLog").checked = lg;
    A.assetChips($("foldAssets"), A.symbols(), on, function (v) {
      var i = on.indexOf(v); if (i >= 0) on.splice(i, 1); else on.push(v); A.set("overview", "a", on.join(",")); render(); }, true);
    var rows = [], traces = A.symbols().filter(function (s) { return on.indexOf(s) >= 0; }).map(function (s) {
      var f = A.fold(s, ref, tr && A.isFund(s)), last = f.y[f.y.length - 1], yrs = A.days(f.baseDate, f.x[f.x.length - 1]) / 365.25;
      rows.push("<tr><td>" + A.short(s) + f.note + '</td><td class="num">' + f.baseDate + '</td><td class="num">' + A.px(f.base) + '</td><td class="num">' + A.px(f.base * last) +
        '</td><td class="num ' + A.cls(last - 1) + '">' + A.fmt(last, 3) + '×</td><td class="num ' + A.cls(last - 1) + '">' + (yrs > 0.25 ? A.spct(Math.pow(last, 1 / yrs) - 1) : "–") + "</td></tr>");
      return { x: f.x, y: f.y, name: A.short(s) + f.note, type: "scatter", mode: "lines", line: { color: A.color(s), width: 1.8, dash: A.dash(s) },
               hovertemplate: "%{y:.3f}×<extra>" + A.short(s) + "</extra>" };
    });
    var L = A.layout({ yaxis: { title: "Fold change", type: lg ? "log" : "linear" },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1, line: { dash: "dot", color: A.css("--global-text-color-light"), width: 1 } }] });
    A.withEvents(traces, L, on, ref);
    A.plot("foldChart", traces, L, "Fold change since " + ref + " for " + on.map(A.short).join(", ") + ". " +
      rows.length + " series; see the table below for values.");
    $("foldTbl").innerHTML = '<thead><tr><th>Asset</th><th class="num">Base date</th><th class="num">Base price</th><th class="num">Latest</th><th class="num">Fold change</th><th class="num">' +
      A.tip("Annualized", "Compound annual growth rate since the base date: fold^(1/years) − 1.") + "</th></tr></thead><tbody>" + rows.join("") + "</tbody>";
  }
  function init() {
    $("refDate").min = A.data.P.assets["BTC-USD"].date[0]; $("refDate").max = A.lastDate("BTC-USD");
    $("refDate").onchange = function () { A.set("overview", "ref", this.value); render(); };
    $("totalRet").onchange = function () { A.set("overview", "tr", this.checked ? "1" : "0"); render(); };
    $("foldLog").onchange = function () { A.set("overview", "log", this.checked ? "1" : "0"); render(); };
  }
  A.register("overview", { init: init, render: render });
})();
