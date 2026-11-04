# MEMENTO · 交接（2026-11-04）

## 仓库 / 线上
- 本地：`C:\Users\22390\Desktop\memento`（git `main`）
- 线上：https://jellyfishhamburger.github.io/memento/?mode=zine
- 结构：`js/app.js`（壳/状态/文字面板） `js/compose.js`（方向 + 构图库） `js/render.js`（DOM + canvas 两个渲染器）`js/export.js`（PNG/PDF）`js/engine.js`（旧引擎，仍在用 cropFor/analyze）

## 已完成
1. 手机滚动跳底：resize 240ms 防抖 + 只在宽度变化时重排。
2. 换一版真换版式：`btnShuffle` 连 `state.scheme` 一起轮换。
3. 照片刷新不丢（有限）：`localStorage['memento.photos.v1']`。
   **未修**：恢复用的是 `p.url`，上传照片是 blob URL，刷新即失效 → 只有示例图真恢复。真修走 IndexedDB（待做 2）。
4. ★ 主视觉：`p.starred`，`memento.stars.v1`，刷新恢复。规则：★ 只在大位/跨页位优先，小位不受影响。
5. 星标分配：`slotGeom()` 每位带 `{i, role, big}`；`BUILD_SLOTS` 逐 key 声明角色；封面 → 大位（★ +4）→ 小位原逻辑。
6. 跨页拖动裁切：`foldPair()` / `sharedCrop()` / `writeSharedCrop()` / `setPairPhoto()`；点任意一半打开整幅裁切框，折线虚线标位；换图整对换。
7. **设计方向 Art Direction（本次）**
   - 顶栏左侧新增「设计方向」：`杂志 Zine`（原有全部功能，一字未删）/ `日式小书 Japanese Minimal`。
   - 选日式时「排版模式 / 方案」自动隐藏（`#modeBlock` `#schemeBlock`），方向存在 `localStorage['memento.dir.v1']`，刷新保持。
   - **日式小书 = 8 个专属构图**（`jp-cover/open/solo/pair/triple/fold/sequence/quiet/end`），与 23 套 zine 构图完全隔离（`mode:'jp'`，`pickComps` 不会选中它们）。
     - 统一系统：外白边 150px、正文 10–12px、标题 36px、页眉小字 + 页脚短句、每页同一个骨架（左上 plate、页脚句）。
     - `jpPlan(n, pages)` 按张数分配：8 页骨架 = 开场→单页主图→一大一小→小图序列→**跨页**→停顿→收尾；张数多时先加密度，超过容量才多开一页（不再往缝里塞小图）。
     - 每页最多几张：open 1 / solo 2 / pair 3 / triple 5 / fold 1（跨页只放一张，altitude 干净）/ sequence 5 / quiet 2 / end 2。
   - **文字变成数据**：`M.TEXT_DEFAULT`（两个方向各一套默认文字：书名/年份/6 个章节词/8 句）→ `state.texts[dir]` → `localStorage['memento.text.v1']`。
     顶栏「文字」面板可改：书名、年份、章节词（逗号分隔）、每页短句（一行一句），输入即重排（280ms 防抖），有「恢复本方向默认」。
8. 排版修正（两条都会被用户一眼看到）
   - `render.js: wrapLines()` 不再把「。」「，」甩到下一行行首（避头尾）。
   - `compose.js` 的 `hue()` 兼容 3 位 hex；以前 `#888` 会算出 NaN，整页的小图分配会静默失败（页面上只剩一张图 + 剩下的被塞进最后一页）。
   - `paintZine()` 的 `stageW` 减 56（右侧「构图/锁定」占位）；390/1000/1440 无横向溢出。
   - 单页单元不再被标成「02 — 03」跨页标签；日式页在桌面可以放大到 620 高。

## 待做
1. （原）跨页单元入口「设为跨页主图」→ 写 `state.forced`。
2. localStorage → IndexedDB：多图配额 + 上传照片刷新丢失。
3. 照片多于页面容量时，zine 方向第 7 步「塞进最大空白」仍会填 40–60px 小图（日式方向已经不会了；zine 方向待定策略）。
4. 其余三个方向（Swiss / Experimental / Travel Journal）：一个方向一份构图库 + 一套文字 + 一次验收，先看日式的实际反馈再动。

## 已验证
- `node --check js/*.js` 全过。
- `_inspect/jp_model.js`：5 种张数 × 8/10 页 = 10 例，全部「照片恰好一次、不超页、同页不重、无叠框、★ 落大位、跨页连续、无残留」。
- `_inspect/star_sweep.js`（zine 54 例 576 页）、`_inspect/fold_model.js`（48 个跨页）仍为 0 错误。
- `_inspect/jp_text_test.mjs`：UI 打开面板 → 改书名/年份/章节词/短句 → 页面模型立刻更新 → 刷新后方向、文字全部还原。
- 视觉：`_inspect/jp/p00…p08.png`（整本 9 页，逐页看过）、`contact.png`、`app-1440.png`、`app-390.png`、`lb7.png`（DOM 灯箱与 canvas 导出一致）。
- 390/1000/1440 无横向溢出。

## 补丁（同一天）
- `buildOne()` 兜底：照片数组为空时返回空白页，不再抛错。
- 单元数不会超过照片数（`wantUnits = min(opt.units, list.length - 1)`）：3 张照片不会再生成 4 个单元。
- 这两个是「照片很少时整页崩掉」的真 bug，提交 `ebc2825` / `933bc48`。

## 已知坑
- GitHub Pages 的 CDN 会缓存旧 js 约 1–5 分钟：推完马上用浏览器打开可能还是旧代码（我踩过，表现为 `Cannot read ... 'ar'`）。验证线上时先 curl 加 `?x=random` 确认文件已更新，再刷新页面。
- 手机预览里 10–12px 的正文只有 4px 高，几乎读不清 —— 这是 1080 宽页面缩到 390 的物理限制，不是 bug；看字要开灯箱或导出。
- 灯箱（DOM）与导出（canvas）用两套测量，改文字换行时必须两个都改（`wrapLines` 是唯一共享点）。
- 方向/文字的默认值改完要**清 localStorage** 才能看到（`_inspect/jp_shot.mjs` 支持 `CLEAR=1`）。
- 本地预览：`cd ~/Desktop/memento && python -m http.server 8770` → `http://127.0.0.1:8770/?mode=zine`。
- CDP：Chrome 常在 9333，`node _inspect/cdp.mjs <url> <expr.js>`；`_inspect/jp_shot.mjs` 支持 `CLEAR=/OUT=`。

---

# 本地持久化与版本管理（2026-11-04 第二轮）

## 这一轮做了什么
1. **IndexedDB（`js/storage.js`）**：库 `memento-db` v1，四表 `photos / projects / versions / prefs`。原生封装，无 CDN 依赖。
2. **Blob URL 生命周期（`js/objects.js`）**：`acquire/release/releaseAll` + 引用计数；一个 photoId 一个 URL。验收时 38 张 = 38 个 URL，反复渲染不增长。
3. **真持久化**：导入走 `importFile()` → 分析 + 1600px 工作副本 + 420 缩略图 → 写库 → 用库里的 Blob 建 URL。刷新后从库恢复，页面模型逐字节一致（哈希比对）。
4. **多作品**：顶栏「作品库」：新建 / 打开 / 改名 / 复制 / 删除 / 封面 / 页数 / 更新时间。删作品不删照片。
5. **自动保存**：`scheduleSave()` 650ms 防抖 → `saveDraft()` 覆盖**该项目唯一的** `isAutoSaved` 草稿；顶栏状态 `保存中…/已保存 hh:mm/保存失败 ⟳`，失败可点重试。`visibilitychange` + `pagehide` 会 flush。
6. **版本**：`保存版本` 存独立快照（瘦身页面模型，只存 photoId）；版本面板可恢复、可删；恢复 = 把快照写成当前草稿，不动历史行。手动版本号从 1 开始，草稿不占号。
7. **备份（`js/backup.js`）**：`.memento` = zip(manifest.json + projects.json + photos/ + thumbs/)，自带 zip 读写（store + deflate，`DecompressionStream`）。导入先校验再写，缺图整批取消；id 冲突自动改 id。
8. **迁移**：`migratedV1` 一次性；`blob:` 旧照片判失效并明确提示，不假恢复。
9. README 重写（数据结构 / 版本快照格式 / 迁移 / 备份 / 限制）。

## 本轮踩到的坑（都修了）
- **`state.library` 与 `state.photos` 不同步**：首次导入时 `loadLibrary()` 先跑（库是空的），之后导入只 push 到 `state.photos` → 恢复版本时 `state.library` 查不到照片 → 页面全空、还把这版空快照存成草稿。修：`noteImported()` 同时写两处 + `applySnapshot` 缺 id 时回库查 `getPhoto`。
- **草稿吃掉了 v1 的编号**：`saveVersion` 原来把 `isAutoSaved` 也算进版本号，第一份手动版本变成 v2。修：只按手动版本算号。
- **单元测试用的 cdp 默认 profile 里有旧数据**，导致「manifest 不生效」的假象（其实是有草稿优先恢复，行为正确）。验收脚本改成每次随机 `--user-data-dir`。

## 现在怎么验
```
node _inspect/accept.mjs     # 全流程：导入→刷新→版本→恢复→库→备份往返→写失败
```
最近跑通：38 张 / 9 页 / 哈希一致 / 恢复 v1 后刷新仍 v1 / 复制删除不影响照片 / 备份 20.7MB 往返完整 / 写失败显示「保存失败 ⟳」。

## 仍待做
1. 照片库页面（列表、收藏、彻底删除 + 引用检查）。数据模型已支持，UI 未做。
2. 「导入的这本」与「照片库」的边界：目前 tray 的删除 = 从这本移出。
3. 配额接近上限时的预警与自动降级（现在是显示已用量）。
4. 三条未实现的方向（Swiss / Experimental / Travel Journal）—— 等日式反馈。
