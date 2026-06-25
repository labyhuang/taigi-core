-- CreateEnum
CREATE TYPE "exam_session_status" AS ENUM ('DRAFT', 'IMPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "recompute_job_status" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- DropForeignKey
ALTER TABLE "exam_papers" DROP CONSTRAINT "exam_papers_blueprintId_fkey";

-- DropIndex
DROP INDEX "idx_questions_attributes";

-- AlterTable
ALTER TABLE "exam_papers" ALTER COLUMN "blueprintId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examCategory" "exam_category" NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "status" "exam_session_status" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_session_papers" (
    "examSessionId" TEXT NOT NULL,
    "examPaperId" TEXT NOT NULL,
    "paperVariant" TEXT,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_session_papers_pkey" PRIMARY KEY ("examSessionId","examPaperId")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "externalCandidateId" TEXT NOT NULL,
    "ageGroup" TEXT,
    "schoolType" TEXT,
    "demographic" JSONB NOT NULL DEFAULT '{}',
    "totalScore" DOUBLE PRECISION,
    "paperVariant" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_responses" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "writtenAnswer" TEXT,
    "speakingScore" DOUBLE PRECISION,
    "isCorrect" BOOLEAN,
    "pointsEarned" DOUBLE PRECISION,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "speakingScoredAt" TIMESTAMP(3),

    CONSTRAINT "candidate_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "totalRows" INTEGER NOT NULL,
    "inserted" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_statistics" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "examSessionId" TEXT,
    "totalAnswered" INTEGER NOT NULL,
    "totalCorrect" INTEGER,
    "highGroupSize" INTEGER NOT NULL,
    "lowGroupSize" INTEGER NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "discrimination" DOUBLE PRECISION,
    "optionStats" JSONB,
    "meanScore" DOUBLE PRECISION,
    "scoreStdDev" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recompute_jobs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "examSessionId" TEXT,
    "status" "recompute_job_status" NOT NULL DEFAULT 'PENDING',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "processedQuestions" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recompute_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_sessions_examCategory_examDate_idx" ON "exam_sessions"("examCategory", "examDate");

-- CreateIndex
CREATE INDEX "exam_session_papers_examPaperId_idx" ON "exam_session_papers"("examPaperId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_session_papers_examSessionId_paperVariant_key" ON "exam_session_papers"("examSessionId", "paperVariant");

-- CreateIndex
CREATE INDEX "candidates_examSessionId_ageGroup_idx" ON "candidates"("examSessionId", "ageGroup");

-- CreateIndex
CREATE INDEX "candidates_examSessionId_schoolType_idx" ON "candidates"("examSessionId", "schoolType");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_examSessionId_externalCandidateId_key" ON "candidates"("examSessionId", "externalCandidateId");

-- CreateIndex
CREATE INDEX "candidate_responses_questionId_examSessionId_idx" ON "candidate_responses"("questionId", "examSessionId");

-- CreateIndex
CREATE INDEX "candidate_responses_examSessionId_idx" ON "candidate_responses"("examSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_responses_candidateId_questionId_key" ON "candidate_responses"("candidateId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyHash_key" ON "api_clients"("keyHash");

-- CreateIndex
CREATE INDEX "import_logs_examSessionId_idx" ON "import_logs"("examSessionId");

-- CreateIndex
CREATE INDEX "question_statistics_examSessionId_idx" ON "question_statistics"("examSessionId");

-- CreateIndex
CREATE INDEX "question_statistics_questionId_idx" ON "question_statistics"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "question_statistics_questionId_examSessionId_key" ON "question_statistics"("questionId", "examSessionId");

-- CreateIndex
CREATE INDEX "recompute_jobs_status_createdAt_idx" ON "recompute_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "questions_groupId_idx" ON "questions"("groupId");

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "exam_blueprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_papers" ADD CONSTRAINT "exam_session_papers_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_papers" ADD CONSTRAINT "exam_session_papers_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "exam_papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_responses" ADD CONSTRAINT "candidate_responses_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_responses" ADD CONSTRAINT "candidate_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_responses" ADD CONSTRAINT "candidate_responses_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_statistics" ADD CONSTRAINT "question_statistics_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_statistics" ADD CONSTRAINT "question_statistics_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recompute_jobs" ADD CONSTRAINT "recompute_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
