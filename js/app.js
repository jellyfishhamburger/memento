/* App shell: state, import, rebuild, export. Two outputs: a book of pages, or a 3×3. */
(function () {
  'use strict';
  var M = window.MEM;

  var state = {
    photos: [], pages: [], grid: null, book: null, zine: null, repaint: null,
    mode: 'book', style: 'editorial', plan: 'hero', format: 'portrait', layout: 'paper',
    fill: 'mosaic', pageTarget: 0, excluded: {}, seed: 11, title: '十一月的海',
    year: new Date().getFullYear(), busy: false
  };

  var $ = function (s) { return document.querySelector(s); };
  var el = {
    styles: $('#styles'), plans: $('#plans'), formats: $('#formats'), layouts: $('#layouts'),
    fills: $('#fills'), pageTargets: $('#pageTargets'), pageNote: $('#pageNote'),
    blockPages: $('#blockPages'),
    tray: $('#tray'), modes: $('#modes'),
    pages: $('#pages'), empty: $('#empty'), stat: $('#statLine'),
    gridPanel: $('#gridPanel'), gridWrap: $('#gridWrap'), gridStrip: $('#gridStrip'),
    gridNote: $('#gridNote'), gridWhy: $('#gridWhy'),
    zinePanel: $('#zinePanel'), zineList: $('#zineList'), zineNote: $('#zineNote'),
    blockStyles: $('#blockStyles'), blockFormat: $('#blockFormat'), blockGrid: $('#blockGrid'),
    blockPlan: $('#blockPlan'),
    title: $('#titleInput'), file: $('#fileInput'),
    btnImport: $('#btnImport'), btnPNG: $('#btnPNG'), btnPDF: $('#btnPDF'), btnTall: $('#btnTall'),
    btnShuffle: $('#btnShuffle'), btnPick: $('#btnPick'), btnDemo: $('#btnDemo'),
    lightbox: $('#lightbox'), lbStage: $('#lbStage'), lbCount: $('#lbCount'),
    lbPrev: $('#lbPrev'), lbNext: $('#lbNext'), lbClose: $('#lbClose'),
    picker: $('#picker'), pickerGrid: $('#pickerGrid'), pickerTitle: $('#pickerTitle'),
    pickerNote: $('#pickerNote'), pickerClose: $('#pickerClose'),
    stageHint: $('#stageHint'),
    toast: $('#toast')
  };

  var PLANS = [
    { key: 'hero', name: '主视觉优先', note: '强图当主角，弱图做细节', grid: '视觉均衡', gridNote: '挑差别最大的九张' },
    { key: 'story', name: '时间叙事', note: '按你导入的顺序讲', grid: '时间顺序', gridNote: '按顺序挑，跳过重复的' },
    { key: 'colour', name: '色彩分组', note: '同色系收进同一页', gridOnly: true }
  ];

  /* ---------------- ui ---------------- */
  function buildOptions() {
    var isGrid = state.mode === 'grid';
    var isZine = state.mode === 'zine';

    Array.prototype.forEach.call(el.modes.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    });
    el.blockStyles.hidden = isGrid || isZine;
    el.blockFormat.hidden = isGrid || isZine;
    el.blockGrid.hidden = !isGrid;
    el.blockPages.hidden = isGrid || isZine;
    if (el.blockPlan) el.blockPlan.hidden = isZine;

    Array.prototype.forEach.call(el.pageTargets.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.pages) === state.pageTarget));
    });
    el.pageNote.textContent = '九页 = 一张封面 + 八个跨页，导出发朋友圈就是九张方图。';
    el.pageNote.hidden = state.pageTarget === 0;

    Array.prototype.forEach.call(el.fills.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.fill === state.fill));
    });
    el.layouts.hidden = false;

    el.styles.innerHTML = '';
    Object.keys(M.STYLES).forEach(function (k) {
      var st = M.STYLES[k];
      var b = document.createElement('button');
      b.className = 'opt'; b.type = 'button';
      b.setAttribute('aria-pressed', String(state.style === k));
      b.innerHTML =
        '<span class="opt-sw" aria-hidden="true">' +
          [st.paper, st.ink, st.accent].map(function (c) {
            return '<i style="background:' + c + '"></i>';
          }).join('') +
        '</span>' +
        '<span class="opt-body"><span class="opt-name">' + st.name + '</span>' +
        '<span class="opt-note">' + st.note + '</span></span>';
      b.onclick = function () { state.style = k; buildOptions(); rebuild(); };
      el.styles.appendChild(b);
    });

    el.layouts.innerHTML = '';
    Object.keys(M.GRID_LAYOUTS).forEach(function (k) {
      var L = M.GRID_LAYOUTS[k];
      var b = document.createElement('button');
      b.className = 'opt'; b.type = 'button';
      b.setAttribute('aria-pressed', String(state.layout === k));
      b.innerHTML = '<span class="opt-body"><span class="opt-name">' + L.name + '</span>' +
        '<span class="opt-note">' + L.note + '</span></span>';
      b.onclick = function () { state.layout = k; buildOptions(); rebuild(); };
      el.layouts.appendChild(b);
    });

    el.plans.innerHTML = '';
    PLANS.forEach(function (p) {
      if (isGrid && p.gridOnly) return;
      if (isGrid && p.key === 'colour') return;
      var b = document.createElement('button');
      b.className = 'opt'; b.type = 'button';
      b.setAttribute('aria-pressed', String(state.plan === p.key));
      var name = isGrid && p.grid ? p.grid : p.name;
      var note = isGrid && p.gridNote ? p.gridNote : p.note;
      b.innerHTML = '<span class="opt-body"><span class="opt-name">' + name + '</span>' +
        '<span class="opt-note">' + note + '</span></span>';
      b.onclick = function () { state.plan = p.key; buildOptions(); rebuild(); };
      el.plans.appendChild(b);
    });

    el.formats.innerHTML = '';
    Object.keys(M.FORMATS).forEach(function (k) {
      var f = M.FORMATS[k];
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = f.label;
      b.setAttribute('aria-pressed', String(state.format === k));
      b.disabled = state.pageTarget > 0 && k !== 'square';
      b.onclick = function () { state.format = k; buildOptions(); rebuild(); };
      el.formats.appendChild(b);
    });

    el.btnPDF.hidden = isGrid;
    el.btnTall.hidden = isGrid;
    el.btnPDF.hidden = isGrid || isZine;
    el.btnTall.hidden = isGrid || isZine;
    el.btnPNG.textContent = isZine ? '导出九张' : isGrid ? '导出九张' : '导出图片';
    el.btnShuffle.textContent = isZine ? '换一版编排' : isGrid ? '换一组' : '换一版编排';
  }

  function buildTray() {
    el.tray.innerHTML = '';
    state.photos.forEach(function (p) {
      var img = document.createElement('img');
      img.src = p.url; img.alt = p.name || '';
      img.loading = 'lazy';
      img.dataset.off = '0';
      img.title = (p.name || '') + ' — 点一下删掉（可撤销）';
      img.onclick = function () { deletePhoto(p); };
      el.tray.appendChild(img);
    });
  }

  /* ---------------- import ---------------- */
  var seq = 0;
  function addUrl(url, name, revoke) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = async function () {
        var rec = await M.analyze(img, { id: 'p' + (++seq), name: name, url: url });
        // keep a 1500 px working copy: 26 MP originals eat the tab alive
        try {
          var small = await M.shrink(img, 1500);
          rec.img = small.img; rec.url = small.url;
          rec.w = small.w; rec.h = small.h; rec.ar = small.w / small.h;
        } catch (e) { /* keep the original */ }
        if (revoke) { try { URL.revokeObjectURL(url); } catch (e2) {} }
        rec._revoke = null;
        state.photos.push(rec);
        resolve(rec);
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  async function addFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!list.length) return;
    setStat('正在读 ' + list.length + ' 张…');
    var failed = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var rec = await addUrl(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, ''), false);
      if (!rec) failed++;
      if (i % 3 === 2) setStat('正在读 ' + (i + 1) + ' / ' + list.length + '…');
    }
    buildTray(); rebuild();
    if (failed) toast(failed + ' 张打不开（HEIC 等格式浏览器解不了，先转成 JPG）');
  }

  async function loadList(list, label) {
    setStat('正在载入…');
    var ok = 0;
    for (var j = 0; j < list.length; j++) {
      var rec = await addUrl(list[j].url, list[j].name || ('图 ' + (j + 1)), false);
      if (rec) ok++;
      if (j % 5 === 4) setStat('正在载入 ' + (j + 1) + ' / ' + list.length + '…');
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
    var photos = state.photos.filter(function (p) { return !state.excluded[p.id]; });
    if (!photos.length) {
      el.pages.hidden = true; el.empty.hidden = false; el.gridPanel.hidden = true;
      el.zinePanel.hidden = true;
      el.stageHint.hidden = true;
      el.btnPNG.disabled = true; el.btnPDF.disabled = true; el.btnTall.disabled = true;
      el.btnShuffle.disabled = true;
      return;
    }
    el.empty.hidden = true;
    el.btnPNG.disabled = false;
    el.btnPDF.disabled = false; el.btnTall.disabled = false;
    el.btnShuffle.disabled = false;

    if (state.mode === 'grid') {
      renderGrid(photos);
    } else if (state.mode === 'zine') {
      renderZine(photos);
    } else {
      renderBook(photos);
    }
  }

  /* ---------------- book ---------------- */
  function renderBook(photos) {
    el.gridPanel.hidden = true;
    el.zinePanel.hidden = true;
    el.pages.hidden = false;
    var res = M.build(photos, {
      style: state.style, plan: state.plan, format: state.format,
      seed: state.seed, title: state.title || '未命名的一卷', year: state.year,
      pages: state.pageTarget || 0
    });
    state.book = res;
    state.pages = res.pages;
    state.repaint = paintBook;
    setStat(photos.length + ' 张 · ' + res.pages.length + ' 页');
    if (state.pageTarget && res.pages.length !== state.pageTarget) {
      el.pageNote.textContent = '这组照片排不满 ' + state.pageTarget + ' 页，现在是 ' +
        res.pages.length + ' 页（每页最多 6 张）。';
      el.pageNote.hidden = false;
    }
    paintBook();
  }

  /* paints the pages we already have — a swap must not re-lay-out the book */
  function paintBook() {
    var res = state.book;
    if (!res || !res.pages.length) return;
    el.pages.innerHTML = '';

    if (solo !== null) {
      var sp = res.pages[solo] || res.pages[0];
      el.pages.style.display = 'block';
      el.pages.appendChild(M.renderPage(sp, soloScale));
      return;
    }

    var stageW = el.pages.clientWidth || 900;
    var cols = stageW > 1000 ? 3 : stageW > 640 ? 2 : 1;
    var gapPx = 24;
    el.pages.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    var scale = ((stageW - (cols - 1) * gapPx) / cols - 2) / res.format.w;

    res.pages.forEach(function (page, i) {
      var slot = document.createElement('div');
      slot.className = 'page-slot';
      var btn = document.createElement('button');
      btn.className = 'page-btn'; btn.type = 'button';
      btn.setAttribute('aria-label', '放大第 ' + (i + 1) + ' 页');
      btn.appendChild(M.renderPage(page, scale, {
        frameClick: function (fi) { openEditor(i, fi); }
      }));
      btn.onclick = function () { openLightbox(i); };
      var lab = document.createElement('div');
      lab.className = 'page-label';
      lab.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b>' +
        (i === 0 ? '封面' : sceneName(page));
      slot.appendChild(btn); slot.appendChild(lab);
      el.pages.appendChild(slot);
    });
    el.stageHint.hidden = false;
  }

  /* ---------------- zine: portrait pages that pair into spreads ---------------- */
  function renderZine(photos) {
    el.pages.hidden = true; el.gridPanel.hidden = true; el.stageHint.hidden = true;
    el.zinePanel.hidden = false;
    var z = M.buildZine(photos, {
      seed: state.seed, title: state.title || '未命名的一卷', year: state.year, spreads: 4
    });
    state.zine = z;
    state.pages = z.pages;
    state.repaint = paintZine;
    paintZine();
  }

  function paintZine() {
    var z = state.zine;
    if (!z || !z.pages.length) return;
    el.zineList.innerHTML = '';
    var stageW = el.zineList.clientWidth || 1000;
    var scale = Math.min(0.62, (stageW - 6) / (2 * z.pages[0].w));

    function pageBtn(pg, pi, label) {
      var btn = document.createElement('button');
      btn.className = 'page-btn'; btn.type = 'button';
      btn.setAttribute('aria-label', '放大 ' + label);
      btn.appendChild(M.renderPage(pg, scale, {
        frameClick: function (fi) { openEditor(pi, fi); }
      }));
      btn.onclick = function () { openLightbox(pi, z.pages); };
      return btn;
    }

    // cover
    var row0 = document.createElement('div');
    row0.className = 'spread-row spread-row--single';
    var l0 = document.createElement('span');
    l0.className = 'spread-label';
    l0.textContent = '01 · 封面';
    row0.appendChild(pageBtn(z.pages[0], 0, '封面'));
    row0.appendChild(l0);
    el.zineList.appendChild(row0);

    z.spreads.forEach(function (sp, i) {
      var row = document.createElement('div');
      row.className = 'spread-row';
      var lab = document.createElement('span');
      lab.className = 'spread-label';
      lab.textContent = pad2(2 + i * 2) + ' — ' + pad2(3 + i * 2) + ' · ' + sp.name +
        ' · ' + sp.photos.length + ' 张';
      row.appendChild(pageBtn(sp.a, 1 + i * 2, '第 ' + (2 + i * 2) + ' 页'));
      row.appendChild(pageBtn(sp.b, 2 + i * 2, '第 ' + (3 + i * 2) + ' 页'));
      row.appendChild(lab);
      el.zineList.appendChild(row);
    });

    el.zineNote.textContent = z.total + ' 张 · ' + z.pages.length +
      ' 张图（1 封面 + ' + z.spreads.length + ' 个跨页）· 相邻两张是一页展开：' +
      '手机上一左一右滑过去，横图会连起来。';
    setStat(z.total + ' 张 · ' + z.pages.length + ' 张图');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- swap / delete ---------------- */
  var editTarget = null;

  function arLoss(photo, slotAR) {
    return Math.abs(Math.log((photo.ar || 1) / slotAR));
  }

  function frameUsage() {
    var map = {};
    state.pages.forEach(function (p, pj) {
      p.frames.forEach(function (f) { map[f.photo.id] = pj; });
    });
    return map;
  }

  function openEditor(pi, fi) {
    var page = state.pages[pi];
    if (!page || !page.frames[fi]) return;
    var frame = page.frames[fi];
    editTarget = { pi: pi, fi: fi };
    var slotAR = (frame.w - frame.pad * 2) / (frame.h - frame.pad * 2);
    var cur = frame.photo;
    var usage = frameUsage();

    var cands = state.photos.filter(function (p) { return p !== cur; });
    cands.sort(function (a, b) { return arLoss(a, slotAR) - arLoss(b, slotAR); });
    // flag only the three worst crops: warning on half the library is noise
    var lossList = cands.map(function (p) { return arLoss(p, slotAR); }).sort(function (a, b) { return b - a; });
    var cutLine = lossList.length > 3 ? lossList[2] : Infinity;

    el.pickerTitle.textContent = (pi === 0 ? '封面' : '第 ' + pi + ' 页') + ' · 第 ' + (fi + 1) + ' 张';
    el.pickerNote.textContent = '点一张就换进来：没在用的直接替换；已经在别的页的，跟那一张互换位置。越靠前裁切越少。';
    el.pickerGrid.innerHTML = '';
    cands.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'picker-item'; b.type = 'button';
      var loss = arLoss(p, slotAR);
      if (loss > cutLine) b.dataset.fit = '0';
      var usedOn = usage[p.id];
      b.title = (usedOn == null ? '未使用' : (usedOn === 0 ? '封面' : '第 ' + usedOn + ' 页')) +
        ' · ' + p.w + '×' + p.h;
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
    del.title = '从这组照片里删掉，可撤销';
    del.onclick = function () { deletePhoto(cur); };
    var head = document.getElementById('pickerHead');
    var stale = head.querySelector('.btn-danger');
    if (stale) stale.remove();
    head.insertBefore(del, el.pickerClose);

    el.picker.hidden = false;
  }

  function closePicker() { el.picker.hidden = true; el.pickerGrid.innerHTML = ''; editTarget = null; }

  function setFramePhoto(frame, photo) {
    frame.photo = photo;
    frame.crop = M.cropFor(photo, frame.w - frame.pad * 2, frame.h - frame.pad * 2);
  }

  function applySwap(target) {
    var t = editTarget;
    if (!t) return;
    var frame = state.pages[t.pi].frames[t.fi];
    var cur = frame.photo;
    if (target === cur) { closePicker(); return; }
    var from = null;
    state.pages.forEach(function (p, pj) {
      p.frames.forEach(function (f, fj) { if (f.photo === target) from = { pj: pj, fj: fj }; });
    });
    setFramePhoto(frame, target);
    if (from) setFramePhoto(state.pages[from.pj].frames[from.fj], cur);
    closePicker();
    if (state.repaint) state.repaint();
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

  function sceneName(page) {
    var n = page.frames.length;
    var map = { 1: '整版', 2: '跨栏', 3: '三格', 4: '四格', 6: '六格', 8: '八格' };
    return map[n] || n + ' 图';
  }

  /* ---------------- grid ---------------- */
  function renderGrid(photos) {
    el.pages.hidden = true;
    el.gridPanel.hidden = false;
    el.stageHint.hidden = true;
    var mosaic = state.fill === 'mosaic';
    var g = mosaic
      ? M.buildMosaic(photos, { layout: state.layout, plan: state.plan, seed: state.seed })
      : M.buildGrid(photos, { layout: state.layout, plan: state.plan, seed: state.seed, fixed: pickList });
    state.grid = g;
    var n = g.tiles.length;
    setStat(photos.length + ' 张 → 选 ' + n + ' 张');

    el.gridWrap.innerHTML = '';
    el.gridWrap.dataset.layout = g.layout.key;
    var stageW = el.gridPanel.clientWidth || 1080;
    var sideW = stageW > 820 ? 300 + 44 : 0;
    var box = Math.max(320, Math.min(720, stageW - sideW));
    var cell = Math.floor((box - 8) / 3);
    el.gridWrap.style.width = (cell * 3 + 8) + 'px';
    g.tiles.forEach(function (t, i) {
      var cellEl = document.createElement('div');
      cellEl.className = 'grid-cell';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'grid-btn';
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 格');
      b.appendChild(M.renderPage(t, cell / t.w));
      b.onclick = function () { openLightbox(i, g.tiles); };
      var num = document.createElement('span');
      num.className = 'grid-num';
      num.textContent = String(i + 1).padStart(2, '0');
      cellEl.appendChild(b); cellEl.appendChild(num);
      el.gridWrap.appendChild(cellEl);
    });

    el.gridStrip.innerHTML = '';
    el.gridStrip.className = 'grid-strip' + (mosaic ? ' grid-strip--counts' : '');
    if (mosaic) {
      (g.counts || []).forEach(function (c, i) {
        var d = document.createElement('div');
        d.className = 'count-cell';
        d.textContent = c;
        d.title = '第 ' + (i + 1) + ' 格 · ' + c + ' 张';
        el.gridStrip.appendChild(d);
      });
    } else {
      g.cells.forEach(function (p, i) {
        var cell2 = document.createElement('div');
        cell2.className = 'strip-cell';
        var im = document.createElement('img');
        im.src = p.url; im.alt = p.name || '';
        var n2 = document.createElement('b');
        n2.textContent = String(i + 1).padStart(2, '0');
        cell2.appendChild(im); cell2.appendChild(n2);
        cell2.title = p.name || '';
        el.gridStrip.appendChild(cell2);
      });
    }

    if (mosaic) {
      el.gridNote.textContent = photos.length + ' 张全部用上 · 每格 1–6 张 · 按 01–09 的顺序发';
      el.gridWhy.textContent = '中间那格只放一张，是全组的眼；四个角放得最密，四边留一口气。' +
        '所以九张摆在一起读起来是一张版面，不是九张照片。';
      setStat(photos.length + ' 张 → 9 格');
    } else {
      el.gridNote.textContent = '从 ' + photos.length + ' 张里选 9 张 · ' +
        (g.layout.key === 'paper' ? '每张留纸边' : '满幅') + ' · 按这个顺序发，微信里就是这张图';
      var dark = g.cells.filter(function (p) { return (p.bright || .5) < 0.36; }).length;
      el.gridWhy.textContent = '上一排与下一排之间换了明暗和色系：' + dark +
        ' 张暗调穿插在亮调里，中间那格放的是这一组最抓眼的一张。';
      setStat(photos.length + ' 张 → 选 ' + n + ' 张');
    }
  }

  /* ---------------- lightbox ---------------- */
  var lbIndex = 0, lbList = null;
  function openLightbox(i, list) {
    lbIndex = i;
    lbList = list || state.pages;
    el.lightbox.hidden = false;
    paintLightbox();
  }
  function paintLightbox() {
    var list = lbList || state.pages;
    var page = list[lbIndex];
    if (!page) return;
    var s = Math.min((window.innerWidth - 120) / page.w, (window.innerHeight - 170) / page.h);
    s = Math.max(0.2, Math.min(s, 1.6));
    el.lbStage.innerHTML = '';
    el.lbStage.appendChild(M.renderPage(page, s));
    el.lbCount.textContent = (lbIndex + 1) + ' / ' + list.length;
  }
  function closeLightbox() { el.lightbox.hidden = true; el.lbStage.innerHTML = ''; lbList = null; }

  /* ---------------- export ---------------- */
  async function doExport(kind) {
    if (state.busy) return;
    var isGrid = state.mode === 'grid';
    var isZine = state.mode === 'zine';
    var pages = isZine ? (state.zine && state.zine.pages) : state.pages;
    if (isGrid ? (!state.grid || !state.grid.tiles.length) : !pages || !pages.length) return;
    state.busy = true;
    toast(kind === 'grid' ? '正在导出九张…' : kind === 'pdf' ? '正在生成 PDF…' : kind === 'tall' ? '正在拼长图…' : '正在导出图片…');
    try {
      if (kind === 'grid') {
        var n = await M.exportGrid(state.grid, state.title, { scale: 1 });
        toast('已导出 ' + n + ' 张 1080×1080（浏览器可能询问是否允许多文件下载）');
      } else if (kind === 'pdf') {
        var bytes = await M.exportPDF(pages, state.title);
        toast('PDF 已生成 · ' + Math.round(bytes / 1024) + ' KB');
      } else if (kind === 'tall') {
        var info = await M.exportTall(pages, state.title);
        toast('长图已生成 · ' + info.w + '×' + info.h + ' · ' + info.kb + ' KB');
      } else {
        var k = await M.exportPNG(pages, state.title);
        toast('已导出 ' + k + ' 张 PNG');
      }
    } catch (err) {
      toast('导出失败：' + (err && err.message ? err.message : err));
    }
    state.busy = false;
  }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
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
  el.modes.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (!b) return;
    state.mode = b.dataset.mode;
    lbList = null;
    buildOptions();
    rebuild();
  });
  el.fills.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-fill]');
    if (!b) return;
    state.fill = b.dataset.fill;
    buildOptions();
    rebuild();
  });
  el.pageTargets.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pages]');
    if (!b) return;
    state.pageTarget = Number(b.dataset.pages) || 0;
    if (state.pageTarget > 0) state.format = 'square';
    buildOptions();
    rebuild();
  });
  el.btnImport.onclick = el.btnPick.onclick = function () { el.file.click(); };
  el.file.onchange = function (e) { addFiles(e.target.files); el.file.value = ''; };
  el.btnDemo.onclick = loadDemo;
  el.btnPDF.onclick = function () { doExport('pdf'); };
  el.btnPNG.onclick = function () { doExport(state.mode === 'grid' ? 'grid' : 'png'); };
  el.btnTall.onclick = function () { doExport('tall'); };
  el.btnShuffle.onclick = function () { state.seed = (state.seed * 7919 + 13) % 100000; rebuild(); };
  el.lbClose.onclick = closeLightbox;
  el.pickerClose.onclick = closePicker;
  el.picker.addEventListener('click', function (e) {
    if (e.target === el.picker) closePicker();
  });
  el.lbPrev.onclick = function () {
    var L = lbList || state.pages;
    lbIndex = (lbIndex - 1 + L.length) % L.length; paintLightbox();
  };
  el.lbNext.onclick = function () {
    var L = lbList || state.pages;
    lbIndex = (lbIndex + 1) % L.length; paintLightbox();
  };
  window.addEventListener('resize', function () { if (!el.lightbox.hidden) paintLightbox(); });
  var rTimer;
  window.addEventListener('resize', function () {
    if (solo !== null) return;
    clearTimeout(rTimer);
    rTimer = setTimeout(rebuild, 220);
  });

  var tTimer;
  el.title.oninput = function () {
    state.title = el.title.value.trim() || '未命名的一卷';
    clearTimeout(tTimer);
    tTimer = setTimeout(rebuild, 260);
  };

  document.addEventListener('keydown', function (e) {
    if (!el.picker.hidden) {
      if (e.key === 'Escape') closePicker();
      return;
    }
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
  var solo = null, soloScale = 1, manifest = null, pickList = null;
  try {
    var qs = new URLSearchParams(location.search);
    ['style', 'plan', 'format', 'layout', 'mode', 'fill'].forEach(function (k) {
      var v = qs.get(k);
      if (!v) return;
      if (k === 'style' && !M.STYLES[v]) return;
      if (k === 'format' && !M.FORMATS[v]) return;
      if (k === 'layout' && !M.GRID_LAYOUTS[v]) return;
      if (k === 'fill' && v !== 'single' && v !== 'mosaic') return;
      state[k] = v;
    });
    if (qs.get('pages')) {
      state.pageTarget = parseInt(qs.get('pages'), 10) || 0;
      if (state.pageTarget > 0) state.format = 'square';
    }
    if (qs.get('pick')) {
      pickList = qs.get('pick').split(',').map(function (s) { return parseInt(s, 10); })
        .filter(function (n) { return n > 0; });
    }
    if (['book', 'grid', 'zine'].indexOf(state.mode) < 0) state.mode = 'book';
    if (qs.get('title')) { state.title = qs.get('title'); el.title.value = state.title; }
    if (qs.get('solo') != null) solo = parseInt(qs.get('solo'), 10) || 0;
    if (qs.get('scale')) soloScale = parseFloat(qs.get('scale')) || 1;
    if (qs.get('manifest')) manifest = qs.get('manifest');
  } catch (e) { /* ignore */ }
  if (solo !== null) document.body.classList.add('solo-mode');

  function hideDemo() {
    el.btnDemo.hidden = true;
    var hint = document.querySelector('.empty-sub');
    if (hint) hint.textContent = '本地处理，不上传。把照片拖进来，或者点「选择照片」——四十张也可以。';
  }

  buildOptions();
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

  /* debug handle for the verification driver */
  window.__mem = { state: state, rebuild: rebuild, M: M };
})();
