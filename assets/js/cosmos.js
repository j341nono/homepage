/*
 * Cosmos モード（/cosmos/）の 3D シーン。依存ライブラリなしの WebGL2。
 *
 * 画面に固定したキャンバスの中を、スクロール量に合わせてカメラが移動する。
 *   冒頭    特異点 → ビッグバン → 粒子が渦を巻いて円盤になり、銀河ができる
 *   各星系  セクションごとの恒星の周りをカメラが回る。項目（data-cosmos-body）の数だけ惑星が公転する
 *   終わり  銀河の上空へ抜け、ここまでの航路を点線で振り返る
 *
 * スクロール量 → カメラ位置の対応は、各セクションのパネルの位置から求める（measure）。
 * パネルが画面に入っている間はその恒星を周回し、パネルのあいだの余白で次の星系へ飛ぶ。
 * 描画は HDR（半精度浮動小数点）のバッファに行い、ブルームをかけてからトーンマッピングする。
 * WebGL2 が無い環境では何もせず、CSS の星空と本文だけが表示される。
 */
(function () {
  "use strict";

  const canvas = document.querySelector("[data-cosmos-canvas]");
  const page = document.querySelector("[data-cosmos]");
  if (!canvas || !page) return;

  const root = document.documentElement;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionQuery.matches;

  // ==================================================
  // 数学
  // ==================================================
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

  function perspective(out, fovY, aspect, near, far, sx, sy) {
    const f = 1 / Math.tan(fovY / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    // レンズシフト：注視点を画面中央ではなく (sx, sy)（NDC）に置く。パネルの反対側に恒星を見せるため
    out[8] = -sx;
    out[9] = -sy;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function lookAt(out, rot, eye, target) {
    const z = norm(sub(eye, target));
    let x = cross([0, 1, 0], z);
    if (len(x) < 1e-5) x = [1, 0, 0];
    x = norm(x);
    const y = cross(z, x);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -dot(x, eye); out[13] = -dot(y, eye); out[14] = -dot(z, eye); out[15] = 1;
    // ビュー空間 → ワールド空間の回転（列 = x, y, z）
    rot[0] = x[0]; rot[1] = x[1]; rot[2] = x[2];
    rot[3] = y[0]; rot[4] = y[1]; rot[5] = y[2];
    rot[6] = z[0]; rot[7] = z[1]; rot[8] = z[2];
  }

  // 軸 n まわりに angle だけ回し、center を中心に置く行列（列優先）
  function rotationAbout(out, center, n, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    const [x, y, z] = n;
    const m = [
      t * x * x + c, t * x * y + s * z, t * x * z - s * y,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c,
    ];
    out[0] = m[0]; out[1] = m[1]; out[2] = m[2]; out[3] = 0;
    out[4] = m[3]; out[5] = m[4]; out[6] = m[5]; out[7] = 0;
    out[8] = m[6]; out[9] = m[7]; out[10] = m[8]; out[11] = 0;
    out[12] = center[0] - (m[0] * center[0] + m[3] * center[1] + m[6] * center[2]);
    out[13] = center[1] - (m[1] * center[0] + m[4] * center[1] + m[7] * center[2]);
    out[14] = center[2] - (m[2] * center[0] + m[5] * center[1] + m[8] * center[2]);
    out[15] = 1;
    return out;
  }

  // 再現性のある乱数（同じ星系は毎回同じ形になる）
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function gauss(rnd) {
    let u = 0;
    while (!u) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
  }
  function unitVector(rnd) {
    const z = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
  }

  // 色は sRGB の 16 進で書き、シェーダーにはリニアで渡す
  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function linear(hex) {
    return hexToRgb(hex).map((c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
  }

  // ==================================================
  // 宇宙の設計
  // ==================================================
  const GALAXY_RADIUS = 5200;

  // 恒星の種類。cls はパネルの見出しに添えるスペクトル型
  const STAR_TYPES = {
    G: { hex: "#ffd7a1", radius: 6.5, cls: "G2V", intensity: 3.4 },
    A: { hex: "#d4e0ff", radius: 7.5, cls: "A1V", intensity: 3.8 },
    F: { hex: "#fff0d8", radius: 7, cls: "F5V", intensity: 3.6 },
    K: { hex: "#ffae66", radius: 10, cls: "K1III", intensity: 3.1 },
    M: { hex: "#ff7b4d", radius: 4.6, cls: "M4V", intensity: 2.8 },
    B: { hex: "#a3bfff", radius: 9, cls: "B3V", intensity: 4.4 },
    Kc: { hex: "#ffb072", radius: 4.4, cls: "K2V", intensity: 3.0 },
    Gg: { hex: "#ffc878", radius: 12, cls: "G8III", intensity: 3.3 },
    WD: { hex: "#e2ecff", radius: 2.2, cls: "DA2", intensity: 5.2 },
  };

  // セクション（id）ごとの星系の性格。知らない id は FALLBACK_STARS を順に使う
  const SYSTEM_STYLES = {
    profile: { star: "G", planets: 3, home: true }, // 3 番目に地球型の惑星
    research: { star: "A", belt: true },
    publications: { star: "F", companion: "Kc" }, // 連星
    hackathons: { star: "K", belt: true },
    oss: { star: "B" },
    events: { star: "M" },
    internships: { star: "F" },
    organizing: { star: "WD", nebula: true }, // 白色矮星と惑星状星雲
    achievements: { star: "Gg", rings: true },
    products: { star: "B", rings: true, belt: true },
  };
  const FALLBACK_STARS = ["G", "A", "K", "F", "M", "B"];

  const PLANET_KINDS = { rocky: 0, gas: 1, terran: 2, lava: 3, ice: 4 };
  const PALETTES = {
    rocky: [["#8f7d6c", "#cbb79c", "#5d4c40"], ["#7a736c", "#bdb6ad", "#4a4542"], ["#9b5a3a", "#d79a68", "#5e2f1f"], ["#77705c", "#b3a888", "#403c33"]],
    lava: [["#2b1912", "#ff7a2a", "#6b2a12"]],
    gas: [["#c79a6a", "#f1dcb9", "#8b5638"], ["#e2c995", "#fff1d2", "#b08e5b"], ["#5b7fd3", "#a8c6ff", "#2c468f"], ["#b98ac8", "#f0d6f2", "#6b3f87"], ["#d3a36f", "#f6e2c4", "#a0603a"]],
    ice: [["#9bd6e6", "#e2f7ff", "#6ab0cc"], ["#7ea7dc", "#d0e4ff", "#5a83c0"]],
    terran: [["#1b4f8f", "#4b7a3a", "#b49a6a"]],
  };
  const ATMOSPHERES = { rocky: ["#d8c8b8", 0.25], lava: ["#ff6a2a", 0.6], gas: ["#ffe6c4", 0.55], ice: ["#b0e8ff", 0.8], terran: ["#6fb6ff", 1.2] };
  const RING_COLORS = ["#d9c4a0", "#c9b8a6", "#e6d7bd", "#b9c4d6"];

  // 宇宙の時刻の表示を切り替える、ビッグバンの進み具合
  const EPOCH_STEPS = [0, 0.05, 0.13, 0.3, 0.52, 0.78];

  const narrowQuery = window.matchMedia("(max-width: 900px)");
  const lowPower = narrowQuery.matches || (navigator.hardwareConcurrency || 8) <= 4;

  // ---------- DOM ----------
  const heroEl = page.querySelector('[data-cosmos-stop="bang"]');
  const outroEl = page.querySelector('[data-cosmos-stop="outro"]');
  const sectionEls = Array.from(page.querySelectorAll("[data-cosmos-system]"));
  const mapLinks = Array.from(document.querySelectorAll("[data-cosmos-map] a"));
  const epochItems = Array.from(document.querySelectorAll("[data-cosmos-epoch] li"));
  if (!heroEl || !outroEl || !sectionEls.length) return;

  // ==================================================
  // 星系の生成
  // ==================================================
  const systems = sectionEls.map((el, index) => {
    const id = el.getAttribute("data-cosmos-system");
    const style = SYSTEM_STYLES[id] || { star: FALLBACK_STARS[index % FALLBACK_STARS.length] };
    const rnd = mulberry32(hashString(id) ^ 0x9e3779b9);
    const bodies = Array.from(el.querySelectorAll("[data-cosmos-body]"));
    const count = clamp(bodies.length || style.planets || 3, 1, 12);

    // 銀河の外縁から中心へ向かう渦に沿って並べる
    const t = sectionEls.length > 1 ? index / (sectionEls.length - 1) : 0;
    const angle = 0.6 + index * 0.36;
    const radius = mix(4300, 1650, t);
    const center = [Math.cos(angle) * radius, 70 * Math.sin(index * 1.9), Math.sin(angle) * radius];

    // 公転面は銀河面から少し傾ける
    const normal = norm([(rnd() - 0.5) * 0.36, 1, (rnd() - 0.5) * 0.36]);
    const u = norm(cross(normal, [0, 0, 1]));
    const v = cross(normal, u);

    const primary = STAR_TYPES[style.star];
    const stars = [];
    let inner;
    if (style.companion) {
      const companion = STAR_TYPES[style.companion];
      const separation = (primary.radius + companion.radius) * 2.3;
      const total = primary.radius + companion.radius;
      stars.push({ type: primary, offset: (separation * companion.radius) / total, phase: 0 });
      stars.push({ type: companion, offset: (separation * primary.radius) / total, phase: Math.PI });
      inner = separation * 2.4 + 12;
    } else {
      stars.push({ type: primary, offset: 0, phase: 0 });
      inner = primary.radius * 3.4 + 10;
    }
    stars.forEach((star) => {
      star.color = linear(star.type.hex);
      star.radius = star.type.radius;
      star.intensity = star.type.intensity;
      star.position = center.slice();
      star.seed = rnd();
    });

    const lightColor = lerp3([1, 1, 1], stars[0].color, 0.55);
    const planets = [];
    let a = inner;
    for (let j = 0; j < count; j++) {
      const f = count > 1 ? j / (count - 1) : 0.5;
      let kind = f < 0.34 ? "rocky" : f < 0.72 ? "gas" : "ice";
      if (count <= 2) kind = j === 0 ? "rocky" : "gas";
      if (style.home && j === 2) kind = "terran";
      else if (kind === "rocky" && j === 0 && !style.home && rnd() < 0.55) kind = "lava";
      if (style.rings && kind === "ice" && rnd() < 0.5) kind = "gas";

      const size = kind === "gas" ? mix(3.2, 5.4, rnd()) : kind === "ice" ? mix(2.2, 3.1, rnd()) : kind === "terran" ? 2.15 : mix(1.0, 1.9, rnd());
      const palettes = PALETTES[kind];
      const palette = palettes[Math.floor(rnd() * palettes.length)].map(linear);
      const tilt = (rnd() - 0.5) * (kind === "gas" ? 0.9 : 0.6);
      const ring = kind === "gas" && (style.rings || rnd() < 0.3)
        ? {
            inner: size * 1.35,
            outer: size * mix(2.1, 2.55, rnd()),
            color: linear(RING_COLORS[Math.floor(rnd() * RING_COLORS.length)]),
            normal: [0, Math.cos(tilt), Math.sin(tilt)],
            seed: rnd(),
          }
        : null;
      const moonData = bodies[j] ? parseInt(bodies[j].getAttribute("data-cosmos-moons") || "0", 10) : 0;
      const moonCount = moonData || (kind === "terran" ? 1 : kind === "gas" && rnd() < 0.45 ? 1 + Math.floor(rnd() * 2) : 0);
      const reach = (ring ? ring.outer : size) + moonCount * 1.7 + (moonCount ? 2 : 0);

      a += reach + (j ? mix(5, 9, rnd()) : 0);
      const moons = [];
      for (let m = 0; m < moonCount; m++) {
        moons.push({
          a: (ring ? ring.outer : size) + 1.6 + m * 1.7,
          radius: mix(0.32, 0.62, rnd()),
          phase: rnd() * TAU,
          speed: 0.55 / (1 + m * 0.6),
          incl: (rnd() - 0.5) * 0.4,
          palette: PALETTES.rocky[1].map(linear),
          seed: rnd(),
          position: [0, 0, 0],
        });
      }
      planets.push({
        kind,
        type: PLANET_KINDS[kind],
        a,
        radius: size,
        phase: rnd() * TAU,
        speed: 0.16 * Math.pow(inner / a, 1.5),
        incl: (rnd() - 0.5) * 0.07,
        node: rnd() * TAU,
        tilt,
        spinSpeed: mix(0.05, 0.22, rnd()) * (kind === "gas" ? 1.6 : 1),
        palette,
        atmosphere: linear(ATMOSPHERES[kind][0]),
        atmosphereStrength: ATMOSPHERES[kind][1],
        ring,
        moons,
        seed: rnd(),
        angle: 0,
        position: [0, 0, 0],
        highlight: 0,
        highlightTarget: 0,
        orbitStart: 0,
      });
      a += reach;
    }

    // 惑星が少ない星系でも、恒星に近づきすぎない
    let extent = Math.max(a + 8, Math.max.apply(null, stars.map((star) => star.type.radius)) * 14 + 30);
    let belt = null;
    if (style.belt) {
      belt = { inner: extent + 4, outer: extent + 18, speed: 0.012 + rnd() * 0.01 };
      extent += 22;
    }

    const designation = stars.map((star) => star.type.cls).join(" + ");
    const starRgb = hexToRgb(primary.hex).join(", ");
    el.style.setProperty("--star-rgb", starRgb);
    const classSlot = el.querySelector("[data-cosmos-class]");
    if (classSlot) classSlot.textContent = designation;

    return {
      id,
      el,
      panel: el.querySelector(".cosmos-panel") || el,
      side: el.classList.contains("cosmos-system--right") ? "right" : "left",
      style,
      center,
      normal,
      u,
      v,
      stars,
      planets,
      bodies,
      belt,
      extent,
      lightColor,
      nebula: !!style.nebula,
      binarySpeed: 0.09,
      starHex: primary.hex,
      az0: 0,
      dir: 1,
      sweep: 1.95,
    };
  });

  // 星系マップの点を、恒星の色にする
  mapLinks.forEach((link) => {
    const target = decodeURIComponent((link.getAttribute("href") || "").slice(1));
    const system = systems.find((s) => s.el.querySelector('[id="' + target + '"]'));
    if (system) link.style.setProperty("--star", system.starHex);
  });

  // ---------- 天体の位置 ----------
  function orbitPoint(sys, a, angle, incl, node) {
    const c = Math.cos(angle), s = Math.sin(angle), h = a * incl * Math.sin(angle - node);
    return [
      sys.center[0] + a * (sys.u[0] * c + sys.v[0] * s) + sys.normal[0] * h,
      sys.center[1] + a * (sys.u[1] * c + sys.v[1] * s) + sys.normal[1] * h,
      sys.center[2] + a * (sys.u[2] * c + sys.v[2] * s) + sys.normal[2] * h,
    ];
  }

  function updateBodies(sys, time) {
    sys.stars.forEach((star) => {
      if (!star.offset) return;
      const angle = star.phase + time * sys.binarySpeed;
      star.position = orbitPoint(sys, star.offset, angle, 0, 0);
    });
    sys.planets.forEach((planet) => {
      planet.angle = (((planet.phase + time * planet.speed) % TAU) + TAU) % TAU;
      planet.position = orbitPoint(sys, planet.a, planet.angle, planet.incl, planet.node);
      planet.moons.forEach((moon) => {
        const angle = moon.phase + time * moon.speed;
        const c = Math.cos(angle), s = Math.sin(angle), h = Math.sin(angle) * moon.incl;
        moon.position = [
          planet.position[0] + moon.a * (sys.u[0] * c + sys.v[0] * s + sys.normal[0] * h),
          planet.position[1] + moon.a * (sys.u[1] * c + sys.v[1] * s + sys.normal[1] * h),
          planet.position[2] + moon.a * (sys.u[2] * c + sys.v[2] * s + sys.normal[2] * h),
        ];
      });
    });
  }

  // ==================================================
  // カメラの経路
  // ==================================================
  let narrow = narrowQuery.matches;
  let portrait = window.innerWidth < window.innerHeight;
  const HERO_AZ = -0.4;

  function heroShot(p, out) {
    // シェーダーと同じ式で、火の玉の広がりにカメラが少し遅れて下がる
    const e = smooth(0.045, 0.62, p);
    const blast = 1 - Math.pow(1 - e, 2.6);
    let d = 120 + 1.45 * blast * 4300;
    d = mix(d, 15500 * (portrait ? 1.65 : 1), easeInOut(smooth(0.45, 1, p)));
    const el = mix(0.06, 0.66, smooth(0.2, 1, p));
    const az = HERO_AZ + mix(-0.35, 0.55, p);
    out.pos = [Math.cos(el) * Math.cos(az) * d, Math.sin(el) * d, Math.cos(el) * Math.sin(az) * d];
    out.target = [0, 0, 0];
    out.fov = portrait ? 62 : 50;
    out.shift = [0, mix(0.24, 0.12, smooth(0.3, 1, p))];
    return out;
  }

  function systemShot(sys, p, out) {
    const e = sys.extent * (portrait ? 1.45 : 1);
    const az = sys.az0 + sys.dir * sys.sweep * p;
    const el = mix(0.52, 0.27, p);
    const d = e * mix(1.9, 1.32, easeInOut(p));
    const c = sys.center;
    out.pos = [c[0] + Math.cos(el) * Math.cos(az) * d, c[1] + Math.sin(el) * d, c[2] + Math.cos(el) * Math.sin(az) * d];
    out.target = c.slice();
    out.fov = portrait ? 60 : 44;
    out.shift = narrow ? [0, 0.48] : [sys.side === "left" ? 0.4 : -0.4, 0.02];
    return out;
  }

  const OUTRO_AZ = 1.9;
  function outroShot(p, out) {
    const d = mix(17000, 19500, p) * (portrait ? 1.7 : 1);
    const el = mix(0.92, 1.18, p);
    const az = OUTRO_AZ + p * 0.25;
    out.pos = [Math.cos(el) * Math.cos(az) * d, Math.sin(el) * d, Math.cos(el) * Math.sin(az) * d];
    out.target = [0, 0, 0];
    out.fov = portrait ? 62 : 48;
    out.shift = [0, 0.2];
    return out;
  }

  // 停留所：冒頭（ビッグバン）・各星系・終わり。shot(p) は停留所の中でのカメラ（p は 0〜1）
  const stops = [{ kind: "hero", el: heroEl, shot: heroShot, R: 0, D: 1 }]
    .concat(systems.map((sys) => ({ kind: "system", sys, el: sys.panel, shot: (p, out) => systemShot(sys, p, out), R: 0, D: 1 })))
    .concat([{ kind: "outro", el: outroEl, shot: outroShot, R: 0, D: 1 }]);

  // 星系に着いたときの向き（前の場所の側から近づく）と、回る向き（次の星系の側で離れる）
  (function planOrbits() {
    const heroEnd = heroShot(1, {}).pos;
    systems.forEach((sys, i) => {
      const prev = i === 0 ? heroEnd : systems[i - 1].center;
      const next = i === systems.length - 1 ? outroShot(0, {}).pos : systems[i + 1].center;
      const toPrev = Math.atan2(prev[2] - sys.center[2], prev[0] - sys.center[0]);
      const toNext = Math.atan2(next[2] - sys.center[2], next[0] - sys.center[0]);
      const diff = (x) => Math.abs(((((x - toNext) % TAU) + TAU + Math.PI) % TAU) - Math.PI);
      sys.az0 = toPrev + (i % 2 ? 0.45 : -0.45);
      sys.dir = diff(sys.az0 + sys.sweep) <= diff(sys.az0 - sys.sweep) ? 1 : -1;
    });
  })();

  // 停留所のあいだ：前の停留所の終わりから、次の停留所の始まりへ 3 次ベジェで飛ぶ
  const shotA0 = {}, shotA1 = {}, shotB0 = {}, shotB1 = {};
  function transitShot(a, b, t, out) {
    a.shot(1, shotA1);
    a.shot(0.985, shotA0);
    b.shot(0, shotB0);
    b.shot(0.015, shotB1);
    const P0 = shotA1.pos, P3 = shotB0.pos;
    const D = len(sub(P3, P0)) || 1;
    const lift = [0, D * 0.1, 0];
    const P1 = add(add(P0, scale(norm(sub(shotA1.pos, shotA0.pos)), D * 0.38)), lift);
    const P2 = add(sub(P3, scale(norm(sub(shotB1.pos, shotB0.pos)), D * 0.38)), lift);
    const te = mix(t, smoother(t), 0.65);
    const k = 1 - te;
    out.pos = [0, 1, 2].map((i) => k * k * k * P0[i] + 3 * k * k * te * P1[i] + 3 * k * te * te * P2[i] + te * te * te * P3[i]);
    const vel = [0, 1, 2].map((i) => 3 * k * k * (P1[i] - P0[i]) + 6 * k * te * (P2[i] - P1[i]) + 3 * te * te * (P3[i] - P2[i]));
    const s = smoother(t);
    const bump = Math.pow(Math.sin(Math.PI * t), 2);
    // 飛んでいる間は進行方向を見る
    const look = add(out.pos, scale(norm(vel), D * 0.5));
    out.target = lerp3(lerp3(shotA1.target, shotB0.target, s), look, bump * 0.75);
    out.fov = mix(shotA1.fov, shotB0.fov, s) + bump * 12;
    out.shift = [mix(shotA1.shift[0], shotB0.shift[0], s) * (1 - 0.7 * bump), mix(shotA1.shift[1], shotB0.shift[1], s) * (1 - 0.7 * bump)];
    return out;
  }

  // ---------- スクロール量と停留所の対応 ----------
  let viewportHeight = window.innerHeight;
  let maxScroll = 1;
  function measure() {
    viewportHeight = window.innerHeight;
    maxScroll = Math.max(1, document.documentElement.scrollHeight - viewportHeight);
    narrow = narrowQuery.matches;
    portrait = window.innerWidth < window.innerHeight;
    const vh = viewportHeight;
    const scrollTop = window.scrollY;
    stops.forEach((stop, i) => {
      if (stop.kind === "hero") {
        stop.R = 0;
        stop.D = Math.max(vh * 0.5, stop.el.offsetHeight - vh);
        return;
      }
      if (stop.kind === "outro") {
        stop.R = Math.max(stops[i - 1].D + vh * 0.3, maxScroll - vh * 0.9);
        stop.D = Math.max(stop.R + 1, maxScroll);
        return;
      }
      const rect = stop.el.getBoundingClientRect();
      const top = rect.top + scrollTop, bottom = rect.bottom + scrollTop;
      // パネルの上端が画面の 60% に来たら到着、下端が 40% まで上がったら出発
      stop.R = top - vh * 0.6;
      stop.D = bottom - vh * 0.4;
      if (stop.D < stop.R + vh * 0.25) {
        const middle = (stop.R + stop.D) / 2;
        stop.R = middle - vh * 0.125;
        stop.D = middle + vh * 0.125;
      }
      stop.R = Math.max(stop.R, stops[i - 1].D + vh * 0.2);
      stop.D = Math.max(stop.D, stop.R + vh * 0.1);
    });
  }

  // スクロール量 → どの停留所（または航行区間）にいるか
  function locate(scroll) {
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (scroll <= stop.D || i === stops.length - 1) {
        if (scroll >= stop.R || i === 0) {
          return { index: i, transit: false, p: clamp((scroll - stop.R) / (stop.D - stop.R), 0, 1) };
        }
        const prev = stops[i - 1];
        return { index: i, transit: true, p: clamp((scroll - prev.D) / (stop.R - prev.D), 0, 1) };
      }
    }
    return { index: stops.length - 1, transit: false, p: 1 };
  }

  // 星系マップの現在地：前後の航行区間の中点で切り替える
  function activeStop(scroll) {
    for (let i = 0; i < stops.length - 1; i++) {
      if (scroll < (stops[i].D + stops[i + 1].R) / 2) return i;
    }
    return stops.length - 1;
  }

  const camera = { pos: [0, 0, 100], target: [0, 0, 0], fov: 50, shift: [0, 0] };
  function cameraAt(scroll, out) {
    const where = locate(scroll);
    const stop = stops[where.index];
    if (where.transit) transitShot(stops[where.index - 1], stop, where.p, out);
    else stop.shot(where.p, out);
    out.bang = where.index === 0 && !where.transit ? where.p : 1;
    out.outro = stop.kind === "outro" ? (where.transit ? 0 : where.p) : 0;
    if (stop.kind === "outro" && where.transit) out.outro = smooth(0.5, 1, where.p) * 0.4;
    return out;
  }

  // 視差を抑える設定：飛ばずに、停留所ごとの 1 枚の構図に切り替える
  function stillShot(index, out) {
    const stop = stops[index];
    if (stop.kind === "hero") {
      const formed = window.scrollY > stop.D * 0.5;
      stop.shot(formed ? 1 : 0, out);
      out.bang = formed ? 1 : 0;
    } else {
      stop.shot(0.5, out);
      out.bang = 1;
    }
    out.outro = stop.kind === "outro" ? 1 : 0;
    return out;
  }

  // ==================================================
  // ページとの連動
  // ==================================================
  let lastBang = -1, lastEpoch = -1, lastActive = -2, lastMap = -1, lastEpochVisible = -1;
  function syncDom(scroll, bang) {
    if (Math.abs(bang - lastBang) > 0.0005) {
      root.style.setProperty("--bang", bang.toFixed(4));
      heroEl.classList.toggle("is-faded", bang > 0.3);
      lastBang = bang;
    }
    let epoch = 0;
    EPOCH_STEPS.forEach((step, i) => {
      if (bang >= step) epoch = i;
    });
    if (epoch !== lastEpoch) {
      epochItems.forEach((item, i) => item.classList.toggle("is-active", i === epoch));
      lastEpoch = epoch;
    }
    const epochVisible = scroll < stops[0].D + viewportHeight * 0.2 ? 1 : 0;
    if (epochVisible !== lastEpochVisible) {
      root.style.setProperty("--epoch-visible", String(epochVisible));
      lastEpochVisible = epochVisible;
    }
    const mapVisible = bang > 0.85 ? 1 : 0;
    if (mapVisible !== lastMap) {
      root.style.setProperty("--map-visible", String(mapVisible));
      lastMap = mapVisible;
    }
    const active = activeStop(scroll);
    if (active !== lastActive) {
      const sys = stops[active].kind === "system" ? stops[active].sys : null;
      mapLinks.forEach((link) => {
        const target = decodeURIComponent((link.getAttribute("href") || "").slice(1));
        const on = !!sys && !!sys.el.querySelector('[id="' + target + '"]');
        if (on) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      lastActive = active;
    }
  }

  function startDomOnly() {
    root.classList.add("cosmos-ready");
    const update = () => {
      const scroll = window.scrollY;
      const where = locate(scroll);
      syncDom(scroll, where.index === 0 && !where.transit ? where.p : 1);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      update();
    });
    update();
  }

  // ==================================================
  // WebGL2
  // ==================================================
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });

  // 3D が描けなくても、星系マップと宇宙の時刻は動かす
  if (!gl) {
    measure();
    startDomOnly();
    return;
  }

  const floatTargets = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
  const HDR_FORMAT = floatTargets ? gl.RGBA16F : gl.RGBA8;
  const HDR_TYPE = floatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  // ---------- シェーダー ----------
  const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 nm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,int octaves){
  float a=.5,s=0.;
  for(int i=0;i<7;i++){if(i>=octaves)break;s+=a*snoise(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=.5;}
  return s;
}
`;

  // 銀河の粒子：ビッグバンで飛び散り、渦を巻いて円盤に収まる
  const GALAXY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aBlast;
layout(location=2) in vec4 aCol;
uniform mat4 uView,uProj;
uniform float uBang,uTime,uFocal,uDpr,uTwinkle,uGain;
out vec3 vCol;
void main(){
  float r=length(aPos.xz);
  float e=smoothstep(.045,.62,uBang);
  float blast=1.-pow(1.-e,2.6);
  float f=smoothstep(.32,.96,uBang);
  float fs=f*f*(3.-2.*f);
  // 内側ほど大きく巻き込みながら収まる（腕が後ろへ流れる向き）
  float swirl=(1.-fs)*(1.-fs)*4.2*1400./(r+1400.);
  float spin=uTime*.0008*2600./(r+2600.);
  float a=swirl-spin;
  mat2 rot=mat2(cos(a),sin(a),-sin(a),cos(a));
  vec3 pe=aBlast.xyz*blast;pe.xz=rot*pe.xz;
  vec3 pg=aPos;pg.xz=rot*pg.xz;
  vec3 p=mix(pe,pg,fs);
  // 生まれた直後は青白く、冷えると橙へ。銀河になると本来の星の色
  float hot=1.-smoothstep(.05,.5,uBang);
  vec3 plasma=mix(vec3(1.,.36,.12),vec3(.72,.84,1.),hot*hot)*(.45+1.1*hot);
  vec3 col=mix(plasma,aCol.rgb,smoothstep(.35,.9,uBang));
  vec4 mv=uView*vec4(p,1.);
  float dist=max(-mv.z,.001);
  gl_Position=uProj*mv;
  float size=min(aCol.w*uFocal*9./dist,(1.2+aCol.w*1.5)*uDpr);
  float alpha=1.;
  if(size<1.){alpha=size*size;size=1.;}
  alpha*=smoothstep(.04,.075,uBang)*mix(.4,1.,smoothstep(.12,.55,uBang))*uGain;
  alpha*=smoothstep(4.,45.,dist);
  float tw=.72+.28*sin(uTime*(1.3+fract(aBlast.w*7.31)*2.5)+aBlast.w*80.);
  alpha*=mix(1.,tw,uTwinkle);
  gl_PointSize=size*2.;
  vCol=col*alpha;
}`;

  const POINT_FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 o;
void main(){
  vec2 c=gl_PointCoord*2.-1.;
  float d2=dot(c,c);
  if(d2>1.)discard;
  o=vec4(vCol*exp(-d2*5.),1.);
}`;

  // 動かない点：遠くの星空と小惑星帯
  const STARS_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uView,uProj,uModel;
uniform float uFocal,uDpr,uAlpha,uTime,uTwinkle,uWorld;
out vec3 vCol;
void main(){
  vec4 mv=uView*(uModel*vec4(aPos,1.));
  float dist=max(-mv.z,.001);
  gl_Position=uProj*mv;
  float size=mix(aCol.w*uDpr,min(aCol.w*uFocal*.5/dist,2.4*uDpr),uWorld);
  float alpha=uAlpha;
  if(size<1.){alpha*=size*size;size=1.;}
  float seed=fract(aPos.x*.0137+aPos.z*.0291);
  alpha*=mix(1.,.7+.3*sin(uTime*(.8+seed*2.)+seed*60.),uTwinkle);
  gl_PointSize=size*2.;
  vCol=aCol.rgb*alpha;
}`;

  // 星雲：シェーダーで焼いた雲のテクスチャを、カメラに向けた板に貼る
  const NEBULA_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPos;
layout(location=2) in vec4 iCol;
layout(location=3) in vec4 iCol2;
layout(location=4) in vec4 iMask;
uniform mat4 uView,uProj;
uniform float uScale,uAlpha;
out vec2 vUv;
flat out vec3 vC1;
flat out vec3 vC2;
flat out vec4 vMask;
flat out float vI;
void main(){
  vec4 mv=uView*vec4(iPos.xyz*uScale,1.);
  float s=iPos.w*uScale;
  float r=iCol2.w;
  mat2 R=mat2(cos(r),sin(r),-sin(r),cos(r));
  float centerDist=length(mv.xyz);
  mv.xy+=R*aCorner*s;
  gl_Position=uProj*mv;
  vUv=aCorner*.5+.5;
  vC1=iCol.rgb;vC2=iCol2.rgb;vMask=iMask;
  vI=iCol.w*uAlpha*smoothstep(.2,.9,centerDist/s);
}`;

  const NEBULA_FS = `#version 300 es
precision highp float;
in vec2 vUv;
flat in vec3 vC1;
flat in vec3 vC2;
flat in vec4 vMask;
flat in float vI;
uniform sampler2D uTex;
out vec4 o;
void main(){
  vec4 t=texture(uTex,vUv);
  float d=dot(t,vMask);
  float alt=dot(t.yzwx,vMask);
  vec3 col=mix(vC1,vC2,alt);
  // 惑星状星雲（A チャンネル）は、内側が青緑で外縁が赤
  if(vMask.a>.5)col=mix(vC1,vC2,smoothstep(.3,.75,length(vUv*2.-1.)));
  o=vec4(col*d*vI,1.);
}`;

  // 星雲のテクスチャを焼くシェーダー（RGBA にそれぞれ違う形の雲）
  const BAKE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
${NOISE}
float f2(vec2 p,float z){return fbm(vec3(p,z),6);}
void main(){
  vec2 p=vUv*2.-1.;
  float r=length(p);
  vec2 w=vec2(f2(p*1.4,1.3),f2(p*1.4+5.2,2.7));
  float n=f2(p*2.1+w*1.3,3.1);
  float edge=smoothstep(1.,.72,r);
  float R=smoothstep(1.,.05,r+n*.42)*(.55+.6*n);
  float rg=1.-abs(f2(p*1.7+w*.9,4.2));rg=pow(rg,6.);
  float G=rg*smoothstep(1.,.15,r+.25*n)*1.3;
  float B=smoothstep(-.05,.85,f2(p*2.8+w*2.1,5.4)*.5+.5-.18)*smoothstep(1.,.25,r);
  float ring=exp(-pow((r-.52-.07*n)/.15,2.))*(.65+.55*f2(p*3.6+w,6.6))+smoothstep(.62,0.,r)*.22*(.6+.4*n);
  float A=ring;
  o=clamp(vec4(R,G,B,A)*edge,0.,1.);
}`;

  const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);
  vUv=p*.5+.5;
  gl_Position=vec4(p,0.,1.);
}`;

  // 球のインポスター（恒星・惑星）：板を描き、画素ごとに光線と球の交点を求める
  const SPHERE_VS_HEAD = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 i0;
uniform mat4 uView,uProj;
uniform float uFocal;
out vec3 vView;
flat out vec4 vC;
`;
  const SPHERE_VS_PLACE = `
  vec4 cv=uView*vec4(i0.xyz,1.);
  float r=i0.w;
  float d=length(cv.xyz);
  float s=r*d/sqrt(max(d*d-r*r,1e-3*r*r))*1.04+d/uFocal*1.5;
  vec3 pv=cv.xyz+vec3(aCorner*s,0.);
  vView=pv;
  vC=vec4(cv.xyz,r);
  gl_Position=uProj*vec4(pv,1.);
`;
  const SPHERE_FS_HIT = `
  vec3 rd=normalize(vView);
  vec3 c=vC.xyz;float r=vC.w;
  float b=dot(rd,c);
  float h=b*b-(dot(c,c)-r*r);
  if(h<=0.)discard;
  float t=b-sqrt(h);
  vec3 p=rd*t;
  vec3 n=(p-c)/r;
  vec4 clip=uProj*vec4(p,1.);
  gl_FragDepth=clip.z/clip.w*.5+.5;
  float aa=clamp(h/max(fwidth(h),1e-6),0.,1.);
  float mu=clamp(dot(n,-rd),0.,1.);
`;

  const STAR_CORE_VS = SPHERE_VS_HEAD + `
layout(location=2) in vec4 i1;
flat out vec4 vCol;
flat out float vSeed;
void main(){
${SPHERE_VS_PLACE}
  vCol=i1;
  vSeed=fract(i0.x*.013+i0.z*.007);
}`;

  const STAR_CORE_FS = `#version 300 es
precision highp float;
in vec3 vView;
flat in vec4 vC;
flat in vec4 vCol;
flat in float vSeed;
uniform mat4 uProj;
uniform mat3 uViewToWorld;
uniform float uTime;
out vec4 o;
${NOISE}
void main(){
${SPHERE_FS_HIT}
  vec3 nw=uViewToWorld*n;
  // 対流の粒状斑と、縁が暗くなる周辺減光
  float g=fbm(nw*4.5+vec3(0.,uTime*.02,vSeed*10.),4);
  float g2=snoise(nw*16.+vec3(uTime*.05));
  float limb=pow(mu,.5);
  vec3 hot=mix(vec3(1.),vCol.rgb,.3);
  vec3 col=mix(vCol.rgb*.75,hot,limb);
  col*=(.8+.34*g+.07*g2)*(.32+.68*limb)*vCol.w;
  o=vec4(col,aa);
}`;

  const PLANET_VS = SPHERE_VS_HEAD + `
layout(location=2) in vec4 i1;
layout(location=3) in vec4 i2;
layout(location=4) in vec4 i3;
layout(location=5) in vec4 i4;
layout(location=6) in vec4 i5;
layout(location=7) in vec4 i6;
flat out vec4 vL;
flat out vec4 vA;
flat out vec4 vB;
flat out vec4 vD;
flat out vec4 vE;
flat out vec4 vF;
flat out vec4 vSp;
void main(){
${SPHERE_VS_PLACE}
  vL=vec4((uView*vec4(i1.xyz,1.)).xyz,i1.w);
  vA=i2;vB=i3;vD=i4;vE=i5;vF=i6;
  vSp=vec4(cos(i5.w),sin(i5.w),cos(i3.w),sin(i3.w));
}`;

  const PLANET_FS = `#version 300 es
precision highp float;
in vec3 vView;
flat in vec4 vC;
flat in vec4 vL;
flat in vec4 vA;
flat in vec4 vB;
flat in vec4 vD;
flat in vec4 vE;
flat in vec4 vF;
flat in vec4 vSp;
uniform mat4 uProj;
uniform mat3 uViewToWorld;
uniform float uTime;
out vec4 o;
${NOISE}
void main(){
${SPHERE_FS_HIT}
  vec3 L=normalize(vL.xyz-p);
  float ndl=dot(n,L);
  // 自転軸の傾きと自転を戻して、惑星に貼り付いた座標で模様を作る
  vec3 nw=uViewToWorld*n;
  vec3 q=vec3(nw.x,vSp.x*nw.y+vSp.y*nw.z,-vSp.y*nw.y+vSp.x*nw.z);
  vec3 no=vec3(vSp.z*q.x-vSp.w*q.z,q.y,vSp.w*q.x+vSp.z*q.z);
  float seed=vA.w;
  int type=int(vL.w+.5);
  vec3 alb;vec3 emis=vec3(0.);float spec=0.;float clouds=0.;float night=1.;
  if(type==0){
    float n1=fbm(no*2.4+seed*13.1,5);
    float n2=fbm(no*9.+seed*7.7,3);
    alb=mix(vA.rgb,vB.rgb,smoothstep(-.35,.45,n1));
    alb=mix(alb,vD.rgb,smoothstep(.2,.6,n2)*.4);
    alb*=.85+.3*n2;
  }else if(type==1){
    float warp=fbm(no*vec3(1.5,4.,1.5)+seed*5.3+vec3(uTime*.004,0.,0.),4);
    float lat=no.y+warp*.12;
    float bands=sin(lat*(9.+fract(seed*3.7)*8.)*3.14159);
    float fine=sin(lat*41.+warp*6.);
    alb=mix(vA.rgb,vB.rgb,.5+.5*bands);
    alb=mix(alb,vD.rgb,smoothstep(.5,1.,fine)*.35);
    float sd=length(no-normalize(vec3(.6,-.32,.72)));
    alb=mix(alb,vD.rgb*1.15,smoothstep(.22,.1,sd+warp*.05)*step(.5,fract(seed*5.1)));
  }else if(type==2){
    float land=fbm(no*1.7+seed*3.3,6);
    float lm=smoothstep(.02,.08,land);
    vec3 ocean=vA.rgb*(.8+.25*fbm(no*6.,2));
    vec3 ground=mix(vB.rgb,vD.rgb,smoothstep(.1,.45,land+.15*fbm(no*8.,2)));
    alb=mix(ocean,ground,lm);
    float ice=smoothstep(.78,.86,abs(no.y)+.05*fbm(no*5.,2));
    alb=mix(alb,vec3(.9,.94,1.),ice);
    spec=(1.-lm)*(1.-ice);
    clouds=smoothstep(.05,.55,fbm(no*2.6+vec3(uTime*.006,0.,0.)+seed,5))*.85;
    emis=vec3(1.,.7,.36)*lm*(1.-ice)*smoothstep(.5,.8,snoise(no*38.))*.5;
    night=(1.-smoothstep(-.12,.18,ndl))*(1.-clouds);
  }else if(type==3){
    float n1=fbm(no*3.+seed,4);
    alb=vA.rgb*(1.+.8*n1);
    float cr=pow(1.-abs(snoise(no*3.5+seed*2.)),10.);
    float cr2=pow(1.-abs(snoise(no*9.+seed)),14.);
    emis=vB.rgb*(cr*2.6+cr2*1.3)*(.75+.25*sin(uTime*.8+seed*10.));
  }else{
    float warp=fbm(no*vec3(2.,6.,2.)+seed,3);
    alb=mix(vA.rgb,vB.rgb,.5+.5*sin((no.y+warp*.08)*14.));
    alb*=.9+.15*warp;
  }
  vec3 light=vF.rgb;
  float diff=smoothstep(-.12,1.,ndl);
  vec3 col=alb*light*diff;
  if(spec>0.){vec3 H=normalize(L-rd);col+=light*pow(max(dot(n,H),0.),60.)*spec*.6*step(0.,ndl);}
  col=mix(col,light*diff*1.05,clouds);
  col+=emis*night;
  col+=alb*.006;
  float fres=pow(1.-mu,2.6);
  col+=vE.rgb*vF.w*fres*smoothstep(-.3,.6,ndl)*light*.9;
  col+=vec3(.62,.86,1.)*pow(1.-mu,1.6)*vD.w*1.1;
  o=vec4(col,aa);
}`;

  // 惑星の環：惑星の影が落ち、明暗の縞がある
  const RING_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 r0;
layout(location=2) in vec4 r1;
layout(location=3) in vec4 r2;
layout(location=4) in vec4 r3;
layout(location=5) in vec4 r4;
uniform mat4 uView,uProj;
out vec3 vW;
out vec2 vLocal;
flat out vec4 vR0;
flat out vec4 vR1;
flat out vec4 vR2;
flat out vec4 vR3;
flat out vec4 vR4;
void main(){
  vec3 n=normalize(r1.xyz);
  vec3 t=normalize(cross(n,abs(n.y)<.99?vec3(0.,1.,0.):vec3(1.,0.,0.)));
  vec3 b=cross(n,t);
  vec3 wp=r0.xyz+(t*aCorner.x+b*aCorner.y)*r0.w;
  vW=wp;vLocal=aCorner*r0.w;
  vR0=r0;vR1=r1;vR2=r2;vR3=r3;vR4=r4;
  gl_Position=uProj*uView*vec4(wp,1.);
}`;

  const RING_FS = `#version 300 es
precision highp float;
in vec3 vW;
in vec2 vLocal;
flat in vec4 vR0;
flat in vec4 vR1;
flat in vec4 vR2;
flat in vec4 vR3;
flat in vec4 vR4;
out vec4 o;
${NOISE}
void main(){
  float rho=length(vLocal);
  float inner=vR1.w,outer=vR0.w;
  if(rho<inner||rho>outer)discard;
  float x=(rho-inner)/(outer-inner);
  float seed=vR3.w;
  float dens=smoothstep(0.,.06,x)*smoothstep(1.,.86,x);
  dens*=.55+.45*snoise(vec3(x*14.,seed*10.,0.));
  dens*=.75+.25*snoise(vec3(x*55.,seed*10.,1.));
  dens*=smoothstep(.015,.045,abs(x-.62));
  vec3 L=normalize(vR3.xyz-vW);
  vec3 oc=vW-vR0.xyz;
  float bq=dot(oc,L),cq=dot(oc,oc)-vR2.w*vR2.w;
  float shadow=(bq*bq-cq>0.&&bq<0.)?.06:1.;
  float lit=.3+.7*abs(dot(normalize(vR1.xyz),L));
  vec3 col=vR2.rgb*vR4.rgb*lit*shadow;
  float alpha=clamp(dens,0.,1.)*.85*vR4.w;
  o=vec4(col*alpha,alpha);
}`;

  // 恒星のコロナ・光芒・回折スパイク。遠い恒星は数画素の輝点として見せる
  const CORONA_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPos;
layout(location=2) in vec4 iCol;
layout(location=3) in vec4 iMisc;
uniform mat4 uView,uProj;
uniform float uFocal;
out vec2 vQ;
out vec2 vCorner;
flat out vec4 vS;
flat out vec3 vCol;
flat out vec4 vM;
void main(){
  vCorner=aCorner;
  vec4 mv=uView*vec4(iPos.xyz,1.);
  float depth=max(-mv.z,.01);
  float wpp=depth/uFocal;
  float half_=max(iPos.w*34.,wpp*30.);
  vQ=aCorner*half_;
  mv.xy+=vQ;
  gl_Position=uProj*mv;
  vS=vec4(iPos.w,iCol.w,wpp,iMisc.x);
  vCol=iCol.rgb;vM=iMisc;
}`;

  const CORONA_FS = `#version 300 es
precision highp float;
in vec2 vQ;
in vec2 vCorner;
flat in vec4 vS;
flat in vec3 vCol;
flat in vec4 vM;
uniform float uTime;
out vec4 o;
${NOISE}
void main(){
  float R=vS.x;
  float d=length(vQ)/R;
  float ang=atan(vQ.y,vQ.x);
  float x=max(d-1.,0.);
  float corona=exp(-x*2.6)*.9;
  float halo=.035/(1.+x*x*.12)+.012*exp(-x*.3);
  float st=max(snoise(vec3(cos(ang)*2.2,sin(ang)*2.2,uTime*.03+vM.x*10.)),0.);
  float streamers=st*st*exp(-x*.7)*.9;
  vec2 px=vQ/vS.z;
  float spikes=0.,spikesFar=0.;
  for(int i=0;i<3;i++){
    float a=float(i)*1.0471976+1.5707963;
    vec2 dir=vec2(cos(a),sin(a));
    vec2 nd=vec2(-dir.y,dir.x);
    spikes+=exp(-abs(dot(vQ,nd))/R*7.)*exp(-abs(dot(vQ,dir))/R*.22);
    spikesFar+=exp(-abs(dot(px,nd))*1.6)*exp(-abs(dot(px,dir))*.16);
  }
  float glint=exp(-dot(px,px)*.14)+.22*exp(-dot(px,px)*.014);
  float far=smoothstep(5.,1.,R/vS.z);
  float I=corona+halo+streamers+spikes*vM.y*.05;
  I=mix(I,glint*1.7+spikesFar*vM.y*.35,far);
  // 板の縁で必ず 0 になるようにする（暗部はガンマで持ち上がり、四角く見えてしまう）
  I*=1.-smoothstep(.45,1.,length(vCorner));
  o=vec4(vCol*I*vS.y,1.);
}`;

  // 軌道（公転する惑星の後ろに尾を引く）と、終わりに見せる航路の点線
  const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aPos;
uniform mat4 uView,uProj;
out float vP;
void main(){
  vP=aPos.w;
  gl_Position=uProj*uView*vec4(aPos.xyz,1.);
}`;

  const LINE_FS = `#version 300 es
precision highp float;
in float vP;
uniform vec3 uColor;
uniform float uAlpha,uPhase,uMode,uHi;
out vec4 o;
void main(){
  float a;
  if(uMode<.5){
    float k=fract((uPhase-vP)/6.2831853);
    a=.12+.88*pow(1.-k,5.);
    a*=1.+uHi*2.5;
  }else{
    a=step(.45,fract(vP*.012-uPhase));
  }
  o=vec4(uColor*a*uAlpha,1.);
}`;

  // ブルーム：明るい部分を縮小しながらぼかし、拡大しながら重ねる
  const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uPrefilter,uThreshold,uKnee;
out vec4 o;
vec3 s(vec2 d){return texture(uSrc,vUv+d*uTexel).rgb;}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  vec3 a=s(vec2(-2.,2.)),b=s(vec2(0.,2.)),c=s(vec2(2.,2.));
  vec3 d=s(vec2(-2.,0.)),e=s(vec2(0.)),f=s(vec2(2.,0.));
  vec3 g=s(vec2(-2.,-2.)),h=s(vec2(0.,-2.)),i=s(vec2(2.,-2.));
  vec3 j=s(vec2(-1.,1.)),k=s(vec2(1.,1.)),l=s(vec2(-1.,-1.)),m=s(vec2(1.,-1.));
  vec3 col;
  if(uPrefilter>.5){
    // Karis 平均：小さく明るい点がちらつかないよう、明るさで重みを下げる
    vec3 g0=(a+b+d+e)*.25,g1=(b+c+e+f)*.25,g2=(d+e+g+h)*.25,g3=(e+f+h+i)*.25,g4=(j+k+l+m)*.25;
    float w0=.125/(1.+luma(g0)),w1=.125/(1.+luma(g1)),w2=.125/(1.+luma(g2)),w3=.125/(1.+luma(g3)),w4=.5/(1.+luma(g4));
    col=(g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4);
    float br=max(col.r,max(col.g,col.b));
    float rq=clamp(br-uThreshold+uKnee,0.,2.*uKnee);
    rq=rq*rq/(4.*uKnee+1e-4);
    col*=max(rq,br-uThreshold)/max(br,1e-4);
  }else{
    col=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
  }
  o=vec4(col,1.);
}`;

  const UP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 o;
vec3 s(vec2 d){return texture(uSrc,vUv+d*uTexel).rgb;}
void main(){
  vec3 c=s(vec2(-1.,1.))+s(vec2(0.,1.))*2.+s(vec2(1.,1.))
        +s(vec2(-1.,0.))*2.+s(vec2(0.))*4.+s(vec2(1.,0.))*2.
        +s(vec2(-1.,-1.))+s(vec2(0.,-1.))*2.+s(vec2(1.,-1.));
  o=vec4(c/16.,1.);
}`;

  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene,uBloom;
uniform float uBloomStrength,uExposure,uFlash,uTime;
out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec3 c=texture(uScene,vUv).rgb+texture(uBloom,vUv).rgb*uBloomStrength;
  c+=vec3(1.,.96,.9)*uFlash;
  c+=vec3(.0012,.0016,.0032);
  c=aces(c*uExposure);
  c=pow(c,vec3(1./2.2));
  float n=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+uTime*7.)*43758.5453);
  c+=(n-.5)/255.;
  o=vec4(c,1.);
}`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
    }
    return shader;
  }

  function makeProgram(vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(gl.getProgramInfoLog(program) || "program link failed");
    }
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
    }
    return { program, u: uniforms };
  }

  let P;
  try {
    P = {
      galaxy: makeProgram(GALAXY_VS, POINT_FS),
      stars: makeProgram(STARS_VS, POINT_FS),
      nebula: makeProgram(NEBULA_VS, NEBULA_FS),
      bake: makeProgram(FULLSCREEN_VS, BAKE_FS),
      starCore: makeProgram(STAR_CORE_VS, STAR_CORE_FS),
      planet: makeProgram(PLANET_VS, PLANET_FS),
      ring: makeProgram(RING_VS, RING_FS),
      corona: makeProgram(CORONA_VS, CORONA_FS),
      line: makeProgram(LINE_VS, LINE_FS),
      down: makeProgram(FULLSCREEN_VS, DOWN_FS),
      up: makeProgram(FULLSCREEN_VS, UP_FS),
      composite: makeProgram(FULLSCREEN_VS, COMPOSITE_FS),
    };
  } catch (error) {
    if (window.console) console.warn("[cosmos]", error);
    measure();
    startDomOnly();
    return;
  }

  // ---------- バッファ ----------
  function buffer(data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  function attrib(loc, buf, size, stride, offset, divisor) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, divisor || 0);
  }
  function vertexArray(setup) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    setup();
    gl.bindVertexArray(null);
    return vao;
  }
  const quadBuffer = buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
  // 各インスタンスが vec4 を n 個ずつ持つ、毎フレーム書き換えるバッファ
  function instanced(vec4Count, capacity, firstLocation) {
    const data = new Float32Array(vec4Count * 4 * capacity);
    const buf = buffer(data, gl.DYNAMIC_DRAW);
    const vao = vertexArray(() => {
      attrib(0, quadBuffer, 2, 8, 0, 0);
      for (let k = 0; k < vec4Count; k++) attrib(firstLocation + k, buf, 4, vec4Count * 16, k * 16, 1);
    });
    return { data, buf, vao, count: 0, stride: vec4Count * 4 };
  }

  // ---------- 銀河の粒子 ----------
  const GALAXY_COUNT = lowPower ? 52000 : 96000;
  const galaxy = (function buildGalaxy() {
    const rnd = mulberry32(20261110);
    const data = new Float32Array(GALAXY_COUNT * 11);
    // 爆発の広がりにむらを付け、フィラメント状にする
    const waves = [];
    for (let i = 0; i < 7; i++) waves.push({ k: scale(unitVector(rnd), mix(2, 5.5, rnd())), phase: rnd() * TAU, amp: mix(0.05, 0.13, rnd()) });
    const avoid = systems.map((s) => [s.center, s.extent + 160]);
    const bulge = [linear("#ffe2b8"), linear("#ffcf95"), linear("#fff2dc")];
    const young = [linear("#c8d8ff"), linear("#e2ebff"), linear("#a9c2ff")];
    const old = [linear("#fff1dc"), linear("#ffe0bd"), linear("#f2f2f2")];
    const hii = linear("#ff7aa0");
    const pick = (list) => list[Math.floor(rnd() * list.length)];

    for (let i = 0; i < GALAXY_COUNT; i++) {
      let p = [0, 0, 0], col = old[0], size = 1;
      for (let attempt = 0; attempt < 8; attempt++) {
        const kind = rnd();
        if (kind < 0.16) {
          const r = Math.abs(gauss(rnd)) * 620 + rnd() * 140;
          const d = unitVector(rnd);
          p = [d[0] * r, d[1] * r * 0.6, d[2] * r];
          col = pick(bulge);
          size = 0.6 + Math.pow(rnd(), 3) * 1.6;
        } else if (kind < 0.8) {
          const arm = Math.floor(rnd() * 4);
          const major = arm % 2 === 0;
          const r = GALAXY_RADIUS * (0.09 + 0.91 * Math.pow(rnd(), major ? 0.9 : 0.75));
          const theta = arm * (TAU / 4) + Math.log(r / 420) * 2.7;
          const spread = (major ? 0.15 : 0.25) * (1 + 0.6 * (1 - r / GALAXY_RADIUS));
          const a = theta + gauss(rnd) * spread;
          const rr = r + gauss(rnd) * 90;
          p = [Math.cos(a) * rr, gauss(rnd) * (70 - 35 * (r / GALAXY_RADIUS)), Math.sin(a) * rr];
          const roll = rnd();
          col = roll < 0.06 ? hii : roll < 0.62 ? pick(young) : pick(old);
          size = 0.55 + Math.pow(rnd(), 3) * 2.4 + (roll < 0.06 ? 0.6 : 0);
        } else {
          const r = GALAXY_RADIUS * Math.sqrt(rnd()) * 1.05;
          const a = rnd() * TAU;
          p = [Math.cos(a) * r, gauss(rnd) * 110 * (1 - 0.5 * (r / GALAXY_RADIUS)), Math.sin(a) * r];
          col = pick(old);
          size = 0.45 + Math.pow(rnd(), 4) * 1.4;
        }
        // 星系のすぐ近くには置かない（目の前に大きな点が出ないように）
        if (avoid.every(([c, r]) => len(sub(p, c)) > r)) break;
      }
      const L = len(p) + 60;
      const dir = norm([p[0] + gauss(rnd) * L * 0.55, p[1] + gauss(rnd) * L * 0.9, p[2] + gauss(rnd) * L * 0.55]);
      let k = 1;
      waves.forEach((w) => (k += w.amp * Math.cos(dot(dir, w.k) + w.phase)));
      const reach = L * (1.05 + 0.5 * rnd()) * k + 300 * rnd();
      const brightness = mix(0.65, 1.25, rnd());
      const o = i * 11;
      data[o] = p[0]; data[o + 1] = p[1]; data[o + 2] = p[2];
      data[o + 3] = dir[0] * reach; data[o + 4] = dir[1] * reach; data[o + 5] = dir[2] * reach; data[o + 6] = rnd();
      data[o + 7] = col[0] * brightness; data[o + 8] = col[1] * brightness; data[o + 9] = col[2] * brightness; data[o + 10] = size;
    }
    const buf = buffer(data);
    const vao = vertexArray(() => {
      attrib(0, buf, 3, 44, 0);
      attrib(1, buf, 4, 44, 12);
      attrib(2, buf, 4, 44, 28);
    });
    return { vao, count: GALAXY_COUNT };
  })();

  // ---------- 遠くの星空・小惑星帯 ----------
  function pointCloud(points) {
    const data = new Float32Array(points.length * 7);
    points.forEach((pt, i) => data.set(pt, i * 7));
    const buf = buffer(data);
    return {
      count: points.length,
      vao: vertexArray(() => {
        attrib(0, buf, 3, 28, 0);
        attrib(1, buf, 4, 28, 12);
      }),
    };
  }

  const skyStars = (function () {
    const rnd = mulberry32(7);
    const tints = ["#ffffff", "#cfdcff", "#ffe8cc", "#ffd2a8", "#b8ccff"].map(linear);
    const points = [];
    const count = lowPower ? 5000 : 9000;
    for (let i = 0; i < count; i++) {
      const d = unitVector(rnd);
      const c = tints[Math.floor(rnd() * tints.length)];
      const b = mix(0.25, 0.9, rnd());
      points.push([d[0] * 30000, d[1] * 30000, d[2] * 30000, c[0] * b, c[1] * b, c[2] * b, 0.45 + Math.pow(rnd(), 5) * 1.6]);
    }
    return pointCloud(points);
  })();

  systems.forEach((sys) => {
    if (!sys.belt) return;
    const rnd = mulberry32(hashString(sys.id + ":belt"));
    const tints = ["#b8a58f", "#8f877d", "#d1c2ad"].map(linear);
    const points = [];
    const count = lowPower ? 1400 : 2600;
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU;
      const r = mix(sys.belt.inner, sys.belt.outer, Math.pow(rnd(), 0.8));
      const h = gauss(rnd) * 1.4;
      const base = orbitPoint(sys, r, a, 0, 0);
      const c = tints[Math.floor(rnd() * tints.length)];
      const b = mix(0.18, 0.5, rnd());
      points.push([base[0] + sys.normal[0] * h, base[1] + sys.normal[1] * h, base[2] + sys.normal[2] * h, c[0] * b, c[1] * b, c[2] * b, 0.5 + rnd() * 0.9]);
    }
    sys.beltCloud = pointCloud(points);
    sys.beltMatrix = new Float32Array(16);
  });
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // ---------- 星雲 ----------
  const NEBULA_MASKS = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  function nebulaSet(list) {
    const data = new Float32Array(list.length * 16);
    list.forEach((n, i) => data.set([].concat(n.pos, [n.size], n.c1, [n.intensity], n.c2, [n.rot], n.mask), i * 16));
    const buf = buffer(data);
    return {
      count: list.length,
      vao: vertexArray(() => {
        attrib(0, quadBuffer, 2, 8, 0, 0);
        for (let k = 0; k < 4; k++) attrib(1 + k, buf, 4, 64, k * 16, 1);
      }),
    };
  }

  const galaxyNebulae = (function () {
    const rnd = mulberry32(31337);
    const palette = [
      ["#ff5c7a", "#ff9a6a", 0.4],
      ["#5f86ff", "#9fc4ff", 0.25],
      ["#9a6bff", "#ff7ad0", 0.15],
      ["#3fd0c8", "#7a9cff", 0.1],
      ["#ffb06a", "#ff6a5a", 0.1],
    ];
    const list = [];
    const count = lowPower ? 46 : 72;
    for (let i = 0; i < count; i++) {
      const arm = Math.floor(rnd() * 4);
      const r = GALAXY_RADIUS * mix(0.18, 0.98, Math.pow(rnd(), 0.8));
      const a = arm * (TAU / 4) + Math.log(r / 420) * 2.7 + gauss(rnd) * 0.14;
      let roll = rnd(), choice = palette[0];
      for (const entry of palette) {
        if ((roll -= entry[2]) <= 0) {
          choice = entry;
          break;
        }
      }
      list.push({
        pos: [Math.cos(a) * r, gauss(rnd) * 50, Math.sin(a) * r],
        size: mix(380, 1500, Math.pow(rnd(), 1.6)),
        c1: linear(choice[0]),
        c2: linear(choice[1]),
        intensity: mix(0.05, 0.13, rnd()),
        rot: rnd() * TAU,
        mask: NEBULA_MASKS[Math.floor(rnd() * 3)],
      });
    }
    // 銀河の中心の、ぼんやりした光
    list.push({ pos: [0, 0, 0], size: 2600, c1: linear("#ffd29a"), c2: linear("#ffe8c8"), intensity: 0.12, rot: 0.3, mask: NEBULA_MASKS[0] });
    list.push({ pos: [0, 0, 0], size: 1200, c1: linear("#fff0d8"), c2: linear("#ffd6a0"), intensity: 0.2, rot: 1.7, mask: NEBULA_MASKS[0] });
    // 惑星状星雲
    systems.forEach((sys) => {
      if (!sys.nebula) return;
      list.push({ pos: sys.center.slice(), size: sys.extent * 1.15, c1: linear("#5ff2d6"), c2: linear("#ff5a4a"), intensity: 0.45, rot: 0.4, mask: NEBULA_MASKS[3] });
      list.push({ pos: sys.center.slice(), size: sys.extent * 1.8, c1: linear("#ff4a5e"), c2: linear("#6a7cff"), intensity: 0.07, rot: 1.2, mask: NEBULA_MASKS[1] });
    });
    return nebulaSet(list);
  })();

  // 爆発の火の玉（原点のまわり。大きさは描くときに広げる）
  const blastClouds = (function () {
    const rnd = mulberry32(99);
    const colors = [["#ffffff", "#bcd2ff"], ["#ffd6a0", "#ff8a4a"], ["#ff8a5a", "#ff4a6a"], ["#a8c0ff", "#ffffff"]];
    const list = [];
    for (let i = 0; i < 14; i++) {
      const c = colors[Math.floor(rnd() * colors.length)];
      list.push({
        pos: scale(unitVector(rnd), mix(0.05, 0.55, rnd())),
        size: mix(0.35, 0.9, rnd()),
        c1: linear(c[0]),
        c2: linear(c[1]),
        intensity: mix(0.25, 0.6, rnd()),
        rot: rnd() * TAU,
        mask: NEBULA_MASKS[Math.floor(rnd() * 3)],
      });
    }
    return nebulaSet(list);
  })();

  // 星雲のテクスチャを一度だけ焼く
  const nebulaTexture = (function () {
    const size = 512;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, size, size);
    gl.useProgram(P.bake.program);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  })();

  // ---------- 軌道と航路の線 ----------
  const ORBIT_SEGMENTS = 192;
  const lines = (function () {
    const values = [];
    systems.forEach((sys) => {
      sys.planets.forEach((planet) => {
        planet.orbitStart = values.length / 4;
        for (let s = 0; s <= ORBIT_SEGMENTS; s++) {
          const angle = (s / ORBIT_SEGMENTS) * TAU;
          const p = orbitPoint(sys, planet.a, angle, planet.incl, planet.node);
          values.push(p[0], p[1], p[2], angle);
        }
      });
    });
    // 航路：訪れた星系を通る滑らかな曲線（param は道のり）
    const routeStart = values.length / 4;
    const pts = systems.map((s) => s.center);
    let distance = 0, last = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < 32; s++) {
        const t = s / 32, t2 = t * t, t3 = t2 * t;
        const p = [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3));
        if (last) distance += len(sub(p, last));
        values.push(p[0], p[1], p[2], distance);
        last = p;
      }
    }
    if (pts.length) {
      const p = pts[pts.length - 1];
      if (last) distance += len(sub(p, last));
      values.push(p[0], p[1], p[2], distance);
    }
    const routeCount = values.length / 4 - routeStart;
    const buf = buffer(new Float32Array(values));
    return { vao: vertexArray(() => attrib(0, buf, 4, 16, 0)), routeStart, routeCount };
  })();

  // ---------- 毎フレーム書き換えるインスタンス ----------
  const totalStars = systems.reduce((n, s) => n + s.stars.length, 0) + 1;
  const totalPlanets = systems.reduce((n, s) => n + s.planets.reduce((m, p) => m + 1 + p.moons.length, 0), 0);
  const totalRings = systems.reduce((n, s) => n + s.planets.filter((p) => p.ring).length, 0);
  const coreInstances = instanced(2, totalStars, 1);
  const coronaInstances = instanced(3, totalStars, 1);
  const planetInstances = instanced(7, Math.max(1, totalPlanets), 1);
  const ringInstances = instanced(5, Math.max(1, totalRings), 1);

  // ---------- 描画先（HDR + MSAA + ブルームの縮小列） ----------
  const maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
  let samples = Math.min(4, maxSamples);
  let width = 0, height = 0, renderScale = 1;
  let targets = null;

  function makeTexture(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR_FORMAT, w, h, 0, gl.RGBA, HDR_TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  function makeTarget(w, h) {
    const tex = makeTexture(w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  function releaseTargets() {
    if (!targets) return;
    const t = targets;
    [t.scene].concat(t.mips).forEach((x) => {
      gl.deleteTexture(x.tex);
      gl.deleteFramebuffer(x.fbo);
    });
    if (t.msFbo) gl.deleteFramebuffer(t.msFbo);
    t.renderbuffers.forEach((rb) => gl.deleteRenderbuffer(rb));
    targets = null;
  }
  function createTargets(w, h) {
    releaseTargets();
    const t = { renderbuffers: [], msFbo: null };
    t.scene = makeTarget(w, h);
    if (samples > 0) {
      const color = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, color);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, HDR_FORMAT, w, h);
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      t.msFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      t.renderbuffers.push(color, depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        // MSAA が使えなければ、そのまま描く
        samples = 0;
        targets = t;
        return createTargets(w, h);
      }
    } else {
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.scene.fbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      t.renderbuffers.push(depth);
    }
    t.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < 6; i++) {
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
      t.mips.push(makeTarget(mw, mh));
      if (mw <= 2 || mh <= 2) break;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    targets = t;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.75) * renderScale;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (w === width && h === height && targets) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    createTargets(w, h);
  }

  // ==================================================
  // 描画
  // ==================================================
  const view = new Float32Array(16);
  const proj = new Float32Array(16);
  const viewToWorld = new Float32Array(9);
  let time = 0;

  function writeInstances(sysList, camPos) {
    // 恒星（中心の球とコロナ）
    let ci = 0;
    const core = coreInstances.data, corona = coronaInstances.data;
    systems.forEach((sys) => {
      sys.stars.forEach((star) => {
        const p = star.position;
        core.set([p[0], p[1], p[2], star.radius, star.color[0], star.color[1], star.color[2], star.intensity], ci * 8);
        corona.set([p[0], p[1], p[2], star.radius, star.color[0], star.color[1], star.color[2], star.intensity * 0.3, star.seed, sys.style.star === "WD" || sys.style.star === "Gg" ? 1.4 : 0.8, 0, 0], ci * 12);
        ci++;
      });
    });
    coreInstances.count = ci;
    coronaInstances.count = ci;

    // 惑星・衛星・環（近くの星系だけ）
    let pi = 0, ri = 0;
    const pd = planetInstances.data, rd = ringInstances.data;
    sysList.forEach((sys) => {
      const light = sys.center;
      const lc = sys.lightColor;
      sys.planets.forEach((planet) => {
        const p = planet.position;
        const pal = planet.palette;
        pd.set([
          p[0], p[1], p[2], planet.radius,
          light[0], light[1], light[2], planet.type,
          pal[0][0], pal[0][1], pal[0][2], planet.seed,
          pal[1][0], pal[1][1], pal[1][2], time * planet.spinSpeed,
          pal[2][0], pal[2][1], pal[2][2], planet.highlight,
          planet.atmosphere[0], planet.atmosphere[1], planet.atmosphere[2], planet.tilt,
          lc[0], lc[1], lc[2], planet.atmosphereStrength,
        ], pi * 28);
        pi++;
        planet.moons.forEach((moon) => {
          const m = moon.position, mp = moon.palette;
          pd.set([
            m[0], m[1], m[2], moon.radius,
            light[0], light[1], light[2], 0,
            mp[0][0], mp[0][1], mp[0][2], moon.seed,
            mp[1][0], mp[1][1], mp[1][2], time * 0.1,
            mp[2][0], mp[2][1], mp[2][2], 0,
            0.6, 0.6, 0.6, 0.1,
            lc[0], lc[1], lc[2], 0.15,
          ], pi * 28);
          pi++;
        });
        if (planet.ring) {
          const r = planet.ring;
          rd.set([
            p[0], p[1], p[2], r.outer,
            r.normal[0], r.normal[1], r.normal[2], r.inner,
            r.color[0], r.color[1], r.color[2], planet.radius,
            light[0], light[1], light[2], r.seed,
            lc[0], lc[1], lc[2], 1,
          ], ri * 20);
          ri++;
        }
      });
    });
    planetInstances.count = pi;
    ringInstances.count = ri;

    [coreInstances, coronaInstances, planetInstances, ringInstances].forEach((inst) => {
      if (!inst.count) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, inst.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.data, 0, inst.count * inst.stride);
    });
  }

  function setCommon(prog, focal) {
    gl.useProgram(prog.program);
    const u = prog.u;
    if (u.uView) gl.uniformMatrix4fv(u.uView, false, view);
    if (u.uProj) gl.uniformMatrix4fv(u.uProj, false, proj);
    if (u.uViewToWorld) gl.uniformMatrix3fv(u.uViewToWorld, false, viewToWorld);
    if (u.uTime) gl.uniform1f(u.uTime, time);
    if (u.uFocal) gl.uniform1f(u.uFocal, focal);
    if (u.uDpr) gl.uniform1f(u.uDpr, width / Math.max(1, canvas.clientWidth));
    if (u.uTwinkle) gl.uniform1f(u.uTwinkle, reduced ? 0 : 1);
    return u;
  }

  function render(cam) {
    const aspect = width / height;
    perspective(proj, (cam.fov * Math.PI) / 180, aspect, 0.5, 90000, cam.shift[0], cam.shift[1]);
    lookAt(view, viewToWorld, cam.pos, cam.target);
    const focal = (proj[5] * height) / 2;
    const bang = cam.bang;
    let u;

    // 近くの星系だけ、惑星や軌道を描く
    const near = [];
    systems.forEach((sys) => {
      updateBodies(sys, time);
      sys.camDist = len(sub(cam.pos, sys.center));
      if (bang > 0.9 && sys.camDist < Math.max(3200, sys.extent * 26)) near.push(sys);
    });
    writeInstances(near, cam.pos);

    const t = targets;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFbo || t.scene.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    if (samples > 0) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    // 1. 不透明：恒星の球と惑星（深度を書く）
    if (bang > 0.9) {
      setCommon(P.starCore, focal);
      gl.bindVertexArray(coreInstances.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, coreInstances.count);
      if (planetInstances.count) {
        setCommon(P.planet, focal);
        gl.bindVertexArray(planetInstances.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, planetInstances.count);
      }
    }
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    // 2. 半透明：惑星の環
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    if (ringInstances.count) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      setCommon(P.ring, focal);
      gl.bindVertexArray(ringInstances.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ringInstances.count);
    }

    // 3. 加算：星空・銀河・星雲・軌道・コロナ
    gl.blendFunc(gl.ONE, gl.ONE);
    u = setCommon(P.stars, focal);
    gl.uniformMatrix4fv(u.uModel, false, IDENTITY);
    gl.uniform1f(u.uAlpha, smooth(0.4, 1, bang) * 0.9);
    gl.uniform1f(u.uWorld, 0);
    gl.bindVertexArray(skyStars.vao);
    gl.drawArrays(gl.POINTS, 0, skyStars.count);

    u = setCommon(P.nebula, focal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, nebulaTexture);
    gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uScale, 1);
    gl.uniform1f(u.uAlpha, smooth(0.5, 1, bang));
    gl.bindVertexArray(galaxyNebulae.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, galaxyNebulae.count);
    if (bang > 0.04 && bang < 0.8) {
      const e = smooth(0.045, 0.62, bang);
      const blast = 1 - Math.pow(1 - e, 2.6);
      gl.uniform1f(u.uScale, 300 + blast * 4200);
      gl.uniform1f(u.uAlpha, smooth(0.04, 0.08, bang) * (1 - smooth(0.22, 0.7, bang)) * 0.75);
      gl.bindVertexArray(blastClouds.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, blastClouds.count);
    }

    if (bang > 0.04) {
      u = setCommon(P.galaxy, focal);
      gl.uniform1f(u.uBang, bang);
      // 銀河の中にいるときは、円盤の帯が白く飽和しないよう少し抑える
      gl.uniform1f(u.uGain, mix(1, 0.68, smooth(9000, 5000, len(cam.pos))));
      gl.bindVertexArray(galaxy.vao);
      gl.drawArrays(gl.POINTS, 0, galaxy.count);
    }

    if (near.length) {
      u = setCommon(P.stars, focal);
      gl.uniform1f(u.uWorld, 1);
      gl.uniform1f(u.uAlpha, 1);
      near.forEach((sys) => {
        if (!sys.beltCloud) return;
        rotationAbout(sys.beltMatrix, sys.center, sys.normal, time * sys.belt.speed);
        gl.uniformMatrix4fv(u.uModel, false, sys.beltMatrix);
        gl.bindVertexArray(sys.beltCloud.vao);
        gl.drawArrays(gl.POINTS, 0, sys.beltCloud.count);
      });

      u = setCommon(P.line, focal);
      gl.uniform1f(u.uMode, 0);
      gl.bindVertexArray(lines.vao);
      near.forEach((sys) => {
        const fade = smooth(sys.extent * 10, sys.extent * 3, sys.camDist) * 0.55;
        if (fade <= 0.001) return;
        const tint = lerp3([0.55, 0.7, 1.0], sys.stars[0].color, 0.35);
        gl.uniform3f(u.uColor, tint[0], tint[1], tint[2]);
        sys.planets.forEach((planet) => {
          gl.uniform1f(u.uAlpha, fade * 0.5);
          gl.uniform1f(u.uPhase, planet.angle);
          gl.uniform1f(u.uHi, planet.highlight);
          gl.drawArrays(gl.LINE_STRIP, planet.orbitStart, ORBIT_SEGMENTS + 1);
        });
      });
    }

    if (cam.outro > 0.001 && lines.routeCount > 1) {
      u = setCommon(P.line, focal);
      gl.uniform1f(u.uMode, 1);
      gl.uniform1f(u.uPhase, time * 0.35);
      gl.uniform1f(u.uAlpha, cam.outro * 0.9);
      gl.uniform3f(u.uColor, 0.55, 0.8, 1.0);
      gl.bindVertexArray(lines.vao);
      gl.drawArrays(gl.LINE_STRIP, lines.routeStart, lines.routeCount);
    }

    if (bang > 0.9) {
      setCommon(P.corona, focal);
      gl.bindVertexArray(coronaInstances.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, coronaInstances.count);
    }

    // 特異点：爆発の直前にいちばん明るくなり、閃光とともに消える
    if (bang < 0.12) {
      const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(time * 2.4);
      const charge = 1 + smooth(0, 0.05, bang) * 3;
      const fade = 1 - smooth(0.05, 0.1, bang);
      const data = coronaInstances.data;
      data.set([0, 0, 0, 0.55, 0.85, 0.92, 1.0, 2.4 * pulse * charge * fade, 0.3, 1.6, 0, 0], 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, coronaInstances.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, 12);
      setCommon(P.corona, focal);
      gl.bindVertexArray(coronaInstances.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
    }

    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    // MSAA を解決
    if (t.msFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.scene.fbo);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    // ブルーム
    u = P.down.u;
    gl.useProgram(P.down.program);
    gl.uniform1i(u.uSrc, 0);
    gl.uniform1f(u.uThreshold, 1.0);
    gl.uniform1f(u.uKnee, 0.5);
    let src = t.scene;
    t.mips.forEach((mip, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mip.fbo);
      gl.viewport(0, 0, mip.w, mip.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(u.uTexel, 1 / src.w, 1 / src.h);
      gl.uniform1f(u.uPrefilter, i === 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = mip;
    });
    gl.useProgram(P.up.program);
    gl.uniform1i(P.up.u.uSrc, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = t.mips.length - 1; i > 0; i--) {
      const from = t.mips[i], to = t.mips[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.viewport(0, 0, to.w, to.h);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform2f(P.up.u.uTexel, 1 / from.w, 1 / from.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // 仕上げ：トーンマッピングして画面へ
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(P.composite.program);
    u = P.composite.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.scene.tex);
    gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.mips[0].tex);
    gl.uniform1i(u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.uBloomStrength, 0.75);
    gl.uniform1f(u.uExposure, 1.0);
    const flash = smooth(0.035, 0.055, bang) * (1 - smooth(0.055, 0.1, bang)) * 1.2;
    gl.uniform1f(u.uFlash, flash);
    gl.uniform1f(u.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // 一覧の項目にポインターやフォーカスを当てると、その惑星と軌道が光る
  systems.forEach((sys) => {
    sys.bodies.forEach((el, j) => {
      const planet = sys.planets[j];
      if (!planet) return;
      const on = () => {
        planet.highlightTarget = 1;
        el.classList.add("is-highlighted");
      };
      const off = () => {
        planet.highlightTarget = 0;
        el.classList.remove("is-highlighted");
      };
      el.addEventListener("pointerenter", on);
      el.addEventListener("pointerleave", off);
      el.addEventListener("focusin", on);
      el.addEventListener("focusout", off);
    });
  });

  // ==================================================
  // ループ
  // ==================================================
  let scrollCurrent = window.scrollY;
  let lastNow = 0;
  let frames = 0;
  let slowFrames = 0, fastFrames = 0;
  let stillIndex = -1, cutTimer = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60;
    lastNow = now;
    if (document.hidden) return;
    if (!reduced) time += dt;

    const goal = clamp(window.scrollY, 0, maxScroll);
    // 時間に基づく減衰なので、60 / 120 Hz のどちらでも同じ速さで追いつく
    scrollCurrent = reduced ? goal : scrollCurrent + (goal - scrollCurrent) * (1 - Math.exp(-dt * 5));
    if (Math.abs(goal - scrollCurrent) < 0.05) scrollCurrent = goal;

    systems.forEach((sys) => sys.planets.forEach((planet) => {
      planet.highlight += (planet.highlightTarget - planet.highlight) * (1 - Math.exp(-dt * 8));
    }));

    if (reduced) {
      const index = activeStop(goal);
      if (index !== stillIndex) {
        if (stillIndex < 0) stillIndex = index;
        else if (!cutTimer) {
          canvas.classList.add("is-cut");
          cutTimer = window.setTimeout(() => {
            stillIndex = activeStop(window.scrollY);
            cutTimer = 0;
            canvas.classList.remove("is-cut");
          }, 220);
        }
      }
      stillShot(stillIndex, camera);
    } else {
      cameraAt(scrollCurrent, camera);
      // ほんの少しだけ漂わせる
      const sway = len(sub(camera.pos, camera.target)) * 0.0025;
      camera.pos = [camera.pos[0] + Math.sin(time * 0.31) * sway, camera.pos[1] + Math.sin(time * 0.23 + 1) * sway, camera.pos[2] + Math.cos(time * 0.27) * sway];
    }

    const where = locate(goal);
    syncDom(goal, reduced ? camera.bang : where.index === 0 && !where.transit ? where.p : 1);
    render(camera);

    // 重い端末では解像度を少し下げる
    if (frames > 10) {
      if (dt > 0.028) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (dt < 0.014) fastFrames++;
      else fastFrames = 0;
      if (slowFrames > 40 && renderScale > 0.55) {
        renderScale *= 0.85;
        slowFrames = 0;
        resize();
      } else if (fastFrames > 240 && renderScale < 1) {
        renderScale = Math.min(1, renderScale / 0.85);
        fastFrames = 0;
        resize();
      }
    }

    frames++;
    if (frames === 3) {
      canvas.classList.add("is-ready");
      root.classList.add("cosmos-ready");
    }
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    running = false;
    canvas.classList.remove("is-ready");
  });

  let resizeQueued = false;
  function queueLayout() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      measure();
      resize();
    });
  }
  window.addEventListener("resize", queueLayout);
  if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(page);
  page.addEventListener("toggle", queueLayout, true);
  window.addEventListener("load", queueLayout);
  const onMotionChange = () => {
    reduced = motionQuery.matches;
  };
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionChange);

  measure();
  resize();
  scrollCurrent = clamp(window.scrollY, 0, maxScroll);
  requestAnimationFrame(frame);
})();
