/* Provider: decides who writes the words. Local Ollama only, always optional.
   Nothing here is called by import, layout or export — only by an explicit tap. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';
  M.AI = M.AI || {};

  var state = { checked: false, ok: false, code: 'idle', models: [] };

  var api = {
    status: function () { return state; },

    async check(force) {
      if (state.checked && !force) return state;
      var h = await M.AI.ollama.health();
      state = {
        checked: true, ok: !!h.ok, code: h.ok ? 'ready' : h.code,
        models: h.models || [], detail: h.detail || ''
      };
      if (state.ok && !M.AI.ollama.model() && state.models.length) {
        // prefer a vision-capable small model if it is there, else whatever is first
        var pick = state.models.filter(function (m) { return /vl|vision|llava/i.test(m); })[0] || state.models[0];
        M.AI.ollama.setModel(pick);
      }
      return state;
    },

    /* a sentence the UI can show without jargon */
    explain: function () {
      if (state.ok) return '本地模型：' + (M.AI.ollama.model() || '未选择');
      if (state.code === 'offline') return '本机没有在跑 Ollama（文字灵感需要它）';
      if (state.code === 'timeout') return 'Ollama 没有响应（可能卡住了）';
      if (state.code === 'model') return '模型不存在，换一个再试';
      return 'AI 暂时用不了，可以先用内置模板';
    },

    async baseUrl() { return M.AI.ollama.base(); }
  };

  M.AI.provider = api;
})(window.MEM);
