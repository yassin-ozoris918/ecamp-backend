import axios from 'axios';

async function test() {
  try {
    // We need to fetch the quiz from the API. We'll use the findQuiz logic locally.
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const quiz = await prisma.quiz.findFirst({
      where: { title: 'Quiz On Lecture One' },
      include: { questions: { orderBy: { orderIndex: 'asc' } } }
    });
    
    if (!quiz) {
      console.log('Quiz not found');
      return;
    }
    
    const out = { ...quiz.questions.find(q => q.type === 'MATCHING') } as any;
    console.log("Before:", out.matchOptions);
    
    if (out.type === 'MATCHING' && Array.isArray(out.matchOptions)) {
        const rights = out.matchOptions.map((m: any) => m.right);
        rights.sort(() => Math.random() - 0.5);
        out.matchOptions = out.matchOptions.map((m: any, i: number) => ({ left: m.left, right: rights[i] }));
    }
    console.log("After:", out.matchOptions);
    prisma.$disconnect();
  } catch (err) {
    console.error(err);
  }
}
test();
