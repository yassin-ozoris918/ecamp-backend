import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Student answers are deleted together with their question (ON DELETE CASCADE), so a whole course,
 * lecture, quiz or exam can be deleted even after students answered it. Editing is different:
 * replacing or deleting questions that students already answered would silently lose their
 * answers and grades, so those edits are refused here.
 */
export async function assertQuestionsUnanswered(
  db: Prisma.TransactionClient,
  scope: { quizId: string } | { examId: string } | { quizQuestionId: string },
): Promise<void> {
  const answered =
    'examId' in scope
      ? await db.studentExamResponse.count({ where: { question: { examId: scope.examId } } })
      : 'quizId' in scope
        ? await db.quizAttemptResponse.count({ where: { question: { quizId: scope.quizId } } })
        : await db.quizAttemptResponse.count({ where: { questionId: scope.quizQuestionId } });
  if (answered > 0) throw new BadRequestException('quiz.messages.cannotModifyUsed');
}
