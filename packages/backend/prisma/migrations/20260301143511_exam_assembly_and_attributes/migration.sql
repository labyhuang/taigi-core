-- CreateEnum
CREATE TYPE "paper_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "examCategory" "exam_category",
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_values" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_blueprints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examCategory" "exam_category" NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blueprint_cells" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionType" "question_type" NOT NULL,
    "questionSubType" "question_sub_type" NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "questionCount" INTEGER NOT NULL,
    "scorePerQuestion" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "blueprint_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "paper_status" NOT NULL DEFAULT 'DRAFT',
    "blueprintSnapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_questions" (
    "id" TEXT NOT NULL,
    "examPaperId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "exam_paper_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attribute_definitions_key_key" ON "attribute_definitions"("key");

-- CreateIndex
CREATE INDEX "attribute_values_attributeId_idx" ON "attribute_values"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_values_attributeId_value_key" ON "attribute_values"("attributeId", "value");

-- CreateIndex
CREATE INDEX "blueprint_cells_blueprintId_idx" ON "blueprint_cells"("blueprintId");

-- CreateIndex
CREATE INDEX "exam_paper_questions_examPaperId_idx" ON "exam_paper_questions"("examPaperId");

-- CreateIndex
CREATE INDEX "exam_paper_questions_questionId_idx" ON "exam_paper_questions"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_questions_examPaperId_questionId_key" ON "exam_paper_questions"("examPaperId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_questions_examPaperId_orderIndex_key" ON "exam_paper_questions"("examPaperId", "orderIndex");

-- CreateIndex
CREATE INDEX "questions_category_type_subType_status_idx" ON "questions"("category", "type", "subType", "status");

-- CreateIndex (GIN for JSONB attributes filtering)
CREATE INDEX "idx_questions_attributes" ON "questions" USING GIN ("attributes");

-- AddForeignKey
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "attribute_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_blueprints" ADD CONSTRAINT "exam_blueprints_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_cells" ADD CONSTRAINT "blueprint_cells_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "exam_blueprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "exam_blueprints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
