/* SWYP — app shell: screens, sheets, tools, history, saving, preview and export. */
(function () {
  'use strict';
  const R = window.Render, S = window.Store;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const W = R.SLIDE_W;
  const MAX_SLIDES = 20;
  const MAX_PHOTO = 2560;

  const PALETTE = ['#FFFFFF', '#F5F1EA', '#E8E1D6', '#CFC5B8', '#9C9CA9', '#55555F', '#2A2A30', '#111116',
    '#A55CFF', '#2DB6F7', '#4C6FFF', '#7ED6B0', '#3E5B47', '#F2D06B', '#F5A15B', '#F06A6A', '#E46FB0', '#F7C9D4',
    '#1E3550', '#7A4E3B', '#C9A27E'];
  const GRADIENTS = [['#A55CFF', '#2DB6F7'], ['#F7F3EE', '#E5DCCF'], ['#FDE2E4', '#DCE8F8'], ['#E0C3FC', '#8EC5FC'],
    ['#FFDEE9', '#B5FFFC'], ['#F6D365', '#FDA085'], ['#FBD786', '#F7797D'], ['#C9D6FF', '#F2F2F2'],
    ['#D4FC79', '#96E6A1'], ['#1F2A44', '#4B6A88'], ['#0F2027', '#2C5364'], ['#232526', '#5A5D63']];

  const Native = {
    get bridge() { return window.SwypAndroid || null; },
    setTheme(dark) { try { this.bridge && this.bridge.setDarkTheme(!!dark); } catch (e) { /* ignore */ } },
    shareFile(b64, name, mime) {
      try { const r = this.bridge.shareFile(b64, name, mime); return r === 'ok' ? Promise.resolve() : Promise.reject(new Error(r || 'Could not share')); }
      catch (e) { return Promise.reject(e); }
    },
    saveImage(b64, name, mime, order) {
      return new Promise((resolve, reject) => {
        try {
          const r = this.bridge.saveImage(b64, name, mime, order);
          if (r === 'ok') resolve(); else reject(new Error(r || 'Could not save'));
        } catch (e) { reject(e); }
      });
    }
  };

  /* ---------- state ---------- */
  let P = null;               // current project
  let assets = new Map();     // assetId -> ImageBitmap
  let stage = null;
  let hist = { stack: [], i: 0 };
  let saveTimer = null;
  let ctxTool = null;         // open tray in the contextual bar
  let screen = 'home';

  /* ---------- helpers ---------- */
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  function hydrateIcons(root) { $$('[data-icon]', root).forEach((n) => { if (!n.querySelector('svg')) n.insertAdjacentHTML('afterbegin', icon(n.dataset.icon)); }); }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    const n = parseInt(m[1], 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const inkFor = (bgHex) => luminance(bgHex) < 0.35 ? '#FFFFFF' : '#111116';
  const H = () => R.FORMATS[P.format].h;
  const curSlide = () => stage.currentSlide();
  const slug = (s) => (s || 'swyp').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'swyp';

  /* ---------- theme ---------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const pref = S.pref('theme', 'light');
    const dark = pref === 'dark' || (pref === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    Native.setTheme(dark);
    if (stage) stage.invalidate();
    if (typeof templatesDrawn !== 'undefined' && templatesDrawn) renderTemplates();
  }
  mq.addEventListener && mq.addEventListener('change', applyTheme);

  /* ---------- screens ---------- */
  function show(name) {
    screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === name));
  }

  /* ---------- sheets ---------- */
  let sheetClose = null;
  function openSheet(build, onClose) {
    const body = $('#sheet-body');
    body.innerHTML = '';
    build(body);
    hydrateIcons(body);
    sheetClose = onClose || null;
    $('#scrim').hidden = false; $('#sheet').hidden = false;
    requestAnimationFrame(() => { $('#scrim').classList.add('show'); $('#sheet').classList.add('show'); });
  }
  function closeSheet() {
    if ($('#sheet').hidden) return false;
    $('#scrim').classList.remove('show'); $('#sheet').classList.remove('show');
    const cb = sheetClose; sheetClose = null;
    setTimeout(() => { $('#scrim').hidden = true; $('#sheet').hidden = true; }, 280);
    if (cb) cb();
    return true;
  }
  const sheetOpen = () => !$('#sheet').hidden && $('#sheet').classList.contains('show');

  /* Swipe the sheet down to dismiss. */
  (function sheetDrag() {
    const sheet = $('#sheet'); let y0 = null, dy = 0;
    const grip = (e) => e.target.closest('.sheet-grip') || ($('#sheet-body').scrollTop <= 0 && e.target.closest('.sheet h3, .sheet .sub'));
    sheet.addEventListener('touchstart', (e) => { if (grip(e)) { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; } }, { passive: true });
    sheet.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sheet.addEventListener('touchend', () => { if (y0 == null) return; sheet.style.transition = ''; sheet.style.transform = ''; y0 = null; if (dy > 90) closeSheet(); });
  })();

  /* ---------- home ---------- */
  let templatesDrawn = false;
  async function renderHome() {
    if (!templatesDrawn) { templatesDrawn = true; preloadFonts().then(renderTemplates); }
    let list = [];
    try { list = await S.listProjects(); } catch (e) { toast('Storage is unavailable, so projects will not be kept'); }
    const wrap = $('#projects'); wrap.innerHTML = '';
    $('#empty').hidden = list.length > 0;
    $('#proj-count').textContent = list.length ? String(list.length) : '';
    list.forEach((p) => {
      const card = h('div', { class: 'project' }, [
        h('button', { class: 'project-open', onclick: () => openProject(p.id) }, [
          h('div', { class: 'project-thumb' }, [p.thumb ? h('img', { src: p.thumb, alt: '' }) : null]),
          h('div', { class: 'project-info' }, [
            h('strong', { text: p.name }),
            h('small', { text: `${p.slides} slide${p.slides > 1 ? 's' : ''} · ${p.format} · ${ago(p.updatedAt)}` })
          ])
        ]),
        h('button', { class: 'icon-btn project-more', 'aria-label': 'Project options', 'data-icon': 'more', onclick: (e) => { e.stopPropagation(); projectMenu(p); } })
      ]);
      wrap.append(card);
    });
    hydrateIcons(wrap);
  }

  function projectMenu(p) {
    openSheet((b) => {
      b.append(h('h3', { text: p.name }), h('p', { class: 'sub', text: `${p.slides} slides · ${p.format}` }),
        h('div', { class: 'menu' }, [
          h('button', { onclick: () => { closeSheet(); openProject(p.id); } }, [h('span', { 'data-icon': 'edit' }), 'Open']),
          h('button', { onclick: () => { closeSheet(); setTimeout(() => renameSheet(p.name, async (n) => { const full = await S.getProject(p.id); full.name = n; await S.saveProject(full); renderHome(); }), 300); } }, [h('span', { 'data-icon': 'rename' }), 'Rename']),
          h('button', { onclick: () => { closeSheet(); exportProjectFile(p.id); } }, [h('span', { 'data-icon': 'share' }), 'Share project file']),
          h('button', { onclick: async () => { const full = await S.getProject(p.id); const c = JSON.parse(JSON.stringify(full)); c.id = S.uid('p'); c.name = full.name + ' copy'; c.updatedAt = Date.now(); await S.saveProject(c); closeSheet(); renderHome(); toast('Duplicated'); } }, [h('span', { 'data-icon': 'copy' }), 'Duplicate']),
          h('button', { class: 'danger', onclick: () => { closeSheet(); setTimeout(() => confirmSheet('Delete this project?', 'Photos you added stay in your gallery. This only removes the design from SWYP.', 'Delete', async () => { await S.deleteProject(p.id); renderHome(); toast('Project deleted'); }), 300); } }, [h('span', { 'data-icon': 'trash' }), 'Delete'])
        ]));
    });
  }

  function confirmSheet(title, sub, okLabel, onOk) {
    openSheet((b) => {
      b.append(h('h3', { text: title }), h('p', { class: 'sub', text: sub }),
        h('div', { class: 'sheet-actions' }, [
          h('button', { class: 'btn-ghost', text: 'Cancel', onclick: closeSheet }),
          h('button', { class: 'btn-primary', style: { background: 'var(--danger)', color: '#fff' }, text: okLabel, onclick: () => { closeSheet(); onOk(); } })
        ]));
    });
  }

  function renameSheet(current, onSave) {
    openSheet((b) => {
      const input = h('input', { class: 'input', value: current, maxlength: 60, 'aria-label': 'Project name' });
      const save = () => { const v = input.value.trim(); if (v) onSave(v); closeSheet(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      b.append(h('h3', { text: 'Rename' }), h('p', { class: 'sub', text: 'Also used for the file names when you save.' }), input,
        h('div', { class: 'sheet-actions' }, [h('button', { class: 'btn-ghost', text: 'Cancel', onclick: closeSheet }), h('button', { class: 'btn-primary', text: 'Save', onclick: save })]));
      setTimeout(() => { input.focus(); input.select(); }, 320);
    });
  }

  function settingsSheet() {
    openSheet((b) => {
      const pref = S.pref('theme', 'light');
      const seg = h('div', { class: 'seg' });
      [['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'phone', 'System']].forEach(([k, ic, label]) => {
        seg.append(h('button', { class: pref === k ? 'on' : '', onclick: (e) => { S.setPref('theme', k); applyTheme(); $$('button', seg).forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } }, [h('span', { 'data-icon': ic }), label]));
      });
      b.append(h('h3', { text: 'Settings' }), h('div', { class: 'label', text: 'Appearance' }), seg,
        h('div', { class: 'label', text: 'Help' }),
        h('button', { class: 'btn-ghost block', onclick: () => { closeSheet(); setTimeout(() => tipsSheet(), 320); } }, [h('span', { 'data-icon': 'info' }), 'Show editor tips']),
        h('div', { class: 'about' }, [h('img', { src: 'img/icon.png', alt: '' }), h('div', {}, [h('b', { text: 'SWYP' }),
          'Free, with no accounts, ads or watermark. Your projects and photos stay on this phone. Version 1.1.1'])]));
    });
  }

  /* ---------- new project ---------- */
  function newProjectSheet() {
    let fmt = S.pref('lastFormat', '4:5'), n = S.pref('lastSlides', 5);
    openSheet((b) => {
      const formats = h('div', { class: 'formats' });
      const drawStrip = () => {
        strip.innerHTML = '';
        const hh = 46, ww = hh * W / R.FORMATS[fmt].h;
        const show = Math.min(n, 12);
        for (let i = 0; i < show; i++) strip.append(h('i', { style: { width: ww + 'px', backgroundSize: (show * 100) + '% 100%', backgroundPosition: (show > 1 ? (i / (show - 1)) * 100 : 0) + '% 0' } }));
        val.innerHTML = `<b>${n}</b><small>${n === 1 ? 'slide' : 'slides'} · ${W} × ${R.FORMATS[fmt].h}</small>`;
        minus.disabled = n <= 1; plus.disabled = n >= MAX_SLIDES;
      };
      Object.entries(R.FORMATS).forEach(([k, f]) => {
        const ratio = W / f.h;
        const btn = h('button', { class: 'format' + (k === fmt ? ' on' : ''), onclick: () => { fmt = k; $$('.format', formats).forEach((x) => x.classList.remove('on')); btn.classList.add('on'); drawStrip(); } },
          [h('i', { style: { width: 30 * ratio + 'px', height: '30px' } }), h('b', { text: k }), f.label]);
        formats.append(btn);
      });
      const minus = h('button', { 'aria-label': 'Fewer slides', 'data-icon': 'minus', onclick: () => { n = clamp(n - 1, 1, MAX_SLIDES); drawStrip(); } });
      const plus = h('button', { 'aria-label': 'More slides', 'data-icon': 'plus', onclick: () => { n = clamp(n + 1, 1, MAX_SLIDES); drawStrip(); } });
      const val = h('div', { class: 'val' });
      const strip = h('div', { class: 'strip-preview' });
      b.append(h('h3', { text: 'New carousel' }), h('p', { class: 'sub', text: 'Pick a shape and how many slides. You can change both later.' }),
        h('div', { class: 'label', text: 'Format' }), formats,
        h('div', { class: 'label', text: 'Slides' }), h('div', { class: 'stepper' }, [minus, val, plus]), strip,
        h('div', { class: 'sheet-actions' }, [h('button', { class: 'btn-primary block', text: 'Start designing', onclick: async () => {
          S.setPref('lastFormat', fmt); S.setPref('lastSlides', n);
          const count = (await S.listProjects()).length;
          const p = { id: S.uid('p'), name: 'Carousel ' + (count + 1), format: fmt, slides: n, bg: { type: 'solid', colors: ['#FFFFFF'], angle: 90 }, elements: [], createdAt: Date.now(), updatedAt: Date.now() };
          await S.saveProject(p);
          closeSheet();
          openProject(p.id);
        } })]));
      drawStrip();
    });
  }

  /* ---------- open / load ---------- */
  async function loadAsset(id) {
    if (assets.has(id)) return assets.get(id);
    const a = await S.getAsset(id);
    if (!a) return null;
    const bmp = await createImageBitmap(a.blob);
    assets.set(id, bmp);
    return bmp;
  }
  let fontsPromise = null;
  function preloadFonts() {
    if (!fontsPromise) {
      const jobs = [];
      R.FONTS.forEach((f) => f.weights.forEach((w) => { jobs.push(document.fonts.load(`${w} 40px ${f.family}`)); jobs.push(document.fonts.load(`italic ${w} 40px ${f.family}`)); }));
      fontsPromise = Promise.all(jobs.map((j) => j.catch(() => null)));
    }
    return fontsPromise;
  }
  async function openProject(id) {
    const p = await S.getProject(id);
    if (!p) return;
    await preloadFonts();
    P = p;
    P.elements.forEach((e) => { if (e.type === 'text') R.fitText(e); });
    assets = new Map();
    await Promise.all(P.elements.filter((e) => e.src).map((e) => loadAsset(e.src).catch(() => null)));
    show('editor');
    await document.fonts.ready;
    stage.setProject(P, assets);
    hist = { stack: [snapshot()], i: 0 };
    closeCtx();
    updateTop();
    updateNav();
    if (!S.pref('tipsSeen', false)) setTimeout(() => { S.setPref('tipsSeen', true); tipsSheet(); }, 450);
  }
  async function leaveEditor() {
    await saveNow();
    P = null;
    show('home');
    renderHome();
  }

  /* ---------- history & saving ---------- */
  function snapshot() { return JSON.stringify({ format: P.format, slides: P.slides, bg: P.bg, elements: P.elements }); }
  function commit() {
    if (!P) return;
    const s = snapshot();
    if (s === hist.stack[hist.i]) return;
    hist.stack = hist.stack.slice(0, hist.i + 1);
    hist.stack.push(s);
    if (hist.stack.length > 80) hist.stack.shift();
    hist.i = hist.stack.length - 1;
    updateTop();
    scheduleSave();
  }
  function restore(s) {
    const o = JSON.parse(s);
    const fmtChanged = o.format !== P.format || o.slides !== P.slides;
    Object.assign(P, o);
    if (stage.sel && !P.elements.find((e) => e.id === stage.sel)) stage.select(null);
    if (fmtChanged) stage.fit(Math.min(curSlide(), P.slides - 1));
    stage.invalidate();
    refreshCtx();
    updateTop(); updateNav();
    scheduleSave();
  }
  function undo() { if (hist.i > 0) { hist.i--; restore(hist.stack[hist.i]); } }
  function redo() { if (hist.i < hist.stack.length - 1) { hist.i++; restore(hist.stack[hist.i]); } }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (!P) return;
    P.updatedAt = Date.now();
    try { P.thumb = makeThumb(); } catch (e) { /* ignore */ }
    await S.saveProject(JSON.parse(JSON.stringify(P)));
  }
  function makeThumb() {
    const th = 220, sc = th / H();
    const c = document.createElement('canvas');
    c.width = Math.round(W * P.slides * sc); c.height = th;
    const ctx = c.getContext('2d');
    ctx.scale(sc, sc);
    R.drawScene(ctx, P, assets, { export: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 1; i < P.slides; i++) ctx.fillRect(Math.round(i * W * sc) - 1, 0, 2, th);
    return c.toDataURL('image/jpeg', 0.78);
  }

  function updateTop() {
    if (!P) return;
    $('#ed-name').textContent = P.name;
    $('#ed-meta').textContent = `${P.slides} slide${P.slides > 1 ? 's' : ''} · ${P.format}`;
    $('#ed-undo').disabled = hist.i <= 0;
    $('#ed-redo').disabled = hist.i >= hist.stack.length - 1;
  }
  function updateNav() {
    if (!P) return;
    const c = curSlide();
    $('#nav-count').textContent = `${c + 1} / ${P.slides}`;
    $('#nav-prev').disabled = c <= 0;
    $('#nav-next').disabled = c >= P.slides - 1;
  }

  /* ---------- adding things ---------- */
  function addElement(el, atIndex) {
    if (atIndex != null) P.elements.splice(atIndex, 0, el); else P.elements.push(el);
    stage.select(el.id);
    stage.invalidate();
    commit();
    return el;
  }
  function baseEl(type, extra) {
    return Object.assign({ id: S.uid('e'), type, x: curSlide() * W + W / 2, y: H() / 2, w: 400, h: 400, rot: 0, opacity: 1 }, extra);
  }

  function pickFiles(multiple) {
    return new Promise((resolve) => {
      const input = $('#file-input');
      input.multiple = !!multiple;
      input.value = '';
      const done = () => { input.removeEventListener('change', done); resolve([...input.files]); };
      input.addEventListener('change', done);
      input.click();
    });
  }
  async function importFile(file) {
    const src = await createImageBitmap(file);
    const sc = Math.min(1, MAX_PHOTO / Math.max(src.width, src.height));
    const w = Math.round(src.width * sc), hh = Math.round(src.height * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, w, hh);
    src.close && src.close();
    const keepAlpha = /png|webp|gif/.test(file.type);
    const blob = await new Promise((r) => c.toBlob(r, keepAlpha ? 'image/png' : 'image/jpeg', 0.92));
    const id = S.uid('a');
    await S.putAsset(id, blob, w, hh);
    const bmp = await createImageBitmap(c);
    assets.set(id, bmp);
    return { id, w, h: hh };
  }
  async function importMany(files) {
    if (!files.length) return [];
    toast(files.length > 1 ? `Adding ${files.length} photos…` : 'Adding photo…');
    const out = [];
    for (const f of files) { try { out.push(await importFile(f)); } catch (e) { toast('One photo could not be opened'); } }
    return out;
  }
  function ensureSlides(n) {
    n = Math.min(MAX_SLIDES, n);
    if (n > P.slides) { P.slides = n; stage.invalidate(); updateTop(); updateNav(); }
  }

  async function addPhotos(mode) {
    closeSheet();
    const files = await pickFiles(mode !== 'panorama');
    const imgs = await importMany(files);
    if (!imgs.length) return;
    const Hh = H();
    const start = curSlide();
    if (mode === 'panorama') {
      const a = imgs[0];
      const el = baseEl('image', { src: a.id, x: W * P.slides / 2, y: Hh / 2, w: W * P.slides, h: Hh, zoom: 1, panX: 0, panY: 0, radius: 0, filter: 'none' });
      addElement(el, 0);
      toast('Panorama placed across all slides');
    } else if (mode === 'each') {
      ensureSlides(start + imgs.length);
      let last;
      imgs.forEach((a, i) => {
        const s = start + i; if (s >= MAX_SLIDES) return;
        last = baseEl('image', { src: a.id, x: s * W + W / 2, y: Hh / 2, w: W, h: Hh, zoom: 1, panX: 0, panY: 0, radius: 0, filter: 'none' });
        P.elements.splice(0, 0, last);
      });
      stage.select(last.id); commit(); stage.invalidate();
      if (start + imgs.length > MAX_SLIDES) toast('Carousels hold up to 20 slides');
    } else {
      ensureSlides(start + imgs.length);
      let last;
      imgs.forEach((a, i) => {
        const s = start + i; if (s >= MAX_SLIDES) return;
        const fit = Math.min((W * 0.74) / a.w, (Hh * 0.74) / a.h);
        last = baseEl('image', { src: a.id, x: s * W + W / 2, y: Hh / 2, w: a.w * fit, h: a.h * fit, zoom: 1, panX: 0, panY: 0, radius: 0, filter: 'none' });
        P.elements.push(last);
      });
      stage.select(last.id); commit(); stage.invalidate();
    }
  }
  async function fillPlaceholder(el) {
    const files = await pickFiles(false);
    const [a] = await importMany(files);
    if (!a) return;
    el.src = a.id; el.zoom = 1; el.panX = 0; el.panY = 0;
    stage.invalidate(); commit(); refreshCtx();
  }

  function photosSheet() {
    openSheet((b) => {
      b.append(h('h3', { text: 'Add photos' }), h('p', { class: 'sub', text: 'Starts on the slide you are looking at.' }),
        h('div', { class: 'options' }, [
          h('button', { class: 'option feature', onclick: () => addPhotos('panorama') }, [h('span', { class: 'oi', 'data-icon': 'panorama' }),
            h('span', {}, [h('strong', { text: 'Panorama across all slides' }), h('small', { text: 'One photo stretched over the whole carousel' })])]),
          h('button', { class: 'option', onclick: () => addPhotos('each') }, [h('span', { class: 'oi', 'data-icon': 'spread' }),
            h('span', {}, [h('strong', { text: 'One photo per slide' }), h('small', { text: 'Pick several, each fills a slide edge to edge' })])]),
          h('button', { class: 'option', onclick: () => addPhotos('single') }, [h('span', { class: 'oi', 'data-icon': 'single' }),
            h('span', {}, [h('strong', { text: 'Place photos' }), h('small', { text: 'Free photos you can move, crop and overlap' })])])
        ]));
    });
  }

  const TEXT_PRESETS = [
    { label: 'Heading', text: 'Big moments', font: 'inter', weight: 700, size: 128, tracking: -3, leading: 1.05 },
    { label: 'Elegant title', text: 'Golden hour', font: 'lora', weight: 400, italic: true, size: 132, tracking: -1, leading: 1.05 },
    { label: 'Subheading', text: 'A weekend in the city', font: 'inter', weight: 500, size: 60, tracking: -1, leading: 1.15 },
    { label: 'Body', text: 'Write something\nworth swiping for.', font: 'inter', weight: 400, size: 44, tracking: 0, leading: 1.4 },
    { label: 'Label', text: 'NEW COLLECTION', font: 'inter', weight: 600, size: 34, tracking: 22, leading: 1.2 },
    { label: 'Script', text: 'with love', font: 'chorus', weight: 400, size: 150, tracking: 0, leading: 1.1 },
    { label: 'Rounded', text: 'Hello, summer', font: 'poppins', weight: 500, size: 90, tracking: -1, leading: 1.1 },
    { label: 'Typewriter', text: 'day 01 — manila', font: 'mono', weight: 400, size: 46, tracking: 2, leading: 1.3 }
  ];
  function textSheet() {
    openSheet((b) => {
      const list = h('div', { class: 'presets' });
      TEXT_PRESETS.forEach((t) => {
        const f = R.fontById(t.font);
        list.append(h('button', { class: 'preset', style: { fontFamily: f.family + ', sans-serif', fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal',
          fontSize: Math.min(30, Math.max(15, t.size * 0.24)) + 'px', letterSpacing: (t.tracking / 100) + 'em' }, text: t.label === 'Body' ? 'Body text' : t.text.split('\n')[0],
        onclick: () => {
          closeSheet();
          const bgc = P.bg.colors[0];
          const el = baseEl('text', { text: t.text, font: t.font, weight: t.weight, italic: !!t.italic, size: t.size, tracking: t.tracking, leading: t.leading, align: 'center', color: inkFor(bgc), bg: null });
          R.fitText(el);
          addElement(el);
          setTimeout(() => editTextSheet(el, true), 320);
        } }));
      });
      b.append(h('h3', { text: 'Add text' }), h('p', { class: 'sub', text: 'Pick a style. You can change everything after.' }), list);
    });
  }
  function editTextSheet(el, isNew) {
    const before = el.text;
    openSheet((b) => {
      const ta = h('textarea', { class: 'text-area', rows: 3, 'aria-label': 'Text' });
      ta.value = el.text;
      ta.addEventListener('input', () => { el.text = ta.value || ' '; R.fitText(el); stage.invalidate(); });
      b.append(h('h3', { text: isNew ? 'Type your text' : 'Edit text' }), h('p', { class: 'sub', text: 'Press return for a new line.' }), ta,
        h('div', { class: 'sheet-actions' }, [h('button', { class: 'btn-primary block', text: 'Done', onclick: closeSheet })]));
      setTimeout(() => { ta.focus(); if (isNew) ta.select(); }, 320);
    }, () => {
      if (!el.text.trim()) { el.text = before.trim() ? before : 'Text'; R.fitText(el); }
      stage.invalidate(); commit();
    });
  }

  const SHAPES = [
    { id: 'rect', label: 'Square', w: 360, h: 360, radius: 0, style: { width: '26px', height: '26px' } },
    { id: 'round', shape: 'rect', label: 'Rounded', w: 360, h: 360, radius: 60, style: { width: '26px', height: '26px', borderRadius: '7px' } },
    { id: 'circle', label: 'Circle', w: 360, h: 360, style: { width: '26px', height: '26px', borderRadius: '50%' } },
    { id: 'arch', label: 'Arch', w: 300, h: 420, style: { width: '22px', height: '30px', borderRadius: '11px 11px 0 0' } },
    { id: 'line', label: 'Line', w: 520, h: 6, style: { width: '30px', height: '2.5px' } }
  ];
  function shapesSheet() {
    openSheet((b) => {
      const grid = h('div', { class: 'shape-grid' });
      SHAPES.forEach((s) => grid.append(h('button', { class: 'shape-btn', 'aria-label': s.label, onclick: () => {
        closeSheet();
        const bgc = P.bg.colors[0];
        addElement(baseEl('shape', { shape: s.shape || s.id, w: s.w, h: s.h, radius: s.radius || 0, fill: luminance(bgc) < 0.35 ? '#FFFFFF' : '#111116' }));
      } }, [h('i', { style: s.style })])));
      b.append(h('h3', { text: 'Shapes' }), h('p', { class: 'sub', text: 'Blocks, frames and dividers. Great for spanning a seam.' }), grid);
    });
  }

  /* Layouts: rects in units of one slide (x can go to 2 for two-slide spans). */
  const LAYOUTS = [
    { id: 'bleed', r: [[0, 0, 1, 1]], bleed: true },
    { id: 'one', r: [[0, 0, 1, 1]] },
    { id: 'two-v', r: [[0, 0, .5, 1], [.5, 0, .5, 1]] },
    { id: 'two-h', r: [[0, 0, 1, .5], [0, .5, 1, .5]] },
    { id: 'three-l', r: [[0, 0, .6, 1], [.6, 0, .4, .5], [.6, .5, .4, .5]] },
    { id: 'three-t', r: [[0, 0, 1, .58], [0, .58, .5, .42], [.5, .58, .5, .42]] },
    { id: 'three-c', r: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
    { id: 'four', r: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] },
    { id: 'framed', r: [[.1, .1, .8, .64]], keep: true },
    { id: 'stack', r: [[.12, .06, .76, .42], [.12, .52, .76, .42]], keep: true },
    { id: 'span-center', span: 2, r: [[.3, .16, 1.4, .68]], keep: true },
    { id: 'span-hero', span: 2, r: [[0, 0, 1.25, 1], [1.25, 0, .75, .5], [1.25, .5, .75, .5]] },
    { id: 'span-strip', span: 2, r: [[0, .2, 2, .6]], keep: true, bleedX: true },
    { id: 'span-mosaic', span: 2, r: [[0, 0, .7, .55], [.7, 0, .8, .55], [1.5, 0, .5, 1], [0, .55, 1.5, .45]] }
  ];
  function layoutSVG(L) {
    const span = L.span || 1, vw = 100 * span, vh = 125;
    let s = `<svg viewBox="-2 -2 ${vw + 4} ${vh + 4}" fill="none">`;
    for (let i = 0; i < span; i++) s += `<rect x="${i * 100 + 0.75}" y="0.75" width="98.5" height="${vh - 1.5}" rx="5" fill="var(--surface)" stroke="var(--line-2)" stroke-width="1.5"/>`;
    const pad = L.bleed ? 0 : 7, g = L.bleed ? 0 : 4;
    L.r.forEach(([x, y, w, hh]) => {
      const fx = L.keep ? x * 100 : pad + x * (vw - pad * 2), fy = L.keep ? y * vh : pad + y * (vh - pad * 2);
      const fw = L.keep ? w * 100 : w * (vw - pad * 2), fh = L.keep ? hh * vh : hh * (vh - pad * 2);
      s += `<rect x="${fx + (x > 0 && !L.keep ? g / 2 : 0)}" y="${fy + (y > 0 && !L.keep ? g / 2 : 0)}" width="${fw - (x > 0 && !L.keep ? g / 2 : 0) - (x + w < span - .001 && !L.keep ? g / 2 : 0)}" height="${fh - (y > 0 && !L.keep ? g / 2 : 0) - (y + hh < .999 && !L.keep ? g / 2 : 0)}" rx="3" fill="url(#lg)" opacity=".9"/>`;
    });
    return s.replace('<svg', '<svg').replace('fill="none">', 'fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A55CFF" stop-opacity=".55"/><stop offset="1" stop-color="#2DB6F7" stop-opacity=".55"/></linearGradient></defs>') + '</svg>';
  }
  function applyLayout(L, spacing, rounded) {
    closeSheet();
    const span = L.span || 1;
    if (span > 1) ensureSlides(Math.max(P.slides, 2));
    let start = curSlide();
    if (start + span > P.slides) start = Math.max(0, P.slides - span);
    const Hh = H();
    const [pad, gap] = L.bleed ? [0, 0] : spacing;
    const ox = start * W;
    const innerW = span * W - pad * 2, innerH = Hh - pad * 2;
    let first = null;
    L.r.forEach(([x, y, w, hh]) => {
      let l, t, r, b;
      if (L.keep) {
        l = ox + x * W; r = ox + (x + w) * W; t = y * Hh; b = (y + hh) * Hh;
        if (L.bleedX) { l = ox + x * W; r = ox + (x + w) * W; }
      } else {
        l = ox + pad + (x / span) * innerW; r = ox + pad + ((x + w) / span) * innerW;
        t = pad + y * innerH; b = pad + (y + hh) * innerH;
        if (x > 0.001) l += gap / 2;
        if (x + w < span - 0.001) r -= gap / 2;
        if (y > 0.001) t += gap / 2;
        if (y + hh < 0.999) b -= gap / 2;
      }
      const el = { id: S.uid('e'), type: 'image', src: null, x: (l + r) / 2, y: (t + b) / 2, w: r - l, h: b - t, rot: 0, opacity: 1, zoom: 1, panX: 0, panY: 0, radius: rounded && !L.bleed ? 28 : 0, filter: 'none' };
      P.elements.push(el);
      if (!first) first = el;
    });
    stage.select(null);
    stage.invalidate();
    commit();
    toast('Tap a frame to add a photo');
  }
  function layoutsSheet() {
    let spacing = S.pref('layoutSpacing', 'thin');
    let rounded = S.pref('layoutRounded', false);
    const SP = { none: [0, 0], thin: [36, 18], airy: [90, 40] };
    openSheet((b) => {
      const seg = h('div', { class: 'seg' });
      [['none', 'Edge to edge'], ['thin', 'Thin'], ['airy', 'Airy']].forEach(([k, l]) => seg.append(h('button', { class: k === spacing ? 'on' : '', text: l, onclick: (e) => { spacing = k; S.setPref('layoutSpacing', k); $$('button', seg).forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
      const seg2 = h('div', { class: 'seg' });
      [[false, 'Square corners'], [true, 'Rounded']].forEach(([k, l]) => seg2.append(h('button', { class: k === rounded ? 'on' : '', text: l, onclick: (e) => { rounded = k; S.setPref('layoutRounded', k); $$('button', seg2).forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
      const g1 = h('div', { class: 'grid-layouts' }), g2 = h('div', { class: 'grid-layouts' });
      LAYOUTS.forEach((L) => {
        const btn = h('button', { class: 'lay' + (L.span ? ' wide' : ''), html: layoutSVG(L), 'aria-label': 'Layout ' + L.id, onclick: () => applyLayout(L, SP[spacing], rounded) });
        (L.span ? g2 : g1).append(btn);
      });
      b.append(h('h3', { text: 'Layouts' }), h('p', { class: 'sub', text: 'Adds photo frames to the slide you are on.' }),
        h('div', { class: 'tray-row' }, [seg]), h('div', { class: 'tray-row' }, [seg2]),
        h('div', { class: 'label', text: 'One slide' }), g1, h('div', { class: 'label', text: 'Across two slides' }), g2);
    });
  }

  /* ---------- canvas background ---------- */
  function swatchRow(current, onPick, opts) {
    opts = opts || {};
    const row = h('div', { class: 'swatches' });
    const mark = (btn) => { $$('.sw', row).forEach((x) => x.classList.remove('on')); btn && btn.classList.add('on'); };
    if (opts.none) row.append(h('button', { class: 'sw none' + (!current ? ' on' : ''), 'aria-label': 'None', onclick: (e) => { mark(e.currentTarget); onPick(null, true); } }));
    const custom = h('label', { class: 'sw custom', 'aria-label': 'Custom color' });
    const inp = h('input', { type: 'color', value: current && /^#[0-9a-f]{6}$/i.test(current) ? current : '#888888' });
    inp.addEventListener('input', () => { mark(custom); onPick(inp.value, false); });
    inp.addEventListener('change', () => onPick(inp.value, true));
    custom.append(inp); row.append(custom);
    PALETTE.forEach((c) => row.append(h('button', { class: 'sw' + (current && current.toUpperCase() === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: (e) => { mark(e.currentTarget); onPick(c, true); } })));
    return row;
  }
  function backgroundSheet() {
    openSheet((b) => {
      const bg = P.bg;
      let mode = bg.type;
      const body = h('div');
      const render = () => {
        body.innerHTML = '';
        if (mode === 'solid') {
          body.append(h('div', { class: 'label', text: 'Color' }), swatchRow(bg.type === 'solid' ? bg.colors[0] : null, (c, done) => {
            P.bg = { type: 'solid', colors: [c], angle: bg.angle || 90 }; stage.invalidate(); if (done) commit();
          }));
        } else {
          const grads = h('div', { class: 'swatches' });
          GRADIENTS.forEach((g) => grads.append(h('button', { class: 'sw grad' + (P.bg.type === 'gradient' && P.bg.colors.join() === g.join() ? ' on' : ''), style: { background: `linear-gradient(90deg, ${g[0]}, ${g[1]})` }, 'aria-label': 'Gradient',
            onclick: (e) => { $$('.sw', grads).forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); P.bg = { type: 'gradient', colors: g.slice(), angle: P.bg.angle == null ? 90 : P.bg.angle }; stage.invalidate(); commit(); syncPickers(); } })));
          const c1 = h('input', { type: 'color' }), c2 = h('input', { type: 'color' });
          const syncPickers = () => { c1.value = P.bg.type === 'gradient' ? P.bg.colors[0] : '#A55CFF'; c2.value = P.bg.type === 'gradient' ? P.bg.colors[1] : '#2DB6F7'; };
          syncPickers();
          const setG = (done) => { P.bg = { type: 'gradient', colors: [c1.value, c2.value], angle: P.bg.angle == null ? 90 : P.bg.angle }; stage.invalidate(); if (done) commit(); };
          [c1, c2].forEach((c) => { c.addEventListener('input', () => setG(false)); c.addEventListener('change', () => setG(true)); });
          const angle = slider('Direction', 0, 360, 1, P.bg.angle == null ? 90 : P.bg.angle, (v) => { if (P.bg.type !== 'gradient') setG(false); P.bg.angle = v; stage.invalidate(); }, commit, (v) => v + '°');
          body.append(h('div', { class: 'label', text: 'Presets' }), grads,
            h('div', { class: 'tray-row' }, [h('label', { text: 'Colors' }), h('span', { class: 'sw custom', style: { background: 'none' } }, [c1]), h('span', { class: 'sw custom', style: { background: 'none' } }, [c2])]), angle);
          $$('.sw.custom', body).forEach((s, i) => { s.style.background = (i ? c2 : c1).value; (i ? c2 : c1).addEventListener('input', () => { s.style.background = (i ? c2 : c1).value; }); });
          if (P.bg.type !== 'gradient') { P.bg = { type: 'gradient', colors: GRADIENTS[1].slice(), angle: 90 }; stage.invalidate(); commit(); syncPickers(); $$('.sw.custom', body).forEach((s, i) => { s.style.background = (i ? c2 : c1).value; }); }
        }
      };
      const seg = h('div', { class: 'seg' });
      [['solid', 'Solid'], ['gradient', 'Gradient']].forEach(([k, l]) => seg.append(h('button', { class: mode === k ? 'on' : '', text: l, onclick: (e) => {
        mode = k; $$('button', seg).forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on');
        if (k === 'solid' && P.bg.type !== 'solid') { P.bg = { type: 'solid', colors: [P.bg.colors[0]], angle: P.bg.angle }; stage.invalidate(); commit(); }
        render();
      } })));
      b.append(h('h3', { text: 'Canvas' }), h('p', { class: 'sub', text: 'The background runs across every slide, so gradients flow through the seams.' }), seg, body,
        h('div', { class: 'label', text: 'Photo background' }),
        h('button', { class: 'option feature', onclick: () => addPhotos('panorama') }, [h('span', { class: 'oi', 'data-icon': 'panorama' }),
          h('span', {}, [h('strong', { text: 'Panorama across all slides' }), h('small', { text: 'Use one photo as the whole background' })])]));
      render();
    });
  }

  /* ---------- slides ---------- */
  function _unusedSetSlideCount(n) {
    n = clamp(n, 1, MAX_SLIDES);
    if (n === P.slides) return;
    const cut = n * W;
    const before = P.elements.length;
    if (n < P.slides) P.elements = P.elements.filter((e) => e.x - Math.abs(e.w) / 2 < cut - 1);
    const removed = before - P.elements.length;
    P.slides = n;
    if (stage.sel && !P.elements.find((e) => e.id === stage.sel)) stage.select(null);
    stage.fit(Math.min(curSlide(), n - 1));
    commit(); updateTop(); updateNav();
    if (removed) toast(`Removed ${removed} item${removed > 1 ? 's' : ''} on the last slide`);
  }
  function setFormat(fmt) {
    if (fmt === P.format) return;
    const k = R.FORMATS[fmt].h / H();
    P.elements.forEach((e) => {
      e.y *= k;
      if (e.type === 'image' && Math.abs(e.h - H()) < 2) e.h = R.FORMATS[fmt].h; // full-height photos stay full height
    });
    P.format = fmt;
    stage.fit(curSlide());
    commit(); updateTop();
  }
  /* Slide operations. An element "belongs" to a slide when it sits fully inside it. */
  const leftOf = (e) => e.x - Math.abs(e.w) / 2, rightOf = (e) => e.x + Math.abs(e.w) / 2;
  const within = (e, i) => leftOf(e) >= i * W - 1 && rightOf(e) <= (i + 1) * W + 1;
  const isWide = (e) => e.type !== 'text' && Math.abs(e.w) >= W * 2 - 2;
  function insertSlide(at) {
    if (P.slides >= MAX_SLIDES) { toast('Carousels hold up to 20 slides'); return false; }
    const b = at * W;
    P.elements.forEach((e) => {
      if (leftOf(e) >= b - 1) e.x += W;
      else if (isWide(e) && rightOf(e) > b + 1) { e.w += W; e.x += W / 2; }  // panoramas grow with the carousel
      else if (e.x >= b) e.x += W;
    });
    P.slides++;
    return true;
  }
  function deleteSlide(i) {
    if (P.slides <= 1) return false;
    const a = i * W, b = (i + 1) * W;
    P.elements = P.elements.filter((e) => !within(e, i));
    P.elements.forEach((e) => {
      if (leftOf(e) >= b - 1) e.x -= W;
      else if (isWide(e) && leftOf(e) <= a + 1 && rightOf(e) >= b - 1) { e.w -= W; e.x -= W / 2; }
      else if (e.x >= b) e.x -= W;
    });
    P.slides--;
    return true;
  }
  function duplicateSlide(i) {
    const originals = P.elements.filter((e) => within(e, i));
    if (!insertSlide(i + 1)) return false;
    const out = [];
    P.elements.forEach((e) => {
      out.push(e);
      if (originals.includes(e)) { const c = JSON.parse(JSON.stringify(e)); c.id = S.uid('e'); c.x += W; out.push(c); }
    });
    P.elements = out;
    return true;
  }
  function swapSlides(i, j) {
    if (j < 0 || j >= P.slides) return false;
    const A = P.elements.filter((e) => within(e, i)), B = P.elements.filter((e) => within(e, j));
    A.forEach((e) => { e.x += (j - i) * W; });
    B.forEach((e) => { e.x -= (j - i) * W; });
    return true;
  }
  function clearSlide(i) { P.elements = P.elements.filter((e) => !within(e, i)); return true; }

  function setFormat(fmt) {
    if (fmt === P.format) return;
    const k = R.FORMATS[fmt].h / H();
    P.elements.forEach((e) => {
      e.y *= k;
      if (e.type === 'image' && Math.abs(e.h - H()) < 2) e.h = R.FORMATS[fmt].h; // full-height photos stay full height
    });
    P.format = fmt;
    stage.fit(curSlide());
    commit(); updateTop();
  }
  function slidesSheet() {
    let sel = curSlide();
    openSheet((b) => {
      const strip = h('div', { class: 'slide-strip' });
      const actions = h('div', { class: 'slide-actions' });
      const after = (ok, focus, msg) => {
        if (!ok) return;
        sel = clamp(focus, 0, P.slides - 1);
        if (stage.sel && !P.elements.find((e) => e.id === stage.sel)) stage.select(null);
        stage.invalidate(); commit(); updateTop();
        stage.goToSlide(sel); updateNav();
        draw();
        if (msg) toast(msg);
      };
      const draw = () => {
        strip.innerHTML = '';
        for (let i = 0; i < P.slides; i++) {
          const img = R.renderSlide(P, assets, i, 0.1, { export: false, dark: document.documentElement.dataset.theme === 'dark' }).toDataURL('image/jpeg', 0.8);
          strip.append(h('button', { class: 'slide-th' + (i === sel ? ' on' : ''), 'aria-label': 'Slide ' + (i + 1), onclick: () => { sel = i; stage.goToSlide(i); updateNav(); draw(); } }, [h('img', { src: img, alt: '' }), h('span', { text: String(i + 1) })]));
        }
        setTimeout(() => { const on = $('.slide-th.on', strip); on && on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
        actions.innerHTML = '';
        const full = P.slides >= MAX_SLIDES;
        [
          ['insertl', 'Add before', full, () => after(insertSlide(sel), sel)],
          ['insertr', 'Add after', full, () => after(insertSlide(sel + 1), sel + 1)],
          ['copy', 'Duplicate', full, () => after(duplicateSlide(sel), sel + 1, 'Slide duplicated')],
          ['eraser', 'Clear', false, () => after(clearSlide(sel), sel)],
          ['movel', 'Move left', sel === 0, () => after(swapSlides(sel, sel - 1), sel - 1)],
          ['mover', 'Move right', sel === P.slides - 1, () => after(swapSlides(sel, sel + 1), sel + 1)],
          ['overview', 'See all', false, () => { closeSheet(); stage.overview(); updateNav(); }],
          ['trash', 'Delete', P.slides <= 1, () => after(deleteSlide(sel), Math.min(sel, P.slides - 2), 'Slide deleted'), true]
        ].forEach(([ic, label, disabled, fn, danger]) => actions.append(h('button', { class: danger ? 'danger' : '', disabled, onclick: fn }, [h('span', { 'data-icon': ic }), label])));
        hydrateIcons(actions);
        count.textContent = `${P.slides} of ${MAX_SLIDES} slides · tap one to choose it`;
      };
      const count = h('p', { class: 'sub' });
      const formats = h('div', { class: 'formats' });
      Object.entries(R.FORMATS).forEach(([k, f]) => {
        const btn = h('button', { class: 'format' + (k === P.format ? ' on' : ''), onclick: () => { setFormat(k); $$('.format', formats).forEach((x) => x.classList.remove('on')); btn.classList.add('on'); draw(); } },
          [h('i', { style: { width: 30 * W / f.h + 'px', height: '30px' } }), h('b', { text: k }), f.label]);
        formats.append(btn);
      });
      b.append(h('h3', { text: 'Slides' }), count, strip, actions,
        h('p', { class: 'hint', text: 'Things that cross into a neighbouring slide stay where they are. Panoramas stretch or shrink with the carousel.' }),
        h('div', { class: 'label', text: 'Format' }), formats);
      draw();
    });
  }

  /* ---------- layers ---------- */
  function elLabel(e) {
    if (e.type === 'text') return e.text.split('\n')[0].slice(0, 40) || 'Text';
    if (e.type === 'image') return e.src ? 'Photo' : 'Empty frame';
    return { rect: e.radius ? 'Rounded rectangle' : 'Rectangle', circle: 'Circle', line: 'Line', arch: 'Arch' }[e.shape] || 'Shape';
  }
  function slideOf(e) { return clamp(Math.floor(e.x / W), 0, P.slides - 1) + 1; }
  function slidesLabel(e) {
    const a = clamp(Math.floor((e.x - Math.abs(e.w) / 2 + 1) / W), 0, P.slides - 1) + 1;
    const b = clamp(Math.floor((e.x + Math.abs(e.w) / 2 - 1) / W), 0, P.slides - 1) + 1;
    return a === b ? `Slide ${a}` : `Slides ${a}–${b}`;
  }
  function layerThumb(e) {
    const c = h('canvas', { width: 80, height: 80 });
    const ctx = c.getContext('2d');
    const sc = Math.min(64 / Math.max(e.w, 1), 64 / Math.max(e.h, 1));
    ctx.translate(40, 40); ctx.scale(sc, sc); ctx.translate(-e.x, -e.y);
    R.drawScene(ctx, { ...P, bg: { type: 'none' }, elements: [{ ...e, hidden: false, rot: 0, shadow: false }] }, assets, { dark: document.documentElement.dataset.theme === 'dark' });
    return c;
  }
  function layersSheet() {
    openSheet((b) => {
      const list = h('div', { class: 'layers' });
      const draw = () => {
        list.innerHTML = '';
        if (!P.elements.length) { list.append(h('p', { class: 'sub', text: 'Nothing here yet. Add photos, text or shapes.' })); return; }
        [...P.elements].reverse().forEach((e) => {
          const idx = P.elements.indexOf(e);
          const row = h('div', { class: 'layer' + (e.id === stage.sel ? ' on' : '') + (e.hidden ? ' hiddenL' : '') }, [
            h('div', { class: 'layer-thumb', style: { background: P.bg.type === 'gradient' ? `linear-gradient(135deg, ${P.bg.colors[0]}, ${P.bg.colors[1]})` : P.bg.colors[0] } }, [layerThumb(e)]),
            h('button', { class: 'layer-name', onclick: () => { stage.select(e.id); closeSheet(); stage.goToSlide(slideOf(e) - 1); updateNav(); } }, [elLabel(e), h('small', { text: `${slidesLabel(e)}${e.locked ? ' · locked' : ''}` })]),
            h('button', { class: 'icon-btn', 'aria-label': e.hidden ? 'Show' : 'Hide', 'data-icon': e.hidden ? 'eyeoff' : 'eye', onclick: () => { e.hidden = !e.hidden; stage.invalidate(); commit(); draw(); } }),
            h('button', { class: 'icon-btn', 'aria-label': e.locked ? 'Unlock' : 'Lock', 'data-icon': e.locked ? 'lock' : 'unlock', onclick: () => { e.locked = !e.locked; stage.invalidate(); commit(); draw(); refreshCtx(); } }),
            h('button', { class: 'icon-btn', 'aria-label': 'Move up', 'data-icon': 'up', disabled: idx === P.elements.length - 1, onclick: () => { move(e, 1); draw(); } }),
            h('button', { class: 'icon-btn', 'aria-label': 'Move down', 'data-icon': 'down', disabled: idx === 0, onclick: () => { move(e, -1); draw(); } })
          ]);
          list.append(row);
        });
        hydrateIcons(list);
      };
      b.append(h('h3', { text: 'Layers' }), h('p', { class: 'sub', text: 'Top of the list sits in front.' }), list);
      draw();
    });
  }
  function move(e, dir) {
    const i = P.elements.indexOf(e), j = clamp(i + dir, 0, P.elements.length - 1);
    if (i === j) return;
    P.elements.splice(i, 1); P.elements.splice(j, 0, e);
    stage.invalidate(); commit();
  }

  /* ---------- contextual tools ---------- */
  function slider(label, min, max, step, value, onInput, onDone, fmt) {
    const out = h('output', { text: fmt ? fmt(value) : String(value) });
    const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    const fill = () => inp.style.setProperty('--fill', ((inp.value - min) / (max - min) * 100) + '%');
    fill();
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); out.textContent = fmt ? fmt(v) : String(v); fill(); onInput(v); });
    inp.addEventListener('change', () => onDone && onDone());
    return h('div', { class: 'tray-row' }, [h('label', { text: label }), inp, out]);
  }
  const pct = (v) => Math.round(v * 100) + '%';

  function tray(build) {
    const t = $('#tray');
    t.innerHTML = '';
    if (!build) { t.hidden = true; return; }
    build(t);
    hydrateIcons(t);
    t.hidden = false;
  }
  function closeCtx() {
    ctxTool = null; tray(null);
    $('#ctx').hidden = true; $('#dock').hidden = false;
    $('#crop-hint').hidden = true;
  }
  function refreshCtx() {
    const el = stage && stage.selected;
    if (!el) { closeCtx(); return; }
    $('#ctx').hidden = false; $('#dock').hidden = true;
    const tools = $('#ctx-tools'); tools.innerHTML = '';
    toolsFor(el).forEach((t) => {
      if (t === '|') { tools.append(h('span', { class: 'tool-sep' })); return; }
      tools.append(h('button', { class: 'tool' + (ctxTool === t.id ? ' on' : '') + (t.danger ? ' danger' : ''), onclick: () => {
        if (t.tray) { ctxTool = ctxTool === t.id ? null : t.id; refreshCtx(); }
        else t.run();
      } }, [h('span', { 'data-icon': t.icon }), t.label]));
    });
    hydrateIcons(tools);
    const active = toolsFor(el).find((t) => t !== '|' && t.id === ctxTool && t.tray);
    tray(active ? (b) => active.tray(b, el) : null);
  }
  function setProp(el, k, v, done) {
    el[k] = v;
    if (el.type === 'text') R.fitText(el);
    stage.invalidate();
    if (done) commit();
  }

  function toolsFor(el) {
    const common = [
      { id: 'opacity', icon: 'opacity', label: 'Opacity', tray: (b) => b.append(slider('Opacity', 0.05, 1, 0.01, el.opacity == null ? 1 : el.opacity, (v) => setProp(el, 'opacity', v), commit, pct)) },
      { id: 'shadow', icon: 'shadow', label: el.shadow ? 'Shadow on' : 'Shadow', run: () => { setProp(el, 'shadow', !el.shadow, true); refreshCtx(); } },
      '|',
      { id: 'dup', icon: 'copy', label: 'Duplicate', run: () => { const c = JSON.parse(JSON.stringify(el)); c.id = S.uid('e'); c.x += 40; c.y += 40; c.locked = false; addElement(c, P.elements.indexOf(el) + 1); refreshCtx(); } },
      { id: 'fwd', icon: 'front', label: 'Forward', run: () => move(el, 1) },
      { id: 'bwd', icon: 'backward', label: 'Backward', run: () => move(el, -1) },
      { id: 'lock', icon: el.locked ? 'lock' : 'unlock', label: el.locked ? 'Unlock' : 'Lock', run: () => { setProp(el, 'locked', !el.locked, true); refreshCtx(); } },
      { id: 'del', icon: 'trash', label: 'Delete', danger: true, run: () => { P.elements = P.elements.filter((e) => e.id !== el.id); stage.select(null); stage.invalidate(); commit(); } }
    ];
    if (el.type === 'image') {
      const own = [
        { id: 'replace', icon: 'photo', label: el.src ? 'Replace' : 'Add photo', run: () => fillPlaceholder(el) }
      ];
      if (el.src) own.push(
        { id: 'crop', icon: 'crop', label: 'Crop', tray: (b) => {
          if (!stage.cropMode) stage.setCrop(true);
          b.append(slider('Zoom', 1, 5, 0.01, el.zoom || 1, (v) => setProp(el, 'zoom', v), commit, (v) => v.toFixed(1) + '×'),
            h('div', { class: 'chips' }, [
              h('button', { class: 'chip', onclick: () => { el.zoom = 1; el.panX = 0; el.panY = 0; stage.invalidate(); commit(); refreshCtx(); } }, ['Reset crop']),
              h('button', { class: 'chip', onclick: () => fitFrameToPhoto(el) }, ['Fit frame to photo'])
            ]));
        } },
        { id: 'filters', icon: 'filter', label: 'Filters', tray: (b) => b.append(filterRow(el)) },
        { id: 'adjust', icon: 'adjust', label: 'Adjust', tray: (b) => {
          const setAdj = (k, v) => { el.adj = Object.assign({}, el.adj, { [k]: v }); stage.invalidate(); };
          const a = el.adj || {};
          b.append(
            slider('Brightness', -100, 100, 1, a.brightness || 0, (v) => setAdj('brightness', v), commit, String),
            slider('Contrast', -100, 100, 1, a.contrast || 0, (v) => setAdj('contrast', v), commit, String),
            slider('Saturation', -100, 100, 1, a.saturation || 0, (v) => setAdj('saturation', v), commit, String),
            slider('Warmth', -100, 100, 1, a.warmth || 0, (v) => setAdj('warmth', v), commit, String),
            h('div', { class: 'chips' }, [h('button', { class: 'chip', onclick: () => { el.adj = null; stage.invalidate(); commit(); refreshCtx(); } }, ['Reset adjustments'])]));
        } },
        { id: 'flip', icon: 'flip', label: 'Flip', run: () => setProp(el, 'flipX', !el.flipX, true) }
      );
      own.push({ id: 'frame', icon: 'frame', label: 'Frame', tray: (b) => {
        const chips = h('div', { class: 'chips' });
        R.FRAMES.forEach((f) => chips.append(h('button', { class: 'chip' + ((el.frame || 'none') === f.id ? ' on' : ''), text: f.name, onclick: () => {
          if (f.id !== 'none' && (!el.frame || el.frame === 'none') && !el.shadow) el.shadow = true;
          setProp(el, 'frame', f.id, true); refreshCtx();
        } })));
        b.append(chips);
      } });
      own.push({ id: 'corners', icon: 'corners', label: 'Corners', tray: (b) => b.append(slider('Radius', 0, 0.5, 0.005, (el.radius || 0) / Math.min(el.w, el.h), (v) => setProp(el, 'radius', v * Math.min(el.w, el.h)), commit, pct)) });
      return own.concat(common);
    }
    if (el.type === 'text') {
      const font = R.fontById(el.font);
      return [
        { id: 'edit', icon: 'edit', label: 'Edit', run: () => editTextSheet(el) },
        { id: 'font', icon: 'font', label: 'Font', tray: (b) => {
          const chips = h('div', { class: 'chips' });
          R.FONTS.forEach((f) => chips.append(h('button', { class: 'chip' + (f.id === el.font ? ' on' : ''), style: { fontFamily: f.family + ', sans-serif', fontSize: f.id === 'chorus' ? '19px' : '14px' }, text: f.name,
            onclick: () => { el.font = f.id; if (!f.weights.includes(el.weight)) el.weight = f.weights.reduce((a, w) => Math.abs(w - el.weight) < Math.abs(a - el.weight) ? w : a, f.weights[0]); setProp(el, 'font', f.id, true); refreshCtx(); } })));
          b.append(chips);
          setTimeout(() => { const on = $('.chip.on', chips); on && on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
        } },
        { id: 'size', icon: 'size', label: 'Size', tray: (b) => b.append(slider('Size', 12, 400, 1, Math.round(el.size), (v) => setProp(el, 'size', v), commit, (v) => String(Math.round(v)))) },
        { id: 'color', icon: 'color', label: 'Color', tray: (b) => b.append(swatchRow(el.color, (c, done) => setProp(el, 'color', c, done))) },
        { id: 'style', icon: 'style', label: 'Style', tray: (b) => {
          const names = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 900: 'Black' };
          const wseg = h('div', { class: 'chips' });
          font.weights.forEach((w) => wseg.append(h('button', { class: 'chip' + (el.weight === w ? ' on' : ''), style: { fontWeight: w }, text: names[w] || w, onclick: () => { setProp(el, 'weight', w, true); refreshCtx(); } })));
          wseg.append(h('button', { class: 'chip' + (el.italic ? ' on' : ''), style: { fontStyle: 'italic' }, text: 'Italic', onclick: () => { setProp(el, 'italic', !el.italic, true); refreshCtx(); } }));
          const aseg = h('div', { class: 'seg' });
          [['left', 'alignleft'], ['center', 'aligncenter'], ['right', 'alignright']].forEach(([a, ic]) => aseg.append(h('button', { class: (el.align || 'center') === a ? 'on' : '', 'aria-label': 'Align ' + a, 'data-icon': ic, onclick: () => { setProp(el, 'align', a, true); refreshCtx(); } })));
          b.append(wseg, h('div', { class: 'tray-row' }, [aseg]));
        } },
        { id: 'spacing', icon: 'spacing', label: 'Spacing', tray: (b) => b.append(
          slider('Letters', -10, 40, 0.5, el.tracking || 0, (v) => setProp(el, 'tracking', v), commit, (v) => String(v)),
          slider('Lines', 0.7, 2.4, 0.01, el.leading || 1.2, (v) => setProp(el, 'leading', v), commit, (v) => v.toFixed(2))) },
        { id: 'outline', icon: 'outline', label: 'Outline', tray: (b) => b.append(
          swatchRow(el.outline, (c, done) => setProp(el, 'outline', c, done), { none: true }),
          slider('Thickness', 1, 30, 0.5, el.outlineW == null ? 8 : el.outlineW, (v) => { if (!el.outline) el.outline = '#111116'; setProp(el, 'outlineW', v); }, commit, (v) => String(v))) },
        { id: 'curve', icon: 'curve', label: 'Curve', tray: (b) => b.append(
          slider('Curve', -100, 100, 1, el.curve || 0, (v) => setProp(el, 'curve', Math.abs(v) < 3 ? 0 : v), commit, (v) => String(Math.round(v))),
          h('p', { class: 'hint', text: 'Drag right to arch the text up, left to curve it down. Highlight is hidden while text is curved.' })) },
        { id: 'highlight', icon: 'highlight', label: 'Highlight', tray: (b) => b.append(swatchRow(el.bg, (c, done) => setProp(el, 'bg', c, done), { none: true })) }
      ].concat(common);
    }
    /* shape */
    const own = [{ id: 'fill', icon: 'color', label: 'Color', tray: (b) => b.append(swatchRow(el.fill, (c, done) => setProp(el, 'fill', c, done))) }];
    if (el.shape === 'rect' || !el.shape) own.push({ id: 'corners', icon: 'corners', label: 'Corners', tray: (b) => b.append(slider('Radius', 0, 0.5, 0.005, (el.radius || 0) / Math.min(el.w, el.h), (v) => setProp(el, 'radius', v * Math.min(el.w, el.h)), commit, pct)) });
    return own.concat(common);
  }
  function fitFrameToPhoto(el) {
    const img = assets.get(el.src); if (!img) return;
    const area = el.w * el.h, r = img.width / img.height;
    el.w = Math.sqrt(area * r); el.h = el.w / r; el.zoom = 1; el.panX = 0; el.panY = 0;
    stage.invalidate(); commit(); refreshCtx();
  }
  function filterRow(el) {
    const row = h('div', { class: 'filters' });
    const img = assets.get(el.src);
    R.FILTERS.forEach((f) => {
      const c = h('canvas', { width: 116, height: 116 });
      if (img) {
        const ctx = c.getContext('2d');
        const s = Math.max(116 / img.width, 116 / img.height);
        const css = R.filterCss({ filter: f.id }); if (css !== 'none') ctx.filter = css;
        ctx.drawImage(img, (116 - img.width * s) / 2, (116 - img.height * s) / 2, img.width * s, img.height * s);
      }
      row.append(h('button', { class: 'filter' + ((el.filter || 'none') === f.id ? ' on' : ''), onclick: () => { setProp(el, 'filter', f.id, true); refreshCtx(); } }, [c, f.name]));
    });
    setTimeout(() => { const on = $('.filter.on', row); on && on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
    return row;
  }

  /* ---------- preview ---------- */
  let pvUrls = [];
  async function openPreview() {
    stage.select(null);
    await saveNow();
    pvUrls.forEach((u) => URL.revokeObjectURL(u)); pvUrls = [];
    const track = $('#pv-track'); track.innerHTML = '';
    const dots = $('#pv-dots'); dots.innerHTML = '';
    $('#pv-media').style.aspectRatio = `${W} / ${H()}`;
    show('preview');
    for (let i = 0; i < P.slides; i++) {
      const c = R.renderSlide(P, assets, i, 0.6);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const url = URL.createObjectURL(blob); pvUrls.push(url);
      track.append(h('img', { src: url, alt: `Slide ${i + 1}`, draggable: 'false' }));
      dots.append(h('i', { class: i === 0 ? 'on' : '' }));
    }
    track.scrollLeft = 0;
    updatePvCounter();
    const grid = $('#pf-grid'); grid.innerHTML = '';
    grid.append(h('div', { class: 'pf-tile' }, [h('img', { src: pvUrls[0], alt: 'Slide 1 as it appears on your profile' }), P.slides > 1 ? h('span', { class: 'multi', 'data-icon': 'copy' }) : null]));
    for (let i = 0; i < 11; i++) grid.append(h('div', { class: 'pf-tile ghost' }));
    hydrateIcons(grid);
    setPreviewView(S.pref('pvView', 'post'));
  }
  function setPreviewView(v) {
    S.setPref('pvView', v);
    $$('#pv-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    $('#pv-post').hidden = v !== 'post';
    $('#pv-profile').hidden = v !== 'grid';
    $('#pv-note').textContent = v === 'post'
      ? 'Swipe through and check that the seams line up. This is how friends will see it in their feed.'
      : 'Instagram shows slide 1 on your profile, cropped to 3:4. Keep the important part of slide 1 near the middle.';
  }
  function updatePvCounter() {
    const track = $('#pv-track');
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    $('#pv-counter').textContent = `${i + 1}/${P ? P.slides : 1}`;
    $$('#pv-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  }

  /* ---------- export ---------- */
  function blobToB64(blob) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  }
  function exportSheet() {
    stage.select(null);
    let kind = S.pref('exportKind', 'jpg');
    openSheet((b) => {
      const picked = new Set([...Array(P.slides).keys()]);
      const strip = h('div', { class: 'export-strip' });
      const label = () => `Save ${picked.size} photo${picked.size === 1 ? '' : 's'}`;
      const syncPicks = () => {
        $$('button', strip).forEach((btn, i) => btn.classList.toggle('on', picked.has(i)));
        go.lastChild.textContent = label();
        go.disabled = picked.size === 0;
        allChip.classList.toggle('on', picked.size === P.slides);
        oneChip.classList.toggle('on', picked.size === 1 && picked.has(curSlide()));
      };
      for (let i = 0; i < P.slides; i++) {
        strip.append(h('button', { class: 'on', 'aria-label': 'Slide ' + (i + 1), onclick: () => { picked.has(i) ? picked.delete(i) : picked.add(i); syncPicks(); } }, [
          h('img', { src: R.renderSlide(P, assets, i, 0.12).toDataURL('image/jpeg', 0.8), alt: '', style: { height: '92px', borderRadius: '8px' } }),
          h('i', { 'data-icon': 'check' }), h('b', { text: String(i + 1) })]));
      }
      const allChip = h('button', { class: 'chip on', text: 'All slides', onclick: () => { for (let i = 0; i < P.slides; i++) picked.add(i); syncPicks(); } });
      const oneChip = h('button', { class: 'chip', text: `Only slide ${curSlide() + 1}`, onclick: () => { picked.clear(); picked.add(curSlide()); syncPicks(); } });
      const seg = h('div', { class: 'seg' });
      [['jpg', 'JPG · smaller'], ['png', 'PNG · lossless']].forEach(([k, l]) => seg.append(h('button', { class: k === kind ? 'on' : '', text: l, onclick: (e) => { kind = k; S.setPref('exportKind', k); $$('button', seg).forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
      const bar = h('div', { class: 'progress', hidden: true }, [h('i')]);
      const status = h('p', { class: 'sub', style: { margin: 0 }, hidden: true });
      const go = h('button', { class: 'btn-primary block', onclick: run }, [h('span', { 'data-icon': 'download' }), h('span', { text: label() })]);
      const box = h('div', {}, [
        h('h3', { text: 'Save to gallery' }),
        h('p', { class: 'sub', text: `${W} × ${H()} · numbered in swipe order · tap a slide to skip it` }),
        strip, h('div', { class: 'chips' }, [allChip, oneChip]), h('div', { class: 'label', text: 'Quality' }), seg, bar, status, h('div', { class: 'sheet-actions' }, [go])
      ]);
      b.append(box);

      async function run() {
        if (!Native.bridge && window.SWYP_WEB_PREVIEW) {
          status.hidden = false;
          status.textContent = 'This is the browser preview, so saving is off here. Install the SWYP app on Android to save the slides to your gallery.';
          return;
        }
        if (!picked.size) return;
        go.disabled = true; bar.hidden = false; status.hidden = false;
        const base = slug(P.name);
        const mime = kind === 'png' ? 'image/png' : 'image/jpeg';
        try {
          /* Save the last slide first so slide 01 ends up newest, i.e. first in Instagram's photo picker. */
          const order = [...picked].sort((a, z) => a - z);
          if (Native.bridge) order.reverse();
          const total = order.length;
          /* Galleries and Instagram sort by the second a photo was added. Two slides saved in the
             same second come out in random order, so each save waits for a fresh second. */
          let lastSecond = 0;
          const nextSecond = async () => {
            while (Math.floor(Date.now() / 1000) <= lastSecond) await sleep(40);
            lastSecond = Math.floor(Date.now() / 1000);
          };
          for (let k = 0; k < total; k++) {
            const i = order[k];
            status.textContent = `Saving ${k + 1} of ${total}… (about a second each, to keep them in order)`;
            const c = R.renderSlide(P, assets, i, 1);
            const blob = await new Promise((r) => c.toBlob(r, mime, 0.95));
            const name = `swyp-${base}-${String(i + 1).padStart(2, '0')}.${kind}`;
            if (Native.bridge) { const data = await blobToB64(blob); await nextSecond(); await Native.saveImage(data, name, mime, i); }
            else { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); await sleep(250); }
            bar.firstChild.style.width = ((k + 1) / total * 100) + '%';
          }
          await sleep(250);
          box.innerHTML = '';
          box.append(h('div', { class: 'done-badge', 'data-icon': 'check' }),
            h('h3', { text: 'Saved to your gallery' }),
            h('p', { class: 'sub', text: Native.bridge ? `${total} photo${total === 1 ? ' is' : 's are'} in Pictures › SWYP.` : `${total} photo${total === 1 ? '' : 's'} downloaded.` }),
            h('div', { class: 'label', text: 'Post it on Instagram' }),
            h('ol', { class: 'steps', html: `<li><span>Open Instagram and tap <b>+</b>, then <b>Post</b>.</span></li><li><span>Tap <b>Select multiple</b> (the stacked squares icon).</span></li><li><span>Tap the photos in order, slide <b>1</b> first. SWYP saved them so slide 1 is the newest photo, at the top of your gallery.</span></li><li><span>Keep the crop at <b>${P.format === '9:16' ? 'original' : P.format}</b> so the seams line up.</span></li>` }),
            h('div', { class: 'sheet-actions' }, [h('button', { class: 'btn-primary block', text: 'Done', onclick: closeSheet })]));
          hydrateIcons(box);
        } catch (e) {
          status.textContent = 'Could not save: ' + (e && e.message ? e.message : e);
          go.disabled = false;
        }
      }
    });
  }

  /* ---------- stickers, emoji, shapes and frames ---------- */
  const EMOJI = ['❤️', '🔥', '✨', '😍', '😂', '🥹', '🙌', '👏', '🎉', '🎂', '🌸', '🌊', '☀️', '🌙', '⭐', '🌈',
    '📸', '✈️', '🏝️', '🍹', '☕', '🍰', '🎶', '💫', '💖', '💯', '👀', '🫶', '🤍', '🖤', '💛', '🍂'];
  const STICKERS = [
    { shape: 'sparkle', fill: '#F2B84B', w: 260, h: 260 }, { shape: 'star', fill: '#F2B84B', w: 280, h: 280 },
    { shape: 'heart', fill: '#F06A6A', w: 280, h: 250 }, { shape: 'burst', fill: '#A55CFF', w: 300, h: 300 },
    { shape: 'arrow', fill: '#111116', w: 320, h: 140 }, { shape: 'blob', fill: '#7ED6B0', w: 320, h: 300 },
    { shape: 'ring', fill: '#111116', w: 300, h: 300 }, { shape: 'sparkle', fill: '#FFFFFF', w: 200, h: 200 }
  ];
  const FRAME_PRESETS = [
    { frame: 'polaroid', name: 'Polaroid', w: 520, h: 640 },
    { frame: 'film', name: 'Film', w: 680, h: 500 },
    { frame: 'white', name: 'White border', w: 560, h: 700 }
  ];
  function previewCanvas(el, size) {
    const c = h('canvas', { width: size * 2, height: size * 2 });
    const ctx = c.getContext('2d');
    const sc = Math.min(size * 1.5 / el.w, size * 1.5 / el.h);
    ctx.translate(size, size); ctx.scale(sc, sc); ctx.translate(-el.x, -el.y);
    R.drawElement(ctx, el, new Map(), { dark: document.documentElement.dataset.theme === 'dark' });
    return c;
  }
  function stickersSheet() {
    let tab = S.pref('stickerTab', 'emoji');
    openSheet((b) => {
      const body = h('div');
      const seg = h('div', { class: 'seg' });
      const draw = () => {
        body.innerHTML = '';
        $$('button', seg).forEach((x) => x.classList.toggle('on', x.dataset.t === tab));
        if (tab === 'emoji') {
          const g = h('div', { class: 'emoji-grid' });
          EMOJI.forEach((e) => g.append(h('button', { text: e, 'aria-label': e, onclick: () => {
            closeSheet();
            const el = baseEl('text', { text: e, font: 'inter', weight: 400, size: 200, tracking: 0, leading: 1.1, align: 'center', color: '#111116', bg: null });
            R.fitText(el); addElement(el);
          } })));
          body.append(g);
        } else if (tab === 'stickers') {
          const g = h('div', { class: 'sticker-grid' });
          STICKERS.forEach((st) => {
            const el = { type: 'shape', shape: st.shape, x: 0, y: 0, w: st.w, h: st.h, fill: st.fill === '#FFFFFF' ? '#E4E4EC' : st.fill };
            g.append(h('button', { 'aria-label': st.shape, onclick: () => { closeSheet(); addElement(baseEl('shape', { shape: st.shape, w: st.w, h: st.h, fill: st.fill })); } }, [previewCanvas(el, 28)]));
          });
          body.append(g);
        } else if (tab === 'shapes') {
          const grid = h('div', { class: 'shape-grid' });
          SHAPES.forEach((sp) => grid.append(h('button', { class: 'shape-btn', 'aria-label': sp.label, onclick: () => {
            closeSheet();
            const bgc = P.bg.colors[0];
            addElement(baseEl('shape', { shape: sp.shape || sp.id, w: sp.w, h: sp.h, radius: sp.radius || 0, fill: luminance(bgc) < 0.35 ? '#FFFFFF' : '#111116' }));
          } }, [h('i', { style: sp.style })])));
          body.append(grid);
        } else {
          const g = h('div', { class: 'frame-grid' });
          FRAME_PRESETS.forEach((fp) => {
            const el = { type: 'image', src: null, x: 0, y: 0, w: fp.w, h: fp.h, frame: fp.frame, shadow: false };
            g.append(h('button', { onclick: () => {
              closeSheet();
              const ne = addElement(baseEl('image', { src: null, w: fp.w, h: fp.h, frame: fp.frame, shadow: true, zoom: 1, panX: 0, panY: 0, radius: 0, filter: 'none', rot: fp.frame === 'polaroid' ? -3 : 0 }));
              fillPlaceholder(ne);
            } }, [previewCanvas(el, 32), fp.name]));
          });
          body.append(g, h('p', { class: 'hint', text: 'You can also add a frame to any photo from its Frame tool.' }));
        }
        hydrateIcons(body);
      };
      [['emoji', 'Emoji'], ['stickers', 'Stickers'], ['shapes', 'Shapes'], ['frames', 'Frames']].forEach(([k, l]) => seg.append(h('button', { 'data-t': k, text: l, onclick: () => { tab = k; S.setPref('stickerTab', k); draw(); } })));
      b.append(h('h3', { text: 'Stickers' }), h('p', { class: 'sub', text: 'Drop one across a seam so it peeks into the next slide.' }), h('div', { class: 'tray-row tabs-row' }, [seg]), body);
      draw();
    });
  }

  /* ---------- first-run tips ---------- */
  function tipsSheet() {
    const tips = [
      ['eye', 'Drag to move, pinch to resize', 'Use two fingers on a selected item to scale and rotate it.'],
      ['crop', 'Double-tap a photo to crop', 'Then drag and pinch inside the frame. Double-tap text to edit it.'],
      ['photo', 'Hold a photo to swap it', 'Keep your finger down, then drag it onto another frame to trade places.'],
      ['slides', 'Dashed lines are the cuts', 'Instagram splits your canvas there. Anything crossing a line flows into the next slide.'],
      ['overview', 'Pinch out to see everything', 'Or tap the slide counter at the bottom to view the whole carousel.']
    ];
    openSheet((b) => {
      b.append(h('h3', { text: 'Quick tips' }), h('p', { class: 'sub', text: 'Five things that make SWYP feel easy.' }),
        h('div', { class: 'tips' }, tips.map(([ic, t, d]) => h('div', { class: 'tip' }, [h('span', { class: 'ti', 'data-icon': ic }), h('div', {}, [h('b', { text: t }), h('span', { text: d })])]))),
        h('div', { class: 'sheet-actions' }, [h('button', { class: 'btn-primary block', text: 'Start designing', onclick: closeSheet })]));
    });
  }

  /* ---------- templates ---------- */
  function templateProject(t) {
    const p = JSON.parse(JSON.stringify({ format: t.format, slides: t.slides, bg: t.bg, elements: t.elements }));
    p.elements.forEach((e) => { e.id = S.uid('e'); if (e.type === 'text') R.fitText(e); });
    return p;
  }
  function renderTemplates() {
    const wrap = $('#templates'); wrap.innerHTML = '';
    const dark = document.documentElement.dataset.theme === 'dark';
    (window.Templates || []).forEach((t) => {
      const p = templateProject(t);
      const th = 200, sc = th / R.FORMATS[p.format].h;
      const c = document.createElement('canvas');
      c.width = Math.round(W * p.slides * sc); c.height = th;
      const ctx = c.getContext('2d'); ctx.scale(sc, sc);
      R.drawScene(ctx, p, new Map(), { export: false, dark });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 1; i < p.slides; i++) ctx.fillRect(Math.round(i * W * sc) - 1, 0, 2, th);
      wrap.append(h('button', { class: 'tpl', onclick: () => createFromTemplate(t) }, [
        h('div', { class: 'tpl-thumb' }, [h('img', { src: c.toDataURL('image/jpeg', 0.82), alt: '' })]),
        h('div', { class: 'tpl-info' }, [h('strong', { text: t.name }), h('small', { text: `${t.slides} slides · ${t.format}` })])
      ]));
    });
  }
  async function createFromTemplate(t) {
    await preloadFonts();
    const p = Object.assign(templateProject(t), { id: S.uid('p'), name: t.name, createdAt: Date.now(), updatedAt: Date.now() });
    await S.saveProject(p);
    openProject(p.id);
  }

  /* ---------- project files (.swyp) ---------- */
  async function exportProjectFile(id) {
    try {
      const p = await S.getProject(id);
      const out = { swyp: 1, project: p, assets: {} };
      const ids = [...new Set(p.elements.map((e) => e.src).filter(Boolean))];
      for (const a of ids) {
        const rec = await S.getAsset(a);
        if (rec) out.assets[a] = { type: rec.blob.type || 'image/jpeg', w: rec.w, h: rec.h, data: await blobToB64(rec.blob) };
      }
      const blob = new Blob([JSON.stringify(out)], { type: 'application/octet-stream' });
      const name = `${slug(p.name)}.swyp`;
      if (Native.bridge) await Native.shareFile(await blobToB64(blob), name, 'application/octet-stream');
      else if (window.SWYP_WEB_PREVIEW) { toast('Sharing files works in the Android app'); return; }
      else { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); }
    } catch (e) { toast('Could not share the project'); }
  }
  async function importProjectFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.swyp !== 1 || !data.project || !Array.isArray(data.project.elements)) throw new Error('bad');
      const map = {};
      for (const [old, a] of Object.entries(data.assets || {})) {
        const blob = await (await fetch(`data:${a.type};base64,${a.data}`)).blob();
        const nid = S.uid('a');
        await S.putAsset(nid, blob, a.w, a.h);
        map[old] = nid;
      }
      const p = data.project;
      p.id = S.uid('p');
      p.elements.forEach((e) => { e.id = S.uid('e'); if (e.src) e.src = map[e.src] || null; });
      p.updatedAt = Date.now();
      await S.saveProject(p);
      await renderHome();
      toast(`Imported “${p.name}”`);
    } catch (e) {
      toast('That file is not a SWYP project');
    }
  }

  /* ---------- Android back button ---------- */
  window.swypBack = function () {
    if (closeSheet()) return true;
    if (screen === 'preview') { show('editor'); return true; }
    if (screen === 'editor') {
      if (stage.cropMode) { stage.setCrop(false); return true; }
      if (ctxTool) { ctxTool = null; refreshCtx(); return true; }
      if (stage.sel) { stage.select(null); return true; }
      leaveEditor(); return true;
    }
    return false;
  };

  /* ---------- wiring ---------- */
  function init() {
    hydrateIcons(document);
    applyTheme();
    stage = new window.Stage($('#stage'), $('#stage-host'), {
      onSelect: () => { ctxTool = null; refreshCtx(); },
      onChange: (done) => { if (done) { commit(); if (ctxTool) refreshCtx(); } },
      onEditText: (el) => editTextSheet(el),
      onPlaceholder: (el) => fillPlaceholder(el),
      onSwapStart: () => toast('Drop it on another photo to swap'),
      onSwapped: (ok) => { if (ok) toast('Photos swapped'); },
      onCrop: (on) => { $('#crop-hint').hidden = !on; if (!on && ctxTool === 'crop') { ctxTool = null; refreshCtx(); } },
      onView: updateNav
    });
    const host = $('#stage-host');
    if (window.ResizeObserver) new ResizeObserver(() => { if (P && screen === 'editor') { const c = curSlide(); stage.resize(); stage.fit(c); } }).observe(host);

    $('#btn-new').onclick = newProjectSheet;
    $('#btn-settings').onclick = settingsSheet;
    $('#scrim').onclick = closeSheet;
    $('#ed-back').onclick = leaveEditor;
    $('#ed-undo').onclick = undo;
    $('#ed-redo').onclick = redo;
    $('#ed-preview').onclick = openPreview;
    $('#ed-save').onclick = exportSheet;
    $('#ed-title').onclick = () => renameSheet(P.name, (n) => { P.name = n; updateTop(); scheduleSave(); });
    $('#nav-prev').onclick = () => { stage.goToSlide(curSlide() - 1); updateNav(); };
    $('#nav-next').onclick = () => { stage.goToSlide(curSlide() + 1); updateNav(); };
    $('#nav-count').onclick = () => { stage.overview(); updateNav(); };
    $('#ctx-done').onclick = () => { stage.setCrop(false); stage.select(null); };
    $('#crop-done').onclick = () => stage.setCrop(false);
    $('#pv-back').onclick = () => show('editor');
    $('#pv-save').onclick = () => { show('editor'); exportSheet(); };
    $('#pv-track').addEventListener('scroll', () => requestAnimationFrame(updatePvCounter), { passive: true });
    const tools = { photos: photosSheet, text: textSheet, layouts: layoutsSheet, stickers: stickersSheet, background: backgroundSheet, slides: slidesSheet, layers: layersSheet };
    $('#btn-import').onclick = () => { const inp = $('#import-input'); inp.value = ''; inp.click(); };
    $('#import-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importProjectFile(f); });
    $$('#pv-seg button').forEach((b) => { b.onclick = () => setPreviewView(b.dataset.v); });
    $$('#dock button').forEach((b) => { b.onclick = () => tools[b.dataset.tool](); });

    document.addEventListener('keydown', (e) => {
      if (screen !== 'editor' || sheetOpen() || /input|textarea/i.test(document.activeElement.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && stage.selected) { P.elements = P.elements.filter((x) => x.id !== stage.sel); stage.select(null); stage.invalidate(); commit(); }
      else if (e.key === 'Escape') window.swypBack();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && P) saveNow(); });
    window.addEventListener('pagehide', () => { if (P) saveNow(); });

    renderHome();
    preloadFonts();
  }

  window.SWYP = { get project() { return P; }, get stage() { return stage; }, openProject, commit };
  if (document.fonts && document.fonts.load) {
    Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 16px SwypInter`))).catch(() => {}).finally(init);
  } else init();
})();
