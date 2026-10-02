import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Please provide a quizId or exact Quiz Title as an argument (in quotes).');
    console.error('Usage: npx ts-node seed-quiz-lecture-three-arabic.ts "اختبار على المحاضرة الثالثة"');
    process.exit(1);
  }

  // Try finding by ID first
  let quiz = await prisma.quiz.findUnique({ where: { id: identifier } });
  
  // If not found by ID, try finding by title
  if (!quiz) {
    quiz = await prisma.quiz.findFirst({ 
      where: { title: identifier, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  if (!quiz) {
    console.error(`Quiz with ID or Title '${identifier}' not found in the database.`);
    process.exit(1);
  }

  console.log(`Adding questions to Quiz: ${quiz.title} (${quiz.id})`);

  // Idempotency: remove previously seeded version-A questions so re-running
  // the script does not create duplicates.
  const removed = await prisma.quizQuestion.deleteMany({
    where: { quizId: quiz.id, version: QuizQuestionVersion.A },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} previously seeded version-A question(s).`);
  }

  // SECTION A: Theoretical Questions
  const essayQuestions = [
    {
      text: "عرّف «نظام التوصية» (Recommendation System)، واذكر مثالاً واحداً.",
      points: 1.5,
      referenceAnswer: "نظام التوصية: برنامج يتنبأ بالتفضيلات من بيانات السلوك السابق للمستخدم ثم يعرض التوصيات. مثال: يوتيوب / أمازون / سبوتيفاي. (1.5 درجة)"
    },
    {
      text: "اذكر المراحل الثلاث التي يمرّ بها «المساعد الصوتي» (Voice Assistant) عند تنفيذ أمرٍ ما، بالترتيب.",
      points: 1.5,
      referenceAnswer: "المراحل الثلاث بالترتيب: التعرّف على الصوت ← فهم الأمر (المطلوب) ← تنفيذ الأمر. (1.5 درجة)"
    },
    {
      text: "ما المقصود بـ «الصيانة التنبؤية» (Predictive Maintenance)؟ وفي أي صناعة تُستخدم؟",
      points: 1.5,
      referenceAnswer: "الصيانة التنبؤية: استخدام البيانات للتنبؤ بأعطال الآلات قبل وقوعها. وتُستخدم في صناعة التصنيع. (1.5 درجة)"
    },
    {
      text: "قارن بين «الهلوسة» (Hallucination) و «مشكلة الصندوق الأسود» (Black-box Problem).",
      points: 2,
      referenceAnswer: "الهلوسة = توليد معلومات خاطئة لكنها تبدو مقنعة (المخرجات نفسها غير صحيحة). أمّا مشكلة الصندوق الأسود = غموض كيفية توّصل النظام إلى حكمه (المخرجة قد تكون صحيحة لكن طريقة الوصول غير واضحة). (2 درجة)"
    },
    {
      text: "لماذا يُثير استخدام بعض الخدمات لبياناتك الشخصية مخاوف تتعلّق بالخصوصية؟",
      points: 1.5,
      referenceAnswer: "لأن هذه الخدمات تستخدم بيانات شخصية وحسّاسة (ما تشاهده وتشتريه وتقوله)، وقد تُجْمَع أو تُشارَك أو يُساء استخدامها دون علم المستخدم؛ لذا ينبغي أن يملك المستخدم قرار كيفية استخدامها. (1.5 درجة)"
    },
    {
      text: "«كلما ارتفع أثر الخطأ في القرار، زادت الحاجة إلى الإشراف البشري». اشرح هذه العبارة مع مثالٍ واحد من الدرس",
      points: 2,
      referenceAnswer: "لأن القرارات مرتفعة الأثر قد يترتّب على خطئها ضرر كبير، لذا تلزم مراجعة بشرية نهائية. مثال: التشخيص الطبي / القرار الطبي مرتفع الأثر على حياة الإنسان يتطلّب تأكيداً من طبيب. (يُقبل أي مثال صحيح من الدرس). (2 درجة)"
    }
  ];

  for (let i = 0; i < essayQuestions.length; i++) {
    const q = essayQuestions[i];
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.ESSAY,
        text: q.text,
        points: q.points,
        referenceAnswer: q.referenceAnswer,
        version: QuizQuestionVersion.A,
        correctOptionIndex: 0,
        orderIndex: i + 1,
      }
    });
  }

  let currentOrder = essayQuestions.length + 1;

  // SECTION B: Mixed Questions
  
  // MATCHING
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.MATCHING,
      text: "طابِق كل مهمة في العمود بالصناعة المناسبة لها:",
      points: 2,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      orderIndex: currentOrder++,
      matchOptions: [
        { left: "تحسين مسارات التوصيل لتقليل الوقت والتكلفة.", right: "الخدمات اللوجستية" },
        { left: "أتمتة فحص جودة المنتج على خط الإنتاج.", right: "التصنيع" },
        { left: "الكشف عن الأمراض من صور الأشعة السينية.", right: "الرعاية الصحية" },
        { left: "التنبؤ بموعد الحصاد والكشف عن الآفات.", right: "الزراعة" }
      ]
    }
  });

  // Multiple Choice Questions
  const mcqQuestions = [
    {
      text: "يعتمد «نظام التوصية» بشكل أساسي على:",
      options: ["التعرّف على الصوت.", "بيانات السلوك السابق للمستخدم.", "ترجمة النصوص.", "الكشف عن الأمراض."],
      correct: 1,
      points: 1
    },
    {
      text: "أيّ ممّا يلي يُعدّ من الأمور التي يبرع فيها الذكاء الاصطناعي؟",
      options: ["تحمّل المسؤولية عن النتائج.", "إصدار الأحكام الأخلاقية.", "إيجاد الأنماط في البيانات المعقّدة.", "ضمان خصوصية البيانات دائماً."],
      correct: 2,
      points: 1
    },
    {
      text: "«تقنية تكتشف وجوه الأشخاص داخل الصور وتتعرّف عليها تلقائياً» هي:",
      options: ["الترجمة الآلية.", "نظام التوصية.", "المساعد الصوتي.", "التعرّف على الوجه (Face Recognition)."],
      correct: 3,
      points: 1
    },
    {
      text: "إذا دُرِّب نظام ذكاء اصطناعي على بيانات غير كافية أو متحيّزة، فإن النتيجة المتوقعة هي:",
      options: ["أحكام غير دقيقة ومتحيّزة.", "زيادة سرعة المعالجة فقط.", "اختفاء مشكلة الصندوق الأسود.", "ضمان قرارات عادلة تماماً."],
      correct: 0,
      points: 1
    }
  ];

  for (const q of mcqQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.MCQ,
        text: q.text,
        points: q.points,
        options: q.options,
        correctOptionIndex: q.correct,
        version: QuizQuestionVersion.A,
        orderIndex: currentOrder++,
      }
    });
  }

  // True / False Questions
  const tfQuestions = [
    { text: "الترجمة الآلية تتم تلقائياً بالذكاء الاصطناعي دون تدخّل بشري في الترجمة نفسها.", isTrue: true, points: 0.5 },
    { text: "مشكلة الصندوق الأسود تعني أن الذكاء الاصطناعي يُنتج معلومات خاطئة تبدو مقنعة.", isTrue: false, points: 0.5 },
    { text: "كلما ارتفع أثر الخطأ في القرار، قلّت الحاجة إلى الإشراف البشري.", isTrue: false, points: 0.5 }
  ];

  for (const q of tfQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.TRUE_FALSE,
        text: q.text,
        points: q.points,
        options: ["صح", "خطأ"],
        correctOptionIndex: q.isTrue ? 0 : 1,
        version: QuizQuestionVersion.A,
        orderIndex: currentOrder++,
      }
    });
  }

  // Complete sentences (Short Answer)
  const saQuestions = [
    {
      text: "أكمل الفراغ مستعيناً بالكلمات التالية: [ الاستدلال الاحتمالي – حقوق المؤلف – ممثّلة – الخصوصية ]\n\nمن الأمور التي تتطلّب الحذر: قضايا __________ عند استخدام أعمال محمية كبيانات تدريب.",
      referenceAnswer: "حقوق المؤلف",
      points: 0.5
    },
    {
      text: "أكمل الفراغ مستعيناً بالكلمات التالية: [ الاستدلال الاحتمالي – حقوق المؤلف – ممثّلة – الخصوصية ]\n\nيبرع الذكاء الاصطناعي في __________ والتنبؤ استناداً إلى البيانات.",
      referenceAnswer: "الاستدلال الاحتمالي",
      points: 0.5
    },
    {
      text: "أكمل الفراغ مستعيناً بالكلمات التالية: [ الاستدلال الاحتمالي – حقوق المؤلف – ممثّلة – الخصوصية ]\n\nتقلّ دقّة نتائج الذكاء الاصطناعي عندما تكون بيانات التدريب غير كافية أو غير __________ لظروف الواقع.",
      referenceAnswer: "ممثّلة",
      points: 0.5
    }
  ];

  for (const q of saQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.SHORT_ANSWER,
        text: q.text,
        points: q.points,
        referenceAnswer: q.referenceAnswer,
        version: QuizQuestionVersion.A,
        correctOptionIndex: 0,
        orderIndex: currentOrder++,
      }
    });
  }

  // Scenario Question (Essay)
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.ESSAY,
      text: "يريد مستشفى استخدام الذكاء الاصطناعي للكشف عن الأمراض من صور الأشعة. هل يكفي اعتماد التشخيص النهائي على النظام وحده؟ اذكر قرارك مع سببٍ واحد.",
      points: 1,
      referenceAnswer: "لا يكفي. السبب: القرار الطبي مرتفع الأثر على حياة الإنسان وقد يخطئ النظام أو يتحيّز، لذا يلزم تحقّق بشري نهائي وتحديد المسؤولية. (تُقبل أي صياغة صحيحة بهذا المعنى).",
      version: QuizQuestionVersion.A,
      correctOptionIndex: 0,
      orderIndex: currentOrder++,
    }
  });

  console.log(`Inserted questions successfully!`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
