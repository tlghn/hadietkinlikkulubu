/* ==========================================================================
   HADİ Etkinlik Kulübü — oyunlar
   Hadi Koş!, Anı Eşleştirme, Logo Yapbozu, Grubu Topla.
   Rekorlar yalnızca ziyaretçinin tarayıcısında (localStorage) tutulur.
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HEX = { h: "#F2801F", a: "#1D9AD6", d: "#78BE3A", i: "#A3338C", pink: "#E0407A", ink: "#17344F", mist: "#F2F6F9", line: "#DCE4EB" };
  var COLS = [HEX.h, HEX.a, HEX.d, HEX.i];
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem("hadi-oyun-" + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("hadi-oyun-" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var party = function () { if (window.hadiConfetti) window.hadiConfetti(); };
  var toast = function (m) { if (window.hadiToast) window.hadiToast(m); };
  var fmt = function (s) { s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  var share = function (text) {
    var url = "https://hadietkinlikkulubu.com/oyunlar";
    if (navigator.share) navigator.share({ title: "H.A.D.İ. Oyunları", text: text, url: url }).catch(function () {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
  };
  var img = function (src) { var i = new Image(); i.src = src; return i; };
  var hiDPI = function (cv, w, h) {
    var r = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * r); cv.height = Math.round(h * r);
    var c = cv.getContext("2d"); c.setTransform(r, 0, 0, r, 0, 0); return c;
  };
  var rr = function (c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  var DISP = '"Bricolage Grotesque", "Figtree", system-ui, sans-serif', BODY = '"Figtree", system-ui, sans-serif';

  /* ---------------- Oyunlar merkezi: rekorları göster ---------------- */
  $$("[data-best]").forEach(function (el) {
    var k = el.dataset.best, b = store.get(k);
    if (b == null) return;
    el.textContent = k === "kos" ? "Rekorun: " + b + " puan" : k === "yilan" ? "Rekorun: " + b + " kişilik grup" : k === "eslestir" ? "Rekorun: " + b + " hamle" : "Rekorun: " + b.n + "×" + b.n + " · " + b.m + " hamle";
  });

  /* =====================================================================
     1) HADİ KOŞ!
     ===================================================================== */
  var kosEl = $("#kos");
  if (kosEl) (function () {
    var cv = $("#kos-cv"), over = $("#kos-over"), c, W = 960, H = 320, GROUND = 262;
    var hero = img("assets/img/logo-anim/jumper.webp");
    var LET = [["H", HEX.h], ["A", HEX.a], ["D", HEX.d], ["İ", HEX.i]];
    var st, last = 0, raf = null, best = store.get("kos") || 0;
    var size = function () {
      var cw = kosEl.clientWidth;
      if (cw < 700) { var ch = 230; W = Math.round(cw / ch * 320); } else W = 960;
      H = 320; GROUND = H - 58;
      c = hiDPI(cv, W, H);
      cv.style.aspectRatio = W + " / " + H;
      if (!st || !st.run) draw();
    };
    var reset = function () {
      st = { run: false, over: false, t: 0, speed: 390, score: 0, y: GROUND, vy: 0, onGround: true, obs: [], lets: [], next: 0, nextObs: 1.1, nextLet: 2.4, ground: 0, hills: 0, flash: 0, bonus: 0, pops: [] };
    };
    var jump = function () {
      if (!st.run) return;
      if (st.onGround) { st.vy = -800; st.onGround = false; }
    };
    var TYPES = [
      { k: "duvar", w: 30, h: 50, label: "Monotonluk" },
      { k: "kanepe", w: 66, h: 34, label: "Kanepe" },
      { k: "bulut", w: 50, h: 42, label: "Pazartesi" }
    ];
    var spawnObs = function () {
      var t = TYPES[Math.floor(Math.random() * TYPES.length)];
      st.obs.push({ x: W + 30, w: t.w, h: t.h, k: t.k, label: t.label });
      var gap = (0.95 + Math.random() * 0.9) * Math.max(0.55, 420 / st.speed);
      st.nextObs = gap;
    };
    var spawnLet = function () {
      var y = GROUND - 120 - Math.random() * 60;
      // engellerin tam üstüne gelmesin
      st.lets.push({ x: W + 40, y: y, i: st.next });
      st.nextLet = 2.2 + Math.random() * 2.2;
    };
    var hit = function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; };
    var end = function () {
      st.run = false; st.over = true;
      var sc = Math.floor(st.score), isBest = sc > best;
      if (isBest) { best = sc; store.set("kos", best); }
      $(".g-over-title", over).textContent = isBest ? "Yeni rekor! 🎉" : "Ah, takıldın!";
      $(".g-over-text", over).innerHTML = "<b>" + sc + "</b> puan · Rekorun: <b>" + best + "</b>";
      $("[data-kos-start]", over).textContent = "Tekrar oyna";
      var sb = $("[data-share=kos]", over); sb.hidden = false; sb.dataset.text = "H.A.D.İ. Hadi Koş!'ta " + sc + " puan yaptım. Geç bakalım! 🏃";
      over.classList.add("show");
      if (isBest && sc > 0) party();
    };
    var update = function (dt) {
      st.t += dt; var sf = Math.max(0.8, Math.min(1, W / 960)); st.speed = Math.min(920 * sf, (390 + st.t * 11) * sf);
      st.score += dt * st.speed / 10;
      st.ground = (st.ground + st.speed * dt) % 40; st.hills = (st.hills + st.speed * dt * 0.25) % W;
      st.vy += 2300 * dt; st.y += st.vy * dt;
      if (st.y >= GROUND) { st.y = GROUND; st.vy = 0; st.onGround = true; }
      st.nextObs -= dt; if (st.nextObs <= 0) spawnObs();
      st.nextLet -= dt; if (st.nextLet <= 0) spawnLet();
      var p = { x: 74, y: st.y - 62, w: 40, h: 58 };
      st.obs.forEach(function (o) { o.x -= st.speed * dt; });
      st.obs = st.obs.filter(function (o) { return o.x + o.w > -60; });
      for (var n = 0; n < st.obs.length; n++) {
        var o = st.obs[n];
        if (hit(p, { x: o.x + 4, y: GROUND - o.h + 4, w: o.w - 8, h: o.h - 4 })) { end(); return; }
      }
      st.lets.forEach(function (l) { l.x -= st.speed * dt; });
      st.lets = st.lets.filter(function (l) {
        if (hit({ x: 64, y: st.y - 70, w: 60, h: 70 }, { x: l.x - 18, y: l.y - 18, w: 36, h: 36 })) {
          if (l.i === st.next) {
            st.next++; st.score += 50; st.pops.push({ x: l.x, y: l.y, t: 0, txt: "+50" });
            if (st.next === 4) { st.next = 0; st.score += 500; st.bonus = 1.6; st.pops.push({ x: W / 2, y: 90, t: 0, txt: "HADİ! +500", big: true }); party(); }
          }
          return false;
        }
        return l.x > -40;
      });
      st.pops.forEach(function (q) { q.t += dt; }); st.pops = st.pops.filter(function (q) { return q.t < 1; });
      if (st.bonus > 0) st.bonus -= dt;
    };
    var drawObs = function (o) {
      var x = o.x, y = GROUND - o.h;
      if (o.k === "duvar") {
        c.fillStyle = HEX.ink; rr(c, x, y, o.w, o.h, 5); c.fill();
        c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 2;
        for (var r = 1; r < 4; r++) { c.beginPath(); c.moveTo(x, y + r * o.h / 4); c.lineTo(x + o.w, y + r * o.h / 4); c.stroke(); }
      } else if (o.k === "kanepe") {
        c.fillStyle = HEX.pink; rr(c, x, y + 10, o.w, o.h - 10, 8); c.fill();
        rr(c, x + 4, y, o.w - 8, 18, 8); c.fill();
        c.fillStyle = "rgba(255,255,255,.25)"; rr(c, x + 8, y + 14, o.w / 2 - 10, 10, 4); c.fill(); rr(c, x + o.w / 2 + 2, y + 14, o.w / 2 - 10, 10, 4); c.fill();
      } else {
        c.fillStyle = "#8C9BAB";
        c.beginPath(); c.arc(x + 14, y + 22, 13, 0, 7); c.arc(x + 28, y + 14, 15, 0, 7); c.arc(x + 40, y + 24, 11, 0, 7); c.fill();
        c.fillRect(x + 4, y + 22, o.w - 8, 14);
        c.strokeStyle = HEX.a; c.lineWidth = 2.5; c.lineCap = "round";
        for (var k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x + 12 + k * 12, y + 38); c.lineTo(x + 9 + k * 12, y + o.h); c.stroke(); }
      }
      c.fillStyle = "#6B7F92"; c.font = "700 11px " + BODY; c.textAlign = "center"; c.fillText(o.label, x + o.w / 2, y - 7);
    };
    var draw = function () {
      if (!c) return;
      c.clearRect(0, 0, W, H);
      // arka plan: logodaki kurdelelerden esinli tepeler
      var hx = st ? -st.hills : 0;
      for (var rep = 0; rep < 2; rep++) {
        var ox = hx + rep * W;
        c.lineWidth = 10; c.lineCap = "round";
        [[0.18, HEX.h, 120], [0.5, HEX.a, 150], [0.82, HEX.d, 110]].forEach(function (h) {
          c.strokeStyle = h[1]; c.globalAlpha = .13;
          c.beginPath(); c.arc(ox + W * h[0], GROUND + 40, h[2], Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        });
      }
      c.globalAlpha = 1;
      // zemin
      c.fillStyle = HEX.mist; c.fillRect(0, GROUND, W, H - GROUND);
      c.strokeStyle = HEX.line; c.lineWidth = 3; c.beginPath(); c.moveTo(0, GROUND + 1); c.lineTo(W, GROUND + 1); c.stroke();
      c.strokeStyle = "#C7D3DE"; c.lineWidth = 2;
      var g = st ? st.ground : 0;
      for (var x = -g; x < W; x += 40) { c.beginPath(); c.moveTo(x, GROUND + 18); c.lineTo(x + 16, GROUND + 18); c.stroke(); }
      if (!st) return;
      st.obs.forEach(drawObs);
      // harfler
      st.lets.forEach(function (l) {
        var L = LET[l.i], bob = Math.sin((st.t + l.x / 200) * 5) * 4, want = l.i === st.next;
        c.globalAlpha = want ? 1 : .35;
        c.fillStyle = L[1]; rr(c, l.x - 18, l.y - 18 + bob, 36, 36, 10); c.fill();
        c.fillStyle = "#fff"; c.font = "800 22px " + DISP; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(L[0], l.x, l.y + 1 + bob);
        c.globalAlpha = 1; c.textBaseline = "alphabetic";
      });
      // oyuncu
      var py = st.y, squash = st.onGround ? 1 + Math.sin(st.t * 22) * 0.04 : 1.06;
      c.save(); c.translate(94, py);
      if (!st.onGround) c.rotate(Math.max(-0.25, Math.min(0.25, st.vy / 3000)));
      c.scale(1 / squash, squash);
      if (hero.complete && hero.naturalWidth) { var hh = 76 * hero.naturalHeight / hero.naturalWidth; c.drawImage(hero, -38, -hh + 4, 76, hh); }
      else { c.fillStyle = HEX.a; c.beginPath(); c.arc(0, -40, 26, 0, 7); c.fill(); }
      c.restore();
      c.fillStyle = "rgba(23,52,79,.12)"; c.beginPath(); c.ellipse(94, GROUND + 4, 26 * (1 - (GROUND - py) / 400), 5, 0, 0, 7); c.fill();
      // HUD: harfler
      LET.forEach(function (L, n) {
        var got = n < st.next, nxt = n === st.next;
        var blink = nxt && Math.floor(st.t * 3) % 2 === 0;
        c.fillStyle = got ? L[1] : "#fff"; c.strokeStyle = L[1]; c.lineWidth = 2.5;
        rr(c, 16 + n * 38, 14, 30, 30, 8); c.fill(); if (!got) c.stroke();
        c.fillStyle = got ? "#fff" : (blink ? L[1] : "#B8C4CF"); c.font = "800 17px " + DISP; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(L[0], 31 + n * 38, 30); c.textBaseline = "alphabetic";
      });
      // skor
      c.textAlign = "right"; c.fillStyle = HEX.ink; c.font = "800 22px " + DISP;
      c.fillText(String(Math.floor(st.score)).padStart(5, "0"), W - 16, 36);
      c.fillStyle = "#6B7F92"; c.font = "700 12px " + BODY; c.fillText("REKOR " + String(best).padStart(5, "0"), W - 16, 54);
      // yazı patlamaları
      st.pops.forEach(function (q) {
        c.globalAlpha = 1 - q.t; c.textAlign = "center"; c.fillStyle = q.big ? HEX.h : HEX.ink;
        c.font = (q.big ? "800 34px " : "800 16px ") + DISP; c.fillText(q.txt, q.x, q.y - q.t * 40);
      });
      c.globalAlpha = 1;
    };
    var loop = function (ts) {
      var dt = last ? Math.min((ts - last) / 1000, 0.04) : 0; last = ts;
      if (st.run) update(dt);
      draw();
      if (st.run) raf = requestAnimationFrame(loop); else raf = null;
    };
    var start = function () {
      reset(); st.run = true; over.classList.remove("show"); last = 0;
      kosEl.focus({ preventScroll: true });
      if (!raf) raf = requestAnimationFrame(loop);
    };
    $("[data-kos-start]", over).addEventListener("click", function (e) { e.stopPropagation(); start(); });
    $("[data-share=kos]", over).addEventListener("click", function (e) { e.stopPropagation(); share(this.dataset.text); });
    kosEl.addEventListener("pointerdown", function (e) { if (e.target.closest("button")) return; if (st.run) { e.preventDefault(); jump(); } else if (!st.over) start(); });
    document.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        var r = kosEl.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
        e.preventDefault();
        if (st.run) jump(); else start();
      }
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && st.run) end(); });
    reset(); size(); window.addEventListener("resize", size);
    hero.onload = function () { if (!st.run) draw(); };
  })();

  /* =====================================================================
     2) ANI EŞLEŞTİRME
     ===================================================================== */
  var memo = $("#memo");
  if (memo) (function () {
    var FACES = [
      { k: "runner", img: "assets/img/logo-anim/runner.webp" }, { k: "jumper", img: "assets/img/logo-anim/jumper.webp" },
      { k: "duo", img: "assets/img/logo-anim/duo.webp" }, { k: "emblem", img: "assets/img/logo-anim/emblem.webp" },
      { k: "yuruyus", e: "🥾", ad: "Doğa yürüyüşü" }, { k: "tiyatro", e: "🎭", ad: "Tiyatro gecesi" },
      { k: "sirtaki", e: "💃", ad: "Sirtaki gecesi" }, { k: "yemek", e: "🍽️", ad: "Yemekli buluşma" }
    ];
    var cards, open, lock, moves, matched, t0, timer, firstAct;
    var best = store.get("eslestir");
    var setBest = function () { $("#m-best").textContent = best ? best + " hamle" : "–"; };
    var deal = function () {
      var deck = FACES.concat(FACES).map(function (f, n) { return { f: f, id: n }; });
      for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      memo.innerHTML = deck.map(function (d, n) {
        var face = d.f.img ? '<img src="' + d.f.img + '" alt="">' : '<span class="m-emoji">' + d.f.e + '</span>';
        return '<button class="m-card" type="button" data-k="' + d.f.k + '" style="--n:' + n + ';--c:' + COLS[n % 4] + '" aria-label="Kapalı kart"><span class="m-in"><span class="m-back"><i></i></span><span class="m-front">' + face + '</span></span></button>';
      }).join("");
      cards = $$(".m-card", memo); open = []; lock = false; moves = 0; matched = 0; t0 = null; firstAct = null;
      clearInterval(timer); $("#m-moves").textContent = "0"; $("#m-time").textContent = "0:00"; $("#m-result").hidden = true;
      cards.forEach(function (cd) { cd.addEventListener("click", function () { flip(cd); }); });
    };
    var flip = function (cd) {
      if (lock || cd.classList.contains("open") || cd.classList.contains("done")) return;
      if (!t0) { t0 = Date.now(); timer = setInterval(function () { $("#m-time").textContent = fmt((Date.now() - t0) / 1000); }, 500); }
      cd.classList.add("open"); cd.setAttribute("aria-label", "Açık kart"); open.push(cd);
      if (open.length < 2) return;
      moves++; $("#m-moves").textContent = moves;
      var a = open[0], b = open[1];
      if (a.dataset.k === b.dataset.k) {
        a.classList.add("done"); b.classList.add("done"); open = []; matched++;
        var f = FACES.filter(function (x) { return x.k === a.dataset.k; })[0];
        if (f.ad && !firstAct) firstAct = f;
        if (matched === FACES.length) win();
      } else {
        lock = true;
        setTimeout(function () { a.classList.remove("open"); b.classList.remove("open"); a.setAttribute("aria-label", "Kapalı kart"); b.setAttribute("aria-label", "Kapalı kart"); open = []; lock = false; }, 850);
      }
    };
    var win = function () {
      clearInterval(timer);
      var secs = Math.round((Date.now() - t0) / 1000), isBest = !best || moves < best;
      if (isBest) { best = moves; store.set("eslestir", best); setBest(); }
      var r = $("#m-result"); r.hidden = false;
      r.innerHTML = '<h2>' + (isBest ? "Yeni rekor! 🎉" : "Tebrikler! 🎉") + '</h2><p><b>' + moves + '</b> hamle, <b>' + fmt(secs) + '</b> sürede tamamladın.</p>' +
        (firstAct ? '<p class="m-rec">İlk bulduğun etkinlik <b>' + firstAct.e + ' ' + firstAct.ad + '</b> oldu. Bu hafta sonu sana göre!</p>' : '') +
        '<div class="btn-row"><button class="btn btn--h" type="button" data-again>Tekrar oyna</button><button class="btn btn--ghost" type="button" data-sh>Skorumu paylaş</button>' +
        (firstAct ? '<a class="btn btn--ghost" href="davetiye.html?ne=' + encodeURIComponent(firstAct.ad) + '">Bir arkadaşını davet et</a>' : '') + '</div>';
      $("[data-again]", r).addEventListener("click", deal);
      $("[data-sh]", r).addEventListener("click", function () { share("H.A.D.İ. Anı Eşleştirme'yi " + moves + " hamlede bitirdim. Sen kaçta bitirirsin? 🃏"); });
      party();
      r.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    };
    $("#m-new").addEventListener("click", deal);
    setBest(); deal();
  })();

  /* =====================================================================
     3) LOGO YAPBOZU
     ===================================================================== */
  var puz = $("#puz");
  if (puz) (function () {
    var N = 3, tiles, empty, moves, t0, timer, solved;
    var SRC = "assets/img/hadi-logo-512.jpg";
    var build = function () {
      puz.innerHTML = ""; puz.style.setProperty("--n", N); puz.classList.remove("solved");
      tiles = [];
      for (var i = 0; i < N * N - 1; i++) {
        var t = document.createElement("button"); t.type = "button"; t.className = "pz-tile";
        t.dataset.home = i;
        t.style.backgroundImage = "url(" + SRC + ")";
        t.style.backgroundSize = (N * 100) + "% " + (N * 100) + "%";
        t.style.backgroundPosition = (i % N) / (N - 1) * 100 + "% " + Math.floor(i / N) / (N - 1) * 100 + "%";
        t.setAttribute("aria-label", "Parça " + (i + 1));
        t.addEventListener("click", (function (tile) { return function () { tryMove(tile); }; })(t));
        puz.appendChild(t); tiles.push({ el: t, pos: i });
      }
      var full = document.createElement("div"); full.className = "pz-full"; full.style.backgroundImage = "url(" + SRC + ")"; puz.appendChild(full);
      empty = N * N - 1;
      shuffle(); place();
      moves = 0; t0 = null; solved = false; clearInterval(timer);
      $("#p-moves").textContent = "0"; $("#p-time").textContent = "0:00"; $("#p-result").hidden = true;
    };
    var neighbors = function (p) {
      var r = Math.floor(p / N), c2 = p % N, out = [];
      if (r > 0) out.push(p - N); if (r < N - 1) out.push(p + N); if (c2 > 0) out.push(p - 1); if (c2 < N - 1) out.push(p + 1);
      return out;
    };
    var shuffle = function () {
      var prev = -1, steps = N === 3 ? 120 : 260;
      for (var s = 0; s < steps; s++) {
        var opts = neighbors(empty).filter(function (p) { return p !== prev; });
        var pick = opts[Math.floor(Math.random() * opts.length)];
        var t = tiles.filter(function (x) { return x.pos === pick; })[0];
        t.pos = empty; prev = empty; empty = pick;
      }
      if (isSolved()) shuffle();
    };
    var place = function () {
      tiles.forEach(function (t) {
        t.el.style.left = (t.pos % N) * (100 / N) + "%";
        t.el.style.top = Math.floor(t.pos / N) * (100 / N) + "%";
      });
    };
    var isSolved = function () { return tiles.every(function (t) { return t.pos === +t.el.dataset.home; }); };
    var tryMove = function (tileEl) {
      if (solved) return;
      var t = tiles.filter(function (x) { return x.el === tileEl; })[0];
      if (neighbors(empty).indexOf(t.pos) < 0) { tileEl.classList.remove("nope"); void tileEl.offsetWidth; tileEl.classList.add("nope"); return; }
      if (!t0) { t0 = Date.now(); timer = setInterval(function () { $("#p-time").textContent = fmt((Date.now() - t0) / 1000); }, 500); }
      var p = t.pos; t.pos = empty; empty = p; moves++;
      $("#p-moves").textContent = moves; place();
      if (isSolved()) win();
    };
    var win = function () {
      solved = true; clearInterval(timer);
      var secs = Math.round((Date.now() - t0) / 1000);
      setTimeout(function () { puz.classList.add("solved"); party(); }, 250);
      var b = store.get("yapboz"), isBest = !b || N > b.n || (N === b.n && moves < b.m);
      if (isBest) store.set("yapboz", { n: N, m: moves });
      var r = $("#p-result"); r.hidden = false;
      r.innerHTML = '<h2>Logo tamam! 🎉</h2><p><b>' + N + '×' + N + '</b> yapbozu <b>' + moves + '</b> hamlede, <b>' + fmt(secs) + '</b> sürede çözdün.' + (isBest ? " Yeni rekor!" : "") + '</p>' +
        '<div class="btn-row"><button class="btn btn--h" type="button" data-again>Yeniden karıştır</button>' + (N === 3 ? '<button class="btn btn--ghost" type="button" data-hard>Zor seviyeyi dene (4×4)</button>' : '') + '<button class="btn btn--ghost" type="button" data-sh>Paylaş</button></div>';
      $("[data-again]", r).addEventListener("click", build);
      var hard = $("[data-hard]", r); if (hard) hard.addEventListener("click", function () { setN(4); });
      $("[data-sh]", r).addEventListener("click", function () { share("H.A.D.İ. Logo Yapbozu'nu (" + N + "×" + N + ") " + moves + " hamlede çözdüm! 🧩"); });
    };
    var setN = function (n) {
      N = n; $$(".seg [data-n]").forEach(function (b) { b.setAttribute("aria-pressed", +b.dataset.n === n); }); build();
    };
    $$(".seg [data-n]").forEach(function (b) { b.addEventListener("click", function () { setN(+b.dataset.n); }); });
    $("#p-new").addEventListener("click", build);
    var peek = $("#p-peek");
    var peekOn = function (e) { e.preventDefault(); puz.classList.add("peek"); }, peekOff = function () { puz.classList.remove("peek"); };
    peek.addEventListener("pointerdown", peekOn); ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { peek.addEventListener(ev, peekOff); });
    peek.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") puz.classList.add("peek"); });
    peek.addEventListener("keyup", peekOff);
    puz.addEventListener("keydown", function (e) {
      // ok tuşu, boşluğa doğru kayacak parçayı seçer
      var map = { ArrowUp: N, ArrowDown: -N, ArrowLeft: 1, ArrowRight: -1 };
      if (!(e.key in map)) return; e.preventDefault();
      var from = empty + map[e.key];
      if (from < 0 || from >= N * N) return;
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && Math.floor(from / N) !== Math.floor(empty / N)) return;
      var t = tiles.filter(function (x) { return x.pos === from; })[0]; if (t) tryMove(t.el);
    });
    build();
  })();

  /* =====================================================================
     4) GRUBU TOPLA
     ===================================================================== */
  var snakeEl = $("#snake");
  if (snakeEl) (function () {
    var cv = $("#snake-cv"), over = $("#snake-over"), G = 18, S = 480, cell = S / G, c = hiDPI(cv, S, S);
    var st, timer = null, best = store.get("yilan") || 0;
    $("#s-best").textContent = best ? best + " kişi" : "–";
    var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var reset = function () {
      st = { body: [[5, 9], [4, 9], [3, 9]], dir: "right", queue: [], food: null, run: false, over: false, step: 150, pop: null };
      st.food = place();
    };
    var place = function () {
      var free = [];
      for (var x = 0; x < G; x++) for (var y = 0; y < G; y++) if (!st.body.some(function (b) { return b[0] === x && b[1] === y; })) free.push([x, y]);
      var f = free[Math.floor(Math.random() * free.length)];
      return { x: f[0], y: f[1], c: COLS[Math.floor(Math.random() * 4)] };
    };
    var turn = function (d) {
      var lastDir = st.queue.length ? st.queue[st.queue.length - 1] : st.dir;
      var a = DIRS[d], b = DIRS[lastDir];
      if (a[0] === -b[0] && a[1] === -b[1]) return;
      if (d !== lastDir && st.queue.length < 3) st.queue.push(d);
    };
    var tick = function () {
      if (st.queue.length) st.dir = st.queue.shift();
      var v = DIRS[st.dir], h = st.body[0], nx = h[0] + v[0], ny = h[1] + v[1];
      var eat = nx === st.food.x && ny === st.food.y;
      var hitWall = nx < 0 || ny < 0 || nx >= G || ny >= G;
      var hitSelf = st.body.slice(0, eat ? st.body.length : st.body.length - 1).some(function (b) { return b[0] === nx && b[1] === ny; });
      if (hitWall || hitSelf) { end(); return; }
      st.body.unshift([nx, ny]);
      if (eat) {
        st.pop = { x: nx, y: ny, t: 0 }; st.food = place();
        st.step = Math.max(78, st.step - 4);
        $("#s-score").textContent = st.body.length - 2;
      } else st.body.pop();
      draw();
      timer = setTimeout(tick, st.step);
    };
    var person = function (x, y, col, s) {
      var cx = x * cell + cell / 2, cy = y * cell + cell / 2;
      c.fillStyle = col;
      c.beginPath(); c.arc(cx, cy - cell * .2 * s, cell * .19 * s, 0, 7); c.fill();
      rr(c, cx - cell * .25 * s, cy - cell * .02 * s, cell * .5 * s, cell * .38 * s, cell * .16 * s); c.fill();
    };
    var draw = function () {
      c.clearRect(0, 0, S, S);
      for (var x = 0; x < G; x++) for (var y = 0; y < G; y++) { c.fillStyle = (x + y) % 2 ? "#F7FAFC" : "#EEF3F7"; c.fillRect(x * cell, y * cell, cell, cell); }
      // yemek: zıplayan arkadaş
      var bob = Math.sin(Date.now() / 160) * 0.06;
      person(st.food.x, st.food.y - bob * 2, st.food.c, 1);
      // grup
      for (var n = st.body.length - 1; n >= 0; n--) {
        var b = st.body[n];
        if (n === 0) {
          c.fillStyle = HEX.ink; c.beginPath(); c.arc(b[0] * cell + cell / 2, b[1] * cell + cell / 2, cell * .46, 0, 7); c.fill();
          var v = DIRS[st.dir], ex = b[0] * cell + cell / 2 + v[0] * cell * .14, ey = b[1] * cell + cell / 2 + v[1] * cell * .14;
          c.fillStyle = "#fff";
          [[-1, 1], [1, -1]].forEach(function (s) {
            var ox = v[1] !== 0 ? s[0] * cell * .17 : 0, oy = v[0] !== 0 ? s[1] * cell * .17 : 0;
            c.beginPath(); c.arc(ex + ox, ey + oy, cell * .08, 0, 7); c.fill();
          });
        } else person(b[0], b[1], n === st.body.length - 1 && st.body.length > 3 ? COLS[(n - 1) % 4] : COLS[(n - 1) % 4], .95);
      }
      if (st.pop) {
        st.pop.t += 0.12;
        if (st.pop.t < 1) { c.globalAlpha = 1 - st.pop.t; c.fillStyle = HEX.h; c.font = "800 18px " + DISP; c.textAlign = "center"; c.fillText("+1", st.pop.x * cell + cell / 2, st.pop.y * cell - st.pop.t * 20); c.globalAlpha = 1; }
        else st.pop = null;
      }
    };
    var end = function () {
      st.run = false; st.over = true; clearTimeout(timer);
      var size = st.body.length - 2, isBest = size > best;
      if (isBest) { best = size; store.set("yilan", best); $("#s-best").textContent = best + " kişi"; }
      $(".g-over-title", over).textContent = isBest ? "Yeni rekor! 🎉" : "Etkinliğe vardınız!";
      $(".g-over-text", over).innerHTML = "<b>" + size + " kişilik</b> grupla etkinliğe vardın." + (isBest ? "" : " Rekorun: <b>" + best + "</b>");
      $("[data-snake-start]", over).textContent = "Tekrar oyna";
      var sb = $("[data-share=yilan]", over); sb.hidden = false; sb.dataset.text = "H.A.D.İ. Grubu Topla'da " + size + " kişilik grupla etkinliğe vardım! Sen kaç kişi toplarsın? 🎉";
      over.classList.add("show");
      if (isBest && size > 2) party();
    };
    var start = function () {
      reset(); st.run = true; over.classList.remove("show"); $("#s-score").textContent = "1";
      snakeEl.focus({ preventScroll: true }); draw(); clearTimeout(timer); timer = setTimeout(tick, st.step);
    };
    $("[data-snake-start]", over).addEventListener("click", start);
    $("[data-share=yilan]", over).addEventListener("click", function () { share(this.dataset.text); });
    var KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
    document.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      var d = KEYS[e.key]; if (!d) return;
      var r = snakeEl.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      e.preventDefault();
      if (!st.run) { if (!st.over || over.classList.contains("show")) start(); }
      turn(d);
    });
    var sx = 0, sy = 0;
    snakeEl.addEventListener("touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    snakeEl.addEventListener("touchmove", function (e) { if (st.run) e.preventDefault(); }, { passive: false });
    snakeEl.addEventListener("touchend", function (e) {
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    });
    $$(".dpad [data-dir]").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); if (!st.run) start(); turn(b.dataset.dir); });
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && st.run) end(); });
    reset(); draw();
    (function idle() { if (st && !st.run) draw(); requestAnimationFrame(idle); })();
  })();
})();
