// UI behaviour + bootstrapping of the two WebGL scenes.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || innerWidth < 700;
const root = document.documentElement;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

/* ---------- scroll driven UI ---------- */
const nav = $('#nav');
const bar = $('#scrollbar i');
const journey = $('#journey');
const steps = $$('.step');
const railBtns = $$('#rail button');
const hint = $('#jhint');
const parallaxEls = $$('.parallax');
let journeyApi = null, heroApi = null;
let activeStep = 0;

function setStep(i) {
  if (i === activeStep) return;
  activeStep = i;
  steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
  railBtns.forEach((b, k) => b.classList.toggle('is-active', k === i));
}

function journeyMetrics() {
  const top = journey.offsetTop;
  const span = journey.offsetHeight - innerHeight;
  return { top, span };
}

function onScroll() {
  const y = scrollY;
  nav.classList.toggle('is-stuck', y > 30);
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;

  const { top, span } = journeyMetrics();
  const p = clamp((y - top) / span);
  if (journeyApi) journeyApi.setProgress(p);
  setStep(Math.min(4, Math.round(p * 4)));
  hint.classList.toggle('is-hidden', p > 0.03);

  if (heroApi) heroApi.setScroll(clamp(y / innerHeight));
  for (const el of parallaxEls) {
    const r = el.getBoundingClientRect();
    const d = (r.top + r.height / 2 - innerHeight / 2) * parseFloat(el.dataset.speed || 0.1);
    el.style.transform = `translate3d(0, ${d.toFixed(1)}px, 0)`;
  }
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);

function goToStep(i) {
  const { top, span } = journeyMetrics();
  scrollTo({ top: top + (i / 4) * span + 2, behavior: reduced ? 'auto' : 'smooth' });
}
railBtns.forEach((b) => b.addEventListener('click', () => goToStep(+b.dataset.go)));
$('#pins').addEventListener('click', (e) => {
  const pin = e.target.closest('.pin');
  if (pin) goToStep(+pin.dataset.go);
});

/* ---------- mobile nav ---------- */
const toggle = $('#navtoggle');
function closeNav() { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
toggle.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});
$$('#navlinks a').forEach((a) => a.addEventListener('click', closeNav));

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); if (en.target.dataset.count !== undefined) countUp(en.target); }
  }
}, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
$$('.reveal').forEach((el) => io.observe(el));

function countUp(el) {
  const to = +el.dataset.count, t0 = performance.now(), dur = 1400;
  const step = (t) => {
    const k = clamp((t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
$$('[data-count]').forEach((el) => {
  const o = new IntersectionObserver(([en]) => { if (en.isIntersecting) { countUp(el); o.disconnect(); } }, { threshold: 0.6 });
  o.observe(el);
});

/* ---------- cursor, magnetic buttons, tilt ---------- */
if (finePointer && !reduced) {
  const cur = $('#cursor');
  let cx = 0, cy = 0, tx = 0, ty = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; cur.classList.add('is-on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
  (function loop() {
    cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
    cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(loop);
  })();
  $$('a, button, .card, .poster__btn').forEach((el) => {
    el.addEventListener('pointerenter', () => cur.classList.add('is-hover'));
    el.addEventListener('pointerleave', () => cur.classList.remove('is-hover'));
  });

  $$('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 14}px, ${((e.clientY - r.top) / r.height - 0.5) * 10}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });

  $$('.tilt').forEach((el) => {
    const max = el.classList.contains('tilt--soft') ? 5 : 11;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.transition = 'border-color .4s, box-shadow .4s';
      el.style.transform = `rotateY(${(px - 0.5) * max * 2}deg) rotateX(${(0.5 - py) * max * 2}deg) translateZ(0)`;
      el.style.setProperty('--gx', px * 100 + '%');
      el.style.setProperty('--gy', py * 100 + '%');
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .8s cubic-bezier(.22,.8,.24,1), border-color .4s, box-shadow .4s';
      el.style.transform = '';
    });
  });
}

/* ---------- lightbox ---------- */
const lb = $('#lightbox');
function openLb() { lb.hidden = false; requestAnimationFrame(() => lb.classList.add('is-open')); document.body.style.overflow = 'hidden'; $('#lbClose').focus(); }
function closeLb() { lb.classList.remove('is-open'); document.body.style.overflow = ''; setTimeout(() => { lb.hidden = true; }, 400); $('#posterBtn').focus(); }
$('#posterBtn').addEventListener('click', openLb);
$('#lbClose').addEventListener('click', closeLb);
lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!lb.hidden) closeLb(); closeNav(); } });

/* ---------- boot ---------- */
async function boot() {
  const pre = $('#preloader');
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    pre.classList.add('is-done');
    root.classList.add('is-ready');
    onScroll();
  };
  setTimeout(done, 6000);

  if (!hasWebGL()) {
    root.classList.add('no-webgl');
    done();
    return;
  }
  try {
    const [{ initHero }, { initJourney }] = await Promise.all([import('./hero.js'), import('./journey.js')]);
    heroApi = initHero($('#hero-canvas'), { reduced });
    journeyApi = initJourney($('#journey-canvas'), $('#pins'), { reduced, lowPower });
    if (!heroApi || !journeyApi) root.classList.add('no-webgl');
  } catch (err) {
    console.error('3D scenes failed to start:', err);
    root.classList.add('no-webgl');
  }
  // let the first frames compile before revealing
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 350)));
}

// Fonts shouldn't block the reveal for long
Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1200))]).then(boot);
onScroll();
