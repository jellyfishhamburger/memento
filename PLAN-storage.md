# MEMENTO · 本地持久化与版本管理（实施计划）

日期：2026-11-04 · 目标：把 MEMENTO 从「刷新即丢」变成可靠的本地影像编辑器

---

## 一、现状检查（读代码结论）

| 文件 | 行数 | 现状 |
|---|---|---|
| `js/app.js` | 919 | 状态机 + 导入 + 三个方向的 UI；持久化只用 localStorage（4 个 key），`state` 里 `photos/zine/direction/texts/locked` 全在内存 |
| `js/compose.js` | 1337 | 构图引擎：`composeBook(photos, opt)` → `{pages, units, mode, scheme}`；两套方向（`zine` 23 套构图 / `jp` 8 套） |
| `js/render.js` | 235 | 页面模型 → DOM / Canvas，唯一共享点是 `wrapLines()` |
| `js/export.js` | 240 | 九张打包 zip（1080×1440）+ 手写 PDF + 九张单保存面板 |
| `js/engine.js` | 730 | 旧作品集引擎，现在只被 `cropFor` / 分析结果使用 |
| `js/grid.js` | 350 | 九宫格（当前 UI 未暴露） |

**页面模型（唯一真相）**：`{w, h, bg, ink, muted, frames[], rects[], texts[]}`
- `frame`: `{photo, x, y, w, h, pad, role, crop:{sx,sy,sw,sh}, z, focal?}`
- `text`: `{x, y, w, lines[], size, family, weight, color, align, tracking, lineHeight, opacity}`
- `rect`: `{x, y, w, h, color}`

**照片记录**：`{id, name, url, img, w, h, ar, hero, focal{x,y}, colors[3], bright, sat, detail, starred}`

**三个真问题（这次要解决的）**
1. 上传照片存的是 `URL.createObjectURL(file)`，刷新后 URL 失效 → localStorage 里的 `url` 恢复出来是一张碎图。**假恢复**。
2. localStorage 5MB 上限，塞不下照片，也没有「作品」的概念：刷新后只有一堆照片 + 一个方向，没有书名/版本/历史。
3. 没有任何版本概念：所有调整直接覆盖内存状态，一次误操作就回不去。

---

## 二、数据模型（映射到现有字段，不改排版引擎）

库名 `memento-db`（IndexedDB v1，原生封装，不引 CDN 依赖）

### photos
| 字段 | 说明 |
|---|---|
| `id` | 独立 ID（`p_<时间戳>_<随机>`），**不再用 blob URL 当引用** |
| `blob` | 渲染用图（当前导入已经缩到 1600px JPEG q0.92，直接存这个；见「取舍」） |
| `original` | 原图 Blob，仅当 ≤ 8MB 时另存，否则 `null` |
| `thumbnail` | 400px JPEG，作品列表封面 / 照片条用 |
| `name, mimeType, width, height, fileSize, createdAt, importedAt` | 元数据 |
| `starred` | ★ 主视觉（现有功能，从 localStorage 迁过来） |
| `analysis` | `{ar, hero, focal, colors, bright, sat, detail}` 原样存 JSON |
| `storedScale` | 1.0 或 0.92 等，说明 blob 是不是原尺寸 |

### projects
`{id, title, type:'zine'|'portfolio'|'grid', designDirection:'zine'|'jp', createdAt, updatedAt, currentVersionId, coverPhotoId, settings, texts, schemaVersion:1}`

`settings` 装现有的排版输入，一字不改排版引擎：
`{mode:'A'|'B'|'C', scheme:0-2, count:9|11, seed, locked:{unitIdx:{key, photos:[photoId]}}}`

### versions
`{id, projectId, versionNumber, createdAt, description, snapshot, isAutoSaved}`

`snapshot` = **瘦身后的完整页面模型**（不是参数重放），因为参数重放依赖引擎版本，引擎一改旧版本就变形：

```
{
  schemaVersion: 1,
  direction, mode, scheme, count, seed, locked, texts, coverPhotoId,
  pages: [ { w,h,bg,ink,muted,
             frames: [{ p: photoId, x,y,w,h,pad,role,z, crop:{sx,sy,sw,sh} }],
             rects: [...], texts: [...] } ]
}
```

- 只存 `photoId`，**不复制任何 Blob**
- 体积实测：9 页 × 6–8 框 ≈ 25–40KB / 版本；30 个版本 ≈ 1MB，可接受
- 恢复 = 瘦身模型 + 从 photos 表按 id 取 blob → 重建 `photo` 对象 → 直接 `paintZine()`，不经过排版引擎

### preferences
`{key, value}` 或单行 `{id:'ui', direction, lastProjectId, preferences}`；小的 UI 状态继续放 localStorage（不迁）。

---

## 三、模块划分（四层严格分离）

```
js/storage.js   新增：唯一碰 IndexedDB 的地方
                 photos: put/get/getAll/getThumb/delete
                 projects: create/list/update/delete/duplicate
                 versions: snapshot/list/restore/trim
                 backup: exportAll / exportProject / import（完整性校验）
                 quota: estimate() / persist()
js/objects.js   新增：Blob URL 生命周期管理器
                 acquire(photoId) → 复用已有 URL（refcount）
                 release(photoId) / releaseAll()
                 一个 photoId 只对应一个 Object URL，重复打开不增长
js/library.js   新增：作品列表 UI（封面、页数、时间、重命名、复制、删除）
js/app.js       改：导入走 storage.putPhoto；rebuild 后防抖 autosave；
                 顶栏加「保存新版本 / 版本历史 / 备份」
js/compose.js   不动（只在 `composeBook` 之外加一个 `hydrate(snapshot)` 到 render 层）
js/render.js    不动（模型结构完全一致）
js/export.js    不动（导出仍是页面模型 → zip / PDF）
```

铁律：`compose.js` 不认识数据库；`storage.js` 不认识页面模型（只存 JSON）；`render.js` 只吃页面模型。

---

## 四、迁移策略（不许假恢复）

旧的 4 个 localStorage key 保留读取一次：

| 旧数据 | 处理 |
|---|---|
| `memento.dir.v1` / `memento.text.v1` | 直接迁进 `preferences` / `projects.texts`，无损 |
| `memento.stars.v1`（按文件名） | 迁成 `photos.starred`（按 id 匹配 name） |
| `memento.photos.v1` 里 `url` 是 `assets/demo/*` 或 `file://` 相对路径 | 尝试 fetch → 写进 photos，成功才算 |
| `memento.photos.v1` 里 `url` 是 `blob:` | **一律判失效**，进「待重新导入」列表，界面明确提示：`有 N 张照片是上次上传的，浏览器不保存它们，请重新拖进来`——不做任何假装恢复 |

迁移只跑一次（`preferences.migratedAt`），失败不影响启动。

---

## 五、自动保存 vs 新版本（严格区分）

| | 自动保存 | 保存新版本 |
|---|---|---|
| 触发 | 改文字 / 换方向 / 换方案 / 换图 / 裁切 / 删除 / 调顺序（防抖 600ms） | 用户点「保存新版本」 |
| 写什么 | `projects` 当前行 + `versions` 里那条 `isAutoSaved:true` 的草稿快照（**同一行覆盖**） | 新建一条 `versions` 行 |
| 上限 | 草稿快照每个项目只留 1 条 | 手工版本不自动删，>50 条时提示清理 |
| UI | 顶栏状态点：`保存中… / 已保存 21:04 / 保存失败 ⟳` | 版本号 v1 v2 v3 + 备注 |
| 失败 | 状态变红 + 重试按钮 + toast，**绝不显示"已保存"** | 同左 |

- 写库前先 `await` 成功再改状态，失败状态保持红
- `beforeunload` / `visibilitychange:hidden` 时 `flush()` 一次待保存内容
- 恢复历史版本 = 把该快照写成当前草稿（新建一条 `isAutoSaved` 记录），**不改历史行**

---

## 六、备份格式

`.memento`（其实是一个 zip，复用 `export.js` 里已经写好的 zip 打包器）：

```
manifest.json      {schemaVersion, app:'memento', exportedAt, projects:[...], photos:[{id,name,...}]}
projects/<id>.json 项目 + 全部版本（含瘦身页面模型）
photos/<id>.jpg    被引用的图（工作副本）
thumbs/<id>.jpg    缩略图
```

导入流程：`manifest.schemaVersion` 检查 → 逐条校验 photoId 引用存在 → 先在内存里构建 → 全部通过后单事务写入 → 任何一步失败整批回滚，**不破坏现有数据**。

配额：导入前 `navigator.storage.estimate()`，需要 `quota - usage < 预计大小 × 1.2` 才继续；支持时按钮「长期保存（persist）」，并在 README 明确写：浏览器清理站点数据时本地库会被清掉，重要作品请导出备份。

---

## 七、实施顺序（每步独立可验收）

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | `storage.js` + 库表 + `objects.js` | 控制台灌 30 张 → 刷新 → 照片全在、URL 不重复增长 |
| 2 | 导入改走 storage；`photos` 从库里恢复 | 上传 → 刷新 → 图正常显示（这条现在必然失败） |
| 3 | 作品库 UI + 新建/打开/改名/复制/删除 | 两本作品共存，删一本不动另一本，删作品不删照片 |
| 4 | autosave + 状态灯 + flush | 改文字后 1 秒内「已保存」；关标签页前不丢 |
| 5 | 版本快照 + 历史面板 + 恢复 | 建 v2 → 改版 → 建 v3 → 恢复 v2 → 刷新仍是 v2 |
| 6 | 备份导出/导入 + 配额 + persist | 导出 .memento → 清库 → 导入 → 排版逐页一致 |
| 7 | README / HANDOFF 更新 + 20 条验收跑一遍 | 见下 |

每步都跑：`node --check`、`_inspect/*.mjs` 模型断言、真浏览器截图（桌面 1440 + 手机 390）。

---

## 八、取舍（需要你知道的三件事）

1. **原图存不存**：一张 iPhone 原图 3–8MB，38 张 ≈ 150–300MB。iOS Safari 单站点配额常在 1GB 内且可能被系统清理。所以：`blob` 存 1600px 工作副本（导出 1080×1440 用不到更大），`original` 只在 ≤8MB 时另存。这条偏离了你写的「原始图片 Blob」，理由是配额，且 `storedScale` 字段留了口子，以后想全存原图改一处即可。
2. **版本存瘦身页面模型**，不存「参数重放」：参数重放省空间但引擎一升级旧版本就变形。代价是每版 ~30KB。
3. **不承诺绝对不丢**：IndexedDB 会被浏览器清理（尤其 iOS 长期不打开、空间不足）。UI 里会写清楚，并把「导出备份」放在显眼位置。

---

## 九、20 条验收怎么跑

1–7、11–15、20 用自动化脚本（`_inspect/idb_*.mjs`：CDP 驱动真实页面，写库/刷新/读回，断言页面模型 JSON 逐字段相同）；
8–10、16–19 人工 + 截图核对；
20（写库失败）用 monkeypatch：`IDBObjectStore.prototype.put = () => { throw new Error('quota') }`，断言界面显示失败且状态不是「已保存」。
