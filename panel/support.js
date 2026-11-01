/* HADİ Yönetim Paneli › Destek masası (HADİ Destek 2.0).
   Sunucu: supportDesk callable (functions/src/support_tickets.ts) → support_tickets/{id} + messages.
     list {status, assigned, q} · thread {id} · post {id, text} · assign {id, to?} · setStatus {id, status}
     canned · cannedSet {items} · draft {id} · status · statusSet {text, level, until?} · gaps
   Günlük sınırlar: support callable (functions/src/support.ts) → adminLimitsGet / adminLimitsSet {dailyLimit, dailyLimitPremium, reason}. */
(function () {
  "use strict";
  if (!window.firebase || !firebase.apps || !firebase.apps.length) return; // panel.js ayarsız
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m) => {
    const t = $("#toast");
    if (!t) return alert(m);
    t.textContent = m;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  };
  const fns = firebase.app().functions(window.HADI_REGION || "europe-west1");
  const desk = async (data) => (await window.hadiCallable(fns, "supportDesk", { timeout: 60000 })(data)).data;
  const support = async (data) => (await window.hadiCallable(fns, "support", { timeout: 60000 })(data)).data;
  const errMsg = (e) => String((e && e.message) || e).replace(/^.*?:\s*/, "");
  const CAT = { odeme: "Ödeme / HP", hesap: "Hesap", hata: "Uygulama hatası", guvenlik: "Güvenlik", taciz: "Taciz", icerik: "İçerik", etkinlik: "Etkinlik", oneri: "Öneri", diger: "Diğer" };
  const SEV = { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Acil" };
  const SEVC = { critical: "#d64545", high: "#f2801f", medium: "#1d9ad6", low: "#6b7f92" };
  const SLA = { critical: 15, high: 60, medium: 240, low: 1440 }; // dakika
  const ST = { open: "Açık", in_progress: "İnceleniyor", resolved: "Çözüldü" };
  const SRC = { report: "🐞 Sorun bildir", safety: "🛡️ Acil güvenlik", bot: "🛟 Bot" };
  const fmt = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR") : "");
  const wait = (ms) => {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "şimdi";
    if (m < 60) return `${m} dk`;
    if (m < 1440) return `${Math.floor(m / 60)} sa ${m % 60} dk`;
    return `${Math.floor(m / 1440)} gün ${Math.floor((m % 1440) / 60)} sa`;
  };
  const pathOf = (a) => (typeof a === "string" ? a : a && a.path);

  // Sekme vurgusu ve yazışma görünümü (genel CSS'e dokunmadan).
  const css = document.createElement("style");
  css.textContent = `#spTabs .btn.on{background:var(--ink);color:#fff}
    .sp-sla{height:4px;border-radius:99px;background:#eef2f5;overflow:hidden;margin-top:6px}
    .sp-sla>i{display:block;height:100%;transition:width .5s}
    .sp-msg{padding:8px 12px;border-radius:14px;margin:6px 0;max-width:80%}
    .sp-msg.staff{background:#eef7e5;margin-left:auto}.sp-msg.member{background:#e5f4fb}
    .sp-ev{text-align:center;color:#6b7f92;font-size:12px;margin:6px 0}
    .sp-shot{max-width:180px;border-radius:10px;border:1px solid #dce4eb;margin:4px 4px 0 0}`;
  document.head.appendChild(css);

  let items = [];
  let staff = [];
  let canned = [];
  let tick = null;

  $("#supportTabBtn")?.addEventListener("click", () => showSub("queue"));
  $$("#spTabs [data-sp]").forEach((b) => b.addEventListener("click", () => showSub(b.dataset.sp)));
  $("#spReload")?.addEventListener("click", load);
  $("#spStatus")?.addEventListener("change", load);
  $("#spAssigned")?.addEventListener("change", load);
  let qT = null;
  $("#spQ")?.addEventListener("input", () => {
    clearTimeout(qT);
    qT = setTimeout(load, 350);
  });

  function showSub(k) {
    $$("#spTabs [data-sp]").forEach((b) => b.classList.toggle("on", b.dataset.sp === k));
    $$("[data-spp]").forEach((p) => p.classList.toggle("hide", p.dataset.spp !== k));
    if (k === "queue") load();
    if (k === "canned") loadCanned();
    if (k === "banner") loadBanner();
    if (k === "gaps") loadGaps();
    if (k === "limits") loadLimits();
  }

  // ------------------------------------------------------------- kuyruk
  async function load() {
    const box = $("#spList");
    if (!box) return;
    $("#spThread").classList.add("hide");
    box.classList.remove("hide");
    if (!items.length) box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await desk({ op: "list", status: $("#spStatus").value, assigned: $("#spAssigned").value || undefined, q: $("#spQ").value.trim() });
      items = d.items || [];
      staff = d.staff || [];
      draw();
      clearInterval(tick);
      tick = setInterval(draw, 30000); // bekleme sayaçları
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  function draw() {
    const box = $("#spList");
    if (!items.length) {
      box.innerHTML = '<div class="card"><p class="muted">Kuyruk boş 🎉</p></div>';
      return;
    }
    const now = Date.now();
    box.innerHTML = items.map((t, i) => {
      const w = t.waitingSince && t.status !== "resolved" ? now - t.waitingSince : null;
      const sla = (SLA[t.severity] || 240) * 60000;
      const ratio = w == null ? 0 : Math.min(1, w / sla);
      const late = w != null && w > sla;
      const col = late ? "#d64545" : ratio > 0.6 ? "#f2801f" : "#78be3a";
      return `
      <div class="card" style="border-left:5px solid ${SEVC[t.severity] || "#6b7f92"}">
        <div class="row" style="justify-content:space-between">
          <b>#${esc(t.code)} · ${esc(t.name)}</b>
          <span><span class="pill ${t.status === "resolved" ? "on" : "off"}">${esc(ST[t.status] || t.status)}</span>
          <span class="pill">${esc(SRC[t.source] || t.source)}</span>
          <span class="pill">${esc(CAT[t.category] || t.category)}</span>
          <span class="pill" style="color:${SEVC[t.severity] || "inherit"}">${esc(SEV[t.severity] || t.severity)}</span>
          ${t.unread ? `<span class="pill" style="background:#e0407a;color:#fff">${+t.unread} yeni</span>` : ""}</span>
        </div>
        <p class="muted small">${esc(fmt(t.createdAt))} · ${esc([t.appVersion && "Sürüm " + t.appVersion, t.screen && "Ekran: " + t.screen, "Atanan: " + (t.assignedName || "—")].filter(Boolean).join(" · "))}</p>
        <div class="note">${esc(t.summary)}</div>
        ${w != null ? `<p class="small" style="color:${col};font-weight:700;margin:6px 0 0">⏱ Bekliyor ${wait(w)}${late ? " · SLA aşıldı" : ""}</p><div class="sp-sla"><i style="width:${Math.round(ratio * 100)}%;background:${col}"></i></div>` : ""}
        <div class="row" style="margin-top:8px">
          <button class="btn" data-open="${i}">Yazışmayı aç</button>
          <select data-assign="${i}" style="width:190px"><option value="">Ata…</option><option value="__me">Üstüme al</option>${staff.map((s) => `<option value="${esc(s.uid)}">${esc(s.name)}</option>`).join("")}</select>
        </div>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openThread(items[+b.dataset.open].id)));
    box.querySelectorAll("[data-assign]").forEach((s) => s.addEventListener("change", async () => {
      const t = items[+s.dataset.assign];
      if (!s.value) return;
      try {
        const r = await desk({ op: "assign", id: t.id, to: s.value === "__me" ? undefined : s.value });
        toast(`#${t.code} → ${r.assignedName || "atandı"}`);
        load();
      } catch (e) {
        toast(errMsg(e));
      }
    }));
  }

  // ------------------------------------------------------------- yazışma
  async function shotUrl(path) {
    try {
      return await firebase.storage().ref(path).getDownloadURL();
    } catch (_) {
      return "";
    }
  }

  async function openThread(id) {
    const box = $("#spThread");
    $("#spList").classList.add("hide");
    box.classList.remove("hide");
    box.innerHTML = '<div class="card"><p class="muted">Yükleniyor…</p></div>';
    try {
      const d = await desk({ op: "thread", id });
      const t = d.ticket || {};
      const msgs = d.messages || [];
      const urls = {};
      const paths = [...(t.attachments || []), ...msgs.flatMap((m) => m.attachments || [])].map(pathOf).filter(Boolean);
      await Promise.all(paths.map(async (p) => (urls[p] = await shotUrl(p))));
      const shots = (list) => (list || []).map(pathOf).filter((p) => urls[p])
        .map((p) => `<a href="${esc(urls[p])}" target="_blank" rel="noopener"><img class="sp-shot" src="${esc(urls[p])}" alt="ekran görüntüsü"></a>`).join("");
      box.innerHTML = `
        <div class="card">
          <div class="row"><button class="btn ghost" id="spBack">← Kuyruk</button><span style="flex:1"></span>
            <b>#${esc(t.code)} · ${esc(t.name)}</b> <span class="pill">${esc(ST[t.status] || t.status)}</span></div>
          <p class="muted small">${esc([SRC[t.source], CAT[t.category], SEV[t.severity], t.appVersion && "Sürüm " + t.appVersion, t.device, t.screen && "Ekran: " + t.screen].filter(Boolean).join(" · "))}</p>
          <div class="note">${esc(t.summary)}</div>
          ${shots(t.attachments)}
          ${t.errorLog ? `<details><summary>Son hata kayıtları</summary><pre class="small" style="white-space:pre-wrap">${esc(t.errorLog)}</pre></details>` : ""}
          ${(t.transcript || []).length ? `<details><summary>Bot sohbeti (${t.transcript.length})</summary>${t.transcript.map((m) => `<p class="small"><b>${m.role === "bot" ? "🛟 Destek" : "👤 Üye"}:</b> ${esc(m.text)}</p>`).join("")}</details>` : ""}
        </div>
        <div class="card">
          ${msgs.map((m) => m.kind === "event"
            ? `<div class="sp-ev">— ${esc(m.text)} · ${esc(fmt(m.at))} —</div>`
            : `<div class="sp-msg ${m.by === "member" ? "member" : "staff"}"><b class="small">${m.by === "member" ? "👤 " + esc(t.name) : "🛟 " + esc(m.name || "Ekip")}</b><div>${esc(m.text)}</div>${shots(m.attachments)}<div class="muted small">${esc(fmt(m.at))}</div></div>`).join("") || '<p class="muted">Henüz mesaj yok.</p>'}
        </div>
        <div class="card">
          <div class="row">
            <select id="spCannedPick" style="flex:1;min-width:180px"><option value="">⚡ Hazır cevap ekle…</option></select>
            <button class="btn ghost" id="spDraft">✨ AI taslak</button>
          </div>
          <label>Üyeye yanıt (yazışmaya düşer, bildirim gider)</label>
          <textarea id="spReply" rows="4" maxlength="2000" style="width:100%"></textarea>
          <div class="row" style="margin-top:8px">
            <button class="btn" id="spSend">Gönder</button>
            <span style="flex:1"></span>
            <select id="spSetStatus" style="width:160px"><option value="">Durum…</option><option value="in_progress">İnceleniyor</option><option value="resolved">Çözüldü</option><option value="open">Yeniden aç</option></select>
          </div>
        </div>`;
      $("#spBack").addEventListener("click", load);
      try {
        if (!canned.length) canned = (await desk({ op: "canned" })).items || [];
      } catch (_) { /* hazır cevap yoksa boş */ }
      const pick = $("#spCannedPick");
      pick.insertAdjacentHTML("beforeend", canned.map((c, i) => `<option value="${i}">${esc(c.title)}</option>`).join(""));
      const append = (txt) => {
        const r = $("#spReply");
        r.value = (r.value.trim() ? r.value.trim() + "\n" : "") + txt;
      };
      pick.addEventListener("change", () => {
        const c = canned[+pick.value];
        if (!c) return;
        append(c.text.replace(/\{ad\}/g, String(t.name || "").split(" ")[0]));
        pick.value = "";
      });
      $("#spDraft").addEventListener("click", async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        b.textContent = "✨ Hazırlanıyor…";
        try {
          const r = await desk({ op: "draft", id });
          if (r.draft) {
            append(r.draft);
            toast("Taslak hazır: oku, düzenle, sonra gönder.");
          }
        } catch (e) {
          toast(errMsg(e));
        } finally {
          b.disabled = false;
          b.textContent = "✨ AI taslak";
        }
      });
      $("#spSend").addEventListener("click", async () => {
        const text = $("#spReply").value.trim();
        if (!text) return toast("Yanıt boş.");
        try {
          await desk({ op: "post", id, text });
          toast("Gönderildi");
          openThread(id);
        } catch (e) {
          toast(errMsg(e));
        }
      });
      $("#spSetStatus").addEventListener("change", async (ev) => {
        if (!ev.target.value) return;
        try {
          await desk({ op: "setStatus", id, status: ev.target.value });
          toast("Durum güncellendi");
          openThread(id);
        } catch (e) {
          toast(errMsg(e));
        }
      });
    } catch (e) {
      box.innerHTML = `<div class="card"><button class="btn ghost" id="spBack">← Kuyruk</button><div class="note err">${esc(errMsg(e))}</div></div>`;
      $("#spBack").addEventListener("click", load);
    }
  }

  // ------------------------------------------------------------- hazır cevaplar
  async function loadCanned() {
    const box = $("#spCanned");
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      canned = (await desk({ op: "canned" })).items || [];
      drawCanned();
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }
  function drawCanned() {
    $("#spCanned").innerHTML = canned.map((c, i) => `
      <div class="row" style="align-items:flex-start;margin-bottom:8px">
        <input data-ct="${i}" value="${esc(c.title)}" maxlength="60" style="width:200px" placeholder="Başlık">
        <textarea data-cx="${i}" rows="2" maxlength="1500" style="flex:1;min-width:200px" placeholder="Metin">${esc(c.text)}</textarea>
        <button class="btn ghost" data-cdel="${i}">Sil</button>
      </div>`).join("") || '<p class="muted">Henüz hazır cevap yok.</p>';
    $$("#spCanned [data-ct]").forEach((el) => el.addEventListener("input", () => (canned[+el.dataset.ct].title = el.value)));
    $$("#spCanned [data-cx]").forEach((el) => el.addEventListener("input", () => (canned[+el.dataset.cx].text = el.value)));
    $$("#spCanned [data-cdel]").forEach((el) => el.addEventListener("click", () => {
      canned.splice(+el.dataset.cdel, 1);
      drawCanned();
    }));
  }
  $("#spCannedAdd")?.addEventListener("click", () => {
    canned.push({ id: "c" + Date.now(), title: "", text: "" });
    drawCanned();
  });
  $("#spCannedSave")?.addEventListener("click", async () => {
    const list = canned.filter((c) => c.title.trim() && c.text.trim());
    try {
      await desk({ op: "cannedSet", items: list });
      canned = list;
      drawCanned();
      toast("Hazır cevaplar kaydedildi");
    } catch (e) {
      toast(errMsg(e));
    }
  });

  // ------------------------------------------------------------- durum bandı
  async function loadBanner() {
    try {
      const s = (await desk({ op: "status" })).status;
      $("#spBanText").value = (s && s.text) || "";
      $("#spBanLevel").value = (s && s.level) || "info";
    } catch (e) {
      toast(errMsg(e));
    }
  }
  $("#spBanSave")?.addEventListener("click", async () => {
    const text = $("#spBanText").value.trim();
    if (!text) return toast("Metin boş.");
    const h = +$("#spBanHours").value;
    try {
      await desk({ op: "statusSet", text, level: $("#spBanLevel").value, until: h ? Date.now() + h * 3600000 : undefined });
      toast("Durum bandı yayında");
    } catch (e) {
      toast(errMsg(e));
    }
  });
  $("#spBanClear")?.addEventListener("click", async () => {
    try {
      await desk({ op: "statusSet", text: "" });
      $("#spBanText").value = "";
      toast("Durum bandı kaldırıldı");
    } catch (e) {
      toast(errMsg(e));
    }
  });

  // ------------------------------------------------------------- boşluklar
  async function loadGaps() {
    const box = $("#spGaps");
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await desk({ op: "gaps" });
      const groups = d.groups || [];
      const list = d.items || [];
      box.innerHTML = `
        <div class="card"><h3>Bilgi bankasına eklenecekler</h3>
          <p class="muted small">👎 alan ve botun cevaplayamadığı sorular, benzerliğe göre gruplanmış. Sık tekrar edenleri docs/app_kb.md'ye ekle.</p>
          ${groups.map((g) => `<p><span class="pill" style="background:#a3338c;color:#fff">${+g.count}</span> ${esc(g.sample)}</p>`).join("") || '<p class="muted">Şimdilik yok 👏</p>'}
        </div>
        <div class="card"><h3>Son sorular</h3>
          ${list.map((x) => `<details><summary>${x.unknown ? "❔" : "👎"} ${esc(x.question)}</summary><p class="small muted">Bot: ${esc(x.reply)}</p></details>`).join("") || '<p class="muted">—</p>'}
        </div>`;
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  // ------------------------------------------------------------- günlük sınırlar
  async function loadLimits() {
    try {
      const d = await support({ op: "adminLimitsGet" });
      $("#spLimDaily").value = d.dailyLimit ?? "";
      $("#spLimPremium").value = d.dailyLimitPremium ?? "";
    } catch (e) {
      toast(errMsg(e));
    }
  }
  $("#spLimSave")?.addEventListener("click", async () => {
    const daily = parseInt($("#spLimDaily").value, 10);
    const prem = parseInt($("#spLimPremium").value, 10);
    const reason = $("#spLimReason").value.trim();
    if (!(daily >= 5 && daily <= 1000) || !(prem <= 5000)) return toast("Temel 5–1000, Premium en çok 5000 olmalı.");
    if (prem < daily) return toast("Premium sınırı temel sınırdan düşük olamaz.");
    if (reason.length < 3) return toast("Gerekçe zorunlu.");
    try {
      await support({ op: "adminLimitsSet", dailyLimit: daily, dailyLimitPremium: prem, reason });
      $("#spLimReason").value = "";
      toast("Sınırlar kaydedildi");
    } catch (e) {
      toast(errMsg(e));
    }
  });
})();
