// Run after scripts/build_cosmos.sh. Executes the real Go Wasm binary in Node.
// This covers the browser bridge ABI, not GPU rendering or visual appearance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const reference = JSON.parse(fs.readFileSync(path.join(root, "cosmos/testdata/javascript.json")));
const runtime = fs.readFileSync(path.join(root, "assets/wasm/wasm_exec.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "assets/js/cosmos.js"), "utf8");
const wasm = fs.readFileSync(path.join(root, "assets/wasm/cosmos.wasm"));
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
};
const decode = (bytes, Type) => new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / Type.BYTES_PER_ELEMENT);
function environment(extra = {}) {
  const context = vm.createContext({ console, crypto: webcrypto, performance, TextEncoder, TextDecoder, WebAssembly, setTimeout, clearTimeout, URL, ...extra });
  vm.runInContext(runtime, context);
  return context;
}
async function testBridge() {
  let ready;
  const initialized = new Promise(resolve => { ready = resolve; });
  const context = environment({ __cosmosGoReady: ready });
  const go = new context.Go();
  const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
  go.run(instance).catch(error => { throw error; });
  const engine = await initialized;
  const scene = JSON.parse(engine.init(JSON.stringify({ systems: reference.descriptors, portrait: false })));
  assert.equal(scene.systems.length, reference.descriptors.length);
  assert.equal(scene.routeStart, reference.routeStart);
  assert.equal(scene.routeCount, reference.routeCount);
  for (const sample of reference.timeSamples) {
    const positions = decode(engine.bodies(sample.time), Float64Array);
    assert.equal(positions.length, sample.values.length);
    positions.forEach((value, i) => close(value, sample.values[i]));
  }
  const names = { galaxy: "galaxy", sky: "sky", belt: "belt", nebula: "nebula", blast: "blast", lines: "lines" };
  for (const [name, want] of Object.entries(reference.particles)) {
    const values = decode(engine.particles(names[name], false, 3), Float32Array);
    assert.equal(values.length, want.length);
    want.indices.forEach((index, i) => close(values[index], want.values[i], 1e-6));
  }
  for (const [name, count, stride] of [["galaxy", 52000, 11], ["sky", 5000, 7], ["belt", 1400, 7]]) {
    assert.equal(decode(engine.particles(name, true, 3), Float32Array).length, count * stride);
  }
  const stops = Array.from({ length: scene.systems.length + 2 }, (_, i) => ({ R: i * 200, D: i * 200 + 100 }));
  engine.layout(JSON.stringify({ stops, portrait: false, narrow: false }));
  for (let scroll = 0; scroll <= stops.at(-1).D; scroll += 25) {
    const camera = decode(engine.camera(scroll, -1, 12), Float64Array);
    assert.equal(camera.length, 11);
    camera.forEach(value => assert.ok(Number.isFinite(value)));
  }
  const stillA = Array.from(decode(engine.camera(250, 1, 0), Float64Array));
  const stillB = Array.from(decode(engine.camera(250, 1, 100), Float64Array));
  assert.deepEqual(stillA, stillB);
  console.log("PASS real Go/Wasm bridge: scene, bodies, particle buffers, camera, reduced motion");
}

function element() {
  const classes = new Set();
  return {
    style: { setProperty() {} },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, on) { if (on) classes.add(value); else classes.delete(value); } },
    addEventListener() {}, setAttribute() {}, removeAttribute() {},
    getBoundingClientRect: () => ({ top: 2000, bottom: 3000, width: 1440, height: 900 }),
    offsetHeight: 2000, clientWidth: 1440,
  };
}
async function testLoader({ missing = false, webgl = true, reduced = false, portrait = false, scroll = 0, mime = "application/wasm", runtimeMissing = false } = {}) {
  const warnings = [], draws = [], frames = [], requested = [];
  const canvas = element(), documentRoot = element(), page = element();
  documentRoot.scrollHeight = 30000;
  const constants = new Map();
  const gl = new Proxy({}, { get(_, key) {
    if (key === "getProgramParameter") return (_, parameter) => parameter === gl.ACTIVE_UNIFORMS ? 0 : true;
    if (key === "getShaderParameter") return () => true;
    if (key === "getParameter") return () => 4;
    if (key === "checkFramebufferStatus") return () => gl.FRAMEBUFFER_COMPLETE;
    if (key === "getExtension") return () => ({});
    if (key === "isContextLost") return () => false;
    if (key.startsWith("create")) return () => ({});
    if (key.startsWith("draw")) return (...args) => draws.push([key, ...args]);
    if (/^[A-Z_0-9]+$/.test(key)) { if (!constants.has(key)) constants.set(key, constants.size + 1); return constants.get(key); }
    return () => {};
  } });
  canvas.getContext = () => webgl ? gl : null;
  const hero = element(), outro = element();
  const sections = reference.descriptors.map((d, index) => {
    const el = element();
    if (d.side === "right") el.classList.add("cosmos-system--right");
    el.getAttribute = () => d.id;
    el.getBoundingClientRect = () => ({ top: 3000 + index * 2000 - scroll, bottom: 4000 + index * 2000 - scroll });
    el.querySelector = selector => selector === ".cosmos-panel" ? el : null;
    el.querySelectorAll = () => Array.from({ length: d.count }, (_, i) => Object.assign(element(), { getAttribute: () => String(d.moons[i] || 0) }));
    return el;
  });
  page.querySelector = selector => selector.includes("bang") ? hero : outro;
  page.querySelectorAll = () => sections;
  let context = environment({
    console: { warn: (...args) => warnings.push(args) },
    navigator: { hardwareConcurrency: 8 },
    document: {
      currentScript: { src: "http://example.test/homepage/assets/js/cosmos.js?v=test-version" },
      documentElement: documentRoot, hidden: false,
      querySelector: selector => selector === "[data-cosmos-canvas]" ? canvas : page,
      querySelectorAll: () => [],
    },
    innerWidth: portrait ? 390 : 1440, innerHeight: 900, scrollY: scroll, devicePixelRatio: 1,
    matchMedia: query => ({ matches: query.includes("reduced") ? reduced : portrait, addEventListener() {} }),
    addEventListener() {}, requestAnimationFrame: fn => frames.push(fn),
    fetch: async url => { requested.push(String(url)); return new Response(missing ? "missing" : wasm, { status: missing ? 404 : 200, headers: { "Content-Type": mime } }); },
  });
  context.window = context;
  if (runtimeMissing) context.Go = undefined;
  await vm.runInContext(renderer, context);
  assert.equal(requested.length, runtimeMissing ? 0 : 1);
  if (!runtimeMissing) assert.equal(requested[0], "http://example.test/homepage/assets/wasm/cosmos.wasm?v=test-version");
  if (missing || runtimeMissing) {
    assert.equal(warnings.length, 1);
    assert.equal(canvas.classList.contains("is-ready"), false);
    assert.equal(draws.length, 0);
  } else if (webgl) {
    for (let i = 0; i < 4; i++) { assert.ok(frames.length); frames.shift()(i * 16.667); }
    assert.equal(warnings.length, 0);
    assert.ok(canvas.classList.contains("is-ready"));
    assert.ok(documentRoot.classList.contains("cosmos-ready"));
    assert.ok(draws.length > 10);
  } else {
    assert.ok(documentRoot.classList.contains("cosmos-ready"));
    assert.equal(draws.length, 0);
    assert.equal(warnings.length, 0);
  }
  console.log(`PASS loader / JS rendering bridge: ${JSON.stringify({ missing, webgl, reduced, portrait, scroll, mime, runtimeMissing })}`);
}
(async () => {
  await testBridge();
  await testLoader();
  await testLoader({ scroll: 5000 });
  await testLoader({ portrait: true, scroll: 15000 });
  await testLoader({ reduced: true, scroll: 5000 });
  await testLoader({ reduced: true, scroll: 29000 });
  await testLoader({ mime: "application/octet-stream" });
  await testLoader({ webgl: false });
  await testLoader({ missing: true });
  await testLoader({ runtimeMissing: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
