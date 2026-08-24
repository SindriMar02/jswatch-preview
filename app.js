/* JS Watch co. Reykjavík — Hótel Holt engine, second build.
   Scroller, parallax engine, sticky primitive, split/reveal system and the
   horizontal chapter are transplanted behaviour-for-behaviour. The ring selector
   keeps every behaviour and drops the WebGL cylinder for a CSS dial — see
   DESIGN.md §4.1. No three.js on this build at all. */

const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const isMac = /Mac/.test(navigator.platform);
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Match the CSS breakpoint EXACTLY. `innerWidth >= 768` is NOT the same test:
   when content overflows, mobile Chrome shrink-to-fits and reports a ballooned
   innerWidth (measured 1500 on a 375px phone), so the JS takes the desktop path
   while the CSS takes the mobile one. */
const mdUp = () => matchMedia('(min-width: 768px)').matches;
const SMOOTH = !isTouch && !reduced && mdUp();

/* ---------- viewport ---------- */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;pointer-events:none;visibility:hidden';
document.documentElement.appendChild(probe);
let VH = probe.offsetHeight || innerHeight, VW = document.documentElement.clientWidth || innerWidth;
const measureViewport = () => { VH = probe.offsetHeight || innerHeight; VW = document.documentElement.clientWidth || innerWidth; };
const spacing = () => parseFloat(getComputedStyle(html).getPropertyValue('--spacing')) || 20;

/* ---------- easings ---------- */
const E = {
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInOutQuad: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeSection: t => 1 - Math.pow(1 - t, 3),
  easeSectionInverse: t => t * t * t,
};
const bezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = t => ((ax * t + bx) * t + cx) * t;
  const dfx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    let t = x;
    for (let i = 0; i < 6; i++) { const e = fx(t) - x; const d = dfx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; }
    return ((ay * t + by) * t + cy) * t;
  };
};
const easeSnap = bezier(.25, 0, .35, 1);
const easeHouse = bezier(.7, 0, .3, 1);

/* ---------- doc positions (layout, transform-free) ---------- */
const docTop = el => { let y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; };
const docLeft = el => { let x = 0; while (el) { x += el.offsetLeft; el = el.offsetParent; } return x; };

/* ============================================================
   SCROLLER
   ============================================================ */
const scroller = (() => {
  const s = { y: scrollY, target: scrollY, limit: 0, moving: false, wells: [], listeners: [] };
  const LERP = .16, BAND = () => VH * .25;
  let tween = null, expected = -1;
  const setLimit = () => { s.limit = Math.max(0, document.scrollingElement.scrollHeight - innerHeight); };
  const wellFactor = y => {
    let f = 1;
    for (const w of s.wells) { const d = Math.abs(y - w); if (d < BAND()) f = Math.min(f, clamp((d / BAND() + .35) / 1.35)); }
    return f;
  };
  const inBand = y => s.wells.some(w => Math.abs(y - w) < BAND());
  const onWheel = e => {
    if (!SMOOTH || html.classList.contains('with-modal')) return;
    e.preventDefault();
    let d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? VH : 1);
    if (isMac) d *= .62;
    if (inBand(s.target)) d *= .25;
    s.target = clamp(s.target + d, 0, s.limit);
    tween = null;
  };
  const onKey = e => {
    if (!SMOOTH || html.classList.contains('with-modal')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    let d = 0;
    if (e.key === 'ArrowDown') d = 240; else if (e.key === 'ArrowUp') d = -240;
    else if (e.key === ' ' || e.key === 'PageDown') d = VH * (e.shiftKey ? -1 : 1); else if (e.key === 'PageUp') d = -VH;
    else if (e.key === 'Home') { s.target = 0; } else if (e.key === 'End') { s.target = s.limit; } else return;
    e.preventDefault(); s.target = clamp(s.target + d, 0, s.limit); tween = null;
  };
  const tweenTo = (to, dur, ease = easeHouse) => { const from = s.y, t0 = performance.now(); s.target = to; tween = { from, to, t0, dur, ease }; };
  const syncExternal = () => { const sy = scrollY; if (Math.abs(sy - expected) > 1.5 && !tween) { s.y = s.target = sy; } };
  /* Snap to the device-pixel grid before writing: the browser places sticky layers
     on whole device pixels while the parallax writes from the raw fractional lerp,
     and that mismatch is what reads as shimmer on pinned sections. */
  const DPR = () => Math.max(1, Math.min(devicePixelRatio || 1, 3));
  const snap = v => Math.round(v * DPR()) / DPR();
  const write = () => { s.y = snap(s.y); expected = Math.round(s.y); window.scrollTo(0, s.y); };
  const tick = () => {
    if (!SMOOTH) { s.y = s.target = scrollY; return; }
    if (tween) {
      const t = clamp((performance.now() - tween.t0) / tween.dur);
      s.y = lerp(tween.from, tween.to, tween.ease(t));
      if (t >= 1) tween = null;
      write(); s.moving = true;
    } else {
      const diff = s.target - s.y;
      if (Math.abs(diff) > .5) { s.y += diff * LERP * wellFactor(s.y); write(); s.moving = true; }
      else if (s.moving) { s.y = s.target; write(); s.moving = false; }
    }
    html.classList.toggle('has-scroll-scrolling', s.moving);
  };
  const scrollToEl = (el, offset = 0) => {
    const to = clamp(docTop(el) + offset, 0, s.limit);
    if (!SMOOTH) { window.scrollTo({ top: to, behavior: reduced ? 'auto' : 'smooth' }); return; }
    const dist = Math.abs(to - s.y);
    if (dist > VH * 2) {
      const ov = $('#page-overlay'); ov.classList.add('is-on');
      setTimeout(() => { s.y = s.target = to; expected = Math.round(to); window.scrollTo(0, to); tween = null; setTimeout(() => ov.classList.remove('is-on'), 80); }, 420);
    } else tweenTo(to, 1000, easeHouse);
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', syncExternal, { passive: true });
  return Object.assign(s, { tick, setLimit, scrollToEl, tweenTo, easeSnap });
})();

/* custom scrollbar */
(() => {
  if (!SMOOTH) return;
  const bar = $('#scrollbar'), thumb = $('.c-scrollbar__thumb', bar);
  let drag = false, startY = 0, startScroll = 0;
  const update = () => {
    const total = document.scrollingElement.scrollHeight;
    const h = Math.max(40, VH * VH / total);
    thumb.style.height = h + 'px';
    thumb.style.transform = `translateY(${(scroller.y / (scroller.limit || 1)) * (VH - h)}px)`;
  };
  thumb.addEventListener('pointerdown', e => { drag = true; startY = e.clientY; startScroll = scroller.y; thumb.setPointerCapture(e.pointerId); e.preventDefault(); });
  thumb.addEventListener('pointermove', e => { if (!drag) return; const h = thumb.offsetHeight; const dy = e.clientY - startY; const to = clamp(startScroll + dy / (VH - h) * scroller.limit, 0, scroller.limit); scroller.y = scroller.target = to; window.scrollTo(0, to); });
  thumb.addEventListener('pointerup', () => { drag = false; });
  scroller.listeners.push(update);
})();

/* ============================================================
   PARALLAX ENGINE — parallax-<V>-<E>
   key scroll = measureTop + measureH*E/100 - VH*V/100 (+ off*VH)
   ============================================================ */
const sp = () => spacing();
const PATTERNS = {
  /* TWO branches, as in the source. A chapter the NEXT one wipes over exits
     UPWARD (-10svh) so the incoming chapter covers it; a chapter with nothing
     over it lags DOWNWARD instead. Keeping only the downward branch made the
     hero open a black gap at the top as it left — it looked like it scrolled
     the wrong way, because it did. */
  sectionOutTiny: { measure: 'self', keys: el => el.classList.contains('sticky--under-next')
      ? [{ v: 200, e: 100, p: { transform: 'translateY(0svh)' } }, { v: 100, e: 100, p: { transform: 'translateY(-10svh)' } }]
      : [{ v: 100, e: 100, p: { transform: 'translateY(0svh)' } }, { v: 0, e: 100, p: { transform: 'translateY(10svh)' } }], clamp: true },
  imageMove: { measure: 'self', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(-16.667%)' } }, { v: 0, e: 100, p: { transform: 'translateY(0%)' } }], clamp: true, mobile: true },
  backgroundMove: { measure: 'closest:.section', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'scale(1.2) translateY(-8.33%)' } }, { v: 0, e: 100, p: { transform: 'scale(1.2) translateY(8.33%)' } }], clamp: true, mobile: true },

  /* Circular portraits need a different device from the source's luxury trio.
     There, scale + clip-path crops a RECTANGULAR photo inside a fixed frame as it
     grows. Applied to a disc it simply saws the top off the circle, and applied to
     the whole <figure> it scales the caption too. Instead the four discs drift
     vertically against each other across the pin — the row breathes, nothing is
     cropped, and because the transform targets the IMAGE the captions stay put on
     their shared baseline. */
  makersDrift1: { measure: 'closest:.sticky', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(3.6svh)' } }, { v: -100, e: 100, p: { transform: 'translateY(-3.6svh)' } }], clamp: true },
  makersDrift2: { measure: 'closest:.sticky', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(-2.4svh)' } }, { v: -100, e: 100, p: { transform: 'translateY(2.4svh)' } }], clamp: true },
  makersDrift3: { measure: 'closest:.sticky', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(2.4svh)' } }, { v: -100, e: 100, p: { transform: 'translateY(-2.4svh)' } }], clamp: true },
  makersDrift4: { measure: 'closest:.sticky', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(-3.6svh)' } }, { v: -100, e: 100, p: { transform: 'translateY(3.6svh)' } }], clamp: true },
  makersHead: { measure: 'closest:.sticky', keys: () => [{ v: 100, e: 0, p: { transform: `translateY(${-4 * sp()}px)` }, easing: 'easeOutQuad' }, { v: 0, e: 0, p: { transform: 'translateY(0px)' } }], clamp: true },

  /* dial chapter */
  dialTitle: { measure: 'closest:.sticky', keys: () => [{ v: 50, e: 0, p: { transform: 'translateY(-6svh)', opacity: '1' }, easing: 'easeOutQuad' }, { v: 0, e: 0, p: { transform: 'translateY(0svh)', opacity: '1' } }, { v: -420, e: 0, p: { transform: 'translateY(0svh)', opacity: '1' }, easing: 'easeSectionInverse' }, { v: -500, e: 0, p: { transform: 'translateY(-10svh)', opacity: '0' } }], clamp: true },
  dialStage: { measure: 'closest:.sticky', keys: () => [{ v: 60, e: 0, p: { transform: 'translateY(14svh) scale(.9)', opacity: '0' } }, { v: 0, e: 0, p: { transform: 'translateY(0svh) scale(1)', opacity: '1' } }], easing: 'easeInOutQuad', clamp: true },

  /* bench chapter — the growing card over a pinned pan */
  benchBackground: { measure: 'closest:.sticky', target: 'img', keys: (el) => [{ v: 0, e: 0, p: { transform: 'translateY(0%) scale(1.14)' } }, { v: 100, e: 100, p: { transform: `translateY(${-((el.offsetHeight - VH) / (el.offsetHeight || 1)) * 100}%) scale(1.14)` } }], clamp: true, mobile: true },
  /* the card opens rather than scales: a counter-scaled title inside an
     overflow:hidden card only works when the card is full-bleed (as in the
     source) — at this size it just clipped. The clip-path un-reveal is the same
     family of device and cannot clip type. */
  /* The card must OPEN, HOLD, then zoom away — spread across the whole chapter.
     Before, it finished opening 648px into a 2,340px section and then sat at
     opacity 0 for the rest, which read as the section breaking. */
  benchCard: { measure: 'closest:.section', keys: () => [
      { v: 20,   e: 0, p: { transform: 'scale(.93)', 'clip-path': 'inset(46% 10% 46% 10%)', opacity: '1' } },
      { v: -90,  e: 0, p: { transform: 'scale(1)', 'clip-path': 'inset(0% 0% 0% 0%)', opacity: '1' } },
      { v: -170, e: 0, p: { transform: 'scale(1)', 'clip-path': 'inset(0% 0% 0% 0%)', opacity: '1' } },
      { v: -232, e: 0, p: { transform: 'scale(1.42)', 'clip-path': 'inset(0% 0% 0% 0%)', opacity: '0' } }], easing: 'easeInOutQuad', clamp: true },
  /* the title counter-scales 3→1 against the card's .36→1, so it holds a constant
     optical size while the card grows underneath it — the source's device */
  benchCardBody: { measure: 'closest:.section', keys: () => [{ v: -34, e: 0, p: { opacity: '0' } }, { v: -78, e: 0, p: { opacity: '1' } }], clamp: true },
  /* full-height statement bands: the title counter-scrolls against the photograph */
  bandTitle: { measure: 'closest:.section', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(14svh)' } }, { v: -100, e: 100, p: { transform: 'translateY(-14svh)' } }], clamp: true },

  /* wall + charts */
  wallTitle: { measure: 'closest:.sticky', keys: () => [{ v: 40, e: 0, p: { opacity: '0', transform: 'translateY(14svh)' }, easing: 'easeSection' }, { v: -20, e: 0, p: { opacity: '1', transform: 'translateY(0svh)' } }], clamp: true },
  /* Camera flight over the city sheet. tx = -S*(px-50), ty = -S*(py-50) — the
     percentage shift lands after the scale, so it carries the scale factor.
     Home sits at 53.218%,66.089%; the wide framing centres 50.0%,65.6%. */
  chartsMapFlight: { measure: 'closest:.sticky', keys: () => [
      { v: 100,  e: 0, p: { transform: 'translate(-50%,-50%) translate(-9.7%,-51.5%) scale(3.2)' } },
      { v: 0,    e: 0, p: { transform: 'translate(-50%,-50%) translate(-9.7%,-48.3%) scale(3.0)' } },
      { v: -200, e: 0, p: { transform: 'translate(-50%,-50%) translate(-0.1%,-25.0%) scale(1.6)' }, easing: 'easeInOutQuad' },
      { v: -460, e: 0, p: { transform: 'translate(-50%,-50%) translate(-0.1%,-20.3%) scale(1.3)' } }], clamp: true, mobile: true },
  chartsTitle: { measure: 'closest:.sticky', keys: () => [
      { v: 60, e: 0, p: { opacity: '0' }, easing: 'easeOutQuad' },
      { v: 0, e: 0, p: { opacity: '1' } },
      { v: -120, e: 0, p: { opacity: '1' }, easing: 'easeSectionInverse' },
      { v: -195, e: 0, p: { opacity: '0' } }], clamp: true },
  chartsProgress: { measure: 'closest:.sticky', keys: () => [
      { v: -200, e: 0, p: { transform: 'scaleX(0)' } },
      { v: -430, e: 0, p: { transform: 'scaleX(1)' } }], clamp: true },

  /* visit */
  visitBgMove: { measure: 'closest:.section', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(0svh)' } }, { v: 0, e: 100, p: { transform: 'translateY(-30svh)' } }], clamp: true, mobile: true },
  visitBgScale: { measure: 'closest:.section', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'scale(1.12)' } }, { v: 0, e: 100, p: { transform: 'scale(1)' } }], clamp: true, mobile: true },
  visitScreen: { measure: 'closest:.section', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(24svh)' } }, { v: 100, e: 100, p: { transform: 'translateY(0svh)' } }], clamp: true },
};

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/g;
const mixStr = (a, b, t) => {
  if (a === b) return a;
  const an = a.match(NUM) || [], bn = b.match(NUM) || [];
  if (an.length !== bn.length) return t < .5 ? a : b;
  let i = 0;
  return b.replace(NUM, () => { const v = lerp(parseFloat(an[i]), parseFloat(bn[i]), t); i++; return (Math.round(v * 10000) / 10000).toString(); });
};

const parallax = (() => {
  const groups = [];
  /* Every element we have ever written an inline style onto. Rebuilding on resize
     drops the desktop-only patterns but leaves the styles they wrote — crossing the
     breakpoint would weld desktop transforms onto the mobile layout. Clear first. */
  const managed = new Set();
  const resolveMeasure = (el, spec) => {
    if (spec === 'self') return el;
    if (spec && spec.startsWith('closest:')) return el.closest(spec.slice(8)) || el;
    return el;
  };
  const build = () => {
    managed.forEach(el => { el.style.transform = ''; el.style.opacity = ''; el.style.removeProperty('clip-path'); delete el.dataset.pyOpacity; });
    managed.clear();
    groups.length = 0;
    const mobile = !mdUp();
    $$('[data-parallax-pattern]').forEach(el => {
      el.dataset.parallaxPattern.split(/\s+/).filter(Boolean).forEach(name => {
        const pat = PATTERNS[name];
        if (!pat || pat.skip) return;
        if (mobile && !pat.mobile) return;
        const measure = resolveMeasure(el, pat.measure);
        const target = pat.target ? (el.matches(pat.target) ? el : $(pat.target, el)) : el;
        if (!target) return;
        groups.push({ el, target, measure, pat, name, keys: pat.keys(target, el), clamp: pat.clamp !== false, easing: pat.easing, scroll: [] });
      });
    });
    measure();
  };
  const measure = () => {
    for (const g of groups) {
      if (g.name === 'benchBackground') g.keys = g.pat.keys(g.target, g.el);
      const top = docTop(g.measure), h = g.measure.offsetHeight;
      g.scroll = g.keys.map(k => top + h * (k.e || 0) / 100 - VH * (k.v || 0) / 100 + (k.off || 0) * VH);
      const order = g.scroll.map((s, i) => i).sort((a, b) => g.scroll[a] - g.scroll[b]);
      g.sorted = order.map(i => ({ s: g.scroll[i], k: g.keys[i] }));
    }
  };
  const apply = (y) => {
    const acc = new Map();
    for (const g of groups) {
      const ks = g.sorted; if (!ks || ks.length < 2) continue;
      const first = ks[0].s, last = ks[ks.length - 1].s;
      let props;
      if (y <= first) { if (!g.clamp && y < first - VH * 3) continue; props = ks[0].k.p; }
      else if (y >= last) { props = ks[ks.length - 1].k.p; }
      else {
        let i = 0; while (i < ks.length - 2 && y > ks[i + 1].s) i++;
        const a = ks[i], b = ks[i + 1];
        let t = (y - a.s) / (b.s - a.s || 1);
        const ez = a.k.easing || g.easing; if (ez && E[ez]) t = E[ez](t);
        props = {};
        for (const p in b.k.p) props[p] = mixStr(a.k.p[p] ?? b.k.p[p], b.k.p[p], t);
      }
      let a = acc.get(g.target); if (!a) { a = { transform: [], opacity: 1, other: {} }; acc.set(g.target, a); }
      for (const p in props) {
        if (p === 'transform') a.transform.push(props[p]);
        else if (p === 'opacity') a.opacity *= parseFloat(props[p]);
        else if (p === 'progress') a.progress = parseFloat(props[p]);
        else a.other[p] = props[p];
      }
    }
    acc.forEach((a, el) => {
      managed.add(el);
      const st = el.style;
      if (a.transform.length) st.transform = a.transform.join(' ');
      if (a.opacity !== 1 || el.dataset.pyOpacity) { st.opacity = a.opacity; el.dataset.pyOpacity = '1'; }
      for (const p in a.other) st.setProperty(p, a.other[p]);
      if (a.progress !== undefined) el.dataset.progress = a.progress;
    });
  };
  return { build, measure, apply, groups };
})();

/* ============================================================
   SPLITTING
   ============================================================ */
const splitTitle = (el) => {
  if (el.dataset.split) return;
  el.dataset.split = 'title';
  const centred = getComputedStyle(el).textAlign === 'center';
  const tokens = [];
  const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 3) { c.textContent.split(/(\s+)/).forEach(t => { if (/^\s+$/.test(t)) tokens.push({ sp: true }); else if (t) tokens.push({ w: t }); }); } else if (c.tagName === 'BR') tokens.push({ br: true }); else walk(c); }); };
  walk(el);
  el.textContent = '';
  const words = [];
  tokens.forEach(t => {
    if (t.sp) { el.appendChild(document.createTextNode(' ')); return; }
    if (t.br) { const b = document.createElement('br'); el.appendChild(b); words.push(b); return; }
    const w = document.createElement('span'); w.className = 'word';
    /* A plain space inside an inline-block .char collapses — use NBSP, or
       "JUNIOR SUITE" renders as "JUNIORSUITE". */
    [...t.w].forEach(ch => { const c = document.createElement('span'); c.className = 'char'; c.textContent = ch === ' ' ? ' ' : ch; w.appendChild(c); });
    el.appendChild(w); words.push(w);
  });
  const lines = []; let cur = null, lastTop = null;
  words.forEach(w => {
    if (w.tagName === 'BR') { cur = null; lastTop = null; return; }
    const top = w.offsetTop;
    if (!cur || (lastTop !== null && Math.abs(top - lastTop) > 2)) { cur = []; lines.push(cur); }
    cur.push(w); lastTop = top;
  });
  el.textContent = '';
  const maxChars = Math.max(...lines.map(l => l.reduce((n, w) => n + w.children.length, 0) + l.length - 1), 1);
  lines.forEach((l, li) => {
    const wrap = document.createElement('span'); wrap.className = 'line-wrap'; wrap.style.setProperty('--line-index', li);
    const chars = l.reduce((n, w) => n + w.children.length, 0) + l.length - 1;
    wrap.style.setProperty('--line-char-offset', centred ? (maxChars - chars) / 2 : 0);
    const line = document.createElement('span'); line.className = 'line';
    let ci = 0;
    l.forEach((w, wi) => {
      [...w.children].forEach(c => c.style.setProperty('--char-index', ci++));
      line.appendChild(w);
      if (wi < l.length - 1) { const s = document.createElement('span'); s.className = 'whitespace'; s.textContent = ' '; line.appendChild(s); ci++; }
    });
    wrap.appendChild(line); el.appendChild(wrap);
  });
  el.dataset.charTotal = maxChars;
};
const splitLines = (el) => {
  if (el.dataset.split) return;
  el.dataset.split = 'lines';
  const tokens = [];
  const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 3) c.textContent.split(/(\s+)/).forEach(t => { if (/^\s+$/.test(t)) tokens.push({ sp: true }); else if (t) tokens.push({ w: t }); }); else if (c.tagName === 'BR') tokens.push({ br: true }); else if (c.tagName === 'EM' || c.tagName === 'SPAN') tokens.push({ sub: c.cloneNode(true) }); else walk(c); }); };
  walk(el);
  el.textContent = '';
  const words = [];
  tokens.forEach(t => {
    if (t.sp) { el.appendChild(document.createTextNode(' ')); return; }
    if (t.br) { const b = document.createElement('br'); el.appendChild(b); words.push(b); return; }
    if (t.sub) { const w = document.createElement('span'); w.className = 'word'; w.appendChild(t.sub); el.appendChild(w); words.push(w); return; }
    const w = document.createElement('span'); w.className = 'word'; w.textContent = t.w; el.appendChild(w); words.push(w);
  });
  const lines = []; let cur = null, lastTop = null;
  words.forEach(w => { if (w.tagName === 'BR') { cur = null; lastTop = null; return; } const top = w.offsetTop; if (!cur || (lastTop !== null && Math.abs(top - lastTop) > 2)) { cur = []; lines.push(cur); } cur.push(w); lastTop = top; });
  el.textContent = '';
  lines.forEach((l, li) => { const line = document.createElement('span'); line.className = 'line'; line.style.setProperty('--line-index', li); l.forEach((w, wi) => { line.appendChild(w); if (wi < l.length - 1) line.appendChild(document.createTextNode(' ')); }); el.appendChild(line); });
  el.dataset.lineTotal = lines.length;
};

/* ============================================================
   TRANSITION ENGINE
   ============================================================ */
const DUR = { rise: 800, title: 1400, wipe: 1400, text: 1000, 'fade-in': 400, 'zoom-in': 400, 'slide-in-top': 400, 'slide-in': 1000, fast: 200, slow: 1000, block: 1600 };
/* Two halves, so a reveal is ARMED (split + inactive state) while still hidden and
   only RUN later. Doing both at once painted the finished headline for the whole
   delay, then snapped it back to hidden and animated — the "flashing" bug. */
const prepareTransition = (el, names) => {
  const list = names.split(/\s+/).filter(Boolean);
  if (list.includes('title')) splitTitle(el);
  if (list.includes('text')) splitLines(el);
  const cls = [];
  list.forEach(n => cls.push('animation', `animation--${n}`, `animation--${n}--inactive`));
  el.classList.add(...cls, 'disable-transitions');
  void el.offsetWidth;
  return { list, cls };
};
const runTransition = (el, prepared, cb) => {
  const { list, cls } = prepared;
  let dur = Math.max(...list.map(n => DUR[n] || 400));
  if (list.includes('block')) dur = 1600; else if (list.includes('slow')) dur = 1000; else if (list.includes('fast')) dur = 200;
  if (list.includes('title')) dur = 1400 + (+el.dataset.charTotal || 0) * 39;
  if (list.includes('text')) dur = 1000 + (+el.dataset.lineTotal || 0) * 40;
  el.classList.remove('disable-transitions');
  requestAnimationFrame(() => {
    list.forEach(n => { el.classList.remove(`animation--${n}--inactive`); el.classList.add(`animation--${n}--active`); });
    setTimeout(() => { el.classList.remove(...cls, ...list.map(n => `animation--${n}--active`)); cb && cb(); }, dur + 90);
  });
};
const transition = (el, names, cb) => runTransition(el, prepareTransition(el, names), cb);

/* ============================================================
   REVEAL — rect check at 10Hz, run BEFORE the parallax writes.
   NOT IntersectionObserver: IO reports the TRANSFORMED box, and nearly every
   title here lives inside a pinned/parallaxed layer.
   ============================================================ */
const reveal = (() => {
  let started = false, pending = [];
  const ENTER = .88;
  const done = (el, name) => { el.removeAttribute('data-reveal'); el.setAttribute('data-reveal-old', name); };
  const show = (el, extraDelay = 0) => {
    if (el.hasAttribute('data-reveal-visible')) return;
    const name = el.dataset.reveal;
    const delay = (+el.dataset.revealDelay || 0) + extraDelay;
    const overshoot = el.getBoundingClientRect().bottom < 0;
    if (overshoot || reduced) { el.setAttribute('data-reveal-visible', ''); done(el, name); return; }
    /* touch: one cheap rise instead of splitting every character */
    const effective = mdUp() ? name : name.split(/\s+/).map(n => (n === 'title' || n === 'text') ? 'rise' : n).join(' ');
    const prepared = prepareTransition(el, effective);
    el.setAttribute('data-reveal-visible', '');
    setTimeout(() => runTransition(el, prepared, () => done(el, name)), mdUp() ? delay : Math.min(delay, 260));
  };
  const start = () => {
    if (started) return; started = true;
    if (reduced) { $$('[data-reveal]').forEach(el => { el.setAttribute('data-reveal-visible', ''); el.setAttribute('data-reveal-old', el.dataset.reveal); el.removeAttribute('data-reveal'); }); return; }
    pending = $$('[data-reveal]').map(el => {
      const group = el.closest('[data-reveal-group]');
      return { el, group, trigger: group || el, delay: group ? (+group.dataset.revealDelay || 30) : 0 };
    });
    check();
  };
  const check = () => {
    if (!pending.length) return;
    const still = [];
    for (const p of pending) {
      if (p.el.hasAttribute('data-reveal-visible')) continue;
      const r = p.trigger.getBoundingClientRect();
      if (!r.height && !r.width) { still.push(p); continue; }
      if (r.top < VH * ENTER && r.bottom > 0) show(p.el, p.delay);
      else if (r.bottom <= 0) show(p.el, 0);
      else still.push(p);
    }
    pending = still;
  };
  let lastCheck = 0;
  const tick = now => { if (!started || now - lastCheck < 100) return; lastCheck = now; check(); };
  return { start, tick };
})();

/* ============================================================
   LAZY MEDIA
   ============================================================ */
const media = (() => {
  const imgs = $$('img[data-img]');
  imgs.forEach(img => {
    const name = img.dataset.img, ws = img.dataset.w.split(/\s+/).map(Number);
    img.dataset.srcset = ws.map(w => `assets/w/${name}@${w}.webp ${w}w`).join(', ');
    img.dataset.src = `assets/w/${name}@${ws[Math.min(1, ws.length - 1)]}.webp`;
    img.loading = 'lazy'; img.decoding = 'async';
  });
  const load = img => {
    if (img.dataset.loaded) return; img.dataset.loaded = '1';
    img.srcset = img.dataset.srcset; img.src = img.dataset.src;
    const done = () => img.classList.add('is-loaded');
    if (img.decode) img.decode().then(done, done); else img.onload = done;
  };
  const pre = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { pre.unobserve(en.target); load(en.target); } }), { rootMargin: '600px 0px' });
  imgs.forEach(i => pre.observe(i));
  if ('requestIdleCallback' in window) requestIdleCallback(() => imgs.forEach(load), { timeout: 8000 });
  return { load };
})();

/* ============================================================
   PRELOADER
   ============================================================ */
const preloader = (() => {
  const el = $('#preloader'), counter = $('#preloader-counter'), fill = $('#preloader-fill');
  /* the family pages ship no preloader — they arrive under the page curtain */
  if (!el) return { skip: true, tick(cb) { cb && cb(); }, finish(cb) { cb && cb(); }, el: { classList: { add() {} } } };
  const skip = !mdUp() || location.hash === '#skip-preloader' || sessionStorage.getItem('jsw-preloaded');
  const MIN = 1200; const t0 = performance.now();
  let assets = 0, total = 2, shown = 0, done = false;
  const hero = $('.intro__img');
  const bump = () => { assets++; };
  if (!hero) bump(); else { media.load(hero); if (hero.complete) bump(); else { hero.addEventListener('load', bump); hero.addEventListener('error', bump); } }
  document.fonts.ready.then(bump);
  const finish = (cb) => {
    if (done) return; done = true;
    setTimeout(() => { el.classList.add('is-done'); setTimeout(() => el.classList.add('is-removed'), 1000); cb(); }, skip ? 0 : 800);
  };
  const tick = (cb) => {
    const p = Math.min(1, ((performance.now() - t0) / MIN + assets / total) / 2);
    shown = lerp(shown, p, .15);
    if (fill) fill.style.transform = `scaleX(${shown.toFixed(4)})`;
    if (counter) counter.textContent = Math.round(shown * 100);
    if (p >= 1 && shown > .995) finish(cb);
  };
  return { skip, tick, finish, el };
})();

/* ============================================================
   HEADER — theme follows the section under the header line
   ============================================================ */
const header = (() => {
  const h = $('#header');
  const sections = $$('.section');
  let ranges = [];
  const measure = () => {
    ranges = sections.map(s => ({
      top: docTop(s), bottom: docTop(s) + s.offsetHeight,
      cls: s.classList.contains('ui-dark') ? 'ui-dark' : 'ui-light',
    }));
  };
  let lastCls = '', lastY = 0;
  const tick = y => {
    const line = y + 40;
    let cur = ranges[0];
    /* later sections overlap earlier ones through negative margins — last match wins */
    for (let i = ranges.length - 1; i >= 0; i--) { if (line >= ranges[i].top && line < ranges[i].bottom) { cur = ranges[i]; break; } }
    if (cur && cur.cls !== lastCls) { h.classList.remove('ui-dark', 'ui-light'); h.classList.add(cur.cls); lastCls = cur.cls; }
    h.classList.toggle('is-solid', y > VH * .6);
    /* hide on the way down, show on the way up */
    if (y > VH && y > lastY + 4) h.classList.add('is-hidden');
    else if (y < lastY - 4 || y < VH) h.classList.remove('is-hidden');
    lastY = y;
  };
  return { measure, tick, el: h };
})();

/* ============================================================
   MENU
   ============================================================ */
const menu = (() => {
  const modal = $('#menu'), toggle = $('#menu-toggle');
  let open = false;
  const show = () => { open = true; modal.setAttribute('aria-hidden', 'false'); html.classList.add('with-modal', 'is-menu-open'); toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Close menu'); };
  const hide = () => { open = false; modal.setAttribute('aria-hidden', 'true'); html.classList.remove('with-modal', 'is-menu-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
  toggle.addEventListener('click', () => open ? hide() : show());
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && open) hide(); });
  $$('.js-menu-link').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); const t = $(a.getAttribute('href')); hide(); if (t) setTimeout(() => scroller.scrollToEl(t), 220); });
  });
  return { hide, isOpen: () => open };
})();

/* ============================================================
   5 · THE DIAL — the ring selector.
   Behaviour transplanted from the Holt WebGL ring exactly: scroll is
   AUTHORITATIVE, drag adds an offset that DECAYS back to it (a persistent snap
   term accumulates against the scroll-derived index and the set never finishes),
   hover raises the ring cursor, click opens the family page through the curtain.
   Only the rendering changed — a dial is flat, so this is CSS, not WebGL.
   ============================================================ */
const DIAL_FAMILIES = [
  { key: '101', name: '101', price: '2,440', img: 'f-101', note: 'Named after the postcode of downtown Reykjavík, and the first watch the company made. 38mm, 32mm, Art Deco and the 10 Year Edition.' },
  { key: 'frisland', name: 'Frisland', price: '3,260', img: 'f-frisland', note: 'A phantom island charted in 1558 and copied onto the Atlantic for a century. Frisland, Frisland 1941 and the Goð special edition.' },
  { key: 'islandus', name: 'Islandus', price: '3,010', img: 'f-islandus', note: 'The Latin Iceland of Ortelius’s 1585 chart. Islandus, Islandus 1919 and the Dakota.' },
  { key: 'sif', name: 'SIF', price: '3,260', img: 's01', note: 'Four variants under one name: N.A.R.T., 1948, Volcano and Protector.' },
  { key: 'vinland', name: 'Vínland', price: '7,760', img: 'f-vinland', note: 'The Norse name for the coast across the Atlantic. Chronograph Classic, Chronograph Tachymeter and the Special Edition.' },
  { key: 'gilbert', name: 'Gilbert', price: '2,860', img: 'f-gilbert', note: 'Named for the master watchmaker at the bench. Gilbert, and the Bóhem.' },
];

const dial = (() => {
  const stage = $('#dial-stage'), ring = $('#dial-ring'), section = $('#dial');
  if (!stage || !ring) return { tick() {}, measure() {} };
  const sticky = $('.sticky', section);
  const hubName = $('#dial-hub-name'), hubNote = $('#dial-hub-note'), hubEyebrow = $('#dial-hub-eyebrow');
  const ticksG = $('#dial-ticks'), cursor = $('#cursor'), cursorLabel = $('#cursor-label'), cursorBar = $('.cursor__bar');
  const mrail = $('.js-dial-mrail');
  const N = DIAL_FAMILIES.length, STEP = 360 / N;
  let cards = [], top = 0, height = 0, sel = 0, dragSel = 0, shown = 0, last = -1;
  let dragging = false, lastX = 0, moved = 0, cx = 0, cy = 0, mx = 0, my = 0, hovering = -1;
  let imgsLoaded = false;

  /* dial furniture: 60 minute ticks, every 5th major */
  if (ticksG) {
    let d = '';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const r1 = major ? 440 : 452, r2 = 470;
      d += `<line x1="${(500 + Math.cos(a) * r1).toFixed(1)}" y1="${(500 + Math.sin(a) * r1).toFixed(1)}" x2="${(500 + Math.cos(a) * r2).toFixed(1)}" y2="${(500 + Math.sin(a) * r2).toFixed(1)}"${major ? ' class="is-major"' : ''}/>`;
    }
    ticksG.innerHTML = d;
  }

  /* seats */
  DIAL_FAMILIES.forEach((f, i) => {
    const seat = document.createElement('div');
    seat.className = 'l-dial__seat';
    seat.style.transform = `rotate(${i * STEP}deg) translateY(calc(var(--dial-radius) * -1))`;
    const card = document.createElement('button');
    card.className = 'l-dial__card';
    card.type = 'button';
    card.dataset.index = i;
    card.setAttribute('aria-label', `${f.name} — open the family page`);
    card.innerHTML = `<img data-img="${f.img}" data-w="720 1440" class="appear" alt="${f.name} by JS Watch co. Reykjavík"><span class="l-dial__card-name">${f.name}</span>`;
    seat.appendChild(card); ring.appendChild(seat);
    cards.push(card);
  });
  /* register the freshly-created images with the lazy loader */
  $$('img[data-img]', ring).forEach(img => {
    const name = img.dataset.img, ws = img.dataset.w.split(/\s+/).map(Number);
    img.dataset.srcset = ws.map(w => `assets/w/${name}@${w}.webp ${w}w`).join(', ');
    img.dataset.src = `assets/w/${name}@${ws[ws.length - 1]}.webp`;
    img.loading = 'lazy'; img.decoding = 'async';
  });

  /* mobile picker — its own cards, native scroll-snap (hiding the dial would also
     hide the dial's heading, so the mobile block carries its own) */
  if (mrail) {
    DIAL_FAMILIES.forEach(f => {
      const a = document.createElement('a');
      a.className = 'l-dial__mcard';
      a.href = `watch-${f.key}.html`;
      a.innerHTML = `<img data-img="${f.img}" data-w="720" class="appear" alt="${f.name} by JS Watch co. Reykjavík"><span class="l-dial__mcard-name">${f.name}</span><span class="l-dial__mcard-note">${f.note}</span>`;
      mrail.appendChild(a);
    });
    const mObs = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { mObs.unobserve(en.target); media.load(en.target); } }), { rootMargin: '400px' });
    $$('img[data-img]', mrail).forEach(img => {
      const name = img.dataset.img;
      img.dataset.srcset = `assets/w/${name}@720.webp 720w`;
      img.dataset.src = `assets/w/${name}@720.webp`;
      img.loading = 'lazy'; img.decoding = 'async';
      mObs.observe(img);
    });
  }

  const sizeDial = () => {
    let size, rf, cf;
    if (mdUp()) { size = Math.min(VH * .70, VW * .58); rf = .50; cf = .29; }
    /* phone: cards must stay inside the viewport, so the ring sits INSIDE the
       minute track (radius .40) with smaller cards instead of on it */
    else { size = Math.min(VW * .84, VH * .46); rf = .40; cf = .23; }
    stage.style.setProperty('--dial-size', size + 'px');
    stage.style.setProperty('--dial-radius', (size * rf) + 'px');
    const cw = size * cf;
    stage.style.setProperty('--card-w', cw + 'px');
    stage.style.setProperty('--card-h', (cw * 1.34) + 'px');
  };

  const measure = () => { if (!sticky) return; top = docTop(sticky); height = sticky.offsetHeight; sizeDial(); };

  const cta = $('#dial-hub-cta');
  const setActive = i => {
    if (i === last) return; last = i;
    const f = DIAL_FAMILIES[i];
    if (cta) cta.textContent = isTouch ? 'Tap the dial to open' : 'Click the dial to open';
    cards.forEach((c, k) => c.classList.toggle('is-active', k === i));
    if (hubName) hubName.textContent = f.name;
    if (hubNote) hubNote.textContent = f.note;
    const pr = $('#dial-hub-price'); if (pr) pr.textContent = f.price ? `from $${f.price}` : '';
    if (hubEyebrow) hubEyebrow.textContent = `Family ${String(i + 1).padStart(2, '0')} of ${String(N).padStart(2, '0')}`;
  };

  /* drag: adds an offset that decays back to the scroll position */
  stage.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; moved = 0; stage.setPointerCapture(e.pointerId); });
  window.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
  stage.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
    dragSel -= dx / 180;
  });
  const up = () => { dragging = false; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

  cards.forEach((c, i) => {
    c.addEventListener('mouseenter', () => { hovering = i; });
    c.addEventListener('mouseleave', () => { if (hovering === i) hovering = -1; });
    c.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); return; } go(i); });
  });
  const go = i => { const href = `watch-${DIAL_FAMILIES[i].key}.html`; if (window.__jswNav) window.__jswNav(href); else location.href = href; };

  const tick = y => {
    if (!height) measure();
    const near = y > top - VH * 2 && y < top + height + VH;
    /* these <img>s are built by JS after media's observer was wired, so nothing
       else will ever load them — do it once the chapter comes into range */
    if (near && !imgsLoaded) { imgsLoaded = true; $$('img[data-img]', ring).forEach(media.load); }
    /* scroll is authoritative: walks 0→N-1 then holds a viewport before release */
    const p = clamp((y - top) / (height - VH * 2 || 1));
    const scrollSel = p * (N - 1);
    dragSel *= .94;                                   // decay, never a competing snap term
    sel = scrollSel + dragSel;
    shown = lerp(shown, sel, .12);
    ring.style.transform = `rotate(${(-shown * STEP).toFixed(3)}deg)`;
    cards.forEach((c, i) => { c.style.transform = `rotate(${(shown * STEP - i * STEP).toFixed(3)}deg)`; });
    setActive(Math.max(0, Math.min(N - 1, Math.round(sel))));

    /* ring cursor — pointer only */
    if (!mdUp()) return;
    stage.classList.toggle('is-hovering', near && hovering >= 0);
    if (near && hovering >= 0) {
      cursor.classList.add('is-visible');
      if (cursorLabel) cursorLabel.textContent = DIAL_FAMILIES[hovering].name;
      if (cursorBar) cursorBar.style.strokeDashoffset = 0;
    } else if (cursor.classList.contains('is-visible') && hovering < 0) {
      cursor.classList.remove('is-visible');
      if (cursorBar) cursorBar.style.strokeDashoffset = 370.7;
    }
    cx = lerp(cx, mx, .5); cy = lerp(cy, my, .5);
    cursor.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
  };
  return { tick, measure };
})();

/* ============================================================
   7 · THE SHOWCASE — horizontal chapter
   ============================================================ */
const showcase = (() => {
  const root = $('#showcase-stage'); if (!root) return { tick() {}, measure() {} };
  const track = $('.js-showcase-track', root), fill = $('.js-showcase-fill', root);
  let max = 0, top = 0, height = 0, lastP = -1;
  const measure = () => {
    if (!mdUp()) { root.style.height = ''; track.style.transform = ''; return; }
    max = Math.max(0, track.scrollWidth - VW);
    root.style.height = (max + VH) + 'px';
    height = root.offsetHeight; top = docTop(root);
  };
  const tick = y => {
    if (!mdUp()) return;
    const p = clamp((y - top) / (height - VH || 1));
    if (Math.abs(p - lastP) < .0002) return; lastP = p;
    track.style.transform = `translate3d(${(-p * max).toFixed(2)}px,0,0)`;
    if (fill) fill.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  return { tick, measure };
})();

/* ============================================================
   9 · THE CHARTS — real Web-Mercator geometry over a light tile sheet.
   Bounds must match assets/img/chart.webp exactly (see _build-chart.mjs).
   ============================================================ */
const CHART = { lonMin: -78.75, lonMax: -11.25, latMax: 70.61261423801923, latMin: 40.979898069620134 };
const mercY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; };
const project = (lat, lon) => {
  const x = (lon - CHART.lonMin) / (CHART.lonMax - CHART.lonMin) * 100;
  const y = (mercY(lat) - mercY(CHART.latMax)) / (mercY(CHART.latMin) - mercY(CHART.latMax)) * 100;
  return { x, y };
};
/* real great-circle interpolation, sampled and projected — a straight line on a
   Mercator chart is not the route, and this is a page about charts */
const greatCircle = (a, b, n = 28) => {
  const t = d => d * Math.PI / 180;
  const [la1, lo1, la2, lo2] = [t(a.lat), t(a.lon), t(b.lat), t(b.lon)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (!d) { pts.push(project(a.lat, a.lon)); continue; }
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    pts.push(project(Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI));
  }
  return pts;
};
const CHART_PLACES = [
  { name: 'Islandus', lat: 64.1436, lon: -21.9165 },
  { name: 'Frisland', lat: 62.50, lon: -25.00 },
  { name: 'Vínland', lat: 51.5959, lon: -55.5316 },
];
const HOME = { lat: 64.1436, lon: -21.9165 };

const charts = (() => {
  const section = $('#charts'); if (!section) return { tick() {}, measure() {} };
  const sticky = $('.l-charts__map-layer', section);
  const svg = $('.js-charts-routes', section), pinBox = $('.js-charts-pins', section);
  const cardBox = $('.js-charts-cards', section), homeEl = $('.js-charts-home', section);
  const sheet = $('.l-charts__map-img', section);
  let top = 0, height = 0, last = -1, places = [], pins = [], cards = [], routes = [], lens = [];
  let ready = false, sheetStarted = false;

  /* geometry comes from _build-citymap.mjs — real OSRM foot routes, projected to
     percentages of the stitched sheet, so nothing here is hand-placed */
  fetch('assets/citymap.json').then(r => r.json()).then(d => {
    homeEl.style.left = d.home.x + '%'; homeEl.style.top = d.home.y + '%';
    places = d.places;
    places.forEach((p, i) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'l-charts__route');
      path.setAttribute('d', p.path.map((q, k) => `${k ? 'L' : 'M'}${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(' '));
      svg.appendChild(path); routes.push(path);

      const pin = document.createElement('span');
      pin.className = 'l-charts__pin';
      pin.style.left = p.x + '%'; pin.style.top = p.y + '%';
      pin.innerHTML = `<i></i><span>${p.name}</span>`;
      pinBox.appendChild(pin); pins.push(pin);

      const card = document.createElement('div');
      card.className = 'l-charts__card';
      card.innerHTML = `<p class="text-small">0${i + 1} / 0${places.length}</p>` +
        `<h3 class="h2">${p.name}</h3>` +
        `<p class="l-charts__coord numeral-sm">${p.dist} m · ${p.mins} min on foot</p>`;
      cardBox.appendChild(card); cards.push(card);
    });
    /* dash from the MEASURED length: pathLength normalisation is ignored once a
       stroke is non-scaling, which leaves the line permanently dashed */
    lens = routes.map(r => { const L = r.getTotalLength() || 1; r.style.strokeDasharray = L; r.style.strokeDashoffset = L; return L; });
    ready = true; last = -1; measure();
  }).catch(() => {});

  const measure = () => { if (!sticky) return; top = docTop(sticky); height = sticky.offsetHeight; };
  const setIndex = i => {
    if (i === last || !ready) return; last = i;
    pins.forEach((p, k) => p.classList.toggle('is-active', k === i));
    cards.forEach((c, k) => c.classList.toggle('is-active', k === i));
    routes.forEach((r, k) => { const on = k <= i; r.classList.toggle('is-drawn', on); r.style.strokeDashoffset = on ? 0 : lens[k]; });
  };
  const tick = y => {
    if (!height) measure();
    if (!sheetStarted && y > top - VH * 2.5 && y < top + height) {
      sheetStarted = true; if (sheet && sheet.dataset.src) sheet.src = sheet.dataset.src;
    }
    if (homeEl) homeEl.classList.toggle('is-labelled', y > top + VH * 1.6);
    if (!ready) return;
    /* the title owns the opening two viewports; the cards run the rest */
    const p = clamp((y - (top + VH * 2)) / (VH * 2.8));
    setIndex(Math.min(places.length - 1, Math.floor(p * places.length)));
  };
  return { tick, measure };
})();

/* ============================================================
   SCROLL CUE
   ============================================================ */
const scrollCue = (() => {
  const el = $('#scroll-cue'); if (!el) return { tick() {} };
  const holds = $$('[data-hold]');
  let lastY = -1, idleSince = 0, on = false;
  const tick = (y, now) => {
    if (Math.abs(y - lastY) > 1.5) { lastY = y; idleSince = now; if (on) { el.classList.remove('is-on'); html.removeAttribute('data-cue-on'); on = false; } return; }
    if (on) return;
    if (now - idleSince < 1100) return;
    const hold = holds.find(s => { const t = docTop(s); return y > t - VH * .2 && y < t + s.offsetHeight - VH * 1.1; });
    if (!hold) return;
    el.classList.toggle('is-light', $('#header').classList.contains('ui-light'));
    html.setAttribute('data-cue-on', '');
    el.classList.add('is-on'); on = true;
  };
  return { tick };
})();

/* ============================================================
   FOOTER — the wordmark wipes as it enters
   ============================================================ */
const footerMask = (() => {
  const big = $('#footer-big'); if (!big) return { tick() {} };
  const mask = $('#footer-mask'), head = big.closest('.footer__headline');
  if (mask && head) head.addEventListener('mousemove', e => {
    const r = head.getBoundingClientRect();
    mask.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    mask.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
  const tick = () => {
    const r = big.getBoundingClientRect();
    if (r.top > VH || r.bottom < 0) return;
    const p = clamp((VH - r.top) / (VH * .75));
    big.style.backgroundPosition = `${(100 - p * 100).toFixed(2)}% 0`;
    if (mask) mask.style.backgroundPosition = big.style.backgroundPosition;
  };
  return { tick };
})();

/* ============================================================
   ANCHORS + WELLS
   ============================================================ */
$$('a[href^="#"]').forEach(a => {
  if (a.classList.contains('js-menu-link')) return;
  a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const t = $(id); if (!t) return;
    e.preventDefault(); scroller.scrollToEl(t);
  });
});
const measureWells = () => {
  scroller.wells = [];
  $$('[data-gravity-well]').forEach(el => {
    const top = docTop(el), h = el.offsetHeight;
    JSON.parse(el.dataset.gravityWell).forEach(w => scroller.wells.push(top + h * w.element / 100 - VH * w.viewport / 100));
  });
};

/* ============================================================
   MEASURE + LOOP
   ============================================================ */
const measureAll = () => {
  measureViewport();
  parallax.measure();
  header.measure();
  dial.measure();
  showcase.measure();
  charts.measure();
  measureWells();
  scroller.setLimit();
};
let resizeT;
const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { parallax.build(); measureAll(); }, 120); };
window.addEventListener('resize', onResize);
const ro = new ResizeObserver(() => { clearTimeout(resizeT); resizeT = setTimeout(measureAll, 120); });
ro.observe(document.body);

let running = false;
const loop = (now) => {
  if (!running) preloader.tick(startPage);
  scroller.tick();
  const y = SMOOTH ? scroller.y : scrollY;
  reveal.tick(now);          // rect READS first, before the transform writes below
  parallax.apply(y);
  header.tick(y);
  dial.tick(y);
  showcase.tick(y);
  charts.tick(y);
  scrollCue.tick(y, now);
  footerMask.tick();
  scroller.listeners.forEach(f => f());
  requestAnimationFrame(loop);
};

const startPage = () => {
  if (running) return; running = true;
  try { sessionStorage.setItem('jsw-preloaded', '1'); } catch (e) {}
  measureAll();
  if (mdUp() && !reduced) setTimeout(() => transition(header.el, 'slide-in-top block'), 250);
  reveal.start();
};

/* Cross-page curtain — the incoming page raises it in <head> from sessionStorage
   and drops it here, so navigating never flashes raw content. */
const pageTransition = (() => {
  const ov = $('#page-overlay');
  const drop = () => { html.classList.remove('is-entering'); ov.classList.remove('is-on'); };
  const raise = href => { try { sessionStorage.setItem('jsw-nav', '1'); } catch (e) {} ov.classList.add('is-on'); setTimeout(() => { location.href = href; }, 380); };
  window.__jswNav = raise;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) return;
    if (!/\.html?$/.test(url.pathname) && url.pathname !== '/') return;
    e.preventDefault(); raise(url.href);
  });
  addEventListener('pageshow', drop);
  return { drop };
})();

const boot = async () => {
  await document.fonts.ready;
  requestAnimationFrame(() => setTimeout(pageTransition.drop, 60));
  parallax.build();
  measureAll();
  if (location.hash && location.hash !== '#skip-preloader') { const t = $(location.hash); if (t) { const to = docTop(t); window.scrollTo(0, to); scroller.y = scroller.target = to; } }
  if (preloader.skip) { preloader.el.classList.add('is-removed'); startPage(); }
  requestAnimationFrame(loop);
};
boot();
