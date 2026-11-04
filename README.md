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

**文字（第二阶段）**
- 三层文字：**设计文字**（页码/日期/章节编号，由引擎生成）· **编辑内容**（书名、副标题、章节词、短句，可 AI 辅助）· **个人声音**（「这组照片，你还记得什么？」，你的原话最高优先级，AI 永远不覆盖）。
- 六种文字风格：Poetic / Documentary / Minimal / Playful / Personal / No Text。
- 「为这组照片寻找文字灵感」：用本地 Ollama 生成 **3 个不同编辑角度**（时间／物件／第一人称），每个方向给出书名、副标题、概念、情绪、章节词、短句、文字密度；可以单独采纳，也可以手动改。
- 内容与排版分离：文字只存内容 + 出处（user/ai/system、是否被用户改过、原文字 id），字体字号位置全部由排版引擎决定。
- 没有 Ollama 时按钮改成内置模板，整站照常工作。

**两种作品，两个抽屉（本轮新增）**
- **回忆册**：一次上传的一批照片（比如 100 张），页数**不设上限**，由照片数量决定（约每跨页 6 张）。网页里能翻，导出 PDF 打印。
- **作品**：九张（或十一张）社交输出，从回忆册里挑照片派生，或单独新建。
- 作品库分两栏：上面「回忆册 · 页数不设限」，下面「作品 · 九张发出去」。回忆册每行有「做成九图」，一键派生成一件九图作品（默认取前 30 张）。
- 同一张照片可被多本引用；删作品不动照片。

**照片库**
- 顶栏「照片库」：所有照片一格一格看，按导入时间排；可为 ★ 收藏（★ 优先当主视觉）。
- 筛选：全部 / ★ 收藏 / 没用上。
- 一张照片多本共用；「加入这本」把库里没在用的照片放回当前作品。
- 「彻底删」会先查它被几本作品引用：有引用就明确告诉你再确认；删掉时同步释放 Blob URL。

**保存**
- 照片存进 IndexedDB，刷新、关浏览器、第二天回来都还在。
- 多本作品：新建 / 打开 / 改名 / 复制 / 删除；删作品不动照片库。
- 自动保存（防抖 650ms）+ 手动「保存版本」，版本历史可回滚。
- 完整备份 `.memento`（zip：项目 + 版本 + 用到的照片），可导入到另一台机器。

---

## 二、数据存在哪

数据库 `memento-db`（IndexedDB v1），四张表：

| 表 | 关键字段 | 说明 |
|---|---|---|
| `photos` | `id, blob, thumbnail, format, bytes, name, mimeType, width, height, fileSize, createdAt, importedAt, starred, analysis, storedScale` | `blob` = 长边 **2000 的 WebP**（编辑器用），`thumbnail` = **400 WebP**（照片墙用）。**不保存原图**（自由版：原图留在用户设备上），2560 大图在导出时临时生成 |
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

## 四、文字灵感要跑在本地版

`https://` 页面按浏览器规则**不能**访问 `http://127.0.0.1:11434`（混合内容），所以线上版永远连不到你电脑上的 Ollama。

```
双击 start-local.cmd
```

它会：① 在 `http://127.0.0.1:8899/` 起网页；② 把 `/ai/*` 代理到 Ollama。
网页和模型同源 → 没有 CORS、没有混合内容。面板里会显示「本地模型：… · 127.0.0.1:8901/ai」。

另开一个窗口 `ollama serve`；想用更强的模型 `ollama pull qwen2.5:7b`，然后在面板的模型下拉里选。

## 五、迁移（旧 localStorage）

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
- **只存 2000px WebP + 400 WebP，不存原图**。实测（4160×6240 iPhone 原图）：preview 平均 496KB、缩略图 12KB —— 比原来 1600 JPEG（509KB）更小且更清晰。100 张 ≈ 50MB，10GB 配额可放 ~20000 张。
- 首次导入会调 `navigator.storage.persist()` 申请长期保存；浏览器可以拒绝，被拒时作品库会显示「未开启长期保存（可能被系统清理）」。
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
| 照片库收藏 / 筛选 / 删除 | ★ 写入数据库；删除后库数 −1、Object URL −1、网格立即更新 |
| 配额预警 | 把 estimate 伪造成 90% 时，作品库顶部出现「本地空间快满了」提示 |
| AI：手写文字受保护 | 先写「我自己的书名」→ 采纳 AI 方向 → 书名仍是自己的，只补了 5 条短句 |
| AI：断网降级 | 把 base 指到死端口 → 0ms 返回 3 个内置方向，不报错 |
| AI：No Text | 标题/短句/章节词全空，9 页照常渲染（17 个图框） |
| AI：版本往返 | 带文字存版本 → 改标题 → 恢复 → 回到原文字 |
| 回忆册（38 张） | 13 页（1 封面 + 6 跨页）、38 张全部用上、PDF 7.3MB 导出成功 |
| 回忆册 → 作品 | 「做成九图」生成 30 张 / 9 页的社交作品，回忆册不受影响 |
| 两个抽屉 | 作品库分「回忆册（1）」「作品（1）」两栏；回忆册里张数选择器自动隐藏 |
| 挑选照片 | 库里 22 张移出 1 张 → 这本 15 张、库里仍 22；全不选/全选都正常 |
