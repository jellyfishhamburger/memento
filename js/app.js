/* App shell — one thing: a 作品集. Portrait pages that pair into spreads.
   Import, arrange, swap/crop/delete a photo, export nine images. */
(function () {
  'use strict';
  var M = window.MEM;

  var state = {
    photos: [], zine: null, seed: 11, theme: 'quiet', spreads: 4,
    title: '十一月的海', year: new Date().getFullYear(), busy: false
  };

  var $ = function (s) { return document.querySelector(s); };
  var el = {
    themes: $('#themes'), counts: $('#counts'), countNote: $('#countNote'), tray: $('#tray'),
    empty: $('#empty'), stat: $('#statLine'),
    zinePanel: $('#zinePanel'), zineList: $('#zineList'), zineNote: $('#zineNote'),
    title: $('#titleInput'), file: $('#fileInput'),
    btnImport: $('#btnImport'), btnPNG: $('#btnPNG'), btnPDF: $('#btnPDF'),
    btnShuffle: $('#btnShuffle'), btnPick: $('#btnPick'), btnDemo: $('#btnDemo'),
    lightbox: $('#lightbox'), lbStage: $('#lbStage'), lbCount: $('#lbCount'),
    lbPrev: $('#lbPrev'), lbNext: $('#lbNext'), lbClose: $('#lbClose'),
    picker: $('#picker'), pickerGrid: $('#pickerGrid'), pickerTitle: $('#pickerTitle'),
    pickerNote: $('#pickerNote'), pickerClose: $('#pickerClose'),
    pickerCrop: $('#pickerCrop'), cropBox: $('#cropBox'),
    toast: $('#toast')
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- rail ---------------- */
  function buildRail() {
    el.themes.innerHTML = '';
    Object.keys(M.ZINE).forEach(function (k) {
      var t = M.ZINE[k];
      var b = document.createElement('button');
      b.className = 'opt'; b.type = 'button';
      b.setAttribute('aria-pressed', String(state.theme === k));
      b.innerHTML = '<span class="opt-sw" aria-hidden="true">' +
        [t.paper, t.ink, t.muted].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
        '</span><span class="opt-body"><span class="opt-name">' + t.name + '</span>' +
        '<span class="opt-note">' + themeNote(k) + '</span></span>';
      b.onclick = function () { state.theme = k; buildRail(); rebuild(); };
      el.themes.appendChild(b);
    });

    Array.prototype.forEach.call(el.counts.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.spreads) === state.spreads));
    });
    el.countNote.textContent = state.spreads === 4
      ? '九张 = 封面 + 四个跨页：朋友圈九图正好。'
      : '十一张 = 封面 + 五个跨页：小红书可以发十张以上。';
  }

  function themeNote(k) {
    return {
      quiet: '白纸、小字、留白最多',
      editorial: '衬线标题、页脚、杂志感',
      collage: '每页底色取自照片，色块拼贴',
      contact: '纯白、密排、接触表'
    }[k] || '';
  }

  function buildTray() {
    el.tray.innerHTML = '';
    state.photos.forEach(function (p) {
      var img = document.createElement('img');
      img.src = p.url; img.alt = p.name || '';
      img.loading = 'lazy';
      img.title = (p.name || '') + ' — 点一下删掉（可撤销）';
      img.onclick = function () { deletePhoto(p); };
      el.tray.appendChild(img);
    });
  }

  /* ---------------- import ---------------- */
  var seq = 0;
  function addUrl(url, name) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = async function () {
        var rec = await M.analyze(img, { id: 'p' + (++seq), name: name, url: url });
        try {
          var small = await M.shrink(img, 1600);
          rec.img = small.img; rec.url = small.url;
          rec.w = small.w; rec.h = small.h; rec.ar = small.w / small.h;
        } catch (e) { /* keep the original */ }
        state.photos.push(rec);
        resolve(rec);
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  async function addFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) return;
    setStat('正在读 ' + list.length + ' 张…');
    var failed = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var rec = await addUrl(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, ''));
      if (!rec) failed++;
      if (i % 3 === 2) setStat('正在读 ' + (i + 1) + ' / ' + list.length + '…');
    }
    buildTray(); rebuild();
    if (failed) toast(failed + ' 张打不开（HEIC 等格式浏览器解不了，先转成 JPG）');
  }

  async function loadList(list, label) {
    var ok = 0;
    for (var j = 0; j < list.length; j++) {
      setStat('正在载入 ' + (j + 1) + ' / ' + list.length + '…');
      var rec = await addUrl(list[j].url, list[j].name || ('图 ' + (j + 1)));
      if (rec) ok++;
    }
    if (!ok) { toast((label || '照片') + '载不进来'); setStat('还没有照片'); return; }
    buildTray(); rebuild();
  }

  function loadDemo() {
    var names = [];
    for (var i = 1; i <= 16; i++) names.push({ url: 'assets/demo/p' + i + '.jpg', name: '示例 ' + i });
    return loadList(names, '示例');
  }

  /* ---------------- render ---------------- */
  function setStat(t) { el.stat.textContent = t; }

  function rebuild() {
    if (!state.photos.length) {
      el.zinePanel.hidden = true; el.empty.hidden = false;
      el.btnPNG.disabled = true; el.btnPDF.disabled = true; el.btnShuffle.disabled = true;
      return;
    }
    el.empty.hidden = true;
    el.zinePanel.hidden = false;
    el.btnPNG.disabled = false; el.btnPDF.disabled = false; el.btnShuffle.disabled = false;

    state.zine = M.buildZine(state.photos, {
      seed: state.seed, title: state.title || '未命名的一卷', year: state.year,
      theme: state.theme, spreads: state.spreads
    });
    paintZine();
  }

  function paintZine() {
    var z = state.zine;
    if (!z || !z.pages.length) return;
    el.zineList.innerHTML = '';
    var stageW = el.zineList.clientWidth || 1000;
    var scale = Math.min((stageW - 6) / (2 * z.pages[0].w), 500 / z.pages[0].h);

    function pageBtn(pg, pi, label) {
      var btn = document.createElement('button');
      btn.className = 'page-btn'; btn.type = 'button';
      btn.setAttribute('aria-label', '放大 ' + label);
      btn.appendChild(M.renderPage(pg, scale, {
        frameClick: function (fi) { openEditor(pi, fi); }
      }));
      btn.onclick = function () { openLightbox(pi); };
      return btn;
    }

    var row0 = document.createElement('div');
    row0.className = 'spread-row spread-row--single';
    row0.appendChild(pageBtn(z.pages[0], 0, '封面'));
    var l0 = document.createElement('span');
    l0.className = 'spread-label';
    l0.textContent = '01 · 封面';
    row0.appendChild(l0);
    el.zineList.appendChild(row0);

    z.spreads.forEach(function (sp, i) {
      var row = document.createElement('div');
      row.className = 'spread-row';
      var lab = document.createElement('span');
      lab.className = 'spread-label';
      lab.textContent = pad2(2 + i * 2) + ' — ' + pad2(3 + i * 2) + ' · ' + sp.photos.length + ' 张';
      row.appendChild(pageBtn(sp.a, 1 + i * 2, '第 ' + (2 + i * 2) + ' 页'));
      row.appendChild(pageBtn(sp.b, 2 + i * 2, '第 ' + (3 + i * 2) + ' 页'));
      row.appendChild(lab);

      var sel = document.createElement('select');
      sel.className = 'spread-type';
      sel.setAttribute('aria-label', '这一跨页的排版');
      M.ZINE_TYPES.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.key; o.textContent = t.name;
        if (t.key === sp.type) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = function () { changeSpreadType(i, sel.value); };
      row.appendChild(sel);
      el.zineList.appendChild(row);
    });

    el.zineNote.textContent = z.total + ' 张 → ' + z.pages.length + ' 张图（1 封面 + ' +
      z.spreads.length + ' 个跨页）· 两张一组，手机上滑过去，横图连成一整张。';
    setStat(z.total + ' 张 · ' + z.pages.length + ' 张图');
  }

  function changeSpreadType(i, key) {
    var z = state.zine;
    if (!z || !z.chunks) return;
    var chunks = z.chunks.map(function (c) { return c.slice(); });
    var types = z.types.map(function (t, j) { return j === i ? key : t; });
    M.rebalanceZine(chunks, types, z.total - 1);
    state.zine = M.buildZine(state.photos, {
      chunks: chunks, types: types, coverPhoto: z.cover,
      title: state.title || '未命名的一卷', year: state.year, seed: state.seed, theme: state.theme
    });
    paintZine();
  }

  /* ---------------- editor: swap / crop / delete ---------------- */
  var editTarget = null;

  function frameUsage() {
    var map = {};
    state.zine.pages.forEach(function (p, pj) {
      p.frames.forEach(function (f) { map[f.photo.id] = pj; });
    });
    return map;
  }

  function arLoss(photo, slotAR) {
    return Math.abs(Math.log((photo.ar || 1) / slotAR));
  }

  function openEditor(pi, fi) {
    var page = state.zine.pages[pi];
    if (!page || !page.frames[fi]) return;
    var fr = page.frames[fi];
    editTarget = { pi: pi, fi: fi };
    var slotAR = (fr.w - fr.pad * 2) / (fr.h - fr.pad * 2);
    var cur = fr.photo;
    var usage = frameUsage();

    el.pickerTitle.textContent = (pi === 0 ? '封面' : '第 ' + pi + ' 页') + ' · 第 ' + (fi + 1) + ' 张';

    var cands = state.photos.filter(function (p) { return p !== cur; });
    cands.sort(function (a, b) { return arLoss(a, slotAR) - arLoss(b, slotAR); });
    var lossList = cands.map(function (p) { return arLoss(p, slotAR); }).sort(function (a, b) { return b - a; });
    var cutLine = lossList.length > 3 ? lossList[2] : Infinity;

    el.pickerNote.textContent = '点一张就换进来；已经在别的页的，跟那一张互换。下面可以拖动画面选显示的部分。';

    // crop adjuster
    var boxW = 220, boxH = Math.round(boxW / slotAR);
    el.cropBox.style.width = boxW + 'px';
    el.cropBox.style.height = boxH + 'px';
    el.cropBox.innerHTML = '';
    var img = document.createElement('img');
    img.src = cur.url; img.alt = '';
    img.style.position = 'absolute';
    el.cropBox.appendChild(img);
    el.pickerCrop.hidden = false;

    function paintCrop() {
      var c = fr.crop;
      var k = boxW / c.sw;
      img.style.width = (cur.w * k) + 'px';
      img.style.height = (cur.h * k) + 'px';
      img.style.left = (-c.sx * k) + 'px';
      img.style.top = (-c.sy * k) + 'px';
    }
    paintCrop();

    var drag = null;
    el.cropBox.onpointerdown = function (ev) {
      drag = { x: ev.clientX, y: ev.clientY, focal: focalOf(fr) };
      el.cropBox.setPointerCapture(ev.pointerId);
      el.cropBox.classList.add('dragging');
    };
    el.cropBox.onpointermove = function (ev) {
      if (!drag) return;
      var k = boxW / fr.crop.sw;
      var dfx = -(ev.clientX - drag.x) / k / cur.w;
      var dfy = -(ev.clientY - drag.y) / k / cur.h;
      fr.focal = {
        x: Math.max(0.05, Math.min(0.95, drag.focal.x + dfx)),
        y: Math.max(0.05, Math.min(0.95, drag.focal.y + dfy))
      };
      fr.crop = M.cropFor(cur, fr.w - fr.pad * 2, fr.h - fr.pad * 2, fr.focal);
      paintCrop();
    };
    el.cropBox.onpointerup = function () {
      if (!drag) return;
      drag = null;
      el.cropBox.classList.remove('dragging');
      paintZine();
    };

    el.pickerGrid.innerHTML = '';
    cands.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'picker-item'; b.type = 'button';
      if (arLoss(p, slotAR) > cutLine) b.dataset.fit = '0';
      var usedOn = usage[p.id];
      b.title = (usedOn == null ? '未使用' : (usedOn === 0 ? '封面' : '第 ' + usedOn + ' 页')) + ' · ' + p.w + '×' + p.h;
      var im = document.createElement('img');
      im.src = p.url; im.alt = '';
      var tag = document.createElement('b');
      tag.textContent = usedOn == null ? '新' : ('P' + usedOn);
      b.appendChild(im); b.appendChild(tag);
      b.onclick = function () { applySwap(p); };
      el.pickerGrid.appendChild(b);
    });

    var del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = '删掉这张';
    del.onclick = function () { deletePhoto(cur); };
    var head = document.getElementById('pickerHead');
    var stale = head.querySelector('.btn-danger');
    if (stale) stale.remove();
    head.insertBefore(del, el.pickerClose);

    el.picker.hidden = false;
  }

  function focalOf(fr) {
    return fr.focal || fr.photo.focal || { x: 0.5, y: 0.5 };
  }

  function closePicker() {
    el.picker.hidden = true;
    el.pickerCrop.hidden = true;
    el.cropBox.innerHTML = '';
    el.pickerGrid.innerHTML = '';
    editTarget = null;
  }

  function setFramePhoto(fr, photo) {
    fr.photo = photo;
    fr.focal = null;
    fr.crop = M.cropFor(photo, fr.w - fr.pad * 2, fr.h - fr.pad * 2);
  }

  function applySwap(target) {
    var t = editTarget;
    if (!t) return;
    var fr = state.zine.pages[t.pi].frames[t.fi];
    var cur = fr.photo;
    if (target === cur) { closePicker(); return; }
    var from = null;
    state.zine.pages.forEach(function (p, pj) {
      p.frames.forEach(function (f, fj) { if (f.photo === target) from = { pj: pj, fj: fj }; });
    });
    setFramePhoto(fr, target);
    if (from) setFramePhoto(state.zine.pages[from.pj].frames[from.fj], cur);
    closePicker();
    paintZine();
    toast(from ? '两张互换了位置' : '换好了');
  }

  function deletePhoto(photo) {
    var idx = state.photos.indexOf(photo);
    if (idx < 0) return;
    state.photos.splice(idx, 1);
    closePicker();
    buildTray();
    rebuild();
    toastUndo('删掉 1 张 · 还剩 ' + state.photos.length + ' 张，版已重排', function () {
      state.photos.splice(idx, 0, photo);
      buildTray();
      rebuild();
    });
  }

  /* ---------------- lightbox ---------------- */
  var lbIndex = 0;
  function openLightbox(i) {
    lbIndex = i;
    el.lightbox.hidden = false;
    paintLightbox();
  }
  function paintLightbox() {
    var pages = state.zine ? state.zine.pages : [];
    var page = pages[lbIndex];
    if (!page) return;
    var s = Math.min((window.innerWidth - 120) / page.w, (window.innerHeight - 170) / page.h);
    s = Math.max(0.2, Math.min(s, 1.6));
    el.lbStage.innerHTML = '';
    el.lbStage.appendChild(M.renderPage(page, s));
    el.lbCount.textContent = (lbIndex + 1) + ' / ' + pages.length;
  }
  function closeLightbox() { el.lightbox.hidden = true; el.lbStage.innerHTML = ''; }

  /* ---------------- export ---------------- */
  async function doExport(kind) {
    if (state.busy || !state.zine || !state.zine.pages.length) return;
    state.busy = true;
    toast(kind === 'pdf' ? '正在生成 PDF…' : '正在导出…');
    try {
      if (kind === 'pdf') {
        var bytes = await M.exportPDF(state.zine.pages, state.title);
        toast('PDF 已生成 · ' + Math.round(bytes / 1024) + ' KB');
      } else {
        var n = await M.exportPNG(state.zine.pages, state.title);
        toast('已导出 ' + n + ' 张 · 1080×1440（浏览器可能询问是否允许多文件下载）');
      }
    } catch (err) {
      toast('导出失败：' + (err && err.message ? err.message : err));
    }
    state.busy = false;
  }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
    el.toast.innerHTML = '';
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }
  function toastUndo(msg, undo) {
    el.toast.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg;
    var b = document.createElement('button');
    b.className = 'toast-undo';
    b.textContent = '撤销';
    b.onclick = function () { undo(); el.toast.hidden = true; };
    el.toast.appendChild(span);
    el.toast.appendChild(b);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 8000);
  }

  /* ---------------- wire up ---------------- */
  el.counts.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-spreads]');
    if (!b) return;
    state.spreads = Number(b.dataset.spreads);
    buildRail(); rebuild();
  });
  el.btnImport.onclick = el.btnPick.onclick = function () { el.file.click(); };
  el.file.onchange = function (e) { addFiles(e.target.files); el.file.value = ''; };
  el.btnDemo.onclick = loadDemo;
  el.btnPDF.onclick = function () { doExport('pdf'); };
  el.btnPNG.onclick = function () { doExport('png'); };
  el.btnShuffle.onclick = function () { state.seed = (state.seed * 7919 + 13) % 100000; rebuild(); };
  el.pickerClose.onclick = closePicker;
  el.picker.addEventListener('click', function (e) { if (e.target === el.picker) closePicker(); });
  el.lbClose.onclick = closeLightbox;
  el.lbPrev.onclick = function () {
    var n = state.zine.pages.length;
    lbIndex = (lbIndex - 1 + n) % n; paintLightbox();
  };
  el.lbNext.onclick = function () {
    var n = state.zine.pages.length;
    lbIndex = (lbIndex + 1) % n; paintLightbox();
  };
  window.addEventListener('resize', function () {
    if (!el.lightbox.hidden) paintLightbox();
    else if (state.zine) paintZine();
  });

  var tTimer;
  el.title.oninput = function () {
    state.title = el.title.value.trim() || '未命名的一卷';
    clearTimeout(tTimer);
    tTimer = setTimeout(rebuild, 260);
  };

  document.addEventListener('keydown', function (e) {
    if (!el.picker.hidden) { if (e.key === 'Escape') closePicker(); return; }
    if (el.lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') el.lbPrev.click();
    if (e.key === 'ArrowRight') el.lbNext.click();
  });

  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ---------------- url presets ---------------- */
  var manifest = null;
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('theme') && M.ZINE[qs.get('theme')]) state.theme = qs.get('theme');
    if (qs.get('spreads')) state.spreads = parseInt(qs.get('spreads'), 10) || 4;
    if (qs.get('title')) { state.title = qs.get('title'); el.title.value = state.title; }
    if (qs.get('manifest')) manifest = qs.get('manifest');
  } catch (e) { /* ignore */ }

  function hideDemo() {
    el.btnDemo.hidden = true;
    var hint = document.querySelector('.empty-sub');
    if (hint) hint.textContent = '本地处理，不上传。把照片拖进来，或者点「选择照片」——四十张也可以。';
  }

  buildRail();
  buildTray();
  rebuild();

  if (manifest) {
    fetch(manifest).then(function (r) { return r.json(); })
      .then(function (list) { return loadList(list, '照片'); })
      .catch(function () { hideDemo(); });
  } else {
    fetch('assets/demo/p1.jpg', { method: 'HEAD' }).then(function (r) {
      if (r.ok && !state.photos.length) loadDemo();
      else if (!r.ok) hideDemo();
    }).catch(function () { hideDemo(); });
  }

  window.__mem = { state: state, rebuild: rebuild, M: M, paint: paintZine };
})();
