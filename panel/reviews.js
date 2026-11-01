/* HADİ Yönetim Paneli › İnceleme kuyrukları.
   • Adres belgeleri: addressVerification callable { op: list | approve {uid, il, ilce} | reject {uid, reason} }
     (functions/src/address_verification.ts). e-Devlet'te elle doğrulama; karar sonrası belge silinir.
   • Kahve güvenliği: kahve callable { op: safetyList | safetyDecide {uid, decision: clear|exclude, note} }
     (functions/src/kahve_profile.ts). Yapay zekâ yalnızca Kahve havuzundan geçici çıkarır; kararı yetkili verir. */
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
  const call = async (name, data) => (await window.hadiCallable(fns, name, { timeout: 60000 })(data)).data;
  const errMsg = (e) => String((e && e.message) || e).replace(/^.*?:\s*/, "");
  const fmt = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR") : "");
  const EDEVLET = "https://www.turkiye.gov.tr/belge-dogrulama";

  // ------------------------------------------------------------------ adres belgeleri
  let addr = [];
  $("#addrRevTabBtn")?.addEventListener("click", loadAddr);
  $("#arReload")?.addEventListener("click", loadAddr);

  async function loadAddr() {
    const box = $("#arList");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await call("addressVerification", { op: "list" });
      addr = d.items || [];
      drawAddr();
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  function drawAddr() {
    const box = $("#arList");
    if (!addr.length) {
      box.innerHTML = '<div class="card"><p class="muted">Bekleyen adres belgesi yok 🎉</p></div>';
      return;
    }
    box.innerHTML = addr.map((r, i) => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>${esc(r.name || r.uid)}</b>
          <span class="muted small">${esc(r.phone)} · ${esc(fmt(r.submittedAt))}</span>
        </div>
        <p>Barkod: <code>${esc(r.code)}</code> <button class="btn ghost" data-copy="${i}">Kopyala</button></p>
        <div class="row" style="gap:8px">
          ${r.pdfUrl ? `<a class="btn ghost" href="${esc(r.pdfUrl)}" target="_blank" rel="noopener">Belgeyi aç (10 dk)</a>` : '<span class="muted small">Belge bağlantısı oluşturulamadı.</span>'}
          <a class="btn ghost" href="${EDEVLET}" target="_blank" rel="noopener">e-Devlet'te doğrula</a>
        </div>
        <div class="row" style="gap:8px;margin-top:10px">
          <div style="width:160px"><label>İl</label><input id="arIl${i}" maxlength="40"></div>
          <div style="width:180px"><label>İlçe</label><input id="arIlce${i}" maxlength="60"></div>
          <div style="flex:1;min-width:200px"><label>Ret gerekçesi (üyeye gider)</label><input id="arWhy${i}" maxlength="300"></div>
        </div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn" data-ar="${i}" data-op="approve">Onayla</button>
          <button class="btn ghost" data-ar="${i}" data-op="reject">Reddet</button>
        </div>
      </div>`).join("");
    box.querySelectorAll("button[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(addr[Number(b.dataset.copy)].code);
        toast("Barkod kopyalandı.");
      } catch {
        toast("Kopyalanamadı.");
      }
    }));
    box.querySelectorAll("button[data-ar]").forEach((b) => b.addEventListener("click", () => decideAddr(Number(b.dataset.ar), b.dataset.op, b)));
  }

  async function decideAddr(i, op, btn) {
    const r = addr[i];
    if (!r) return;
    const il = ($("#arIl" + i)?.value || "").trim();
    const ilce = ($("#arIlce" + i)?.value || "").trim();
    const reason = ($("#arWhy" + i)?.value || "").trim();
    if (op === "approve" && !il) return toast("Belgedeki ili gir.");
    if (op === "reject" && !reason) return toast("Ret gerekçesi yaz.");
    if (op === "approve" && !confirm(`${r.name || r.uid}: belgeyi e-Devlet'te doğruladın mı? Onaylansın mı?`)) return;
    btn.disabled = true;
    try {
      await call("addressVerification", op === "approve" ? { op, uid: r.uid, il, ilce } : { op, uid: r.uid, reason });
      toast(op === "approve" ? "Adres onaylandı." : "Belge reddedildi.");
      loadAddr();
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  }

  // ------------------------------------------------------------------ Kahve güvenliği
  const CAT = { siddet: "Şiddet", tehdit: "Tehdit", taciz: "Taciz", cinsel_taciz: "Cinsel taciz", israrli_takip: "Israrlı takip", baski_kontrol: "Baskı/kontrol", nefret: "Nefret söylemi" };
  let ks = [];
  $("#kahveSafeTabBtn")?.addEventListener("click", loadKs);
  $("#ksReload")?.addEventListener("click", loadKs);

  async function loadKs() {
    const box = $("#ksList");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await call("kahve", { op: "safetyList" });
      ks = d.items || [];
      drawKs();
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  function drawKs() {
    const box = $("#ksList");
    if (!ks.length) {
      box.innerHTML = '<div class="card"><p class="muted">Bekleyen Kahve güvenlik incelemesi yok 🎉</p></div>';
      return;
    }
    box.innerHTML = ks.map((it, i) => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>${esc(it.name || it.uid)}</b>
          <span><span class="pill" style="background:#fbe6e6;color:#a62f2f">Risk %${Math.round((it.score || 0) * 100)}</span>
          ${(it.categories || []).map((c) => `<span class="pill">${esc(CAT[c] || c)}</span>`).join("")}</span>
        </div>
        <p class="muted small">${esc(fmt(it.at))}</p>
        ${(it.evidence || []).map((e) => `<div class="note"><i>“${esc(e)}”</i></div>`).join("")}
        <label>Not (denetim kaydına, isteğe bağlı)</label>
        <input id="ksNote${i}" maxlength="300" style="width:100%">
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn ghost" data-ks="${i}" data-d="clear">Eşleşmeye geri al</button>
          <button class="btn" data-ks="${i}" data-d="exclude">Kahve dışında tut</button>
        </div>
      </div>`).join("");
    box.querySelectorAll("button[data-ks]").forEach((b) => b.addEventListener("click", () => decideKs(Number(b.dataset.ks), b.dataset.d, b)));
  }

  async function decideKs(i, decision, btn) {
    const it = ks[i];
    if (!it) return;
    btn.disabled = true;
    try {
      await call("kahve", { op: "safetyDecide", uid: it.uid, decision, note: ($("#ksNote" + i)?.value || "").trim() });
      toast(decision === "clear" ? "Üye eşleşmeye geri alındı." : "Üye Kahve Eşleşmesi dışında tutuluyor.");
      loadKs();
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  }
})();
