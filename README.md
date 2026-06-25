# Taigi Core (台語檢定題庫管理系統)

## 專案背景

本專案為開發一套專業的「台語語言能力檢定系統」核心題庫，主要包含題庫管理、審核流程、自動組卷、試卷輸出、考期匯入與統計分析等功能。因涉及高機敏性的國家/專業級考試資料，系統的存取控制與防弊機制要求極高。

**範圍邊界**：本系統**不負責應考介面**。實際線上考試由外部考試系統處理；本系統的角色為「題庫主控」，負責出題 / 審核 / 組卷 / 輸出考卷 / 接收外部系統匯入的應答資料 / 計算 CTT 統計。

## 系統模組總覽

### 已完成模組

1. **使用者與 RBAC**（[spec-01.md](./specs/spec-01.md)）
   邀請制 2FA 開通、Stateful Session、嚴格 RBAC 權限控管。
2. **題庫管理**（[spec-question-bank.md](./specs/spec-question-bank.md)）
   題目 CRUD、狀態機、屬性標籤、題組、審查 ReviewLog、媒體上傳。
3. **自動組卷**（[spec-exam-assembly.md](./specs/spec-exam-assembly.md)）
   雙向細目表 (Blueprint)、Fisher-Yates 抽題、藍圖快照、考卷 CRUD、替換題目。
4. **前端 UI**（[spec-frontend-01.md](./specs/spec-frontend-01.md)）
   React + Antd，含題庫與組卷頁面。

### 規劃中模組（Phase 1–6）

5. **P0 Critical Bugfixes**（[spec-bugfixes.md](./specs/spec-bugfixes.md)）
   修復 7 項影響資安、正確性、業務邏輯的 critical bugs（CSRF 全域套用、multi-criteria attribute 過濾、權限矩陣、ASSEMBLER 越權、GIN index 復原、attributes 必填驗證、CREATE ReviewLog）。
6. **試卷輸出**（[spec-export.md](./specs/spec-export.md)）
   純文字檔輸出 + ZIP 包（含音檔/圖片/藍圖快照），給排版人員手動排版印刷。預留未來與外部考試系統對接的格式擴充點。
7. **考期 / 應答匯入**（[spec-exam-session.md](./specs/spec-exam-session.md)）
   `ExamSession` 模型、`Candidate`（含 hybrid demographic 設計）、`CandidateResponse`、CSV/JSON 上傳與 API key 推送、口說評分後補匯入、API client 管理。
8. **統計分析**（[spec-statistics.md](./specs/spec-statistics.md)）
   CTT 三指標：難度 P / 鑑別度 D / 選項誘答力。per-session 與跨考期累積、儀表板交叉查詢、async recompute job。

統一回應格式：[api-response.md](./specs/api-response.md)（含全部錯誤碼）

## 核心資安架構：Stateful Session + 強制 CSRF

考量題庫系統必須具備「即時踢除使用者 (Instant Revocation)」與「權限即時同步」的能力，本系統**不使用 JWT**，而是全面採用 **基於 Redis 的 Stateful Session** 搭配 HttpOnly Cookie，以從根本上防禦 XSS 攻擊並確保伺服器擁有絕對的連線控制權。

所有寫入端點 (POST / PUT / PATCH / DELETE) 一律強制 CSRF token 驗證（透過 `app.ts` 的 `onRoute` hook 自動套用，例外清單包含登入 / setup / API key 推送）。詳見 [spec-bugfixes.md §2](./specs/spec-bugfixes.md#2-bug-1csrf-%E5%85%A8%E5%9F%9F%E6%9C%AA%E5%A5%97%E7%94%A8)。

## 技術堆疊 (Tech Stack)

* **後端核心:** Node.js (24 LTS), Fastify (v5), TypeScript (strict)
* **資料庫與快取:** PostgreSQL, Prisma (v7), Redis (Session Store)
* **安全套件:**
  * 密碼與驗證：`bcrypt` / `argon2`, `otplib` (TOTP)
  * Session 與防護：`@fastify/session`, `ioredis` + `connect-redis`, `@fastify/csrf-protection`
  * 速率限制：`@fastify/rate-limit`
* **檔案處理:** `@fastify/multipart`, `archiver` (ZIP), `csv-parse`
* **API 文件：** `@fastify/swagger` + `@fastify/swagger-ui`（開發預設啟用 `/api/docs`；正式環境須 `OPENAPI_ENABLED=true`）
* **前端:** React 19, Ant Design 5, React Router 7, Zustand, Axios

---

## 後端專案目錄結構 (Directory Structure)

依照 Domain-Driven (領域驅動) 結構組織。新模組可依此繼續擴充：

```text
packages/backend/
├── prisma/
│   ├── schema.prisma        # 完整 schema（含本次規劃的 ExamSession / Candidate / Statistics）
│   ├── migrations/          # raw SQL migration（含 GIN index 等 Prisma 不支援的設定）
│   └── seed.ts              # 預設 Admin、Roles、Permissions、AttributeDefinitions
├── src/
│   ├── config/              # 環境變數與基礎實例 (env, prisma, redis)
│   ├── types/               # 型別擴充 (fastify.d.ts)
│   ├── plugins/             # Fastify 套件註冊 (session, csrf, apiKeyAuth, errorHandler)
│   ├── middlewares/         # rbacGuard 權限攔截器
│   ├── modules/             # 核心業務領域
│   │   ├── auth/            # 身分驗證、登入登出、CSRF token
│   │   ├── users/           # 邀請制 2FA、停權、角色指派
│   │   ├── questions/       # 題庫 CRUD 與審核狀態機
│   │   ├── attributes/      # 屬性定義 (AttributeDefinition / Value)
│   │   ├── media/           # 多媒體素材
│   │   ├── blueprints/      # 雙向細目表
│   │   ├── papers/          # 考卷 CRUD
│   │   ├── exports/         # ⭐️ 試卷輸出（純文字 + ZIP）— spec-export.md
│   │   ├── exam-sessions/   # ⭐️ 考期 + 匯入 — spec-exam-session.md
│   │   ├── api-clients/     # ⭐️ API key 管理 — spec-exam-session.md §7
│   │   ├── statistics/      # ⭐️ CTT 統計分析 — spec-statistics.md
│   │   └── audit/           # 稽核日誌寫入（Phase 6，路由層呼叫）
│   ├── utils/               # 共用工具
│   └── app.ts               # Fastify 實例與全域 hook（CSRF onRoute）
├── package.json
└── tsconfig.json

packages/frontend/
├── src/
│   ├── pages/
│   │   ├── QuestionBank/
│   │   ├── ExamAssembly/
│   │   ├── ExamSession/     # ⭐️ 考期 + 匯入面板
│   │   ├── Statistics/      # ⭐️ 題目/試卷統計儀表板
│   │   └── admin/
│   │       └── ApiClients/  # ⭐️ API key 管理
│   └── ...
└── ...
```

帶 ⭐️ 的目錄為本次規劃中的新模組。

---

## 開發階段（Phase 0 → Phase 6）

| Phase | 內容 | spec |
|---|---|---|
| 0 | 撰寫/修訂 spec 文件 | 本次完成 |
| 1 | P0 Critical Bugfixes | [spec-bugfixes.md](./specs/spec-bugfixes.md) |
| 2 | Schema migration（4 個新 model + ImportLog + RecomputeJob） | [spec-exam-session.md](./specs/spec-exam-session.md) §2 + [spec-statistics.md](./specs/spec-statistics.md) §3 |
| 3 | 試卷輸出（純文字 + ZIP） | [spec-export.md](./specs/spec-export.md) |
| 4 | ExamSession + 匯入 + API client | [spec-exam-session.md](./specs/spec-exam-session.md) |
| 5 | 統計計算 + 儀表板 | [spec-statistics.md](./specs/spec-statistics.md) |
| 6 | 收尾：`replacePaperQuestion` Serializable、稽核 `AuditLog`、`/api/docs` OpenAPI、關鍵路由寫入 audit | 本節 + `OPENAPI_ENABLED` |

---

## 開發指引 (For AI Coding Agent)

1. **以 spec 為唯一真實依據。** 各模組 spec 已含完整 schema、API、DO/DON'T、Definition of Done，實作時請對照逐項驗收。
2. **Schema-First：** 任何新 API 必先在 [api-response.md](./specs/api-response.md) 與對應 spec 中定義 request/response，並於程式碼用 TypeBox 嚴格驗證。
3. **嚴格 RBAC：** 權限 (Permission) 必須依附於角色 (Role)；不得直接賦予使用者。新增權限時請同步更新 [packages/shared/src/permissions.ts](./packages/shared/src/permissions.ts) 與 seed.ts。
4. **預設拒絕：** 純讀者（無 `system:manage` / `question:approve` / `question:create` 的角色）一律只能看到 `APPROVED` 題目。
5. **CSRF 強制：** 寫入端點預設都要 CSRF token；例外清單只放登入 / setup / API key 推送。
6. **匯入冪等：** ExamSession 匯入相關 endpoint 必須以 `(examSessionId, externalCandidateId)` 與 `(candidateId, questionId)` 確保 upsert，重新匯入不會產生重複資料。
7. **統計計算純函式化：** CTT 三指標的計算邏輯放在 `statistics.compute.ts`，不接觸 Prisma，便於單元測試。
8. **Build Check：** 修改後請執行 `pnpm --filter @taigi-core/backend run build` 確認 TypeScript 通過。
9. **OpenAPI：** 本機開發可開 `http://localhost:<PORT>/api/docs`；Docker / 正式環境勿預設暴露，除非明確設定 `OPENAPI_ENABLED=true`。
