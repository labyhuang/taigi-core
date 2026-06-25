# 統計分析模組規格 (Statistics Spec)

<!-- anchor: overview -->

## 0. 文件目的

本文件定義「題目統計」模組：依匯入的 [CandidateResponse](./spec-exam-session.md#25-candidateresponse) 資料計算 **CTT (Classical Test Theory) 三大指標**：

- **P 值（難度 Difficulty）**：答對率
- **D 值（鑑別度 Discrimination）**：高分組與低分組答對率差距
- **選項誘答力 (Distractor Analysis)**：每個選項被選比率，特別關注低分組是否被誘答

統計結果存於 `QuestionStatistics` 表（per-session 與跨考期累積兩種視角），供出題者與組卷者參考。

**閱讀本文件前不需其他 context**。所有公式與計算流程在 §2，API 在 §4。

**前置依賴**：

- [spec-exam-session.md](./spec-exam-session.md)：CandidateResponse schema 與匯入流程
- [spec-question-bank.md](./spec-question-bank.md)：Question / Option 結構

**範圍邊界**：

- 在範圍：CTT 三指標、recompute job、查詢 API、多維度交叉、儀表板前端
- 不在範圍：IRT (Item Response Theory)、信度（Cronbach α 為 nice-to-have，列為選用）、即時統計（管理員手動觸發 recompute）

---

<!-- anchor: 1-concepts -->

## 1. 領域概念

### 1.1 統計範圍：per-session vs cumulative

兩種視角同時保存：

- **per-session**：每場考試獨立計算，可看到「2026 春季 vs 2026 秋季」的差異
- **cumulative**：所有 ARCHIVED + IMPORTED session 合併計算（**不含 DRAFT**）

兩者存於同表 `QuestionStatistics`，靠 `examSessionId` 區分（`null` 代表 cumulative）。

### 1.2 哪些 response 會被算進統計

僅納入：

- 該 question 的 `status = APPROVED`
- 該 candidateResponse 來自 `examSession.status IN (IMPORTED, ARCHIVED)`
- 選擇題：`selectedOptionId` 不為 null
- 聽寫題：`writtenAnswer` 不為 null
- 口說題：`speakingScore` 不為 null（未評分前不納入）

未答題（response 不存在）不計入分母——只算「有作答」的考生。

### 1.3 高低分組切分

依 cell 內考生（即「同一 session + 同一 paperVariant」的考生群體）的 `totalScore`：

- 排序後取**前 27%** 為高分組
- 後 27%** 為低分組
- 中間 46% 不參與 D 值計算

> 27% 為 Kelley (1939) 經典建議值，是高/低分組區分度的最佳化點。

**邊界規則**：

- 若考生數 < 30，提高至 1/3 切分（避免高低組各只有幾人）
- 若考生數 < 10，**不算 D 值**，回傳 `discrimination: null`
- cumulative 統計切分依「同 paperVariant」獨立切，再合併高低組（避免不同卷的 totalScore 不可比）

### 1.4 計算觸發時機

- **手動觸發**：管理員在 ExamSessionDetail 頁按「重算統計」按鈕
- **自動觸發**：以下情境自動 enqueue recompute（async job，但簡化用 `setImmediate`）：
  - ExamSession `status` 改為 `IMPORTED` 時
  - 匯入結束時（每次 candidates / responses / speaking-scores 匯入後）

### 1.5 計算狀態

每筆 `QuestionStatistics` 含 `computedAt`，前端顯示「最後更新時間」。重算時 upsert 同 `(questionId, examSessionId)` 紀錄。

---

<!-- anchor: 2-formulas -->

## 2. CTT 三指標公式

### 2.1 難度 P (Difficulty)

```
P = N_correct / N_answered
```

- `N_correct`：答對人數
- `N_answered`：作答人數（包含答對 + 答錯，不含未作答）
- 範圍 [0, 1]，越大越簡單
- 經驗判讀：
  - P > 0.75：太簡單
  - 0.4 ≤ P ≤ 0.75：適中
  - P < 0.4：太難

### 2.2 鑑別度 D (Discrimination)

```
D = P_high - P_low

P_high = 高分組答對率 = N_correct_high / N_high
P_low  = 低分組答對率 = N_correct_low  / N_low
```

- 範圍 [-1, 1]
- 經驗判讀：
  - D ≥ 0.4：優良
  - 0.3 ≤ D < 0.4：尚可
  - 0.2 ≤ D < 0.3：建議改寫
  - D < 0.2：應淘汰
  - D < 0：嚴重瑕疵（高分組答錯較多 → 題目可能有錯）

**對口說題**：

口說題沒有「答對/答錯」概念，改用平均分差：

```
D_speaking = (mean_score_high - mean_score_low) / max_possible_score
```

不適用「P」概念，仍可算 P_avg = mean_score / max_possible。

### 2.3 選項誘答力 (Distractor Analysis)

對每個選項 `o ∈ options`：

```
selectionRate(o) = N_selected_o / N_answered
selectionRate_high(o) = N_selected_o_high / N_high
selectionRate_low(o) = N_selected_o_low / N_low
```

判讀（針對**錯誤選項**）：

- 良好誘答：低分組選擇率 > 高分組選擇率（誘答有效）
- 無效誘答：兩組選擇率均 < 5%（沒人選 → 應改寫）
- 反向誘答：高分組選擇率 > 低分組（題目可能有歧義）

---

<!-- anchor: 3-storage -->

## 3. 儲存設計

### 3.1 QuestionStatistics（已在 [spec-exam-session.md §2](./spec-exam-session.md#2-prisma-schema) 概述，本節為完整版）

```prisma
model QuestionStatistics {
  id              String        @id @default(uuid())
  questionId      String
  examSessionId   String?       // null = 跨考期累積統計

  // 基礎人數
  totalAnswered   Int           // 作答人數
  totalCorrect    Int           // 答對人數（口說題為 null）
  highGroupSize   Int           // 高分組人數
  lowGroupSize    Int           // 低分組人數

  // 三指標
  difficulty      Float         // P 值（口說題為平均得分率）
  discrimination  Float?        // D 值，人數不足時為 null

  // 選項分析（JSONB）
  optionStats     Json          // 結構見 §3.2

  // 口說題專用
  meanScore       Float?        // 平均分
  scoreStdDev     Float?        // 分數標準差

  computedAt      DateTime      @default(now())

  question        Question      @relation("QuestionStatistics", fields: [questionId], references: [id], onDelete: Cascade)
  examSession     ExamSession?  @relation(fields: [examSessionId], references: [id], onDelete: Cascade)

  @@unique([questionId, examSessionId])
  @@index([examSessionId])
  @@index([questionId])
  @@map("question_statistics")
}
```

### 3.2 `optionStats` JSONB 結構

選擇題：

```json
{
  "options": [
    {
      "optionId": "x1a2b3c8",
      "label": "kap",
      "isCorrect": false,
      "selectionCount": 412,
      "selectionRate": 0.135,
      "selectionRateHigh": 0.05,
      "selectionRateLow": 0.22
    },
    {
      "optionId": "y3c4d5e6",
      "label": "比",
      "isCorrect": true,
      "selectionCount": 1820,
      "selectionRate": 0.598,
      "selectionRateHigh": 0.85,
      "selectionRateLow": 0.32
    }
  ]
}
```

聽寫題：`optionStats.distinctAnswers` 列出最常見答案 + 次數（top 10）：

```json
{
  "distinctAnswers": [
    { "answer": "bí-phang", "count": 1850, "isCorrect": true },
    { "answer": "bí phang", "count": 220, "isCorrect": false },
    { "answer": "...", "count": 30, "isCorrect": false }
  ]
}
```

口說題：`optionStats` 為 null。改用 `meanScore` / `scoreStdDev`。

---

<!-- anchor: 4-api -->

## 4. API 端點

### 4.1 觸發重算 `POST /api/statistics/recompute`

- **權限**：`exam-session:update` 或 `system:manage`
- **Request Body**：

  ```json
  {
    "scope": "session" | "cumulative" | "all",
    "examSessionId": "uuid"
  }
  ```

  - `scope = session`：只算指定 `examSessionId` 的統計（`examSessionId` 必填）
  - `scope = cumulative`：算所有題目的累積統計（`examSessionId` 應為 null 或不傳）
  - `scope = all`：算指定 session + 重新更新涉及題目的累積統計

- **邏輯**：建立 `RecomputeJob` 紀錄並非同步執行（先用 `setImmediate` + status，不引入 queue）
- **Response**（立即回，不等完成）：

  ```json
  {
    "success": true,
    "data": {
      "jobId": "uuid",
      "status": "PENDING",
      "scope": "session",
      "examSessionId": "uuid"
    },
    "message": "統計重算已排入背景處理"
  }
  ```

### 4.2 查詢 job 狀態 `GET /api/statistics/jobs/:id`

- **權限**：`exam-session:read`
- **Response data**：

  ```json
  {
    "id": "uuid",
    "scope": "session",
    "status": "RUNNING" | "DONE" | "FAILED",
    "examSessionId": "uuid",
    "totalQuestions": 30,
    "processedQuestions": 18,
    "errorMessage": null,
    "startedAt": "...",
    "finishedAt": null,
    "createdAt": "..."
  }
  ```

#### RecomputeJob schema

```prisma
enum RecomputeJobStatus {
  PENDING
  RUNNING
  DONE
  FAILED

  @@map("recompute_job_status")
}

model RecomputeJob {
  id                  String              @id @default(uuid())
  scope               String              // 'session' | 'cumulative' | 'all'
  examSessionId       String?
  status              RecomputeJobStatus  @default(PENDING)
  totalQuestions      Int                 @default(0)
  processedQuestions  Int                 @default(0)
  errorMessage        String?
  startedAt           DateTime?
  finishedAt          DateTime?

  createdById         String
  createdBy           User                @relation("RecomputeJobCreator", fields: [createdById], references: [id])

  createdAt           DateTime            @default(now())

  @@index([status, createdAt])
  @@map("recompute_jobs")
}
```

> User 補：`recomputeJobsCreated RecomputeJob[] @relation("RecomputeJobCreator")`

### 4.3 單題統計 `GET /api/statistics/questions/:id`

- **權限**：`question:read`
- **Query**：
  | 參數 | 類型 | 預設 | 說明 |
  |---|---|---|---|
  | `view` | string | `cumulative` | `cumulative` / `by-session` |

- **Response data**：

  ```json
  {
    "question": {
      "id": "uuid",
      "category": "GTPT",
      "type": "READING",
      "subType": "GRAMMAR",
      "stem": "...",
      "attributes": { "difficulty": "MEDIUM" }
    },
    "cumulative": {
      "totalAnswered": 4520,
      "totalCorrect": 2810,
      "difficulty": 0.622,
      "discrimination": 0.42,
      "optionStats": { ... },
      "computedAt": "..."
    },
    "bySession": [
      {
        "examSession": { "id": "uuid", "name": "2026 春季", "examDate": "..." },
        "stats": { "difficulty": 0.6, "discrimination": 0.4, ... }
      }
    ]
  }
  ```

- 若該題尚未計算統計回 `404 ERR_STATS_NOT_READY`

### 4.4 試卷統計 `GET /api/statistics/papers/:id`

- **權限**：`exam:read`
- **Response data**：

  ```json
  {
    "paper": { "id": "uuid", "name": "..." },
    "summary": {
      "totalQuestions": 30,
      "meanDifficulty": 0.61,
      "meanDiscrimination": 0.38,
      "questionsBelowDiscriminationThreshold": 4,
      "questionsTooEasy": 2,
      "questionsTooHard": 5
    },
    "bySubType": [
      {
        "subType": "TSH_FILL_BLANK",
        "count": 5,
        "meanDifficulty": 0.7,
        "meanDiscrimination": 0.4
      }
    ],
    "questions": [
      {
        "questionId": "uuid",
        "orderIndex": 1,
        "subType": "TSH_FILL_BLANK",
        "difficulty": 0.65,
        "discrimination": 0.41
      }
    ]
  }
  ```

  - `questionsBelowDiscriminationThreshold`：D < 0.2 的題數
  - `questionsTooEasy`：P > 0.85 的題數
  - `questionsTooHard`：P < 0.3 的題數
  - 各門檻可後續調整為可設定

### 4.5 多維度交叉查詢 `GET /api/statistics/explore`

- **權限**：`question:read`
- **Query**：
  | 參數 | 類型 | 預設 | 說明 |
  |---|---|---|---|
  | `groupBy` | string | — | 分群欄位（多選逗號）：`subType` / `category` / `textSystem` / `attributes.difficulty` / `author` |
  | `examSessionId` | uuid | — | 限定某場次。預設使用 cumulative |
  | `metric` | string | `difficulty` | 聚合指標：`difficulty` / `discrimination` |
  | `aggregation` | string | `mean` | `mean` / `median` |

- **Response data**：

  ```json
  {
    "groupBy": ["subType", "attributes.difficulty"],
    "metric": "discrimination",
    "rows": [
      { "subType": "GRAMMAR", "difficulty_attr": "HIGH", "value": 0.45, "questionCount": 23 },
      { "subType": "GRAMMAR", "difficulty_attr": "MEDIUM", "value": 0.38, "questionCount": 50 },
      { "subType": "TSH_DIALOGUE", "difficulty_attr": "LOW", "value": 0.32, "questionCount": 12 }
    ]
  }
  ```

  - 用於儀表板熱力圖、長條圖

### 4.6 出題者品質報告 `GET /api/statistics/authors/:id`

- **權限**：`question:read`
- **Response data**：

  ```json
  {
    "author": { "id": "uuid", "name": "王老師" },
    "totalQuestionsApproved": 45,
    "totalQuestionsArchived": 5,
    "meanDifficulty": 0.6,
    "meanDiscrimination": 0.41,
    "discriminationDistribution": {
      "good": 30,
      "fair": 12,
      "poor": 3
    }
  }
  ```

> 用於後續對出題者績效回饋。可選功能，不在 Phase 5 必做（標 nice-to-have）。

---

<!-- anchor: 5-impl -->

## 5. 實作細節

### 5.1 模組結構

```
packages/backend/src/modules/statistics/
├── statistics.routes.ts        # 5 條 API
├── statistics.service.ts       # 查詢與聚合
├── statistics.compute.ts       # 純函式：CTT 計算
├── statistics.jobs.ts          # async recompute job runner
└── index.ts
```

### 5.2 純計算函式（無 IO）

`statistics.compute.ts` 是核心，所有公式不依賴 Prisma，便於單元測試：

```typescript
export interface ResponseSlice {
  candidateId: string
  totalScore: number
  selectedOptionId: string | null
  writtenAnswer: string | null
  speakingScore: number | null
  isCorrect: boolean | null
}

export interface QuestionMeta {
  questionId: string
  type: 'READING' | 'LISTENING' | 'SPEAKING' | 'DICTATION'
  subType: string
  options: Array<{ id: string; text: string }>     // 選項；口說/聽寫題為 []
  correctOptionId: string | null                    // 選擇題；其餘為 null
  correctText: string | null                        // 聽寫題；其餘為 null
  maxScore: number                                  // 該題滿分
}

export interface ComputedStatistics {
  totalAnswered: number
  totalCorrect: number | null
  highGroupSize: number
  lowGroupSize: number
  difficulty: number
  discrimination: number | null
  optionStats: unknown
  meanScore: number | null
  scoreStdDev: number | null
}

export function computeQuestionStatistics(
  question: QuestionMeta,
  responses: ResponseSlice[],
): ComputedStatistics
```

實作要點：

1. 排序 responses 依 `totalScore` 由高至低
2. 依 §1.3 切分高低組
3. 依題型分支：
   - 選擇題：算 P / D / optionStats
   - 聽寫題：以 `isCorrect` 算 P / D；optionStats 統計 distinctAnswers top 10
   - 口說題：以 `speakingScore` 算平均、標準差、D（用平均分差）

#### 範例（選擇題核心片段）

```typescript
function computeMultipleChoice(
  question: QuestionMeta,
  responses: ResponseSlice[],
): ComputedStatistics {
  const answered = responses.filter((r) => r.selectedOptionId !== null)
  const totalAnswered = answered.length
  if (totalAnswered === 0) {
    return zeroStats()
  }

  const totalCorrect = answered.filter((r) => r.isCorrect === true).length
  const difficulty = totalCorrect / totalAnswered

  // 切分高低組
  const sorted = [...answered].sort((a, b) => b.totalScore - a.totalScore)
  const groupRatio = totalAnswered < 30 ? 1 / 3 : 0.27
  const groupSize = Math.max(1, Math.floor(totalAnswered * groupRatio))
  const high = sorted.slice(0, groupSize)
  const low = sorted.slice(-groupSize)

  let discrimination: number | null = null
  if (totalAnswered >= 10) {
    const pHigh = high.filter((r) => r.isCorrect).length / high.length
    const pLow = low.filter((r) => r.isCorrect).length / low.length
    discrimination = pHigh - pLow
  }

  const optionStats = {
    options: question.options.map((opt) => {
      const selected = answered.filter((r) => r.selectedOptionId === opt.id)
      const selectedHigh = high.filter((r) => r.selectedOptionId === opt.id).length
      const selectedLow = low.filter((r) => r.selectedOptionId === opt.id).length
      return {
        optionId: opt.id,
        label: opt.text,
        isCorrect: opt.id === question.correctOptionId,
        selectionCount: selected.length,
        selectionRate: selected.length / totalAnswered,
        selectionRateHigh: selectedHigh / high.length,
        selectionRateLow: selectedLow / low.length,
      }
    }),
  }

  return {
    totalAnswered,
    totalCorrect,
    highGroupSize: high.length,
    lowGroupSize: low.length,
    difficulty,
    discrimination,
    optionStats,
    meanScore: null,
    scoreStdDev: null,
  }
}
```

### 5.3 Job Runner（async）

```typescript
// statistics.jobs.ts
export async function runRecomputeJob(
  prisma: PrismaClient,
  jobId: string,
): Promise<void> {
  const job = await prisma.recomputeJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  try {
    const targets = await collectTargetQuestions(prisma, job)
    await prisma.recomputeJob.update({
      where: { id: jobId },
      data: { totalQuestions: targets.length },
    })

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!
      await computeAndUpsertOne(prisma, t.questionId, t.examSessionId)
      if ((i + 1) % 20 === 0) {
        await prisma.recomputeJob.update({
          where: { id: jobId },
          data: { processedQuestions: i + 1 },
        })
      }
    }

    await prisma.recomputeJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        processedQuestions: targets.length,
        finishedAt: new Date(),
      },
    })
  } catch (err) {
    await prisma.recomputeJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
        finishedAt: new Date(),
      },
    })
  }
}

// 觸發點（在 routes 內）
fastify.post('/statistics/recompute', { /* ... */ }, async (request, reply) => {
  const job = await fastify.prisma.recomputeJob.create({ data: { /* ... */ } })
  setImmediate(() => {
    void runRecomputeJob(fastify.prisma, job.id)
  })
  return sendSuccess(reply, { jobId: job.id, status: job.status })
})
```

> `setImmediate` 適合題庫規模（最多幾千題、上萬 response），單機 Node.js 足夠。若未來規模擴大可改 BullMQ。

### 5.4 cumulative 統計的更新策略

每次 session 統計完後，**自動觸發**該 session 涉及題目的 cumulative 重算（前提：scope=`all`）。

```typescript
async function collectTargetQuestions(
  prisma: PrismaClient,
  job: RecomputeJob,
): Promise<Array<{ questionId: string; examSessionId: string | null }>> {
  if (job.scope === 'session') {
    const questions = await prisma.question.findMany({
      where: {
        candidateResponses: { some: { examSessionId: job.examSessionId! } },
      },
      select: { id: true },
    })
    return questions.map((q) => ({ questionId: q.id, examSessionId: job.examSessionId! }))
  }

  if (job.scope === 'cumulative') {
    const questions = await prisma.question.findMany({
      where: { candidateResponses: { some: {} } },
      select: { id: true },
    })
    return questions.map((q) => ({ questionId: q.id, examSessionId: null }))
  }

  // scope = 'all'：先 session 再 cumulative
  const sessionTargets = /* ... 同上 ... */
  const cumulativeTargets = sessionTargets.map((t) => ({ ...t, examSessionId: null }))
  return [...sessionTargets, ...cumulativeTargets]
}
```

### 5.5 邊界條件

實作 `computeAndUpsertOne` 時必須處理：

- response 數 = 0：仍寫一筆 stats（totalAnswered=0、其他 null），標記「未進行作答」
- 所有人都答對 / 都答錯：D = 0
- session 仍為 DRAFT 時：依 [§1.2](#12-哪些-response-會被算進統計) 規則應該被 collectTargetQuestions 過濾掉，但仍要在 service 內 defensive 檢查
- question 為題組父題：父題本身沒有 answer，跳過

---

<!-- anchor: 6-frontend -->

## 6. 前端整合

### 6.1 新頁面結構

```
packages/frontend/src/pages/Statistics/
├── QuestionStats.tsx        # 單題統計（跨 session 趨勢 + 選項分析）
├── PaperStats.tsx           # 試卷整體統計
├── Explore.tsx              # 多維度儀表板
└── components/
    ├── DifficultyBadge.tsx  # 依 P 值染色 Tag
    ├── DiscriminationBadge.tsx
    ├── OptionStatsTable.tsx
    └── DistractorChart.tsx  # 選項分析條圖（recharts）
```

### 6.2 QuestionStats 主要區塊

1. **題目卡片**：基本資訊（與 QuestionDetail 共用 component）
2. **指標摘要**：P / D 大字顯示 + 染色 Tag
3. **跨場次趨勢圖**：折線圖（X = examDate / Y = P 與 D）
4. **選項分析表 + 條圖**：高低組選擇率視覺化
5. **動作**：「重新計算此題統計」按鈕（呼叫 recompute scope=all + questionId）

### 6.3 PaperStats 主要區塊

1. **試卷概要 Card**：summary 大數據
2. **依題型分組統計 Table**
3. **問題題目列表**：D < 0.2 或 P 過於極端的題目排序在前，方便快速找出需改寫的題目
4. **動作**：「重新計算此試卷統計」（觸發 scope=session）

### 6.4 Explore 多維度儀表板

- 上方控制列：groupBy / metric / aggregation / examSession 下拉
- 主視圖依 groupBy 維度切換：
  - 1 維 → 長條圖
  - 2 維 → 熱力圖
- 下方 Table：明細列出 rows

### 6.5 ExamSessionDetail 整合

於 [spec-exam-session.md §9.2](./spec-exam-session.md#92-examsessiondetail-%E9%A0%81%E4%B8%BB%E8%A6%81%E5%8D%80%E5%A1%8A) 提到的 ExamSessionDetail 頁，在「動作按鈕」加上：

- 「重新計算此場次統計」按鈕：呼叫 `POST /api/statistics/recompute` (scope='all', examSessionId=當前)
- 「查看試卷統計」連結：跳到 PaperStats 頁

### 6.6 QuestionDetail 整合

QuestionDetail 頁加新 Tab「統計」，顯示 §6.2 的內容。

---

<!-- anchor: 7-error-codes -->

## 7. 新增錯誤碼

| Error Code | HTTP Status | 說明 |
|---|---|---|
| `ERR_STATS_NOT_READY` | 404 | 該題目尚未計算過統計 |
| `ERR_RECOMPUTE_JOB_NOT_FOUND` | 404 | 找不到對應的 recompute job |
| `ERR_RECOMPUTE_IN_PROGRESS` | 409 | 已有相同 scope 的 job 在執行中（避免重複觸發） |

---

<!-- anchor: 8-do-dont -->

## 8. DO / DON'T

### DO

- 把 CTT 計算抽成 pure function，給定 fixture 即可單元測試
- response 過濾邏輯（哪些算進統計）集中在一個 helper（避免散落）
- 高低組切分依 §1.3 規則，並在註解標註（人數不足時自動切換為 1/3）
- 計算結果用 `prisma.upsert` 寫入，避免重複跑時新增多筆
- recompute job 內每 20 題更新一次 `processedQuestions`，前端可顯示進度條
- 對「同 paperVariant」獨立切高低組，再合併

### DON'T

- 不要在計算函式裡 query DB——只接受 plain data
- 不要在 production 環境讓使用者隨意觸發 cumulative 重算（題庫大時會卡，加 cooldown）
- 不要把選擇題的「正確答案」用在 query 條件裡（從 question.answer 讀，避免把答案塞進 response）
- 不要把 D < 0 的題目標為「優良」——這通常代表題目寫錯了
- 不要直接把 statistics 結果暴露給考生端（這是內部分析資料）

---

<!-- anchor: 9-acceptance -->

## 9. Definition of Done

### 9.1 計算正確性

- [ ] `statistics.compute.ts` 對選擇題、聽寫題、口說題各有單元測試 fixture
- [ ] P 值計算與 spec 公式一致
- [ ] D 值在人數 < 10 時為 null
- [ ] 高低組切分人數 < 30 時自動切換為 1/3
- [ ] 選項分析含正確 / 錯誤選項的高低組差異
- [ ] 邊界 case：所有人答對、所有人答錯、無人作答各自不會 throw

### 9.2 API

- [ ] `POST /api/statistics/recompute` 立即回 jobId，背景執行
- [ ] `GET /api/statistics/jobs/:id` 顯示進度
- [ ] `GET /api/statistics/questions/:id` 回傳 cumulative + bySession
- [ ] `GET /api/statistics/papers/:id` 回傳 summary + bySubType + 題目明細
- [ ] `GET /api/statistics/explore` 多維度交叉聚合正確

### 9.3 前端

- [ ] QuestionStats 顯示跨 session 趨勢圖
- [ ] PaperStats 標出問題題目（D 低、P 極端）
- [ ] Explore 1 維 / 2 維可視化
- [ ] ExamSessionDetail 與 QuestionDetail 都整合了統計入口

### 9.4 整合

- [ ] 匯入 responses 完成後 → MARK_IMPORTED → 自動觸發 recompute
- [ ] 統計重算完成後 cumulative 也跟著更新
- [ ] DRAFT session 的 response 不會出現在 cumulative 中
