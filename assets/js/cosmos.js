/*
 * Cosmos（ゲーム機のホーム画面風 UI）の操作と背景。
 *
 *   タブ     ポートフォリオ / プロダクトのタイル列を切り替える（Q / E キーでも切り替え）
 *   タイル   ←→ で選ぶと、すぐに下のパネルと背景の色・アートが切り替わる
 *   パネル   ↓ でヒーローのボタン → カードのレールへ降りる。Enter でカードの詳細を開く
 *   Esc / ↑  ひとつ上の段（最後はタイル）へ戻る
 *
 * HTML だけでも全セクションが読めるように作ってあり、ここでは「1 枚ずつ見せる」状態に切り替えるだけ。
 * 背景は Canvas 2D で、星・オーロラ・光の波を選択中のアクセント色で描く。
 * prefers-reduced-motion のときはアニメーションを止め、静止画として描き直す。
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-console]");
  if (!root) return;

  var html = document.documentElement;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = motionQuery.matches;

  var tabs = Array.prototype.slice.call(root.querySelectorAll("[data-console-tab]"));
  var shelves = {};
  Array.prototype.forEach.call(root.querySelectorAll("[data-console-shelf]"), function (el) {
    var track = el.querySelector(".console-shelf-track");
    shelves[el.dataset.consoleShelf] = {
      el: el,
      track: track,
      tiles: Array.prototype.slice.call(el.querySelectorAll("[data-console-tile]")),
    };
  });
  var panels = {};
  Array.prototype.forEach.call(root.querySelectorAll("[data-console-panel]"), function (panel) {
    panels[panel.id] = panel;
  });
  var dialog = root.querySelector("[data-console-dialog]");
  var dialogBody = root.querySelector("[data-console-dialog-body]");
  var clock = root.querySelector("[data-console-clock]");
  var artLayers = Array.prototype.slice.call(root.querySelectorAll("[data-console-art]"));

  var shelfNames = Object.keys(shelves);
  var state = { shelf: shelfNames[0], current: {} };
  shelfNames.forEach(function (name) {
    var first = shelves[name].tiles[0];
    state.current[name] = first ? first.dataset.consoleTile : null;
  });

  // ==================================================
  // ARIA と初期状態
  // ==================================================
  html.classList.add("console-ready");

  shelfNames.forEach(function (name) {
    var shelf = shelves[name];
    shelf.track.setAttribute("role", "tablist");
    shelf.track.setAttribute("aria-orientation", "horizontal");
    shelf.tiles.forEach(function (tile, index) {
      tile.setAttribute("role", "tab");
      tile.setAttribute("aria-controls", tile.dataset.consoleTile);
      tile.style.setProperty("--i", index);
    });
  });

  Object.keys(panels).forEach(function (id) {
    var panel = panels[id];
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tile-" + id);
    var faces = cardFaces(panel);
    faces.forEach(function (face, index) {
      face.tabIndex = index === 0 ? 0 : -1;
    });
    // 詳細はダイアログに複製して見せるので、元の場所からは隠す
    Array.prototype.forEach.call(panel.querySelectorAll(".console-detail"), function (detail) {
      detail.hidden = true;
    });
  });

  function cardFaces(panel) {
    return Array.prototype.slice.call(panel.querySelectorAll("[data-console-card] > .console-card-face"));
  }

  function currentPanel() {
    return panels[state.current[state.shelf]];
  }

  function currentTile() {
    return document.getElementById("tile-" + state.current[state.shelf]);
  }

  // ==================================================
  // 選択
  // ==================================================
  function showShelf(name) {
    state.shelf = name;
    shelfNames.forEach(function (other) {
      shelves[other].el.hidden = other !== name;
    });
    tabs.forEach(function (tab) {
      var on = tab.dataset.consoleTab === name;
      tab.classList.toggle("is-current", on);
      if (on) tab.setAttribute("aria-current", "true");
      else tab.removeAttribute("aria-current");
    });
  }

  function select(id, options) {
    options = options || {};
    var panel = panels[id];
    if (!panel) return;
    var name = panel.dataset.consolePanel;
    var shelf = shelves[name];
    var changed = state.current[name] !== id || state.shelf !== name || !panel.classList.contains("is-active");
    if (state.shelf !== name) showShelf(name);
    state.current[name] = id;

    shelf.tiles.forEach(function (tile) {
      var on = tile.dataset.consoleTile === id;
      tile.classList.toggle("is-selected", on);
      tile.setAttribute("aria-selected", on ? "true" : "false");
      tile.tabIndex = on ? 0 : -1;
    });

    Object.keys(panels).forEach(function (other) {
      var on = other === id;
      panels[other].hidden = !on;
      panels[other].classList.toggle("is-active", on);
    });

    if (changed) {
      panel.classList.remove("is-entering");
      void panel.offsetWidth; // 入場アニメーションを最初から再生する
      panel.classList.add("is-entering");
      var rail = panel.querySelector("[data-console-rail]");
      if (rail) rail.scrollLeft = 0;
    }

    var accent = panel.style.getPropertyValue("--accent").trim();
    if (accent) {
      root.style.setProperty("--accent", accent);
      backdrop.setAccent(accent);
    }
    setArt(panel.dataset.consoleArt);
    scrollShelf(shelf, id, options.instant);

    var tile = document.getElementById("tile-" + id);
    if (options.focus && tile) tile.focus({ preventScroll: true });
    if (options.hash !== false && window.history && history.replaceState) {
      history.replaceState(null, "", "#" + encodeURIComponent(id));
    }
  }

  // 選択中のタイルが常に列の左端に来るよう、列を横に送る
  function scrollShelf(shelf, id, instant) {
    var index = shelf.tiles.findIndex(function (tile) { return tile.dataset.consoleTile === id; });
    if (index < 0) return;
    var style = getComputedStyle(shelf.track);
    var step = parseFloat(style.getPropertyValue("--tile-size")) + parseFloat(style.columnGap || style.gap || 0);
    if (!isFinite(step)) return;
    shelf.track.scrollTo({ left: index * step, behavior: instant || reduced ? "auto" : "smooth" });
  }

  function step(delta) {
    var shelf = shelves[state.shelf];
    var index = shelf.tiles.findIndex(function (tile) { return tile.dataset.consoleTile === state.current[state.shelf]; });
    var next = Math.max(0, Math.min(shelf.tiles.length - 1, index + delta));
    if (next !== index) select(shelf.tiles[next].dataset.consoleTile, { focus: true });
  }

  function switchShelf(delta) {
    var index = shelfNames.indexOf(state.shelf);
    var name = shelfNames[(index + delta + shelfNames.length) % shelfNames.length];
    if (state.current[name]) select(state.current[name], { focus: true });
  }

  // ==================================================
  // パネルの中の移動
  // ==================================================
  function heroAction(panel) {
    return panel.querySelector(".console-actions .console-button");
  }

  function focusRail(panel) {
    var faces = cardFaces(panel);
    var face = faces.find(function (f) { return f.tabIndex === 0; }) || faces[0];
    if (face) focusFace(face);
    return !!face;
  }

  function focusFace(face) {
    var panel = face.closest("[data-console-panel]");
    cardFaces(panel).forEach(function (f) { f.tabIndex = f === face ? 0 : -1; });
    face.focus({ preventScroll: true });
    var card = face.closest("[data-console-card]");
    var rail = card.parentElement;
    // カード 1 枚分の余白を残して、選んだカードが見えるようにレールを送る
    var left = card.offsetLeft - rail.offsetLeft;
    var target = Math.max(0, left - card.offsetWidth * 0.5);
    if (left < rail.scrollLeft || left + card.offsetWidth > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
    }
  }

  function enterPanel() {
    var panel = currentPanel();
    if (!panel) return;
    var action = heroAction(panel);
    if (action) action.focus();
    else focusRail(panel);
  }

  function backToTile() {
    var tile = currentTile();
    if (tile) tile.focus();
  }

  // ==================================================
  // 詳細ダイアログ
  // ==================================================
  var returnFocus = null;

  function openCard(face) {
    var card = face.closest("[data-console-card]");
    var detail = card && card.querySelector(".console-detail");
    if (!detail || !dialog || typeof dialog.showModal !== "function") return;
    var copy = detail.cloneNode(true);
    copy.hidden = false;
    var title = copy.querySelector(".console-detail-title");
    if (title) title.id = "console-dialog-title";
    dialogBody.replaceChildren(copy);
    var panel = face.closest("[data-console-panel]");
    dialog.style.setProperty("--accent", panel.style.getPropertyValue("--accent"));
    returnFocus = face;
    dialog.showModal();
    dialogBody.scrollTop = 0;
  }

  if (dialog) {
    dialog.addEventListener("close", function () {
      if (returnFocus) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    });
    // 枠の外（背景）をクリックしたら閉じる
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  // ==================================================
  // 入力
  // ==================================================
  root.addEventListener("click", function (event) {
    var target = event.target;
    var tab = target.closest("[data-console-tab]");
    if (tab) {
      event.preventDefault();
      var name = tab.dataset.consoleTab;
      if (state.current[name]) select(state.current[name], { focus: true });
      return;
    }
    var tile = target.closest("[data-console-tile]");
    if (tile) {
      event.preventDefault();
      if (tile.classList.contains("is-selected")) enterPanel();
      else select(tile.dataset.consoleTile, { focus: true });
      return;
    }
    if (target.closest("[data-console-enter]")) {
      focusRail(currentPanel());
      return;
    }
    var face = target.closest(".console-card-face[aria-haspopup]");
    if (face) {
      openCard(face);
      return;
    }
    // ページ内リンク（プロフィールの統計カードなど）はタイルの選択に置き換える
    var link = target.closest('a[href^="#"]');
    if (link) {
      var id = decodeURIComponent(link.getAttribute("href").slice(1));
      if (panels[id]) {
        event.preventDefault();
        select(id, { focus: true });
      }
    }
  });

  root.addEventListener("focusin", function (event) {
    var face = event.target.closest && event.target.closest(".console-card-face");
    if (face && face.tabIndex !== 0) {
      cardFaces(face.closest("[data-console-panel]")).forEach(function (f) { f.tabIndex = f === face ? 0 : -1; });
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (dialog && dialog.open) return;
    var target = event.target;
    if (target.closest && target.closest("input, textarea, select, [contenteditable], .language-switch")) return;
    var key = event.key;

    // Q / E（と [ ]）でタブを切り替える
    if (key === "q" || key === "Q" || key === "[") { event.preventDefault(); switchShelf(-1); return; }
    if (key === "e" || key === "E" || key === "]") { event.preventDefault(); switchShelf(1); return; }

    var tile = target.closest && target.closest("[data-console-tile]");
    var face = target.closest && target.closest(".console-card-face");
    var inHero = target.closest && target.closest(".console-hero");
    var panel = currentPanel();

    if (tile) {
      if (key === "ArrowRight") { event.preventDefault(); step(1); }
      else if (key === "ArrowLeft") { event.preventDefault(); step(-1); }
      else if (key === "Home") { event.preventDefault(); step(-Infinity); }
      else if (key === "End") { event.preventDefault(); step(Infinity); }
      else if (key === "ArrowDown" || key === "Enter" || key === " ") { event.preventDefault(); enterPanel(); }
      return;
    }

    if (face) {
      var faces = cardFaces(face.closest("[data-console-panel]"));
      var index = faces.indexOf(face);
      if (key === "ArrowRight" && index < faces.length - 1) { event.preventDefault(); focusFace(faces[index + 1]); }
      else if (key === "ArrowLeft" && index > 0) { event.preventDefault(); focusFace(faces[index - 1]); }
      else if (key === "Home") { event.preventDefault(); focusFace(faces[0]); }
      else if (key === "End") { event.preventDefault(); focusFace(faces[faces.length - 1]); }
      else if (key === "ArrowUp") {
        event.preventDefault();
        var action = heroAction(panel);
        if (action) action.focus();
        else backToTile();
      } else if (key === "Escape") { event.preventDefault(); backToTile(); }
      return;
    }

    if (inHero && target.matches("a, button")) {
      if (key === "ArrowDown") { event.preventDefault(); focusRail(panel); }
      else if (key === "ArrowUp" || key === "Escape") { event.preventDefault(); backToTile(); }
      return;
    }

    // どこにもフォーカスが無いときは、矢印キーでタイルに戻る
    if (target === document.body || target === root) {
      if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        backToTile();
      }
    }
  });

  // タイル列の上でホイールを回すと、タイルを 1 つずつ送る
  var wheelLock = 0;
  shelfNames.forEach(function (name) {
    shelves[name].el.addEventListener("wheel", function (event) {
      var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 4) return;
      event.preventDefault();
      var now = performance.now();
      if (now < wheelLock) return;
      wheelLock = now + 160;
      step(delta > 0 ? 1 : -1);
    }, { passive: false });
  });

  // レールの上の縦ホイールは横スクロールにする
  Object.keys(panels).forEach(function (id) {
    var rail = panels[id].querySelector("[data-console-rail]");
    if (!rail) return;
    rail.addEventListener("wheel", function (event) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (rail.scrollWidth <= rail.clientWidth) return;
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    }, { passive: false });
  });

  // ==================================================
  // 背景のアート（プロダクトのタイトル画像）
  // ==================================================
  var artFront = 0;
  var artCurrent = null;

  function setArt(src) {
    src = src || null;
    if (src === artCurrent) return;
    artCurrent = src;
    if (!src) {
      artLayers.forEach(function (layer) { layer.classList.remove("is-visible"); });
      return;
    }
    artFront = 1 - artFront;
    var layer = artLayers[artFront];
    var other = artLayers[1 - artFront];
    var image = new Image();
    image.decoding = "async";
    image.onload = function () {
      if (artCurrent !== src) return;
      layer.style.backgroundImage = 'url("' + src.replace(/"/g, "%22") + '")';
      layer.classList.add("is-visible");
      other.classList.remove("is-visible");
    };
    image.src = src;
  }

  // ==================================================
  // 時計
  // ==================================================
  if (clock) {
    var format = new Intl.DateTimeFormat(html.lang || undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    var tick = function () {
      var now = new Date();
      clock.textContent = format.format(now);
      clock.dateTime = now.toISOString();
    };
    tick();
    setInterval(tick, 10000);
  }

  // ==================================================
  // 背景（Canvas 2D）
  // ==================================================
  var backdrop = (function () {
    var canvas = root.querySelector("[data-console-canvas]");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return { setAccent: function () {}, motion: function () {} };

    var width = 0;
    var height = 0;
    var ratio = 1;
    var color = [90, 169, 255];
    var target = color.slice();
    var stars = [];
    var running = false;
    var last = 0;
    var clockTime = 0;

    function seed() {
      stars = [];
      var count = Math.round(Math.min(220, (width * height) / 7000));
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: 0.2 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function resize() {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed();
      draw(0);
    }

    function rgba(alpha, mix) {
      // mix > 0 で白に寄せる
      var m = mix || 0;
      return "rgba(" +
        Math.round(color[0] + (255 - color[0]) * m) + "," +
        Math.round(color[1] + (255 - color[1]) * m) + "," +
        Math.round(color[2] + (255 - color[2]) * m) + "," + alpha + ")";
    }

    function glow(x, y, radius, alpha) {
      var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba(alpha));
      gradient.addColorStop(1, rgba(0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    function draw(dt) {
      var t = clockTime;
      for (var c = 0; c < 3; c++) color[c] += (target[c] - color[c]) * Math.min(1, dt * 3);

      ctx.fillStyle = "#04050c";
      ctx.fillRect(0, 0, width, height);

      // オーロラのような大きな光
      glow(width * (0.78 + Math.sin(t * 0.07) * 0.06), height * (0.12 + Math.cos(t * 0.05) * 0.05), Math.max(width, height) * 0.75, 0.32);
      glow(width * (0.08 + Math.cos(t * 0.06) * 0.05), height * 0.95, Math.max(width, height) * 0.55, 0.16);

      // 光の波（画面の下の方を横切るリボン）
      ctx.lineWidth = 1;
      for (var k = 0; k < 14; k++) {
        var base = height * (0.66 + k * 0.006);
        var amplitude = height * (0.05 + k * 0.004);
        ctx.beginPath();
        for (var x = -20; x <= width + 20; x += 16) {
          var y = base +
            Math.sin(x * 0.0024 + t * 0.22 + k * 0.18) * amplitude +
            Math.sin(x * 0.0061 - t * 0.15 + k * 0.4) * amplitude * 0.35;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(0.05 + (k % 4 === 0 ? 0.08 : 0.02), 0.35);
        ctx.stroke();
      }

      // 星
      for (var i = 0; i < stars.length; i++) {
        var star = stars[i];
        star.x -= star.z * dt * 6;
        if (star.x < -2) star.x += width + 4;
        var twinkle = 0.55 + 0.45 * Math.sin(t * (0.6 + star.z) + star.phase);
        ctx.fillStyle = "rgba(235,242,255," + (0.15 + star.z * 0.6 * twinkle).toFixed(3) + ")";
        var size = 0.4 + star.z * 1.1;
        ctx.fillRect(star.x, star.y, size, size);
      }
    }

    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.1, (now - last) / 1000 || 0);
      last = now;
      clockTime += dt;
      draw(dt);
      requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced || document.hidden) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });
    resize();
    canvas.classList.add("is-ready");
    start();

    return {
      setAccent: function (hex) {
        var value = parseInt(hex.replace("#", ""), 16);
        if (isNaN(value)) return;
        target = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
        if (!running) {
          color = target.slice();
          draw(0);
        }
      },
      motion: function () {
        if (reduced) { stop(); color = target.slice(); draw(0); }
        else start();
      },
    };
  })();

  function onMotionChange(event) {
    reduced = event.matches;
    backdrop.motion();
  }
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);

  // ==================================================
  // 起動
  // ==================================================
  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return null;
    if (panels[id]) return id;
    var el = document.getElementById(id);
    var panel = el && el.closest("[data-console-panel]");
    return panel ? panel.id : null;
  }

  var initial = fromHash() || state.current[state.shelf];
  showShelf(panels[initial].dataset.consolePanel);
  select(initial, { instant: true, hash: false });
  // ハッシュの位置へのブラウザのスクロールを打ち消し、画面の先頭（タブとタイル）から見せる
  window.scrollTo(0, 0);

  window.addEventListener("hashchange", function () {
    var id = fromHash();
    if (id) select(id, { focus: true, hash: false });
  });

  window.addEventListener("resize", function () {
    Object.keys(shelves).forEach(function (name) {
      if (state.current[name]) scrollShelf(shelves[name], state.current[name], true);
    });
  });

  if (!reduced) {
    root.classList.add("is-booting");
    setTimeout(function () { root.classList.remove("is-booting"); }, 1400);
  }
})();
