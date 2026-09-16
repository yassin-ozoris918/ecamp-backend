import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error('Please provide a quizId or exact Quiz Title as an argument (in quotes).');
    console.error('Usage: npx ts-node seed-quiz.ts "Quiz On Lecture One"');
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
      text: "In autonomous driving, why is it necessary to process some data instantly on the vehicle itself using edge computing, rather than sending it to the cloud for judgment? Justify your answer.",
      referenceAnswer: "Because a delay in processing driving data can affect safety (even a small delay can cause an accident); so some data is processed locally on board the vehicle using edge computing to reduce response time and decide instantly, without waiting to send data to the cloud and back."
    },
    {
      text: "Compare Augmented Reality (AR) and Virtual Reality (VR) in terms of each one’s relationship to the real world, giving a brief description of each technology.",
      referenceAnswer: "Augmented Reality (AR): overlays digital information/elements on a real-world scene, with the real world still visible. Virtual Reality (VR): places the user inside a fully computer-generated environment that replaces the real world. Difference: AR augments reality with digital additions, while VR replaces it with a complete virtual environment."
    },
    {
      text: "What is the difference between a classical bit and a qubit? And is quantum computing a general replacement for all traditional computers? Explain your answer.",
      referenceAnswer: "A classical bit holds one state at a time (either 0 or 1). A qubit uses the principle of superposition (a combination of 0 and 1 at once). No — quantum computing is not a general replacement for all traditional computers; it is a different approach that may offer an advantage only for certain classes of problems and does not speed up all types of computations."
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
      text: "What is the name of the early electronic computer mentioned in the 1940s–60s stage?",
      options: ["iPhone", "ENIAC", "Apple M1 Ultra", "Intel 4004"],
      correct: 1
    },
    {
      text: "Which electronic component was used in the first electronic computers?",
      options: ["Fine transistors", "Multi-core processors", "Vacuum tubes", "Qubits"],
      correct: 2
    },
    {
      text: "A company allows its employees to do their tasks from home using the Internet. This is an example of:",
      options: ["E-commerce", "Remote work", "Online learning", "Cashless payment"],
      correct: 1
    },
    {
      text: "A person pays for purchases by scanning a QR code with their phone. This is an example of:",
      options: ["Cashless payment", "Cloud computing", "Augmented reality", "Autonomous driving"],
      correct: 0
    },
    {
      text: "The technology that places the user inside a fully computer-generated virtual environment is:",
      options: ["Edge computing", "Augmented reality", "Quantum computing", "Virtual reality"],
      correct: 3
    },
    {
      text: "Edge computing means:",
      options: ["Processing data on the device itself instantly instead of sending it to the cloud", "Always storing all data in the cloud", "Selling goods and services over the Internet", "Doubling the number of transistors every two years"],
      correct: 0
    },
    {
      text: "In a self-driving car, some data is processed locally with edge computing mainly in order to:",
      options: ["Save storage space in the cloud", "Lower the cost of the Internet subscription", "Increase the number of cameras in the vehicle", "Reduce response time to improve safety"],
      correct: 3
    },
    {
      text: "Complete: A classical bit holds ......... , while a qubit uses ......... .",
      options: ["two states together / one state", "a QR code / a bank card", "a vacuum tube / a transistor", "one state at a time / the principle of superposition"],
      correct: 3
    },
    {
      text: "Which of the following is true about quantum computing?",
      options: ["It is a general replacement for all traditional computers", "It speeds up all types of computations without exception", "It may offer an advantage only for certain classes of problems", "It is used mainly for cashless payment"],
      correct: 2
    },
    {
      text: "The technology that describes buying and selling goods and services over the Internet (such as Amazon and eBay) is:",
      options: ["Social networking services", "E-commerce", "Cloud computing", "Remote work"],
      correct: 1
    },
    {
      text: "Cloud computing is defined as:",
      options: ["Information technology delivered as a service over the Internet", "Processing data only on the device itself", "A complete computer-generated virtual environment", "A network for sharing photos between friends"],
      correct: 0
    },
    {
      text: "A student attends a lesson in which classes and study materials are delivered over the Internet. This is an example of:",
      options: ["Online learning", "Augmented reality", "E-commerce", "Edge computing"],
      correct: 0
    },
    {
      text: "A service that allows users to connect and post and share content rapidly is called:",
      options: ["E-commerce", "Cashless payment", "Quantum computing", "Social networking services (SNS)"],
      correct: 3
    },
    {
      text: "Which of the following shows the correct chronological order of IT development?",
      options: [
        "Rise of smartphones -> Birth of the computer -> Cloud computing -> Commercialization of the Internet",
        "Birth of the computer -> Commercialization of the Internet -> Rise of smartphones -> Spread of cloud computing",
        "Commercialization of the Internet -> Birth of the computer -> Cloud computing -> Rise of smartphones",
        "Spread of cloud computing -> Smartphones -> Computer -> Internet"
      ],
      correct: 1
    },
    {
      text: "Besides shrinking transistors, processor performance can be improved by:",
      options: ["Sending all data to the cloud", "Using vacuum tubes again", "Parallel processing with multiple cores and specialized designs", "Removing edge computing"],
      correct: 2
    },
    {
      text: "Which of the following statements is NOT an appropriate description of an emerging technology?",
      options: [
        "Autonomous driving uses AI to help drive a vehicle",
        "Augmented reality overlays digital information on real-world images",
        "Virtual reality is a technology that dramatically improves a computer's processing speed",
        "Quantum computing is expected to speed up some computations that are difficult for traditional computers"
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
    { text: "Moore’s Law is an empirical observation stating that the number of transistors on an integrated circuit decreases approximately every two years.", isTrue: false },
    { text: "Moore’s Law is a fixed physical law that can never stop.", isTrue: false },
    { text: "E-commerce means buying goods at physical stores using cash.", isTrue: false },
    { text: "Edge computing processes data on the device itself instantly instead of always sending it to the cloud.", isTrue: true },
    { text: "Virtual Reality (VR) is a technology that adds digital elements to a real-world scene.", isTrue: false },
    { text: "Quantum computing speeds up all types of computations and is a general replacement for traditional computers.", isTrue: false },
    { text: "A qubit uses the principle of superposition, while a classical bit holds one state.", isTrue: true },
    { text: "The first electronic computers (including ENIAC) were used mainly for military and scientific computation.", isTrue: true },
    { text: "Social networking services are highly effective at spreading information rapidly.", isTrue: true },
    { text: "Cloud computing means processing data on the device itself without needing the Internet.", isTrue: false }
  ];

  for (const q of tfQuestions) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        type: QuestionType.TRUE_FALSE,
        text: q.text,
        points: 1,
        options: ["True", "False"],
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
      text: "Classify each example under the most appropriate category.",
      points: 5,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      matchOptions: [
        { left: "Sharing photos with friends on social networking services", right: "Changes in daily life" },
        { left: "A company introducing a work-from-home system", right: "Changes in industry and the economy" },
        { left: "Delivering lessons and study materials to students", right: "Changes in healthcare and education" }
      ]
    }
  });

  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      type: QuestionType.ESSAY,
      text: "From the previous classification question, choose ONE example and explain why it fits that category.",
      points: 5,
      correctOptionIndex: 0,
      version: QuizQuestionVersion.A,
      referenceAnswer: "Accept any logical explanation provided by the student for their chosen example. For example, if they chose 'Paying with a payment app on a smartphone', they can classify it as either (A) Changes in daily life or (B) Changes in industry and the economy, as long as a logical explanation is provided."
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
