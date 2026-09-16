import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const quiz = await prisma.quiz.findFirst({
    where: { title: 'Quiz On Lecture One' },
    include: { questions: { orderBy: { orderIndex: 'asc' } } }
  });
  if (!quiz) { console.log('no quiz'); return; }

  const questions = quiz.questions
      .filter((q: any) => q.version === 'A')
      .map((q: any) => {
         const out = { ...q } as any;
         delete out.correctOptionIndex;
         delete out.referenceAnswer;
         
         if (out.type === 'MATCHING' && Array.isArray(out.matchOptions)) {
            const rights = out.matchOptions.map((m: any) => m.right);
            rights.sort(() => Math.random() - 0.5);
            out.matchOptions = out.matchOptions.map((m: any, i: number) => ({ left: m.left, right: rights[i] }));
         }
         return out;
      });

  const matchingQ = questions.find(q => q.type === 'MATCHING');
  console.log("MATCHING:", matchingQ);
}
main().finally(() => prisma.$disconnect());
