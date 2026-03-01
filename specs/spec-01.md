# User & RBAC Module Specification

## 1. 資料庫結構 (Prisma Schema)

請依據以下設計建立 Prisma 結構。本系統採用「嚴格 RBAC」，使用者不可直接擁有權限。帳號建立採邀請制，因此 `User` 的密碼與姓名在初始階段允許為空。

```prisma
// --- 使用者與驗證 ---
model User {
  id                  String     @id @default(uuid())
  email               String     @unique
  name                String?    
  passwordHash        String?    
  isActive            Boolean    @default(true) // 帳號停權開關 (搭配 Redis 隨時踢人)

  // 邀請註冊專用欄位
  invitedBy           String?    // 邀請者 userId，用於稽核追蹤
  setupToken          String?    @unique // 邀請 Token (必須存 Hash 值，明文僅發送一次)
  setupTokenExpiresAt DateTime?  // 有效期限：24 小時
  isSetupCompleted    Boolean    @default(false) 

  // 2FA (TOTP) 相關欄位
  twoFactorEncrypted  String?    // TOTP 密鑰，必須以 AES-256-GCM 加密後儲存，禁止明文保存
  isTwoFactorEnabled  Boolean    @default(false) 

  // 關聯
  roles               UserRole[]
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt

  @@map("users")
}

// --- 嚴格 RBAC 架構 ---
model Role {
  id          String           @id @default(uuid())
  name        String           @unique // e.g., "AUTHOR", "REVIEWER", "ASSEMBLER", "ADMIN"
  description String?          
  users       UserRole[]
  permissions RolePermission[]

  @@map("roles")
}

model Permission {
  id          String           @id @default(uuid())
  action      String           @unique // 格式："resource:action" (e.g., "question:create")
  description String?
  roles       RolePermission[]

  @@map("permissions")
}

model UserRole {
  userId      String
  roleId      String
  assignedAt  DateTime @default(now()) // 指派時間，用於稽核追蹤
  assignedBy  String?  // 指派者 userId，seed 時為 null
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([userId, roleId])

  @@map("user_roles")
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])

  @@map("role_permissions")
}
```

---

## 2. 帳號建立與註冊流程 (Admin-Initiated Onboarding)

系統不開放自由註冊，所有帳號必須由管理員發起邀請。整個 Setup 流程採 **Stateless 方式**驗證身分：每個步驟都必須在 request body 帶上明文 `token`，後端 Hash 後比對資料庫中的 `setupToken`。

### 階段一：管理員發送邀請 (Admin Action)

1. **API:** `POST /api/admin/users/invite`
2. **Request Body:** `{ email: string, roleIds: string[] }`
3. **邏輯:** 建立 `User` (`isSetupCompleted: false`)，指派角色。生成 32 bytes 隨機 `setupToken`，Hash 後存入資料庫並設定過期時間（24 小時）。
4. **回傳:** 回傳明文 Token 以及完整的 `inviteUrl`（格式：`{FRONTEND_URL}/setup?token={plainToken}`，`FRONTEND_URL` 由環境變數控制）。管理員可直接複製連結透過安全管道轉交給使用者。

### 階段二：使用者設定基本資料 (User Step 1)

1. **API (驗證 Token):** `POST /api/users/setup/verify-token`
   * **Request Body:** `{ token: string }`
   * **邏輯:** 將明文 token Hash 後比對資料庫，檢查是否存在且未過期。回傳使用者 email 供前端顯示。

2. **API (設定密碼與姓名):** `POST /api/users/setup/profile`
   * **Request Body:** `{ token: string, name: string, password: string }`
   * **密碼規則:** 最少 8 字元，至少包含大寫字母、小寫字母、數字各一。須在 TypeBox schema 中加入驗證。
   * **邏輯:** 驗證 token 有效性。驗證密碼符合規則後 Hash 並更新姓名。**此時不可清除 Token，需保留給 2FA 步驟使用。** 回傳成功引導至 Step 2。

### 階段三：強制綁定 2FA TOTP (User Step 2)

1. **API (生成 QR Code):** `POST /api/users/setup/2fa-generate`
   * **Request Body:** `{ token: string }`
   * **邏輯:** 驗證 token 有效性。用 `otplib` 生成 TOTP Secret，以 AES-256-GCM 加密後存入 `twoFactorEncrypted` 欄位，回傳 `otpauth://` URI 供前端生成 QR Code。

2. **API (驗證 TOTP 並完成開通):** `POST /api/users/setup/2fa-verify`
   * **Request Body:** `{ token: string, code: string }`
   * **邏輯:** 驗證 token 有效性。解密 `twoFactorEncrypted` 取得 Secret，驗證 `code`。若正確，更新 `isTwoFactorEnabled` 與 `isSetupCompleted` 為 `true`。清空 `setupToken` 與 `setupTokenExpiresAt`。將使用者資訊（含權限陣列）寫入 Redis Session 完成登入。

---

## 3. 身分驗證 API (Authentication)

本系統登入採**兩階段驗證**：第一階段驗證帳號密碼，第二階段驗證 TOTP。兩階段之間使用短效 `challengeId` 串接，避免在未完成 2FA 前建立 Session。

### 3.1 登入（第一階段：帳密驗證）`POST /api/auth/login`

* **Request Body:** `{ email: string, password: string }`
* **邏輯:**
  1. 以 email 查詢使用者，檢查是否存在、`isActive` 為 true、`isSetupCompleted` 為 true。
  2. 驗證密碼 (bcrypt/argon2)。
  3. 帳密驗證成功後，生成隨機 `challengeId`（32 bytes），連同 `userId` 存入 Redis（Key: `2fa-challenge:{challengeId}`，TTL: 5 分鐘）。
  4. 回傳 `{ success: true, data: { requiresTwoFactor: true, challengeId: string } }`。**此時不建立 Session。**

### 3.2 登入（第二階段：2FA 驗證）`POST /api/auth/verify-2fa`

* **Request Body:** `{ challengeId: string, totpCode: string }`
* **邏輯:**
  1. 以 `challengeId` 從 Redis 取得對應的 `userId`。若不存在或已過期，回傳 `ERR_TOKEN_INVALID`。
  2. 查詢使用者，解密 `twoFactorEncrypted` 取得 TOTP Secret，驗證 `totpCode`。若錯誤，回傳 `ERR_2FA_INVALID`。
  3. 驗證成功後，刪除 Redis 中的 `challengeId`（一次性使用）。
  4. 一次性查詢該使用者所有角色對應的 permissions 並扁平化為 `string[]`，寫入 Redis Session。
  5. 透過 HttpOnly Cookie 派發 Session ID。

### 3.3 登出 `POST /api/auth/logout`

* **邏輯:** 銷毀 Redis Session（`request.session.destroy()`），清除 Cookie。

### 3.4 取得當前使用者 `GET /api/auth/me`

* **邏輯:** 從 `request.session.user` 取得並回傳使用者資訊（`id`, `email`, `name`, `isSetupCompleted`, `permissions`）。若 Session 不存在回傳 `401`。供前端初始化時確認登入狀態。

### 3.5 CSRF Token 發放 `GET /api/csrf-token`

* **邏輯:** 呼叫 `reply.generateCsrf()` 將 Token 回傳給前端。

---

## 4. 後端資安底層架構 (Fastify Session & CSRF)

為防禦 XSS 與確保即時撤銷權限，系統採用 Stateful Session 搭配 HttpOnly Cookie。請依循以下規格實作 Fastify 伺服器：

### 4.1 Type Augmentation

建立 `fastify.d.ts` 擴充 Session 介面，必須包含：`user.id`, `user.email`, `user.name`, `user.isSetupCompleted`, `user.isTwoFactorEnabled`, 以及 `user.permissions` (string array 快取)。

### 4.2 套件註冊順序與設定 (Strict Order)

在 Fastify 實例初始化時，**必須嚴格遵守以下註冊順序**：

1. 初始化 `ioredis` Client。
2. 註冊 `@fastify/cookie` (需設定 secret)。
3. 註冊 `@fastify/session`：
   * `store`: 使用 `connect-redis` (傳入 ioredis client)。
   * `cookie`: 設定 `secure: process.env.NODE_ENV === 'production'`, `httpOnly: true`, `sameSite: 'lax'`。
   * `maxAge`: 30 分鐘 (idle timeout)。
   * `rolling`: `true` (每次 request 自動延長過期時間)。

4. 註冊 `@fastify/csrf-protection`：設定 `cookieOpts: { signed: true }` 與 `sessionPlugin: '@fastify/session'`。

5. 註冊 `@fastify/rate-limit`：全域預設設定，並針對以下端點配置更嚴格的限制：
   * `POST /api/auth/login` — 每分鐘最多 5 次
   * `POST /api/users/setup/verify-token` — 每分鐘最多 5 次
   * `POST /api/users/setup/2fa-verify` — 每分鐘最多 5 次
   * `POST /api/auth/verify-2fa` — 每分鐘最多 5 次

---

## 5. 後端權限攔截器 (RBAC Guard Middleware)

實作一個 Factory Function 用於保護業務 API 路由 (`middlewares/rbacGuard.ts`)：

### 5.1 實作 `requirePermission(action: string)`

* 回傳一個 Fastify `preHandler` 函數。
* **驗證邏輯 1 (Session & 狀態):** 檢查 `request.session.user` 是否存在。若無，或 `isSetupCompleted` / `isTwoFactorEnabled` 為 false，回傳 `401 Unauthorized`。
* **驗證邏輯 2 (權限比對):** 檢查 `request.session.user.permissions` 陣列是否包含傳入的 `action` 字串。若無，紀錄 Log 並回傳 `403 Forbidden`。
* **效能要求:** 權限必須在登入時一次性查詢完畢並扁平化存入 Session (Redis)，Guard Middleware 內**禁止對資料庫進行查詢**以保證效能。

---

## 6. 統一 API 回傳格式 (Unified API Response Format)

系統中所有的 API 回傳皆須嚴格遵守以下 TypeScript 介面定義，採用 Discriminated Unions 區分成功與失敗狀態，並使用業務錯誤碼 (Business Error Code) 取代單純的 HTTP Status Code。

API 回應的格式與錯誤碼描述在 [api-response.md](./api-response.md) 

### 6.1 實作要求

* 請在 Fastify 中實作全域的 `setErrorHandler`，攔截 TypeBox 驗證錯誤、`PrismaClientKnownRequestError` 與自訂錯誤，並統一轉換為 `ApiErrorResponse` 格式輸出。
* 成功回應應統一包裝為 `ApiSuccessResponse` 格式。

---

## 7. Seed Data 定義

`prisma/seed.ts` 必須初始化以下預設資料：

### 7.1 預設角色 (Roles)

| Role | 說明 |
|------|------|
| ADMIN | 系統管理員，擁有所有權限 |
| AUTHOR | 出題者，負責建立與編輯題目 |
| REVIEWER | 審題者，負責審核與批准/駁回題目 |
| ASSEMBLER | 組卷者，負責從已審核題目中組建測驗 |

### 7.2 預設權限 (Permissions)

以 `resource:action` 格式命名：

**使用者管理 (user)**
| Permission | 說明 |
|------------|------|
| `user:invite` | 邀請新使用者 |
| `user:list` | 查看使用者列表 |
| `user:read` | 查看使用者詳情 |
| `user:deactivate` | 停權/復權使用者 |
| `user:assign-role` | 指派/移除使用者角色 |

**題庫管理 (question)**
| Permission | 說明 |
|------------|------|
| `question:create` | 建立題目 |
| `question:read` | 查看題目 |
| `question:update` | 編輯題目 |
| `question:delete` | 刪除題目 |
| `question:submit` | 提交題目進入審核 |
| `question:review` | 進行審核操作 |
| `question:approve` | 批准題目 |
| `question:reject` | 駁回題目 |

**測驗組卷 (exam)**
| Permission | 說明 |
|------------|------|
| `exam:create` | 建立測驗 |
| `exam:read` | 查看測驗 |
| `exam:update` | 編輯測驗 |
| `exam:delete` | 刪除測驗 |
| `exam:assemble` | 執行自動組卷 |

**多媒體素材 (media)**
| Permission | 說明 |
|------------|------|
| `media:upload` | 上傳素材 |
| `media:read` | 查看素材 |
| `media:delete` | 刪除素材 |

**系統管理 (system)**
| Permission | 說明 |
|------------|------|
| `system:manage` | 系統層級管理操作 |

### 7.3 角色與權限對應 (Role-Permission Mapping)

| Role | 擁有的 Permissions |
|------|-------------------|
| **ADMIN** | 全部權限 |
| **AUTHOR** | `question:create`, `question:read`, `question:update`, `question:submit`, `media:upload`, `media:read` |
| **REVIEWER** | `question:read`, `question:review`, `question:approve`, `question:reject` |
| **ASSEMBLER** | `question:read`, `exam:create`, `exam:read`, `exam:update`, `exam:assemble` |

### 7.4 初始管理員帳號

* **Email:** `laby0916@gmail.com`
* 自動指派 `ADMIN` 角色。
* Seed 執行時生成 `setupToken`（24 小時有效），**明文 Token 輸出至 console**，供首次登入使用。
* 此帳號仍須完成完整的 Setup 流程（設定密碼 → 綁定 2FA）方可正式使用。

---

## 8. 後台管理 API (Admin Endpoints)

以下端點皆位於 `/api/admin` 路徑下，需登入且具備對應權限方可存取。

### 8.1 使用者列表 `GET /api/admin/users`

* **權限:** `user:list`
* **Query Parameters:** `page` (預設 1)、`pageSize` (預設 20)
* **邏輯:** 查詢所有使用者，支援分頁。
* **回傳 data 欄位:** `id`, `email`, `name`, `isActive`, `isSetupCompleted`, `isTwoFactorEnabled`, `roles` (含 `id` 與 `name` 的陣列), `createdAt`。
* **回傳 meta 欄位:** 依 `PaginationMeta` 格式提供分頁資訊。

### 8.2 切換使用者狀態 `PATCH /api/admin/users/:id/status`

* **權限:** `user:deactivate`
* **Request Body:** `{ isActive: boolean }`
* **邏輯:**
  1. 防呆：不可對自己操作（比對 `request.session.user.id` 與 `:id`），若相同回傳 `ERR_VALIDATION`。
  2. 更新使用者 `isActive` 欄位。
  3. 若設為停權（`isActive: false`），同步清除該使用者所有 Redis Session（即時踢人）。

### 8.3 更新使用者角色 `PUT /api/admin/users/:id/roles`

* **權限:** `user:assign-role`
* **Request Body:** `{ roleIds: string[] }`
* **邏輯:**
  1. 刪除該使用者現有的所有 `UserRole` 記錄，重新依據 `roleIds` 建立（記錄 `assignedBy` 為操作者 ID）。
  2. 重新查詢該使用者的完整 permissions 並更新其 Redis Session 中的 `permissions` 快取（若有活躍 Session）。

---

## 9. 健康檢查端點

### `GET /api/health`

* **邏輯:** 檢查 PostgreSQL 與 Redis 連線狀態，回傳系統健康資訊。
* **回應:** `{ success: true, data: { status: "ok", db: "connected", redis: "connected", uptime: number } }`
* 此端點不需驗證，供監控系統使用。
