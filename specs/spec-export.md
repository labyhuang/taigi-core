# 試卷輸出模組規格 (Export Spec)

<!-- anchor: overview -->

## 0. 文件目的

定義「試卷輸出」模組：將已組好的考卷（`ExamPaper`）輸出為**純文字檔**（給排版人員手動排版印刷）與**ZIP 包**（含純文字檔 + 所有題目用到的音檔）。

**閱讀本文件前不需其他 context**。新增模型與 API 都在本文件內定義。需要交叉引用的既有文件：

- [spec-exam-assembly.md](./spec-exam-assembly.md)：`ExamPaper` 已存在的 schema
- [spec-question-bank.md](./spec-question-bank.md)：題目類型與內容結構
- [api-response.md](./api-response.md)：統一回應格式

**範圍邊界**：

- 在範圍：純文字檔、音檔 zip 打包、API 端點、權限控管、抽題策略開關
- 不在範圍：PDF 直接生成、Word 匯出、給「考試系統」的對接格式（之後另行討論）

---

<!-- anchor: 1-text-format -->

## 1. 純文字檔輸出格式

排版人員拿到此檔後會放進 InDesign / Word 重排版。文字檔需具備：

1. **題序與題型清楚分區**：每個題型開頭有 banner，方便查看
2. **題目編號連續**：跨題型不重置（與考生看到的卷面一致）
3. **音檔引用標記**：用占位符 `[AUDIO: filename.mp3]` 取代音檔，排版人員看到後手動嵌入
4. **圖片引用標記**：`[IMAGE: filename.jpg]`
5. **題組共用區塊**：父題的題幹放在子題之前，子題編號繼續
6. **解答另放**：解答區塊在文末，避免印刷時誤印

### 1.1 文字檔範例

```
================================================================================
試卷名稱：2026 春季 TSH 中小學生模擬考-A卷
考試類型：TSH（中小學生台語認證）
總題數：30 題    總分：100 分
產生時間：2026-04-30 16:42:08
藍圖快照：見 blueprint_snapshot.json（zip 內附）
================================================================================


================================================================================
【閱讀 - 讀句補詞 (TSH_FILL_BLANK)】共 5 題
================================================================================

第 1 題（2 分）
題幹：「阿慧，你昨昏 kap 媽媽去動物園敢有看著足大隻 ê _____ 用鼻仔 teh phū 水。」
請問空格仔內揀下面 tó 1 个選項上適當？
  (A) 猴山仔
  (B) 象
  (C) 雞公
  (D) 長頷鹿


第 2 題（2 分）
題幹：...
  (A) ...
  (B) ...
  (C) ...
  (D) ...

...（略）...


================================================================================
【聽力 - 對話理解 (TSH_DIALOGUE)】共 10 題
================================================================================

第 6 題（3 分）
[AUDIO: Q06_audio.mp3]
題幹：根據頂面 ê 對話，請問 in 對話 ê 時間是幾點幾分？
  (A) 7 點
  (B) 7 點 20 分
  (C) 7 點 40 分
  (D) 8 點


...（略）...


================================================================================
【聽力 - 聽話揀圖 (LISTEN_PICK_IMAGE)】共 4 題
================================================================================

第 16 題（3 分）
[AUDIO: Q16_audio.mp3]
題幹：（題型預設指導語）聽看覓，揀 1 个上符合題目意思 ê 圖
  (A) [IMAGE: Q16_optionA.jpg]
  (B) [IMAGE: Q16_optionB.jpg]
  (C) [IMAGE: Q16_optionC.jpg]
  (D) [IMAGE: Q16_optionD.jpg]


...（略）...


================================================================================
【閱讀 - 短文理解 (TSH_COMPREHENSION)】共 6 題
================================================================================

第 21 題（5 分）
題幹：阿榮 tsiânn 愛食果子，禮拜透早伊 tuè 媽媽去菜市仔買菜...（短文）

根據頂面短文，下面這 4 項物件阿榮上愛食 tó 1 項？
  (A) 肉
  (B) 魚
  (C) 蓮霧
  (D) 青菜


...（略）...


================================================================================
================================================================================
                              【解 答】
================================================================================
================================================================================

題號  正確答案
----  --------
  1   B
  2   A
  3   C
  4   D
  5   B
  6   C
  7   A
  ...
 16   A
  ...
 21   C
  ...

================================================================================
逐字稿（聽力題用）：
================================================================================

第 6 題（TSH_DIALOGUE）：
(A) 你 tann 才看 tioh 幾點？
(B) 差不多 7 點 40 分 ah...

第 7 題（TSH_DIALOGUE）：
...

================================================================================
評分標準（口說 / 聽寫題用）：
================================================================================

（本卷無此題型，略）

================================================================================
```

### 1.2 題型 banner 對照表

| QuestionSubType | banner 標題 |
|---|---|
| `GRAMMAR` | 閱讀 - 詞彙語法 (GRAMMAR) |
| `COMPREHENSION` | 閱讀 - 閱讀理解 (COMPREHENSION) |
| `CONVERSATION` | 聽力 - 對話 (CONVERSATION) |
| `SPEECH` | 聽力 - 演說 (SPEECH) |
| `DICTATION_FILL` | 聽寫 (DICTATION_FILL) |
| `STORYTELLING` | 口說 - 看圖講古 (STORYTELLING) |
| `READ_ALOUD` | 口說 - 朗讀 (READ_ALOUD) |
| `EXPRESSION` | 口說 - 口語表達 (EXPRESSION) |
| `LISTEN_PICK_IMAGE` | 聽力 - 聽話揀圖 (LISTEN_PICK_IMAGE) |
| `IMAGE_PICK_ANSWER` | 聽力 - 看圖揀話 (IMAGE_PICK_ANSWER) |
| `TSH_DIALOGUE` | 聽力 - 對話理解 (TSH_DIALOGUE) |
| `IMAGE_PICK_SENTENCE` | 閱讀 - 看圖揀句 (IMAGE_PICK_SENTENCE) |
| `TSH_FILL_BLANK` | 閱讀 - 讀句補詞 (TSH_FILL_BLANK) |
| `TSH_COMPREHENSION` | 閱讀 - 短文理解 (TSH_COMPREHENSION) |

### 1.3 預設指導語

部分題型 `stem` 為空（如 `LISTEN_PICK_IMAGE`、`STORYTELLING`），文字檔渲染時若 stem 為 null/空，自動印出預設指導語：

| SubType | 預設指導語 |
|---|---|
| `LISTEN_PICK_IMAGE` | `（題型預設指導語）聽看覓，揀 1 个上符合題目意思 ê 圖` |
| `IMAGE_PICK_ANSWER` | `（題型預設指導語）聽看覓，揀 1 个 kap 圖 ê 內容上符合 ê 答案` |
| `IMAGE_PICK_SENTENCE` | `（題型預設指導語）下面 tó 1 句 ê 講法上合這幅圖？` |
| `DICTATION_FILL` | `（題型預設指導語）請以聽 tióh ê 語音來書寫` |
| `STORYTELLING` | `（題型預設指導語）請根據圖內容來進行描述` |

### 1.4 題組渲染規則

- 父題的 `stem` 印出後，緊接子題編號（不重置）
- 父題的編號：用範圍標示，如「第 21–24 題（題組）」，分數總和為子題分數總和
- 子題不另印 banner

範例：

```
================================================================================
【閱讀 - 閱讀理解 (COMPREHENSION)】共 1 題組（4 個子題）
================================================================================

第 21–24 題（題組，共 8 分）

[題組共用題幹]
1930年代黃石輝 kap 郭秋生 in 認為用「中國白話文」無法度適用 tī 大多數
講「台灣話」ê 台灣人身上...（下略數百字）

第 21 題（2 分）
請問這篇文章主要 ê 論點是啥物？
  (A) ...
  (B) ...
```

---

<!-- anchor: 2-zip-structure -->

## 2. ZIP 包結構

```
2026_spring_tsh_paper_a.zip
├── paper.txt                       # 純文字檔（§1 格式）
├── blueprint_snapshot.json         # 藍圖快照（讓排版人員了解設計脈絡）
├── audio/
│   ├── Q06_audio.mp3
│   ├── Q07_audio.mp3
│   └── Q16_audio.mp3
├── images/
│   ├── Q16_optionA.jpg
│   ├── Q16_optionB.jpg
│   ├── Q16_optionC.jpg
│   ├── Q16_optionD.jpg
│   └── Q22_stem.jpg
└── README.txt                      # 排版人員須知
```

### 2.1 媒體檔命名規則

**音檔（題幹音檔）**：`Q{題號補零兩位}_audio.{ext}`

- 例：第 6 題的音檔 → `Q06_audio.mp3`
- 副檔名取自 `Media.mimeType`（如 `audio/mpeg` → `.mp3`）

**圖片（題幹圖片）**：`Q{題號}_stem{序號可選}.{ext}`

- 第 22 題只有一張圖 → `Q22_stem.jpg`
- 第 22 題有多張圖（如 STORYTELLING 看圖講古）→ `Q22_stem1.jpg`、`Q22_stem2.jpg`

**圖片（選項圖片，LISTEN_PICK_IMAGE）**：`Q{題號}_option{ABCD}.{ext}`

- 第 16 題的 4 個選項圖 → `Q16_optionA.jpg`、`Q16_optionB.jpg` ... `Q16_optionD.jpg`
- 字母順序對應 `content.options[]` 的順序（A=第1個 / B=第2個 ...）

### 2.2 README.txt 範例

ZIP 內附給排版人員的說明：

```
================================================================================
試卷檔案說明（請勿將此檔印入正式試卷）
================================================================================

本 ZIP 包含：

1. paper.txt
   試卷正文（純文字）。內含題目、選項、解答、逐字稿、評分標準。
   排版時請以 paper.txt 為主，把 [AUDIO: ...] 與 [IMAGE: ...] 占位符
   替換為對應的 audio/images 檔案。

2. blueprint_snapshot.json
   組卷時的雙向細目表（藍圖）原始設定，供查核試卷組成依據。

3. audio/
   題幹音檔，命名為 Q{題號}_audio.{ext}。
   印刷時不需處理；上線考試或聆聽用。

4. images/
   題幹／選項圖片。命名規則：
     - Q{題號}_stem.jpg     題幹圖片
     - Q{題號}_stem1.jpg    題幹多張圖中的第 1 張
     - Q{題號}_optionA.jpg  選項 A 的圖片
     - Q{題號}_optionB.jpg  選項 B 的圖片
     ...

----------------------------------------------------------------------
注意事項：
- 解答區與逐字稿請印於另一張紙，或標註為「教師用卷」
- 圖片若需上色或重繪，請與題庫管理員確認版權
================================================================================
```

---

<!-- anchor: 3-api -->

## 3. API 端點

### 3.1 下載純文字檔 `GET /api/papers/:id/export.txt`

- **權限**：`exam:read`
- **路徑參數**：`id` — `ExamPaper.id`
- **回應**：
  - `Content-Type: text/plain; charset=utf-8`
  - `Content-Disposition: attachment; filename="<paper-name>.txt"`
  - body 為 §1 格式的純文字
- **錯誤**：
  - paper 不存在 → `404 ERR_NOT_FOUND`
  - paper 為 `DRAFT` 狀態 → 仍允許下載（方便預覽），但檔名加上 `_DRAFT` 後綴

### 3.2 下載 ZIP 包 `GET /api/papers/:id/export.zip`

- **權限**：`exam:read`
- **路徑參數**：`id` — `ExamPaper.id`
- **Query Parameters**：
  | 參數 | 類型 | 預設 | 說明 |
  |---|---|---|---|
  | `includeMedia` | `boolean` | `true` | 是否打包音檔/圖片。`false` 時只含 paper.txt + blueprint_snapshot.json |
- **回應**：
  - `Content-Type: application/zip`
  - `Content-Disposition: attachment; filename="<paper-name>.zip"`
  - body 為 §2 結構的 ZIP
- **錯誤**：
  - 同 §3.1
  - 若有題目參照的 `Media` 已被刪除 → `409 ERR_MEDIA_MISSING`，details 列出哪些題目

### 3.3 預覽純文字內容 `GET /api/papers/:id/export/preview`

- **權限**：`exam:read`
- **回應**：包在 ApiSuccessResponse 內，方便前端在頁面上預覽：

  ```json
  {
    "success": true,
    "data": {
      "filename": "2026_spring_tsh_paper_a.txt",
      "content": "================================================================================\n試卷名稱：2026 春季..."
    }
  }
  ```

- 用途：前端在 PaperDetail 頁可以「預覽」再決定是否下載

---

<!-- anchor: 4-impl -->

## 4. 實作細節

### 4.1 模組結構

新增 [packages/backend/src/modules/exports/](../packages/backend/src/modules/exports/)：

```
exports/
├── exports.routes.ts        # 三條路徑（preview / .txt / .zip）
├── exports.service.ts       # renderPaperToText / bundlePaperZip
├── exports.formatter.ts     # 純函式：題型 banner / 占位符 / 排版
└── index.ts                 # 預設 export routes
```

於 [packages/backend/src/app.ts](../packages/backend/src/app.ts) 註冊：

```typescript
import { exportsRoutes } from './modules/exports/index.js'
// ...
await app.register(exportsRoutes, { prefix: '/api' })
```

### 4.2 主要函式介面

```typescript
// exports.service.ts

import type { PrismaClient } from '../../generated/prisma/index.js'

export interface RenderedPaper {
  filename: string                 // e.g. "2026_spring_tsh_paper_a"
  text: string                     // 純文字檔內容
  blueprintSnapshot: unknown       // JSON
  mediaRefs: MediaRef[]            // 用於 zip 打包
}

export interface MediaRef {
  questionOrderIndex: number       // 題序（卷面編號）
  purpose: 'AUDIO' | 'IMAGE' | 'OPTION_IMAGE'
  optionLabel?: 'A' | 'B' | 'C' | 'D'  // 僅 OPTION_IMAGE
  imageIndex?: number              // 僅 STORYTELLING 多圖
  mediaId: string
  filename: string                 // ZIP 內檔名（已套命名規則）
  mimeType: string
  objectKey: string                // 從 Media 取，service 用來抓檔
}

export async function renderPaperToText(
  prisma: PrismaClient,
  paperId: string,
): Promise<RenderedPaper> { /* ... */ }

export async function bundlePaperZip(
  prisma: PrismaClient,
  paperId: string,
  options: { includeMedia: boolean },
): Promise<NodeJS.ReadableStream> {
  // 內部呼叫 renderPaperToText 取得 text + mediaRefs
  // 用 archiver 打包 → 回傳 stream（給 reply.send 直接 pipe）
}
```

### 4.3 ZIP 打包套件

新增依賴：

```bash
pnpm --filter @taigi-core/backend add archiver
pnpm --filter @taigi-core/backend add -D @types/archiver
```

於 `bundlePaperZip` 中：

```typescript
import archiver from 'archiver'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'

const archive = archiver('zip', { zlib: { level: 6 } })

archive.append(rendered.text, { name: 'paper.txt' })
archive.append(JSON.stringify(rendered.blueprintSnapshot, null, 2), {
  name: 'blueprint_snapshot.json',
})
archive.append(README_TEMPLATE, { name: 'README.txt' })

if (options.includeMedia) {
  for (const ref of rendered.mediaRefs) {
    const fullPath = join(process.cwd(), 'uploads', ref.objectKey)
    const folder = ref.purpose === 'AUDIO' ? 'audio' : 'images'
    archive.append(createReadStream(fullPath), {
      name: `${folder}/${ref.filename}`,
    })
  }
}

await archive.finalize()
return archive
```

### 4.4 路由實作範例

```typescript
// exports.routes.ts
import type { FastifyInstance } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import { requirePermission } from '../../middlewares/rbacGuard.js'
import { renderPaperToText, bundlePaperZip } from './exports.service.js'
import { sendSuccess } from '../../utils/response.js'

const PaperIdParams = Type.Object({ id: Type.String({ format: 'uuid' }) })
const ExportZipQuery = Type.Object({
  includeMedia: Type.Optional(Type.Boolean({ default: true })),
})

export default async function exportsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: Static<typeof PaperIdParams> }>(
    '/papers/:id/export.txt',
    {
      schema: { params: PaperIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const rendered = await renderPaperToText(fastify.prisma, request.params.id)
      reply
        .type('text/plain; charset=utf-8')
        .header('content-disposition', `attachment; filename="${rendered.filename}.txt"`)
      return rendered.text
    },
  )

  fastify.get<{
    Params: Static<typeof PaperIdParams>
    Querystring: Static<typeof ExportZipQuery>
  }>(
    '/papers/:id/export.zip',
    {
      schema: { params: PaperIdParams, querystring: ExportZipQuery },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const stream = await bundlePaperZip(fastify.prisma, request.params.id, {
        includeMedia: request.query.includeMedia ?? true,
      })
      // 取 paper.name 用於 filename
      const paper = await fastify.prisma.examPaper.findUniqueOrThrow({
        where: { id: request.params.id },
        select: { name: true },
      })
      const safe = paper.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
      reply
        .type('application/zip')
        .header('content-disposition', `attachment; filename="${safe}.zip"`)
      return reply.send(stream)
    },
  )

  fastify.get<{ Params: Static<typeof PaperIdParams> }>(
    '/papers/:id/export/preview',
    {
      schema: { params: PaperIdParams },
      preHandler: [requirePermission('exam:read')],
    },
    async (request, reply) => {
      const rendered = await renderPaperToText(fastify.prisma, request.params.id)
      return sendSuccess(reply, {
        filename: `${rendered.filename}.txt`,
        content: rendered.text,
      })
    },
  )
}
```

### 4.5 抽題策略開關 `excludeUsedQuestions`

題庫系統現階段「考過的題目不再考」是業務限制（一年才舉辦兩次）。但設計上保留「未來隨到隨考時可放寬」的彈性。

#### 修改既有 [packages/backend/src/modules/blueprints/blueprints.service.ts](../packages/backend/src/modules/blueprints/blueprints.service.ts)：

`generatePaper` 接受新選項：

```typescript
export interface GeneratePaperOptions {
  excludeUsedQuestions?: boolean  // 預設 true：排除已被任何 PUBLISHED 考卷用過的題目
}

export async function generatePaper(
  prisma: PrismaClient,
  blueprintId: string,
  paperName: string,
  userId: string,
  options: GeneratePaperOptions = {},
) {
  const excludeUsed = options.excludeUsedQuestions ?? true
  // ...
}
```

於組 where 條件時：

```typescript
const whereConditions: Prisma.QuestionWhereInput = {
  category: blueprint.examCategory,
  type: cell.questionType,
  subType: cell.questionSubType,
  status: 'APPROVED',
  id: { notIn: [...usedQuestionIds] },
}

if (excludeUsed) {
  whereConditions.paperQuestions = {
    none: {
      examPaper: { status: 'PUBLISHED' },
    },
  }
}
```

#### 修改 API request schema

[packages/backend/src/modules/blueprints/blueprints.schema.ts](../packages/backend/src/modules/blueprints/blueprints.schema.ts)：

```typescript
export const GeneratePaperBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  excludeUsedQuestions: Type.Optional(Type.Boolean({ default: true })),
})
```

並把 `request.body.excludeUsedQuestions` 透傳到 service。

---

<!-- anchor: 5-frontend -->

## 5. 前端整合

### 5.1 PaperDetail 頁新增按鈕

[packages/frontend/src/pages/ExamAssembly/PaperDetail.tsx](../packages/frontend/src/pages/ExamAssembly/PaperDetail.tsx) 在「修改名稱 / 刪除 / 發布考卷」按鈕區加上：

```tsx
<Button
  icon={<DownloadOutlined />}
  onClick={() => window.open(`/api/papers/${id}/export.txt`, '_blank')}
>
  下載文字檔
</Button>
<Dropdown
  menu={{
    items: [
      {
        key: 'with-media',
        label: '下載 ZIP（含音檔/圖片）',
        onClick: () => window.open(`/api/papers/${id}/export.zip?includeMedia=true`, '_blank'),
      },
      {
        key: 'no-media',
        label: '僅下載 ZIP（純文字 + 藍圖快照）',
        onClick: () => window.open(`/api/papers/${id}/export.zip?includeMedia=false`, '_blank'),
      },
    ],
  }}
>
  <Button icon={<DownloadOutlined />}>下載 ZIP <DownOutlined /></Button>
</Dropdown>
<Button
  icon={<EyeOutlined />}
  onClick={() => void handlePreview()}
>
  預覽
</Button>
```

`handlePreview` 呼叫 `GET /api/papers/:id/export/preview`，把回傳的 `content` 顯示在 antd `<Modal>` + `<pre>` 內，方便排版人員先檢查。

### 5.2 BlueprintDetail 頁的組卷按鈕

[packages/frontend/src/pages/ExamAssembly/BlueprintDetail.tsx](../packages/frontend/src/pages/ExamAssembly/BlueprintDetail.tsx) 中觸發組卷的 Modal 加 checkbox：

```tsx
<Form.Item
  name="excludeUsedQuestions"
  valuePropName="checked"
  initialValue={true}
>
  <Checkbox>
    排除已被其他「已發布」考卷使用過的題目（預設開啟）
  </Checkbox>
</Form.Item>
```

送出時帶上 `excludeUsedQuestions: values.excludeUsedQuestions`。

---

<!-- anchor: 6-error-codes -->

## 6. 新增錯誤碼

於 [packages/shared/src/response.ts](../packages/shared/src/response.ts) 與 [api-response.md](./api-response.md) 新增：

| Error Code | HTTP Status | 說明 |
|---|---|---|
| `ERR_MEDIA_MISSING` | 409 | 試卷打包時，部分題目參照的媒體檔案不存在或已刪除 |
| `ERR_PAPER_HAS_NO_QUESTIONS` | 400 | 嘗試輸出沒有任何題目的考卷 |

---

<!-- anchor: 7-do-dont -->

## 7. DO / DON'T

### DO

- 把純文字渲染拆成 pure function（無 IO）放在 `exports.formatter.ts`，方便寫單元測試
- ZIP 用 stream 模式，避免大檔案佔記憶體（`archiver` 預設就是 stream）
- 媒體 filename 用 ZIP 內檔名，讓排版人員看到的檔名與 paper.txt 內 `[AUDIO: ...]` / `[IMAGE: ...]` 對齊
- ZIP 內含 `blueprint_snapshot.json` 與 `README.txt`，給排版人員脈絡
- 預設指導語在 `exports.formatter.ts` 集中定義成常數表，方便後續修文案

### DON'T

- 不要在 `renderPaperToText` 內 IO 抓 media 檔案內容——只回傳 `mediaRefs` 給 zip 處理層
- 不要把 ZIP buffer 全部讀進記憶體再 send，要用 stream
- 不要在文字檔中印出 mediaId / objectKey 等內部識別（排版人員用不到，且可能被外洩）
- 不要把 `answer.gradingRubric` 印到題目區（屬於教師用資訊，要放解答區）
- 不要對 PUBLISHED 考卷以外的考卷限制下載（DRAFT 也可以下載供預覽）

---

<!-- anchor: 8-acceptance -->

## 8. Definition of Done

### 8.1 單元測試（純函式層）

- [ ] `exports.formatter.ts` 對所有 14 種 SubType 都有 snapshot 測試（給定 question fixture，輸出文字符合預期）
- [ ] 預設指導語在 stem 為 null 時自動套用
- [ ] 題組父題 + 子題的渲染（編號連續、共用題幹）
- [ ] 圖片選項 (LISTEN_PICK_IMAGE) 的 `[IMAGE: Q{n}_option{ABCD}.jpg]` 占位符正確
- [ ] 解答區、逐字稿區、評分標準區分開渲染

### 8.2 整合測試

- [ ] `GET /api/papers/:id/export.txt` 回傳 200，body 為純文字
- [ ] `GET /api/papers/:id/export.zip` 回傳 200，可解壓縮，內含 paper.txt + audio/ + images/ + README.txt + blueprint_snapshot.json
- [ ] `GET /api/papers/:id/export.zip?includeMedia=false` 不包含 audio/ 與 images/
- [ ] 沒有 `exam:read` 權限的使用者收到 403
- [ ] paper 不存在回 404
- [ ] 題目參照的媒體已被刪除時回 409 `ERR_MEDIA_MISSING`

### 8.3 手測

- [ ] 用 ADMIN 帳號建一份完整 TSH 考卷（含 LISTEN_PICK_IMAGE / TSH_DIALOGUE / TSH_FILL_BLANK）
- [ ] 下載 ZIP，肉眼確認排版可讀、占位符對應正確、媒體檔可播放
- [ ] 預覽 Modal 顯示文字正確
- [ ] BlueprintDetail 組卷時，「排除已用過題目」checkbox 反應在抽題結果上
