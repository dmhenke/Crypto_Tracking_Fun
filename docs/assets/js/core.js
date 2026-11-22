/* Shared helpers for the dashboard: data access, formatting, theming, Plotly defaults,
 * event markers, CSV export, URL state and tab registration. Exposed as window.App. */
(function () {
  "use strict";
  var App = window.App = { tabs: {}, order: [], state: {}, data: {} };
  var $ = App.$ = function (id) { return document.getElementById(id); };
  App.css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  App.theme = function () { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; };

  // ---- data access ----------------------------------------------------------------
  App.meta = function (s) { return App.data.P.assets[s]; };
  App.symbols = function (pred) { return App.data.P.order.filter(function (s) { return !pred || pred(App.meta(s)); }); };
  App.isFund = function (s) { return App.meta(s).kind === "fund"; };
  App.short = function (s) { return App.meta(s).short || s; };
  App.color = function (s) { var c = App.meta(s).color; return c ? c[App.theme()] : App.css("--global-theme-color"); };
  App.dash = function (s) { return App.isFund(s) ? "dot" : "solid"; };        // shape cue, so color is not the only signal
  App.series = function (s, totalReturn) {
    var a = App.meta(s); return { date: a.date, val: (totalReturn && a.adjclose) ? a.adjclose : a.close };
  };
  App.nyclose = function (s) { var a = App.meta(s); return a.nyclose ? { date: a.nyclose.date, val: a.nyclose.price } : null; };
  App.idxOnOrBefore = function (dates, d) { var lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  App.toMap = function (x, y) { var m = new Map(); x.forEach(function (d, i) { m.set(d, y[i]); }); return m; };
  App.fold = function (s, ref, tr) {
    var se = App.series(s, tr), i = App.idxOnOrBefore(se.date, ref), note = "";
    if (i < 0) { i = 0; note = " (from " + se.date[0] + ")"; }
    var base = se.val[i];
    return { x: se.date.slice(i), y: se.val.slice(i).map(function (v) { return v / base; }), base: base, baseDate: se.date[i], note: note };
  };
  // Matched series of two price streams on common dates.
  App.match = function (A, B, from, to) {
    var mb = App.toMap(B.date, B.val), d = [], a = [], b = [];
    A.date.forEach(function (dt, i) { if ((!from || dt >= from) && (!to || dt <= to) && mb.has(dt)) { d.push(dt); a.push(A.val[i]); b.push(mb.get(dt)); } });
    return { d: d, a: a, b: b };
  };
  App.days = function (a, b) { return (Date.parse(b) - Date.parse(a)) / 864e5; };
  App.shiftDate = function (d, n) { return new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10); };
  App.lastDate = function (s) { var d = App.meta(s).date; return d[d.length - 1]; };

  // ---- formatting -----------------------------------------------------------------
  var fmt = App.fmt = function (x, d) { if (x == null || !isFinite(x)) return "–"; return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  App.pct = function (x, d) { return x == null || !isFinite(x) ? "–" : fmt(100 * x, d == null ? 1 : d) + "%"; };
  App.spct = function (x, d) { return x == null || !isFinite(x) ? "–" : (x >= 0 ? "+" : "") + App.pct(x, d); };
  App.px = function (x) { return x == null || !isFinite(x) ? "–" : "$" + (x >= 1000 ? fmt(x, 0) : x >= 1 ? fmt(x, 2) : fmt(x, 4)); };
  App.usd = function (x) { return x == null || !isFinite(x) ? "–" : (x < 0 ? "−$" : "$") + fmt(Math.abs(x), 0); };
  App.cls = function (x) { return x >= 0 ? "up" : "down"; };
  App.pval = function (p) { return p < 0.001 ? "p < 0.001" : "p = " + fmt(p, 3); };
  App.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  App.card = function (label, val, desc, tipText) {
    return '<div class="stat-card"><span class="stat-card__label">' + (tipText ? App.tip(label, tipText) : label) + '</span><span class="stat-card__val">' + val +
      '</span><span class="stat-card__desc">' + (desc || "") + "</span></div>";
  };
  // Hover/focus definition (keyboard accessible).
  App.tip = function (term, text) { return '<span class="tip" tabindex="0" data-tip="' + App.esc(text) + '">' + term + "</span>"; };
  App.hexA = function (hex, a) { var h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16) + "," + a + ")"; };

  // ---- chips (accessible toggle buttons) ------------------------------------------------
  App.chips = function (el, items, active, onPick, multi) {
    el.setAttribute("role", "group");
    el.innerHTML = items.map(function (it) {
      var on = multi ? active.indexOf(it.v) >= 0 : it.v === active;
      return '<button type="button" class="filter-btn' + (on ? " active" : "") + '" aria-pressed="' + on + '" data-v="' + App.esc(it.v) + '"' + (it.title ? ' title="' + App.esc(it.title) + '"' : "") + ">" +
        (it.dot ? '<span class="dot" aria-hidden="true" style="background:' + it.dot + '"></span>' : "") + it.t + "</button>";
    }).join("");
    el.querySelectorAll("button").forEach(function (b) { b.onclick = function () { onPick(b.getAttribute("data-v")); }; });
  };
  App.assetChips = function (el, syms, active, onPick, multi) {
    App.chips(el, syms.map(function (s) { return { v: s, t: App.short(s), dot: App.color(s), title: App.meta(s).label }; }), active, onPick, multi);
  };

  // ---- Plotly defaults ------------------------------------------------------------------
  App.axis = function (extra) { return Object.assign({ gridcolor: App.css("--global-divider-color"), zerolinecolor: App.css("--global-text-color-light"), linecolor: App.css("--global-divider-color") }, extra || {}); };
  function deepMerge(a, b) { Object.keys(b).forEach(function (k) { a[k] = (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") ? deepMerge(a[k], b[k]) : b[k]; }); return a; }
  App.layout = function (extra, rangeButtons) {
    var css = App.css, L = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, -apple-system, sans-serif", size: 12, color: css("--global-text-color") },
      margin: { l: 60, r: 18, t: 40, b: 44 }, hovermode: "x unified",
      hoverlabel: { bgcolor: css("--global-card-bg-color"), bordercolor: css("--global-divider-color"), font: { color: css("--global-text-color") } },
      legend: { orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom" },
      xaxis: App.axis(), yaxis: App.axis()
    };
    if (rangeButtons !== false) L.xaxis.rangeselector = {
      x: 1, xanchor: "right", y: 1.02, yanchor: "bottom", bgcolor: css("--global-surface-color"), activecolor: css("--global-divider-color"),
      font: { family: "JetBrains Mono, monospace", size: 11 },
      buttons: [{ count: 3, label: "3M", step: "month", stepmode: "backward" }, { count: 1, label: "1Y", step: "year", stepmode: "backward" },
                { count: 3, label: "3Y", step: "year", stepmode: "backward" }, { step: "all", label: "All" }] };
    return deepMerge(L, extra || {});
  };
  // CSV export of whatever a chart is showing (one row per point per trace).
  function downloadCSV(gd) {
    var rows = [["series", "x", "y"]];
    (gd.data || []).forEach(function (t) {
      if (!t.x || !t.y || t.name === "Events" || t.showlegend === false && !t.name) return;
      var n = Math.min(t.x.length, t.y.length);
      for (var i = 0; i < n; i++) if (t.y[i] != null) rows.push([t.name || "", t.x[i], t.y[i]]);
      if (t.z) t.z.forEach(function (r, i) { r.forEach(function (v, j) { rows.push([t.y[i] + " vs " + t.x[j], "", v]); }); });
    });
    if (gd.data && gd.data[0] && gd.data[0].type === "heatmap") {
      var h = gd.data[0]; rows = [["row", "column", "value"]];
      h.z.forEach(function (r, i) { r.forEach(function (v, j) { rows.push([h.y[i], h.x[j], v]); }); });
    }
    var csv = rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = (gd.id || "chart") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  App.config = function () {
    return { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"],
      modeBarButtonsToAdd: [{ name: "Download data as CSV", icon: Plotly.Icons.disk, click: downloadCSV }],
      toImageButtonOptions: { format: "png", scale: 2 } };
  };
  // Draw a chart and give it an accessible name and text summary.
  App.plot = function (id, traces, layout, summary) {
    var el = $(id); Plotly.react(el, traces, layout, App.config());
    el.setAttribute("role", "img");
    if (summary) { el.setAttribute("aria-label", summary); var s = $(id + "-sr"); if (s) s.textContent = summary; }
  };

  // ---- event markers --------------------------------------------------------------------
  App.eventsOn = function () { var s = App.state.global || {}; return s.ev !== "0"; };
  App.withEvents = function (traces, layout, syms, fromDate) {
    if (!App.eventsOn() || !App.data.E) return;
    var ev = App.data.E.events.filter(function (e) {
      return (!fromDate || e.date >= fromDate) && (e.assets.indexOf("*") >= 0 || e.assets.some(function (a) { return syms.indexOf(a) >= 0; }));
    });
    if (!ev.length) return;
    var c = App.css("--global-text-color-light");
    layout.shapes = (layout.shapes || []).concat(ev.map(function (e) {
      return { type: "line", xref: "x", yref: "paper", x0: e.date, x1: e.date, y0: 0, y1: 1, line: { color: App.hexA(c, 0.45), width: 1, dash: "dot" }, layer: "below" };
    }));
    traces.push({ x: ev.map(function (e) { return e.date; }), y: ev.map(function () { return 0.985; }), yaxis: "y9", mode: "markers", name: "Events", showlegend: false,
      marker: { symbol: "triangle-down", size: 9, color: App.css("--global-theme-color") },
      text: ev.map(function (e) { return "<b>" + App.esc(e.label) + "</b><br>" + App.esc(e.detail).replace(/(.{60,}?)\s/g, "$1<br>"); }),
      hovertemplate: "%{text}<extra></extra>" });
    layout.yaxis9 = { overlaying: "y", range: [0, 1], visible: false, fixedrange: true };
  };

  // ---- URL state (#tab?k=v&...) ------------------------------------------------------------
  App.parseHash = function () {
    var h = location.hash.slice(1), q = h.indexOf("?"), tab = q >= 0 ? h.slice(0, q) : h, params = {};
    if (q >= 0) h.slice(q + 1).split("&").forEach(function (kv) { if (!kv) return; var p = kv.split("="); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
    return { tab: tab, params: params };
  };
  App.saveState = function () {
    var tab = App.current, st = App.state[tab] || {}, g = App.state.global || {}, all = Object.assign({}, g, st);
    var q = Object.keys(all).filter(function (k) { return all[k] !== undefined && all[k] !== null && all[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(all[k]); }).join("&");
    history.replaceState(null, "", "#" + tab + (q ? "?" + q : ""));
  };
  App.set = function (tab, k, v) { App.state[tab] = App.state[tab] || {}; App.state[tab][k] = v; App.saveState(); };
  App.get = function (tab, k, dflt) { var s = App.state[tab] || {}; return s[k] !== undefined ? s[k] : dflt; };

  // ---- tabs -----------------------------------------------------------------------------
  App.register = function (name, def) { App.tabs[name] = def; App.order.push(name); };
})();
