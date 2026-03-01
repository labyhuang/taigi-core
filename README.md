# Taigi Core (台語檢定題庫管理系統) 

## 專案背景
本專案為開發一套專業的「台語語言能力檢定系統」，主要包含題庫管理、審核流程與自動組卷等核心功能。因涉及高機敏性的國家/專業級考試資料，系統的存取控制與防弊機制要求極高。

## 本次實作目標 (Backend Initialization & User Module)
本次開發聚焦於「後端專案結構初始化」、「使用者管理 (User Management)」、「嚴格角色權限控制 (Strict RBAC)」以及「邀請制 2FA 註冊流程 (Admin-Initiated Onboarding with TOTP 2FA)」。

## 核心資安架構：Stateful Session
考量題庫系統必須具備「即時踢除使用者 (Instant Revocation)」與「權限即時同步」的能力，本系統**不使用 JWT**，而是全面採用 **基於 Redis 的 Stateful Session** 搭配 HttpOnly Cookie，以從根本上防禦 XSS 攻擊並確保伺服器擁有絕對的連線控制權。

## 技術堆疊 (Tech Stack)
* **後端核心:** Node.js, Fastify, TypeScript
* **資料庫與快取:** PostgreSQL, Prisma (ORM), Redis (Session Store)
* **安全套件:**
  * 密碼與驗證：`bcrypt` / `argon2`, `otplib` (TOTP)
  * Session 與防護：`@fastify/session`, `ioredis` + `connect-redis`, `@fastify/csrf-protection`
  * 速率限制：`@fastify/rate-limit`
* **資料驗證:** `@sinclair/typebox` (Schema-First API Payload 驗證)

---

## 後端專案目錄結構 (Directory Structure)

請嚴格依照以下 Domain-Driven (領域驅動) 的結構來初始化 Fastify 專案：

```text
taigiflow-backend/
├── prisma/                  # 資料庫層
│   ├── schema.prisma        # (請參考 spec.md)
│   └── seed.ts              # 預設資料 (初始化 Admin 帳號與所有 Roles/Permissions)
├── src/
│   ├── config/              # 全域設定與基礎建設實例 (env, prisma, redis)
│   ├── types/               # TypeScript 型別宣告與擴充 (fastify.d.ts)
│   ├── plugins/             # Fastify 核心套件註冊 (session, csrf, errorHandler)
│   ├── middlewares/         # 業務邏輯防護網 (rbacGuard.ts 權限攔截器)
│   ├── modules/             # ⭐️ 核心業務領域 (Domain Modules)
│   │   ├── auth/            # 領域：身分驗證、登入登出、獲取 CSRF Token
│   │   ├── users/           # 領域：管理員邀請、停權、角色指派、3 階段開通精靈
│   │   ├── questions/       # 領域：題庫 CRUD 與審核狀態機
│   │   ├── media/           # 領域：多媒體素材庫 (MAM)
│   │   └── exams/           # 領域：測驗與自動組卷演算法
│   ├── utils/               # 共用工具函式 (logger 等)
│   └── app.ts               # Fastify 實例初始化與 Plugin/Routes 註冊總成
├── .env                     # 環境變數
├── package.json
└── tsconfig.json

```

---

## 開發指引 (For Claude Code / AI Agent)

1. **專案初始化:** 請先依據上述 `Directory Structure` 建立資料夾結構，並安裝對應的 `package.json` 依賴套件。
2. **Schema 建立:** 請閱讀 `spec.md` 以了解完整的 Prisma Schema 與系統架構設計，並寫入 `prisma/schema.prisma`。
3. **嚴格 RBAC:** 系統採用**嚴格的 RBAC (Role-Based Access Control)**，權限 (Permission) 必須依附於角色 (Role) 之上，不得直接賦予使用者。
4. **開通流程:** 帳號開通採用**邀請制 (Invite-only)**，請嚴格按照 `spec.md` 中定義的流程實作 `users` 與 `auth` 模組的 API。
5. **Session 實作:** 所有的登入狀態必須寫入 Redis Session，並透過設定了 `HttpOnly`, `Secure`, `SameSite` 屬性的 Cookie 派發給前端。`fastify.d.ts` 必須擴充 Session 型別以包含快取的 `permissions` 陣列。
