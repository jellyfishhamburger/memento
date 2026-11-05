/* Text: content and layout are two different things.
   The engine asks for { title, year, sections, lines }; this module keeps the
   editorial content with its provenance (who wrote it, was it edited) and hands
   the engine a plain view. Layout stays in compose.js and is never touched here. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  var seq = 0;
  function uid() { return 't_' + Date.now().toString(36) + '_' + (++seq) + Math.random().toString(36).slice(2, 5); }

  var STYLES = [
    { key: 'poetic', name: 'Poetic', note: '诗意、含蓄，短句为主' },
    { key: 'documentary', name: 'Documentary', note: '纪实、具体，像旁白说明' },
    { key: 'minimal', name: 'Minimal', note: '极简，能少一个字就少一个' },
    { key: 'playful', name: 'Playful', note: '轻松、口语，有点玩笑' },
    { key: 'personal', name: 'Personal', note: '私人日记，第一人称' },
    { key: 'none', name: 'No Text', note: '不加内容文字，只留页码与日期' }
  ];

  function defaults(dir) {
    var d = (M.TEXT_DEFAULT && (M.TEXT_DEFAULT[dir] || M.TEXT_DEFAULT.zine)) ||
      { title: '未命名的一卷', year: new Date().getFullYear(), sections: [], lines: [] };
    return d;
  }

  function item(role, index, text, source) {
    return {
      id: uid(), role: role, index: index, text: text || '',
      source: source || 'system', isUserEdited: false,
      createdAt: Date.now(), originalTextId: null
    };
  }

  /* a fresh document for a direction */
  function create(dir) {
    var d = defaults(dir);
    var items = [item('title', 0, d.title, 'system'), item('subtitle', 0, '', 'system')];
    (d.sections || []).forEach(function (s, i) { items.push(item('section', i, s, 'system')); });
    (d.lines || []).forEach(function (s, i) { items.push(item('caption', i, s, 'system')); });
    return { version: 1, style: 'poetic', noText: false, memory: '', items: items };
  }

  /* old projects stored { title, year, sections, lines } — read them losslessly */
  function fromLegacy(obj, dir) {
    var doc = create(dir);
    if (!obj) return doc;
    if (obj.title) setText(doc, 'title', 0, obj.title, 'user');
    if (Array.isArray(obj.sections)) {
      obj.sections.forEach(function (s, i) { setText(doc, 'section', i, s, 'user'); });
    }
    if (Array.isArray(obj.lines)) {
      obj.lines.forEach(function (s, i) { setText(doc, 'caption', i, s, 'user'); });
    }
    return doc;
  }

  function ensure(doc, dir) {
    if (!doc || !Array.isArray(doc.items)) return fromLegacy(doc, dir);
    if (!doc.style) doc.style = 'poetic';
    if (doc.noText == null) doc.noText = false;
    if (doc.memory == null) doc.memory = '';
    return doc;
  }

  function find(doc, role, index) {
    for (var i = 0; i < doc.items.length; i++) {
      if (doc.items[i].role === role && doc.items[i].index === index) return doc.items[i];
    }
    return null;
  }

  function roleItems(doc, role) {
    return doc.items.filter(function (it) { return it.role === role; })
      .sort(function (a, b) { return a.index - b.index; });
  }

  function setText(doc, role, index, text, source) {
    var it = find(doc, role, index);
    if (!it) {
      it = item(role, index, '', source || 'user');
      doc.items.push(it);
    }
    if (it.text === text) return it;
    if (source !== 'ai' && source !== 'system') {
      it.isUserEdited = true;
      it.source = 'user';
    } else if (!it.isUserEdited) {
      it.source = source;
    }
    it.text = text;
    return it;
  }

  /* the plain view the layout engine consumes — nothing about type or position */
  function toEngine(doc, dir) {
    var d = defaults(dir);
    if (!doc || doc.noText) {
      return { title: '', year: d.year, sections: [], lines: [] };
    }
    var title = (find(doc, 'title', 0) || {}).text || d.title;
    return {
      title: title,
      year: d.year,
      sections: roleItems(doc, 'section').map(function (x) { return x.text; }).filter(Boolean),
      lines: roleItems(doc, 'caption').map(function (x) { return x.text; }).filter(Boolean)
    };
  }

  /* a new AI direction replaces the previous AI text, it does not stack on it:
     anything the model wrote last time that the new answer no longer covers is
     removed. Lines the user typed are never touched. */
  function dropStale(doc, role, keepCount) {
    var removed = 0;
    doc.items = doc.items.filter(function (it) {
      if (it.role !== role) return true;
      if (it.isUserEdited) return true;
      if (it.index < keepCount) return true;
      if (it.source === 'ai') { removed++; return false; }
      return true;
    });
    return removed;
  }

  /* take an AI direction: never touch what the user wrote themselves */
  function adopt(doc, direction, opt) {
    opt = opt || {};
    var kept = 0, applied = 0;
    function put(role, index, text) {
      if (!text) return;
      var cur = find(doc, role, index);
      if (cur && cur.isUserEdited) { kept++; return; }
      var prevId = cur ? cur.id : null;
      var it = setText(doc, role, index, text, 'ai');
      it.originalTextId = prevId;
      it.isUserEdited = false;
      it.source = 'ai';
      applied++;
    }
    put('title', 0, direction.title);
    put('subtitle', 0, direction.subtitle);

    // the small model loves repeating one word as five "chapters"
    var seenSec = {};
    var chapters = (direction.chapterTitles || []).map(function (t) { return String(t || '').trim(); })
      .filter(function (t) {
        if (!t || seenSec[t]) return false;
        seenSec[t] = 1; return true;
      });
    chapters.forEach(function (t, i) { put('section', i, t); });
    dropStale(doc, 'section', chapters.length);

    var caps = (direction.captions || []).map(function (c) {
      return typeof c === 'string' ? c : c.text;
    }).filter(Boolean);
    caps.forEach(function (c, i) { put('caption', i, c); });
    dropStale(doc, 'caption', caps.length);

    if (direction.textDensity) doc.textDensity = direction.textDensity;
    return { applied: applied, kept: kept };
  }

  /* what we tell the model about the text that already exists */
  function summary(doc) {
    return {
      style: doc.style,
      noText: !!doc.noText,
      memory: doc.memory || '',
      userEdited: doc.items.filter(function (i) { return i.isUserEdited; }).map(function (i) {
        return { role: i.role, index: i.index, text: i.text };
      })
    };
  }

  M.TEXT = {
    STYLES: STYLES,
    create: create,
    ensure: ensure,
    fromLegacy: fromLegacy,
    toEngine: toEngine,
    setText: setText,
    adopt: adopt,
    summary: summary,
    find: find,
    roleItems: roleItems,
    styleName: function (k) {
      var s = STYLES.filter(function (x) { return x.key === k; })[0];
      return s ? s.name : 'Poetic';
    }
  };
})(window.MEM);
