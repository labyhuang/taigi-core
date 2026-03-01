# 題庫管理模組規格書 (Question Bank Module Spec)

要能提供全民台語認證 (GTPT) 與中小學台語認證 (TSH) 兩種考試類型的題庫管理。

左側功能 menu 新增題庫管理功能。各角色進入後顯示不同狀態的試題清單

1. 出題委員 (AUTHOR): 顯示該 user 建立的試題清單

2. 審查委員 (REVIEWER): 顯示所有狀態為審查中 (PENDING) 的試題清單

3. 管理員 (ADMIN): 顯示所有試題清單

---

## 第一部分：狀態機與前端操作流程 (State Machine & Frontend Flow)

### 1. 題目狀態機 (Question State Machine)

題庫系統實作嚴謹的狀態機 (State Machine)，題目生命週期包含五個狀態：

```
                ┌─────────────────────────────┐
                │          重新送審              │
                ▼          (SUBMIT)            │
DRAFT ──────► PENDING ──────► APPROVED    REJECTED
 (建立草稿)     (送審)    (核可)   (退回)       ▲
              │                               │
              └───────────────────────────────┘
                          (退回)

APPROVED / REJECTED ──► ARCHIVED  (Admin 封存)
```

**合法狀態轉換表：**

| 目前狀態       | 目標狀態       | 動作 (Action) | 執行角色     | 說明                |
| ---------- | ---------- | ----------- | -------- | ----------------- |
| `DRAFT`    | `PENDING`  | `SUBMIT`    | AUTHOR   | 出題委員送交審查（需通過嚴格驗證） |
| `PENDING`  | `APPROVED` | `APPROVE`   | REVIEWER | 審查委員核可入庫          |
| `PENDING`  | `REJECTED` | `REJECT`    | REVIEWER | 審查委員退回修改（須填寫退回原因） |
| `REJECTED` | `PENDING`  | `SUBMIT`    | AUTHOR   | 出題委員修改後重新送審       |
| `APPROVED` | `ARCHIVED` | `ARCHIVE`   | ADMIN    | 管理員封存過時題目         |
| `REJECTED` | `ARCHIVED` | `ARCHIVE`   | ADMIN    | 管理員封存不再需要的題目      |

**不合法的轉換**一律回傳 `ERR_INVALID_STATUS_TRANSITION`。

為了追蹤責任歸屬，**所有的狀態變更都必須在歷程紀錄 `QuestionReviewLog` 資料表中新增一筆紀錄 (Append-only)。**

使用 Ant Design 的 `<Timeline>` (時間軸元件) 畫出歷程紀錄。

```
👤 王大明 (出題委員) 於 2026-02-28 建立
❌ 陳小美 (審查委員) 於 2026-03-01 退回：選項 C 的台羅拼音有誤，請修正。
👤 王大明 (出題委員) 於 2026-03-03 重新送審
✅ 林教授 (審查委員) 於 2026-03-05 核可入庫
```

### 2. 出題委員操作流程 (Author Flow)

* **步驟 1-1：上傳媒體與建立草稿**
  
  * 點擊「新增試題」
  * 選擇主類型 (閱讀/聽力/口說/聽寫) 與子類型，前端表單依據選擇動態變形。
  * 選擇拼音系統 (`TJ` 教育部 / `POJ` 白話字)。
  * 填寫題幹、選項、上傳音檔或圖片。
  * 若題型需媒體(音檔/圖片)，前端先呼叫 `POST /api/media`，取得 `mediaId`。
  * 填寫表單後點擊「儲存草稿」。此時前端**僅做最寬鬆的驗證** (如題型必填)，API 將試題狀態設為 `DRAFT`。

* **步驟 1-2：送交審查 (Submit for Review)**
  
  * 編輯完成後點擊「送出審查」。
  * 呼叫 `PATCH /api/questions/:id/status`，body: `{ action: "SUBMIT" }`。
  * 後端觸發**嚴格驗證**（詳見第二部分第 3 節「送審驗證規則矩陣」）。
  * **資料庫動作:** 主表 `status = PENDING`；新增 Log `{ action: 'SUBMIT' }`。此後出題委員對該題轉為唯讀。

* **步驟 1-3：處理退回 (Handle Rejection)**
  
  * 若被審查委員退回，題目狀態變為 `REJECTED`。出題委員可查看「退回原因」，修改後再次執行送交審查。

### 3. 審查委員操作流程 (Reviewer Flow)

* **步驟 2-1：檢視待審清單**
  
  * 進入試題清單列表僅顯示狀態為 `PENDING` 的題目。

* **步驟 2-2：審查與測試**
  
  * 點開題目進入預覽模式 (模擬考生視角)。測試音檔播放、圖片顯示，並核對解答與標籤是否正確。

* **步驟 2-3：決策 (Approve / Reject)**
  
  * **核可:** 點擊「核可入庫」。主表 `status = APPROVED`；新增 Log `{ action: 'APPROVE' }`。
  * **退回:** 點擊「退回修改」，強制填寫 `comment` (退回原因)。主表 `status = REJECTED`；新增 Log `{ action: 'REJECT', comment: '...' }`。

### 4. 系統管理員操作流程 (Admin Flow)

* 具備全域檢視權限，可觀看所有狀態的題目。
* 具備強制介入權限 (Override)，可隨時編輯任何題目或將題目封存 (`ARCHIVED`)。

---

## 第二部分：試題規格與動態表單 (Question Specs & Schema)

### 1. 題型輸入欄位矩陣表 (Question Types Matrix)

前端表單必須依據此矩陣進行動態渲染 (`Conditional Rendering`)。

#### GTPT 的試題類型

| 主類型           | 子類型                  | 媒體上傳區塊                      | 內容區塊 (選項)             | 解答與評分區塊         | 結構  |
| ------------- | -------------------- | --------------------------- | --------------------- | --------------- | --- |
| **READING**   | GRAMMAR (詞彙語法)       | 無                           | 4 個選項輸入框              | 正確選項 Radio      | 單題  |
|               | COMPREHENSION (閱讀理解) | 無                           | 子題 Form.List (各 4 選項) | 各子題正確選項         | 題組  |
| **LISTENING** | CONVERSATION (對話)    | **音檔 (`.mp3`)**             | 4 個選項輸入框              | 正確選項 + 逐字稿      | 單題  |
|               | SPEECH (演說)          | **音檔 (`.mp3`)**             | 子題 Form.List (各 4 選項) | 各子題選項 + 逐字稿     | 題組  |
| **DICTATION** | DICTATION_FILL (聽寫)  | **音檔 (`.mp3`)**             | 無                     | 標準台羅拼音解答        | 單題  |
| **SPEAKING**  | STORYTELLING (看圖講古)  | **圖片 (`.jpg/.png`)** (支援多張) | 無                     | 評分標準 (TextArea) | 單題  |
|               | READ_ALOUD (朗讀)      | 無                           | 無                     | 評分標準 (TextArea) | 單題  |
|               | EXPRESSION (口語表達)    | 無                           | 無                     | 評分標準 (TextArea) | 單題  |



**合法 Type / SubType 組合約束：**

| QuestionType | 允許的 QuestionSubType                        |
| ------------ | ------------------------------------------ |
| `READING`    | `GRAMMAR`, `COMPREHENSION`                 |
| `LISTENING`  | `CONVERSATION`, `SPEECH`                   |
| `SPEAKING`   | `STORYTELLING`, `READ_ALOUD`, `EXPRESSION` |
| `DICTATION`  | `DICTATION_FILL`                           |

後端在建立/編輯題目時，必須驗證 `type` 與 `subType` 的組合是否合法，不合法組合回傳 `ERR_VALIDATION`。

### 2. Prisma Schema

```prisma
// --- 題目狀態 ---
enum QuestionStatus {
  DRAFT       // 草稿
  PENDING     // 審查中
  APPROVED    // 已核可
  REJECTED    // 退回修改
  ARCHIVED    // 已封存

  @@map("question_status")
}

// --- 審查動作 ---
enum ReviewAction {
  SUBMIT      // 送審
  APPROVE     // 核可
  REJECT      // 退回
  ARCHIVE     // 封存

  @@map("review_action")
}

// --- 題目類型 ---
enum QuestionType {
  READING       // 閱讀
  LISTENING     // 聽力
  SPEAKING      // 口說
  DICTATION     // 書寫

  @@map("question_type")
}

enum QuestionSubType {
  GRAMMAR           // 語法 (Reading)
  COMPREHENSION     // 閱讀理解 (Reading)
  CONVERSATION      // 對話 (Listening)
  SPEECH            // 演說 (Listening)
  STORYTELLING      // 看圖講古 (Speaking)
  READ_ALOUD        // 朗讀 (Speaking)
  EXPRESSION        // 口語表達 (Speaking)
  DICTATION_FILL    // 聽寫 (Dictation)

  @@map("question_sub_type")
}

// --- 拼音系統 ---
enum TextSystem {
  TJ   // 教育部台羅
  POJ  // 白話字

  @@map("text_system")
}

// --- 題目主表 ---
model Question {
  id             String            @id @default(uuid())
  type           QuestionType
  subType        QuestionSubType
  textSystem     TextSystem
  stem           String?           // 題幹文字 (subType 為 DICTATION_FILL, STORYTELLING 時不需要)
  status         QuestionStatus    @default(DRAFT)

  // 動態 JSONB 欄位
  content        Json?             // 題目內容/選項 (對應 QuestionContent TypeBox Schema)
  answer         Json?             // 解答與評分標準 (對應 QuestionAnswer TypeBox Schema)

  // 題組關聯 (Self-reference)
  isGroupParent  Boolean           @default(false) // 題組父題標記
  groupId        String?
  parent         Question?         @relation("QuestionGroup", fields: [groupId], references: [id])
  children       Question[]        @relation("QuestionGroup")

  // 使用者關聯
  authorId       String
  author         User              @relation("QuestionAuthor", fields: [authorId], references: [id])
  lastReviewerId String?
  lastReviewer   User?             @relation("QuestionReviewer", fields: [lastReviewerId], references: [id])

  // 媒體關聯 (透過 Junction Table)
  questionMedia  QuestionMedia[]

  // 審核歷程紀錄
  reviewLogs     QuestionReviewLog[]

  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@map("questions")
}

// --- 審查軌跡表 (Append-only) ---
model QuestionReviewLog {
  id             String            @id @default(uuid())
  questionId     String
  userId         String

  action         ReviewAction
  comment        String?           // 留言或退回原因 (REJECT 時必填)

  createdAt      DateTime          @default(now())

  question       Question          @relation(fields: [questionId], references: [id], onDelete: Cascade)
  user           User              @relation("ReviewLogUser", fields: [userId], references: [id])

  @@map("question_review_logs")
}

// --- 獨立的多媒體素材庫 ---
model Media {
  id               String          @id @default(uuid())
  filename         String          // 上傳時的原始檔名 (方便出題老師辨識)
  objectKey        String          // 雲端空間 (如 AWS S3 / GCP Storage) 的真實儲存路徑
  mimeType         String          // 例如 "audio/mpeg" 或 "image/jpeg"
  sizeBytes        Int             // 檔案大小 (用來計算儲存成本或限制配額)

  durationSeconds  Float?          // 音檔時長 (前端播放器需要)
  transcript       String?  @db.Text // 音檔逐字稿 (供後台檢索、審核或無障礙功能使用)

  uploaderId       String          // 紀錄是哪位委員上傳的
  uploader         User            @relation("MediaUploader", fields: [uploaderId], references: [id])
  questions        QuestionMedia[]

  createdAt        DateTime        @default(now())

  @@map("media")
}

// --- 題目與素材的多對多關聯表 (Junction Table) ---
model QuestionMedia {
  questionId       String
  mediaId          String

  // 素材在題目中的用途：AUDIO (題幹音檔)、IMAGE (題幹圖片)
  purpose          String

  question         Question        @relation(fields: [questionId], references: [id], onDelete: Cascade)
  media            Media           @relation(fields: [mediaId], references: [id], onDelete: Restrict)

  @@id([questionId, mediaId])
  @@map("question_media")
}
```

**注意事項：**

- 媒體關聯**僅透過 `QuestionMedia` junction table 管理**，不使用 JSONB 欄位儲存 mediaId。
- `User` model 需在 `spec-01.md` 的 schema 中補充對應的反向關聯欄位（`questionsAuthored`、`questionsReviewed`、`reviewLogs`、`mediaUploads`）。
- 題組子題的 `status` **跟隨父題**：對父題執行狀態變更時，後端須同步更新所有 `groupId` 指向該父題的子題狀態。子題不可獨立執行狀態變更。

### 3. 送審驗證規則矩陣 (Submit Validation Rules)

當執行 `SUBMIT` 動作時，後端必須依據 `subType` 進行嚴格驗證。草稿 (`DRAFT`) 儲存時僅驗證 `type`、`subType`、`textSystem` 必填。

| SubType          | `stem` 必填 | 音檔必須 | 圖片必須      | 選項數量      | 正確答案                          | 額外規則                     |
| ---------------- | --------- | ---- | --------- | --------- | ----------------------------- | ------------------------ |
| `GRAMMAR`        | Y         | N    | N         | 恰好 4 個    | `correctOptionIds` 恰好 1 個     | —                        |
| `COMPREHENSION`  | Y (父題)    | N    | N         | 各子題恰好 4 個 | 各子題 `correctOptionIds` 恰好 1 個 | 至少 1 個子題                 |
| `CONVERSATION`   | Y         | Y    | N         | 恰好 4 個    | `correctOptionIds` 恰好 1 個     | `transcript` 必填          |
| `SPEECH`         | Y (父題)    | Y    | N         | 各子題恰好 4 個 | 各子題 `correctOptionIds` 恰好 1 個 | `transcript` 必填、至少 1 個子題 |
| `DICTATION_FILL` | N         | Y    | N         | N/A       | `correctText` 必填              | —                        |
| `STORYTELLING`   | N         | N    | Y (≥ 1 張) | N/A       | `gradingRubric` 必填            | —                        |
| `READ_ALOUD`     | Y         | N    | N         | N/A       | `gradingRubric` 必填            | —                        |
| `EXPRESSION`     | Y         | N    | N         | N/A       | `gradingRubric` 必填            | —                        |

### 4. JSONB Schema 定義 (TypeBox)

請在後端嚴格實作此 TypeBox Schema，並將 `content`、`answer` 存入 PostgreSQL 的 JSONB 欄位中。前端選項 ID 請使用 `nanoid(8)` 產生。

```typescript
import { Type } from '@sinclair/typebox';

// --- 內容選項 (前端產生 nanoid 作為選項 id) ---
export const OptionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 8 }),
  text: Type.String({ minLength: 1 })
});

// 草稿寬鬆驗證：至少 2 個選項
export const MultipleChoiceContentDraftSchema = Type.Object({
  options: Type.Array(OptionSchema, { minItems: 2 })
});

// 送審嚴格驗證：恰好 4 個選項
export const MultipleChoiceContentStrictSchema = Type.Object({
  options: Type.Array(OptionSchema, { minItems: 4, maxItems: 4 })
});

// --- 解答與評分 ---
export const MultipleChoiceAnswerSchema = Type.Object({
  correctOptionIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 1 }),
  transcript: Type.Optional(Type.String())
});

export const DictationAnswerSchema = Type.Object({
  correctText: Type.String({ minLength: 1 }),
  acceptableAlternatives: Type.Optional(Type.Array(Type.String()))
});

export const SpeakingAnswerSchema = Type.Object({
  gradingRubric: Type.String({ minLength: 1 })
});

export const QuestionAnswerSchema = Type.Union([
  MultipleChoiceAnswerSchema,
  DictationAnswerSchema,
  SpeakingAnswerSchema
]);
```

---

## 第三部分：API 端點規格 (API Endpoints)

所有端點皆位於 `/api` 路徑下，需登入且具備對應權限方可存取。回應格式遵守 [api-response.md](./api-response.md)。

### 1. 題目 CRUD

#### 1.1 建立題目（草稿）`POST /api/questions`

* **權限:** `question:create`
* **Request Body:**
  
  ```json
  {
    "type": "READING",
    "subType": "GRAMMAR",
    "textSystem": "TJ",
    "stem": "題幹文字 (選填)",
    "content": { "options": [{ "id": "x1a2", "text": "選項A" }, { "id": "y3b4", "text": "選項B" }] },
    "answer": { "correctOptionIds": ["x1a2"] },
    "mediaIds": [{ "mediaId": "uuid", "purpose": "AUDIO" }]
  }
  ```
* **驗證規則:**
  * `type` + `subType` 組合必須合法（參照第二部分合法組合表）。
  * 草稿僅驗證 `type`、`subType`、`textSystem` 必填，其餘欄位可為空。
* **邏輯:**
  1. 建立 `Question` 記錄，`status = DRAFT`，`authorId` 設為當前登入使用者。
  2. 若有 `mediaIds`，建立對應的 `QuestionMedia` 關聯。
  3. 新增 ReviewLog `{ action: 'SUBMIT', comment: null }`（記錄建立動作，此處 action 用 `SUBMIT` 語意為「建立」）。
* **Response:** `{ success: true, data: { id, type, subType, status, ... } }`

#### 1.2 查詢題目列表 `GET /api/questions`

* **權限:** `question:read`

* **Query Parameters:**
  
  | 參數         | 類型     | 預設  | 說明                              |
  | ---------- | ------ | --- | ------------------------------- |
  | `page`     | number | 1   | 頁碼                              |
  | `pageSize` | number | 20  | 每頁筆數 (上限 100)                   |
  | `status`   | string | —   | 篩選狀態 (可多選，逗號分隔：`DRAFT,PENDING`) |
  | `type`     | string | —   | 篩選主類型                           |
  | `subType`  | string | —   | 篩選子類型                           |
  | `groupId`  | string | —   | 查詢特定題組的子題                       |
  | `authorId` | string | —   | 篩選特定作者                          |

* **角色層級篩選（後端強制）：**
  
  * `AUTHOR`：自動附加 `authorId = 當前使用者 ID`，僅能看到自己的題目。
  * `REVIEWER`：自動附加 `status = PENDING`，僅能看到待審題目。
  * `ADMIN`：無額外限制。

* **Response data:** 題目陣列，每筆包含 `id`, `type`, `subType`, `textSystem`, `stem`, `status`, `isGroupParent`, `author` (`{ id, name }`), `createdAt`, `updatedAt`。

* **Response meta:** 依 `PaginationMeta` 格式提供分頁資訊。

#### 1.3 取得題目詳情 `GET /api/questions/:id`

* **權限:** `question:read`（AUTHOR 僅能查看自己的題目，REVIEWER 僅能查看 `PENDING` 狀態）
* **Response data:**
  * 題目完整資訊：`id`, `type`, `subType`, `textSystem`, `stem`, `status`, `content`, `answer`, `isGroupParent`, `groupId`
  * 關聯媒體：`media[]`（含 `id`, `filename`, `mimeType`, `durationSeconds`, `purpose`）
  * 作者資訊：`author` (`{ id, name }`)
  * 審查歷程：`reviewLogs[]`（含 `id`, `action`, `comment`, `user` (`{ id, name }`), `createdAt`）
  * 若為題組父題 (`isGroupParent = true`)，額外回傳 `children[]`（子題摘要清單）

#### 1.4 更新題目 `PATCH /api/questions/:id`

* **權限:** `question:update`
* **狀態限制:**
  * AUTHOR 僅能編輯 `DRAFT` 或 `REJECTED` 狀態的題目（且必須是自己建立的）。
  * ADMIN 可編輯任何狀態的題目。
* **Request Body:** 與建立相同結構，僅傳入要更新的欄位 (Partial Update)。
* **邏輯:** 驗證 `type` + `subType` 組合合法性，更新題目與媒體關聯。
* **Response:** 更新後的題目完整資訊。

#### 1.5 刪除題目 `DELETE /api/questions/:id`

* **權限:** `question:delete`
* **狀態限制:** 僅 `DRAFT` 狀態可刪除。ADMIN 可刪除任何狀態的題目。
* **邏輯:** 若為題組父題，同步刪除所有子題。關聯的 `QuestionMedia` 記錄會因 `onDelete: Cascade` 自動刪除，但 `Media` 本體保留。
* **Response:** `{ success: true, data: null, message: "題目已刪除" }`

### 2. 題目狀態變更

#### 2.1 變更題目狀態 `PATCH /api/questions/:id/status`

* **權限:** 依動作不同需要不同權限：
  * `SUBMIT` → `question:submit`
  * `APPROVE` → `question:approve`
  * `REJECT` → `question:reject`
  * `ARCHIVE` → `system:manage`
* **Request Body:**
  
  ```json
  {
    "action": "SUBMIT | APPROVE | REJECT | ARCHIVE",
    "comment": "退回原因或備註 (REJECT 時必填)"
  }
  ```
* **驗證規則:**
  1. 檢查狀態轉換是否合法（參照第一部分合法狀態轉換表），不合法回傳 `ERR_INVALID_STATUS_TRANSITION`。
  2. `SUBMIT` 時執行送審嚴格驗證（參照第二部分第 3 節），驗證失敗回傳 `ERR_VALIDATION`。
  3. `REJECT` 時 `comment` 為必填，未填回傳 `ERR_REVIEW_COMMENT_REQUIRED`。
  4. AUTHOR 執行 `SUBMIT` 時須驗證該題為自己所建立。
* **邏輯:**
  1. 更新主表 `status`。
  2. 若為 `APPROVE` 或 `REJECT`，更新 `lastReviewerId`。
  3. 新增 `QuestionReviewLog` 記錄。
  4. **題組同步：** 若為題組父題 (`isGroupParent = true`)，同步更新所有子題的 `status`。
* **Response:** 更新後的題目完整資訊（含最新的 `reviewLogs`）。

### 3. 多媒體素材

#### 3.1 上傳媒體 `POST /api/media`

* **權限:** `media:upload`

* **Request:** `multipart/form-data`
  
  | 欄位     | 類型   | 必填  | 說明   |
  | ------ | ---- | --- | ---- |
  | `file` | File | Y   | 上傳檔案 |

* **檔案限制:**
  
  * 音檔：`.mp3`，上限 20MB
  * 圖片：`.jpg`, `.png`，上限 5MB

* **邏輯:**
  
  1. 驗證檔案格式與大小。
  2. 上傳至雲端儲存空間 (S3/GCS)，取得 `objectKey`。
  3. 若為音檔，解析取得 `durationSeconds`。
  4. 建立 `Media` 記錄。

* **Response:** `{ success: true, data: { id, filename, mimeType, sizeBytes, durationSeconds, objectKey } }`

#### 3.2 取得媒體存取 URL `GET /api/media/:id/url`

* **權限:** `media:read`
* **邏輯:** 根據 `objectKey` 產生 Presigned URL（有效期 15 分鐘）。
* **Response:** `{ success: true, data: { url: "https://...", expiresIn: 900 } }`

#### 3.3 刪除媒體 `DELETE /api/media/:id`

* **權限:** `media:delete`
* **邏輯:** 檢查是否仍有題目關聯（`QuestionMedia`），若有則回傳 `ERR_VALIDATION`（因為 `onDelete: Restrict`）。無關聯時刪除雲端檔案與資料庫記錄。
* **Response:** `{ success: true, data: null, message: "素材已刪除" }`

---

## 第四部分：題庫專用錯誤碼 (Error Codes)

以下錯誤碼須新增至 [api-response.md](./api-response.md) 的錯誤碼清單中。

| Error Code                              | HTTP Status | 說明                             |
| --------------------------------------- | ----------- | ------------------------------ |
| `ERR_INVALID_STATUS_TRANSITION`         | 400         | 不合法的狀態轉換（如 DRAFT 直接跳 APPROVED） |
| `ERR_MEDIA_REQUIRED`                    | 400         | 此題型需要音檔/圖片但未上傳                 |
| `ERR_QUESTION_READONLY`                 | 403         | 題目已送審或已核可，出題委員無法編輯             |
| `ERR_REVIEW_COMMENT_REQUIRED`           | 400         | 退回時未填寫退回原因                     |
| `ERR_INVALID_TYPE_COMBINATION`          | 400         | `type` 與 `subType` 組合不合法       |
| `ERR_GROUP_CHILD_NO_INDEPENDENT_STATUS` | 400         | 子題不可獨立變更狀態，須透過父題操作             |
| `ERR_MEDIA_IN_USE`                      | 409         | 素材仍被題目使用中，無法刪除                 |

---

## 第五部分：實際題目資料範例對照表

以下範例皆直接萃取自《全民台語認證模擬試題》，展示各題型存入資料庫時的資料結構。媒體關聯透過 `QuestionMedia` junction table 管理，不再存於 JSONB。

### 1. 閱讀 - 詞彙語法 (READING - GRAMMAR)

- **`type`:** `READING`
- **`subType`:** `GRAMMAR`
- **`stem`:** `"「阿發_____阿財 2 公斤重 niā-niā。」請問空格仔內揀 tó 一个上適當？"`
- **`content`:**
  
  ```json
  {
    "options": [
      { "id": "x1a2b3c8", "text": "kap" },
      { "id": "y3c4d5e6", "text": "比" },
      { "id": "a7b8c9d0", "text": "hām" },
      { "id": "e1f2g3h4", "text": "tùi" }
    ]
  }
  ```
- **`answer`:** `{ "correctOptionIds": ["y3c4d5e6"] }`
- **`questionMedia`:** *(無)*

### 2. 聽力 - 對話 (LISTENING - CONVERSATION)

- **`type`:** `LISTENING`
- **`subType`:** `CONVERSATION`
- **`stem`:** `"根據對話，tó 一个選項上適當？"`
- **`content`:**
  
  ```json
  {
    "options": [
      { "id": "a1b2c3d4", "text": "今仔日較 bē 寒" },
      { "id": "c3d4e5f6", "text": "明仔載變 koh 較寒" },
      { "id": "g7h8i9j0", "text": "後日會落雨" },
      { "id": "k1l2m3n4", "text": "昨昏上寒" }
    ]
  }
  ```
- **`answer`:** `{ "correctOptionIds": ["a1b2c3d4"], "transcript": "(男) 昨昏有夠寒... (女) 氣象局講今仔日溫度會回升..." }`
- **`questionMedia`:** `[{ mediaId: "550e8400-...", purpose: "AUDIO" }]`

### 3. 聽寫 (DICTATION - DICTATION_FILL)

- **`type`:** `DICTATION`
- **`subType`:** `DICTATION_FILL`
- **`stem`:** `null` *(前端自動渲染預設指導語：請以聽 tióh ê 語音...來書寫)*
- **`content`:** `null`
- **`answer`:** `{ "correctText": "bí-phang" }`
- **`questionMedia`:** `[{ mediaId: "8f8b7e6d-...", purpose: "AUDIO" }]`

### 4. 口說 - 看圖講古 (SPEAKING - STORYTELLING)

- **`type`:** `SPEAKING`
- **`subType`:** `STORYTELLING`
- **`stem`:** `null` *(前端自動渲染預設指導語：請根據圖內容來進行描述...)*
- **`content`:** `null`
- **`answer`:** `{ "gradingRubric": "1. 能點出不同族群語言的危機 (40%)\n2. 提及世界文化多樣性宣言 (30%)..." }`
- **`questionMedia`:**
  
  ```json
  [
    { "mediaId": "11111111-2222-3333-4444-555555555555", "purpose": "IMAGE" },
    { "mediaId": "66666666-7777-8888-9999-000000000000", "purpose": "IMAGE" }
  ]
  ```

### 5. 口說 - 朗讀測驗 (SPEAKING - READ_ALOUD)

- **`type`:** `SPEAKING`
- **`subType`:** `READ_ALOUD`
- **`stem`:** `"講 tióh 1895 年「李鴻章」hām「伊藤博文」簽訂馬關條約 liáu... (下略全文)"`
- **`content`:** `null`
- **`answer`:** `{ "gradingRubric": "1. 斷句與語調是否自然 (50%)..." }`
- **`questionMedia`:** *(無)*

### 6. 閱讀 - 閱讀理解 (READING - COMPREHENSION) - 題組範例

#### A. 父題 (群組共用題幹)

這筆資料負責儲存共同的文章，沒有選項也沒有答案。`isGroupParent = true`。

- **`id`:** `"parent-uuid-1234-5678"` *(系統產生的 UUID)*
- **`isGroupParent`:** `true`
- **`groupId`:** `null` *(自己就是父題)*
- **`stem`:** `"1930年代黃石輝 kap 郭秋生 in 認為用「中國白話文」無法度適用 tī 大多數講「台灣話」ê 台灣人身上，而且 hiàng-sî ê 台灣人 tui「中國語」無熟手... (下略數百字)"`
- **`content`:** `null`
- **`answer`:** `null`
- **`questionMedia`:** *(無)*

#### B. 子題 1 (關聯至父題)

- **`id`:** `"child-uuid-0001"`
- **`isGroupParent`:** `false`
- **`groupId`:** `"parent-uuid-1234-5678"` *(關聯回上面的父題 ID)*
- **`stem`:** `"請問這篇文章主要 ê 論點是啥物？"`
- **`content`:**
  
  ```json
  {
    "options": [
      { "id": "opt1aaaa", "text": "台語文漢羅書寫主流來源" },
      { "id": "opt2bbbb", "text": "皇民化運動 kap 台灣話文論戰" },
      { "id": "opt3cccc", "text": "台灣話文運動失敗原因" },
      { "id": "opt4dddd", "text": "黃石輝 kap 郭秋生對台灣話文主張" }
    ]
  }
  ```
- **`answer`:** `{ "correctOptionIds": ["opt1aaaa"] }`

#### C. 子題 2 (關聯至父題)

- **`id`:** `"child-uuid-0002"`
- **`isGroupParent`:** `false`
- **`groupId`:** `"parent-uuid-1234-5678"` *(同樣關聯回父題 ID)*
- **`stem`:** `"1960年代就主張「漢羅合用」是啥物人？"`
- **`content`:**
  
  ```json
  {
    "options": [
      { "id": "nan1aaaa", "text": "鄭良偉" },
      { "id": "nan2bbbb", "text": "蔡培火" },
      { "id": "nan3cccc", "text": "李豐明" },
      { "id": "nan4dddd", "text": "王育德" }
    ]
  }
  ```
- **`answer`:** `{ "correctOptionIds": ["nan4dddd"] }`

**前端查詢方式：** 呼叫 `GET /api/questions?groupId=parent-uuid-1234-5678` 即可取得所有子題，搭配父題資料渲染成完整題組區塊。
