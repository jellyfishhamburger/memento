/* Storage: the only place that touches IndexedDB.
   Nothing here knows what a page looks like — it stores blobs and JSON. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var DB_NAME = 'memento-db';
  var DB_VERSION = 1;
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('photos')) {
          var ph = db.createObjectStore('photos', { keyPath: 'id' });
          ph.createIndex('importedAt', 'importedAt');
          ph.createIndex('starred', 'starred');
        }
        if (!db.objectStoreNames.contains('projects')) {
          var pr = db.createObjectStore('projects', { keyPath: 'id' });
          pr.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('versions')) {
          var ve = db.createObjectStore('versions', { keyPath: 'id' });
          ve.createIndex('projectId', 'projectId');
          ve.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('prefs')) {
          db.createObjectStore('prefs', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB 打不开')); };
      req.onblocked = function () { reject(new Error('indexedDB 被另一个标签页占用')); };
    });
    return dbp;
  }

  function tx(stores, mode) {
    return open().then(function (db) {
      return db.transaction(stores, mode || 'readonly');
    });
  }
  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }
  function done(t) {
    return new Promise(function (resolve, reject) {
      t.oncomplete = function () { resolve(true); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error || new Error('事务被中断')); };
    });
  }

  function uid(prefix) {
    return (prefix || 'x') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- photos ---------------- */
  var api = {
    uid: uid,

    init: function () { return open().then(function () { return true; }); },

    putPhoto: function (rec) {
      return tx(['photos'], 'readwrite').then(function (t) {
        t.objectStore('photos').put(rec);
        return done(t).then(function () { return rec; });
      });
    },
    getPhoto: function (id) {
      return tx(['photos']).then(function (t) { return wrap(t.objectStore('photos').get(id)); });
    },
    getAllPhotos: function () {
      return tx(['photos']).then(function (t) { return wrap(t.objectStore('photos').getAll()); });
    },
    countPhotos: function () {
      return tx(['photos']).then(function (t) { return wrap(t.objectStore('photos').count()); });
    },
    setStarred: function (id, starred) {
      return api.getPhoto(id).then(function (p) {
        if (!p) return null;
        p.starred = !!starred;
        return api.putPhoto(p);
      });
    },
    deletePhoto: function (id) {
      return tx(['photos'], 'readwrite').then(function (t) {
        t.objectStore('photos').delete(id);
        return done(t);
      });
    },
    /* which projects use this photo? (read-only walk, cheap at this size) */
    projectsUsingPhoto: function (photoId) {
      return api.listProjects().then(function (list) {
        var hits = [];
        return api.listVersions().then(function (versions) {
          list.forEach(function (pr) {
            var own = versions.filter(function (v) { return v.projectId === pr.id; });
            var used = own.some(function (v) {
              var snap = v.snapshot;
              if (!snap || !snap.pages) return false;
              return snap.pages.some(function (pg) {
                return (pg.frames || []).some(function (f) { return f.p === photoId; });
              });
            });
            if (used) hits.push(pr);
          });
          return hits;
        });
      });
    },

    /* ---------------- projects ---------------- */
    createProject: function (opt) {
      opt = opt || {};
      var now = Date.now();
      var pr = {
        id: uid('pr'),
        title: opt.title || '未命名的一卷',
        kind: opt.kind || 'social',      // 'social' (9 images) | 'memory' (a long book)
        type: opt.type || 'zine',
        designDirection: opt.designDirection || 'zine',
        createdAt: now,
        updatedAt: now,
        currentVersionId: null,
        coverPhotoId: opt.coverPhotoId || null,
        settings: opt.settings || {},
        texts: opt.texts || {},
        schemaVersion: 1
      };
      return tx(['projects'], 'readwrite').then(function (t) {
        t.objectStore('projects').put(pr);
        return done(t).then(function () { return pr; });
      });
    },
    updateProject: function (id, patch) {
      return api.getProject(id).then(function (pr) {
        if (!pr) return null;
        Object.keys(patch || {}).forEach(function (k) { pr[k] = patch[k]; });
        pr.updatedAt = Date.now();
        return tx(['projects'], 'readwrite').then(function (t) {
          t.objectStore('projects').put(pr);
          return done(t).then(function () { return pr; });
        });
      });
    },
    putProject: function (pr) {
      return tx(['projects'], 'readwrite').then(function (t) {
        t.objectStore('projects').put(pr);
        return done(t).then(function () { return pr; });
      });
    },
    getProject: function (id) {
      return tx(['projects']).then(function (t) { return wrap(t.objectStore('projects').get(id)); });
    },
    listProjects: function () {
      return tx(['projects']).then(function (t) { return wrap(t.objectStore('projects').getAll()); })
        .then(function (list) {
          return list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        });
    },
    deleteProject: function (id) {
      return api.listVersions(id).then(function (vs) {
        return tx(['versions'], 'readwrite').then(function (t) {
          vs.forEach(function (v) { t.objectStore('versions').delete(v.id); });
          return done(t);
        });
      }).then(function () {
        return tx(['projects'], 'readwrite').then(function (t) {
          t.objectStore('projects').delete(id);
          return done(t);
        });
      });
    },
    duplicateProject: function (id) {
      return api.getProject(id).then(function (src) {
        if (!src) throw new Error('原作品不存在');
        return api.listVersions(id).then(function (vs) {
          return api.createProject({
            title: src.title + ' 副本',
            kind: src.kind || 'social',
            type: src.type,
            designDirection: src.designDirection,
            coverPhotoId: src.coverPhotoId,
            settings: JSON.parse(JSON.stringify(src.settings || {})),
            texts: JSON.parse(JSON.stringify(src.texts || {}))
          }).then(function (copy) {
            var chain = Promise.resolve();
            vs.sort(function (a, b) { return a.versionNumber - b.versionNumber; })
              .forEach(function (v) {
                chain = chain.then(function () {
                  return api.saveVersion(copy.id, v.snapshot, v.description, {
                    isAutoSaved: v.isAutoSaved, number: v.versionNumber
                  });
                });
              });
            return chain.then(function () { return copy; });
          });
        });
      });
    },

    /* ---------------- versions ---------------- */
    saveVersion: function (projectId, snapshot, description, opt) {
      opt = opt || {};
      return api.listVersions(projectId).then(function (list) {
        // the rolling draft does not consume a version number
        var manual = list.filter(function (v) { return !v.isAutoSaved; });
        var n = opt.number || (manual.reduce(function (a, v) { return Math.max(a, v.versionNumber || 0); }, 0) + 1);
        var v = {
          id: uid('v'),
          projectId: projectId,
          versionNumber: n,
          createdAt: Date.now(),
          description: description || '',
          snapshot: snapshot,
          isAutoSaved: !!opt.isAutoSaved
        };
        return tx(['versions'], 'readwrite').then(function (t) {
          t.objectStore('versions').put(v);
          return done(t).then(function () { return v; });
        });
      });
    },
    /* one rolling draft per project: overwrite, never pile up */
    saveDraft: function (projectId, snapshot) {
      return api.listVersions(projectId).then(function (list) {
        var draft = list.filter(function (v) { return v.isAutoSaved; })[0];
        var base = list.filter(function (v) { return !v.isAutoSaved; })
          .reduce(function (a, v) { return Math.max(a, v.versionNumber || 0); }, 0);
        var v = draft || { id: uid('v'), projectId: projectId, versionNumber: base + 1, description: '自动保存', isAutoSaved: true };
        v.snapshot = snapshot;
        v.createdAt = Date.now();
        return tx(['versions'], 'readwrite').then(function (t) {
          t.objectStore('versions').put(v);
          return done(t).then(function () { return v; });
        });
      });
    },
    listVersions: function (projectId) {
      return tx(['versions']).then(function (t) { return wrap(t.objectStore('versions').getAll()); })
        .then(function (all) {
          var list = projectId ? all.filter(function (v) { return v.projectId === projectId; }) : all;
          return list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        });
    },
    getVersion: function (id) {
      return tx(['versions']).then(function (t) { return wrap(t.objectStore('versions').get(id)); });
    },
    deleteVersion: function (id) {
      return tx(['versions'], 'readwrite').then(function (t) {
        t.objectStore('versions').delete(id);
        return done(t);
      });
    },

    /* ---------------- preferences ---------------- */
    getPref: function (key, fallback) {
      return tx(['prefs']).then(function (t) { return wrap(t.objectStore('prefs').get(key)); })
        .then(function (r) { return r ? r.value : fallback; });
    },
    setPref: function (key, value) {
      return tx(['prefs'], 'readwrite').then(function (t) {
        t.objectStore('prefs').put({ key: key, value: value });
        return done(t).then(function () { return value; });
      });
    },

    /* ---------------- quota ---------------- */
    estimate: function () {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
      return navigator.storage.estimate().then(function (e) {
        return { usage: e.usage || 0, quota: e.quota || 0, pct: e.quota ? (e.usage / e.quota) : 0 };
      }).catch(function () { return null; });
    },
    persist: function () {
      if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
      return navigator.storage.persisted().then(function (already) {
        if (already) return true;
        return navigator.storage.persist();
      }).catch(function () { return false; });
    },
    persisted: function () {
      if (!navigator.storage || !navigator.storage.persisted) return Promise.resolve(false);
      return navigator.storage.persisted().catch(function () { return false; });
    },

    /* ---------------- wipe (tests / settings) ---------------- */
    clearAll: function () {
      return open().then(function (db) {
        return Promise.all(['photos', 'projects', 'versions', 'prefs'].map(function (name) {
          return new Promise(function (res, rej) {
            var t = db.transaction([name], 'readwrite');
            t.objectStore(name).clear();
            t.oncomplete = res; t.onerror = function () { rej(t.error); };
          });
        }));
      });
    }
  };

  M.STORE = api;
})(window.MEM);
