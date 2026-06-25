# TaigiCore 規格總覽 (Specification Index)

本文件是 `specs/` 目錄的入口，整理各功能規格與跨模組共通前端規範。

## 1. 功能規格索引

| 模組 | 文件 |
|------|------|
| 使用者 / 權限 / 認證 (RBAC & Auth) | [spec-rbac.md](./spec-rbac.md) |
| 題庫管理 | [spec-question-bank.md](./spec-question-bank.md) |
| 自動組卷 / 雙向細目表 | [spec-exam-assembly.md](./spec-exam-assembly.md) |
| 考期與應答匯入 | [spec-exam-session.md](./spec-exam-session.md) |
| 試卷輸出 | [spec-export.md](./spec-export.md) |
| 統計分析 | [spec-statistics.md](./spec-statistics.md) |

## 2. 跨模組規格

| 類型 | 文件 |
|------|------|
| API 統一回應格式與錯誤碼 | [api-response.md](./api-response.md) |
| 已知 P0 問題修補規格 | [spec-bugfixes.md](./spec-bugfixes.md) |

## 3. 前端共通規範

以下規範適用於所有前端功能模組；各功能頁面的互動與流程請回到對應功能文件。

### 3.1 技術堆疊與開發原則

* **核心框架:** React 18+ (TypeScript)
* **UI 元件庫:** Ant Design 5.x (`antd`)
* **路由管理:** React Router v6 (`react-router-dom`)
* **狀態管理:** Zustand（全域 Auth 狀態）
* **HTTP Client:** Axios（統一封裝攔截器）
* **資安架構:** 採用 HttpOnly Cookie (Redis Session) + CSRF Token，不使用 JWT，不可將任何 Token 存入 `localStorage`。

### 3.1.1 UI 風格參考基準

前端視覺風格請參考專案：`/Users/laby/code/taigi/taigi-lang-score`。

請沿用其整體設計語言並映射到 React + Ant Design：

* 主色為 teal-green 系：`#28A06B`（hover `#1e8f5e`）。
* 背景與卡片層次：頁面底色偏淺灰（如 `#FAFAFA`），卡片為白底 + 淺邊框（如 `#E6E9ED`）。
* 元件語彙：以圓角卡片（約 8px~12px）與輕陰影建立資訊層次，避免過重陰影。
* 資訊色調：文字主色偏深灰黑（如 `#16191D`），次要文字使用 muted gray。
* 登入頁語彙：可使用背景圖 + 深綠漸層遮罩 + 中央登入卡片的結構。

實作要求：

* 優先以全域 Theme Token / CSS Variables 萃取上述色彩與圓角，不在頁面內硬編碼重複色票。
* 新頁面與既有頁面需維持同一視覺語言，不採用與參考專案衝突的高飽和或多主色風格。

### 3.2 API Client 與攔截器 (`src/utils/api.ts`)

* 使用獨立 Axios instance，設定 `withCredentials: true`。
* 在記憶體儲存 CSRF Token，提供 `fetchCsrfToken()` 呼叫 `GET /api/csrf-token` 初始化。
* App 啟動時立即初始化 CSRF Token。
* Request Interceptor：針對 `POST`, `PUT`, `PATCH`, `DELETE` 自動注入 `x-csrf-token`。
* 若寫入請求收到 CSRF 驗證失敗的 `403`，自動重新取得 CSRF Token 並重試一次。

### 3.3 全域錯誤處理（Response Interceptor）

* `401`: 顯示錯誤訊息後以 `window.location.href = '/login'` 強制轉址。
* `403`: 顯示後端回傳 `error.message`，不轉址。
* `429`: 顯示「操作過於頻繁，請稍後再試」。
* `400`: 依 `error.code` / `error.message` 顯示；全域攔截僅為 fallback。
* `500`: 顯示通用系統錯誤訊息。
* 所有錯誤回應的 `traceId` 需輸出至 `console.error`。

### 3.4 全域 Auth Store (`src/stores/useAuthStore.ts`)

`useAuthStore` 至少需管理以下狀態與方法：

```typescript
interface AuthState {
  isCheckingAuth: boolean;
  isAuthenticated: boolean;
  user: { id: string; email: string; name: string; isSetupCompleted: boolean; permissions: string[] } | null;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}
```

* `checkAuth`: 呼叫 `GET /api/auth/me` 同步登入狀態。
* `logout`: 呼叫 `POST /api/auth/logout`，清空狀態後強制轉址 `/login`。

### 3.5 路由守衛 (`src/components/guards/ProtectedRoute.tsx`)

ProtectedRoute 判斷順序：

1. `isCheckingAuth` 為 true 時顯示 `<Spin>`。
2. 未登入則導向 `/login`，並保留原路徑至 `location.state.from`。
3. 若設定 `requiredPermission` 且使用者不具權限，顯示 `<Result status="403">`。
4. 通過檢查後渲染 `<Outlet />`。

> Setup Wizard 屬 token-based 流程，不受 ProtectedRoute 保護。
