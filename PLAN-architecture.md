# MEMENTO 架构调整 · 第一步审查报告

日期 2026-11-05 · 未改任何代码

---

## 一句话结论

现有的**照片、作品、版本**三块是干净的，可以直接用；缺的是**集合（Collection）**这一整层，
以及**作品与照片之间的正式关联**。不需要换存储，把 IndexedDB 从 v1 升到 v2、增量加三个表即可，
老数据一条不动。

---

## 一、现状盘点

库：IndexedDB `memento-db`，版本 **1**，四张表（`js/storage.js`）。

| 表 | 主键 | 关键字段 | 谁在用 |
|---|---|---|---|
| `photos` | id | name / blob(WebP 2000) / thumbnail(400) / width,height / createdAt / importedAt / **takenAt** / starred / analysis{ar,hero,colors,bright,sat,detail} | 全部渲染、导出、备份 |
| `projects` | id | title / **kind**(social\|memory) / type / designDirection / createdAt,updatedAt / coverPhotoId / **settings.photoIds** / texts / schemaVersion | 作品库、切换、导出 |
| `versions` | id | projectId / versionNumber / snapshot{pages,photoIds,locked,texts,…} / isAutoSaved | 版本、恢复、复制 |
| `prefs` | key | lastProjectId、AI 设置等 | 启动恢复 |

### 已经做对的（不要碰）

- **版本快照是自包含的**：`snapshot.pages[].frames[].p` 存的是 photoId，恢复时按 id 重新取图。
  集合怎么变都不会影响已完成的版本 —— 这条正好满足「集合新增照片不改变作品」。
- **作品已经有两种类型**：`kind = memory / social`，作品库里也已经分成两个 shelf（回忆册 / 作品）。
- **复制作品**：`duplicateProject` 会连同所有版本一起复制，新 id、新版本链，原作品不动。
- **照片只存一份**：所有作品引用同一个 `photos.id`，没有复制图片文件。

### 缺的

- **没有集合**：代码里 `collection` 出现 **0 次**。上传的照片全部堆进一个扁平的 `state.library`，
  也就是「照片库」这一个池子。没有"这一次上传是一个集合"的概念。
- **没有作品↔照片关系表**：选片结果塞在 `projects.settings.photoIds`（一个数组）。
  能用，但它是"设置里的副本"，不是独立关系，也无法表达"这本书里这张是主视觉"。
- **`starred` 是照片的全局属性**：既是收藏，又被当"主视觉优先级"用（`★`、托盘、排版挑主图）。
  两个含义混在一个字段里，且跨作品共享 —— 正是你说的「精选不该是全局属性」。
- **一本书只能来自一次选片**：不支持关联多个集合。
- **只能回忆册→九图**：`socialFromMemory()` 截前 30 张生成社交版，不带版本、没有反向（九图→回忆册）。

---

## 二、差距表

| 目标对象 | 现状 | 要做的事 |
|---|---|---|
| Photo 素材 | ✅ `photos` 表 | 补 `mimeType/fileSize`（已有）、`takenAt`（已有）；不改 |
| Collection | ❌ 不存在 | 新表 `collections` |
| CollectionPhoto | ❌ 不存在 | 新表 `collectionPhotos`（含**集合内精选**、排序） |
| Book | ✅ `projects`（kind 已分两类） | 加 `collectionIds[]`；其余不动 |
| BookPhoto | ⚠️ 藏在 `settings.photoIds` | 新表 `bookPhotos`（含**本书内主视觉/顺序**） |
| Page | ✅ 在 `snapshot.pages` 里 | 不动 |
| Version | ✅ `versions` + 滚动草稿 | 不动（复制时已带版本） |
| 删除集合不删照片 | ❌ 无集合 | 随集合一起做 |
| 两种书互相另存 | ⚠️ 单向、无版本 | 补通用 `convert()` |

---

## 三、三个必须先说清楚的冲突

1. **`starred` 有两个身份**
   现在它同时是「我收藏了这张」和「排版时优先把它当主视觉」（`js/app.js` 托盘 ★、`plibFilter === 'star'`、
   `state.photos.filter(p => p.starred)`）。
   新模型里必须拆成两个：**集合内的精选**（CollectionPhoto.starred）和**这本书里的主视觉**（BookPhoto.hero）。
   迁移方案：老数据的 `starred` 全部落到"默认集合内的精选"，同时**不清空**照片上的旧字段（保留一个版本做回退）。

2. **`settings.photoIds` 与新表会变成两个真相**
   规则：`bookPhotos` 是唯一真相；`settings.photoIds` 继续写，只用于兼容旧版本快照和回退。
   读取时以 `bookPhotos` 为准，缺失则回退到 `photoIds`。任何写操作只写 `bookPhotos`，再同步一份到 `photoIds`。

3. **删照片后页面会静默缺图**
   现在删照片只弹一次 confirm，删完 `hydratePages` 里 `byId[f.p]` 取不到就把那一格过滤掉，页面结构没变但图没了。
   新规则：**有作品引用时不允许直接删**，只能「从素材库移除（不删文件）」或「先改作品再删」。

---

## 四、要改哪些代码

| 文件 | 改动 | 规模 |
|---|---|---|
| `js/storage.js` | DB v2 + 3 张新表 + 迁移 + 约 14 个新方法（集合 CRUD、关系读写、convert） | 大（核心） |
| `js/app.js` | 照片库 → 「全部照片」+「集合」；入口拆成两个；新建书改为"跨集合选片"；`socialFromMemory` 换成通用 convert；`starred` 读写改走关系 | 中大 |
| `index.html` / `css/app.css` | 两个入口 + 集合页 + 全部照片页 | 小 |
| `js/backup.js` | `.memento` 备份加集合与关系，schemaVersion 2，仍能读 v1 | 中 |
| `js/compose.js` `js/art.js` `js/render.js` `js/export.js` `js/timeline.js` | **一行不改** | 无 |

---

## 五、数据安全与迁移

- **不换存储**：IndexedDB 足够；没有服务端、没有登录，符合免费版定位。
- **只做增量升级**：`DB_VERSION 1 → 2`，`onupgradeneeded` 里只 `createObjectStore`，**从不删表、不改旧记录字段**。
- **迁移步骤（幂等，可重复执行）**
  1. 建三张新表；
  2. 若 `prefs.migratedV2` 不为 true：按 `importedAt` 的日期分组，为每组建一个集合（例如「10-30 的一批」），
     把该组的照片写进 `collectionPhotos`，`starred` 从照片搬到关系上；
  3. 为每本作品写 `bookPhotos`（来源：草稿快照的 `photoIds`，没有就用 `settings.photoIds`），`hero` 取自旧 `starred`；
  4. 写 `prefs.migratedV2 = true`。
- **回退点**：迁移前先调一次 `backup.js` 导出一份 `.memento`（弹出下载，一次性），失败就中止迁移并保留原状。
- **不做的事**：不 `clearAll`、不重建库、不改 `projects` 已有字段的值、不动任何 `versions`。

---

## 六、推荐实施顺序（每步都独立可测、可回退）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1** 数据层 | DB v2、三张新表、迁移、集合与关系 API（不接 UI） | 跑迁移脚本：迁移前后 `photos/projects/versions` 计数一致，快照能原样恢复 |
| **P2** 集合 UI | 「照片集合」入口：列表 / 新建 / 改名 / 加照片 / 移出 / 删集合（不删照片） | 删除集合后照片仍在「全部照片」；同一张能进两个集合 |
| **P3** 作品↔照片 | 新建书时跨集合选片 → 写 `bookPhotos`；书内 ★ 改为 `BookPhoto.hero` | 同一张照片被两本书引用互不影响；改一本不动另一本 |
| **P4** 一本书多集合 | `projects.collectionIds[]`；书里能看到"来自哪几个集合" | 集合加照片后，已有作品页数与顺序不变 |
| **P5** 复制与另存 | 通用 `convert(bookId, targetKind)`：新 id、独立页面、独立版本、按目标类型重排 | 复制后改新书，原书不变；记忆册→小书、小书→记忆册都能跑 |

你列的 7 条测试会按阶段落地成脚本（`_inspect/arch_test.mjs`），P1 之前先跑一次基线，之后每阶段跑一遍对比。

---

## 七、风险与停止条件

- **风险 A**：老数据的 `starred` 迁移后，如果某张照片在多个集合里，它会变成"多处精选"。可接受，但不静默改写来源。
- **风险 B**：`settings.photoIds` 与新表不一致。用"只写新表、兼容读旧字段"的规则避免。
- **风险 C**：迁移中途关页面 → 事务被打断。用 `prefs.migratedV2` 标记 + 幂等重跑。
- **停止条件**：如果 P1 跑完发现 `projects` 里有快照读不出 `pages`（结构异常），立即停止后续阶段，
  只保留新增表、不切读写路径，并报告具体是哪几本。

---

## 八、我的建议

先只做 **P1 + P2**（数据层 + 集合入口），不碰作品创作流程。
这两步做完，你就能真正"按一次旅行的照片整理"，而所有现有作品和版本完全不受影响；
P3 之后才开始动创作链路，那时才需要你确认新的选片界面长什么样。
