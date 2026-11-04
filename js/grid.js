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

  /* ---------- public ---------- */
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
