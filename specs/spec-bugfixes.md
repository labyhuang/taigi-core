# P0 Critical Bugs 修復規格 (Bugfixes Spec)

<!-- anchor: overview -->

## 0. 文件目的

本文件記錄第一階段（Phase 1）必須優先修復的 7 項 critical bugs。每項均為現存實作與 spec 不一致、或具明確資安／正確性風險。

**閱讀本文件前不需其他 context**：所有需要的檔案位置、現況片段、修法 code 都在本文件內。

**前置條件**：本 phase 的修復**不依賴新 schema**，可在 Phase 2 之前獨立完成。

**驗收標準**：見每節末段的 `Definition of Done`。最終以 [§9 整體驗收清單](#9-%E6%95%B4%E9%AB%94%E9%A9%97%E6%94%B6%E6%B8%85%E5%96%AE) 為準。

---

<!-- anchor: bug-summary -->

## 1. 修復清單一覽

| # | 嚴重度 | 標題 | 主要檔案 |
|---|---|---|---|
| 1 | Critical（資安） | CSRF 全域未套用 | [packages/backend/src/app.ts](../packages/backend/src/app.ts) |
| 2 | Critical（正確性） | `generatePaper` multi-criteria 覆蓋 | [packages/backend/src/modules/blueprints/blueprints.service.ts](../packages/backend/src/modules/blueprints/blueprints.service.ts) |
| 3 | High（資安） | `PATCH /api/questions/:id/status` 權限太寬 | [packages/backend/src/modules/questions/questions.routes.ts](../packages/backend/src/modules/questions/questions.routes.ts) |
| 4 | High（資安） | ASSEMBLER 越權看到所有題目 | [packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) |
| 5 | High（效能） | `attributes` GIN index 被 migration 砍掉 | `packages/backend/prisma/migrations/` |
| 6 | High（業務） | 送審未驗 `attributes` `isRequired` | [packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) |
| 7 | Medium（業務） | `createQuestion` 未寫 ReviewLog | [packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) |

---

<!-- anchor: bug-1-csrf -->

## 2. Bug #1：CSRF 全域未套用

### 2.1 現況

- [packages/backend/src/plugins/csrf.ts](../packages/backend/src/plugins/csrf.ts) 已 register `@fastify/csrf-protection`。
- 但**沒有任何路由**設定 `preHandler: fastify.csrfProtection`。
- `@fastify/csrf-protection` 不會自動套用到所有路由——必須明確掛 preHandler 才會驗證 `x-csrf-token` header。

### 2.2 影響

- 所有 `POST/PUT/PATCH/DELETE` 端點實際上**沒有 CSRF 保護**。
- 攻擊者在外部站建惡意表單就能盜用使用者 Session 寫入資料。
- 此為高機敏題庫系統不可接受的資安漏洞。

### 2.3 修法

於 [packages/backend/src/app.ts](../packages/backend/src/app.ts) 在 `csrfPlugin` 註冊**之後**加上全域 `onRoute` hook，自動為所有寫入端點掛 `csrfProtection`，並排除特定公開端點：

```typescript
// in buildApp() after `await app.register(csrfPlugin)`:

const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/login',
  '/api/auth/verify-2fa',
  '/api/users/setup/verify-token',
  '/api/users/setup/profile',
  '/api/users/setup/2fa-generate',
  '/api/users/setup/2fa-verify',
  // 未來 ExamSession import API key 推送端點也走例外（用 API key 而非 CSRF）
  '/api/exam-sessions/imports/api/',
] as const

app.addHook('onRoute', (routeOptions) => {
  const methods = ([] as string[]).concat(routeOptions.method as never)
  const isMutation = methods.some((m) =>
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(m).toUpperCase()),
  )
  if (!isMutation) return

  const url = String(routeOptions.url ?? '')
  if (CSRF_EXEMPT_PREFIXES.some((p) => url.startsWith(p))) return

  const existing = routeOptions.preHandler
  const handlers = ([] as unknown[]).concat(existing ?? [])
  handlers.unshift(app.csrfProtection)
  routeOptions.preHandler = handlers as never
})
```

### 2.4 DO / DON'T

- **DO**：用 `onRoute` hook 集中處理，避免每條路由各自掛 preHandler 容易漏。
- **DO**：把 login / setup / API key 推送等明確需例外的端點寫成常數陣列。
- **DON'T**：把 `csrfProtection` 加到 `requireAuth` / `requirePermission` 內部。CSRF 是更早的關卡，與認證同層而非更內層。
- **DON'T**：對 GET 端點掛 CSRF（會破壞 CORS 與直接下載）。

### 2.5 Definition of Done

- [ ] 沒帶 `x-csrf-token` 的 `POST /api/questions` 回 `403`
- [ ] 帶正確 token 的 `POST /api/questions` 正常運作
- [ ] `POST /api/auth/login` 不帶 token 仍可登入（在例外清單）
- [ ] 前端 [packages/frontend/src/utils/api.ts](../packages/frontend/src/utils/api.ts) 既有的 CSRF retry 邏輯在 token 過期時可正常 retry

---

<!-- anchor: bug-2-multi-criteria -->

## 3. Bug #2：`generatePaper` multi-criteria attribute 過濾被覆蓋

### 3.1 現況

[packages/backend/src/modules/blueprints/blueprints.service.ts](../packages/backend/src/modules/blueprints/blueprints.service.ts) 第 309–317 行：

```typescript
if (criteria && Object.keys(criteria).length > 0) {
  for (const [key, value] of Object.entries(criteria)) {
    whereConditions.attributes = {
      ...((whereConditions.attributes as Record<string, unknown>) ?? {}),
      path: [key],
      equals: value,
    } as never
  }
}
```

### 3.2 影響

每輪迴圈都覆蓋 `path` / `equals`，最終 `whereConditions.attributes` 只會保留**最後一個 criteria**。當 cell 有 `{ difficulty: "HIGH", topic: "DAILY" }` 時其實只篩 `topic = DAILY`，違反 spec「條件全部需滿足 (AND)」的契約，導致抽出來的題目不符組卷預期。

### 3.3 修法

改用 Prisma 的 `AND` 條件，把每個 criteria pair 變成獨立的 `attributes` JSONB filter：

```typescript
import type { Prisma } from '../../generated/prisma/index.js'

// 在 generatePaper 內 build whereConditions 時：
const whereConditions: Prisma.QuestionWhereInput = {
  category: blueprint.examCategory,
  type: cell.questionType,
  subType: cell.questionSubType,
  status: 'APPROVED',
  id: { notIn: [...usedQuestionIds] },
}

if (criteria && Object.keys(criteria).length > 0) {
  whereConditions.AND = Object.entries(criteria).map(([key, value]) => ({
    attributes: {
      path: [key],
      equals: value,
    },
  })) as Prisma.QuestionWhereInput[]
}
```

### 3.4 DO / DON'T

- **DO**：multi-key JSONB 過濾用 `AND` 陣列，每筆獨立的 `attributes` filter。
- **DO**：保留 `id: { notIn: [...usedQuestionIds] }` 用於跨 cell 去重。
- **DON'T**：用 spread 嘗試合併 `attributes` filter——Prisma 的 JSONB filter 不支援合併語法。
- **DON'T**：直接寫 raw SQL 的 `@>` 運算子（除非有效能瓶頸）。Prisma 的 `path/equals` 已能對應到 SQL `->`，配合 GIN index 效能足夠。

### 3.5 Definition of Done

- [ ] 單元測試：cell criteria = `{ difficulty: 'HIGH' }` 抽出來的所有題目 `attributes.difficulty === 'HIGH'`
- [ ] 單元測試：cell criteria = `{ difficulty: 'HIGH', topic: 'DAILY' }` 抽出來題目同時滿足兩條件
- [ ] 手測：建立藍圖含 2 個 criteria 的 cell，組卷後檢查抽出題目皆符合

---

<!-- anchor: bug-3-status-permission -->

## 4. Bug #3：`PATCH /api/questions/:id/status` 權限太寬

### 4.1 現況

[packages/backend/src/modules/questions/questions.routes.ts](../packages/backend/src/modules/questions/questions.routes.ts) 第 100–106 行：

```typescript
fastify.patch(
  '/questions/:id/status',
  {
    schema: { params: QuestionIdParams, body: UpdateQuestionStatusBody },
    preHandler: [requirePermission('question:read')],
  },
  ...
)
```

### 4.2 影響

[spec-question-bank.md §第三部分 2.1](./spec-question-bank.md) 規定不同 action 需不同 permission：

| action | 所需 permission |
|---|---|
| `SUBMIT` | `question:submit` |
| `APPROVE` | `question:approve` |
| `REJECT` | `question:reject` |
| `ARCHIVE` | `system:manage` |

目前只擋 `question:read`，意味著 ASSEMBLER（只有 read 權限的組卷者）能對任意題目按 SUBMIT / APPROVE / REJECT / ARCHIVE。屬於資安等級的越權漏洞。

### 4.3 修法

#### 步驟一：在 service 層中加入動態權限檢查

修改 [packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) 的 `updateQuestionStatus`，於最開頭依 action 對照所需 permission：

```typescript
const STATUS_ACTION_PERMISSION: Record<string, string> = {
  SUBMIT: 'question:submit',
  APPROVE: 'question:approve',
  REJECT: 'question:reject',
  ARCHIVE: 'system:manage',
}

export async function updateQuestionStatus(
  prisma: PrismaClient,
  id: string,
  action: string,
  comment: string | undefined,
  sessionUser: { id: string; permissions: string[] },
) {
  const requiredPerm = STATUS_ACTION_PERMISSION[action]
  if (!requiredPerm) {
    throw new AppError(400, ErrorCode.VALIDATION, `不合法的動作: ${action}`)
  }
  if (!sessionUser.permissions.includes(requiredPerm)) {
    throw new AppError(403, ErrorCode.FORBIDDEN, `此動作需要 ${requiredPerm} 權限`)
  }

  // ... 既有邏輯
}
```

#### 步驟二：放寬 routes 層的 preHandler

routes 層只需確保已登入，細項權限由 service 層動態判斷：

```typescript
fastify.patch(
  '/questions/:id/status',
  {
    schema: { params: QuestionIdParams, body: UpdateQuestionStatusBody },
    preHandler: [requireAuth()],
  },
  ...
)
```

### 4.4 DO / DON'T

- **DO**：把對應表 `STATUS_ACTION_PERMISSION` 放在 service 層，靠近業務邏輯。
- **DO**：保留 `requireAuth()` 確保 Session 存在（不能完全移除 preHandler）。
- **DON'T**：在 route 層用 `if/else` 分歧出多個 endpoint（如 `/submit`、`/approve`），會破壞 spec 既有 API 合約。
- **DON'T**：把對應表寫死在 schema TypeBox 裡，未來新增 action 不容易擴充。

### 4.5 Definition of Done

- [ ] 只有 `question:create` 的使用者（AUTHOR）對 DRAFT 題執行 `SUBMIT` 成功
- [ ] AUTHOR 對 PENDING 題執行 `APPROVE` 回 `403 ERR_FORBIDDEN`（缺 `question:approve`）
- [ ] ASSEMBLER 對任何題目執行 `APPROVE` 回 `403 ERR_FORBIDDEN`
- [ ] ADMIN 對 APPROVED 題執行 `ARCHIVE` 成功

---

<!-- anchor: bug-4-assembler-overprivilege -->

## 5. Bug #4：ASSEMBLER 越權看到所有題目

### 5.1 現況

[packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) 第 286–298 行：

```typescript
const isAdmin = permissions.includes('system:manage')
const isReviewer = permissions.includes('question:approve')
const isAuthor = permissions.includes('question:create')

if (isAdmin) {
  // Admin 無限制
} else if (isReviewer) {
  where.status = QuestionStatus.PENDING
} else if (isAuthor) {
  where.authorId = sessionUser.id
}
```

### 5.2 影響

ASSEMBLER（組卷者）只擁有 `question:read`、`exam:*`，三個 if 都不命中 → `where` 沒任何過濾 → 看到所有狀態的題目（含 DRAFT/REJECTED/ARCHIVED）。但 spec 規定組卷者**只應看到 APPROVED 題目**（用於替換考卷題）。

### 5.3 修法

改用「白名單 + 預設 APPROVED-only」邏輯，並把規則放在獨立函式以便測試：

```typescript
function buildQuestionListScope(sessionUser: { id: string; permissions: string[] }) {
  const perms = sessionUser.permissions
  const isAdmin = perms.includes('system:manage')
  const isReviewer = perms.includes('question:approve')
  const isAuthor = perms.includes('question:create')

  // 優先級：Admin > Reviewer > Author > 預設（assembler / 其他唯讀角色）
  if (isAdmin) {
    return {} satisfies Prisma.QuestionWhereInput
  }
  if (isReviewer) {
    return { status: QuestionStatus.PENDING } satisfies Prisma.QuestionWhereInput
  }
  if (isAuthor) {
    return { authorId: sessionUser.id } satisfies Prisma.QuestionWhereInput
  }
  // 預設：純讀者（含 ASSEMBLER）只能看已核可的題目
  return { status: QuestionStatus.APPROVED } satisfies Prisma.QuestionWhereInput
}
```

並於 `listQuestions` 開頭：

```typescript
const where: Prisma.QuestionWhereInput = { ...buildQuestionListScope(sessionUser) }
// 後續 query.* 條件繼續疊加
```

對 `getQuestion` 也應加上同層判斷：非 admin / 非作者 / 非 reviewer 看 PENDING 時應拒絕，純讀者看非 APPROVED 也拒絕：

```typescript
export async function getQuestion(
  prisma: PrismaClient,
  id: string,
  sessionUser: { id: string; permissions: string[] },
) {
  const question = await prisma.question.findUnique({ where: { id }, select: questionDetailSelect })
  if (!question) throw new AppError(404, ErrorCode.NOT_FOUND, '題目不存在')

  const perms = sessionUser.permissions
  const isAdmin = perms.includes('system:manage')
  if (isAdmin) return question

  const isReviewer = perms.includes('question:approve')
  const isAuthor = perms.includes('question:create')

  if (isAuthor && question.author?.id === sessionUser.id) return question
  if (isReviewer && question.status === 'PENDING') return question
  if (question.status === 'APPROVED') return question

  throw new AppError(403, ErrorCode.FORBIDDEN, '無權檢視此題目')
}
```

並調整對應 routes 把 `sessionUser` 傳入 `getQuestion`。

### 5.4 DO / DON'T

- **DO**：用「預設拒絕」原則，預設只讓純讀者看 APPROVED。
- **DO**：把 scope 邏輯抽成 pure function，方便寫單元測試。
- **DON'T**：以「permission 有沒有 `system:manage`」當作 admin 的唯一判斷——這是巧合（seed 中只有 ADMIN 有此權限），未來若新增專業角色可能誤判。
- **DON'T**：靠前端隱藏按鈕當作權限——後端必須有強制過濾。

### 5.5 Definition of Done

- [ ] ASSEMBLER 呼叫 `GET /api/questions` 只看到 `status = APPROVED` 的題目
- [ ] ASSEMBLER 呼叫 `GET /api/questions/:id`（DRAFT 題）回 `403`
- [ ] AUTHOR 看不到別人的題目
- [ ] REVIEWER 看不到 DRAFT 題（只看 PENDING）
- [ ] ADMIN 看到所有題目

---

<!-- anchor: bug-5-gin-index -->

## 6. Bug #5：`attributes` GIN index 被 migration 砍掉

### 6.1 現況

- `packages/backend/prisma/migrations/20260301143511_exam_assembly_and_attributes/migration.sql` 建立了 GIN index：

  ```sql
  CREATE INDEX "idx_questions_attributes" ON "questions" USING GIN ("attributes");
  ```

- `packages/backend/prisma/migrations/20260301143527/migration.sql` 又把它砍了：

  ```sql
  DROP INDEX "idx_questions_attributes";
  ```

- [packages/backend/prisma/schema.prisma](../packages/backend/prisma/schema.prisma) 完全沒記載這個 index（Prisma schema 不支援 `USING GIN`，必須留在 raw migration）。

### 6.2 影響

正式環境抽題演算法用 JSONB filter，沒有 GIN index 會造成 sequential scan，題庫一過萬筆抽題會嚴重變慢（>1s/cell）。

### 6.3 修法

新建 migration 重新加回 GIN index，並用 `IF NOT EXISTS` 確保冪等：

**新 migration 路徑**：`packages/backend/prisma/migrations/<新 timestamp>_restore_attributes_gin_index/migration.sql`

```sql
CREATE INDEX IF NOT EXISTS "idx_questions_attributes"
  ON "questions" USING GIN ("attributes");
```

並於 [packages/backend/prisma/schema.prisma](../packages/backend/prisma/schema.prisma) `model Question` 上方加註解，讓未來 migrate dev 不會誤砍：

```prisma
// 注意：attributes 欄位有手動建立的 GIN index "idx_questions_attributes"
// （Prisma schema 不支援 USING GIN 語法，定義於 raw migration 中）
// 修改 attributes 相關欄位時請確保 migration 不會 DROP 此 index。
model Question {
  // ...
}
```

### 6.4 DO / DON'T

- **DO**：用 `IF NOT EXISTS` 讓 migration 冪等。
- **DO**：在 schema.prisma 加註解標示該 index 存在於 raw migration。
- **DON'T**：用 `prisma migrate dev` 自動產 migration——它不會生成 GIN，要手寫 SQL 檔案。
- **DON'T**：把 GIN index 改成 `@@index([attributes])`（Prisma 預設用 B-tree，對 JSONB 沒效）。

### 6.5 Definition of Done

- [ ] `pnpm prisma migrate deploy` 在乾淨 DB 上跑完後，`\d questions` 顯示 `idx_questions_attributes` (gin)
- [ ] `EXPLAIN ANALYZE SELECT * FROM questions WHERE attributes @> '{"difficulty":"HIGH"}'::jsonb` 出現 Bitmap Index Scan on `idx_questions_attributes`
- [ ] schema.prisma 中相關註解已加上

---

<!-- anchor: bug-6-attributes-required -->

## 7. Bug #6：送審未驗 `attributes` 必填

### 7.1 現況

[packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) 的 `validateSubmitStrict` 完全未檢查 `attributes`。

### 7.2 影響

[spec-question-bank.md §第二部分 3 節](./spec-question-bank.md) 明確規定「送審時，後端須檢查 `attributes` 中所有 `isRequired = true` 的 `AttributeDefinition`（依題目的 `category` 篩選適用屬性）是否已填入合法值」。目前 seed 中「困難度」是 `isRequired: true`，但實作未強制——使用者可以送審缺困難度的題目，後續組卷的條件過濾會失效。

### 7.3 修法

#### 步驟一：抽出共用驗證 helper

新增 [packages/backend/src/modules/attributes/attributes.validation.ts](../packages/backend/src/modules/attributes/attributes.validation.ts)：

```typescript
import type { PrismaClient } from '../../generated/prisma/index.js'
import { AppError } from '../../utils/errors.js'
import { ErrorCode } from '../../types/response.js'

/**
 * 驗證 attributes 物件中所有 key/value 皆為 AttributeDefinition / AttributeValue 中的合法組合。
 * 用於 createQuestion / updateQuestion。
 */
export async function validateAttributesShape(
  prisma: PrismaClient,
  attributes: Record<string, string>,
): Promise<void> {
  if (!attributes || Object.keys(attributes).length === 0) return

  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: Object.keys(attributes) } },
    include: { values: true },
  })
  const defMap = new Map(defs.map((d) => [d.key, d]))

  for (const [key, value] of Object.entries(attributes)) {
    const def = defMap.get(key)
    if (!def) {
      throw new AppError(400, ErrorCode.VALIDATION, `不合法的屬性 key: ${key}`)
    }
    const allowed = def.values.map((v) => v.value)
    if (!allowed.includes(value)) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION,
        `屬性 "${key}" 的值 "${value}" 不合法，合法值: ${allowed.join(', ')}`,
      )
    }
  }
}

/**
 * 送審時驗證所有 isRequired = true 的屬性都已填入，且符合 examCategory 過濾。
 */
export async function validateAttributesRequired(
  prisma: PrismaClient,
  category: string,
  attributes: Record<string, string>,
): Promise<void> {
  const requiredDefs = await prisma.attributeDefinition.findMany({
    where: {
      isRequired: true,
      OR: [{ examCategory: null }, { examCategory: category as never }],
    },
  })

  const missing: string[] = []
  for (const def of requiredDefs) {
    const value = attributes?.[def.key]
    if (!value || value.trim().length === 0) {
      missing.push(`${def.name} (${def.key})`)
    }
  }

  if (missing.length > 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION,
      `送審前必填屬性未填寫: ${missing.join(', ')}`,
      missing.map((m) => ({ field: 'attributes', message: m })),
    )
  }
}
```

#### 步驟二：於 `createQuestion` / `updateQuestion` 呼叫 shape 驗證

```typescript
// in createQuestion / updateQuestion before prisma.question.create/update
await validateAttributesShape(prisma, body.attributes ?? {})
```

#### 步驟三：於 `updateQuestionStatus` 的 `SUBMIT` 分支呼叫 required 驗證

```typescript
if (reviewAction === ReviewAction.SUBMIT) {
  // ... 既有的 author 驗證、validateSubmitStrict
  await validateAttributesRequired(
    prisma,
    question.category,
    (question.attributes ?? {}) as Record<string, string>,
  )

  if (question.isGroupParent) {
    // 子題也要驗
    for (const child of children) {
      await validateAttributesRequired(
        prisma,
        child.category,
        (child.attributes ?? {}) as Record<string, string>,
      )
    }
  }
}
```

### 7.4 DO / DON'T

- **DO**：把 shape 驗證（key/value 合法）與 required 驗證分開——前者每次 create/update 都跑，後者只在送審時跑。
- **DO**：用 `details` 陣列回傳缺哪些屬性，前端可即時顯示。
- **DON'T**：在 TypeBox schema 寫死屬性 key（屬性是動態的）。
- **DON'T**：草稿階段就要求必填屬性——草稿允許半成品，送審時才強制。

### 7.5 Definition of Done

- [ ] 建立題目時帶不存在的 attribute key 回 `ERR_VALIDATION`
- [ ] 建立題目時帶不合法的 value 回 `ERR_VALIDATION` 含合法值清單
- [ ] 缺 difficulty 的題目送審回 `ERR_VALIDATION`，details 列出缺哪些屬性
- [ ] 補上 difficulty 後送審成功
- [ ] 題組父題送審時，子題缺必填屬性也會擋下

---

<!-- anchor: bug-7-create-review-log -->

## 8. Bug #7：`createQuestion` 未寫 ReviewLog

### 8.1 現況

[spec-question-bank.md §第三部分 1.1](./spec-question-bank.md) 規定建立題目時應「新增 ReviewLog `{ action: 'SUBMIT', comment: null }`（記錄建立動作，此處 action 用 `SUBMIT` 語意為『建立』）」，但 [packages/backend/src/modules/questions/questions.service.ts](../packages/backend/src/modules/questions/questions.service.ts) 的 `createQuestion` 沒做這件事。

### 8.2 影響

前端 `<Timeline>` 顯示審查歷程時，第一筆「建立紀錄」缺失，使用者看到的歷程從「送審」開始，無法追溯誰何時建立了草稿。

### 8.3 修法

`createQuestion` 包成 `prisma.$transaction`，同時建立 Question 與 初始 ReviewLog。為了避免 spec 中「`SUBMIT` 語意為建立」造成誤解（與真正的送審 SUBMIT 撞名），本次修法**新增一個 `CREATE` action**至 `ReviewAction` enum：

#### 步驟一：擴充 `ReviewAction` enum

[packages/backend/prisma/schema.prisma](../packages/backend/prisma/schema.prisma)：

```prisma
enum ReviewAction {
  CREATE      // 新增：建立草稿
  SUBMIT
  APPROVE
  REJECT
  ARCHIVE

  @@map("review_action")
}
```

新 migration：`packages/backend/prisma/migrations/<timestamp>_add_review_action_create/migration.sql`：

```sql
ALTER TYPE "review_action" ADD VALUE IF NOT EXISTS 'CREATE';
```

> 注意：PostgreSQL 對 enum 加值不能在 transaction 中跑，migration 檔不能與其他 DDL 混用。獨立一檔。

#### 步驟二：`createQuestion` 寫入 ReviewLog

```typescript
export async function createQuestion(
  prisma: PrismaClient,
  body: CreateQuestionBodyType,
  authorId: string,
) {
  validateCategoryTypeSubType(body.category, body.type, body.subType)
  await validateAttributesShape(prisma, body.attributes ?? {})
  // ... 既有的 group parent / parent 驗證

  return prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        // ... 既有 data
      },
      select: questionDetailSelect,
    })

    await tx.questionReviewLog.create({
      data: {
        questionId: question.id,
        userId: authorId,
        action: 'CREATE',
        comment: null,
      },
    })

    return question
  })
}
```

#### 步驟三：更新 `validateSubmitStrict` 與 spec

[spec-question-bank.md §第三部分 1.1](./spec-question-bank.md) 中「新增 ReviewLog `{ action: 'SUBMIT', comment: null }`」應更新為 `{ action: 'CREATE', comment: null }`。本 spec 在 [Phase 0 update-question-bank task](./README.md#phase-0) 中同步修訂。

### 8.4 DO / DON'T

- **DO**：用 `$transaction` 確保「Question 與 ReviewLog」原子性，避免題目建好但 log 沒寫。
- **DO**：用 enum 區分 `CREATE` 與 `SUBMIT`，前端 timeline 才能正確顯示「建立 / 送審」icon。
- **DON'T**：為了少改 enum 把 SUBMIT 拿來當建立動作（會破壞 timeline 語意）。
- **DON'T**：嘗試把 enum 加值與其他 ALTER 混在同一個 migration 檔——PostgreSQL 不支援。

### 8.5 Definition of Done

- [ ] `pnpm prisma migrate dev` 跑完後 `review_action` enum 含 `CREATE`
- [ ] `POST /api/questions` 成功後，`question_review_logs` 多一筆 `action='CREATE'`
- [ ] `GET /api/questions/:id` 回應的 `reviewLogs` 開頭含 CREATE log
- [ ] 前端 `<Timeline>` 第一筆顯示「建立」（icon 與 SUBMIT 不同）

---

<!-- anchor: 9-acceptance -->

## 9. 整體驗收清單

完成本 phase 時須一次性確認：

- [ ] 所有 Bug 1–7 的個別 DoD 通過
- [ ] `pnpm --filter @taigi-core/backend run build` pass
- [ ] `pnpm --filter @taigi-core/backend run typecheck` pass（若有）
- [ ] `pnpm prisma validate` pass
- [ ] `pnpm prisma migrate deploy` 在乾淨 DB 跑完不報錯
- [ ] seed 仍可正常跑完
- [ ] 手動煙霧測試：登入 → 建題 → 送審 → 核可 → 組卷 → 抽到的題目符合 multi-criteria

---

## 10. 不在本 phase 範圍

下列改善已列入既有評估報告，但不屬於 P0，會在後續 phase 處理：

- 移除 `as never` / `as any`（型別安全）
- TypeBox enum 化
- React Query 導入
- Session 反向索引（即時踢人 / 權限同步效能）
- 替換考卷題目的 `orderIndex` race
- `replacePaperQuestion` 的 unique constraint 衝突
- 媒體上傳的 magic-byte 驗證
- 設置 OpenAPI / Swagger
- Audit log
