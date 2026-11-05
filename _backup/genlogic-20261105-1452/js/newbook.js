/* New book: pick photos across collections, then choose the kind (P3).
   The selection lives here only until 创建; the book then owns it. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var modal, collList, photoGrid, countEl, kindHint;
  var curColl = null;          // collection id | 'all' | 'none'
  var chosen = {};             // photoId -> true (kept across collections)
  var data = { photos: [], colls: [], links: {} };
  var defaultKind = 'social';

  function el(id) { return document.getElementById(id); }
  function toast(msg) { if (window.__mem && window.__mem.toast) window.__mem.toast(msg); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  async function load() {
    var S = M.STORE;
    data.photos = (window.__mem && window.__mem.state) ? window.__mem.state.library.slice() : [];
    data.colls = await S.listCollections();
    data.links = {};
    for (var i = 0; i < data.colls.length; i++) {
      data.links[data.colls[i].id] = await S.listCollectionPhotos(data.colls[i].id);
    }
  }

  function photoIdsOf(key) {
    if (key === 'all') return data.photos.map(function (p) { return p.id; });
    if (key === 'none') {
      var linked = {};
      Object.keys(data.links).forEach(function (c) {
        data.links[c].forEach(function (l) { linked[l.photoId] = 1; });
      });
      return data.photos.filter(function (p) { return !linked[p.id]; }).map(function (p) { return p.id; });
    }
    return (data.links[key] || []).map(function (l) { return l.photoId; });
  }

  function renderColls() {
    collList.innerHTML = '';
    var rows = [
      { key: 'all', name: '全部照片', n: data.photos.length },
      { key: 'none', name: '未加入集合', n: photoIdsOf('none').length }
    ].concat(data.colls.map(function (c) {
      return { key: c.id, name: c.name, n: (data.links[c.id] || []).length };
    }));

    rows.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nb-row' + (curColl === r.key ? ' on' : '');
      b.innerHTML = '<span>' + esc(r.name) + '</span><b>' + r.n + '</b>';
      b.onclick = function () { curColl = r.key; render(); };
      collList.appendChild(b);
    });
  }

  function renderPhotos() {
    var ids = photoIdsOf(curColl);
    var by = {};
    data.photos.forEach(function (p) { by[p.id] = p; });
    photoGrid.innerHTML = '';
    if (!ids.length) {
      photoGrid.innerHTML = '<p class="coll-empty">这里没有照片。</p>';
      return;
    }
    ids.forEach(function (id) {
      var p = by[id];
      if (!p) return;
      var cell = document.createElement('div');
      cell.className = 'nb-cell' + (chosen[id] ? ' on' : '');
      var im = document.createElement('img');
      im.src = p.url; im.alt = ''; im.loading = 'lazy';
      cell.appendChild(im);
      var tick = document.createElement('span');
      tick.className = 'nb-tick';
      tick.textContent = chosen[id] ? '✓' : '';
      cell.appendChild(tick);
      cell.onclick = function () {
        if (chosen[id]) delete chosen[id]; else chosen[id] = 1;
        cell.classList.toggle('on', !!chosen[id]);
        tick.textContent = chosen[id] ? '✓' : '';
        renderCount();
      };
      photoGrid.appendChild(cell);
    });
  }

  function renderCount() {
    var n = Object.keys(chosen).length;
    countEl.textContent = '已选 ' + n + ' 张';
    var mem = el('nbMemory'), soc = el('nbSocial');
    if (mem) mem.disabled = !n;
    if (soc) soc.disabled = !n;
    if (soc) soc.textContent = n > 11 ? '做成九图（取前 9 张）' : '做成九图作品';
  }

  function render() {
    renderColls();
    renderPhotos();
    renderCount();
  }

  async function open(kind) {
    defaultKind = kind || 'social';
    chosen = {};
    curColl = null;
    if (!modal) return;
    modal.hidden = false;
    await load();
    if (data.colls.length) curColl = data.colls[0].id;
    else curColl = 'all';
    if (kindHint) {
      kindHint.textContent = defaultKind === 'memory'
        ? '选照片 → 做成回忆册（页数不设限，按照片多少和松紧决定）'
        : '选照片 → 做成九图作品（朋友圈九张；选多了只取前 9 张）';
    }
    render();
  }

  function close() { if (modal) modal.hidden = true; }

  async function create(kind) {
    var ids = Object.keys(chosen);
    if (!ids.length) { toast('先挑照片'); return; }
    if (kind === 'social' && ids.length > 9) ids = ids.slice(0, 9);
    close();
    if (window.__mem && window.__mem.createBook) {
      await window.__mem.createBook(kind, ids);
    } else {
      toast('新建失败：应用还没准备好');
    }
  }

  function init() {
    modal = el('newbook');
    if (!modal) return;
    collList = el('nbColls');
    photoGrid = el('nbPhotos');
    countEl = el('nbCount');
    kindHint = el('nbHint');
    el('nbClose').onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    el('nbMemory').onclick = function () { create('memory'); };
    el('nbSocial').onclick = function () { create('social'); };
    el('nbAll').onclick = function () {
      var ids = photoIdsOf(curColl);
      var all = ids.every(function (i) { return chosen[i]; });
      ids.forEach(function (i) { if (all) delete chosen[i]; else chosen[i] = 1; });
      renderPhotos(); renderCount();
    };
    el('nbNone').onclick = function () { chosen = {}; renderPhotos(); renderCount(); };
  }

  M.NEWBOOK = { init: init, open: open, close: close };
})(window.MEM);
