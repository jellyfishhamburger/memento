# MEMENTO

照片进去，一本有排版的书出来。核心是排版引擎，不是模板库。
**Local-first**：照片、作品、版本全部存在你这台机器的浏览器里，不上传，不需要登录。

在线版：https://jellyfishhamburger.github.io/memento/

---

## 一、现在有什么

**排版**
- 两个设计方向：`杂志 Zine`（23 套构图 / 三种方案）、`日式小书 Japanese Minimal`（8 套专属构图）。
- 竖版单页 1080×1440，两页一组当跨页排；横图可以跨过中缝，发出去滑过去连成一整张。
- 每页可单独换构图、可「锁定」不被重排，点任意照片可换图 / 删图 / 拖动调整显示区域。
- 文字是数据：书名、年份、章节词、每页短句，改完立刻重排。

**导出**
- 九张打包成一个 zip（1080×1440 JPG），单次下载；导出后弹出九张缩略图，手机上可逐张长按保存。
- 多页 PDF。

**保存（本轮新增）**
- 照片存进 IndexedDB，刷新、关浏览器、第二天回来都还在。
- 多本作品：新建 / 打开 / 改名 / 复制 / 删除；删作品不动照片库。
- 自动保存（防抖 650ms）+ 手动「保存版本」，版本历史可回滚。
- 完整备份 `.memento`（zip：项目 + 版本 + 用到的照片），可导入到另一台机器。

---

## 二、数据存在哪

数据库 `memento-db`（IndexedDB v1），四张表：

| 表 | 关键字段 | 说明 |
|---|---|---|
| `photos` | `id, blob, thumbnail, original, name, mimeType, width, height, fileSize, createdAt, importedAt, starred, analysis, storedScale` | `blob` 是渲染用的工作副本（长边 1600 JPEG）。原图仅在 ≤8MB 时另存为 `original` |
| `projects` | `id, title, type, designDirection, createdAt, updatedAt, currentVersionId, coverPhotoId, settings, texts, schemaVersion` | `settings = {mode, scheme, count, seed, locked, photoIds}` |
| `versions` | `id, projectId, versionNumber, createdAt, description, snapshot, isAutoSaved` | 每个项目**只有一条** `isAutoSaved` 草稿，被覆盖；手动版本永久保留 |
| `prefs` | `key, value` | 当前方向、上次打开的作品等 |

**版本快照存的是瘦身后的页面模型**，不是排版参数：

```
{ schemaVersion, direction, mode, scheme, count, seed, locked, texts,
  photoIds, coverId, total, pair, units:[{key,start,n}],
  pages:[{ w,h,bg,ink,muted,
           frames:[{p:photoId, x,y,w,h,pad,role,z, crop:{sx,sy,sw,sh}}],
           rects:[...], texts:[...] }] }
```

- 只存 `photoId`，不复制任何图片（9 页约 25–40KB / 版本）。
- 恢复不经过排版引擎：直接把快照还原成页面模型画出来，所以引擎以后怎么改，旧版本的样子都不会变。

**Blob URL 生命周期**：`js/objects.js` 里一个 photoId 只对应一个 Object URL，按引用计数回收。
打开/刷新时从 IndexedDB 取 Blob 再 `createObjectURL`，同一张照片重复渲染不会新增 URL。

---

## 三、代码结构

```
index.html        外壳
css/app.css       界面样式
js/analyze.js     图片分析 + 工作副本（1600 JPEG）与缩略图
js/storage.js     唯一碰 IndexedDB 的地方（photos / projects / versions / prefs / 配额）
js/objects.js     Blob URL 引用计数
js/backup.js      .memento 备份的导出 / 校验 / 导入（zip 读写都在这里）
js/compose.js     构图引擎（不认识数据库，只吃 photos 数组、吐页面模型）
js/render.js      页面模型 → DOM / Canvas（唯一共享的换行测量是 wrapLines）
js/export.js      九张 zip、多页 PDF、手写 zip 打包器
js/app.js         状态、导入、作品库、版本面板、自动保存
js/engine.js      旧作品集引擎（仍在用 cropFor / 分析结果）
js/grid.js        九宫格（当前 UI 未暴露）
```

四层铁律：**排版引擎只生成页面模型；存储层只存 JSON 和 Blob；渲染器只吃页面模型；导出器只吃页面模型。**
`compose.js` 里没有任何一处访问数据库。

---

## 四、迁移（旧 localStorage）

启动时跑一次（`prefs.migratedV1` 标记）：

| 旧键 | 处理 |
|---|---|
| `memento.dir.v1` | 迁进 `projects.designDirection` |
| `memento.text.v1` | 迁进 `projects.texts` |
| `memento.stars.v1` | 按文件名匹配，写成 `photos.starred` |
| `memento.photos.v1` 里 `blob:` 开头的 | **判定失效**，计数后在界面提示「N 张上次上传的照片已失效，请重新拖进来」 |

不做任何假恢复：旧版本里 `blob:` URL 在刷新后就是废的，迁移只承认能重新读取的文件。

---

## 五、备份

`.memento` 是一个 zip：

```
manifest.json      {app, schemaVersion, exportedAt, projects[], photos[]}
projects.json      每本作品 + 全部版本（含瘦身页面模型）
photos/<id>.jpg    被引用的照片（工作副本）
thumbs/<id>.jpg    缩略图
```

导入流程：读 zip → 校验 `app` / `schemaVersion` → 检查每个版本引用的 photoId 都在包里 →
**全部通过才开始写库**；任何一步失败整批取消，现有数据不受影响。和已有作品 id 冲突时自动换新 id 并加「(导入)」后缀。

---

## 六、已知限制（重要）

- **浏览器本地存储不是永久保险箱**。iOS 长期不打开、磁盘紧张、清站点数据都会清掉 IndexedDB。
  界面里显示已用空间，重要作品请定期「导出全部备份」。
- `navigator.storage.persist()` 只是申请，浏览器可以拒绝；本机 Chrome 一般会同意。
- **只存 1600px 工作副本**（导出 1080×1440 够用），原图仅 ≤8MB 时另存。想全存原图改 `js/app.js` 的 `importFile()` 一处即可。
- 全量备份体积 ≈ 照片数 × 0.5MB（38 张约 20MB）。
- HEIC 浏览器解不了，导入会提示先转 JPG。
- 照片删除目前只做「从这本作品移出」，还没做「从照片库彻底删除」（会先查引用再提示）。
- 手机 1080 宽页面缩到 390 时，10–12px 正文只有 4px 高 —— 看字请开灯箱或导出。

---

## 七、本地校验

```
node _inspect/accept.mjs      # 20 条验收里的自动化部分（干净 profile 跑）
node _inspect/cdp.mjs <url> <expr.js>
python -m http.server 8770    # 起本地服务，示例图才读得到
```

`_inspect/` 不在仓库里。

最近一次验收结果（2026-11-04）：

| 项 | 结果 |
|---|---|
| 导入 38 张真实照片 → 库 | 38 张，Object URL 38 个（无重复、无泄漏） |
| 刷新后 | 照片 38、9 页、38 框、0 张裂图，页面模型哈希与刷新前完全一致 |
| 切张数 9→11 | 哈希改变（说明真的重排了） |
| v1(9页) → v2(11页) → 恢复 v1 | 回到 9 页，哈希与 v1 一致；刷新后仍是 v1 |
| 复制 / 删除作品 | 版本一并复制；删除后照片数不变 |
| 备份导出 → 导入 | 38 张照片 + 9 页 + 3 个版本完整回来，缺图会拒绝导入 |
| 模拟写库失败 | 界面显示「保存失败 ⟳」，不显示「已保存」 |
