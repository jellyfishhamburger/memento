/* App shell — one thing: a 作品集. Portrait pages that pair into spreads.
   Import, arrange, swap/crop/delete a photo, export nine images. */
(function () {
  'use strict';
  var M = window.MEM;

  var state = {
    photos: [], zine: null, seed: 11, mode: 'C', scheme: 0, count: 9,
    title: '十一月的海', year: new Date().getFullYear(), busy: false, locked: {},
    direction: 'zine', texts: {}
  };

  var MODES = [
    { key: 'A', name: '编辑杂志', note: '单页构图：主图 + 细节，大片留白' },
    { key: 'B', name: '跨页全景', note: '两张一组：图跨中缝，冲击力优先' },
    { key: 'C', name: '摄影小书', note: '整本叙事：开场 → 细节 → 高潮 → 收尾' }
  ];

  /* a design direction owns composition, rhythm and voice. Adding one is not a
     new skin: it brings its own pages, its own beat and its own words. */
  var DIRS = [
    { key: 'zine', name: '杂志 Zine', note: '三个排版模式共用一套构图库，字压图、密度高。' },
    { key: 'jp', name: '日式小书', note: '宽边距、小字、一页一个主意；开场 → 展开 → 跨页高潮 → 收尾。' }
  ];
  function unitsWanted() {
    if (state.mode === 'A') return state.count === 9 ? 8 : 10;
    return state.count === 9 ? 4 : 5;
  }

  var $ = function (s) { return document.querySelector(s); };
  var el = {
    modes: $('#modes'), schemes: $('#schemes'), counts: $('#counts'), countNote: $('#countNote'), tray: $('#tray'),
    dirs: $('#dirs'), dirNote: $('#dirNote'), modeBlock: $('#modeBlock'), schemeBlock: $('#schemeBlock'),
    btnText: $('#btnText'), textPanel: $('#textPanel'), textTitle: $('#textTitle'), textYear: $('#textYear'),
    textSections: $('#textSections'), textLines: $('#textLines'), textNote: $('#textNote'),
    textReset: $('#textReset'), textDone: $('#textDone'), textClose: $('#textClose'),
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
    toast: $('#toast'),
    saved: $('#saved'), savedGrid: $('#savedGrid'), savedNote: $('#savedNote'),
    savedTitle: $('#savedTitle'), savedClose: $('#savedClose')
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- rail ---------------- */
  function isJp() { return state.direction === 'jp'; }

  function buildRail() {
    el.dirs.innerHTML = '';
    DIRS.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'opt';
      b.setAttribute('aria-pressed', String(state.direction === d.key));
      b.innerHTML = '<span class="opt-body"><span class="opt-name">' + d.name + '</span></span>';
      b.onclick = function () {
        if (state.direction === d.key) return;
        state.direction = d.key;
        saveDir();
        state.locked = {}; state.forced = {};
        el.title.value = textFor(d.key).title;
        buildRail(); rebuild();
      };
      el.dirs.appendChild(b);
    });
    el.dirNote.textContent = (DIRS.filter(function (d) { return d.key === state.direction; })[0] || DIRS[0]).note;

    // the japanese book has its own fixed narrative: no A/B/C, no scheme orders
    el.modeBlock.hidden = isJp();
    el.schemeBlock.hidden = isJp();

    el.modes.innerHTML = '';
    MODES.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'opt';
      b.setAttribute('aria-pressed', String(state.mode === m.key));
      b.innerHTML = '<span class="opt-body"><span class="opt-name">' + m.name +
        '</span><span class="opt-note">' + m.note + '</span></span>';
      b.onclick = function () { state.mode = m.key; state.forced = {}; state.scheme = 0; buildRail(); rebuild(); };
      el.modes.appendChild(b);
    });

    el.schemes.innerHTML = '';
    var names = M.SCHEME_NAME[state.mode] || [];
    names.forEach(function (nm, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'opt opt--sm';
      b.setAttribute('aria-pressed', String(state.scheme === i));
      b.innerHTML = '<span class="opt-body"><span class="opt-name">' + (i + 1) + ' · ' + nm + '</span></span>';
      b.onclick = function () { state.scheme = i; state.forced = {}; buildRail(); rebuild(); };
      el.schemes.appendChild(b);
    });

    Array.prototype.forEach.call(el.counts.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.count) === state.count));
    });
    el.countNote.textContent = isJp()
      ? (state.count === 9 ? '九张 = 封面 + 八页（其中一个跨页占两页），整本一条叙事。'
                           : '十一张 = 封面 + 十页（含两个跨页），叙事更完整。')
      : state.count === 9
        ? '九张 = 封面 + ' + (state.mode === 'A' ? '八页' : '四跨页') + '：朋友圈九图正好。'
        : '十一张 = 封面 + ' + (state.mode === 'A' ? '十页' : '五跨页') + '：小红书可以发十张以上。';
  }

  var LS_PHOTOS = 'memento.photos.v1';
  var LS_STARS = 'memento.stars.v1';
  var LS_TEXT = 'memento.text.v1';
  var LS_DIR = 'memento.dir.v1';
  function saveDir() { try { localStorage.setItem(LS_DIR, state.direction); } catch (e) {} }
  function loadSavedDir() {
    try {
      var d = localStorage.getItem(LS_DIR);
      if (d === 'jp' || d === 'zine') state.direction = d;
    } catch (e) {}
  }

  /* every direction keeps its own words; edits are data, so they survive a
     direction switch and a reload */
  function textFor(dir) {
    if (!state.texts[dir]) {
      var d = M.TEXT_DEFAULT[dir] || M.TEXT_DEFAULT.zine;
      state.texts[dir] = { title: d.title, year: d.year, sections: d.sections.slice(), lines: d.lines.slice() };
    }
    return state.texts[dir];
  }
  function saveText() {
    try { localStorage.setItem(LS_TEXT, JSON.stringify(state.texts)); } catch (e) { /* 配额满了就算了 */ }
  }
  function loadSavedText() {
    try {
      var raw = localStorage.getItem(LS_TEXT);
      var obj = raw ? JSON.parse(raw) : null;
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function (k) {
        var t = obj[k];
        if (!t || typeof t !== 'object') return;
        state.texts[k] = {
          title: String(t.title || ''),
          year: Number(t.year) || new Date().getFullYear(),
          sections: Array.isArray(t.sections) && t.sections.length ? t.sections.slice() : null,
          lines: Array.isArray(t.lines) && t.lines.length ? t.lines.slice() : null
        };
        if (!state.texts[k].sections || !state.texts[k].lines) {
          var d = M.TEXT_DEFAULT[k] || M.TEXT_DEFAULT.zine;
          state.texts[k].sections = state.texts[k].sections || d.sections.slice();
          state.texts[k].lines = state.texts[k].lines || d.lines.slice();
        }
      });
    } catch (e) { /* 坏掉的存档不挡路 */ }
  }

  function openText() {
    var t = textFor(state.direction);
    el.textTitle.value = t.title;
    el.textYear.value = t.year;
    el.textSections.value = (t.sections || []).join('，');
    el.textLines.value = (t.lines || []).join('\n');
    el.textNote.textContent = isJp()
      ? '日式小书的语气是安静的：短句，少形容词，不解释。改完立刻重排。'
      : '杂志 Zine 的语气是冷静的旁白。改完立刻重排。';
    el.textPanel.hidden = false;
    el.textTitle.focus();
  }
  function closeText() { el.textPanel.hidden = true; }

  function adoptText() {
    var t = textFor(state.direction);
    var title = el.textTitle.value.trim() || '未命名的一卷';
    var year = parseInt(el.textYear.value, 10) || new Date().getFullYear();
    var sections = el.textSections.value.replace(/[，；;]/g, ',').split(',')
      .map(function (s) { return s.trim(); }).filter(Boolean);
    var lines = el.textLines.value.split(String.fromCharCode(10))
      .map(function (s) { return s.trim(); }).filter(Boolean);
    t.title = title; t.year = year;
    if (sections.length) t.sections = sections;
    if (lines.length) t.lines = lines;
    state.title = title; state.year = year;
    el.title.value = title;
    saveText();
    rebuild();
  }

  var textTimer;
  function onTextInput() {
    clearTimeout(textTimer);
    textTimer = setTimeout(adoptText, 280);
  }
  [el.textTitle, el.textYear, el.textSections, el.textLines].forEach(function (node) {
    if (node) node.addEventListener('input', onTextInput);
  });
  if (el.btnText) el.btnText.onclick = openText;
  if (el.textDone) el.textDone.onclick = function () { adoptText(); closeText(); };
  if (el.textClose) el.textClose.onclick = closeText;
  if (el.textReset) {
    el.textReset.onclick = function () {
      delete state.texts[state.direction];
      textFor(state.direction);
      saveText();
      openText();
      rebuild();
    };
  }
  if (el.textPanel) {
    el.textPanel.addEventListener('click', function (e) { if (e.target === el.textPanel) closeText(); });
  }

  function saveStars() {
    try {
      localStorage.setItem(LS_STARS, JSON.stringify(state.photos.filter(function (x) { return x.starred; }).map(function (x) { return x.name || ''; })));
    } catch (e) { /* 配额满了就算了 */ }
  }
  function loadSavedStars() {
    try {
      var raw = localStorage.getItem(LS_STARS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function savePhotos() {
    try {
      localStorage.setItem(LS_PHOTOS, JSON.stringify(state.photos.map(function (p) {
        return { url: p.url, name: p.name || '' };
      })));
    } catch (e) { /* 配额满了就算了，不影响当前编辑 */ }
  }
  function loadSavedPhotos() {
    try {
      var raw = localStorage.getItem(LS_PHOTOS);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (x) { return x && x.url; }) : [];
    } catch (e) { return []; }
  }

  function buildTray() {
    var note = document.querySelector('.rail-block .rail-note');
    if (note) note.textContent = state.photos.length
      ? '本次 ' + state.photos.length + ' 张（刷新也在）；点一张删掉，可撤销'
      : '还没有照片：点上面的「选照片」或用示例。';
    el.tray.innerHTML = '';
    state.photos.forEach(function (p) {
      var img = document.createElement('img');
      img.src = p.url; img.alt = p.name || '';
      img.loading = 'lazy';
      img.title = (p.name || '') + ' — 点一下删掉（可撤销）';
      img.onclick = function () { deletePhoto(p); };
      var wrap = document.createElement('div');
      wrap.className = 'tray-cell' + (p.starred ? ' on' : '');
      var star = document.createElement('button');
      star.className = 'tray-star';
      star.type = 'button';
      star.title = p.starred ? '已设为主视觉，点一下取消' : '设为主视觉（排版优先用它当大幅）';
      star.textContent = p.starred ? '★' : '☆';
      star.onclick = function (e) {
        e.stopPropagation();
        p.starred = !p.starred;
        saveStars();
        buildTray(); rebuild();
      };
      wrap.appendChild(img); wrap.appendChild(star);
      el.tray.appendChild(wrap);
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
    buildTray(); rebuild(); savePhotos();
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

    var preset = Object.keys(state.locked).map(function (k) {
      var L = state.locked[k];
      var ph = L.photos.map(function (id) {
        return state.photos.filter(function (p) { return p.id === id; })[0];
      }).filter(Boolean);
      return { i: Number(k), key: L.key, photos: ph };
    });

    state.zine = M.composeBook(state.photos, {
      mode: state.mode, scheme: state.scheme, units: unitsWanted(),
      seed: state.seed, coverPhoto: state.coverPhoto, preset: preset,
      dir: state.direction, text: textFor(state.direction), pages: state.count - 1
    });
    paintZine();
  }

  function paintZine() {
    var z = state.zine;
    if (!z || !z.pages.length) return;
    el.zineList.innerHTML = '';
    var stageW = (el.zineList.clientWidth || 1000) - 56;   // leave room for the lock tools beside the pages
    var pair = z.pair;
    var maxH = isJp() ? 620 : 500;
    var scale = Math.min((stageW - 6) / (pair ? 2 * z.pages[0].w : z.pages[0].w), maxH / z.pages[0].h);

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

    z.units.forEach(function (u, i) {
      var row = document.createElement('div');
      row.className = 'spread-row';

      var lab = document.createElement('span');
      lab.className = 'spread-label';
      var two = pair && u.pages.length > 1;
      lab.textContent = two
        ? pad2(u.startIndex + 1) + ' — ' + pad2(u.startIndex + 2) + ' · ' + (M.COMP[u.key] ? M.COMP[u.key].name : '')
        : pad2(u.startIndex + 1) + ' · ' + (M.COMP[u.key] ? M.COMP[u.key].name : '');
      row.appendChild(lab);

      u.pages.forEach(function (pg, k) {
        row.appendChild(pageBtn(pg, u.startIndex + k, '第 ' + (u.startIndex + k + 1) + ' 页'));
      });

      var tools = document.createElement('div');
      tools.className = 'row-tools';

      var sel = document.createElement('select');
      sel.className = 'spread-type';
      sel.setAttribute('aria-label', '这一页的构图');
      Object.keys(M.COMP).forEach(function (k) {
        var c = M.COMP[k];
        if (k === 'cover' || c.mode !== state.mode) return;
        var o = document.createElement('option');
        o.value = k; o.textContent = c.name;
        if (k === u.key) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = function () { changeComp(i, sel.value); };
      tools.appendChild(sel);

      var lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'lock-btn';
      lock.setAttribute('aria-pressed', String(!!state.locked[i]));
      lock.title = state.locked[i] ? '已锁定：重排时保留这一页' : '锁定这一页';
      lock.textContent = state.locked[i] ? '锁定' : '锁定';
      lock.onclick = function () { toggleLock(i); };
      tools.appendChild(lock);

      row.appendChild(tools);
      el.zineList.appendChild(row);
    });

    el.zineNote.textContent = z.total + ' 张 → ' + z.pages.length + ' 张图 · ' +
      (pair ? '两张一组，手机上滑过去，跨页的图连成一整张。' : '每页独立构图。');
    setStat(z.total + ' 张 · ' + z.pages.length + ' 张图');
  }

  function toggleLock(i) {
    if (state.locked[i]) { delete state.locked[i]; }
    else {
      var u = state.zine.units[i];
      var ids = [];
      u.pages.forEach(function (pg) { pg.frames.forEach(function (f) { ids.push(f.photo.id); }); });
      state.locked[i] = { key: u.key, photos: ids };
    }
    paintZine();
  }

  function changeComp(i, key) {
    var u = state.zine.units[i];
    if (!u) return;
    state.locked[i] = {
      key: key,
      photos: (function () {
        var ids = [];
        u.pages.forEach(function (pg) { pg.frames.forEach(function (f) { ids.push(f.photo.id); }); });
        return ids;
      })()
    };
    rebuild();
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

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* A cross-page image is one photo cut into two frames at the fold. Both halves
     come from a single crop, so editing one has to move the other — otherwise the
     picture tears down the middle. Returns the pair ordered left page → right page. */
  function foldPair(pi, fi) {
    var pg = state.zine.pages[pi];
    var fr = pg && pg.frames[fi];
    if (!fr || fr.role !== 'fold') return null;
    var found = null;
    [pi - 1, pi + 1].forEach(function (pj) {
      var q = state.zine.pages[pj];
      if (found || !q) return;
      q.frames.forEach(function (f, fj) {
        if (found || f.photo !== fr.photo || f.role !== 'fold') return;
        if (Math.abs(f.h - fr.h) > 2 || Math.abs(f.y - fr.y) > 2) return;
        if (pj === pi + 1 && f.x > 1) return;              // right half starts at the fold
        if (pj === pi - 1 && f.x + f.w < q.w - 1) return;  // left half ends at the edge
        found = pj === pi + 1
          ? { aPi: pi, aFi: fi, bPi: pj, bFi: fj }
          : { aPi: pj, aFi: fj, bPi: pi, bFi: fi };
      });
    });
    return found;
  }

  /* the crop both halves are cut from, rebuilt from what is on the frames */
  function sharedCrop(A, B) {
    return { sx: A.crop.sx, sy: A.crop.sy, sw: A.crop.sw + B.crop.sw, sh: A.crop.sh };
  }

  function writeSharedCrop(A, B, full) {
    var fa = A.w / (A.w + B.w);
    A.crop = { sx: full.sx, sy: full.sy, sw: full.sw * fa, sh: full.sh };
    B.crop = { sx: full.sx + full.sw * fa, sy: full.sy, sw: full.sw * (1 - fa), sh: full.sh };
    var f = { x: (full.sx + full.sw / 2) / A.photo.w, y: (full.sy + full.sh / 2) / A.photo.h };
    A.focal = B.focal = f;
  }

  function setPairPhoto(A, B, photo) {
    var totalW = A.w + B.w;
    var full = M.cropFor(photo, totalW, A.h);
    A.photo = B.photo = photo;
    writeSharedCrop(A, B, full);
    A.focal = B.focal = null;   // a fresh photo starts from its own focal point
  }

  function setPhotoAt(pi, fi, photo) {
    var pair = foldPair(pi, fi);
    if (pair) {
      setPairPhoto(state.zine.pages[pair.aPi].frames[pair.aFi], state.zine.pages[pair.bPi].frames[pair.bFi], photo);
    } else {
      setFramePhoto(state.zine.pages[pi].frames[fi], photo);
    }
  }

  function openEditor(pi, fi) {
    var page = state.zine.pages[pi];
    if (!page || !page.frames[fi]) return;
    var fr = page.frames[fi];
    editTarget = { pi: pi, fi: fi };
    var cur = fr.photo;
    var usage = frameUsage();

    var pair = foldPair(pi, fi);
    var A = pair ? state.zine.pages[pair.aPi].frames[pair.aFi] : null;
    var B = pair ? state.zine.pages[pair.bPi].frames[pair.bFi] : null;
    var spreadW = pair ? A.w + B.w : 0;
    var shared = pair ? sharedCrop(A, B) : null;

    // one photo across two pages is judged (and cropped) as the whole spread
    var slotAR = pair ? spreadW / A.h : (fr.w - fr.pad * 2) / (fr.h - fr.pad * 2);

    el.pickerTitle.textContent = pair
      ? '跨页 ' + pad2(pair.aPi + 1) + '—' + pad2(pair.bPi + 1) + ' · 一整张'
      : (pi === 0 ? '封面' : '第 ' + pi + ' 页') + ' · 第 ' + (fi + 1) + ' 张';

    var cands = state.photos.filter(function (p) { return p !== cur; });
    cands.sort(function (a, b) { return arLoss(a, slotAR) - arLoss(b, slotAR); });
    var lossList = cands.map(function (p) { return arLoss(p, slotAR); }).sort(function (a, b) { return b - a; });
    var cutLine = lossList.length > 3 ? lossList[2] : Infinity;

    el.pickerNote.textContent = pair
      ? '这一张横跨两页：拖动是整幅一起移，折线处按两页各自的宽窄自动裁，不会两页各裁一刀。'
      : '点一张就换进来；已经在别的页的，跟那一张互换。下面可以拖动画面选显示的部分。';

    // crop adjuster
    var boxW = Math.round(Math.min(pair ? 340 : 220, window.innerWidth * 0.78));
    var boxH = Math.round(boxW / slotAR);
    el.cropBox.style.width = boxW + 'px';
    el.cropBox.style.height = boxH + 'px';
    el.cropBox.innerHTML = '';
    var img = document.createElement('img');
    img.src = cur.url; img.alt = '';
    img.style.position = 'absolute';
    el.cropBox.appendChild(img);
    if (pair) {
      // the fold: left of the line is page a, right of it is page b
      var seam = document.createElement('i');
      seam.className = 'crop-seam';
      seam.style.left = Math.round(boxW * A.w / spreadW) + 'px';
      el.cropBox.appendChild(seam);
    }
    var hint = document.querySelector('#pickerCrop .crop-hint');
    if (hint) {
      hint.textContent = pair
        ? '左右拖动 = 整幅影像一起移；虚线是两个页码的交界，线两边永远是同一张图。'
        : '左右上下拖动，选这一段显示。';
    }
    el.pickerCrop.hidden = false;

    function paintCrop() {
      var c = shared || fr.crop;
      var k = boxW / c.sw;
      img.style.width = (cur.w * k) + 'px';
      img.style.height = (cur.h * k) + 'px';
      img.style.left = (-c.sx * k) + 'px';
      img.style.top = (-c.sy * k) + 'px';
    }
    paintCrop();

    var drag = null;
    el.cropBox.onpointerdown = function (ev) {
      drag = shared
        ? { x: ev.clientX, y: ev.clientY, sx: shared.sx, sy: shared.sy }
        : { x: ev.clientX, y: ev.clientY, focal: focalOf(fr) };
      el.cropBox.setPointerCapture(ev.pointerId);
      el.cropBox.classList.add('dragging');
    };
    el.cropBox.onpointermove = function (ev) {
      if (!drag) return;
      if (shared) {
        var kk = boxW / shared.sw;
        shared.sx = clamp(drag.sx - (ev.clientX - drag.x) / kk, 0, Math.max(0, cur.w - shared.sw));
        shared.sy = clamp(drag.sy - (ev.clientY - drag.y) / kk, 0, Math.max(0, cur.h - shared.sh));
        writeSharedCrop(A, B, shared);       // both halves move together, always contiguous
      } else {
        var k = boxW / fr.crop.sw;
        var dfx = -(ev.clientX - drag.x) / k / cur.w;
        var dfy = -(ev.clientY - drag.y) / k / cur.h;
        fr.focal = {
          x: Math.max(0.05, Math.min(0.95, drag.focal.x + dfx)),
          y: Math.max(0.05, Math.min(0.95, drag.focal.y + dfy))
        };
        fr.crop = M.cropFor(cur, fr.w - fr.pad * 2, fr.h - fr.pad * 2, fr.focal);
      }
      paintCrop();
    };
    function endDrag() {
      if (!drag) return;
      drag = null;
      el.cropBox.classList.remove('dragging');
      paintZine();
    }
    el.cropBox.onpointerup = endDrag;
    el.cropBox.onpointercancel = endDrag;

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
      p.frames.forEach(function (f, fj) { if (f.photo === target) from = { pi: pj, fi: fj }; });
    });
    setPhotoAt(t.pi, t.fi, target);          // a cross-page frame takes both halves with it
    if (from) setPhotoAt(from.pi, from.fi, cur);
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
      savePhotos();
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
    toast(kind === 'pdf' ? '正在生成 PDF…' : '正在打包九张…');
    try {
      if (kind === 'pdf') {
        var bytes = await M.exportPDF(state.zine.pages, state.title);
        toast('PDF 已生成 · ' + Math.round(bytes / 1024) + ' KB');
      } else {
        var r = await M.exportZIP(state.zine.pages, state.title);
        openSaved(r);
      }
    } catch (err) {
      toast('导出失败：' + (err && err.message ? err.message : err));
    }
    state.busy = false;
  }

  /* the finished pages, so she can also save them one by one on a phone */
  function openSaved(result) {
    var pages = state.zine.pages;
    var urls = M.pageDataURLs(pages, 1);
    var base = (state.title || 'memento').replace(/[\/:*?"<>|\s]+/g, '_');
    el.savedTitle.textContent = '九张都在这里';
    el.savedNote.innerHTML = '已经下载：<b>' + result.name + '</b>（约 ' + Math.round(result.size / 1024) + ' KB，解压后 ' +
      pages.length + ' 张 ' + result.px + ' JPG）。<br>手机没有下载文件夹的话：点开任意一张 → 长按 → 存储图像。';
    el.savedGrid.innerHTML = '';
    urls.forEach(function (u, i) {
      var a = document.createElement('a');
      a.className = 'saved-item';
      a.href = u;
      a.download = base + '_' + String(i + 1).padStart(2, '0') + '.jpg';
      a.target = '_blank';
      a.rel = 'noopener';
      var im = document.createElement('img');
      im.src = u; im.alt = '第 ' + (i + 1) + ' 张';
      var n = document.createElement('span');
      n.textContent = String(i + 1).padStart(2, '0');
      a.appendChild(im); a.appendChild(n);
      el.savedGrid.appendChild(a);
    });
    el.saved.hidden = false;
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
    var b = e.target.closest('button[data-count]');
    if (!b) return;
    state.count = Number(b.dataset.count);
    state.locked = {};
    buildRail(); rebuild();
  });
  el.btnImport.onclick = el.btnPick.onclick = function () { el.file.click(); };
  el.file.onchange = function (e) { addFiles(e.target.files); el.file.value = ''; };
  el.btnDemo.onclick = loadDemo;
  el.btnPDF.onclick = function () { doExport('pdf'); };
  el.btnPNG.onclick = function () { doExport('png'); };
  el.btnShuffle.onclick = function () {
    state.seed = (state.seed * 7919 + 13) % 100000;
    /* 只换种子等于同一套构图重排照片；连方案一起轮换才看得出「换了一版」 */
    state.scheme = ((state.scheme || 0) + 1) % 3;
    buildRail();
    rebuild();
  };
  el.pickerClose.onclick = closePicker;
  el.savedClose.onclick = function () { el.saved.hidden = true; };
  el.saved.addEventListener('click', function (e) { if (e.target === el.saved) el.saved.hidden = true; });
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
  /* 手机上地址栏收放只改高度，却会触发 resize；旧代码每次都整页重排，
     重排瞬间内容高度归零 → 浏览器把滚动位置甩到最底。
     现在只在「宽度」真的变了（横竖屏、窗口缩放）才重排。 */
  var lastW = window.innerWidth, rzTimer;
  window.addEventListener('resize', function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () {
      if (!el.lightbox.hidden) { paintLightbox(); return; }
      var w = window.innerWidth;
      if (state.zine && Math.abs(w - lastW) > 2) { lastW = w; paintZine(); }
    }, 240);
  });

  var tTimer;
  el.title.oninput = function () {
    var t = textFor(state.direction);
    t.title = el.title.value.trim() || '未命名的一卷';
    state.title = t.title;
    clearTimeout(tTimer);
    tTimer = setTimeout(function () { saveText(); rebuild(); }, 260);
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
    var mp = qs.get('mode');
    if (mp && 'ABC'.indexOf(mp) >= 0) state.mode = mp;
    else if (mp === 'zine' || mp === 'grid' || mp === 'book') state.mode = 'C';   // old links
    if (qs.get('scheme')) state.scheme = parseInt(qs.get('scheme'), 10) || 0;
    if (qs.get('count')) state.count = parseInt(qs.get('count'), 10) === 11 ? 11 : 9;
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

  loadSavedDir();
  loadSavedText();
  state.title = textFor(state.direction).title;
  state.year = textFor(state.direction).year;
  el.title.value = state.title;
  buildRail();

  var saved = loadSavedPhotos();
  if (saved.length) {
    setStat('正在恢复上次的 ' + saved.length + ' 张…');
    (async function () {
      var stars = loadSavedStars();
      for (var i = 0; i < saved.length; i++) {
        var rec = await addUrl(saved[i].url, saved[i].name);
        if (rec && stars.indexOf(rec.name || '') >= 0) rec.starred = true;
      }
      buildTray(); rebuild();
    })();
  } else if (manifest) {
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
