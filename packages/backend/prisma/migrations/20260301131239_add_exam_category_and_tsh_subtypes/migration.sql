/*
  Warnings:

  - Added the required column `category` to the `questions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "exam_category" AS ENUM ('GTPT', 'TSH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "question_sub_type" ADD VALUE 'LISTEN_PICK_IMAGE';
ALTER TYPE "question_sub_type" ADD VALUE 'IMAGE_PICK_ANSWER';
ALTER TYPE "question_sub_type" ADD VALUE 'TSH_DIALOGUE';
ALTER TYPE "question_sub_type" ADD VALUE 'IMAGE_PICK_SENTENCE';
ALTER TYPE "question_sub_type" ADD VALUE 'TSH_FILL_BLANK';
ALTER TYPE "question_sub_type" ADD VALUE 'TSH_COMPREHENSION';

-- AlterTable: 先加入 category 欄位並給予預設值 GTPT，再移除預設值
ALTER TABLE "questions" ADD COLUMN "category" "exam_category" NOT NULL DEFAULT 'GTPT';
-- 既有資料已由 DEFAULT 'GTPT' 自動填入，移除預設值避免未來建立時忘記指定
ALTER TABLE "questions" ALTER COLUMN "category" DROP DEFAULT;
