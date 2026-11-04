/* Collections: the layer between photos and books (P2).
   Owns its own dialog so app.js does not grow another 300 lines.
   Rules it must not break: deleting a collection never deletes a photo and
   never touches a book. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var STORE = function () { return M.STORE; };
  var modal, body, tabs, count, newBtn;
  var tab = 'colls';          // 'colls' | 'all'
  var openColl = null;        // collection id when inside one
  var allFilter = 'all';      // 'all' | 'none' | 'used'
  var cache = { photos: [], collections: [], links: {} };

  function el(id) { return document.getElementById(id); }
  function toast(msg) { if (window.__mem && window.__mem.toast) window.__mem.toast(msg); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function photoById() {
    var by = {};
    cache.photos.forEach(function (p) { by[p.id] = p; });
    return by;
  }

  async function refresh() {
    cache.photos = (window.__mem && window.__mem.state) ? window.__mem.state.library.slice() : [];
    try { await STORE().reconcileCollections(); } catch (e) {}
    cache.collections = await STORE().listCollections();
    var per = {};
    for (var i = 0; i < cache.collections.length; i++) {
      per[cache.collections[i].id] = await STORE().listCollectionPhotos(cache.collections[i].id);
    }
    cache.links = per;
  }

  /* ---------- 集合列表 ---------- */
  function renderColls() {
    var by = photoById();
    var wrap = document.createElement('div');
    wrap.className = 'coll-grid';

    cache.collections.forEach(function (co) {
      var links = cache.links[co.id] || [];
      var cover = by[co.coverPhotoId] || (by[links[0] && links[0].photoId]) || null;

      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'coll-card';
      card.onclick = function () { openColl = co.id; render(); };

      var shot = document.createElement('div');
      shot.className = 'coll-cover';
      if (cover && cover.url) {
        var im = document.createElement('img');
        im.src = cover.url; im.alt = ''; im.loading = 'lazy';
        shot.appendChild(im);
      } else {
        shot.textContent = '空的';
      }
      card.appendChild(shot);

      var meta = document.createElement('div');
      meta.className = 'coll-meta';
      meta.innerHTML = '<b>' + esc(co.name) + '</b><span>' + links.length + ' 张</span>';
      card.appendChild(meta);
      wrap.appendChild(card);
    });

    if (!cache.collections.length) {
      var empty = document.createElement('p');
      empty.className = 'coll-empty';
      empty.textContent = '还没有集合。导入一批照片时会自动建一个；也可以点「＋ 新集合」手动建。';
      wrap.appendChild(empty);
    }
    body.appendChild(wrap);
  }

  /* ---------- 单个集合 ---------- */
  async function renderOne(coId) {
    var co = cache.collections.filter(function (c) { return c.id === coId; })[0];
    if (!co) { openColl = null; return render(); }
    var by = photoById();
    var links = cache.links[co.id] || [];

    var head = document.createElement('div');
    head.className = 'coll-detail-head';
    head.innerHTML =
      '<button class="btn btn-ghost btn-sm" id="collBack">← 返回</button>' +
      '<h3>' + esc(co.name) + '<span>' + links.length + ' 张</span></h3>' +
      '<div class="coll-detail-tools">' +
      '<button class="btn btn-ghost btn-sm" id="collAdd">＋ 加入照片</button>' +
      '<button class="btn btn-ghost btn-sm" id="collRename">改名</button>' +
      '<button class="btn btn-ghost btn-sm coll-del" id="collDelete">删除集合</button>' +
      '</div>';
    body.appendChild(head);

    head.querySelector('#collBack').onclick = function () { openColl = null; render(); };
    head.querySelector('#collRename').onclick = async function () {
      var name = prompt('集合名称', co.name);
      if (!name) return;
      await STORE().updateCollection(co.id, { name: name.trim() });
      await refresh(); render();
    };
    head.querySelector('#collDelete').onclick = async function () {
      var books = await booksUsing(co);
      var msg = '删除「' + co.name + '」？\n\n照片不会被删除，已经做好的书也不受影响。';
      if (books.length) msg += '\n其中 ' + books.length + ' 本书用过这些照片，它们保持原样。';
      if (!confirm(msg)) return;
      await STORE().deleteCollection(co.id);
      openColl = null;
      await refresh(); render();
      toast('集合已删除，照片还在「全部照片」里');
    };
    head.querySelector('#collAdd').onclick = function () { pickPhotos(co); };

    var grid = document.createElement('div');
    grid.className = 'coll-photos';
    links.forEach(function (l) {
      var p = by[l.photoId];
      if (!p) return;
      var cell = document.createElement('div');
      cell.className = 'coll-photo';

      var im = document.createElement('img');
      im.src = p.url; im.alt = p.name || ''; im.loading = 'lazy';
      cell.appendChild(im);

      var star = document.createElement('span');
      star.className = 'coll-star' + (l.starred ? ' on' : '');
      star.textContent = l.starred ? '★' : '☆';
      star.title = '这个集合里的精选（不影响别的集合和书）';
      star.onclick = async function (ev) {
        ev.stopPropagation();
        await STORE().setCollectionStar(co.id, p.id, !l.starred);
        await refresh(); render();
      };
      cell.appendChild(star);

      var rm = document.createElement('span');
      rm.className = 'coll-rm';
      rm.textContent = '✕';
      rm.title = '从这个集合移出（不删照片）';
      rm.onclick = async function (ev) {
        ev.stopPropagation();
        await STORE().removeFromCollection(co.id, p.id);
        await refresh(); render();
      };
      cell.appendChild(rm);
      grid.appendChild(cell);
    });
    if (!links.length) {
      grid.innerHTML = '<p class="coll-empty">这个集合还没有照片。点「＋ 加入照片」从全部照片里挑。</p>';
    }
    body.appendChild(grid);
  }

  /* ---------- 全部照片 ---------- */
  async function renderAll() {
    var used = await usedPhotoIds();
    var inColl = {};
    cache.collections.forEach(function (co) {
      (cache.links[co.id] || []).forEach(function (l) { (inColl[l.photoId] = inColl[l.photoId] || []).push(co.name); });
    });

    var chips = document.createElement('div');
    chips.className = 'coll-chips';
    [['all', '全部'], ['none', '未加入集合'], ['used', '已被作品引用']].forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (allFilter === c[0] ? ' on' : '');
      b.textContent = c[1];
      b.onclick = function () { allFilter = c[0]; render(); };
      chips.appendChild(b);
    });
    body.appendChild(chips);

    var list = cache.photos.filter(function (p) {
      if (allFilter === 'none') return !inColl[p.id];
      if (allFilter === 'used') return !!used[p.id];
      return true;
    });

    var grid = document.createElement('div');
    grid.className = 'coll-photos';
    list.forEach(function (p) {
      var cell = document.createElement('div');
      cell.className = 'coll-photo';
      var im = document.createElement('img');
      im.src = p.url; im.alt = p.name || ''; im.loading = 'lazy';
      cell.appendChild(im);

      var badge = document.createElement('span');
      badge.className = 'coll-badge';
      var n = (inColl[p.id] || []).length;
      badge.textContent = n ? n + ' 个集合' : '未归集';
      cell.appendChild(badge);

      var u = used[p.id];
      if (u) {
        var ub = document.createElement('span');
        ub.className = 'coll-badge used';
        ub.textContent = u + ' 本书';
        cell.appendChild(ub);
      }
      grid.appendChild(cell);
    });
    if (!list.length) {
      grid.innerHTML = '<p class="coll-empty">这里没有照片。</p>';
    }
    body.appendChild(grid);
  }

  async function usedPhotoIds() {
    var out = {};
    try {
      var projects = await STORE().listProjects();
      for (var i = 0; i < projects.length; i++) {
        var links = await STORE().listBookPhotos(projects[i].id);
        links.forEach(function (l) { out[l.photoId] = (out[l.photoId] || 0) + 1; });
      }
    } catch (e) {}
    return out;
  }

  async function booksUsing(co) {
    var links = cache.links[co.id] || [];
    var hits = {};
    for (var i = 0; i < links.length; i++) {
      var books = await STORE().booksUsingPhoto(links[i].photoId);
      books.forEach(function (b) { hits[b.id] = b; });
    }
    return Object.keys(hits).map(function (k) { return hits[k]; });
  }

  /* ---------- 往集合里加照片 ---------- */
  async function pickPhotos(co) {
    var links = cache.links[co.id] || [];
    var have = {};
    links.forEach(function (l) { have[l.photoId] = 1; });
    var pool = cache.photos.filter(function (p) { return !have[p.id]; });
    if (!pool.length) { toast('所有照片都已经在这个集合里了'); return; }

    var chosen = {};
    var overlay = document.createElement('div');
    overlay.className = 'coll-pick';
    overlay.innerHTML =
      '<div class="coll-pick-card">' +
      '<div class="coll-pick-head"><b>把照片加进「' + esc(co.name) + '」</b>' +
      '<button class="picker-close" data-x="1">✕</button></div>' +
      '<div class="coll-pick-grid"></div>' +
      '<div class="coll-pick-foot"><span class="coll-pick-count">已选 0 张</span>' +
      '<button class="btn btn-primary" data-ok="1">加入</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var grid = overlay.querySelector('.coll-pick-grid');
    var label = overlay.querySelector('.coll-pick-count');
    pool.forEach(function (p) {
      var cell = document.createElement('div');
      cell.className = 'coll-photo pickable';
      var im = document.createElement('img');
      im.src = p.url; im.alt = ''; im.loading = 'lazy';
      cell.appendChild(im);
      cell.onclick = function () {
        if (chosen[p.id]) { delete chosen[p.id]; cell.classList.remove('on'); }
        else { chosen[p.id] = 1; cell.classList.add('on'); }
        label.textContent = '已选 ' + Object.keys(chosen).length + ' 张';
      };
      grid.appendChild(cell);
    });

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.querySelector('[data-x]').onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    overlay.querySelector('[data-ok]').onclick = async function () {
      var ids = Object.keys(chosen);
      if (!ids.length) return close();
      await STORE().addToCollection(co.id, ids);
      close();
      await refresh(); render();
      toast('已加入 ' + ids.length + ' 张');
    };
  }

  /* ---------- shell ---------- */
  function render() {
    if (!body) return;
    body.innerHTML = '';
    if (openColl) return renderOne(openColl);
    if (tab === 'all') return renderAll();
    return renderColls();
  }

  function setTab(next) {
    tab = next;
    openColl = null;
    Array.prototype.forEach.call(tabs.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.tab === next));
    });
    render();
  }

  async function open() {
    if (!modal) return;
    modal.hidden = false;
    await refresh();
    render();
  }

  function close() { if (modal) modal.hidden = true; }

  function init() {
    modal = el('colls');
    if (!modal) return;
    body = el('collBody');
    tabs = el('collTabs');
    count = el('collCount');
    newBtn = el('collNew');

    el('collClose').onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    Array.prototype.forEach.call(tabs.children, function (b) {
      b.onclick = function () { setTab(b.dataset.tab); };
    });
    newBtn.onclick = async function () {
      var name = prompt('新集合的名字', '新集合');
      if (!name) return;
      var co = await STORE().createCollection({ name: name.trim() });
      await refresh();
      openColl = co.id;
      render();
    };
  }

  M.COLL = { init: init, open: open, close: close, render: render, refresh: refresh };
})(window.MEM);
