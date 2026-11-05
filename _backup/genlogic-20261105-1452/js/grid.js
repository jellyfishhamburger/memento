/* 九宫格 — pick 9 out of N and lay them so the 3×3 reads as one picture.
   Same page model as the book, one photo per 1080 square. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var SIZE = 1080;

  var LAYOUTS = {
    clean: { key: 'clean', name: '满幅', note: '九张铺满，微信里连成一片', pad: 0, bg: '#ffffff' },
    paper: { key: 'paper', name: '留白', note: '每张一圈纸边，像九张印出来的小照片', pad: 0.036, bg: '#f6f2e9' }
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

  /* how unlike two photos are: 1 = nothing in common */
  function novelty(a, b) {
    var dh = 1 - M.hueDist(a.hue, b.hue);
    var db = 1 - Math.abs((a.bright || .5) - (b.bright || .5));
    var df = 1 - Math.abs((a.focus == null ? .5 : a.focus) - (b.focus == null ? .5 : b.focus));
    return 1 - (0.46 * dh + 0.30 * db + 0.24 * df);
  }

  /* ---------- pick 9 ---------- */
  function select(photos, n, opt) {
    var pool = photos.filter(function (p) { return p && p.img; });
    if (pool.length <= n) return pool.slice();

    var sorted = pool.slice().sort(function (a, b) { return a.hero - b.hero; });
    sorted.forEach(function (p, i) { p._rank = sorted.length > 1 ? i / (sorted.length - 1) : 1; });

    var picked = [];
    if (opt.plan === 'story') {
      // keep the photographer's own sequence, skipping near-duplicates
      var step = pool.length / n;
      for (var i = 0; i < n; i++) {
        var base = Math.floor(i * step);
        var best = null, bestScore = -1;
        for (var k = base; k < Math.min(pool.length, base + Math.ceil(step)); k++) {
          var cand = pool[k];
          var dup = picked.some(function (q) { return novelty(cand, q) < 0.28; });
          if (dup) continue;
          var sc = cand._rank + novel(cand) * 0.3;
          if (sc > bestScore) { bestScore = sc; best = cand; }
        }
        picked.push(best || pool[base]);
      }
      return picked;
    }

    function novel(p) {
      if (!picked.length) return 1;
      var m = 1;
      for (var j = 0; j < picked.length; j++) m = Math.min(m, novelty(p, picked[j]));
      return m;
    }

    // first pick: the strongest image that is not a colour outlier
    var first = pool.slice().sort(function (a, b) { return b.hero - a.hero; })[0];
    picked.push(first);

    while (picked.length < n) {
      var best = null, bestS = -1e9;
      for (var i = 0; i < pool.length; i++) {
        var p = pool[i];
        if (picked.indexOf(p) >= 0) continue;
        var s = 0.40 * p._rank + 0.60 * novel(p) + rngWeight(p, opt.seed) * 0.03;
        if (s > bestS) { bestS = s; best = p; }
      }
      if (!best) break;
      picked.push(best);
    }
    return picked;
  }

  function rngWeight(p, seed) {
    // stable pseudo-random per photo, so the same seed gives the same set
    var h = 2166136261;
    var s = String(p.id) + ':' + (seed || 0);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }

  /* ---------- place them in the 3×3 ---------- */
  function arrange(cells, seed) {
    var out = cells.slice();
    var rand = rng((seed || 1) * 2654435761);
    // strongest in the middle
    var heroAt = 0;
    for (var i = 1; i < out.length; i++) if ((out[i].hero || 0) > (out[heroAt].hero || 0)) heroAt = i;
    swap(out, 4, heroAt);

    function score(list) {
      var s = 0;
      for (var r = 0; r < 3; r++) {
        for (var c = 0; c < 3; c++) {
          var idx = r * 3 + c, a = list[idx];
          var pairs = [];
          if (c < 2) pairs.push(list[idx + 1]);
          if (r < 2) pairs.push(list[idx + 3]);
          for (var k = 0; k < pairs.length; k++) {
            var b = pairs[k];
            var hueSame = 1 - M.hueDist(a.hue, b.hue);           // 1 = same family
            var db = Math.abs((a.bright || .5) - (b.bright || .5));
            var brightBad = 1 - clamp(Math.abs(db - 0.32) / 0.40, 0, 1);
            var fa = a.focus == null ? .5 : a.focus, fb = b.focus == null ? .5 : b.focus;
            var focusMix = 1 - Math.abs(fa - fb);
            s -= 1.05 * hueSame + 0.75 * brightBad;
            s += 0.30 * focusMix;
          }
        }
      }
      s += 2.2 * (list[4].hero || 0);
      return s;
    }

    var cur = score(out);
    for (var it = 0; it < 1500; it++) {
      var a2 = Math.floor(rand() * 9), b2 = Math.floor(rand() * 9);
      if (a2 === 4 || b2 === 4 || a2 === b2) continue;
      swap(out, a2, b2);
      var s2 = score(out);
      if (s2 > cur - 1e-9) cur = s2;
      else swap(out, a2, b2);
    }
    return out;
  }

  function swap(arr, i, j) {
    if (i === j || i < 0 || j < 0 || i >= arr.length || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }

  /* ---------- tiles ---------- */
  function tile(photo, layout) {
    var pad = Math.round(SIZE * layout.pad);
    var inner = SIZE - pad * 2;
    return {
      w: SIZE, h: SIZE, bg: layout.bg, ink: '#17150f', muted: '#79715f',
      style: 'grid', frames: [{
        photo: photo, x: pad, y: pad, w: inner, h: inner, pad: 0,
        crop: M.cropFor(photo, inner, inner), rot: 0, z: 1
      }],
      rects: [], texts: []
    };
  }

  /* ---------- mosaic: every photo, nine squares ---------- */
  var WEIGHTS = [1.25, 0.85, 1.25, 0.85, 0.30, 0.85, 1.25, 0.85, 1.25]; // corners heavy, centre a single hero

  function allocCounts(n, maxPer) {
    var wsum = 0, i;
    for (i = 0; i < 9; i++) wsum += WEIGHTS[i];
    var counts = [];
    for (i = 0; i < 9; i++) counts.push(clamp(Math.round(n * WEIGHTS[i] / wsum), 1, maxPer));
    var diff = n - counts.reduce(function (a, b) { return a + b; }, 0);
    var guard = 0;
    while (diff !== 0 && guard++ < 200) {
      var idx = -1;
      if (diff > 0) {
        for (i = 0; i < 9; i++) if (counts[i] < maxPer && (idx < 0 || counts[i] < counts[idx])) idx = i;
        counts[idx]++; diff--;
      } else {
        for (i = 0; i < 9; i++) if (counts[i] > 1 && (idx < 0 || counts[i] > counts[idx])) idx = i;
        counts[idx]--; diff++;
      }
    }
    return counts;
  }

  function squareSlots(n, g, seed) {
    function vs(r, ratio) {
      var w1 = r.w * ratio - g / 2, w2 = r.w * (1 - ratio) - g / 2;
      return [{ x: r.x, y: r.y, w: w1, h: r.h }, { x: r.x + r.w * ratio + g / 2, y: r.y, w: w2, h: r.h }];
    }
    function hs(r, ratio) {
      var h1 = r.h * ratio - g / 2, h2 = r.h * (1 - ratio) - g / 2;
      return [{ x: r.x, y: r.y, w: r.w, h: h1 }, { x: r.x, y: r.y + r.h * ratio + g / 2, w: r.w, h: h2 }];
    }
    var B = { x: 0, y: 0, w: 1, h: 1 };
    if (n === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
    if (n === 2) {
      var p2 = vs(B, 0.5);
      return (seed % 3 === 0) ? hs(B, 0.56) : p2;
    }
    if (n === 3) {
      var a = vs(B, 0.62); var r3 = hs(a[1], 0.5);
      return [a[0], r3[0], r3[1]];
    }
    if (n === 4) {
      var p4 = vs(B, (seed % 2) ? 0.58 : 0.5);
      if (seed % 2) {
        var L = hs(p4[0], 0.62), R = hs(p4[1], 0.38);
        return [L[0], L[1], R[0], R[1]];
      }
      var L2 = hs(p4[0], 0.5), R2 = hs(p4[1], 0.5);
      return [L2[0], L2[1], R2[0], R2[1]];
    }
    if (n === 5) {
      // one tall hero + a column of four
      var a5 = vs(B, 0.58);
      var col = a5[1];
      var h4 = (col.h - 3 * g) / 4;
      var out5 = [a5[0]];
      for (var q = 0; q < 4; q++) out5.push({ x: col.x, y: col.y + q * (h4 + g), w: col.w, h: h4 });
      return out5;
    }
    // 6: three across, two down
    var out = [], cw = (1 - 2 * g) / 3, ch = (1 - g) / 2;
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < 3; c++) {
        out.push({ x: c * (cw + g), y: r * (ch + g), w: cw, h: ch });
      }
    }
    return out;
  }

  function fillTile(photos, layout, seed) {
    var g = layout.pad ? 0.012 : 0.014;
    var slots = squareSlots(photos.length, g, seed);
    // biggest slot takes the strongest photo in this tile
    var order = slots.map(function (s, i) { return { s: s, i: i, a: s.w * s.h }; })
      .sort(function (x, y) { return y.a - x.a; });
    var pool = photos.slice().sort(function (x, y) { return y.hero - x.hero; });
    var placed = new Array(slots.length);
    var used = [];
    order.forEach(function (o, rank) {
      var slotAR = o.s.w / o.s.h;
      var best = -1, bestS = -1e9;
      for (var k = 0; k < pool.length; k++) {
        if (used.indexOf(pool[k]) >= 0) continue;
        var p = pool[k];
        var arFit = Math.max(0, 1 - Math.abs(Math.log((p.ar || 1) / slotAR)) / Math.log(3.2));
        var sc = arFit * (rank === 0 ? 1.0 : 1.4) + (rank === 0 ? p.hero * 0.9 : 0) + rngWeight(p, seed) * 0.05;
        // keep one square from being four versions of the same shot
        for (var q = 0; q < used.length; q++) sc -= (1 - novelty(p, used[q])) * 0.22;
        if (sc > bestS) { bestS = sc; best = k; }
      }
      if (best < 0) best = 0;
      placed[o.i] = pool[best];
      used.push(pool[best]);
    });
    return placed;
  }

  function mosaicTile(photos, layout, seed) {
    var pad = Math.round(SIZE * layout.pad);
    var inner = SIZE - pad * 2;
    var page = {
      w: SIZE, h: SIZE, bg: layout.bg, ink: '#17150f', muted: '#79715f',
      style: 'grid', frames: [], rects: [], texts: []
    };
    var g = layout.pad ? 0.012 : 0.014;
    var slots = squareSlots(photos.length, g, seed);
    var chosen = fillTile(photos, layout, seed);
    slots.forEach(function (s, i) {
      var p = chosen[i];
      if (!p) return;
      var w = s.w * inner, h = s.h * inner;
      page.frames.push({
        photo: p, x: pad + s.x * inner, y: pad + s.y * inner, w: w, h: h, pad: 0,
        crop: M.cropFor(p, w, h), rot: 0, z: 1
      });
    });
    return page;
  }

  M.buildMosaic = function (photos, opt) {
    opt = opt || {};
    var layout = LAYOUTS[opt.layout] || LAYOUTS.paper;
    var list = photos.filter(function (p) { return p && p.img; });
    if (!list.length) return { tiles: [], cells: [], layout: layout, counts: [] };
    var counts = allocCounts(list.length, 6);
    var order = list.slice();
    if (opt.plan !== 'story') order.sort(function (a, b) { return (b.hero || 0) - (a.hero || 0); });

    // deal the photos out: each square gets a mix, not a block of the best ones
    var buckets = counts.map(function () { return []; });
    var room = counts.slice();
    for (var i = 0; i < order.length; i++) {
      var t = i % 9, guard = 0;
      while (room[t] <= 0 && guard++ < 9) t = (t + 1) % 9;
      if (room[t] <= 0) break;
      buckets[t].push(order[i]);
      room[t]--;
    }

    var tiles = buckets.map(function (b, i) {
      return b.length ? mosaicTile(b, layout, (opt.seed || 1) + i * 7) : null;
    }).filter(Boolean);

    return {
      tiles: tiles, cells: buckets, layout: layout, counts: counts,
      total: order.length
    };
  };


  M.GRID_LAYOUTS = LAYOUTS;

  M.buildGrid = function (photos, opt) {
    opt = opt || {};
    var layout = LAYOUTS[opt.layout] || LAYOUTS.paper;
    var picked, cells;
    if (opt.fixed && opt.fixed.length) {
      // a hand-picked sequence: keep it exactly in reading order
      picked = opt.fixed.map(function (n) { return photos[n - 1]; }).filter(Boolean);
      cells = picked;
    } else {
      picked = select(photos, 9, opt);
      cells = picked.length === 9 ? arrange(picked, opt.seed) : picked;
    }
    if (!picked.length) return { tiles: [], cells: [], layout: layout };
    var tiles = cells.map(function (p) { return tile(p, layout); });
    return { tiles: tiles, cells: cells, layout: layout, count: picked.length };
  };

  M.gridCanvases = function (grid, scale) {
    scale = scale || 1;
    return grid.tiles.map(function (t) { return M.pageToCanvas(t, scale); });
  };

  M.exportGrid = async function (grid, title, opt) {
    opt = opt || {};
    var scale = opt.scale || 1;
    var base = (title || 'memento').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    var canvases = M.gridCanvases(grid, scale);
    for (var i = 0; i < canvases.length; i++) {
      var blob = await new Promise(function (res) {
        canvases[i].toBlob(function (b) { res(b); }, 'image/png');
      });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = base + '_九宫格_' + String(i + 1).padStart(2, '0') + '.png';
      document.body.appendChild(a); a.click();
      setTimeout(function (el) { return function () { URL.revokeObjectURL(el.href); el.remove(); }; }(a), 5000);
      await new Promise(function (r) { setTimeout(r, 240); });
    }
    return canvases.length;
  };
})(window.MEM);
