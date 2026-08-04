/* ============================================================
   Dara Poultry — interactions
   Sticky nav, mobile menu, scroll reveals, counters, and the
   pointer-driven 3D card tilt that layers over the WebGL field.
   ============================================================ */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Sticky nav + 3D field strength on scroll ----
     The egg field is at full strength across the hero, then settles back
     to a quieter backdrop so it never competes with body copy. */
  const nav = document.getElementById("nav");
  const stage = document.getElementById("stage");

  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle("scrolled", y > 20);
    const t = Math.min(y / Math.max(window.innerHeight, 1), 1);
    document.documentElement.style.setProperty("--stage-op", (1 - t * 0.55).toFixed(3));
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // The one-second intro fade applies only to first paint, not to scrolling.
  if (stage) {
    stage.classList.add("intro");
    setTimeout(() => stage.classList.remove("intro"), 1400);
  }

  /* ---- Mobile menu ---- */
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  const closeMenu = () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Buka menu");
  };
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  });
  links.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && links.classList.contains("open")) {
      closeMenu();
      toggle.focus();
    }
  });

  /* ---- Reveal on scroll ---- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const sibs = Array.from(entry.target.parentElement.children).filter((c) =>
            c.classList.contains("reveal")
          );
          const idx = sibs.indexOf(entry.target);
          entry.target.style.transitionDelay = Math.min(idx, 5) * 80 + "ms";
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---- Animated counters ---- */
  const counters = document.querySelectorAll(".count");
  const finalValue = (el) =>
    parseFloat(el.dataset.target).toLocaleString("id-ID") + (el.dataset.suffix || "");
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const runCount = (el) => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const val = Math.floor(easeOut(p) * target);
      el.textContent = val.toLocaleString("id-ID") + (p === 1 ? suffix : "");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Safety net: if rAF is throttled (backgrounded tab, stalled renderer)
    // the count must never be left stranded on a wrong partial number.
    setTimeout(() => { el.textContent = finalValue(el); }, dur + 300);
  };

  if ("IntersectionObserver" in window && !reduceMotion) {
    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runCount(entry.target);
            co.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((c) => co.observe(c));
  } else {
    counters.forEach((c) => (c.textContent = finalValue(c)));
  }

  /* ---- 3D pointer tilt ----
     Cards rotate toward the pointer so the CSS depth layers
     (translateZ on icons, tags and headings) read as real relief.
     Skipped on touch and for reduced-motion visitors. */
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (canHover && !reduceMotion) {
    const MAX = 8; // degrees
    document.querySelectorAll("[data-tilt]").forEach((el) => {
      let rx = 0, ry = 0, lift = 0;
      let trx = 0, trY = 0, tLift = 0;
      let raf = 0;

      const render = () => {
        rx += (trx - rx) * 0.12;
        ry += (trY - ry) * 0.12;
        lift += (tLift - lift) * 0.12;
        el.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) translateY(${lift.toFixed(2)}px)`;

        const settled =
          Math.abs(trx - rx) < 0.01 && Math.abs(trY - ry) < 0.01 && Math.abs(tLift - lift) < 0.01;
        if (settled) {
          raf = 0;
          if (tLift === 0) el.style.transform = "";
          return;
        }
        raf = requestAnimationFrame(render);
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(render); };

      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        trY = px * MAX * 2;
        trx = -py * MAX * 2;
        tLift = -8;
        kick();
      });

      el.addEventListener("pointerleave", () => {
        trx = 0; trY = 0; tLift = 0;
        kick();
      });
    });
  }

  /* ---- Current year ---- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
