/* Composition engine.
   Not a packer. Each layout is a drawn page: slots sit on a 12-column grid,
   every photo gets a role (hero / detail / sequence), and the book is
   sequenced before anything is placed. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var PW = 1080, PH = 1440;
  var MG = 88, GUT = 20, COLS = 12;
  var CW = (PW - 2 * MG - (COLS - 1) * GUT) / COLS;   // 57
  function cx(c) { return MG + c * (CW + GUT); }
  function cw(n) { return n * CW + (n - 1) * GUT; }

  var SERIF = 'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", serif';
  var SANS = '"Helvetica Neue", Arial, "PingFang SC", "Segoe UI", sans-serif';

  var PAPER = {
    ink: '#17150f', ink2: '#3b382e', muted: '#8a8272', line: 'rgba(23,21,15,.22)'
  };

  function page(bg) {
    return { w: PW, h: PH, bg: bg || '#f7f4ec', ink: PAPER.ink, muted: PAPER.muted, frames: [], rects: [], texts: [] };
  }
  function txt(o) {
    return {
      x: o.x, y: o.y, w: o.w, lines: String(o.text).split('\n'),
      size: o.size, family: o.family || SANS, weight: o.weight || 400,
      color: o.color || PAPER.ink, align: o.align || 'left',
      tracking: o.tracking || 0, lineHeight: o.lineHeight || 1.45,
      opacity: o.opacity == null ? 1 : o.opacity
    };
  }

  /* ---------------- the layout DSL ----------------
     ops are read in order: each starts where the last one ended unless y is given. */
  function lay(pg, ops, photos, opt) {
    var y = 0, last = 0;
    ops.forEach(function (op) {
      if (op.y != null) y = op.y; else y += (op.gap == null ? 0 : op.gap);
      if (op.t === 'photo') {
        var p = photos[op.i];
        if (!p) return;
        var x = cx(op.c == null ? 0 : op.c), w = cw(op.cols || 6);
        var h = op.h || (w / op.ar);
        if (op.fit === 'bottom') y = op.y + (op.boxH || 0) - h;
        var pad = op.print ? 7 : 0;
        pg.frames.push({
          photo: p, x: x, y: y, w: w, h: h, pad: pad, role: op.role || 'detail',
          crop: M.cropFor(p, w - pad * 2, h - pad * 2, op.focal || p.focal),
          z: op.z || 1
        });
        last = h;
        y += h;
      } else if (op.t === 'bleed') {
        var bp = photos[op.i];
        if (!bp) return;
        var bh = op.h || PH, bw = op.w || PW;
        pg.frames.push({
          photo: bp, x: op.x || 0, y: op.y || 0, w: bw, h: bh, pad: 0, role: 'bleed',
          crop: M.cropFor(bp, bw, bh, bp.focal), z: 1
        });
        y = (op.y || 0) + bh; last = bh;
      } else if (op.t === 'type') {
        var t = txt({
          x: cx(op.c == null ? 0 : op.c), y: y, w: cw(op.cols || 8),
          text: typeof op.text === 'function' ? op.text(opt) : op.text,
          size: op.size || 13, family: op.serif ? SERIF : SANS,
          tracking: op.track || 0, color: op.color || PAPER.ink,
          align: op.align || 'left', lineHeight: op.lh || 1.45,
          weight: op.weight || 400, opacity: op.opacity
        });
        pg.texts.push(t);
        last = t.lines.length * t.size * t.lineHeight;
        y += last;
      } else if (op.t === 'rule') {
        pg.rects.push({ x: cx(op.c == null ? 0 : op.c), y: y, w: cw(op.cols || 12), h: op.h || 1.5, color: op.color || PAPER.line });
        last = op.h || 1.5; y += last;
      } else if (op.t === 'block') {
        pg.rects.push({ x: cx(op.c || 0), y: y, w: cw(op.cols || 4), h: op.h || 200, color: op.color || '#e8e2d2' });
        last = op.h || 200; y += last;
      } else if (op.t === 'space') {
        y += op.h; last = 0;
      }
    });
    return pg;
  }

  /* ---------------- compositions ----------------
     A = single page, B/C = one spread (two pages side by side). */

  var COMP = {};

  /* ---------- shared cover ---------- */
  COMP.cover = {
    name: '封面', mode: 'all', n: 1, page: 1,
    ops: [
      { t: 'type', c: 0, cols: 12, y: 104, text: 'A SMALL BOOK', size: 11, track: 5, color: PAPER.muted },
      { t: 'photo', c: 2, cols: 9, y: 196, ar: 0.78, i: 0, role: 'hero' },
      { t: 'type', c: 0, cols: 12, y: 1240, size: 62, serif: 1, lh: 1.12, text: function (o) { return o.title; } },
      { t: 'rule', c: 0, cols: 12, y: 1332, h: 1 },
      { t: 'type', c: 0, cols: 8, y: 1352, size: 11, track: 3, color: PAPER.muted, text: function (o) { return o.total + ' PHOTOGRAPHS   ·   ' + o.year; } },
      { t: 'type', c: 8, cols: 4, y: 1352, size: 11, track: 3, color: PAPER.muted, align: 'right', text: 'MEMENTO' }
    ]
  };

  /* ---------- A · EDITORIAL MAGAZINE (single pages) ---------- */

  COMP['ed-open'] = {
    name: '开场 · 字压图', mode: 'A', n: 1, page: 1,
    ops: [
      { t: 'type', c: 0, cols: 6, y: 118, text: function (o) { return 'PLATE ' + o.plate; }, size: 11, track: 5, color: PAPER.muted },
      { t: 'type', c: 0, cols: 9, y: 156, size: 88, serif: 1, lh: 1.06, text: function (o) { return o.head || o.title; } },
      { t: 'type', c: 0, cols: 5, y: 366, size: 12.5, color: PAPER.ink2, lh: 1.9, text: function (o) { return o.line; } },
      { t: 'photo', c: 4, cols: 8, y: 470, ar: 0.78, i: 0, role: 'hero' },
      { t: 'type', c: 0, cols: 3, y: 1246, size: 10.5, track: 2, color: PAPER.muted, text: function (o) { return o.total + ' 张 / ' + o.year; } }
    ]
  };

  COMP['ed-hero-details'] = {
    name: '主图 + 细节', mode: 'A', n: 3, page: 1,
    ops: [
      { t: 'photo', c: 0, cols: 8, y: 88, ar: 0.72, i: 0, role: 'hero' },
      { t: 'photo', c: 9, cols: 3, y: 88, ar: 1, i: 1, role: 'detail', print: 1 },
      { t: 'photo', c: 9, cols: 3, y: 329, ar: 0.72, i: 2, role: 'detail', print: 1 },
      { t: 'type', c: 0, cols: 6, y: 958, size: 11, track: 3, color: PAPER.muted, text: function (o) { return o.plate + ' — ' + o.title; } },
      { t: 'type', c: 0, cols: 7, y: 1006, size: 40, serif: 1, lh: 1.3, text: function (o) { return o.line; } }
    ]
  };

  COMP['ed-fullbleed'] = {
    name: '满版 + 角标', mode: 'A', n: 1, page: 1,
    ops: [
      { t: 'bleed', i: 0, ar: 0.75 },
      { t: 'type', c: 0, cols: 7, y: 1236, size: 11, track: 3, color: '#fff', opacity: .92, text: function (o) { return o.plate + '   ' + o.title; } }
    ]
  };

  COMP['ed-asym-pair'] = {
    name: '错位对页', mode: 'A', n: 2, page: 1,
    ops: [
      { t: 'type', c: 0, cols: 6, y: 96, size: 11, track: 4, color: PAPER.muted, text: function (o) { return o.plate; } },
      { t: 'photo', c: 0, cols: 7, y: 140, ar: 0.66, i: 0, role: 'hero' },
      { t: 'photo', c: 6, cols: 6, y: 1010, ar: 1.3, i: 1, role: 'detail', z: 2 },
      { t: 'type', c: 5, cols: 2, y: 1044, size: 10.5, track: 2, color: PAPER.muted, align: 'right', text: function (o) { return o.total + ' / ' + o.year; } }
    ]
  };

  COMP['ed-row'] = {
    name: '三张一排', mode: 'A', n: 3, page: 1,
    ops: [
      { t: 'type', c: 0, cols: 7, y: 150, size: 34, serif: 1, lh: 1.35, text: function (o) { return o.line; } },
      { t: 'photo', c: 0, cols: 4, y: 420, ar: 1.5, i: 0, role: 'sequence' },
      { t: 'photo', c: 4, cols: 4, y: 420, ar: 0.8, i: 1, role: 'sequence' },
      { t: 'photo', c: 8, cols: 4, y: 420, ar: 1, i: 2, role: 'sequence' },
      { t: 'rule', c: 0, cols: 12, y: 1100, h: 1 },
      { t: 'type', c: 0, cols: 6, y: 1124, size: 11, track: 3, color: PAPER.muted, text: function (o) { return o.plate + ' — ' + o.title; } }
    ]
  };

  COMP['ed-type'] = {
    name: '文字页', mode: 'A', n: 2, page: 1,
    ops: [
      { t: 'type', c: 0, cols: 8, y: 210, size: 60, serif: 1, lh: 1.2, text: function (o) { return o.head || o.line; } },
      { t: 'type', c: 0, cols: 5, y: 470, size: 12, color: PAPER.ink2, lh: 2.1, text: function (o) { return o.meta; } },
      { t: 'photo', c: 6, cols: 6, y: 700, ar: 1.5, i: 0, role: 'detail' },
      { t: 'photo', c: 6, cols: 4, y: 1046, ar: 1, i: 1, role: 'detail', print: 1 }
    ]
  };

  COMP['ed-detail-wall'] = {
    name: '留白 + 一墙小图', mode: 'A', n: 6, page: 1,
    ops: [
      { t: 'type', c: 0, cols: 5, y: 112, size: 11, track: 4, color: PAPER.muted, text: function (o) { return o.plate + ' — CONTACT'; } },
      { t: 'photo', c: 0, cols: 3, y: 170, ar: 1.5, i: 0, role: 'detail', print: 1 },
      { t: 'photo', c: 0, cols: 3, y: 350, ar: 0.7, i: 1, role: 'detail', print: 1 },
      { t: 'photo', c: 0, cols: 3, y: 700, ar: 1, i: 2, role: 'detail', print: 1 },
      { t: 'photo', c: 3, cols: 3, y: 210, ar: 0.72, i: 3, role: 'detail', print: 1 },
      { t: 'photo', c: 3, cols: 3, y: 620, ar: 1.4, i: 4, role: 'detail', print: 1 },
      { t: 'photo', c: 9, cols: 3, y: 860, ar: 0.7, i: 5, role: 'detail', print: 1 },
      { t: 'type', c: 7, cols: 4, y: 300, size: 30, serif: 1, lh: 1.4, text: function (o) { return o.line; } }
    ]
  };

  /* ---------- B · PANORAMIC SPREAD (two pages) ---------- */

  /* a photo that runs across the fold in one go */
  function crossPage(a, b, photo, x, w, y, h, role) {
    var cut = PW - x;
    var full = M.cropFor(photo, w, h);
    if (cut > 0) {
      var fa = cut / w;
      a.frames.push({
        photo: photo, x: x, y: y, w: Math.min(cut, w), h: h, pad: 0, role: role || 'fold',
        crop: { sx: full.sx, sy: full.sy, sw: full.sw * Math.min(1, fa), sh: full.sh }, z: 1
      });
    }
    if (w > cut) {
      var fb = (w - cut) / w;
      b.frames.push({
        photo: photo, x: 0, y: y, w: w - cut, h: h, pad: 0, role: role || 'fold',
        crop: { sx: full.sx + full.sw * (1 - fb), sy: full.sy, sw: full.sw * fb, sh: full.sh }, z: 1
      });
    }
  }

  COMP['pan-fold'] = {
    name: '整幅跨页', mode: 'B', n: 1, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var h = PH, y = 0;
      crossPage(a, b, photos[0], 0, PW * 2, y, h);
      a.texts.push(txt({
        x: cx(0), y: PH - 96, w: cw(7), size: 11, color: '#fff', opacity: .92,
        track: 3, text: o.plate + '   ' + o.title
      }));
      return [a, b];
    }
  };

  COMP['pan-inset'] = {
    name: '留边跨页', mode: 'B', n: 1, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var x = MG, w = PW * 2 - MG * 2, h = (w) / 2.0;
      crossPage(a, b, photos[0], x, w, 150, h);
      a.texts.push(txt({
        x: cx(0), y: 150 + h + 40, w: cw(7), size: 11, track: 3, color: PAPER.muted,
        text: o.plate + ' — ' + o.title
      }));
      a.texts.push(txt({
        x: cx(0), y: 150 + h + 96, w: cw(6), size: 40, family: SERIF, lineHeight: 1.3,
        text: o.line
      }));
      return [a, b];
    }
  };

  COMP['pan-diptych'] = {
    name: '对开双拼', mode: 'B', n: 2, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var y = 0, h = PH;
      a.frames.push({ photo: photos[0], x: 0, y: y, w: PW, h: h, pad: 0, role: 'bleed', crop: M.cropFor(photos[0], PW, h), z: 1 });
      b.frames.push({ photo: photos[1], x: 0, y: y, w: PW, h: h, pad: 0, role: 'bleed', crop: M.cropFor(photos[1], PW, h), z: 1 });
      a.texts.push(txt({
        x: cx(0), y: PH - 92, w: cw(6), size: 11, color: '#fff', opacity: .9, track: 3,
        text: o.plate + '  L'
      }));
      b.texts.push(txt({
        x: cx(0), y: PH - 92, w: cw(6), size: 11, color: '#fff', opacity: .9, track: 3,
        text: o.plate + '  R'
      }));
      return [a, b];
    }
  };

  COMP['pan-hero-right'] = {
    name: '跨页主图 + 一墙', mode: 'B', n: 7, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.texts.push(txt({ x: cx(0), y: 150, w: cw(9), size: 34, family: SERIF, lineHeight: 1.35, text: o.line }));
      a.texts.push(txt({ x: cx(0), y: 300, w: cw(5), size: 11, track: 4, color: PAPER.muted, text: o.plate + ' — ' + o.title }));
      wall(a, photos.slice(1, 6), {
        rows: [[4, 4], [4, 4], [6]],
        shapes: [[1.0, 1.35], [1.35, 1.0], [1.42]],
        indent: [0, 1, 0]
      }, { y: 400 });
      var hp = photos[0];
      b.frames.push({ photo: hp, x: 0, y: 0, w: PW, h: PH, pad: 0, role: 'bleed', crop: M.cropFor(hp, PW, PH), z: 1 });
      if (photos[6]) {
        var w3 = cw(4), p3 = photos[6];
        var h3 = Math.min(w3 / (p3.ar || 1), PH - 96 - 1080);   // never off the foot
        b.frames.push({
          photo: p3, x: cx(8), y: PH - 96 - h3, w: w3, h: h3, pad: 7, role: 'detail', z: 3,
          crop: M.cropFor(p3, w3 - 14, h3 - 14)
        });
      }
      return [a, b];
    }
  };

  /* ---------- C · PHOTO ZINE (two pages, narrative beats) ---------- */

  COMP['z-open'] = {
    name: '开场页', mode: 'C', n: 2, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.texts.push(txt({ x: cx(0), y: 300, w: cw(9), size: 72, family: SERIF, lineHeight: 1.1, text: o.head || o.title }));
      a.texts.push(txt({ x: cx(0), y: 560, w: cw(7), size: 11, track: 5, color: PAPER.muted, text: 'A SMALL BOOK  ·  ' + o.total + ' PHOTOGRAPHS' }));
      a.rects.push({ x: cx(0), y: 620, w: cw(3), h: 1.5, color: PAPER.line });
      a.texts.push(txt({ x: cx(0), y: 660, w: cw(6), size: 12.5, color: PAPER.ink2, lineHeight: 2.0, text: o.meta }));
      var w = cw(7), p = photos[0];
      b.frames.push({ photo: p, x: cx(3), y: 250, w: w, h: w / (p.ar || 1), pad: 0, role: 'hero', crop: M.cropFor(p, w, w / (p.ar || 1)) });
      if (photos[1]) {
        var w2 = cw(3), p2 = photos[1];
        b.frames.push({ photo: p2, x: cx(3), y: 250 + w / (p.ar || 1) + 40, w: w2, h: w2 / (p2.ar || 1), pad: 7, role: 'detail', z: 2, crop: M.cropFor(p2, w2 - 14, w2 / (p2.ar || 1) - 14) });
      }
      return [a, b];
    }
  };

  COMP['z-hero'] = {
    name: '主视觉页', mode: 'C', n: 2, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.frames.push({ photo: photos[0], x: 0, y: 0, w: PW, h: PH, pad: 0, role: 'bleed', crop: M.cropFor(photos[0], PW, PH) });
      a.texts.push(txt({ x: cx(0), y: PH - 92, w: cw(6), size: 11, color: '#fff', opacity: .9, track: 3, text: o.plate }));
      if (photos[1]) {
        var w = cw(8), p = photos[1];
        b.frames.push({ photo: p, x: cx(2), y: 300, w: w, h: w / (p.ar || 1), pad: 0, role: 'sequence', crop: M.cropFor(p, w, w / (p.ar || 1)) });
        b.texts.push(txt({ x: cx(2), y: 300 + w / (p.ar || 1) + 28, w: cw(6), size: 11, track: 3, color: PAPER.muted, text: o.title }));
      } else {
        b.texts.push(txt({ x: cx(2), y: 500, w: cw(8), size: 34, family: SERIF, lineHeight: 1.4, text: o.line }));
      }
      return [a, b];
    }
  };

  COMP['z-details'] = {
    name: '细节页', mode: 'C', n: 6, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.texts.push(txt({ x: cx(0), y: 128, w: cw(5), size: 11, track: 4, color: PAPER.muted, text: o.plate + ' — DETAILS' }));
      // three prints down the left, each its own shape, aligned on a common left edge
      var shapes = [1.5, 0.7, 1.0], yy = 190;
      for (var i = 0; i < 3 && photos[i]; i++) {
        var w = cw(4);
        var p = photos[i], h = w / shapes[i];
        a.frames.push({ photo: p, x: cx(0), y: yy, w: w, h: h, pad: 7, role: 'detail', z: 2, crop: M.cropFor(p, w - 14, h - 14) });
        yy += h + 26;
      }
      b.texts.push(txt({ x: cx(0), y: 130, w: cw(8), size: 42, family: SERIF, lineHeight: 1.32, text: o.line }));
      b.texts.push(txt({ x: cx(0), y: 130 + 42 * 1.32 * 2 + 34, w: cw(6), size: 11.5, color: PAPER.ink2, lineHeight: 1.9, text: o.meta }));
      wall(b, photos.slice(3, 6), {
        rows: [[4, 4, 4]], shapes: [[1.35, 1.0, 1.15]], indent: [0]
      }, { y: 560 });
      return [a, b];
    }
  };

  COMP['z-sequence'] = {
    name: '连续影像', mode: 'C', n: 7, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      // a strip of five, stepped: gives the eye a direction
      var top = [180, 250, 200, 300, 230];
      var ars = [0.72, 1.4, 1.0, 0.7, 1.5];
      for (var i = 0; i < 5 && photos[i]; i++) {
        var c = i < 3 ? (i * 4) : ((i - 3) * 4);
        var pg = i < 3 ? a : b;
        var p = photos[i], w = cw(4), h = w / ars[i];
        pg.frames.push({ photo: p, x: cx(c), y: top[i], w: w, h: h, pad: 0, role: 'sequence', crop: M.cropFor(p, w, h) });
      }
      a.texts.push(txt({ x: cx(0), y: 1120, w: cw(6), size: 11, track: 3, color: PAPER.muted, text: o.plate }));
      b.texts.push(txt({ x: cx(0), y: 1120, w: cw(7), size: 26, family: SERIF, lineHeight: 1.4, text: o.line }));
      if (photos[5]) {
        var w5 = cw(5), p5 = photos[5];
        b.frames.push({ photo: p5, x: cx(4), y: 640, w: w5, h: w5 / (p5.ar || 1), pad: 7, role: 'detail', z: 2, crop: M.cropFor(p5, w5 - 14, w5 / (p5.ar || 1) - 14) });
      }
      return [a, b];
    }
  };

  COMP['z-pause'] = {
    name: '停顿页', mode: 'C', n: 1, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var w = cw(4), p = photos[0];
      b.frames.push({ photo: p, x: cx(4), y: 520, w: w, h: w / (p.ar || 1), pad: 7, role: 'detail', z: 2, crop: M.cropFor(p, w - 14, w / (p.ar || 1) - 14) });
      a.texts.push(txt({ x: cx(4), y: 300, w: cw(4), size: 11, track: 5, color: PAPER.muted, text: '—' }));
      b.texts.push(txt({ x: cx(4), y: 520 + w / (p.ar || 1) + 40, w: cw(4), size: 11, track: 2, color: PAPER.muted, text: o.title }));
      return [a, b];
    }
  };

  COMP['z-panorama'] = {
    name: '跨页全景', mode: 'C', n: 1, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var w = PW * 2, h = Math.min(PH, w / (photos[0].ar || 1.5));
      crossPage(a, b, photos[0], 0, w, (PH - h) / 2, h);
      a.texts.push(txt({ x: cx(0), y: (PH - h) / 2 - 40, w: cw(6), size: 11, track: 4, color: PAPER.muted, text: o.plate + ' — PANORAMA' }));
      return [a, b];
    }
  };

  COMP['z-end'] = {
    name: '结束页', mode: 'C', n: 2, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var w = cw(8), p = photos[0];
      a.frames.push({ photo: p, x: cx(2), y: 220, w: w, h: w / (p.ar || 1), pad: 0, role: 'sequence', crop: M.cropFor(p, w, w / (p.ar || 1)) });
      if (photos[1]) {
        var w2 = cw(3), p2 = photos[1];
        a.frames.push({ photo: p2, x: cx(2), y: 220 + w / (p.ar || 1) + 30, w: w2, h: w2 / (p2.ar || 1), pad: 7, role: 'detail', z: 2, crop: M.cropFor(p2, w2 - 14, w2 / (p2.ar || 1) - 14) });
      }
      b.texts.push(txt({ x: cx(2), y: 560, w: cw(8), size: 30, family: SERIF, lineHeight: 1.6, text: o.line }));
      b.texts.push(txt({ x: cx(2), y: 560 + 30 * 1.6 * 3 + 36, w: cw(6), size: 11, track: 4, color: PAPER.muted, text: 'THE END  ·  ' + o.year }));
      b.rects.push({ x: cx(2), y: 1080, w: cw(3), h: 1.5, color: PAPER.line });
      return [a, b];
    }
  };

  /* ---------- a wall: rows of the grid, uneven widths, tops aligned ----------
     [ [cols...], ... ] with a matching shape (aspect) per photo.
     One row may be indented by a column or two: aligned, but not a grid. */
  function wall(pg, photos, spec, opt) {
    opt = opt || {};
    var top = opt.y == null ? 96 : opt.y;
    var rowGap = opt.rowGap || 26;
    var floor = opt.floor || (PH - MG);

    // measure first so nothing can run off the foot of the page
    var total = 0, maxRows = [];
    spec.rows.forEach(function (row, ri) {
      var m = 0;
      row.forEach(function (cols, ci) { m = Math.max(m, cw(cols) / spec.shapes[ri][ci]); });
      maxRows.push(m);
      total += m + rowGap;
    });
    total -= rowGap;
    var k = 1;
    if (top + total > floor) k = Math.max(0.45, (floor - top) / total);

    var y = top, i = 0, firstFrame = pg.frames.length;
    spec.rows.forEach(function (row, ri) {
      var indent = (spec.indent && spec.indent[ri]) || 0;
      var c = indent, placed = [];
      row.forEach(function (cols, ci) {
        var p = photos[i++];
        var w = cw(cols);
        var h = (w / spec.shapes[ri][ci]) * k;
        if (p) placed.push({ p: p, x: cx(c), y: y, w: w, h: h });
        c += cols;
      });
      placed.forEach(function (o) {
        pg.frames.push({
          photo: o.p, x: o.x, y: o.y, w: o.w, h: o.h, pad: opt.print ? 7 : 0, role: 'detail',
          crop: M.cropFor(o.p, o.w - (opt.print ? 14 : 0), o.h - (opt.print ? 14 : 0)),
          z: 2
        });
      });
      y += maxRows[ri] * k + rowGap;
    });
    // a wall that stops well above the foot gets set down, not left hanging
    var used = (y - rowGap) - top;
    var slack = floor - top - used;
    if (slack > (floor - top) * 0.12) {
      var shift = slack * 0.42;
      for (var fi = firstFrame; fi < pg.frames.length; fi++) pg.frames[fi].y += shift;
      y += shift;
    }
    return y;
  }

  COMP['z-wall'] = {
    name: '墙 · 六张', mode: 'C', n: 12, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.texts.push(txt({ x: cx(0), y: 96, w: cw(5), size: 11, track: 4, color: PAPER.muted, text: o.plate + ' — ' + o.title }));
      wall(a, photos.slice(0, 6), {
        rows: [[6, 6], [4, 4, 4], [7]],
        shapes: [[1.42, 1.0], [1.1, 0.95, 1.3], [1.5]],
        indent: [0, 0, 2]
      }, { y: 150 });
      wall(b, photos.slice(6, 12), {
        rows: [[5, 7], [4, 4, 4], [8]],
        shapes: [[1.0, 1.42], [1.35, 1.0, 1.1], [1.42]],
        indent: [0, 1, 1]
      }, { y: 150 });
      return [a, b];
    }
  };

  COMP['z-wall-air'] = {
    name: '墙 · 带白', mode: 'C', n: 5, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.texts.push(txt({ x: cx(0), y: 260, w: cw(8), size: 44, family: SERIF, lineHeight: 1.36, text: o.line }));
      a.texts.push(txt({ x: cx(0), y: 470, w: cw(4), size: 11, track: 4, color: PAPER.muted, text: o.plate }));
      wall(a, photos.slice(0, 2), {
        rows: [[5], [7]],
        shapes: [[0.9], [1.42]],
        indent: [0, 3]
      }, { y: 560 });
      wall(b, photos.slice(2, 5), {
        rows: [[4, 4], [9]],
        shapes: [[0.7, 1.5], [1.42]],
        indent: [2, 0]
      }, { y: 200 });
      return [a, b];
    }
  };

  COMP['z-hero-wall'] = {
    name: '主图 + 一墙', mode: 'C', n: 8, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      a.frames.push({ photo: photos[0], x: 0, y: 0, w: PW, h: PH, pad: 0, role: 'bleed', crop: M.cropFor(photos[0], PW, PH) });
      a.texts.push(txt({ x: cx(0), y: PH - 92, w: cw(6), size: 11, color: '#fff', opacity: .92, track: 3, text: o.plate + '   ' + o.title }));
      b.texts.push(txt({ x: cx(0), y: 96, w: cw(6), size: 11, track: 4, color: PAPER.muted, text: 'DETAILS' }));
      wall(b, photos.slice(1, 8), {
        rows: [[4, 4, 4], [5, 4], [3, 3]],
        shapes: [[1.2, 0.95, 1.4], [1.42, 0.9], [1.0, 1.3]],
        indent: [0, 1, 3]
      }, { y: 160 });
      return [a, b];
    }
  };

  COMP['ed-dense'] = {
    name: '满页 · 八张', mode: 'A', n: 8, page: 1,
    build: function (photos, o) {
      var pg = page();
      pg.texts.push(txt({ x: cx(0), y: 92, w: cw(5), size: 11, track: 4, color: PAPER.muted, text: o.plate + ' — ' + o.title }));
      wall(pg, photos.slice(0, 8), {
        rows: [[4, 4, 4], [5, 7], [3, 3, 3]],
        shapes: [[1.15, 0.95, 1.35], [1.42, 1.15], [1.0, 1.35, 1.4]],
        indent: [0, 0, 4]
      }, { y: 140 });
      pg.texts.push(txt({
        x: cx(0), y: PH - 96, w: cw(6), size: 10.5, track: 3, color: PAPER.muted,
        text: o.total + ' PHOTOGRAPHS'
      }));
      return [pg];
    }
  };

  COMP['pan-wall'] = {
    name: '跨页 + 一墙', mode: 'B', n: 12, page: 2,
    build: function (photos, o) {
      var a = page(), b = page();
      var w = PW * 2, h = w / (photos[0].ar || 1.5);
      h = Math.min(h, PH * 0.46);
      crossPage(a, b, photos[0], 0, w, 0, h, 'fold');
      a.texts.push(txt({ x: cx(0), y: h + 40, w: cw(6), size: 11, track: 3, color: PAPER.muted, text: o.plate + ' — ' + o.title }));
      var rest = photos.slice(1, 13);
      // split what exists across both pages: a fixed 6/6 split leaves page b blank
      // whenever the unit got fewer than seven photos
      var half = Math.ceil(rest.length / 2);
      wall(a, rest.slice(0, half), {
        rows: [[4, 4, 4], [4, 4, 4]], shapes: [[1.15, 0.95, 1.35], [1.35, 1.0, 1.15]], indent: [0, 0]
      }, { y: h + 96 });
      var bRows = Math.max(1, Math.ceil((rest.length - half) / 3));
      wall(b, rest.slice(half), {
        rows: bRows === 1 ? [[4, 4, 4]] : [[4, 4, 4], [4, 4, 4]],
        shapes: [[1.35, 1.0, 1.15], [1.0, 1.35, 0.95]], indent: [0, 1]
      }, { y: h + 96 });
      return [a, b];
    }
  };

  /* ---------- Japanese Minimal · a quieter way to hold photographs ----------
     Wide margins, small type, one idea per page. A page that only breathes is
     part of the composition. Every page keeps the same skeleton — plate number
     top right, caption block bottom left — so the variety lives in the pictures,
     not in the furniture. */

  var MGJ = 150;                       // outer margin, wide on purpose
  var JP_BG = '#faf9f4';
  var JP_INK = '#1b1915';
  var JP_MUTED = '#8d8678';

  /* break a title on character count so it can never run off the paper */
  function jpLines(s, max) {
    var t = String(s == null ? '' : s), out = [];
    for (var i = 0; i < t.length; i += max) out.push(t.slice(i, i + max));
    return out.join('\n');
  }
  /* hand-wrap Chinese: break after a punctuation mark when one is near the edge,
     otherwise at the edge. A raw character count cuts phrases in half. */
  function jpWrap(s, max) {
    var t = String(s == null ? '' : s), out = [];
    var CLOSE = '。，、；：！？）」』】,.;:!?)';
    while (t.length > max) {
      var cut = -1;
      for (var i = Math.min(max, t.length - 1); i >= Math.max(3, max - 8); i--) {
        if (CLOSE.indexOf(t.charAt(i)) >= 0) { cut = i + 1; break; }
      }
      if (cut < 0) {
        cut = max;
        // a line must not open with a closing mark: carry it up one place
        while (cut < t.length && CLOSE.indexOf(t.charAt(cut)) >= 0) cut++;
      }
      out.push(t.slice(0, cut));
      t = t.slice(cut);
    }
    if (t && out.length && CLOSE.indexOf(t.charAt(0)) >= 0) out[out.length - 1] += t;
    else if (t) out.push(t);
    return out.join(String.fromCharCode(10));
  }
  /* how many characters fit in w at this size */
  function jpFit(s, w, size) { return jpWrap(s, Math.max(4, Math.floor(w / (size * 1.04)))); }

  function jpTxt(o) {
    o.family = o.family || SANS;
    o.color = o.color || JP_INK;
    return txt(o);
  }
  function jpPlate(pg, o, y) {
    pg.texts.push(jpTxt({
      x: PW - MGJ - 150, y: y == null ? 150 : y, w: 150, size: 10, track: 3,
      color: JP_MUTED, align: 'right', text: o.plate
    }));
  }
  function jpCaption(pg, o, y, w) {
    if (!o.line) return;
    pg.texts.push(jpTxt({
      x: MGJ, y: y == null ? PH - MGJ - 84 : y, w: w || 430, size: 12,
      color: PAPER.ink2, lineHeight: 2.15, text: o.line
    }));
  }

  COMP['jp-cover'] = {
    name: '封面', mode: 'jp', dir: 'jp', n: 1, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG), p = photos[0];
      if (!p) return [pg];
      var w = 460, h = Math.min(w / (p.ar || 1), 620);
      pg.frames.push({
        photo: p, x: PW - MGJ - w, y: PH - MGJ - h, w: w, h: h, pad: 0, role: 'hero',
        crop: M.cropFor(p, w, h), z: 1
      });
      pg.texts.push(jpTxt({ x: MGJ, y: 252, w: 520, size: 10, track: 7, color: JP_MUTED, text: 'A SMALL BOOK' }));
      pg.texts.push(jpTxt({ x: MGJ, y: 306, w: 640, size: 36, family: SERIF, lineHeight: 1.6, text: jpFit(o.title, 640, 36) }));
      if (o.meta) pg.texts.push(jpTxt({ x: MGJ, y: 640, w: 360, size: 11, color: PAPER.ink2, lineHeight: 2.4, text: o.meta }));
      pg.texts.push(jpTxt({ x: MGJ, y: PH - MGJ - 10, w: 300, size: 10, track: 4, color: JP_MUTED, text: String(o.year) }));
      return [pg];
    }
  };

  /* the opening: one small print high on the paper, a section word set large,
     and nothing else. The book starts by leaving room. */
  COMP['jp-open'] = {
    name: '开场', mode: 'jp', dir: 'jp', n: 1, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG), p = photos[0];
      if (p) {
        var w = 380, h = Math.min(w / (p.ar || 1), 500);
        pg.frames.push({ photo: p, x: PW - MGJ - w, y: 392, w: w, h: h, pad: 0, role: 'hero', crop: M.cropFor(p, w, h), z: 1 });
      }
      pg.texts.push(jpTxt({ x: MGJ, y: 300, w: 340, size: 10, track: 5, color: JP_MUTED, text: o.plate + '   ' + o.title }));
      pg.texts.push(jpTxt({ x: MGJ, y: 900, w: 640, size: 108, family: SERIF, lineHeight: 1.35, text: jpFit(o.head || o.title, 640, 108) }));
      jpCaption(pg, o, PH - MGJ - 84);
      return [pg];
    }
  };

  /* one photograph, held. The print sits on the left margin; the caption closes
     the page at the foot, so the white above it has a job. */
  COMP['jp-solo'] = {
    name: '单页主图', mode: 'jp', dir: 'jp', n: 1, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG), p = photos[0];
      var w = photos[1] ? 520 : 700;
      if (p) {
        var h = Math.min(w / (p.ar || 1), 880);
        pg.frames.push({ photo: p, x: MGJ, y: 190, w: w, h: h, pad: 0, role: 'hero', crop: M.cropFor(p, w, h), z: 1 });
        if (photos[1]) {
          var p2 = photos[1], w2 = 240, h2 = Math.min(w2 / (p2.ar || 1), 330);
          pg.frames.push({
            photo: p2, x: PW - MGJ - w2, y: 190, w: w2, h: h2, pad: 0, role: 'detail',
            crop: M.cropFor(p2, w2, h2), z: 1
          });
        }
        jpPlate(pg, o, 150);
        jpCaption(pg, o);
      }
      return [pg];
    }
  };

  /* a large print low, small ones high: a pair that talks, not two equal cells */
  COMP['jp-pair'] = {
    name: '一大一小', mode: 'jp', dir: 'jp', n: 2, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG), p = photos[0];
      if (p) {
        var w = 620, h = Math.min(w / (p.ar || 1), 640);
        pg.frames.push({ photo: p, x: MGJ, y: 520, w: w, h: h, pad: 0, role: 'hero', crop: M.cropFor(p, w, h), z: 1 });
      }
      var smalls = [photos[1], photos[2]], spots = [
        { x: PW - MGJ - 240 },             // top right
        { x: MGJ }                         // top left
      ];
      var hs = smalls.map(function (p2) { return p2 ? Math.max(170, Math.min(290, 240 / (p2.ar || 1))) : 0; });
      var hMax = Math.max(hs[0] || 0, hs[1] || 0);
      smalls.forEach(function (p2, k) {
        if (!p2) return;
        // the two small prints stand on one line, flush left and right
        pg.frames.push({
          photo: p2, x: spots[k].x, y: 170 + (hMax - hs[k]), w: 240, h: hs[k], pad: 0, role: 'detail',
          crop: M.cropFor(p2, 240, hs[k]), z: 1
        });
      });
      jpPlate(pg, o, 150);
      jpCaption(pg, o, PH - MGJ - 86);
      return [pg];
    }
  };

  /* three small prints down the right edge; the left column is text and air */
  COMP['jp-triple'] = {
    name: '小图序列', mode: 'jp', dir: 'jp', n: 3, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG);
      pg.texts.push(jpTxt({ x: MGJ, y: 300, w: 300, size: 10, track: 4, color: JP_MUTED, text: o.plate }));
      var W = 250, rightX = PW - MGJ - W, leftX = rightX - W - 40;
      /* one width for every print, height inside a band: the column reads as a system */
      function small(p, x, y) {
        var h = Math.max(200, Math.min(300, W / (p.ar || 1)));
        pg.frames.push({ photo: p, x: x, y: y, w: W, h: h, pad: 0, role: 'detail', crop: M.cropFor(p, W, h), z: 1 });
        return h;
      }
      var list = photos.slice(0, 5);
      if (list.length <= 3) {
        var y = 190;
        list.forEach(function (p) { y += small(p, rightX, y) + 40; });
      } else {
        // two columns of two; each pair stands on one baseline so the block reads as a block
        function row(a, b, top) {
          var ha = Math.max(200, Math.min(300, W / (a.ar || 1)));
          var hb = b ? Math.max(200, Math.min(300, W / (b.ar || 1))) : ha;
          var hMax = Math.max(ha, hb);
          pg.frames.push({ photo: a, x: leftX, y: top + (hMax - ha), w: W, h: ha, pad: 0, role: 'detail', crop: M.cropFor(a, W, ha), z: 1 });
          if (b) pg.frames.push({ photo: b, x: rightX, y: top + (hMax - hb), w: W, h: hb, pad: 0, role: 'detail', crop: M.cropFor(b, W, hb), z: 1 });
          return hMax;
        }
        var h1 = row(list[0], list[1], 190);
        var next = 190 + h1 + 44;
        if (list[2]) {
          var h2 = row(list[2], list[3], next);
          if (list[4]) row(list[4], null, next + h2 + 44);
        }
      }
      pg.texts.push(jpTxt({ x: MGJ, y: PH - MGJ - 190, w: 380, size: 30, family: SERIF, lineHeight: 1.7, text: jpFit(o.head || o.title, 380, 30) }));
      jpCaption(pg, o, PH - MGJ - 86, 380);
      return [pg];
    }
  };

  /* the climax: one photograph across the fold, with the margin still respected */
  COMP['jp-fold'] = {
    name: '跨页', mode: 'jp', dir: 'jp', n: 1, page: 2,
    build: function (photos, o) {
      var a = page(JP_BG), b = page(JP_BG);
      var p = photos[0];
      if (!p) return [a, b];
      var w = PW * 2 - MGJ * 2, h = Math.min(w / (p.ar || 1), PH - MGJ * 2 - 40);
      var y = Math.round((PH - h) / 2) + 20;
      crossPage(a, b, p, MGJ, w, y, h, 'fold');
      a.texts.push(jpTxt({ x: MGJ, y: 110, w: 300, size: 10, track: 4, color: JP_MUTED, text: o.plate + '   ' + o.title }));
      // one photograph and nothing else: the climax is not a collage, and it
      // keeps its margin. No caption here — the picture is the sentence.
      return [a, b];
    }
  };

  /* a spread as a sequence: one large print on the left, a column of three
     small ones on the right, so the eye walks instead of scanning a grid */
  COMP['jp-sequence'] = {
    name: '序列', mode: 'jp', dir: 'jp', n: 4, page: 2,
    build: function (photos, o) {
      var a = page(JP_BG), b = page(JP_BG);
      var p = photos[0];
      if (p) {
        var w = 560, h = Math.min(w / (p.ar || 1), 760);
        a.frames.push({ photo: p, x: MGJ, y: 220, w: w, h: h, pad: 0, role: 'hero', crop: M.cropFor(p, w, h), z: 1 });
      }
      var y = 180;
      photos.slice(1, 4).forEach(function (p2) {
        var w2 = 250, h2 = Math.min(w2 / (p2.ar || 1), 340);
        b.frames.push({ photo: p2, x: MGJ, y: y, w: w2, h: h2, pad: 0, role: 'detail', crop: M.cropFor(p2, w2, h2), z: 1 });
        y += h2 + 44;
      });
      a.texts.push(jpTxt({ x: MGJ, y: 110, w: 300, size: 10, track: 4, color: JP_MUTED, text: o.plate }));
      jpCaption(a, o, PH - MGJ - 120, 380);
      if (photos[4]) {
        var p5 = photos[4], w5 = 210, h5 = Math.min(w5 / (p5.ar || 1), 280);
        b.frames.push({ photo: p5, x: PW - MGJ - w5, y: PH - MGJ - h5, w: w5, h: h5, pad: 0, role: 'detail', crop: M.cropFor(p5, w5, h5), z: 1 });
      }
      return [a, b];
    }
  };

  /* the pause: one very small print, one line, and the rest is paper */
  COMP['jp-quiet'] = {
    name: '停顿', mode: 'jp', dir: 'jp', n: 1, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG), p = photos[0];
      pg.texts.push(jpTxt({ x: MGJ, y: 300, w: 200, size: 10, track: 4, color: JP_MUTED, text: o.plate }));
      var y = 470;
      [photos[0], photos[1]].forEach(function (pp) {
        if (!pp) return;
        var w = 220, h = Math.min(w / (pp.ar || 1), 300);
        pg.frames.push({ photo: pp, x: PW - MGJ - w, y: y, w: w, h: h, pad: 0, role: 'detail', crop: M.cropFor(pp, w, h), z: 1 });
        y += h + 40;
      });
      // the line closes the page at the foot, like every other page in the book
      pg.texts.push(jpTxt({ x: MGJ, y: PH - MGJ - 92, w: 440, size: 26, family: SERIF, lineHeight: 1.85, text: jpFit(o.line || o.head, 440, 26) }));
      return [pg];
    }
  };

  /* the end: the last small print, one sentence, the year */
  COMP['jp-end'] = {
    name: '收尾', mode: 'jp', dir: 'jp', n: 1, page: 1,
    build: function (photos, o) {
      var pg = page(JP_BG), p = photos[0];
      var x = MGJ, base = 180;
      var h0 = p ? Math.min(300 / (p.ar || 1), 380) : 0;
      [photos[0], photos[1]].forEach(function (pp, k) {
        if (!pp) return;
        var w = k === 0 ? 300 : 220, h = Math.min(w / (pp.ar || 1), 380);
        // both prints stand on one baseline: different heights, one bottom line
        pg.frames.push({ photo: pp, x: x, y: base + (h0 - h), w: w, h: h, pad: 0, role: 'detail', crop: M.cropFor(pp, w, h), z: 1 });
        x += w + 44;
      });
      pg.texts.push(jpTxt({ x: MGJ, y: PH - MGJ - 210, w: 620, size: 26, family: SERIF, lineHeight: 1.85, text: jpFit(o.line || o.head, 620, 26) }));
      pg.texts.push(jpTxt({ x: PW - MGJ - 400, y: PH - MGJ - 10, w: 400, size: 10, track: 5, color: JP_MUTED, align: 'right', text: 'THE END   ·   ' + o.year }));
      return [pg];
    }
  };

  /* how many photographs each jp page can hold — min keeps a page alive,
     max is where it stops being quiet */
  var JP_SPEC = {
    'jp-open': { min: 1, max: 1 },
    'jp-solo': { min: 1, max: 2 },
    'jp-pair': { min: 2, max: 3 },
    'jp-triple': { min: 3, max: 5 },
    'jp-fold': { min: 1, max: 1 },
    'jp-sequence': { min: 4, max: 5 },
    'jp-quiet': { min: 1, max: 2 },
    'jp-end': { min: 1, max: 2 }
  };

  /* the book as a sentence: opening, development, climax, close. Pages = 8 or 10
     so the export still lands on nine / eleven images. */
  function jpPlan(n, pageBudget) {
    var keys = pageBudget >= 10
      ? ['jp-open', 'jp-solo', 'jp-pair', 'jp-triple', 'jp-fold', 'jp-sequence', 'jp-quiet', 'jp-end']
      : ['jp-open', 'jp-solo', 'jp-pair', 'jp-triple', 'jp-fold', 'jp-quiet', 'jp-end'];
    var want = keys.map(function (k) { return JP_SPEC[k].min; });
    var sum = want.reduce(function (a, b) { return a + b; }, 0);
    var grow = ['jp-triple', 'jp-pair', 'jp-solo', 'jp-fold', 'jp-sequence', 'jp-quiet', 'jp-end'];

    // too few photographs: give pages back (a thin book, not a padded one)
    var drop = ['jp-sequence', 'jp-triple', 'jp-pair', 'jp-solo', 'jp-quiet'];
    while (sum > n) {
      var cut = false;
      for (var d = 0; d < drop.length && sum > n; d++) {
        var j = keys.indexOf(drop[d]);
        if (j < 0) continue;
        var can = Math.min(want[j], sum - n);
        if (can > 0) { want[j] -= can; sum -= can; cut = true; }
        if (want[j] <= 0) { keys.splice(j, 1); want.splice(j, 1); }
      }
      if (!cut) break;
    }

    // too many: fill the dense pages, then let the book grow a page
    var guard = 0;
    while (sum < n && guard++ < 40) {
      var moved = false;
      for (var g = 0; g < grow.length && sum < n; g++) {
        var i = keys.indexOf(grow[g]);
        if (i >= 0 && want[i] < JP_SPEC[grow[g]].max) { want[i]++; sum++; moved = true; }
      }
      if (!moved) {
        var at = Math.max(1, keys.length - 1);
        var add = Math.min(3, n - sum);
        keys.splice(at, 0, 'jp-pair'); want.splice(at, 0, add); sum += add;
      }
    }
    return { keys: keys, want: want };
  }

  /* ---------- sequencing ---------- */

  var SCHEMES = {
    A: [
      ['ed-open', 'ed-hero-details', 'ed-asym-pair', 'ed-row', 'ed-type', 'ed-detail-wall'],
      ['ed-fullbleed', 'ed-row', 'ed-type', 'ed-hero-details', 'ed-asym-pair'],
      ['ed-type', 'ed-detail-wall', 'ed-fullbleed', 'ed-row', 'ed-hero-details']
    ],
    B: [
      ['pan-fold', 'pan-diptych', 'pan-hero-right', 'pan-inset'],
      ['pan-diptych', 'pan-inset', 'pan-fold', 'pan-hero-right'],
      ['pan-inset', 'pan-hero-right', 'pan-fold', 'pan-diptych']
    ],
    C: [
      ['z-open', 'z-details', 'z-panorama', 'z-end'],
      ['z-open', 'z-hero', 'z-sequence', 'z-end'],
      ['z-open', 'z-details', 'z-pause', 'z-panorama', 'z-end']
    ]
  };

  var SCHEME_NAME = {
    A: ['字压图 + 细节', '满版 · 节奏硬', '文字页开场'],
    B: ['整幅跨页', '对开双拼', '留边跨页'],
    C: ['叙事 · 细节铺开', '叙事 · 主视觉', '叙事 · 停顿']
  };

  function cap(key) { var c = COMP[key]; return c.n || 1; }

  /* ---------------- assignment: who goes where ---------------- */
  function arFit(p, ar) { return Math.abs(Math.log((p.ar || 1) / ar)); }
  function hue(p) {
    var c = (p.colors && p.colors[0]) || '#888888';
    if (typeof c !== 'string') c = '#888888';
    if (c.length === 4) c = '#' + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2) + c.charAt(3) + c.charAt(3);
    var r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return 0;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0;
    if (mx !== mn) {
      if (mx === r) h = ((g - b) / (mx - mn) + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / (mx - mn) + 2) / 6;
      else h = ((r - g) / (mx - mn) + 4) / 6;
    }
    return h * 360;
  }
  function hueGap(a, b) { var d = Math.abs(hue(a) - hue(b)); if (!isFinite(d)) return 180; return Math.min(d, 360 - d); }

  /* ---------------- build one composition ---------------- */
  function buildOne(key, photos, ctx) {
    var c = COMP[key];
    if (!photos || !photos.length) return [page()];   // never hand a comp an empty hand
    if (c.build) return c.build(photos, ctx);
    var pg = page();
    var slots = c.ops.filter(function (o) { return o.t === 'photo' || o.t === 'bleed'; });
    lay(pg, c.ops, photos, ctx);
    return [pg];
  }

  /* which photo slot of a hand-drawn comp is a 大位, by the role the build
     declares. A comp with no entry (or a shorter list) has no 大位: its wall /
     strip / pause frames are small slots, and a star must not be pulled there. */
  var BUILD_SLOTS = {
    'pan-fold': ['fold'],
    'pan-inset': ['fold'],
    'pan-diptych': ['bleed', 'bleed'],
    'pan-hero-right': ['bleed'],
    'pan-wall': ['fold'],
    'z-open': ['hero'],
    'z-hero': ['bleed'],
    'z-hero-wall': ['bleed'],
    'z-panorama': ['fold'],
    'z-details': [],
    'z-sequence': [],
    'z-pause': [],
    'z-end': [],
    'z-wall': [],
    'z-wall-air': [],
    'ed-dense': [],
    // Japanese Minimal: the main print of each page is the 大位, small columns are not
    'jp-cover': ['hero'],
    'jp-open': ['hero'],
    'jp-solo': ['hero', 'detail'],
    'jp-pair': ['hero', 'detail', 'detail'],
    'jp-triple': ['detail', 'detail', 'detail', 'detail', 'detail'],
    'jp-fold': ['fold', 'detail'],
    'jp-sequence': ['hero', 'detail', 'detail', 'detail', 'detail'],
    'jp-quiet': ['detail'],
    'jp-end': ['detail']
  };

  /* 大位 = a frame the layout itself calls a hero, or one that runs across the fold */
  function isBigRole(role) { return role === 'hero' || role === 'bleed' || role === 'fold'; }

  /* slot geometry without a photo, for allocation.
     Each slot keeps `i` — the photo index the layout actually reads (`op.i`,
     not the position in this array) — plus the role it will be drawn with. */
  function slotGeom(key, n) {
    var c = COMP[key];
    if (c.build) {
      // comps that draw themselves: nominal shapes, roles from BUILD_SLOTS
      var cycle = [1.42, 1.0, 0.72, 1.0, 1.5, 0.72, 1.0, 1.42, 1.0, 0.72];
      var roles = BUILD_SLOTS[key] || [];
      var out = [];
      for (var i = 0; i < n; i++) {
        var role = roles[i] || 'detail';
        var ar = i === 0 ? 0.75 : cycle[i % cycle.length], area = 200000 - i * 1000;
        if (role === 'fold') area = PW * PH * 2;          // one photo across both pages
        else if (role === 'bleed') { ar = 0.75; area = PW * PH; }
        else if (role === 'hero') { area = PW * PH * 0.32; }
        out.push({ ar: ar, area: area, i: i, role: role, big: isBigRole(role) });
      }
      return out;
    }
    var geom = c.ops.filter(function (o) { return o.t === 'photo' || o.t === 'bleed'; }).map(function (op, k) {
      var w = op.t === 'bleed' ? (op.w || PW) : cw(op.cols || 6);
      var h = op.t === 'bleed' ? (op.h || PH) : (op.h || w / op.ar);
      var role = op.role || 'detail';
      return { ar: w / h, area: w * h, i: op.i == null ? k : op.i, role: role, big: isBigRole(role) };
    });
    return geom;
  }

  /* ---------------- the book ---------------- */
  var SECTIONS = ['细节', '途中', '风', '光', '岸', '灰'];
  var LINES = [
    '海是灰的，风把光吹散，一天就这样过去了。',
    '没有目的地的一次散步，走得比想的远。',
    '十一月的风里，所有颜色都退成米色。',
    '记住那天下午的湿度。',
    '一路向北，直到看不见岸。'
  ];

  M.__jp = { plan: jpPlan, spec: JP_SPEC };

  M.COMP = COMP;
  M.SCHEMES = SCHEMES;
  M.SCHEME_NAME = SCHEME_NAME;

  /* every direction brings its own voice. These are starting points, not limits:
     the app hands whatever the user typed back in through opt.text. */
  M.TEXT_DEFAULT = {
    zine: {
      title: '十一月的海', year: new Date().getFullYear(),
      sections: SECTIONS.slice(), lines: LINES.slice()
    },
    jp: {
      title: '午后的光', year: new Date().getFullYear(),
      sections: ['朝', '窗', '影', '水', '归', '夜'],
      lines: [
        '光落在纸上，像一次很轻的呼吸。',
        '风从窗缝进来，把下午吹薄了一点。',
        '我没有拍下声音，只拍下安静。',
        '这里空着，是留给你的。',
        '影子比实物慢半步。',
        '一天里最好的那几分钟，通常没有人。',
        '水声退下去之后，才听见远处。',
        '后来我把这几页翻了很多次。'
      ]
    }
  };

  /* the beat of the book: dense, then a page that breathes, never the same twice */
  function rhythm(mode, n) {
    var base = mode === 'A' ? [1.75, 0.30, 1.55, 0.45, 1.70, 0.30, 1.50, 0.45, 1.60, 0.35]
               : mode === 'B' ? [1.15, 0.95, 1.10, 0.90, 1.05]
                          : [1.45, 0.45, 1.40, 0.55, 1.35];
    var out = [];
    for (var i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  /* the largest rectangle on a page that nothing is sitting in (20px cells) */
  function freeRect(pg) {
    var CELL = 20, W = Math.ceil(PW / CELL), H = Math.ceil(PH / CELL);
    var occ = [];
    for (var y = 0; y < H; y++) { occ.push(new Array(W).fill(0)); }
    pg.frames.forEach(function (f) {
      var x0 = Math.max(0, Math.floor(f.x / CELL)), x1 = Math.min(W, Math.ceil((f.x + f.w) / CELL));
      var y0 = Math.max(0, Math.floor(f.y / CELL)), y1 = Math.min(H, Math.ceil((f.y + f.h) / CELL));
      for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) occ[yy][xx] = 1;
    });
    pg.texts.forEach(function (t) {
      var x0 = Math.max(0, Math.floor(t.x / CELL)), x1 = Math.min(W, Math.ceil((t.x + t.w) / CELL));
      var y0 = Math.max(0, Math.floor(t.y / CELL)), y1 = Math.min(H, Math.ceil((t.y + t.lines.length * t.size * t.lineHeight) / CELL));
      for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) occ[yy][xx] = 1;
    });
    var best = null;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (occ[y][x]) continue;
        var wMax = W;
        for (var xx = x; xx < W; xx++) if (occ[y][xx]) { wMax = xx; break; }
        for (var yy = y; yy < H; yy++) {
          var rowBlocked = false;
          for (var xx2 = x; xx2 < wMax; xx2++) if (occ[yy][xx2]) { rowBlocked = true; break; }
          if (rowBlocked) break;
          var area = (wMax - x) * (yy - y + 1);
          if (!best || area > best.area) best = { x: x, y: y, w: wMax - x, h: yy - y + 1, area: area };
        }
      }
    }
    if (!best) return null;
    return { x: best.x * CELL, y: best.y * CELL, w: best.w * CELL, h: best.h * CELL };
  }

  /* choose compositions so the book holds the pool: budgets first, rhythm second */
  function pickComps(mode, seq, total) {
    var pool = Object.keys(COMP).filter(function (k) {
      return COMP[k].mode === mode && COMP[k].n > 0;
    });
    if (mode === 'all') pool = [];
    var keys = [], want = [], left = total;
    var w = rhythm(mode, seq.length);
    var wsum = w.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; i < seq.length; i++) {
      var budget = i === seq.length - 1 ? Math.max(1, left) : Math.max(1, Math.round(total * w[i] / wsum));
      var prev = keys[keys.length - 1];
      var slotsLeft = seq.length - i;
      var scored = pool.filter(function (k) { return k !== prev; }).map(function (k) {
        var n = COMP[k].n;
        var sc = Math.abs(n - budget);
        if (k === seq[i]) sc -= 1.6;                 // the written order wins near ties
        if (n < budget * 0.55) sc += 2.2;            // don't waste the pool
        if (n > budget * 1.6 && slotsLeft > 1) sc += 1.2;
        return { k: k, sc: sc, n: n };
      }).sort(function (a, b) { return a.sc - b.sc; });
      var chosen = scored[0];
      keys.push(chosen.k);
      var take = Math.min(chosen.n, Math.max(1, Math.min(budget * 1.35, left)));
      want.push(Math.round(take));
      left -= Math.round(take);
    }
    // if photos are still unplaced, let the densest units take them
    var guard = 0;
    while (left > 0 && guard++ < 40) {
      var bestI = -1, bestRoom = 0;
      keys.forEach(function (k, i) {
        var room = COMP[k].n - want[i];
        if (room > bestRoom) { bestRoom = room; bestI = i; }
      });
      if (bestI < 0) break;
      want[bestI] += Math.min(bestRoom, left);
      left -= Math.min(bestRoom, left);
    }
    return { keys: keys, want: want };
  }

  M.composeBook = function (photos, opt) {
    opt = opt || {};
    var mode = opt.mode || 'A';
    var dir = opt.dir || 'zine';
    var jp = dir === 'jp';
    var scheme = SCHEMES[mode][opt.scheme || 0] || SCHEMES[mode][0];
    var list = photos.filter(function (p) { return p && p.img; });
    if (!list.length) return { pages: [], units: [], mode: mode, dir: dir };

    // text is data: the caller may hand in its own title, year, section words and lines
    var TX = opt.text || {};
    var lines = (TX.lines && TX.lines.length) ? TX.lines : LINES;
    var sections = (TX.sections && TX.sections.length) ? TX.sections : SECTIONS;

    var ctx = {
      title: TX.title || opt.title || '未命名的一卷',
      year: TX.year || opt.year || new Date().getFullYear(),
      total: list.length, lines: lines,
      line: opt.line || '', meta: opt.meta || '', plate: '01'
    };

    // 1. who is the cover: a ★ wins it, then visual weight
    var ranked = list.slice().sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); });
    var starred = ranked.filter(function (p) { return p.starred; });
    var coverPhoto = opt.coverPhoto || starred[0] || ranked[0];

    // 2. sequence the inner units
    var units, want, pages;
    if (jp) {
      var coverKey = 'jp-cover';
      pages = [COMP[coverKey].build([coverPhoto], ctx)[0]];
      var plan = jpPlan(list.length - 1, opt.pages || 8);
      units = plan.keys;
      want = plan.want;
    } else {
      units = scheme.slice();
      var wantUnits = Math.max(1, Math.min(opt.units || units.length, list.length - 1));
      while (units.length < wantUnits) units.push(scheme[units.length % scheme.length]);
      units = units.slice(0, wantUnits);
      if (opt.units_override) units = opt.units_override;
      pages = [lay(page(), COMP.cover.ops, [coverPhoto], ctx)];
    }

    // 3. pick a composition for each position, by how many photos it must hold
    var rest = list.filter(function (p) { return p !== coverPhoto; });
    if (jp) {
      // the japanese book has a fixed sentence: the plan already holds every photo
    } else {
      var chosen = pickComps(mode, units, rest.length);
      units = chosen.keys;
      want = chosen.want;
    }

    // 4. assign: 大位 first, and a ★ is only spent there
    var pool = rest.slice();
    var assigned = [];
    var bigSlots = [];
    units.forEach(function (k, i) {
      var g = slotGeom(k, want[i]);
      assigned.push({ key: k, geom: g, photos: new Array(want[i]).fill(null) });
      // every slot the layout will actually draw (op.i within the photos we are giving it)
      var live = g.filter(function (s) { return s.i >= 0 && s.i < want[i]; });
      var big = live.filter(function (s) { return s.big; });
      if (big.length) {
        big.forEach(function (s) { bigSlots.push({ u: i, i: s.i, ar: s.ar, area: s.area, role: s.role, star: true }); });
      } else if (live.length) {
        // no 大位 in this comp: keep choosing its strongest frame (small slots ignore ★)
        var top = live.slice().sort(function (a, b) { return b.area - a.area; })[0];
        bigSlots.push({ u: i, i: top.i, ar: top.ar, area: top.area, role: top.role, star: false });
      }
    });

    function pickBig(ar, useStar) {
      var best = null, bs = -1e9;
      pool.forEach(function (p) {
        // a star outranks hero weight and crop worry, but only for 大位
        var s = (p.hero || 0) * 2.2 - arFit(p, ar) * 1.6 + (useStar && p.starred ? 4 : 0);
        if (s > bs) { bs = s; best = p; }
      });
      return best;
    }

    // biggest 大位 first: the cover-scale frames and the cross-page units get their pick
    bigSlots.sort(function (a, b) { return b.area - a.area; });
    bigSlots.forEach(function (sl) {
      if (assigned[sl.u].photos[sl.i]) return;
      var best = pickBig(sl.ar, sl.star);
      if (!best) return;
      assigned[sl.u].photos[sl.i] = best;
      pool.splice(pool.indexOf(best), 1);
    });

    // details: fill every empty index, preferring the shape that fits and the colour of its hero
    assigned.forEach(function (u) {
      for (var k = 0; k < u.photos.length; k++) {
        if (u.photos[k]) continue;
        var geom = u.geom[k] || u.geom[u.geom.length - 1];
        var anchor = u.photos[0];
        var best = null, bs = -1e9;
        pool.forEach(function (p) {
          var sf = -arFit(p, geom.ar) * 2.0;
          if (anchor) sf += Math.max(0, 120 - hueGap(anchor, p)) / 120 * 0.9;
          if (p.hero > 0.62) sf -= 0.35;          // save the strong frames for heroes
          if (sf > bs) { bs = sf; best = p; }
        });
        if (!best) break;
        u.photos[k] = best;
        pool.splice(pool.indexOf(best), 1);
      }
    });

    // 5. lay them out
    var out = pages.slice();
    var unitPages = [];
    assigned.forEach(function (u, i) {
      var ph = u.photos.filter(Boolean);
      if (!ph.length && pool.length) ph.push(pool.shift());
      if (!ph.length) return;                     // a page with nothing to hold is not a page
      ctx.plate = ('0' + (i + 1)).slice(-2);
      ctx.line = lineFor({ lines: lines }, i);
      ctx.head = (jp || i > 0) ? sections[i % sections.length] : ctx.title;
      var built = buildOne(u.key, ph, ctx);
      unitPages.push({ key: u.key, pages: built, startIndex: out.length });
      built.forEach(function (p) { out.push(p); });
    });

    // 6. units the user locked keep their composition and their photos
    if (opt.preset && opt.preset.length) {
      opt.preset.slice().sort(function (a, b) { return a.i - b.i; }).forEach(function (pr) {
        var u = unitPages[pr.i];
        if (!u || !pr.photos || !pr.photos.length) return;
        ctx.plate = ('0' + (pr.i + 1)).slice(-2);
        ctx.line = lineFor({ lines: lines }, pr.i);
        var built = buildOne(pr.key, pr.photos, ctx);
        for (var k = 0; k < built.length && k < u.pages.length; k++) out[u.startIndex + k] = built[k];
        u.key = pr.key;
        u.pages = built;
      });
    }

    // 7. anything still unplaced goes into the biggest empty area left on a page
    var placed = {};
    out.forEach(function (pg) { pg.frames.forEach(function (f) { placed[f.photo.id] = 1; }); });
    var left = list.filter(function (p) { return !placed[p.id]; });
    if (left.length) {
      /* Spread the leftovers over every page that still has a hole, in order,
         and never draw a print narrower than MIN_W: a dump of thumbnails is
         worse than a page with air in it. */
      var MIN_W = 200;
      var guard = 0;
      while (left.length && guard++ < 40) {
        var didSomething = false;
        for (var pi = out.length - 1; pi >= 0 && left.length; pi--) {
          var slot = freeRect(out[pi]);
          if (!slot || slot.w < MIN_W + 20 || slot.h < MIN_W + 20) continue;
          var cols = Math.max(1, Math.min(left.length, Math.floor(slot.w / (MIN_W + 24)), 4));
          var rows = Math.max(1, Math.floor(slot.h / (MIN_W + 24)));
          var fit = Math.min(left.length, cols * rows);
          if (!fit) continue;
          var useRows = Math.ceil(fit / cols);
          var cellW = slot.w / cols, cellH = slot.h / useRows;
          for (var k = 0; k < fit; k++) {
            var ph2 = left.shift();
            var c = k % cols, r = Math.floor(k / cols);
            var w = Math.min(cellW * 0.94, cellH * 0.94 * (ph2.ar || 1));
            if (w < MIN_W) w = MIN_W;
            var h = w / (ph2.ar || 1);
            if (h > cellH) { h = cellH * 0.94; w = h * (ph2.ar || 1); }
            out[pi].frames.push({
              photo: ph2,
              x: slot.x + c * cellW + (cellW - w) / 2,
              y: slot.y + r * cellH + (cellH - h) / 2,
              w: w, h: h, pad: 6, role: 'detail', z: 5,
              crop: M.cropFor(ph2, w - 12, h - 12)
            });
          }
          didSomething = true;
        }
        if (!didSomething) break;
      }
      // last resort: a photo that still has no page gets minimised into the
      // emptiest page as a strip rather than vanishing
      if (left.length) {
        var host = out[out.length - 1];
        var line = freeRect(host);
        if (line) {
          var n = left.length, wS = Math.max(90, Math.min(line.w / n - 10, 200));
          left.forEach(function (pp, ii) {
            var hS = wS / (pp.ar || 1);
            host.frames.push({
              photo: pp, x: line.x + ii * (wS + 10), y: line.y + Math.min(20, Math.max(0, line.h - hS)),
              w: wS, h: hS, pad: 5, role: 'detail', z: 5,
              crop: M.cropFor(pp, wS - 10, hS - 10)
            });
          });
          left = [];
        }
      }
    }

    return {
      pages: out, units: unitPages, mode: mode, scheme: opt.scheme || 0,
      cover: coverPhoto, total: list.length, pair: jp ? true : mode !== 'A', dir: dir
    };
  };

  function lineFor(opt, i) {
    if (opt && opt.line) return opt.line;
    var arr = (opt && opt.lines && opt.lines.length) ? opt.lines : LINES;
    return arr[i % arr.length];
  }
})(window.MEM);
