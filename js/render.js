/* Renderer: one page model -> DOM (preview) or Canvas (export).
   Same geometry both ways, so the thumbnail is what you get. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  function bgStyle(el, frame) {
    var p = frame.photo;
    var iw = frame.w - frame.pad * 2, ih = frame.h - frame.pad * 2;
    var k = iw / frame.crop.sw;
    el.style.backgroundImage = 'url("' + p.url + '")';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = (p.w * k) + 'px ' + (p.h * k) + 'px';
    el.style.backgroundPosition = (-frame.crop.sx * k) + 'px ' + (-frame.crop.sy * k) + 'px';
  }

  M.renderPage = function (page, scale, opts) {
    var root = document.createElement('div');
    root.className = 'page';
    root.style.width = page.w + 'px';
    root.style.height = page.h + 'px';
    root.style.background = page.bg;

    // rects (back layer first)
    page.rects.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'rect';
      d.style.left = r.x + 'px'; d.style.top = r.y + 'px';
      d.style.width = Math.max(0, r.w) + 'px'; d.style.height = Math.max(0, r.h) + 'px';
      d.style.background = r.fill;
      if (r.scrim) {
        d.style.background = 'linear-gradient(to top, rgba(0,0,0,' + r.opacity + '), rgba(0,0,0,0))';
      } else if (r.opacity != null) d.style.opacity = r.opacity;
      if (r.radius) d.style.borderRadius = r.radius + 'px';
      if (r.stroke) d.style.boxShadow = 'inset 0 0 0 1px rgba(20,18,15,.22)';
      d.style.zIndex = r.z || 1;
      root.appendChild(d);
    });

    page.frames.forEach(function (f, fi) {
      var host, inner;
      if (f.pad > 0) {
        host = document.createElement('div');
        host.className = 'frame-paper';
        host.style.padding = f.pad + 'px';
        inner = document.createElement('div');
        inner.className = 'frame-inner';
        host.appendChild(inner);
      } else {
        host = document.createElement('div');
        host.className = 'frame';
        inner = host;
      }
      host.style.left = f.x + 'px'; host.style.top = f.y + 'px';
      host.style.width = f.w + 'px'; host.style.height = f.h + 'px';
      host.style.zIndex = f.z || 1;
      if (f.rot) host.style.transform = 'rotate(' + f.rot + 'deg)';
      bgStyle(inner, f);
      if (opts && opts.frameClick) {
        host.classList.add('frame-edit');
        host.title = '点一下：换图 / 删图';
        host.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          opts.frameClick(fi, host);
        });
      }
      root.appendChild(host);
    });

    page.texts.forEach(function (t) {
      var d = document.createElement('div');
      d.className = 'txt';
      d.style.left = t.x + 'px'; d.style.top = t.y + 'px';
      d.style.width = t.w + 'px';
      d.style.fontSize = t.size + 'px';
      d.style.fontFamily = t.family;
      d.style.fontWeight = t.weight;
      if (t.italic) d.style.fontStyle = 'italic';
      d.style.color = t.color;
      d.style.textAlign = t.align;
      d.style.lineHeight = t.lineHeight;
      if (t.tracking) d.style.letterSpacing = t.tracking + 'px';
      if (t.opacity != null) d.style.opacity = t.opacity;
      if (t.rot) d.style.transform = 'rotate(' + t.rot + 'deg)';
      d.textContent = t.lines.join('\n');
      d.style.zIndex = 4;
      root.appendChild(d);
    });

    root.style.transform = 'scale(' + scale + ')';

    var wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.style.width = Math.round(page.w * scale) + 'px';
    wrap.style.height = Math.round(page.h * scale) + 'px';
    wrap.appendChild(root);
    return wrap;
  };

  /* ---------------- canvas ---------------- */
  M.paintPage = function (page, ctx, scale) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = page.bg;
    ctx.fillRect(0, 0, page.w, page.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    page.rects.forEach(function (r) {
      if (r.scrim) {
        var g = ctx.createLinearGradient(0, r.y + r.h, 0, r.y);
        g.addColorStop(0, 'rgba(0,0,0,' + r.opacity + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h));
        return;
      }
      ctx.globalAlpha = r.opacity == null ? 1 : r.opacity;
      ctx.fillStyle = r.fill;
      if (r.radius) {
        roundRect(ctx, r.x, r.y, Math.max(0, r.w), Math.max(0, r.h), r.radius);
        ctx.fill();
      } else {
        ctx.fillRect(r.x, r.y, Math.max(0, r.w), Math.max(0, r.h));
        if (r.stroke) {
          ctx.globalAlpha = (r.opacity == null ? 1 : r.opacity) * 0.35;
          ctx.strokeStyle = '#141210';
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x + .5, r.y + .5, Math.max(0, r.w) - 1, Math.max(0, r.h) - 1);
        }
      }
    });
    ctx.globalAlpha = 1;

    page.frames.forEach(function (f) {
      var img = f.photo.img;
      if (!img) return;
      ctx.save();
      if (f.rot) {
        var cx = f.x + f.w / 2, cy = f.y + f.h / 2;
        ctx.translate(cx, cy); ctx.rotate(f.rot * Math.PI / 180); ctx.translate(-cx, -cy);
      }
      var iw = f.w - f.pad * 2, ih = f.h - f.pad * 2;
      if (f.pad > 0) {
        ctx.shadowColor = 'rgba(0,0,0,.28)';
        ctx.shadowBlur = 14 * (f.w / 300);
        ctx.shadowOffsetY = 3 * (f.w / 300);
        ctx.fillStyle = '#fbf8f1';
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      ctx.beginPath();
      ctx.rect(f.x + f.pad, f.y + f.pad, iw, ih);
      ctx.clip();

      ctx.drawImage(img, f.crop.sx, f.crop.sy, f.crop.sw, f.crop.sh,
        f.x + f.pad, f.y + f.pad, iw, ih);
      ctx.restore();
    });

    page.texts.forEach(function (t) {
      ctx.save();
      ctx.globalAlpha = t.opacity == null ? 1 : t.opacity;
      ctx.fillStyle = t.color;
      ctx.textBaseline = 'top';
      ctx.textAlign = t.align === 'center' ? 'center' : t.align === 'right' ? 'right' : 'left';
      ctx.font = (t.italic ? 'italic ' : '') + t.weight + ' ' + t.size + 'px ' + t.family;
      if ('letterSpacing' in ctx && t.tracking) ctx.letterSpacing = t.tracking + 'px';
      if (t.rot) {
        var cx = t.x + t.w / 2, cy = t.y + t.size;
        ctx.translate(cx, cy); ctx.rotate(t.rot * Math.PI / 180); ctx.translate(-cx, -cy);
      }
      var ax = t.align === 'center' ? t.x + t.w / 2 : t.align === 'right' ? t.x + t.w : t.x;
      t.lines.forEach(function (line, i) {
        ctx.fillText(line, ax, t.y + i * t.size * t.lineHeight);
      });
      ctx.restore();
    });

    ctx.restore();
  };

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  M.pageToCanvas = function (page, scale) {
    var cv = document.createElement('canvas');
    cv.width = Math.round(page.w * scale);
    cv.height = Math.round(page.h * scale);
    M.paintPage(page, cv.getContext('2d'), scale);
    return cv;
  };
})(window.MEM);
