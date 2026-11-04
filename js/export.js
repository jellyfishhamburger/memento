/* Export: PNG per page, or a real multi-page PDF (JPEG XObjects, no library). */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  function safeName(s) {
    return (s || 'memento').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  }
  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }
  function canvasBlob(cv, type, q) {
    return new Promise(function (res) {
      if (cv.toBlob) cv.toBlob(function (b) { res(b); }, type, q);
      else {
        var d = cv.toDataURL(type, q).split(',')[1];
        var bin = atob(d), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res(new Blob([arr], { type: type }));
      }
    });
  }

  M.exportPNG = async function (pages, title, opt) {
    opt = opt || {};
    var scale = opt.scale || 2;
    var base = safeName(title);
    for (var i = 0; i < pages.length; i++) {
      var cv = M.pageToCanvas(pages[i], scale);
      var blob = await canvasBlob(cv, 'image/png');
      save(blob, base + '_' + String(i + 1).padStart(2, '0') + '.png');
      await new Promise(function (r) { setTimeout(r, 260); });
    }
    return pages.length;
  };

  /* ---------- minimal PDF ---------- */
  function buildPDF(sizes, jpegs, title) {
    var enc = new TextEncoder();
    var parts = [], pos = 0, offs = [];
    function w(x) {
      var b = typeof x === 'string' ? enc.encode(x) : x;
      parts.push(b); pos += b.length;
    }
    function obj(n, head, stream) {
      offs[n] = pos;
      w(n + ' 0 obj\n' + head);
      if (stream) { w('\nstream\n'); w(stream); w('\nendstream'); }
      w('\nendobj\n');
    }

    var N = sizes.length;
    var ids = [];
    for (var i = 0; i < N; i++) {
      var pageId = 3 + i * 3, contentId = pageId + 1, imgId = pageId + 2;
      ids.push({ page: pageId, content: contentId, img: imgId });
    }

    w('%PDF-1.4\n');
    obj(1, '<</Type/Catalog/Pages 2 0 R>>');
    var kids = ids.map(function (o) { return o.page + ' 0 R'; }).join(' ');
    obj(2, '<</Type/Pages/Count ' + N + '/Kids[' + kids + ']>>');

    ids.forEach(function (o, i) {
      var s = sizes[i];
      obj(o.page,
        '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + s.w.toFixed(2) + ' ' + s.h.toFixed(2) + ']' +
        '/Resources<</XObject<</Im0 ' + o.img + ' 0 R>>/ProcSet[/PDF/ImageC]>>' +
        '/Contents ' + o.content + ' 0 R>>');
      var cs = 'q\n' + s.w.toFixed(2) + ' 0 0 ' + s.h.toFixed(2) + ' 0 0 cm\n/Im0 Do\nQ\n';
      obj(o.content, '<</Length ' + cs.length + '>>', cs);
      var jp = jpegs[i];
      obj(o.img,
        '<</Type/XObject/Subtype/Image/Width ' + jp.w + '/Height ' + jp.h +
        '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + jp.bytes.length + '>>',
        jp.bytes);
    });

    var xrefPos = pos;
    var size = N * 3 + 3;
    var xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (var n = 1; n < size; n++) {
      xref += String(offs[n] || 0).padStart(10, '0') + ' 00000 n \n';
    }
    w(xref);
    w('trailer\n<</Size ' + size + '/Root 1 0 R>>\nstartxref\n' + xrefPos + '\n%%EOF\n');

    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), at = 0;
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  M.buildPDFBytes = async function (pages, title, scale) {
    scale = scale || 1.7;
    var sizes = [], jpegs = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var cv = M.pageToCanvas(p, scale);
      var blob = await canvasBlob(cv, 'image/jpeg', 0.92);
      var buf = new Uint8Array(await blob.arrayBuffer());
      jpegs.push({ bytes: buf, w: cv.width, h: cv.height });
      sizes.push({ w: p.w * 0.72, h: p.h * 0.72 });
    }
    return buildPDF(sizes, jpegs, title);
  };

  /* one tall image of every page — the shape 朋友圈 and 小红书 actually accept */
  M.buildTallCanvas = function (pages, opt) {
    opt = opt || {};
    if (!pages.length) return null;
    var scale = opt.scale || 1;
    var gap = 0;
    var sumH = pages.reduce(function (a, p) { return a + p.h; }, 0);
    var maxH = opt.maxH || 9000;
    if (sumH * scale > maxH) scale = Math.max(0.35, maxH / sumH);
    var W = Math.round(pages[0].w * scale);
    var H = Math.round(pages.reduce(function (a, p) { return a + p.h * scale + gap; }, 0));
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = pages[0].bg;
    ctx.fillRect(0, 0, W, H);
    var y = 0;
    pages.forEach(function (p) {
      ctx.save();
      ctx.translate(0, y);
      M.paintPage(p, ctx, scale);
      ctx.restore();
      y += p.h * scale + gap;
    });
    return cv;
  };

  M.exportTall = async function (pages, title, opt) {
    var cv = M.buildTallCanvas(pages, opt || {});
    if (!cv) return 0;
    var blob = await canvasBlob(cv, 'image/png');
    save(blob, safeName(title) + '_长图.png');
    return { w: cv.width, h: cv.height, kb: Math.round(blob.size / 1024) };
  };

  M.exportPDF = async function (pages, title, opt) {
    opt = opt || {};
    var bytes = await M.buildPDFBytes(pages, title, opt.scale);
    save(new Blob([bytes], { type: 'application/pdf' }), safeName(title) + '.pdf');
    return bytes.length;
  };

  M._buildPDF = buildPDF;
})(window.MEM);
