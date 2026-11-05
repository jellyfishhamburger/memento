/* Object URL lifecycle.
   One blob → one URL, shared by every view that shows it.
   Released only when the last holder lets go, so scrolling and re-rendering
   never leaks hundreds of URLs. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var urls = {};       // photoId -> { url, refs }
  var made = 0, freed = 0, peak = 0;

  function make(blob) {
    made++;
    return URL.createObjectURL(blob);
  }

  var OBJ = {
    /* idempotent: asking twice for the same photo costs nothing */
    acquire: function (id, blob) {
      if (!blob) return null;
      var slot = urls[id];
      if (!slot) {
        slot = urls[id] = { url: make(blob), refs: 0 };
        peak = Math.max(peak, Object.keys(urls).length);
      }
      slot.refs++;
      return slot.url;
    },
    peek: function (id) {
      return urls[id] ? urls[id].url : null;
    },
    release: function (id) {
      var slot = urls[id];
      if (!slot) return;
      slot.refs--;
      if (slot.refs <= 0) {
        URL.revokeObjectURL(slot.url);
        delete urls[id];
        freed++;
      }
    },
    /* for a full teardown: switching project, importing a new book */
    releaseAll: function () {
      Object.keys(urls).forEach(function (id) {
        URL.revokeObjectURL(urls[id].url);
        freed++;
      });
      urls = {};
    },
    stats: function () {
      return { live: Object.keys(urls).length, made: made, freed: freed, peak: peak };
    }
  };

  M.OBJ = OBJ;
})(window.MEM);
