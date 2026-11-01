/* HADİ Yönetim Paneli — analitik raporları ve reklam yönetimi.
   Veriler Cloud Functions üzerinden gelir (analytics.report, ads.*); yetki sunucuda denetlenir. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("tr-TR"));
  const min = (ms) => (ms ? Math.round(ms / 60000).toLocaleString("tr-TR") : "0");
  const sec = (ms) => (ms ? (ms / 1000).toFixed(1).replace(".", ",") + " sn" : "–");
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "–");
  const toast = (m) => {
    const t = $("#toast");
    t.textContent = m;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  };
  const SCREEN_NAMES = {
    "tab~akis": "Akış", "tab~anlar": "Anlar", "tab~etkinlikler": "Etkinlikler", "tab~profil": "Profil", sheet: "Alt pencere",
    "_uye_~uid": "Üye profili", "_gonderi_~id": "Gönderi", "_sohbet_~id": "Sohbet", "_etkinlik_~id": "Etkinlik", "_mesajlar": "Mesajlar",
    "_bildirimler": "Bildirimler", "_ara": "Arama", "_gizlilik": "Gizlilik", "_canli_~id": "Canlı yayın", "_grup_~id": "Grup",
  };
  const scrName = (k) => SCREEN_NAMES[k] || k.replace(/^_/, "/").replace(/~/g, ":");

  if (!window.HADI_FIREBASE || !window.HADI_FIREBASE.apiKey) {
    document.body.innerHTML = '<div style="max-width:560px;margin:15vh auto;font-family:sans-serif;padding:20px"><h2>Panel ayarlanmadı</h2><p>panel/config.js dosyasına Firebase web uygulaması değerlerini gir.</p></div>';
    return;
  }
  firebase.initializeApp(window.HADI_FIREBASE);
  const auth = firebase.auth();
  auth.languageCode = "tr";
  const fns = firebase.app().functions(window.HADI_REGION || "europe-west1");
  const call = async (name, data) => (await window.hadiCallable(fns, name, { timeout: 60000 })(data)).data;
  const charts = {};
  let isPrimary = false;
  let report = null;

  // ------------------------------------------------------------------ giriş
  let confirmation = null;
  const verifier = new firebase.auth.RecaptchaVerifier("recaptcha", { size: "invisible" });
  $("#sendCode").onclick = async () => {
    $("#loginErr").textContent = "";
    let p = $("#phone").value.replace(/\D/g, "");
    if (p.startsWith("90")) p = p.slice(2);
    if (p.startsWith("0")) p = p.slice(1);
    if (p.length !== 10) return ($("#loginErr").textContent = "Numarayı 5xx xxx xx xx biçiminde yaz.");
    $("#sendCode").disabled = true;
    try {
      confirmation = await auth.signInWithPhoneNumber("+90" + p, verifier);
      $("#stepPhone").classList.add("hide");
      $("#stepCode").classList.remove("hide");
    } catch (e) {
      $("#loginErr").textContent = "Kod gönderilemedi: " + (e.message || e);
    } finally {
      $("#sendCode").disabled = false;
    }
  };
  $("#verify").onclick = async () => {
    try {
      await confirmation.confirm($("#code").value.trim());
    } catch (e) {
      $("#loginErr").textContent = "Kod hatalı.";
    }
  };
  $("#logout").onclick = () => auth.signOut();

  auth.onAuthStateChanged(async (u) => {
    if (!u) {
      $("#app").classList.add("hide");
      $("#login").classList.remove("hide");
      return;
    }
    const t = await u.getIdTokenResult(true);
    if (!["founder", "admin"].includes(t.claims.role)) {
      $("#loginErr").textContent = "Bu panel yalnızca kurucular ve yöneticiler içindir.";
      await auth.signOut();
      return;
    }
    $("#login").classList.add("hide");
    $("#app").classList.remove("hide");
    $("#who").textContent = (u.phoneNumber || "") + " · " + (t.claims.primary ? "Ana kurucu" : t.claims.role === "founder" ? "Kurucu" : "Yönetici");
    isPrimary = t.claims.primary === true;
    // Roller yalnızca kuruculara (yöneticiler görmez)
    const rolesTab = $('#tabs [data-t="roles"]');
    if (rolesTab) rolesTab.classList.toggle("hide", !(t.claims.role === "founder" || isPrimary));
    // Bağışlar yalnızca kuruculara (donations: kurucu işlemleri)
    const donTab = $('#tabs [data-t="donations"]');
    if (donTab) donTab.classList.toggle("hide", !(t.claims.role === "founder" || isPrimary));
    load();
  });

  // ------------------------------------------------------------------ sekmeler
  let tab = "overview";
  $$("#tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.t;
      $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
      $$("[data-p]").forEach((p) => p.classList.toggle("hide", p.dataset.p !== tab));
      $("#rangeRow").classList.toggle("hide", !["overview", "screens", "actions"].includes(tab));
      if (tab === "content") loadContent();
      if (tab === "ads") loadAds();
      if (tab === "promos") loadPromos();
      if (tab === "appeals") loadAppeals();
      if (tab === "hidden") loadHidden();
      if (tab === "premium") loadPremium();
      if (tab === "ai") loadAi();
      if (tab === "bots") loadBots();
      if (tab === "version") loadVersion();
      if (tab === "nudges") loadNudges();
      if (tab === "prices") { loadPrices(); loadEventRefund(); loadEventPolicy(); }
      if (tab === "hpbank") loadHpBank();
      if (tab === "donations") loadDonations();
      if (tab === "economy") loadEconomy();
      if (tab === "quiz") loadQuiz();
      if (tab === "rides") loadRides();
      if (tab === "mevents") loadMemberEvents();
      if (tab === "roles") { loadRoles(); loadRoleAudit(); }
      if (tab === "aivideo") loadAiVideoTab();
    })
  );
  $("#reload").onclick = () => load();
  $("#days").onchange = () => load();
  $("#kind").onchange = () => loadContent();

  // ------------------------------------------------------------------ tablo yardımcısı (sıralanabilir)
  function table(el, cols, rows) {
    let sortKey = null, dir = -1;
    const draw = () => {
      const r = sortKey == null ? rows : [...rows].sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr")) * dir;
      });
      el.innerHTML =
        "<table><thead><tr>" + cols.map((c, i) => `<th data-i="${i}" class="${c.num ? "num" : ""}">${esc(c.t)}</th>`).join("") + "</tr></thead><tbody>" +
        (r.length ? r.map((row) => "<tr>" + cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.f ? c.f(row) : esc(row[c.k])}</td>`).join("") + "</tr>").join("")
          : `<tr><td colspan="${cols.length}" class="muted">Veri yok</td></tr>`) +
        "</tbody></table>";
      el.querySelectorAll("th").forEach((th) => (th.onclick = () => {
        const k = cols[+th.dataset.i].k;
        if (!k) return;
        dir = sortKey === k ? -dir : -1;
        sortKey = k;
        draw();
      }));
    };
    draw();
  }

  function chart(id, type, labels, datasets, opts = {}) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
      type, data: { labels, datasets },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: datasets.length > 1 } }, scales: { y: { beginAtZero: true } }, ...opts },
    });
    document.getElementById(id).parentElement.style.height = "340px";
  }
  const COLORS = ["#F2801F", "#1D9AD6", "#78BE3A", "#A3338C", "#E0407A", "#17344F", "#D9A93A", "#6B7F92"];

  // ------------------------------------------------------------------ rapor
  async function load() {
    $("#stamp").textContent = "Yükleniyor…";
    try {
      report = await call("analytics", { op: "report", days: +$("#days").value, kind: "all" });
    } catch (e) {
      $("#stamp").textContent = "Hata: " + (e.message || e);
      return;
    }
    $("#stamp").textContent = "Güncellendi: " + new Date().toLocaleTimeString("tr-TR");
    drawOverview();
    drawScreens();
    drawActions();
  }

  function drawOverview() {
    const d = report.daily;
    const labels = d.map((x) => x.day.slice(5).split("-").reverse().join("."));
    const today = d[d.length - 1] || {};
    const sum = (f) => d.reduce((a, x) => a + (f(x) || 0), 0);
    const sessN = sum((x) => x.session?.n), sessMs = sum((x) => x.session?.ms);
    const avgDau = Math.round(sum((x) => x.dau) / Math.max(1, d.length));
    const watchMs = sum((x) => Object.values(x.watch || {}).reduce((a, w) => a + (w.ms || 0), 0));
    $("#kpis").innerHTML = [
      ["Toplam üye", fmt(report.members)],
      ["Veri paylaşımına izin veren", `${fmt(report.consented)} <span class="small muted">(${pct(report.consented, report.members)})</span>`],
      ["Bugün aktif", fmt(today.dau)],
      ["Ort. günlük aktif", fmt(avgDau)],
      ["Oturum", fmt(sessN)],
      ["Ort. oturum süresi", sessN ? Math.round(sessMs / sessN / 1000 / 60 * 10) / 10 + " dk" : "–"],
      ["Toplam izleme", min(watchMs) + " dk"],
      ["Ekran geçişi", fmt(sum((x) => x.ev?.screen_view))],
    ].map(([t, v]) => `<div class="kpi"><span class="muted small">${t}</span><b>${v}</b></div>`).join("");

    chart("cDau", "line", labels, [{ label: "Aktif üye", data: d.map((x) => x.dau || 0), borderColor: "#F2801F", backgroundColor: "#F2801F33", fill: true, tension: .3 }]);
    chart("cSess", "bar", labels, [
      { label: "Oturum", data: d.map((x) => x.session?.n || 0), backgroundColor: "#1D9AD6", yAxisID: "y" },
      { label: "Ort. süre (dk)", data: d.map((x) => (x.session?.n ? Math.round(x.session.ms / x.session.n / 6000) / 10 : 0)), type: "line", borderColor: "#A3338C", yAxisID: "y1" },
    ], { scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } } } });
    const kinds = ["post", "video", "reel", "story", "chain", "live"];
    const kindTr = { post: "Gönderi", video: "Video", reel: "An", story: "Story", chain: "Zincir", live: "Canlı" };
    chart("cWatch", "bar", labels, kinds.map((k, i) => ({ label: kindTr[k], data: d.map((x) => Math.round((x.watch?.[k]?.ms || 0) / 60000)), backgroundColor: COLORS[i] })), {
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { display: true } },
    });
    const ev = {};
    d.forEach((x) => Object.entries(x.ev || {}).forEach(([k, v]) => (ev[k] = (ev[k] || 0) + v)));
    const EV_TR = { app_open: "Uygulama açılışı", app_bg: "Arka plana alma", app_fg: "Geri dönüş", screen_view: "Ekran geçişi", screen_time: "Ekran süresi kaydı", content_watch: "İçerik izleme", post_impression: "Gönderi gösterimi", ad_impression: "Reklam gösterimi", ad_click: "Reklam tıklaması", promo_impression: "Tanıtım gösterimi", promo_click: "Tanıtım tıklaması" };
    table($("#evTable"), [{ t: "Olay", k: "n", f: (r) => esc(EV_TR[r.n] || r.n) }, { t: "Adet", k: "v", num: 1, f: (r) => fmt(r.v) }], Object.entries(ev).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v));
  }

  function drawScreens() {
    const scr = {}, flow = {};
    report.daily.forEach((x) => {
      Object.entries(x.scr || {}).forEach(([k, v]) => {
        scr[k] ??= { v: 0, ms: 0 };
        scr[k].v += v.v || 0;
        scr[k].ms += v.ms || 0;
      });
      Object.entries(x.flow || {}).forEach(([k, v]) => (flow[k] = (flow[k] || 0) + v));
    });
    const rows = Object.entries(scr).map(([k, v]) => ({ k, name: scrName(k), v: v.v, ms: v.ms, avg: v.v ? v.ms / v.v : 0 })).sort((a, b) => b.v - a.v);
    const maxV = Math.max(1, ...rows.map((r) => r.v));
    table($("#scrTable"), [
      { t: "Ekran", k: "name" },
      { t: "Ziyaret", k: "v", num: 1, f: (r) => fmt(r.v) },
      { t: "", f: (r) => `<div class="bar"><i style="width:${(100 * r.v) / maxV}%"></i></div>` },
      { t: "Toplam (dk)", k: "ms", num: 1, f: (r) => min(r.ms) },
      { t: "Ort. kalma", k: "avg", num: 1, f: (r) => sec(r.avg) },
    ], rows);
    const frows = Object.entries(flow).map(([k, v]) => {
      const [a, b] = k.split(">");
      return { from: scrName(a), to: scrName(b), v };
    }).sort((a, b) => b.v - a.v).slice(0, 80);
    table($("#flowTable"), [{ t: "Nereden", k: "from" }, { t: "", f: () => "→" }, { t: "Nereye", k: "to" }, { t: "Adet", k: "v", num: 1, f: (r) => fmt(r.v) }], frows);
  }

  function drawActions() {
    const d = report.daily;
    const labels = d.map((x) => x.day.slice(5).split("-").reverse().join("."));
    const keys = [...new Set(d.flatMap((x) => Object.keys(x.act || {})))];
    const TR = { post: "Gönderi", story: "Story", comment: "Yorum", like: "Beğeni", follow: "Takip", join_event: "Etkinliğe katılım", checkin: "Giriş (QR)", note: "Not", repost: "Yeniden paylaşım", gift: "Hediye", share: "Paylaşım", login: "Günlük giriş", game: "Oyun" };
    chart("cAct", "line", labels, keys.map((k, i) => ({ label: TR[k] || k, data: d.map((x) => x.act?.[k] || 0), borderColor: COLORS[i % COLORS.length], tension: .3 })), { plugins: { legend: { display: true } } });
    table($("#actTable"), [{ t: "Gün", k: "day" }, ...keys.map((k) => ({ t: TR[k] || k, k, num: 1, f: (r) => fmt(r[k]) }))],
      d.map((x) => ({ day: x.day, ...Object.fromEntries(keys.map((k) => [k, x.act?.[k] || 0])) })).reverse());
  }

  async function loadContent() {
    $("#contentTable").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const r = await call("analytics", { op: "report", days: 1, kind: $("#kind").value });
      const KTR = { post: "Gönderi", video: "Video", reel: "An", story: "Story", chain: "Zincir", live: "Canlı" };
      table($("#contentTable"), [
        { t: "Tür", k: "kind", f: (x) => `<span class="pill">${KTR[x.kind] || x.kind}</span>` },
        { t: "İçerik", k: "id", f: (x) => `<span title="${esc(x.id)}">${esc(x.id.slice(0, 14))}</span>` },
        { t: "Sahibi", k: "owner", f: (x) => esc((x.owner || "").slice(0, 8)) },
        { t: "Görüntülenme", k: "views", num: 1, f: (x) => fmt(x.views) },
        { t: "Toplam izleme (dk)", k: "watchMs", num: 1, f: (x) => min(x.watchMs) },
        { t: "Ort. süre", k: "avgMs", num: 1, f: (x) => sec(x.avgMs) },
        { t: "Ort. izlenen", k: "avgPct", num: 1, f: (x) => (x.avgPct == null ? "–" : x.avgPct + "%") },
        { t: "Sonuna kadar", k: "completes", num: 1, f: (x) => pct(x.completes, x.views) },
        { t: "Geçildi", k: "skips", num: 1, f: (x) => pct(x.skips, x.views) },
        { t: "Çıkış", k: "exits", num: 1, f: (x) => pct(x.exits, x.views) },
        { t: "Sesli", k: "soundOn", num: 1, f: (x) => pct(x.soundOn, x.views) },
      ], r.top);
    } catch (e) {
      $("#contentTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
  }

  $("#loadUser").onclick = async () => {
    const uid = $("#uid").value.trim();
    if (!uid) return;
    $("#userTable").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const r = await call("analytics", { op: "userEvents", uid });
      const desc = (e) => {
        const p = e.p || {};
        switch (e.n) {
          case "screen_view": return `${esc(p.from)} → <b>${esc(p.to)}</b> (öncekinde ${sec(p.prevMs)})`;
          case "content_watch": return `${esc(p.kind)} ${esc(String(p.id).slice(0, 10))} · ${sec(p.ms)}${p.pct != null ? " · %" + p.pct : ""}${p.how ? " · " + esc(p.how) : ""}`;
          default: return esc(JSON.stringify(p));
        }
      };
      table($("#userTable"), [
        { t: "Zaman", k: "t", f: (e) => new Date(e.t).toLocaleString("tr-TR") },
        { t: "Olay", k: "n" },
        { t: "Ekran", k: "s" },
        { t: "Ayrıntı", f: desc },
      ], r.events);
      if (!r.events.length) $("#userTable").innerHTML = '<p class="muted">Kayıt yok (üye rıza vermemiş olabilir).</p>';
    } catch (e) {
      $("#userTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
  };

  // ------------------------------------------------------------------ sponsorlu reklamlar
  let ads = [];
  const dtLocal = (ms) => {
    if (!ms) return "";
    const d = new Date(ms);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  function fillAd(a) {
    $("#adId").value = a?.id || "";
    $("#adFormTitle").textContent = a ? "Reklamı düzenle" : "Yeni sponsorlu reklam";
    $("#adAdv").value = a?.advertiser || "";
    $("#adTitle").value = a?.title || "";
    $("#adText").value = a?.text || "";
    $("#adLink").value = a?.link || "";
    $("#adCta").value = a?.cta || "İncele";
    $("#adStart").value = dtLocal(a?.startAt || Date.now());
    $("#adEnd").value = dtLocal(a?.endAt || Date.now() + 7 * 864e5);
    $("#adEvery").value = a?.every || 6;
    $("#adMax").value = a?.maxImpressions || 0;
    $("#adStatus").value = a?.status || "active";
    $("#adCities").value = (a?.cities || []).join(", ");
    $("#adInterests").value = (a?.interests || []).join(", ");
    $("#adFile").value = "";
    $("#adMediaNow").innerHTML = a?.mediaUrl ? `Şu anki: <a href="${esc(a.mediaUrl)}" target="_blank">${a.mediaType === "video" ? "video" : "görsel"}</a>` : "";
  }
  $("#adNew").onclick = () => fillAd(null);
  async function loadAds() {
    $("#adTable").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      ads = (await call("ads", { op: "adList" })).items;
      table($("#adTable"), [
        { t: "", f: (a) => (a.mediaType === "image" && a.mediaUrl ? `<img class="thumb" src="${esc(a.mediaUrl)}">` : "🎬") },
        { t: "Reklam", k: "title", f: (a) => `<b>${esc(a.advertiser)}</b><br><span class="muted small">${esc(a.title)}</span>` },
        { t: "Durum", k: "status", f: (a) => `<span class="pill ${a.status === "active" ? "on" : "off"}">${{ active: "Yayında", paused: "Duraklatıldı", ended: "Bitti" }[a.status] || a.status}</span>` },
        { t: "Bitiş", k: "endAt", f: (a) => (a.endAt ? new Date(a.endAt).toLocaleDateString("tr-TR") : "–") },
        { t: "Gösterim", k: "impressions", num: 1, f: (a) => fmt(a.impressions) },
        { t: "Tıklama", k: "clicks", num: 1, f: (a) => fmt(a.clicks) },
        { t: "TO", num: 1, f: (a) => pct(a.clicks || 0, a.impressions || 0) },
        { t: "", f: (a) => `<button class="btn ghost" data-edit="${esc(a.id)}">Düzenle</button> <button class="btn red" data-del="${esc(a.id)}">Sil</button>` },
      ], ads);
      $$("[data-edit]").forEach((b) => (b.onclick = () => fillAd(ads.find((a) => a.id === b.dataset.edit))));
      $$("[data-del]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Reklam silinsin mi?")) return;
        await call("ads", { op: "adDelete", id: b.dataset.del });
        toast("Silindi");
        loadAds();
      }));
    } catch (e) {
      $("#adTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
    if (!$("#adStart").value) fillAd(null);
  }
  $("#adSave").onclick = async () => {
    const btn = $("#adSave");
    btn.disabled = true;
    try {
      let mediaPath = "", mediaType = undefined;
      const f = $("#adFile").files[0];
      if (f) {
        mediaType = f.type.startsWith("video/") ? "video" : "image";
        const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        mediaPath = `ads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        toast("Dosya yükleniyor…");
        await firebase.storage().ref(mediaPath).put(f, { contentType: f.type });
      }
      const id = $("#adId").value;
      const cur = ads.find((a) => a.id === id);
      if (!id && !mediaPath) throw new Error("Bir görsel ya da video seç.");
      const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
      await call("ads", {
        op: "adSave", id: id || undefined, advertiser: $("#adAdv").value, title: $("#adTitle").value, text: $("#adText").value,
        link: $("#adLink").value.trim(), cta: $("#adCta").value, mediaPath: mediaPath || undefined,
        mediaType: mediaType || cur?.mediaType || "image",
        startAt: new Date($("#adStart").value).getTime(), endAt: new Date($("#adEnd").value).getTime(),
        every: +$("#adEvery").value, maxImpressions: +$("#adMax").value, status: $("#adStatus").value,
        cities: list($("#adCities").value), interests: list($("#adInterests").value),
      });
      toast("Kaydedildi");
      fillAd(null);
      loadAds();
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  };

  // ------------------------------------------------------------------ tanıtımlar
  async function loadPromos() {
    $("#promoTable").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const items = (await call("ads", { op: "promoAdminList" })).items;
      const GTR = { likes: "Beğeni", followers: "Takipçi", visits: "Profil ziyareti", reach: "Erişim" };
      table($("#promoTable"), [
        { t: "Tarih", k: "createdAt", f: (p) => (p.createdAt ? new Date(p.createdAt).toLocaleDateString("tr-TR") : "–") },
        { t: "Üye", k: "uid", f: (p) => esc(p.uid.slice(0, 10)) },
        { t: "Gönderi", k: "postId", f: (p) => esc(p.postId.slice(0, 10)) },
        { t: "Hedef", k: "goal", f: (p) => GTR[p.goal] || p.goal },
        { t: "Kitle", k: "audience", f: (p) => esc(p.audience === "city" ? (p.cities || []).join(", ") : p.audience === "interests" ? (p.interests || []).join(", ") : "Otomatik") },
        { t: "Bütçe", k: "total", num: 1, f: (p) => fmt(p.total) + " HP" },
        { t: "Gösterim", k: "delivered", num: 1, f: (p) => `${fmt(p.delivered)} / ${fmt(p.target)}` },
        { t: "Tıklama", k: "clicks", num: 1, f: (p) => fmt(p.clicks) },
        { t: "Durum", k: "status", f: (p) => `<span class="pill ${p.status === "active" ? "on" : "off"}">${{ active: "Yayında", ended: "Tamamlandı", cancelled: "Üye bitirdi", rejected: "Durduruldu" }[p.status] || p.status}</span>` },
        { t: "", f: (p) => (p.status === "active" ? `<button class="btn red" data-stop="${esc(p.id)}">Durdur</button>` : "") },
      ], items);
      $$("[data-stop]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Tanıtım durdurulsun mu? Kalan bütçe üyeye iade edilir.")) return;
        const r = await call("ads", { op: "promoCancel", id: b.dataset.stop });
        toast(`Durduruldu, ${r.refund} HADİ Para iade edildi`);
        loadPromos();
      }));
    } catch (e) {
      $("#promoTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
  }

  // ------------------------------------------------------------------ itirazlar
  async function loadAppeals() {
    $("#appealTable").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const items = (await call("ads", { op: "adAppeals" })).items;
      table($("#appealTable"), [
        { t: "", f: (p) => (p.cover ? `<img class="thumb" src="${esc(p.cover)}">` : "📝") },
        { t: "Gönderi", k: "caption", f: (p) => `<div style="white-space:normal;max-width:360px">${esc(p.caption)}</div>` },
        { t: "Etiket", f: (p) => p.adTags.map((t) => `<span class="pill">#${t === "reklam" ? "reklam" : "işbirliği"}</span>`).join(" ") },
        { t: "Yapay zekâ gerekçesi", f: (p) => `<div style="white-space:normal;max-width:300px" class="small">${esc(p.adBrand ? p.adBrand + " · " : "")}${esc(p.adReason)}</div>` },
        { t: "", f: (p) => `<button class="btn ghost" data-keep="${esc(p.id)}">Koru</button> <button class="btn" data-clear="${esc(p.id)}">Etiketi kaldır</button>` },
      ], items);
      const act = (sel, tags) => $$(sel).forEach((b) => (b.onclick = async () => {
        const id = b.dataset.keep || b.dataset.clear;
        const p = items.find((x) => x.id === id);
        await call("ads", { op: "adTagSet", postId: id, tags: tags ?? p.adTags });
        toast("Kaydedildi");
        loadAppeals();
      }));
      act("[data-keep]", null);
      act("[data-clear]", []);
    } catch (e) {
      $("#appealTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
  }
  // ------------------------------------------------------------------ gizlenen gönderiler (contentMod)
  const HIDDEN_KIND = { media: "Gönderi", text: "Yazı", reel: "An", repost: "Yeniden paylaşım", story: "Story", comment: "Yorum", post: "Gönderi" };
  async function loadHidden() {
    $("#hiddenTable").innerHTML = '<p class="muted">Yükleniyor…</p>';
    try {
      const all = (await call("contentMod", { op: "list", limit: 300 })).items;
      const items = $("#hiddenAppealsOnly").checked ? all.filter((x) => x.appeal) : all;
      table($("#hiddenTable"), [
        { t: "", f: (x) => (x.thumb ? `<img class="thumb" src="${esc(x.thumb)}">` : "📝") },
        { t: "Tür", k: "kind", f: (x) => esc(HIDDEN_KIND[x.sub || x.kind] || x.kind) },
        { t: "Sahibi", k: "ownerName" },
        { t: "İçerik", k: "preview", f: (x) => `<div style="white-space:normal;max-width:320px">${esc(x.preview)}</div>` },
        { t: "Gerekçe", k: "reason", f: (x) => `<div style="white-space:normal;max-width:220px" class="small">${esc(x.reason)}</div>` },
        { t: "Gizleyen", k: "byName" },
        { t: "Tarih", k: "at", num: true, f: (x) => (x.at ? new Date(x.at).toLocaleString("tr-TR") : "") },
        { t: "İtiraz", f: (x) => (x.appeal ? `<div style="white-space:normal;max-width:260px" class="small">${esc(x.appeal.text)}</div>` : "") },
        { t: "", f: (x) => `<button class="btn" data-unhide="${esc(x.key)}">Gizlemeyi kaldır</button>` },
      ], items);
      $$("[data-unhide]").forEach((b) => (b.onclick = async () => {
        const x = all.find((y) => y.key === b.dataset.unhide);
        if (!x || !confirm("Gizleme kaldırılsın mı? İçerik yeniden herkese görünür olur ve sahibine haber verilir.")) return;
        b.disabled = true;
        try {
          await call("contentMod", { op: "unhide", kind: x.kind, id: x.id, ...(x.parent ? { parent: x.parent, parentKind: x.parentKind || "post" } : {}) });
          toast("Gizleme kaldırıldı");
          loadHidden();
        } catch (e) {
          b.disabled = false;
          toast(e.message);
        }
      }));
    } catch (e) {
      $("#hiddenTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
  }
  $("#hiddenAppealsOnly").onchange = () => loadHidden();
  // ------------------------------------------------------------------ premium
  async function loadPremium() {
    try {
      const cfg = await call("premium", { op: "config" });
      $("#prMonthly").value = cfg.monthly.price;
      $("#prYearly").value = cfg.yearly.price;
      $("#prPerks").value = (cfg.perks || []).join("\n");
      ["#prMonthly", "#prYearly", "#prPerks", "#prSave"].forEach((s) => ($(s).disabled = !isPrimary));
      const items = (await call("premium", { op: "list" })).items.filter((x) => !x.dummy);
      // Kaynak: Google Play aboneliği ya da yönetimin verdiği Premium (kim, ne zaman, neden — üzerine gelince).
      const prDate = (ms) => (ms ? new Date(ms).toLocaleDateString("tr-TR") : "kayıt yok");
      table($("#prTable"), [
        { t: "Üye", k: "name" },
        { t: "Kimlik", k: "uid", f: (x) => `<span class="small muted">${esc(x.uid)}</span>` },
        {
          t: "Kaynak", k: "source", f: (x) => {
            if (x.source === "play") return `<span class="pill" style="background:#e3f4ea;color:#1f8a4c;padding:2px 8px;border-radius:99px;font-weight:700">Google Play</span>`;
            const g = x.grant || {};
            const info = `Veren: ${g.byName || g.byUid || "kayıt yok"} · Tarih: ${prDate(g.at)} · Gerekçe: ${g.reason || "kayıt yok (gerekçe zorunluluğundan önce)"}`;
            return `<span title="${esc(info)}" style="background:#f6efd9;color:#8a6a1c;padding:2px 8px;border-radius:99px;font-weight:700;cursor:help">Yönetim tarafından verildi</span>`
              + `<div class="small muted" style="margin-top:4px">${esc(g.byName || "")}${g.at ? " · " + esc(prDate(g.at)) : ""}${g.reason ? " · " + esc(g.reason) : ""}</div>`;
          },
        },
        { t: "Bitiş", k: "until", f: (x) => (x.until ? new Date(x.until).toLocaleDateString("tr-TR") : "Süresiz") },
      ], items);
      const grants = (await call("premium", { op: "grants" })).items || [];
      table($("#prGrants"), [
        { t: "Tarih", k: "at", f: (g) => esc(g.at ? new Date(g.at).toLocaleString("tr-TR") : "") },
        { t: "İşlem", k: "action", f: (g) => (g.action === "revoke" ? "Kaldırdı" : "Verdi") },
        { t: "Üye", k: "targetName", f: (g) => esc(g.targetName || g.uid) },
        { t: "Süre", k: "days", f: (g) => (g.action === "revoke" ? "–" : g.days ? `${g.days} gün` : "Süresiz") },
        { t: "Gerekçe", k: "reason", f: (g) => esc(g.reason || "") },
        { t: "Yapan", k: "byName", f: (g) => esc(g.byName || g.byUid || "") },
      ], grants);
    } catch (e) {
      toast(e.message || String(e));
    }
  }
  $("#prSave").onclick = async () => {
    try {
      const r = await call("premium", {
        op: "setPrices", monthly: +$("#prMonthly").value, yearly: +$("#prYearly").value,
        perks: $("#prPerks").value.split("\n").map((x) => x.trim()).filter(Boolean),
      });
      toast(r.playUpdated ? "Kaydedildi; Google Play fiyatı da güncellendi." : "Kaydedildi, Play güncellenemedi: " + r.playError);
    } catch (e) {
      toast(e.message || String(e));
    }
  };
  $("#prGrant").onclick = async () => {
    try {
      const reason = $("#prReason").value.trim();
      if (reason.length < 10) return toast("En az 10 karakterlik bir gerekçe yaz.");
      await call("premium", { op: "grant", uid: $("#prUid").value.trim(), days: +$("#prDays").value, reason });
      $("#prReason").value = "";
      toast("Premium verildi 👑");
      loadPremium();
    } catch (e) {
      toast(e.message || String(e));
    }
  };
  $("#prRevoke").onclick = async () => {
    const reason = $("#prReason").value.trim();
    if (reason.length < 10) return toast("Kaldırma için de en az 10 karakterlik bir gerekçe yaz.");
    if (!confirm("Premium kaldırılsın mı?")) return;
    try {
      await call("premium", { op: "revoke", uid: $("#prUid").value.trim(), reason });
      $("#prReason").value = "";
      toast("Kaldırıldı");
      loadPremium();
    } catch (e) {
      toast(e.message || String(e));
    }
  };

  // ------------------------------------------------------------------ yapay zekâ: moderasyon talimatları (aiAdmin policy*)
  // Görme ve deneme kurucu/yöneticilere açık; kaydetmeyi sunucu yalnızca ana kurucuya izin verir.
  const AI_MAX = { mod: 3000, bot: 2000 };
  let aiSaved = { mod: "", bot: "" };
  let aiHistory = [];
  let aiCanSave = false;
  const errText = (e) => (e && e.message ? e.message : String(e)).replace(/^FirebaseError:\s*/, "");
  const aiNote = (m, kind) => {
    const n = $("#aiMsg");
    if (!m) return n.classList.add("hide");
    n.textContent = m;
    n.className = "note " + (kind || "");
  };
  const aiDirty = () => $("#aiMod").value !== aiSaved.mod || $("#aiBot").value !== aiSaved.bot;
  function aiRefresh() {
    [["#aiMod", "#aiModCount", AI_MAX.mod], ["#aiBot", "#aiBotCount", AI_MAX.bot]].forEach(([f, c, max]) => {
      const n = $(f).value.length;
      $(c).textContent = `${fmt(n)} / ${fmt(max)}`;
      $(c).classList.toggle("over", n > max);
    });
    $("#aiSave").disabled = !aiCanSave || !aiDirty();
    $("#aiSave").title = aiCanSave ? "" : "Kaydetmek yalnızca ana kurucuya açıktır";
  }
  const when = (ms) => new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  function drawAiHistory() {
    const el = $("#aiHist");
    if (!aiHistory.length) return (el.innerHTML = '<p class="muted small">Henüz kayıt yok.</p>');
    el.innerHTML = aiHistory.map((v, i) => `<div class="hist"><div><b class="small">${esc(when(v.at))} · ${esc(v.byName || "Ana kurucu")}</b>
      <p>${esc(v.moderationExtra || "(moderasyon ek kuralı yok)")}</p>${v.botExtra ? `<p>Rehber: ${esc(v.botExtra)}</p>` : ""}</div>
      <button class="btn ghost" data-restore="${i}">Geri yükle</button></div>`).join("");
    el.querySelectorAll("[data-restore]").forEach((b) => (b.onclick = () => {
      const v = aiHistory[+b.dataset.restore];
      $("#aiMod").value = v.moderationExtra || "";
      $("#aiBot").value = v.botExtra || "";
      aiRefresh();
      aiNote(`${when(v.at)} sürümü alanlara geri yüklendi. Uygulamak için "Talimatları kaydet"e bas.`);
    }));
  }
  async function loadAi() {
    aiNote("");
    try {
      const d = await call("aiAdmin", { op: "policyGet" });
      if (d.max) { AI_MAX.mod = d.max.moderationExtra || AI_MAX.mod; AI_MAX.bot = d.max.botExtra || AI_MAX.bot; }
      aiSaved = { mod: d.moderationExtra || "", bot: d.botExtra || "" };
      $("#aiMod").value = aiSaved.mod;
      $("#aiBot").value = aiSaved.bot;
      aiCanSave = d.canSave === true;
      aiHistory = d.history || [];
      $("#aiDefault").classList.toggle("hide", !d.isDefault);
      drawAiHistory();
      aiRefresh();
      if (!aiCanSave) aiNote("Bu talimatları görebilir ve deneyebilirsin; kaydetmek yalnızca ana kurucuya açıktır.");
    } catch (e) {
      $("#aiHist").innerHTML = "";
      aiNote("Talimatlar yüklenemedi: " + errText(e), "err");
    }
  }
  $("#aiMod").oninput = aiRefresh;
  $("#aiBot").oninput = aiRefresh;
  // İyimser kayıt: geçmiş hemen güncellenir; sunucu reddederse geri alınır.
  $("#aiSave").onclick = async () => {
    const mod = $("#aiMod").value.trim(), bot = $("#aiBot").value.trim();
    if (mod.length > AI_MAX.mod || bot.length > AI_MAX.bot) return aiNote("Metin sınırı aşıldı.", "err");
    const prev = { saved: aiSaved, history: aiHistory };
    aiSaved = { mod: $("#aiMod").value, bot: $("#aiBot").value };
    aiHistory = [{ at: Date.now(), byName: "Sen", moderationExtra: mod, botExtra: bot }, ...aiHistory].slice(0, 10);
    drawAiHistory();
    aiNote("");
    $("#aiSave").disabled = true;
    $("#aiSave").textContent = "Kaydediliyor…";
    try {
      const r = await call("aiAdmin", { op: "policySave", moderationExtra: mod, botExtra: bot });
      aiHistory = r.history || aiHistory;
      drawAiHistory();
      $("#aiDefault").classList.add("hide");
      aiNote("Kaydedildi. En geç 1 dakika içinde salon denetimi ve HADİ Rehber yeni talimatlarla çalışır.", "ok");
    } catch (e) {
      aiSaved = prev.saved;
      aiHistory = prev.history;
      drawAiHistory();
      aiNote("Kaydedilemedi: " + errText(e), "err");
    } finally {
      $("#aiSave").textContent = "Talimatları kaydet";
      aiRefresh();
    }
  };
  const VERDICTS = { block: "Engellenir", mask: "Yayınlanır, parçalar gizlenir", allow: "Serbest, yayınlanır" };
  const runAiTest = async () => {
    const text = $("#aiSample").value.trim();
    if (text.length < 2) return ($("#aiResult").innerHTML = '<div class="note err">Denemek için bir örnek mesaj yaz.</div>');
    const b = $("#aiTest");
    b.disabled = true;
    b.textContent = "Deneniyor…";
    try {
      const r = await call("aiAdmin", { op: "policyTest", text, moderationExtra: $("#aiMod").value.trim() });
      const it = r.intent || {};
      const v = VERDICTS[r.verdict] ? r.verdict : "allow";
      $("#aiResult").innerHTML = `<div class="verdict ${v}"><b>${VERDICTS[v]}</b>
        <span>Niyet: ${esc(it.intent || "yok")}${typeof it.confidence === "number" ? ` · güven %${Math.round(it.confidence * 100)}` : ""}</span>
        ${it.reason ? `<span>Gerekçe: ${esc(it.reason)}</span>` : ""}
        ${r.rule ? `<span>Kural tabanlı denetim: ${esc(r.rule)}</span>` : ""}
        ${r.usedExtra ? "" : "<span>Ek kural olmadan denendi.</span>"}
        ${typeof r.ms === "number" ? `<span class="small">${sec(r.ms)}</span>` : ""}</div>`;
    } catch (e) {
      $("#aiResult").innerHTML = `<div class="note err">${esc(errText(e))}</div>`;
    } finally {
      b.disabled = false;
      b.textContent = "Dene";
    }
  };
  $("#aiTest").onclick = runAiTest;
  $("#aiSample").onkeydown = (e) => { if (e.key === "Enter") runAiTest(); };
  // ------------------------------------------------------------------ botlar (botsAdmin: list/save/delete/placementGet/placementSet/test)
  // Yazma yetkisini sunucu denetler (kurucu/yönetici); hatalar olduğu gibi gösterilir.
  let bots = [];
  let placements = {}; // envKey -> botIds
  let botSel = null; // düzenlenen botun kopyası (yeni bot için id: "")
  let botTopics = [];
  let plAllDraft = null;
  let rooms = [];
  const botNote = (sel, m, kind) => {
    const n = $(sel);
    if (!m) return n.classList.add("hide");
    n.textContent = m;
    n.className = "note " + (kind || "");
  };
  const normPlacements = (p) => {
    const out = {};
    if (Array.isArray(p)) p.forEach((x) => x && x.env && (out[x.env] = Array.isArray(x.botIds) ? x.botIds : []));
    else if (p && typeof p === "object")
      Object.entries(p).forEach(([k, v]) => (out[k] = Array.isArray(v) ? v : v && Array.isArray(v.botIds) ? v.botIds : []));
    Object.keys(out).forEach((k) => k.startsWith("lobby_") && k !== "lobby_all" && !out[k].length && delete out[k]);
    return out;
  };
  const botName = (id) => {
    const b = bots.find((x) => x.id === id);
    return b ? `${b.emoji || "🤖"} ${b.name}` : id;
  };
  const slug = (t) => String(t || "").toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);

  function drawBots() {
    const el = $("#botList");
    if (!bots.length) return (el.innerHTML = '<p class="muted small">Henüz bot yok.</p>');
    el.innerHTML = bots.map((b, i) => `<div class="botrow ${botSel && botSel.id === b.id ? "sel" : ""}" data-i="${i}">
      <span class="em">${esc(b.emoji || "🤖")}</span>
      <div><b>${esc(b.name)}</b>${b.system ? ' <span class="pill">Sistem</span>' : ""}<p>${esc(b.description || "")}</p></div>
      <label class="switch" title="${b.enabled ? "Açık" : "Kapalı"}"><input type="checkbox" data-en="${i}" ${b.enabled ? "checked" : ""}><span></span></label></div>`).join("");
    el.querySelectorAll(".botrow").forEach((r) => (r.onclick = (e) => {
      if (e.target.closest(".switch")) return;
      openBot(bots[+r.dataset.i]);
    }));
    el.querySelectorAll("[data-en]").forEach((c) => (c.onchange = () => toggleBot(bots[+c.dataset.en], c.checked)));
  }
  // İyimser aç/kapa: anahtar hemen değişir; sunucu reddederse geri alınır.
  async function toggleBot(b, on) {
    const prev = b.enabled;
    b.enabled = on;
    if (botSel && botSel.id === b.id) { botSel.enabled = on; $("#botEnabled").checked = on; }
    botNote("#botListMsg", "");
    try {
      await call("botsAdmin", { op: "save", bot: { ...b, enabled: on } });
      toast(on ? `${b.name} açıldı` : `${b.name} kapatıldı`);
    } catch (e) {
      b.enabled = prev;
      if (botSel && botSel.id === b.id) { botSel.enabled = prev; $("#botEnabled").checked = prev; }
      botNote("#botListMsg", "Değiştirilemedi: " + errText(e), "err");
    }
    drawBots();
    drawPlacements();
  }
  function botCounts() {
    [["#botDesc", "#botDescCount", 200], ["#botPersona", "#botPersonaCount", 3000]].forEach(([f, c, max]) => {
      const n = $(f).value.length;
      $(c).textContent = `${fmt(n)} / ${fmt(max)}`;
      $(c).classList.toggle("over", n > max);
    });
    $("#botChanceV").textContent = "%" + $("#botChance").value;
  }
  function drawTopics() {
    const sys = botSel && botSel.system;
    $("#botTopics").innerHTML = botTopics.length
      ? botTopics.map((t, i) => `<span class="chip">${esc(t)}${sys ? "" : `<button data-rm="${i}" title="Kaldır">✕</button>`}</span>`).join("")
      : '<span class="muted small">Konu yok.</span>';
    $("#botTopics").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { botTopics.splice(+b.dataset.rm, 1); drawTopics(); }));
  }
  function openBot(b) {
    const isNew = !b;
    botSel = isNew
      ? { id: "", name: "", emoji: "🤖", avatarUrl: null, description: "", persona: "", topics: [], enabled: true, system: false, commentChance: 0.3, maxPerHour: 6 }
      : { ...b };
    botTopics = [...(botSel.topics || [])];
    $("#botEditEmpty").classList.add("hide");
    $("#botForm").classList.remove("hide");
    $("#botFormTitle").textContent = isNew ? "Yeni bot" : `${botSel.emoji || "🤖"} ${botSel.name}`;
    $("#botSystem").classList.toggle("hide", !botSel.system);
    $("#botIdRow").classList.toggle("hide", !isNew);
    $("#botId").value = "";
    $("#botEmoji").value = botSel.emoji || "";
    $("#botName").value = botSel.name || "";
    $("#botDesc").value = botSel.description || "";
    $("#botPersona").value = botSel.persona || "";
    $("#botChance").value = Math.round((Number(botSel.commentChance) || 0) * 100);
    $("#botMax").value = Number(botSel.maxPerHour) || 0;
    $("#botEnabled").checked = botSel.enabled !== false;
    const sys = !!botSel.system;
    const trg = botSel.triggers || {};
    BOT_TRIGGERS.forEach(([k]) => ($("#botTrg_" + k).checked = trg[k] !== false));
    $("#botTriggers").classList.toggle("hide", sys);
    ["#botEmoji", "#botName", "#botTopicIn", "#botChance", "#botMax"].forEach((s) => ($(s).disabled = sys));
    $("#botDelete").classList.toggle("hide", isNew || sys);
    $("#botTestCard").classList.toggle("hide", isNew);
    $("#botTestOut").innerHTML = "";
    botNote("#botMsg", "");
    drawTopics();
    botCounts();
    drawBots();
  }
  async function loadBots() {
    botNote("#botListMsg", "");
    try {
      const d = await call("botsAdmin", { op: "list" });
      bots = (d.bots || []).sort((a, b) => (b.system ? 1 : 0) - (a.system ? 1 : 0) || String(a.name).localeCompare(String(b.name), "tr"));
      placements = normPlacements(d.placements);
      plAllDraft = null;
      if (botSel && botSel.id) {
        const fresh = bots.find((x) => x.id === botSel.id);
        fresh ? openBot(fresh) : ((botSel = null), $("#botForm").classList.add("hide"), $("#botEditEmpty").classList.remove("hide"), $("#botTestCard").classList.add("hide"));
      }
      drawBots();
      drawPlacements();
    } catch (e) {
      $("#botList").innerHTML = "";
      botNote("#botListMsg", "Botlar yüklenemedi: " + errText(e), "err");
    }
    try {
      const r = await call("cand", { op: "rooms" });
      rooms = (r && r.items) || [];
    } catch (e) {
      rooms = [];
    }
    drawPlacements();
  }
  // Kişilik tetikleyicileri (bots/{id}.triggers; sunucu bot_triggers.ts). Kutular forma buradan eklenir.
  const BOT_TRIGGERS = [
    ["chimeIn", "Söz alma", "Konusu açılınca kısa bir katkı yapar (ortamda en sık 3 dk'da bir, saatte en çok 6)."],
    ["toys", "Oyun sunuculuğu", "Zar / taş-kağıt-makas atılınca turnuva duyurur ve yürütür (Oyun Delisi)."],
    ["newsCheck", "Haber doğrulama", "Sohbette yazılan haberleri güvenilir kaynaklarla doğrular (Gündem Takipçisi)."],
  ];
  (() => {
    const anchor = $("#botEnabled") && $("#botEnabled").closest("label");
    if (!anchor || $("#botTriggers")) return;
    const box = document.createElement("div");
    box.id = "botTriggers";
    box.innerHTML = '<label>Kendiliğinden katılım <span class="muted small">(anılınca her zaman cevap verir)</span></label>' +
      BOT_TRIGGERS.map(([k, t, d]) => `<label style="display:flex;gap:10px;align-items:center"><span class="switch"><input type="checkbox" id="botTrg_${k}"><span></span></span> ${esc(t)} <span class="muted small">— ${esc(d)}</span></label>`).join("");
    anchor.parentNode.insertBefore(box, anchor);
  })();
  $("#botNew").onclick = () => openBot(null);
  $("#botDesc").oninput = botCounts;
  $("#botPersona").oninput = botCounts;
  $("#botChance").oninput = botCounts;
  $("#botName").oninput = () => { if (botSel && !botSel.id && !$("#botId").dataset.touched) $("#botId").value = slug($("#botName").value); };
  $("#botId").oninput = () => ($("#botId").dataset.touched = "1");
  $("#botTopicIn").onkeydown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = $("#botTopicIn").value.trim().toLocaleLowerCase("tr");
    if (t.length >= 2 && !botTopics.includes(t) && botTopics.length < 20) botTopics.push(t);
    $("#botTopicIn").value = "";
    drawTopics();
  };
  $("#botSave").onclick = async () => {
    if (!botSel) return;
    const isNew = !botSel.id;
    const id = isNew ? slug($("#botId").value || $("#botName").value) : botSel.id;
    const bot = {
      ...botSel,
      id,
      emoji: $("#botEmoji").value.trim() || "🤖",
      name: $("#botName").value.trim(),
      description: $("#botDesc").value.trim(),
      persona: $("#botPersona").value.trim(),
      topics: [...botTopics],
      commentChance: Math.max(0, Math.min(1, Number($("#botChance").value) / 100)),
      maxPerHour: Math.max(0, Math.round(Number($("#botMax").value) || 0)),
      enabled: $("#botEnabled").checked,
      ...(botSel.system ? {} : { triggers: Object.fromEntries(BOT_TRIGGERS.map(([k]) => [k, !!$("#botTrg_" + k).checked])) }),
    };
    if (!bot.name) return botNote("#botMsg", "Bota bir ad ver.", "err");
    if (!id) return botNote("#botMsg", "Geçerli bir kimlik yaz (harf ve rakam).", "err");
    if (isNew && bots.some((x) => x.id === id)) return botNote("#botMsg", `"${id}" kimliği zaten kullanılıyor.`, "err");
    if (bot.description.length > 200 || bot.persona.length > 3000) return botNote("#botMsg", "Metin sınırı aşıldı.", "err");
    if (bot.persona.length < 10) return botNote("#botMsg", "Kişilik talimatı çok kısa.", "err");
    const b = $("#botSave");
    b.disabled = true;
    b.textContent = "Kaydediliyor…";
    botNote("#botMsg", "");
    try {
      const r = await call("botsAdmin", { op: "save", bot });
      const saved = (r && r.bot) || bot;
      const i = bots.findIndex((x) => x.id === saved.id);
      i >= 0 ? (bots[i] = saved) : bots.push(saved);
      openBot(saved);
      botNote("#botMsg", "Kaydedildi. En geç 1 dakika içinde sohbetlerde geçerli olur.", "ok");
    } catch (e) {
      botNote("#botMsg", "Kaydedilemedi: " + errText(e), "err");
    } finally {
      b.disabled = false;
      b.textContent = "Kaydet";
    }
  };
  $("#botDelete").onclick = async () => {
    if (!botSel || !botSel.id || botSel.system) return;
    if (!confirm(`"${botSel.name}" silinsin mi? Yerleştirildiği bütün sohbetlerden de çıkar.`)) return;
    try {
      await call("botsAdmin", { op: "delete", id: botSel.id });
      bots = bots.filter((x) => x.id !== botSel.id);
      Object.keys(placements).forEach((k) => (placements[k] = placements[k].filter((x) => x !== botSel.id)));
      toast("Silindi");
      botSel = null;
      $("#botForm").classList.add("hide");
      $("#botEditEmpty").classList.remove("hide");
      $("#botTestCard").classList.add("hide");
      drawBots();
      drawPlacements();
    } catch (e) {
      botNote("#botMsg", "Silinemedi: " + errText(e), "err");
    }
  };
  const runBotTest = async () => {
    if (!botSel || !botSel.id) return;
    const text = $("#botTestIn").value.trim();
    if (text.length < 2) return ($("#botTestOut").innerHTML = '<div class="note err">Denemek için bir mesaj yaz.</div>');
    const b = $("#botTest");
    b.disabled = true;
    b.textContent = "Deneniyor…";
    try {
      const r = await call("botsAdmin", { op: "test", botId: botSel.id, text });
      const reply = typeof r === "string" ? r : (r && (r.reply ?? r.text)) || "";
      $("#botTestOut").innerHTML = reply
        ? `<div class="bubble"><span class="em">${esc(botSel.emoji || "🤖")}</span><div><b>${esc(botSel.name)}</b>${esc(reply)}</div></div>`
        : '<div class="note">Bot bu mesaja cevap vermemeyi seçti.</div>';
    } catch (e) {
      $("#botTestOut").innerHTML = `<div class="note err">${esc(errText(e))}</div>`;
    } finally {
      b.disabled = false;
      b.textContent = "Dene";
    }
  };
  $("#botTest").onclick = runBotTest;
  $("#botTestIn").onkeydown = (e) => { if (e.key === "Enter") runBotTest(); };

  // Yerleşim: lobby_all + odaya özel lobby_{room}
  const pickHtml = (ids, attr) => bots.length
    ? bots.map((b) => `<span class="pick ${ids.includes(b.id) ? "on" : ""} ${b.enabled ? "" : "dis"}" data-${attr}="${esc(b.id)}" title="${b.enabled ? "" : "Bu bot kapalı"}">${esc(b.emoji || "🤖")} ${esc(b.name)}</span>`).join("")
    : '<span class="muted small">Bot yok.</span>';
  function drawPlacements() {
    const all = plAllDraft || placements.lobby_all || [];
    $("#plAll").innerHTML = pickHtml(all, "pa");
    $("#plAll").querySelectorAll("[data-pa]").forEach((p) => (p.onclick = () => {
      const id = p.dataset.pa;
      const cur = [...(plAllDraft || placements.lobby_all || [])];
      plAllDraft = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      drawPlacements();
    }));
    $("#plAllSave").disabled = !plAllDraft;
    const el = $("#plRooms");
    if (!rooms.length) return (el.innerHTML = '<p class="muted small">Bekleyen adayı olan oda yok.</p>');
    el.innerHTML = rooms.map((r) => {
      const env = "lobby_" + r.room;
      const own = placements[env];
      return `<div class="roomrow"><b>${esc(r.name || r.room)}${r.waiting ? ` <span class="pill">${fmt(r.waiting)} aday</span>` : ""}</b>
        <div style="flex:1;min-width:220px">${own
          ? `<div class="chips">${pickHtml(own, "pr").replace(/data-pr=/g, `data-env="${esc(env)}" data-pr=`)}</div>
             <button class="btn ghost" style="margin-top:6px" data-clear="${esc(env)}">Tüm odalar ayarına dön</button>`
          : `<span class="muted small">Tüm odalar ayarı geçerli${(placements.lobby_all || []).length ? ": " + esc((placements.lobby_all || []).map(botName).join(", ")) : " (bot yok)"}.</span>
             <button class="btn ghost" style="margin-left:8px" data-custom="${esc(env)}">Özelleştir</button>`}</div></div>`;
    }).join("");
    el.querySelectorAll("[data-pr]").forEach((p) => (p.onclick = () => {
      const env = p.dataset.env, id = p.dataset.pr, cur = placements[env] || [];
      setPlacement(env, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    }));
    el.querySelectorAll("[data-custom]").forEach((b) => (b.onclick = () => setPlacement(b.dataset.custom, [...(placements.lobby_all || [])])));
    el.querySelectorAll("[data-clear]").forEach((b) => (b.onclick = () => setPlacement(b.dataset.clear, null)));
  }
  // İyimser: seçim hemen görünür; sunucu reddederse geri alınır. botIds: null → odaya özel seçim kaldırılır.
  async function setPlacement(env, botIds) {
    const had = Object.prototype.hasOwnProperty.call(placements, env);
    const prev = placements[env];
    // Odaya özel seçim boşalırsa (ya da kaldırılırsa) o odada "tüm odalar" seçimi geçerli olur.
    if (botIds === null || (env !== "lobby_all" && !botIds.length)) delete placements[env];
    else placements[env] = botIds;
    drawPlacements();
    botNote("#plMsg", "");
    try {
      await call("botsAdmin", { op: "placementSet", env, botIds: botIds || [] });
      return true;
    } catch (e) {
      if (had) placements[env] = prev;
      else delete placements[env];
      drawPlacements();
      botNote("#plMsg", "Kaydedilemedi: " + errText(e), "err");
      return false;
    }
  }
  $("#plAllSave").onclick = async () => {
    if (!plAllDraft) return;
    const ids = plAllDraft;
    plAllDraft = null;
    if (await setPlacement("lobby_all", ids)) botNote("#plMsg", "Kaydedildi. Bekleme salonlarında en geç 1 dakika içinde geçerli olur.", "ok");
  };
  // ------------------------------------------------------------------ sürüm (appVersionAdmin: get/set) → config/app_version
  const AV_PLATFORMS = { android: "Android", ios: "iOS" };
  const avNote = (p, text, kind) => {
    const el = $(`#av-${p}-out`);
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const avFill = (p, v, def) => {
    const src = v || def || {};
    $(`#av-${p}-latest`).value = src.latest ?? "";
    $(`#av-${p}-lb`).value = src.latestBuild ?? "";
    $(`#av-${p}-mb`).value = src.minBuild ?? "";
    $(`#av-${p}-msg`).value = src.message ?? "";
    $(`#av-${p}-url`).value = src.storeUrl ?? "";
    $(`#av-${p}-cur`).textContent = v
      ? `Yayındaki ayar: ${v.latest} (build ${v.latestBuild}), zorunlu güncelleme build ${v.minBuild} altı${v.updatedAt ? " · " + when(v.updatedAt) : ""}`
      : "Bu platform için henüz ayar yok; alanlar varsayılanlarla dolduruldu. Kaydedilene kadar kimseye uyarı çıkmaz.";
  };
  async function loadVersion() {
    for (const p of Object.keys(AV_PLATFORMS)) avNote(p, "");
    try {
      const d = await call("appVersionAdmin", { op: "get" });
      const cfg = d.config || {}, defs = d.defaults || {};
      for (const p of Object.keys(AV_PLATFORMS)) avFill(p, cfg[p], defs[p]);
    } catch (e) {
      for (const p of Object.keys(AV_PLATFORMS)) {
        $(`#av-${p}-cur`).textContent = "Yüklenemedi.";
        avNote(p, "Sürüm bilgisi yüklenemedi: " + errText(e), "err");
      }
    }
  }
  $$("[data-avsave]").forEach((b) => (b.onclick = async () => {
    const p = b.dataset.avsave, name = AV_PLATFORMS[p];
    const latest = $(`#av-${p}-latest`).value.trim();
    const lbS = $(`#av-${p}-lb`).value.trim(), mbS = $(`#av-${p}-mb`).value.trim();
    const latestBuild = Number(lbS), minBuild = Number(mbS);
    const storeUrl = $(`#av-${p}-url`).value.trim(), message = $(`#av-${p}-msg`).value.trim();
    const notify = $(`#av-${p}-notify`).checked;
    if (!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(latest)) return avNote(p, "Sürüm adı 1.4.0 biçiminde olmalı.", "err");
    if (!lbS || !Number.isInteger(latestBuild) || latestBuild < 1) return avNote(p, "latestBuild en az 1 olan bir tam sayı olmalı.", "err");
    if (!mbS || !Number.isInteger(minBuild) || minBuild < 0) return avNote(p, "minBuild 0 ya da daha büyük bir tam sayı olmalı.", "err");
    if (minBuild > latestBuild) return avNote(p, "minBuild, latestBuild'den büyük olamaz.", "err");
    if (storeUrl && !storeUrl.startsWith("https://")) return avNote(p, "Mağaza bağlantısı https:// ile başlamalı.", "err");
    const ask = `${name}: yeni sürüm ${latest} (build ${latestBuild}), build ${minBuild} altı zorunlu güncelleme.\n\n`
      + "Sürüm mağazada yayında değilse üyeler güncelleyemez. Önce Play Console / App Store'da yayınladığından emin ol."
      + (notify ? `\n\nTüm ${name} cihazlarına "Yeni sürüm yayında" bildirimi gidecek.` : "");
    if (!confirm(ask)) return;
    avNote(p, "");
    b.disabled = true;
    b.textContent = "Kaydediliyor…";
    try {
      const r = await call("appVersionAdmin", { op: "set", platform: p, latest, latestBuild, minBuild, message, storeUrl, notify });
      if (r.config && r.config[p]) avFill(p, r.config[p], null);
      $(`#av-${p}-notify`).checked = false;
      avNote(p, `Kaydedildi.${notify ? ` Bildirim ${r.notified || 0} cihaza gitti.` : ""}`, "ok");
    } catch (e) {
      avNote(p, "Kaydedilemedi: " + errText(e), "err");
    } finally {
      b.disabled = false;
      b.textContent = "Kaydet";
    }
  }));
  // ------------------------------------------------------------------ ipuçları (nudgesAdmin: get/set/testPush) → config/cand_nudges
  // Sekme sırası candidate_shell ile aynı: 0 Salon · 1 Etkinlikler · 2 Oyunlar · 3 Profilim · 4 Onaylanınca.
  const ND_TABS = ["Salon", "Etkinlikler", "Oyunlar", "Profilim", "Onaylanınca"];
  const ND_SLUGS = ["salon", "etkinlikler", "oyunlar", "profil", "onaylaninca"];
  const ND_MAX = 40, ND_TEXT = 140;
  let nd = null, ndDefaults = null, ndDirty = false;
  const ndNote = (text, kind) => {
    const el = $("#ndOut");
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const ndClone = (v) => JSON.parse(JSON.stringify(v));
  const ndCount = (s, max) => `<div class="count${s.length > max ? " over" : ""}">${s.length}/${max}</div>`;
  const ndMoveBtns = (kind, i, n) =>
    `<button class="btn ghost" data-nd="${kind}" data-op="up" data-i="${i}" ${i === 0 ? "disabled" : ""} title="Yukarı">↑</button>`
    + `<button class="btn ghost" data-nd="${kind}" data-op="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""} title="Aşağı">↓</button>`
    + `<button class="btn ghost" data-nd="${kind}" data-op="del" data-i="${i}" title="Sil">Sil</button>`;
  const ndSlugOf = (link) => {
    const m = /[?&]sekme=([^&#]+)/.exec(link || "");
    return m ? m[1] : link === "/aday" ? "" : "custom";
  };
  function ndDraw() {
    if (!nd) return;
    $("#ndEnabled").checked = nd.enabled;
    $("#ndInterval").value = nd.intervalMin;
    $("#ndPerSession").value = nd.maxPerSession;
    $("#ndPushEnabled").checked = nd.push.enabled;
    $("#ndHour").innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === nd.push.hourTR ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
    $("#ndPerWeek").value = nd.push.maxPerWeek;
    const msgs = nd.messages;
    $("#ndMsgs").innerHTML = msgs.length ? msgs.map((m, i) => `
      <div style="border-top:1px solid var(--line);padding:10px 0">
        <div class="row">
          <div style="width:160px"><label>Sekme</label><select data-ndf="m" data-i="${i}" data-k="tab">
            <option value="" ${m.tab == null ? "selected" : ""}>— (genel)</option>
            ${ND_TABS.map((t, j) => `<option value="${j}" ${m.tab === j ? "selected" : ""}>${t}</option>`).join("")}
          </select></div>
          <div style="width:150px"><label>Özellik (isteğe bağlı)</label><input data-ndf="m" data-i="${i}" data-k="feature" maxlength="40" value="${esc(m.feature || "")}" placeholder="events"></div>
          <div style="width:170px"><label>Düğme (isteğe bağlı)</label><input data-ndf="m" data-i="${i}" data-k="cta" maxlength="40" value="${esc(m.cta || "")}" placeholder="Etkinliklere bak"></div>
          <div style="display:flex;gap:4px">${ndMoveBtns("m", i, msgs.length)}</div>
        </div>
        <label>Metin</label><textarea data-ndf="m" data-i="${i}" data-k="text" rows="2" maxlength="${ND_TEXT + 20}">${esc(m.text)}</textarea>${ndCount(m.text, ND_TEXT)}
      </div>`).join("") : '<p class="muted small">Henüz ipucu yok.</p>';
    $("#ndAddMsg").disabled = msgs.length >= ND_MAX;
    $("#ndAddMsg").textContent = `+ İpucu ekle (${msgs.length}/${ND_MAX})`;
    const pm = nd.push.messages;
    $("#ndPush").innerHTML = pm.length ? pm.map((m, i) => {
      const slug = ndSlugOf(m.link);
      return `
      <div style="border-top:1px solid var(--line);padding:10px 0">
        <div class="row">
          <div style="flex:1;min-width:200px"><label>Başlık</label><input data-ndf="p" data-i="${i}" data-k="title" maxlength="80" value="${esc(m.title)}">${ndCount(m.title, 60)}</div>
          <div style="display:flex;gap:4px">${ndMoveBtns("p", i, pm.length)}<button class="btn ghost" data-nd="p" data-op="test" data-i="${i}" title="Bu bildirimi bana gönder">Test</button></div>
        </div>
        <label>Metin</label><textarea data-ndf="p" data-i="${i}" data-k="body" rows="2" maxlength="${ND_TEXT + 20}">${esc(m.body)}</textarea>${ndCount(m.body, ND_TEXT)}
        <div class="row">
          <div style="width:170px"><label>Açılacak sekme</label><select data-ndf="p" data-i="${i}" data-k="slug">
            <option value="" ${slug === "" ? "selected" : ""}>— (aday ana sayfa)</option>
            ${ND_TABS.map((t, j) => `<option value="${ND_SLUGS[j]}" ${slug === ND_SLUGS[j] ? "selected" : ""}>${t}</option>`).join("")}
            ${slug === "custom" ? '<option value="custom" selected>Özel bağlantı</option>' : ""}
          </select></div>
          <div style="flex:1;min-width:180px"><label>Bağlantı</label><input data-ndf="p" data-i="${i}" data-k="link" maxlength="200" value="${esc(m.link)}" placeholder="/aday?sekme=etkinlikler"></div>
        </div>
      </div>`;
    }).join("") : '<p class="muted small">Henüz bildirim yok.</p>';
    $("#ndAddPush").disabled = pm.length >= ND_MAX;
    $("#ndAddPush").textContent = `+ Bildirim ekle (${pm.length}/${ND_MAX})`;
    $("#ndSave").textContent = ndDirty ? "Kaydet" : "Kaydedildi";
  }
  const ndTouch = () => {
    ndDirty = true;
    $("#ndSave").textContent = "Kaydet";
  };
  async function loadNudges() {
    if (ndDirty && nd) return; // kaydedilmemiş değişiklikleri koru
    ndNote("");
    try {
      const d = await call("nudgesAdmin", { op: "get" });
      nd = ndClone(d.config);
      ndDefaults = d.defaults || null;
      ndDirty = false;
      $("#ndCur").textContent = d.stored
        ? `Son kayıt: ${d.updatedAt ? when(d.updatedAt) : "–"}`
        : "Henüz kayıt yok; uygulama varsayılan ipuçlarını kullanıyor. Kaydedince buradaki ayarlar geçerli olur.";
      const r = d.lastRun;
      $("#ndRun").textContent = r
        ? `Son gönderim turu: ${r.at ? when(r.at) : "–"} · ${r.sent} gönderildi, ${r.skipped} atlandı${r.reason ? " (" + r.reason + ")" : ""}`
        : "Henüz gönderim turu çalışmadı.";
      ndDraw();
    } catch (e) {
      $("#ndCur").textContent = "Yüklenemedi.";
      ndNote("İpuçları yüklenemedi: " + errText(e), "err");
    }
  }
  const ndInput = (e) => {
    const el = e.target;
    if (!nd || !el.dataset || !el.dataset.ndf) return;
    const i = Number(el.dataset.i), k = el.dataset.k;
    const item = el.dataset.ndf === "m" ? nd.messages[i] : nd.push.messages[i];
    if (!item) return;
    if (k === "tab") item.tab = el.value === "" ? null : Number(el.value);
    else if (k === "slug") {
      if (el.value === "custom") return;
      item.link = el.value ? `/aday?sekme=${el.value}` : "/aday";
      const linkEl = el.closest("div.row").querySelector('[data-k="link"]');
      if (linkEl) linkEl.value = item.link;
    } else item[k] = el.value;
    if (k === "text" || k === "body" || k === "title") {
      const max = k === "title" ? 60 : ND_TEXT;
      const c = el.nextElementSibling;
      if (c && c.classList.contains("count")) {
        c.textContent = `${el.value.length}/${max}`;
        c.classList.toggle("over", el.value.length > max);
      }
    }
    ndTouch();
  };
  $("#ndMsgs").addEventListener("input", ndInput);
  $("#ndMsgs").addEventListener("change", ndInput);
  $("#ndPush").addEventListener("input", ndInput);
  $("#ndPush").addEventListener("change", (e) => {
    ndInput(e);
    if (e.target.dataset && e.target.dataset.k === "link") ndDraw(); // sekme seçimini bağlantıyla eşitle
  });
  const ndClick = async (e) => {
    const b = e.target.closest("[data-nd]");
    if (!b || !nd) return;
    const list = b.dataset.nd === "m" ? nd.messages : nd.push.messages;
    const i = Number(b.dataset.i), op = b.dataset.op;
    if (op === "test") return ndTest(list[i], b);
    if (op === "del") {
      if (!confirm("Bu ipucu silinsin mi?")) return;
      list.splice(i, 1);
    } else {
      const j = op === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    }
    ndTouch();
    ndDraw();
  };
  $("#ndMsgs").addEventListener("click", ndClick);
  $("#ndPush").addEventListener("click", ndClick);
  $("#ndEnabled").onchange = (e) => { if (nd) { nd.enabled = e.target.checked; ndTouch(); } };
  $("#ndPushEnabled").onchange = (e) => { if (nd) { nd.push.enabled = e.target.checked; ndTouch(); } };
  $("#ndInterval").oninput = (e) => { if (nd) { nd.intervalMin = e.target.value; ndTouch(); } };
  $("#ndPerSession").oninput = (e) => { if (nd) { nd.maxPerSession = e.target.value; ndTouch(); } };
  $("#ndPerWeek").oninput = (e) => { if (nd) { nd.push.maxPerWeek = e.target.value; ndTouch(); } };
  $("#ndHour").onchange = (e) => { if (nd) { nd.push.hourTR = Number(e.target.value); ndTouch(); } };
  $("#ndAddMsg").onclick = () => {
    if (!nd || nd.messages.length >= ND_MAX) return;
    nd.messages.push({ id: "", tab: 1, text: "", cta: "" });
    ndTouch();
    ndDraw();
  };
  $("#ndAddPush").onclick = () => {
    if (!nd || nd.push.messages.length >= ND_MAX) return;
    nd.push.messages.push({ id: "", title: "", body: "", link: "/aday?sekme=salon" });
    ndTouch();
    ndDraw();
  };
  $("#ndDefaults").onclick = () => {
    if (!ndDefaults || !confirm("Tüm ipuçları varsayılanlarla değiştirilsin mi? (Kaydet'e basana kadar yayına girmez.)")) return;
    nd = ndClone(ndDefaults);
    ndTouch();
    ndDraw();
  };
  function ndValidate() {
    const intIn = (v, lo, hi) => Number.isInteger(Number(v)) && String(v).trim() !== "" && Number(v) >= lo && Number(v) <= hi;
    if (!intIn(nd.intervalMin, 1, 120)) return "Aralık 1 ile 120 dakika arasında olmalı.";
    if (!intIn(nd.maxPerSession, 0, 20)) return "Oturum başına en çok 0 ile 20 arasında olmalı.";
    if (!intIn(nd.push.maxPerWeek, 0, 7)) return "Haftada en çok 0 ile 7 arasında olmalı.";
    for (const [i, m] of nd.messages.entries()) {
      const t = (m.text || "").trim();
      if (!t) return `${i + 1}. ipucunun metni boş.`;
      if (t.length > ND_TEXT) return `${i + 1}. ipucu ${ND_TEXT} karakteri aşıyor.`;
    }
    for (const [i, m] of nd.push.messages.entries()) {
      if (!(m.title || "").trim() || !(m.body || "").trim()) return `${i + 1}. bildirimin başlığı ve metni dolu olmalı.`;
      if (m.title.trim().length > 60) return `${i + 1}. bildirimin başlığı 60 karakteri aşıyor.`;
      if (m.body.trim().length > ND_TEXT) return `${i + 1}. bildirimin metni ${ND_TEXT} karakteri aşıyor.`;
      const l = (m.link || "").trim();
      if (l && (!l.startsWith("/") || l.startsWith("//"))) return `${i + 1}. bildirimin bağlantısı "/" ile başlamalı (ör. /aday?sekme=etkinlikler).`;
    }
    return "";
  }
  $("#ndSave").onclick = async () => {
    if (!nd) return;
    const err = ndValidate();
    if (err) return ndNote(err, "err");
    const b = $("#ndSave");
    b.disabled = true;
    b.textContent = "Kaydediliyor…";
    ndNote("");
    try {
      const config = {
        ...nd,
        intervalMin: Number(nd.intervalMin), maxPerSession: Number(nd.maxPerSession),
        push: { ...nd.push, maxPerWeek: Number(nd.push.maxPerWeek) },
      };
      const r = await call("nudgesAdmin", { op: "set", config });
      nd = ndClone(r.config);
      ndDirty = false;
      $("#ndCur").textContent = `Son kayıt: ${when(Date.now())}`;
      ndDraw();
      ndNote("Kaydedildi. Adayların uygulamasında bir sonraki açılışta geçerli olur.", "ok");
    } catch (e) {
      b.textContent = "Kaydet";
      ndNote("Kaydedilemedi: " + errText(e), "err");
    } finally {
      b.disabled = false;
    }
  };
  async function ndTest(m, btn) {
    const b = btn || $("#ndTest");
    const label = b.textContent;
    b.disabled = true;
    b.textContent = "Gönderiliyor…";
    ndNote("");
    try {
      const data = { op: "testPush" };
      if (m) data.message = { title: (m.title || "").trim(), body: (m.body || "").trim(), link: (m.link || "").trim() };
      const r = await call("nudgesAdmin", data);
      ndNote(`Test bildirimi ${r.sent || 0} cihazına gönderildi.`, "ok");
    } catch (e) {
      ndNote("Gönderilemedi: " + errText(e), "err");
    } finally {
      b.disabled = false;
      b.textContent = label;
    }
  }
  $("#ndTest").onclick = () => ndTest(nd && nd.push.messages.length ? nd.push.messages[0] : null);
  // ------------------------------------------------------------------ AI video şablonları (aiVideo; functions/src/ai_video.ts)
  let aivItems = [];
  function aivFill(t) {
    $("#avId").value = t?.id || "";
    $("#avTitle").value = t?.title || "";
    $("#avOrder").value = t?.order ?? 0;
    $("#avDur").value = t?.durationSec ?? 0;
    $("#avEnabled").checked = t ? t.enabled === true : false;
    $("#avNoPeople").checked = false;
    $("#avVideo").value = "";
    $("#avThumb").value = "";
  }
  async function loadAiVideoTab() {
    try {
      const [tp, cfg] = await Promise.all([call("aiVideo", { op: "adminTemplates" }), call("aiVideo", { op: "adminConfig" })]);
      aivItems = tp.items || [];
      aivVeoLoad();
      table($("#avTable"), [
        { t: "Kapak", f: (r) => (r.thumbUrl ? `<img src="${esc(r.thumbUrl)}" style="height:56px;border-radius:6px">` : "—") },
        { t: "Ad", k: "title" },
        { t: "Süre", k: "durationSec", num: true },
        { t: "Sıra", k: "order", num: true },
        { t: "Durum", f: (r) => (r.genStatus === "generating" ? "Veo üretiyor…" : r.genStatus === "failed" ? `Veo hatası: ${esc(r.genError || "-")}` : (r.enabled ? "Açık" : "Kapalı") + (r.source === "veo" ? " · Veo" : "")) },
        { t: "", f: (r) => `${r.previewUrl ? `<a class="btn ghost" href="${esc(r.previewUrl)}" target="_blank" rel="noopener">İzle</a> ` : ""}<button class="btn ghost" data-av-edit="${esc(r.id)}">Düzenle</button> <button class="btn ghost" data-av-del="${esc(r.id)}">Sil</button>` },
      ], aivItems);
      $("#avTable").onclick = async (ev) => {
        const e = ev.target.closest("[data-av-edit]");
        const d = ev.target.closest("[data-av-del]");
        if (e) aivFill(aivItems.find((x) => x.id === e.dataset.avEdit));
        if (d && confirm("Şablon silinsin mi? Üyelerin önceden ürettiği videolar etkilenmez.")) {
          try {
            await call("aiVideo", { op: "templateDelete", id: d.dataset.avDel });
            toast("Silindi");
            loadAiVideoTab();
          } catch (err) {
            toast(err.message || String(err));
          }
        }
      };
      const keyLine = cfg.provider === "replicate"
        ? `Replicate belirteci: ${cfg.replicateKey ? "girildi ✓" : "GİRİLMEDİ — ana kurucu uygulamada Gizli menü › API anahtarları › Replicate"}`
        : `fal.ai anahtarı: ${cfg.falKey ? "girildi ✓" : "GİRİLMEDİ — ana kurucu uygulamada Gizli menü › API anahtarları › fal.ai"}`;
      $("#avToken").textContent = `${keyLine}. Video başına maliyet (fal.ai pixverse/swap 720p): ≤5 sn ≈ 0,20 $, 5–10 sn ≈ 0,40 $. Fiyat: ${cfg.price} HP (Premium ${cfg.premiumPrice} HP; kuruculara ücretsiz).`;
      $("#avProvider").value = cfg.provider === "replicate" ? "replicate" : "fal";
      $("#avFalModel").value = cfg.falModel || "fal-ai/pixverse/swap";
      $("#avCfgEnabled").checked = cfg.enabled !== false;
      $("#avModel").value = cfg.model || "";
      $("#avVersion").value = cfg.version || "";
      $("#avImageKey").value = cfg.imageKey || "swap_image";
      $("#avVideoKey").value = cfg.videoKey || "target_video";
      $("#avMax").value = cfg.maxPerDay ?? 5;
      $("#avTimeout").value = cfg.timeoutMin ?? 30;
    } catch (e) {
      $("#avTable").innerHTML = `<p style="color:#d64545">${esc(e.message)}</p>`;
    }
  }
  async function aivUpload(f, kind) {
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `ai_video_templates/${Date.now()}_${kind}.${ext}`;
    await firebase.storage().ref(path).put(f, { contentType: f.type });
    return path;
  }
  $("#avNew").onclick = () => aivFill(null);
  $("#avSave").onclick = async () => {
    const btn = $("#avSave");
    btn.disabled = true;
    try {
      const vf = $("#avVideo").files[0];
      const tf = $("#avThumb").files[0];
      const id = $("#avId").value || undefined;
      if (!id && !vf) throw new Error("Şablon videosu seç.");
      if (vf && !$("#avNoPeople").checked) throw new Error("Videoda gerçek/tanınabilir kişi olmadığını ve kullanım hakkımız olduğunu onayla.");
      const dur = +$("#avDur").value || 0;
      if (dur > 60) throw new Error("Şablon en fazla 60 saniye olabilir.");
      toast("Dosya yükleniyor…");
      const videoPath = vf ? await aivUpload(vf, "v") : undefined;
      const thumbPath = tf ? await aivUpload(tf, "t") : undefined;
      await call("aiVideo", { op: "templateUpsert", id, title: $("#avTitle").value, videoPath, thumbPath, durationSec: dur, enabled: $("#avEnabled").checked, order: +$("#avOrder").value || 0 });
      toast("Kaydedildi");
      aivFill(null);
      loadAiVideoTab();
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  };
  $("#avCfgSave").onclick = async () => {
    try {
      await call("aiVideo", {
        op: "setConfig", enabled: $("#avCfgEnabled").checked, provider: $("#avProvider").value, falModel: $("#avFalModel").value.trim(),
        model: $("#avModel").value.trim(), version: $("#avVersion").value.trim(),
        imageKey: $("#avImageKey").value.trim(), videoKey: $("#avVideoKey").value.trim(), maxPerDay: +$("#avMax").value || 5, timeoutMin: +$("#avTimeout").value || 30,
      });
      toast("Kaydedildi");
      loadAiVideoTab();
    } catch (e) {
      toast(e.message || String(e));
    }
  };

  // Veo ile şablon üretimi (templateGenerate). Başlangıç istemleri sunucudan (veoPrompts).
  let aivVeoLoaded = false;
  async function aivVeoLoad() {
    if (aivVeoLoaded) return;
    try {
      const r = await call("aiVideo", { op: "veoPrompts" });
      const box = $("#avVeoChips");
      box.innerHTML = (r.items || []).map((x, i) => `<button class="btn ghost" data-veo="${i}">${esc(x.title)}</button>`).join(" ");
      box.onclick = (ev) => {
        const b = ev.target.closest("[data-veo]");
        if (!b) return;
        const x = r.items[+b.dataset.veo];
        $("#avVeoTitle").value = x.title;
        $("#avVeoPrompt").value = x.prompt;
      };
      if (r.items && r.items[0] && !$("#avVeoPrompt").value) {
        $("#avVeoTitle").value = r.items[0].title;
        $("#avVeoPrompt").value = r.items[0].prompt;
      }
      aivVeoLoaded = true;
    } catch (e) {
      $("#avVeoChips").textContent = e.message || String(e);
    }
  }
  $("#avVeoGo").onclick = async () => {
    const btn = $("#avVeoGo");
    if (!confirm("Veo ile şablon üretilsin mi? Tahmini maliyet ≈ 0,64 $.")) return;
    btn.disabled = true;
    try {
      await call("aiVideo", { op: "templateGenerate", title: $("#avVeoTitle").value.trim(), prompt: $("#avVeoPrompt").value.trim() });
      toast("Üretim başladı (birkaç dakika). Hazır olunca listede izleyip açabilirsin.");
      loadAiVideoTab();
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  };

  // ------------------------------------------------------------------ fiyatlar (servicePricing: list/adminSet) → config/service_prices
  const SP_MAX = 100000;
  const SP_CATS = { profile: "Profil", event: "Etkinlik", events: "Etkinlik", chat: "Sohbet", social: "Sosyal", game: "Oyun", games: "Oyun", cosmetic: "Görünüm", other: "Diğer" };
  let spOrig = {}, spDraft = {}, spDefaults = {}, spOrder = [], spCatNames = {};
  const spNote = (text, kind) => {
    const el = $("#spOut");
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const spInt = (v) => (v === "" || v == null || !/^\d+$/.test(String(v)) ? null : Number(v));
  const spErr = (s) => {
    const p = spInt(s.price), pp = spInt(s.premiumPrice);
    if (!String(s.name || "").trim()) return "Ad boş olamaz.";
    if (p == null || p > SP_MAX) return `Fiyat 0–${SP_MAX} arası tam sayı olmalı.`;
    if (pp == null || pp > SP_MAX) return `Premium fiyat 0–${SP_MAX} arası tam sayı olmalı.`;
    if (pp > p) return "Premium fiyat normal fiyattan büyük olamaz.";
    return "";
  };
  const spDirty = (id) => {
    const a = spOrig[id], b = spDraft[id];
    return a.name !== b.name || a.desc !== b.desc || a.enabled !== b.enabled || String(a.price) !== String(b.price) || String(a.premiumPrice) !== String(b.premiumPrice);
  };
  const spBadge = (s) => {
    const p = spInt(s.price), pp = spInt(s.premiumPrice);
    if (p == null || pp == null || pp > p) return "";
    if (p === 0) return '<span class="pill on">Herkese ücretsiz</span>';
    if (pp === 0) return '<span class="pill" style="background:#FBF3DD;color:#8a6a12">Premium’a ücretsiz</span>';
    const d = Math.round(((p - pp) / p) * 100);
    return d > 0 ? `<span class="pill" style="background:#FBF3DD;color:#8a6a12">Premium %${d} indirim</span>` : '<span class="pill">Premium indirimi yok</span>';
  };
  function spBar() {
    const dirty = spOrder.filter(spDirty);
    const bad = dirty.filter((id) => spErr(spDraft[id]));
    $("#spBar").classList.toggle("hide", !dirty.length);
    $("#spBarText").textContent = bad.length ? "Hatalı alanları düzelt" : `${dirty.length} hizmette kaydedilmemiş değişiklik`;
    $("#spBarText").style.color = bad.length ? "#d64545" : "";
    $("#spSave").disabled = !!bad.length;
  }
  function spRowState(id) {
    const row = document.querySelector(`[data-sp="${CSS.escape(id)}"]`);
    if (!row) return;
    const s = spDraft[id], err = spErr(s);
    row.classList.toggle("dirty", spDirty(id));
    row.querySelector(".spBadge").innerHTML = spBadge(s) + (s.enabled ? "" : ' <span class="pill off">Kapalı</span>') + (spDirty(id) ? ' <span class="pill off">Kaydedilmedi</span>' : "");
    row.querySelector(".spErr").textContent = err;
    row.querySelector("[data-f=price]").style.borderColor = err && /^Fiyat|^Premium fiyat normal/.test(err) ? "#d64545" : "";
    row.querySelector("[data-f=premiumPrice]").style.borderColor = err && /^Premium/.test(err) ? "#d64545" : "";
    spBar();
  }
  function drawPrices() {
    const groups = {};
    for (const id of spOrder) (groups[spDraft[id].category || "other"] ||= []).push(id);
    const html = Object.entries(groups).map(([cat, ids]) => `
      <div class="card"><h3>${esc(spCatNames[cat] || SP_CATS[cat] || cat)}</h3>
      ${ids.map((id) => { const s = spDraft[id]; return `
        <div class="sprow" data-sp="${esc(id)}">
          <div class="sphead">
            <div style="flex:1;min-width:200px">
              <input data-f="name" maxlength="60" value="${esc(s.name)}" style="font-weight:700">
              <input data-f="desc" maxlength="200" value="${esc(s.desc)}" placeholder="Açıklama" class="small" style="margin-top:6px">
              <span class="muted small">${esc(id)}</span>
            </div>
            <label class="switch" title="Açık / kapalı"><input type="checkbox" data-f="enabled" ${s.enabled ? "checked" : ""}><span></span></label>
          </div>
          <div class="row" style="margin-top:6px;align-items:center">
            <div style="width:150px"><label>Fiyat (HP)</label><input data-f="price" type="number" min="0" max="${SP_MAX}" step="1" value="${esc(s.price)}"></div>
            <div style="width:150px"><label>Premium (HP)</label><input data-f="premiumPrice" type="number" min="0" max="${SP_MAX}" step="1" value="${esc(s.premiumPrice)}"></div>
            <div class="spBadge" style="padding-top:22px"></div>
          </div>
          <div class="spErr small" style="color:#d64545;margin-top:4px"></div>
        </div>`; }).join("")}
      </div>`).join("");
    $("#spList").innerHTML = html || '<div class="card muted">Henüz tanımlı hizmet yok.</div>';
    $$("#spList [data-sp]").forEach((row) => {
      const id = row.dataset.sp;
      row.querySelectorAll("[data-f]").forEach((inp) => {
        inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
          const f = inp.dataset.f;
          spDraft[id][f] = inp.type === "checkbox" ? inp.checked : f === "price" || f === "premiumPrice" ? inp.value.trim() : inp.value;
          spRowState(id);
        });
      });
      spRowState(id);
    });
    $("#spReset").disabled = !Object.keys(spDefaults).length;
    $("#spReset").title = Object.keys(spDefaults).length ? "" : "Sunucu varsayılan değerleri göndermedi.";
    spBar();
  }
  // ---- Etkinlik bileti iadesi (eventTickets refundPolicy / refundPolicySet) → config/economy.eventRefund
  function erNote(msg, ok = true) {
    const el = $("#erOut");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok ? "" : "#d64545";
    el.classList.toggle("hide", !msg);
  }
  async function loadEventRefund() {
    if (!$("#erFull")) return;
    erNote("");
    try {
      const d = await call("eventTickets", { op: "refundPolicy" });
      const p = d.policy || d.defaults || {};
      $("#erFull").value = p.fullBeforeHours;
      $("#erPct").value = p.partialPct;
      $("#erPartial").value = p.partialBeforeHours;
    } catch (e) {
      erNote("İade politikası okunamadı: " + (e.message || e), false);
    }
  }
  if ($("#erSave")) $("#erSave").onclick = async () => {
    const v = (id) => Number($(id).value);
    const policy = { fullBeforeHours: v("#erFull"), partialPct: v("#erPct"), partialBeforeHours: v("#erPartial") };
    const bad = Object.values(policy).some((x) => !Number.isInteger(x) || x < 0) || policy.fullBeforeHours > 720 || policy.partialPct > 100 || policy.partialBeforeHours > policy.fullBeforeHours;
    if (bad) return erNote("Geçersiz: saatler 0–720 tam sayı, kısmi süre tam iade süresinden uzun olamaz, oran 0–100.", false);
    try {
      await call("eventTickets", { op: "refundPolicySet", policy });
      erNote(`Kaydedildi: ${policy.fullBeforeHours} saatten önce tam iade, ${policy.partialBeforeHours}–${policy.fullBeforeHours} saat arası %${policy.partialPct}, sonrası iade yok.`);
    } catch (e) {
      erNote("Kaydedilemedi: " + (e.message || e), false);
    }
  };

  // ---- Etkinlik kötüye kullanım ve cezalar (yonetim › eventPolicyAdmin) → config/eventPolicy, event_bans
  const EP_KEYS = ["earlyLeaveHours","earlyLeaveCount","earlyLeaveWindowDays","earlyLeaveBanDays","ridePassengerNoShowBanDays","ridePassengerNoShowEventBanDays","rideDriverNoShowBanDays","rideDriverNoShowEventBanDays","repeatMultiplier"];
  function epNote(msg, ok = true) {
    const el = $("#epOut");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok ? "" : "#d64545";
    el.classList.toggle("hide", !msg);
  }
  const epDate = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "");
  async function loadEventPolicy() {
    if (!$("#epSave")) return;
    epNote("");
    try {
      const d = await call("eventPolicyAdmin", { op: "get" });
      const p = d.policy || {};
      for (const k of EP_KEYS) { $("#ep_" + k).value = p[k]; $("#ep_" + k).disabled = !d.canEdit; }
      $("#ep_payDriver").checked = p.ridePassengerNoShowPayDriver !== false;
      $("#ep_payDriver").disabled = !d.canEdit;
      $("#epSave").disabled = !d.canEdit;
      const b = await call("eventPolicyAdmin", { op: "bans", limit: 100 });
      const items = b.items || [];
      $("#epBans").innerHTML = items.length
        ? '<table><tr><th>Üye</th><th>Etkinlik cezası</th><th>Araç cezası</th><th></th></tr>' + items.map((x) => `<tr><td><b>${esc(x.name || x.uid)}</b>${x.username ? ` <span class="muted">@${esc(x.username)}</span>` : ""}</td><td>${x.events ? esc(epDate(x.events.until) + " · " + x.events.reason) : "–"}</td><td>${x.rides ? esc(epDate(x.rides.until) + " · " + x.rides.reason) : "–"}</td><td>${x.events ? `<button class="btn ghost" data-lift="events" data-uid="${esc(x.uid)}">Etkinlik cezasını kaldır</button>` : ""}${x.rides ? ` <button class="btn ghost" data-lift="rides" data-uid="${esc(x.uid)}">Araç cezasını kaldır</button>` : ""}</td></tr>`).join("") + "</table>"
        : '<span class="muted">Bayraklı üye yok.</span>';
      $("#epBans").querySelectorAll("[data-lift]").forEach((btn) => (btn.onclick = async () => {
        const reason = (prompt("Cezayı kaldırma gerekçesi (en az 10 karakter):") || "").trim();
        if (reason.length < 10) return epNote("Gerekçe en az 10 karakter olmalı.", false);
        try {
          await call("eventPolicyAdmin", { op: "lift", uid: btn.dataset.uid, scope: btn.dataset.lift, reason });
          epNote("Ceza kaldırıldı.");
          loadEventPolicy();
        } catch (e) { epNote("Kaldırılamadı: " + (e.message || e), false); }
      }));
    } catch (e) {
      epNote("Politika okunamadı: " + (e.message || e), false);
    }
  }
  if ($("#epSave")) $("#epSave").onclick = async () => {
    const policy = { ridePassengerNoShowPayDriver: $("#ep_payDriver").checked };
    for (const k of EP_KEYS) {
      const v = Number($("#ep_" + k).value);
      if (!Number.isFinite(v) || v < 0) return epNote("Tüm alanlar 0 veya üstü sayı olmalı.", false);
      policy[k] = v;
    }
    try {
      await call("eventPolicyAdmin", { op: "set", policy });
      epNote("Kaydedildi.");
    } catch (e) { epNote("Kaydedilemedi: " + (e.message || e), false); }
  };

  async function loadPrices() {
    spNote("");
    $("#spList").innerHTML = '<div class="note">Yükleniyor…</div>';
    try {
      const d = await call("servicePricing", { op: "list", all: true });
      spOrig = {}; spDraft = {}; spOrder = []; spDefaults = {};
      spCatNames = d.categories || {};
      const defs = d.defaults || {};
      for (const s of d.services || []) {
        if (!s || !s.id) continue;
        const v = { name: s.name || s.id, desc: s.desc || "", category: s.category || "other", enabled: s.enabled !== false, price: String(s.price ?? 0), premiumPrice: String(s.premiumPrice ?? s.price ?? 0) };
        spOrig[s.id] = v;
        spDraft[s.id] = { ...v };
        spOrder.push(s.id);
        const def = defs[s.id] || (s.defaultPrice != null ? { price: s.defaultPrice, premiumPrice: s.defaultPremiumPrice ?? s.defaultPrice, enabled: s.defaultEnabled ?? true } : null);
        if (def) spDefaults[s.id] = def;
      }
      drawPrices();
    } catch (e) {
      $("#spList").innerHTML = "";
      spNote("Fiyatlar yüklenemedi: " + errText(e), "err");
    }
    if (!advKeys().some(advDirtyKey)) loadAdv();
    loadGiftPrices();
  }

  // ---- Hediyeler (servicePricing adminList/adminSet → config/service_prices.gifts; yazma yalnızca ana kurucu)
  let gpIds = [];
  function gpNote(msg, ok = true) {
    const el = $("#gpOut");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok ? "" : "#d64545";
    el.classList.toggle("hide", !msg);
  }
  async function loadGiftPrices() {
    if (!$("#gpList")) return;
    gpNote("");
    try {
      const d = await call("servicePricing", { op: "adminList" });
      const defs = d.giftDefaults || {};
      const g = d.gifts || {};
      const prices = g.prices || {};
      const off = new Set(g.disabled || []);
      gpIds = Object.keys(defs);
      $("#gpBig").value = g.bigMin ?? 500;
      const row = (id) => {
        const x = defs[id];
        return `<tr><td>${esc(x.emoji)} ${esc(x.name)}${x.premium ? ' <span class="muted small">3D</span>' : ""}</td>` +
          `<td class="num"><input type="number" min="1" data-gp="${esc(id)}" value="${esc(prices[id] ?? x.price)}" style="width:110px"></td>` +
          `<td><label><input type="checkbox" data-gpon="${esc(id)}" ${off.has(id) ? "" : "checked"}> açık</label></td></tr>`;
      };
      $("#gpList").innerHTML = '<table><thead><tr><th>Hediye</th><th class="num">Fiyat (HP)</th><th>Durum</th></tr></thead><tbody>' +
        gpIds.filter((id) => !defs[id].premium).map(row).join("") +
        '<tr><td colspan="3"><b>Premium 3D</b></td></tr>' +
        gpIds.filter((id) => defs[id].premium).map(row).join("") + "</tbody></table>";
    } catch (e) {
      gpNote("Hediye fiyatları yüklenemedi: " + errText(e), false);
    }
  }
  if ($("#gpSave")) $("#gpSave").onclick = async () => {
    const prices = {};
    for (const id of gpIds) {
      const v = Number($(`[data-gp="${id}"]`).value);
      if (!Number.isInteger(v) || v < 1) return gpNote(`${id}: fiyat en az 1 HP tam sayı olmalı.`, false);
      prices[id] = v;
    }
    const disabled = gpIds.filter((id) => !$(`[data-gpon="${id}"]`).checked);
    const bigMin = Number($("#gpBig").value);
    if (!Number.isInteger(bigMin) || bigMin < 1) return gpNote("Eşik en az 1 HP tam sayı olmalı.", false);
    try {
      await call("servicePricing", { op: "adminSet", gifts: { prices, disabled, bigMin } });
      gpNote("Hediye fiyatları kaydedildi.");
    } catch (e) {
      gpNote("Kaydedilemedi: " + errText(e), false);
    }
  };
  $("#spHalf").onclick = () => {
    if (!spOrder.length || !confirm("Tüm hizmetlerin Premium fiyatı, normal fiyatın yarısı (aşağı yuvarlanarak) yapılsın mı?\n\nKaydet'e basana kadar yayına çıkmaz.")) return;
    for (const id of spOrder) {
      const p = spInt(spDraft[id].price);
      if (p != null) spDraft[id].premiumPrice = String(Math.floor(p / 2));
    }
    drawPrices();
  };
  $("#spReset").onclick = () => {
    if (!confirm("Tüm hizmetlerin fiyatı, Premium fiyatı ve açık/kapalı durumu varsayılan değerlere dönsün mü?\n\nKaydet'e basana kadar yayına çıkmaz.")) return;
    for (const [id, d] of Object.entries(spDefaults)) {
      if (!spDraft[id]) continue;
      if (d.name != null) spDraft[id].name = String(d.name);
      if (d.desc != null) spDraft[id].desc = String(d.desc);
      if (d.price != null) spDraft[id].price = String(d.price);
      if (d.premiumPrice != null) spDraft[id].premiumPrice = String(d.premiumPrice);
      if (typeof d.enabled === "boolean") spDraft[id].enabled = d.enabled;
    }
    drawPrices();
  };
  $("#spDiscard").onclick = () => {
    for (const id of spOrder) spDraft[id] = { ...spOrig[id] };
    drawPrices();
  };
  $("#spReload").onclick = () => {
    if (spOrder.some(spDirty) && !confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
    loadPrices();
  };
  $("#spSave").onclick = async () => {
    const dirty = spOrder.filter(spDirty);
    if (!dirty.length) return;
    const bad = dirty.filter((id) => spErr(spDraft[id]));
    if (bad.length) return spNote("Hatalı alanlar var: " + bad.map((id) => spDraft[id].name).join(", "), "err");
    const services = {};
    for (const id of dirty) {
      const s = spDraft[id];
      services[id] = { name: s.name.trim(), desc: s.desc.trim(), price: Number(s.price), premiumPrice: Number(s.premiumPrice), enabled: s.enabled };
    }
    const b = $("#spSave");
    b.disabled = true;
    b.textContent = "Kaydediliyor…";
    try {
      await call("servicePricing", { op: "adminSet", services });
      await loadPrices();
      spNote(`${dirty.length} hizmet kaydedildi.`, "ok");
    } catch (e) {
      spNote("Kaydedilemedi: " + errText(e), "err");
    } finally {
      b.textContent = "Kaydet";
      spBar();
    }
  };
  // ---- Günlük haklar ve saniye başı ücretler (servicePricing adminList / adminSet; üst düzey anahtarlar hon, beauty, live, now_boost)
  const ADV_TITLES = { hon: "Hot or Not", beauty: "Güzellik filtresi", live: "Canlı yayın / sesli oda", now_boost: "Şimdi HADİ! öne çıkarma", verified: "Doğrulanmış hesap" };
  const ADV_ORDER = { video: ["low", "sd", "hd", "fhd"], audio: ["std", "hq", "studio"] };
  const LQ_KEYS = ["label", "perSec", "premiumPerSec", "kbps", "res", "fps", "enabled"];
  let advOrig = {}, advSpec = [], advVal = {}, advVal0 = {};
  const advNote = (text, kind) => {
    const el = $("#spAdvOut");
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const trNum = (n) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  const rateConv = (v) => `${trNum(v)} HP/sn = ${trNum(v * 60)} HP/dk = ${trNum(v * 3600)} HP/saat`;
  const secLbl = (s) => {
    if (s <= 0) return "0 sn";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return [h ? h + " sa" : "", m ? m + " dk" : "", x ? x + " sn" : ""].filter(Boolean).join(" ");
  };
  const getPath = (o, path) => path.reduce((c, k) => (c && typeof c === "object" ? c[k] : undefined), o);
  const advKey = (f) => f.g + ":" + f.path.join(".");
  const advKeys = () => advSpec.map(advKey);
  const advDirtyKey = (k) => String(advVal[k]) !== String(advVal0[k]);
  const advParse = (f, v) => {
    const t = String(v ?? "").trim();
    if (f.kind === "text") return t;
    if (f.kind === "bool") return v === true;
    if (f.kind === "int") return /^\d+$/.test(t) ? Number(t) : null;
    return /^\d+([.,]\d{1,2})?$/.test(t) ? Number(t.replace(",", ".")) : null;
  };
  const advErr = (f) => {
    const v = advParse(f, advVal[advKey(f)]);
    if (f.kind === "bool") return "";
    if (f.kind === "text") return v.length < 1 || v.length > 30 ? "1–30 karakter" : "";
    if (v == null) return f.kind === "dec" ? "Sayı (en fazla 2 ondalık)" : "Tam sayı gir";
    if (v < f.min || v > f.max) return `${trNum(f.min)}–${trNum(f.max)}`;
    if (f.normal) {
      const n = advParse({ kind: f.kind }, advVal[f.g + ":" + f.normal]);
      if (n != null && v > n) return "Normal fiyattan büyük olamaz";
    }
    return "";
  };
  const advHelp = (f) => {
    const v = advParse(f, advVal[advKey(f)]);
    if (v == null || f.kind === "text" || f.kind === "bool") return "";
    if (f.help === "rate") return rateConv(v);
    if (f.help === "sec") return "= " + secLbl(v);
    if (f.help === "daily") return v === 0 ? "Her kullanım ücretli" : `Üyeye “Bugün ${v}/${v} ücretsiz” olarak gösterilir`;
    if (f.help === "cf") return v === 0 ? "Sınırsız" : `${v} kişi`;
    return "";
  };
  function advBuildSpec() {
    const spec = [];
    const add = (g, path, kind, label, extra = {}) => spec.push({ g, path, kind, label, min: 0, max: 100000, ...extra });
    const rate = (g, base, label = "HP/sn") => {
      add(g, [...base, "perSec"], "dec", label, { max: 1000, help: "rate" });
      add(g, [...base, "premiumPerSec"], "dec", "Premium " + label, { max: 1000, help: "rate", normal: [...base, "perSec"].join(".") });
    };
    if (advOrig.hon) {
      add("hon", ["dailyFree"], "int", "Günlük ücretsiz fotoğraf", { max: 100, help: "daily" });
      add("hon", ["extraPrice"], "int", "Ek fotoğraf (HP)");
      add("hon", ["extraPremiumPrice"], "int", "Premium ek fotoğraf (HP)", { normal: "extraPrice" });
    }
    if (advOrig.beauty) add("beauty", ["freePerDay"], "int", "Günlük ücretsiz kullanım", { max: 1000, help: "daily" });
    if (advOrig.live) {
      for (const kind of ["video", "audio"]) {
        const qs = getPath(advOrig.live, [kind, "qualities"]) || {};
        const order = ADV_ORDER[kind];
        const ids = Object.keys(qs).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
        for (const id of ids) {
          const base = [kind, "qualities", id];
          add("live", [...base, "enabled"], "bool", "Açık", { q: kind + "." + id });
          add("live", [...base, "label"], "text", "Etiket", { q: kind + "." + id });
          rate("live", base);
          spec[spec.length - 1].q = spec[spec.length - 2].q = kind + "." + id;
        }
      }
      add("live", ["minDepositSec"], "int", "En az ön ödeme (sn)", { max: 86400, help: "sec" });
      rate("live", ["boost"], "Öne çıkarma HP/sn");
      add("live", ["boost", "maxSec"], "int", "En uzun öne çıkarma (sn)", { min: 60, max: 86400, help: "sec" });
    }
    if (advOrig.now_boost) {
      rate("now_boost", [], "Öne çıkarma HP/sn");
      add("now_boost", ["maxSec"], "int", "En uzun öne çıkarma (sn)", { min: 60, max: 86400, help: "sec" });
    }
    // Doğrulanmış hesap (verified.ts): closeFriends null = sınırsız → alanda 0.
    if (advOrig.verified) {
      add("verified", ["enabled"], "bool", "Abonelik açık");
      add("verified", ["weeklyPrice"], "int", "Haftalık ücret (HP)");
      add("verified", ["premiumWeeklyPrice"], "int", "Premium haftalık (HP)", { normal: "weeklyPrice" });
      add("verified", ["storyExtendPerWeek"], "int", "Story 48 sa / hafta", { max: 50 });
      add("verified", ["storyBoostPerWeek"], "int", "Story öne çıkarma / hafta", { max: 50 });
      add("verified", ["superLikePerDay"], "int", "Süper beğeni / gün", { max: 100 });
      add("verified", ["closeFriends", "basic"], "int", "Yakın arkadaş · Temel", { max: 10000, help: "cf" });
      add("verified", ["closeFriends", "premium"], "int", "Yakın arkadaş · Premium", { max: 10000, help: "cf" });
      add("verified", ["closeFriends", "verified"], "int", "Yakın arkadaş · Doğrulanmış", { max: 10000, help: "cf" });
    }
    return spec;
  }
  const advFmt = (f, v) => (f.kind === "bool" ? v !== false : f.kind === "dec" && typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v ?? ""));
  function advInput(f) {
    const k = advKey(f);
    if (f.kind === "bool") return `<label class="switch" title="Açık / kapalı"><input type="checkbox" data-adv="${esc(k)}" ${advVal[k] ? "checked" : ""}><span></span></label>`;
    const w = f.kind === "text" ? "200px" : "170px";
    return `<div style="width:${w}"><label>${esc(f.label)}</label><input data-adv="${esc(k)}" value="${esc(advVal[k])}" ${f.kind === "text" ? 'maxlength="30"' : 'inputmode="decimal"'}>
      <div class="small muted" data-advh="${esc(k)}"></div><div class="small" style="color:#d64545" data-adve="${esc(k)}"></div></div>`;
  }
  function drawAdv() {
    const groups = ["hon", "beauty", "live", "now_boost", "verified"];
    const html = groups.map((g) => {
      const fs = advSpec.filter((f) => f.g === g);
      if (!advOrig[g]) {
        return g === "beauty" ? `<div class="card"><h3>${ADV_TITLES[g]}</h3><div class="muted small">Sunucu henüz <code>config/service_prices.beauty</code> ayarını döndürmüyor; sunucu güncellenince burada düzenlenebilir.</div></div>` : "";
      }
      let body = "";
      if (g === "live") {
        const qIds = [...new Set(fs.filter((f) => f.q).map((f) => f.q))];
        const sec = (title, kind) => `<h4 style="margin:10px 0 4px">${title}</h4>` + qIds.filter((q) => q.startsWith(kind + ".")).map((q) =>
          `<div class="sprow"><div class="row" style="align-items:flex-start"><b style="width:60px;padding-top:24px">${esc(q.split(".")[1].toUpperCase())}</b>${fs.filter((f) => f.q === q).map(advInput).join("")}</div></div>`).join("");
        body = sec("Görüntülü yayın kaliteleri", "video") + sec("Sesli oda kaliteleri", "audio") +
          `<h4 style="margin:10px 0 4px">Ön ödeme ve yayını öne çıkarma</h4><div class="row" style="align-items:flex-start">${fs.filter((f) => !f.q).map(advInput).join("")}</div>`;
      } else {
        body = `<div class="row" style="align-items:flex-start">${fs.map(advInput).join("")}</div>`;
      }
      const desc = {
        hon: "Üye her gün (Türkiye saatiyle) bu kadar fotoğrafı ücretsiz ekler; fazlası ek fotoğraf ücretiyle. Ek fotoğraf fiyatı “hot_or_not” hizmet fiyatıyla eşitlenir.",
        beauty: "Güzellik filtresinin günlük ücretsiz kullanım sayısı.",
        live: "Yayın saniye başı ücretlendirilir (en fazla 2 ondalık). Kapalı kalite yayın açarken seçilemez.",
        now_boost: "Şimdi HADİ! çağrısını saniye başı ücretle öne çıkarma.",
        verified: "Mavi tik haftalık aboneliği (HP). Kurucular ve resmi hesap ücret ödemez. Haklar haftalık (Pazartesi, Türkiye saati) ve günlük sayılır. Yakın arkadaş sınırında 0 = sınırsız; Temel ≤ Premium ≤ Doğrulanmış olmalı.",
      }[g];
      return `<div class="card" data-advg="${g}"><h3>${ADV_TITLES[g]} <span class="muted small">${g}</span></h3><div class="muted small" style="margin-bottom:8px">${desc}</div>${body}</div>`;
    }).join("");
    $("#spAdv").innerHTML = html;
    $$("#spAdv [data-adv]").forEach((inp) => {
      inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
        advVal[inp.dataset.adv] = inp.type === "checkbox" ? inp.checked : inp.value;
        advState();
      });
    });
    advState();
  }
  const advDirtyGroups = () => [...new Set(advSpec.filter((f) => advDirtyKey(advKey(f))).map((f) => f.g))];
  function advState() {
    let bad = 0;
    const dg = advDirtyGroups();
    for (const f of advSpec) {
      const k = advKey(f), err = advErr(f);
      if (err && dg.includes(f.g)) bad++;
      const h = document.querySelector(`[data-advh="${CSS.escape(k)}"]`), e = document.querySelector(`[data-adve="${CSS.escape(k)}"]`);
      const inp = document.querySelector(`[data-adv="${CSS.escape(k)}"]`);
      if (h) h.textContent = advHelp(f);
      if (e) e.textContent = err;
      if (inp && inp.type !== "checkbox") inp.style.borderColor = err ? "#d64545" : advDirtyKey(k) ? "var(--h)" : "";
    }
    const dirty = advDirtyGroups();
    $$("#spAdv [data-advg]").forEach((c) => c.classList.toggle("dirty", dirty.includes(c.dataset.advg)));
    $("#spAdvBar").classList.toggle("hide", !dirty.length);
    $("#spAdvText").textContent = bad ? "Hatalı alanları düzelt" : "Kaydedilmedi: " + dirty.map((g) => ADV_TITLES[g]).join(", ");
    $("#spAdvText").style.color = bad ? "#d64545" : "";
    $("#spAdvSave").disabled = !!bad;
  }
  async function loadAdv() {
    advNote("");
    try {
      const d = await call("servicePricing", { op: "adminList" });
      advOrig = {};
      for (const g of ["hon", "beauty", "live", "now_boost", "verified"]) if (d[g] && typeof d[g] === "object") advOrig[g] = JSON.parse(JSON.stringify(d[g]));
      advSpec = advBuildSpec();
      advVal = {};
      for (const f of advSpec) {
        const v = getPath(advOrig[f.g], f.path);
        advVal[advKey(f)] = advFmt(f, f.help === "cf" && v == null ? 0 : v);
      }
      advVal0 = { ...advVal };
      drawAdv();
    } catch (e) {
      $("#spAdv").innerHTML = "";
      advNote("Ayarlar yüklenemedi: " + errText(e), "err");
    }
  }
  function advPayload(g) {
    const out = JSON.parse(JSON.stringify(advOrig[g]));
    for (const f of advSpec.filter((x) => x.g === g)) {
      let cur = out;
      for (const p of f.path.slice(0, -1)) cur = cur[p] && typeof cur[p] === "object" ? cur[p] : (cur[p] = {});
      cur[f.path[f.path.length - 1]] = advParse(f, advVal[advKey(f)]);
    }
    if (g === "verified" && out.closeFriends) {
      for (const k of ["basic", "premium", "verified"]) if (out.closeFriends[k] === 0) out.closeFriends[k] = null;
    }
    if (g === "live") {
      for (const kind of ["video", "audio"]) {
        const qs = getPath(out, [kind, "qualities"]) || {};
        for (const q of Object.values(qs)) for (const k of Object.keys(q)) if (!LQ_KEYS.includes(k)) delete q[k];
      }
    }
    return out;
  }
  $("#spAdvDiscard").onclick = () => {
    advVal = { ...advVal0 };
    drawAdv();
  };
  $("#spAdvSave").onclick = async () => {
    const groups = advDirtyGroups();
    if (!groups.length) return;
    const bad = advSpec.filter((f) => groups.includes(f.g) && advErr(f));
    if (bad.length) return advNote("Hatalı alanlar var: " + bad.map((f) => ADV_TITLES[f.g] + " › " + f.label).join(", "), "err");
    const data = { op: "adminSet" };
    for (const g of groups) data[g] = advPayload(g);
    const b = $("#spAdvSave");
    b.disabled = true;
    b.textContent = "Kaydediliyor…";
    try {
      const r = await call("servicePricing", data);
      const changed = Array.isArray(r && r.changed) ? r.changed : groups;
      const ignored = groups.filter((g) => !changed.includes(g));
      advVal0 = { ...advVal };
      await loadAdv();
      if (!spOrder.some(spDirty)) await loadPrices();
      advNote(ignored.length ? "Sunucu şu bölümleri değiştirmedi (değer aynı ya da alan henüz tanınmıyor): " + ignored.map((g) => ADV_TITLES[g]).join(", ") : "Kaydedildi: " + groups.map((g) => ADV_TITLES[g]).join(", "), ignored.length ? "err" : "ok");
    } catch (e) {
      advNote("Kaydedilemedi: " + errText(e), "err");
    } finally {
      b.textContent = "Kaydet";
      advState();
    }
  };
  window.addEventListener("beforeunload", (e) => {
    if (spOrder.some(spDirty) || advKeys().some(advDirtyKey)) e.preventDefault();
  });

  // ------------------------------------------------------------------ üye etkinlikleri (memberEvents: adminList / approve / reject / suggestionStatus)
  const ME_STATUS = { pending: "Onay bekliyor", approved: "Onaylandı", rejected: "Reddedildi", withdrawn: "Geri çekildi" };
  const SG_STATUS = { new: "Yeni", reviewing: "İnceleniyor", accepted: "Kabul edildi", done: "Etkinlik oldu", declined: "Şimdilik değil" };
  const meNote = (text, kind) => {
    const el = $("#meOut");
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const meDate = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const meWho = (x) => (x.username ? "@" + x.username : x.name || x.uid || "—");
  function meDraftHtml(x, actions) {
    return `<div class="sprow" data-me="${esc(x.id)}">
      <div class="sphead">
        ${x.coverUrl ? `<img src="${esc(x.coverUrl)}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:10px">` : ""}
        <div style="flex:1;min-width:220px">
          <b>${esc(x.title)}</b> <span class="pill">${esc(ME_STATUS[x.status] || x.status)}</span>
          <div class="small muted">${esc(meWho(x))} · ${esc(x.category)} · ${esc(meDate(x.startAt))}${x.city ? " · " + esc(x.city) : ""} · ${esc(x.capacity)} kişi</div>
          <div class="small muted">${esc([x.venueName, x.address].filter(Boolean).join(" — "))}</div>
          <div class="small" style="margin-top:6px;white-space:pre-wrap">${esc(x.description)}</div>
          ${(x.advantages || []).length ? `<div class="small" style="margin-top:4px">✅ ${(x.advantages || []).map(esc).join(" · ")}</div>` : ""}
          ${(x.challenges || []).length ? `<div class="small">⚠️ ${(x.challenges || []).map(esc).join(" · ")}</div>` : ""}
          ${x.rejectReason ? `<div class="small" style="color:#a62f2f;margin-top:4px">Gerekçe: ${esc(x.rejectReason)}</div>` : ""}
          ${x.eventId ? `<div class="small muted">Etkinlik: ${esc(x.eventId)}</div>` : ""}
        </div>
        <div class="row">${actions}</div>
      </div>
    </div>`;
  }
  async function loadMemberEvents() {
    meNote("");
    $("#mePending").innerHTML = '<div class="note">Yükleniyor…</div>';
    try {
      const d = await call("memberEvents", { op: "adminList" });
      const pending = d.pending || [], sugg = d.suggestions || [], recent = d.recent || [];
      $("#mePending").innerHTML = pending.length
        ? pending.map((x) => meDraftHtml(x, `<button class="btn" data-ap="${esc(x.id)}">Onayla</button><button class="btn red" data-rj="${esc(x.id)}">Reddet</button>`)).join("")
        : '<div class="muted small">Onay bekleyen üye etkinliği yok.</div>';
      $("#meRecent").innerHTML = recent.length ? recent.map((x) => meDraftHtml(x, "")).join("") : '<div class="muted small">Henüz karar yok.</div>';
      $("#meSugg").innerHTML = sugg.length
        ? sugg.map((x) => `<div class="sprow"><div class="sphead"><div style="flex:1;min-width:220px">
            <b>${esc(x.title)}</b> ${x.candidate ? '<span class="pill">Üye adayı</span>' : ""} ${x.volunteer ? '<span class="pill on">Ev sahibi olmaya gönüllü</span>' : ""}
            <div class="small muted">${esc(x.name || x.uid || "—")} · ${esc(x.category || "—")} · ${esc(meDate(x.createdAt))}</div>
            <div class="small" style="margin-top:4px;white-space:pre-wrap">${esc(x.description)}</div>
            ${x.note ? `<div class="small muted">Not: ${esc(x.note)}</div>` : ""}
          </div>
          <select data-sg="${esc(x.id)}" data-cur="${esc(x.status)}" style="width:170px">${Object.entries(SG_STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${v}</option>`).join("")}</select>
          </div></div>`).join("")
        : '<div class="muted small">Henüz öneri yok.</div>';
      $$("#mePending [data-ap]").forEach((b) => (b.onclick = () => meApprove(b.dataset.ap, pending.find((x) => x.id === b.dataset.ap))));
      $$("#mePending [data-rj]").forEach((b) => (b.onclick = () => meReject(b.dataset.rj)));
      $$("#meSugg [data-sg]").forEach((sel) => (sel.onchange = () => meSugg(sel)));
    } catch (e) {
      $("#mePending").innerHTML = "";
      meNote("Yüklenemedi: " + errText(e), "err");
    }
  }
  async function meApprove(id, x) {
    if (!confirm(`“${x ? x.title : id}” yayımlansın mı?\n\n“Üye etkinliği · ${x ? meWho(x) : ""}” etiketiyle tüm üyelere görünür; üyeye bildirim gider.`)) return;
    try {
      const r = await call("memberEvents", { op: "approve", id });
      meNote("Yayımlandı (etkinlik " + (r.eventId || "") + ").", "ok");
      await loadMemberEvents();
    } catch (e) {
      meNote("Onaylanamadı: " + errText(e), "err");
    }
  }
  async function meReject(id) {
    const reason = prompt("Ret gerekçesi (üyeye iletilir):", "");
    if (reason == null) return;
    if (reason.trim().length < 3) return meNote("Gerekçe en az 3 karakter olmalı.", "err");
    try {
      await call("memberEvents", { op: "reject", id, reason: reason.trim() });
      meNote("Reddedildi; üyeye bildirildi.", "ok");
      await loadMemberEvents();
    } catch (e) {
      meNote("Reddedilemedi: " + errText(e), "err");
    }
  }
  async function meSugg(sel) {
    const status = sel.value;
    const note = status === "accepted" || status === "declined" ? prompt("Üyeye not (isteğe bağlı):", "") : "";
    if (note == null) {
      sel.value = sel.dataset.cur;
      return;
    }
    try {
      await call("memberEvents", { op: "suggestionStatus", id: sel.dataset.sg, status, note: note.trim() });
      sel.dataset.cur = status;
      meNote("Öneri güncellendi.", "ok");
    } catch (e) {
      sel.value = sel.dataset.cur;
      meNote("Güncellenemedi: " + errText(e), "err");
    }
  }
  $("#meReload").onclick = () => loadMemberEvents();
  // ------------------------------------------------------------------ roller (rolesAdmin, surface: panel; kurucu rolleri panelde hiç listelenmez)
  const ROLE_COLORS = ["#F2801F", "#1D9AD6", "#78BE3A", "#A3338C", "#E0407A", "#D9A93A", "#17344F", "#2BB5A0", "#7A5AF8", "#D64545", "#6B7F92", "#8D6E63"];
  const ROLE_EMOJIS = ["⭐", "👑", "🛡️", "💬", "🎟️", "🛋️", "🙌", "🎤", "📣", "🧭", "🎨", "📸", "🎮", "🏅", "💡", "🔥", "🌟", "🤝", "🎧", "🧩"];
  const SCOPE_KINDS = { channel: "Kanal", group: "Grup", lobby: "Bekleme Salonu" }; // kapsam: tür_kimlik, "*" = her yerde
  let roles = [], roleCaps = [], roleSel = null, roleColor = ROLE_COLORS[1], roleScopeOpts = null, roleScopeSel = new Set();
  const roleNote = (sel, m, kind) => {
    const n = $(sel);
    if (!m) return n.classList.add("hide");
    n.textContent = m;
    n.className = "note " + (kind || "");
  };
  const roleById = (id) => roles.find((r) => r.id === id);
  // Kurucu rolleri panelde hiç görünmez (sunucu da surface: "panel" için süzer); yalnızca uygulamadaki gizli menüde.
  const FOUNDER_ROLE_IDS = ["kurucu", "gecici_kurucu"];
  const fsdb = () => (firebase.firestore ? firebase.firestore() : null);

  async function loadRoles(keepSel) {
    roleNote("#roleListMsg", "");
    try {
      const d = await call("rolesAdmin", { surface: "panel", op: "list" });
      roles = (d.roles || []).filter((r) => !FOUNDER_ROLE_IDS.includes(r.id)).sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100) || String(a.name).localeCompare(String(b.name), "tr"));
      roleCaps = d.capabilities || [];
      drawRoles();
      if (keepSel && roleSel && roleById(roleSel)) openRole(roleSel);
    } catch (e) {
      $("#roleList").innerHTML = "";
      roleNote("#roleListMsg", "Roller yüklenemedi: " + errText(e), "err");
    }
  }
  function drawRoles() {
    $("#roleList").innerHTML = roles.length
      ? roles.map((r, i) => `<div class="botrow ${r.id === roleSel ? "sel" : ""}" data-role="${esc(r.id)}">
          <span class="em">${esc(r.emoji || "⭐")}</span>
          <div><b>${esc(r.name)}</b> <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(/^#[0-9a-f]{6}$/i.test(r.color || "") ? r.color : "#1D9AD6")}"></span>
            ${r.system ? ' <span title="Sistem rolü">🔒</span>' : ""}${r.visible === false ? ' <span class="pill">gizli</span>' : ""}${r.scoped ? ' <span class="pill">kapsamlı</span>' : ""}
            <p>${r.memberCount != null ? fmt(r.memberCount) + " üye · " : ""}${(r.capabilities || []).length} yetki${r.description ? " · " + esc(r.description) : ""}</p></div>
          <button class="btn ghost" data-up="${i}" ${i === 0 ? "disabled" : ""} title="Yukarı" style="padding:4px 9px">↑</button>
          <button class="btn ghost" data-down="${i}" ${i === roles.length - 1 ? "disabled" : ""} title="Aşağı" style="padding:4px 9px">↓</button>
        </div>`).join("")
      : '<p class="muted small">Henüz rol yok.</p>';
    $$("#roleList [data-role]").forEach((row) => (row.onclick = (ev) => {
      if (ev.target.closest("button")) return;
      openRole(row.dataset.role);
    }));
    $$("#roleList [data-up]").forEach((b) => (b.onclick = () => moveRole(+b.dataset.up, -1)));
    $$("#roleList [data-down]").forEach((b) => (b.onclick = () => moveRole(+b.dataset.down, 1)));
  }
  // Büyük öncelik önce gelir (sunucu ile aynı).
  async function moveRole(i, d) {
    const j = i + d;
    if (j < 0 || j >= roles.length) return;
    if (FOUNDER_ROLE_IDS.includes(roles[i].id) || FOUNDER_ROLE_IDS.includes(roles[j].id)) return roleNote("#roleListMsg", "Kurucu rollerinin sırası sabittir.", "err");
    const list = roles.slice();
    [list[i], list[j]] = [list[j], list[i]];
    // İki rolün önceliklerini değiştir; eşitse aşağı inen bir eksilir.
    let pi = list[i].priority ?? 100, pj = list[j].priority ?? 100;
    [pi, pj] = [pj, pi];
    const top = Math.min(i, j), bot = Math.max(i, j);
    const pr = { [list[top].id]: Math.max(pi, pj), [list[bot].id]: Math.min(pi, pj) };
    if (pr[list[top].id] === pr[list[bot].id]) pr[list[bot].id] = Math.max(0, pr[list[bot].id] - 1);
    const changed = list.filter((r) => pr[r.id] != null && pr[r.id] !== r.priority).map((r) => ({ ...r, priority: pr[r.id] }));
    roles = list.map((r) => changed.find((c) => c.id === r.id) || r);
    drawRoles();
    try {
      for (const r of changed) await call("rolesAdmin", { surface: "panel", op: "upsert", role: roleBody(r) });
      roleNote("#roleListMsg", "Sıralama kaydedildi.", "ok");
    } catch (e) {
      roleNote("#roleListMsg", "Sıralama kaydedilemedi: " + errText(e), "err");
    }
    await loadRoles(true);
  }
  const roleBody = (r) => ({
    ...(r.id ? { id: r.id } : {}),
    name: r.name, emoji: r.emoji, color: r.color, description: r.description || "",
    capabilities: r.capabilities || [], priority: r.priority ?? 100, visible: r.visible !== false, scoped: r.scoped === true,
  });
  function drawRoleColors() {
    $("#roleColors").innerHTML = ROLE_COLORS.map((c) => `<span class="pick ${c.toUpperCase() === String(roleColor).toUpperCase() ? "on" : ""}" data-col="${c}" style="padding:4px"><i style="display:block;width:22px;height:22px;border-radius:50%;background:${c}"></i></span>`).join("");
    $$("#roleColors [data-col]").forEach((b) => (b.onclick = () => {
      roleColor = b.dataset.col;
      drawRoleColors();
    }));
  }
  function openRole(id) {
    const r = id ? roleById(id) : null;
    roleSel = r ? r.id : null;
    drawRoles();
    $("#roleEditEmpty").classList.add("hide");
    $("#roleForm").classList.remove("hide");
    roleNote("#roleFormMsg", "");
    $("#roleFormTitle").textContent = r ? `${r.emoji || ""} ${r.name}` : "Yeni rol";
    $("#roleSystem").classList.toggle("hide", !(r && r.system));
    $("#roleDelete").classList.toggle("hide", !r || !!r.system);
    $("#roleEmoji").value = r ? r.emoji || "⭐" : "⭐";
    $("#roleName").value = r ? r.name : "";
    $("#roleDesc").value = r ? r.description || "" : "";
    $("#roleVisible").checked = r ? r.visible !== false : true;
    $("#roleScoped").checked = r ? r.scoped === true : false;
    roleColor = r && /^#[0-9a-f]{6}$/i.test(r.color || "") ? r.color : ROLE_COLORS[1];
    drawRoleColors();
    $("#roleEmojiPicks").innerHTML = ROLE_EMOJIS.map((e) => `<span class="pick" data-em="${e}">${e}</span>`).join("");
    $$("#roleEmojiPicks [data-em]").forEach((b) => (b.onclick = () => ($("#roleEmoji").value = b.dataset.em)));
    const have = new Set(r ? r.capabilities || [] : []);
    const groups = {};
    roleCaps.forEach((c) => (groups[c.group || "Diğer"] = groups[c.group || "Diğer"] || []).push(c));
    $("#roleCaps").innerHTML = Object.entries(groups).map(([g, cs]) => `<div style="margin-top:8px"><div class="small muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.03em">${esc(g)}</div>` +
      cs.map((c) => `<label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;margin:6px 0"><input type="checkbox" data-cap="${esc(c.id)}" ${have.has(c.id) ? "checked" : ""} style="width:auto;margin-top:3px"><span><b>${esc(c.label || c.id)}</b>${c.desc || c.description ? `<br><span class="muted small">${esc(c.desc || c.description)}</span>` : ""}</span></label>`).join("") + "</div>").join("") ||
      '<p class="muted small">Sunucu yetki listesi göndermedi.</p>';
    // Bilinmeyen (listede olmayan) yetkiler korunur
    $("#roleCaps").dataset.extra = JSON.stringify([...have].filter((x) => !roleCaps.some((c) => c.id === x)));
    $("#roleMembersCard").classList.toggle("hide", !r);
    if (r) loadRoleMembers();
  }
  $("#roleNew").onclick = () => openRole(null);
  $("#roleSave").onclick = async () => {
    const name = $("#roleName").value.trim();
    if (name.length < 2) return roleNote("#roleFormMsg", "Rol adı en az 2 harf olmalı.", "err");
    const old = roleSel ? roleById(roleSel) : null;
    let extra = [];
    try { extra = JSON.parse($("#roleCaps").dataset.extra || "[]"); } catch (_) { extra = []; }
    const role = {
      id: old ? old.id : undefined,
      name, emoji: $("#roleEmoji").value.trim() || "⭐", color: roleColor, description: $("#roleDesc").value.trim(),
      capabilities: [...$$("#roleCaps [data-cap]").filter((x) => x.checked).map((x) => x.dataset.cap), ...extra],
      priority: old ? old.priority ?? 100 : Math.max(0, roles.reduce((m, r) => Math.min(m, r.priority ?? 100), 110) - 10),
      visible: $("#roleVisible").checked, scoped: $("#roleScoped").checked,
    };
    $("#roleSave").disabled = true;
    try {
      const d = await call("rolesAdmin", { surface: "panel", op: "upsert", role: roleBody(role) });
      roleSel = (d && (d.id || d.roleId || (d.role && d.role.id))) || roleSel;
      roleNote("#roleFormMsg", "Kaydedildi.", "ok");
      await loadRoles(true);
    } catch (e) {
      roleNote("#roleFormMsg", "Kaydedilemedi: " + errText(e), "err");
    } finally {
      $("#roleSave").disabled = false;
    }
  };
  $("#roleDelete").onclick = async () => {
    const r = roleSel && roleById(roleSel);
    if (!r || r.system) return;
    if (!confirm(`${r.emoji || ""} ${r.name} silinsin mi?\n\nRol tüm sahiplerinden kaldırılır, yetkileri hemen düşer.`)) return;
    try {
      await call("rolesAdmin", { surface: "panel", op: "delete", roleId: r.id });
      roleSel = null;
      $("#roleForm").classList.add("hide");
      $("#roleMembersCard").classList.add("hide");
      $("#roleEditEmpty").classList.remove("hide");
      roleNote("#roleListMsg", "Rol silindi.", "ok");
      await loadRoles();
    } catch (e) {
      roleNote("#roleFormMsg", "Silinemedi: " + errText(e), "err");
    }
  };

  // Kapsam seçenekleri: kanallar (chats type=channel), gruplar (communities), Bekleme Salonu odaları (cand rooms)
  async function loadScopeOpts() {
    if (roleScopeOpts) return roleScopeOpts;
    const o = { channel: [], group: [], lobby: [] };
    const db = fsdb();
    if (db) {
      try {
        const s = await db.collection("chats").where("type", "==", "channel").limit(200).get();
        s.forEach((d) => o.channel.push([`channel_${d.id}`, `${d.data().emoji || "#"} ${d.data().title || "Kanal"}`]));
      } catch (_) {}
      try {
        const s = await db.collection("communities").orderBy("memberCount", "desc").limit(100).get();
        s.forEach((d) => o.group.push([`group_${d.id}`, `${d.data().emoji || "✨"} ${d.data().name || "Grup"}`]));
      } catch (_) {}
    }
    try {
      const r = await call("cand", { op: "rooms" });
      ((r && r.items) || []).forEach((x) => x.room && o.lobby.push([`lobby_${x.room}`, `🛋️ ${x.name || x.room}`]));
    } catch (_) {}
    roleScopeOpts = o;
    return o;
  }
  const scopeLabel = (s) => {
    if (s === "*") return "Her yerde";
    const k = String(s).split("_")[0];
    const hit = roleScopeOpts && (roleScopeOpts[k] || []).find((x) => x[0] === s);
    return hit ? hit[1] : `${SCOPE_KINDS[k] || "Kapsam"} · ${String(s).slice(k.length + 1)}`;
  };
  async function drawScopePicks() {
    const r = roleSel && roleById(roleSel);
    $("#roleScopeBox").classList.toggle("hide", !(r && r.scoped));
    if (!(r && r.scoped)) return;
    $("#roleScopePicks").innerHTML = '<span class="muted small">Yükleniyor…</span>';
    const o = await loadScopeOpts();
    $("#roleScopePicks").innerHTML = Object.entries(SCOPE_KINDS).map(([k, t]) =>
      `<div style="width:100%"><div class="small muted" style="font-weight:700;margin-top:6px">${esc(t)}</div><div class="chips">` +
      ((o[k] || []).map(([id, label]) => `<span class="pick ${roleScopeSel.has(id) ? "on" : ""}" data-sc="${esc(id)}">${esc(label)}</span>`).join("") || '<span class="muted small">Seçenek yok</span>') +
      "</div></div>").join("");
    $$("#roleScopePicks [data-sc]").forEach((b) => (b.onclick = () => {
      roleScopeSel.has(b.dataset.sc) ? roleScopeSel.delete(b.dataset.sc) : roleScopeSel.add(b.dataset.sc);
      b.classList.toggle("on");
    }));
  }

  async function loadRoleMembers() {
    const r = roleSel && roleById(roleSel);
    if (!r) return;
    $("#roleMembersTitle").textContent = `${r.emoji || ""} ${r.name} · üyeler`;
    $("#roleUserResults").innerHTML = "";
    roleScopeSel = new Set();
    roleNote("#roleMembersMsg", "");
    drawScopePicks();
    $("#roleMembers").innerHTML = '<p class="muted small">Yükleniyor…</p>';
    try {
      const d = await call("rolesAdmin", { surface: "panel", op: "members", roleId: r.id });
      const list = Array.isArray(d) ? d : d.members || d.items || [];
      if (r.scoped) await loadScopeOpts();
      $("#roleMembers").innerHTML = list.length
        ? list.map((m) => `<div class="hist"><div><b>${esc(m.name || "Üye")}</b> <span class="muted small">${m.username ? "@" + esc(m.username) : esc(m.uid)}</span>
            ${r.scoped ? `<p>${(m.scopes || []).filter((s) => s !== "*").length ? (m.scopes || []).filter((s) => s !== "*").map((s) => `<span class="pill">${esc(scopeLabel(s))}</span>`).join(" ") : "Her yerde"}</p>` : ""}</div>
            <button class="btn ghost" data-rm="${esc(m.uid)}" data-nm="${esc(m.name || "")}">Çıkar</button></div>`).join("")
        : '<p class="muted small">Bu rolde henüz kimse yok.</p>';
      $$("#roleMembers [data-rm]").forEach((b) => (b.onclick = async () => {
        const reason = $("#roleReason").value.trim();
        if (reason.length < 10) return roleNote("#roleMembersMsg", "Rolü kaldırmak için önce en az 10 karakterlik bir gerekçe yaz.", "err");
        if (!confirm(`${b.dataset.nm || "Üye"} bu rolden çıkarılsın mı?`)) return;
        try {
          await call("rolesAdmin", { surface: "panel", op: "unassign", uid: b.dataset.rm, roleId: r.id, reason });
          $("#roleReason").value = "";
          loadRoleAudit();
          roleNote("#roleMembersMsg", "Rol kaldırıldı.", "ok");
          await loadRoleMembers();
          loadRoles(true);
        } catch (e) {
          roleNote("#roleMembersMsg", "Kaldırılamadı: " + errText(e), "err");
        }
      }));
    } catch (e) {
      $("#roleMembers").innerHTML = "";
      roleNote("#roleMembersMsg", "Üyeler yüklenemedi: " + errText(e), "err");
    }
  }

  // Üye arama: @kullanıcıadı (users.username öneki) ya da doğrudan uid
  async function findRoleUser() {
    const raw = $("#roleUserQ").value.trim();
    if (!raw) return;
    const out = $("#roleUserResults");
    out.innerHTML = '<p class="muted small">Aranıyor…</p>';
    const found = [];
    const db = fsdb();
    try {
      if (db) {
        const h = raw.replace(/^@/, "").toLowerCase();
        if (h.length >= 2) {
          const s = await db.collection("users").orderBy("username").startAt(h).endAt(h + "").limit(10).get();
          s.forEach((d) => found.push({ uid: d.id, name: `${d.data().firstName || ""} ${d.data().lastName || ""}`.trim() || "Üye", username: d.data().username }));
        }
        if (!found.length && !raw.startsWith("@") && raw.length >= 20) {
          const d = await db.collection("users").doc(raw).get();
          if (d.exists) found.push({ uid: d.id, name: `${d.data().firstName || ""} ${d.data().lastName || ""}`.trim() || "Üye", username: d.data().username });
        }
      } else if (!raw.startsWith("@")) {
        found.push({ uid: raw, name: raw });
      }
    } catch (e) {
      out.innerHTML = "";
      return roleNote("#roleMembersMsg", "Arama yapılamadı: " + errText(e), "err");
    }
    out.innerHTML = found.length
      ? found.map((u) => `<div class="hist"><div><b>${esc(u.name)}</b> <span class="muted small">${u.username ? "@" + esc(u.username) : esc(u.uid)}</span></div><button class="btn" data-as="${esc(u.uid)}" data-nm="${esc(u.name)}">Rolü ver</button></div>`).join("")
      : '<p class="muted small">Üye bulunamadı.</p>';
    $$("#roleUserResults [data-as]").forEach((b) => (b.onclick = () => assignRole(b.dataset.as, b.dataset.nm)));
  }
  async function assignRole(uid, name) {
    const r = roleSel && roleById(roleSel);
    if (!r) return;
    const reason = $("#roleReason").value.trim();
    if (reason.length < 10) return roleNote("#roleMembersMsg", "Rol vermek için önce en az 10 karakterlik bir gerekçe yaz.", "err");
    const data = { surface: "panel", op: "assign", uid, roleId: r.id, reason };
    if (r.scoped) data.scopes = [...roleScopeSel];
    try {
      await call("rolesAdmin", data);
      $("#roleReason").value = "";
      loadRoleAudit();
      roleNote("#roleMembersMsg", `${name || "Üye"}: ${r.emoji || ""} ${r.name} verildi.`, "ok");
      $("#roleUserQ").value = "";
      await loadRoleMembers();
      loadRoles(true);
    } catch (e) {
      roleNote("#roleMembersMsg", "Verilemedi: " + errText(e), "err");
    }
  }
  // Rol geçmişi: kim, kime, hangi rolü, ne zaman, neden (kurucu kayıtları panelde hiç görünmez).
  const ROLE_VERB = {
    "role.assign": "Rol verdi", "role.unassign": "Rolü kaldırdı", "role.scopes": "Kapsamı değiştirdi", "role.create": "Rol oluşturdu",
    "role.update": "Rolü düzenledi", "role.delete": "Rolü sildi", "role.set": "Yönetim rolünü değiştirdi",
  };
  async function loadRoleAudit() {
    const out = $("#roleAudit");
    if (!out) return;
    out.innerHTML = '<p class="muted small">Yükleniyor…</p>';
    try {
      const uid = $("#roleAuditUid").value.trim();
      const d = await call("rolesAdmin", { surface: "panel", op: "audit", ...(uid ? { uid } : {}) });
      table(out, [
        { t: "Tarih", k: "at", f: (x) => esc(x.at ? new Date(x.at).toLocaleString("tr-TR") : "") },
        { t: "Yapan", k: "byName", f: (x) => esc(x.byName || x.byUid || "") },
        { t: "İşlem", k: "action", f: (x) => esc(ROLE_VERB[x.action] || x.action) },
        { t: "Üye", k: "targetName", f: (x) => esc(x.targetName || x.targetUid || "–") },
        { t: "Rol", k: "roleName", f: (x) => esc(x.roleName || x.roleId || "") },
        { t: "Gerekçe", k: "reason", f: (x) => esc(x.reason || "") },
      ], d.items || []);
    } catch (e) {
      out.innerHTML = "";
      roleNote("#roleMembersMsg", "Rol geçmişi yüklenemedi: " + errText(e), "err");
    }
  }
  $("#roleAuditLoad").onclick = () => loadRoleAudit();
  $("#roleUserFind").onclick = () => findRoleUser();
  $("#roleUserQ").onkeydown = (e) => {
    if (e.key === "Enter") findRoleUser();
  };

  // ------------------------------------------------------------------ Ekonomi (economyAdmin: hoş geldin HP'si, HP yükle/düş)
  let ecoPick = null;
  const ecoNote = (sel, m, kind) => {
    const n = $(sel);
    if (!m) return n.classList.add("hide");
    n.textContent = m;
    n.className = "note " + (kind || "");
  };
  const ecoDate = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR") : "–");
  async function loadEconomy() {
    ecoNote("#ecoWelcomeOut", "");
    try {
      const r = await call("economyAdmin", { op: "get" });
      $("#ecoWelcome").value = r.welcomeHp;
      $("#ecoWelcomeP").value = r.welcomePurchasedHp ?? 100;
      $("#ecoRefPct").value = r.referralRewardPct ?? 5;
      // Hoş geldin HP'si ve davet ödülü yalnızca ana kurucu (sunucu da denetler); HP yükleme kurucular.
      for (const id of ["#ecoWelcome", "#ecoWelcomeP", "#ecoWelcomeSave", "#ecoRefPct", "#ecoRefSave"]) $(id).disabled = !r.canEditWelcome;
      $("#ecoGrant").disabled = !r.canEdit;
      $("#clBackfill").classList.toggle("hide", !r.canEdit);
      $("#ecoWelcomeMeta").textContent = `Varsayılan: ${r.defaults.welcomeHp} hediye + ${r.defaults.welcomePurchasedHp ?? 100} yatırılmış HP · Şu an toplam ${fmt(r.welcomeTotal ?? r.welcomeHp)} HP` + (r.updatedAt ? ` · Son değişiklik: ${ecoDate(r.updatedAt)}` : "") + (r.canEdit ? "" : " · Değiştirmek için kurucu olmalısın.");
    } catch (e) {
      ecoNote("#ecoWelcomeOut", "Okunamadı: " + errText(e), "err");
    }
    loadEcoHistory();
    loadCreditLog(false);
  }
  async function loadEcoHistory() {
    const el = $("#ecoHistory");
    try {
      const r = await call("economyAdmin", { op: "history", limit: 50 });
      el.innerHTML = r.items.length
        ? `<table><thead><tr><th>Tarih</th><th>Üye</th><th>Tutar</th><th>Açıklama</th><th>Yapan</th><th>Sonraki bakiye</th></tr></thead><tbody>${r.items
            .map((g) => `<tr><td>${esc(ecoDate(g.at))}</td><td>${esc(g.name || g.uid)}</td><td style="font-weight:800;color:${g.amount > 0 ? "#1f8a4c" : "#c0392b"}">${g.amount > 0 ? "+" : ""}${fmt(g.amount)} HP${g.wallet ? `<div class="muted small">${g.wallet === "purchased" ? "yatırılmış" : "hediye"}</div>` : ""}</td><td>${esc(g.reason)}</td><td>${esc(g.byName || g.by)}</td><td>${g.balanceAfter == null ? "–" : fmt(g.balanceAfter) + " HP"}</td></tr>`)
            .join("")}</tbody></table>`
        : '<p class="muted small">Henüz HP yüklemesi yok.</p>';
    } catch (e) {
      el.innerHTML = `<p class="muted small">Okunamadı: ${esc(errText(e))}</p>`;
    }
  }
  $("#ecoWelcomeSave").onclick = async () => {
    const v = Number($("#ecoWelcome").value);
    const vp = Number($("#ecoWelcomeP").value);
    if (![v, vp].every((x) => Number.isInteger(x) && x >= 0 && x <= 100000)) return ecoNote("#ecoWelcomeOut", "İki alan da 0–100000 arası tam sayı olmalı.", "err");
    try {
      await call("economyAdmin", { op: "set", welcomeHp: v, welcomePurchasedHp: vp });
      ecoNote("#ecoWelcomeOut", `Kaydedildi: yeni üyeler ${v} hediye + ${vp} yatırılmış = ${v + vp} HP ile başlayacak.`, "ok");
      toast("Hoş geldin HP'si kaydedildi");
    } catch (e) {
      ecoNote("#ecoWelcomeOut", "Kaydedilemedi: " + errText(e), "err");
    }
  };
  async function findEcoUser() {
    const raw = $("#ecoUserQ").value.trim();
    if (!raw) return;
    const out = $("#ecoUserResults");
    out.innerHTML = '<p class="muted small">Aranıyor…</p>';
    const found = [];
    const db = fsdb();
    const nm = (d) => `${d.data().firstName || ""} ${d.data().lastName || ""}`.trim() || "Üye";
    try {
      if (db) {
        const h = raw.replace(/^@/, "").toLowerCase();
        if (h.length >= 2) {
          const s = await db.collection("users").orderBy("username").startAt(h).endAt(h + "").limit(10).get();
          s.forEach((d) => found.push({ uid: d.id, name: nm(d), username: d.data().username }));
        }
        if (!found.length && !raw.startsWith("@") && raw.length >= 20) {
          const d = await db.collection("users").doc(raw).get();
          if (d.exists) found.push({ uid: d.id, name: nm(d), username: d.data().username });
        }
      } else if (!raw.startsWith("@")) {
        found.push({ uid: raw, name: raw });
      }
    } catch (e) {
      out.innerHTML = "";
      return ecoNote("#ecoGrantOut", "Arama yapılamadı: " + errText(e), "err");
    }
    out.innerHTML = found.length
      ? found.map((u) => `<div class="hist"><div><b>${esc(u.name)}</b> <span class="muted small">${u.username ? "@" + esc(u.username) : esc(u.uid)}</span></div><button class="btn ghost" data-eco="${esc(u.uid)}" data-nm="${esc(u.name)}">Seç</button></div>`).join("")
      : '<p class="muted small">Üye bulunamadı.</p>';
    $$("#ecoUserResults [data-eco]").forEach((b) => (b.onclick = () => {
      ecoPick = { uid: b.dataset.eco, name: b.dataset.nm };
      $("#ecoPicked").innerHTML = `Seçilen üye: <b>${esc(ecoPick.name)}</b> <span class="muted small">${esc(ecoPick.uid)}</span>`;
      out.innerHTML = "";
    }));
  }
  $("#ecoUserFind").onclick = () => findEcoUser();
  $("#ecoUserQ").onkeydown = (e) => {
    if (e.key === "Enter") findEcoUser();
  };
  $("#ecoRefSave").onclick = async () => {
    const v = Number($("#ecoRefPct").value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return ecoNote("#ecoRefOut", "Oran 0–100 arası olmalı.", "err");
    try {
      await call("economyAdmin", { op: "set", referralRewardPct: v });
      ecoNote("#ecoRefOut", `Kaydedildi: davet ödülü %${v}.`, "ok");
    } catch (e) {
      ecoNote("#ecoRefOut", "Kaydedilemedi: " + errText(e), "err");
    }
  };
  $("#ecoGrant").onclick = async () => {
    if (!ecoPick) return ecoNote("#ecoGrantOut", "Önce üye seç.", "err");
    const amount = Number($("#ecoAmount").value);
    const reason = $("#ecoReason").value.trim();
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) return ecoNote("#ecoGrantOut", "Tutar −100000…100000 arası, sıfırdan farklı tam sayı olmalı.", "err");
    const wallet = $("#ecoWallet").value;
    if (amount > 0 && !wallet) return ecoNote("#ecoGrantOut", "Yüklenecek HP türünü seç: Hediye HP ya da Yatırılmış HP.", "err");
    if (reason.length < 10) return ecoNote("#ecoGrantOut", "En az 10 karakterlik bir gerekçe yaz; kim, ne zaman ve neden kayda geçer.", "err");
    const verb = amount > 0 ? `${ecoPick.name} hesabına ${amount} ${wallet === "purchased" ? "yatırılmış" : "hediye"} HP yüklensin mi?` : `${ecoPick.name} hesabından ${-amount} HP düşülsün mü?`;
    if (!confirm(verb)) return;
    $("#ecoGrant").disabled = true;
    try {
      const requestId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
      const r = await call("economyAdmin", { op: "grant", uid: ecoPick.uid, amount, reason, requestId, ...(amount > 0 ? { wallet } : {}) });
      ecoNote("#ecoGrantOut", `${r.name || ecoPick.name}: ${amount > 0 ? "+" : ""}${amount} HP. Yeni bakiye: ${fmt(r.balance)} HP.`, "ok");
      $("#ecoAmount").value = "";
      $("#ecoReason").value = "";
      loadEcoHistory();
    } catch (e) {
      ecoNote("#ecoGrantOut", "Uygulanamadı: " + errText(e), "err");
    } finally {
      $("#ecoGrant").disabled = false;
    }
  };
  $("#ecoReload").onclick = () => loadEconomy();
  // ------------------------------------------------------------------ Canlı bilgi yarışmaları (funplay)
  const qzNote = (sel, msg, kind) => { const el = $(sel); el.textContent = msg; el.className = "note" + (kind ? " " + kind : ""); el.classList.toggle("hide", !msg); };
  const qzWhen = (ms) => new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
  let qzPackList = [];
  async function loadQuiz() {
    try {
      const [p, s] = await Promise.all([call("funplay", { op: "packList" }), call("funplay", { op: "showAdminList" })]);
      qzPackList = p.items || [];
      $("#qzPacks").innerHTML = qzPackList.length ? qzPackList.map((x) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0"><span><b>${esc(x.title)}</b> · ${fmt(x.count)} soru · ${esc(x.difficulty || "orta")} · ${x.status === "approved" ? "✅ onaylı" : "📝 taslak"}${x.ai ? " · AI" : ""}</span><button class="btn ghost" data-qzview="${esc(x.id)}">Gör</button></div>`).join("") : "Henüz paket yok.";
      $$("[data-qzview]").forEach((b) => (b.onclick = () => viewPack(b.dataset.qzview)));
      const approved = qzPackList.filter((x) => x.status === "approved");
      $("#qzShowPack").innerHTML = approved.length ? approved.map((x) => `<option value="${esc(x.id)}">${esc(x.title)} (${fmt(x.count)} soru)</option>`).join("") : '<option value="">Önce bir paketi onayla</option>';
      const shows = (s.items || []).filter((x) => !x.nightId);
      $("#qzShows").innerHTML = shows.length ? shows.map((x) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0"><span>${esc(x.emoji || "🎤")} <b>${esc(x.title)}</b> · ${esc(qzWhen(x.startsAt))} · ${fmt(x.count)} soru · ${fmt(x.players || 0)} katılımcı · ${esc(x.status)}</span>${x.status === "scheduled" && x.startsAt > Date.now() ? `<button class="btn ghost" data-qzcancel="${esc(x.id)}">İptal</button>` : ""}</div>`).join("") : "Planlı yarışma yok.";
      $$("[data-qzcancel]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Yarışma iptal edilsin mi?")) return;
        try { await call("funplay", { op: "showCancel", id: b.dataset.qzcancel }); loadQuiz(); } catch (e) { qzNote("#qzShowOut", "İptal edilemedi: " + errText(e), "err"); }
      }));
    } catch (e) {
      qzNote("#qzGenOut", "Okunamadı: " + errText(e), "err");
    }
  }
  async function viewPack(id) {
    try {
      const p = await call("funplay", { op: "packGet", id });
      const qs = p.questions || [];
      $("#qzPackView").innerHTML = `<div class="card" style="margin-top:10px"><h3>${esc(p.title)}</h3>${qs.map((q, i) => `<div style="margin:8px 0"><b>${i + 1}. ${esc(q.q)}</b><ol type="A" style="margin:4px 0 0 18px">${q.options.map((o, k) => `<li style="${k === q.answer ? "font-weight:800;color:#1f8a4c" : ""}">${esc(o)}${k === q.answer ? " ✓" : ""}</li>`).join("")}</ol>${q.explain ? `<div class="muted small">💡 ${esc(q.explain)}</div>` : ""}</div>`).join("")}<div class="row"><button class="btn" id="qzApprove">${p.status === "approved" ? "Onaylı" : "Kontrol ettim, onayla"}</button><button class="btn ghost" id="qzDraft">Taslağa al</button><button class="btn ghost" id="qzDel">Sil</button></div></div>`;
      const save = async (status) => {
        try { await call("funplay", { op: "packSave", id, title: p.title, topic: p.topic, difficulty: p.difficulty, status, questions: qs }); loadQuiz(); viewPack(id); } catch (e) { alert("Kaydedilemedi: " + errText(e)); }
      };
      $("#qzApprove").onclick = () => save("approved");
      $("#qzDraft").onclick = () => save("draft");
      $("#qzDel").onclick = async () => { if (!confirm("Paket silinsin mi?")) return; await call("funplay", { op: "packDelete", id }); $("#qzPackView").innerHTML = ""; loadQuiz(); };
    } catch (e) {
      qzNote("#qzGenOut", "Paket açılamadı: " + errText(e), "err");
    }
  }
  $("#qzGen").onclick = async () => {
    const topic = $("#qzTopic").value.trim();
    if (!topic) return qzNote("#qzGenOut", "Konu yaz.", "err");
    $("#qzGen").disabled = true;
    qzNote("#qzGenOut", "Sorular üretiliyor… (30 sn kadar sürebilir)");
    try {
      const r = await call("funplay", { op: "packGenerate", topic, count: Number($("#qzCount").value) || 10, difficulty: $("#qzLevel").value });
      qzNote("#qzGenOut", `Taslak hazır: ${r.questions.length} soru. Kontrol edip onayla.`, "ok");
      await loadQuiz();
      viewPack(r.id);
    } catch (e) {
      qzNote("#qzGenOut", "Üretilemedi: " + errText(e), "err");
    } finally {
      $("#qzGen").disabled = false;
    }
  };
  $("#qzShowSave").onclick = async () => {
    const packId = $("#qzShowPack").value;
    const at = $("#qzShowAt").value ? new Date($("#qzShowAt").value).getTime() : 0;
    if (!packId) return qzNote("#qzShowOut", "Onaylı paket seç.", "err");
    if (!at || at < Date.now() + 5 * 60000) return qzNote("#qzShowOut", "Başlangıç en az 5 dakika sonra olmalı.", "err");
    const pack = qzPackList.find((x) => x.id === packId);
    try {
      await call("funplay", {
        op: "showSave", packId, title: $("#qzShowTitle").value.trim(), startsAt: at,
        count: Math.min(Number($("#qzShowN").value) || 10, pack ? pack.count : 30), qSeconds: Number($("#qzShowSec").value) || 15, revealSeconds: 6,
        elimination: $("#qzShowElim").checked,
        prizes: { jeton: [Number($("#qzP1").value) || 0, Number($("#qzP2").value) || 0, Number($("#qzP3").value) || 0], participation: Number($("#qzPart").value) || 0, badge: $("#qzShowBadge").checked },
      });
      qzNote("#qzShowOut", "Yarışma planlandı.", "ok");
      loadQuiz();
    } catch (e) {
      qzNote("#qzShowOut", "Planlanamadı: " + errText(e), "err");
    }
  };

  // ------------------------------------------------------------------ Satın almasız HP yüklemeleri (economyAdmin creditLog / creditLogCsv)
  const CL_KINDS = {
    admin_grant: "Yönetim yüklemesi", welcome: "Hoş geldin", founder_gift: "Kurucu hediyesi", gift_income: "Hediye geliri",
    tournament_prize: "Turnuva ödülü", bank_interest: "Banka faizi", refund: "İade", reward: "Ödül/kazanç", referral_reward: "Davet ödülü", other: "Diğer",
  };
  const CL_COLORS = { admin_grant: "#8e44ad", welcome: "#2980b9", founder_gift: "#d4a017", gift_income: "#e67e22", tournament_prize: "#16a085", bank_interest: "#27ae60", refund: "#7f8c8d", reward: "#2c7be5", referral_reward: "#c0392b", other: "#95a5a6" };
  $("#clKind").innerHTML = '<option value="">Tümü</option>' + Object.entries(CL_KINDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  let clFilter = null, clCursor = null, clRows = [];
  const clTime = (ms) => (ms ? new Date(ms).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(",", "") : "–");
  async function clResolveUser(raw) {
    raw = raw.trim();
    if (!raw) return null;
    const db = fsdb();
    const h = raw.replace(/^@/, "").toLowerCase();
    if (db && (raw.startsWith("@") || raw.length < 20)) {
      const s = await db.collection("users").where("username", "==", h).limit(1).get();
      if (s.empty) throw new Error(`@${h} bulunamadı.`);
      return s.docs[0].id;
    }
    return raw.replace(/^@/, "");
  }
  async function clBuildFilter() {
    const f = {};
    const from = $("#clFrom").value, to = $("#clTo").value;
    // Tarihler Türkiye saatine göre gün başı / gün sonu.
    if (from) f.from = Date.parse(from + "T00:00:00+03:00");
    if (to) f.to = Date.parse(to + "T23:59:59.999+03:00");
    if ($("#clKind").value) f.kind = $("#clKind").value;
    const uid = await clResolveUser($("#clUser").value);
    if (uid) f.uid = uid;
    return f;
  }
  function clDraw() {
    $("#clList").innerHTML = clRows.length
      ? `<table><thead><tr><th>Tarih</th><th>Üye</th><th>Tutar</th><th>Tür</th><th>Yapan</th><th>Not</th></tr></thead><tbody>${clRows
          .map((r) => `<tr><td style="white-space:nowrap">${esc(clTime(r.at))}</td><td><b>${esc(r.name || r.uid)}</b>${r.username ? ` <span class="muted small">@${esc(r.username)}</span>` : ""}</td><td style="font-weight:800;color:#1f8a4c;white-space:nowrap">+${fmt(r.amount)} HP</td><td><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;background:${CL_COLORS[r.kind] || "#95a5a6"}">${esc(CL_KINDS[r.kind] || r.kind)}</span></td><td>${esc(r.byName || r.by)}</td><td class="small">${esc(r.note || "")}<div class="muted small">${esc(r.source)}${r.ref ? " · " + esc(r.ref) : ""}${r.backfill ? " · geçmişten aktarıldı" : ""}</div></td></tr>`)
          .join("")}</tbody></table>`
      : '<p class="muted small">Bu filtrede kayıt yok.</p>';
    $("#clMore").classList.toggle("hide", !clCursor);
  }
  async function loadCreditLog(more) {
    ecoNote("#clOut", "");
    try {
      if (!more) {
        clFilter = await clBuildFilter();
        clRows = [];
        clCursor = null;
        $("#clList").innerHTML = '<p class="muted small">Yükleniyor…</p>';
      }
      const r = await call("economyAdmin", { op: "creditLog", limit: 100, ...clFilter, ...(more && clCursor ? { cursor: clCursor } : {}) });
      clRows = clRows.concat(r.items || []);
      clCursor = r.nextCursor || null;
      if (r.total) $("#clTotal").innerHTML = `Toplam: <b>${fmt(r.total.sum)} HP</b> · ${fmt(r.total.count)} kayıt`;
      clDraw();
    } catch (e) {
      ecoNote("#clOut", "Okunamadı: " + errText(e), "err");
      if (!more) $("#clList").innerHTML = "";
    }
  }
  $("#clApply").onclick = () => loadCreditLog(false);
  $("#clMore").onclick = () => loadCreditLog(true);
  $("#clUser").onkeydown = (e) => {
    if (e.key === "Enter") loadCreditLog(false);
  };
  $("#clCsv").onclick = async () => {
    $("#clCsv").disabled = true;
    try {
      const f = await clBuildFilter();
      const r = await call("economyAdmin", { op: "creditLogCsv", ...f });
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `hp-satin-almasiz-yuklemeler-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
      ecoNote("#clOut", `${fmt(r.count)} satır indirildi · toplam ${fmt(r.sum)} HP${r.truncated ? " · ilk 5000 satır (tarih aralığını daraltın)" : ""}.`, "ok");
    } catch (e) {
      ecoNote("#clOut", "CSV alınamadı: " + errText(e), "err");
    } finally {
      $("#clCsv").disabled = false;
    }
  };
  $("#clBackfill").onclick = async () => {
    if (!confirm("Son 90 günün yönetim yüklemeleri ve cüzdan defterindeki satın almasız krediler bu listeye aktarılsın mı? (Var olan kayıtlar atlanır.)")) return;
    $("#clBackfill").disabled = true;
    let cursor = null, scanned = 0, written = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const r = await call("economyAdmin", { op: "backfillCreditLog", days: 90, ...(cursor ? { cursor } : {}) });
        scanned += r.scanned || 0;
        written += r.written || 0;
        ecoNote("#clOut", `Aktarılıyor… taranan ${fmt(scanned)}, yazılan ${fmt(written)}`, "");
        if (r.done) break;
        cursor = r.cursor;
      }
      ecoNote("#clOut", `Aktarım tamam: ${fmt(scanned)} kayıt tarandı, ${fmt(written)} yeni kayıt yazıldı.`, "ok");
      loadCreditLog(false);
    } catch (e) {
      ecoNote("#clOut", "Aktarılamadı: " + errText(e), "err");
    } finally {
      $("#clBackfill").disabled = false;
    }
  };
  // ------------------------------------------------------------------ HP Bankası (hpBank adminGet/adminSet/stats) → config/economy.bank
  const HB_CAP = 15, HB_DAYS = [7, 30, 90, 180, 365];
  let hbTerms = [];
  const hbNote = (text, kind) => {
    const el = $("#hbOut");
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const hbPct = (v) => String(Math.round(Number(v) * 100) / 100).replace(".", ",");
  const hbInterest = (p, pct, days) => Math.floor((p * Math.round(Math.min(pct, HB_CAP) * 100) * days) / (10000 * 365));
  function hbDrawTerms() {
    const rate = Number($("#hbRate").value) || 0;
    $("#hbTerms").innerHTML = hbTerms.map((t, i) => {
      const pct = Math.min(HB_CAP, Math.round(rate * (Number(t.rateMultiplier) || 0) * 100) / 100);
      return `<div class="row" style="align-items:flex-end">
        <div style="width:80px"><label>Gün</label><b>${t.days}</b></div>
        <div style="width:160px"><label>Ad</label><input data-hbl="${i}" maxlength="20" value="${esc(t.label || "")}"></div>
        <div style="width:110px"><label>Çarpan (≤ 1)</label><input data-hbm="${i}" type="number" min="0.01" max="1" step="0.01" value="${esc(t.rateMultiplier)}"></div>
        <div style="width:200px" class="muted small">yıllık %${hbPct(pct)} · 1000 HP → +${hbInterest(1000, pct, t.days)} HP</div>
        <button class="btn ghost" data-hbx="${i}" ${hbTerms.length <= 1 ? "disabled" : ""}>Kaldır</button>
      </div>`;
    }).join("");
    $$("#hbTerms [data-hbl]").forEach((el) => (el.oninput = () => (hbTerms[+el.dataset.hbl].label = el.value)));
    $$("#hbTerms [data-hbm]").forEach((el) => (el.onchange = () => { hbTerms[+el.dataset.hbm].rateMultiplier = Number(el.value); hbDrawTerms(); }));
    $$("#hbTerms [data-hbx]").forEach((el) => (el.onclick = () => { hbTerms.splice(+el.dataset.hbx, 1); hbDrawTerms(); }));
    const unused = HB_DAYS.filter((d) => !hbTerms.some((t) => t.days === d));
    $("#hbAddTerms").innerHTML = unused.map((d) => `<button class="btn ghost" data-hba="${d}">+ ${d} gün</button>`).join("");
    $$("#hbAddTerms [data-hba]").forEach((el) => (el.onclick = () => {
      const d = +el.dataset.hba;
      hbTerms.push({ id: "d" + d, days: d, rateMultiplier: 1, label: "" });
      hbTerms.sort((a, b) => a.days - b.days);
      hbDrawTerms();
    }));
  }
  function hbFill(c) {
    $("#hbEnabled").checked = c.enabled === true;
    $("#hbRate").value = c.annualRatePct;
    $("#hbMin").value = c.minDeposit;
    $("#hbMax").value = c.maxPerUser;
    $("#hbMaxActive").value = c.maxActiveDeposits;
    hbTerms = (c.terms || []).map((t) => ({ id: t.id, days: t.days, rateMultiplier: t.rateMultiplier, label: t.label || "" }));
    hbDrawTerms();
  }
  function hbStats(s) {
    const n = (v) => Number(v || 0).toLocaleString("tr-TR");
    const items = [["Bankadaki HP (anapara)", s.activePrincipal], ["Faiz yükümlülüğü (ödenecek)", s.activeInterest], ["Açık mevduat", s.activeCount],
      ["Toplam yatırılan", s.totalDeposited], ["Ödenen faiz", s.totalInterestPaid], ["Erken çekişte yanan faiz", s.forfeitedInterest],
      ["Mevduat sayısı", s.depositCount], ["Vade sonu ödenen", s.paidCount], ["Erken çekilen", s.earlyCount]];
    $("#hbStats").innerHTML = '<div class="row">' + items.map(([k, v]) => `<div style="width:190px"><div class="muted small">${esc(k)}</div><b style="font-size:20px">${n(v)}</b></div>`).join("") + "</div>" +
      `<p class="muted small">Son otomatik ödeme: ${s.lastRunAt ? new Date(s.lastRunAt).toLocaleString("tr-TR") + " · " + n(s.lastRunPaid) + " mevduat" : "—"}</p>`;
  }
  async function loadHpBank(recount) {
    hbNote("");
    try {
      const d = await call("hpBank", { op: "adminGet" });
      hbFill(d.config || {});
      let st = d.stats || {};
      if (recount) {
        st = (await call("hpBank", { op: "stats", recount: true })).stats || st;
        hbNote("İstatistik yeniden sayıldı.", "ok");
      }
      hbStats(st);
      $("#hbHist").innerHTML = (d.history || []).length
        ? d.history.map((h) => `<div class="hist"><div><b>%${hbPct(h.before?.annualRatePct ?? 0)} → %${hbPct(h.after?.annualRatePct ?? 0)}</b> · ${h.after?.enabled ? "açık" : "kapalı"}<p>${h.at ? new Date(h.at).toLocaleString("tr-TR") : ""}</p></div></div>`).join("")
        : '<p class="muted small">Henüz değişiklik yok.</p>';
    } catch (e) {
      hbNote("Yüklenemedi: " + errText(e), "err");
    }
  }
  $("#hbRate").oninput = () => hbDrawTerms();
  $("#hbReload").onclick = () => loadHpBank();
  $("#hbRecount").onclick = () => loadHpBank(true);
  $("#hbSave").onclick = async () => {
    const rate = Number($("#hbRate").value);
    if (!(rate > 0 && rate <= HB_CAP)) return hbNote(`Yıllık faiz 0'dan büyük ve en fazla %${HB_CAP} olmalı.`, "err");
    const ints = ["#hbMin", "#hbMax", "#hbMaxActive"].map((k) => Number($(k).value));
    if (ints.some((v) => !Number.isInteger(v) || v < 1)) return hbNote("Sınırlar 1 veya daha büyük tam sayı olmalı.", "err");
    if (ints[1] < ints[0]) return hbNote("Kişi başı üst sınır en az yatırımdan küçük olamaz.", "err");
    if (hbTerms.some((t) => !(t.rateMultiplier > 0 && t.rateMultiplier <= 1))) return hbNote("Vade çarpanları 0'dan büyük ve en fazla 1 olmalı.", "err");
    const enabled = $("#hbEnabled").checked;
    if (enabled && !confirm("HP Bankası açık olarak kaydedilecek. Faiz getiren mevduat benzeri ürünler hukuki risk taşır. Hukuki inceleme yapıldı mı?")) return;
    $("#hbSave").disabled = true;
    try {
      const r = await call("hpBank", {
        op: "adminSet",
        bank: {
          enabled, annualRatePct: Math.round(rate * 100) / 100, minDeposit: ints[0], maxPerUser: ints[1], maxActiveDeposits: ints[2],
          terms: hbTerms.map((t) => ({ id: t.id, days: t.days, rateMultiplier: Math.round(t.rateMultiplier * 100) / 100, ...(t.label.trim() ? { label: t.label.trim() } : {}) })),
        },
      });
      hbNote(r.changed ? "Kaydedildi. Yeni oran yalnızca bundan sonra açılan mevduatlara uygulanır." : "Değişiklik yok.", "ok");
      await loadHpBank();
      if (r.changed) hbNote("Kaydedildi. Yeni oran yalnızca bundan sonra açılan mevduatlara uygulanır.", "ok");
    } catch (e) {
      hbNote("Kaydedilemedi: " + errText(e), "err");
    } finally {
      $("#hbSave").disabled = false;
    }
  };
  // ------------------------------------------------------------------ bağışlar (donations: orgList/orgUpsert/pending/payoutRecord/payouts/configSet)
  const dnNote = (text, kind) => {
    const el = $("#dnOut");
    el.textContent = text;
    el.className = "note" + (kind ? " " + kind : "") + (text ? "" : " hide");
  };
  const tl = (v) => Number(v || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " TL";
  let dnOrgs = [], dnPayOrg = null, dnPendingList = [];
  function dnFill(o) {
    $("#dnFormTitle").textContent = o ? "Kurumu düzenle" : "Kurum ekle";
    $("#dnId").value = o ? o.id : "";
    $("#dnName").value = o ? o.name : "";
    $("#dnDative").value = o ? o.nameDative : "";
    $("#dnCat").value = o ? o.category : "Diğer";
    $("#dnDesc").value = o ? o.description : "";
    $("#dnLogo").value = o ? o.logo : "";
    $("#dnWeb").value = o ? o.website : "";
    $("#dnUid").value = o && o.linkedUid ? o.linkedUid : "";
    $("#dnRate").value = o ? o.hpToTry : 0.1;
    $("#dnActive").checked = o ? o.active : true;
  }
  function dnPayTotals() {
    const sel = $$("#dnPending input[data-don]:checked").map((x) => x.dataset.don);
    const hp = dnPendingList.filter((d) => sel.includes(d.id)).reduce((a, d) => a + d.amount, 0);
    $("#dnPayInfo").textContent = dnPayOrg ? `${sel.length}/${dnPendingList.length} bağış seçili · ${hp} HP · önerilen ≈ ${tl(hp * dnPayOrg.hpToTry)}` : "";
    if (dnPayOrg) $("#dnTry").value = (Math.round(hp * dnPayOrg.hpToTry * 100) / 100) || "";
    $("#dnPay").disabled = !dnPayOrg || !sel.length;
    return { sel, hp };
  }
  async function dnOpenPayout(o) {
    dnPayOrg = o;
    $("#dnPayTitle").textContent = "Aktarım kaydet · " + o.name;
    $("#dnPending").innerHTML = '<div class="muted small">Yükleniyor…</div>';
    $("#dnDate").value = new Date().toISOString().slice(0, 10);
    try {
      const d = await call("donations", { op: "pending", orgId: o.id });
      dnPendingList = d.donations || [];
      $("#dnPending").innerHTML = dnPendingList.length
        ? `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="dnAll" style="width:auto" checked> Tümünü seç</label>` +
          dnPendingList.map((x) => `<label class="small" style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-don="${esc(x.id)}" style="width:auto" checked> <b>${x.amount} HP</b> · ${esc(x.anonymous ? "Anonim (" + (x.donorName || "-") + ")" : x.donorName || "-")} · ${x.createdAt ? when(x.createdAt) : ""}${x.message ? " · “" + esc(x.message) + "”" : ""}</label>`).join("")
        : '<div class="muted small">Bekleyen bağış yok.</div>';
      $$("#dnPending input[data-don]").forEach((c) => (c.onchange = dnPayTotals));
      const all = $("#dnAll");
      if (all) all.onchange = () => { $$("#dnPending input[data-don]").forEach((c) => (c.checked = all.checked)); dnPayTotals(); };
      dnPayTotals();
      $("#dnPayTitle").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      $("#dnPending").innerHTML = "";
      dnNote("Bekleyen bağışlar yüklenemedi: " + errText(e), "err");
    }
  }
  async function loadDonations() {
    dnNote("");
    try {
      const [d, p] = await Promise.all([call("donations", { op: "orgList" }), call("donations", { op: "payouts" })]);
      const c = d.config || {};
      $("#dnEnabled").checked = c.enabled !== false;
      $("#dnMin").value = c.minHp ?? 10;
      $("#dnMax").value = c.maxHp ?? 100000;
      $("#dnPresets").value = (c.presets || []).join(", ");
      const cats = d.categories || ["Diğer"];
      $("#dnCat").innerHTML = cats.map((x) => `<option>${esc(x)}</option>`).join("");
      dnOrgs = d.orgs || [];
      table($("#dnOrgs"), [
        { t: "Kurum", k: "name", f: (o) => `<b>${esc(o.name)}</b><div class="muted small">${esc(o.category)}${o.linkedUid ? " · uid " + esc(o.linkedUid) : ""}</div>` },
        { t: "Durum", k: "active", f: (o) => (o.active ? "Aktif" : "Pasif") },
        { t: "1 HP ≈", k: "hpToTry", num: true, f: (o) => tl(o.hpToTry) },
        { t: "Bekleyen HP", k: "pendingHp", num: true, f: (o) => `${o.totals.pendingHp} <span class="muted small">(${o.totals.pendingCount})</span><div class="muted small">≈ ${tl(o.totals.pendingHp * o.hpToTry)}</div>` },
        { t: "Aktarılan", k: "donatedTry", num: true, f: (o) => `${tl(o.totals.donatedTry)}<div class="muted small">${o.totals.donatedHp} HP</div>` },
        { t: "Bağışçı", k: "donorCount", num: true, f: (o) => String(o.totals.donorCount) },
        { t: "", f: (o) => `<button class="btn ghost" data-dnedit="${esc(o.id)}">Düzenle</button> <button class="btn" data-dnpay="${esc(o.id)}" ${o.totals.pendingCount ? "" : "disabled"}>Aktarım kaydet</button>` },
      ], dnOrgs.map((o) => ({ ...o, pendingHp: o.totals.pendingHp, donatedTry: o.totals.donatedTry, donorCount: o.totals.donorCount })));
      $("#dnOrgs").onclick = (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        const o = dnOrgs.find((x) => x.id === (b.dataset.dnedit || b.dataset.dnpay));
        if (!o) return;
        if (b.dataset.dnedit) { dnFill(o); $("#dnFormTitle").scrollIntoView({ behavior: "smooth" }); } else dnOpenPayout(o);
      };
      table($("#dnHist"), [
        { t: "Tarih", k: "date", f: (x) => (x.date ? when(x.date) : "") },
        { t: "Kurum", k: "orgName" },
        { t: "TL", k: "tryAmount", num: true, f: (x) => tl(x.tryAmount) },
        { t: "HP", k: "hp", num: true },
        { t: "Bağış / bağışçı", k: "donationCount", num: true, f: (x) => `${x.donationCount} / ${x.donorCount}` },
        { t: "Dekont", f: (x) => (x.receiptUrl ? `<a href="${esc(x.receiptUrl)}" target="_blank" rel="noopener">${esc(x.receiptNo || "aç")}</a>` : esc(x.receiptNo)) + (x.receiptPublic ? ' <span class="muted small">herkese açık</span>' : "") },
        { t: "Not", f: (x) => esc(x.note) + (x.status !== "completed" ? ` <b>(${esc(x.status)})</b>` : "") },
      ], p.payouts || []);
    } catch (e) {
      dnNote("Bağış bilgisi yüklenemedi: " + errText(e), "err");
    }
  }
  $("#dnReload").onclick = () => loadDonations();
  $("#dnNew").onclick = () => dnFill(null);
  $("#dnCfgSave").onclick = async () => {
    try {
      const presets = $("#dnPresets").value.split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0);
      await call("donations", { op: "configSet", enabled: $("#dnEnabled").checked, minHp: Number($("#dnMin").value), maxHp: Number($("#dnMax").value), presets });
      dnNote("Bağış ayarları kaydedildi.", "ok");
    } catch (e) {
      dnNote("Kaydedilemedi: " + errText(e), "err");
    }
  };
  $("#dnSave").onclick = async () => {
    const name = $("#dnName").value.trim();
    if (name.length < 2) return dnNote("Kurum adı gerekli.", "err");
    $("#dnSave").disabled = true;
    try {
      const id = $("#dnId").value;
      await call("donations", {
        op: "orgUpsert", ...(id ? { id } : {}), name, nameDative: $("#dnDative").value.trim(), category: $("#dnCat").value,
        description: $("#dnDesc").value.trim(), logo: $("#dnLogo").value.trim(), website: $("#dnWeb").value.trim(),
        linkedUid: $("#dnUid").value.trim(), hpToTry: Number($("#dnRate").value), active: $("#dnActive").checked,
      });
      dnFill(null);
      await loadDonations();
      dnNote("Kurum kaydedildi.", "ok");
    } catch (e) {
      dnNote("Kaydedilemedi: " + errText(e), "err");
    } finally {
      $("#dnSave").disabled = false;
    }
  };
  $("#dnPay").onclick = async () => {
    if (!dnPayOrg) return;
    const { sel, hp } = dnPayTotals();
    const tryAmount = Number($("#dnTry").value);
    const receiptUrl = $("#dnRUrl").value.trim(), receiptNo = $("#dnRNo").value.trim();
    if (!sel.length) return dnNote("En az bir bağış seçin.", "err");
    if (!(tryAmount > 0)) return dnNote("Aktarılan TL tutarını girin.", "err");
    if (!receiptUrl && !receiptNo) return dnNote("Dekont bağlantısı ya da numarası girin.", "err");
    if (receiptUrl && !receiptUrl.startsWith("https://")) return dnNote("Dekont bağlantısı https:// ile başlamalı.", "err");
    if (!confirm(`${dnPayOrg.name}: ${sel.length} bağış (${hp} HP) "Gerçekleşti" olacak, ${tl(tryAmount)} aktarım kaydedilecek ve bağışçılara bildirim gidecek. Onaylıyor musun?`)) return;
    $("#dnPay").disabled = true;
    try {
      const dateStr = $("#dnDate").value;
      const r = await call("donations", {
        op: "payoutRecord", orgId: dnPayOrg.id, donationIds: sel, tryAmount, receiptUrl, receiptNo,
        receiptPublic: $("#dnPublic").checked, note: $("#dnNote").value.trim(),
        ...(dateStr ? { date: new Date(dateStr + "T12:00:00").getTime() } : {}),
      });
      dnPayOrg = null;
      $("#dnPending").innerHTML = "";
      $("#dnPayTitle").textContent = "Aktarım kaydet";
      $("#dnRUrl").value = $("#dnRNo").value = $("#dnNote").value = $("#dnTry").value = "";
      await loadDonations();
      dnNote(`Aktarım kaydedildi: ${r.payout ? r.payout.hp : hp} HP, ${tl(tryAmount)}. ${r.notified || 0} bağışçıya "Bağışınız gerçekleşti" bildirimi gönderildi.`, "ok");
    } catch (e) {
      dnNote("Aktarım kaydedilemedi: " + errText(e), "err");
      dnPayTotals();
    }
  };
  // ------------------------------------------------------------------ Paylaşımlı yolculuk anlaşmazlıkları (rides: disputes / resolve)
  const rdNote = (m, kind) => { const el = $("#rdOut"); el.textContent = m; el.className = "note" + (kind === "err" ? " err" : kind === "ok" ? " ok" : ""); el.classList.toggle("hide", !m); };
  const rdMark = (v) => ({ present: "geldi", absent: "gelmedi", ok: "sorunsuz", driver_noshow: "sürücü gelmedi", problem: "sorun var" }[v] || "—");
  async function loadRides() {
    rdNote("");
    try {
      const status = $("#rdStatus").value;
      const r = await call("rides", { op: "disputes", status });
      const items = r.items || [];
      $("#rdList").innerHTML = items.length ? items.map((d) => `<div style="border-bottom:1px solid #eee;padding:10px 0">
        <b>${esc(d.eventTitle)}</b> · kalkış ${d.departAt ? esc(new Date(d.departAt).toLocaleString("tr-TR")) : "—"}<br>
        Sürücü <b>${esc(d.driverName)}</b> → yolcu için "${esc(rdMark(d.driverMark))}"${d.driverNote ? ` · “${esc(d.driverNote)}”` : ""}<br>
        Yolcu <b>${esc(d.passengerName)}</b> → "${esc(rdMark(d.passengerMark))}"${d.passengerNote ? ` · “${esc(d.passengerNote)}”` : ""}<br>
        Bloke: <b>${fmt(d.charged || 0)} HP</b> (fiyat ${fmt(d.priceHp || 0)} HP)
        ${status === "open" ? `<div class="row" style="margin-top:6px;align-items:flex-end"><select data-rdact="${esc(d.id)}"><option value="release">Sürücüye aktar</option><option value="refund" selected>Yolcuya iade</option><option value="noshow">Yolcu gelmedi</option></select><label><input type="checkbox" data-rdpen="${esc(d.id)}"> Sürücüye ceza</label><input data-rdnote="${esc(d.id)}" maxlength="500" placeholder="Gerekçe (en az 10 karakter)" style="flex:1;min-width:200px"><button class="btn" data-rdgo="${esc(d.id)}">Uygula</button></div>` : `<div class="muted">Karar: ${esc(d.outcome || "")} · ${esc(d.note || "")}</div>`}
      </div>`).join("") : "Kayıt yok.";
      $$("[data-rdgo]").forEach((b) => (b.onclick = async () => {
        const id = b.dataset.rdgo;
        const note = (document.querySelector(`[data-rdnote="${CSS.escape(id)}"]`).value || "").trim();
        if (note.length < 10) return rdNote("En az 10 karakterlik gerekçe yaz.", "err");
        const action = document.querySelector(`[data-rdact="${CSS.escape(id)}"]`).value;
        const penalizeDriver = document.querySelector(`[data-rdpen="${CSS.escape(id)}"]`).checked;
        if (!confirm("Karar uygulansın mı? Bu işlem geri alınamaz.")) return;
        b.disabled = true;
        try {
          await call("rides", { op: "resolve", id, action, note, penalizeDriver });
          rdNote("Karar uygulandı.", "ok");
          loadRides();
        } catch (e) {
          rdNote("Uygulanamadı: " + errText(e), "err");
          b.disabled = false;
        }
      }));
    } catch (e) {
      rdNote("Okunamadı: " + errText(e), "err");
    }
  }
  $("#rdStatus").onchange = () => loadRides();
  $("#rdReload").onclick = () => loadRides();
})();
