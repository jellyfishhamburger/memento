/* S3 · visual understanding + editorial relationships (experimental, detachable).
   Nothing here writes into S1 (profile) or S2 (direction token). It only reads
   photos and produces observations, relations and two orderings for a human to
   inspect. Turn it off by not calling it — no other module depends on it.

   Design rule: the model is only asked WHAT IS IN THE FRAME. Relationships are
   computed here, in code, from its answers plus the S1 numbers, so every edge
   can be traced to evidence instead of a model hunch. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.OBS = M.OBS || {};

  var CACHE = {};

  /* ---------- what we ask the model ---------- */
  var SCHEMA = {
    type: 'object',
    properties: {
      scene: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['coast', 'landscape', 'street', 'interior', 'architecture', 'food', 'object', 'people', 'night', 'other', 'unknown'] },
          place: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'mid', 'low'] }
        },
        required: ['type', 'confidence']
      },
      subjects: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            what: { type: 'string' },
            where: { type: 'string', enum: ['left', 'center', 'right', 'full'] },
            depth: { type: 'string', enum: ['foreground', 'mid', 'background'] }
          },
          required: ['what', 'where', 'depth']
        }
      },
      people: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          prominent: { type: 'boolean' },
          note: { type: 'string' }
        },
        required: ['count', 'prominent']
      },
      action: { type: 'string' },
      crowding: { type: 'string', enum: ['empty', 'sparse', 'busy'] },
      focus: { type: 'string', enum: ['single', 'scattered', 'none'] },
      composition: { type: 'string' },
      mood: { type: 'array', items: { type: 'string' } },
      unknown: { type: 'array', items: { type: 'string' } }
    },
    required: ['scene', 'subjects', 'people', 'crowding', 'focus', 'mood', 'unknown']
  };

  var SYSTEM = [
    '你是一个摄影编辑助手，正在看一组成片里的一张。',
    '只描述你真正看见的东西，不要推测照片之外的信息。',
    '规则：',
    '1) 看不清、认不出的写进 unknown，不要为了填满而猜。',
    '2) 不要编造地点、人名、人物关系、事件或时间。',
    '3) mood 只是"画面给人的氛围"（如 安静/温暖/热闹/疏离），不是拍摄者的心情。',
    '4) 中文，短句，不要形容词堆砌。'
  ].join('\n');

  var ASK = [
    '看图，只输出一行 JSON，不要解释，不要 markdown。键固定：',
    '{"scene":"海岸|自然|街道|室内|建筑|食物|物件|人物|夜景|其他|看不清",',
    ' "place":"画面里能读到的地点，没有就空字符串",',
    ' "confidence":"high|mid|low",',
    ' "subjects":[{"what":"看到了什么","where":"left|center|right|full","depth":"foreground|mid|background"}],',
    ' "people":{"count":0,"note":"人物在做什么，没有就空"},',
    ' "action":"画面里的主要动作",',
    ' "crowding":"empty|sparse|busy","focus":"single|scattered|none",',
    ' "composition":"一句话说构图",',
    ' "mood":["安静","温暖"],',
    ' "unknown":["看不清的东西"]}',
    '示例（只是格式，内容必须换成你看到的）：{"scene":"街道","place":"","confidence":"mid","subjects":[{"what":"自行车","where":"left","depth":"foreground"}],"people":{"count":1,"note":"推车走过"},"action":"走过","crowding":"sparse","focus":"single","composition":"主体在左三分之一，右侧留白","mood":["安静"],"unknown":[]}',
    '每个值都必须是你看这张图后的具体内容，不要复制提示里的文字。subjects 最多 4 个；不确定的放进 unknown，不要猜。'
  ].join('\n');

  var SCENE_MAP = [
    [/海|浪|沙滩|beach|sea|coast|ocean|shore/i, 'coast'],
    [/森林|山|田野|自然|landscape|mountain|forest|field|sky|云/i, 'landscape'],
    [/街|路|street|road|巷/i, 'street'],
    [/室内|房间|咖啡|interior|room|indoor|cafe|café/i, 'interior'],
    [/建筑|楼|桥|architecture|building|bridge/i, 'architecture'],
    [/食物|餐|咖啡杯|食|food|meal|drink/i, 'food'],
    [/物件|物品|静物|object|still/i, 'object'],
    [/人物|人像|人|people|portrait|person/i, 'people'],
    [/夜|night/i, 'night']
  ];
  /* a 3B model reliably produces near-JSON: a stray },{ between fields, a
     trailing comma, single quotes, or an unfinished tail. Repair, then parse. */
  function lenient(text) {
    var str = String(text || '').trim();
    var a = str.indexOf('{'), b = str.lastIndexOf('}');
    if (a < 0) throw new Error('不是 JSON');
    str = str.slice(a, b > a ? b + 1 : str.length);
    var tries = [
      function (x) { return x; },
      function (x) { return x.replace(/\},\s*\{/g, ','); },
      function (x) { return x.replace(/\},\s*\{/g, ',').replace(/,\s*([}\]])/g, '$1'); },
      function (x) { return x.replace(/\},\s*\{/g, ',').replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"'); }
    ];
    for (var i = 0; i < tries.length; i++) {
      try { return JSON.parse(tries[i](str)); } catch (e) {}
    }
    // last resort: cut at the last complete top-level field
    var cut = str.replace(/,\s*"[^"]*"\s*:\s*"?[^,}\]]*$/, '}');
    try { return JSON.parse(cut.replace(/\},\s*\{/g, ',')); } catch (e) {}
    throw new Error('不是合法 JSON');
  }

  /* generic words that look like evidence but are not: every beach photo has
     "海滩", every still life is "静止". Using them as a link would manufacture
     relations, which is exactly what this experiment must not do. */
  var GENERIC_PLACE = /^(unknown|未知|空|无|背景|前景|画面|室内|室外|海滩|海岸|海边|沙滩|海边|街道|树林|公园|水面|天空)$/i;
  var GENERIC_ACTION = /^(unknown|未知|无|空|静止|静止不动|摆放|存在|站着|站立|坐着|没有|画面里的主要动作)$/i;

  var ECHO = /画面里|看到了什么|主要动作|能读到的地点|这里填|示例|something|xxx/i;
  function clean(v) {
    var t = typeof v === 'string' ? v.trim() : '';
    if (!t || ECHO.test(t)) return '';
    return t;
  }

  function normScene(v) {
    var t = String(v || '').trim();
    var known = ['coast','landscape','street','interior','architecture','food','object','people','night','other','unknown'];
    if (known.indexOf(t) >= 0) return t;
    for (var i = 0; i < SCENE_MAP.length; i++) if (SCENE_MAP[i][0].test(t)) return SCENE_MAP[i][1];
    if (/看不清|未知|无法|unknown/i.test(t)) return 'unknown';
    return t ? 'other' : 'unknown';
  }

  /* ---------- image → base64 (small, enough for a 3B model) ---------- */
  function toB64(photo, maxSide) {
    var side = maxSide || 768;
    var w = photo.w || photo.img.naturalWidth, h = photo.h || photo.img.naturalHeight;
    var k = Math.min(1, side / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(photo.img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  /* ---------- sampling: spread across the set, not "the easy ones" ---------- */
  function sample(photos, n) {
    var list = photos.filter(function (p) { return p.img && p.img.naturalWidth; });
    if (list.length <= n) return list.slice();
    var prof = M.ART ? M.ART.profile(list) : null;
    // bucket by aspect × brightness × busy-ness so every kind of frame gets a seat
    var buckets = {};
    list.forEach(function (p) {
      var ar = p.ar || 1;
      var a = ar > 1.15 ? 'L' : ar < 0.87 ? 'P' : 'S';
      var b = (p.bright == null ? 0.5 : p.bright) > 0.55 ? 'b' : 'd';
      var busy = p.detail == null ? 'm' : p.detail > 0.6 ? 'v' : 's';
      var k = a + b + busy;
      (buckets[k] = buckets[k] || []).push(p);
    });
    var keys = Object.keys(buckets).sort(function (x, y) { return buckets[y].length - buckets[x].length; });
    var out = [], i = 0;
    while (out.length < n) {
      var added = false;
      for (var j = 0; j < keys.length && out.length < n; j++) {
        var arr = buckets[keys[j]];
        if (arr.length > i) { out.push(arr[i]); added = true; }
      }
      if (!added) break;
      i++;
    }
    return out.slice(0, n);
  }

  /* ---------- one photo ---------- */
  async function observeOne(photo, opt) {
    var key = photo.id + ':v2';
    if (!(opt && opt.fresh) && CACHE[key]) return CACHE[key];
    var t0 = Date.now();
    var AI = (M.AI && M.AI.ollama) || M.AI;
    var raw = '', json = null, lastErr = '';
    for (var attempt = 0; attempt < 2 && !json; attempt++) {
      try {
        var res = await AI.chat({
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: ASK + (attempt ? '\n上次没有给出可解析的 JSON，这次只输出 JSON 本体。' : ''), images: [toB64(photo)] }
          ],
          temperature: 0.15,
          timeout: (opt && opt.timeout) || 120000
        });
        raw = res.raw;
        json = lenient(res.raw);
      } catch (e) {
        lastErr = String(e && e.message || e);
        if (e && (e.code === 'offline' || e.code === 'model')) break;
      }
    }
    if (!json) {
      json = { scene: { type: 'unknown', confidence: 'low' }, subjects: [], people: { count: 0, prominent: false },
        crowding: 'empty', focus: 'none', mood: [], unknown: ['没有拿到可解析的观察结果'], raw: String(raw).slice(0, 200), err: lastErr };
    } else {
      // a small model sometimes answers scene as a bare word
      if (typeof json.scene === 'string') json.scene = { type: normScene(json.scene), confidence: 'mid' };
      json.scene = json.scene || {};
      json.scene.type = normScene(json.scene.type || json.scene.name);
      json.scene.confidence = /^(high|mid|low)$/.test(json.scene.confidence) ? json.scene.confidence : 'low';
      json.scene.place = clean(typeof json.scene.place === 'string' ? json.scene.place : (typeof json.place === 'string' ? json.place : ''));
      json.action = clean(json.action);
      json.composition = clean(json.composition);
      json.subjects = (Array.isArray(json.subjects) ? json.subjects : (json.subjects ? [json.subjects] : []))
        .map(function (x) { return typeof x === 'string' ? { what: x, where: 'center', depth: 'mid' } : x; })
        .slice(0, 5).map(function (x) {
          var w = clean(x.what);
          var where = /^(left|center|right|full)$/.test(x.where) ? x.where : 'center';
          var depth = /^(foreground|mid|background)$/.test(x.depth) ? x.depth : 'mid';
          return { what: w, where: where, depth: depth };
        }).filter(function (x) { return x.what; });
      if (typeof json.people === 'number') json.people = { count: json.people };
      if (typeof json.people === 'string') json.people = { count: /\d+/.test(json.people) ? parseInt(json.people, 10) : 0, note: json.people };
      json.people = json.people || { count: 0 };
      json.people.count = Number(json.people.count || 0) || 0;
      json.people.prominent = !!json.people.prominent || json.people.count > 0;
      json.people.note = clean(json.people.note);
      json.mood = (Array.isArray(json.mood) ? json.mood : (json.mood ? [json.mood] : []))
        .map(clean).filter(function (m) { return m && m !== 'unknown'; });
      json.unknown = (Array.isArray(json.unknown) ? json.unknown : (json.unknown ? [json.unknown] : [])).map(clean).filter(Boolean);
      json.crowding = /^(empty|sparse|busy)$/.test(json.crowding) ? json.crowding : '';
      json.focus = /^(single|scattered|none)$/.test(json.focus) ? json.focus : '';
    }
    json.id = photo.id;
    json.name = photo.name || photo.id;
    json.ms = Date.now() - t0;
    json.model = (opt && opt.model) || 'qwen2.5vl:3b';
    CACHE[key] = json;
    return json;
  }

  /* ---------- the whole set ---------- */
  async function observeAll(photos, opt) {
    opt = opt || {};
    var picked = opt.photos || sample(photos, opt.n || 12);
    var out = [], fail = 0;
    for (var i = 0; i < picked.length; i++) {
      if (opt.onProgress) opt.onProgress(i + 1, picked.length, picked[i]);
      try {
        var o = await observeOne(picked[i], opt);
        out.push(o);
      } catch (e) {
        fail++;
        out.push({ id: picked[i].id, name: picked[i].name || picked[i].id, error: String(e && e.message || e),
          scene: { type: 'unknown', confidence: 'low' }, subjects: [], people: { count: 0, prominent: false },
          crowding: 'empty', focus: 'none', mood: [], unknown: ['观察失败：' + (e && e.code || 'error')] });
      }
    }
    return { photos: picked, obs: out, failed: fail, model: (out[0] && out[0].model) || '' };
  }

  /* ---------- relationships ---------- */
  var STOP = { '一个': 1, '没有': 1, '画面': 1, '照片': 1, '左侧': 1, '右侧': 1, '中央': 1, '背景': 1, '前景': 1, 'the': 1, 'and': 1 };

  function words(s) {
    if (!s) return [];
    var clean = String(s).replace(/[，。、；：,.;:"'()（）\[\]【】]/g, ' ').toLowerCase();
    return clean.split(/\s+/).filter(function (w) { return w && w.length > 1 && !STOP[w]; });
  }

  function jaccard(a, b) {
    var A = {}, B = {}, n = 0, u = 0;
    a.forEach(function (x) { A[x] = 1; });
    b.forEach(function (x) { B[x] = 1; });
    Object.keys(A).forEach(function (k) { if (B[k]) n++; });
    Object.keys(A).concat(Object.keys(B)).forEach(function (k) { if (!(A[k] && B[k])) u++; });
    return (n + u) === 0 ? 0 : n / (n + u);
  }

  function fp(photo) { return M.ART ? M.ART.finger(photo) : null; }

  function rel(a, b, photos) {
    var pa = photos[a], pb = photos[b];
    var oa = CACHE[pa.id + ':v2'], ob = CACHE[pb.id + ':v2'];
    if (!oa || !ob) return null;
    var edges = [];

    /* --- content --- */
    if (oa.scene && ob.scene && oa.scene.type !== 'unknown' && oa.scene.type === ob.scene.type) {
      var weak = oa.scene.confidence === 'low' || ob.scene.confidence === 'low';
      edges.push({
        type: 'same_scene_type', kind: 'content',
        conf: weak ? 'low' : 'mid',
        why: '两张都被读成 ' + oa.scene.type + '（置信 ' + oa.scene.confidence + ' / ' + ob.scene.confidence + '）',
        alt: '相同场景类型也可能只是巧合：都是"海岸"不等于同一片海'
      });
    }
    if (oa.scene && ob.scene && oa.scene.place && ob.scene.place &&
        oa.scene.place === ob.scene.place && !GENERIC_PLACE.test(oa.scene.place)) {
      edges.push({ type: 'same_place', kind: 'content', conf: 'mid',
        why: '两张都读到了同一个地名或招牌：' + oa.scene.place + '（仅凭画面文字，未用 EXIF）',
        alt: '同名地点可能是不同日子；模型也可能把招牌读错' });
    }
    var subA = (oa.subjects || []).map(function (s) { return s.what; }).join(' ');
    var subB = (ob.subjects || []).map(function (s) { return s.what; }).join(' ');
    var ov = jaccard(words(subA), words(subB));
    if (ov >= 0.3) {
      edges.push({ type: 'shared_subject', kind: 'content', conf: ov > 0.5 ? 'mid' : 'low',
        why: '主要主体有 ' + Math.round(ov * 100) + '% 词重叠（' + subA.slice(0, 12) + ' / ' + subB.slice(0, 12) + '）',
        alt: '词重叠来自同一个大类（如"天空""海面"），不代表同一个对象' });
    }
    if (oa.action && ob.action && !GENERIC_ACTION.test(oa.action) && !GENERIC_ACTION.test(ob.action) &&
        jaccard(words(oa.action), words(ob.action)) >= 0.45) {
      edges.push({ type: 'same_activity', kind: 'content', conf: 'low',
        why: '动作描述相近：' + oa.action.slice(0, 14) + ' / ' + ob.action.slice(0, 14),
        alt: '动作相似只说明行为类别接近' });
    }
    if (oa.people && ob.people && oa.people.count && ob.people.count) {
      var na = words(oa.people.note), nb = words(ob.people.note);
      var pj = jaccard(na, nb);
      // "站立 / 站立" is not a person match: require a real description on both sides
      if (pj >= 0.4 && na.length >= 2 && nb.length >= 2 &&
          (oa.people.note || '').length >= 6 && (ob.people.note || '').length >= 6) {
        edges.push({ type: 'possibly_same_person', kind: 'content', conf: 'low',
          why: '人物描述词重合 ' + Math.round(pj * 100) + '%（' + (oa.people.note || '').slice(0, 16) + ' / ' + (ob.people.note || '').slice(0, 16) + '）',
          alt: '这是全实验里最不可靠的一条：衣着、发型相似不等于同一人，模型没有身份识别能力' });
      }
    }

    /* --- visual, measured not guessed --- */
    var fa = fp(pa), fb = fp(pb);
    if (fa && fb) {
      var dl = Math.abs(fa.l - fb.l);
      var dcontrast = Math.abs(fa.contrast - fb.contrast);
      var dsat = Math.abs(fa.sat - fb.sat);
      if (dl < 0.09 && dsat < 0.07) {
        edges.push({ type: 'light_echo', kind: 'visual', conf: 'high',
          why: '实测亮度 ' + fa.l.toFixed(2) + ' / ' + fb.l.toFixed(2) + '，饱和 ' + fa.sat.toFixed(2) + ' / ' + fb.sat.toFixed(2) + '，同一档光',
          alt: '光线一致只保证并置不打架，不保证意义相连' });
      }
      if (Math.abs(dcontrast) > 0.28) {
        edges.push({ type: 'contrast_pair', kind: 'visual', conf: 'high',
          why: '明暗跨度差 ' + dcontrast.toFixed(2) + '：一张高反差、一张平，并置会形成节奏',
          alt: '反差大也可能只是曝光不同' });
      }
      /* 画幅比相等是排版事实，不是关系：整组同比例时会产出 N×(N−1)/2 条
         无用边，所以这里不再把它当成一条关系。 */
    }
    return edges.length ? { a: pa.id, b: pb.id, aName: pa.name, bName: pb.name, edges: edges } : null;
  }

  function relations(photos, obsList) {
    var byId = {};
    photos.forEach(function (p, i) { byId[p.id] = i; });
    obsList.forEach(function (o) { CACHE[o.id + ':v2'] = CACHE[o.id + ':v2'] || o; });
    var ids = obsList.filter(function (o) { return !o.error; }).map(function (o) { return byId[o.id]; })
      .filter(function (i) { return i != null; });
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        var r = rel(ids[i], ids[j], photos);
        if (r) out.push(r);
      }
    }
    return out.sort(function (x, y) {
      var rank = { high: 3, mid: 2, low: 1 };
      var sx = Math.max.apply(null, x.edges.map(function (e) { return rank[e.conf]; }));
      var sy = Math.max.apply(null, y.edges.map(function (e) { return rank[e.conf]; }));
      return sy - sx || y.edges.length - x.edges.length;
    });
  }

  /* ---------- two orderings, each with its own logic ---------- */
  function sequences(photos, obsList, rels) {
    var byId = {};
    obsList.forEach(function (o) { byId[o.id] = o; });
    var live = photos.filter(function (p) { return byId[p.id] && !byId[p.id].error; });

    /* A. by scene: environment first, then people, then details, ends on a quiet frame */
    var rankScene = { coast: 0, landscape: 0, architecture: 1, street: 1, interior: 1, people: 2, food: 3, object: 3, night: 4, other: 3, unknown: 5 };
    var A = live.slice().sort(function (x, y) {
      var ax = rankScene[byId[x.id].scene.type] == null ? 5 : rankScene[byId[x.id].scene.type];
      var ay = rankScene[byId[y.id].scene.type] == null ? 5 : rankScene[byId[y.id].scene.type];
      return ax - ay;
    });

    /* B. by visual rhythm: quiet → build → dense → rest, using measured busy-ness */
    var busy = function (p) { var f = fp(p); return f ? f.l * 0 + (p.detail || 0.5) : 0.5; };
    var B = live.slice().sort(function (x, y) { return busy(x) - busy(y); });
    var dense = B.splice(Math.max(1, Math.round(B.length * 0.45)), Math.round(B.length * 0.25));
    var rest = B.pop();
    B = B.slice(0, Math.floor(B.length / 2)).concat(dense).concat(B.slice(Math.floor(B.length / 2)));
    if (rest) B.push(rest);

    /* C. by visual echoes: start from the strongest edges and let each photo
       unfold from the last, unvisited one it echoes most */
    var adj = {};
    rels.forEach(function (r) {
      var w = r.edges.reduce(function (s, e) { return s + (e.conf === 'high' ? 3 : e.conf === 'mid' ? 2 : 1); }, 0);
      (adj[r.a] = adj[r.a] || []).push({ id: r.b, w: w });
      (adj[r.b] = adj[r.b] || []).push({ id: r.a, w: w });
    });
    var C = [], seen = {};
    var start = live.slice().sort(function (x, y) { return (adj[y.id] || []).length - (adj[x.id] || []).length; })[0];
    if (start) {
      C.push(start); seen[start.id] = 1;
      for (var step = 0; step < live.length - 1; step++) {
        var last = C[C.length - 1];
        var next = (adj[last.id] || []).filter(function (n) { return !seen[n.id]; })
          .sort(function (m, n) { return n.w - m.w; })[0];
        if (!next) next = live.filter(function (p) { return !seen[p.id]; })[0];
        if (!next) break;
        C.push(next); seen[next.id] = 1;
      }
    }

    function pack(seq, name, idea, why) {
      return {
        name: name, idea: idea, why: why,
        ids: seq.map(function (p) { return p.id; }),
        names: seq.map(function (p) { return p.name || p.id; }),
        beats: seq.map(function (p, i) {
          var o = byId[p.id];
          return {
            i: i + 1, id: p.id, name: p.name,
            scene: o.scene.type, mood: (o.mood || []).join(' '),
            note: (o.subjects || []).map(function (s) { return s.what; }).slice(0, 2).join(' / ')
          };
        })
      };
    }

    return [
      pack(A, '按场景组组', '环境 → 人 → 细节',
        '先establish空间（海岸/landscape），再进人，最后落细节与物件；适合"这趟去了哪里"的读法。'),
      pack(B, '按视觉节奏', '安静 → 推进 → 密集 → 停顿',
        '按实测的明暗与繁忙度排序，中间插入最密的一段，最后用一张最松弛的收住；适合不带解说词地翻。'),
      pack(C, '按视觉呼应串起来', '每一张都被上一张"叫"出来',
        '从关系最强的照片出发，每次接上与之呼应最强且尚未出现的照片；适合做对页与跨页的连续性。')
    ];
  }

  M.OBS = {
    SCHEMA: SCHEMA,
    sample: sample,
    observeOne: observeOne,
    observeAll: observeAll,
    relations: relations,
    sequences: sequences,
    corpus: function () { return CACHE; }
  };
})(window.MEM);
