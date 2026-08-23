# CLAUDE.md

Company-profile website for **Dara Poultry**, a layer-hen farm in Ciamis, West Java
(3,000+ hens, daily fresh eggs, also sells animal feed).

All user-facing copy is **Indonesian**. Keep it that way — write new copy in
Indonesian, not English.

## Stack

Plain static site: HTML + CSS + vanilla JS. **No framework, no build step, no
bundler.** The only external runtime dependency is Three.js, pulled from a CDN via
an `importmap` in `index.html`.

```
index.html   page content & structure
styles.css   design tokens, glass surfaces, responsive rules
script.js    nav, scroll reveals, counters, CSS 3D card tilt, background video
scene.js     Three.js egg field (ES module)
server.js    zero-dependency static server for local preview
media/       generated sunrise loop (two sizes x mp4/webm) + poster still
tools/       make-hero-video.mjs — regenerates media/; never deployed
```

## Running locally

```bash
node server.js     # http://localhost:4173
```

Do **not** open `index.html` via `file://` — `scene.js` is an ES module loaded
through an importmap, so it needs a real HTTP origin. The page still renders
without it, just with the 2D fallback instead of 3D.

## The 3D layer (`scene.js`)

One fixed WebGL canvas sits behind all page content at `z-index: 0`. A field of
eggs re-forms across four keyframed layouts as you scroll — loose cloud → carton
grid → harvest arc → drift out — while the camera scrubs a fixed path.

Design rules that matter here:

- **Scroll drives position continuously.** Progress is damped toward the raw
  scroll ratio with `1 - Math.exp(-dt * k)` so it is frame-rate independent.
  Don't convert this to one-shot `onEnter`/`onLeave` callbacks — they snap.
- **Scroll *position* and scroll *speed* are separate inputs.** `progress` also
  drives `egg.spinScroll`, so scrolling literally turns each egg. `svel` is the
  damped signed derivative of `progress` and feeds three speed-only effects:
  volume-preserving squash/stretch along each egg's long axis, a camera dolly
  back, and a slight camera roll into the scroll direction. Take the derivative
  of the *damped* `progress`, never of raw `scrollY` — the latter is spiky and
  makes the stretch flicker.
- **Eggs shy away from the cursor.** Each egg is projected through
  `group.matrixWorld` and the camera, and pushed away in the screen plane. Two
  things matter here: `camera.matrixWorldInverse` has to be refreshed by hand
  before `project()` (the renderer would only do it *after* we place the eggs,
  a frame late), and the NDC x delta is multiplied by `aspect` so the falloff is
  a circle on screen rather than an ellipse. Gated on `(hover: hover) and
  (pointer: fine)` plus a real `pointermove` — a touch pointer resting at the
  origin would otherwise shove the field apart from the centre on load.
- **Egg geometry is procedural** (`LatheGeometry` over an egg profile curve) and
  the sunrise environment map is generated on a canvas and run through
  `PMREMGenerator`. Nothing is fetched — no `.glb`, no `.hdr`. Keep it that way.
- **Layouts are rebuilt on resize** (`buildLayouts()`) because spread and depth
  scale with aspect ratio. Narrow viewports push the field back so it doesn't
  crowd the copy.
- Randomness uses a seeded `mulberry32`, so the field looks identical every load.
  Don't swap in `Math.random()`.

### Progressive enhancement contract

`scene.js` adds `body.has-3d` only after the renderer is successfully constructed.
CSS keys off that class:

- No WebGL, or Three.js fails to load → class never set → the 2D hero SVG stays.
- `body.has-3d .hero__art { display: none }` — the fallback must be removed from
  layout, **not** just faded to `opacity: 0`. Leaving it visible-but-transparent
  reserves a dead grid cell that wastes ~400px above the copy on mobile.
- `prefers-reduced-motion` → scene initialises and renders exactly one lit frame,
  then never animates. All CSS animation is also disabled.

Any change here needs checking against all three paths, not just the happy one.

## The background video (`media/`, `tools/make-hero-video.mjs`)

A muted sunrise loop sits *under* the egg field as the deepest layer. It is
atmosphere for the landing area only — it fades to nothing over the first one
and a half viewports and pauses there, so it costs no decode time while
someone reads the rest of the page.

**Nothing here is a stock asset.** `tools/make-hero-video.mjs` renders every
frame procedurally in plain Node — warm sky gradient, anchored sun with god
rays, drifting mist bands, bokeh orbs and dust motes — and pipes raw RGB into
ffmpeg. Same contract as `scene.js`: seeded `mulberry32`, nothing fetched.

```bash
node tools/make-hero-video.mjs             # render + encode (~1 min)
node tools/make-hero-video.mjs --still 0   # dump one frame as PNG to inspect
```

It emits five files, all committed:

| file | size | used when |
| --- | --- | --- |
| `hero-loop.webm` / `.mp4` | 333 KB / 754 KB | viewport ≥ 900px |
| `hero-loop-sm.webm` / `.mp4` | 135 KB / 247 KB | viewport < 900px |
| `hero-poster.webp` | 8 KB | first paint, and the *only* asset fetched on the poster-only paths |

Things that will bite if you change them:

- **The loop must stay seamless.** Every animated quantity is a function of
  `theta = TAU * frame / FRAMES` using **integer harmonics only**, and frames
  `0..FRAMES-1` are emitted so frame `FRAMES` (identical to 0) is skipped.
  Introduce a non-integer multiple of `theta` and the wrap will visibly jump.
  Verify on the *lossless* render, not the encode — comparing decoded frame 431
  to frame 0 shows a false 8 dB PSNR gap purely because frame 0 is a pristine
  IDR keyframe and 431 is the last frame of a GOP.
- **Render size is 800x450 and the desktop file is upscaled 2x on encode.** The
  imagery is entirely defocused, so lanczos upscaling is free quality. Don't
  raise the render size to "fix" sharpness that was never there.
- **The static dither is deliberate.** Smooth gradients band badly in 8-bit
  yuv420p. The ±1-level pattern is a fixed hash of `(x, y)`, identical every
  frame, so motion compensation cancels it and it costs almost no bitrate.
  Swapping in per-frame noise would multiply the file size.

### Resolution and opt-out are chosen in JS, not markup

`index.html` ships the `<video>` with **no `src` and no `<source>`**;
`script.js` appends them after checking viewport width, `saveData` and
`effectiveType`. `<source media>` can't do this — it is only evaluated once, at
load. It also means the reduced-motion and data-saver paths fetch *nothing but
the poster*, because an empty media element requests nothing regardless of
`preload`.

`preload` is `"auto"` rather than `"none"` on purpose: with no source attached
there is nothing to preload anyway, and `"none"` left Chrome declining to fetch
at all once the sources were appended.

### Progressive enhancement contract

Mirrors `body.has-3d`. `body.has-bg-media` is added only when there is something
to show, and CSS keys off it:

- Video reaches its `playing` event → class set, loop visible.
- Reduced motion / `saveData` / 2g → class set immediately, poster still shown,
  no video bytes requested. CSS also pins `.stage-media__video { transform: none }`
  so the scroll parallax can't drift the still.
- Every `<source>` fails, or autoplay is refused → class set, poster stands in.
- Poster missing too → layer is simply empty and the plain cream background shows.

The class is never set speculatively, so a 404 or a blocked autoplay can never
leave a black rectangle behind the copy.

## Readability over the 3D field

Text sits above a busy animated background, so legibility is a standing
constraint, not a one-off fix. The full stack, bottom to top, is:

| z | layer | role |
| --- | --- | --- |
| 0 | `.stage-media` | sunrise video loop |
| 1 | `.stage` | WebGL egg field |
| 2 | `.stage-veil` | cream wash + vignette |
| 3 | `main`, `.footer` | content |

Keep fixed elements (`.nav`, `.fab`, `.skip-link`) out of that last rule — they
set their own `z-index`, well above.

Five mechanisms keep copy readable:

1. `.stage-media::after` — the video's **own** cream scrim, heavy over the left
   copy column and nearly clear on the right. It lives on the media layer rather
   than in `.stage-veil` so that removing the video falls back to exactly the
   veil the page had before it existed.
2. `.stage-veil` — a fixed cream wash + vignette over the canvas.
3. `--stage-op` — set from `script.js`'s scroll handler; the field runs at full
   strength across the hero then settles to ~45% so it never fights body copy.
4. `--media-op` — same handler; smoothsteps the video to **0** by 1.5 viewports.
   Below the hero there is no video at all, which is why only the hero's
   left-hand copy column ever needs protecting from it.
5. Glass panels (`.glass`, `.card`, `.about__copy`, `.contact__info`) give text
   blocks an explicit backing.

If you add a section with substantial body copy, give it a glass backing.

## Design conventions

- Palette is warm farm: cream/sand surfaces, egg-yolk gold, espresso ink.
- **Use `--gold-ink` (`#8A5A00`) for gold text on cream**, never `--gold` or
  `--gold-deep`. The brand golds are ~2.6:1 against cream and fail WCAG AA;
  `--gold-ink` is 5.5:1. The brighter golds are for fills and gradients only.
- **No emoji as icons.** All icons are inline stroke SVGs (Lucide-style) sharing
  one recipe: `fill: none; stroke: currentColor; stroke-width: 2`.
- Never remove focus rings. `:focus-visible` is styled globally.
- Interactive targets are ≥44px.
- Fonts: Fraunces (headings) + Plus Jakarta Sans (body).

## Deployment — Firebase Hosting

Project `dara-poultry` → https://dara-poultry.web.app

```bash
firebase deploy --only hosting             # publish
firebase deploy --only hosting --dry-run   # validate without publishing
```

### Firebase gotchas, all verified against the live site

**1. The ignore list must include `**/.*/**`.**
The stock list `firebase init` generates (`["firebase.json", "**/.*", "**/node_modules/**"]`)
does *not* exclude `.git`. `**/.*` only matches paths whose **final** segment
starts with a dot, so `.git/config` slips through and the whole repository
history would be published. Before changing `ignore`, verify what would actually
upload using the same function deploy calls:

```bash
node -e "
const { listFiles } = require('<npm-global>/firebase-tools/lib/listFiles.js');
const cfg = require('./firebase.json').hosting;
console.log(listFiles(cfg.public, cfg.ignore));
"
```

It should print exactly nine paths: `index.html`, `scene.js`, `script.js`,
`styles.css`, and the five `media/` assets. `media/` **is** deployed; `tools/`
must not be.

**2. `*.md` and `tools/**` are ignored on purpose.** This file and `README.md`
are internal docs; without that rule they get served publicly (e.g.
`/CLAUDE.md`). `tools/make-hero-video.mjs` is a build-time script — its output
in `media/` ships, the script itself never does. Any new non-site file at the
repo root needs an ignore entry, and the check above is how you confirm it.

**3. The homepage needs its own `Cache-Control` header block.**
`cleanUrls` serves the homepage at `/`, and the `**/*.@(html)` glob matches the
request path — which is `/`, not `/index.html`. Without a separate block whose
`source` is `/`, the homepage silently falls back to Firebase's default
`max-age=3600`, meaning a deploy can take an hour to reach returning visitors.
Verify with `curl -sI https://dara-poultry.web.app/ | grep -i cache-control`;
it must say `max-age=0, must-revalidate`.

**4. Custom headers don't apply in the local emulator on Windows.**
`glob-slasher` normalizes patterns with the platform separator, yielding `\**`
instead of `/**`, which minimatch can't match. So `curl localhost:5000` shows no
`Cache-Control` even though the config is correct — real Hosting applies headers
at the CDN. Don't "fix" working header config based on emulator output; check
the deployed URL instead.

## Gotchas

- `position: fixed` elements (`.nav`, `.fab`, `.skip-link`) must stay out of the
  bulk `z-index` rule that promotes `main`/`.footer`; a blanket
  `position: relative` there drops the skip link into the page flow as visible text.
- Counters have a `setTimeout` backstop so a throttled `requestAnimationFrame`
  can't strand them on a wrong partial number (e.g. "293" instead of "3.000+").
- `.claude/launch.json` defines a preview run config on port 4173, with
  `autoPort` so it steps aside if something else already holds that port.
- **`server.js` must keep its `Range` support.** Chrome will not start a media
  element it cannot seek: served chunked with no `Content-Length` /
  `Accept-Ranges`, the background loop sits at `readyState 0` forever and local
  preview silently shows no video. Real Hosting handles ranges itself, so this
  only ever breaks locally — which makes it easy to misdiagnose as a broken
  encode.
- The `types` map in `server.js` needs an entry for every extension the site
  serves. `<video>` rejects `application/octet-stream`.
- Loading the page in a **hidden/background tab** leaves `window.innerWidth` at
  0, so the renderer is sized 0x0 and `buildLayouts()` runs with a NaN aspect
  until the first resize. Harmless for real visitors, but it makes headless
  screenshots look broken — dispatch a `resize` before trusting one.

## Still to wire up

- Real WhatsApp/phone number — "Hubungi Kami" and "Pesan" currently jump to the
  contact section. Swap in `https://wa.me/62xxxxxxxxxx` when there's a number.
- Real photography to replace the 2D illustrations.
