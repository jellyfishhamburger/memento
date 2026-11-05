/* Backup: one .memento file (a zip) with the projects, their versions and the
   photos they reference. Import is all-or-nothing: nothing is written until
   every check has passed. */
window.MEM = window.MEM || {};
(function (M) {
  'use strict';

  var SCHEMA = 1;
  var enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- read a zip (store or deflate) ---------- */
  function readZip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 zip');
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    var out = [];
    var p = cdOff;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 目录损坏');
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      var name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;

      var lNameLen = dv.getUint16(localOff + 26, true);
      var lExtraLen = dv.getUint16(localOff + 28, true);
      var dataStart = localOff + 30 + lNameLen + lExtraLen;
      var raw = bytes.subarray(dataStart, dataStart + compSize);
      out.push({ name: name, method: method, raw: raw });
    }
    return out;
  }

  function inflateRaw(raw) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('这个浏览器不支持解压（需要较新的 Chrome / Safari）');
    }
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function entryBytes(entry) {
    if (entry.method === 0) return Promise.resolve(entry.raw);
    return inflateRaw(entry.raw);
  }

  function entryText(entry) {
    return entryBytes(entry).then(function (b) { return dec.decode(b); });
  }

  /* ---------- export ---------- */
  function safeName(s) {
    return String(s || 'memento').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  }

  function collectPhotoIds(projects) {
    var ids = {};
    projects.forEach(function (pr) {
      (pr.versions || []).forEach(function (v) {
        var snap = v.snapshot || {};
        (snap.photoIds || []).forEach(function (id) { ids[id] = 1; });
        (snap.pages || []).forEach(function (pg) {
          (pg.frames || []).forEach(function (f) { if (f.p) ids[f.p] = 1; });
        });
      });
    });
    return Object.keys(ids);
  }

  M.BACKUP = {
    /* everything: every project + every photo it needs */
    exportAll: async function (opt) {
      opt = opt || {};
      var projects = await M.STORE.listProjects();
      return M.BACKUP.build(projects, opt);
    },
    exportProject: async function (projectId) {
      var pr = await M.STORE.getProject(projectId);
      if (!pr) throw new Error('作品不存在');
      return M.BACKUP.build([pr]);
    },

    build: async function (projects, opt) {
      opt = opt || {};
      var full = [];
      for (var i = 0; i < projects.length; i++) {
        var pr = projects[i];
        var versions = await M.STORE.listVersions(pr.id);
        full.push({
          project: pr,
          versions: versions.map(function (v) {
            return {
              versionNumber: v.versionNumber, createdAt: v.createdAt,
              description: v.description, isAutoSaved: !!v.isAutoSaved,
              snapshot: v.snapshot
            };
          })
        });
      }
      var ids = collectPhotoIds(full.map(function (f) { return { versions: f.versions }; }));
      var files = [];
      var photoManifest = [];
      for (var k = 0; k < ids.length; k++) {
        var row = await M.STORE.getPhoto(ids[k]);
        if (!row) continue;
        var bytes = new Uint8Array(await row.blob.arrayBuffer());
        files.push({ name: 'photos/' + row.id + '.jpg', bytes: bytes });
        if (row.thumbnail) {
          files.push({ name: 'thumbs/' + row.id + '.jpg', bytes: new Uint8Array(await row.thumbnail.arrayBuffer()) });
        }
        photoManifest.push({
          id: row.id, name: row.name, mimeType: row.mimeType,
          width: row.width, height: row.height, fileSize: row.fileSize,
          createdAt: row.createdAt, importedAt: row.importedAt,
          starred: !!row.starred, storedScale: row.storedScale,
          analysis: row.analysis
        });
      }

      var manifest = {
        app: 'memento', schemaVersion: SCHEMA, exportedAt: Date.now(),
        projects: full.map(function (f) { return { id: f.project.id, title: f.project.title, versions: f.versions.length }; }),
        photos: photoManifest
      };
      files.push({ name: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest, null, 1)) });
      files.push({ name: 'projects.json', bytes: enc.encode(JSON.stringify(full, null, 1)) });

      var zip = M.makeZip(files);
      var name = opt.name || (full.length === 1 ? safeName(full[0].project.title) : 'MEMENTO_全部作品') + '.memento';
      return { blob: zip, name: name, size: zip.size, projects: full.length, photos: photoManifest.length, versions: full.reduce(function (a, f) { return a + f.versions.length; }, 0) };
    },

    /* ---------- import ---------- */
    inspect: async function (file) {
      var bytes = new Uint8Array(await file.arrayBuffer());
      var entries = readZip(bytes);
      var byName = {};
      entries.forEach(function (e) { byName[e.name] = e; });
      if (!byName['manifest.json']) throw new Error('这个文件里没有 manifest.json');
      var manifest = JSON.parse(await entryText(byName['manifest.json']));
      if (manifest.app !== 'memento') throw new Error('不是 MEMENTO 的备份');
      if (!(manifest.schemaVersion <= SCHEMA)) {
        throw new Error('备份来自更新的版本（schemaVersion ' + manifest.schemaVersion + '）');
      }
      if (!byName['projects.json']) throw new Error('备份里没有 projects.json');
      var projects = JSON.parse(await entryText(byName['projects.json']));

      // integrity: every photo a version references must be in the archive
      var ids = collectPhotoIds(projects);
      var missing = [];
      ids.forEach(function (id) { if (!byName['photos/' + id + '.jpg']) missing.push(id); });
      return {
        bytes: bytes, entries: byName, manifest: manifest,
        projects: projects, photoIds: ids, missingPhotos: missing
      };
    },

    import: async function (plan, opt) {
      opt = opt || {};
      if (plan.missingPhotos.length && !opt.allowMissing) {
        throw new Error('备份缺 ' + plan.missingPhotos.length + ' 张照片，已取消导入（什么都没改动）');
      }
      // only now does anything get written
      var written = { photos: 0, projects: 0, versions: 0 };
      var idMap = {};
      var photosMeta = {};
      (plan.manifest.photos || []).forEach(function (p) { photosMeta[p.id] = p; });

      for (var i = 0; i < plan.photoIds.length; i++) {
        var pid = plan.photoIds[i];
        var entry = plan.entries['photos/' + pid + '.jpg'];
        if (!entry) continue;
        var bytes = await entryBytes(entry);
        var meta = photosMeta[pid] || {};
        var thumbEntry = plan.entries['thumbs/' + pid + '.jpg'];
        var thumb = thumbEntry ? new Blob([await entryBytes(thumbEntry)], { type: 'image/jpeg' }) : null;
        await M.STORE.putPhoto({
          id: pid,
          name: meta.name || pid,
          mimeType: meta.mimeType || 'image/jpeg',
          fileSize: meta.fileSize || bytes.length,
          width: meta.width, height: meta.height,
          createdAt: meta.createdAt, importedAt: meta.importedAt || Date.now(),
          starred: !!meta.starred, storedScale: meta.storedScale,
          analysis: meta.analysis || {},
          blob: new Blob([bytes], { type: 'image/jpeg' }),
          thumbnail: thumb
        });
        written.photos++;
      }

      for (var j = 0; j < plan.projects.length; j++) {
        var item = plan.projects[j];
        var src = item.project || {};
        var dup = await M.STORE.getProject(src.id);
        var newId = dup ? M.STORE.uid('pr') : src.id;
        idMap[src.id] = newId;
        var pr = {
          id: newId,
          title: dup ? (src.title || '未命名的一卷') + ' (导入)' : (src.title || '未命名的一卷'),
          type: src.type || 'zine',
          designDirection: src.designDirection || 'zine',
          createdAt: src.createdAt || Date.now(),
          updatedAt: Date.now(),
          currentVersionId: null,
          coverPhotoId: src.coverPhotoId || null,
          settings: src.settings || {},
          texts: src.texts || {},
          schemaVersion: 1
        };
        await M.STORE.putProject(pr);
        written.projects++;
        for (var v = 0; v < (item.versions || []).length; v++) {
          var ver = item.versions[v];
          await M.STORE.saveVersion(pr.id, ver.snapshot, ver.description, {
            isAutoSaved: ver.isAutoSaved, number: ver.versionNumber
          });
          written.versions++;
        }
      }
      return written;
    }
  };
})(window.MEM);
