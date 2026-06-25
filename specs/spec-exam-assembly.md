# 自動組卷與雙向細目表模組規格書 (Exam Assembly & Blueprint Spec)

> **相關文件**：
> - [spec-question-bank.md](./spec-question-bank.md)：題目資料模型
> - [spec-export.md](./spec-export.md)：試卷產生後的輸出格式（純文字 + ZIP + 抽題策略開關）
> - [spec-exam-session.md](./spec-exam-session.md)：考期 / 匯入 / 跨年度 paper 重用設計
> - [spec-statistics.md](./spec-statistics.md)：基於匯入應答的 CTT 統計分析
> - [spec-bugfixes.md](./spec-bugfixes.md)：本 spec 涉及的 P0 bugs（multi-criteria attribute、blueprintId 級聯）

## 核心技術與開發原則

* **資料庫:** Prisma (PostgreSQL)。高度依賴 Prisma 對 JSONB 的查詢能力（例如使用 JSON 包含/匹配運算）來進行動態維度抽題。
* **演算法核心:** 抽題必須具備隨機性 (Fisher-Yates Shuffle)，且必須具備「庫存不足」的防呆與警告機制。
* **Blueprint 定位:** Blueprint 為可重複使用的組卷模板 (Template)，可隨時修改。產生考卷時，將當時的藍圖設定快照 (Snapshot) 存入 `ExamPaper.blueprintSnapshot`，以供追溯。
* **「考過題目不再考」業務規則:** 現階段年度只考兩次，業務規則為「已被任何 PUBLISHED 考卷使用過的題目不再被抽出」。本 spec 第二部分 §2 / §4 描述此邏輯實作（`excludeUsedQuestions` 開關，預設 true）。未來開放隨到隨考時可關閉此開關。

---

## 第一部分：資料庫綱要設計 (Prisma Schema)

為了支援「無限擴充維度」的雙向細目表，題庫主表引入 `attributes` JSONB。組卷系統則由 `ExamBlueprint` (藍圖)、`BlueprintCell` (條件格) 與 `ExamPaper` (實體考卷) 組成。

### 1. 題庫擴充 (Question) — 僅新增欄位

在現有 `Question` model（定義於 [spec-question-bank.md](./spec-question-bank.md)）中新增以下欄位，**不重新定義**已有欄位：

```prisma
model Question {
  // ... (既有欄位保持不變，詳見 spec-question-bank.md) ...

  // ⭐️ 新增：動態維度標籤 (供組卷過濾使用，合法 key/value 參照 AttributeDefinition)
  // 範例: { "difficulty": "HIGH", "topic": "DAILY_LIFE" }
  attributes     Json            @default("{}")

  // ⭐️ 新增：考卷關聯
  paperQuestions ExamPaperQuestion[]

  // ⭐️ 新增：組合索引 (加速抽題查詢)
  @@index([category, type, subType, status])
}
```

> **GIN 索引：** 需在 migration 中手動建立 `attributes` 的 GIN 索引以加速 JSONB 查詢：
> ```sql
> CREATE INDEX idx_questions_attributes ON questions USING GIN (attributes);
> ```

### 2. 試卷藍圖主表 (ExamBlueprint)

```prisma
model ExamBlueprint {
  id               String          @id @default(uuid())
  name             String          // 藍圖名稱 (e.g., "TSH 中小學生模擬測驗標準版")
  examCategory     ExamCategory    // 使用既有 Enum：GTPT 或 TSH
  totalQuestions   Int             // 預期總題數
  totalScore       Float           // 預期總分

  createdById      String
  createdBy        User            @relation("BlueprintCreator", fields: [createdById], references: [id])

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  cells            BlueprintCell[]
  generatedPapers  ExamPaper[]

  @@map("exam_blueprints")
}
```

### 3. 雙向細目表單元格 (BlueprintCell)

```prisma
model BlueprintCell {
  id               String          @id @default(uuid())
  blueprintId      String
  orderIndex       Int             // 條件格在藍圖中的排序

  questionType     QuestionType    // 使用既有 Enum
  questionSubType  QuestionSubType // 使用既有 Enum

  // ⭐️ 抽題條件 (對應 Question.attributes，key/value 參照 AttributeDefinition)
  // 範例: { "difficulty": "HIGH" }
  criteria         Json            @default("{}")

  questionCount    Int             // 預期抽出題數（題組型計算父題數量）
  scorePerQuestion Float           // 每題配分（題組型為每個子題的配分）

  blueprint        ExamBlueprint   @relation(fields: [blueprintId], references: [id], onDelete: Cascade)

  @@index([blueprintId])
  @@map("blueprint_cells")
}
```

### 4. 考卷狀態 (PaperStatus)

```prisma
enum PaperStatus {
  DRAFT       // 草稿（可微調換題）
  PUBLISHED   // 已發布（不可再修改）

  @@map("paper_status")
}
```

**狀態機：**

```
DRAFT ──(PUBLISH)──> PUBLISHED（不可逆）
```

* `DRAFT`：自動產生後的初始狀態，允許手動換題、修改考卷名稱。
* `PUBLISHED`：確認後發布，之後不可修改、不可刪除。

### 5. 產生的實體考卷 (ExamPaper)

```prisma
model ExamPaper {
  id                 String        @id @default(uuid())
  // blueprintId 可為 null：若藍圖被刪除，此欄位自動 SetNull，但考卷仍保留並可透過
  // blueprintSnapshot 追溯原始設定。
  blueprintId        String?
  name               String        // 考卷名稱 (e.g., "2026春季 TSH 模擬考-A卷")
  status             PaperStatus   @default(DRAFT)

  // ⭐️ 藍圖快照：記錄產生此考卷時的藍圖完整設定（即使 blueprintId 後續為 null 仍保留）
  blueprintSnapshot  Json

  createdById        String
  createdBy          User          @relation("PaperCreator", fields: [createdById], references: [id])

  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  blueprint            ExamBlueprint?       @relation(fields: [blueprintId], references: [id], onDelete: SetNull)
  questions            ExamPaperQuestion[]
  examSessionPapers    ExamSessionPaper[]   @relation("ExamSessionPapers")  // 對應 spec-exam-session.md

  @@map("exam_papers")
}
```

> **重要：** `blueprintId` 必須為 nullable + `onDelete: SetNull`。原因：藍圖可被刪除，但歷史考卷不能被連帶刪除（影響統計與歸檔）。具體情境見 [spec-bugfixes.md](./spec-bugfixes.md)。

`blueprintSnapshot` 結構範例：

```json
{
  "name": "TSH 中小學生模擬測驗標準版",
  "examCategory": "TSH",
  "totalQuestions": 30,
  "totalScore": 100,
  "cells": [
    {
      "orderIndex": 1,
      "questionType": "READING",
      "questionSubType": "TSH_FILL_BLANK",
      "criteria": { "difficulty": "LOW" },
      "questionCount": 5,
      "scorePerQuestion": 2
    },
    {
      "orderIndex": 2,
      "questionType": "LISTENING",
      "questionSubType": "LISTEN_PICK_IMAGE",
      "criteria": { "difficulty": "MEDIUM" },
      "questionCount": 10,
      "scorePerQuestion": 3
    }
  ]
}
```

### 6. 考卷與題目的中介表 (ExamPaperQuestion)

```prisma
model ExamPaperQuestion {
  id               String          @id @default(uuid())
  examPaperId      String
  questionId       String
  orderIndex       Int             // 題目在考卷中的順序
  score            Float           // 該題配分（父題為 0，子題為實際配分）

  examPaper        ExamPaper       @relation(fields: [examPaperId], references: [id], onDelete: Cascade)
  question         Question        @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([examPaperId, questionId])
  @@unique([examPaperId, orderIndex])
  @@index([examPaperId])
  @@index([questionId])
  @@map("exam_paper_questions")
}
```

### 7. User model 反向關聯補充

需在 `User` model 中新增：

```prisma
model User {
  // ... (既有欄位) ...
  blueprintsCreated  ExamBlueprint[]     @relation("BlueprintCreator")
  papersCreated      ExamPaper[]         @relation("PaperCreator")
}
```

---

## 第二部分：後端 API 與抽題演算法 (Backend Logic)

### 1. 核心 API 路由

**Blueprint CRUD：**

| 方法 | 路徑 | 說明 | 權限 |
|------|------|------|------|
| `POST` | `/api/blueprints` | 建立新藍圖與條件格 | `exam:create` |
| `GET` | `/api/blueprints` | 藍圖列表（分頁） | `exam:read` |
| `GET` | `/api/blueprints/:id` | 藍圖詳情（含 cells） | `exam:read` |
| `PATCH` | `/api/blueprints/:id` | 更新藍圖與條件格 | `exam:update` |
| `DELETE` | `/api/blueprints/:id` | 刪除藍圖 | `exam:delete` |
| `POST` | `/api/blueprints/:id/generate` | **核心端點**，觸發自動組卷 | `exam:assemble` |

**Paper CRUD：**

| 方法 | 路徑 | 說明 | 權限 |
|------|------|------|------|
| `GET` | `/api/papers` | 考卷列表（分頁） | `exam:read` |
| `GET` | `/api/papers/:id` | 考卷詳情（含題目） | `exam:read` |
| `PATCH` | `/api/papers/:id` | 更新考卷名稱（僅 DRAFT） | `exam:update` |
| `PATCH` | `/api/papers/:id/status` | 發布考卷 DRAFT → PUBLISHED | `exam:update` |
| `PATCH` | `/api/papers/:id/questions/:questionId` | 替換考卷中的某題（僅 DRAFT） | `exam:update` |
| `DELETE` | `/api/papers/:id` | 刪除考卷（僅 DRAFT） | `exam:delete` |

### 2. 抽題演算法流程 (實作於 `generate` endpoint)

**Step 1: 讀取藍圖與條件**

撈取 `ExamBlueprint` 及其包含的所有 `BlueprintCell`（依 `orderIndex` 排序）。準備：

* `selectedQuestions: Array<{ questionId, score, orderIndex }>` — 最終選取結果
* `usedQuestionIds: Set<string>` — 全域已使用題目 ID（跨 Cell 去重用）
* `warnings: string[]` — 庫存不足警告

**Step 2: 驗證藍圖完整性**

驗證 `sum(cells.questionCount) === blueprint.totalQuestions` 且 `sum(cells.questionCount * cells.scorePerQuestion) === blueprint.totalScore`。不一致時回傳 `ERR_BLUEPRINT_CELL_MISMATCH`。

**Step 3: 迴圈處理每一個 BlueprintCell**

針對每一個 `cell`（依 `orderIndex` 順序），向資料庫發出查詢，撈出符合條件的「候選題庫池 (Pool)」。

* **查詢條件 (Prisma Where Clause):**
  * `category` === blueprint.examCategory
  * `type` === cell.questionType
  * `subType` === cell.questionSubType
  * `status` === `APPROVED`（絕對不可抽出草稿或退回的題目）
  * `id` NOT IN `usedQuestionIds`（排除已被其他 Cell 抽走的題目）
  * `attributes` 包含 `cell.criteria` 內定義的所有 Key-Value（multi-criteria 必須**全部 AND 滿足**，不可只滿足最後一筆——詳見 [spec-bugfixes.md §3](./spec-bugfixes.md#3-bug-2generatepaper-multi-criteria-attribute-%E9%81%8E%E6%BF%BE%E8%A2%AB%E8%A6%86%E8%93%8B)）。
  * **【可選】** `excludeUsedQuestions = true` 時：題目不得屬於任何 `PUBLISHED` 狀態的考卷（透過 `paperQuestions.none.examPaper.status === 'PUBLISHED'`）。預設為 true（業務規則「考過題目不再考」），由 `POST /api/blueprints/:id/generate` 的 request body 透傳。

* **題組型題目特殊查詢（COMPREHENSION、SPEECH 等）：**
  * 查詢時加上 `isGroupParent: true`，僅匹配父題
  * `questionCount` 計算的是**父題數量**，非子題數量
  * 注意：`TSH_COMPREHENSION` 雖名稱含 COMPREHENSION，但 spec 規定為**單題類型**（非題組），實作上不可誤判為 group type。

#### Step 3 範例：多 criteria 的正確寫法

```typescript
import type { Prisma } from '../../generated/prisma/index.js'

const whereConditions: Prisma.QuestionWhereInput = {
  category: blueprint.examCategory,
  type: cell.questionType,
  subType: cell.questionSubType,
  status: 'APPROVED',
  id: { notIn: [...usedQuestionIds] },
}

// ✅ DO：multi-criteria 用 AND 陣列展開
if (criteria && Object.keys(criteria).length > 0) {
  whereConditions.AND = Object.entries(criteria).map(([key, value]) => ({
    attributes: { path: [key], equals: value },
  }))
}

// ✅ DO：可選的 PUBLISHED 排除規則
if (excludeUsedQuestions) {
  whereConditions.paperQuestions = {
    none: { examPaper: { status: 'PUBLISHED' } },
  }
}
```

```typescript
// ❌ DON'T：用 spread 嘗試合併會被覆蓋
for (const [key, value] of Object.entries(criteria)) {
  whereConditions.attributes = {
    ...((whereConditions.attributes as Record<string, unknown>) ?? {}),
    path: [key],
    equals: value,  // 上一輪迴圈設的 path/equals 會被本輪覆蓋
  }
}
```

**Step 4: 洗牌與抽取 (Fisher-Yates Shuffle)**

* 將撈出的 Pool 陣列進行隨機洗牌。
* 檢查 `pool.length` 是否大於等於 `cell.questionCount`。
* **若數量足夠：** 取 `pool.slice(0, cell.questionCount)`。
* **若數量不足 (Shortfall)：** 將 Pool 中所有題目都加入，並在 `warnings` 陣列中寫入警告訊息（例如：`"READING - TSH_FILL_BLANK (條件: {difficulty: LOW}) 題庫不足，預期 5 題，實際僅抽出 3 題。"`）。

**Step 5: 題組 (Question Group) 展開**

對於抽中的每道題目：

* **若為非題組題（`isGroupParent = false` 且 `groupId = null`）：** 直接加入 `selectedQuestions`，配分為 `cell.scorePerQuestion`。
* **若為題組父題（`isGroupParent = true`）：**
  1. 查詢所有 `groupId` 指向此父題的子題（`status = APPROVED`）。
  2. 將父題加入 `selectedQuestions`，配分為 `0`（父題不計分，僅提供題幹與共用媒體）。
  3. 將所有子題依序加入 `selectedQuestions`，每題配分為 `cell.scorePerQuestion`。
* 將抽出的所有 ID（父題 + 子題）加入 `usedQuestionIds`。

**Step 6: 建立藍圖快照**

將當前藍圖的完整設定（含所有 cells）序列化為 JSON，作為 `blueprintSnapshot`。

**Step 7: 寫入資料庫並回傳**

* 建立 `ExamPaper` 實體，`status = DRAFT`，寫入 `blueprintSnapshot`。
* 將 `selectedQuestions` 依照順序寫入 `ExamPaperQuestion`。
* HTTP 回傳：

```json
{
  "success": true,
  "data": {
    "id": "paper-uuid",
    "name": "2026春季 TSH 模擬考-A卷",
    "status": "DRAFT",
    "warnings": [
      "READING - TSH_FILL_BLANK (條件: {difficulty: LOW}) 題庫不足，預期 5 題，實際僅抽出 3 題。"
    ]
  }
}
```

---

## 第三部分：API 端點詳細規格

所有端點皆位於 `/api` 路徑下，需登入且具備對應權限方可存取。回應格式遵守 [api-response.md](./api-response.md)。

### 1. Blueprint CRUD

#### 1.1 建立藍圖 `POST /api/blueprints`

* **權限:** `exam:create`
* **Request Body:**

  ```json
  {
    "name": "TSH 中小學生模擬測驗標準版",
    "examCategory": "TSH",
    "totalQuestions": 30,
    "totalScore": 100,
    "cells": [
      {
        "orderIndex": 1,
        "questionType": "READING",
        "questionSubType": "TSH_FILL_BLANK",
        "criteria": { "difficulty": "LOW" },
        "questionCount": 5,
        "scorePerQuestion": 2
      }
    ]
  }
  ```

* **驗證規則:**
  * `name` 必填，最少 1 字元。
  * `examCategory` 必須為合法 Enum 值。
  * `cells` 至少 1 個。
  * 每個 cell 的 `questionType` + `questionSubType` 組合必須合法（參照 spec-question-bank.md 合法組合表），且必須屬於該 `examCategory`。
  * 每個 cell 的 `criteria` 中的 key 必須存在於 `AttributeDefinition.key`，value 必須為對應屬性的合法值（`AttributeValue.value`）。不合法時回傳 `ERR_VALIDATION`。
  * `sum(cells[].questionCount)` 必須等於 `totalQuestions`，否則回傳 `ERR_BLUEPRINT_CELL_MISMATCH`。
  * `sum(cells[].questionCount * cells[].scorePerQuestion)` 必須等於 `totalScore`，否則回傳 `ERR_BLUEPRINT_CELL_MISMATCH`。

* **邏輯:**
  1. 建立 `ExamBlueprint` 記錄，`createdById` 設為當前登入使用者。
  2. 批次建立所有 `BlueprintCell` 記錄。

* **Response:** `{ success: true, data: { id, name, examCategory, totalQuestions, totalScore, cells: [...], createdAt } }`

#### 1.2 查詢藍圖列表 `GET /api/blueprints`

* **權限:** `exam:read`
* **Query Parameters:**

  | 參數 | 類型 | 預設 | 說明 |
  |------|------|------|------|
  | `page` | number | 1 | 頁碼 |
  | `pageSize` | number | 20 | 每頁筆數 (上限 100) |
  | `examCategory` | string | — | 篩選考試類型 |

* **Response data:** 藍圖陣列，每筆包含 `id`, `name`, `examCategory`, `totalQuestions`, `totalScore`, `createdBy` (`{ id, name }`), `createdAt`, `updatedAt`, `_count.generatedPapers`。
* **Response meta:** 依 `PaginationMeta` 格式提供分頁資訊。

#### 1.3 取得藍圖詳情 `GET /api/blueprints/:id`

* **權限:** `exam:read`
* **Response data:**
  * 藍圖完整資訊：`id`, `name`, `examCategory`, `totalQuestions`, `totalScore`
  * 條件格：`cells[]`（含 `id`, `orderIndex`, `questionType`, `questionSubType`, `criteria`, `questionCount`, `scorePerQuestion`），依 `orderIndex` 排序
  * 建立者：`createdBy` (`{ id, name }`)
  * 已產生的考卷摘要：`generatedPapers[]`（含 `id`, `name`, `status`, `createdAt`）

#### 1.4 更新藍圖 `PATCH /api/blueprints/:id`

* **權限:** `exam:update`
* **Request Body:** 與建立相同結構，所有欄位皆為選填 (Partial Update)。若傳入 `cells`，採用**全量取代**策略（刪除原有 cells 後重新建立）。
* **驗證規則:** 若同時傳入 `cells` 與 `totalQuestions`/`totalScore`，需驗證一致性。若僅傳入 `cells`，需驗證與現有 `totalQuestions`/`totalScore` 的一致性。
* **Response:** 更新後的藍圖完整資訊。

#### 1.5 刪除藍圖 `DELETE /api/blueprints/:id`

* **權限:** `exam:delete`
* **邏輯:** 藍圖刪除時，因 `BlueprintCell` 設定 `onDelete: Cascade` 會自動刪除。已產生的 `ExamPaper.blueprintId` 透過 `onDelete: SetNull` 自動變為 null，考卷本身保留並可透過 `blueprintSnapshot` 追溯原始設定。
* **Response:** `{ success: true, data: null, message: "藍圖已刪除" }`

#### 1.6 自動組卷 `POST /api/blueprints/:id/generate`

* **權限:** `exam:assemble`
* **Request Body:**

  ```json
  {
    "name": "2026春季 TSH 模擬考-A卷",
    "excludeUsedQuestions": true
  }
  ```

  | 欄位 | 類型 | 預設 | 說明 |
  |------|------|------|------|
  | `name` | string | — | 考卷名稱（必填） |
  | `excludeUsedQuestions` | boolean | `true` | 是否排除已被任何 `PUBLISHED` 考卷使用過的題目（業務規則「考過題目不再考」），未來開放隨到隨考時可關閉 |

* **邏輯:** 執行第二部分描述的抽題演算法。
* **Response:**

  ```json
  {
    "success": true,
    "data": {
      "id": "paper-uuid",
      "name": "2026春季 TSH 模擬考-A卷",
      "status": "DRAFT",
      "questionCount": 28,
      "warnings": [
        "READING - TSH_FILL_BLANK (條件: {difficulty: LOW}) 題庫不足，預期 5 題，實際僅抽出 3 題。"
      ]
    }
  }
  ```

### 2. Paper CRUD

#### 2.1 查詢考卷列表 `GET /api/papers`

* **權限:** `exam:read`
* **Query Parameters:**

  | 參數 | 類型 | 預設 | 說明 |
  |------|------|------|------|
  | `page` | number | 1 | 頁碼 |
  | `pageSize` | number | 20 | 每頁筆數 (上限 100) |
  | `status` | string | — | 篩選狀態 (`DRAFT` 或 `PUBLISHED`) |
  | `blueprintId` | string | — | 篩選特定藍圖產生的考卷 |

* **Response data:** 考卷陣列，每筆包含 `id`, `name`, `status`, `blueprintId`, `blueprint` (`{ id, name }` 或 null), `createdBy` (`{ id, name }`), `createdAt`, `updatedAt`, `_count.questions`。
* **Response meta:** 依 `PaginationMeta` 格式提供分頁資訊。

#### 2.2 取得考卷詳情 `GET /api/papers/:id`

* **權限:** `exam:read`
* **Response data:**
  * 考卷資訊：`id`, `name`, `status`, `blueprintId`, `blueprintSnapshot`
  * 建立者：`createdBy` (`{ id, name }`)
  * 題目列表：`questions[]`（依 `orderIndex` 排序），每筆包含：
    * `orderIndex`, `score`
    * `question`: `{ id, category, type, subType, stem, content, answer, isGroupParent, groupId, questionMedia[] }`
  * 藍圖資訊：`blueprint` (`{ id, name }` 或 null，藍圖被刪除時為 null)

#### 2.3 更新考卷名稱 `PATCH /api/papers/:id`

* **權限:** `exam:update`
* **狀態限制:** 僅 `DRAFT` 狀態可修改，`PUBLISHED` 回傳 `ERR_PAPER_ALREADY_PUBLISHED`。
* **Request Body:**

  ```json
  {
    "name": "2026春季 TSH 模擬考-B卷"
  }
  ```

* **Response:** 更新後的考卷資訊。

#### 2.4 發布考卷 `PATCH /api/papers/:id/status`

* **權限:** `exam:update`
* **Request Body:**

  ```json
  {
    "action": "PUBLISH"
  }
  ```

* **狀態限制:** 僅允許 `DRAFT` → `PUBLISHED`，其他轉換回傳 `ERR_INVALID_STATUS_TRANSITION`。
* **邏輯:** 更新 `status = PUBLISHED`，此後該考卷不可再修改。
* **Response:** 更新後的考卷資訊。

#### 2.5 替換考卷題目 `PATCH /api/papers/:id/questions/:questionId`

* **權限:** `exam:update`
* **狀態限制:** 僅 `DRAFT` 狀態可操作，`PUBLISHED` 回傳 `ERR_PAPER_ALREADY_PUBLISHED`。
* **Request Body:**

  ```json
  {
    "newQuestionId": "replacement-question-uuid"
  }
  ```

* **驗證規則:**
  * 原題目 (`questionId`) 必須存在於該考卷中。
  * 新題目 (`newQuestionId`) 不可已存在於該考卷中，否則回傳 `ERR_QUESTION_ALREADY_IN_PAPER`。
  * 新題目 `status` 必須為 `APPROVED`。
  * 新題目的 `category`、`type`、`subType` 必須與被替換的題目相同。
  * 題組子題不可單獨替換，須替換整個父題（此時同步替換所有子題）。

* **邏輯:** 更新 `ExamPaperQuestion.questionId` 為 `newQuestionId`。若替換的是題組父題，需同步替換所有子題。
* **Response:** 更新後的考卷詳情。

#### 2.6 刪除考卷 `DELETE /api/papers/:id`

* **權限:** `exam:delete`
* **狀態限制:** 僅 `DRAFT` 狀態可刪除，`PUBLISHED` 回傳 `ERR_PAPER_ALREADY_PUBLISHED`。
* **邏輯:** 刪除 `ExamPaper`，關聯的 `ExamPaperQuestion` 因 `onDelete: Cascade` 自動刪除。
* **Response:** `{ success: true, data: null, message: "考卷已刪除" }`

---

## 第四部分：前端介面與操作流程 (Frontend UI/UX)

### 1. 藍圖列表頁 (Blueprint List)

**路徑:** `/admin/blueprints`
**實作細節:**

* 顯示所有藍圖的表格，欄位：名稱、考試類型、總題數、總分、已產生考卷數、建立者、建立時間。
* 支援依考試類型篩選。
* 提供「新增藍圖」按鈕導向 `/admin/blueprints/new`。
* 點擊藍圖名稱導向 `/admin/blueprints/:id`。

### 2. 雙向細目表編輯器 (Blueprint Builder)

**路徑:** `/admin/blueprints/new` (新增) / `/admin/blueprints/:id/edit` (編輯)
**實作細節:**

* 使用 Ant Design 的 `<Form>` 搭配 `<Form.List>` 實作動態條件網格。
* 每一列 (Row) 是一個 `BlueprintCell`，包含：
  * **題型下拉選單:** 選擇主類型與子類型（依 `examCategory` 過濾合法組合）。
  * **動態條件設定 (Criteria):** 前端呼叫 `GET /api/attributes?examCategory=XXX` 取得該考試類型適用的屬性定義，每個屬性渲染為可選的 `<Select>` 下拉選單（選項來自 `AttributeValue`）。送出時組合成 JSON 物件 `criteria`。
  * **題數與配分:** 兩個數字輸入框 `<InputNumber>`。
* 介面下方即時統計「總題數」與「總配分」，防呆確保：
  * `sum(cells[].questionCount)` 等於 `totalQuestions`。
  * `sum(cells[].questionCount * cells[].scorePerQuestion)` 等於 `totalScore`。
  * 不一致時顯示紅色警告，禁止送出。

### 3. 藍圖詳情與組卷觸發 (Blueprint Detail & Generation)

**路徑:** `/admin/blueprints/:id`
**實作細節:**

* 顯示藍圖完整資訊與條件格表格。
* 包含一個醒目的「**產生試卷 (Generate Exam)**」按鈕。
* 點擊後彈出 Modal 輸入考卷名稱，確認後呼叫 `POST /api/blueprints/:id/generate`。
* **成功處理 (Success):** 若無警告，直接導向 `/admin/papers/:paperId` 預覽生成的考卷。
* **警告處理 (Warnings):** 若 API 回傳 `warnings` 陣列（庫存不足），彈出 `<Modal>` 或 `<Alert type="warning">`，條列顯示哪些條件缺題。提示：「試卷已產生，但部分條件題數不足，請通知出題委員補充題庫後重新組卷，或手動微調本試卷。」
* 下方列出此藍圖已產生的考卷歷史列表。

### 4. 考卷列表頁 (Paper List)

**路徑:** `/admin/papers`
**實作細節:**

* 顯示所有考卷的表格，欄位：名稱、狀態 (Tag)、來源藍圖、題目數、建立者、建立時間。
* 支援依狀態 (`DRAFT` / `PUBLISHED`) 篩選。
* 點擊考卷名稱導向 `/admin/papers/:id`。

### 5. 實體考卷預覽與微調 (Paper Preview & Adjustment)

**路徑:** `/admin/papers/:id`
**實作細節:**

* 呈現抽出的試題列表（依照題型群組分區顯示）。
* 顯示 `blueprintSnapshot` 摘要，說明此考卷是依據什麼條件產生。
* **DRAFT 狀態時：**
  * 允許點擊某題旁邊的「替換 (Replace)」按鈕，彈出該條件的剩餘題庫 Modal，進行手動換題。
  * 題組題目顯示「替換整組」按鈕（非單題替換）。
  * 提供「發布考卷」按鈕，點擊後確認 Modal，呼叫 `PATCH /api/papers/:id/status`。
* **PUBLISHED 狀態時：**
  * 所有修改按鈕隱藏，僅供檢視。
  * 顯示「已發布」狀態標記。

---

## 開發重點提示

* 實作 Prisma 查詢時，務必注意 JSONB 查詢語法的正確性。在 PostgreSQL 中，若要查詢 JSONB 是否包含某個子集，建議在底層使用 `@>` 運算子，或透過 Prisma 的 `path` 與 `equals` 組合過濾。
* 抽題演算法必須在記憶體中進行，避免在資料庫層面使用 `ORDER BY RANDOM()`，因為當題庫達到數萬筆時會產生嚴重的效能瓶頸 (Table Scan)。先用條件撈出 ID Array，在 Node.js 中 Shuffle 後，再 `IN` 查詢取回完整題目資料。
* Blueprint 可隨時修改，但已產生的考卷透過 `blueprintSnapshot` 保留當時的設定快照，確保可追溯性。
* 考卷 `PUBLISHED` 後為不可逆狀態，所有修改/刪除 API 須檢查狀態並拒絕操作。
