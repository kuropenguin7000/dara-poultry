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
script.js    nav, scroll reveals, counters, CSS 3D card tilt
scene.js     Three.js egg field (ES module)
server.js    zero-dependency static server for local preview
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

## Readability over the 3D field

Text sits above a busy animated background, so legibility is a standing
constraint, not a one-off fix. Three mechanisms keep it readable:

1. `.stage-veil` — a fixed cream wash + vignette over the canvas.
2. `--stage-op` — set from `script.js`'s scroll handler; the field runs at full
   strength across the hero then settles to ~45% so it never fights body copy.
3. Glass panels (`.glass`, `.card`, `.about__copy`, `.contact__info`) give text
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

### Two Firebase gotchas, both verified

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

It should print exactly: `index.html`, `scene.js`, `script.js`, `styles.css`.

**2. Custom headers don't apply in the local emulator on Windows.**
`glob-slasher` normalizes patterns with the platform separator, yielding `\**`
instead of `/**`, which minimatch can't match. So `curl localhost:5000` shows no
`Cache-Control` even though the config is correct — real Hosting applies headers
at the CDN. Don't "fix" working header config based on emulator output.

## Gotchas

- `position: fixed` elements (`.nav`, `.fab`, `.skip-link`) must stay out of the
  bulk `z-index` rule that promotes `main`/`.footer`; a blanket
  `position: relative` there drops the skip link into the page flow as visible text.
- Counters have a `setTimeout` backstop so a throttled `requestAnimationFrame`
  can't strand them on a wrong partial number (e.g. "293" instead of "3.000+").
- `.claude/launch.json` defines a preview run config on port 4173.

## Still to wire up

- Real WhatsApp/phone number — "Hubungi Kami" and "Pesan" currently jump to the
  contact section. Swap in `https://wa.me/62xxxxxxxxxx` when there's a number.
- Real photography to replace the 2D illustrations.
