/* HADİ Yönetim Paneli › İşletmeler.
   business callable (functions/src/business.ts):
     reviewList → başvurular + ayarlar · reviewDocs {uid} → belgelere 15 dk bağlantı · approve {uid} · reject {uid, reason}
     eventsPending · eventApprove {id} · eventReject {id, reason}
     payoutsPending · payoutPaid {id, bankRef} · payoutReject {id, reason} · payoutRecord {uid, amountTl, invoiceNo, invoiceDate, bankRef}
     setConfig {commissionPct?, hpToTl?, override?{uid, pct|null}}   (yalnızca ana kurucu; sunucu requirePrimary)
     orderDisputes · orderResolve {id, action: release|refund|partial, pct?, note} · orderConfigGet · orderConfigSet {deliveryConfirmMinutes} (ana kurucu) */
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
  const call = async (data) => (await window.hadiCallable(fns, "business", { timeout: 60000 })(data)).data;
  const errMsg = (e) => String((e && e.message) || e).replace(/^.*?:\s*/, "");
  const fmt = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR") : "");
  const tl = (v) => Number(v || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
  const TYPES = { restoran: "Restoran", kafe: "Kafe", bar: "Bar / gece kulübü", otel: "Otel / konaklama", spa: "Spa / güzellik", spor: "Spor salonu", tur: "Tur / seyahat acentesi", mekan: "Etkinlik mekânı / organizasyon", atolye: "Atölye / kurs", diger: "Diğer" };
  const DOCS = { vergi: "Vergi levhası", sicil: "Ticaret sicil kaydı", faaliyet: "Faaliyet belgesi", imza: "İmza sirküleri", ruhsat: "Ruhsat" };

  let apps = [], events = [], payouts = [], primary = false;
  // Şirket yasal unvanı (config/company; gizli menü › Şirket bilgileri). Okunamazsa varsayılan.
  let companyName = "HADİ Turizm ve Organizasyon";
  try {
    firebase.firestore && firebase.firestore().doc("config/company").get().then((d) => {
      const n = d.exists && String(d.data().legalName || "").trim();
      if (n) companyName = n;
    }).catch(() => undefined);
  } catch (_) { /* firestore yüklü değil */ }

  $("#businessTabBtn")?.addEventListener("click", loadAll);
  $("#bzReload")?.addEventListener("click", loadAll);

  async function loadAll() {
    await Promise.all([loadApps(), loadEvents(), loadPayouts(), loadDisputes()]);
  }

  async function loadApps() {
    const box = $("#bzApps");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await call({ op: "reviewList" });
      apps = d.items || [];
      primary = d.isPrimary === true;
      const c = d.config || {};
      $("#bzPct").value = c.commissionPct ?? "";
      $("#bzRate").value = c.hpToTl > 0 ? c.hpToTl : "";
      for (const id of ["bzPct", "bzRate", "bzOvUid", "bzOvPct", "bzSave", "bzOvSave", "bzOvDel"]) { const el = $("#" + id); if (el) el.disabled = !primary; }
      $("#bzCfgNote").textContent = primary ? "" : "Görüntüleme: ayarları yalnızca ana kurucu değiştirebilir.";
      drawApps();
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  function drawApps() {
    const box = $("#bzApps");
    if (!apps.length) {
      box.innerHTML = '<div class="card"><p class="muted">Bekleyen başvuru yok.</p></div>';
      return;
    }
    box.innerHTML = apps.map((r, i) => {
      const l = r.legal || {};
      return `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>${esc(l.tradeName)}</b>
          <span class="muted small">${esc(TYPES[r.type] || r.type)} · ${esc(fmt(r.submittedAt))} · komisyon %${esc(r.commissionPct)}</span>
        </div>
        <p class="small">Başvuran: ${esc(r.name)}<br>Unvan: ${esc(l.legalName)}<br>Vergi no: <code>${esc(l.taxNo)}</code> · ${esc(l.taxOffice)}${l.mersis ? ` · MERSİS ${esc(l.mersis)}` : ""}<br>
        Yetkili: ${esc(l.authorizedName)}<br>Adres: ${esc(l.address)}, ${esc(l.district)} ${esc(l.city)}<br>Telefon: ${esc(l.publicPhone)} · Web: ${esc(l.website)}<br>IBAN: <code>${esc(l.iban)}</code></p>
        <p class="muted small">Vergi levhasını GİB vergi levhası doğrulamadan, sicil kaydını Ticaret Sicil Gazetesi'nden, ruhsatı belediyeden kontrol et. Unvan, vergi no ve yetkili adı belgelerle aynı olmalı.</p>
        <div class="row" style="gap:8px">
          <button class="btn ghost" data-docs="${i}">Belgeler</button>
          <span data-doclinks="${i}"></span>
        </div>
        <div class="row" style="gap:8px;margin-top:10px">
          <button class="btn" data-ok="${i}">Onayla</button>
          <input id="bzWhy${i}" placeholder="Ret gerekçesi (işletmeye gösterilir)" style="flex:1;min-width:200px">
          <button class="btn danger" data-no="${i}">Reddet</button>
        </div>
      </div>`;
    }).join("");
  }

  $("#bzApps")?.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const i = Number(b.dataset.docs ?? b.dataset.ok ?? b.dataset.no);
    const r = apps[i];
    if (!r) return;
    if (b.dataset.docs !== undefined) {
      try {
        const d = await call({ op: "reviewDocs", uid: r.uid });
        const links = Object.entries(d.docs || {}).map(([k, u]) => (u ? `<a class="btn ghost" href="${esc(u)}" target="_blank" rel="noopener">${esc(DOCS[k] || k)}</a>` : `<span class="muted small">${esc(DOCS[k] || k)}: açılamadı</span>`));
        document.querySelector(`[data-doclinks="${i}"]`).innerHTML = links.join(" ");
      } catch (e) {
        toast(errMsg(e));
      }
      return;
    }
    b.disabled = true;
    try {
      if (b.dataset.ok !== undefined) {
        if (!confirm(`${r.legal?.tradeName || "İşletme"} onaylansın mı? Belgeleri kontrol ettin mi?`)) return;
        await call({ op: "approve", uid: r.uid });
        toast("İşletme hesabı onaylandı.");
      } else {
        const reason = ($("#bzWhy" + i)?.value || "").trim();
        if (reason.length < 3) return toast("Ret gerekçesi yaz.");
        await call({ op: "reject", uid: r.uid, reason });
        toast("Başvuru reddedildi.");
      }
      await loadApps();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      b.disabled = false;
    }
  });

  async function loadEvents() {
    const box = $("#bzEvents");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      events = (await call({ op: "eventsPending" })).items || [];
      if (!events.length) {
        box.innerHTML = '<div class="card"><p class="muted">Onay bekleyen işletme etkinliği yok.</p></div>';
        return;
      }
      box.innerHTML = events.map((e, i) => {
        const x = e.input || {};
        const inc = (x.includedItems || []).map((it) => `${esc(it.qty)} × ${esc(it.name)}`).join(", ");
        return `
        <div class="card">
          <div class="row" style="justify-content:space-between"><b>${esc(e.title)}</b><span class="muted small">${esc(e.businessName)} · ${esc(fmt(e.startAt))}</span></div>
          <p class="small">${esc(e.priceHp > 0 ? e.priceHp + " HP" : "Ücretsiz")}${x.premiumPriceHp != null ? ` (Premium ${esc(x.premiumPriceHp)} HP)` : ""} · ${esc(e.capacity)} kişi · ${esc(x.venueName)}, ${esc(x.address)} ${esc(x.city)}</p>
          <p class="small">${esc(x.description)}</p>
          <p class="small"><b>Dahil:</b> ${esc(x.includes)}<br><b>Dahil değil:</b> ${esc(x.excludes)}${inc ? `<br><b>Menüden:</b> ${inc}` : ""}${x.discounts ? `<br><b>İndirim:</b> ${esc(x.discounts)}` : ""}</p>
          <div class="row" style="gap:8px">
            <button class="btn" data-eok="${i}">Onayla ve yayımla</button>
            <input id="bzEWhy${i}" placeholder="Ret gerekçesi" style="flex:1;min-width:200px">
            <button class="btn danger" data-eno="${i}">Reddet</button>
          </div>
        </div>`;
      }).join("");
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  $("#bzEvents")?.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const i = Number(b.dataset.eok ?? b.dataset.eno);
    const e = events[i];
    if (!e) return;
    b.disabled = true;
    try {
      if (b.dataset.eok !== undefined) {
        await call({ op: "eventApprove", id: e.id });
        toast("Etkinlik yayımlandı.");
      } else {
        const reason = ($("#bzEWhy" + i)?.value || "").trim();
        if (reason.length < 3) return toast("Ret gerekçesi yaz.");
        await call({ op: "eventReject", id: e.id, reason });
        toast("Etkinlik reddedildi.");
      }
      await loadEvents();
    } catch (x) {
      toast(errMsg(x));
    } finally {
      b.disabled = false;
    }
  });

  // ---- Sipariş anlaşmazlıkları (bloke donuk) + teslim onay süresi
  let disputes = [];
  async function loadDisputes() {
    const box = $("#bzDisputes");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const [d, c] = await Promise.all([call({ op: "orderDisputes" }), call({ op: "orderConfigGet" })]);
      disputes = d.items || [];
      const inp = $("#bzConfirmMin");
      if (inp) { inp.value = c.deliveryConfirmMinutes ?? 15; inp.disabled = !c.canEdit; }
      for (const [id, k, dv] of [["#bzAskH", "undeliveredAskHours", 24], ["#bzAnsH", "undeliveredAnswerHours", 2]]) {
        const el = $(id);
        if (el) { el.value = c[k] ?? dv; el.disabled = !c.canEdit; }
      }
      const btn = $("#bzConfirmSave");
      if (btn) btn.disabled = !c.canEdit;
      if (!disputes.length) { box.innerHTML = '<p class="muted">Bekleyen anlaşmazlık yok.</p>'; return; }
      box.innerHTML = disputes.map((o) => `
        <div class="card" data-id="${esc(o.id)}">
          <b>${esc(o.bizName)}</b> · ${esc(o.memberName)} · ${esc(o.kindLabel)} · <b>${esc(o.holdHp)} HP</b> blokede
          <div class="muted small">${esc(fmt(o.createdAt))}${o.delivery ? ` · Adres: ${esc(o.delivery.line || "")}` : ""}</div>
          <div style="margin:6px 0">Sorun: ${esc((o.dispute && o.dispute.note) || "")}</div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <select data-act><option value="release">İşletmeye ver</option><option value="refund">Üyeye tam iade</option><option value="partial">Kısmi</option></select>
            <input data-pct type="number" min="1" max="99" value="50" style="width:90px" title="İşletmeye geçecek %">
            <input data-note placeholder="Gerekçe (iki tarafa iletilir)" style="flex:1;min-width:220px">
            <button class="btn" data-resolve>Uygula</button>
          </div>
        </div>`).join("");
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }
  $("#bzDisputes")?.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-resolve]");
    if (!b) return;
    const card = b.closest("[data-id]");
    const action = card.querySelector("[data-act]").value;
    const pct = Number(card.querySelector("[data-pct]").value || 50);
    const note = card.querySelector("[data-note]").value.trim();
    if (note.length < 10) return toast("Gerekçe en az 10 karakter olmalı.");
    if (!confirm("Karar uygulansın mı? Bu işlem geri alınamaz.")) return;
    b.disabled = true;
    try {
      const r = await call({ op: "orderResolve", id: card.dataset.id, action, pct, note });
      toast(`Uygulandı · işletmeye ${r.toBiz} HP, üyeye ${r.toMember} HP.`);
      loadDisputes();
    } catch (e) { toast(errMsg(e)); b.disabled = false; }
  });
  $("#bzConfirmSave")?.addEventListener("click", async () => {
    const m = Number($("#bzConfirmMin").value);
    if (!Number.isInteger(m) || m < 1 || m > 1440) return toast("1–1440 dakika arası gir.");
    const ask = Number($("#bzAskH")?.value), ans = Number($("#bzAnsH")?.value);
    if (!Number.isInteger(ask) || ask < 1 || ask > 720) return toast("Soru süresi 1–720 saat olmalı.");
    if (!Number.isInteger(ans) || ans < 1 || ans > 168) return toast("Yanıt süresi 1–168 saat olmalı.");
    try { await call({ op: "orderConfigSet", deliveryConfirmMinutes: m, undeliveredAskHours: ask, undeliveredAnswerHours: ans }); toast("Kaydedildi."); } catch (e) { toast(errMsg(e)); }
  });

  async function loadPayouts() {
    const box = $("#bzPayouts");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      payouts = (await call({ op: "payoutsPending" })).items || [];
      if (!payouts.length) {
        box.innerHTML = '<div class="card"><p class="muted">Bekleyen ödeme talebi yok.</p></div>';
        return;
      }
      box.innerHTML = payouts.map((p, i) => `
        <div class="card">
          <div class="row" style="justify-content:space-between"><b>${esc(p.businessName)}</b><span class="muted small">${esc(fmt(p.createdAt))}</span></div>
          <p><b>${esc(tl(p.amountTl))}</b> · ${esc(p.baseHp ?? p.amountHp)} HP + %${esc(p.commissionPct ?? 0)} komisyon ${esc(p.commissionHp ?? 0)} HP = <b>${esc(p.amountHp)} HP</b> (1 HP = ${esc(p.hpToTl)} TL)<br>Fatura ${esc(p.invoiceNo)} · ${esc(p.invoiceDate)}<br>IBAN: <code>${esc(p.iban)}</code></p>
          <p class="muted small">Faturanın ${esc(companyName)} adına ve bu tutarda kesildiğini kontrol et; havaleyi yaptıktan sonra referansla "Ödendi" işaretle. İşletmenin HP bakiyesinden fatura tutarının HP karşılığı ve komisyon düşülür.</p>
          <div class="row" style="gap:8px">
            ${p.invoiceUrl ? `<a class="btn ghost" href="${esc(p.invoiceUrl)}" target="_blank" rel="noopener">Faturayı aç</a>` : ""}
            <input id="bzRef${i}" placeholder="Havale/EFT referansı" style="width:220px">
            <button class="btn" data-pok="${i}">Ödendi</button>
            <input id="bzPWhy${i}" placeholder="Ret gerekçesi" style="flex:1;min-width:180px">
            <button class="btn danger" data-pno="${i}">Reddet</button>
          </div>
        </div>`).join("");
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  $("#bzPayouts")?.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const i = Number(b.dataset.pok ?? b.dataset.pno);
    const p = payouts[i];
    if (!p) return;
    b.disabled = true;
    try {
      if (b.dataset.pok !== undefined) {
        const bankRef = ($("#bzRef" + i)?.value || "").trim();
        if (bankRef.length < 3) return toast("Havale/EFT referansını gir.");
        await call({ op: "payoutPaid", id: p.id, bankRef });
        toast("Ödeme kaydedildi.");
      } else {
        const reason = ($("#bzPWhy" + i)?.value || "").trim();
        if (reason.length < 3) return toast("Ret gerekçesi yaz.");
        await call({ op: "payoutReject", id: p.id, reason });
        toast("Talep reddedildi.");
      }
      await loadPayouts();
    } catch (x) {
      toast(errMsg(x));
    } finally {
      b.disabled = false;
    }
  });

  $("#bzRecSave")?.addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    const uid = ($("#bzRecUid")?.value || "").trim();
    const amountTl = Number($("#bzRecTl")?.value || 0);
    const invoiceNo = ($("#bzRecNo")?.value || "").trim();
    const invoiceDate = ($("#bzRecDate")?.value || "").trim();
    const bankRef = ($("#bzRecRef")?.value || "").trim();
    if (!uid || !(amountTl > 0) || invoiceNo.length < 3 || !invoiceDate || bankRef.length < 3) return toast("Tüm alanları doldur.");
    b.disabled = true;
    try {
      const r = await call({ op: "payoutRecord", uid, amountTl, invoiceNo, invoiceDate, bankRef });
      toast(`Kaydedildi: ${r.baseHp} HP + komisyon ${r.commissionHp} HP düşüldü.`);
    } catch (e) {
      toast(errMsg(e));
    } finally {
      b.disabled = false;
    }
  });

  $("#bzSave")?.addEventListener("click", async () => {
    if (!primary) return;
    const pct = Number($("#bzPct").value), rate = Number($("#bzRate").value || 0);
    if (!Number.isFinite(pct) || !Number.isFinite(rate)) return toast("Sayıları kontrol et.");
    try {
      await call({ op: "setConfig", commissionPct: pct, hpToTl: rate });
      toast("Kaydedildi.");
      await loadApps();
    } catch (e) {
      toast(errMsg(e));
    }
  });
  const ov = async (del) => {
    if (!primary) return;
    const uid = ($("#bzOvUid").value || "").trim();
    const pct = Number($("#bzOvPct").value);
    if (!uid || (!del && !Number.isFinite(pct))) return toast("Kimlik ve oran gir.");
    try {
      await call({ op: "setConfig", override: { uid, pct: del ? null : pct } });
      toast(del ? "Özel oran kaldırıldı." : "Özel oran kaydedildi.");
    } catch (e) {
      toast(errMsg(e));
    }
  };
  $("#bzOvSave")?.addEventListener("click", () => ov(false));
  $("#bzOvDel")?.addEventListener("click", () => ov(true));
})();
