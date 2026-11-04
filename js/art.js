/* Art direction engine (experimental, additive).
   1. profile(photos)   — what these photos actually look like, measured
   2. direction(profile) — one book-level decision, with reasons
   3. compose(...)       — pages built from parameterised families, not templates

   Nothing here replaces compose.js; the old engine keeps working. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var PW = 1080, PH = 1440;
  var SERIF = 'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", serif';
  var GROTESK = '"Helvetica Neue", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
  var INK = '#17150f', MUTED = '#8a8272', PAPER = '#f7f4ec';

  /* ---------------- tiny deterministic rng ---------------- */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngFrom(seed) {
    var a = hashStr(String(seed)) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function spread(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[a.length - 1] - a[0];
  }

  /* ---------------- colour helpers ---------------- */
  function hex2hsl(hex) {
    if (!hex || hex[0] !== '#') return null;
    var h = hex.length === 4 ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex;
    var r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hue = 0;
    if (mx !== mn) {
      var dd = mx - mn;
      s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      if (mx === r) hue = ((g - b) / dd + (g < b ? 6 : 0)) / 6;
      else if (mx === g) hue = ((b - r) / dd + 2) / 6;
      else hue = ((r - g) / dd + 4) / 6;
    }
    return { h: hue * 360, s: s, l: l };
  }

  /* ---------------- 1. the profile ----------------
     The engine's old per-photo numbers (sat ×1.5, detail ×3.2) saturate on real
     photos — 38 frames all came back as contrast 1 / busy 1. So this measures a
     fresh 96px fingerprint per photo: absolute values, comparable across books. */
  function finger(p) {
    if (p.__fp) return p.__fp;
    var W = 96, H = Math.max(8, Math.round(W / (p.ar || 1)));
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(p.img, 0, 0, W, H);
    var d = ctx.getImageData(0, 0, W, H).data;
    var n = W * H;
    var lum = new Float32Array(n);
    var sSum = 0, warmSum = 0, edge = 0;
    for (var i = 0, k = 0; i < n; i++, k += 4) {
      var r = d[k] / 255, g = d[k + 1] / 255, b = d[k + 2] / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var l = mx === mn ? 0 : (mx + mn) / 2;
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      sSum += mx === 0 ? 0 : (mx - mn) / mx;
      warmSum += (r - b);
    }
    for (var y = 1; y < H; y++) {
      for (var x = 1; x < W; x++) {
        var idx = y * W + x;
        edge += Math.abs(lum[idx] - lum[idx - 1]) + Math.abs(lum[idx] - lum[idx - W]);
      }
    }
    var sl = Array.prototype.slice.call(lum).sort(function (a, b) { return a - b; });
    var q = function (t) { return sl[Math.min(sl.length - 1, Math.floor(t * sl.length))]; };
    var fp = {
      l: q(0.5),
      contrast: q(0.95) - q(0.05),
      sat: sSum / n,
      warm: warmSum / n,
      busy: Math.min(1, (edge / ((W - 1) * (H - 1))) / 0.16)
    };
    p.__fp = fp;
    return fp;
  }

  function profile(photos) {
    var list = photos.filter(function (p) { return p && p.img; });
    var fps = list.map(finger);
    var n = list.length || 1;

    function med(a) { return median(a); }
    var sats = fps.map(function (f) { return f.sat; });
    var brights = fps.map(function (f) { return f.l; });
    var contrasts = fps.map(function (f) { return f.contrast; });
    var busys = fps.map(function (f) { return f.busy; });
    var warms = fps.map(function (f) { return f.warm; });

    var aspect = { portrait: 0, landscape: 0, square: 0 };
    list.forEach(function (p) {
      var ar = p.ar || 1;
      if (ar > 1.15) aspect.landscape++;
      else if (ar < 0.87) aspect.portrait++;
      else aspect.square++;
    });

    var p2 = {
      n: list.length,
      aspect: aspect,
      warmCool: med(warms) * 6,                          // -1 cold .. +1 warm
      sat: { median: med(sats), spread: spread(sats) },
      bright: { median: med(brights), spread: spread(brights) },
      contrast: med(contrasts),                          // 0–1 luminance spread
      busy: med(busys),                                  // 0 quiet .. 1 packed with detail
      heroTop: list.slice().sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); })
        .slice(0, 3).map(function (x) { return x.name || x.id; })
    };

    /* colour families: photos that would sit well on one page */
    var clusters = [];
    list.forEach(function (ph) {
      var hsl = hex2hsl((ph.colors && ph.colors[0]) || '#888888');
      var band = hsl ? Math.floor(hsl.h / 45) * 45 : 0;
      var l = hsl ? hsl.l : 0.5;
      var slot = clusters.filter(function (c) {
        return Math.abs(c.band - band) <= 45 && Math.abs(c.l - l) < 0.24;
      })[0];
      if (!slot) clusters.push({ band: band, l: l, photos: [ph] });
      else slot.photos.push(ph);
    });
    clusters = clusters.filter(function (c) { return c.photos.length > 1; })
      .sort(function (a, b) { return b.photos.length - a.photos.length; });
    p2.clusters = clusters.slice(0, 4).map(function (c) {
      return { band: c.band, n: c.photos.length, ids: c.photos.map(function (x) { return x.id; }) };
    });
    p2.stars = list.slice().sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); })
      .slice(0, Math.max(1, Math.round(n * 0.15))).map(function (x) { return x.id; });

    return p2;
  }

  /* ---------------- 2. the direction ---------------- */
  function direction(p) {
    var reasons = [];
    var temp, density, families, type, color, align, margins;

    // colour saturation decides first (it is what the eye reads as "quiet" or
    // "loud"); busy-ness only moves the density curve, never the temperament.
    var quiet = p.sat.median < 0.26;
    var loud = p.sat.median > 0.36;
    var cinematic = !quiet && !loud && p.contrast > 0.74;

    if (cinematic && !loud) temp = 'cinematic';
    else if (loud) temp = 'loud';
    else if (quiet) temp = 'quiet';
    else temp = p.warmCool > 0.15 ? 'warm' : 'clinical';

    reasons.push({ k: '气质', v: temp, why:
      '饱和度中位 ' + p.sat.median.toFixed(2) + '（' + (p.sat.median > 0.36 ? '高' : p.sat.median < 0.26 ? '低' : '中') +
      '）· 繁忙度 ' + p.busy.toFixed(2) + ' · 明暗跨度 ' + p.contrast.toFixed(2) +
      ' · 冷暖 ' + p.warmCool.toFixed(2) });

    var PRESET = {
      quiet: {
        density: [1, 1, 2, 1, 3, 1, 2, 1], fam: { single: .34, diptych: .18, wall: .14, strip: .12, type: .18, collage: .04 },
        type: { face: 'serif', scale: 1.16, tracking: 2 }, color: 'unify-muted', align: 'offset',
        margins: { outer: 126, gutter: 26 }
      },
      loud: {
        density: [3, 4, 5, 3, 5, 2, 4, 3], fam: { single: .12, diptych: .10, wall: .30, strip: .18, type: .06, collage: .24 },
        type: { face: 'grotesk', scale: 1.0, tracking: 0 }, color: 'as-is', align: 'strict',
        margins: { outer: 68, gutter: 14 }
      },
      cinematic: {
        density: [1, 2, 1, 4, 1, 3, 1, 2], fam: { single: .30, diptych: .16, wall: .10, strip: .22, type: .12, collage: .10 },
        type: { face: 'serif', scale: 1.28, tracking: 1 }, color: 'accent-only', align: 'bleed',
        margins: { outer: 96, gutter: 20 }
      },
      warm: {
        density: [2, 2, 3, 2, 3, 2, 3, 2], fam: { single: .24, diptych: .20, wall: .22, strip: .14, type: .12, collage: .08 },
        type: { face: 'serif', scale: 1.1, tracking: 1 }, color: 'unify-muted', align: 'offset',
        margins: { outer: 104, gutter: 22 }
      },
      clinical: {
        density: [2, 3, 2, 3, 2, 3, 2, 3], fam: { single: .20, diptych: .22, wall: .24, strip: .16, type: .12, collage: .06 },
        type: { face: 'grotesk', scale: 0.96, tracking: 3 }, color: 'as-is', align: 'strict',
        margins: { outer: 84, gutter: 18 }
      }
    };
    var pre = PRESET[temp];
    density = pre.density.slice();
    // a packed set pushes density up one notch; an airy set pulls it down one
    var shift = p.busy > 0.72 ? 1 : p.busy < 0.34 ? -1 : 0;
    if (shift) density = density.map(function (lv) { return Math.max(1, Math.min(5, lv + shift)); });
    families = pre.fam;
    type = { face: pre.type.face, scale: pre.type.scale, tracking: pre.type.tracking };
    color = pre.color;
    align = pre.align;
    margins = pre.margins;

    /* the page count follows the photos, never a fixed template length */
    var perPage = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
    var avg = density.reduce(function (a, lv) { return a + perPage[lv]; }, 0) / density.length;

    reasons.push({ k: '密度曲线', v: density.join(''), why:
      '气质给的基线' + (shift ? '，又因为画面繁忙度 ' + p.busy.toFixed(2) + (shift > 0 ? ' 往挤里挪一档' : ' 往空里挪一档') : '') +
      '；1 极空 → 5 极挤，平均每页 ' + avg.toFixed(1) + ' 张' });
    reasons.push({ k: '字体', v: type.face + ' · 字级 ×' + type.scale, why:
      type.face === 'serif' ? '安静的组用衬线，字要大、字距要松' : '热闹的组用无衬线，字紧、字距小' });
    reasons.push({ k: '边距/栏距', v: margins.outer + ' / ' + margins.gutter, why:
      margins.outer >= 110 ? '留白是这本的主角：外边距拉到 ' + margins.outer : '信息量大，边距收紧到 ' + margins.outer });
    reasons.push({ k: '色彩', v: color, why:
      color === 'unify-muted' ? '照片本身低饱和，统一到纸色避免脏' :
      color === 'accent-only' ? '明暗反差大，只留一个强调色' : '照片够浓，不干预' });
    reasons.push({ k: '图片占比', v: Math.round((temp === 'loud' ? 0.66 : temp === 'quiet' ? 0.30 : 0.46) * 100) + '%', why:
      '每页照片面积占页面的目标比例；安静的书留 70% 给纸，热闹的书让照片占到三分之二' });
    reasons.push({ k: '对齐', v: align, why:
      align === 'offset' ? '轻微错位，让页面不像网格' : align === 'bleed' ? '主图出血，压住版心' : '严格对齐，节奏靠密度而非错位' });

    return {
      temperament: temp, density: density, families: families, type: type,
      color: color, alignment: align, margins: margins,
      columns: temp === 'loud' ? 6 : temp === 'quiet' ? 4 : 6,
      coverage: temp === 'loud' ? 0.66 : temp === 'quiet' ? 0.30 :
                temp === 'cinematic' ? 0.46 : temp === 'warm' ? 0.44 : 0.50,
      reasons: reasons
    };
  }

  /* ---------------- 3. parameterised page families ---------------- */
  function page() {
    return { w: PW, h: PH, bg: PAPER, ink: INK, muted: MUTED, frames: [], rects: [], texts: [] };
  }
  function gridOf(d) {
    var cols = d.columns, outer = d.margins.outer, gut = d.margins.gutter;
    var contentW = PW - outer * 2;
    var colW = (contentW - (cols - 1) * gut) / cols;
    return {
      cols: cols, colW: colW, gutter: gut, outer: outer,
      x: function (c) { return outer + c * (colW + gut); },
      w: function (n) { return n * colW + (n - 1) * gut; },
      top: outer, bottom: PH - outer, contentW: contentW
    };
  }
  function put(pg, photo, x, y, w, h, opt) {
    opt = opt || {};
    var pad = opt.pad || 0;
    pg.frames.push({
      photo: photo, x: x, y: y, w: w, h: h, pad: pad, role: opt.role || 'detail', z: opt.z || 1,
      crop: M.cropFor(photo, w - pad * 2, h - pad * 2, opt.focal)
    });
  }
  function typeBlock(pg, d, o) {
    var face = d.type.face === 'serif' ? SERIF : GROTESK;
    var size = o.size * d.type.scale;
    pg.texts.push({
      x: o.x, y: o.y, w: o.w, lines: String(o.text).split('\n'),
      size: size, family: o.family || face, weight: o.weight || 400,
      color: o.color || (o.onDark ? '#fff' : INK), align: o.align || 'left',
      tracking: (o.tracking == null ? d.type.tracking : o.tracking),
      lineHeight: o.lh || 1.35, opacity: o.opacity == null ? 1 : o.opacity
    });
  }

  /* density has to mean something visible: scale each page's frames until the
     photo area matches what the direction promised. Proportional, so the
     composition is kept — only its scale changes. */
  function fitCoverage(pg, target, allowBleed) {
    var frames = pg.frames;
    if (!frames.length || !target) return;
    var area = frames.reduce(function (a, f) { return a + f.w * f.h; }, 0) / (PW * PH);
    if (area <= 0.001) return;
    var k = Math.sqrt(target / area);
    k = Math.max(0.55, Math.min(1.75, k));
    if (Math.abs(k - 1) < 0.06) return;
    // scale about the picture block's centre
    var cx = 0, cy = 0;
    frames.forEach(function (f) { cx += f.x + f.w / 2; cy += f.y + f.h / 2; });
    cx /= frames.length; cy /= frames.length;
    frames.forEach(function (f) {
      var w = f.w * k, h = f.h * k;
      var x = cx + (f.x + f.w / 2 - cx) * k - w / 2;
      var y = cy + (f.y + f.h / 2 - cy) * k - h / 2;
      if (!allowBleed) {
        x = Math.max(0, Math.min(PW - w, x));
        y = Math.max(0, Math.min(PH - h, y));
      } else {
        x = Math.max(-PW * 0.12, Math.min(PW - w * 0.88, x));
        y = Math.max(-PH * 0.12, Math.min(PH - h * 0.88, y));
      }
      f.x = x; f.y = y; f.w = w; f.h = h;
      f.crop = M.cropFor(f.photo, w - f.pad * 2, h - f.pad * 2);
    });
  }

  var FAMILIES = {
    /* one photo owns the page */
    single: function (photos, d, g, ctx) {
      var pg = page();
      var p = photos[0];
      var fill = 0.52 + ctx.rand() * 0.28;                 // 52–80% of the height
      var h = (g.bottom - g.top) * fill;
      var w = Math.min(g.contentW, h * (p.ar || 1));
      h = w / (p.ar || 1);
      var place = ctx.rand();
      var x = place < 0.34 ? g.x(0) : place < 0.67 ? (PW - w) / 2 : PW - g.outer - w;
      var y = g.top + (ctx.rand() < 0.25 ? (g.bottom - g.top - h) * 0.62 : (g.bottom - g.top - h) * 0.28);
      if (d.alignment === 'bleed' && ctx.rand() < 0.4) {
        put(pg, p, place < 0.5 ? 0 : PW - w, y, w, h);
      } else {
        put(pg, p, x, y, w, h);
      }
      if (ctx.section) {
        typeBlock(pg, d, { x: g.x(0), y: g.top, w: g.w(Math.min(6, g.cols)), size: 13, tracking: 6, text: '— ' + ctx.plate, color: MUTED });
      }
      if (ctx.line) {
        typeBlock(pg, d, {
          x: g.x(0), y: g.bottom - 60, w: g.w(Math.min(7, g.cols)),
          size: 12, text: ctx.line, color: MUTED, tracking: 1
        });
      }
      return { pg: pg, params: { fill: +fill.toFixed(2), place: place.toFixed(2), y: Math.round(y) }, family: 'single' };
    },

    /* two photos in conversation; unequal weights, one shared edge */
    diptych: function (photos, d, g, ctx) {
      var pg = page();
      var a = photos[0], b = photos[1] || photos[0];
      var ratio = 0.34 + ctx.rand() * 0.26;                // smaller one is 34–60% of the bigger
      var gap = d.margins.gutter * (d.alignment === 'offset' ? 1.6 : 1);
      var totalW = g.contentW;
      var bigW = totalW / (1 + ratio) - gap / 2;
      var smallW = totalW - bigW - gap;
      var bigH = bigW / (a.ar || 1);
      var smallH = smallW / (b.ar || 1);
      var top = g.top + (g.bottom - g.top - Math.max(bigH, smallH)) * (0.2 + ctx.rand() * 0.4);
      if (ctx.rand() < 0.5) {
        put(pg, a, g.x(0), top, bigW, bigH);
        put(pg, b, g.x(0) + bigW + gap, top + (ctx.rand() < 0.5 ? 0 : Math.abs(bigH - smallH)), smallW, smallH);
      } else {
        put(pg, b, g.x(0), top + (ctx.rand() < 0.5 ? 0 : Math.abs(bigH - smallH)), smallW, smallH);
        put(pg, a, g.x(0) + smallW + gap, top, bigW, bigH);
      }
      if (ctx.line) {
        typeBlock(pg, d, { x: g.x(0), y: g.bottom - 46, w: g.w(Math.min(6, g.cols)), size: 11.5, text: ctx.line, color: MUTED });
      }
      return { pg: pg, params: { ratio: +ratio.toFixed(2), gap: Math.round(gap) }, family: 'diptych' };
    },

    /* many prints, set like a contact sheet: rows of equal height that fill
       the box exactly. Quiet books use a narrower box and fewer rows so the
       paper still breathes; loud books fill it edge to edge. */
    wall: function (photos, d, g, ctx) {
      var pg = page();
      var loud = d.temperament === 'loud' || d.temperament === 'clinical';
      var boxW = g.contentW * (loud ? 1 : 0.62 + ctx.rand() * 0.2);
      var boxX = loud ? g.x(0) : g.x(0) + (g.contentW - boxW) * (ctx.rand() < 0.5 ? 0 : 1);
      var boxT = g.top + (g.bottom - g.top) * (0.06 + ctx.rand() * 0.08);
      var boxH = g.bottom - boxT;
      var gap = loud ? d.margins.gutter * 0.45 : d.margins.gutter;

      var rows = [];
      var i = 0;
      while (i < photos.length) {
        var row = [], arSum = 0;
        while (i < photos.length) {
          row.push(photos[i]);
          arSum += (photos[i].ar || 1);
          i++;
          if (arSum >= 2.2 || (rows.length === 0 && row.length >= 2)) break;
        }
        rows.push({ items: row, arSum: arSum });
      }
      var rowH, y = boxT;
      if (loud) {
        /* fill mode: the rows divide the whole box, and each row is stretched
           (i.e. cropped a little) so it reaches both edges */
        rowH = (boxH - gap * (rows.length - 1)) / rows.length;
        rows.forEach(function (r) {
          var natural = rowH * r.arSum;
          var sx = boxW / natural;
          var x = boxX;
          r.items.forEach(function (p) {
            var w = rowH * (p.ar || 1) * sx;
            put(pg, p, x, y, w, rowH, { pad: 0, role: 'detail' });
            x += w;
          });
          y += rowH + gap;
        });
      } else {
        rowH = Math.min((boxH - gap * (rows.length - 1)) / rows.length, boxW / Math.max(1, rows[0].arSum));
        rows.forEach(function (r) {
          var h = Math.min(rowH, (boxW - gap * (r.items.length - 1)) / r.arSum);
          var x = boxX;
          r.items.forEach(function (p) {
            var w = h * (p.ar || 1);
            put(pg, p, x, y, w, h, { pad: 6, role: 'detail' });
            x += w + gap;
          });
          y += h + gap;
        });
      }
      return { pg: pg, params: { rows: rows.length, rowH: Math.round(rowH), gap: Math.round(gap) }, family: 'wall' };
    },

    /* a band running across the page, with type above or below */
    strip: function (photos, d, g, ctx) {
      var pg = page();
      var bandH = PH * (0.18 + ctx.rand() * 0.22);
      var y = g.top + (g.bottom - g.top - bandH) * ctx.rand();
      var n = Math.min(photos.length, 4);
      var gut = d.margins.gutter * 0.6;
      var w = (g.contentW - (n - 1) * gut) / n;
      for (var i = 0; i < n; i++) {
        var p = photos[i] || photos[0];
        var h = Math.min(bandH, w / (p.ar || 1));
        put(pg, p, g.x(0) + i * (w + gut), y + (bandH - h) / 2, w, h);
      }
      if (ctx.line) {
        typeBlock(pg, d, {
          x: g.x(0), y: y > PH / 2 ? y - 64 : y + bandH + 28,
          w: g.w(Math.min(8, g.cols)), size: 15, text: ctx.line
        });
      }
      return { pg: pg, params: { band: Math.round(bandH), y: Math.round(y), n: n }, family: 'strip' };
    },

    /* the page is carried by type, one small photo answers it */
    'type-led': function (photos, d, g, ctx) {
      var pg = page();
      var headline = ctx.head || ctx.line || '';
      var size = 62 + ctx.rand() * 46;
      var tx = ctx.rand() < 0.25 ? g.x(1) : g.x(0);
      typeBlock(pg, d, { x: tx, y: g.top + (g.bottom - g.top) * 0.16, w: g.w(Math.min(g.cols - 1, 7)), size: size, text: headline, lh: 1.22 });
      typeBlock(pg, d, {
        x: g.x(0), y: g.top + (g.bottom - g.top) * 0.16 + size * 1.3,
        w: g.w(Math.min(5, g.cols)), size: 11, tracking: 5, text: ctx.plate || '', color: MUTED
      });
      var p = photos[0];
      if (p) {
        var w = g.w(Math.min(5, g.cols)) * (0.7 + ctx.rand() * 0.3);
        var h = w / (p.ar || 1);
        put(pg, p, g.x(g.cols - Math.min(5, g.cols)), g.bottom - h - (ctx.rand() < 0.4 ? 0 : 40), w, h);
      }
      if (photos[1]) {
        var w2 = g.w(Math.min(3, g.cols)) * 0.8;
        var h2 = w2 / (photos[1].ar || 1);
        put(pg, photos[1], g.x(0), g.bottom - h2 - 46, w2, h2);
      }
      return { pg: pg, params: { size: Math.round(size), lead: headline.slice(0, 12) }, family: 'type-led' };
    },

    /* prints laid over each other, cropped, filling the page */
    collage: function (photos, d, g, ctx) {
      var pg = page();
      var n = Math.min(photos.length, 7);
      var gutter = d.margins.gutter * (0.4 + ctx.rand() * 0.9);
      for (var i = 0; i < n; i++) {
        var p = photos[i % photos.length];
        var w = g.contentW * (0.34 + ctx.rand() * 0.4);
        var h = w / (p.ar || 1) * (0.8 + ctx.rand() * 0.3);
        var x = g.x(0) + ctx.rand() * (g.contentW - w);
        var y = g.top + ctx.rand() * (g.bottom - g.top - h);
        put(pg, p, x, y, w, h, { z: i + 1, pad: i % 3 === 0 ? 8 : 0 });
      }
      return { pg: pg, params: { n: n, gutter: Math.round(gutter) }, family: 'collage' };
    }
  };

  /* which family can hold this many photos */
  var FIT = {
    single: [1, 1], diptych: [2, 2], wall: [3, 9], strip: [2, 5],
    'type-led': [1, 2], collage: [3, 8]
  };

  function pickFamily(d, count, prev, rand) {
    var cands = Object.keys(FIT).filter(function (k) {
      return count >= FIT[k][0] && count <= FIT[k][1] && k !== prev;
    });
    if (!cands.length) cands = Object.keys(FIT).filter(function (k) { return count >= FIT[k][0] && count <= FIT[k][1]; });
    var bag = [];
    cands.forEach(function (k) {
      var w = Math.round((d.families[k] || 0.1) * 100);
      for (var i = 0; i < w; i++) bag.push(k);
    });
    if (!bag.length) return cands[0];
    return bag[Math.floor(rand() * bag.length)];
  }

  /* ---------------- 4. the book ---------------- */
  function compose(photos, opt) {
    opt = opt || {};
    var list = photos.filter(function (p) { return p && p.img; });
    if (!list.length) return { pages: [], units: [], direction: null, profile: null, log: [] };

    var prof = opt.profile || profile(list);
    var dir = opt.direction || direction(prof);
    var rand = rngFrom((opt.seed || 7) + '|' + dir.temperament + '|' + list.length);
    var g = gridOf(dir);

    var perPage = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 8 };
    var avg = dir.density.reduce(function (a, lv) { return a + perPage[lv]; }, 0) / dir.density.length;
    var targetPages = Math.max(4, Math.min(60, Math.round(list.length / Math.max(1, avg))));

    /* stretch the density curve to the page count */
    var curve = [];
    for (var i = 0; i < targetPages; i++) {
      var t = i / Math.max(1, targetPages - 1);
      curve.push(dir.density[Math.min(dir.density.length - 1, Math.floor(t * dir.density.length))]);
    }

    /* how many photos per page, then trim/extend so every photo is used */
    var counts = curve.map(function (lv) { return perPage[lv]; });
    var sum = counts.reduce(function (a, b) { return a + b; }, 0);
    var guard = 0;
    while (sum !== list.length && guard++ < 300) {
      if (sum < list.length) {
        var iMin = counts.indexOf(Math.min.apply(null, counts));
        counts[iMin]++; sum++;
      } else {
        var iMax = counts.indexOf(Math.max.apply(null, counts));
        if (counts[iMax] <= 1) break;
        counts[iMax]--; sum--;
      }
    }

    /* the strongest photos go to the densest-looking pages and the climax */
    var byHero = list.slice().sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); });
    var stars = byHero.slice(0, Math.max(1, Math.round(list.length * 0.15)));
    var rest = byHero.slice(stars.length);
    var climax = Math.round((targetPages - 1) * 0.62);
    counts[climax] = Math.max(counts[climax], 1);

    var pages = [], log = [], cursor = 0, prevFamily = '', lastType = -99;
    var lineQueue = (opt.lines || []).filter(function (x) { return x; }).slice();
    var pool = rest.slice();

    // the cover takes the single strongest frame
    var coverPhoto = stars.shift() || list[0];

    for (var pi = 0; pi < counts.length; pi++) {
      var n = counts[pi];
      var chunk;
      if (pi === climax && stars.length) {
        chunk = [stars[0]].concat(pool.splice(0, Math.max(0, n - 1)));
        stars.shift();
      } else {
        chunk = pool.splice(0, n);
      }
      if (!chunk.length) { chunk = pool.splice(0, 1); }
      if (!chunk.length) break;

      var fam = pickFamily(dir, chunk.length, prevFamily, rand);
      // the opening page may be type-led on purpose; after that, keep them apart
      if (fam === 'type-led' && pi > 0 && pi - lastType < 3) fam = chunk.length > 1 ? 'diptych' : 'single';
      if (fam === 'type-led') lastType = pi;
      if (fam === 'type-led' && !lineQueue.length) fam = chunk.length > 1 ? 'diptych' : 'single';
      fam = fam;
      var fn = FAMILIES[fam];
      if (!fn) { fam = 'wall'; fn = FAMILIES.wall; }
      // a denser book can still ask for one page that breathes
      if (ctxShouldPause(dir, pi, rand) && chunk.length > 2) {
        fam = 'single'; fn = FAMILIES.single;
      }
      var built = fn(chunk, dir, g, {
        rand: rand,
        line: lineQueue.length ? lineQueue[0] : '',
        head: (opt.head || ''),
        plate: 'PLATE ' + (pi + 1 < 10 ? '0' : '') + (pi + 1),
        section: pi === 0
      });
      // a loud book needs a loud voice: short lines set big and tight, every
      // third page, in the same place so it reads as a system rather than noise
      if (dir.temperament === 'loud' && built.family !== 'type-led' && pi % 3 === 1) {
        var lns = (opt.lines || []);
        var tline = lns[pi % Math.max(1, lns.length)] || '';
        if (tline) {
          typeBlock(built.pg, dir, {
            x: g.x(0), y: g.bottom - 96, w: g.w(Math.min(4, g.cols)), size: 92,
            text: tline, lh: 1.02, tracking: -2
          });
        }
      }
      fitCoverage(built.pg, dir.coverage, dir.alignment === 'bleed' || dir.temperament === 'loud');
      pages.push(built.pg);
      log.push({
        page: pi + 2, family: built.family, photos: chunk.map(function (x) { return x.name || x.id; }),
        params: built.params, densityLevel: curve[pi]
      });
      if (built.family === 'type-led' || (built.params && built.params.lead)) lineQueue.shift();
      prevFamily = built.family;
    }

    /* cover, in the same voice as the rest: quiet prints on paper,
       loud bleeds off the page with the type laid over it */
    var cover = page();
    var title = opt.title || '未命名的一卷';
    var fullBleedCover = dir.temperament === 'loud' || dir.temperament === 'cinematic';
    if (fullBleedCover) {
      put(cover, coverPhoto, 0, 0, PW, PH, { role: 'bleed' });
      typeBlock(cover, dir, {
        x: g.outer, y: PH - 250, w: PW - g.outer * 2, size: 54, text: title,
        color: '#fff', lh: 1.16
      });
      typeBlock(cover, dir, {
        x: g.outer, y: PH - 150, w: PW - g.outer * 2, size: 10.5, tracking: 6,
        text: list.length + ' PHOTOGRAPHS  ·  ' + (opt.year || new Date().getFullYear()),
        color: 'rgba(255,255,255,.8)'
      });
    } else {
      var cw = Math.min(g.contentW, PW * 0.62);
      var cTop = g.top + (PH * 0.10);
      var cMax = Math.min(PH * 0.60, PH * 0.70 - 90 - cTop);
      var chh = Math.min(cw / (coverPhoto.ar || 1), cMax);
      put(cover, coverPhoto, (PW - cw) / 2, cTop, cw, chh);
      var ty = cTop + chh + 54;
      typeBlock(cover, dir, {
        x: g.x(0), y: ty, w: g.contentW, size: 42, text: title, align: 'center', lh: 1.22
      });
      typeBlock(cover, dir, {
        x: g.x(0), y: ty + 42 * dir.type.scale * 1.5, w: g.contentW, size: 10,
        tracking: 6, text: list.length + ' PHOTOGRAPHS  ·  ' + (opt.year || new Date().getFullYear()),
        color: MUTED, align: 'center'
      });
    }

    /* nothing may be dropped: whatever the planning missed gets its own page */
    var seen = {};
    [cover].concat(pages).forEach(function (pg) {
      pg.frames.forEach(function (f) { seen[f.photo.id] = 1; });
    });
    var orphans = list.filter(function (p) { return !seen[p.id]; });
    var guardO = 0;
    while (orphans.length && guardO++ < 20) {
      var take = orphans.slice(0, 9);
      var famO = take.length === 1 ? 'single' : take.length === 2 ? 'diptych' : 'wall';
      var extra = FAMILIES[famO](take, dir, g, {
        rand: rand, line: '', head: '', plate: 'PLATE ' + (pages.length + 2)
      });
      pages.push(extra.pg);
      log.push({
        page: pages.length + 1, family: famO,
        photos: take.map(function (x) { return x.name || x.id; }),
        params: extra.params, densityLevel: 5, note: '补页（计划没分到的照片）'
      });
      orphans = orphans.slice(take.length);
    }

    var all = [cover].concat(pages);
    return {
      pages: all,
      units: pages.map(function (pg, i) { return { key: (log[i] || {}).family || 'page', startIndex: i + 1, pages: [pg] }; }),
      pair: false,
      total: list.length,
      cover: coverPhoto,
      direction: dir,
      profile: prof,
      log: log
    };
  }

  function ctxShouldPause(d, i, rand) {
    // a loud book still needs one breath every four pages; a quiet one needs a burst
    if (d.temperament === 'loud') return i > 0 && i % 4 === 1;
    if (d.temperament === 'quiet') return i > 0 && i % 5 === 2;
    return false;
  }

  M.ART = { profile: profile, direction: direction, compose: compose, FAMILIES: FAMILIES, gridOf: gridOf, finger: finger };
})(window.MEM);
