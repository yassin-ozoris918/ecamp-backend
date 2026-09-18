import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Please provide a quizId or exact Quiz Title as an argument (in quotes).');
    console.error('Usage: npx ts-node seed-quiz-arabic.ts "اختبار الدرس الأول"');
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
      text: "في القيادة الذاتية، لماذا يكون من الضروري معالجة بعض البيانات فورًا على المركبة نفسها بالحوسبة الطرفية بدلًا من إرسالها إلى السحابة لاتخاذ القرار؟ برّر إجابتك.",
      referenceAnswer: "لأن التأخير في معالجة بيانات القيادة قد يؤثر في السلامة (وتأخير بسيط قد يؤدي إلى حادث)؛ لذلك تُعالَج بعض البيانات محليًا على متن المركبة بالحوسبة الطرفية لتقليل زمن الاستجابة واتخاذ القرار فورًا، دون انتظار إرسال البيانات إلى السحابة وعودتها."
    },
    {
      text: "قارن بين الواقع المعزز (AR) والواقع الافتراضي (VR) من حيث علاقة كلّ منهما بالعالم الحقيقي، مع إعطاء وصف موجز لكل تقنية.",
      referenceAnswer: "الواقع المعزز (AR): يضيف عناصر/معلومات رقمية فوق مشهد من العالم الحقيقي، مع بقاء العالم الحقيقي ظاهرًا. الواقع الافتراضي (VR): يضع المستخدم داخل بيئة افتراضية كاملة مولّدة حاسوبيًا تحل محل العالم الحقيقي. الفرق: AR يعزّز الواقع بإضافات رقمية، وVR يستبدله ببيئة رقمية كاملة."
    },
    {
      text: "ما الفرق بين البت التقليدي (bit) والكيوبت (qubit)؟ وهل تُعّد الحوسبة الكمومية بديلًا عامًا يحل محل كل الحواسيب التقليدية؟ فسّر إجابتك.",
      referenceAnswer: "البت التقليدي يحمل حالة واحدة في كل وقت (إما 0 أو 1). الكيوبت يستخدم مبدأ التراكب الكمومي (مزيج من 0 و1 في آنٍ واحد). لا، الحوسبة الكمومية ليست بديلًا عامًا يحل محل كل الحواسيب التقليدية؛ فهي نهج مختلف قد يوفّر تفوقًا في فئات محددة من المسائل فقط، ولا يسرّع جميع أنواع الحسابات."
    }
  ];

  for (const q of essayQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.ESSAY,
        text: q.text,
        points: 5,
        referenceAnswer: q.referenceAnswer,
        version: QuizQuestionVersion.A,
        correctOptionIndex: 0,
      }
    });
  }

  // SECTION B: Multiple-Choice Questions
  const mcqQuestions = [
    {
      text: "ما اسم الحاسوب الإلكتروني المبكر المذكور في مرحلة الأربعينيات–الستينيات؟",
      options: ["آيفون (iPhone)", "إنياك (ENIAC)", "أبل إم1 ألترا (Apple M1 Ultra)", "إنتل 4004 (Intel 4004)"],
      correct: 1
    },
    {
      text: "المكوّن الإلكتروني الذي استُخدم في الحواسيب الإلكترونية الأولى هو:",
      options: ["الترانزستورات الدقيقة", "المعالجات متعددة الأنوية", "الصمامات المفرغة", "الكيوبتات"],
      correct: 2
    },
    {
      text: "شركة تسمح لموظفيها بأداء مهامهم من منازلهم باستخدام الإنترنت. هذا مثال على:",
      options: ["التجارة الإلكترونية", "العمل عن بُعد", "التعلم عبر الإنترنت", "الدفع غير النقدي"],
      correct: 1
    },
    {
      text: "شخص يدفع ثمن مشترياته بمسح رمز QR بهاتفه. هذا مثال على:",
      options: ["الدفع غير النقدي", "الحوسبة السحابية", "الواقع المعزز", "القيادة الذاتية"],
      correct: 0
    },
    {
      text: "التقنية التي تضع المستخدم داخل بيئة افتراضية مولّدة حاسوبيًا بالكامل هي:",
      options: ["الحوسبة الطرفية", "الواقع المعزز", "الحوسبة الكمومية", "الواقع الافتراضي"],
      correct: 3
    },
    {
      text: "الحوسبة الطرفية (Edge Computing) تعني:",
      options: ["معالجة البيانات على الجهاز نفسه فورًا بدلًا من إرسالها إلى السحابة", "تخزين كل البيانات في السحابة دائمًا", "بيع السلع والخدمات عبر الإنترنت", "تضاعف عدد الترانزستورات كل عامين"],
      correct: 0
    },
    {
      text: "في السيارة ذاتية القيادة تُعالَج بعض البيانات محليًا بالحوسبة الطرفية بشكل أساسي من أجل:",
      options: ["توفير مساحة تخزين في السحابة", "خفض تكلفة الاشتراك في الإنترنت", "زيادة عدد الكاميرات في المركبة", "تقليل زمن الاستجابة لتحسين السلامة"],
      correct: 3
    },
    {
      text: "أكمل: البت التقليدي يحمل ......... ، بينما الكيوبت يستخدم ......... .",
      options: ["حالتين معًا / حالة واحدة", "رمز QR / بطاقة مصرفية", "صمامًا مفرغًا / ترانزستورًا", "حالة واحدة في كل وقت / مبدأ التراكب الكمومي"],
      correct: 3
    },
    {
      text: "أيّ ممّا يلي صحيح بشأن الحوسبة الكمومية؟",
      options: ["هي بديل عام يحل محل كل الحواسيب التقليدية", "تسرّع جميع أنواع الحسابات دون استثناء", "قد توفر تفوقًا في فئات محددة من المسائل فقط", "تُستخدم أساسًا في الدفع غير النقدي"],
      correct: 2
    },
    {
      text: "التقنية التي تصف بيع السلع والخدمات وشراءها عبر الإنترنت (مثل أمازون وإيباي) هي:",
      options: ["شبكات التواصل الاجتماعي", "التجارة الإلكترونية", "الحوسبة السحابية", "العمل عن بُعد"],
      correct: 1
    },
    {
      text: "الحوسبة السحابية تُعرّف بأنها:",
      options: ["تكنولوجيا المعلومات المقدّمة كخدمة عبر الإنترنت", "معالجة البيانات على الجهاز نفسه فقط", "بيئة افتراضية كاملة مولّدة حاسوبيًا", "شبكة لمشاركة الصور بين الأصدقاء"],
      correct: 0
    },
    {
      text: "طالب يحضر درسًا تُقَدَّم فيه الدروس والمواد التعليمية عبر الإنترنت. هذا مثال على:",
      options: ["التعلم عبر الإنترنت", "الواقع المعزز", "التجارة الإلكترونية", "الحوسبة الطرفية"],
      correct: 0
    },
    {
      text: "خدمة تتيح للمستخدمين التواصل ونشر المحتوى ومشاركته بسرعة تُسمى:",
      options: ["التجارة الإلكترونية", "الدفع غير النقدي", "الحوسبة الكمومية", "شبكات التواصل الاجتماعي"],
      correct: 3
    },
    {
      text: "أيّ الترتيبات الآتية يمثّل التسلسل الزمني الصحيح لتطور تكنولوجيا المعلومات؟",
      options: [
        "ظهور الهواتف الذكية ← ظهور الحاسب ← الحوسبة السحابية ← تسويق الإنترنت تجاريًا",
        "بداية ظهور الحاسب ← تسويق الإنترنت تجاريًا ← ظهور الهواتف الذكية ← انتشار الحوسبة السحابية",
        "تسويق الإنترنت تجاريًا ← ظهور الحاسب ← الحوسبة السحابية ← ظهور الهواتف الذكية",
        "انتشار الحوسبة السحابية ← الهواتف الذكية ← الحاسب ← الإنترنت"
      ],
      correct: 1
    },
    {
      text: "إلى جانب تصغير الترانزستورات، يمكن تحسين أداء المعالجات عن طريق:",
      options: ["إرسال كل البيانات إلى السحابة", "استخدام الصمامات المفرغة من جديد", "تعدد الأنوية والمعالجة المتوازية والتصميمات المتخصصة", "إلغاء الحوسبة الطرفية"],
      correct: 2
    },
    {
      text: "أيّ العبارات الآتية لا تُعّد وصفًا مناسبًا لتقنية ناشئة؟",
      options: [
        "القيادة الذاتية تستخدم الذكاء الاصطناعي للمساعدة على قيادة المركبة",
        "الواقع المعزز يضيف معلومات رقمية فوق صور من العالم الحقيقي",
        "الواقع الافتراضي تقنية تُحسّن بشكل كبير سرعة معالجة الحاسب",
        "يُتوقع أن تسرّع الحوسبة الكمومية بعض الحسابات الصعبة على الحواسب التقليدية"
      ],
      correct: 2
    }
  ];

  for (const q of mcqQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.MCQ,
        text: q.text,
        points: 2,
        options: q.options,
        correctOptionIndex: q.correct,
        version: QuizQuestionVersion.A,
      }
    });
  }

  // SECTION C: True / False
  const tfQuestions = [
    { text: "قانون مور هو ملاحظة تجريبية تقول إن عدد الترانزستورات في الدائرة المتكاملة يقل تقريبًا كل عامين.", isTrue: false },
    { text: "قانون مور قانون فيزيائي ثابت لا يمكن أن يتوقف أبدًا.", isTrue: false },
    { text: "التجارة الإلكترونية تعني شراء السلع من المتاجر الفعلية باستخدام النقد.", isTrue: false },
    { text: "الحوسبة الطرفية تعالج البيانات على الجهاز نفسه فورًا بدلًا من إرسالها دائمًا إلى السحابة.", isTrue: true },
    { text: "الواقع الافتراضي (VR) هو تقنية تضيف عناصر رقمية إلى مشهد من العالم الحقيقي.", isTrue: false },
    { text: "الحوسبة الكمومية تسرّع جميع أنواع الحسابات وتُعّد بديلًا عامًا للحواسيب التقليدية.", isTrue: false },
    { text: "الكيوبت (qubit) يستخدم مبدأ التراكب الكمومي، بينما يحمل البت التقليدي حالة واحدة.", isTrue: true },
    { text: "ظهرت الحواسيب الإلكترونية الأولى (ومنها ENIAC) واستُخدمت أساسًا للأغراض العسكرية والحسابات العلمية.", isTrue: true },
    { text: "شبكات التواصل الاجتماعي فعّالة جدًا في نشر المعلومات بسرعة.", isTrue: true },
    { text: "الحوسبة السحابية تعني معالجة البيانات على الجهاز نفسه دون الحاجة إلى الإنترنت.", isTrue: false }
  ];

  for (const q of tfQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.TRUE_FALSE,
        text: q.text,
        points: 1,
        options: ["صح", "خطأ"],
        correctOptionIndex: q.isTrue ? 0 : 1,
        version: QuizQuestionVersion.A,
      }
    });
  }

  // SECTION D: Mixed Application
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.MATCHING,
      text: "صنّف كل مثال ضمن الفئة الأنسب:",
      points: 5,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      matchOptions: [
        { left: "مشاركة الصور مع الأصدقاء على شبكات التواصل الاجتماعي", right: "تغيرات في الحياة اليومية" },
        { left: "شركة تطبّق نظام العمل من المنزل لموظفيها", right: "تغيرات في الصناعة والاقتصاد" },
        { left: "تقديم الدروس والمواد التعليمية للطلاب عبر الإنترنت", right: "تغيرات في الرعاية الصحية والتعليم" }
      ]
    }
  });

  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.ESSAY,
      text: "من سؤال التصنيف السابق، اختر مثالًا واحدًا وفسّر سبب اختياره في تلك الفئة.",
      points: 5,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      referenceAnswer: "يُقبل أي تفسير منطقي يقدمه الطالب للمثال الذي اختاره. مثلاً إذا اختار 'الدفع بتطبيق على الهاتف الذكي'، يمكن تصنيفه كـ (أ) تغيرات في الحياة اليومية أو (ب) تغيرات في الصناعة والاقتصاد، طالما تم تقديم تفسير منطقي."
    }
  });

  const total = essayQuestions.length + mcqQuestions.length + tfQuestions.length + 2;
  console.log(`Inserted ${total} questions (${essayQuestions.length} essay + ${mcqQuestions.length} MCQ + ${tfQuestions.length} True/False + 1 MATCHING + 1 essay).`);
  console.log("All questions successfully inserted!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
