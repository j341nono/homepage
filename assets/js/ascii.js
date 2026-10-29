// ==================================================
// ASCII モード（/ascii/）
// ==================================================
// _includes/ascii.html の装飾を担当する。どれも失敗しても本文はそのまま読める。
// - 星空: 背景の固定 Canvas に、文字の星をまたたかせる
// - 地球儀: Natural Earth（1:110m）の陸地を 192×96 のビットマップにしたものを、文字の球体として描く。
//           昼側は陸地を濃淡の文字、夜側は街明かり、海は波と太陽の照り返しで表す。
//           表面には Language Globe と同じ TF-IDF の語を浮かべ、クリックで該当セクションへ移動する
// - 画像: プロフィール写真とプロダクトのサムネイルを、その場で ASCII アートに変換する
// - 見出し: セクションが画面に入ったときにコマンドを打ち込み、見出しの文字を解読するように表示する
(function () {
  "use strict";

  var page = document.querySelector("[data-ascii-page]");
  if (!page) return;

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FONT_FAMILY = '"JetBrains Mono", "M PLUS 1 Code", ui-monospace, Menlo, monospace';
  var GLYPHS = " .`:-=+*#%@";
  var NOISE = "!<>-_/\\[]{}=+*^?#%@$";
  var NOISE_WIDE = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ";

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('14px "JetBrains Mono"'),
      document.fonts.load('14px "M PLUS 1 Code"', "語")
    ]).catch(function () {});
  }

  function pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  // ==================================================
  // 星空
  // ==================================================
  (function sky() {
    var canvas = document.querySelector("[data-ascii-sky]");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;

    var STAR_CHARS = [".", ".", "·", "·", "+", "*"];
    var stars = [];
    var meteor = null;
    var width = 0;
    var height = 0;
    var last = 0;

    function resize() {
      var ratio = pixelRatio();
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      var count = Math.round((width * height) / 7000);
      stars = [];
      for (var i = 0; i < count; i++) {
        var tint = Math.random();
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height * 1.3,
          char: STAR_CHARS[Math.floor(Math.random() * STAR_CHARS.length)],
          size: 9 + Math.random() * 5,
          base: 0.15 + Math.random() * 0.45,
          speed: 0.4 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
          depth: 0.02 + Math.random() * 0.08,
          color: tint > 0.93 ? "116,201,255" : tint > 0.88 ? "255,124,185" : "205,218,240"
        });
      }
      draw(performance.now());
    }

    function draw(time) {
      var seconds = time / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = "middle";
      var scroll = window.scrollY || 0;
      var span = height * 1.3;
      stars.forEach(function (star) {
        var twinkle = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(seconds * star.speed + star.phase);
        var y = ((star.y - scroll * star.depth) % span + span) % span;
        if (y > height) return;
        ctx.font = star.size + "px " + FONT_FAMILY;
        ctx.fillStyle = "rgba(" + star.color + "," + (star.base * twinkle).toFixed(3) + ")";
        ctx.fillText(star.char, star.x, y);
      });

      // ときどき流れ星
      if (!reducedMotion) {
        if (!meteor && Math.random() < 0.004) {
          meteor = { x: Math.random() * width * 0.8 + width * 0.2, y: Math.random() * height * 0.4, life: 0 };
        }
        if (meteor) {
          meteor.life += 1;
          ctx.font = "12px " + FONT_FAMILY;
          for (var i = 0; i < 9; i++) {
            var progress = meteor.life - i * 0.7;
            if (progress < 0) continue;
            ctx.fillStyle = "rgba(220,235,255," + (0.8 * (1 - i / 9)).toFixed(3) + ")";
            ctx.fillText(i === 0 ? "*" : i < 4 ? "=" : "-", meteor.x - progress * 14, meteor.y + progress * 6);
          }
          if (meteor.life > 40) meteor = null;
        }
      }
    }

    function loop(time) {
      if (time - last > 80 && !document.hidden) {
        last = time;
        draw(time);
      }
      window.requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    fontsReady().then(resize);
    resize();
    if (reducedMotion) {
      window.addEventListener("scroll", function () { draw(performance.now()); }, { passive: true });
    } else {
      window.requestAnimationFrame(loop);
    }
  })();

  // ==================================================
  // 地球儀
  // ==================================================
  (function globe() {
    var root = document.querySelector("[data-ascii-globe]");
    var canvas = root && root.querySelector("canvas");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;

    var payload = {};
    try {
      payload = JSON.parse(root.querySelector("[data-ascii-globe-data]").textContent);
    } catch (error) {}

    var hudRotation = root.querySelector("[data-ascii-hud-rotation]");
    var hudTerm = root.querySelector("[data-ascii-hud-term]");
    var hudHint = hudTerm ? hudTerm.textContent : "";

    // 陸地: 1 ビット = 経度 1.875° × 緯度 1.875°。北から南へ、各行は西経 180° から東へ並ぶ
    var MAP_W = 192;
    var MAP_H = 96;
    var LAND = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AMAAAAAAAAAAAAAAAAAAAAAAACA/4///+8BAAAAAAAAAAAAAAAAAAAAAADg/+H//z8AQDsAAAAAHAAAAAAAAAAAABAgPvz//z8AABsAAAAAAAAAAAAAAAAAAKzOAAD//x8AAAAAAAcA/B8ADgAAAAAAwANgAAD8/x8AAAAAYADA/wcAAAAAAAAA4L4s/wD4/wcAAAAAMGD+//8f/AAAAPwBAPBj/g/4/wMAAPAAAHD//////x8Agf///8fAHQ/w/wEAAP6f0G//////////H///////D37wPwAAgP87/7//////////iP//////zR/wA/AAwOf3////////////AP////9/AAzgAQAA+Pv/////////////AH////8/gAfAAQAA+Pn//////////6cPADzA//8/wCcAAAAA2PP/////////D2IAABgA/v//gH8AAABg4On/////////A3gAAAIA/P//x/8AAABgUPj/////////ATgAAAAA+v//z/8DAADY+P//////////BxgAAAAA8P//3/8DAADg/f//////////BwgAAAAA0P///08CAAAA////////////FwAAAAAAgP///x8PAADA////////////AwAAAAAAwP///78AAACA///08///////AQAAAAAAwP///ycAAACAb3/g+f//////OAAAAAAAwP///wMAAAD4w3zA8/////8fAAAAAAAAwP///wEAAAD4EN//9/////8eCAAAAAAAwP///wAAAAD4ANn/4////38YBAAAAAAAgP///wAAAAAgPoD6//////8ZBgAAAAAAAP//fwAAAADgPwD6///////IAwAAAAAAAP7/HwAAAAD4fwj4//////8hAAAAAAAAAPT/HwAAAAD4/3n///////8BAAAAAAAAAPAfEAAAAAD8///5+/////8BAAAAAAAAAOgPEAAAAAD+///78/////8AAAAAAAAAANAPAAAAAAD////zL/////8AAAAAAAAAAKAPAAAAAID////nf+D//z8BAAAAAAAAAAAPQAAAAID////v/+B//g8AAAAAAAAAAAAfAQIAAID////Pf4A//AQAAAAAAAAAAAD8AQAAAID////fP4AP/AEBAAAAAAAAAADQAQAAAID///+fD4AH9AMBAAAAAAAAAACADwAAAID///+/AwAH8AMDAAAAAAAAAAAABAAAAID///9/AAAHgAMEAAAAAAAAAAAADN8AAAD/////BwACAIEAAAAAAAAAAAAA2P8AAAD+////BwACEAAEAAAAAAAAAAAAgP8BAAD8////AwAIIEAEAAAAAAAAAAAAgP8PAAAI6P//AwAASGAAAAAAAAAAAAAAwP8fAAAA4P//AQAAUHAAAAAAAAAAAAAAwP8fAAAA4P9/AAAAYHwVAAAAAAAAAAAA4P9/AAAA4P8/AAAAYHxCAAAAAAAAAAAA4P//AwAA4P8fAAAAwLjABwEAAAAAAAAA4P//DwAAwP8fAAAAgAACPgIAAAAAAAAA4P//HwAAgP8fAAAAAAMAfAAAAAAAAAAAwP//HwAAgP8fAAAAACALSAAAAAAAAAAAwP//HwAAgP8fAAAAAAAAAAAAAAAAAAAAgP//DwAAgP8/AAAAAACAAQAAAAAAAAAAgP//BwAAgP8/BAAAAADoEAAAAAAAAAAAAP//BwAAwP8fBwAAAAD8OQAAAAAAAAAAAPz/BwAAwP+PAwAAAAD+PwAAAAAAAAAAAPj/BwAAgP8HAwAAAAD/fwAAAAAAAAAAAPj/AwAAgP+HAwAAAOD//wABAAAAAAAAAPz/AAAAAP+HAQAAAOD//wAAAAAAAAAAAPw/AAAAAP8DAQAAAOD//wMAAAAAAAAAAPw/AAAAAP8BAAAAAOD//wMAAAAAAAAAAPw/AAAAAP4BAAAAAOD//wMAAAAAAAAAAPwfAAAAAP4AAAAAAMD//wMAAAAAAAAAAPwPAAAAAHwAAAAAAMAH/wEAAAAAAAAAAP4FAAAAAAQAAAAAAEAA/wAAAAAAAAAAAP4DAAAAAAAAAAAAAAAA+AAAAAAAAAAAAP4BAAAAAAAAAAAAAAAAMABgAAAAAAAAAH4AAAAAAAAAAAAAAAAAAAAgAAAAAAAAAB8AAAAAAAAAAAAAAAAAQAAYAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAMAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAGAAAAAAAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAeAAAwBjiAQAAAAAAAAAAABAAAAAAAACA/x/8/////wAAAAAAAAAAAHQAAAAAkI///4///////z8AAAAAAAAcAHUAAAD8/////9////////8HAAAAAAj+/38AAAD///////////////8BAAD8/////w8AAOD//////////////38AAPD//////wEAwP////////////////8AAAD+////fwDgAf///////////////z8AAOD//////x8A/P///////////////z8AAMD///////////////////////////8D//f8////////////////////////////////////////////////////////////////////////////////////////////";
    var land = new Uint8Array(MAP_W * MAP_H);
    var coast = new Uint8Array(MAP_W * MAP_H);
    (function decodeLand() {
      var bytes = atob(LAND);
      for (var k = 0; k < MAP_W * MAP_H; k++) {
        land[k] = (bytes.charCodeAt(k >> 3) >> (k & 7)) & 1;
      }
      for (var row = 0; row < MAP_H; row++) {
        for (var col = 0; col < MAP_W; col++) {
          var index = row * MAP_W + col;
          if (!land[index]) continue;
          var left = row * MAP_W + (col + MAP_W - 1) % MAP_W;
          var right = row * MAP_W + (col + 1) % MAP_W;
          var up = Math.max(0, row - 1) * MAP_W + col;
          var down = Math.min(MAP_H - 1, row + 1) * MAP_W + col;
          coast[index] = land[left] && land[right] && land[up] && land[down] ? 0 : 1;
        }
      }
    })();

    var DEG = Math.PI / 180;
    var LAND_RAMP = ".:-=+*#%@";
    var OCEAN_RAMP = "  ..·~";
    var AUTO_SPEED = 0.13;
    var TILT = 0.36;
    var SUN = normalize([-0.62, 0.38, 0.69]);
    var HOME = { lat: 33.85 * DEG, lon: 132.77 * DEG };
    var CATEGORY_COLORS = {
      research: "116,201,255",
      products: "124,245,200",
      events: "200,170,255",
      internships: "255,191,102",
      achievements: "255,214,120",
      misc: "205,218,240"
    };

    function normalize(v) {
      var length = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / length, v[1] / length, v[2] / length];
    }

    function hash(a, b) {
      var value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return value - Math.floor(value);
    }

    // 語は Fibonacci sphere 上に並べる（Language Globe と同じ考え方）
    // 移動先のセクションがページに無い語（非表示のセクションなど）は浮かべない
    var terms = (payload.terms || []).filter(function (item) {
      return item.link && document.getElementById(item.link.hash);
    }).map(function (item, index, list) {
      var y = 1 - (2 * (index + 0.5)) / list.length;
      var radius = Math.sqrt(1 - y * y);
      var theta = index * Math.PI * (3 - Math.sqrt(5));
      return {
        item: item,
        point: [Math.cos(theta) * radius, y * 0.86, Math.sin(theta) * radius],
        color: CATEGORY_COLORS[item.category] || CATEGORY_COLORS.misc
      };
    });

    // 回転: view = Rx(pitch) · Ry(yaw) · globe
    var yaw = -(132.77 + 38) * DEG;
    var pitch = TILT;
    var yawVelocity = 0;
    var dragging = null;
    var hovered = null;
    var hitBoxes = [];

    var width = 0;
    var height = 0;
    var fontSize = 12;
    var cellW = 7;
    var cellH = 12;
    var radius = 100;
    var centerX = 0;
    var centerY = 0;
    var cells = [];
    var buckets = {};

    function toView(p) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var x = p[0] * cy + p[2] * sy;
      var z = -p[0] * sy + p[2] * cy;
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      return [x, p[1] * cp - z * sp, p[1] * sp + z * cp];
    }

    function latLonToPoint(lat, lon) {
      return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var ratio = pixelRatio();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      // 球の直径が 70〜100 文字ほどになる大きさの文字で描く
      radius = Math.min(width, height) * 0.4;
      fontSize = clamp((radius * 2) / 92 / 0.6, 7, 13);
      ctx.font = fontSize + "px " + FONT_FAMILY;
      cellW = ctx.measureText("M").width || fontSize * 0.6;
      cellH = fontSize * 1.02;
      centerX = width / 2;
      centerY = height / 2;

      // 球と大気の範囲にある文字のマスだけ、視点側の法線を先に求めておく
      cells = [];
      var cols = Math.ceil(width / cellW);
      var rows = Math.ceil(height / cellH);
      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
          var x = (col + 0.5) * cellW;
          var y = (row + 0.5) * cellH;
          var u = (x - centerX) / radius;
          var v = (centerY - y) / radius;
          var r2 = u * u + v * v;
          if (r2 > 1.24) continue;
          cells.push({ x: x, y: y, u: u, v: v, r: Math.sqrt(r2), z: r2 < 1 ? Math.sqrt(1 - r2) : 0, seed: hash(col, row) });
        }
      }
      render(performance.now());
    }

    function put(color, alpha, char, x, y) {
      var level = Math.round(clamp(alpha, 0, 1) * 12);
      if (!level || char === " ") return;
      var key = color + "|" + level;
      (buckets[key] || (buckets[key] = [])).push(char, x, y);
    }

    function flush() {
      Object.keys(buckets).forEach(function (key) {
        var parts = key.split("|");
        var list = buckets[key];
        ctx.fillStyle = "rgba(" + parts[0] + "," + (parts[1] / 12).toFixed(3) + ")";
        for (var i = 0; i < list.length; i += 3) {
          ctx.fillText(list[i], list[i + 1], list[i + 2]);
        }
      });
      buckets = {};
    }

    function drawSphere(seconds) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var gridWidth = (cellW / radius) * 0.75;

      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];

        // 大気: 球の外側を、太陽側ほど明るい点で縁取る
        if (cell.r >= 1) {
          var glow = (1.11 - cell.r) / 0.11;
          if (glow <= 0) continue;
          var side = 0.35 + 0.65 * Math.max(0, (cell.u * SUN[0] + cell.v * SUN[1]) / cell.r);
          if (cell.seed < 0.55) put("116,201,255", glow * glow * side * 0.6, cell.seed < 0.2 ? "·" : ".", cell.x, cell.y);
          continue;
        }

        var nx = cell.u, ny = cell.v, nz = cell.z;
        // 視点側 → 地球側（pitch・yaw を戻す）
        var y1 = ny * cp + nz * sp;
        var z1 = -ny * sp + nz * cp;
        var gx = nx * cy - z1 * sy;
        var gz = nx * sy + z1 * cy;
        var lat = Math.asin(clamp(y1, -1, 1));
        var lon = Math.atan2(gx, gz);

        var mapCol = Math.floor(((lon + Math.PI) / (Math.PI * 2)) * MAP_W) % MAP_W;
        var mapRow = clamp(Math.floor(((Math.PI / 2 - lat) / Math.PI) * MAP_H), 0, MAP_H - 1);
        var index = mapRow * MAP_W + mapCol;
        var light = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
        var day = clamp((light + 0.12) / 0.5, 0, 1);
        var limb = 0.55 + 0.45 * nz;

        if (land[index]) {
          if (day > 0) {
            var intensity = clamp(0.18 + 0.82 * light, 0, 1) * day;
            var char = coast[index] ? (intensity > 0.5 ? "#" : "+") : LAND_RAMP[Math.round(intensity * (LAND_RAMP.length - 1))];
            put(coast[index] ? "190,255,230" : "124,245,200", (0.45 + 0.55 * intensity) * limb, char, cell.x, cell.y);
          }
          // 夜側の街明かり（マスごとに固定の乱数で配置し、少しだけ瞬く）
          if (day < 1) {
            var city = hash(mapCol, mapRow);
            if (city < 0.28) {
              var flicker = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(seconds * 3 + city * 40);
              put("255,191,102", (1 - day) * (0.45 + city * 1.8) * flicker * limb, city < 0.08 ? "*" : "·", cell.x, cell.y);
            } else if (day < 0.5) {
              put("80,96,140", (1 - day) * 0.35 * limb, ":", cell.x, cell.y);
            }
          }
          continue;
        }

        // 海: 経緯線・太陽の照り返し・ゆっくり流れる波
        var latDeg = lat / DEG;
        var lonDeg = lon / DEG;
        var onLat = Math.abs(latDeg - Math.round(latDeg / 30) * 30) * DEG < gridWidth;
        var onLon = Math.abs(lonDeg - Math.round(lonDeg / 30) * 30) * DEG * Math.cos(lat) < gridWidth;
        var reflect = 2 * light * nz - SUN[2];
        var specular = Math.pow(Math.max(0, reflect), 48);

        if (specular > 0.3) {
          put("235,245,255", (0.25 + 0.75 * specular) * limb, specular > 0.7 ? "*" : "+", cell.x, cell.y);
        } else if (onLat || onLon) {
          if (cell.seed < 0.7) put("116,201,255", (0.12 + 0.22 * day) * limb, "·", cell.x, cell.y);
        } else {
          var wave = 0.5 + 0.5 * Math.sin(lon * 22 + lat * 9 + seconds * 0.9 + cell.seed * 2);
          var level = day * (0.25 + 0.75 * wave);
          if (level > 0.08) {
            put("74,140,220", (0.18 + 0.4 * level) * limb, OCEAN_RAMP[Math.round(level * (OCEAN_RAMP.length - 1))], cell.x, cell.y);
          } else if (cell.seed < 0.12) {
            put("60,80,130", 0.3 * limb, ".", cell.x, cell.y);
          }
        }
      }
    }

    // 地球を斜めに囲む軌道と衛星。球の裏に回った部分は描かない
    function ringPoint(t) {
      var x = Math.cos(t) * 1.42;
      var z = Math.sin(t) * 1.42;
      var tilt = 1.2, roll = -0.32;
      var y = -z * Math.sin(tilt);
      z = z * Math.cos(tilt);
      return [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll), z];
    }

    function drawRing(seconds, front) {
      var steps = Math.round((Math.PI * 2 * 1.42 * radius) / cellW);
      for (var i = 0; i < steps; i++) {
        var p = ringPoint((i / steps) * Math.PI * 2);
        if ((p[2] >= 0) !== front) continue;
        if (!front && p[0] * p[0] + p[1] * p[1] < 1) continue;
        var col = Math.round((centerX + p[0] * radius) / cellW - 0.5);
        var row = Math.round((centerY - p[1] * radius) / cellH - 0.5);
        put("116,201,255", front ? 0.42 : 0.18, i % 3 ? "·" : ".", (col + 0.5) * cellW, (row + 0.5) * cellH);
      }
      var phase = seconds * 0.35;
      for (var k = 0; k < 14; k++) {
        var s = ringPoint(phase - k * 0.035);
        if ((s[2] >= 0) !== front) continue;
        if (!front && s[0] * s[0] + s[1] * s[1] < 1) continue;
        put(k ? "124,245,200" : "255,255,255", k ? 0.85 * (1 - k / 14) : 1, k ? (k < 4 ? "=" : "-") : "◆", centerX + s[0] * radius, centerY - s[1] * radius);
      }
    }

    function drawLabel(text, x, y, color, alpha, highlight) {
      ctx.font = (highlight ? "700 " : "") + Math.round(fontSize * 1.15) + "px " + FONT_FAMILY;
      var label = highlight ? "[ " + text + " ]" : text;
      var w = ctx.measureText(label).width;
      var h = fontSize * 1.5;
      ctx.fillStyle = "rgba(4,6,12," + (0.72 * alpha).toFixed(3) + ")";
      ctx.fillRect(x - 3, y - h / 2, w + 6, h);
      ctx.fillStyle = "rgba(" + (highlight ? "255,255,255" : color) + "," + alpha.toFixed(3) + ")";
      ctx.fillText(label, x, y);
      return { x: x - 3, y: y - h / 2, w: w + 6, h: h };
    }

    function drawOverlay(seconds) {
      hitBoxes = [];

      // 愛媛（研究室の所在地）
      var home = toView(latLonToPoint(HOME.lat, HOME.lon));
      if (home[2] > 0.05) {
        var hx = centerX + home[0] * radius;
        var hy = centerY - home[1] * radius;
        var pulse = reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(seconds * 4);
        var fade = clamp((home[2] - 0.05) / 0.3, 0, 1);
        ctx.font = "700 " + Math.round(fontSize * 1.4) + "px " + FONT_FAMILY;
        ctx.fillStyle = "rgba(255,124,185," + (fade * pulse).toFixed(3) + ")";
        ctx.fillText("◉", hx - fontSize * 0.45, hy);
        ctx.font = fontSize + "px " + FONT_FAMILY;
        ctx.fillStyle = "rgba(255,124,185," + (fade * 0.8).toFixed(3) + ")";
        ctx.fillText("──── " + (payload.location || "EHIME"), hx + fontSize * 0.9, hy - fontSize * 1.6);
        ctx.fillRect(hx + fontSize * 0.6, hy - fontSize * 1.6, 1, fontSize * 1.2);
      }

      // TF-IDF の語。手前にある語ほど明るく、奥の語から順に描く
      var visible = [];
      terms.forEach(function (term) {
        var p = toView(term.point);
        if (p[2] > 0.12) visible.push({ term: term, p: p });
      });
      visible.sort(function (a, b) { return a.p[2] - b.p[2]; });
      visible.forEach(function (entry) {
        var p = entry.p;
        var alpha = clamp((p[2] - 0.12) / 0.5, 0, 1);
        var x = centerX + p[0] * radius * 1.04;
        var y = centerY - p[1] * radius * 1.04;
        var highlight = hovered === entry.term;
        ctx.font = fontSize + "px " + FONT_FAMILY;
        ctx.fillStyle = "rgba(" + entry.term.color + "," + alpha.toFixed(3) + ")";
        ctx.fillText("+", x - cellW / 2, y);
        var box = drawLabel(entry.term.item.term, x + cellW, y, entry.term.color, alpha * (0.6 + 0.4 * entry.term.item.scale), highlight);
        box.term = entry.term;
        hitBoxes.push(box);
      });
    }

    function updateHud() {
      if (hudRotation) {
        var degrees = (((-yaw / DEG) % 360) + 360) % 360;
        hudRotation.innerHTML = "ROT " + ("00" + degrees.toFixed(1)).slice(-5) + "°<br>TILT " + (pitch / DEG).toFixed(1) + "°";
      }
      if (hudTerm) {
        if (hovered) {
          var item = hovered.item;
          var variants = (item.variants || []).map(function (variant) { return variant.text; }).slice(0, 3).join(" / ");
          hudTerm.textContent = item.term + (variants ? " ≈ " + variants : "") + "  → #" + item.link.hash;
        } else {
          hudTerm.textContent = hudHint;
        }
      }
    }

    function render(time) {
      if (!width) return;
      var seconds = time / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = fontSize + "px " + FONT_FAMILY;
      drawRing(seconds, false);
      flush();
      // マスの中心に文字を置く
      ctx.textAlign = "center";
      drawSphere(seconds);
      flush();
      drawRing(seconds, true);
      flush();
      ctx.textAlign = "left";
      drawOverlay(seconds);
      updateHud();
    }

    // ---------- 操作 ----------
    function pointerPosition(event) {
      var rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function hitTest(position) {
      for (var i = hitBoxes.length - 1; i >= 0; i--) {
        var box = hitBoxes[i];
        if (position.x >= box.x && position.x <= box.x + box.w && position.y >= box.y && position.y <= box.y + box.h) return box.term;
      }
      return null;
    }

    function open(term) {
      var target = term && document.getElementById(term.item.link.hash);
      if (!target) return;
      history.pushState(null, "", "#" + term.item.link.hash);
      target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }

    canvas.addEventListener("pointerdown", function (event) {
      dragging = { x: event.clientX, y: event.clientY, moved: 0, type: event.pointerType, term: hitTest(pointerPosition(event)) };
      yawVelocity = 0;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!dragging) {
        var term = hitTest(pointerPosition(event));
        if (term !== hovered) {
          hovered = term;
          canvas.classList.toggle("is-pointing", !!term);
          requestFrame();
        }
        return;
      }
      var dx = event.clientX - dragging.x;
      var dy = event.clientY - dragging.y;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      dragging.moved += Math.abs(dx) + Math.abs(dy);
      if (dragging.moved > 4) canvas.classList.add("is-dragging");
      yaw += dx * 0.006;
      yawVelocity = dx * 0.006 * 60;
      if (dragging.type !== "touch") pitch = clamp(pitch + dy * 0.004, -1.1, 1.1);
      requestFrame();
    });

    function endDrag(event) {
      if (!dragging) return;
      if (dragging.moved < 6 && event.type === "pointerup") {
        var term = hitTest(pointerPosition(event));
        if (term && (term === dragging.term)) {
          if (dragging.type === "touch" && hovered !== term) {
            hovered = term;
          } else {
            open(term);
          }
        }
      }
      dragging = null;
      canvas.classList.remove("is-dragging");
      requestFrame();
    }

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", function () {
      if (!dragging && hovered) {
        hovered = null;
        canvas.classList.remove("is-pointing");
        requestFrame();
      }
    });

    // キーボード: ←→ で回転、↑↓ で傾き、Enter で手前の語のセクションへ
    canvas.addEventListener("keydown", function (event) {
      var step = 12 * DEG;
      if (event.key === "ArrowLeft") yaw -= step;
      else if (event.key === "ArrowRight") yaw += step;
      else if (event.key === "ArrowUp") pitch = clamp(pitch + step / 2, -1.1, 1.1);
      else if (event.key === "ArrowDown") pitch = clamp(pitch - step / 2, -1.1, 1.1);
      else if (event.key === "Enter") {
        var nearest = null;
        terms.forEach(function (term) {
          var z = toView(term.point)[2];
          if (!nearest || z > nearest.z) nearest = { term: term, z: z };
        });
        if (nearest) open(nearest.term);
        return;
      } else return;
      event.preventDefault();
      requestFrame();
    });

    // ---------- 描画ループ ----------
    var running = false;
    var inView = true;
    var lastTime = 0;
    var frameRequested = false;

    function requestFrame() {
      if (running || frameRequested) return;
      frameRequested = true;
      window.requestAnimationFrame(function (time) {
        frameRequested = false;
        render(time);
      });
    }

    function tick(time) {
      if (!running) return;
      var delta = lastTime ? Math.min(0.1, (time - lastTime) / 1000) : 0;
      if (time - lastTime >= 32) {
        if (!dragging) {
          yawVelocity *= Math.pow(0.04, delta);
          yaw += (AUTO_SPEED + yawVelocity) * delta;
          pitch += (TILT - pitch) * Math.min(1, delta * 0.4);
        }
        lastTime = time;
        render(time);
      }
      window.requestAnimationFrame(tick);
    }

    function updateRunning() {
      var shouldRun = !reducedMotion && inView && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        lastTime = 0;
        window.requestAnimationFrame(tick);
      } else if (!shouldRun) {
        running = false;
      }
    }

    root.hidden = false;
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        updateRunning();
      }).observe(root);
    }
    document.addEventListener("visibilitychange", updateRunning);
    fontsReady().then(resize);
    resize();
    updateRunning();
  })();

  // ==================================================
  // 画像 → ASCII アート
  // ==================================================
  (function images() {
    var figures = Array.prototype.slice.call(page.querySelectorAll("[data-ascii-image]"));
    if (!figures.length) return;
    var PHOSPHOR = [124, 245, 200];

    function sample(figure, img, width, height, cols, rows) {
      var buffer = document.createElement("canvas");
      buffer.width = cols;
      buffer.height = rows;
      var context = buffer.getContext("2d", { willReadFrequently: true });
      // object-fit: cover と同じように中央を切り抜く
      var sourceW = img.naturalWidth;
      var sourceH = img.naturalHeight;
      var scale = Math.max(width / sourceW, height / sourceH);
      var cropW = width / scale;
      var cropH = height / scale;
      context.drawImage(img, (sourceW - cropW) / 2, (sourceH - cropH) / 2, cropW, cropH, 0, 0, cols, rows);
      try {
        return context.getImageData(0, 0, cols, rows).data;
      } catch (error) {
        return null;
      }
    }

    function convert(figure, animate) {
      var img = figure.querySelector("img");
      if (!img || !img.naturalWidth) return;
      var mono = figure.getAttribute("data-ascii-color") === "mono";
      var width = figure.clientWidth;
      if (!width) return;
      var height = figure.classList.contains("ascii-card-thumb")
        ? figure.clientHeight || (width * 9) / 16
        : (width * img.naturalHeight) / img.naturalWidth;

      var cols = Math.min(Number(figure.getAttribute("data-ascii-columns")) || 64, Math.floor(width / 4.6));
      var cellW = width / cols;
      var size = cellW / 0.6;
      var cellH = size * 0.98;
      var rows = Math.max(1, Math.floor(height / cellH));
      var data = sample(figure, img, width, height, cols, rows);
      if (!data) return;

      // 明るさを画像ごとに自動補正する。白背景のスクリーンショットは反転し、背景を空白（暗い端末）にする
      var count = cols * rows;
      var levels = new Float32Array(count);
      for (var j = 0; j < count; j++) {
        levels[j] = (0.2126 * data[j * 4] + 0.7152 * data[j * 4 + 1] + 0.0722 * data[j * 4 + 2]) / 255;
      }
      var sorted = Array.prototype.slice.call(levels).sort(function (a, b) { return a - b; });
      var low = sorted[Math.floor(count * 0.03)];
      var high = Math.max(low + 0.08, sorted[Math.floor(count * 0.97)]);
      var invert = sorted[Math.floor(count / 2)] > 0.55;

      var cells = [];
      for (var i = 0; i < count; i++) {
        var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        var lum = clamp((levels[i] - low) / (high - low), 0, 1);
        if (invert) lum = 1 - lum;
        lum = Math.pow(lum, 1.15);
        var char = GLYPHS[Math.round(lum * (GLYPHS.length - 1))];
        var color;
        if (mono) {
          var k = 0.25 + 0.75 * lum;
          color = "rgb(" + Math.round(PHOSPHOR[0] * k) + "," + Math.round(PHOSPHOR[1] * k) + "," + Math.round(PHOSPHOR[2] * k) + ")";
        } else {
          // 元の色に蛍光色を混ぜ、暗い色（反転時の黒い文字など）も読める明るさまで持ち上げる
          var mix = invert ? 0.45 : 0.15;
          var tinted = [0, 1, 2].map(function (c) { return data[i * 4 + c] * (1 - mix) + PHOSPHOR[c] * mix; });
          var lift = Math.max(1, 170 / Math.max(tinted[0], tinted[1], tinted[2], 1)) * (0.7 + 0.45 * lum);
          color = "rgb(" + tinted.map(function (c) { return Math.round(clamp(c * lift, 0, 255)); }).join(",") + ")";
        }
        cells.push({ char: char, color: color, x: (i % cols + 0.5) * cellW, y: (Math.floor(i / cols) + 0.5) * cellH, reveal: Math.random() });
      }

      var canvas = figure.querySelector("canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        figure.insertBefore(canvas, figure.firstChild);
      }
      var ratio = pixelRatio();
      var drawHeight = rows * cellH;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(drawHeight * ratio);
      canvas.style.width = width + "px";
      canvas.style.height = (figure.classList.contains("ascii-card-thumb") ? height : drawHeight) + "px";
      var ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      figure.classList.add("is-ascii");

      function draw(progress) {
        ctx.clearRect(0, 0, width, drawHeight);
        ctx.font = size.toFixed(2) + "px " + FONT_FAMILY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        cells.forEach(function (cell) {
          if (cell.reveal <= progress) {
            if (cell.char === " ") return;
            ctx.fillStyle = cell.color;
            ctx.fillText(cell.char, cell.x, cell.y);
          } else if (cell.reveal - progress < 0.25) {
            ctx.fillStyle = "rgba(124,245,200,0.35)";
            ctx.fillText(NOISE[Math.floor(Math.random() * NOISE.length)], cell.x, cell.y);
          }
        });
      }

      if (!animate || reducedMotion) {
        draw(1);
        return;
      }
      var start = performance.now();
      (function step(time) {
        var progress = Math.min(1, (time - start) / 1100);
        draw(progress * 1.25 - 0.1);
        if (progress < 1) window.requestAnimationFrame(step);
      })(start);
    }

    function prepare(figure) {
      var img = figure.querySelector("img");
      if (!img) return;
      function run() {
        fontsReady().then(function () { convert(figure, true); });
      }
      if (img.complete && img.naturalWidth) run();
      else img.addEventListener("load", run, { once: true });

      if (window.ResizeObserver) {
        var lastWidth = figure.clientWidth;
        new ResizeObserver(function () {
          if (Math.abs(figure.clientWidth - lastWidth) < 2) return;
          lastWidth = figure.clientWidth;
          convert(figure, false);
        }).observe(figure);
      }
    }

    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          prepare(entry.target);
        });
      }, { rootMargin: "200px 0px" });
      figures.forEach(function (figure) { observer.observe(figure); });
    } else {
      figures.forEach(prepare);
    }
  })();

  // ==================================================
  // セクション: 打ち込み・解読・フェードイン・バッファバー連動
  // ==================================================
  (function sections() {
    function type(element) {
      var text = element.getAttribute("data-ascii-text") || element.textContent;
      element.setAttribute("data-ascii-text", text);
      element.textContent = "";
      element.classList.add("is-typing");
      var index = 0;
      var timer = window.setInterval(function () {
        index += 1;
        element.textContent = text.slice(0, index);
        if (index >= text.length) {
          window.clearInterval(timer);
          window.setTimeout(function () { element.classList.remove("is-typing"); }, 600);
        }
      }, 38);
    }

    function scramble(element) {
      var text = element.textContent;
      var frame = 0;
      var total = 22;
      (function step() {
        frame += 1;
        var shown = Math.floor((frame / total) * text.length);
        var output = "";
        for (var i = 0; i < text.length; i++) {
          var char = text[i];
          if (i < shown || char === " ") output += char;
          else if (char.charCodeAt(0) > 0x2e80) output += NOISE_WIDE[Math.floor(Math.random() * NOISE_WIDE.length)];
          else output += NOISE[Math.floor(Math.random() * NOISE.length)];
        }
        element.textContent = output;
        if (frame < total) window.setTimeout(step, 34);
        else element.textContent = text;
      })();
    }

    function play(section) {
      section.classList.add("is-visible");
      section.querySelectorAll("[data-ascii-type]").forEach(type);
      section.querySelectorAll("[data-ascii-scramble]").forEach(scramble);
    }

    if (!reducedMotion && window.IntersectionObserver) {
      var targets = Array.prototype.slice.call(page.querySelectorAll(".ascii-section, .ascii-exit"));
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          play(entry.target);
        });
      }, { rootMargin: "0px 0px -12% 0px" });

      targets.forEach(function (section) {
        // 最初から見えている位置にあるものは隠さず、打ち込みだけ見せる
        if (section.getBoundingClientRect().top > window.innerHeight && section.classList.contains("ascii-section")) {
          section.classList.add("is-armed");
        }
        observer.observe(section);
      });
    }

    // バッファバー（セクションジャンプ）の現在地ハイライト
    var jumpNav = page.querySelector("[data-ascii-jump]");
    if (jumpNav && window.IntersectionObserver) {
      var jumpLinks = Array.prototype.slice.call(jumpNav.querySelectorAll(".ascii-jump-link"));
      var linkById = {};
      jumpLinks.forEach(function (link) {
        var href = link.getAttribute("href") || "";
        if (href.charAt(0) === "#") linkById[href.slice(1)] = link;
      });

      function setActive(id) {
        jumpLinks.forEach(function (link) {
          var active = link === linkById[id];
          link.classList.toggle("is-active", active);
        });
      }

      var navSections = Array.prototype.slice.call(page.querySelectorAll(".ascii-section[aria-labelledby]"));
      var activeObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.getAttribute("aria-labelledby");
            if (id && linkById[id]) setActive(id);
          }
        });
      }, { rootMargin: "-20% 0px -65% 0px" });

      navSections.forEach(function (sec) { activeObserver.observe(sec); });
    }
  })();

  // ==================================================
  // Products のカテゴリ絞り込み
  // ==================================================
  (function productFilter() {
    var filter = page.querySelector("[data-ascii-filter]");
    if (!filter) return;
    var buttons = Array.prototype.slice.call(filter.querySelectorAll("[data-filter]"));
    var cards = Array.prototype.slice.call(page.querySelectorAll(".ascii-card[data-categories]"));

    function apply(category) {
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-filter") === category ? "true" : "false");
      });
      cards.forEach(function (card) {
        var list = (card.getAttribute("data-categories") || "").split("|");
        card.hidden = category !== "all" && list.indexOf(category) === -1;
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        apply(button.getAttribute("data-filter"));
      });
    });

    filter.hidden = false;
  })();
})();
