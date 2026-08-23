/* ============================================================
   Dara Poultry — hero background video generator
   ------------------------------------------------------------
   Renders the warm sunrise haze loop that sits behind the page,
   then encodes it with ffmpeg. Same contract as scene.js: nothing
   is fetched, every asset is procedural and seeded, so re-running
   this produces an identical render.

     node tools/make-hero-video.mjs           # render + encode
     node tools/make-hero-video.mjs --reuse   # re-encode last render

   Output lands in media/ (see README for the file list).

   The loop is seamless because every animated quantity is a
   function of theta = TAU * frame / FRAMES using integer harmonics
   only — frame FRAMES would be identical to frame 0, so we emit
   0..FRAMES-1 and the wrap is invisible.
   ============================================================ */

import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "media");

/* Rendered small and upscaled on encode: the imagery is entirely
   defocused haze, so a 2x lanczos upscale is indistinguishable from
   rendering native while costing 4x less CPU here. */
const W = 800;
const H = 450;
const FPS = 24;
const SECONDS = 18;
const FRAMES = FPS * SECONDS;
const TAU = Math.PI * 2;

const BINS = 1024; // lookup resolution for the sun glow / god rays

// Warm earth the corners fall off toward (see the vignette pass).
const VIG_R = 156;
const VIG_G = 110;
const VIG_B = 66;

/* ------------------------------------------------------------
   Static per-pixel maps
   ------------------------------------------------------------
   The sun is anchored (only its glow breathes), which lets us
   precompute distance and angle once and reduce the per-frame inner
   loop to table lookups instead of hypot/atan2 per pixel. */
const SUN_X = 0.685 * W; // right of the copy column, where the veil is thinnest
const SUN_Y = 0.355 * H;

const DIAG = Math.hypot(W, H);
const D_MAX = 1.35; // normalised distance covered by the LUTs

const distIdx = new Uint16Array(W * H);
const angIdx = new Uint16Array(W * H);
const vig = new Float32Array(W * H);
const dith = new Float32Array(W * H);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const dx = x - SUN_X;
    const dy = y - SUN_Y;

    const d = Math.hypot(dx, dy) / DIAG;
    distIdx[i] = Math.min(BINS - 1, ((d / D_MAX) * BINS) | 0);

    const a = Math.atan2(dy, dx); // -PI..PI
    angIdx[i] = Math.min(BINS - 1, (((a + Math.PI) / TAU) * BINS) | 0);

    const nx = (x / W - 0.5) * 2;
    const ny = (y / H - 0.5) * 2;
    const rr = Math.min(1, Math.hypot(nx * 0.92, ny) / 1.22);
    /* Stored as a mix amount, not a multiplier: scaling toward black turned
       the cream corners grey, so the corners lerp toward warm earth instead. */
    vig[i] = 0.30 * rr * rr;

    /* Static plus/minus one level of dither. Smooth gradients band hard
       in 8-bit yuv420p; a fixed pattern breaks the bands up and costs
       almost no bitrate, because it is identical in every frame and so
       motion compensation cancels it out. */
    dith[i] = (hash2(x, y) - 0.5) * 2.0;
  }
}

/* ------------------------------------------------------------
   Sky gradient — sampled per row, warm sunrise over cream
   ------------------------------------------------------------ */
const STOPS = [
  [0.00, 246, 234, 206],
  [0.22, 252, 231, 185],
  [0.40, 255, 219, 152],
  [0.56, 251, 197, 118], // horizon glow band
  [0.75, 229, 164, 92],
  [1.00, 194, 129, 72],
];

const skyR = new Float32Array(H);
const skyG = new Float32Array(H);
const skyB = new Float32Array(H);

function sampleSky(t) {
  const u = Math.min(Math.max(t, 0), 1);
  let k = 0;
  while (k < STOPS.length - 2 && u > STOPS[k + 1][0]) k++;
  const a = STOPS[k];
  const b = STOPS[k + 1];
  const f = smoothstep((u - a[0]) / (b[0] - a[0]));
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

/* ------------------------------------------------------------
   Bokeh orbs + dust motes (seeded, so the render is repeatable)
   ------------------------------------------------------------ */
const rnd = mulberry32(20240706);

const orbs = [];
for (let i = 0; i < 44; i++) {
  orbs.push({
    x0: -0.08 + rnd() * 1.16,
    y0: -0.08 + rnd() * 1.16,
    r: (0.020 + rnd() * 0.058) * W,
    ax: 0.018 + rnd() * 0.062,
    ay: 0.014 + rnd() * 0.050,
    hx: rnd() < 0.6 ? 1 : 2,
    hy: rnd() < 0.6 ? 1 : 2,
    ph: rnd() * TAU,
    ph2: rnd() * TAU,
    amp: 0.07 + rnd() * 0.15,
    pulse: rnd() < 0.5 ? 1 : 2,
    warm: rnd(),
  });
}

const motes = [];
for (let i = 0; i < 150; i++) {
  motes.push({
    x0: rnd(),
    y0: rnd(),
    ax: 0.02 + rnd() * 0.07,
    ay: 0.02 + rnd() * 0.06,
    hx: rnd() < 0.5 ? 1 : 2,
    hy: rnd() < 0.5 ? 1 : 3,
    ph: rnd() * TAU,
    ph2: rnd() * TAU,
    size: 0.9 + rnd() * 1.5,
    amp: 0.11 + rnd() * 0.27,
    tw: 1 + ((rnd() * 3) | 0),
  });
}

/* ------------------------------------------------------------
   Per-frame buffers
   ------------------------------------------------------------ */
const acc = new Float32Array(W * H * 3);
const frame = Buffer.allocUnsafe(W * H * 3);

const glowLUT = new Float32Array(BINS);
const rayFall = new Float32Array(BINS);
const rayLUT = new Float32Array(BINS);
const mistX = new Float32Array(W);
const mistY = new Float32Array(H);

function renderFrame(f) {
  const theta = (TAU * f) / FRAMES;

  /* --- sky: breathes vertically and in warmth over the loop --- */
  const drift = 0.016 * Math.sin(theta);
  const warmth = 1 + 0.022 * Math.sin(theta + 1.1);
  for (let y = 0; y < H; y++) {
    const c = sampleSky(y / (H - 1) + drift);
    skyR[y] = c[0] * warmth;
    skyG[y] = c[1] * (1 + (warmth - 1) * 0.7);
    skyB[y] = c[2];
  }

  /* --- sun glow + god rays, both distance-indexed --- */
  const pulse = 0.86 + 0.14 * Math.sin(theta * 2 + 0.4);
  for (let i = 0; i < BINS; i++) {
    const d = (i / BINS) * D_MAX;
    // Tight core plus a restrained halo: a wide bright wash would blow the
    // frame out to white, and the cream .stage-veil then has no tone to sit on.
    glowLUT[i] = pulse * (0.44 * Math.exp(-d * 13) + 0.15 * Math.exp(-d * 3.4));
    // Rays are suppressed inside the core and fade out at the edges.
    rayFall[i] = Math.exp(-d * 3.2) * (1 - Math.exp(-d * 9));
  }
  for (let i = 0; i < BINS; i++) {
    const a = (i / BINS) * TAU;
    let v =
      0.50 * Math.sin(a * 5 + theta + 0.7) +
      0.28 * Math.sin(a * 9 - theta * 2 + 2.1) +
      0.22 * Math.sin(a * 3 + theta + 4.3);
    v = 0.5 + 0.5 * v;
    rayLUT[i] = v * v; // broad shafts, not a lens-flare starburst
  }

  /* --- drifting mist, separable so it costs two 1D passes --- */
  for (let x = 0; x < W; x++) {
    const u = x / W;
    mistX[x] = 0.5 + 0.5 * Math.sin(u * 5.1 + theta + 0.3) * Math.sin(u * 2.3 - theta + 1.7);
  }
  for (let y = 0; y < H; y++) {
    const u = y / H;
    const band = Math.max(0, Math.sin(u * 7.5 + theta + 2.2));
    mistY[y] = band * band * (0.30 + 0.70 * Math.pow(Math.max(0, u - 0.18), 0.8));
  }

  /* --- base pass --- */
  for (let y = 0; y < H; y++) {
    const row = y * W;
    const sr = skyR[y];
    const sg = skyG[y];
    const sb = skyB[y];
    const my = mistY[y];
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const di = distIdx[i];

      const gl = glowLUT[di];
      const ry = rayLUT[angIdx[i]] * rayFall[di];
      const ms = my * mistX[x];

      const o = i * 3;
      acc[o] = sr + gl * 208 + ry * 92 + ms * 54;
      acc[o + 1] = sg + gl * 182 + ry * 72 + ms * 47;
      acc[o + 2] = sb + gl * 124 + ry * 40 + ms * 33;
    }
  }

  /* --- bokeh orbs, additive --- */
  for (const o of orbs) {
    const cx = (o.x0 + o.ax * Math.sin(theta * o.hx + o.ph)) * W;
    const cy = (o.y0 + o.ay * Math.cos(theta * o.hy + o.ph2)) * H;
    const alpha = o.amp * (0.55 + 0.45 * Math.sin(theta * o.pulse + o.ph));
    if (alpha <= 0.001) continue;

    const cr = 255 * alpha;
    const cg = (250 - 45 * o.warm) * alpha;
    const cb = (235 - 125 * o.warm) * alpha;

    const r = o.r;
    const r2 = r * r;
    const x0 = Math.max(0, Math.ceil(cx - r));
    const x1 = Math.min(W - 1, Math.floor(cx + r));
    const y0 = Math.max(0, Math.ceil(cy - r));
    const y1 = Math.min(H - 1, Math.floor(cy + r));

    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const row = y * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const d2 = dx * dx + dy2;
        if (d2 >= r2) continue;
        const u = d2 / r2;
        let fall = 1 - u;
        fall *= fall;
        // Defocused highlights carry a brighter rim; cheap linear tent.
        const rim = 1 - Math.abs(Math.sqrt(u) - 0.86) * 7;
        if (rim > 0) fall += rim * rim * 0.18;

        const p = (row + x) * 3;
        acc[p] += fall * cr;
        acc[p + 1] += fall * cg;
        acc[p + 2] += fall * cb;
      }
    }
  }

  /* --- dust motes, additive --- */
  for (const m of motes) {
    const cx = (m.x0 + m.ax * Math.sin(theta * m.hx + m.ph)) * W;
    const cy = (m.y0 + m.ay * Math.cos(theta * m.hy + m.ph2)) * H;
    const a = m.amp * (0.35 + 0.65 * Math.abs(Math.sin(theta * m.tw + m.ph2)));
    const r = m.size * 2.2;
    const r2 = r * r;
    const x0 = Math.max(0, Math.ceil(cx - r));
    const x1 = Math.min(W - 1, Math.floor(cx + r));
    const y0 = Math.max(0, Math.ceil(cy - r));
    const y1 = Math.min(H - 1, Math.floor(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const row = y * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const d2 = dx * dx + dy2;
        if (d2 >= r2) continue;
        let fall = 1 - d2 / r2;
        fall *= fall * a;
        const p = (row + x) * 3;
        acc[p] += fall * 255;
        acc[p + 1] += fall * 246;
        acc[p + 2] += fall * 214;
      }
    }
  }

  /* --- vignette, dither, quantise --- */
  for (let i = 0; i < W * H; i++) {
    const k = vig[i];
    const j = 1 - k;
    const d = dith[i];
    const o = i * 3;
    frame[o] = clamp255(acc[o] * j + VIG_R * k + d);
    frame[o + 1] = clamp255(acc[o + 1] * j + VIG_G * k + d);
    frame[o + 2] = clamp255(acc[o + 2] * j + VIG_B * k + d);
  }
  return frame;
}

/* ------------------------------------------------------------
   Drive
   ------------------------------------------------------------ */
const rawPath = path.join(os.tmpdir(), `dara-hero-${W}x${H}-${FRAMES}.raw`);
const reuse = process.argv.includes("--reuse");

/* --still <frame> dumps one frame as a PNG next to the raw file, so the
   art direction can be checked in a second rather than after a full encode. */
const stillArg = process.argv.indexOf("--still");
if (stillArg !== -1) {
  const f = Number(process.argv[stillArg + 1] || 0) || 0;
  const png = path.join(os.tmpdir(), `dara-hero-still-${f}.png`);
  await pipeToFfmpeg(renderFrame(f), ["-frames:v", "1", png]);
  console.log(png);
  process.exit(0);
}

if (reuse && fs.existsSync(rawPath)) {
  console.log(`reusing ${rawPath}`);
} else {
  await render();
}
await encode();
if (!reuse) fs.rmSync(rawPath, { force: true });
console.log("done.");

async function render() {
  console.log(`rendering ${FRAMES} frames at ${W}x${H} -> ${rawPath}`);
  const out = fs.createWriteStream(rawPath);
  const t0 = Date.now();
  for (let f = 0; f < FRAMES; f++) {
    if (!out.write(Buffer.from(renderFrame(f)))) await once(out, "drain");
    if (f % 48 === 0) process.stdout.write(`  frame ${f}/${FRAMES}\r`);
  }
  out.end();
  await once(out, "finish");
  console.log(`  rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function encode() {
  fs.mkdirSync(OUT, { recursive: true });

  const IN = [
    "-f", "rawvideo",
    "-pixel_format", "rgb24",
    "-video_size", `${W}x${H}`,
    "-framerate", String(FPS),
    "-i", rawPath,
  ];
  const TAG = [
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
  ];
  const up = "scale=1600:900:flags=lanczos,format=yuv420p";
  const native = "format=yuv420p";

  const args = [
    "-y", "-hide_banner", "-loglevel", "error", "-stats",
    ...IN,

    // Desktop — 1600x900
    "-map", "0:v", "-vf", up, "-c:v", "libx264", "-preset", "veryslow",
    "-crf", "25", "-tune", "animation", "-profile:v", "high", "-level", "4.0",
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    "-movflags", "+faststart", "-an", ...TAG,
    path.join(OUT, "hero-loop.mp4"),

    "-map", "0:v", "-vf", up, "-c:v", "libvpx-vp9",
    "-crf", "36", "-b:v", "0", "-row-mt", "1", "-cpu-used", "2",
    "-g", "48", "-an", ...TAG,
    path.join(OUT, "hero-loop.webm"),

    // Handset — 800x450, the render's native size
    "-map", "0:v", "-vf", native, "-c:v", "libx264", "-preset", "veryslow",
    "-crf", "27", "-tune", "animation", "-profile:v", "high", "-level", "3.1",
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    "-movflags", "+faststart", "-an", ...TAG,
    path.join(OUT, "hero-loop-sm.mp4"),

    "-map", "0:v", "-vf", native, "-c:v", "libvpx-vp9",
    "-crf", "40", "-b:v", "0", "-row-mt", "1", "-cpu-used", "2",
    "-g", "48", "-an", ...TAG,
    path.join(OUT, "hero-loop-sm.webm"),

    // Poster — first frame, also the still shown to reduced-motion visitors
    "-map", "0:v", "-frames:v", "1", "-vf", "scale=1440:810:flags=lanczos",
    "-c:v", "libwebp", "-quality", "68", "-compression_level", "6",
    path.join(OUT, "hero-poster.webp"),
  ];

  console.log("encoding (this takes a few minutes)...");
  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  return new Promise((res, rej) => {
    ff.on("error", rej);
    ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))));
  });
}

/** Feed a single in-memory frame to ffmpeg (used by --still). */
function pipeToFfmpeg(buf, tail) {
  const ff = spawn(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error",
      "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", `${W}x${H}`,
      "-i", "-", ...tail],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  ff.stdin.end(buf);
  return new Promise((res, rej) => {
    ff.on("error", rej);
    ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))));
  });
}

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function smoothstep(t) {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/** Deterministic PRNG — the same one scene.js uses, for the same reason. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-pixel hash for the static dither pattern. */
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
