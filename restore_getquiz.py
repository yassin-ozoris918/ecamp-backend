import re

service_file = 'src/quizzes/quizzes.service.ts'

with open(service_file, 'r', encoding='utf-8') as f:
    orig = f.read()

replacement = '''  async getQuizForStudent(quizId: string, studentId?: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!quiz) throw new NotFoundException('Quiz not found or not published');

    let questionVersion: 'A' | 'B' = 'A';

    if (studentId) {
      const lastCompletedAttempt = await this.prisma.quizAttempt.findFirst({
        where: {
          quizId,
          studentId,
          status: { not: 'PENDING' },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastCompletedAttempt && lastCompletedAttempt.status === 'FAILED') {
        const versionBCount = quiz.questions.filter((q: any) => q.version === 'B').length;
        if (versionBCount > 0) {
          questionVersion = 'B';
        }
      }
    }

    const questions = quiz.questions
      .filter((q: any) => q.version === questionVersion)
      .map((q: any) => {
         const out = { ...q } as any;
         delete out.correctOptionIndex;
         delete out.referenceAnswer;
         
         if (out.type === 'MATCHING' && Array.isArray(out.matchOptions)) {
            const rights = out.matchOptions.map((m: any) => m.right);
            rights.sort(() => Math.random() - 0.5);
            out.matchOptions = out.matchOptions.map((m: any, i: number) => ({ left: m.left, right: rights[i] }));
         }
         
         if (out.type === 'ORDERING' && Array.isArray(out.correctOrder)) {
            const items = [...out.correctOrder];
            items.sort(() => Math.random() - 0.5);
            out.correctOrder = items;
         }
         return out;
      });

    return {
      ...quiz,
      questions,
      activeVersion: questionVersion,
    };
  }'''

orig = re.sub(r'  async getQuizForStudent.*?async startQuiz', replacement + '\n\n  async startQuiz', orig, flags=re.DOTALL)

with open(service_file, 'w', encoding='utf-8') as f:
    f.write(orig)

print('Restored getQuizForStudent successfully.')
