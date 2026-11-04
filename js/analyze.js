/* Photo analysis: aspect, saliency focal point, dominant colours, "hero" weight.
   All local, all in a 96px offscreen sample. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var MAX = 96;

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h * 360, s: s, l: l };
  }

  function hex(c) {
    return '#' + [c[0], c[1], c[2]].map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /**
   * @returns {Promise<Object>} photo record
   */
  M.analyze = function (img, meta) {
    return new Promise(function (resolve) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var ar = w / h;
      var cw = Math.max(8, Math.round(ar > 1 ? MAX : MAX * ar));
      var ch = Math.max(8, Math.round(ar > 1 ? MAX / ar : MAX));

      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      var base = {
        id: meta.id, name: meta.name, url: meta.url, img: img,
        w: w, h: h, ar: ar, hero: 0.5, focal: { x: 0.5, y: 0.5 },
        colors: ['#8a8577', '#6d6a60', '#4a4841'], bright: 0.5, sat: 0.3, detail: 0.2
      };

      try {
        ctx.drawImage(img, 0, 0, cw, ch);
        var d = ctx.getImageData(0, 0, cw, ch).data;
        var n = cw * ch;
        var lum = new Float32Array(n);
        var satSum = 0, rSum = 0, gSum = 0, bSum = 0;
        var buckets = {};

        for (var i = 0, p = 0; i < n; i++, p += 4) {
          var r = d[p], g = d[p + 1], b = d[p + 2];
          var l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          lum[i] = l;
          var hsl = rgb2hsl(r, g, b);
          satSum += hsl.s;
          rSum += r; gSum += g; bSum += b;
          // 4-bit per channel bucket
          var key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
          var bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0, s: 0, l: 0 });
          bk.n++; bk.r += r; bk.g += g; bk.b += b; bk.s += hsl.s; bk.l += hsl.l;
        }

        // ---- saliency grid (4x4) from local gradient magnitude ----
        var GX = 4, GY = 4;
        var grid = new Float32Array(GX * GY);
        for (var y = 1; y < ch - 1; y++) {
          for (var x = 1; x < cw - 1; x++) {
            var idx = y * cw + x;
            var gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
            var gy = Math.abs(lum[idx + cw] - lum[idx - cw]);
            var mag = Math.min(1, (gx + gy) * 3.2);
            var cell = Math.min(GY - 1, Math.floor(y / ch * GY)) * GX +
                       Math.min(GX - 1, Math.floor(x / cw * GX));
            grid[cell] += mag;
          }
        }
        var mean = 0;
        for (var gi = 0; gi < grid.length; gi++) { grid[gi] /= n / grid.length; mean += grid[gi]; }
        mean /= grid.length;

        // Score every cell, then take the HIGHEST cell that is nearly as busy as the
        // busiest one: on a portrait the head is the top of the subject, and a crop
        // centred on the chest is what cuts faces off.
        var scored = [];
        var peakScore = -1;
        for (var gy2 = 0; gy2 < GY; gy2++) {
          for (var gx2 = 0; gx2 < GX; gx2++) {
            var ci = gy2 * GX + gx2;
            var cx = (gx2 + .5) / GX, cy = (gy2 + .5) / GY;
            var dist = Math.hypot(cx - .5, cy - .5) / .707;
            var sc = (grid[ci] + mean * .3) * (1 - .18 * dist);
            scored.push({ x: cx, y: cy, s: sc });
            if (sc > peakScore) peakScore = sc;
          }
        }
        var cands = scored.filter(function (c) { return c.s >= peakScore * 0.72; });
        cands.sort(function (a, b) { return (a.y - b.y) || (b.s - a.s); });
        var pick = cands[0] || scored[5];
        base.focal = { x: clamp(pick.x, .18, .82), y: clamp(pick.y, .12, .82) };
        base.detail = clamp(mean * 3.2, 0, 1);

        // ---- contrast ----
        var lmin = 1, lmax = 0, lsum = 0;
        for (var k = 0; k < n; k++) { lsum += lum[k]; if (lum[k] < lmin) lmin = lum[k]; if (lum[k] > lmax) lmax = lum[k]; }
        var contrast = clamp((lmax - lmin) * 1.15, 0, 1);
        base.bright = lsum / n;
        base.sat = clamp(satSum / n * 1.5, 0, 1);

        // ---- dominant colours ----
        var list = Object.keys(buckets).map(function (k2) { return buckets[k2]; })
          .filter(function (b) { return b.n > n * 0.004; })
          .sort(function (a, b) { return b.n - a.n; });
        var picked = [];
        for (var li = 0; li < list.length && picked.length < 3; li++) {
          var b2 = list[li];
          var col = [b2.r / b2.n, b2.g / b2.n, b2.b / b2.n];
          var tooClose = picked.some(function (pc) {
            return Math.abs(pc.rgb[0] - col[0]) + Math.abs(pc.rgb[1] - col[1]) + Math.abs(pc.rgb[2] - col[2]) < 70;
          });
          if (tooClose) continue;
          picked.push({ rgb: col, hsl: rgb2hsl(col[0], col[1], col[2]) });
        }
        if (!picked.length) picked.push({ rgb: [rSum / n, gSum / n, bSum / n], hsl: rgb2hsl(rSum / n, gSum / n, bSum / n) });
        base.colors = picked.map(function (pc) { return hex(pc.rgb); });
        base.hue = picked[0].hsl.h;

        // ---- hero weight: a clear subject, real contrast, some colour ----
        var peak = 0;
        for (var pi = 0; pi < grid.length; pi++) peak = Math.max(peak, grid[pi]);
        var focus = clamp((peak - mean) / (peak + 1e-6) * 2.2, 0, 1);
        base.focus = focus;
        base.contrast = contrast;
        base.hero = clamp(contrast * 0.42 + base.sat * 0.22 + focus * 0.3 + base.detail * 0.06, 0, 1);
      } catch (err) {
        base.analyzeError = String(err && err.message || err);
      }
      resolve(base);
    });
  };

  M.hueDist = function (h1, h2) {
    var d = Math.abs((h1 || 0) - (h2 || 0)) % 360;
    return (d > 180 ? 360 - d : d) / 180;
  };

  /* Downscale once, keep the small copy: a 26 MP original decodes to ~100 MB of
     bitmap, and 39 of those take the tab down. 1500 px is plenty for a 1080 tile. */
  M.shrink = function (img, max) {
    var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    var s = Math.min(1, (max || 1500) / Math.max(nw, nh));
    if (s >= 0.999) return Promise.resolve({ img: img, url: img.currentSrc || img.src, w: nw, h: nh });
    var cw = Math.max(2, Math.round(nw * s)), ch = Math.max(2, Math.round(nh * s));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);
    return new Promise(function (res) {
      c.toBlob(function (b) {
        var url = URL.createObjectURL(b);
        var im2 = new Image();
        im2.onload = function () { res({ img: im2, url: url, w: cw, h: ch }); };
        im2.onerror = function () { res({ img: img, url: img.src, w: nw, h: nh }); };
        im2.src = url;
      }, 'image/jpeg', 0.92);
    });
  };
})(window.MEM);
