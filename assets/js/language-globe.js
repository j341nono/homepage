// ==================================================
// Language Globe（TF-IDF × Multilingual）
// ==================================================
// _includes/home.html に埋め込まれた _data/language_globe.json の語を、Canvas 2D 上の球体に並べる。
// - 語は Fibonacci sphere 上にほぼ均等に置き、TF-IDF（scale）で文字の大きさを変える
// - 球面の隙間は、語に含まれる文字を小さく散らして「文字でできた球体」に見せる
// - 自動でゆっくり回り、ドラッグ（タッチは横スワイプ）で慣性付きに回せる
// - 語にホバー / タップすると周囲の語が退き、多言語表現（variants）と近い概念（concepts）が広がる。
//   同じ項目に一緒に出てくる語（related）とは線で結ぶ
// - クリック / 2 回目のタップ / Enter で、その語が重み付けされたセクションへ移動する
// WebGL も外部ライブラリも使わない。Canvas が使えないときは HTML 側の語の一覧を表示する。
(function () {
  "use strict";

  var root = document.querySelector("[data-language-globe]");
  if (!root) return;

  var stage = root.querySelector("[data-language-globe-stage]");
  var canvas = stage && stage.querySelector("canvas");
  var ctx = canvas && canvas.getContext && canvas.getContext("2d");
  var payload;
  try {
    payload = JSON.parse(root.querySelector("[data-language-globe-data]").textContent);
  } catch (error) {}

  if (!ctx || !payload || !payload.terms || !payload.terms.length) {
    root.classList.add("is-fallback");
    return;
  }

  var labels = payload.labels || {};
  var info = root.querySelector("[data-language-globe-info]");
  var productsUrl = root.getAttribute("data-products-url") || "";

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarsePointer = window.matchMedia && window.matchMedia("(hover: none)").matches;

  // ==================================================
  // 見た目の設定
  // ==================================================
  // カテゴリは色相を少しずつ変えるだけにし、彩度を抑えて暗いカードに馴染ませる
  var CATEGORY_COLORS = {
    research: [169, 200, 255],
    products: [134, 220, 203],
    events: [195, 179, 247],
    internships: [240, 199, 160],
    achievements: [232, 208, 143],
    misc: [196, 203, 214]
  };
  var VARIANT_COLOR = [238, 243, 255];
  var GLYPH_COLOR = [150, 172, 220];
  var GLYPH_COUNT = 460;
  var PERSPECTIVE = 3.2;      // 視点までの距離（球の半径 = 1）。小さいほど遠近感が強い
  var AUTO_SPEED = 0.11;      // 自動回転の速さ（rad/s）
  var DRAG_SPEED = 0.0065;    // 1px のドラッグで回る角度
  var PITCH_LIMIT = 1.15;
  var INTRO_MS = 1800;
  var MAX_SATELLITES = 7;
  var RIPPLE_MS = 3600;       // 何もないところをクリックしたときの波紋が消えるまでの時間
  var MAX_RIPPLES = 4;

  var fontSans = getComputedStyle(root).fontFamily;
  var fontMono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";

  // ==================================================
  // データ → 球面上の点
  // ==================================================
  function fibonacciPoint(index, count) {
    // 黄金角で螺旋状に置くと、極に偏らずほぼ均等に散らばる
    var y = 1 - (2 * (index + 0.5)) / count;
    var r = Math.sqrt(1 - y * y);
    var theta = index * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(theta) * r, y, Math.sin(theta) * r];
  }

  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }

  function hashString(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // 語は重要度順に並んでいるので、そのまま螺旋に置くと大きな語が片方の極に集まる。
  // 黄金比に近い互いに素な歩幅で飛び飛びに割り当て、大きな語を球全体に散らす。
  var terms = payload.terms;
  var count = terms.length;
  var stride = Math.round(count * 0.618) || 1;
  while (gcd(stride, count) !== 1) stride++;

  var termIndex = {};
  var words = terms.map(function (term, i) {
    termIndex[term.term] = i;
    return {
      term: term,
      color: CATEGORY_COLORS[term.category] || CATEGORY_COLORS.misc,
      base: fibonacciPoint((i * stride) % count, count),
      size: 0,
      width: 0,
      screen: { x: 0, y: 0, z: 0, scale: 1, alpha: 0, halfW: 0, halfH: 0 }
    };
  });
  words.forEach(function (word) {
    word.related = (word.term.related || [])
      .map(function (name) { return termIndex[name]; })
      .filter(function (index) { return index !== undefined; });
  });

  // 隙間を埋める文字は、球体を構成する語そのものから取る
  var glyphSource = terms.map(function (term) { return term.term; }).join("").replace(/[\s・.+-]/g, "");
  var glyphs = [];
  for (var g = 0; g < GLYPH_COUNT; g++) {
    var seed = hashString("glyph" + g);
    glyphs.push({
      char: glyphSource.charAt(seed % glyphSource.length),
      base: fibonacciPoint(g, GLYPH_COUNT),
      twinkle: (seed % 1000) / 1000 * Math.PI * 2,
      screen: { x: 0, y: 0, z: 0, scale: 1 }
    });
  }

  // ==================================================
  // 状態
  // ==================================================
  var width = 0;
  var height = 0;
  var radius = 0;
  var centerX = 0;
  var centerY = 0;
  var dpr = 1;

  var yaw = 0.6;
  var pitch = 0.22;
  var yawVelocity = reducedMotion ? 0 : AUTO_SPEED;
  var pitchVelocity = 0;
  var target = null;         // キーボード選択時に、語を正面へ回すための目標角度

  var pointer = null;        // キャンバス上のポインター位置（ホバー判定用）
  var drag = null;
  var parallax = { x: 0, y: 0, tx: 0, ty: 0 };

  var active = -1;           // 展開中の語
  var sticky = false;        // タップ・キーボードで選んだ語は、ポインターが離れても閉じない
  var byKeyboard = false;    // キーボードで選んだ語は、フォーカスが Globe の外へ出たら閉じる
  var bursts = [];           // 展開アニメーション（閉じかけのものも含む）: { index, t, open }
  var ripples = [];          // 波紋: { x, y, start }
  var focusLevel = 0;        // 展開中に周りの語を沈める強さ。語から語へ移るときも途切れないよう別に持つ
  var frameTime = 0;
  var leaveTimer = 0;

  var startTime = 0;
  var lastTime = 0;
  var running = false;
  var visible = true;
  var dirty = true;

  // ==================================================
  // レイアウト
  // ==================================================
  function resize() {
    var rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    // canvas の大きさを代入すると中身が消えるので、変わったときだけ代入する
    var pixelWidth = Math.round(width * dpr);
    var pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    radius = Math.min(width * 0.4, height * 0.39);
    centerX = width / 2;
    centerY = height / 2 - 6;

    // 文字の大きさ: scale は TF-IDF を sqrt で 0〜1 にしたもの。球の大きさに合わせて伸縮させる
    var unit = radius / 180;
    words.forEach(function (word) {
      word.size = Math.max(7.5, (8 + 12 * word.term.scale) * unit);
      measurer.font = weightFor(word) + " " + word.size + "px " + fontSans;
      word.width = measurer.measureText(word.term.term).width;
      word.sprite = makeSprite(word.term.term, weightFor(word), word.size, fontSans, word.color, false);
      word.glow = null;
    });
    glyphSize = Math.max(7, radius / 22);
    glyphSprites = {};
    textWidths = {};
    dirty = true;
    warmGlows();
    // ResizeObserver は描画の後・画面に出る前に呼ばれる。ここで描き直さないと、消えた canvas が 1 フレーム見えてしまう
    if (startTime) draw(frameTime || performance.now());
  }

  function weightFor(word) {
    return word.term.scale > 0.5 ? "800" : "700";
  }

  // ==================================================
  // スプライト
  // ==================================================
  // Canvas の fillText は重く、毎フレーム数百回呼ぶとカクつく。
  // 語と文字は一度だけ小さな画像に描いておき、毎フレームは drawImage で貼るだけにする。
  // 遠近や強調で拡大しても粗くならないよう、SPRITE_SCALE 倍で描いておく
  var SPRITE_SCALE = 1.6;
  var measurer = document.createElement("canvas").getContext("2d");
  var glyphSize = 8;
  var glyphSprites = {};
  var textWidths = {};

  function makeSprite(text, weight, size, family, color, glow) {
    var px = size * SPRITE_SCALE * dpr;
    var font = weight + " " + px + "px " + family;
    measurer.font = font;
    var pad = Math.ceil(px * (glow ? 0.9 : 0.15));
    var sprite = document.createElement("canvas");
    sprite.width = Math.ceil(measurer.measureText(text).width + pad * 2);
    sprite.height = Math.ceil(px * 1.35 + pad * 2);
    var c = sprite.getContext("2d");
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = rgba(color, 1);
    if (glow) {
      c.shadowColor = rgba(color, 0.9);
      c.shadowBlur = px * 0.8;
    }
    c.fillText(text, sprite.width / 2, sprite.height / 2);
    // 基準の文字サイズで描いたときの大きさ（CSS px）
    sprite.baseWidth = sprite.width / (SPRITE_SCALE * dpr);
    sprite.baseHeight = sprite.height / (SPRITE_SCALE * dpr);
    return sprite;
  }

  // 中心 (x, y) に、横だけ squeeze 倍に縮めて貼る
  function drawSprite(sprite, x, y, scale, squeeze) {
    var w = sprite.baseWidth * scale * squeeze;
    var h = sprite.baseHeight * scale;
    ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
  }

  function makeGlow(word) {
    return makeSprite(word.term.term, weightFor(word), word.size, fontSans, word.color, true);
  }

  // 光彩付きの画像は作るのが重く（shadowBlur）、初めてホバーした瞬間に作るとそのフレームが長引く。
  // するとアニメーションが一気に進み、光彩がパッと出て点滅して見えるので、手が空いたときに作っておく
  var warmTimer = 0;

  function warmGlows() {
    var idle = window.requestIdleCallback || function (callback) { return setTimeout(callback, 50); };
    var cancel = window.cancelIdleCallback || clearTimeout;
    var index = 0;
    cancel(warmTimer);
    (function next(deadline) {
      var until = performance.now() + 4;
      while (index < words.length && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 2 : performance.now() < until)) {
        if (!words[index].glow) words[index].glow = makeGlow(words[index]);
        index++;
      }
      if (index < words.length) warmTimer = idle(next);
    })();
  }

  function glyphSprite(char) {
    if (!glyphSprites[char]) glyphSprites[char] = makeSprite(char, "500", glyphSize, fontMono, GLYPH_COLOR, false);
    return glyphSprites[char];
  }

  function textWidth(font, text) {
    var key = font + "\n" + text;
    if (textWidths[key] === undefined) {
      measurer.font = font;
      textWidths[key] = measurer.measureText(text).width;
    }
    return textWidths[key];
  }

  // ==================================================
  // 3D → 2D
  // ==================================================
  function project(point, factor, out) {
    var cosY = Math.cos(yaw);
    var sinY = Math.sin(yaw);
    var cosP = Math.cos(pitch);
    var sinP = Math.sin(pitch);
    var x1 = point[0] * cosY + point[2] * sinY;
    var z1 = -point[0] * sinY + point[2] * cosY;
    var y2 = point[1] * cosP - z1 * sinP;
    var z2 = point[1] * sinP + z1 * cosP;
    var perspective = PERSPECTIVE / (PERSPECTIVE - z2 * factor);
    out.x = centerX + parallax.x + x1 * radius * factor * perspective;
    out.y = centerY + parallax.y - y2 * radius * factor * perspective;
    out.z = z2;
    out.scale = perspective;
    // 球面に貼り付いた文字は、球の縁に近いほど横に縮んで見える
    out.squeeze = Math.max(0.3, Math.abs(z2) / (Math.sqrt(x1 * x1 + z2 * z2) || 1));
    return out;
  }

  // 語を正面（z = 1）に持ってくる yaw / pitch
  function facingAngles(point) {
    var targetYaw = Math.atan2(-point[0], point[2]);
    var targetPitch = Math.atan2(point[1], Math.sqrt(point[0] * point[0] + point[2] * point[2]));
    // 今の向きから近い方へ回す
    while (targetYaw - yaw > Math.PI) targetYaw -= Math.PI * 2;
    while (targetYaw - yaw < -Math.PI) targetYaw += Math.PI * 2;
    return { yaw: targetYaw, pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, targetPitch)) };
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function clamp01(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  function rgba(color, alpha) {
    return "rgba(" + color[0] + "," + color[1] + "," + color[2] + "," + alpha.toFixed(3) + ")";
  }

  // ==================================================
  // 更新
  // ==================================================
  function update(dt) {
    var damping = 1 - Math.exp(-dt * 1.6);

    if (target) {
      // キーボードで選んだ語を、正面へなめらかに回す
      var ease = 1 - Math.exp(-dt * (reducedMotion ? 30 : 5));
      yaw += (target.yaw - yaw) * ease;
      pitch += (target.pitch - pitch) * ease;
      if (Math.abs(target.yaw - yaw) < 0.001 && Math.abs(target.pitch - pitch) < 0.001) target = null;
    } else if (!drag) {
      // 離した直後は慣性で回り、徐々に自動回転の速さへ戻る。展開中は止めて読みやすくする
      var cruise = reducedMotion || active >= 0 ? 0 : AUTO_SPEED;
      yawVelocity += (cruise - yawVelocity) * damping;
      pitchVelocity *= 1 - damping;
      yaw += yawVelocity * dt;
      pitch += pitchVelocity * dt;
      // 上下の傾きは少しずつ元の角度へ戻す
      if (!reducedMotion && active < 0) pitch += (0.22 - pitch) * damping * 0.25;
    }
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

    if (!reducedMotion) {
      var follow = 1 - Math.exp(-dt * 3);
      parallax.x += (parallax.tx - parallax.x) * follow;
      parallax.y += (parallax.ty - parallax.y) * follow;
    }

    var speed = reducedMotion ? 30 : 6.5;
    bursts.forEach(function (burst) {
      burst.t += ((burst.open ? 1 : 0) - burst.t) * (1 - Math.exp(-dt * speed));
    });
    bursts = bursts.filter(function (burst) { return burst.open || burst.t > 0.01; });
    focusLevel += ((active >= 0 ? 1 : 0) - focusLevel) * (1 - Math.exp(-dt * speed));
    ripples = ripples.filter(function (ripple) { return frameTime - ripple.start < RIPPLE_MS; });
  }

  function isIdle(now) {
    return !dirty && !drag && !target && !ripples.length && !bursts.some(function (burst) { return Math.abs(burst.t - (burst.open ? 1 : 0)) > 0.001; }) &&
      Math.abs(yawVelocity) < 1e-4 && Math.abs(pitchVelocity) < 1e-4 &&
      Math.abs(parallax.tx - parallax.x) < 0.05 && Math.abs(parallax.ty - parallax.y) < 0.05 &&
      now - startTime > INTRO_MS;
  }

  // ==================================================
  // 描画
  // ==================================================
  function introProgress(now, fraction) {
    if (reducedMotion) return 1;
    // 中心から少しずつ時間差で広がり、球体が形作られる
    return easeOutCubic(clamp01((now - startTime - fraction * INTRO_MS * 0.45) / (INTRO_MS * 0.55)));
  }

  // 展開中の語の周りから近くの語・文字を押しのけ、波紋で揺らす。
  // 戻り値は波面が通過中の強さ（0〜1 程度）で、文字を一瞬明るくするのに使う
  function push(point) {
    var dx = 0;
    var dy = 0;
    bursts.forEach(function (burst) {
      var origin = words[burst.index].screen;
      var ox = point.x - origin.x;
      var oy = point.y - origin.y;
      var distance = Math.sqrt(ox * ox + oy * oy) || 1;
      var reach = radius * 0.62;
      if (distance < reach) {
        var amount = Math.pow(1 - distance / reach, 1.6) * radius * 0.2 * easeOutCubic(burst.t);
        dx += (ox / distance) * amount;
        dy += (oy / distance) * amount;
      }
    });

    var energy = 0;
    ripples.forEach(function (ripple) {
      var progress = (frameTime - ripple.start) / RIPPLE_MS;
      if (progress < 0 || progress >= 1) return;
      var ox = point.x - ripple.x;
      var oy = point.y - ripple.y;
      var distance = Math.sqrt(ox * ox + oy * oy) || 1;
      // 波面からの距離。波面の前後だけが、押し出されたり引き戻されたりして揺れる
      var offset = distance - ripple.radius(progress);
      var envelope = Math.exp(-Math.pow(offset / (radius * 0.26), 2));
      if (envelope < 0.01) return;
      var fade = Math.pow(1 - progress, 1.6);
      var wobble = Math.cos(offset / (radius * 0.09));
      var amount = radius * 0.14 * envelope * wobble * fade;
      dx += (ox / distance) * amount;
      dy += (oy / distance) * amount;
      energy += envelope * fade;
    });

    point.x += dx;
    point.y += dy;
    return energy;
  }

  function addRipple(x, y) {
    if (reducedMotion) return;
    var start = performance.now();
    // だんだん遅くなりながら、球の反対側まで届く
    var reach = radius * 2.2;
    ripples.push({
      x: x,
      y: y,
      start: start,
      radius: function (progress) { return reach * (1 - Math.pow(1 - progress, 1.8)); }
    });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
  }

  function drawRipples() {
    ripples.forEach(function (ripple) {
      var progress = (frameTime - ripple.start) / RIPPLE_MS;
      if (progress < 0 || progress >= 1) return;
      var fade = Math.pow(1 - progress, 2);
      // 波面と、少し遅れて続く余震の輪
      [0, radius * 0.16].forEach(function (lag, k) {
        var r = ripple.radius(progress) - lag;
        if (r <= 0) return;
        ctx.strokeStyle = "rgba(157, 188, 255, " + ((k ? 0.08 : 0.2) * fade).toFixed(3) + ")";
        ctx.lineWidth = k ? 1 : 1.5;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    });
  }

  function focusAmount() {
    return focusLevel < 0.005 ? 0 : focusLevel;
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    var focus = focusAmount();
    drawRipples();

    // 隙間を埋める文字（球の後ろの淡い光は CSS の背景で描いている）
    glyphs.forEach(function (glyph, i) {
      var grow = introProgress(now, i / GLYPH_COUNT);
      if (grow <= 0) return;
      var s = project(glyph.base, 0.985 * grow, glyph.screen);
      var energy = push(s);
      var depth = (s.z + 1) / 2;
      var shimmer = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(now / 900 + glyph.twinkle);
      var alpha = (0.05 + 0.3 * depth * depth) * shimmer * grow * (1 - focus * 0.35);
      alpha = Math.min(1, alpha + Math.min(1, energy) * 0.45 * (0.3 + 0.7 * depth));
      if (alpha < 0.015) return;
      ctx.globalAlpha = alpha;
      drawSprite(glyphSprite(glyph.char), s.x, s.y, 1, s.squeeze);
    });
    ctx.globalAlpha = 1;

    // 語の位置を計算してから、奥から手前の順に描く
    var order = [];
    words.forEach(function (word, i) {
      var grow = introProgress(now, ((i * stride) % count) / count);
      var s = project(word.base, grow, word.screen);
      s.grow = grow;
      s.energy = push(s);
      order.push(i);
    });
    order.sort(function (a, b) { return words[a].screen.z - words[b].screen.z; });

    // 共起語への線（語の下に描く）
    bursts.forEach(function (burst) {
      var origin = words[burst.index];
      var t = easeOutCubic(burst.t);
      origin.related.forEach(function (index) {
        var other = words[index].screen;
        var depth = (other.z + 1) / 2;
        ctx.strokeStyle = rgba(origin.color, 0.32 * t * (0.3 + 0.7 * depth));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(origin.screen.x, origin.screen.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
      });
    });

    order.forEach(function (i) {
      var word = words[i];
      var s = word.screen;
      if (s.grow <= 0) return;
      var depth = (s.z + 1) / 2;
      var emphasis = 0;
      var link = 0;
      bursts.forEach(function (burst) {
        if (burst.index === i) emphasis = Math.max(emphasis, burst.t);
        else if (words[burst.index].related.indexOf(i) !== -1) link = Math.max(link, burst.t);
      });

      // 奥の語は暗く小さく。展開中は、それ以外の語を少し沈める（共起語は沈めない）。
      // 展開・共起の度合いに比例させ、語から語へ移るときに明るさが跳ねないようにする
      var alpha = (0.05 + 0.95 * Math.pow(depth, 2.4)) * s.grow;
      alpha *= 1 - focus * (0.55 - 0.45 * link) * (1 - emphasis);
      alpha = Math.min(1, alpha + emphasis * 0.6 + Math.min(1, s.energy) * 0.3 * depth);
      var scale = Math.pow(s.scale, 0.8) * (1 + emphasis * 0.25);
      var size = word.size * scale;
      // 展開中の語は正面向きに戻して読みやすくする
      var squeeze = s.squeeze + (1 - s.squeeze) * emphasis;

      s.alpha = alpha;
      s.halfW = (word.width * scale * squeeze) / 2;
      s.halfH = size * 0.6;
      if (alpha < 0.02) return;

      if (emphasis > 0.01) {
        // 光彩付きの画像は warmGlows() が先に作っておく（まだなら、ここで作る）
        if (!word.glow) word.glow = makeGlow(word);
        ctx.globalAlpha = 0.85 * emphasis;
        drawSprite(word.glow, s.x, s.y, scale, squeeze);
      }
      ctx.globalAlpha = alpha;
      drawSprite(word.sprite, s.x, s.y, scale, squeeze);
      ctx.globalAlpha = 1;
    });

    bursts.forEach(drawSatellites);
  }

  // 展開時に周りへ浮かぶ語: 多言語表現 → 近い概念 → （どちらも無ければ）共起語
  function satellitesFor(word) {
    var items = (word.term.variants || []).map(function (variant) {
      return { text: variant.text, lang: variant.lang, kind: "variant" };
    });
    (word.term.concepts || []).forEach(function (concept) {
      items.push({ text: concept, kind: "concept" });
    });
    if (!items.length) {
      (word.term.related || []).forEach(function (name) {
        items.push({ text: name, kind: "concept" });
      });
    }
    return items.slice(0, MAX_SATELLITES);
  }

  function drawSatellites(burst) {
    var word = words[burst.index];
    var origin = word.screen;
    var items = satellitesFor(word);
    if (!items.length) return;

    // 球の中心から見て外側を向く方向を中心に、扇状に並べる
    var ox = origin.x - centerX;
    var oy = origin.y - centerY;
    var outward = Math.abs(ox) + Math.abs(oy) < radius * 0.15 ? -Math.PI / 2 : Math.atan2(oy, ox);
    var step = Math.min(0.72, (Math.PI * 1.7) / items.length);
    var size = Math.max(11, radius / 15);
    var boxes = items.map(function (item, k) {
      var angle = outward + (k - (items.length - 1) / 2) * step;
      var reach = radius * (0.5 + (k % 2) * 0.12);
      var labelWidth = textWidth((item.kind === "variant" ? "700 " : "400 ") + size + "px " + fontSans, item.text);
      var tagWidth = item.lang ? size * 1.6 : item.kind === "concept" ? size * 1.1 : 0;
      return {
        item: item,
        k: k,
        x: origin.x + Math.cos(angle) * reach * 1.15,
        y: origin.y + Math.sin(angle) * reach * 0.72,
        w: labelWidth + tagWidth,
        h: size * 1.5,
        tagWidth: tagWidth
      };
    });

    // 重なった語どうしを上下に少しずらし、キャンバスの内側に収める
    for (var pass = 0; pass < 4; pass++) {
      for (var a = 0; a < boxes.length; a++) {
        for (var b = a + 1; b < boxes.length; b++) {
          var A = boxes[a];
          var B = boxes[b];
          var overlapX = (A.w + B.w) / 2 + 18 - Math.abs(A.x - B.x);
          var overlapY = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
          if (overlapX > 0 && overlapY > 0) {
            var shift = (overlapY / 2) * (A.y < B.y ? -1 : 1);
            A.y += shift;
            B.y -= shift;
          }
        }
      }
    }
    boxes.forEach(function (box) {
      box.x = Math.max(box.w / 2 + 14, Math.min(width - box.w / 2 - 14, box.x));
      box.y = Math.max(box.h / 2 + 8, Math.min(height - box.h / 2 - 8, box.y));
    });

    boxes.forEach(function (box) {
      // 1 語ずつ少し遅れて、中心の語からふわっと出てくる
      var t = easeOutCubic(clamp01((burst.t - box.k * 0.05) / 0.7));
      if (t <= 0.01) return;
      var x = origin.x + (box.x - origin.x) * t;
      var y = origin.y + (box.y - origin.y) * t;
      var item = box.item;
      var color = item.kind === "variant" ? VARIANT_COLOR : word.color;

      ctx.strokeStyle = rgba(word.color, 0.22 * t);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      // 後ろの語と重なっても読めるよう、うっすら下地を敷く
      ctx.fillStyle = "rgba(8, 12, 26, " + (0.72 * t).toFixed(3) + ")";
      roundRect(x - box.w / 2 - 7, y - box.h / 2, box.w + 14, box.h, box.h / 2);
      ctx.fill();

      var left = x - box.w / 2;
      if (box.tagWidth) {
        ctx.font = "500 " + (size * 0.62).toFixed(1) + "px " + fontMono;
        ctx.textAlign = "left";
        ctx.fillStyle = rgba(word.color, 0.7 * t);
        ctx.fillText(item.lang ? item.lang.toUpperCase() : "≈", left, y + 0.5);
      }
      ctx.font = (item.kind === "variant" ? "700 " : "400 ") + size + "px " + fontSans;
      ctx.textAlign = "left";
      ctx.fillStyle = rgba(color, (item.kind === "variant" ? 0.95 : 0.78) * t);
      ctx.fillText(item.text, left + box.tagWidth, y);
      ctx.textAlign = "center";
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ==================================================
  // ループ
  // ==================================================
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    frameTime = now;
    update(dt);
    if (pointer && !drag && !sticky) hover();
    if (!reducedMotion || !isIdle(now)) {
      draw(now);
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  function setRunning(next) {
    if (next === running) return;
    running = next;
    if (running) {
      lastTime = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function refreshRunning() {
    setRunning(visible && !document.hidden);
  }

  // ==================================================
  // 選択と情報カード
  // ==================================================
  function hitTest(x, y) {
    // 展開中の語の上（少し外側まで）は、重なった別の語より優先する。
    // 周りの語が退く動きで当たり判定が揺れ、2 語の間で行ったり来たりするのを防ぐ
    if (active >= 0) {
      var current = words[active].screen;
      if (Math.abs(x - current.x) <= current.halfW + 10 && Math.abs(y - current.y) <= current.halfH + 10) return active;
    }
    var best = -1;
    var bestZ = -Infinity;
    words.forEach(function (word, i) {
      var s = word.screen;
      // 裏側の語は選べない
      if (s.z < -0.15 || s.alpha < 0.2) return;
      if (Math.abs(x - s.x) <= s.halfW + 4 && Math.abs(y - s.y) <= s.halfH + 4 && s.z > bestZ) {
        best = i;
        bestZ = s.z;
      }
    });
    return best;
  }

  function hover() {
    var hit = hitTest(pointer.x, pointer.y);
    if (hit >= 0) {
      clearTimeout(leaveTimer);
      leaveTimer = 0;
      if (hit !== active) setActive(hit, false);
    } else if (active >= 0 && !leaveTimer) {
      // 展開された語の近くにいる間は閉じない（周りの多言語表現を読めるように）
      var s = words[active].screen;
      var distance = Math.sqrt(Math.pow(pointer.x - s.x, 2) + Math.pow(pointer.y - s.y, 2));
      if (distance > radius * 0.75) {
        leaveTimer = setTimeout(function () {
          leaveTimer = 0;
          if (!sticky) setActive(-1, false);
        }, 160);
      }
    }
    canvas.classList.toggle("is-pointing", hit >= 0);
  }

  function setActive(index, isSticky, fromKeyboard) {
    sticky = index >= 0 && isSticky;
    byKeyboard = sticky && !!fromKeyboard;
    if (index === active) return;
    bursts.forEach(function (burst) { burst.open = false; });
    active = index;
    if (index >= 0) {
      var existing = bursts.filter(function (burst) { return burst.index === index; })[0];
      if (existing) existing.open = true;
      else bursts.push({ index: index, t: 0, open: true });
    }
    renderInfo();
    dirty = true;
  }

  function linkFor(term) {
    var link = term.link || {};
    if (!link.hash) return "";
    return (link.page === "products" ? productsUrl : "") + "#" + link.hash;
  }

  function navigate(index) {
    var term = words[index].term;
    var link = term.link || {};
    if (!link.hash) return;
    if (link.page === "products") {
      window.location.href = linkFor(term);
      return;
    }
    var section = document.getElementById(link.hash);
    if (!section) return;
    var container = section.closest("[data-collapsible-section]");
    var sectionToggle = container && container.querySelector("[data-section-toggle]");
    if (sectionToggle && sectionToggle.getAttribute("aria-expanded") === "false") sectionToggle.click();
    scrollToSection(section);
    if (history.replaceState) history.replaceState(null, "", "#" + link.hash);
  }

  // ブラウザ標準の smooth スクロールは速すぎて速さも指定できないので、自前でゆっくり動かす。
  // 遠いセクションほど少し長くかける（0.8〜1.2 秒）。ホイールやタッチで操作したら止める
  var scrollFrame = 0;

  function scrollToSection(section) {
    var startY = window.pageYOffset;
    var targetY = Math.max(0, section.getBoundingClientRect().top + startY - 16);
    var distance = targetY - startY;
    if (reducedMotion || Math.abs(distance) < 2) {
      window.scrollTo(0, targetY);
      return;
    }
    var duration = 800 + Math.min(Math.abs(distance), 8000) * 0.05;
    var start = performance.now();

    function stop() {
      cancelAnimationFrame(scrollFrame);
      ["wheel", "touchstart", "keydown"].forEach(function (type) { window.removeEventListener(type, stop); });
    }
    stop();
    // Enter キーで移動したとき、その keydown 自身で止まらないよう、登録は次のタイミングにする
    setTimeout(function () {
      ["wheel", "touchstart", "keydown"].forEach(function (type) { window.addEventListener(type, stop, { passive: true }); });
    }, 0);

    (function step(now) {
      var t = clamp01((now - start) / duration);
      // easeInOutCubic: ゆっくり動き出し、ゆっくり止まる
      var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, startY + distance * eased);
      if (t < 1) scrollFrame = requestAnimationFrame(step);
      else stop();
    })(start);
  }

  // 選んだ語の情報を読み上げ用の領域に書く（画面には出さない。多言語表現は球体の上に見えている）
  function renderInfo() {
    if (active < 0) {
      info.textContent = "";
      return;
    }
    var term = words[active].term;
    var parts = [
      term.term,
      ((labels.categories || {})[term.category] || term.category) + " · " + (labels.score || "TF-IDF") + " " + term.score.toFixed(2)
    ];
    if (term.variants && term.variants.length) {
      parts.push(term.variants.map(function (variant) { return variant.lang + ": " + variant.text; }).join(", "));
    }
    if (term.related && term.related.length) parts.push((labels.related || "") + term.related.join(" / "));
    info.textContent = parts.join(document.documentElement.lang === "ja" ? "。" : ". ");
  }

  // ==================================================
  // 入力
  // ==================================================
  function localPoint(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", function (event) {
    // クリック・タップでフォーカスが移ると、モバイルではキャンバスへ自動スクロールしてしまう。
    // フォーカスは Tab キーで移ったときだけにする
    event.preventDefault();
    var point = localPoint(event);
    drag = { x: point.x, y: point.y, startX: point.x, startY: point.y, time: performance.now(), moved: false, type: event.pointerType };
    target = null;
    yawVelocity = 0;
    pitchVelocity = 0;
    canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", function (event) {
    var point = localPoint(event);
    if (event.pointerType === "mouse") {
      pointer = point;
      if (!reducedMotion) {
        // マウス位置に応じて、球体がわずかに寄る
        parallax.tx = (point.x / width - 0.5) * 14;
        parallax.ty = (point.y / height - 0.5) * 10;
      }
    }
    if (!drag) return;

    var dx = point.x - drag.x;
    var dy = point.y - drag.y;
    if (!drag.moved && Math.abs(point.x - drag.startX) + Math.abs(point.y - drag.startY) > 5) {
      drag.moved = true;
      canvas.classList.add("is-dragging");
      if (!sticky) setActive(-1, false);
    }
    if (!drag.moved) return;

    var now = performance.now();
    var dt = Math.max(0.001, (now - drag.time) / 1000);
    yaw += dx * DRAG_SPEED;
    // タッチでは縦の動きをページのスクロールに任せる（touch-action: pan-y）
    if (drag.type === "mouse" || drag.type === "pen") pitch += dy * DRAG_SPEED;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    if (!reducedMotion) {
      // 離したときの慣性に使う速度（直近の動きを重めに平均する）
      yawVelocity = yawVelocity * 0.5 + ((dx * DRAG_SPEED) / dt) * 0.5;
      pitchVelocity = drag.type === "touch" ? 0 : pitchVelocity * 0.5 + ((dy * DRAG_SPEED) / dt) * 0.5;
    }
    drag.x = point.x;
    drag.y = point.y;
    drag.time = now;
    dirty = true;
  });

  function endDrag(event, cancelled) {
    if (!drag) return;
    var wasTap = !drag.moved && !cancelled;
    var type = drag.type;
    // 少し止めてから離した場合は、慣性を付けない
    if (performance.now() - drag.time > 90) {
      yawVelocity = 0;
      pitchVelocity = 0;
    }
    drag = null;
    canvas.classList.remove("is-dragging");
    if (!wasTap) return;

    var point = localPoint(event);
    var hit = hitTest(point.x, point.y);
    if (hit < 0) {
      // 何もないところは、そこから波紋が広がる
      addRipple(point.x, point.y);
      setActive(-1, false);
    } else if (type === "mouse") {
      navigate(hit);
    } else if (hit === active) {
      // タッチでは 1 回目で展開し、展開中の語をもう一度タップしたら移動する
      navigate(hit);
    } else {
      setActive(hit, true);
    }
  }

  canvas.addEventListener("pointerup", function (event) { endDrag(event, false); });
  canvas.addEventListener("pointercancel", function (event) { endDrag(event, true); });

  canvas.addEventListener("pointerleave", function (event) {
    if (event.pointerType !== "mouse") return;
    pointer = null;
    parallax.tx = 0;
    parallax.ty = 0;
    canvas.classList.remove("is-pointing");
    if (!sticky) setActive(-1, false);
  });

  // キーボード: ← → で重要度順に語を選び、Enter で移動、Esc で閉じる
  canvas.addEventListener("keydown", function (event) {
    var next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = active < 0 ? 0 : (active + 1) % count;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = active < 0 ? count - 1 : (active - 1 + count) % count;
    else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      navigate(active);
      return;
    } else if (event.key === "Escape" && active >= 0) {
      setActive(-1, false);
      return;
    } else {
      return;
    }
    event.preventDefault();
    target = facingAngles(words[next].base);
    yawVelocity = 0;
    pitchVelocity = 0;
    setActive(next, true, true);
  });

  // 情報カードのリンクへ Tab で移るときは閉じない
  canvas.addEventListener("blur", function (event) {
    if (byKeyboard && !(event.relatedTarget && root.contains(event.relatedTarget))) setActive(-1, false);
  });

  // ==================================================
  // 起動
  // ==================================================
  stage.hidden = false;
  resize();

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(stage);
  } else {
    window.addEventListener("resize", resize);
  }

  // 画面外やタブが裏にあるときは描画を止める
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      refreshRunning();
    }).observe(root);
  }
  document.addEventListener("visibilitychange", refreshRunning);

  // 日本語の Web フォントは文字の範囲ごとに分かれて届く。展開時に浮かぶ語も含めて先に読み込み、
  // 届いたら画像を作り直す（描いている途中でフォントが差し替わって文字がちらつくのを防ぐ）
  if (document.fonts && document.fonts.load) {
    var sample = terms.map(function (term) {
      return [term.term]
        .concat((term.variants || []).map(function (variant) { return variant.text; }))
        .concat(term.concepts || [])
        .join("");
    }).join("");
    Promise.all(["400", "700", "800"].map(function (weight) {
      return document.fonts.load(weight + " 16px " + fontSans, sample);
    })).then(resize, function () {});
  }

  startTime = performance.now();
  refreshRunning();
})();
