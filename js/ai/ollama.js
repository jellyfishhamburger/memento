/* Ollama adapter: the only place that talks to localhost:11434.
   Everything here fails soft — no model, no problem, the app keeps working. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.AI = M.AI || {};

  var BASE_KEY = 'memento.ai.base';
  var MODEL_KEY = 'memento.ai.model';

  function base() {
    try { return localStorage.getItem(BASE_KEY) || 'http://127.0.0.1:11434'; }
    catch (e) { return 'http://127.0.0.1:11434'; }
  }
  function setBase(v) {
    try { localStorage.setItem(BASE_KEY, v.replace(/\/+$/, '')); } catch (e) {}
  }
  function model() {
    try { return localStorage.getItem(MODEL_KEY) || ''; } catch (e) { return ''; }
  }
  function setModel(v) {
    try { localStorage.setItem(MODEL_KEY, v); } catch (e) {}
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(Object.assign(new Error('超时'), { code: 'timeout' })); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
        function (e) { clearTimeout(t); reject(e); });
    });
  }

  function classify(err) {
    if (!err) return 'unknown';
    if (err.code === 'timeout') return 'timeout';
    if (err.name === 'AbortError') return 'timeout';
    var msg = String(err.message || err);
    if (/Failed to fetch|NetworkError|Load failed|ERR_CONNECTION/.test(msg)) return 'offline';
    return 'error';
  }

  var api = {
    base: base, setBase: setBase,
    model: model, setModel: setModel,

    /* is anything listening? */
    async health(timeout) {
      try {
        var r = await withTimeout(fetch(base() + '/api/tags', { method: 'GET' }), timeout || 2500);
        if (!r.ok) return { ok: false, code: 'error', detail: 'HTTP ' + r.status };
        var data = await r.json();
        var models = (data.models || []).map(function (m) { return m.name; });
        return { ok: true, models: models };
      } catch (e) {
        return { ok: false, code: classify(e), detail: String(e && e.message || e) };
      }
    },

    /* one structured-output call */
    async chat(opt) {
      var body = {
        model: opt.model || model() || 'qwen2.5vl:3b',
        stream: false,
        format: opt.schema || undefined,
        options: { temperature: opt.temperature == null ? 0.85 : opt.temperature, top_p: 0.9, num_predict: 1200 }
      };
      body.messages = opt.messages;
      var r;
      try {
        r = await withTimeout(fetch(base() + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }), opt.timeout || 60000);
      } catch (e) {
        throw Object.assign(new Error('连不上本地的 Ollama'), { code: classify(e) });
      }
      if (!r.ok) {
        var text = '';
        try { text = await r.text(); } catch (e) {}
        var code = r.status === 404 ? 'model' : 'error';
        throw Object.assign(new Error('Ollama 返回 ' + r.status + (text ? '：' + text.slice(0, 160) : '')), { code: code });
      }
      var data = await r.json();
      var content = (data.message && data.message.content) || data.response || '';
      return { raw: content, model: body.model };
    },

    /* parse defensively: a small model sometimes wraps JSON in prose */
    parseJSON(text) {
      if (!text) throw Object.assign(new Error('模型没有返回内容'), { code: 'empty' });
      var s = String(text).trim();
      var start = s.indexOf('{'), end = s.lastIndexOf('}');
      if (start >= 0 && end > start) s = s.slice(start, end + 1);
      try { return JSON.parse(s); }
      catch (e) {
        throw Object.assign(new Error('模型返回的不是合法 JSON'), { code: 'json', detail: s.slice(0, 200) });
      }
    }
  };

  M.AI.ollama = api;
})(window.MEM);
