/* HADİ Yönetim Paneli › Kimlik doğrulama incelemesi.
   identity callable { op: list {status} | approve {uid, firstName?, lastName?} | reject {uid, reason} } (functions/src/identity.ts).
   Otomatik kontroller (SOD imzası, DG1/DG2 özetleri, CSCA, cihaz üstü yüz eşleşmesi, canlılık) bilgi içindir; kararı yetkili verir. */
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

  let items = [];
  $("#idRevTabBtn")?.addEventListener("click", load);
  $("#irReload")?.addEventListener("click", load);
  $("#irStatus")?.addEventListener("change", load);

  async function load() {
    const box = $("#irList");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const d = await call("identity", { op: "list", status: $("#irStatus")?.value || "pending" });
      items = d.items || [];
      draw();
    } catch (e) {
      box.innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
    }
  }

  const mark = (v) => (v === true || v === "verified" ? "✅" : v === null || v === undefined || v === "unverified" ? "❔" : "❌");

  function draw() {
    const box = $("#irList");
    if (!items.length) {
      box.innerHTML = '<div class="card"><p class="muted">Kayıt yok.</p></div>';
      return;
    }
    box.innerHTML = items.map((r, i) => {
      const c = r.checks || {};
      const m = r.mrz || {};
      const score = typeof c.faceMatchScore === "number" ? Math.round(c.faceMatchScore * 100) : null;
      const thr = typeof c.faceThreshold === "number" ? Math.round(c.faceThreshold * 100) : null;
      const src = c.faceSource === "dg2" ? "çip fotoğrafı" : c.faceSource === "card_photo" ? "kart fotoğrafı" : "model yok";
      const names = String(r.userName || "").split(" ");
      const ln = names.length > 1 ? names.pop() : "";
      const fn = names.join(" ");
      return `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>${esc(r.userName || r.uid)}${r.username ? ` <span class="muted">@${esc(r.username)}</span>` : ""}</b>
          <span class="muted small">${esc(fmt(r.submittedAt))}${r.autoOk ? " · ✅ kontroller tamam" : ""}</span>
        </div>
        <p>Çip: <b>${esc(m.givenNames)} ${esc(m.surname)}</b> · doğum ${esc(m.birthDate)} · geçerlilik ${esc(m.expiry)} · ${esc(m.nationality)} ${esc(m.docType)}</p>
        <p class="small">
          ${mark(c.signatureOk)} Devlet imzası (${esc(c.hashAlg || "-")}) ·
          ${mark(c.messageDigestOk)} İmzalı özet ·
          ${mark(c.dg1HashOk)} DG1 ·
          ${mark(c.dg2HashOk)} DG2 ·
          ${mark(c.chain)} CSCA ${c.chain === "unverified" ? "(kök sertifika yok)" : ""} ·
          ${mark(score !== null && thr !== null ? score >= thr : null)} Yüz ${score !== null ? `%${score} (eşik %${thr}, ${src})` : ""} ·
          ${mark(c.livenessOk)} Canlılık ·
          ${mark(c.nameMatch)} Ad · ${mark(c.birthMatch)} Doğum tarihi
          ${c.error ? `<br><span class="muted">Not: ${esc(c.error)}</span>` : ""}
        </p>
        <div class="row" style="gap:12px;align-items:flex-start">
          ${r.photoUrl ? `<img src="${esc(r.photoUrl)}" alt="Profil" style="width:96px;height:96px;object-fit:cover;border-radius:12px">` : ""}
          ${r.handheldUrl ? `<a href="${esc(r.handheldUrl)}" target="_blank" rel="noopener"><img src="${esc(r.handheldUrl)}" alt="Kimlik elde" style="max-width:320px;max-height:320px;border-radius:12px"></a>` : ""}
        </div>
        ${r.reason ? `<p>Gerekçe: ${esc(r.reason)}</p>` : ""}
        ${r.status === "pending" ? `
        <div class="row" style="gap:8px;margin-top:10px">
          <div style="width:180px"><label>Ad (Türkçe harflerle)</label><input id="irFn${i}" maxlength="40" value="${esc(fn)}"></div>
          <div style="width:180px"><label>Soyad</label><input id="irLn${i}" maxlength="40" value="${esc(ln)}"></div>
          <div style="flex:1;min-width:200px"><label>Ret gerekçesi (üyeye gider)</label><input id="irWhy${i}" maxlength="300"></div>
        </div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn" data-ir="${i}" data-op="approve">Onayla</button>
          <button class="btn ghost" data-ir="${i}" data-op="reject">Reddet</button>
        </div>` : ""}
      </div>`;
    }).join("");
    box.querySelectorAll("button[data-ir]").forEach((b) => b.addEventListener("click", () => decide(Number(b.dataset.ir), b.dataset.op, b)));
  }

  async function decide(i, op, btn) {
    const r = items[i];
    if (!r) return;
    const payload = { op, uid: r.uid };
    if (op === "reject") {
      const why = ($(`#irWhy${i}`)?.value || "").trim();
      if (!why) return toast("Ret gerekçesi yaz.");
      payload.reason = why;
    } else {
      if (!confirm(`${r.userName || r.uid} kimliği onaylansın mı? Ad soyad kilitlenecek.`)) return;
      const fn = ($(`#irFn${i}`)?.value || "").trim(), ln = ($(`#irLn${i}`)?.value || "").trim();
      if (fn && ln) { payload.firstName = fn; payload.lastName = ln; }
    }
    btn.disabled = true;
    try {
      await call("identity", payload);
      toast(op === "approve" ? "Kimlik onaylandı." : "Reddedildi.");
      await load();
    } catch (e) {
      toast(errMsg(e));
      btn.disabled = false;
    }
  }
})();
