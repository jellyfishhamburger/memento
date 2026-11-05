/* Editorial assistant: turn what we actually know about the photos into a brief,
   ask the local model for three directions, and validate what comes back.
   No model? It still returns honest, fact-free templates so the button is never dead. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.AI = M.AI || {};

  /* ---------- what we know (and nothing more) ---------- */
  function aspectMix(photos) {
    var out = { portrait: 0, landscape: 0, square: 0 };
    photos.forEach(function (p) {
      var ar = p.ar || 1;
      if (ar > 1.15) out.landscape++;
      else if (ar < 0.87) out.portrait++;
      else out.square++;
    });
    return out;
  }

  function hexToHsl(hex) {
    if (!hex || hex[0] !== '#') return null;
    var h = hex.length === 4
      ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
      : hex;
    var r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hue = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) hue = ((b - r) / d + 2) / 6;
      else hue = ((r - g) / d + 4) / 6;
    }
    return { h: hue * 360, s: s, l: l };
  }

  function palette(photos) {
    var buckets = [];
    photos.forEach(function (p) {
      var c = (p.colors && p.colors[0]) || null;
      var hsl = hexToHsl(c);
      if (!hsl) return;
      var band = Math.floor(hsl.h / 60) * 60;
      var slot = buckets.filter(function (b) { return b.band === band; })[0];
      if (!slot) { buckets.push({ band: band, n: 1, sample: c, name: bandName(hsl) }); }
      else { slot.n++; }
    });
    buckets.sort(function (a, b) { return b.n - a.n; });
    return buckets.slice(0, 3).map(function (b) { return b.name + '（' + b.sample + '）'; });
  }

  function bandName(hsl) {
    if (hsl.s < 0.12) return hsl.l > 0.72 ? '近白／浅灰' : hsl.l < 0.3 ? '近黑／深灰' : '中性灰';
    var h = hsl.h;
    if (h < 20 || h >= 345) return '暖红／砖色';
    if (h < 45) return '橙棕／土色';
    if (h < 70) return '黄／米色';
    if (h < 160) return '绿／植物';
    if (h < 200) return '青绿／水色';
    if (h < 260) return '蓝／海与天';
    if (h < 300) return '紫';
    return '洋红';
  }

  function tone(photos) {
    if (!photos.length) return '未知';
    var b = photos.reduce(function (a, p) { return a + (p.bright == null ? 0.5 : p.bright); }, 0) / photos.length;
    var s = photos.reduce(function (a, p) { return a + (p.sat == null ? 0.3 : p.sat); }, 0) / photos.length;
    var light = b > 0.62 ? '偏亮' : b < 0.4 ? '偏暗' : '中间调';
    var col = s > 0.42 ? '色彩浓' : s < 0.2 ? '几乎无彩' : '低饱和';
    return light + '、' + col;
  }

  function buildBrief(opt) {
    var photos = opt.photos || [];
    return {
      count: photos.length,
      aspect: aspectMix(photos),
      palette: palette(photos),
      tone: tone(photos),
      dates: null,          // we do not parse EXIF: no claim, no invention
      places: null,         // same
      userMemory: (opt.memory || '').trim(),
      userEdited: (opt.userEdited || []).slice(0, 6),
      bookTitle: opt.bookTitle || '',
      style: opt.style || 'poetic',
      density: opt.density || (opt.style === 'minimal' ? 'low' : 'medium')
    };
  }

  /* ---------- ask ---------- */
  function words(s) {
    return String(s || '').replace(/[^\u4e00-\u9fff\w]/g, '');
  }
  function bigrams(s) {
    var t = words(s), out = {};
    for (var i = 0; i < t.length - 1; i++) out[t.slice(i, i + 2)] = 1;
    return out;
  }
  function similarity(a, b) {
    var A = bigrams(a), B = bigrams(b);
    var ka = Object.keys(A), kb = Object.keys(B);
    if (!ka.length || !kb.length) return 0;
    var hit = 0;
    ka.forEach(function (k) { if (B[k]) hit++; });
    return hit / Math.min(ka.length, kb.length);
  }
  function flatten(d) {
    return [d.title, d.subtitle, d.concept].concat(d.chapterTitles || [])
      .concat((d.captions || []).map(function (c) { return typeof c === 'string' ? c : c.text; })).join(' ');
  }

  /* too alike? say so instead of pretending they are three directions */
  function checkVariety(list) {
    var pairs = [];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        pairs.push({ i: i, j: j, score: similarity(flatten(list[i]), flatten(list[j])) });
      }
    }
    return pairs.filter(function (p) { return p.score > 0.5; });
  }

  async function one(brief, angle, model, attempt) {
    var messages = [
      { role: 'system', content: M.AI.prompts.system() },
      { role: 'user', content: M.AI.prompts.anglePrompt(brief, angle) }
    ];
    var res = await M.AI.ollama.chat({
      messages: messages, schema: M.AI.schemas.SCHEMA, model: model,
      timeout: 90000, temperature: attempt ? 0.35 : 0.85
    });
    var parsed = M.AI.ollama.parseJSON(res.raw);
    var list = M.AI.schemas.normalize(parsed, { directions: 1 });
    if (!list.length) throw Object.assign(new Error('空结果'), { code: 'empty' });
    list[0].angle = angle.key;
    list[0].angleName = angle.name;
    return list[0];
  }

  async function oneWithRetry(brief, angle, model) {
    try { return await one(brief, angle, model, 0); }
    catch (e) {
      if (e && (e.code === 'json' || e.code === 'empty')) return one(brief, angle, model, 1);
      throw e;
    }
  }

  async function generate(opt) {
    opt = opt || {};
    var brief = buildBrief(opt);
    var st = await M.AI.provider.check();
    if (!st.ok) {
      return { directions: M.AI.prompts.fallback(brief), source: 'fallback', brief: brief, why: st.code };
    }

    var angles = M.AI.prompts.ANGLES;
    var results = await Promise.all(angles.map(function (a) {
      return oneWithRetry(brief, a, opt.model).catch(function (e) { return { __err: e }; });
    }));
    var ok = results.filter(function (r) { return r && !r.__err; });

    if (!ok.length) {
      var firstErr = (results[0] && results[0].__err) || {};
      throw Object.assign(new Error(firstErr.message || '生成失败'), { code: firstErr.code || 'error' });
    }

    var warnings = [];
    ok.forEach(function (d) {
      var probs = M.AI.schemas.lint(d, brief);
      if (probs.length) warnings.push(d.title + '：' + probs.join('、'));
    });
    var close = checkVariety(ok);
    if (close.length) warnings.push('有两个方向偏像，可以再点一次换一组');

    if (ok.length < angles.length) warnings.push((angles.length - ok.length) + ' 个角度没生成出来');

    return { directions: ok, source: 'ai', brief: brief, model: ok.model, warnings: warnings };
  }

  M.AI.editorial = { buildBrief: buildBrief, generate: generate, aspectMix: aspectMix, palette: palette, tone: tone };
})(window.MEM);
