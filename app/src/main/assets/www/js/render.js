/* SWYP — scene model constants and the canvas renderer used for both editing and export. */
(function () {
  'use strict';

  const SLIDE_W = 1080;
  const FORMATS = {
    '4:5': { label: 'Portrait', ratio: '4:5', h: 1350 },
    '3:4': { label: 'Tall', ratio: '3:4', h: 1440 },
    '1:1': { label: 'Square', ratio: '1:1', h: 1080 },
    '9:16': { label: 'Story', ratio: '9:16', h: 1920 }
  };

  const FONTS = [
    { id: 'inter', name: 'Inter', family: 'SwypInter', weights: [300, 400, 500, 600, 700, 900] },
    { id: 'poppins', name: 'Poppins', family: 'SwypPoppins', weights: [300, 400, 500, 700] },
    { id: 'lora', name: 'Lora', family: 'SwypLora', weights: [400, 500, 600, 700] },
    { id: 'adventor', name: 'Avant', family: 'SwypAdventor', weights: [400, 700] },
    { id: 'chorus', name: 'Script', family: 'SwypChorus', weights: [400] },
    { id: 'mono', name: 'Typewriter', family: 'SwypMono', weights: [400] }
  ];
  const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

  const FILTERS = [
    { id: 'none', name: 'Original', css: '' },
    { id: 'vivid', name: 'Vivid', css: 'saturate(1.35) contrast(1.08)' },
    { id: 'soft', name: 'Soft', css: 'contrast(0.9) brightness(1.06) saturate(0.9)' },
    { id: 'warm', name: 'Warm', css: 'sepia(0.22) saturate(1.15) brightness(1.03)' },
    { id: 'cool', name: 'Cool', css: 'hue-rotate(-10deg) saturate(0.95) brightness(1.03)' },
    { id: 'fade', name: 'Fade', css: 'contrast(0.82) brightness(1.1) saturate(0.75)' },
    { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.1)' },
    { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.45) brightness(0.92)' }
  ];
  const filterById = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];

  const FRAMES = [
    { id: 'none', name: 'None' },
    { id: 'white', name: 'White border' },
    { id: 'black', name: 'Black border' },
    { id: 'polaroid', name: 'Polaroid' },
    { id: 'film', name: 'Film' }
  ];

  /* Preset filter plus the photo's own adjustments (each -100..100). */
  function filterCss(el) {
    const parts = [];
    const f = filterById(el.filter);
    if (f.css) parts.push(f.css);
    const a = el.adj || {};
    if (a.brightness) parts.push(`brightness(${(1 + a.brightness / 200).toFixed(3)})`);
    if (a.contrast) parts.push(`contrast(${(1 + a.contrast / 200).toFixed(3)})`);
    if (a.saturation) parts.push(`saturate(${(1 + a.saturation / 100).toFixed(3)})`);
    if (a.warmth > 0) parts.push(`sepia(${(a.warmth / 320).toFixed(3)}) saturate(${(1 + a.warmth / 400).toFixed(3)})`);
    if (a.warmth < 0) parts.push(`hue-rotate(${(a.warmth * 0.12).toFixed(1)}deg) saturate(${(1 + a.warmth / 500).toFixed(3)})`);
    return parts.length ? parts.join(' ') : 'none';
  }

  /* Where the photo sits inside its element, after any frame. Relative to the element centre. */
  function innerRect(el) {
    const w = el.w, h = el.h, m = Math.min(w, h);
    let l = 0, t = 0, r = 0, b = 0;
    switch (el.frame) {
      case 'white': case 'black': l = t = r = b = m * 0.045; break;
      case 'polaroid': l = t = r = w * 0.06; b = Math.min(w * 0.24, h * 0.35); break;
      case 'film': l = r = w * 0.035; t = b = h * 0.11; break;
      default: break;
    }
    return { x: -w / 2 + l, y: -h / 2 + t, w: Math.max(1, w - l - r), h: Math.max(1, h - t - b) };
  }

  /* ---------- text ---------- */
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textFont(el) {
    const f = fontById(el.font);
    return `${el.italic ? 'italic ' : ''}${el.weight || 400} ${el.size}px ${f.family}, "Noto Color Emoji", sans-serif`;
  }
  function setSpacing(ctx, px) { try { ctx.letterSpacing = px + 'px'; } catch (e) { /* older engines */ } }

  /* Text layout is newline-only so the editor and the export always match. */
  function layoutText(el) {
    const ctx = measureCtx;
    ctx.font = textFont(el);
    const spacing = (el.tracking || 0) * el.size / 100;
    const lines = String(el.text || ' ').split('\n');
    const lh = el.size * (el.leading || 1.2);
    const ow = el.outline ? (el.outlineW == null ? 8 : el.outlineW) / 100 * el.size : 0;
    const curve = Math.abs(el.curve || 0) > 1 ? el.curve : 0;

    if (curve) {
      setSpacing(ctx, 0);
      const lineGlyphs = lines.map((l) => [...(l || ' ')].map((ch) => ({ ch, adv: ctx.measureText(ch).width + spacing })));
      const lineW = lineGlyphs.map((g) => g.reduce((s, x) => s + x.adv, 0) - spacing);
      const maxW = Math.max(...lineW, el.size);
      const theta = Math.abs(curve) / 100 * Math.PI * 1.9;
      const up = curve > 0;
      /* Pick the radius so no line wraps further round than theta, inner lines included. */
      let R = el.size * 0.8;
      lineW.forEach((lw, i) => { R = Math.max(R, lw / theta + (up ? i * lh : -i * lh)); });
      void maxW;
      const glyphs = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      lineGlyphs.forEach((gs, i) => {
        const Ri = up ? Math.max(el.size * 0.6, R - i * lh) : R + i * lh;
        const span = lineW[i] / Ri;
        let cum = 0;
        gs.forEach((g) => {
          const mid = (cum + (g.adv - spacing) / 2) / Ri;
          const a = up ? -Math.PI / 2 - span / 2 + mid : Math.PI / 2 + span / 2 - mid;
          const x = Ri * Math.cos(a), y = Ri * Math.sin(a);
          glyphs.push({ ch: g.ch, x, y, rot: up ? a + Math.PI / 2 : a - Math.PI / 2 });
          const e = el.size * 0.62;
          minX = Math.min(minX, x - e); maxX = Math.max(maxX, x + e);
          minY = Math.min(minY, y - e); maxY = Math.max(maxY, y + e);
          cum += g.adv;
        });
      });
      const pad = ow + el.size * 0.05;
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      glyphs.forEach((g) => { g.x -= cx; g.y -= cy; });
      return { curved: true, glyphs, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2, ow };
    }

    setSpacing(ctx, spacing);
    let maxW = 0;
    const widths = lines.map((l) => { const w = ctx.measureText(l || ' ').width; maxW = Math.max(maxW, w); return w; });
    setSpacing(ctx, 0);
    const padX = (el.bg ? el.size * 0.45 : el.size * 0.08) + ow;
    const padY = (el.bg ? el.size * 0.28 : 0) + ow;
    return { lines, widths, lh, w: Math.max(maxW + padX * 2, el.size * 0.6), h: lines.length * lh + padY * 2, padX, padY, ow };
  }
  /* Keep the stored box in sync with the text so hit-testing matches what is drawn. */
  function fitText(el) {
    const L = layoutText(el);
    el.w = L.w; el.h = L.h;
    return el;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function paintBackground(ctx, p, totalW, H) {
    const bg = p.bg || { type: 'solid', colors: ['#FFFFFF'] };
    if (bg.type === 'none') return;
    if (bg.type === 'gradient') {
      const a = ((bg.angle == null ? 90 : bg.angle) - 90) * Math.PI / 180;
      const cx = totalW / 2, cy = H / 2;
      const len = Math.abs(totalW * Math.cos(a)) / 2 + Math.abs(H * Math.sin(a)) / 2;
      const g = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      const cs = bg.colors.length > 1 ? bg.colors : [bg.colors[0], bg.colors[0]];
      cs.forEach((c, i) => g.addColorStop(i / (cs.length - 1), c));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = bg.colors[0];
    }
    ctx.fillRect(0, 0, totalW, H);
  }

  /* ---------- photos ---------- */
  function drawFrameBack(ctx, el) {
    const { w, h } = el;
    if (!el.frame || el.frame === 'none') return;
    roundRect(ctx, -w / 2, -h / 2, w, h, el.radius || 0);
    ctx.fillStyle = el.frame === 'black' || el.frame === 'film' ? '#141414' : (el.frame === 'polaroid' ? '#FBFAF7' : '#FFFFFF');
    ctx.fill();
    if (el.frame === 'film') {
      const r = innerRect(el);
      const stripH = r.y + h / 2;
      const holeH = stripH * 0.34, holeW = holeH * 0.75;
      const step = holeW * 2.1;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      for (let x = -w / 2 + step * 0.6; x < w / 2 - holeW; x += step) {
        roundRect(ctx, x, -h / 2 + (stripH - holeH) / 2, holeW, holeH, holeW * 0.22); ctx.fill();
        roundRect(ctx, x, h / 2 - stripH + (stripH - holeH) / 2, holeW, holeH, holeW * 0.22); ctx.fill();
      }
      ctx.fillStyle = '#E8A23A';
      ctx.font = `600 ${Math.max(8, stripH * 0.2)}px SwypMono, monospace`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText('SWYP 400', -w / 2 + step * 0.6, h / 2 - stripH * 0.13);
      ctx.textAlign = 'right';
      ctx.fillText('▸ 24', w / 2 - step * 0.6, -h / 2 + stripH * 0.13);
    }
  }

  function drawPlaceholder(ctx, el, r, opts) {
    ctx.save();
    const radius = el.frame && el.frame !== 'none' ? 0 : (el.radius || 0);
    roundRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.fillStyle = opts.dark ? '#26262E' : '#E9E9F0';
    ctx.fill();
    ctx.clip();
    const s = Math.min(r.w, r.h);
    const icon = Math.max(28, Math.min(90, s * 0.16));
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.strokeStyle = opts.dark ? '#6E6E7A' : '#A2A2B0';
    ctx.lineWidth = Math.max(3, icon * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - icon / 2, cy); ctx.lineTo(cx + icon / 2, cy);
    ctx.moveTo(cx, cy - icon / 2); ctx.lineTo(cx, cy + icon / 2);
    ctx.stroke();
    if (s > 260) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `500 ${Math.round(Math.max(24, s * 0.055))}px SwypInter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Tap to add photo', cx, cy + icon * 0.9);
    }
    ctx.restore();
  }

  function drawPhoto(ctx, el, img, r) {
    const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    const zoom = el.zoom || 1;
    const s = Math.max(r.w / iw, r.h / ih) * zoom;
    const dw = iw * s, dh = ih * s;
    const mx = (dw - r.w) / 2, my = (dh - r.h) / 2;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (el.flipX) ctx.scale(-1, 1);
    const css = filterCss(el);
    if (css !== 'none') ctx.filter = css;
    ctx.drawImage(img, -dw / 2 - (el.panX || 0) * mx * (el.flipX ? -1 : 1), -dh / 2 - (el.panY || 0) * my, dw, dh);
    ctx.restore();
  }

  function drawImage(ctx, el, img, opts) {
    const framed = el.frame && el.frame !== 'none';
    if (!img && opts.export) return;
    const r = innerRect(el);
    drawFrameBack(ctx, el);
    if (!framed && img && el.shadow) {
      /* Cast the shadow from a solid copy of the photo's shape; the photo itself is clipped. */
      roundRect(ctx, r.x, r.y, r.w, r.h, el.radius || 0);
      ctx.fillStyle = '#888'; ctx.fill();
    }
    ctx.shadowColor = 'transparent';
    if (!img) { drawPlaceholder(ctx, el, r, opts); return; }
    ctx.save();
    if (framed) { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }
    else roundRect(ctx, r.x, r.y, r.w, r.h, el.radius || 0);
    ctx.clip();
    drawPhoto(ctx, el, img, r);
    ctx.restore();
    if (el.frame === 'polaroid') {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(r.x, r.y, r.w, Math.max(1, el.w * 0.002));
    }
  }

  /* ---------- text ---------- */
  function drawText(ctx, el) {
    const L = layoutText(el);
    ctx.font = textFont(el);
    ctx.fillStyle = el.color || '#111';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const stroke = L.ow > 0 && el.outline;
    if (stroke) { ctx.strokeStyle = el.outline; ctx.lineWidth = L.ow * 2; }

    if (L.curved) {
      ctx.textAlign = 'center';
      setSpacing(ctx, 0);
      const pass = (fn) => L.glyphs.forEach((g) => { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot); fn(g.ch); ctx.restore(); });
      if (stroke) { const sh = ctx.shadowColor; pass((c) => ctx.strokeText(c, 0, 0)); ctx.shadowColor = 'transparent'; pass((c) => ctx.fillText(c, 0, 0)); ctx.shadowColor = sh; }
      else pass((c) => ctx.fillText(c, 0, 0));
      return;
    }

    const w = L.w, h = L.h;
    if (el.bg) {
      ctx.save();
      ctx.fillStyle = el.bg;
      roundRect(ctx, -w / 2 + L.ow, -h / 2 + L.ow, w - L.ow * 2, h - L.ow * 2, el.size * 0.3);
      ctx.fill();
      ctx.restore();
      ctx.shadowColor = 'transparent';
    }
    setSpacing(ctx, (el.tracking || 0) * el.size / 100);
    const align = el.align || 'center';
    ctx.textAlign = 'left';
    const innerW = w - L.padX * 2;
    const pos = L.lines.map((line, i) => {
      let x = -w / 2 + L.padX;
      if (align === 'center') x += (innerW - L.widths[i]) / 2;
      else if (align === 'right') x += innerW - L.widths[i];
      return [line, x, -h / 2 + L.padY + L.lh * (i + 0.5)];
    });
    if (stroke) {
      pos.forEach(([t, x, y]) => ctx.strokeText(t, x, y));
      ctx.shadowColor = 'transparent';
    }
    pos.forEach(([t, x, y]) => ctx.fillText(t, x, y));
    setSpacing(ctx, 0);
  }

  /* ---------- shapes & stickers (unit paths, -0.5..0.5) ---------- */
  function starPath(ctx, n, inner) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? inner : 0.5;
      const a = -Math.PI / 2 + i * Math.PI / n;
      ctx[i ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a));
    }
    ctx.closePath();
  }
  const UNIT_SHAPES = {
    star: (ctx) => starPath(ctx, 5, 0.2),
    burst: (ctx) => starPath(ctx, 14, 0.41),
    sparkle: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, -0.5);
      ctx.quadraticCurveTo(0.05, -0.05, 0.5, 0);
      ctx.quadraticCurveTo(0.05, 0.05, 0, 0.5);
      ctx.quadraticCurveTo(-0.05, 0.05, -0.5, 0);
      ctx.quadraticCurveTo(-0.05, -0.05, 0, -0.5);
      ctx.closePath();
    },
    heart: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, 0.44);
      ctx.bezierCurveTo(-0.08, 0.36, -0.5, 0.1, -0.5, -0.18);
      ctx.bezierCurveTo(-0.5, -0.4, -0.32, -0.5, -0.2, -0.5);
      ctx.bezierCurveTo(-0.08, -0.5, 0, -0.42, 0, -0.32);
      ctx.bezierCurveTo(0, -0.42, 0.08, -0.5, 0.2, -0.5);
      ctx.bezierCurveTo(0.32, -0.5, 0.5, -0.4, 0.5, -0.18);
      ctx.bezierCurveTo(0.5, 0.1, 0.08, 0.36, 0, 0.44);
      ctx.closePath();
    },
    arrow: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-0.5, -0.12); ctx.lineTo(0.12, -0.12); ctx.lineTo(0.12, -0.5); ctx.lineTo(0.5, 0);
      ctx.lineTo(0.12, 0.5); ctx.lineTo(0.12, 0.12); ctx.lineTo(-0.5, 0.12);
      ctx.closePath();
    },
    blob: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0.02, -0.5);
      ctx.bezierCurveTo(0.3, -0.5, 0.5, -0.32, 0.47, -0.04);
      ctx.bezierCurveTo(0.45, 0.24, 0.3, 0.5, 0, 0.47);
      ctx.bezierCurveTo(-0.3, 0.45, -0.5, 0.28, -0.48, 0.0);
      ctx.bezierCurveTo(-0.46, -0.3, -0.26, -0.5, 0.02, -0.5);
      ctx.closePath();
    }
  };

  function drawShape(ctx, el) {
    const { w, h } = el;
    ctx.fillStyle = el.fill || '#111';
    if (UNIT_SHAPES[el.shape]) {
      ctx.save(); ctx.scale(w, h); UNIT_SHAPES[el.shape](ctx); ctx.restore();
      ctx.fill();
      return;
    }
    if (el.shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (el.shape === 'ring') {
      const t = Math.min(w, h) * 0.07;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, w / 2 - t / 2), Math.max(1, h / 2 - t / 2), 0, 0, Math.PI * 2);
      ctx.strokeStyle = el.fill || '#111'; ctx.lineWidth = t; ctx.stroke();
    } else if (el.shape === 'line') {
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else if (el.shape === 'arch') {
      const r = w / 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 2 + r);
      ctx.arc(0, -h / 2 + r, r, Math.PI, 0);
      ctx.lineTo(w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      roundRect(ctx, -w / 2, -h / 2, w, h, el.radius || 0);
      ctx.fill();
    }
  }

  function drawElement(ctx, el, assets, opts) {
    if (el.hidden) return;
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate((el.rot || 0) * Math.PI / 180);
    ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.shadow) {
      const m = el.type === 'text' ? el.size : Math.min(el.w, el.h);
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = m * (el.type === 'text' ? 0.18 : 0.08);
      ctx.shadowOffsetY = m * (el.type === 'text' ? 0.05 : 0.03);
    }
    if (el.type === 'image') drawImage(ctx, el, el.src ? assets.get(el.src) : null, opts);
    else if (el.type === 'text') drawText(ctx, el);
    else if (el.type === 'shape') drawShape(ctx, el);
    ctx.restore();
  }

  /* Draw the whole design in design units. Caller sets up the transform. */
  function drawScene(ctx, p, assets, opts) {
    opts = opts || {};
    const H = FORMATS[p.format].h;
    const totalW = SLIDE_W * p.slides;
    paintBackground(ctx, p, totalW, H);
    p.elements.forEach((el) => drawElement(ctx, el, assets, opts));
  }

  /* Render one slide to a new canvas. */
  function renderSlide(p, assets, index, scale, opts) {
    scale = scale || 1;
    const H = FORMATS[p.format].h;
    const c = document.createElement('canvas');
    c.width = Math.round(SLIDE_W * scale);
    c.height = Math.round(H * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(scale, scale);
    ctx.translate(-index * SLIDE_W, 0);
    drawScene(ctx, p, assets, Object.assign({ export: true }, opts));
    return c;
  }

  window.Render = { SLIDE_W, FORMATS, FONTS, FILTERS, FRAMES, fontById, filterById, filterCss, innerRect, layoutText, fitText, drawScene, drawElement, renderSlide, roundRect };
})();
