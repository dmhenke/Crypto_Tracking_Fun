/* Data: freshness and source status, downloads, fee table, data corrections, glossary. */
(function () {
  "use strict";
  var A = window.App, $ = A.$;
  var GLOSSARY = [
    ["Fold change", "Price on a date divided by the price on the reference date. 1.5 means up 50%."],
    ["Log return", "ln(Pt / Pt−1). Log returns add up over time and are what the statistics use. For small moves they are close to percentage returns."],
    ["Premium / discount", "Fund market price ÷ value of the crypto held per share − 1. Before 2024, GBTC and ETHE could not redeem shares, so the gap could reach −50%; as ETFs, arbitrage keeps it near 0."],
    ["NAV (net asset value)", "Value of a fund's holdings per share: crypto per share × the crypto price at the NYSE close."],
    ["Fee drag", "How much a higher fee reduces returns relative to a cheaper fund holding the same asset, per year."],
    ["Beta", "Slope of the regression of one asset's returns on another's: the average move in y per 1% move in x."],
    ["Alpha", "The part of y's average return not explained by beta × x's return, annualized."],
    ["Correlation (r)", "How closely two return series move together, from −1 to 1."],
    ["R²", "Share of the variance in y's returns explained by x; equals r² for a single benchmark."],
    ["Volatility", "Annualized standard deviation of log returns: √365 per year for coins (they trade every day), √252 for funds (trading days)."],
    ["Tracking error", "Annualized standard deviation of the difference between two assets' returns."],
    ["Drawdown", "How far below its previous peak an asset is; the maximum drawdown is the worst such fall."],
    ["Confidence interval", "A range that, under the method's assumptions, would contain the true value in the stated share of repeated samples."],
    ["Newey-West", "Standard errors that remain valid when returns are autocorrelated or their volatility changes over time."],
    ["Block bootstrap", "Resampling blocks of consecutive returns to estimate uncertainty without assuming normality, while keeping short-run dependence."],
    ["Bonferroni adjustment", "Widening intervals when several comparisons are made, so that at least one false positive stays as unlikely as the stated level."],
    ["Coverage", "Share of past forecast ranges that contained the actual outcome. An 80% range should cover about 80%."],
    ["Money-weighted return", "The constant annual rate that turns a series of purchases into the final value (internal rate of return)."],
    ["Cardano epoch", "A 5-day period (432,000 seconds) after which staking rewards are calculated."]
  ];
  function age(d) { return Math.floor((Date.now() - Date.parse(d + "T00:00:00Z")) / 864e5); }
  function render() {
    var S = A.data.S;
    $("freshTbl").innerHTML = '<thead><tr><th>Series</th><th>Source</th><th class="num">Rows</th><th class="num">First</th><th class="num">Last</th><th class="num">Age (days)</th><th class="num">Missing days</th><th>Last run</th></tr></thead><tbody>' +
      A.symbols().map(function (s) {
        var q = S.qc[s], st = S.status[s] || {}, m = A.meta(s), ag = age(q.last), lim = m.kind === "fund" ? 4 : 2;
        return "<tr><td>" + A.short(s) + " <span class=\"sub\">" + m.label + "</span></td><td>" + (m.source === "coinbase" ? "Coinbase" : "Yahoo") + '</td><td class="num">' + q.rows +
          '</td><td class="num">' + q.first + '</td><td class="num">' + q.last + '</td><td class="num">' + (ag > lim ? '<span class="badge badge-warning">' + ag + "</span>" : ag) +
          '</td><td class="num">' + (q.missing_calendar_days == null ? "n/a" : q.missing_calendar_days) + "</td><td>" + (st.ok ? '<span class="badge badge-success">ok</span> ' : '<span class="badge badge-danger">failed</span> ') + A.esc(st.message || "") + "</td></tr>";
      }).join("") +
      Object.keys(S.status).filter(function (k) { return k.indexOf("16:00") > 0; }).map(function (k) {
        var st = S.status[k];
        return "<tr><td>" + k + '</td><td>Coinbase hourly</td><td class="num" colspan="5"></td><td>' + (st.ok ? '<span class="badge badge-success">ok</span> ' : '<span class="badge badge-danger">failed</span> ') + A.esc(st.message) + "</td></tr>";
      }).join("") + "</tbody>";
    A.chips($("dlChips"), A.symbols().map(function (s) { return { v: s, t: '<i class="fa-solid fa-download" aria-hidden="true"></i> ' + A.short(s) + ".csv" }; })
      .concat([{ v: "_funds", t: '<i class="fa-solid fa-download" aria-hidden="true"></i> fund_premiums.csv' }]), null, download);
    $("feeTbl").innerHTML = '<thead><tr><th>Fund</th><th>Holds</th><th>Issuer</th><th>ETF since</th><th>Fee schedule</th><th>Notes</th></tr></thead><tbody>' +
      A.symbols(function (m) { return m.kind === "fund"; }).map(function (s) {
        var m = A.meta(s);
        return "<tr><td>" + A.short(s) + "</td><td>" + A.short(m.underlying) + "</td><td>" + m.issuer + "</td><td>" + m.etf_since + "</td><td>" +
          m.fees.map(function (f) { return A.pct(f.rate, 2) + " from " + f.from + (f.note ? " (" + A.esc(f.note) + ")" : ""); }).join("<br>") + "</td><td>" +
          ((m.spinoffs || []).map(function (x) { return A.esc(x.note); }).join(" ") + " " + A.esc(m.notes || "")) +
          (m.sources || []).map(function (u, i) { return ' <a href="' + u + '">source ' + (i + 1) + "</a>"; }).join("") + "</td></tr>";
      }).join("") + "</tbody>";
    $("fixes").innerHTML = (S.data_fixes || []).map(function (f) {
      return '<div class="callout callout-info"><strong class="callout-title">' + f.symbol + ", " + f.from + " to " + f.to + ": prices divided by " + f.divide_by + "</strong>" + A.esc(f.reason) + "</div>";
    }).join("") || "<p>None.</p>";
    $("glossary").innerHTML = GLOSSARY.map(function (g) { return "<dt>" + g[0] + "</dt><dd>" + g[1] + "</dd>"; }).join("");
  }
  function csvOf(rows) { return rows.map(function (r) { return r.map(function (v) { return v == null ? "" : v; }).join(","); }).join("\n"); }
  function download(v) {
    var rows, name;
    if (v === "_funds") {
      var F = A.data.F.funds; rows = [["fund", "date", "units_per_share", "nav", "premium"]]; name = "fund_premiums.csv";
      Object.keys(F).forEach(function (s) { F[s].date.forEach(function (d, i) { rows.push([s, d, F[s].units[i], F[s].nav[i], F[s].premium[i]]); }); });
    } else {
      var a = A.meta(v); name = v + ".csv"; rows = [["date", "close", "volume"].concat(a.adjclose ? ["adjclose"] : [])];
      a.date.forEach(function (d, i) { rows.push([d, a.close[i], a.volume[i]].concat(a.adjclose ? [a.adjclose[i]] : [])); });
    }
    var el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([csvOf(rows)], { type: "text/csv" })); el.download = name;
    document.body.appendChild(el); el.click(); setTimeout(function () { URL.revokeObjectURL(el.href); el.remove(); }, 500);
  }
  A.register("data", { init: function () {}, render: render });
})();
