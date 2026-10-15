/* web-factory film engine: scroll position -> frame number -> canvas, plus an optional concept shop.
   All site-specific values come from <script id="site-config"> (built from site.json). */
(() => {
  'use strict';
  const CFG = JSON.parse(document.getElementById('site-config').textContent);
  const F = CFG.film, FRAMES = F.count, BOUNDS = F.bounds, TAU = F.tau || 70;
  const $ = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)];
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const canvas = $('#film'), ctx = canvas.getContext('2d', {alpha: false});
  const chapters = all('.chapter'), copies = all('.copy');
  const N = chapters.length, labels = CFG.labels;

  // ---- frame store ----
  const portraitMQ = matchMedia('(max-width:900px) and (orientation:portrait)');
  const hasPortrait = (F.sets || ['wide']).includes('portrait');
  const pickSet = () => (hasPortrait && portraitMQ.matches ? 'portrait' : 'wide');
  let set = pickSet();
  const store = {wide: new Map(), portrait: new Map()}, loading = new Set();
  let active = 0, queue = [];
  const url = (s, i) => `${F.path}/${s}/${String(i).padStart(3, '0')}.${F.ext || 'jpg'}`;
  function request(i, s = set) {
    const m = store[s];
    if (m.has(i) || loading.has(s + i)) return;
    loading.add(s + i); active++;
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { loading.delete(s + i); active--; m.set(i, img); if (s === set) draw(); pump(); };
    img.onerror = () => { loading.delete(s + i); active--; pump(); };
    img.src = url(s, i);
  }
  function buildQueue() {
    const q = [0, FRAMES - 1];
    for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) q.push(i);
    queue = [...new Set(q)];
  }
  function pump() { while (active < 6 && queue.length) { const i = queue.shift(); if (!store[set].has(i)) request(i); } }

  // ---- draw (cover fit) ----
  let W = 0, H = 0, shown = -1, shownSet = '';
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(innerWidth * dpr); H = canvas.height = Math.round(innerHeight * dpr);
    const next = pickSet(); if (next !== set) { set = next; buildQueue(); pump(); }
    shown = -1; draw();
  }
  function nearest(i) {
    const m = store[set]; if (m.has(i)) return m.get(i);
    for (let d = 1; d < FRAMES; d++) { if (m.has(i - d)) return m.get(i - d); if (m.has(i + d)) return m.get(i + d); }
    return null;
  }
  function draw() {
    const i = Math.round(cur), img = nearest(i);
    if (!img || (shown === i && shownSet === set)) return;
    const ir = img.naturalWidth / img.naturalHeight, cr = W / H;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (ir > cr) { sw = sh * cr; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / cr; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    shown = i; shownSet = set; canvas.classList.add('ready');
  }

  // ---- scroll -> frame. BOUNDS has one entry per chapter start plus the final frame ----
  let tops = [], vh = innerHeight, total = 1, cur = 0, target = 0, raf = 0, last = 0, lastChapter = -1;
  function measure() {
    vh = innerHeight; tops = chapters.map((c) => c.offsetTop);
    const end = $('.footer').offsetTop - vh;
    tops.push(Math.max(tops[N - 1] + 1, end)); total = Math.max(1, end);
  }
  function frameFor(y) {
    let k = 0; while (k < N - 1 && y >= tops[k + 1]) k++;
    const a = tops[k], b = tops[k + 1];
    return BOUNDS[k] + clamp((y - a) / Math.max(1, b - a)) * (BOUNDS[k + 1] - BOUNDS[k]);
  }
  function ui(y) {
    let c = 0; while (c < N - 1 && y + vh * 0.35 >= tops[c + 1]) c++;
    if (c !== lastChapter) {
      lastChapter = c;
      all('.chapter-nav a').forEach((a, i) => a.setAttribute('aria-current', String(i === c)));
      $('#chapter-number').textContent = String(c + 1).padStart(2, '0') + ' / ' + String(N).padStart(2, '0');
      $('#chapter-label').textContent = labels[c];
    }
    $('#progress').style.transform = 'scaleX(' + clamp(y / total) + ')';
    copies.forEach((el, i) => {
      const rel = (y - tops[i]) / vh, inn = clamp((rel + 0.55) / 0.35);
      const out = i === N - 1 ? 1 : 1 - clamp((rel - (chapters[i].offsetHeight / vh - 1)) / 0.4);
      el.style.opacity = reduced.matches ? '1' : String(inn * out);
      el.inert = inn * out < 0.05;
    });
  }
  function tick(now) {
    const dt = last ? Math.min(now - last, 50) : 16.7; last = now;
    const y = scrollY; target = frameFor(y); ui(y);
    cur = reduced.matches ? target : cur + (target - cur) * (1 - Math.exp(-dt / TAU));
    if (Math.abs(cur - target) < 0.08) cur = target;
    const want = Math.round(cur), dir = target >= cur ? 1 : -1;
    for (let j = 0; j < 10; j++) { const n = want + j * dir; if (n >= 0 && n < FRAMES) request(n); }
    draw();
    if (Math.abs(cur - target) > 0.08) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', () => { measure(); resize(); schedule(); }, {passive: true});
  all('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const el = $(a.getAttribute('href')); if (!el) return; e.preventDefault();
    el.scrollIntoView({behavior: reduced.matches ? 'instant' : 'smooth', block: 'start'});
    history.replaceState(null, '', a.getAttribute('href'));
  }));

  // ---- concept shop (no payment) ----
  const S = CFG.shop;
  if (S) {
    const key = S.storage_key || 'wf-bag', bag = $('#bag');
    let v = 0, items = {};
    try { const s = JSON.parse(localStorage.getItem(key) || '{}'); for (const k in s) if (S.variants[k] && Number.isInteger(s[k]) && s[k] > 0) items[k] = Math.min(s[k], 20); } catch (_) {}
    const U = Object.assign({open: 'Open your bag', items: ' items', added: 'added', limit: 'Limit reached for this option', total: 'Total'}, S.ui || {});
    const money = (n) => S.currency + n;
    const persist = () => { try { localStorage.setItem(key, JSON.stringify(items)); } catch (_) {} renderBag(); };
    function renderBag() {
      const count = Object.values(items).reduce((a, b) => a + b, 0);
      $('.bag-count').textContent = count || '';
      $('.bag-toggle').setAttribute('aria-label', U.open + (count ? ', ' + count + U.items : ''));
      if (!count) { $('#bag-content').innerHTML = `<p class="bag-empty">${S.empty_text || 'Your bag is empty.'}</p>`; return; }
      let sum = 0;
      $('#bag-content').innerHTML = Object.entries(items).map(([k, n]) => {
        const it = S.variants[k]; sum += it.price * n;
        return `<div class="bag-item"><div class="thumb">${S.name.charAt(0)}</div><div><h3>${S.name}</h3><p>${it.label}</p><span>${money(it.price)}</span>` +
          `<div class="qty"><button data-change="-1" data-k="${k}" aria-label="Remove one">−</button><span>${n}</span><button data-change="1" data-k="${k}" aria-label="Add one">+</button></div></div></div>`;
      }).join('') + `<div class="bag-total"><span>${U.total}</span><span>${money(sum)}</span></div>`;
    }
    function pick(i) {
      v = i; all('.size').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.variant) === i)));
      $('#price').textContent = money(S.variants[i].price); $('#button-price').textContent = money(S.variants[i].price);
    }
    all('.size').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.variant))));
    let tt;
    const openBag = () => { renderBag(); if (!bag.open) { bag.showModal(); document.body.style.overflow = 'hidden';
      if (!reduced.matches) bag.animate([{transform: 'translateX(100%)', opacity: 0.4}, {transform: 'none', opacity: 1}], {duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)'}); } };
    const closeBag = () => { bag.close(); document.body.style.overflow = ''; };
    $('#add').addEventListener('click', () => {
      const had = items[v] || 0; items[v] = Math.min(20, had + 1); persist();
      const t = $('.toast'); t.textContent = had < 20 ? `${S.name} · ${S.variants[v].label} ${U.added}` : U.limit;
      t.classList.add('visible'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('visible'), 2200);
      setTimeout(openBag, reduced.matches ? 0 : 450);
    });
    $('.bag-toggle').addEventListener('click', openBag);
    $('.close').addEventListener('click', closeBag); $('#continue').addEventListener('click', closeBag);
    bag.addEventListener('cancel', (e) => { e.preventDefault(); closeBag(); });
    bag.addEventListener('click', (e) => { if (e.target === bag && e.clientX < bag.getBoundingClientRect().left) closeBag(); });
    $('#bag-content').addEventListener('click', (e) => {
      const b = e.target.closest('[data-change]'); if (!b) return;
      const k = b.dataset.k; items[k] = clamp((items[k] || 0) + Number(b.dataset.change), 0, 20); if (!items[k]) delete items[k]; persist();
    });
    renderBag();
  }

  measure(); buildQueue(); resize(); request(0); pump(); schedule();
  window.__film = {get frame() { return Math.round(cur); }, get loaded() { return store[set].size; }, FRAMES};
})();
