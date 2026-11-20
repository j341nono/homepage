/*
 * Cosmos（クロスメディアバー風 UI）の配置・操作・背景。
 *
 *   横の列  カテゴリのアイコン。選んだカテゴリは常に同じ列（画面の左寄り）に来て、ほかは左右へずれる
 *   縦の列  選んだカテゴリの項目。選んだ項目はカテゴリのすぐ下に来て、それより前の項目はカテゴリの上へ押し出される
 *   ←→ カテゴリ / ↑↓ 項目 / Enter 決定（詳細シートを開く・リンクを開く）/ Esc・← 詳細を閉じる
 *   マウスはクリックとホイール、タッチは縦横のスワイプでも同じように動かせる。
 *
 * HTML だけでも全カテゴリが読めるように作ってあり、ここでは要素を絶対配置して動かすだけ。
 * 背景は Canvas 2D で、選んだカテゴリの色の光の波を描く。
 * prefers-reduced-motion のときはアニメーションを止め、静止画として描き直す。
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-xmb]");
  if (!root) return;

  var html = document.documentElement;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = motionQuery.matches;
  var slice = Array.prototype.slice;

  var menu = root.querySelector("[data-xmb-menu]");
  var sheet = root.querySelector("[data-xmb-sheet]");
  var sheetBody = root.querySelector("[data-xmb-sheet-body]");
  var live = root.querySelector("[data-xmb-live]");
  var clock = root.querySelector("[data-xmb-clock]");

  var categories = slice.call(root.querySelectorAll("[data-xmb-category]")).map(function (el) {
    return {
      el: el,
      id: el.id,
      cat: el.querySelector(".xmb-cat"),
      face: el.querySelector("[data-xmb-cat]"),
      label: el.querySelector(".xmb-cat-label").textContent.trim(),
      accent: el.style.getPropertyValue("--accent").trim(),
      items: slice.call(el.querySelectorAll("[data-xmb-item]")).map(function (item) {
        return { el: item, face: item.querySelector(".xmb-item-face") };
      }),
      index: 0,
    };
  });
  if (!categories.length) return;

  var state = { cat: 0 };
  var metrics = {};

  // ==================================================
  // 初期化
  // ==================================================
  html.classList.add("xmb-ready");

  categories.forEach(function (category) {
    category.face.tabIndex = -1;
    category.items.forEach(function (item) {
      item.face.tabIndex = -1;
      var detail = item.el.querySelector(".xmb-detail");
      if (detail) detail.hidden = true;
    });
  });

  // ==================================================
  // 配置
  // ==================================================
  function measure() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var compact = w < 640 || h < 560;
    metrics = {
      w: w,
      h: h,
      colX: compact ? 28 : Math.round(Math.max(120, w * 0.2)),
      rowY: Math.round(h * (compact ? 0.22 : 0.24)),
      catSize: compact ? 56 : 76,
      spacing: compact ? 96 : 140,
      catLabel: compact ? 30 : 36,
      itemH: compact ? 60 : 70,
      itemSelH: compact ? 80 : 96,
      gap: compact ? 14 : 20,
    };
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function layout() {
    var m = metrics;
    var sel = state.cat;
    root.style.setProperty("--col-x", m.colX + "px");
    root.style.setProperty("--cat-size", m.catSize + "px");

    categories.forEach(function (category, c) {
      var offset = c - sel;
      var x = m.colX + offset * m.spacing;
      var on = offset === 0;
      category.el.classList.toggle("is-current", on);
      category.cat.style.transform = "translate3d(" + x + "px," + m.rowY + "px,0)";
      category.cat.style.opacity = Math.abs(offset) > 6 ? "0" : "";

      var listTop = m.rowY + m.catSize + m.catLabel + m.gap;
      var above = m.rowY - m.gap;
      var s = category.index;
      category.items.forEach(function (item, i) {
        var y;
        if (i < s) y = above - (s - i) * m.itemH;
        else if (i === s) y = listTop;
        else y = listTop + m.itemSelH + (i - s - 1) * m.itemH;
        var visible = on && y > -m.itemH && y < m.h;
        // カテゴリより上の項目は薄く、画面の上下の端へ近づくほど消えていく
        var opacity = 0;
        if (visible) {
          opacity = i < s ? 0.55 * clamp(y / m.rowY) : 1;
          opacity *= clamp((m.h - 24 - y) / 140);
        }
        item.el.classList.toggle("is-selected", i === s);
        item.el.classList.toggle("is-hidden", !visible || opacity < 0.02);
        item.el.style.opacity = opacity.toFixed(3);
        // 選んでいないカテゴリの項目は、そのカテゴリのアイコンの下に畳んでおく
        var ix = on ? m.colX : x;
        var iy = on ? y : listTop;
        item.el.style.transform = "translate3d(" + ix + "px," + iy + "px,0)";
      });
    });
  }

  // ==================================================
  // 選択
  // ==================================================
  function current() {
    return categories[state.cat];
  }

  function focusCurrent() {
    var category = current();
    var item = category.items[category.index];
    var target = item ? item.face : category.face;
    categories.forEach(function (other) {
      other.face.tabIndex = -1;
      other.items.forEach(function (it) { it.face.tabIndex = -1; });
    });
    target.tabIndex = 0;
    if (!sheet || !sheet.open) target.focus({ preventScroll: true });
  }

  function announce() {
    var category = current();
    var item = category.items[category.index];
    var title = item && item.el.querySelector(".xmb-item-title");
    var text = category.label;
    if (item) text += " " + (category.index + 1) + " / " + category.items.length;
    if (title) text += " " + title.textContent.trim();
    live.textContent = text;
  }

  function selectCategory(c, options) {
    options = options || {};
    c = Math.max(0, Math.min(categories.length - 1, c));
    var changed = c !== state.cat;
    state.cat = c;
    var category = current();
    if (category.accent) {
      root.style.setProperty("--accent", category.accent);
      backdrop.setAccent(category.accent);
    }
    if (changed) {
      category.el.classList.remove("is-entering");
      void category.el.offsetWidth; // 項目の入場アニメーションを最初から再生する
      category.el.classList.add("is-entering");
    }
    layout();
    if (options.focus !== false) focusCurrent();
    if (options.hash !== false && window.history && history.replaceState) {
      history.replaceState(null, "", "#" + encodeURIComponent(category.id));
    }
    if (changed || options.announce) announce();
  }

  function selectItem(i, options) {
    var category = current();
    if (!category.items.length) return;
    i = Math.max(0, Math.min(category.items.length - 1, i));
    if (i === category.index && !(options && options.force)) return;
    category.index = i;
    layout();
    focusCurrent();
    announce();
  }

  function moveCategory(delta) { selectCategory(state.cat + delta); }
  function moveItem(delta) { selectItem(current().index + delta); }

  // ==================================================
  // 詳細シート
  // ==================================================
  function activate(item) {
    var detail = item.el.querySelector(".xmb-detail");
    if (detail && sheet && typeof sheet.showModal === "function") {
      var copy = detail.cloneNode(true);
      copy.hidden = false;
      var title = copy.querySelector(".xmb-detail-title");
      if (title) title.id = "xmb-sheet-title";
      sheetBody.replaceChildren(copy);
      sheet.style.setProperty("--accent", current().accent);
      root.classList.add("is-detail");
      sheet.showModal();
      sheetBody.scrollTop = 0;
      return;
    }
    if (item.face.tagName === "A") item.face.click();
  }

  if (sheet) {
    sheet.addEventListener("close", function () {
      root.classList.remove("is-detail");
      focusCurrent();
    });
    sheet.addEventListener("click", function (event) {
      if (event.target === sheet) sheet.close();
    });
    sheet.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "Backspace") {
        event.preventDefault();
        sheet.close();
      }
    });
  }

  // ==================================================
  // 入力
  // ==================================================
  function locate(el) {
    for (var c = 0; c < categories.length; c++) {
      var category = categories[c];
      if (category.face === el) return { c: c, i: -1 };
      for (var i = 0; i < category.items.length; i++) {
        if (category.items[i].face === el) return { c: c, i: i };
      }
    }
    return null;
  }

  var suppressClick = false;

  root.addEventListener("click", function (event) {
    var face = event.target.closest(".xmb-cat-face, .xmb-item-face");
    if (!face || !menu.contains(face)) return;
    if (suppressClick) {
      event.preventDefault();
      return;
    }
    var at = locate(face);
    if (!at) return;
    if (at.i < 0) {
      event.preventDefault();
      selectCategory(at.c);
      return;
    }
    var category = categories[at.c];
    if (at.c !== state.cat || at.i !== category.index) {
      // まだ選ばれていない項目は、1 回目のクリックで選ぶだけにする
      event.preventDefault();
      if (at.c !== state.cat) selectCategory(at.c, { focus: false });
      selectItem(at.i, { force: true });
      return;
    }
    if (face.tagName === "BUTTON") {
      event.preventDefault();
      activate(category.items[at.i]);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (sheet && sheet.open) return;
    var target = event.target;
    if (target.closest && target.closest("input, textarea, select, [contenteditable], .site-header")) return;
    switch (event.key) {
      case "ArrowLeft": event.preventDefault(); moveCategory(-1); break;
      case "ArrowRight": event.preventDefault(); moveCategory(1); break;
      case "ArrowUp": event.preventDefault(); moveItem(-1); break;
      case "ArrowDown": event.preventDefault(); moveItem(1); break;
      case "Home": event.preventDefault(); selectItem(0); break;
      case "End": event.preventDefault(); selectItem(current().items.length - 1); break;
      case "PageUp": event.preventDefault(); moveItem(-5); break;
      case "PageDown": event.preventDefault(); moveItem(5); break;
      case "Enter":
      case " ": {
        var item = current().items[current().index];
        if (!item) break;
        // フォーカス中のボタン・リンクは既定の動作（click）に任せる
        if (target === item.face && (item.face.tagName === "BUTTON" || item.face.tagName === "A")) break;
        event.preventDefault();
        activate(item);
        break;
      }
      default:
    }
  });

  // ホイール：縦は項目、横（またはシフト）はカテゴリ
  var wheelUntil = 0;
  window.addEventListener("wheel", function (event) {
    if (sheet && sheet.open) return;
    if (event.target.closest && event.target.closest(".site-header")) return;
    event.preventDefault();
    var horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
    var delta = horizontal ? (event.deltaX || event.deltaY) : event.deltaY;
    if (Math.abs(delta) < 3) return;
    var now = performance.now();
    if (now < wheelUntil) return;
    wheelUntil = now + (horizontal ? 220 : 90);
    if (horizontal) moveCategory(delta > 0 ? 1 : -1);
    else moveItem(delta > 0 ? 1 : -1);
  }, { passive: false });

  // スワイプ：横はカテゴリ、縦は項目（指の移動量に応じて複数進む）
  var touch = null;
  menu.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse") return;
    touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  menu.addEventListener("pointerup", function (event) {
    if (!touch || event.pointerId !== touch.id) return;
    var dx = event.clientX - touch.x;
    var dy = event.clientY - touch.y;
    touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 60);
    if (Math.abs(dx) > Math.abs(dy)) moveCategory(dx < 0 ? 1 : -1);
    else moveItem(-Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / metrics.itemH)));
  });
  menu.addEventListener("pointercancel", function () { touch = null; });

  // ==================================================
  // 時計
  // ==================================================
  if (clock) {
    var dateFormat = new Intl.DateTimeFormat(html.lang || undefined, { month: "numeric", day: "numeric" });
    var timeFormat = new Intl.DateTimeFormat(html.lang || undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    var tick = function () {
      var now = new Date();
      clock.textContent = dateFormat.format(now) + "  " + timeFormat.format(now);
      clock.dateTime = now.toISOString();
    };
    tick();
    setInterval(tick, 10000);
  }

  // ==================================================
  // 背景（Canvas 2D の光の波）
  // ==================================================
  var backdrop = (function () {
    var canvas = root.querySelector("[data-xmb-canvas]");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return { setAccent: function () {}, motion: function () {} };

    var width = 0;
    var height = 0;
    var color = [90, 169, 255];
    var target = color.slice();
    var running = false;
    var last = 0;
    var time = 0;
    var motes = [];

    function resize() {
      var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      motes = [];
      var count = Math.round(Math.min(90, (width * height) / 16000));
      for (var i = 0; i < count; i++) {
        motes.push({ x: Math.random() * width, y: Math.random() * height, z: 0.3 + Math.random() * 0.7, p: Math.random() * 6.28 });
      }
      draw(0);
    }

    // アクセント色を scale 倍に暗くし、light の割合だけ白に寄せた色
    function tint(alpha, light, scale) {
      var m = light || 0;
      var s = scale == null ? 1 : scale;
      return "rgba(" +
        Math.round(color[0] * s + (255 - color[0] * s) * m) + "," +
        Math.round(color[1] * s + (255 - color[1] * s) * m) + "," +
        Math.round(color[2] * s + (255 - color[2] * s) * m) + "," + alpha + ")";
    }

    function wave(x, k, t) {
      return Math.sin(x * 0.0021 + t * 0.32 + k * 0.55) * 0.55 +
        Math.sin(x * 0.0047 - t * 0.21 + k * 1.3) * 0.3 +
        Math.sin(x * 0.0009 + t * 0.11) * 0.45;
    }

    function draw(dt) {
      var t = time;
      for (var c = 0; c < 3; c++) color[c] += (target[c] - color[c]) * Math.min(1, dt * 2.5);

      // 上が明るく、下へ暗くなる地の色
      var base = ctx.createLinearGradient(0, 0, 0, height);
      base.addColorStop(0, tint(1, 0, 0.34));
      base.addColorStop(0.6, tint(1, 0, 0.12));
      base.addColorStop(1, "#03040a");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      var mid = height * 0.6;
      var amp = height * 0.09;
      var x;

      // 幅のある光の帯（2 本）
      for (var band = 0; band < 2; band++) {
        ctx.beginPath();
        for (x = -20; x <= width + 20; x += 12) {
          var y1 = mid + wave(x, band * 2.1, t) * amp - 18 - band * 10;
          if (x === -20) ctx.moveTo(x, y1);
          else ctx.lineTo(x, y1);
        }
        for (x = width + 20; x >= -20; x -= 12) {
          ctx.lineTo(x, mid + wave(x, band * 2.1 + 0.7, t * 1.1) * amp + 26 + band * 14);
        }
        ctx.closePath();
        var fill = ctx.createLinearGradient(0, mid - amp * 2, 0, mid + amp * 2);
        fill.addColorStop(0, tint(0));
        fill.addColorStop(0.5, tint(band ? 0.1 : 0.16, 0.25));
        fill.addColorStop(1, tint(0));
        ctx.fillStyle = fill;
        ctx.fill();
      }

      // 細い光の線
      ctx.lineWidth = 1;
      for (var k = 0; k < 9; k++) {
        ctx.beginPath();
        for (x = -20; x <= width + 20; x += 10) {
          var y = mid + wave(x, k * 0.35, t) * amp * (0.8 + k * 0.05) + (k - 4) * 3;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = tint(k === 4 ? 0.55 : 0.12 + (k % 3) * 0.05, 0.6);
        ctx.stroke();
      }

      // 漂う光の粒
      for (var i = 0; i < motes.length; i++) {
        var mote = motes[i];
        mote.x += mote.z * dt * 8;
        if (mote.x > width + 2) mote.x -= width + 4;
        var a = (0.12 + 0.35 * mote.z) * (0.6 + 0.4 * Math.sin(t * (0.5 + mote.z) + mote.p));
        ctx.fillStyle = tint(a.toFixed(3), 0.75);
        ctx.fillRect(mote.x, mote.y, 1 + mote.z, 1 + mote.z);
      }
    }

    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.1, (now - last) / 1000 || 0);
      last = now;
      time += dt;
      draw(dt);
      requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced || document.hidden) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) running = false;
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
        if (reduced) { running = false; color = target.slice(); draw(0); }
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
  // #publications のようなカテゴリ、#product-3 のような項目の id から、選ぶ位置を決める
  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    var category = el && el.closest("[data-xmb-category]");
    if (!category) return null;
    var c = categories.findIndex(function (cat) { return cat.el === category; });
    var item = el.closest("[data-xmb-item]");
    if (item) {
      categories[c].index = Math.max(0, categories[c].items.findIndex(function (it) { return it.el === item; }));
    }
    return c;
  }

  function settle() {
    // 配置し直すときはアニメーションさせない
    root.classList.add("is-static");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove("is-static"); });
    });
  }

  measure();
  var initial = fromHash();
  state.cat = initial == null ? 0 : initial;
  settle();
  selectCategory(state.cat, { hash: false, announce: true });
  window.scrollTo(0, 0);

  window.addEventListener("hashchange", function () {
    var c = fromHash();
    if (c != null) selectCategory(c, { hash: false, announce: true });
  });

  var resizeQueued = false;
  window.addEventListener("resize", function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      settle();
      measure();
      layout();
    });
  });

  if (!reduced) {
    root.classList.add("is-booting");
    setTimeout(function () { root.classList.remove("is-booting"); }, 1300);
  }
})();
