import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Please provide a quizId or exact Quiz Title as an argument (in quotes).');
    console.error('Usage: npx ts-node seed-quiz-lecture-two.ts "Quiz on Lecture two"');
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
      text: "Define Artificial Intelligence (AI), and give two examples of tasks it performs.",
      points: 2,
      referenceAnswer: "A general term for technologies that reproduce or perform intelligent human behavior — such as learning, reasoning and judgment — on a computer. (1 mark) — Two examples: speech recognition, image recognition or translation. (1 mark; half a mark per correct example)"
    },
    {
      text: "What is the core difference between traditional programming and machine learning (ML), in terms of where the rules come from?",
      points: 2,
      referenceAnswer: "In traditional programming a human writes every rule explicitly (“if … then …”) and the system does not learn from examples. (1 mark) — In machine learning the model learns the patterns from data by itself and improves as the examples grow. (1 mark)"
    },
    {
      text: "What is a neural network (ANN)? Describe how data flows through it from input to output.",
      points: 2,
      referenceAnswer: "A system modeled after the workings of the nerve cells (neurons) of the human brain; it connects many simple components (units) and learns from data, becoming capable of complex judgments. (1 mark) — Data flows from the input layer → the hidden layers → the output layer. (1 mark)"
    },
    {
      text: "Give a reason why deep learning (DL) may struggle with a case it has rarely seen in its training data.",
      points: 2,
      referenceAnswer: "Deep learning learns patterns from many examples. (1 mark) — If a case appears rarely in the training data the model does not learn its pattern well, so it generalizes poorly to that case and its prediction there is less accurate or wrong. (1 mark)"
    },
    {
      text: "What would happen if a student used a generative-AI (GenAI) output as-is in a school report without checking it? State the danger, then state the correct alternative.",
      points: 2,
      referenceAnswer: "Danger: the output may be a hallucination — it looks correct, so the student copies a false statement into the report without realizing it, which weakens the accuracy of the work. (1 mark) — Instead: verify the output and its sources against trusted references before using it, and never accept it as a final answer without checking. (1 mark)"
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
      text: "An app turns a written description into a brand-new image. Which category is it?",
      options: ["Traditional programming", "Machine-learning classification", "Generative AI", "Deep-learning prediction"],
      correct: 2,
      points: 1
    },
    {
      text: "Most modern generative-AI systems are built on:",
      options: ["rules written explicitly by a human", "deep learning", "manual classification of data", "systems that use no training data"],
      correct: 1,
      points: 1
    },
    {
      text: "Spam filters and product recommendations do different tasks, yet both:",
      options: ["create new content that did not exist before", "rely on a rule written by a human for every case", "work without needing any data", "learn patterns from past examples and generalize them"],
      correct: 3,
      points: 1
    },
    {
      text: "Saying that today's AI is “narrow” means that:",
      options: ["it is an expert at its specific task only, not everything", "it works with very little data", "it cannot learn from data at all", "it can perform any task a user asks for"],
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
    { text: "Neural networks are the foundation on which deep learning is built.", isTrue: true, points: 0.5 },
    { text: "“Generative” means the system only classifies existing data and predicts from it.", isTrue: false, points: 0.5 },
    { text: "The relationship between AI, ML, DL and GenAI is a teaching-simplified one, not a strict containment in every case.", isTrue: true, points: 0.5 },
    { text: "The speed of getting an output from generative AI removes the need to check the facts.", isTrue: false, points: 0.5 }
  ];

  for (const q of tfQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.TRUE_FALSE,
        text: q.text,
        points: q.points,
        options: ["True", "False"],
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
      text: "Match each description with the correct term:",
      points: 2,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      orderIndex: currentOrder++,
      matchOptions: [
        { left: "A system modeled after the neurons of the human brain, made of interconnected units whose weights change during training.", right: "Neural Network (ANN)" },
        { left: "An advanced technology within machine learning that uses neural networks on large-scale data.", right: "Deep Learning (DL)" },
        { left: "Output that sounds plausible or correct, but is actually factually wrong.", right: "Hallucination" },
        { left: "The broadest field: technologies that perform tasks such as recognition, prediction and content generation.", right: "Artificial Intelligence (AI)" }
      ]
    }
  });

  // Complete sentences (Short Answer)
  const saQuestions = [
    {
      text: "The branch of AI in which models learn patterns from data is:",
      referenceAnswer: "Machine Learning (ML)",
      points: 0.5
    },
    {
      text: "One example of a generative-AI tool mentioned in the lesson is:",
      referenceAnswer: "ChatGPT (or image-generation AIs)",
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
      text: "Put these concepts in order, broadest to most specialized:",
      points: 1,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      orderIndex: currentOrder++,
      correctOrder: [
        "Artificial Intelligence (AI)",
        "Machine Learning (ML)",
        "Deep Learning (DL)",
        "Generative AI (GenAI)"
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
