/* 作品集 / 排版引擎
   一种东西：作品集。输出是竖版单页（1080×1440），两页一组当一个跨页设计，
   相邻两张在手机上滑过去能连成一整张。
   照片按**原画幅**落位：只有"满版/跨页大图"才裁，其余一律不裁。 */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var PW = 1080, PH = 1440;

  /* four voices for the same book */
  var THEMES = {
    quiet: {
      key: 'quiet', name: '留白',
      paper: '#f6f3ec', ink: '#1a1814', muted: '#8b8377',
      cap: 12, capTrack: 3, titleSize: 40, titleFamily: 'serif', tint: false
    },
    editorial: {
      key: 'editorial', name: '杂志',
      paper: '#f5f0e4', ink: '#141210', muted: '#6d6557',
      cap: 15, capTrack: 1.4, titleSize: 54, titleFamily: 'serif', tint: false
    },
    collage: {
      key: 'collage', name: '拼贴',
      paper: '#f7f4ee', ink: '#16140f', muted: '#756c5c',
      cap: 11, capTrack: 2.2, titleSize: 64, titleFamily: 'serif', tint: true
    },
    contact: {
      key: 'contact', name: '接触表',
      paper: '#ffffff', ink: '#101010', muted: '#8c8c8c',
      cap: 10, capTrack: 2.6, titleSize: 34, titleFamily: 'sans', tint: false
    }
  };

  var SERIF = 'Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif';
  var SANS = '"Helvetica Neue", "Segoe UI", Arial, "PingFang SC", sans-serif';

  var CUR = THEMES.quiet;   // set per build

  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return '#' + [0, 1, 2].map(function (i) {
      var v = Math.round(A[i] * (1 - t) + B[i] * t).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  }

  function page(bg) {
    return {
      w: PW, h: PH, bg: bg || CUR.paper, ink: CUR.ink, muted: CUR.muted,
      frames: [], rects: [], texts: []
    };
  }

  function text(o) {
    return {
      x: o.x, y: o.y, w: o.w, lines: String(o.text).split('\n'),
      size: o.size, family: o.family || SANS, weight: o.weight || 400,
      color: o.color || CUR.ink, align: o.align || 'left',
      tracking: o.tracking || 0, lineHeight: o.lineHeight || 1.5,
      opacity: o.opacity == null ? 1 : o.opacity
    };
  }

  /* ---------------- frames ---------------- */

  /* A print at its own aspect ratio: you give the width, it takes its own height.
     Nothing is cropped. */
  function print(pg, photo, x, y, w, opts) {
    opts = opts || {};
    var pad = opts.paper === false ? 0 : Math.round(Math.min(PW, PH) * 0.005);
    var iw = w - pad * 2;
    var ih = iw / (photo.ar || 1);
    pg.frames.push({
      photo: photo, x: x, y: y, w: w, h: ih + pad * 2, pad: pad,
      crop: M.cropFor(photo, iw, ih, opts.focal), z: opts.z || 1
    });
    return ih + pad * 2;
  }

  /* A frame you force (bleed, fold, full page): this is the only place a crop is asked for. */
  function frame(pg, photo, x, y, w, h, crop, opts) {
    opts = opts || {};
    var pad = opts.paper ? Math.round(Math.min(PW, PH) * 0.005) : 0;
    pg.frames.push({
      photo: photo, x: x, y: y, w: w, h: h, pad: pad,
      crop: crop || M.cropFor(photo, w - pad * 2, h - pad * 2, opts.focal),
      z: opts.z || 1
    });
    return h;
  }

  /* one photo split over the seam; total width spans both pages */
  function crossPhoto(a, b, photo, x, w, y, h, opts) {
    var cut = PW - x;
    if (cut >= w) { frame(a, photo, x, y, w, h, null, opts); return; }
    var full = M.cropFor(photo, w, h);
    var frac = cut / w;
    if (cut > 0.5) {
      frame(a, photo, x, y, cut, h, { sx: full.sx, sy: full.sy, sw: full.sw * frac, sh: full.sh }, opts);
    }
    frame(b, photo, 0, y, w - cut, h,
      { sx: full.sx + full.sw * frac, sy: full.sy, sw: full.sw * (1 - frac), sh: full.sh }, opts);
  }

  /* ---------------- scattered cluster (no cropping) ---------------- */
  function cluster(pg, photos, box, rand, opts) {
    opts = opts || {};
    var n = photos.length;
    if (!n) return;
    var cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
    var gapX = box.w * (opts.tight ? 0.05 : 0.085);
    var colW = (box.w - (cols - 1) * gapX) / cols;

    // tallest first, then deal to the shortest column
    var order = photos.slice().sort(function (p, q) { return (q.ar || 1) - (p.ar || 1); });
    var buckets = [], totals = [];
    for (var c = 0; c < cols; c++) { buckets.push([]); totals.push(0); }
    order.forEach(function (p) {
      var k = 0;
      for (var j = 1; j < cols; j++) if (totals[j] < totals[k]) k = j;
      buckets[k].push(p);
      totals[k] += 1 / (p.ar || 1);
    });

    var startY = box.y + box.h * (opts.dropTop == null ? 0 : opts.dropTop);
    var gapFactor = 0.02 + rand() * 0.018;

    // how wide can each column's prints be before the column gets too tall?
    function fitW(list) {
      var w = colW * 0.97, guard = 0;
      while (guard++ < 18) {
        var total = box.h * gapFactor * (list.length - 1);
        for (var i = 0; i < list.length; i++) total += w / (list[i].ar || 1);
        if (total <= box.y + box.h - startY || w <= colW * 0.34) return w;
        w *= 0.93;
      }
      return w;
    }
    var widths = buckets.map(function (l) { return l.length ? fitW(l) : 0; })
      .filter(function (v) { return v > 0; });
    // one width for every column, so the prints line up like a wall of prints
    var w = Math.min.apply(null, widths);
    var gutter = box.w * (opts.tight ? 0.035 : 0.05);
    var usedW = cols * w + (cols - 1) * gutter;
    var x0 = box.x + Math.max(0, (box.w - usedW) / 2);

    var probe = buckets.map(function (list) {
      if (!list.length) return 0;
      var t = box.h * gapFactor * (list.length - 1);
      for (var i = 0; i < list.length; i++) t += w / (list[i].ar || 1);
      return t;
    });
    var tallest = Math.max.apply(null, probe.concat([0]));
    var slack = Math.max(0, (box.y + box.h - tallest - startY) * 0.55);
    startY += slack;

    buckets.forEach(function (list, ci) {
      if (!list.length) return;
      var x = x0 + ci * (w + gutter);
      var y = startY + (rand() - 0.5) * box.h * 0.035 + (ci === 1 ? box.h * 0.035 : 0) + (ci === 2 ? box.h * 0.06 : 0);
      var innerGap = box.h * gapFactor;
      list.forEach(function (p, ri) {
        var h = print(pg, p, x + (rand() - 0.5) * w * 0.03, y, w, { z: 2 + ri });
        y += h + innerGap;
      });
    });
  }

  /* ---------------- spread recipes ---------------- */
  var SPREADS = {};

  /* 1. one wide photo across the fold — the IG carousel trick */
  SPREADS.heroFold = {
    key: 'heroFold', name: '跨页大图',
    build: function (a, b, photos, rand, ctx) {
      var wide = photos[0];
      var y = PH * 0.055, h = PH * 0.89;
      crossPhoto(a, b, wide, 0, PW * 2, y, h);
      a.texts.push(text({
        x: PW * 0.08, y: y + h + PH * 0.028, w: PW * 0.7, size: CUR.cap,
        color: CUR.muted, tracking: CUR.capTrack, text: ctx.label + '    ' + ctx.title
      }));
    }
  };

  /* 2. two prints at their own ratio, forming one band over the seam */
  SPREADS.bandFold = {
    key: 'bandFold', name: '横带对开',
    build: function (a, b, photos, rand, ctx) {
      var y = PH * 0.26;
      var first = photos[0];
      var h = print(a, first, 0, y, PW, { paper: false });
      if (photos[1]) print(b, photos[1], 0, y, PW, { paper: false });
      var yy = y + Math.max(h, PH * 0.3);
      a.texts.push(text({
        x: PW * 0.08, y: Math.min(yy, PH * 0.9), w: PW * 0.7, size: CUR.cap,
        color: CUR.muted, tracking: CUR.capTrack, text: ctx.label
      }));
      var rest = photos.slice(2);
      if (rest.length) {
        cluster(b, rest, { x: PW * 0.08, y: Math.min(yy + PH * 0.06, PH * 0.7), w: PW * 0.84, h: PH * 0.2 }, rand, { tight: true });
      }
    }
  };

  /* 3. a small print running over the seam, two hanging off it */
  SPREADS.crossSmall = {
    key: 'crossSmall', name: '小图跨缝',
    build: function (a, b, photos, rand, ctx) {
      var lead = photos[0];
      var w = Math.min(PW * 0.9, PW * 0.42 * (lead.ar || 1) * 2);
      var h = w / (lead.ar || 1);
      crossPhoto(a, b, lead, PW * 0.58, w, PH * 0.30, h, {});
      if (photos[1]) {
        var w1 = PW * 0.3 * Math.min(1.2, photos[1].ar || 1);
        print(a, photos[1], PW * 0.10, PH * 0.10, w1, {});
      }
      if (photos[2]) {
        var w2 = PW * 0.3 * Math.min(1.2, photos[2].ar || 1);
        print(b, photos[2], PW * 0.50, PH * 0.10, w2, {});
      }
      var rest = photos.slice(3);
      if (rest.length) {
        cluster(a, rest, { x: PW * 0.08, y: PH * 0.74, w: PW * 0.84, h: PH * 0.16 }, rand, { tight: true });
      }
      a.texts.push(text({
        x: PW * 0.08, y: PH * 0.935, w: PW * 0.7, size: CUR.cap, color: CUR.muted,
        tracking: CUR.capTrack, text: ctx.label
      }));
    }
  };

  /* 4. one plate bleeding off the outer edge, prints on the other page */
  SPREADS.bigPanel = {
    key: 'bigPanel', name: '大图压边',
    build: function (a, b, photos, rand, ctx) {
      var p = photos[0];
      var w = PW * 0.80, h = w / (p.ar || 1);
      if (h > PH * 0.86) { h = PH * 0.86; w = h * (p.ar || 1); }
      frame(a, p, 0, (PH - h) / 2, w, h, null, {});
      cluster(b, photos.slice(1), { x: PW * 0.10, y: PH * 0.09, w: PW * 0.80, h: PH * 0.74 }, rand);
      a.texts.push(text({
        x: PW * 0.08, y: PH * 0.945, w: PW * 0.6, size: CUR.cap, color: '#ffffff',
        tracking: CUR.capTrack, opacity: .9, text: ctx.label
      }));
    }
  };

  /* 5. a page given to type, one print under it */
  SPREADS.typePage = {
    key: 'typePage', name: '文字页',
    build: function (a, b, photos, rand, ctx) {
      var half = Math.ceil(photos.length / 2);
      cluster(a, photos.slice(0, half), { x: PW * 0.10, y: PH * 0.09, w: PW * 0.80, h: PH * 0.74 }, rand);
      var right = photos.slice(half);
      var line = ctx.quote || ctx.title;
      var size = CUR.titleSize;
      b.texts.push(text({
        x: PW * 0.12, y: PH * 0.20, w: PW * 0.76, size: size,
        family: CUR.titleFamily === 'serif' ? SERIF : SANS,
        lineHeight: 1.42, color: CUR.ink, text: line
      }));
      b.texts.push(text({
        x: PW * 0.12, y: PH * 0.20 + size * 1.42 * Math.ceil(line.length / 10) + PH * 0.045,
        w: PW * 0.76, size: CUR.cap, color: CUR.muted, tracking: CUR.capTrack, text: ctx.label
      }));
      if (right.length) {
        var w = PW * 0.52 * Math.min(1.25, right[0].ar || 1);
        print(b, right[0], (PW - w) / 2, PH * 0.62, w, {});
      }
    }
  };

  /* 6. a wall of small contact prints beside one plate */
  SPREADS.contactGrid = {
    key: 'contactGrid', name: '接触表页',
    build: function (a, b, photos, rand, ctx) {
      var n = Math.min(9, photos.length - 1);
      var cols = 3, rows = Math.ceil(n / cols);
      var bx = PW * 0.10, by = PH * 0.10, bw = PW * 0.80, bh = PH * 0.62;
      var gx = bw * 0.05, gy = bh * 0.045;
      var cw = (bw - (cols - 1) * gx) / cols;
      var ch = (bh - (rows - 1) * gy) / rows;
      for (var i = 0; i < n; i++) {
        var c = i % cols, r = Math.floor(i / cols);
        var p = photos[i];
        var w = Math.min(cw, ch * (p.ar || 1));
        var h = w / (p.ar || 1);
        frame(a, p, bx + c * (cw + gx) + (cw - w) / 2, by + r * (ch + gy) + (ch - h) / 2, w, h, null, { paper: true });
      }
      var last = photos[photos.length - 1];
      var lw = PW * 0.62 * Math.min(1.2, last.ar || 1);
      print(b, last, (PW - lw) / 2, PH * 0.20, lw, {});
      b.texts.push(text({
        x: PW * 0.12, y: PH * 0.80, w: PW * 0.76, size: CUR.cap, color: CUR.muted,
        tracking: CUR.capTrack, align: 'center', text: ctx.label
      }));
    }
  };

  /* 7. quiet left page, wall of prints right */
  SPREADS.scatterRight = {
    key: 'scatterRight', name: '散布拼贴',
    build: function (a, b, photos, rand, ctx) {
      var nLeft = photos.length >= 8 ? 2 : 1;
      var left = photos.slice(0, nLeft), right = photos.slice(nLeft);
      cluster(b, right, { x: PW * 0.08, y: PH * 0.09, w: PW * 0.84, h: PH * 0.78 }, rand);
      var lead = left[0];
      var w = PW * 0.52 * Math.min(1.25, lead.ar || 1);
      var h = print(a, lead, (PW - w) / 2, PH * 0.26, w, {});
      a.texts.push(text({
        x: PW * 0.12, y: PH * 0.26 + h + PH * 0.05, w: PW * 0.76, size: CUR.cap,
        color: CUR.muted, tracking: CUR.capTrack, align: 'center', text: ctx.title
      }));
      if (left[1]) {
        var w2 = PW * 0.24 * Math.min(1.25, left[1].ar || 1);
        print(a, left[1], PW * 0.55, PH * 0.26 + h + PH * 0.10, w2, { z: 3 });
      }
      a.texts.push(text({
        x: PW * 0.10, y: PH * 0.07, w: PW * 0.8, size: CUR.cap, color: CUR.muted,
        tracking: CUR.capTrack + 1, align: 'center', text: 'A SMALL BOOK'
      }));
    }
  };

  /* 8. a cluster on each page, the right one dropped lower */
  SPREADS.scatterPair = {
    key: 'scatterPair', name: '双页散布',
    build: function (a, b, photos, rand, ctx) {
      var half = Math.ceil(photos.length / 2);
      cluster(a, photos.slice(0, half), { x: PW * 0.10, y: PH * 0.09, w: PW * 0.80, h: PH * 0.74 }, rand);
      cluster(b, photos.slice(half), { x: PW * 0.10, y: PH * 0.15, w: PW * 0.80, h: PH * 0.72 }, rand, { dropTop: 0.04 });
      a.texts.push(text({
        x: PW * 0.12, y: PH * 0.875, w: PW * 0.76, size: CUR.cap, color: CUR.muted,
        tracking: CUR.capTrack, text: ctx.label
      }));
    }
  };

  /* 9. two full pages — the breath between dense spreads */
  SPREADS.twin = {
    key: 'twin', name: '对页满版',
    build: function (a, b, photos, rand, ctx) {
      frame(a, photos[0], 0, 0, PW, PH, null, {});
      if (photos[1]) frame(b, photos[1], 0, 0, PW, PH, null, {});
      a.texts.push(text({
        x: PW * 0.08, y: PH * 0.93, w: PW * 0.6, size: CUR.cap, color: '#ffffff',
        tracking: CUR.capTrack, opacity: .9, text: ctx.label
      }));
    }
  };

  /* 10. one quiet page: a single print floating on paper */
  SPREADS.quiet = {
    key: 'quiet', name: '单页留白',
    build: function (a, b, photos, rand, ctx) {
      var p = photos[0];
      var w = PW * 0.54 * Math.min(1.25, p.ar || 1);
      var h = print(a, p, (PW - w) / 2, PH * 0.28, w, {});
      a.texts.push(text({
        x: PW * 0.12, y: PH * 0.28 + h + PH * 0.055, w: PW * 0.76, size: CUR.cap,
        color: CUR.muted, tracking: CUR.capTrack + 1, align: 'center', text: ctx.title
      }));
      if (photos[1]) {
        cluster(b, photos.slice(1), { x: PW * 0.10, y: PH * 0.10, w: PW * 0.80, h: PH * 0.74 }, rand);
      } else {
        b.texts.push(text({
          x: PW * 0.16, y: PH * 0.44, w: PW * 0.68, size: 26,
          family: SERIF, color: CUR.muted, align: 'center', lineHeight: 1.7, text: ctx.quote || ctx.title
        }));
      }
    }
  };

  /* ---------------- capacity ---------------- */
  var CAP = {
    heroFold: [1, 1],
    bandFold: [2, 3],
    crossSmall: [3, 4],
    bigPanel: [3, 10],
    typePage: [2, 3],
    contactGrid: [5, 10],
    scatterRight: [4, 12],
    scatterPair: [4, 14],
    twin: [2, 2],
    quiet: [1, 4]
  };

  M.ZINE = THEMES;
  M.ZINE_CAP = CAP;
  M.ZINE_PAGE = { w: PW, h: PH };
  M.ZINE_TYPES = Object.keys(SPREADS).map(function (k) {
    return { key: k, name: SPREADS[k].name, cap: CAP[k] };
  });

  M.rebalanceZine = function (chunks, types, total) {
    function capOf(k) { return CAP[k] || [1, 14]; }
    function capSum() { return types.reduce(function (a, t) { return a + capOf(t)[1]; }, 0); }
    var guard = 0;
    while (capSum() < total && guard++ < 12) {
      var pick = types.map(function (t, i) { return { t: t, i: i, c: capOf(t)[1] }; })
        .filter(function (o) { return o.t !== 'scatterPair'; })
        .sort(function (a, b) { return a.c - b.c; })[0];
      if (!pick) break;
      types[pick.i] = 'scatterPair';
    }
    var over = [];
    chunks.forEach(function (c, i) {
      var cap = capOf(types[i]);
      if (c.length > cap[1]) over = over.concat(c.splice(cap[1]));
    });
    chunks.forEach(function (c, i) {
      var cap = capOf(types[i]);
      while (over.length && c.length < cap[1]) c.push(over.shift());
    });
    if (over.length) {
      var roomiest = chunks.map(function (c, i) { return { i: i, room: capOf(types[i])[1] - c.length }; })
        .sort(function (a, b) { return b.room - a.room; })[0];
      chunks[roomiest.i] = chunks[roomiest.i].concat(over);
    }
    return { chunks: chunks, types: types };
  };

  function planTypes(budgets, rand) {
    var pool = Object.keys(CAP).filter(function (k) { return k !== 'heroFold'; });
    var seq = [];
    budgets.forEach(function (budget, i) {
      var fits = pool.filter(function (k) {
        return budget >= CAP[k][0] && budget <= CAP[k][1] && k !== seq[seq.length - 1];
      });
      if (!fits.length) fits = pool.filter(function (k) { return k !== seq[seq.length - 1]; });
      var weighted = [];
      fits.forEach(function (k) {
        var w = k === 'scatterPair' ? 3 : k === 'scatterRight' ? 2 : 1;
        for (var j = 0; j < w; j++) weighted.push(k);
      });
      seq.push(weighted[Math.floor(rand() * weighted.length)]);
    });
    return seq;
  }

  function allocate(total, parts) {
    var base = Math.floor(total / parts), extra = total % parts, out = [];
    for (var i = 0; i < parts; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  /* ---------------- cover ---------------- */
  function cover(photo, opt) {
    var pg = page();
    if (CUR.tint) {
      pg.bg = mix((photo.colors && photo.colors[0]) || '#d8d2c4', CUR.paper, 0.45);
    }
    var w = PW * 0.68 * Math.min(1.2, photo.ar || 1);
    var h = print(pg, photo, (PW - w) / 2, PH * 0.14, w, {});
    pg.texts.push(text({
      x: PW * 0.14, y: PH * 0.64, w: PW * 0.72, size: CUR.cap, color: CUR.muted,
      tracking: CUR.capTrack + 1.5, align: 'center', text: 'A SMALL BOOK'
    }));
    pg.texts.push(text({
      x: PW * 0.10, y: PH * 0.685, w: PW * 0.80, size: 60,
      family: SERIF, align: 'center', lineHeight: 1.2, text: opt.title
    }));
    pg.texts.push(text({
      x: PW * 0.14, y: PH - PH * 0.095, w: PW * 0.72, size: CUR.cap, color: CUR.muted,
      tracking: CUR.capTrack, align: 'center', text: opt.total + ' PHOTOGRAPHS  ·  ' + opt.year
    }));
    return pg;
  }

  /* ---------------- build ---------------- */
  /* if a page ends well above the foot, put the title in the empty band
     instead of leaving a dead strip: it's how a printed page breathes */
  function fillType(pg, ctx, sub) {
    var low = 0;
    pg.frames.forEach(function (f) { low = Math.max(low, f.y + f.h); });
    // the caption label sits at the foot; the title must fit between them
    var next = PH;
    pg.texts.forEach(function (t) {
      if (t.size <= CUR.cap + 2 && t.y > low + 10) next = Math.min(next, t.y);
    });
    var room = next - low;
    if (room < PH * 0.18) return false;
    var size = Math.min(Math.round(PW * 0.045), Math.round(room * 0.30));
    var y = low + Math.min(room * 0.26, PH * 0.085);
    pg.texts.push(text({
      x: PW * 0.10, y: y, w: PW * 0.78, size: size, family: SERIF,
      color: CUR.ink, lineHeight: 1.26, text: ctx.quote || ctx.title
    }));
    if (sub) {
      pg.texts.push(text({
        x: PW * 0.10, y: y + size * 1.34, w: PW * 0.78, size: CUR.cap,
        color: CUR.muted, tracking: CUR.capTrack + 1.5, text: sub
      }));
    }
    return true;
  }

  function buildSpread(typeKey, chunk, rand, ctx) {
    var recipe = SPREADS[typeKey] || SPREADS.scatterPair;
    var a = page(), b = page();
    if (CUR.tint && chunk.length) {
      // the paper of a collage spread takes its colour from the photos
      var c1 = (chunk[0].colors && chunk[0].colors[0]) || '#d8d2c4';
      var c2 = (chunk[chunk.length - 1].colors && chunk[chunk.length - 1].colors[0]) || c1;
      a.bg = mix(c1, CUR.paper, 0.45);
      b.bg = mix(c2, CUR.paper, 0.45);
      a.ink = b.ink = CUR.ink;
    }
    recipe.build(a, b, chunk, rand, ctx);
    if (CUR.key !== 'contact') {
      if (!fillType(a, ctx, ctx.label)) fillType(b, ctx, '');
    }
    var placed = {};
    a.frames.concat(b.frames).forEach(function (f) { placed[f.photo.id] = 1; });
    return {
      type: recipe.key, name: recipe.name, a: a, b: b, photos: chunk,
      unused: chunk.filter(function (p) { return !placed[p.id]; })
    };
  }

  M.buildZine = function (photos, opt) {
    opt = opt || {};
    CUR = THEMES[opt.theme] || THEMES.quiet;
    var rand = rng(opt.seed || 11);
    var list = photos.filter(function (p) { return p && p.img; });
    if (!list.length) return { pages: [], spreads: [], total: 0, theme: CUR.key };

    var coverPhoto = opt.coverPhoto ||
      list.slice().sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); })[0];
    var pages = [cover(coverPhoto, {
      title: opt.title || '未命名的一卷', year: opt.year, total: list.length
    })];
    var ctx = { title: opt.title || '未命名的一卷', quote: opt.quote || '', label: '' };

    function finish(spreads) {
      return {
        pages: pages, spreads: spreads, total: list.length,
        cover: coverPhoto, coverPage: pages[0], theme: CUR.key,
        chunks: spreads.map(function (s) { return s.photos; }),
        types: spreads.map(function (s) { return s.type; })
      };
    }

    if (opt.chunks && opt.chunks.length) {
      var fixed = opt.chunks.map(function (chunk, i) {
        var c = { title: ctx.title, quote: ctx.quote, label: pad2(pages.length) + ' — ' + pad2(pages.length + 1) };
        var sp = buildSpread(opt.types[i] || 'scatterPair', chunk, rand, c);
        pages.push(sp.a, sp.b);
        return sp;
      });
      return finish(fixed);
    }

    var rest = list.filter(function (p) { return p !== coverPhoto; });
    var nSpreads = Math.max(1, opt.spreads || 4);
    var widest = rest.slice().sort(function (a, b) { return (b.ar || 1) - (a.ar || 1); })[0];
    var queue = rest.filter(function (p) { return p !== widest; });
    var tail = Math.max(0, nSpreads - 1);
    var tailBudgets = allocate(queue.length, Math.max(1, tail));
    var types = ['heroFold'].concat(tail ? planTypes(tailBudgets, rand) : []);
    var budgets = [1].concat(tail ? tailBudgets : []);

    var idx = 0, carry = [], spreads = [];
    budgets.forEach(function (budget, i) {
      var typeKey = types[i] || 'scatterPair';
      var chunk;
      if (typeKey === 'heroFold' && i === 0 && widest) {
        chunk = [widest];
      } else {
        var take = clamp(budget, 1, 14);
        chunk = carry.concat(queue.slice(idx, idx + take));
        idx += take;
      }
      ctx.label = pad2(pages.length) + ' — ' + pad2(pages.length + 1);
      var sp = buildSpread(typeKey, chunk, rand, ctx);
      carry = sp.unused;
      pages.push(sp.a, sp.b);
      spreads.push(sp);
    });

    return finish(spreads);
  };
})(window.MEM);
