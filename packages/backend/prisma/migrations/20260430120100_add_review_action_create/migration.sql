-- Bug #7 (spec-bugfixes.md §8) 修復：
-- 新增 ReviewAction.CREATE，用於記錄題目建立動作。
-- 與 SUBMIT 區分，前端 timeline 才能正確顯示「建立 / 送審」。

-- 注意：PostgreSQL 對 enum 加值不能與其他依賴此值的 DML 混在同一個 transaction，
-- 因此本 migration 僅放單一 ALTER TYPE 語句。
ALTER TYPE "review_action" ADD VALUE IF NOT EXISTS 'CREATE' BEFORE 'SUBMIT';
