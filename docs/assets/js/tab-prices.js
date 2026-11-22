/* Prices: price, volume and drawdown for one asset. URL keys: s, log */
(function () {
  "use strict";
  var A = window.App, $ = A.$;
  function render() {
    var sym = A.get("prices", "s", "BTC-USD"), lg = A.get("prices", "log", "1") === "1";
    if (!A.data.P.assets[sym]) sym = "BTC-USD";
    $("priceLog").checked = lg;
    A.assetChips($("priceChips"), A.symbols(), sym, function (v) { A.set("prices", "s", v); render(); });
    var a = A.meta(sym), dd = Stats.drawdown(a.close), c = A.color(sym);
    var traces = [
      { x: a.date, y: a.close, name: "Close", mode: "lines", line: { color: c, width: 1.6 } },
      { x: a.date, y: a.volume, name: "Volume", type: "bar", yaxis: "y2", marker: { color: A.hexA(c, 0.45) } },
      { x: a.date, y: dd.series.map(function (v) { return 100 * v; }), name: "Drawdown", mode: "lines", yaxis: "y3", fill: "tozeroy",
        line: { color: A.css("--global-down"), width: 1 }, fillcolor: A.hexA(A.css("--global-down"), 0.15), hovertemplate: "%{y:.1f}%" }
    ];
    if (a.adjclose) traces.splice(1, 0, { x: a.date, y: a.adjclose, name: "Total return (distributions reinvested)", mode: "lines", line: { color: A.css("--global-text-color-light"), width: 1, dash: "dot" } });
    if (a.nyclose) traces.splice(1, 0, { x: a.nyclose.date, y: a.nyclose.price, name: "Price at 16:00 ET", mode: "lines", visible: "legendonly", line: { color: A.css("--global-text-color-light"), width: 1 } });
    var L = A.layout({
      yaxis: { title: "USD", type: lg ? "log" : "linear", domain: [0.42, 1] },
      yaxis2: A.axis({ title: a.kind === "fund" ? "Shares" : A.short(sym), domain: [0.24, 0.38] }),
      yaxis3: A.axis({ title: "Drawdown %", domain: [0, 0.2] })
    });
    A.withEvents(traces, L, [sym], null);
    var n = a.close.length, ath = a.close.indexOf(Math.max.apply(null, a.close));
    var r = Stats.logReturns(a.close.slice(Math.max(0, n - 366))), k = a.kind === "fund" ? 252 : 365, v = Stats.sdCI(r, 0.95);
    A.plot("priceChart", traces, L, a.label + " daily close from " + a.date[0] + " to " + a.date[n - 1] + ", latest " + A.px(a.close[n - 1]) +
      ", " + A.pct(dd.series[n - 1]) + " below its high in this data.");
    $("priceStats").innerHTML = [
      A.card("All-time high in data", A.px(a.close[ath]), a.date[ath]),
      A.card("Below the high", A.pct(dd.series[n - 1]), "latest " + A.px(a.close[n - 1]) + " on " + a.date[n - 1]),
      A.card("Maximum drawdown", A.pct(dd.max), a.date[dd.peak] + " → " + a.date[dd.trough], "Largest peak-to-trough fall in this data."),
      A.card("Volatility, last 365 days", A.pct(v.est * Math.sqrt(k)), "95% CI " + A.pct(v.lo * Math.sqrt(k)) + " – " + A.pct(v.hi * Math.sqrt(k)) + ", annualized on " + k + " days",
        "Standard deviation of daily log returns × √" + k + ". The interval assumes normal returns, so it is somewhat too narrow for crypto.")
    ].join("");
  }
  function init() { $("priceLog").onchange = function () { A.set("prices", "log", this.checked ? "1" : "0"); render(); }; }
  A.register("prices", { init: init, render: render });
})();
