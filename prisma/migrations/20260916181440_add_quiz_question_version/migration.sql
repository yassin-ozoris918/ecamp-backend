-- CreateEnum
CREATE TYPE "QuizQuestionVersion" AS ENUM ('A', 'B');

-- AlterTable: add version column to QuizQuestion, defaulting existing rows to 'A'
ALTER TABLE "QuizQuestion" ADD COLUMN "version" "QuizQuestionVersion" NOT NULL DEFAULT 'A';
