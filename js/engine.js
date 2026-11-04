/* MEMENTO layout engine — the part that has to look like someone decided.
   Photos in -> page models out. Every rect is absolute, in page pixels,
   so the DOM preview and the canvas export draw exactly the same thing. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  /* ---------------- deterministic rng ---------------- */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var FORMATS = {
    spread:   { key: 'spread',   w: 1280, h: 853,  label: '跨页' },
    portrait: { key: 'portrait', w: 900,  h: 1200, label: '竖版' },
    square:   { key: 'square',   w: 1080, h: 1080, label: '方版' }
  };

  var SERIF = 'Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", "Times New Roman", serif';
  var SANS = '"Helvetica Neue", "Segoe UI", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

  var STYLES = {
    editorial: {
      key: 'editorial', name: '杂志跨页', note: '大图跨栏 · 衬线标题 · 取色条',
      paper: '#f7f3ea', ink: '#17150f', muted: '#79715f', accent: '#b0452b',
      margin: 0.066, gutter: 0.017, rhythm: [1, 2, 3, 2, 4, 1, 2, 3],
      cover: 'split', swatch: true
    },
    artbook: {
      key: 'artbook', name: '美术生小书', note: '大留白 · 图版编号 · 裁切角标',
      paper: '#f1ece1', ink: '#211e19', muted: '#8a8175', accent: '#8f3b2b',
      margin: 0.112, gutter: 0.032, rhythm: [1, 1, 2, 1, 3, 1, 2],
      cover: 'plate', corners: true
    },
    ins: {
      key: 'ins', name: 'Ins 跨页', note: '整版出血 · 极简 · 图集感',
      paper: '#ffffff', ink: '#0f0f0f', muted: '#8c8c8c', accent: '#c2563c',
      margin: 0.026, gutter: 0.011, rhythm: [1, 2, 1, 2, 2, 1, 3],
      cover: 'bleed',
      // an overlay sticker breaks the "full bleed, nothing on top" language
      recipes: { 2: ['split50', 'split38', 'split62'] }
    },
    film: {
      key: 'film', name: '胶片接触表', note: '全都收进来 · 齿孔 · 深色底',
      paper: '#161514', ink: '#e9e4d8', muted: '#8d877c', accent: '#d2553a',
      margin: 0.048, gutter: 0.012, rhythm: [6, 4, 6, 4],
      cover: 'strip', sprocket: true, perPage: 6
    }
  };

  M.FORMATS = FORMATS;
  M.STYLES = STYLES;

  /* ---------------- geometry helpers (normalised 0..1) ---------------- */
  function vsplit(r, ratio, g) {
    var w1 = r.w * ratio - g / 2, w2 = r.w * (1 - ratio) - g / 2;
    return [
      { x: r.x, y: r.y, w: w1, h: r.h },
      { x: r.x + r.w * ratio + g / 2, y: r.y, w: w2, h: r.h }
    ];
  }
  function hsplit(r, ratio, g) {
    var h1 = r.h * ratio - g / 2, h2 = r.h * (1 - ratio) - g / 2;
    return [
      { x: r.x, y: r.y, w: r.w, h: h1 },
      { x: r.x, y: r.y + r.h * ratio + g / 2, w: r.w, h: h2 }
    ];
  }
  function thirds(r, g) {
    var h = (r.h - 2 * g) / 3;
    return [
      { x: r.x, y: r.y, w: r.w, h: h },
      { x: r.x, y: r.y + h + g, w: r.w, h: h },
      { x: r.x, y: r.y + 2 * (h + g), w: r.w, h: h }
    ];
  }
  function grid(rows, cols, m, g, span) {
    span = span || { x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m };
    var out = [];
    var cw = (span.w - (cols - 1) * g) / cols;
    var ch = (span.h - (rows - 1) * g) / rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        out.push({ x: span.x + c * (cw + g), y: span.y + r * (ch + g), w: cw, h: ch });
      }
    }
    return out;
  }

  /* ---------------- recipe registry ---------------- */
  function B(st) { var m = st.margin; return { x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m }; }

  var RECIPES = {
    1: ['full', 'full', 'boxed'],
    2: ['split62', 'split38', 'split50', 'stack2', 'inset'],
    3: ['top3', 'band3', 'top3'],
    4: ['quad', 'hero3', 'duoPair'],
    5: ['plate5', 'hero5', 'plate5'],
    6: ['hero6', 'strip6', 'contact6'],
    8: ['contact8']
  };

  var MAKERS = {
    full: function (st) { return [{ x: 0, y: 0, w: 1, h: 1 }]; },
    boxed: function (st) {
      var b = B(st);
      return [{ x: b.x + b.w * 0.1, y: b.y + b.h * 0.04, w: b.w * 0.74, h: b.h * 0.74 }];
    },
    split62: function (st) { return vsplit(B(st), 0.62, st.gutter); },
    split38: function (st) { return vsplit(B(st), 0.38, st.gutter); },
    split50: function (st) { return vsplit(B(st), 0.5, st.gutter); },
    stack2: function (st) {
      var b = B(st), top = { x: b.x, y: b.y, w: b.w, h: b.h };
      var p = hsplit(top, 0.66, st.gutter);
      return p;
    },
    inset: function (st) {
      var big = { x: 0, y: 0, w: 1, h: 1 };
      var small = { x: 0.6, y: 0.585, w: 0.315, h: 0.29, rot: -2.4, paper: true, z: 3 };
      return [big, small];
    },
    hero2: function (st) {
      var b = B(st), p = vsplit(b, 0.645, st.gutter);
      return [p[0], p[1]];
    },
    top3: function (st) {
      var b = B(st), cut = 0.55;
      var top = { x: 0, y: 0, w: 1, h: cut };
      var bot = { x: b.x, y: cut + st.gutter, w: b.w, h: 1 - b.y - (cut + st.gutter) };
      var p = vsplit(bot, 0.58, st.gutter);
      return [top, p[0], p[1]];
    },
    band3: function (st) {
      // hero on the left, two stacked on the right — no dead column
      var b = B(st), p = vsplit(b, 0.63, st.gutter);
      var q = hsplit(p[1], 0.5, st.gutter);
      return [p[0], q[0], q[1]];
    },
    quad: function (st) {
      var b = B(st), p = vsplit(b, 0.575, st.gutter);
      var L = hsplit(p[0], 0.62, st.gutter);
      var R = hsplit(p[1], 0.38, st.gutter);
      return [L[0], L[1], R[0], R[1]];
    },
    hero3: function (st) {
      var b = B(st), p = vsplit(b, 0.63, st.gutter);
      var t = thirds(p[1], st.gutter);
      return [p[0], t[0], t[1], t[2]];
    },
    duoPair: function (st) {
      var b = B(st), rows = hsplit(b, 0.5, st.gutter);
      var a = vsplit(rows[0], 0.68, st.gutter);
      var c = vsplit(rows[1], 0.32, st.gutter);
      return [a[0], a[1], c[0], c[1]];
    },
    contact6: function (st) { return grid(2, 3, st.margin, st.gutter); },
    /* six as a plate page: one big, two right, three under — not a contact sheet */
    hero6: function (st) {
      var b = B(st), g = st.gutter;
      var bigW = b.w * 0.62 - g / 2;
      var rightX = b.x + b.w * 0.62 + g / 2, rightW = b.w * 0.38 - g / 2;
      var splitY = b.h * 0.6;
      var big = { x: b.x, y: b.y, w: bigW, h: splitY - g / 2 };
      var r1 = { x: rightX, y: b.y, w: rightW, h: splitY * 0.5 - g / 2 };
      var r2 = { x: rightX, y: b.y + splitY * 0.5 + g / 2, w: rightW, h: splitY * 0.5 - g / 2 };
      var by = b.y + splitY + g / 2, bh = b.h - splitY - g / 2, cw = (b.w - 2 * g) / 3;
      return [big, r1, r2,
        { x: b.x, y: by, w: cw, h: bh },
        { x: b.x + cw + g, y: by, w: cw, h: bh },
        { x: b.x + 2 * (cw + g), y: by, w: cw, h: bh }];
    },
    contact8: function (st) { return grid(2, 4, st.margin, st.gutter); },
    /* five on a square page: two up top, three below — no cell narrower than 3:4 */
    plate5: function (st) {
      var b = B(st), g = st.gutter;
      var hTop = b.h * 0.545 - g / 2, hBot = b.h * 0.455 - g / 2;
      var top = vsplit({ x: b.x, y: b.y, w: b.w, h: hTop }, 0.5, g);
      var y2 = b.y + b.h * 0.545 + g / 2;
      var cw = (b.w - 2 * g) / 3;
      var bot = [0, 1, 2].map(function (i) {
        return { x: b.x + i * (cw + g), y: y2, w: cw, h: hBot };
      });
      return top.concat(bot);
    },
    /* five: tall hero + four stacked, all landscape-friendly */
    hero5: function (st) {
      var b = B(st), g = st.gutter, p = vsplit(b, 0.62, g);
      var col = p[1], h = (col.h - 3 * g) / 4, out = [p[0]];
      for (var i = 0; i < 4; i++) out.push({ x: col.x, y: col.y + i * (h + g), w: col.w, h: h });
      return out;
    },
    strip6: function (st) {
      // 3 across, 2 down, but the top row shorter — a contact sheet with a rhythm
      var b = B(st);
      var top = grid(1, 3, st.margin, st.gutter, { x: b.x, y: b.y, w: b.w, h: b.h * 0.42 });
      var bot = grid(1, 3, st.margin, st.gutter, { x: b.x, y: b.y + b.h * 0.42 + st.gutter, w: b.w, h: b.h * 0.58 - st.gutter });
      return top.concat(bot);
    }
  };

  /* ---------------- text ---------------- */
  var mctx = null;
  function measure() {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    return mctx;
  }
  function wrap(text, font, maxW) {
    var ctx = measure(); ctx.font = font;
    var lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      var test = cur + ch;
      if (cur && ctx.measureText(test).width > maxW) {
        var sp = cur.lastIndexOf(' ');
        if (sp > 0 && /[A-Za-z0-9]/.test(ch)) { lines.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; }
        else { lines.push(cur); cur = ch; }
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }
  function txt(o) {
    var size = o.size, weight = o.weight || 400, family = o.family || SERIF;
    var font = (o.italic ? 'italic ' : '') + weight + ' ' + size + 'px ' + family;
    var lines = o.text ? (o.wrap ? wrap(o.text, font, o.wrap) : String(o.text).split('\n')) : [''];
    return {
      x: o.x, y: o.y, w: o.w || 400,
      lines: lines, size: size, family: family, weight: weight,
      italic: !!o.italic,
      color: o.color || '#000', align: o.align || 'left',
      tracking: o.tracking || 0, lineHeight: o.lineHeight || 1.25,
      opacity: o.opacity == null ? 1 : o.opacity, rot: o.rot || 0
    };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- crop ---------------- */
  function cropFor(photo, fw, fh) {
    var pw = photo.w, ph = photo.h, target = fw / fh;
    var sw, sh;
    if (pw / ph > target) { sh = ph; sw = ph * target; } else { sw = pw; sh = pw / target; }
    var fx = photo.focal ? photo.focal.x : .5, fy = photo.focal ? photo.focal.y : .5;
    // keep the focal point a little above the middle of the crop: a face needs air
    // above it, and centring on a focal point at the chest is how heads get cut
    var bias = (sh < ph - 0.5) ? 0.44 : 0.5;
    var sx = Math.max(0, Math.min(pw - sw, fx * pw - sw / 2));
    var sy = Math.max(0, Math.min(ph - sh, fy * ph - sh * bias));
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }
  M.cropFor = cropFor;

  /* ---------------- photo ordering ---------------- */
  function orderPhotos(photos, plan, rand) {
    var arr = photos.slice();
    if (plan === 'story') return arr;
    if (plan === 'colour') {
      arr.forEach(function (p) { p._hue = p.hue == null ? 0 : p.hue; });
      arr.sort(function (a, b) {
        var ha = Math.floor(a._hue / 40), hb = Math.floor(b._hue / 40);
        return (ha - hb) || (a.bright - b.bright);
      });
      return arr;
    }
    arr.sort(function (a, b) { return (b.hero + rand() * 0.18) - (a.hero + rand() * 0.18); });
    return arr;
  }

  /* ---------------- assignment ---------------- */
  function assign(slots, pool, style, rand, pageAR) {
    var items = slots.map(function (s, i) {
      return { s: s, i: i, area: s.w * s.h };
    }).sort(function (a, b) { return b.area - a.area; });

    var left = pool.slice();
    var out = new Array(slots.length);
    var heroHue = null;

    // normalise hero score inside this pool so ranking, not absolute values, decides
    var sorted = pool.slice().sort(function (a, b) { return a.hero - b.hero; });
    sorted.forEach(function (p, i) { p._rank = sorted.length > 1 ? i / (sorted.length - 1) : 1; });

    items.forEach(function (item, rank) {
      if (!left.length) return;
      var s = item.s;
      var slotAR = (s.w * pageAR) / s.h;
      var isHero = rank === 0;
      var best = -1e9, bestP = left[0];
      for (var k = 0; k < left.length; k++) {
        var p = left[k];
        var arOff = Math.abs(Math.log((p.ar || 1) / slotAR));
        var arFit = Math.max(0, 1 - arOff / Math.log(3.2));
        var heroTerm = isHero ? p._rank * 1.05 : (1 - p._rank) * 0.34;
        var coh = 0;
        if (heroHue != null && p.hue != null) coh = (1 - M.hueDist(p.hue, heroHue)) * 0.42;
        var edge = 0;
        // a photo that bleeds off the page should be wide enough on that axis
        if (isHero && s.w > 0.95 && slotAR > 1 && p.ar < 0.9) edge = -0.22;
        var score = arFit * (isHero ? 0.62 : 0.92) + heroTerm + coh + edge + rand() * 0.16;
        if (score > best) { best = score; bestP = p; }
      }
      out[item.i] = bestP;
      if (isHero) heroHue = bestP.hue;
      left.splice(left.indexOf(bestP), 1);
    });
    for (var i = 0; i < out.length; i++) if (!out[i]) out[i] = pool[i % pool.length];
    return out;
  }

  /* ---------------- page assembly ---------------- */
  function newPage(fmt, st) {
    return {
      w: fmt.w, h: fmt.h, bg: st.paper, ink: st.ink, muted: st.muted,
      accent: st.accent, style: st.key, frames: [], rects: [], texts: []
    };
  }

  function addFrames(page, slots, photos) {
    slots.forEach(function (s, i) {
      var p = photos[i];
      if (!p) return;
      var x = s.x * page.w, y = s.y * page.h, w = s.w * page.w, h = s.h * page.h;
      var pad = s.paper ? Math.round(Math.min(page.w, page.h) * 0.014) : 0;
      var iw = w - pad * 2, ih = h - pad * 2;
      page.frames.push({
        photo: p, x: x, y: y, w: w, h: h, pad: pad,
        crop: cropFor(p, iw, ih),
        rot: s.rot || 0, z: s.z || 1
      });
    });
  }

  function addSprockets(page, st) {
    if (!st.sprocket) return;
    var n = 14, gap = 6, hh = 5;
    var usable = page.w - st.margin * page.w * 2;
    var bw = Math.max(4, (usable - (n - 1) * gap) / n);
    for (var i = 0; i < n; i++) {
      var x = st.margin * page.w + i * (bw + gap);
      page.rects.push({ x: x, y: page.h * 0.018, w: bw, h: hh, fill: st.ink, opacity: 0.16, z: 1, radius: 1 });
      page.rects.push({ x: x, y: page.h * 0.982 - hh, w: bw, h: hh, fill: st.ink, opacity: 0.16, z: 1, radius: 1 });
    }
  }

  function rgbOf(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  /* Three chips from the photo, drawn only when they actually differ —
     three near-identical squares read as a rendering bug. */
  function swatchRow(page, x, y, colors, size, fromRight) {
    colors = (colors || []).slice(0, 3);
    if (colors.length < 2) return;
    for (var i = 0; i < colors.length; i++) {
      for (var j = i + 1; j < colors.length; j++) {
        var a = rgbOf(colors[i]), b = rgbOf(colors[j]);
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 46) return;
      }
    }
    var g = Math.round(size * 0.34);
    var total = colors.length * size + (colors.length - 1) * g;
    var x0 = fromRight ? x - total : x;
    colors.forEach(function (c, k) {
      page.rects.push({ x: x0 + k * (size + g), y: y, w: size, h: size, fill: c, z: 3, stroke: true });
    });
  }

  function coversCorner(page, x, y) {
    for (var i = 0; i < page.frames.length; i++) {
      var f = page.frames[i];
      if (x >= f.x - 2 && x <= f.x + f.w + 2 && y >= f.y - 2 && y <= f.y + f.h + 2) return true;
    }
    return false;
  }

  function addCorners(page, f, color) {
    var len = Math.min(22, Math.min(f.w, f.h) * 0.16), off = 7, t = 1;
    var corners = [
      [f.x - off, f.y - off, 1, 1], [f.x + f.w + off, f.y - off, -1, 1],
      [f.x - off, f.y + f.h + off, 1, -1], [f.x + f.w + off, f.y + f.h + off, -1, -1]
    ];
    corners.forEach(function (c) {
      page.rects.push({ x: c[0], y: c[1], w: len * c[2], h: t, fill: color, opacity: .55, z: 1 });
      page.rects.push({ x: c[0], y: c[1], w: t, h: len * c[3], fill: color, opacity: .55, z: 1 });
    });
  }

  function decorate(page, st, fmt, num, total, title) {
    var m = st.margin * page.w;
    var bottomY = page.h - m * 0.5;
    var overPhoto = coversCorner(page, m, page.h - m * 0.5);
    var color = overPhoto ? '#ffffff' : st.muted;

    if (st.key === 'artbook') {
      page.texts.push(txt({
        x: m, y: m * 0.34, w: page.w - 2 * m, size: Math.round(page.w * 0.0135),
        color: st.muted, tracking: 2.4, text: 'PLATE ' + pad2(num), family: SANS
      }));
      page.texts.push(txt({
        x: m, y: page.h - m * 0.62, w: page.w - 2 * m, size: Math.round(page.w * 0.0125),
        color: overPhoto ? 'rgba(255,255,255,.75)' : st.muted, tracking: 0.6,
        text: title + '  ·  ' + pad2(num) + ' / ' + pad2(total), family: SANS
      }));
      var big = page.frames.slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
      if (big) addCorners(page, big, st.muted);
    } else if (st.key === 'editorial') {
      if (overPhoto) {
        page.rects.push({ x: 0, y: page.h - page.h * 0.13, w: page.w, h: page.h * 0.13, fill: '#000', opacity: .40, z: 2, scrim: 'up' });
      }
      page.texts.push(txt({
        x: m, y: bottomY - page.h * 0.016, w: page.w * 0.5, size: Math.round(page.w * 0.0135),
        color: color, tracking: 1.4, text: title.toUpperCase(), family: SANS
      }));
      page.texts.push(txt({
        x: m, y: bottomY - page.h * 0.016 + page.w * 0.017, w: page.w * 0.5,
        size: Math.round(page.w * 0.0125), color: color, tracking: 0.8,
        text: pad2(num) + ' — ' + pad2(total), opacity: .8, family: SANS
      }));
      // colour chips from the page's hero
      var hero = page.frames[0];
      if (hero && st.swatch) {
        var swz = Math.round(page.w * 0.016);
        swatchRow(page, page.w - m, bottomY - page.h * 0.016, hero.photo.colors, swz, true);
      }
    } else if (st.key === 'ins') {
      page.texts.push(txt({
        x: m + page.w * 0.02, y: page.h - m - page.w * 0.03, w: page.w * 0.6,
        size: Math.round(page.w * 0.019), color: '#ffffff', tracking: 0.4,
        text: pad2(num), family: SANS, opacity: .85
      }));
      if (overPhoto) {
        page.rects.push({ x: 0, y: page.h - page.h * 0.14, w: page.w, h: page.h * 0.14, fill: '#000', opacity: .42, z: 2, scrim: 'up' });
      }
    } else if (st.key === 'film') {
      page.texts.push(txt({
        x: m, y: page.h - m * 0.95, w: page.w - 2 * m, size: Math.round(page.w * 0.0128),
        color: st.muted, tracking: 2, text: pad2(num) + ' / ' + pad2(total) + '      ' + title.toUpperCase(),
        family: SANS
      }));
    }
  }

  /* ---------------- covers ---------------- */
  function buildCover(st, fmt, photos, opt) {
    var page = newPage(fmt, st);
    var tall = fmt.h > fmt.w;
    var W = page.w, H = page.h;
    var title = opt.title || '未命名的一卷';
    var count = opt.total + ' 张照片';

    if (st.cover === 'split') {
      var pw = tall ? W : W * 0.55;
      var ph = tall ? H * 0.66 : H;
      var fx = tall ? 0 : W - pw, fy = 0;
      page.frames.push({ photo: photos[0], x: fx, y: fy, w: pw, h: ph, pad: 0, crop: cropFor(photos[0], pw, ph), rot: 0, z: 1 });
      var tx = tall ? W * 0.085 : W * 0.066;
      var tw = tall ? W * 0.80 : W * 0.40;
      var ty = tall ? ph + H * 0.075 : H * 0.28;
      page.texts.push(txt({
        x: tx, y: ty - H * 0.055, w: tw,
        size: Math.round(W * 0.0155), color: st.muted, tracking: 2.6,
        text: 'PHOTO BOOK  ·  ' + opt.year, family: SANS
      }));
      var titleSize = Math.round(W * (tall ? 0.085 : 0.07));
      var titleT = txt({
        x: tx, y: ty, w: tw, size: titleSize,
        color: st.ink, text: title, family: SERIF, lineHeight: 1.06, wrap: tw, tracking: -0.5
      });
      var footY = H - H * 0.072;
      // never let a long title run into the footer
      for (var guard = 0; guard < 3; guard++) {
        var blockH = titleT.lines.length * titleSize * 1.06;
        if (ty + blockH + H * 0.055 < footY - H * 0.06) break;
        titleSize = Math.round(titleSize * 0.88);
        titleT = txt({
          x: tx, y: ty, w: tw, size: titleSize,
          color: st.ink, text: title, family: SERIF, lineHeight: 1.06, wrap: tw, tracking: -0.5
        });
      }
      page.texts.push(titleT);
      var ruleY = ty + titleT.lines.length * titleSize * 1.06 + H * 0.038;
      page.rects.push({ x: tx, y: ruleY, w: (tall ? W * 0.30 : W * 0.18), h: 1, fill: st.ink, opacity: .45, z: 2 });
      page.texts.push(txt({
        x: tx, y: footY - H * 0.005, w: W * 0.4, size: Math.round(W * 0.0145),
        color: st.muted, tracking: 0.8, text: count, family: SANS
      }));
      swatchRow(page, tall ? W * 0.085 + W * 0.30 : tx, footY - H * 0.005, photos[0].colors, Math.round(W * 0.022), false);
    } else if (st.cover === 'plate') {
      var bx = W * 0.175, by = H * 0.115, bw = W * 0.65, bh = tall ? H * 0.52 : H * 0.56;
      var pp = photos[0];
      var pad = Math.round(Math.min(W, H) * 0.02);
      page.frames.push({
        photo: pp, x: bx, y: by, w: bw, h: bh, pad: pad,
        crop: cropFor(pp, bw - pad * 2, bh - pad * 2), rot: 0, z: 2
      });
      page.rects.push({ x: bx + pad * 0.55, y: by + pad * 0.55, w: bw, h: bh, fill: '#e2dbc9', opacity: .85, z: 1 });
      var cy = by + bh + H * 0.075;
      page.texts.push(txt({
        x: W * 0.16, y: cy - H * 0.042, w: W * 0.68, size: Math.round(W * 0.0135),
        color: st.muted, tracking: 3.2, align: 'center', text: 'A SMALL BOOK', family: SANS
      }));
      page.texts.push(txt({
        x: W * 0.14, y: cy, w: W * 0.72, size: Math.round(W * 0.085), color: st.ink,
        text: title, family: SERIF, align: 'center', lineHeight: 1.08, wrap: W * 0.72, tracking: -0.6
      }));
      page.texts.push(txt({
        x: W * 0.14, y: H - H * 0.115, w: W * 0.72, size: Math.round(W * 0.0135),
        color: st.muted, tracking: 2, align: 'center', text: count + '  ·  ' + opt.year, family: SANS
      }));
    } else if (st.cover === 'bleed') {
      var pp2 = photos[0];
      page.frames.push({ photo: pp2, x: 0, y: 0, w: W, h: H, pad: 0, crop: cropFor(pp2, W, H), rot: 0, z: 1 });
      page.rects.push({ x: 0, y: H * 0.56, w: W, h: H * 0.44, fill: '#000', opacity: .55, z: 2, scrim: 'up' });
      page.texts.push(txt({
        x: W * 0.08, y: H * 0.80, w: W * 0.84, size: Math.round(W * 0.062),
        color: '#ffffff', text: title, family: SERIF, lineHeight: 1.14, wrap: W * 0.84, tracking: -0.4
      }));
      page.texts.push(txt({
        x: W * 0.08, y: H * 0.905, w: W * 0.84, size: Math.round(W * 0.0145),
        color: 'rgba(255,255,255,.82)', tracking: 1.6, text: count + '   ·   ' + opt.year, family: SANS
      }));
    } else if (st.cover === 'strip') {
      var n = Math.min(4, photos.length);
      var m = st.margin * W, g = st.gutter * W;
      var cw = (W - 2 * m - (n - 1) * g) / n;
      var ch = cw * 0.72;
      addSprockets(page, st);
      var kick = H * 0.085;
      page.texts.push(txt({
        x: m, y: kick, w: W - 2 * m, size: Math.round(W * 0.0132),
        color: st.muted, tracking: 3, text: 'CONTACT SHEET  ·  ' + opt.year, family: SANS
      }));
      var tStrip = txt({
        x: m, y: kick + H * 0.05, w: W - 2 * m, size: Math.round(W * 0.082),
        color: st.ink, text: title, family: SERIF, lineHeight: 1.1, wrap: W - 2 * m, tracking: -0.5
      });
      page.texts.push(tStrip);
      var stripY = Math.max(H * 0.40, kick + H * 0.05 + tStrip.lines.length * W * 0.09 + H * 0.06);
      var ch2 = Math.min(cw * 0.95, H * 0.26);
      for (var k2 = 0; k2 < n; k2++) {
        var pk = photos[k2];
        page.frames.push({
          photo: pk, x: m + k2 * (cw + g), y: stripY, w: cw, h: ch2, pad: 0,
          crop: cropFor(pk, cw, ch2), rot: 0, z: 1
        });
      }
      page.texts.push(txt({
        x: m, y: H - H * 0.10, w: W - 2 * m, size: Math.round(W * 0.014),
        color: st.muted, tracking: 1.6, text: count + '   ·   ' + opt.year, family: SANS
      }));
    }
    return page;
  }

  /* ---------------- content page ---------------- */
  function buildContent(st, fmt, photos, num, total, title, rand) {
    var page = newPage(fmt, st);
    var pageAR = page.w / page.h;
    var pool = (st.recipes && st.recipes[photos.length]) || RECIPES[photos.length] || RECIPES[1];
    var key = pool[Math.floor(rand() * pool.length)];
    var maker = MAKERS[key] || MAKERS.full;
    var slots = maker(st);
    // a recipe that does not make exactly one frame per photo would silently drop one
    if (slots.length !== photos.length) {
      for (var mi = 0; mi < pool.length; mi++) {
        var alt = MAKERS[pool[mi]](st);
        if (alt && alt.length === photos.length) { slots = alt; key = pool[mi]; break; }
      }
      if (slots.length !== photos.length) {
        slots = photos.map(function () { return { x: 0, y: 0, w: 1, h: 1 }; });
        key = 'full';
      }
    }
    var chosen = assign(slots, photos, st, rand, pageAR);
    addFrames(page, slots, chosen);
    addSprockets(page, st);
    decorate(page, st, fmt, num, total, title);
    page.recipe = key;
    return page;
  }

  /* ---------------- page plan ---------------- */
  /* Exact page count: split n photos over k pages using only counts that have a
     recipe. Without this a 40-photo, 9-page book drags a lonely 2-photo page. */
  function planExact(n, k, allowed) {
    if (k <= 0) return n === 0 ? [] : null;
    var lo = allowed[0], hi = allowed[allowed.length - 1];
    if (n < k * lo || n > k * hi) return null;
    var memo = {};
    function go(rem, parts) {
      if (parts === 0) return rem === 0 ? [] : null;
      var key = rem + ':' + parts;
      if (key in memo) return memo[key];
      for (var i = allowed.length - 1; i >= 0; i--) {
        var a = allowed[i];
        if (rem - a < (parts - 1) * lo || rem - a > (parts - 1) * hi) continue;
        var sub = go(rem - a, parts - 1);
        if (sub) { memo[key] = [a].concat(sub); return memo[key]; }
      }
      memo[key] = null;
      return null;
    }
    return go(n, k);
  }

  /* big / small alternating so no two dense pages follow each other */
  function rhythmise(list) {
    var a = list.slice().sort(function (x, y) { return y - x; });
    var out = [], small = true;
    while (a.length) {
      out.push(small ? a.pop() : a.shift());
      small = !small;
    }
    return out;
  }

  /* A page that cannot be laid out (no recipe for its photo count) is merged into
     its neighbour, or split — never left as a lonely 2-photo contact sheet. */
  function fitCounts(counts) {
    var out = counts.slice();
    for (var pass = 0; pass < 4; pass++) {
      var changed = false;
      for (var i = out.length - 1; i >= 0; i--) {
        if (RECIPES[out[i]]) continue;
        if (i > 0 && RECIPES[out[i - 1] + out[i]]) {
          out[i - 1] += out[i]; out.splice(i, 1); changed = true; continue;
        }
        if (i < out.length - 1 && RECIPES[out[i] + out[i + 1]]) {
          out[i + 1] += out[i]; out.splice(i, 1); changed = true; continue;
        }
        if (out[i] > 1) {
          var hi = Math.ceil(out[i] / 2), lo = Math.floor(out[i] / 2);
          out.splice(i, 1, hi, lo); changed = true;
        }
      }
      if (!changed) break;
    }
    return out;
  }

  /* ---------------- public build ---------------- */
  M.build = function (photos, opt) {
    var st = STYLES[opt.style] || STYLES.editorial;
    var fmt = FORMATS[opt.format] || FORMATS.portrait;
    var rand = rng(opt.seed || 7);
    var list = photos.filter(function (p) { return p && p.img && p.w && p.h; });
    if (!list.length) return { pages: [], style: st, format: fmt };

    var ordered = orderPhotos(list, opt.plan || 'hero', rand);
    // the cover needs the strongest photo; keep the narrative order otherwise
    var coverIdx = 0, bestHero = -1;
    if (opt.plan === 'story') {
      coverIdx = 0;
    } else {
      for (var i = 0; i < Math.min(ordered.length, 6); i++) {
        if (ordered[i].hero > bestHero) { bestHero = ordered[i].hero; coverIdx = i; }
      }
    }
    var coverPhotos = ordered.splice(coverIdx, 1);
    // contact-sheet cover wants a few frames
    if (st.cover === 'strip') {
      for (var j = 0; j < 3 && ordered.length; j++) coverPhotos.push(ordered.shift());
    }

    var pages = [];
    pages.push(buildCover(st, fmt, coverPhotos, {
      title: opt.title, year: opt.year, total: list.length
    }));

    var counts = [];
    var remaining = ordered.length;

    if (opt.pages && opt.pages > 1) {
      var allowed = Object.keys(RECIPES).map(Number).sort(function (a, b) { return a - b; });
      // stay near the average: a 9-page book of one-photo and eight-photo pages
      // is a plan, not a rhythm
      var avg = remaining / (opt.pages - 1);
      var mid = allowed.filter(function (a) {
        return a >= Math.max(2, Math.floor(avg)) && a <= Math.min(6, Math.ceil(avg) + 1);
      });
      var plan = planExact(remaining, opt.pages - 1, mid.length ? mid : allowed);
      counts = plan ? rhythmise(plan) : [];
    }

    if (!counts.length) {
      if (st.perPage) {
        // contact-sheet styles fill pages evenly — pick the page count whose
        // per-page numbers all have a real recipe
        var start = Math.max(1, Math.ceil(remaining / st.perPage));
        var found = null;
        for (var k = start; k <= Math.max(1, remaining); k++) {
          var b2 = Math.floor(remaining / k), ex = remaining % k, trial = [];
          for (var t = 0; t < k; t++) trial.push(b2 + (t < ex ? 1 : 0));
          if (trial.every(function (c) { return !!RECIPES[c]; })) { found = trial; break; }
        }
        counts = found || [remaining];
      } else {
        var ri = 0;
        while (remaining > 0) {
          var want = st.rhythm[ri % st.rhythm.length];
          var take = Math.min(want, remaining);
          counts.push(take);
          remaining -= take;
          ri++;
        }
      }
    }
    counts = fitCounts(counts);

    var total = counts.length;
    var idx = 0;
    counts.forEach(function (n, i) {
      var chunk = ordered.slice(idx, idx + n);
      idx += n;
      if (!chunk.length) return;
      pages.push(buildContent(st, fmt, chunk, i + 1, total, opt.title, rand));
    });

    pages.forEach(function (p, i) { p.index = i; });
    return { pages: pages, style: st, format: fmt, counts: counts };
  };

  M.recipeNames = RECIPES;
})(window.MEM);
