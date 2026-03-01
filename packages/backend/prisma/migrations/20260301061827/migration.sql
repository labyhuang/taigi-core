-- CreateEnum
CREATE TYPE "question_status" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "review_action" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('READING', 'LISTENING', 'SPEAKING', 'DICTATION');

-- CreateEnum
CREATE TYPE "question_sub_type" AS ENUM ('GRAMMAR', 'COMPREHENSION', 'CONVERSATION', 'SPEECH', 'STORYTELLING', 'READ_ALOUD', 'EXPRESSION', 'DICTATION_FILL');

-- CreateEnum
CREATE TYPE "text_system" AS ENUM ('TJ', 'POJ');

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "type" "question_type" NOT NULL,
    "subType" "question_sub_type" NOT NULL,
    "textSystem" "text_system" NOT NULL,
    "stem" TEXT,
    "status" "question_status" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB,
    "answer" JSONB,
    "isGroupParent" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,
    "authorId" TEXT NOT NULL,
    "lastReviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_review_logs" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "review_action" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "transcript" TEXT,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_media" (
    "questionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "question_media_pkey" PRIMARY KEY ("questionId","mediaId")
);

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_lastReviewerId_fkey" FOREIGN KEY ("lastReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_review_logs" ADD CONSTRAINT "question_review_logs_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_review_logs" ADD CONSTRAINT "question_review_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
