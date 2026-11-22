/* Boot: theme toggle, accessible tabs, staleness banner, URL state, data loading. */
(function () {
  "use strict";
  var A = window.App, $ = A.$;
  // theme toggle (system -> light -> dark), same behaviour as SolarPergola
  (function () {
    var root = document.documentElement, toggle = $("theme-toggle"), icon = $("theme-icon"), media = window.matchMedia("(prefers-color-scheme: dark)"), ICONS = { system: "◑", light: "☀", dark: "☽" };
    function read() { try { return localStorage.getItem("theme-setting") || "system"; } catch (e) { return "system"; } }
    function apply(setting) {
      root.setAttribute("data-theme", setting === "system" ? (media.matches ? "dark" : "light") : setting);
      root.setAttribute("data-theme-setting", setting); icon.textContent = ICONS[setting]; toggle.title = "Theme: " + setting;
      if (A.ready) render(A.current);
    }
    apply(read());
    toggle.addEventListener("click", function () { var o = ["system", "light", "dark"], n = o[(o.indexOf(read()) + 1) % 3]; try { localStorage.setItem("theme-setting", n); } catch (e) {} apply(n); });
    media.addEventListener("change", function () { if (read() === "system") apply("system"); });
  })();

  var inited = {};
  function render(tab) {
    try { if (!inited[tab]) { A.tabs[tab].init(); inited[tab] = true; } A.tabs[tab].render(); }
    catch (e) { console.error(e); }
  }
  var TABS = Array.prototype.map.call(document.querySelectorAll(".tab-button"), function (b) { return b.getAttribute("data-tab"); });
  function activate(tab, focus) {
    if (TABS.indexOf(tab) < 0) tab = "overview";
    A.current = tab;
    document.querySelectorAll(".tab-button").forEach(function (b) {
      var on = b.getAttribute("data-tab") === tab; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    document.querySelectorAll(".navbar__links a[data-tab]").forEach(function (a) { a.classList.toggle("is-current", a.getAttribute("data-tab") === tab); });
    document.querySelectorAll(".tab-content").forEach(function (s) { var on = s.id === "tab-" + tab; s.classList.toggle("active", on); s.hidden = !on; });
    A.saveState();
    if (A.ready) render(tab);
  }
  document.querySelectorAll("[data-tab]").forEach(function (el) {
    el.addEventListener("click", function (ev) { ev.preventDefault(); activate(el.getAttribute("data-tab")); });
  });
  document.querySelector(".tabs").addEventListener("keydown", function (e) {        // arrow-key navigation (WAI-ARIA tabs pattern)
    var i = TABS.indexOf(A.current), k = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: TABS.length - 1 - i }[e.key];
    if (k === undefined) return; e.preventDefault(); activate(TABS[(i + k + TABS.length) % TABS.length], true);
  });
  window.addEventListener("hashchange", function () {
    var h = A.parseHash(), ev = h.params.ev; delete h.params.ev;
    A.state.global.ev = ev; if (A.ready) $("evToggle").checked = A.eventsOn();
    A.state[h.tab] = Object.assign(A.state[h.tab] || {}, h.params);
    if (h.tab !== A.current) activate(h.tab); else if (A.ready) render(h.tab);
  });

  // initial state from the URL (shareable links)
  var h = A.parseHash();
  A.state.global = { ev: h.params.ev };
  delete h.params.ev;
  A.state[h.tab || "overview"] = h.params;
  activate(h.tab || "overview");

  function staleBanner() {
    var S = A.data.S, lastCrypto = S.latest["BTC-USD"].date, ageC = (Date.now() - Date.parse(lastCrypto + "T00:00:00Z")) / 864e5;
    var failed = Object.keys(S.status).filter(function (k) { return !S.status[k].ok; });
    var msgs = [];
    if (ageC > 2.5) msgs.push("Crypto prices end on " + lastCrypto + ", " + Math.floor(ageC) + " days ago. The daily update may have failed.");
    if (failed.length) msgs.push("The last run could not refresh: " + failed.join(", ") + ". Those series show their previous values.");
    if (msgs.length) { $("banner").innerHTML = '<div class="callout callout-warning" role="status"><strong class="callout-title">Data may be out of date</strong>' + msgs.join(" ") + ' See the <a href="#data">data tab</a>.</div>'; $("banner").hidden = false; }
  }

  function boot() {
    Promise.all(["data/prices.json", "data/summary.json", "data/funds.json", "data/events.json"].map(function (u) {
      return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
    })).then(function (res) {
      A.data.P = res[0]; A.data.S = res[1]; A.data.F = res[2]; A.data.E = res[3]; A.ready = true;
      $("meta-crypto").textContent = A.data.S.latest["BTC-USD"].date;
      $("meta-nyse").textContent = A.data.S.latest["GBTC"].date;
      $("meta-run").textContent = A.data.S.generated_utc.replace("T", " ").replace("Z", " UTC");
      $("evToggle").checked = A.eventsOn();
      $("evToggle").onchange = function () { A.state.global.ev = this.checked ? undefined : "0"; A.saveState(); render(A.current); };
      staleBanner();
      render(A.current);
    }).catch(function (e) {
      $("banner").innerHTML = '<div class="callout callout-danger"><strong class="callout-title">Could not load data</strong>' + A.esc(e.message) +
        ". If you opened the file directly, serve the docs/ folder with a web server (python3 -m http.server).</div>"; $("banner").hidden = false;
    });
  }
  if (window.Plotly) boot(); else window.addEventListener("load", boot);
})();
