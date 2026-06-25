-- Bug #5 (spec-bugfixes.md §6) 修復：
-- 20260301143527 migration 將先前建立的 GIN index 砍掉，導致 attributes JSONB
-- 過濾無法走 GIN index，抽題效能會在題庫成長時嚴重下降。此處重新建立。

-- Prisma schema 不支援 USING GIN，故維持 raw SQL migration 永久存在。
CREATE INDEX IF NOT EXISTS "idx_questions_attributes"
  ON "questions" USING GIN ("attributes");
