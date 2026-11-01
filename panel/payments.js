/* HADİ Yönetim Paneli › Ödemeler (yalnızca ana kurucu). Sunucu: paymentsAdmin (functions/src/payments.ts).
   Anahtar değerleri sunucuya yazılır, asla geri okunmaz; yalnızca "••••1234" gösterilir. */
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
  const call = async (data) => (await window.hadiCallable(fns, "paymentsAdmin", { timeout: 60000 })(data)).data;
  const errMsg = (e) => String((e && e.message) || e).replace(/^.*?:\s*/, "");

  const NAMES = { play: "Google Play", appstore: "App Store", iyzico: "iyzico (kart, Troy)", paytr: "PayTR", bkm: "BKM Express", gsm: "GSM operatör", papara: "Papara" };
  const STORE = { play: true, appstore: true };
  let state = null; // { config, secrets, secretFields, providers, callbackUrl, webhookUrl }
  let dirty = false;

  firebase.auth().onAuthStateChanged(async (u) => {
    const btn = $("#payTabBtn");
    if (!btn) return;
    if (!u) return btn.classList.add("hide");
    const t = await u.getIdTokenResult();
    btn.classList.toggle("hide", t.claims.primary !== true);
  });
  $("#payTabBtn")?.addEventListener("click", () => { if (!state) load(); });
  $("#pyReload")?.addEventListener("click", () => {
    if (dirty && !confirm("Kaydedilmemiş değişiklikler kaybolacak. Yenilensin mi?")) return;
    load();
  });
  $("#pySave")?.addEventListener("click", save);
  $("#pyOrdLoad")?.addEventListener("click", loadOrders);

  // ------------------------------------------------------------ hesaplayıcı
  const netOf = (gross, taxPct, commPct, fee) => gross / (1 + taxPct / 100) - (gross * commPct) / 100 - fee;
  const hpValue = () => Number($("#pyHpValue").value) || (state && state.config.hpValueTl) || 1;
  const suggest = (gross, calc) => Math.max(0, Math.floor(netOf(gross, calc.taxPct, calc.commissionPct, calc.fixedFeeTl) / hpValue()));
  function calcTop() {
    const g = Number($("#pcGross").value) || 0;
    const net = netOf(g, Number($("#pcTax").value) || 0, Number($("#pcComm").value) || 0, Number($("#pcFee").value) || 0);
    $("#pcOut").textContent = `Net ≈ ${net.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL → önerilen ${Math.max(0, Math.floor(net / hpValue())).toLocaleString("tr-TR")} HP`;
  }
  ["#pcGross", "#pcTax", "#pcComm", "#pcFee", "#pyHpValue"].forEach((s) => $(s)?.addEventListener("input", () => { calcTop(); if (s === "#pyHpValue") { markDirty(); renderChannels(); } }));

  function markDirty() {
    dirty = true;
    $("#pyDirty").textContent = "Kaydedilmemiş değişiklikler var";
  }

  // ------------------------------------------------------------ yükle / kaydet
  async function load() {
    $("#pyChannels").innerHTML = '<div class="card muted">Yükleniyor…</div>';
    try {
      state = await call({ op: "get" });
    } catch (e) {
      $("#pyChannels").innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`;
      return;
    }
    const c = state.config;
    $("#pyWebUrl").value = c.webUrl;
    $("#pyHpValue").value = c.hpValueTl;
    $("#pyWebLink").checked = c.webLinkInApp;
    $("#pyCallback").value = c.callbackUrl;
    $("#pyResult").value = c.resultUrl;
    $("#pyCity").value = c.buyer.city;
    $("#pyAddr").value = c.buyer.address;
    $("#pyZip").value = c.buyer.zip;
    $("#pyIdent").value = c.buyer.identityPlaceholder;
    $("#pyUrls").innerHTML = `Sağlayıcı dönüş adresi: <code>${esc(state.callbackUrl)}?ch=&lt;kanal&gt;</code> · iyzico bildirim (webhook) adresi: <code>${esc(state.webhookUrl)}</code>`;
    ["#pyWebUrl", "#pyCallback", "#pyResult", "#pyCity", "#pyAddr", "#pyZip", "#pyIdent"].forEach((s) => ($(s).oninput = markDirty));
    $("#pyWebLink").onchange = () => {
      if ($("#pyWebLink").checked && !confirm("Uygulama içinde web ödeme sayfasına yönlendirme (anti-steering) Google Play ve App Store kurallarını ihlal edebilir. Hukuki inceleme yapıldı mı?")) {
        $("#pyWebLink").checked = false;
        return;
      }
      markDirty();
    };
    dirty = false;
    $("#pyDirty").textContent = "Değişiklik yok";
    calcTop();
    renderChannels();
  }

  function collectTop() {
    const c = state.config;
    c.webUrl = $("#pyWebUrl").value.trim();
    c.hpValueTl = Number($("#pyHpValue").value) || 1;
    c.webLinkInApp = $("#pyWebLink").checked;
    c.callbackUrl = $("#pyCallback").value.trim();
    c.resultUrl = $("#pyResult").value.trim();
    c.buyer = { city: $("#pyCity").value.trim(), country: c.buyer.country || "Turkey", address: $("#pyAddr").value.trim(), zip: $("#pyZip").value.trim(), identityPlaceholder: $("#pyIdent").value.trim() };
  }

  async function save() {
    if (!state) return;
    collectTop();
    $("#pySave").disabled = true;
    try {
      const r = await call({ op: "set", config: state.config });
      state.config = r.config;
      dirty = false;
      $("#pyDirty").textContent = "Kaydedildi";
      renderChannels();
      toast("Ödeme ayarları kaydedildi.");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      $("#pySave").disabled = false;
    }
  }

  // ------------------------------------------------------------ kanallar
  function renderChannels() {
    if (!state) return;
    const out = [];
    for (const id of Object.keys(NAMES)) {
      const ch = state.config.channels[id];
      if (!ch) continue;
      const ready = state.providers[id] && state.providers[id].ready;
      const fields = state.secretFields[id] || [];
      const sec = state.secrets[id] || {};
      const missing = fields.filter((f) => !(sec[f] && sec[f].set));
      const inAppAlt = !STORE[id] && (ch.showInApp.android || ch.showInApp.ios);
      const status = !ch.enabled ? '<span class="pill off">Kapalı</span>'
        : !ready ? '<span class="pill off">Açık ama entegrasyon yok — gösterilmez</span>'
        : missing.length ? `<span class="pill off">Anahtar eksik: ${esc(missing.join(", "))}</span>`
        : '<span class="pill on">Kullanımda</span>';
      out.push(`<div class="card" data-ch="${id}">
        <div class="row" style="justify-content:space-between;align-items:center">
          <h3 style="flex:1">${esc(NAMES[id])} ${status} ${!STORE[id] && ch.sandbox ? '<span class="pill">Sandbox / test</span>' : ""}</h3>
          <label class="switch" title="Açık / kapalı"><input type="checkbox" data-k="enabled" ${ch.enabled ? "checked" : ""}><span></span></label>
        </div>
        ${ready ? "" : `<div class="note">Sağlayıcı sözleşmesi ve anahtarlar gerekli; bu kanalın sunucu entegrasyonu henüz bir iskelet (ödeme başlatılamaz, sahte başarı yok). Sözleşme yapıldığında sağlayıcının API belgesine göre tamamlanmalı.</div>`}
        ${inAppAlt ? `<div class="note err"><b>Uygulama içinde gösteriliyor.</b> Play/App Store dağıtımında dijital ürün için mağaza dışı ödeme politikaya aykırı olabilir. Yalnızca hukuki/politika onayından sonra açık bırakın.</div>` : ""}
        <div class="row">
          <div style="flex:1;min-width:220px"><label>Görünen ad</label><input data-k="label" value="${esc(ch.label)}" maxlength="60"></div>
          <div style="flex:1;min-width:220px"><label>Kısa not (üyeye)</label><input data-k="note" value="${esc(ch.note)}" maxlength="200"></div>
          ${id === "gsm" ? `<div style="width:220px"><label>Aracı firma</label><input data-k="provider" value="${esc(ch.provider)}" placeholder="ör. Payguru"></div>` : ""}
          ${STORE[id] ? "" : `<label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" data-k="sandbox" style="width:auto" ${ch.sandbox ? "checked" : ""}> Sandbox (test) ortamı</label>`}
        </div>
        <div class="row" style="margin-top:6px">
          <span class="muted small" style="font-weight:700">Gösterildiği yer:</span>
          ${["android", "ios", "web"].map((p) => {
            const locked = (id === "play" && p !== "android") || (id === "appstore" && p !== "ios");
            return `<label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" data-sia="${p}" style="width:auto" ${ch.showInApp[p] ? "checked" : ""} ${locked ? "disabled" : ""}> ${p === "android" ? "Android uygulaması" : p === "ios" ? "iOS uygulaması" : "Web (/hp)"}</label>`;
          }).join("")}
        </div>
        <div class="row">
          <div style="width:130px"><label>Komisyon %</label><input type="number" step="0.1" min="0" data-calc="commissionPct" value="${ch.calc.commissionPct}"></div>
          <div style="width:110px"><label>KDV %</label><input type="number" step="0.1" min="0" data-calc="taxPct" value="${ch.calc.taxPct}"></div>
          <div style="width:140px"><label>Sabit ücret TL</label><input type="number" step="0.01" min="0" data-calc="fixedFeeTl" value="${ch.calc.fixedFeeTl}"></div>
        </div>
        <table style="margin-top:10px"><thead><tr>${STORE[id] ? "<th>Ürün kimliği (productId)</th>" : ""}<th class="num">${STORE[id] ? "Mağaza fiyatı TL (bilgi)" : "TL"}</th><th class="num">HP</th><th class="num">Önerilen HP</th><th>Görünüm</th><th></th></tr></thead><tbody>
          ${ch.packages.map((p, i) => `<tr data-i="${i}">
            ${STORE[id] ? `<td><input data-pk="productId" value="${esc(p.productId || "")}" style="min-width:160px"></td>` : ""}
            <td class="num"><input type="number" step="0.01" min="0" data-pk="tl" value="${p.tl}" style="width:110px"></td>
            <td class="num"><input type="number" step="1" min="1" data-pk="hp" value="${p.hp}" style="width:110px"></td>
            <td class="num">${p.tl > 0 ? `${suggest(p.tl, ch.calc).toLocaleString("tr-TR")} <button class="btn ghost" data-use="${i}" style="padding:4px 8px">Uygula</button>` : "–"}</td>
            <td class="muted">${p.tl > 0 ? `${p.tl.toLocaleString("tr-TR")} TL → ${p.hp.toLocaleString("tr-TR")} HP` : `${p.hp.toLocaleString("tr-TR")} HP`}</td>
            <td><button class="btn ghost" data-del="${i}" style="padding:4px 10px">Sil</button></td></tr>`).join("")}
        </tbody></table>
        <div class="row" style="margin-top:8px"><button class="btn ghost" data-add="1">+ Paket ekle</button></div>
        ${STORE[id] ? `<p class="muted small">Fiyatı mağaza belirler (Play Console / App Store Connect). Buradaki HP, doğrulamada (iapVerify) bakiyeye eklenen miktardır; ürün kimliği mağazadakiyle aynı olmalı.</p>` : `
        <div class="row">
          <div style="width:150px"><label>Serbest tutar: 1 TL = HP</label><input type="number" step="0.01" min="0" data-k="hpPerTry" value="${ch.hpPerTry}"></div>
          <div style="width:120px"><label>En az TL</label><input type="number" step="1" min="0" data-k="customMinTl" value="${ch.customMinTl}"></div>
          <div style="width:120px"><label>En çok TL</label><input type="number" step="1" min="0" data-k="customMaxTl" value="${ch.customMaxTl}"></div>
          <span class="muted small" style="margin-bottom:10px">0 = serbest tutar kapalı. Öneri: ${(Math.floor(netOf(100, ch.calc.taxPct, ch.calc.commissionPct, ch.calc.fixedFeeTl) / hpValue() * 100) / 100).toLocaleString("tr-TR")} HP / TL</span>
        </div>`}
        ${fields.length ? `<h4 style="margin:14px 0 4px">Anahtarlar <span class="muted small">(sunucuda saklanır; geri okunamaz)</span></h4>
          ${fields.map((f) => {
            const st = sec[f] || {};
            return `<div class="row" style="align-items:center;margin-top:6px">
              <b style="width:150px">${esc(f)}</b>
              <span class="muted small" style="width:220px">${st.set ? `${esc(st.masked)} · ${st.store === "sm" ? "Secret Manager" : "Firestore (yedek)"}` : "ayarlanmadı"}</span>
              <input type="password" autocomplete="new-password" data-secret="${esc(f)}" placeholder="Yeni değer" style="flex:1;min-width:180px">
              <button class="btn ghost" data-secsave="${esc(f)}">Kaydet</button>
              ${st.set ? `<button class="btn ghost" data-secclear="${esc(f)}">Sil</button>` : ""}
            </div>`;
          }).join("")}` : ""}
        <div class="row" style="margin-top:10px"><button class="btn ghost" data-test="1">Bağlantıyı test et</button><span class="muted small" data-testout></span></div>
      </div>`);
    }
    $("#pyChannels").innerHTML = out.join("");
    bind();
  }

  function bind() {
    document.querySelectorAll("#pyChannels [data-ch]").forEach((card) => {
      const id = card.dataset.ch;
      const ch = state.config.channels[id];
      card.querySelectorAll("[data-k]").forEach((el) => {
        el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
          const k = el.dataset.k;
          ch[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) || 0 : el.value;
          markDirty();
          if (el.type === "checkbox") renderChannels();
        });
      });
      card.querySelectorAll("[data-sia]").forEach((el) => el.addEventListener("change", () => {
        const p = el.dataset.sia;
        if (el.checked && !STORE[id] && p !== "web" && !confirm("Bu ödeme yöntemini mağaza uygulamasında göstermek Google Play / App Store ödeme politikalarına aykırı olabilir (Türkiye alternatif faturalandırma programında değil). Hukuki/politika incelemesi yapıldı mı?")) {
          el.checked = false;
          return;
        }
        ch.showInApp[p] = el.checked;
        markDirty();
        renderChannels();
      }));
      card.querySelectorAll("[data-calc]").forEach((el) => el.addEventListener("change", () => {
        ch.calc[el.dataset.calc] = Number(el.value) || 0;
        markDirty();
        renderChannels();
      }));
      card.querySelectorAll("tr[data-i]").forEach((tr) => {
        const p = ch.packages[Number(tr.dataset.i)];
        tr.querySelectorAll("[data-pk]").forEach((el) => el.addEventListener("change", () => {
          p[el.dataset.pk] = el.dataset.pk === "productId" ? el.value.trim() : Number(el.value) || 0;
          markDirty();
          renderChannels();
        }));
      });
      card.querySelectorAll("[data-use]").forEach((b) => b.addEventListener("click", () => {
        const p = ch.packages[Number(b.dataset.use)];
        p.hp = suggest(p.tl, ch.calc);
        markDirty();
        renderChannels();
      }));
      card.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
        ch.packages.splice(Number(b.dataset.del), 1);
        markDirty();
        renderChannels();
      }));
      card.querySelector("[data-add]")?.addEventListener("click", () => {
        if (ch.packages.length >= 12) return toast("En çok 12 paket.");
        ch.packages.push(STORE[id] ? { productId: "", tl: 0, hp: 100 } : { tl: 100, hp: suggest(100, ch.calc) || 1 });
        markDirty();
        renderChannels();
      });
      card.querySelectorAll("[data-secsave]").forEach((b) => b.addEventListener("click", async () => {
        const key = b.dataset.secsave;
        const input = card.querySelector(`[data-secret="${key}"]`);
        const value = input.value.trim();
        if (!value) return toast("Değer gir.");
        b.disabled = true;
        try {
          const r = await call({ op: "setSecret", channel: id, key, value });
          input.value = "";
          state.secrets[id][key] = { set: true, masked: r.masked, store: r.store, updatedAt: Date.now() };
          toast(`${key} kaydedildi (${r.store === "sm" ? "Secret Manager" : "Firestore yedeği"}).`);
          renderChannels();
        } catch (e) {
          toast(errMsg(e));
        } finally {
          b.disabled = false;
        }
      }));
      card.querySelectorAll("[data-secclear]").forEach((b) => b.addEventListener("click", async () => {
        const key = b.dataset.secclear;
        if (!confirm(`${NAMES[id]} › ${key} silinsin mi? Bu kanal ödeme alamaz hale gelir.`)) return;
        try {
          await call({ op: "clearSecret", channel: id, key });
          state.secrets[id][key] = { set: false, masked: null, store: null };
          renderChannels();
        } catch (e) {
          toast(errMsg(e));
        }
      }));
      card.querySelector("[data-test]")?.addEventListener("click", async (ev) => {
        const out = card.querySelector("[data-testout]");
        if (dirty) out.textContent = "Not: test kayıtlı ayarlarla yapılır (sandbox seçimi dahil). ";
        ev.target.disabled = true;
        try {
          const r = await call({ op: "test", channel: id });
          out.textContent = (dirty ? out.textContent : "") + `${r.ok ? "✅" : "⚠️"} ${r.message}${r.ms ? ` (${r.ms} ms)` : ""}`;
        } catch (e) {
          out.textContent = errMsg(e);
        } finally {
          ev.target.disabled = false;
        }
      });
    });
  }

  // ------------------------------------------------------------ siparişler
  async function loadOrders() {
    $("#pyOrders").textContent = "Yükleniyor…";
    try {
      const r = await call({ op: "orders", limit: 100, status: $("#pyOrdStatus").value });
      if (!r.orders.length) return ($("#pyOrders").textContent = "Sipariş yok.");
      const dt = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR") : "–");
      $("#pyOrders").innerHTML = `<table><thead><tr><th>Tarih</th><th>Kanal</th><th class="num">TL</th><th class="num">HP</th><th>Durum</th><th>Üye (uid)</th><th>Sağlayıcı no</th><th>Not</th><th></th></tr></thead><tbody>${r.orders.map((o) => `<tr>
        <td>${esc(dt(o.createdAt))}</td><td>${esc(NAMES[o.channel] || o.channel)}${o.sandbox ? ' <span class="pill">test</span>' : ""}</td>
        <td class="num">${esc(o.tl)}</td><td class="num">${esc(o.hp)}</td>
        <td><span class="pill ${o.status === "paid" ? "on" : o.status === "review" || o.status === "failed" ? "off" : ""}">${esc(o.status)}</span></td>
        <td>${esc(o.uid)}</td><td>${esc(o.ref || "")}</td><td>${esc(o.review || o.error || "")}</td>
        <td>${o.status !== "paid" && o.status !== "created" ? `<button class="btn ghost" data-recheck="${esc(o.id)}" style="padding:4px 10px">Sağlayıcıya sor</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
      document.querySelectorAll("[data-recheck]").forEach((b) => b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          const x = await call({ op: "recheck", orderId: b.dataset.recheck });
          toast(`Sonuç: ${x.result}${x.review ? " · " + x.review : ""}${x.error ? " · " + x.error : ""}`);
          loadOrders();
        } catch (e) {
          toast(errMsg(e));
          b.disabled = false;
        }
      }));
    } catch (e) {
      $("#pyOrders").textContent = errMsg(e);
    }
  }
})();
