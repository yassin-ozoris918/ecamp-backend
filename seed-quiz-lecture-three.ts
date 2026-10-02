import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Please provide a quizId or exact Quiz Title as an argument (in quotes).');
    console.error('Usage: npx ts-node seed-quiz-lecture-three.ts "Quiz on Lecture 3"');
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
      text: "Define a “Recommendation System” and give one example of a service that uses it.",
      points: 1.5,
      referenceAnswer: "A recommendation system predicts preferences from the user’s past behavior data and displays recommendations. Example: YouTube / Amazon / Spotify. (1.5 marks)"
    },
    {
      text: "List, in order, the three stages a “Voice Assistant” goes through when executing a command.",
      points: 1.5,
      referenceAnswer: "The three stages in order: recognize the voice → understand the command → execute it. (1.5 marks)"
    },
    {
      text: "What is “Predictive Maintenance”? In which industry is it used?",
      points: 1.5,
      referenceAnswer: "Predictive maintenance uses data to predict machine failures before they happen. It is used in manufacturing. (1.5 marks)"
    },
    {
      text: "Compare “Hallucination” and the “Black-box Problem” in terms of meaning.",
      points: 2,
      referenceAnswer: "Hallucination = AI generates information that is false/unsupported but sounds convincing (the output itself is wrong). The black-box problem = it is unclear how the AI reached its judgment (the output may be correct, but the reasoning is not transparent). (2 marks)"
    },
    {
      text: "Why does the use of your personal data by some services raise privacy concerns?",
      points: 1.5,
      referenceAnswer: "Because these services use personal, sensitive data (what you watch, buy, and say), which could be shared or misused without your knowledge; you, the owner, should decide how it is used. (1.5 marks)"
    },
    {
      text: "“The higher the impact of an error, the more human oversight is needed.” Explain this statement with one example from the lesson.",
      points: 2,
      referenceAnswer: "High-impact decisions can cause serious harm if wrong, so a final human review is required. Example: a medical diagnosis/decision that affects a person’s life must be confirmed by a doctor. (Any correct example from the lesson is accepted.) (2 marks)"
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
      text: "Match each task in Column (1) with the correct industry from Column (2).",
      points: 2,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      orderIndex: currentOrder++,
      matchOptions: [
        { left: "Optimizing delivery routes to reduce time and cost.", right: "Logistics" },
        { left: "Automating product quality inspection on the production line.", right: "Manufacturing" },
        { left: "Detecting diseases from X-ray images.", right: "Healthcare" },
        { left: "Predicting harvest timing and detecting pests.", right: "Agriculture" }
      ]
    }
  });

  // Multiple Choice Questions
  const mcqQuestions = [
    {
      text: "A recommendation system relies mainly on:",
      options: ["voice recognition.", "the user’s past behavior data.", "text translation.", "disease detection."],
      correct: 1,
      points: 1
    },
    {
      text: "Which of the following is something AI is good at?",
      options: ["bearing responsibility for results.", "making ethical judgments.", "finding patterns in complex data.", "always guaranteeing data privacy."],
      correct: 2,
      points: 1
    },
    {
      text: "“A technology that detects human faces in photographs and identifies them automatically” is:",
      options: ["machine translation.", "a recommendation system.", "a voice assistant.", "Face Recognition."],
      correct: 3,
      points: 1
    },
    {
      text: "If an AI system is trained on insufficient or biased data, the expected result is:",
      options: ["inaccurate and biased judgments.", "only faster processing.", "the black-box problem disappears.", "perfectly fair decisions."],
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
    { text: "Machine translation is done automatically by AI, with no human doing the translation itself.", isTrue: true, points: 0.5 },
    { text: "The black-box problem means that AI produces false information that sounds convincing.", isTrue: false, points: 0.5 },
    { text: "The higher the impact of an error in a decision, the less human oversight is needed.", isTrue: false, points: 0.5 }
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

  // Complete sentences (Short Answer)
  const saQuestions = [
    {
      text: "Among the things that require caution: issues of __________ when using copyrighted works as training data.",
      referenceAnswer: "copyright",
      points: 0.5
    },
    {
      text: "AI is good at __________ and prediction based on data.",
      referenceAnswer: "probabilistic reasoning",
      points: 0.5
    },
    {
      text: "AI results become less accurate when the training data is insufficient or not __________ of real conditions.",
      referenceAnswer: "representative",
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
      text: "A hospital wants to use AI to detect diseases from X-ray images. Is it enough to rely on the system alone for the final diagnosis? State your decision with one reason.",
      points: 1,
      referenceAnswer: "No, it is not enough. Reason: a medical decision is high-impact on a person’s life and the system can be wrong or biased, so a final human check and clear responsibility are required. (Any correct wording with this meaning is accepted.)",
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
