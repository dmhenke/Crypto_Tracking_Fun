/* Cardano: epoch countdown and schedule; staking-rewards CSVs parsed locally (never uploaded). */
(function () {
  "use strict";
  var A = window.App;
  // ===================================== CARDANO =====================================
  var E0 = 532, T0 = Date.parse("2025-01-04T21:44:51Z"), ELEN = 432000e3;
  var epochAt = function (t) { return E0 + Math.floor((t - T0) / ELEN); };
  var epochStart = function (e) { return new Date(T0 + (e - E0) * ELEN); };
  function tickEpoch() {
    if (!A.$("epochNum")) return;
    var now = Date.now(), e = epochAt(now), st = epochStart(e).getTime(), nx = st + ELEN, left = nx - now;
    if (A.$("epochNum").textContent !== "Epoch " + e) A.$("epochNum").textContent = "Epoch " + e;
    A.$("epochBar").style.width = (100 * (now - st) / ELEN) + "%";
    A.$("epochProg").setAttribute("aria-valuenow", Math.round(100 * (now - st) / ELEN)); A.$("epochProg").setAttribute("aria-valuemin", 0); A.$("epochProg").setAttribute("aria-valuemax", 100);
    var d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, mi = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1e3) % 60;
    A.$("epochTxt").textContent = A.pct((now - st) / ELEN) + " complete · epoch " + (e + 1) + " starts in " + d + "d " + h + "h " + mi + "m " + s + "s (" + new Date(nx).toLocaleString() + ")";
  }
  function renderCardano() {
    var e = epochAt(Date.now()), rows = [];
    for (var k = e + 2; k >= Math.max(E0, e - 12); k--) {
      var st = epochStart(k);
      rows.push("<tr><td>" + k + (k === e ? ' <span class="badge badge-success">current</span>' : "") + '</td><td class="num">' + st.toISOString().replace("T", " ").slice(0, 16) + ' UTC</td><td class="num">' + st.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) + "</td></tr>");
    }
    A.$("epochTbl").innerHTML = '<thead><tr><th>Epoch</th><th class="num">Start (UTC)</th><th class="num">Start (local)</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
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
    A.$("rwCol").innerHTML = numeric.map(function (o) { return '<option value="' + o + '">' + o + "</option>"; }).join("");
    var pref = numeric.filter(function (c) { return /reward|amount|ada/i.test(c); })[0]; if (pref) A.$("rwCol").value = pref;
    A.$("rwDate").innerHTML = src.map(function (o) { return '<option value="' + o + '">' + label(o) + "</option>"; }).join("");
    A.$("rwControls").hidden = false; A.$("rwChart").hidden = false; A.$("rwStats").hidden = false;
    renderRewards();
  }
  function renderRewards() {
    var col = A.$("rwCol").value, dc = A.$("rwDate").value;
    var epochOf = function (r) {
      if (dc.indexOf("epoch:") === 0) return parseInt(r[dc.slice(6)], 10);
      var t = Date.parse(dc === "_fileDate" ? r._fileDate + "T12:00:00Z" : r[dc]); return isNaN(t) ? NaN : epochAt(t);
    };
    var by = new Map();
    RW.forEach(function (r) { var e = epochOf(r), v = num(r[col]); if (!isNaN(e) && !isNaN(v)) by.set(e, (by.get(e) || 0) + v); });
    var eps = Array.from(by.keys()).sort(function (a, b) { return a - b; }), vals = eps.map(function (e) { return by.get(e); });
    var tot = vals.reduce(function (a, b) { return a + b; }, 0);
    var mc = vals.length >= 3 ? Stats.meanCI(vals, 0.95) : null;
    A.$("rwStats").innerHTML = A.card("Total", A.fmt(tot, 3), col) + A.card("Epochs", eps.length, eps.length ? eps[0] + " → " + eps[eps.length - 1] : "") +
      A.card("Mean per epoch", mc ? A.fmt(mc.est, 3) : "–", mc ? "95% CI " + A.fmt(mc.lo, 3) + " – " + A.fmt(mc.hi, 3) : "needs 3+ epochs");
    Plotly.react("rwChart", [{ x: eps.map(String), y: vals, type: "bar", name: col, marker: { color: A.color("ADA-USD") } }],
      A.layout({ showlegend: false, hovermode: "closest", xaxis: { title: "Epoch", type: "category" }, yaxis: { title: col } }, false), A.config());
    var cols = Object.keys(RW[0]).filter(function (c) { return c[0] !== "_"; }).slice(0, 6);
    A.$("rwTbl").innerHTML = "<thead><tr><th>Epoch</th>" + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      RW.slice(0, 300).map(function (r) { var e = epochOf(r); return "<tr><td>" + (isNaN(e) ? "–" : e) + "</td>" + cols.map(function (c) { return "<td>" + r[c] + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody>";
  }
  function initDrop() {
    var d = A.$("drop"), inp = A.$("fileIn");
    d.onclick = function () { inp.click(); }; inp.onchange = function () { loadFiles(inp.files); };
    d.ondragover = function (e) { e.preventDefault(); d.classList.add("hover"); };
    d.ondragleave = function () { d.classList.remove("hover"); };
    d.ondrop = function (e) { e.preventDefault(); d.classList.remove("hover"); loadFiles(e.dataTransfer.files); };
    A.$("rwCol").onchange = renderRewards; A.$("rwDate").onchange = renderRewards;
  }

  A.register("cardano", { init: function () { initDrop(); tickEpoch(); setInterval(tickEpoch, 1000);
    A.$("drop").onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); A.$("fileIn").click(); } }; }, render: renderCardano });
  A.epochAt = epochAt;
})();
