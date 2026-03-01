# 前端第一階段規格書 (Frontend Spec - Phase 1: Auth & User Management)

## ⚠️ 核心技術堆疊與開發原則 (Tech Stack & Guidelines)

本專案為高安控級別的台語檢定系統 (TaigiCore)。請嚴格遵守以下技術選型進行開發：

* **核心框架:** React 18+ (使用 TypeScript)
* **UI 元件庫:** Ant Design 5.x (`antd`) - 請盡量使用其內建的 Form 驗證、Table 分頁與 Message 提示。
* **路由管理:** React Router v6 (`react-router-dom`)
* **狀態管理:** Zustand (用於全域 Auth 狀態)
* **HTTP Client:** Axios (需封裝攔截器)
* **資安架構:** 本系統**不使用 JWT**，而是採用 **HttpOnly Cookie (Redis Session)** 搭配 **CSRF Token**。請勿將任何 Token 存入 `localStorage`。

---

## 1. API 攔截器實作 (`src/utils/api.ts`)

請建立一個獨立的 Axios 實例，處理所有與 Fastify 後端的通訊。

### 1.1 基礎設定與 CSRF 注入

* 設定 `withCredentials: true`，允許瀏覽器自動夾帶 Session Cookie。
* 在記憶體中宣告一個變數存放 CSRF Token，並提供 `fetchCsrfToken()` 方法打 `GET /api/csrf-token` 來初始化。
* **初始化時機:** 應用程式啟動時（App mount）立即呼叫 `fetchCsrfToken()`。若任何寫入請求收到 `403` 且錯誤為 CSRF 驗證失敗，自動重新取得 CSRF Token 並重試該請求一次。
* **Request Interceptor:** 攔截 `POST`, `PUT`, `PATCH`, `DELETE` 請求，強制在 Request Header 加入 `x-csrf-token: <token_value>`。

### 1.2 全域錯誤攔截 (Response Interceptor)

* **401 Unauthorized:** 代表 Session 失效。使用 `message.error` 提示後，使用 `window.location.href = '/login'` 強制轉址（以徹底清空 React 記憶體狀態）。
* **403 Forbidden:** 權限不足。使用 `message.error` 顯示後端回傳的 `error.message`，不進行轉址。
* **429 Too Many Requests:** 速率限制。使用 `message.warning('操作過於頻繁，請稍後再試')`。
* **400 Bad Request:** 根據後端回傳的 `error.code` 與 `error.message` 顯示 `message.error`。此類錯誤通常由個別頁面自行處理，全域攔截器僅作為 fallback。
* **500 Internal Server Error:** 使用 `message.error('系統發生錯誤，請稍後再試')`。
* **traceId 記錄:** 所有錯誤回應的 `traceId` 應輸出至 `console.error`，方便排查問題。
* 提示：API 回傳格式皆遵循 `{ success: boolean, data?: any, error?: { code, message, details }, traceId?: string, timestamp?: string }`。

---

## 2. 全域狀態與路由守衛

### 2.1 狀態管理 (`src/stores/useAuthStore.ts`)

使用 Zustand 建立 `useAuthStore`：

```typescript
interface AuthState {
  isCheckingAuth: boolean; // 初始為 true，用於防止重整畫面閃爍
  isAuthenticated: boolean;
  user: { id: string; email: string; name: string; isSetupCompleted: boolean; permissions: string[] } | null;
  checkAuth: () => Promise<void>; // 呼叫 GET /api/auth/me 更新狀態
  logout: () => Promise<void>; // 呼叫 POST /api/auth/logout，清空狀態後使用 window.location.href = '/login' 強制轉址
}

```

### 2.2 權限守衛 (`src/components/guards/ProtectedRoute.tsx`)

實作一個 Layout 元件，依據以下順序判斷並攔截路由。Setup Wizard 頁面本身不受 ProtectedRoute 保護（使用 token-based 驗證）：

1. 若 `isCheckingAuth` 為 true，顯示 `<Spin>` 載入中。
2. 若 `!isAuthenticated`，導向 `/login`，並將原路徑存入 `location.state.from`。
3. 若有傳入 `requiredPermission` 參數，但 `user.permissions` 不包含該權限，顯示 Antd `<Result status="403">`。
4. 通過以上檢查，渲染 `<Outlet />`。

---

## 3. 核心頁面實作

### 3.1 帳號開通精靈 (`src/pages/SetupWizard/index.tsx`)

**功能:** 處理邀請連結 (`?token=xxx`)，引導新帳號設定密碼與 2FA。
**UI:** 使用 Antd `<Steps>` (鎖定點擊切換功能) 與 `<Form>`。

* **初始化 (Step 0):**
  * 從 URL 取得 `token`，**立即使用 `window.history.replaceState({}, '', '/setup')` 清除 URL 中的明文 token**，防止瀏覽器歷史記錄洩漏。
  * 於背景發送 `POST /api/users/setup/verify-token` (Payload: `{ token }`)。
  * **注意：為防 Log 洩漏，嚴禁使用 GET 傳送明文 Token。**
  * 若無效，渲染 `<Result status="error">`。若有效，進入 Step 1。

* **基本資料 (Step 1):**
  * 渲染表單：姓名、設定密碼 (`<Input.Password>`)、確認密碼。
  * **密碼驗證規則（與後端同步）：** 最少 8 字元，至少包含大寫字母、小寫字母、數字各一。使用 Antd Form 的 `rules` 即時驗證。
  * 送出至 `POST /api/users/setup/profile`。成功後進入 Step 2。


* **綁定 2FA (Step 2):**
* 呼叫 `POST /api/users/setup/2fa-generate` 取得 `otpauth://...`。
* 使用 `qrcode.react` 渲染 QR Code。
* 提供 6 位數輸入框（建議使用 Antd `<Input.OTP>`）。
* 送出至 `POST /api/users/setup/2fa-verify`。成功後，必須呼叫 `useAuthStore.getState().checkAuth()` 更新狀態，接著轉址至 `/`。



### 3.2 登入頁面 (`src/pages/LoginPage/index.tsx`)

* 包含兩階段表單切換：
  1. **第一階段：** 送出 Email/密碼至 `POST /api/auth/login`。
  2. 若後端回傳 `{ requiresTwoFactor: true, challengeId: string }`，將 `challengeId` 存入元件 state。
  3. **第二階段：** 畫面平滑切換至 `<Input.OTP>` 驗證碼輸入框，送出 `{ challengeId, totpCode }` 至 `POST /api/auth/verify-2fa`。
* 登入成功後，呼叫 `useAuthStore.getState().checkAuth()` 更新狀態，再檢查 `location.state?.from`，將使用者導回原本想去的頁面（預設為 `/`）。

### 3.3 後台帳號管理 (`src/pages/admin/UserManagement/index.tsx`)

**路由權限:** 需具備 `user:list` 權限方可進入此頁面。頁面內各操作按鈕依據細項權限控制顯示/禁用：
* 「邀請」按鈕：需 `user:invite` 權限
* 停權開關：需 `user:deactivate` 權限
* 「編輯角色」按鈕：需 `user:assign-role` 權限

**功能:** 總覽帳號、邀請新委員、管理角色、停權操作。
**資料來源:** `GET /api/admin/users`（支援分頁）。

* **帳號列表 (`<Table>`):**
  * 顯示欄位：姓名、Email、角色 (`<Tag>`)、2FA 狀態、帳號狀態。
  * 狀態切換：使用 `<Switch>` 控制是否停權 (`isActive`)，送出至 `PATCH /api/admin/users/:id/status`。切換為停權時，必須有 `<Popconfirm>` 警告。
  * 防呆：目前登入的 Admin (比對 User ID) 其狀態 Switch 與編輯按鈕必須 disabled。
  * **Loading 防護:** 所有操作按鈕在請求進行中應設為 `loading` / `disabled`，防止重複提交。

* **邀請新帳號 (Invite Flow):**
  1. 點擊「邀請」按鈕打開 Modal。表單含 Email (`<Input>`) 與 角色 (`<Select mode="multiple">`)。
  2. 送出至 `POST /api/admin/users/invite`。
  3. **關鍵 UX:** 收到成功回傳後，關閉原 Modal，並**立即打開一個新的 `<Result>` Modal**。
  4. 該 Result Modal 需提示「邀請成功」，並使用 `<Typography.Text copyable>` 顯示 API 回傳的 `inviteUrl`（後端已組裝完整連結），方便管理員直接複製給對方。

* **編輯角色 (Edit Roles):**
  * 點擊列表的「編輯角色」打開 Modal，以 `<Select mode="multiple">` 讓管理員勾選角色。
  * 送出至 `PUT /api/admin/users/:id/roles`，成功後重整 Table 資料。

