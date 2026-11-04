/* App shell — one thing: a 作品集. Portrait pages that pair into spreads.
   Import, arrange, swap/crop/delete a photo, export nine images. */
(function () {
  'use strict';
  var M = window.MEM;

  var state = {
    photos: [], zine: null, seed: 11, mode: 'C', scheme: 0, count: 9,
    title: '十一月的海', year: new Date().getFullYear(), busy: false, locked: {},
    direction: 'zine', texts: {},
    library: [],          // every photo in the browser database
    coverPhoto: null
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
    textMemory: $('#textMemory'), textStyle: $('#textStyle'), textNoText: $('#textNoText'),
    aiBtn: $('#aiBtn'), aiAgain: $('#aiAgain'), aiStatus: $('#aiStatus'), aiIdeas: $('#aiIdeas'),
    aiSetup: $('#aiSetup'), aiModel: $('#aiModel'), aiBoth: $('#aiBoth'),
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
    toast: $('#toast'), saveState: $('#saveState'),
    versions: $('#versions'), verList: $('#verList'), verName: $('#verName'),
    verSave: $('#verSave'), verClose: $('#verClose'), verNote: $('#verNote'),
    btnVersion: $('#btnVersion'), btnLibrary: $('#btnLibrary'), btnPhotos: $('#btnPhotos'),
    photoLib: $('#photoLib'), plibGrid: $('#plibGrid'), plibNote: $('#plibNote'),
    plibCount: $('#plibCount'), plibFilter: $('#plibFilter'), plibClose: $('#plibClose'),
    plibAll: $('#plibAll'), plibNone: $('#plibNone'),
    library: $('#library'), libList: $('#libList'), libNote: $('#libNote'), libQuota: $('#libQuota'),
    libNew: $('#libNew'), libBackup: $('#libBackup'), libImport: $('#libImport'),
    libClose: $('#libClose'), backupInput: $('#backupInput'),
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
  /* ---------- text: content with provenance, layout stays in the engine ---------- */
  function docFor(dir) {
    if (!state.texts[dir] || !Array.isArray(state.texts[dir].items)) {
      state.texts[dir] = M.TEXT.ensure(state.texts[dir], dir);
    }
    return state.texts[dir];
  }
  /* what compose.js wants: { title, year, sections, lines } */
  function textFor(dir) { return M.TEXT.toEngine(docFor(dir), dir); }

  function saveText() {
    try { localStorage.setItem(LS_TEXT, JSON.stringify(state.texts)); } catch (e) {}
  }
  function loadSavedText() {
    try {
      var raw = localStorage.getItem(LS_TEXT);
      var obj = raw ? JSON.parse(raw) : null;
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function (k) {
        if (obj[k] && !Array.isArray(obj[k].items)) state.texts[k] = M.TEXT.fromLegacy(obj[k], k);
      });
    } catch (e) {}
  }

  function closeText() { el.textPanel.hidden = true; }

  function openText() {
    var doc = docFor(state.direction);
    var t = M.TEXT.toEngine(doc, state.direction);
    el.textTitle.value = t.title;
    el.textYear.value = t.year;
    el.textSections.value = M.TEXT.roleItems(doc, 'section').map(function (x) { return x.text; }).join('，');
    el.textLines.value = M.TEXT.roleItems(doc, 'caption').map(function (x) { return x.text; }).join('\n');
    if (el.textMemory) el.textMemory.value = doc.memory || '';
    if (el.textStyle) el.textStyle.value = doc.style || 'poetic';
    if (el.textNoText) el.textNoText.checked = !!doc.noText;
    el.textNote.textContent = isJp()
      ? '日式小书的语气是安静的：短句，少形容词，不解释。你自己写的字永远不会被 AI 覆盖。'
      : '杂志 Zine 的语气是冷静的旁白。你自己写的字永远不会被 AI 覆盖。';
    el.textPanel.hidden = false;
    renderAiStatus();
  }

  /* every keystroke in the panel is the user's own words */
  function applyTextField(role, index, value) {
    var doc = docFor(state.direction);
    M.TEXT.setText(doc, role, index, value, 'user');
    saveText();
    scheduleSave();
  }

  function adoptText() {
    var doc = docFor(state.direction);
    var title = el.textTitle.value.trim() || '未命名的一卷';
    var sections = el.textSections.value.replace(/[，；;]/g, ',').split(',')
      .map(function (s) { return s.trim(); }).filter(Boolean);
    var lines = el.textLines.value.split(String.fromCharCode(10))
      .map(function (s) { return s.trim(); }).filter(Boolean);

    applyTextField('title', 0, title);
    sections.forEach(function (s, i) { applyTextField('section', i, s); });
    lines.forEach(function (s, i) { applyTextField('caption', i, s); });
    if (el.textMemory) doc.memory = el.textMemory.value;
    if (el.textStyle) doc.style = el.textStyle.value;
    if (el.textNoText) doc.noText = el.textNoText.checked;

    state.title = title;
    state.year = parseInt(el.textYear.value, 10) || new Date().getFullYear();
    el.title.value = title;
    saveText();
    rebuild();
  }

  var textTimer;
  function onTextInput() {
    clearTimeout(textTimer);
    textTimer = setTimeout(adoptText, 280);
  }
  [el.textTitle, el.textYear, el.textSections, el.textLines, el.textMemory].forEach(function (node) {
    if (node) node.addEventListener('input', onTextInput);
  });
  if (el.textStyle) {
    el.textStyle.onchange = function () { adoptText(); renderAiStatus(); };
  }
  if (el.textNoText) {
    el.textNoText.onchange = function () { adoptText(); };
  }
  if (el.textStyle) {
    el.textStyle.innerHTML = '';
    M.TEXT.STYLES.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st.key; o.textContent = st.name + ' · ' + st.note;
      el.textStyle.appendChild(o);
    });
  }
  if (el.btnText) el.btnText.onclick = openText;
  if (el.textDone) el.textDone.onclick = function () { adoptText(); closeText(); };
  if (el.textClose) el.textClose.onclick = closeText;
  if (el.textReset) {
    el.textReset.onclick = function () {
      delete state.texts[state.direction];
      docFor(state.direction);
      saveText();
      openText();
      rebuild();
    };
  }
  if (el.textPanel) {
    el.textPanel.addEventListener('click', function (e) { if (e.target === el.textPanel) closeText(); });
  }

  /* ---------------- editorial assistant ---------------- */
  var lastIdeas = null;
  var aiBusy = false;

  async function renderAiStatus() {
    if (!el.aiStatus) return;
    var st = M.AI.provider.status();
    if (!st.checked) {
      el.aiStatus.textContent = '本地文字助手：检查中…';
      el.aiStatus.dataset.state = 'idle';
    } else {
      el.aiStatus.textContent = M.AI.provider.explain();
      el.aiStatus.dataset.state = st.ok ? 'ok' : 'off';
      if (el.aiModel) {
        el.aiModel.innerHTML = '';
        (st.models || []).forEach(function (m) {
          var o = document.createElement('option');
          o.value = m; o.textContent = m;
          if (m === M.AI.ollama.model()) o.selected = true;
          el.aiModel.appendChild(o);
        });
        el.aiModel.hidden = !(st.models || []).length;
      }
    }
    if (el.aiBtn) el.aiBtn.textContent = lastIdeas ? '再来一组灵感' : '为这组照片寻找文字灵感';
  }

  async function askIdeas() {
    if (aiBusy) return;
    if (!state.photos.length) { toast('先导入照片，才有得写'); return; }
    aiBusy = true;
    if (el.aiBtn) { el.aiBtn.disabled = true; el.aiBtn.textContent = '正在想…'; }
    if (el.aiStatus) { el.aiStatus.textContent = '正在生成三个方向…'; el.aiStatus.dataset.state = 'busy'; }
    try {
      var doc = docFor(state.direction);
      var res = await M.AI.editorial.generate({
        photos: state.photos,
        memory: doc.memory || '',
        userEdited: M.TEXT.summary(doc).userEdited,
        bookTitle: textFor(state.direction).title,
        style: doc.style || 'poetic'
      });
      lastIdeas = res;
      renderIdeas(res);
      await renderAiStatus();
      if (res.source === 'fallback') {
        el.aiStatus.textContent = '本地模型没连上，这是内置模板（可以照用，也可以改）';
        el.aiStatus.dataset.state = 'off';
      } else {
        var n = res.directions.length;
        var note = n < 3 ? '只有 ' + n + ' 个方向生成成功，可以再点一次' : n + ' 个方向';
        if (res.warnings && res.warnings.length) note += ' · ' + res.warnings[0];
        el.aiStatus.textContent = note;
        el.aiStatus.dataset.state = 'ok';
      }
    } catch (err) {
      var code = err && err.code;
      var msg = code === 'timeout' ? '模型超时了，可以再点一次'
        : code === 'model' ? '这个模型不存在，去 Ollama 里换一个'
        : code === 'offline' ? '连不上本地的 Ollama（见下面的启动说明）'
        : 'AI 出错了：' + (err && err.message ? err.message : err);
      el.aiStatus.textContent = msg + '（其它功能不受影响）';
      el.aiStatus.dataset.state = 'off';
    }
    aiBusy = false;
    if (el.aiBtn) { el.aiBtn.disabled = false; el.aiBtn.textContent = lastIdeas ? '再来一组灵感' : '为这组照片寻找文字灵感'; }
  }

  function renderIdeas(res) {
    if (!el.aiIdeas) return;
    el.aiIdeas.innerHTML = '';
    (res.directions || []).forEach(function (d, i) {
      var card = document.createElement('div');
      card.className = 'idea';
      var mood = (d.mood || []).map(function (m) { return '<span class="idea-mood">' + escapeHtml(m) + '</span>'; }).join('');
      var chapters = (d.chapterTitles || []).slice(0, 6).map(function (t) { return escapeHtml(t); }).join(' · ');
      var caps = (d.captions || []).slice(0, 4).map(function (c) {
        return '<li>' + escapeHtml(typeof c === 'string' ? c : c.text) + '</li>';
      }).join('');
      card.innerHTML =
        '<div class="idea-head"><span class="idea-no">' + (i + 1) + '</span>' +
        '<b class="idea-title">' + escapeHtml(d.title) + '</b></div>' +
        (d.subtitle ? '<p class="idea-sub">' + escapeHtml(d.subtitle) + '</p>' : '') +
        (d.concept ? '<p class="idea-concept">' + escapeHtml(d.concept) + '</p>' : '') +
        '<div class="idea-moods">' + mood + (d.textDensity ? '<span class="idea-mood">' + escapeHtml(d.textDensity) + '</span>' : '') + '</div>' +
        (chapters ? '<p class="idea-chapters">' + chapters + '</p>' : '') +
        (caps ? '<ul class="idea-caps">' + caps + '</ul>' : '');
      var take = document.createElement('button');
      take.className = 'btn btn-ghost btn-wide';
      take.textContent = '用这个方向';
      take.onclick = function () { adoptIdea(d); };
      card.appendChild(take);
      el.aiIdeas.appendChild(card);
    });
  }

  async function adoptIdea(d) {
    var dir = state.direction;
    var r = M.TEXT.adopt(docFor(dir), d, {});
    var both = el.aiBoth && el.aiBoth.checked;
    var otherName = '';
    if (both) {
      var other = dir === 'jp' ? 'zine' : 'jp';
      M.TEXT.adopt(docFor(other), d, {});
      otherName = other === 'jp' ? '日式小书' : '杂志 Zine';
    }
    saveText();
    rebuild();
    openText();
    var kept = r.kept ? '· 保留了你亲手写的 ' + r.kept + ' 处' : '';
    toast(both
      ? '两个方向都用上了「' + d.title + '」（另一个：' + otherName + '）' + kept
      : '用了「' + d.title + '」' + kept);
  }

  if (el.aiModel) {
    el.aiModel.onchange = function () {
      M.AI.ollama.setModel(el.aiModel.value);
      renderAiStatus();
    };
  }
  if (el.aiBtn) el.aiBtn.onclick = askIdeas;
  if (el.aiAgain) el.aiAgain.onclick = askIdeas;
  if (el.aiSetup) {
    el.aiSetup.onclick = async function () {
      var st = await M.AI.provider.check(true);
      await renderAiStatus();
      toast(st.ok ? '连上了：' + (M.AI.ollama.model() || '未选模型') : '还是连不上，检查 Ollama 是否在跑');
    };
  }
  M.AI.provider.check().then(renderAiStatus).catch(function () {});

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
  /* photos live in IndexedDB now; this only keeps the old key readable for migration */
  function savePhotos() { /* retired */ }

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
      ? '这本 ' + state.photos.length + ' 张（刷新也在）；点一张移出这本，可撤销'
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
        M.STORE.setStarred(photo.id, !!photo.starred).catch(function () {});
        buildTray(); rebuild();
      };
      wrap.appendChild(img); wrap.appendChild(star);
      el.tray.appendChild(wrap);
    });
  }

  /* ---------------- import (photo library → IndexedDB) ---------------- */
  function loadImage(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('图片打不开')); };
      img.src = url;
    });
  }

  /* a stored row → the record the engine and renderer already expect */
  function recordFromStored(s) {
    var url = M.OBJ.acquire(s.id, s.blob);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var a = s.analysis || {};
        res({
          id: s.id, name: s.name, url: url, img: img,
          w: s.width, h: s.height, ar: a.ar || (s.width / s.height),
          hero: a.hero == null ? 0.5 : a.hero,
          focal: a.focal || { x: 0.5, y: 0.5 },
          colors: a.colors || ['#8a8577', '#6d6a60', '#4a4841'],
          bright: a.bright == null ? 0.5 : a.bright,
          sat: a.sat == null ? 0.3 : a.sat,
          detail: a.detail == null ? 0.2 : a.detail,
          starred: !!s.starred
        });
      };
      img.onerror = function () { res(null); };
      img.src = url;
    });
  }

  /* File → analyzed, thumbnailed, written to IndexedDB */
  async function importFile(file) {
    var tmp = URL.createObjectURL(file);
    var img;
    try { img = await loadImage(tmp); }
    catch (e) { URL.revokeObjectURL(tmp); return null; }
    var id = M.STORE.uid('p');
    var rec = await M.analyze(img, { id: id, name: file.name.replace(/\.[^.]+$/, ''), url: tmp });
    // two tiers, both WebP: 2000 for the editor, 400 for walls. The 2560 "large"
    // is generated at export time, so nothing twice the size sits on disk.
    var preview = await M.toBlobType(img, 2000, 'image/webp', 0.85);
    var thumb = await M.toBlobType(img, 400, 'image/webp', 0.75);
    var stored = {
      id: id,
      name: rec.name || file.name,
      mimeType: file.type || 'image/jpeg',
      fileSize: file.size || 0,
      width: preview.w, height: preview.h,
      createdAt: file.lastModified || Date.now(),
      importedAt: Date.now(),
      starred: false,
      blob: preview.blob,
      thumbnail: thumb.blob,
      format: preview.format,
      bytes: { preview: preview.kb, thumb: thumb.kb },
      original: null,                 // free tier: the original stays on the user's device
      storedScale: preview.scale,
      analysis: {
        ar: rec.ar, hero: rec.hero, focal: rec.focal, colors: rec.colors,
        bright: rec.bright, sat: rec.sat, detail: rec.detail
      }
    };
    await M.STORE.putPhoto(stored);
    URL.revokeObjectURL(tmp);
    return recordFromStored(stored);
  }

  function noteImported(rec) {
    if (!rec) return;
    state.photos.push(rec);
    var known = state.library.some(function (p) { return p.id === rec.id; });
    if (!known) state.library.push(rec);
  }

  var askedPersist = false;
  async function askPersist() {
    if (askedPersist) return;
    askedPersist = true;
    try {
      var ok = await M.STORE.persist();
      if (ok) toast('已申请长期保存：系统不会随手清掉这些照片');
      else await M.STORE.setPref('persistDenied', Date.now());
    } catch (e) {}
  }

  async function addFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) return;
    await ensureProject();
    await askPersist();
    setStat('正在读 ' + list.length + ' 张…');
    var failed = 0, done = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        var rec = await importFile(list[i]);
        if (rec) { noteImported(rec); done++; } else failed++;
      } catch (e) { failed++; }
      if (i % 3 === 2) setStat('正在读 ' + (i + 1) + ' / ' + list.length + '…');
    }
    buildTray(); rebuild();
    state.coverPhoto = null;
    if (failed) toast(failed + ' 张没存进去（HEIC 等浏览器解不了的格式，先转 JPG）');
    else if (done) toast('已存进本机 · ' + done + ' 张');
  }

  /* sample photos / url lists still go through the same door */
  async function loadList(list, label) {
    await ensureProject();
    var ok = 0;
    for (var j = 0; j < list.length; j++) {
      setStat('正在载入 ' + (j + 1) + ' / ' + list.length + '…');
      try {
        var r = await fetch(list[j].url);
        var blob = await r.blob();
        var name = (list[j].name || ('图 ' + (j + 1))) + '.jpg';
        var rec = await importFile(new File([blob], name, { type: blob.type || 'image/jpeg' }));
        if (rec) { noteImported(rec); ok++; }
      } catch (e) { /* skip */ }
    }
    if (!ok) { toast((label || '照片') + '载不进来'); setStat('还没有照片'); return; }
    buildTray(); rebuild();
  }

  function loadDemo() {
    var names = [];
    for (var i = 1; i <= 16; i++) names.push({ url: 'assets/demo/p' + i + '.jpg', name: '示例 ' + i });
    return loadList(names, '示例');
  }

  /* ---------------- the project (one book) ---------------- */
  var project = null;
  var saveTimer = null, saveSeq = 0, lastSavedAt = 0, saveFailing = false;

  function setSaveState(st, text) {
    if (!el.saveState) return;
    el.saveState.dataset.state = st;
    el.saveState.textContent = text || '';
  }

  async function ensureProject() {
    if (project) return project;
    var last = await M.STORE.getPref('lastProjectId');
    project = last ? await M.STORE.getProject(last) : null;
    if (!project) {
      project = await M.STORE.createProject({
        title: state.title || '未命名的一卷',
        designDirection: state.direction,
        settings: { mode: state.mode, scheme: state.scheme, count: state.count, seed: state.seed, locked: {}, photoIds: [] },
        texts: state.texts
      });
      await M.STORE.setPref('lastProjectId', project.id);
    }
    return project;
  }

  function slimPage(pg) {
    return {
      w: pg.w, h: pg.h, bg: pg.bg, ink: pg.ink, muted: pg.muted,
      frames: (pg.frames || []).map(function (f) {
        return {
          p: f.photo && f.photo.id, x: f.x, y: f.y, w: f.w, h: f.h,
          pad: f.pad, role: f.role, z: f.z, crop: f.crop
        };
      }),
      rects: (pg.rects || []).map(function (r) {
        return { x: r.x, y: r.y, w: r.w, h: r.h, color: r.color };
      }),
      texts: (pg.texts || []).map(function (t) {
        return {
          x: t.x, y: t.y, w: t.w, lines: t.lines || [], size: t.size, family: t.family,
          weight: t.weight, color: t.color, align: t.align, tracking: t.tracking,
          lineHeight: t.lineHeight, opacity: t.opacity
        };
      })
    };
  }

  function snapshot() {
    var z = state.zine;
    return {
      schemaVersion: 1,
      direction: state.direction,
      mode: state.mode, scheme: state.scheme, count: state.count, seed: state.seed,
      locked: JSON.parse(JSON.stringify(state.locked || {})),
      texts: JSON.parse(JSON.stringify(state.texts || {})),
      photoIds: state.photos.map(function (p) { return p.id; }),
      coverId: z && z.cover ? z.cover.id : null,
      coverPhotoId: z && z.cover ? z.cover.id : null,
      total: z ? z.total : state.photos.length,
      pair: z ? !!z.pair : false,
      units: z ? z.units.map(function (u) {
        return { key: u.key, start: u.startIndex, n: u.pages.length };
      }) : [],
      pages: z ? z.pages.map(slimPage) : []
    };
  }

  /* ids this version used: trust the list, but fall back to what the pages
     actually reference — a version restored from an older build may lack it */
  function versionPhotoIds(snap) {
    var ids = (snap.photoIds || []).slice();
    if (!ids.length) {
      var seen = {};
      (snap.pages || []).forEach(function (pg) {
        (pg.frames || []).forEach(function (f) {
          if (f.p && !seen[f.p]) { seen[f.p] = 1; ids.push(f.p); }
        });
      });
    }
    return ids;
  }

  function hydratePages(slim) {
    var byId = {};
    state.photos.forEach(function (p) { byId[p.id] = p; });
    return (slim || []).map(function (sp) {
      return {
        w: sp.w, h: sp.h, bg: sp.bg, ink: sp.ink, muted: sp.muted,
        frames: (sp.frames || []).map(function (f) {
          return {
            photo: byId[f.p] || null, x: f.x, y: f.y, w: f.w, h: f.h,
            pad: f.pad, role: f.role, z: f.z, crop: f.crop
          };
        }).filter(function (f) { return f.photo; }),
        rects: (sp.rects || []).slice(),
        texts: (sp.texts || []).map(function (t) {
          var o = {};
          Object.keys(t).forEach(function (k) { o[k] = t[k]; });
          o.lines = (t.lines || []).slice();
          return o;
        })
      };
    });
  }

  /* ---------------- autosave ---------------- */
  function scheduleSave() {
    if (!project) return;
    setSaveState('pending', '保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { flushSave(); }, 650);
  }

  function flushSave() {
    if (!project) return Promise.resolve(false);
    clearTimeout(saveTimer);
    if (!state.photos.length && !state.zine) { setSaveState('idle', ''); return Promise.resolve(false); }
    var snap = snapshot();
    var mySeq = ++saveSeq;
    setSaveState('saving', '保存中…');
    return M.STORE.saveDraft(project.id, snap)
      .then(function (v) {
        return M.STORE.updateProject(project.id, {
          title: state.title, designDirection: state.direction,
          coverPhotoId: snap.coverPhotoId, texts: state.texts,
          settings: {
            mode: state.mode, scheme: state.scheme, count: state.count,
            seed: state.seed, locked: state.locked, photoIds: snap.photoIds
          },
          currentVersionId: v.id
        });
      })
      .then(function () {
        if (mySeq !== saveSeq) return;
        saveFailing = false;
        lastSavedAt = Date.now();
        var d = new Date(lastSavedAt);
        setSaveState('saved', '已保存 ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2));
      })
      .catch(function (err) {
        if (mySeq !== saveSeq) return;
        saveFailing = true;
        setSaveState('error', '保存失败 ⟳');
        if (el.saveState) el.saveState.title = '点一下重试：' + (err && err.message ? err.message : err);
        toast('没保存上：' + (err && err.message ? err.message : err));
      });
  }

  /* ---------------- save as a new version ---------------- */
  async function saveNewVersion(desc) {
    if (!project) await ensureProject();
    await flushSave();
    var v = await M.STORE.saveVersion(project.id, snapshot(), desc || '', {});
    await M.STORE.updateProject(project.id, { currentVersionId: v.id });
    toast('已保存 v' + v.versionNumber);
    return v;
  }

  /* ---------------- restore ---------------- */
  async function applySnapshot(snap, opt) {
    opt = opt || {};
    if (!snap || !snap.pages) throw new Error('版本是空的');
    state.direction = snap.direction || 'zine';
    state.mode = snap.mode || 'C';
    state.scheme = snap.scheme || 0;
    state.count = snap.count || 9;
    state.seed = snap.seed || 11;
    state.locked = JSON.parse(JSON.stringify(snap.locked || {}));
    state.texts = JSON.parse(JSON.stringify(snap.texts || {}));

    // photos: keep the library records this version used, in order
    var byId = {};
    state.library.forEach(function (p) { byId[p.id] = p; });
    var ids = versionPhotoIds(snap);
    var missing = ids.filter(function (id) { return !byId[id]; });
    if (missing.length) {
      for (var mi = 0; mi < missing.length; mi++) {
        var row = await M.STORE.getPhoto(missing[mi]);
        var rec = row ? await recordFromStored(row) : null;
        if (rec) { byId[rec.id] = rec; state.library.push(rec); }
      }
    }
    state.photos = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!state.photos.length) {
      BOOT.push('restore had 0 usable photos of ' + ids.length);
    }

    var pages = hydratePages(snap.pages);
    var units = (snap.units || []).map(function (u) {
      return { key: u.key, startIndex: u.start, pages: pages.slice(u.start, u.start + u.n) };
    });
    state.zine = {
      pages: pages, units: units, pair: !!snap.pair,
      total: snap.total || state.photos.length,
      cover: byId[snap.coverId] || null,
      mode: state.mode, scheme: state.scheme
    };
    state.title = (state.texts[state.direction] && state.texts[state.direction].title) || state.title;
    if (el.title) el.title.value = state.title;
    buildRail(); buildTray(); paintZine();
    if (!opt.quiet) toast('已恢复');
  }

  /* ---------------- render ---------------- */
  function setStat(t) { el.stat.textContent = t; }

  function rebuild() {
    if (!state.photos.length) {
      el.zinePanel.hidden = true; el.empty.hidden = false;
      el.btnPNG.disabled = true; el.btnPDF.disabled = true; el.btnShuffle.disabled = true;
      if (el.btnVersion) el.btnVersion.disabled = true;
      return;
    }
    el.empty.hidden = true;
    el.zinePanel.hidden = false;
    el.btnPNG.disabled = false; el.btnPDF.disabled = false; el.btnShuffle.disabled = false;
    if (el.btnVersion) el.btnVersion.disabled = false;

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
    if (!z || !z.pages.length) {
      el.zinePanel.hidden = true;
      el.empty.hidden = false;
      return;
    }
    el.zinePanel.hidden = false;
    el.empty.hidden = true;
    el.zineList.innerHTML = '';
    var stageW = (el.zineList.clientWidth || 1000) - 56;   // leave room for the lock tools beside the pages
    var pair = z.pair;
    // fill the window, not a fixed 500px: on a big screen the pages should be big
    var availH = Math.max(360, Math.min((window.innerHeight || 900) - 210, 900));
    var maxH = Math.min(availH, isJp() ? 780 : 720);
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

    scheduleSave();
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

  async function deletePhoto(photo) {
    var idx = state.photos.indexOf(photo);
    if (idx < 0) return;
    state.photos.splice(idx, 1);
    closePicker();
    buildTray();
    rebuild();
    toastUndo('从这本里移出 1 张 · 还剩 ' + state.photos.length + ' 张（照片还在库里）', function () {
      state.photos.splice(idx, 0, photo);
      buildTray();
      rebuild();
    });
    scheduleSave();
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

  /* ---------------- version history ---------------- */
  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getMonth() + 1 + '月' + d.getDate() + '日 ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  async function openVersions() {
    if (!project) await ensureProject();
    el.versions.hidden = false;
    el.verName.value = '';
    await renderVersions();
  }
  function closeVersions() { el.versions.hidden = true; }

  async function renderVersions() {
    var list = await M.STORE.listVersions(project.id);
    var manual = list.filter(function (v) { return !v.isAutoSaved; });
    var draft = list.filter(function (v) { return v.isAutoSaved; })[0];
    el.verList.innerHTML = '';

    if (draft) {
      var row = document.createElement('div');
      row.className = 'ver-row is-current';
      row.innerHTML = '<span class="ver-no">草稿</span><div class="ver-meta">' +
        '<p class="ver-desc">当前正在编辑的版本（自动保存）</p>' +
        '<span class="ver-sub">' + fmtTime(draft.createdAt) + ' · ' +
        (draft.snapshot && draft.snapshot.pages ? draft.snapshot.pages.length : 0) + ' 页</span></div>';
      el.verList.appendChild(row);
    }

    if (!manual.length) {
      var empty = document.createElement('p');
      empty.className = 'ver-sub';
      empty.style.padding = '18px 0';
      empty.textContent = '还没有保存过版本。上面留个名字，点「保存为新版本」，现在的样子就会被留住。';
      el.verList.appendChild(empty);
      return;
    }

    manual.forEach(function (v) {
      var row = document.createElement('div');
      row.className = 'ver-row' + (v.id === project.currentVersionId ? ' is-current' : '');
      var snap = v.snapshot || {};
      var dirName = snap.direction === 'jp' ? '日式小书' : '杂志 Zine';
      var box = document.createElement('div');
      box.className = 'ver-meta';
      box.innerHTML = '<p class="ver-desc">' + (v.description ? escapeHtml(v.description) : '未命名') + '</p>' +
        '<span class="ver-sub">' + fmtTime(v.createdAt) + ' · ' + (snap.pages ? snap.pages.length : 0) +
        ' 页 · ' + dirName + '</span>';
      var no = document.createElement('span');
      no.className = 'ver-no';
      no.textContent = 'v' + v.versionNumber;
      var restore = document.createElement('button');
      restore.className = 'btn btn-ghost';
      restore.textContent = '恢复';
      restore.onclick = function () { restoreVersion(v); };
      var del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.textContent = '删';
      del.title = '删掉这一版';
      del.onclick = async function () {
        await M.STORE.deleteVersion(v.id);
        renderVersions();
      };
      row.appendChild(no); row.appendChild(box); row.appendChild(restore); row.appendChild(del);
      el.verList.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  async function restoreVersion(v) {
    try {
      BOOT.push('restore v' + v.versionNumber + ' snapshot=' + (v.snapshot ? 'yes' : 'no') +
        ' ids=' + (v.snapshot && v.snapshot.photoIds ? v.snapshot.photoIds.length : 'none') +
        ' pages=' + (v.snapshot && v.snapshot.pages ? v.snapshot.pages.length : 'none'));
      await applySnapshot(v.snapshot, { quiet: true });
      await flushSave();                        // the restored state becomes the draft
      await M.STORE.updateProject(project.id, { currentVersionId: v.id });
      toast('已恢复到 v' + v.versionNumber + '，可以继续改');
      closeVersions();
    } catch (e) {
      toast('恢复失败：' + (e && e.message ? e.message : e));
    }
  }

  async function newVersionFromUI() {
    var name = (el.verName.value || '').trim();
    try {
      await saveNewVersion(name || ('v' + (Date.now() % 10000)));
      el.verName.value = '';
      await renderVersions();
      toast('已保存' + (name ? '：' + name : ''));
    } catch (e) {
      toast('保存版本失败：' + (e && e.message ? e.message : e));
    }
  }

  el.verClose.onclick = closeVersions;
  el.verSave.onclick = newVersionFromUI;
  el.versions.addEventListener('click', function (e) { if (e.target === el.versions) closeVersions(); });
  el.btnVersion.onclick = function () { openVersions(); };

  /* ---------------- project library ---------------- */
  async function showQuota() {
    var e = await M.STORE.estimate();
    if (!e || !el.libQuota) return;
    var saved = await M.STORE.persisted();
    el.libQuota.textContent = '已用 ' + (e.usage / 1048576).toFixed(1) + ' MB' +
      (e.quota ? ' / 可用 ' + Math.round(e.quota / 1073741824 * 10) / 10 + ' GB' : '') +
      (saved ? ' · 长期保存已开启' : ' · 未开启长期保存（可能被系统清理）');
    var warn = document.querySelector('#quotaWarn');
    if (warn) {
      if (e.pct > 0.8) {
        warn.hidden = false;
        warn.textContent = '本地空间快满了（已用 ' + Math.round(e.pct * 100) + '%）。' +
          (saved ? '' : '建议先点「导出全部备份」，再删掉不用的照片。');
      } else if (!saved && e.usage > 200 * 1048576) {
        warn.hidden = false;
        warn.textContent = '浏览器随时可能清理本地数据，建议导出备份。';
      } else {
        warn.hidden = true;
      }
    }
  }

  async function openLibrary() {
    el.library.hidden = false;
    await renderLibrary();
    showQuota();
  }
  function closeLibrary() { el.library.hidden = true; }

  async function renderLibrary() {
    var list = await M.STORE.listProjects();
    var covers = {};
    el.libList.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      var pr = list[i];
      var versions = await M.STORE.listVersions(pr.id);
      var draft = versions.filter(function (v) { return v.isAutoSaved; })[0];
      var snap = (draft && draft.snapshot) || (versions[0] && versions[0].snapshot) || {};
      var pages = (snap.pages || []).length;

      var row = document.createElement('div');
      row.className = 'lib-row' + (project && pr.id === project.id ? ' is-open' : '');

      var cover = document.createElement('div');
      cover.className = 'lib-cover';
      var coverId = pr.coverPhotoId || snap.coverId;
      if (coverId && !covers[coverId]) {
        var ph = state.library.filter(function (p) { return p.id === coverId; })[0];
        covers[coverId] = ph ? ph.url : null;
      }
      if (coverId && covers[coverId]) {
        var im = document.createElement('img');
        im.src = covers[coverId]; im.alt = '';
        cover.appendChild(im);
      }
      row.appendChild(cover);

      var meta = document.createElement('div');
      meta.className = 'lib-meta';
      meta.innerHTML = '<p class="lib-title">' + escapeHtml(pr.title || '未命名') + '</p>' +
        '<span class="lib-sub">' + pages + ' 页 · ' +
        (pr.designDirection === 'jp' ? '日式小书' : '杂志 Zine') + ' · ' +
        fmtTime(pr.updatedAt || pr.createdAt) + ' · ' + versions.length + ' 个版本</span>';
      row.appendChild(meta);

      var open = document.createElement('button');
      open.className = 'btn btn-ghost';
      open.textContent = '打开';
      open.onclick = (function (id) { return function () { switchProject(id); }; })(pr.id);
      var ren = document.createElement('button');
      ren.className = 'btn btn-ghost';
      ren.textContent = '改名';
      ren.onclick = (function (p2) { return function () { renameProject(p2); }; })(pr);
      var dup = document.createElement('button');
      dup.className = 'btn btn-ghost';
      dup.textContent = '复制';
      dup.onclick = (function (p2) { return function () { copyProject(p2); }; })(pr);
      var del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.textContent = '删';
      del.onclick = (function (p2) { return function () { removeProject(p2); }; })(pr);

      var acts = document.createElement('div');
      acts.className = 'lib-acts';
      acts.appendChild(open); acts.appendChild(ren); acts.appendChild(dup); acts.appendChild(del);
      row.appendChild(acts);
      el.libList.appendChild(row);
    }
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'lib-sub';
      empty.style.padding = '18px 0';
      empty.textContent = '还没有作品。点「＋ 新建作品」，然后导入照片。';
      el.libList.appendChild(empty);
    }
  }

  async function switchProject(id) {
    await flushSave();
    var pr = await M.STORE.getProject(id);
    if (!pr) { toast('这本作品不在了'); return; }
    project = pr;
    await M.STORE.setPref('lastProjectId', id);
    state.texts = pr.texts && Object.keys(pr.texts).length ? JSON.parse(JSON.stringify(pr.texts)) : {};
    state.direction = pr.designDirection || 'zine';
    var versions = await M.STORE.listVersions(id);
    var draft = versions.filter(function (v) { return v.isAutoSaved; })[0];
    if (draft && draft.snapshot && (draft.snapshot.pages || []).length) {
      await applySnapshot(draft.snapshot, { quiet: true });
    } else {
      state.photos = state.library.filter(function (p) {
        return ((pr.settings || {}).photoIds || []).indexOf(p.id) >= 0;
      });
      buildRail(); buildTray(); rebuild();
    }
    setSaveState('saved', '已保存');
    closeLibrary();
    toast('打开：' + (pr.title || '未命名'));
  }

  async function newProject() {
    await flushSave();
    var pr = await M.STORE.createProject({
      title: '未命名的一卷',
      designDirection: state.direction,
      settings: { mode: state.mode, scheme: state.scheme, count: state.count, seed: state.seed, locked: {}, photoIds: [] },
      texts: {}
    });
    project = pr;
    await M.STORE.setPref('lastProjectId', pr.id);
    state.photos = [];
    state.zine = null;
    buildTray();
    el.zinePanel.hidden = true; el.empty.hidden = false;
    closeLibrary();
    toast('新建了一本，导入照片开始排');
  }

  async function renameProject(pr) {
    var name = prompt('作品名称', pr.title || '未命名的一卷');
    if (name == null) return;
    await M.STORE.updateProject(pr.id, { title: name.trim() || '未命名的一卷' });
    if (project && project.id === pr.id) project = await M.STORE.getProject(pr.id);
    renderLibrary();
  }

  async function copyProject(pr) {
    var copy = await M.STORE.duplicateProject(pr.id);
    renderLibrary();
    toast('复制成「' + copy.title + '」');
  }

  async function removeProject(pr) {
    if (!confirm('删掉作品「' + (pr.title || '未命名') + '」？照片不会删，还在库里。')) return;
    await M.STORE.deleteProject(pr.id);
    if (project && project.id === pr.id) {
      var rest = await M.STORE.listProjects();
      if (rest.length) await switchProject(rest[0].id);
      else await newProject();
    } else {
      renderLibrary();
    }
    toast('已删除作品（照片还在）');
  }

  async function exportBackup(projectId) {
    try {
      var r = projectId ? await M.BACKUP.exportProject(projectId) : await M.BACKUP.exportAll();
      var a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob);
      a.download = r.name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 8000);
      toast('备份已生成：' + r.name + ' · ' + r.projects + ' 本 / ' + r.photos + ' 张照片');
    } catch (e) {
      toast('备份失败：' + (e && e.message ? e.message : e));
    }
  }

  el.libBackup.onclick = function () { exportBackup(null); };
  el.libImport.onclick = function () { el.backupInput.click(); };
  el.backupInput.onchange = async function (e) {
    var f = e.target.files && e.target.files[0];
    el.backupInput.value = '';
    if (!f) return;
    toast('正在检查备份…');
    try {
      var plan = await M.BACKUP.inspect(f);
      var ok = confirm('备份里有 ' + plan.projects.length + ' 本作品、' + plan.photoIds.length + ' 张照片。' +
        (plan.missingPhotos.length ? ' 缺 ' + plan.missingPhotos.length + ' 张，会取消导入。' : '') +
        ' 导入会新增作品，不会覆盖现有的。继续？');
      if (!ok) return;
      var w = await M.BACKUP.import(plan);
      await loadLibrary();
      await renderLibrary();
      toast('导入完成：' + w.projects + ' 本 / ' + w.photos + ' 张照片 / ' + w.versions + ' 个版本');
    } catch (err) {
      toast('导入取消：' + (err && err.message ? err.message : err));
    }
  };

  el.btnLibrary.onclick = openLibrary;
  el.libClose.onclick = closeLibrary;
  el.libNew.onclick = newProject;
  el.library.addEventListener('click', function (e) { if (e.target === el.library) closeLibrary(); });

  /* ---------------- photo library (the whole shelf) ---------------- */
  var plibFilter = 'all';

  async function openPhotoLibrary() {
    el.photoLib.hidden = false;
    await renderPhotoLibrary();
  }
  function closePhotoLibrary() { el.photoLib.hidden = true; }

  var pickTimer = null;
  function pickChanged() {
    buildTray();
    clearTimeout(pickTimer);
    pickTimer = setTimeout(function () { rebuild(); scheduleSave(); }, 180);
  }

  function toggleInBook(p) {
    var i = state.photos.indexOf(p);
    if (i >= 0) state.photos.splice(i, 1);
    else state.photos.push(p);
    pickChanged();
    renderPhotoLibrary();
    toast(i >= 0 ? '从这本里移出（照片还在库里）' : '加到这本了 · 这本现在 ' + state.photos.length + ' 张');
  }

  async function renderPhotoLibrary() {
    var all = state.library;
    var inBook = {};
    state.photos.forEach(function (p) { inBook[p.id] = 1; });

    // how many books reference each photo (from their versions)
    var books = {};
    var projects = await M.STORE.listProjects();
    for (var i = 0; i < projects.length; i++) {
      var vs = await M.STORE.listVersions(projects[i].id);
      var draft = vs.filter(function (v) { return v.isAutoSaved; })[0];
      var snap = draft && draft.snapshot;
      if (!snap) continue;
      (snap.photoIds || []).forEach(function (id) { books[id] = (books[id] || 0) + 1; });
    }

    var list = all.slice();
    if (plibFilter === 'in') list = list.filter(function (p) { return inBook[p.id]; });
    if (plibFilter === 'out') list = list.filter(function (p) { return !inBook[p.id]; });
    if (plibFilter === 'star') list = list.filter(function (p) { return p.starred; });
    list.sort(function (a, b) { return (b.importedAt || 0) - (a.importedAt || 0); });

    Array.prototype.forEach.call(el.plibFilter.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === plibFilter));
    });

    var e = await M.STORE.estimate();
    var stored = all.reduce(function (a, p) {
      return a + ((p.bytes && (p.bytes.preview + p.bytes.thumb)) || 0);
    }, 0);
    var bits = ['这本 ' + state.photos.length + ' 张'];
    bits.push('库里共 ' + all.length + ' 张');
    var starred = all.filter(function (p) { return p.starred; }).length;
    if (starred) bits.push(starred + ' 张收藏');
    if (stored) bits.push('这套 ' + (stored / 1024).toFixed(1) + ' MB');
    if (e) bits.push('本机已用 ' + (e.usage / 1048576).toFixed(1) + ' MB' +
      (e.quota ? ' / 可用 ' + (e.quota / 1073741824).toFixed(1) + ' GB' : ''));
    el.plibCount.textContent = bits.join(' · ');

    var scroll = el.plibGrid.scrollTop;
    el.plibGrid.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'lib-sub';
      empty.style.gridColumn = '1/-1';
      empty.textContent = plibFilter === 'out' ? '每一张都在这本里了。' :
        plibFilter === 'in' ? '这本还没有照片，点下面的图把照片加进来。' : '这里还没有照片。';
      el.plibGrid.appendChild(empty);
      return;
    }

    list.forEach(function (p) {
      var isIn = !!inBook[p.id];
      var box = document.createElement('div');
      box.className = 'plib-item ' + (isIn ? 'is-in' : 'is-out');
      box.title = isIn ? '在这本里（点一下移出）' : '不在这本（点一下加进来）';

      var im = document.createElement('img');
      im.src = p.url; im.alt = p.name || '';
      im.loading = 'lazy';
      box.appendChild(im);

      var star = document.createElement('span');
      star.className = 'plib-star';
      star.textContent = p.starred ? '★' : '☆';
      star.title = p.starred ? '取消收藏' : '收藏（★ 优先当主视觉）';
      star.onclick = async function (ev) {
        ev.stopPropagation();
        p.starred = !p.starred;
        await M.STORE.setStarred(p.id, p.starred);
        if (state.photos.indexOf(p) >= 0) rebuild();
        renderPhotoLibrary();
      };
      box.appendChild(star);

      var n = books[p.id] || 0;
      var tag = document.createElement('span');
      tag.className = 'plib-used';
      tag.textContent = n ? n + ' 本' : '未用';
      box.appendChild(tag);

      var pick = document.createElement('span');
      pick.className = 'plib-pick';
      pick.textContent = isIn ? '✓' : '+';
      box.appendChild(pick);

      box.onclick = function () { toggleInBook(p); };

      var del = document.createElement('span');
      del.className = 'plib-del';
      del.textContent = '✕';
      del.title = '从照片库彻底删除';
      del.onclick = function (ev) { ev.stopPropagation(); deleteFromLibrary(p, books[p.id] || 0); };
      box.appendChild(del);

      el.plibGrid.appendChild(box);
    });
    el.plibGrid.scrollTop = scroll;
  }

  async function deleteFromLibrary(p, bookCount) {
    var inThisBook = state.photos.indexOf(p) >= 0;
    var msg = '从照片库里彻底删掉这张？';
    if (bookCount) msg = '这 张 还 在 ' + bookCount + ' 本作品里用着。删掉后那些作品会缺一张图。确定要删？';
    else if (inThisBook) msg = '这张正在这本里用着，删掉会从书里拿掉。确定要删？';
    if (!confirm(msg)) return;

    // pull it out of the open book first so the render no longer points at it
    var idx = state.photos.indexOf(p);
    if (idx >= 0) state.photos.splice(idx, 1);

    await M.STORE.deletePhoto(p.id);
    var li = state.library.indexOf(p);
    if (li >= 0) state.library.splice(li, 1);
    M.OBJ.release(p.id);
    p.img = null;

    buildTray();
    if (state.photos.length) rebuild();
    else { state.zine = null; el.zinePanel.hidden = true; el.empty.hidden = false; buildTray(); }
    scheduleSave();
    await renderPhotoLibrary();
    toast('已从照片库删除（作品里引用它的那一格会空出来）');
  }

  el.btnPhotos.onclick = openPhotoLibrary;
  if (el.btnPickPhotos) el.btnPickPhotos.onclick = function () { plibFilter = 'out'; openPhotoLibrary(); };
  el.plibClose.onclick = closePhotoLibrary;
  el.photoLib.addEventListener('click', function (e) { if (e.target === el.photoLib) closePhotoLibrary(); });
  if (el.plibAll) el.plibAll.onclick = function () {
    state.photos = state.library.slice();
    pickChanged();
    renderPhotoLibrary();
    toast('这本用上了全部 ' + state.photos.length + ' 张');
  };
  if (el.plibNone) el.plibNone.onclick = function () {
    state.photos = [];
    pickChanged();
    renderPhotoLibrary();
    toast('这本清空了（照片还在库里）');
  };
  el.plibFilter.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-filter]');
    if (!b) return;
    plibFilter = b.dataset.filter;
    renderPhotoLibrary();
  });

  /* ---------------- boot ---------------- */
  async function loadLibrary() {
    var rows = await M.STORE.getAllPhotos();
    var recs = [];
    for (var i = 0; i < rows.length; i++) {
      var r = await recordFromStored(rows[i]);
      if (r) recs.push(r);
    }
    state.library = recs;
    return recs;
  }

  /* the old localStorage photos: blob: urls cannot be restored, and we say so */
  async function migrateOnce() {
    var already = await M.STORE.getPref('migratedV1');
    if (already) return null;
    var report = { stars: 0, dead: 0 };
    var oldList = loadSavedPhotos();
    oldList.forEach(function (o) { if (/^blob:/.test(o.url || '')) report.dead++; });
    var stars = loadSavedStars();
    if (stars.length && state.library.length) {
      for (var i = 0; i < state.library.length; i++) {
        var p = state.library[i];
        if (stars.indexOf(p.name) >= 0 && !p.starred) {
          p.starred = true;
          report.stars++;
          var row = await M.STORE.getPhoto(p.id);
          if (row) { row.starred = true; await M.STORE.putPhoto(row); }
        }
      }
    }
    await M.STORE.setPref('migratedV1', Date.now());
    return report;
  }

  var BOOT = [];
  window.__bootLog = BOOT;
  async function restoreSession() {
    BOOT.push('start');
    await ensureProject();
    BOOT.push('project');
    loadSavedDir();
    loadSavedText();
    state.direction = project.designDirection || state.direction;
    if (project.texts && Object.keys(project.texts).length) {
      state.texts = JSON.parse(JSON.stringify(project.texts));
    }
    state.title = textFor(state.direction).title;
    state.year = textFor(state.direction).year;
    if (el.title) el.title.value = state.title;

    await loadLibrary();
    BOOT.push('library=' + state.library.length);
    var report = await migrateOnce();

    var versions = await M.STORE.listVersions(project.id);
    var draft = versions.filter(function (v) { return v.isAutoSaved; })[0];
    var hasDraft = draft && draft.snapshot && draft.snapshot.pages && draft.snapshot.pages.length;

    BOOT.push('versions=' + versions.length + ' draft=' + (hasDraft ? 1 : 0));
    if (hasDraft) {
      await applySnapshot(draft.snapshot, { quiet: true });
      BOOT.push('draft applied frames=' + state.zine.pages.reduce(function (a, p) { return a + p.frames.length; }, 0));
      setSaveState('saved', '已恢复上次编辑');
    } else if (state.library.length) {
      BOOT.push('from library');
      state.photos = state.library.slice();
      state.coverPhoto = null;
      buildRail(); buildTray(); rebuild();
    }

    if (report) {
      var bits = [];
      if (report.stars) bits.push('★ ' + report.stars + ' 张');
      if (report.dead) bits.push(report.dead + ' 张上次上传的照片已失效，需要重新拖进来');
      if (bits.length) setTimeout(function () { toast('旧数据迁移：' + bits.join(' · ')); }, 1200);
    }

    BOOT.push('photos=' + state.photos.length +
      ' frames=' + (state.zine ? state.zine.pages.reduce(function (a, p) { return a + p.frames.length; }, 0) : 0) +
      ' manifest=' + (manifest || '-'));
    if (!state.photos.length) {
      if (manifest) {
        BOOT.push('importing manifest');
        fetch(manifest).then(function (r) { return r.json(); })
          .then(function (list) { return loadList(list, '照片'); })
          .catch(function () { hideDemo(); });
      } else {
        fetch('assets/demo/p1.jpg', { method: 'HEAD' }).then(function (r) {
          if (r.ok && !state.photos.length) loadDemo();
          else if (!r.ok) hideDemo();
        }).catch(function () { hideDemo(); });
      }
    }
  }

  buildRail();
  buildTray();
  setSaveState('idle', '');

  (async function () {
    try {
      await M.STORE.init();
    } catch (e) {
      setSaveState('error', '数据库打不开');
      toast('这台浏览器不允许本地数据库：' + (e && e.message ? e.message : e) + '（照片和作品都不会保存）');
      if (el.empty) el.empty.hidden = false;
      return;
    }
    try {
      await restoreSession();
    } catch (e) {
      setSaveState('error', '读取失败');
      toast('读取上次的作品失败：' + (e && e.message ? e.message : e));
    }
  })();

  /* never lose the last edit: flush when the page goes away */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && saveTimer) flushSave();
  });
  window.addEventListener('pagehide', function () { if (saveTimer) flushSave(); });

  if (el.saveState) {
    el.saveState.onclick = function () {
      if (saveFailing) { flushSave(); return; }
      openVersions();
    };
  }

  window.__mem = {
    state: state, rebuild: rebuild, M: M, paint: paintZine,
    addFiles: addFiles, importFile: importFile, flushSave: flushSave, scheduleSave: scheduleSave,
    snapshot: snapshot, applySnapshot: applySnapshot, ensureProject: ensureProject,
    versionPhotoIds: versionPhotoIds,
    openVersions: openVersions, saveNewVersion: saveNewVersion, restoreVersion: restoreVersion,
    project: function () { return project; }, loadLibrary: loadLibrary,
    report: function () { return { photos: state.photos.length, library: state.library.length, save: el.saveState ? el.saveState.dataset.state : '', obj: M.OBJ.stats() }; }
  };
})();
