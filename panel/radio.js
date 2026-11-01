/* HADİ Yönetim Paneli › Radyo ("Benim Radyom"). Sunucu: radio callable (functions/src/radio.ts) → config/radio.
   İstasyonlar kulübün müzik kitaplığından (music_tracks) kurulur; kurucu ve yöneticiler düzenler. */
(function () {
  "use strict";
  if (!window.firebase || !firebase.apps || !firebase.apps.length) return; // panel.js ayarsız
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m) => {
    const t = $("#toast");
    if (!t) return alert(m);
    t.textContent = m;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  };
  const fns = firebase.app().functions(window.HADI_REGION || "europe-west1");
  const call = async (data) => (await window.hadiCallable(fns, "radio", { timeout: 60000 })(data)).data;
  const errMsg = (e) => String((e && e.message) || e).replace(/^.*?:\s*/, "");
  const mmss = (ms) => { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  let cfg = null; // { enabled, stations: [{ id, name, emoji, playlist, shuffleSeed }] }
  let lib = new Map(); // id → { id, title, artist, url, durationMs, license }
  let minMs = 5000;
  let dirty = false;

  $("#radioTabBtn")?.addEventListener("click", () => { if (!cfg) load(); });
  $("#rdReload")?.addEventListener("click", () => {
    if (dirty && !confirm("Kaydedilmemiş değişiklikler kaybolacak. Yenilensin mi?")) return;
    load();
  });
  $("#rdAdd")?.addEventListener("click", () => {
    if (!cfg) return;
    if (cfg.stations.length >= 12) return toast("En fazla 12 istasyon.");
    cfg.stations.push({ id: "s" + Date.now().toString(36), name: "Yeni istasyon", emoji: "📻", playlist: [], shuffleSeed: 0 });
    dirty = true;
    draw();
  });
  $("#rdSave")?.addEventListener("click", save);
  $("#rdEnabled")?.addEventListener("change", (e) => { if (cfg) { cfg.enabled = e.target.checked; dirty = true; } });

  async function load() {
    $("#rdStations").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await call({ op: "adminGet" });
      cfg = { enabled: !!d.config.enabled, stations: (d.config.stations || []).map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, playlist: [...(s.playlist || [])], shuffleSeed: s.shuffleSeed || 0 })) };
      lib = new Map((d.library || []).map((t) => [t.id, t]));
      minMs = d.minTrackMs || 5000;
      dirty = false;
      draw();
    } catch (e) {
      $("#rdStations").innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  const trackLabel = (id) => {
    const t = lib.get(id);
    if (!t) return `<span class="muted">Kitaplıkta yok (atlanır) · ${esc(id)}</span>`;
    const dur = t.durationMs >= minMs ? mmss(t.durationMs) : '<span class="pill off">süre yok</span>';
    return `<b>${esc(t.title)}</b>${t.artist ? " · " + esc(t.artist) : ""} · ${dur}`;
  };

  function draw() {
    $("#rdEnabled").checked = !!cfg.enabled;
    const sorted = [...lib.values()].sort((a, b) => a.title.localeCompare(b.title, "tr"));
    $("#rdStations").innerHTML = cfg.stations.map((s, i) => {
      const total = s.playlist.reduce((a, id) => a + ((lib.get(id)?.durationMs || 0) >= minMs ? lib.get(id).durationMs : 0), 0);
      const options = sorted.filter((t) => !s.playlist.includes(t.id))
        .map((t) => `<option value="${esc(t.id)}">${esc(t.title)}${t.artist ? " — " + esc(t.artist) : ""}${t.durationMs >= minMs ? " (" + mmss(t.durationMs) + ")" : " (süre yok)"}</option>`).join("");
      return `<div class="card" data-st="${i}">
        <div class="row">
          <div style="width:80px"><label>Emoji</label><input data-k="emoji" maxlength="4" value="${esc(s.emoji)}"></div>
          <div style="flex:1;min-width:200px"><label>İstasyon adı</label><input data-k="name" maxlength="40" value="${esc(s.name)}"></div>
          <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" data-k="shuffle" style="width:auto" ${s.shuffleSeed ? "checked" : ""}> Her turda karıştır</label>
          <button class="btn red" data-a="del">Sil</button>
        </div>
        <p class="muted small">${s.playlist.length} parça · tur ${mmss(total)} · kimlik ${esc(s.id)}</p>
        <table><tbody>${s.playlist.map((id, k) => `<tr>
          <td class="num">${k + 1}</td><td style="white-space:normal">${trackLabel(id)}</td>
          <td class="num"><button class="btn ghost" data-a="up" data-k2="${k}" ${k ? "" : "disabled"}>↑</button>
          <button class="btn ghost" data-a="down" data-k2="${k}" ${k < s.playlist.length - 1 ? "" : "disabled"}>↓</button>
          <button class="btn ghost" data-a="rm" data-k2="${k}">Çıkar</button></td></tr>`).join("") || '<tr><td class="muted">Çalma listesi boş.</td></tr>'}</tbody></table>
        <div class="row" style="margin-top:10px">
          <div style="flex:1;min-width:240px"><label>Kitaplıktan ekle</label><select data-k="pick"><option value="">— parça seç —</option>${options}</select></div>
          <button class="btn ghost" data-a="add">Ekle</button>
          <button class="btn ghost" data-a="addAll">Hepsini ekle</button>
        </div>
      </div>`;
    }).join("") || '<div class="card muted">Henüz istasyon yok. "İstasyon ekle" ile başlayın.</div>';

    const missing = sorted.filter((t) => t.durationMs < minMs);
    $("#rdMissing").innerHTML = missing.length
      ? `<table><tbody>${missing.map((t) => `<tr><td style="white-space:normal"><b>${esc(t.title)}</b>${t.artist ? " · " + esc(t.artist) : ""}</td><td class="num"><button class="btn ghost" data-measure="${esc(t.id)}">Ölç</button></td></tr>`).join("")}</tbody></table>`
      : '<p class="muted small">Tüm parçaların süresi biliniyor.</p>';
  }

  $("#rdStations")?.addEventListener("input", (e) => {
    const card = e.target.closest("[data-st]");
    if (!card || !cfg) return;
    const s = cfg.stations[Number(card.dataset.st)];
    const k = e.target.dataset.k;
    if (k === "name") s.name = e.target.value;
    else if (k === "emoji") s.emoji = e.target.value;
    else return;
    dirty = true;
  });
  $("#rdStations")?.addEventListener("change", (e) => {
    const card = e.target.closest("[data-st]");
    if (!card || !cfg || e.target.dataset.k !== "shuffle") return;
    cfg.stations[Number(card.dataset.st)].shuffleSeed = e.target.checked ? 1 + Math.floor(Math.random() * 0x7ffffffe) : 0;
    dirty = true;
  });
  $("#rdStations")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]");
    const card = e.target.closest("[data-st]");
    if (!b || !card || !cfg) return;
    const i = Number(card.dataset.st);
    const s = cfg.stations[i];
    const k = Number(b.dataset.k2);
    const a = b.dataset.a;
    if (a === "del") {
      if (!confirm(`"${s.name}" istasyonu silinsin mi?`)) return;
      cfg.stations.splice(i, 1);
    } else if (a === "up" && k > 0) [s.playlist[k - 1], s.playlist[k]] = [s.playlist[k], s.playlist[k - 1]];
    else if (a === "down" && k < s.playlist.length - 1) [s.playlist[k + 1], s.playlist[k]] = [s.playlist[k], s.playlist[k + 1]];
    else if (a === "rm") s.playlist.splice(k, 1);
    else if (a === "add") {
      const id = card.querySelector('[data-k="pick"]').value;
      if (!id) return toast("Bir parça seç.");
      s.playlist.push(id);
    } else if (a === "addAll") {
      for (const t of lib.values()) if (!s.playlist.includes(t.id) && s.playlist.length < 300) s.playlist.push(t.id);
    } else return;
    dirty = true;
    draw();
  });

  $("#rdMissing")?.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-measure]");
    if (!b) return;
    const t = lib.get(b.dataset.measure);
    if (!t) return;
    b.disabled = true;
    try {
      const ms = await new Promise((res, rej) => {
        const au = new Audio();
        au.preload = "metadata";
        au.onloadedmetadata = () => (isFinite(au.duration) ? res(Math.round(au.duration * 1000)) : rej(new Error("Süre okunamadı.")));
        au.onerror = () => rej(new Error("Ses dosyası açılamadı."));
        au.src = t.url;
      });
      await call({ op: "trackDuration", trackId: t.id, durationMs: ms });
      t.durationMs = ms;
      toast(`"${t.title}" süresi kaydedildi: ${mmss(ms)}`);
      draw();
    } catch (err) {
      b.disabled = false;
      toast(errMsg(err));
    }
  });

  async function save() {
    if (!cfg) return;
    if (cfg.stations.some((s) => !String(s.name).trim())) return toast("Her istasyonun bir adı olmalı.");
    $("#rdSave").disabled = true;
    try {
      await call({ op: "adminSet", enabled: cfg.enabled, stations: cfg.stations });
      dirty = false;
      toast("Kaydedildi. Çalma listesi değişen istasyonlar baştan başladı.");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      $("#rdSave").disabled = false;
    }
  }
})();
