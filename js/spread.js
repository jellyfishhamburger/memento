/* 小书 / 跨页引擎
   Each output image is a portrait page (1080×1440). Neighbouring pages are designed
   as one spread: a photo can cross the fold, and the two halves only read as a whole
   when you swipe. Photos sit small on paper with air around them, not in grids. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var PW = 1080, PH = 1440;

  var ZINE = {
    paper: '#f6f3ec',
    ink: '#191712',
    muted: '#8b8377',
    accent: '#b0452b',
    serif: 'Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif',
    sans: '"Helvetica Neue", "Segoe UI", Arial, "PingFang SC", sans-serif'
  };

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

  function page() {
    return { w: PW, h: PH, bg: ZINE.paper, ink: ZINE.ink, muted: ZINE.muted, frames: [], rects: [], texts: [] };
  }

  function text(o) {
    return {
      x: o.x, y: o.y, w: o.w, lines: String(o.text).split('\n'),
      size: o.size, family: o.family || ZINE.sans, weight: o.weight || 400,
      color: o.color || ZINE.ink, align: o.align || 'left',
      tracking: o.tracking || 0, lineHeight: o.lineHeight || 1.5, opacity: o.opacity == null ? 1 : o.opacity
    };
  }

  /* a frame from an explicit source rect — this is what makes a photo cross the fold */
  function frame(page, photo, x, y, w, h, crop, opts) {
    opts = opts || {};
    var pad = opts.paper ? Math.round(Math.min(PW, PH) * 0.006) : 0;
    var inner = { w: w - pad * 2, h: h - pad * 2 };
    page.frames.push({
      photo: photo, x: x, y: y, w: w, h: h, pad: pad,
      crop: crop || M.cropFor(photo, inner.w, inner.h),
      z: opts.z || 1
    });
  }

  /* one photo, split in two: left page for the part before the seam, right page
     for the rest. Total width = both pages, so the halves join exactly. */
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

  /* kept for the full-width opener */
  function foldPhoto(a, b, photo, y, h, opts) {
    crossPhoto(a, b, photo, 0, PW * 2, y, h, opts);
  }

  /* ---------------- scattered cluster ---------------- */
  /* Photos small, on paper, in three loose columns of different heights —
     the wall of little prints an art-book spread is made of. */
  function cluster(pg, photos, box, rand, opts) {
    opts = opts || {};
    var n = photos.length;
    if (!n) return;
    var cols = n <= 3 ? 2 : n <= 6 ? 2 : 3;
    var gapX = box.w * (opts.tight ? 0.045 : 0.075);
    var colW = (box.w - (cols - 1) * gapX) / cols;

    var order = photos.slice().sort(function (p, q) { return (q.ar || 1) - (p.ar || 1); });
    var buckets = [];
    for (var c = 0; c < cols; c++) buckets.push([]);
    // balance by height: the shortest column takes the next photo
    var totals = [];
    for (c = 0; c < cols; c++) totals.push(0);
    order.forEach(function (p) {
      var k = 0;
      for (var j = 1; j < cols; j++) if (totals[j] < totals[k]) k = j;
      buckets[k].push(p);
      totals[k] += 1 / (p.ar || 1);
    });

    var startY = box.y + box.h * (opts.dropTop == null ? 0.02 : opts.dropTop);
    var gapFactor = 0.018 + rand() * 0.016;

    buckets.forEach(function (list, ci) {
      if (!list.length) return;
      var x = box.x + ci * (colW + gapX);
      var y = startY + (rand() - 0.5) * box.h * 0.05 + (ci === 1 ? box.h * 0.05 : 0);
      var avail = box.y + box.h - y;
      var innerGap = box.h * gapFactor;
      // shrink the column until it fits rather than dropping photos
      var w = colW * (0.86 + rand() * 0.14);
      var guard = 0;
      while (guard++ < 14) {
        var total = innerGap * (list.length - 1);
        for (var i = 0; i < list.length; i++) total += w / (list[i].ar || 1);
        if (total <= avail || w <= colW * 0.45) break;
        w *= 0.93;
      }
      list.forEach(function (p, ri) {
        var h = w / (p.ar || 1);
        if (y + h > box.y + box.h + 1) return;
        frame(pg, p, x + (colW - w) * (rand() * 0.4), y, w, h, null, { paper: true, z: 2 + ri });
        y += h + innerGap;
      });
    });
  }

  /* ---------------- spread recipes ---------------- */
  var SPREADS = {
    /* a wide photo crossing the fold, edge to edge — the opener of the book */
    heroFold: {
      key: 'heroFold', name: '跨页大图',
      fits: function (n) { return n >= 1 && n <= 3; },
      build: function (a, b, photos, rand, ctx) {
        var wide = photos[0];
        var y = PH * 0.055, h = PH * 0.89;
        foldPhoto(a, b, wide, y, h);
        a.texts.push(text({
          x: PW * 0.08, y: y + h + PH * 0.028, w: PW * 0.7, size: 12, color: ZINE.muted,
          tracking: 2.6, text: ctx.label + '    ' + ctx.title
        }));
      }
    },

    /* left page airy with a line of type, right page a wall of small prints */
    scatterRight: {
      key: 'scatterRight', name: '散布拼贴',
      fits: function (n) { return n >= 4 && n <= 12; },
      build: function (a, b, photos, rand, ctx) {
        var nLeft = photos.length >= 8 ? 2 : 1;
        var left = photos.slice(0, nLeft), right = photos.slice(nLeft);
        cluster(b, right, { x: PW * 0.08, y: PH * 0.10, w: PW * 0.84, h: PH * 0.76 }, rand);
        // the quiet page: one print centred in the paper, a line of type under it
        var lead = left[0];
        var lw = PW * 0.50, lh = lw / (lead.ar || 1);
        if (lh > PH * 0.44) { lh = PH * 0.44; lw = lh * (lead.ar || 1); }
        frame(a, lead, (PW - lw) / 2, PH * 0.28, lw, lh, null, { paper: true });
        a.texts.push(text({
          x: PW * 0.12, y: PH * 0.28 + lh + PH * 0.045, w: PW * 0.76, size: 12,
          color: ZINE.muted, tracking: 3, align: 'center', text: ctx.title
        }));
        if (left[1]) {
          var p2 = left[1], w2 = PW * 0.24, h2 = w2 / (p2.ar || 1);
          frame(a, p2, PW * 0.56, PH * 0.28 + lh + PH * 0.10, w2, h2, null, { paper: true, z: 3 });
        }
        a.texts.push(text({
          x: PW * 0.10, y: PH * 0.075, w: PW * 0.8, size: 12, color: ZINE.muted,
          tracking: 2.6, align: 'center', text: 'A SMALL BOOK'
        }));
      }
    },

    /* both pages: a small cluster each, one page lower than the other */
    scatterPair: {
      key: 'scatterPair', name: '双页散布',
      fits: function (n) { return n >= 4 && n <= 14; },
      build: function (a, b, photos, rand, ctx) {
        var half = Math.ceil(photos.length / 2);
        cluster(a, photos.slice(0, half), { x: PW * 0.10, y: PH * 0.10, w: PW * 0.80, h: PH * 0.70 }, rand);
        cluster(b, photos.slice(half), { x: PW * 0.10, y: PH * 0.16, w: PW * 0.80, h: PH * 0.70 }, rand, { dropTop: 0.10 });
        a.texts.push(text({
          x: PW * 0.12, y: PH * 0.845, w: PW * 0.76, size: 12, color: ZINE.muted,
          tracking: 2.2, text: ctx.label
        }));
      }
    },

    /* two prints forming one continuous band across the seam */
    bandFold: {
      key: 'bandFold', name: '横带对开',
      fits: function (n) { return n >= 2 && n <= 4; },
      build: function (a, b, photos, rand, ctx) {
        var y = PH * 0.31, h = PH * 0.42;
        frame(a, photos[0], 0, y, PW, h, null, {});
        if (photos[1]) frame(b, photos[1], 0, y, PW, h, null, {});
        a.texts.push(text({
          x: PW * 0.08, y: y + h + PH * 0.03, w: PW * 0.7, size: 12, color: ZINE.muted,
          tracking: 2.6, text: ctx.label
        }));
        var rest = photos.slice(2);
        if (rest.length) {
          cluster(b, rest, { x: PW * 0.08, y: y + h + PH * 0.10, w: PW * 0.84, h: PH * 0.14 }, rand, { tight: true });
        }
      }
    },

    /* a small print that runs over the seam, two others hanging off it */
    crossSmall: {
      key: 'crossSmall', name: '小图跨缝',
      fits: function (n) { return n >= 3 && n <= 6; },
      build: function (a, b, photos, rand, ctx) {
        crossPhoto(a, b, photos[0], PW * 0.58, PW * 0.84, PH * 0.34, PH * 0.36, { paper: true });
        var p1 = photos[1];
        if (p1) {
          var w1 = PW * 0.34, h1 = w1 / (p1.ar || 1);
          frame(a, p1, PW * 0.08, PH * 0.12, w1, h1, null, { paper: true });
        }
        var p2 = photos[2];
        if (p2) {
          var w2 = PW * 0.30, h2 = w2 / (p2.ar || 1);
          frame(b, p2, PW * 0.58, PH * 0.12, w2, h2, null, { paper: true });
        }
        var rest = photos.slice(3);
        if (rest.length) {
          cluster(a, rest, { x: PW * 0.08, y: PH * 0.74, w: PW * 0.84, h: PH * 0.16 }, rand, { tight: true });
        }
        a.texts.push(text({
          x: PW * 0.08, y: PH * 0.94, w: PW * 0.7, size: 12, color: ZINE.muted,
          tracking: 2.6, text: ctx.label
        }));
      }
    },

    /* one plate bleeding off the outer edge, small prints on the other page */
    bigPanel: {
      key: 'bigPanel', name: '大图压边',
      fits: function (n) { return n >= 3 && n <= 10; },
      build: function (a, b, photos, rand, ctx) {
        var p = photos[0];
        var w = PW * 0.74, h = w / (p.ar || 1);
        if (h > PH * 0.82) { h = PH * 0.82; w = h * (p.ar || 1); }
        frame(a, p, 0, (PH - h) / 2, w, h, null, {});
        cluster(b, photos.slice(1), { x: PW * 0.10, y: PH * 0.10, w: PW * 0.80, h: PH * 0.72 }, rand);
        a.texts.push(text({
          x: PW * 0.08, y: PH * 0.94, w: PW * 0.7, size: 12, color: '#ffffff',
          tracking: 2.6, opacity: .9, text: ctx.label
        }));
      }
    },

    /* a page given to a line of type and one small print */
    typePage: {
      key: 'typePage', name: '文字页',
      fits: function (n) { return n >= 2 && n <= 7; },
      build: function (a, b, photos, rand, ctx) {
        cluster(a, photos.slice(0, Math.ceil(photos.length / 2)), { x: PW * 0.10, y: PH * 0.10, w: PW * 0.80, h: PH * 0.72 }, rand);
        var right = photos.slice(Math.ceil(photos.length / 2));
        var line = ctx.quote || '海边的十一月';
        b.texts.push(text({
          x: PW * 0.12, y: PH * 0.24, w: PW * 0.76, size: 40, family: ZINE.serif,
          lineHeight: 1.45, color: ZINE.ink, text: line
        }));
        b.texts.push(text({
          x: PW * 0.12, y: PH * 0.24 + 40 * 1.45 * Math.ceil(line.length / 12) + PH * 0.04,
          w: PW * 0.76, size: 12, color: ZINE.muted, tracking: 2.6, text: ctx.label
        }));
        if (right.length) {
          var w = PW * 0.46, h = w / (right[0].ar || 1);
          if (h > PH * 0.34) { h = PH * 0.34; w = h * (right[0].ar || 1); }
          frame(b, right[0], PW * 0.52 - w / 2 + PW * 0.0, PH * 0.62, w, h, null, { paper: true });
        }
      }
    },

    /* a page of tiny contact prints, a single plate opposite */
    contactGrid: {
      key: 'contactGrid', name: '接触表页',
      fits: function (n) { return n >= 5 && n <= 14; },
      build: function (a, b, photos, rand, ctx) {
        var n = Math.min(9, photos.length - 1);
        var cols = 3, rows = Math.ceil(n / cols);
        var bx = PW * 0.10, by = PH * 0.11, bw = PW * 0.80, bh = PH * 0.62;
        var gx = bw * 0.05, gy = bh * 0.04;
        var cw = (bw - (cols - 1) * gx) / cols;
        var ch = (bh - (rows - 1) * gy) / rows;
        for (var i = 0; i < n; i++) {
          var c = i % cols, r = Math.floor(i / cols);
          var w = cw, h = Math.min(ch, cw / (photos[i].ar || 1));
          frame(a, photos[i], bx + c * (cw + gx) + (cw - w) / 2, by + r * (ch + gy) + (ch - h) / 2, w, h, null, { paper: true });
        }
        var last = photos[photos.length - 1];
        var lw = PW * 0.62, lh = lw / (last.ar || 1);
        if (lh > PH * 0.56) { lh = PH * 0.56; lw = lh * (last.ar || 1); }
        frame(b, last, (PW - lw) / 2, PH * 0.22, lw, lh, null, { paper: true });
        b.texts.push(text({
          x: PW * 0.12, y: PH * 0.22 + lh + PH * 0.05, w: PW * 0.76, size: 12,
          color: ZINE.muted, tracking: 2.6, align: 'center', text: ctx.label
        }));
      }
    },

    /* one full page each, no air — the breath between two dense spreads */
    twin: {
      key: 'twin', name: '对页满版',
      fits: function (n) { return n >= 2 && n <= 4; },
      build: function (a, b, photos, rand, ctx) {
        frame(a, photos[0], 0, 0, PW, PH, null, {});
        if (photos[1]) frame(b, photos[1], 0, 0, PW, PH, null, {});
        a.texts.push(text({
          x: PW * 0.08, y: PH * 0.93, w: PW * 0.6, size: 12, color: '#ffffff',
          tracking: 2.4, opacity: .85, text: ctx.label
        }));
      }
    },

    /* one quiet page: a single small print floating in the middle of the paper */
    quiet: {
      key: 'quiet', name: '单页留白',
      fits: function (n) { return n >= 1 && n <= 4; },
      build: function (a, b, photos, rand, ctx) {
        var p = photos[0];
        var w = PW * 0.52, h = w / (p.ar || 1);
        if (h > PH * 0.52) { h = PH * 0.52; w = h * (p.ar || 1); }
        frame(a, p, (PW - w) / 2, PH * 0.30, w, h, null, { paper: true });
        a.texts.push(text({
          x: PW * 0.12, y: PH * 0.30 + h + PH * 0.06, w: PW * 0.76, size: 12,
          color: ZINE.muted, tracking: 3, align: 'center', text: ctx.title
        }));
        if (photos[1]) {
          cluster(b, photos.slice(1), { x: PW * 0.10, y: PH * 0.12, w: PW * 0.80, h: PH * 0.72 }, rand);
        } else {
          b.texts.push(text({
            x: PW * 0.18, y: PH * 0.46, w: PW * 0.64, size: 22, family: ZINE.serif,
            color: ZINE.muted, align: 'center', lineHeight: 1.6, text: ctx.quote || ctx.title
          }));
        }
      }
    }
  };

  /* ---------------- planner ---------------- */
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
  M.ZINE_CAP = CAP;

  /* keep every photo inside the book: clamp each spread to its layout's capacity,
     pour the overflow into spreads that still have room, and if the chosen
     layouts cannot hold the whole set, promote the most restrictive one. */
  M.rebalanceZine = function (chunks, types, total) {
    function capOf(k) { return CAP[k] || [1, 14]; }
    function capSum() {
      return types.reduce(function (a, t) { return a + capOf(t)[1]; }, 0);
    }
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
  M.ZINE_TYPES = Object.keys(SPREADS).map(function (k) {
    return { key: k, name: SPREADS[k].name, cap: CAP[k] || [1, 14] };
  });

  function planSpreadTypes(budgets, rand) {
    var pool = Object.keys(CAP).filter(function (k) { return k !== 'heroFold'; });
    var seq = [];
    budgets.forEach(function (budget, i) {
      var fits = pool.filter(function (k) {
        return budget >= CAP[k][0] && budget <= CAP[k][1] && k !== seq[seq.length - 1];
      });
      if (!fits.length) fits = pool.filter(function (k) { return k !== seq[seq.length - 1]; });
      var weighted = [];
      fits.forEach(function (k) {
        var w = k === 'scatterRight' ? 2 : k === 'scatterPair' ? 3 : 1;
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
    var w = PW * 0.66, h = w / (photo.ar || 1);
    if (h > PH * 0.52) { h = PH * 0.52; w = h * (photo.ar || 1); }
    frame(pg, photo, (PW - w) / 2, PH * 0.13, w, h, null, { paper: true });
    pg.texts.push(text({
      x: PW * 0.14, y: PH * 0.655, w: PW * 0.72, size: 12,
      color: ZINE.muted, tracking: 3.4, align: 'center', text: 'A SMALL BOOK'
    }));
    pg.texts.push(text({
      x: PW * 0.10, y: PH * 0.70, w: PW * 0.80,
      size: 58, family: ZINE.serif, align: 'center', lineHeight: 1.2, text: opt.title
    }));
    pg.texts.push(text({
      x: PW * 0.14, y: PH - PH * 0.10, w: PW * 0.72, size: 12, color: ZINE.muted,
      tracking: 2.4, align: 'center', text: opt.total + ' PHOTOGRAPHS  ·  ' + opt.year
    }));
    return pg;
  }

  /* ---------------- public ---------------- */
  M.ZINE = ZINE;
  M.ZINE_PAGE = { w: PW, h: PH };
  M.SPREAD_TYPES = SPREADS;

  function buildSpread(typeKey, chunk, rand, ctx) {
    var recipe = SPREADS[typeKey] || SPREADS.scatterPair;
    var a = page(), b = page();
    recipe.build(a, b, chunk, rand, ctx);
    var placed = {};
    a.frames.concat(b.frames).forEach(function (f) { placed[f.photo.id] = 1; });
    return {
      type: recipe.key, name: recipe.name, a: a, b: b, photos: chunk,
      unused: chunk.filter(function (p) { return !placed[p.id]; })
    };
  }

  M.buildZine = function (photos, opt) {
    opt = opt || {};
    var rand = rng(opt.seed || 11);
    var list = photos.filter(function (p) { return p && p.img; });
    if (!list.length) return { pages: [], spreads: [], total: 0 };

    var coverPhoto = opt.coverPhoto ||
      list.slice().sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); })[0];
    var pages = [cover(coverPhoto, {
      title: opt.title || '未命名的一卷',
      year: opt.year, total: list.length
    })];
    var ctx = {
      title: opt.title || '未命名的一卷',
      quote: opt.quote || '',
      label: ''
    };

    // hand-held layout: explicit chunks and types (used when one spread is changed)
    if (opt.chunks && opt.chunks.length) {
      var spreadsFixed = opt.chunks.map(function (chunk, i) {
        var c = { title: ctx.title, quote: ctx.quote, label: pad2(pages.length) + ' — ' + pad2(pages.length + 1) };
        var sp = buildSpread(opt.types[i] || 'scatterPair', chunk, rand, c);
        pages.push(sp.a, sp.b);
        return sp;
      });
      return {
        pages: pages, spreads: spreadsFixed, total: list.length,
        cover: coverPhoto, coverPage: pages[0],
        chunks: spreadsFixed.map(function (s) { return s.photos; }),
        types: spreadsFixed.map(function (s) { return s.type; })
      };
    }

    var rest = list.filter(function (p) { return p !== coverPhoto; });
    var nSpreads = Math.max(1, (opt.spreads || 4));
    // the opener is always one wide print crossing the fold
    var widest = rest.slice().sort(function (a, b) { return (b.ar || 1) - (a.ar || 1); })[0];
    var queue = rest.filter(function (p) { return p !== widest; });
    var tail = Math.max(0, nSpreads - 1);
    var tailBudgets = allocate(queue.length, Math.max(1, tail));
    var types = ['heroFold'].concat(tail ? planSpreadTypes(tailBudgets, rand) : []);
    var budgets = [1].concat(tail ? tailBudgets : []);

    var idx = 0, carry = [], spreads = [];
    budgets.forEach(function (budget, i) {
      var typeKey = types[i] || 'scatterPair';
      var chunk;
      if (typeKey === 'heroFold' && i === 0) {
        chunk = [widest];
      } else {
        var take = clamp(budget, 1, 14);
        chunk = carry.concat(queue.slice(idx, idx + take));
        idx += take;
      }
      ctx.label = pad2(pages.length) + ' — ' + pad2(pages.length + 1);
      var sp = buildSpread(typeKey, chunk, rand, ctx);
      // whatever a recipe could not place flows into the next spread
      carry = sp.unused;
      pages.push(sp.a, sp.b);
      spreads.push(sp);
    });

    return {
      pages: pages, spreads: spreads, total: list.length,
      cover: coverPhoto, coverPage: pages[0],
      chunks: spreads.map(function (s) { return s.photos; }),
      types: spreads.map(function (s) { return s.type; })
    };
  };
})(window.MEM);
