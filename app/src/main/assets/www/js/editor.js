/* SWYP — interactive stage: view pan/zoom, selection, move/scale/rotate, crop, snapping. */
(function () {
  'use strict';
  const R = window.Render;
  const HANDLE = 11;        // handle radius in CSS px
  const HIT_PAD = 14;       // extra touch tolerance in CSS px
  const SNAP = 7;           // snap distance in CSS px
  const ROT_SNAP = 4;       // degrees

  function Stage(canvas, host, cb) {
    this.canvas = canvas;
    this.host = host;
    this.ctx = canvas.getContext('2d');
    this.cb = cb || {};
    this.p = null;
    this.assets = new Map();
    this.sel = null;
    this.cropMode = false;
    this.view = { s: 0.3, ox: 0, oy: 0 };
    this.pointers = new Map();
    this.gesture = null;
    this.guides = [];
    this.dirty = true;
    this.lastTap = { t: 0, id: null };
    this._bind();
    this._loop();
  }

  Stage.prototype = {
    setProject(p, assets) {
      this.p = p; this.assets = assets; this.sel = null; this.cropMode = false;
      this.resize(); this.fit(0);
    },
    H() { return R.FORMATS[this.p.format].h; },
    totalW() { return R.SLIDE_W * this.p.slides; },
    invalidate() { this.dirty = true; },
    get selected() { return this.p && this.sel ? this.p.elements.find((e) => e.id === this.sel) || null : null; },
    select(id) {
      if (this.sel !== id) this.cropMode = false;
      this.sel = id;
      this.invalidate();
      this.cb.onSelect && this.cb.onSelect(this.selected);
    },

    resize() {
      const r = this.host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.cw = r.width; this.ch = r.height; this.dpr = dpr;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.canvas.style.width = r.width + 'px';
      this.canvas.style.height = r.height + 'px';
      this.invalidate();
    },
    /* Fit one slide to the viewport and centre the given slide. */
    fit(slide) {
      if (!this.p) return;
      const H = this.H();
      const s = Math.min((this.ch - 64) / H, (this.cw - 56) / R.SLIDE_W);
      this.view.s = s;
      this.view.oy = (this.ch - H * s) / 2 + 8;
      this.view.ox = this.cw / 2 - (slide * R.SLIDE_W + R.SLIDE_W / 2) * s;
      this._clampView();
      this.invalidate();
    },
    overview() {
      if (!this.p) return;
      const H = this.H();
      const s = Math.min((this.ch - 64) / H, (this.cw - 40) / this.totalW());
      this.view.s = s;
      this.view.ox = (this.cw - this.totalW() * s) / 2;
      this.view.oy = (this.ch - H * s) / 2 + 8;
      this.invalidate();
    },
    currentSlide() {
      if (!this.p) return 0;
      const cx = (this.cw / 2 - this.view.ox) / this.view.s;
      return Math.max(0, Math.min(this.p.slides - 1, Math.floor(cx / R.SLIDE_W)));
    },
    goToSlide(i) { this.fit(Math.max(0, Math.min(this.p.slides - 1, i))); },
    _clampView() {
      const v = this.view, W = this.totalW() * v.s, H = this.H() * v.s;
      const marginX = this.cw * 0.5, marginY = this.ch * 0.4;
      v.ox = Math.min(marginX, Math.max(this.cw - W - marginX, v.ox));
      v.oy = Math.min(marginY + 40, Math.max(this.ch - H - marginY, v.oy));
    },
    toDesign(x, y) { return { x: (x - this.view.ox) / this.view.s, y: (y - this.view.oy) / this.view.s }; },
    toScreen(x, y) { return { x: x * this.view.s + this.view.ox, y: y * this.view.s + this.view.oy }; },

    /* ---------- hit testing ---------- */
    _local(el, dx, dy) {
      const a = -(el.rot || 0) * Math.PI / 180;
      const x = dx - el.x, y = dy - el.y;
      return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
    },
    hitElement(sx, sy) {
      const d = this.toDesign(sx, sy);
      const pad = HIT_PAD / this.view.s;
      for (let i = this.p.elements.length - 1; i >= 0; i--) {
        const el = this.p.elements[i];
        if (el.hidden) continue;
        const l = this._local(el, d.x, d.y);
        const hw = Math.abs(el.w) / 2 + (el.h * this.view.s < 30 ? pad : 0);
        const hh = Math.abs(el.h) / 2 + (el.h * this.view.s < 30 ? pad : 0);
        if (Math.abs(l.x) <= hw && Math.abs(l.y) <= hh) return el;
      }
      return null;
    },
    _corners(el) {
      const a = (el.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const pt = (lx, ly) => this.toScreen(el.x + lx * c - ly * s, el.y + lx * s + ly * c);
      const w = el.w / 2, h = el.h / 2;
      return {
        tl: pt(-w, -h), tr: pt(w, -h), br: pt(w, h), bl: pt(-w, h),
        r: pt(w, 0), l: pt(-w, 0), t: pt(0, -h), b: pt(0, h), c: pt(0, 0),
        rot: (() => { const b = pt(0, h); const dirx = -s, diry = c; return { x: b.x + dirx * 34, y: b.y + diry * 34 }; })()
      };
    },
    _handles(el) {
      const k = this._corners(el);
      const list = [{ id: 'rot', ...k.rot }];
      if (el.locked) return [];
      ['tl', 'tr', 'br', 'bl'].forEach((id) => list.push({ id, ...k[id] }));
      if (el.type !== 'text') ['r', 'l', 't', 'b'].forEach((id) => list.push({ id, ...k[id], side: true }));
      return list;
    },
    _imageAt(pos, excludeId) {
      const d = this.toDesign(pos.x, pos.y);
      for (let i = this.p.elements.length - 1; i >= 0; i--) {
        const el = this.p.elements[i];
        if (el.hidden || el.type !== 'image' || el.id === excludeId || el.locked) continue;
        const l = this._local(el, d.x, d.y);
        if (Math.abs(l.x) <= el.w / 2 && Math.abs(l.y) <= el.h / 2) return el;
      }
      return null;
    },
    hitHandle(sx, sy) {
      const el = this.selected;
      if (!el || el.locked || this.cropMode) return null;
      const hs = this._handles(el);
      for (const h of hs) { if (Math.hypot(h.x - sx, h.y - sy) <= HANDLE + HIT_PAD - 2) return h.id; }
      return null;
    },

    /* ---------- pointer handling ---------- */
    _bind() {
      const c = this.canvas;
      c.style.touchAction = 'none';
      c.addEventListener('pointerdown', (e) => this._down(e));
      c.addEventListener('pointermove', (e) => this._move(e));
      c.addEventListener('pointerup', (e) => this._up(e));
      c.addEventListener('pointercancel', (e) => this._up(e, true));
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) {
          this._zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
        } else {
          this.view.ox -= e.deltaX || e.deltaY; this._clampView(); this.invalidate();
        }
      }, { passive: false });
      window.addEventListener('resize', () => { if (this.p) { const cs = this.currentSlide(); this.resize(); this.fit(cs); } });
    },
    _pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
    _zoomAt(sx, sy, f) {
      const v = this.view;
      const min = Math.min((this.ch - 64) / this.H(), (this.cw - 40) / this.totalW()) * 0.8;
      const ns = Math.max(min, Math.min(4, v.s * f));
      const d = this.toDesign(sx, sy);
      v.s = ns; v.ox = sx - d.x * ns; v.oy = sy - d.y * ns;
      this._clampView(); this.invalidate();
    },
    _down(e) {
      if (!this.p) return;
      this.canvas.setPointerCapture(e.pointerId);
      const pos = this._pos(e);
      this.pointers.set(e.pointerId, pos);
      if (this.pointers.size === 1) {
        const handle = this.hitHandle(pos.x, pos.y);
        const el = handle ? this.selected : this.hitElement(pos.x, pos.y);
        const now = performance.now();
        this.gesture = { kind: null, start: pos, t: now, moved: false, el, handle };
        if (handle) {
          this.gesture.kind = 'handle';
          this.gesture.orig = { ...el };
        } else if (el && this.cropMode && el.id === this.sel) {
          this.gesture.kind = 'crop';
          this.gesture.orig = { ...el };
        } else if (el && !el.locked) {
          this.gesture.kind = 'pending-move';
          this.gesture.orig = { ...el };
          if (el.type === 'image' && el.src) {
            const g = this.gesture;
            g.hold = setTimeout(() => {
              if (this.gesture !== g || g.moved || this.pointers.size !== 1) return;
              g.kind = 'swap';
              this.swap = { el, pos: g.start, target: null };
              if (this.sel !== el.id) this.select(el.id);
              try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* ignore */ }
              this.cb.onSwapStart && this.cb.onSwapStart();
              this.invalidate();
            }, 420);
          }
        } else {
          this.gesture.kind = 'pan';
          this.gesture.view = { ...this.view };
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const g = this.gesture || {};
        clearTimeout(g.hold);
        if (g.kind === 'swap') { this.swap = null; }
        const el = this.selected;
        const pinchEl = el && !el.locked && (g.kind === 'move' || g.kind === 'pending-move' || g.kind === 'crop') && g.el && g.el.id === el.id;
        this.gesture = {
          kind: pinchEl ? (this.cropMode ? 'pinch-crop' : 'pinch-el') : 'pinch-view',
          d0: Math.hypot(b.x - a.x, b.y - a.y), a0: Math.atan2(b.y - a.y, b.x - a.x),
          mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          view: { ...this.view }, orig: el ? { ...el } : null, el, moved: true
        };
      }
    },
    _move(e) {
      if (!this.pointers.has(e.pointerId) || !this.gesture) return;
      const pos = this._pos(e);
      this.pointers.set(e.pointerId, pos);
      const g = this.gesture;
      const s = this.view.s;
      if (this.pointers.size >= 2 && g.kind && g.kind.startsWith('pinch')) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const f = d / Math.max(1, g.d0);
        if (g.kind === 'pinch-view') {
          const v0 = g.view;
          const min = Math.min((this.ch - 64) / this.H(), (this.cw - 40) / this.totalW()) * 0.8;
          const ns = Math.max(min, Math.min(4, v0.s * f));
          const dx = (g.mid0.x - v0.ox) / v0.s, dy = (g.mid0.y - v0.oy) / v0.s;
          this.view.s = ns; this.view.ox = mid.x - dx * ns; this.view.oy = mid.y - dy * ns;
          this._clampView();
        } else if (g.kind === 'pinch-el') {
          const el = this.selected, o = g.orig;
          this._scaleEl(el, o, f);
          let rot = o.rot + (ang - g.a0) * 180 / Math.PI;
          el.rot = this._snapRot(rot);
          el.x = o.x + (mid.x - g.mid0.x) / s;
          el.y = o.y + (mid.y - g.mid0.y) / s;
          this.cb.onChange && this.cb.onChange(false);
        } else if (g.kind === 'pinch-crop') {
          const el = this.selected;
          el.zoom = Math.max(1, Math.min(5, (g.orig.zoom || 1) * f));
          this.cb.onChange && this.cb.onChange(false);
        }
        this.invalidate();
        return;
      }
      if (g.kind === 'swap') {
        g.moved = true;
        this.swap.pos = pos;
        this.swap.target = this._imageAt(pos, g.el.id);
        this.invalidate();
        return;
      }
      const dxs = pos.x - g.start.x, dys = pos.y - g.start.y;
      if (!g.moved && Math.hypot(dxs, dys) > 6) {
        g.moved = true;
        clearTimeout(g.hold);
        if (g.kind === 'pending-move') {
          g.kind = 'move';
          if (g.el.id !== this.sel) this.select(g.el.id);
        }
      }
      if (!g.moved) return;
      if (g.kind === 'pan') {
        this.view.ox = g.view.ox + dxs; this.view.oy = g.view.oy + dys; this._clampView();
      } else if (g.kind === 'move') {
        const el = this.selected, o = g.orig;
        el.x = o.x + dxs / s; el.y = o.y + dys / s;
        this._snapMove(el);
        this.cb.onChange && this.cb.onChange(false);
      } else if (g.kind === 'crop') {
        const el = this.selected, o = g.orig, img = this.assets.get(el.src);
        if (img) {
          const iw = img.width, ih = img.height, z = el.zoom || 1, r = R.innerRect(el);
          const sc = Math.max(r.w / iw, r.h / ih) * z;
          const mx = (iw * sc - r.w) / 2 || 1, my = (ih * sc - r.h) / 2 || 1;
          const a = -(el.rot || 0) * Math.PI / 180;
          const lx = (dxs * Math.cos(a) - dys * Math.sin(a)) / s, ly = (dxs * Math.sin(a) + dys * Math.cos(a)) / s;
          el.panX = Math.max(-1, Math.min(1, (o.panX || 0) - lx / mx * (el.flipX ? -1 : 1)));
          el.panY = Math.max(-1, Math.min(1, (o.panY || 0) - ly / my));
          this.cb.onChange && this.cb.onChange(false);
        }
      } else if (g.kind === 'handle') {
        this._dragHandle(g, pos);
        this.cb.onChange && this.cb.onChange(false);
      }
      this.invalidate();
    },
    _up(e, cancelled) {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      const g = this.gesture;
      if (!g) return;
      if (this.pointers.size > 0) {
        /* One finger lifted out of a pinch: continue as a pan/move with the remaining finger. */
        const rest = [...this.pointers.values()][0];
        const el = this.selected;
        if (g.kind === 'pinch-el' && el) this.gesture = { kind: 'move', start: rest, moved: true, el, orig: { ...el } };
        else if (g.kind === 'pinch-crop' && el) this.gesture = { kind: 'crop', start: rest, moved: true, el, orig: { ...el } };
        else this.gesture = { kind: 'pan', start: rest, moved: true, view: { ...this.view } };
        return;
      }
      clearTimeout(g.hold);
      this.gesture = null;
      this.guides = [];
      if (g.kind === 'swap') {
        const t = this.swap && this.swap.target;
        this.swap = null;
        if (t && !cancelled) {
          const keys = ['src', 'zoom', 'panX', 'panY', 'filter', 'adj', 'flipX'];
          const a = g.el, b = t, tmp = {};
          keys.forEach((k) => { tmp[k] = a[k]; a[k] = b[k]; b[k] = tmp[k]; });
          if (!a.src) { a.zoom = 1; a.panX = 0; a.panY = 0; }
          this.select(b.id);
          this.cb.onChange && this.cb.onChange(true);
          this.cb.onSwapped && this.cb.onSwapped(true);
        } else this.cb.onSwapped && this.cb.onSwapped(false);
        this.invalidate();
        return;
      }
      if (cancelled) { this.invalidate(); return; }
      if (!g.moved) this._tap(g);
      else if (g.kind !== 'pan' && g.kind !== 'pinch-view') this.cb.onChange && this.cb.onChange(true);
      if (g.kind === 'pan' || g.kind === 'pinch-view') this.cb.onView && this.cb.onView();
      this.invalidate();
    },
    _tap(g) {
      const now = performance.now();
      const el = g.el;
      const dbl = el && this.lastTap.id === el.id && now - this.lastTap.t < 320;
      this.lastTap = { t: now, id: el ? el.id : null };
      if (g.kind === 'handle') return;
      if (!el) {
        if (this.cropMode) { this.cropMode = false; this.cb.onCrop && this.cb.onCrop(false); }
        this.select(null);
        return;
      }
      if (el.type === 'image' && !el.src) { this.select(el.id); this.cb.onPlaceholder && this.cb.onPlaceholder(el); return; }
      if (dbl) {
        if (el.type === 'text') this.cb.onEditText && this.cb.onEditText(el);
        else if (el.type === 'image') this.setCrop(!this.cropMode);
        return;
      }
      if (this.cropMode && el.id !== this.sel) this.setCrop(false);
      this.select(el.id);
    },
    setCrop(on) {
      const el = this.selected;
      this.cropMode = !!(on && el && el.type === 'image' && el.src);
      this.cb.onCrop && this.cb.onCrop(this.cropMode);
      this.invalidate();
    },

    /* ---------- transforms ---------- */
    _scaleEl(el, o, f) {
      const min = 24;
      if (el.type === 'text') {
        el.size = Math.max(8, Math.min(1200, o.size * f));
        R.fitText(el);
      } else {
        el.w = Math.max(min, o.w * f);
        el.h = el.shape === 'line' ? Math.max(2, o.h * f) : Math.max(min, o.h * f);
      }
    },
    _dragHandle(g, pos) {
      const el = this.selected, o = g.orig, s = this.view.s;
      const c = this.toScreen(o.x, o.y);
      if (g.handle === 'rot') {
        const ang = Math.atan2(pos.y - c.y, pos.x - c.x) * 180 / Math.PI - 90;
        el.rot = this._snapRot(ang);
        return;
      }
      const a = (o.rot || 0) * Math.PI / 180;
      const toLocal = (p) => { const x = (p.x - c.x) / s, y = (p.y - c.y) / s; return { x: x * Math.cos(-a) - y * Math.sin(-a), y: x * Math.sin(-a) + y * Math.cos(-a) }; };
      const lp = toLocal(pos), ls = toLocal(g.start);
      if (['tl', 'tr', 'br', 'bl'].includes(g.handle)) {
        /* Uniform scale around the centre, measured by distance from centre. */
        const f = Math.max(0.05, Math.hypot(lp.x, lp.y) / Math.max(1, Math.hypot(ls.x, ls.y)));
        this._scaleEl(el, o, f);
        return;
      }
      /* One-sided resize: the opposite edge stays put. */
      const sign = (g.handle === 'r' || g.handle === 'b') ? 1 : -1;
      const horiz = g.handle === 'r' || g.handle === 'l';
      const delta = (horiz ? lp.x - ls.x : lp.y - ls.y) * sign;
      const min = el.shape === 'line' && !horiz ? 2 : 24;
      const size = Math.max(min, (horiz ? o.w : o.h) + delta);
      const shift = (size - (horiz ? o.w : o.h)) / 2 * sign;
      if (horiz) { el.w = size; el.x = o.x + shift * Math.cos(a); el.y = o.y + shift * Math.sin(a); }
      else { el.h = size; el.x = o.x - shift * Math.sin(a); el.y = o.y + shift * Math.cos(a); }
    },
    _snapRot(rot) {
      rot = ((rot % 360) + 540) % 360 - 180;
      for (const t of [-180, -90, 0, 90, 180]) if (Math.abs(rot - t) < ROT_SNAP) return t === -180 ? 180 : t;
      return Math.round(rot * 10) / 10;
    },
    _aabb(el) {
      const a = (el.rot || 0) * Math.PI / 180;
      const w = Math.abs(el.w * Math.cos(a)) + Math.abs(el.h * Math.sin(a));
      const h = Math.abs(el.w * Math.sin(a)) + Math.abs(el.h * Math.cos(a));
      return { w, h };
    },
    _snapMove(el) {
      const th = SNAP / this.view.s, W = R.SLIDE_W, H = this.H();
      const xs = [], ys = [0, H / 2, H];
      for (let i = 0; i <= this.p.slides; i++) { xs.push(i * W); if (i < this.p.slides) xs.push(i * W + W / 2); }
      const bb = this._aabb(el);
      const guides = [];
      const trySnap = (pos, half, lines, axis) => {
        let best = null;
        for (const l of lines) for (const off of [0, -half, half]) {
          const d = l - (pos + off);
          if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, l };
        }
        if (best) guides.push({ axis, at: best.l });
        return best ? pos + best.d : pos;
      };
      el.x = trySnap(el.x, bb.w / 2, xs, 'x');
      el.y = trySnap(el.y, bb.h / 2, ys, 'y');
      this.guides = guides;
    },

    /* ---------- drawing ---------- */
    _loop() {
      const tick = () => {
        if (this.dirty && this.p) { this.dirty = false; this._draw(); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    _css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },
    _draw() {
      const ctx = this.ctx, dpr = this.dpr, v = this.view, p = this.p;
      const W = this.totalW(), H = this.H();
      const dark = document.documentElement.dataset.theme === 'dark';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.cw, this.ch);

      /* Soft shadow under the canvas */
      ctx.save();
      ctx.shadowColor = dark ? 'rgba(0,0,0,0.55)' : 'rgba(20,20,40,0.13)';
      ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
      ctx.fillStyle = dark ? '#000' : '#fff';
      ctx.fillRect(v.ox, v.oy, W * v.s, H * v.s);
      ctx.restore();

      ctx.save();
      ctx.translate(v.ox, v.oy); ctx.scale(v.s, v.s);
      /* Ghost of anything hanging off the edges */
      ctx.save(); ctx.globalAlpha = 0.22;
      p.elements.forEach((el) => {
        const inside = el.x - el.w / 2 >= 0 && el.x + el.w / 2 <= W && el.y - el.h / 2 >= 0 && el.y + el.h / 2 <= H;
        if (!inside) { ctx.save(); R.drawScene.call(null, ctx, { ...p, elements: [el], bg: { type: 'none' } }, this.assets, { dark, ghost: true }); ctx.restore(); }
      });
      ctx.restore();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      R.drawScene(ctx, p, this.assets, { dark, shadowScale: 1 });
      ctx.restore();

      /* Slide seams and numbers */
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 1; i < p.slides; i++) {
        const x = Math.round(v.ox + i * R.SLIDE_W * v.s) + 0.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.moveTo(x, v.oy); ctx.lineTo(x, v.oy + H * v.s); ctx.stroke();
        ctx.lineDashOffset = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.moveTo(x, v.oy); ctx.lineTo(x, v.oy + H * v.s); ctx.stroke();
        ctx.lineDashOffset = 0;
      }
      ctx.setLineDash([]);
      ctx.font = '500 11px SwypInter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = this._css('--ink-3') || '#999';
      for (let i = 0; i < p.slides; i++) {
        const x = v.ox + (i + 0.5) * R.SLIDE_W * v.s;
        if (x < -40 || x > this.cw + 40) continue;
        ctx.fillText(String(i + 1).padStart(2, '0'), x, v.oy - 10);
      }
      ctx.restore();

      /* Guides */
      const accent = this._css('--sel') || '#7A5AF8';
      ctx.save();
      ctx.strokeStyle = '#FF4FA3'; ctx.lineWidth = 1;
      this.guides.forEach((g) => {
        ctx.beginPath();
        if (g.axis === 'x') { const x = v.ox + g.at * v.s; ctx.moveTo(x, v.oy - 6); ctx.lineTo(x, v.oy + H * v.s + 6); }
        else { const y = v.oy + g.at * v.s; ctx.moveTo(v.ox - 6, y); ctx.lineTo(v.ox + W * v.s + 6, y); }
        ctx.stroke();
      });
      ctx.restore();

      /* Selection */
      const el = this.selected;
      if (el && !el.hidden) {
        const k = this._corners(el);
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.cropMode ? '#FFFFFF' : accent;
        if (this.cropMode) ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(k.tl.x, k.tl.y); ctx.lineTo(k.tr.x, k.tr.y); ctx.lineTo(k.br.x, k.br.y); ctx.lineTo(k.bl.x, k.bl.y); ctx.closePath(); ctx.stroke();
        if (this.cropMode) {
          ctx.setLineDash([]);
          ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(k.tl.x, k.tl.y); ctx.lineTo(k.tr.x, k.tr.y); ctx.lineTo(k.br.x, k.br.y); ctx.lineTo(k.bl.x, k.bl.y); ctx.closePath();
          ctx.setLineDash([6, 4]); ctx.lineDashOffset = 6; ctx.stroke();
        } else if (!el.locked) {
          ctx.setLineDash([]);
          ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(k.b.x, k.b.y); ctx.lineTo(k.rot.x, k.rot.y); ctx.stroke();
          this._handles(el).forEach((h) => {
            ctx.beginPath();
            if (h.id === 'rot') {
              ctx.arc(h.x, h.y, HANDLE, 0, Math.PI * 2);
              ctx.fillStyle = accent; ctx.fill();
              ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
              ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, -Math.PI * 0.9, Math.PI * 0.55); ctx.stroke();
              ctx.beginPath(); const ax = h.x + 4.5 * Math.cos(Math.PI * 0.55), ay = h.y + 4.5 * Math.sin(Math.PI * 0.55);
              ctx.moveTo(ax - 3, ay - 0.5); ctx.lineTo(ax, ay); ctx.lineTo(ax + 0.5, ay - 3.2); ctx.stroke();
              return;
            }
            if (h.side) {
              const horiz = h.id === 'l' || h.id === 'r';
              const a = (el.rot || 0) * Math.PI / 180;
              ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
              R.roundRect(ctx, horiz ? -3.5 : -10, horiz ? -10 : -3.5, horiz ? 7 : 20, horiz ? 20 : 7, 3.5);
              ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
              ctx.restore();
              return;
            }
            ctx.arc(h.x, h.y, 6.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
          });
        }
        if (el.locked) {
          ctx.fillStyle = accent;
          ctx.beginPath(); ctx.arc(k.tr.x, k.tr.y, 9, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
          R.roundRect(ctx, k.tr.x - 3.5, k.tr.y - 1, 7, 5, 1); ctx.stroke();
          ctx.beginPath(); ctx.arc(k.tr.x, k.tr.y - 1, 2.2, Math.PI, 0); ctx.stroke();
        }
        ctx.restore();
      }

      /* Photo swap: highlight the frame under the finger and carry a small copy of the photo. */
      if (this.swap) {
        const sw = this.swap;
        if (sw.target) {
          const k = this._corners(sw.target);
          ctx.save();
          ctx.beginPath(); ctx.moveTo(k.tl.x, k.tl.y); ctx.lineTo(k.tr.x, k.tr.y); ctx.lineTo(k.br.x, k.br.y); ctx.lineTo(k.bl.x, k.bl.y); ctx.closePath();
          ctx.fillStyle = accent; ctx.globalAlpha = 0.22; ctx.fill();
          ctx.globalAlpha = 1; ctx.lineWidth = 2.5; ctx.strokeStyle = accent; ctx.stroke();
          ctx.restore();
        }
        const img = this.assets.get(sw.el.src);
        if (img) {
          const s = 76, x = sw.pos.x - s / 2, y = sw.pos.y - s - 18;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
          R.roundRect(ctx, x - 3, y - 3, s + 6, s + 6, 16); ctx.fillStyle = '#fff'; ctx.fill();
          ctx.shadowColor = 'transparent';
          R.roundRect(ctx, x, y, s, s, 13); ctx.clip();
          const sc = Math.max(s / img.width, s / img.height);
          ctx.drawImage(img, x + (s - img.width * sc) / 2, y + (s - img.height * sc) / 2, img.width * sc, img.height * sc);
          ctx.restore();
        }
      }
    }
  };

  window.Stage = Stage;
})();
