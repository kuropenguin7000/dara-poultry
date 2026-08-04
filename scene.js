/* ============================================================
   Dara Poultry — 3D egg field
   ------------------------------------------------------------
   A single fixed WebGL canvas sits behind the whole page. A field
   of eggs re-forms as you scroll (loose cloud -> carton grid ->
   harvest arc -> drift out) while the camera scrubs along a fixed
   path, so motion always tracks scroll position rather than firing
   one-shot callbacks.

   Progressive enhancement: nothing here is required to read the
   page. If the module fails to load, WebGL is unavailable, or the
   visitor prefers reduced motion, the 2D hero art stays in place
   and `body.has-3d` is never set.
   ============================================================ */

import * as THREE from "three";

const canvas = document.getElementById("scene");
if (canvas) init(canvas);

function init(canvas) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Renderer (bail out quietly if WebGL is missing) ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: window.devicePixelRatio < 2,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.warn("Dara Poultry: WebGL unavailable, using 2D fallback.", err);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  /* Distant eggs fade into the page background instead of hard-edging. */
  scene.fog = new THREE.Fog(0xfbefd6, 11, 26);

  /* ---------- Sunrise environment + lights ---------- */
  scene.environment = makeSunriseEnv(renderer);

  scene.add(new THREE.HemisphereLight(0xfff3dc, 0xb98c55, 0.85));

  const key = new THREE.DirectionalLight(0xffe7b8, 2.1);
  key.position.set(4.5, 6, 5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffb84d, 1.0);
  rim.position.set(-5, -1.5, -3);
  scene.add(rim);

  /* ---------- The eggs ---------- */
  const eggGeo = new THREE.LatheGeometry(eggProfile(44), 40);
  eggGeo.computeVertexNormals();

  const shells = [
    { color: 0xfff6e8, roughness: 0.40, clearcoat: 0.55 }, // white
    { color: 0xf4dcb0, roughness: 0.44, clearcoat: 0.50 }, // cream
    { color: 0xd9a96a, roughness: 0.50, clearcoat: 0.40 }, // brown
    { color: 0xf5b301, roughness: 0.26, clearcoat: 0.80 }, // gold accent
  ].map(
    (s) =>
      new THREE.MeshPhysicalMaterial({
        color: s.color,
        roughness: s.roughness,
        metalness: 0,
        clearcoat: s.clearcoat,
        clearcoatRoughness: 0.32,
        envMapIntensity: 0.95,
      })
  );

  const isNarrow = window.innerWidth < 760;
  const COUNT = isNarrow ? 9 : window.innerWidth < 1200 ? 14 : 20;

  const rand = mulberry32(20240706);
  const group = new THREE.Group();
  scene.add(group);

  const eggs = [];
  for (let i = 0; i < COUNT; i++) {
    // Index 0 is the hero egg: bigger, front and centre-right.
    const hero = i === 0;
    const mat = hero ? shells[0] : shells[Math.floor(rand() * shells.length)];
    const mesh = new THREE.Mesh(eggGeo, mat);

    const scale = hero ? 1.5 : 0.42 + rand() * 0.45;
    mesh.scale.setScalar(scale);
    group.add(mesh);

    eggs.push({
      mesh,
      hero,
      scale,
      phase: rand() * Math.PI * 2,
      bob: 0.09 + rand() * 0.12,
      spin: (hero ? 0.16 : 0.10 + rand() * 0.28) * (rand() > 0.5 ? 1 : -1),
      tilt: (rand() - 0.5) * 0.7,
      layouts: null, // filled by buildLayouts()
      pos: new THREE.Vector3(),
    });
  }

  /* ---------- Scroll keyframes ---------- */
  // Camera path, one entry per layout. Scroll scrubs continuously
  // between them — no onEnter/onLeave snapping.
  const camPath = [
    new THREE.Vector3(0, 0, 9.0),   // hero cloud
    new THREE.Vector3(0.5, 0.4, 7.4), // carton grid
    new THREE.Vector3(0, -0.3, 8.6),  // harvest arc
    new THREE.Vector3(0, 0.6, 11.5),  // drift out
  ];
  const LAYOUTS = camPath.length;

  buildLayouts();

  function buildLayouts() {
    // Horizontal room shrinks with the viewport; on narrow screens the
    // field also retreats in z so it never fights the copy for attention.
    const aspect = window.innerWidth / window.innerHeight;
    const spread = THREE.MathUtils.clamp(aspect * 3.4, 2.2, 6.2);
    const depth = aspect < 1 ? -2 : 0;
    const r = mulberry32(991177);

    eggs.forEach((egg, i) => {
      const t = i / Math.max(COUNT - 1, 1);

      // A — hero cloud, weighted to the right of the copy column
      const cloud = egg.hero
        ? new THREE.Vector3(spread * 0.42, 0.1, 1.2 + depth * 0.4)
        : new THREE.Vector3(
            spread * (0.12 + r() * 0.95),
            (r() - 0.5) * 5.4,
            -6 + r() * 6 + depth
          );

      // B — carton grid
      const cols = isNarrow ? 3 : 5;
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      const grid = new THREE.Vector3(
        (gx - (cols - 1) / 2) * (spread * 0.30) + spread * 0.14,
        ((Math.ceil(COUNT / cols) - 1) / 2 - gy) * 1.15,
        -1.4 + Math.sin(gx * 1.3 + gy) * 0.5 + depth
      );

      // C — harvest arc sweeping across the viewport
      const ax = (t - 0.5) * spread * 1.9;
      const arc = new THREE.Vector3(
        ax,
        Math.sin(t * Math.PI * 1.6) * 2.0 - 0.4,
        -2.2 + Math.cos(t * Math.PI * 2) * 1.8 + depth
      );

      // D — drift back out into the warm haze
      const drift = new THREE.Vector3(
        (r() - 0.5) * spread * 2.3,
        (r() - 0.5) * 6.5,
        -9 + r() * 7 + depth
      );

      egg.layouts = [cloud, grid, arc, drift];
    });
  }

  /* ---------- State ---------- */
  const clock = new THREE.Clock();
  let progress = 0;        // damped scroll progress, 0..1
  let targetProgress = 0;  // raw scroll progress
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let running = false;
  let rafId = 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function scrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? THREE.MathUtils.clamp(window.scrollY / max, 0, 1) : 0;
  }

  function layoutAt(p, out, list) {
    const seg = p * (LAYOUTS - 1);
    const i = Math.min(Math.floor(seg), LAYOUTS - 2);
    const f = smoothstep(seg - i);
    return out.copy(list[i]).lerp(list[i + 1], f);
  }

  function frame(elapsed, dt) {
    // Frame-rate independent damping — the cinematic "scrub" lag.
    progress += (targetProgress - progress) * (1 - Math.exp(-dt * 5));
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));

    for (const egg of eggs) {
      layoutAt(progress, egg.pos, egg.layouts);
      egg.mesh.position.set(
        egg.pos.x + Math.cos(elapsed * 0.45 + egg.phase) * 0.10,
        egg.pos.y + Math.sin(elapsed * 0.60 + egg.phase) * egg.bob,
        egg.pos.z
      );
      egg.mesh.rotation.y = elapsed * egg.spin + egg.phase;
      egg.mesh.rotation.z = egg.tilt + Math.sin(elapsed * 0.4 + egg.phase) * 0.09;
    }

    layoutAt(progress, tmpA, camPath);
    // Narrow viewports need the camera further back to keep the field clear.
    const aspect = camera.aspect;
    tmpA.z *= THREE.MathUtils.clamp(1.5 / aspect, 1, 1.6);
    camera.position.copy(tmpA);
    camera.lookAt(tmpB.set(pointer.x * 0.6, pointer.y * 0.4, 0));

    group.rotation.y = pointer.x * 0.10;
    group.rotation.x = -pointer.y * 0.06;

    renderer.render(scene, camera);
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    frame(clock.elapsedTime, dt);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    clock.getDelta(); // drop the accumulated gap
    loop();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  /* ---------- Wiring ---------- */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    buildLayouts();
    if (!running) frame(clock.elapsedTime, 0.016);
  }

  window.addEventListener("resize", debounce(resize, 150), { passive: true });

  if (reduceMotion) {
    // Still 3D, still lit — just held perfectly still.
    targetProgress = 0;
    progress = 0;
    frame(0, 0);
  } else {
    targetProgress = scrollProgress();
    progress = targetProgress;

    window.addEventListener("scroll", () => { targetProgress = scrollProgress(); }, { passive: true });

    window.addEventListener(
      "pointermove",
      (e) => {
        pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true }
    );

    // Don't burn GPU on a background tab.
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

    start();
  }

  document.body.classList.add("has-3d");
}

/* ============================================================
   Helpers
   ============================================================ */

/** Half-profile of an egg, revolved by LatheGeometry: round at the
 *  base, tapered at the tip. */
function eggProfile(segments) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const y = -1 + (2 * i) / segments;
    const r = Math.sqrt(Math.max(0, 1 - y * y)) * (1 - 0.22 * y) * 0.70;
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), y));
  }
  return pts;
}

/** Procedural sunrise environment — a warm sky-to-earth gradient with a
 *  sun blob, so shells pick up believable reflections with no HDR fetch. */
function makeSunriseEnv(renderer) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, "#FFFBF0"); // zenith
  g.addColorStop(0.42, "#FFE3A8"); // warm sky
  g.addColorStop(0.58, "#F0D3A6"); // horizon
  g.addColorStop(1.00, "#8A6A46"); // earth bounce
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const sun = ctx.createRadialGradient(38, 30, 2, 38, 30, 22);
  sun.addColorStop(0, "rgba(255,255,255,1)");
  sun.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function smoothstep(t) {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/** Deterministic PRNG so the field looks identical on every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function debounce(fn, wait) {
  let id;
  return function (...args) {
    clearTimeout(id);
    id = setTimeout(() => fn.apply(this, args), wait);
  };
}
