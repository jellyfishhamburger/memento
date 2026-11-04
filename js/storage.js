/* Storage: the only place that touches IndexedDB.
   Nothing here knows what a page looks like — it stores blobs and JSON. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var DB_NAME = 'memento-db';
  var DB_VERSION = 2;
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
        /* v2: collections are the layer between photos and books.
           photos/projects/versions are left exactly as they were. */
        if (!db.objectStoreNames.contains('collections')) {
          var co = db.createObjectStore('collections', { keyPath: 'id' });
          co.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('collectionPhotos')) {
          var cp = db.createObjectStore('collectionPhotos', { keyPath: 'id' });
          cp.createIndex('collectionId', 'collectionId');
          cp.createIndex('photoId', 'photoId');
        }
        if (!db.objectStoreNames.contains('bookPhotos')) {
          var bp = db.createObjectStore('bookPhotos', { keyPath: 'id' });
          bp.createIndex('bookId', 'bookId');
          bp.createIndex('photoId', 'photoId');
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

    /* ---------------- collections (v2) ---------------- */
    createCollection: function (opt) {
      opt = opt || {};
      var now = Date.now();
      var co = {
        id: uid('co'),
        name: opt.name || '未命名的集合',
        description: opt.description || '',
        coverPhotoId: opt.coverPhotoId || null,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 2
      };
      return tx(['collections'], 'readwrite').then(function (t) {
        t.objectStore('collections').put(co);
        return done(t).then(function () { return co; });
      });
    },
    getCollection: function (id) {
      return tx(['collections']).then(function (t) { return wrap(t.objectStore('collections').get(id)); });
    },
    listCollections: function () {
      return tx(['collections']).then(function (t) { return wrap(t.objectStore('collections').getAll()); })
        .then(function (list) { return list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); });
    },
    updateCollection: function (id, patch) {
      return api.getCollection(id).then(function (co) {
        if (!co) return null;
        Object.keys(patch || {}).forEach(function (k) { co[k] = patch[k]; });
        co.updatedAt = Date.now();
        return tx(['collections'], 'readwrite').then(function (t) {
          t.objectStore('collections').put(co);
          return done(t).then(function () { return co; });
        });
      });
    },
    /* deleting a collection removes the links, never the photos, never a book */
    deleteCollection: function (id) {
      return api.listCollectionPhotos(id).then(function (links) {
        // remember these photos: the user took them out on purpose, so the
        // self-healing pass must not put them straight back into a new one
        return api.getPref('noAutoGroup', []).then(function (prev) {
          var set = {};
          (prev || []).forEach(function (x) { set[x] = 1; });
          links.forEach(function (l) { set[l.photoId] = 1; });
          return api.setPref('noAutoGroup', Object.keys(set));
        }).then(function () { return links; });
        return tx(['collectionPhotos'], 'readwrite').then(function (t) {
          links.forEach(function (l) { t.objectStore('collectionPhotos').delete(l.id); });
          return done(t);
        });
      }).then(function () {
        return tx(['collections'], 'readwrite').then(function (t) {
          t.objectStore('collections').delete(id);
          return done(t);
        });
      });
    },
    addToCollection: function (collectionId, photoIds) {
      var ids = (photoIds || []).slice();
      return api.listCollectionPhotos(collectionId).then(function (existing) {
        var have = {};
        existing.forEach(function (l) { have[l.photoId] = 1; });
        var order = existing.reduce(function (a, l) { return Math.max(a, l.order || 0); }, 0);
        var added = [];
        ids.forEach(function (pid) {
          if (have[pid]) return;
          added.push({
            id: collectionId + ':' + pid,
            collectionId: collectionId,
            photoId: pid,
            starred: false,
            order: ++order,
            addedAt: Date.now()
          });
        });
        if (!added.length) return { added: 0 };
        return tx(['collectionPhotos'], 'readwrite').then(function (t) {
          added.forEach(function (l) { t.objectStore('collectionPhotos').put(l); });
          return done(t).then(function () { return { added: added.length }; });
        });
      }).then(function (res) {
        return api.getCollection(collectionId).then(function (co) {
          if (co && !co.coverPhotoId && ids.length) {
            return api.updateCollection(collectionId, { coverPhotoId: ids[0] }).then(function () { return res; });
          }
          return res;
        });
      });
    },
    removeFromCollection: function (collectionId, photoId) {
      return tx(['collectionPhotos'], 'readwrite').then(function (t) {
        t.objectStore('collectionPhotos').delete(collectionId + ':' + photoId);
        return done(t).then(function () { return true; });
      });
    },
    listCollectionPhotos: function (collectionId) {
      return tx(['collectionPhotos']).then(function (t) {
        return wrap(t.objectStore('collectionPhotos').index('collectionId').getAll(collectionId));
      }).then(function (list) { return list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); });
    },
    setCollectionStar: function (collectionId, photoId, starred) {
      var key = collectionId + ':' + photoId;
      return tx(['collectionPhotos'], 'readwrite').then(function (t) {
        var st = t.objectStore('collectionPhotos');
        var req = st.get(key);
        req.onsuccess = function () {
          var l = req.result;
          if (l) { l.starred = !!starred; st.put(l); }
        };
        return done(t).then(function () { return true; });
      });
    },
    collectionsOfPhoto: function (photoId) {
      return tx(['collectionPhotos']).then(function (t) {
        return wrap(t.objectStore('collectionPhotos').index('photoId').getAll(photoId));
      });
    },
    /* every photo not linked to any collection (so nothing becomes invisible) */
    photosWithoutCollection: function () {
      return Promise.all([api.getAllPhotos(), tx(['collectionPhotos']).then(function (t) {
        return wrap(t.objectStore('collectionPhotos').getAll());
      })]).then(function (r) {
        var linked = {};
        r[1].forEach(function (l) { linked[l.photoId] = 1; });
        return r[0].filter(function (p) { return !linked[p.id]; });
      });
    },

    /* Self-healing grouping: any photo that belongs to no collection gets
       folded into a dated collection. Runs before the collections view opens,
       so imports (and old data) always end up organised without a special
       code path. Idempotent — photos already linked are left alone. */
    reconcileCollections: function () {
      return Promise.all([api.getAllPhotos(), api.listCollections(),
        tx(['collectionPhotos']).then(function (t) {
          return wrap(t.objectStore('collectionPhotos').getAll());
        })]).then(function (r) {
        var photos = r[0], colls = r[1], links = r[2];
        var linked = {};
        links.forEach(function (l) { linked[l.photoId] = 1; });
        var loose = photos.filter(function (p) { return !linked[p.id]; });
        if (!loose.length) return { created: 0, linked: 0 };

        return api.getPref('noAutoGroup', []).then(function (skipIds) {
        var skip = {};
        (skipIds || []).forEach(function (x) { skip[x] = 1; });
        loose = loose.filter(function (p) { return !skip[p.id]; });
        if (!loose.length) return { created: 0, linked: 0 };

        var byDay = {};
        loose.forEach(function (p) {
          var t = p.takenAt || p.importedAt || p.createdAt || Date.now();
          var d = new Date(t);
          var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
          (byDay[key] = byDay[key] || []).push(p);
        });
        var made = 0, put = 0;
        var chain = Promise.resolve();
        Object.keys(byDay).sort().forEach(function (key) {
          chain = chain.then(function () {
            var group = byDay[key].sort(function (a, b) {
              return (a.takenAt || a.importedAt || 0) - (b.takenAt || b.importedAt || 0);
            });
            var label = key.slice(5, 7).replace(/^0/, '') + '月' + key.slice(8).replace(/^0/, '') + '日 的 ' + group.length + ' 张';
            var same = colls.filter(function (c) { return c.name === label; })[0];
            var mk = same ? Promise.resolve(same) : api.createCollection({ name: label, coverPhotoId: group[0].id });
            return mk.then(function (co) {
              if (!same) made++;
              return api.addToCollection(co.id, group.map(function (p) { return p.id; })).then(function (res) {
                put += (res && res.added) || 0;
                return api.listCollectionPhotos(co.id).then(function (ls) {
                  var starred = group.filter(function (p) { return p.starred; });
                  return starred.reduce(function (pr, p) { return pr.then(function () { return api.setCollectionStar(co.id, p.id, true); }); }, Promise.resolve());
                });
              });
            });
          });
        });
        return chain.then(function () { return { created: made, linked: put }; });
        });
      });
    },

    /* ---------------- book ↔ photo (v2) ---------------- */
    /* the relation table is the source of truth; projects.settings.photoIds is
       still written for older snapshots, never read first */
    setBookPhotos: function (bookId, photoIds) {
      var ids = (photoIds || []).slice();
      return api.listBookPhotos(bookId).then(function (existing) {
        return tx(['bookPhotos'], 'readwrite').then(function (t) {
          var st = t.objectStore('bookPhotos');
          var keep = {};
          ids.forEach(function (pid, i) {
            keep[pid] = 1;
            var prev = existing.filter(function (l) { return l.photoId === pid; })[0];
            if (prev) return;                 // keep hero/order untouched on sync
            st.put({
              id: bookId + ':' + pid, bookId: bookId, photoId: pid,
              hero: false, order: i, addedAt: Date.now()
            });
          });
          existing.forEach(function (l) {
            if (!keep[l.photoId]) st.delete(l.id);
          });
          return done(t).then(function () { return ids.length; });
        });
      });
    },
    listBookPhotos: function (bookId) {
      return tx(['bookPhotos']).then(function (t) {
        return wrap(t.objectStore('bookPhotos').index('bookId').getAll(bookId));
      }).then(function (list) { return list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); });
    },
    setBookHero: function (bookId, photoId, hero) {
      var key = bookId + ':' + photoId;
      return tx(['bookPhotos'], 'readwrite').then(function (t) {
        var st = t.objectStore('bookPhotos');
        var req = st.get(key);
        req.onsuccess = function () {
          var l = req.result;
          if (l) { l.hero = !!hero; st.put(l); }
        };
        return done(t).then(function () { return true; });
      });
    },
    /* which books use this photo — relation table first, old snapshots as fallback */
    booksUsingPhoto: function (photoId) {
      return api.listProjects().then(function (projects) {
        return tx(['bookPhotos']).then(function (t) {
          return wrap(t.objectStore('bookPhotos').index('photoId').getAll(photoId));
        }).then(function (links) {
          var hit = {};
          links.forEach(function (l) { hit[l.bookId] = 1; });
          var ids = Object.keys(hit);
          if (ids.length) return projects.filter(function (p) { return hit[p.id]; });
          /* legacy work without relations: look inside versions */
          return api.listVersions().then(function (versions) {
            return projects.filter(function (pr) {
              return versions.some(function (v) {
                if (v.projectId !== pr.id || !v.snapshot) return false;
                var snap = v.snapshot;
                if ((snap.photoIds || []).indexOf(photoId) >= 0) return true;
                return (snap.pages || []).some(function (pg) {
                  return (pg.frames || []).some(function (f) { return f.p === photoId; });
                });
              });
            });
          });
        });
      });
    },

    /* ---------------- migration v1 → v2 ---------------- */
    /* Idempotent: it only creates what is missing and flips one pref at the end.
       Existing photos/projects/versions are read, never rewritten. */
    migrateV2: function () {
      return api.getPref('migratedV2', null).then(function (doneFlag) {
        if (doneFlag === true) return { skipped: true };
        return api.getAllPhotos().then(function (photos) {
          return api.listProjects().then(function (projects) {
            return api.listVersions().then(function (versions) {
              var byDay = {};
              photos.forEach(function (p) {
                var t = p.importedAt || p.createdAt || Date.now();
                var d = new Date(t);
                var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
                (byDay[key] = byDay[key] || []).push(p);
              });
              var days = Object.keys(byDay).sort();
              var madeColls = 0, madeLinks = 0;
              var chain = Promise.resolve();
              days.forEach(function (key) {
                chain = chain.then(function () {
                  var group = byDay[key].sort(function (a, b) { return (a.importedAt || 0) - (b.importedAt || 0); });
                  var label = key.slice(5).replace('-', '月') + '日 的一批';
                  return api.createCollection({ name: label, coverPhotoId: group[0] ? group[0].id : null })
                    .then(function (co) {
                      madeColls++;
                      return api.addToCollection(co.id, group.map(function (p) { return p.id; }))
                        .then(function () {
                          madeLinks += group.length;
                          var starred = group.filter(function (p) { return p.starred; });
                          return starred.reduce(function (pr, p) {
                            return pr.then(function () { return api.setCollectionStar(co.id, p.id, true); });
                          }, Promise.resolve());
                        });
                    });
                });
              });
              /* books: relations from the newest draft, else from settings */
              var madeBookLinks = 0;
              chain = chain.then(function () {
                return projects.reduce(function (pr, book) {
                  return pr.then(function () {
                    var own = versions.filter(function (v) { return v.projectId === book.id; });
                    var draft = own.filter(function (v) { return v.isAutoSaved; })[0] ||
                      own.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
                    var ids = (draft && draft.snapshot && draft.snapshot.photoIds) ||
                      ((book.settings || {}).photoIds) || [];
                    if (!ids.length) return null;
                    madeBookLinks += ids.length;
                    return api.setBookPhotos(book.id, ids).then(function () {
                      var starred = photos.filter(function (p) { return ids.indexOf(p.id) >= 0 && p.starred; });
                      return starred.reduce(function (x, p) {
                        return x.then(function () { return api.setBookHero(book.id, p.id, true); });
                      }, Promise.resolve());
                    });
                  });
                }, Promise.resolve());
              });
              return chain.then(function () {
                var report = {
                  at: Date.now(), collections: madeColls, collectionLinks: madeLinks,
                  books: projects.length, bookLinks: madeBookLinks
                };
                return api.setPref('migratedV2', true).then(function () {
                  return api.setPref('migratedV2Report', report).then(function () { return report; });
                });
              });
            });
          });
        });
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
        return Promise.all(['photos', 'projects', 'versions', 'prefs',
          'collections', 'collectionPhotos', 'bookPhotos'].map(function (name) {
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
