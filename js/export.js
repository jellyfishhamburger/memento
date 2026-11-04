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

  /* ---------- one file, one download: a zip of the pages ----------
     Nine separate downloads get blocked by the browser (and are worse on iOS),
     so the book leaves as a single .zip. */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  function dosTime(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
    };
  }

  function makeZip(files) {          // files: [{name, bytes}]
    var enc = new TextEncoder();
    var stamp = dosTime(new Date());
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var crc = crc32(f.bytes);
      var head = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date),
        u32(crc), u32(f.bytes.length), u32(f.bytes.length), u16(name.length), u16(0)
      );
      parts.push(new Uint8Array(head), name, f.bytes);
      central.push({ name: name, crc: crc, size: f.bytes.length, offset: offset });
      offset += head.length + name.length + f.bytes.length;
    });
    var cdStart = offset, cdSize = 0;
    var cdParts = [];
    central.forEach(function (c) {
      var h = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date),
        u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(c.offset)
      );
      cdParts.push(new Uint8Array(h), c.name);
      cdSize += h.length + c.name.length;
    });
    var end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(cdStart), u16(0)
    ));
    return new Blob(parts.concat(cdParts, [end]), { type: 'application/zip' });
  }

  function canvasBytes(cv, type, q) {
    return new Promise(function (res) {
      cv.toBlob(function (b) {
        if (!b) { res(null); return; }
        b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); });
      }, type, q);
    });
  }

  M.exportZIP = async function (pages, title, opt) {
    /* returns the blob plus what it contains, so the UI can say the truth */
    opt = opt || {};
    var scale = opt.scale || 1;   // 1080x1440: the size a social platform wants
    var base = safeName(title);
    var files = [];
    for (var i = 0; i < pages.length; i++) {
      var cv = M.pageToCanvas(pages[i], scale);
      var bytes = await canvasBytes(cv, 'image/jpeg', 0.94);
      if (!bytes) throw new Error('第 ' + (i + 1) + ' 页渲染失败');
      files.push({ name: base + '_' + String(i + 1).padStart(2, '0') + '.jpg', bytes: bytes });
    }
    var zip = makeZip(files);
    var fname = base + '_' + pages.length + '张.zip';
    save(zip, fname);
    return {
      count: pages.length, name: fname, size: zip.size, blob: zip,
      px: Math.round(pages[0].w * scale) + '×' + Math.round(pages[0].h * scale)
    };
  };

  /* every page as a data URL, for the save-one-by-one sheet (phones) */
  M.pageDataURLs = function (pages, scale) {
    return pages.map(function (pg) {
      return M.pageToCanvas(pg, scale || 1).toDataURL('image/jpeg', 0.92);
    });
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
