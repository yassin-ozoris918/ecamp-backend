import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Please provide a quizId or exact Quiz Title as an argument (in quotes).');
    console.error('Usage: npx ts-node seed-quiz-lecture-two-arabic.ts "اختبار الدرس الثاني"');
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
      text: "عرّف الذكاء الاصطناعي (AI)، واذكر مثالين على مهامّ يؤديها.",
      points: 2,
      referenceAnswer: "مجال يضم أنظمة حاسوبية تستطيع تنفيذ مهامّ مثل التعلّم من البيانات والتنبؤ والتعرّف وتوليد المحتوى واتخاذ القرارات أو دعمها. (1 درجة) — مثالان: التعرّف على الكلام أو الصور، والترجمة. (1 درجة، نصف لكل مثال صحيح)"
    },
    {
      text: "ما الفرق الجوهري بين البرمجة التقليدية والتعلّم الآلي (ML) من حيث مصدر القواعد التي يعمل بها النظام؟",
      points: 2,
      referenceAnswer: "في البرمجة التقليدية يكتب الإنسان كل قاعدة صراحةً («إذا... فإنّ...») والنظام لا يتعلّم من الأمثلة. (1 درجة) — أما في التعلّم الآلي فيتعلّم النموذج الأنماط بنفسه من البيانات ويتحسّن كلما زادت الأمثلة. (1 درجة)"
    },
    {
      text: "ما الشبكة العصبية الاصطناعية (ANN)؟ وصِف مسار البيانات داخلها من الإدخال حتى الإخراج.",
      points: 2,
      referenceAnswer: "نموذج حاسوبي مستوحى بصورة مبسّطة من فكرة ترابط العصبونات، يتكوّن من وحدات مترابطة تتغيّر أوزانها أثناء التدريب لتتعلّم أنماطًا من البيانات. (1 درجة) — مسار البيانات: طبقة الإدخال ← الطبقات المخفية ← طبقة الإخراج. (1 درجة)"
    },
    {
      text: "علّل: قد يواجه التعلم العميق (DL) صعوبةً مع حالة نادرًا ما رآها في بيانات التدريب.",
      points: 2,
      referenceAnswer: "لأن التعلم العميق يتعلّم الأنماط من كثرة الأمثلة. (1 درجة) — فإذا كانت أمثلة الحالة نادرة في بيانات التدريب لم يتعلّم النموذج نمطها جيدًا، فيضعف تعميمه عليها ويصبح تنبؤه فيها أقلّ دقة أو خاطئًا. (1 درجة)"
    },
    {
      text: "ماذا يحدث لو اعتمد طالبٌ على ناتج ذكاء اصطناعي توليدي (GenAI) في تقرير مدرسي كما هو دون تحقّق؟ اذكر الخطر، ثم اذكر الإجراء البديل الصحيح.",
      points: 2,
      referenceAnswer: "الخطر: الناتج قد يكون هلوسة — يبدو صحيحًا فيثق به الطالب وينقل معلومة خاطئة في تقريره دون أن يدري، فتتأثر صحّة عمله وتقييمه. (1 درجة) — البديل: التحقّق من الناتج ومن مصادره ومقارنته بمصادر موثوقة قبل استخدامه، وعدم اعتماده كإجابة نهائية دون مراجعة. (1 درجة)"
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

  // SECTION B: Mixed Questions
  let currentOrder = essayQuestions.length + 1;

  // Multiple Choice Questions
  const mcqQuestions = [
    {
      text: "تطبيق يحوّل وصفًا نصيًا إلى صورة جديدة لم تكن موجودة من قبل. إلى أي فئة ينتمي هذا التطبيق؟",
      options: ["البرمجة التقليدية", "التصنيف بالتعلّم الآلي", "الذكاء الاصطناعي التوليدي", "التنبؤ بالتعلم العميق"],
      correct: 2,
      points: 1
    },
    {
      text: "غالبية أنظمة الذكاء الاصطناعي التوليدي الحديثة مبنيّة على:",
      options: ["قواعد يكتبها الإنسان صراحةً", "التعلم العميق", "التصنيف اليدوي للبيانات", "أنظمة تعمل دون بيانات تدريب"],
      correct: 1,
      points: 1
    },
    {
      text: "مرشّح الرسائل المزعجة وتوصية المنتجات يؤدّيان مهمتين مختلفتين، لكنهما يشتركان في أنهما:",
      options: ["يُنشئان محتوى جديدًا لم يكن موجودًا", "يعتمدان على قاعدة يكتبها الإنسان لكل حالة", "يعملان دون الحاجة إلى أي بيانات", "يتعلّمان أنماطًا من أمثلة سابقة ثم يعمّمانها"],
      correct: 3,
      points: 1
    },
    {
      text: "المقصود بأن معظم أنظمة الذكاء الاصطناعي الحالية «ضيّقة النطاق» هو:",
      options: ["أنها بارعة في مهمّتها المحدّدة فقط، لا في كل شيء", "أنها تعمل ببيانات قليلة جدًا", "أنها لا تستطيع التعلّم من البيانات", "أنها تستطيع أداء أي مهمة يطلبها المستخدم"],
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
    { text: "الشبكات العصبية هي الأساس الذي يقوم عليه التعلم العميق.", isTrue: true, points: 0.5 },
    { text: "كلمة «توليدي» تعني أن النظام يصنّف البيانات الموجودة ويتنبّأ بها فقط.", isTrue: false, points: 0.5 },
    { text: "العلاقة بين AI و ML و DL و GenAI علاقة تعليمية مبسّطة، وليست تسلسل احتواء صارمًا في كل حالة.", isTrue: true, points: 0.5 },
    { text: "سرعة الحصول على ناتج من الذكاء التوليدي تُغني عن التحقّق من صحّة المعلومة.", isTrue: false, points: 0.5 }
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

  // MATCHING
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.MATCHING,
      text: "طابِق كل وصف بالمصطلح المناسب:",
      points: 2,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      orderIndex: currentOrder++,
      matchOptions: [
        { left: "نموذج حاسوبي مستوحى من ترابط العصبونات، يتكوّن من وحدات مترابطة تتغيّر أوزانها أثناء التدريب.", right: "الشبكة العصبية الاصطناعية (ANN)" },
        { left: "أسلوب من التعلّم الآلي يعتمد على شبكات عصبية متعددة الطبقات، وكثيرًا ما يحتاج بيانات كبيرة نسبيًا.", right: "التعلم العميق (DL)" },
        { left: "ناتج يبدو معقولًا أو صحيحًا، لكنه غير صحيح واقعيًا.", right: "الهلوسة (Hallucination)" },
        { left: "المجال الأوسع الذي يضمّ أنظمة تنفّذ مهامّ مثل التعرّف والتنبؤ وتوليد المحتوى.", right: "الذكاء الاصطناعي (AI)" }
      ]
    }
  });

  // Complete sentences (Short Answer)
  const saQuestions = [
    {
      text: "فرع الذكاء الاصطناعي الذي تتعلّم فيه النماذج الأنماط من البيانات بدل برمجة كل قاعدة صراحةً هو:",
      referenceAnswer: "التعلّم الآلي (ML)",
      points: 0.5
    },
    {
      text: "من الأمثلة المذكورة في الدرس على أدوات الذكاء الاصطناعي التوليدي:",
      referenceAnswer: "ChatGPT (أو أدوات توليد الصور)",
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

  // Ordering Question
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.ORDERING,
      text: "رتّب المفاهيم الآتية من الفئة الأوسع إلى الأكثر تخصّصًا:",
      points: 1,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      orderIndex: currentOrder++,
      correctOrder: [
        "الذكاء الاصطناعي (AI)",
        "التعلّم الآلي (ML)",
        "التعلم العميق (DL)",
        "الذكاء الاصطناعي التوليدي (GenAI)"
      ]
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
