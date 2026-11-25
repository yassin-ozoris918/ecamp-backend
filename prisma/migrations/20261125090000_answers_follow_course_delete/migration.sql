-- Student answers blocked deleting a course, lecture or quiz (RESTRICT on the question link).
-- Answers now go with their question, so deleting the whole course/lecture/quiz/exam removes them.
-- Editing or deleting questions that students already answered is still refused, by the API
-- (quizzes.service / exams.service / quizzes.admin.controller), so answers are never lost by an edit.
-- DropForeignKey
ALTER TABLE "StudentExamResponse" DROP CONSTRAINT "StudentExamResponse_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QuizAttemptResponse" DROP CONSTRAINT "QuizAttemptResponse_questionId_fkey";

-- AddForeignKey
ALTER TABLE "StudentExamResponse" ADD CONSTRAINT "StudentExamResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttemptResponse" ADD CONSTRAINT "QuizAttemptResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
