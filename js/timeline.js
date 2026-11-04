/* S4-A · EXIF time line (experimental, additive).
   Reads DateTimeOriginal straight out of the JPEG bytes, groups photos into
   shooting sessions by real gaps, and refuses to invent a session when the
   clock disagrees with the light. Nothing here changes S1/S2. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.TL = M.TL || {};

  /* ---------- EXIF: APP1 → TIFF → IFD0 → ExifIFD → 0x9003 ---------- */
  function readAscii(dv, off, len) {
    var s = '';
    for (var i = 0; i < len; i++) {
      var c = dv.getUint8(off + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  function parseExifTime(buf) {
    var dv = new DataView(buf);
    if (dv.getUint16(0) !== 0xFFD8) return null;       // not a JPEG
    var off = 2, len = dv.byteLength;
    while (off + 4 < len) {
      if (dv.getUint8(off) !== 0xFF) { off++; continue; }
      var marker = dv.getUint8(off + 1);
      var size = dv.getUint16(off + 2);
      if (marker === 0xE1) {
        var start = off + 4;
        if (readAscii(dv, start, 4) !== 'Exif') { off += 2 + size; continue; }
        var tiff = start + 6;
        var little = dv.getUint16(tiff) === 0x4949;
        var get16 = function (o) { return dv.getUint16(o, little); };
        var get32 = function (o) { return dv.getUint32(o, little); };
        if (get16(tiff + 2) !== 0x002A) return null;
        var ifd0 = tiff + get32(tiff + 4);
        var n0 = get16(ifd0);
        var exifOff = 0, dt = '';
        for (var i = 0; i < n0; i++) {
          var e = ifd0 + 2 + i * 12;
          var tag = get16(e), type = get16(e + 2), cnt = get32(e + 4);
          if (tag === 0x8769) exifOff = tiff + get32(e + 8);
          if (tag === 0x0132 && cnt >= 19) dt = readAscii(dv, tiff + get32(e + 8), 19);
        }
        if (exifOff) {
          var n1 = get16(exifOff);
          for (var j = 0; j < n1; j++) {
            var e2 = exifOff + 2 + j * 12;
            var tag2 = get16(e2), cnt2 = get32(e2 + 4);
            if (tag2 === 0x9003 && cnt2 >= 19) {
              dt = readAscii(dv, tiff + get32(e2 + 8), 19);
              break;
            }
          }
        }
        if (!dt) return null;
        var m = dt.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
      }
      if (marker === 0xDA || marker === 0xD9) break;    // start of scan
      off += 2 + size;
    }
    return null;
  }

  async function timeOf(photo) {
    if (photo.takenAt) return photo.takenAt;
    var blob = photo.blob || photo.srcBlob;
    if (!blob) return null;
    try {
      var head = blob.slice(0, Math.min(blob.size, 160 * 1024));
      var buf = await head.arrayBuffer();
      var t = parseExifTime(buf);
      photo.takenAt = t;
      return t;
    } catch (e) {
      photo.takenAt = null;
      return null;
    }
  }

  /* ---------- sessions ---------- */
  function med(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    return b[Math.floor(b.length / 2)];
  }

  function luminance(p) {
    var f = M.ART && M.ART.finger ? M.ART.finger(p) : null;
    return f ? f.l : (p.bright == null ? 0.5 : p.bright);
  }

  /* a daylight photo stamped 01:00 means the camera clock is wrong (or the
     timezone was never set). Say so instead of drawing a fake morning scene. */
  function clockSuspect(ts, lum) {
    if (ts == null) return false;
    var h = new Date(ts).getHours();
    var night = h >= 22 || h < 5;
    return night && lum > 0.55;
  }

  function label(ts, lum, suspect) {
    if (ts == null) return '没有时间信息';
    var d = new Date(ts);
    var h = d.getHours();
    var part = h < 5 ? '凌晨' : h < 11 ? '上午' : h < 15 ? '下午' : h < 19 ? '傍晚' : '夜里';
    if (suspect) part = '时段（时钟存疑）';
    var mm = ('0' + d.getMinutes()).slice(-2);
    return part + ' ' + h + ':' + mm;
  }

  async function segments(photos, opt) {
    opt = opt || {};
    var gapMin = opt.gapMin || 90;
    var list = photos.slice();
    for (var i = 0; i < list.length; i++) await timeOf(list[i]);

    var timed = list.filter(function (p) { return p.takenAt; })
      .sort(function (a, b) { return a.takenAt - b.takenAt; });
    var untimed = list.filter(function (p) { return !p.takenAt; });

    var groups = [], cur = [];
    timed.forEach(function (p) {
      if (cur.length && (p.takenAt - cur[cur.length - 1].takenAt) / 60000 > gapMin) {
        groups.push(cur); cur = [];
      }
      cur.push(p);
    });
    if (cur.length) groups.push(cur);

    var out = groups.map(function (g, idx) {
      var lum = med(g.map(luminance));
      var first = g[0].takenAt, last = g[g.length - 1].takenAt;
      var suspect = clockSuspect(first, lum);
      return {
        idx: idx + 1,
        name: label(first, lum, suspect),
        start: first, end: last,
        minutes: Math.round((last - first) / 60000),
        count: g.length,
        lum: +lum.toFixed(2),
        sat: +med(g.map(function (p) { return (M.ART.finger(p) || {}).sat || 0.3; })).toFixed(2),
        clockSuspect: suspect,
        ids: g.map(function (p) { return p.id; }),
        names: g.map(function (p) { return p.name; })
      };
    });

    if (untimed.length) {
      out.push({
        idx: out.length + 1, name: '没有时间信息', start: null, end: null, minutes: 0,
        count: untimed.length, lum: +med(untimed.map(luminance)).toFixed(2),
        sat: 0.3, clockSuspect: false,
        ids: untimed.map(function (p) { return p.id; }),
        names: untimed.map(function (p) { return p.name; }),
        untimed: true
      });
    }

    return {
      total: list.length,
      timed: timed.length,
      untimed: untimed.length,
      gapMin: gapMin,
      segments: out,
      suspects: out.filter(function (s) { return s.clockSuspect; }).map(function (s) { return s.idx; })
    };
  }

  /* ---------- reading the result ---------- */
  function summary(seg) {
    if (!seg || !seg.segments) return '没有可用的时间信息';
    var bits = seg.segments.map(function (s) {
      return s.name + '（' + s.count + ' 张' + (s.untimed ? '，未参与分段' : '，' + s.minutes + ' 分钟跨度') + '）';
    });
    return bits.join(' · ');
  }

  M.TL = {
    parseExifTime: parseExifTime,
    timeOf: timeOf,
    segments: segments,
    summary: summary,
    clockSuspect: clockSuspect
  };
})(window.MEM);
