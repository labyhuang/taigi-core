# 統一 API 回應格式 (Unified API Response Format)

## 成功回應 (Success Response)
```typescript
interface PaginationMeta {
  total: number;        // 總筆數
  page: number;         // 目前頁碼
  pageSize: number;     // 每頁筆數
  totalPages: number;   // 總頁數
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;     // 供前端顯示 Toast 的成功訊息
  meta?: PaginationMeta;// 列表查詢的分頁資訊
}
```

## 錯誤回應 (Error Response)

```typescript
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;       // 業務邏輯錯誤碼 (見下方 Error Code 清單)
    message: string;    // 人類可讀的錯誤訊息
    details?: any[];    // TypeBox 驗證錯誤的詳細欄位清單 (選填)
  };
  traceId: string;      // 稽核與追蹤用 (req.id)
  timestamp: string;    // ISO 8601
}
```

---

## 業務錯誤碼清單 (Error Code Reference)

所有 API 錯誤回應的 `error.code` 必須使用以下預定義的錯誤碼，禁止自行發明未列出的 code。若有新增需求，須先更新此文件。

### 驗證與請求類

| Error Code | HTTP Status | 說明 |
|------------|-------------|------|
| `ERR_VALIDATION` | 400 | 請求資料驗證失敗（TypeBox schema 不符） |
| `ERR_NOT_FOUND` | 404 | 請求的資源不存在 |
| `ERR_DUPLICATE` | 409 | 資源已存在（如 email 重複註冊） |
| `ERR_RATE_LIMITED` | 429 | 請求過於頻繁，已觸發速率限制 |

### 身分驗證類

| Error Code | HTTP Status | 說明 |
|------------|-------------|------|
| `ERR_UNAUTHORIZED` | 401 | 未登入或 Session 已過期 |
| `ERR_CREDENTIAL_INVALID` | 401 | 帳號或密碼錯誤 |
| `ERR_FORBIDDEN` | 403 | 已登入但權限不足 |
| `ERR_USER_DEACTIVATED` | 403 | 帳號已被停權 |
| `ERR_SETUP_INCOMPLETE` | 403 | 帳號尚未完成 Setup 流程（密碼/2FA） |

### Setup Token 類

| Error Code | HTTP Status | 說明 |
|------------|-------------|------|
| `ERR_TOKEN_INVALID` | 400 | Setup Token 無效（不存在或已被使用） |
| `ERR_TOKEN_EXPIRED` | 400 | Setup Token 已過期 |

### 2FA 類

| Error Code | HTTP Status | 說明 |
|------------|-------------|------|
| `ERR_2FA_REQUIRED` | 400 | 登入時未提供 TOTP 驗證碼 |
| `ERR_2FA_INVALID` | 400 | TOTP 驗證碼錯誤或已過期 |

### 題庫管理類

| Error Code | HTTP Status | 說明 |
|------------|-------------|------|
| `ERR_INVALID_STATUS_TRANSITION` | 400 | 不合法的狀態轉換（如 DRAFT 直接跳 APPROVED） |
| `ERR_MEDIA_REQUIRED` | 400 | 此題型需要音檔/圖片但未上傳 |
| `ERR_QUESTION_READONLY` | 403 | 題目已送審或已核可，出題委員無法編輯 |
| `ERR_REVIEW_COMMENT_REQUIRED` | 400 | 退回時未填寫退回原因 |
| `ERR_INVALID_TYPE_COMBINATION` | 400 | `type` 與 `subType` 組合不合法 |
| `ERR_GROUP_CHILD_NO_INDEPENDENT_STATUS` | 400 | 子題不可獨立變更狀態，須透過父題操作 |
| `ERR_MEDIA_IN_USE` | 409 | 素材仍被題目使用中，無法刪除 |

### 伺服器類

| Error Code | HTTP Status | 說明 |
|------------|-------------|------|
| `ERR_INTERNAL` | 500 | 伺服器內部錯誤（未預期的例外） |
