/* The only shape the model is allowed to answer in, plus a validator.
   The model writes words; it never writes markup, coordinates or styles. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.AI = M.AI || {};

  var DIRECTION = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      concept: { type: 'string' },
      mood: { type: 'array', items: { type: 'string' } },
      writingStyle: { type: 'string' },
      chapterTitles: { type: 'array', items: { type: 'string' } },
      captions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            role: { type: 'string', enum: ['short_caption', 'image_note', 'section_note'] }
          },
          required: ['text', 'role']
        }
      },
      textDensity: { type: 'string', enum: ['none', 'low', 'medium', 'high'] }
    },
    required: ['title', 'subtitle', 'concept', 'mood', 'chapterTitles', 'captions', 'textDensity']
  };

  var SCHEMA = {
    type: 'object',
    properties: {
      directions: { type: 'array', items: DIRECTION }
    },
    required: ['directions']
  };

  /* what we actually accept back — forgiving on extras, strict on the words */
  function cleanText(s, max) {
    if (typeof s !== 'string') return '';
    return s.replace(/\s+/g, ' ').trim().slice(0, max || 90);
  }

  /* clichés and runaway sentences: a small model produces both, we cut them */
  var BANNED = /时光|岁月|仿佛|宛如|如同一首|光影交错|岁月静好|静谧|诗意地|缱绻|斑驳/g;

  function tidyTitle(raw) {
    var t = cleanText(raw, 80);
    t = t.split(/[，,。；;：:、]/)[0].trim();
    t = t.replace(/[「」『』"'"']/g, '');
    t = t.replace(BANNED, '').trim();
    if (t.length > 16) t = t.slice(0, 16);
    return t;
  }

  function tidyLine(raw) {
    var t = cleanText(raw, 60).replace(/[「」『』]/g, '');
    return t;
  }

  function normalize(raw, opt) {
    opt = opt || {};
    var want = opt.directions || 3;
    var list = (raw && Array.isArray(raw.directions)) ? raw.directions : [];
    var out = [];
    list.forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      var title = tidyTitle(d.title);
      if (!title) return;
      out.push({
        title: title,
        subtitle: cleanText(d.subtitle, 60),
        concept: cleanText(d.concept, 160),
        mood: (Array.isArray(d.mood) ? d.mood : []).map(function (m) { return cleanText(m, 14); }).filter(Boolean).slice(0, 4),
        writingStyle: cleanText(d.writingStyle, 30),
        chapterTitles: (Array.isArray(d.chapterTitles) ? d.chapterTitles : [])
          .map(function (s) { return tidyTitle(s).slice(0, 6); }).filter(Boolean)
          .filter(function (s, i, arr) { return arr.indexOf(s) === i; }).slice(0, 6),
        captions: (function () {
          var all = (Array.isArray(d.captions) ? d.captions : []).map(function (c) {
            if (typeof c === 'string') return { text: tidyLine(c), role: 'short_caption' };
            return { text: tidyLine(c && c.text), role: (c && c.role) || 'short_caption' };
          }).filter(function (c) { return c.text; });
          var clean = all.filter(function (c) { return !BANNED.test(c.text); });
          var list = clean.length >= 3 ? clean : all;
          var seen = {};
          return list.filter(function (c) {
            var k = c.text.slice(0, 8);
            if (seen[k]) return false;
            seen[k] = 1;
            return true;
          }).slice(0, 10);
        })(),
        textDensity: ['none', 'low', 'medium', 'high'].indexOf(d.textDensity) >= 0 ? d.textDensity : 'low'
      });
    });
    return out.slice(0, want);
  }

  /* a cheap guard against the model putting facts in our mouth */
  function lint(direction, brief) {
    var problems = [];
    var all = [direction.title, direction.subtitle, direction.concept]
      .concat(direction.chapterTitles || [])
      .concat((direction.captions || []).map(function (c) { return c.text; }))
      .join(' ');
    if (/https?:\/\/|<\/?[a-z][^>]*>/i.test(all)) problems.push('包含链接或 HTML');
    if (brief && !brief.places && /(在|于)(巴黎|东京|京都|北海道|纽约|香港|上海|北京|台北)/.test(all)) {
      problems.push('提到了没有元数据支持的地点');
    }
    if (brief && !brief.dates && /(\d{4}年|\d{1,2}月\d{1,2}日)/.test(all)) {
      problems.push('提到了没有元数据支持的日期');
    }
    return problems;
  }

  M.AI.schemas = { SCHEMA: SCHEMA, DIRECTION: DIRECTION, normalize: normalize, lint: lint };
})(window.MEM);
