import { PrismaClient, QuestionType, QuizQuestionVersion } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2] || 'Concepts Questions Quiz (Test Yourself)';
  const customQuizTitle = process.argv[3] || 'Concepts Questions Quiz (Test Yourself)';

  if (!identifier) {
    console.error('Please provide a Quiz ID, Quiz Title, Lecture ID, or Lecture Title as an argument (in quotes).');
    console.error('Usage:');
    console.error('  npx ts-node seed-quiz-concepts.ts "<Quiz ID or Quiz Title>"');
    console.error('  npx ts-node seed-quiz-concepts.ts "<Lecture ID or Lecture Title>" "[Optional New Quiz Title]"');
    process.exit(1);
  }

  // 1. Try finding an existing Quiz by ID or Title
  let quiz = await prisma.quiz.findUnique({ where: { id: identifier } }).catch(() => null);

  if (!quiz) {
    quiz = await prisma.quiz.findFirst({
      where: {
        title: { equals: identifier, mode: 'insensitive' },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 2. If no Quiz found, check if identifier is a Lecture ID or Lecture Title and find/create the Quiz under it
  if (!quiz) {
    let lecture = await prisma.lecture.findUnique({ where: { id: identifier } }).catch(() => null);
    if (!lecture) {
      lecture = await prisma.lecture.findFirst({
        where: {
          title: { equals: identifier, mode: 'insensitive' },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (lecture) {
      quiz = await prisma.quiz.findFirst({
        where: {
          lectureId: lecture.id,
          title: { equals: customQuizTitle, mode: 'insensitive' },
          deletedAt: null,
        },
      });

      if (!quiz) {
        quiz = await prisma.quiz.create({
          data: {
            lectureId: lecture.id,
            title: customQuizTitle,
            description: '83 Multiple-Choice Concept Questions on AI, Machine Learning, and Deep Learning.',
            passGrade: 50,
            maxAttempts: 99,
            isPublished: true,
            isRevision: false,
          },
        });
        console.log(`Created new Quiz "${quiz.title}" (${quiz.id}) under Lecture "${lecture.title}" (${lecture.id}).`);
      }
    }
  }

  if (!quiz) {
    console.error(`No Quiz or Lecture found matching '${identifier}'.`);
    process.exit(1);
  }

  console.log(`Adding 83 MCQ questions to Quiz: ${quiz.title} (${quiz.id})`);

  // Idempotency: remove previously seeded version-A questions so re-running
  // the script does not create duplicates.
  const removed = await prisma.quizQuestion.deleteMany({
    where: { quizId: quiz.id, version: QuizQuestionVersion.A },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} previously seeded version-A question(s).`);
  }

  const mcqQuestions: { text: string; options: string[]; correct: number; points?: number }[] = [
    {
      // Question 1
      text: 'Which of the following is NOT another name for the empirical loss J(W) = (1/n) Σ L(f(x⁽ⁱ⁾; W), y⁽ⁱ⁾)?',
      options: [
        'Activation function',
        'Empirical risk',
        'Cost function',
        'Objective function',
      ],
      correct: 0,
    },
    {
      // Question 2
      text: 'A ReLU unit has f(z) = max(0, z). What are its outputs for z = −3 and z = 2?',
      options: [
        '3 and 2',
        '−3 and 2',
        '0 and 0',
        '0 and 2',
      ],
      correct: 3,
    },
    {
      // Question 3
      text: 'Which statement best describes how artificial intelligence (AI), machine learning (ML) and deep learning (DL) relate to one another?',
      options: [
        'ML is a subset of DL, and DL is a subset of AI.',
        'DL is a subset of ML, and ML is a subset of AI.',
        'AI is a subset of ML, and ML is a subset of DL.',
        'AI, ML and DL are three separate fields with no overlap.',
      ],
      correct: 1,
    },
    {
      // Question 4
      text: 'Which statement about supervised learning outputs is correct?',
      options: [
        'Classification produces a discrete output, whereas regression produces a continuous output.',
        'Classification produces a continuous output, whereas regression produces a discrete output.',
        'Regression predicts group memberships; classification predicts real values.',
        'Both classification and regression require unlabeled data.',
      ],
      correct: 0,
    },
    {
      // Question 5
      text: 'In W ← W − η ∂J(W)/∂W, what is η?',
      options: [
        'The number of epochs over the training set.',
        'The variance σ² of the random initialisation.',
        'The learning rate: it scales the step taken against the gradient.',
        'The batch size used for each update.',
      ],
      correct: 2,
    },
    {
      // Question 6
      text: 'Which gradient-descent variant uses a batch size equal to the whole training set?',
      options: [
        'Batch gradient descent',
        'Mini-batch gradient descent',
        'Adaptive gradient descent',
        'Stochastic gradient descent',
      ],
      correct: 0,
    },
    {
      // Question 7
      text: 'During training of a supervised feed-forward network, what is the purpose of the learning (backward) mode of operation?',
      options: [
        'To change the training labels so that they come to match the network output.',
        'To modify the weights so that the distance between the computed and the desired output is reduced.',
        'To increase the number of layers until the training accuracy finally reaches 100%.',
        'To present an input pattern and feed the signals forward to get the output units.',
      ],
      correct: 1,
    },
    {
      // Question 8
      text: 'Neural networks date back decades, yet their dominance is recent. Which of the following is NOT one of the reasons given for this recent dominance?',
      options: [
        'Larger datasets that are easier to collect and store.',
        'The discovery of a new learning rule that replaced backpropagation.',
        'Massively parallelisable hardware such as GPUs.',
        'Improved techniques, new models and software toolboxes.',
      ],
      correct: 1,
    },
    {
      // Question 9
      text: "Which of the following is listed among the course's applications of AI in telecommunications?",
      options: [
        'Optimal transmitter/receiver design',
        'Synthesising realistic faces with generative models',
        'Skin-cancer detection from images',
        'Sentiment classification of tweets',
      ],
      correct: 0,
    },
    {
      // Question 10
      text: 'In a deep network trained on face images, which sequence describes the learned features from low-level to high-level?',
      options: [
        'Lines and edges → eyes, nose and ears → facial structure',
        'Facial structure → eyes, nose and ears → lines and edges',
        'Eyes, nose and ears → lines and edges → facial structure',
        'Lines and edges → facial structure → eyes, nose and ears',
      ],
      correct: 0,
    },
    {
      // Question 11
      text: 'In the perceptron equation ŷ = g(b + Σ xᵢwᵢ), which description of the parts is correct?',
      options: [
        'Σ xᵢwᵢ is the non-linear activation, b is the final output, and g is the weighted sum of the inputs.',
        'Σ xᵢwᵢ is the linear combination of inputs, b is the bias, and g is the non-linear activation.',
        'b is a weight attached to the first input x₁, and g is the loss computed from the output ŷ.',
        'g is a linear combination of the inputs, and b is added to the output ŷ after g is applied.',
      ],
      correct: 1,
    },
    {
      // Question 12
      text: "In the supervised-learning formulation 'given a dataset (x, y), learn a function f that maps inputs to outputs', what is the role of the objective function?",
      options: [
        'It evaluates how good a candidate function f is.',
        'It fixes the number of layers of the network.',
        'It generates the labels y for the dataset.',
        'It stores the training examples for later use.',
      ],
      correct: 0,
    },
    {
      // Question 13
      text: 'Which ordering of milestones is chronologically correct?',
      options: [
        'AlphaGo defeats the Go champion (2016) → perceptron algorithm (1957) → backpropagation (re)discovered (1988)',
        'Backpropagation (re)discovered (1988) → perceptron algorithm (1957) → AlphaGo defeats the Go champion (2016)',
        'Perceptron algorithm (1957) → AlphaGo defeats the Go champion (2016) → backpropagation (re)discovered (1988)',
        'Perceptron algorithm (1957) → backpropagation (re)discovered (1988) → AlphaGo defeats the human Go champion (2016)',
      ],
      correct: 3,
    },
    {
      // Question 14
      text: 'According to the problem-type decision tree, which output activation is used for binary classification?',
      options: [
        'Softmax',
        'ReLU',
        'Sigmoid',
        'Linear',
      ],
      correct: 2,
    },
    {
      // Question 15
      text: "In the course's table of sequential-data tasks, which task takes an audio waveform as input and produces text?",
      options: [
        'Speech recognition',
        'Sentiment classification',
        'Time-series forecasting',
        'Image captioning',
      ],
      correct: 0,
    },
    {
      // Question 16
      text: 'Which hidden activation has outputs in the range (−1, +1) that are zero-centred?',
      options: [
        'ReLU',
        'Sigmoid',
        'tanh',
        'Softmax',
      ],
      correct: 2,
    },
    {
      // Question 17
      text: "In the loss-surface figure the gradient arrow at the starting point points uphill, yet gradient descent 'takes a small step in the opposite direction of the gradient'. Why?",
      options: [
        'The gradient gives the direction of fastest increase of the loss, so the opposite direction lowers it fastest.',
        'The gradient only measures the size of the error and carries no direction information.',
        'The gradient points toward the minimum, so a step against it would overshoot the minimum.',
        'Stepping against the gradient keeps all the weights positive during training.',
      ],
      correct: 0,
    },
    {
      // Question 18
      text: 'A sigmoid neuron in a hidden layer receives pre-activation values of z ≈ +10 for most samples. What is the likely effect on learning?',
      options: [
        "The neuron's output is zero-centred, so training speeds up considerably.",
        "The neuron's output is exactly 1 and its gradient is exactly 1, so learning speeds up.",
        "The neuron's output becomes negative, which causes the weights to explode quickly.",
        'The neuron is saturated, so its derivative is almost 0 and the gradients passing through it are killed.',
      ],
      correct: 3,
    },
    {
      // Question 19
      text: 'A baby tries to cross a room to a couch. Falling hurts (failure); reaching the couch makes everyone happy (success). Which learning paradigm does this illustrate, and how does it differ from supervised learning?',
      options: [
        'Reinforcement learning: it improves from the outcomes of its own attempts, not from labelled examples.',
        'Supervised learning: a supervisor labels every step the baby takes with the correct action.',
        'Supervised regression: the baby predicts a continuous output from fixed input features.',
        'Unsupervised learning: the baby groups similar movements together without any feedback.',
      ],
      correct: 0,
    },
    {
      // Question 20
      text: 'A sigmoid perceptron has W = [3 −2] and b = 1, so its decision boundary is 1 + 3x₁ − 2x₂ = 0. The bias is changed to b = 4 with W unchanged. Which statement is correct?',
      options: [
        'The perceptron now outputs exactly 0.5 for every input, whatever x₁ and x₂ are.',
        'The boundary rotates around the origin because the bias changes its slope.',
        'The boundary stays parallel to the original line but moves; the weights fix its orientation.',
        'The boundary is unchanged; the bias only rescales the output value of the neuron.',
      ],
      correct: 2,
    },
    {
      // Question 21
      text: 'A team must classify images. They have a very large dataset and GPU servers, but little domain knowledge about which image features are informative. Why is deep learning favoured over classical ML here?',
      options: [
        'Classical ML cannot perform classification at all; only deep learning can classify, whatever the data size.',
        'It needs no feature engineering and also trains well on tiny datasets using ordinary hardware.',
        'It learns features directly from the data, so little manual feature engineering is needed, and it excels with large data.',
        'Hand-engineered features are robust and scalable, so deep learning is used only to replace the final classifier.',
      ],
      correct: 2,
    },
    {
      // Question 22
      text: 'A scatter plot has green points surrounded by red points in a curved, irregular pattern. A network has 50 hidden layers but every activation function is linear. What decision boundary can it produce?',
      options: [
        'No boundary at all, since every output becomes identical after so many linear layers.',
        'Several disconnected lines, one for each hidden layer that is added to the network.',
        'An arbitrarily complex curve, because the depth gives enough capacity.',
        'A single straight line, since linear activations give linear decisions whatever the network size.',
      ],
      correct: 3,
    },
    {
      // Question 23
      text: 'Learning-rate schedules are one remedy for the difficulty of choosing a learning rate. Which description matches the course?',
      options: [
        'They fix the learning rate to whichever value gives the lowest loss at the first iteration only.',
        'They increase the learning rate every epoch until the loss reaches exactly zero or training stops.',
        "They reduce the learning rate during training, by a schedule or when the objective's change falls below a threshold.",
        'They assign a different learning rate to each parameter using its gradient history during training.',
      ],
      correct: 2,
    },
    {
      // Question 24
      text: "A network must predict a worker's savings in dollars (a continuous real number) from income and minimum wage. Which output activation and loss pair is appropriate?",
      options: [
        'Softmax output activation with cross-entropy loss',
        'Sigmoid output activation with cross-entropy loss',
        'Sigmoid output activation with mean squared error loss',
        'Linear output activation with mean squared error loss',
      ],
      correct: 3,
    },
    {
      // Question 25
      text: 'In the Adam equations, which quantity is an exponentially weighted moving average of the squared gradients?',
      options: [
        'θₜ₊₁ = θₜ − η m̂ₜ/(√v̂ₜ + ε)',
        'm̂ₜ = mₜ/(1 − β₁ᵗ)',
        'mₜ = β₁mₜ₋₁ + (1 − β₁)gₜ',
        'vₜ = β₂vₜ₋₁ + (1 − β₂)gₜ²',
      ],
      correct: 3,
    },
    {
      // Question 26
      text: 'A perceptron with W = [1 1] and a step activation (output 1 if z ≥ 0, else 0) must implement the AND gate. Which bias works?',
      options: [
        'b = −2.5',
        'b = −0.5',
        'b = −1.5',
        'b = +0.5',
      ],
      correct: 2,
    },
    {
      // Question 27
      text: 'Which hidden-layer activation requires no exponential computation and does not shrink the gradient for positive inputs?',
      options: [
        'Sigmoid',
        'ELU',
        'Tanh',
        'ReLU',
      ],
      correct: 3,
    },
    {
      // Question 28
      text: 'Which order matches the gradient-descent algorithm given in the course?',
      options: [
        'Initialise the weights randomly; update the weights; loop until the gradient is positive; return the loss.',
        'Initialise all weights to the loss value; update the weights; compute the gradient; return the gradient.',
        'Initialise the weights randomly; loop until convergence: compute the gradient, update the weights; then return the weights.',
        'Compute the gradient; initialise the weights; update the weights; return the weights without looping.',
      ],
      correct: 2,
    },
    {
      // Question 29
      text: 'How does the course contrast a traditional ML pipeline with a deep-learning pipeline for recognising a car?',
      options: [
        'DL replaces the input image by its label before any processing takes place in the network.',
        'ML learns features automatically, whereas DL requires separate hand-crafted feature extraction.',
        'Both pipelines use only a classification stage, and neither of them extracts any features.',
        'ML has a separate feature-extraction step before classification; DL does feature extraction and classification together.',
      ],
      correct: 3,
    },
    {
      // Question 30
      text: 'A mail provider builds a spam filter. Spammers keep changing their wording, so hand-written rules that worked last month stop working. Which property of the machine-learning approach makes it suitable here?',
      options: [
        'The algorithm learns its behaviour from data or experience, so it can adapt as the environment changes.',
        'ML removes the need for data because the correct behaviour is derived analytically from known equations.',
        'The programmer writes every spam rule once, and the program then adapts to new wording on its own.',
        'ML guarantees the system can never outperform the human programmers who designed it.',
      ],
      correct: 0,
    },
    {
      // Question 31
      text: "Three tasks are given. (i) Predict a worker's savings in dollars from income and minimum wage. (ii) Split patients into K groups using only blood pressure, heart rate and glucose level, with no labels available. (iii) Decide play / no play from outlook, temperature, humidity and windy using 14 labelled days. Which assignment of learning type is correct?",
      options: [
        '(i) supervised regression, (ii) supervised classification, (iii) reinforcement learning',
        '(i) unsupervised clustering, (ii) supervised regression, (iii) supervised classification',
        '(i) supervised classification, (ii) supervised regression, (iii) unsupervised clustering',
        '(i) supervised regression, (ii) unsupervised clustering, (iii) supervised classification',
      ],
      correct: 3,
    },
    {
      // Question 32
      text: 'Which sequence correctly describes the training procedure of a feed-forward network?',
      options: [
        'Optimizer update → forward pass → backward pass → compute loss; repeat until the weights are zero.',
        'Forward pass → loss → backward pass (gradients) → optimizer update; repeat for each epoch.',
        'Compute loss → forward pass → optimizer update → backward pass; repeat once.',
        'Backward pass → forward pass → compute loss → optimizer update; repeat once per sample only.',
      ],
      correct: 1,
    },
    {
      // Question 33
      text: "A civil engineer wants the deflection of a beam with known geometry and material, for which an exact formula exists, and also has plenty of measurement data. Which question from the 'Should I use ML on this problem?' checklist, answered 'yes', argues most directly AGAINST using ML?",
      options: [
        'Do I have data?',
        'Is there a pattern to detect?',
        'Can I solve it analytically?',
        'Can I gather and organise the data?',
      ],
      correct: 2,
    },
    {
      // Question 34
      text: 'A network classifies chest X-rays into exactly one of 5 mutually exclusive classes and must output a probability distribution over the classes. Which output activation is appropriate?',
      options: [
        'ReLU',
        'Linear (identity)',
        'Softmax',
        'Sigmoid on each output neuron',
      ],
      correct: 2,
    },
    {
      // Question 35
      text: 'In the loss-surface figure J(w₀, w₁), what does a single point on the surface represent?',
      options: [
        'The output ŷ of the network for one particular input sample of the training set.',
        'The value of the loss obtained for one particular setting of the weights, with the training data fixed.',
        'The value of the loss obtained for one particular input sample, with the weights fixed.',
        'The best weights found by training so far, i.e. the global minimum of the surface.',
      ],
      correct: 1,
    },
    {
      // Question 36
      text: 'Which of the following is NOT listed in the course as something an adaptive learning rate can depend on?',
      options: [
        'The number of hidden layers in the network',
        'The size of particular weights',
        'How fast learning is happening',
        'How large the gradient is',
      ],
      correct: 0,
    },
    {
      // Question 37
      text: 'Which statement about mini-batch gradient descent is INCORRECT?',
      options: [
        'It can make use of highly optimised matrix operations.',
        'Common mini-batch sizes range between about 50 and 256.',
        'It is typically the algorithm of choice for training neural networks.',
        'It increases the variance of the parameter updates compared with SGD.',
      ],
      correct: 3,
    },
    {
      // Question 38
      text: 'Which statement correctly characterises ELU, SELU and Leaky ReLU as presented in the course?',
      options: [
        'Leaky ReLU gives zero-mean outputs and negative saturation; SELU requires BatchNorm for deep networks.',
        'SELU is a scaled ELU with a self-normalising property that can train deep networks without BatchNorm; ELU needs exp().',
        'ELU outputs are always far from zero mean, which makes it faster than ReLU; SELU is a ReLU with a fixed slope.',
        'ELU is a scaled SELU with a self-normalising property; Leaky ReLU needs exp().',
      ],
      correct: 1,
    },
    {
      // Question 39
      text: 'In W* = argmin_W J(W) with W = {W⁽⁰⁾, W⁽¹⁾, …}, what does W* represent?',
      options: [
        'The input vector x that minimises the loss.',
        'The weights that maximise the average loss over the entire training data set.',
        "The set of all layers' weights that gives the lowest average loss over the training data.",
        'Only the output-layer weights that minimise the loss on one sample.',
      ],
      correct: 2,
    },
    {
      // Question 40
      text: 'Which statement correctly compares tanh with sigmoid as a hidden-layer activation?',
      options: [
        'Tanh is zero-centred in (−1, 1) with a steeper gradient, but it can still saturate and vanish the gradients.',
        'Tanh outputs are not zero-centred, but tanh avoids exponentials in its definition.',
        'Tanh outputs lie in (0, 1) like sigmoid, and tanh never saturates for any input value.',
        'Tanh has a maximum derivative of 0.25, so it always learns more slowly than sigmoid.',
      ],
      correct: 0,
    },
    {
      // Question 41
      text: 'In the update rule W ← W − η ∂J(W)/∂W, a weight is w = 2, the gradient is ∂J/∂w = +4 and η = 0.1. What is the new weight, and in which direction does the weight move?',
      options: [
        'w = 0.4; the weight decreases by the full gradient value.',
        'w = 2.4; the weight increases because the gradient is positive.',
        'w = 1.96; the weight decreases by η² times the gradient.',
        'w = 1.6; the weight decreases because the loss grows with w at this point.',
      ],
      correct: 3,
    },
    {
      // Question 42
      text: 'A practitioner has chosen a model, loss and regularization and has run the optimization. According to the ML workflow shown in the course, what is the next step?',
      options: [
        'Establishing a baseline',
        'Hyperparameter search',
        'Gathering and organizing data',
        'Analyzing performance and mistakes',
      ],
      correct: 1,
    },
    {
      // Question 43
      text: "Which assignment of algorithm to learning paradigm agrees with the course's overview of known ML algorithms?",
      options: [
        'K-means – supervised; K-Nearest Neighbor – unsupervised; Deep Q-Net – reinforcement learning',
        'Support vector machine – reinforcement learning; K-means – unsupervised; Linear regression – supervised',
        'K-means – unsupervised; Support vector machine – supervised; Deep Q-Net – reinforcement learning',
        'Random forest – unsupervised; EM – unsupervised; Deep Q-Net – supervised',
      ],
      correct: 2,
    },
    {
      // Question 44
      text: 'In the multi-output (dense) layer formula zᵢ = w₀,ᵢ + Σⱼ xⱼ wⱼ,ᵢ, what is the correct expression for z₂ in a layer with three inputs x₁, x₂, x₃?',
      options: [
        'z₂ = w₀,₂ + x₂(w₁,₂ + w₂,₂ + w₃,₂)',
        'z₂ = w₀,₂ + x₁w₁,₂ + x₂w₂,₂ + x₃w₃,₂',
        'z₂ = w₀,₁ + x₁w₁,₁ + x₂w₂,₁ + x₃w₃,₁',
        'z₂ = w₀,₂ + x₁w₂,₁ + x₂w₂,₂ + x₃w₂,₃',
      ],
      correct: 1,
    },
    {
      // Question 45
      text: "A student studies the 'play / no play' table (14 rows; columns outlook, temp, humidity, windy and play). Which of the student's statements is INCORRECT?",
      options: [
        'There are 4 training samples, one for each input feature.',
        'The number of training samples equals the number of rows of the table.',
        'The task is a binary classification problem because the output has two classes.',
        'A function f must be found that maps the feature vector (outlook, temp, humidity, windy) to the label.',
      ],
      correct: 0,
    },
    {
      // Question 46
      text: 'A maxout unit computes max(w₁ᵀx + b₁, w₂ᵀx + b₂). With w₁ = [1, 2], b₁ = 0, w₂ = [−1, 1], b₂ = 3 and x = [2, 1]ᵀ, what is its output?',
      options: [
        '2',
        '5',
        '7',
        '4',
      ],
      correct: 3,
    },
    {
      // Question 47
      text: 'In the XOR worked example the loss uses n = 1 and the weights are updated after each single training case, e.g. (0,0) first and then (0,1). Which gradient-descent variant does this correspond to?',
      options: [
        'Stochastic gradient descent (batch size 1)',
        'Adaptive learning-rate descent',
        'Mini-batch gradient descent with n = 100',
        'Batch gradient descent',
      ],
      correct: 0,
    },
    {
      // Question 48
      text: 'For a chain x → z₁ → ŷ → J(W), where z₁ depends on w₁ and ŷ depends on z₁ and w₂, which expression gives the gradient of the loss with respect to w₁?',
      options: [
        '∂J/∂w₁ = (∂J/∂ŷ)(∂ŷ/∂z₁)(∂z₁/∂w₁)',
        '∂J/∂w₁ = (∂J/∂w₂)(∂w₂/∂z₁)(∂z₁/∂w₁)',
        '∂J/∂w₁ = (∂J/∂ŷ)(∂ŷ/∂w₁)',
        '∂J/∂w₁ = (∂ŷ/∂z₁)(∂z₁/∂w₁), with no dependence on the loss',
      ],
      correct: 0,
    },
    {
      // Question 49
      text: 'A two-layer network has 3 inputs, one hidden layer of 4 neurons and 1 output neuron; every neuron has a bias, and the layer notation Ŷ⁽ᵏ⁾ = g(W⁽ᵏ⁾y⁽ᵏ⁻¹⁾ + b⁽ᵏ⁾) is used. Which option gives the correct shapes and number of trainable parameters?',
      options: [
        'W⁽¹⁾ is 4×3, W⁽²⁾ is 1×4; 20 parameters.',
        'W⁽¹⁾ is 4×3, W⁽²⁾ is 1×4; 16 parameters.',
        'W⁽¹⁾ is 3×4, W⁽²⁾ is 4×1; 21 parameters.',
        'W⁽¹⁾ is 4×3, W⁽²⁾ is 1×4; 21 parameters.',
      ],
      correct: 3,
    },
    {
      // Question 50
      text: 'Which statement about the choice of activation function is consistent with the lectures?',
      options: [
        'It is determined uniquely by the size of the data set being used.',
        'It is a parameter that is learned by backpropagation together with the weights and biases.',
        'It is a hyperparameter that depends on purpose, complexity, vanishing gradients and non-linearity.',
        'It must be the very same function in all layers of the same network.',
      ],
      correct: 2,
    },
    {
      // Question 51
      text: 'How does the Adam update θₜ₊₁ = θₜ − η m̂ₜ/(√v̂ₜ + ε) differ from the plain SGD update θₜ₊₁ = θₜ − η gₜ?',
      options: [
        'Adam uses a fixed step η for all parameters, while SGD adapts its step using gradient history.',
        'Adam scales each step by running gradient statistics (m̂ₜ, √v̂ₜ), so steps vary per parameter; SGD uses η × gradient.',
        'Adam ignores the gradient entirely and uses only the learning rate η at every step.',
        'Adam and SGD are identical updates whenever the same learning rate η is used for both.',
      ],
      correct: 1,
    },
    {
      // Question 52
      text: 'A training set has 2,400 samples. How many weight updates are made over 3 epochs by (stochastic GD, mini-batch GD with batch size 100, batch GD), respectively?',
      options: [
        '7,200; 7,200; 3',
        '3; 72; 7,200',
        '2,400; 24; 1',
        '7,200; 72; 3',
      ],
      correct: 3,
    },
    {
      // Question 53
      text: 'The course plots training cost versus iterations for AdaGrad, RMSProp, SGDNesterov, AdaDelta and Adam on an MNIST multilayer network with dropout. Which conclusion is supported by that figure?',
      options: [
        'All optimizers reach the same training cost after 200 passes.',
        'In this experiment Adam reaches the lowest training cost by the end of the 200 passes.',
        'AdaGrad reaches the lowest training cost in this experiment.',
        'Adam gives the highest test accuracy of all the optimizers.',
      ],
      correct: 1,
    },
    {
      // Question 54
      text: 'In the Adam equations mₜ = β₁mₜ₋₁ + (1 − β₁)gₜ and m̂ₜ = mₜ/(1 − β₁ᵗ), what is m̂ₜ if β₁ = 0?',
      options: [
        'm̂ₜ = 0',
        'm̂ₜ is undefined because of division by zero',
        'm̂ₜ = mₜ₋₁',
        'm̂ₜ = gₜ, the current gradient',
      ],
      correct: 3,
    },
    {
      // Question 55
      text: 'Three samples have actual savings 450, 850, 100 and network predictions 50, 100, 100. Using J(W) = (1/n) Σ (y⁽ⁱ⁾ − ŷ⁽ⁱ⁾)², what is the loss?',
      options: [
        '≈ 383',
        '≈ 240,833',
        '722,500',
        '361,250',
      ],
      correct: 1,
    },
    {
      // Question 56
      text: 'A student predicts worker savings (dollars) using a sigmoid output neuron with cross-entropy loss, and the loss stagnates. Which diagnosis is most appropriate?',
      options: [
        'A softmax output would fix it, since savings values are mutually exclusive classes.',
        'The network is too shallow, and adding more layers alone would solve the mismatch.',
        'Output activation and loss do not fit the task: regression needs a linear output with MSE, not a bounded sigmoid.',
        'Cross-entropy is the correct loss for any task, so only the learning rate must be wrong.',
      ],
      correct: 2,
    },
    {
      // Question 57
      text: 'Three gradient-descent runs on the same 1-D loss curve are observed. Run A: after 84 iterations it has barely moved from the initial guess. Run B: after 5 iterations its successive points jump back and forth across the valley, ending farther away. Run C: after 7 iterations it is at the global minimum. Which classification of the learning rates is correct?',
      options: [
        'A: too small, B: too large, C: stable',
        'A: too large, B: too small, C: stable',
        'A: too small, B: stable, C: too large',
        'A: stable, B: too large, C: too small',
      ],
      correct: 0,
    },
    {
      // Question 58
      text: 'An XOR network has a hidden neuron with bias −0.3 and input weights 0.21 and 0.15, a second hidden neuron with bias 0.25 and input weights −0.4 and 0.1, and an output neuron with bias −0.4 and weights −0.2 and 0.3 from the first and second hidden neurons. All use the sigmoid. For the training case (0,0) with target 0, which is the squared-error loss J (n = 1, J = (y − ŷ)²)?',
      options: [
        '≈ 0.34',
        '≈ 0.18',
        '≈ 0.42',
        '≈ 0.09',
      ],
      correct: 1,
    },
    {
      // Question 59
      text: 'Gradient descent is started twice from two different random initial weight settings on a non-convex loss surface with a local and a global minimum, as in the course figure. Which statement is most accurate?',
      options: [
        'Both runs always stop at exactly the same point, since the update rule itself is deterministic.',
        'Both runs always reach the global minimum, since the gradient always points straight toward it.',
        'The runs can end in different minima, because the start point decides which basin the descent falls into.',
        'The runs never converge, because the surface has more than one minimum in total.',
      ],
      correct: 2,
    },
    {
      // Question 60
      text: 'The inputs to a 3-way softmax are z = (2, 1, 0). Which output vector is correct (approximately)?',
      options: [
        '(0.881, 0.731, 0.500)',
        '(0.667, 0.333, 0.000)',
        '(0.333, 0.333, 0.333)',
        '(0.665, 0.245, 0.090)',
      ],
      correct: 3,
    },
    {
      // Question 61
      text: 'A binary classifier with sigmoid output gives f(x) = 0.1, 0.8, 0.6 for three samples whose labels are y = 1, 0, 1. With rounding to {0,1}, which samples are wrong, and which sample has the largest cross-entropy term −[y log f + (1−y) log(1−f)]?',
      options: [
        'Samples 1 and 2 are wrong; sample 1 has the largest cross-entropy term.',
        'Samples 1 and 2 are wrong; sample 2 has the largest cross-entropy term.',
        'Only sample 1 is wrong; sample 1 has the largest cross-entropy term.',
        'Samples 1 and 3 are wrong; sample 3 has the largest cross-entropy term.',
      ],
      correct: 0,
    },
    {
      // Question 62
      text: 'A 4-class problem (one correct class per input) uses sigmoid output neurons and outputs (0.95, 0.85, 0.12, 0.62) for one input. Why is this output unsuitable as class probabilities?',
      options: [
        'The vector sums to exactly 1, but its entries are not sorted in descending order.',
        'Independent sigmoids need not sum to 1 (here 2.54), so it is not a probability distribution.',
        'The values are too large, because a probability may not exceed 0.5 in a 4-class problem.',
        'Sigmoid outputs can be negative, so the vector cannot be a probability vector.',
      ],
      correct: 1,
    },
    {
      // Question 63
      text: 'In backpropagation, which statement about the roles of the backward pass and the optimizer is correct?',
      options: [
        'The backward pass computes the gradients; the optimizer uses them to update the parameters.',
        'Both compute the same gradients, and the optimizer then simply repeats the forward pass.',
        'The backward pass updates the weights directly; the optimizer only computes the loss value.',
        'The backward pass computes the loss value; the optimizer computes the gradients of the loss.',
      ],
      correct: 0,
    },
    {
      // Question 64
      text: 'For z = −2, which pair gives the correct outputs of ReLU and of ELU (default α = 1, f(x) = α(eˣ − 1) for x ≤ 0)?',
      options: [
        'ReLU = −2, ELU ≈ −0.865',
        'ReLU = 0, ELU ≈ 0.135',
        'ReLU = 0, ELU = −2',
        'ReLU = 0, ELU ≈ −0.865',
      ],
      correct: 3,
    },
    {
      // Question 65
      text: 'During training with batch size 1 the loss curve fluctuates heavily. Which change reduces the fluctuations while still allowing efficient matrix operations?',
      options: [
        'Use the whole dataset per update, since it also supports online updates.',
        'Increase the update frequency further by splitting each sample.',
        'Use mini-batches (for example 50–256 samples) per update.',
        'Keep batch size 1 and remove the bias terms.',
      ],
      correct: 2,
    },
    {
      // Question 66
      text: 'A data set is sparse and its features occur with very different frequencies. Which limitation of a single fixed learning rate does this expose?',
      options: [
        'The same rate is applied to every parameter, while rarely occurring features may deserve larger updates.',
        'A fixed rate makes the loss function non-differentiable for the rare features in the data.',
        'A fixed rate can only be used with batch gradient descent, not with sparse data.',
        'A fixed rate forces the use of mini-batches smaller than 50 samples for such features.',
      ],
      correct: 0,
    },
    {
      // Question 67
      text: 'Using the derivative plot, a ReLU hidden neuron has z < 0 for every training sample. What happens to the weights feeding that neuron?',
      options: [
        'Its derivative equals 0.25, exactly the same as sigmoid at its peak value.',
        'Its output and derivative are 0, so no gradient flows and its weights stop changing (a dead node).',
        'Its output is negative, so it acts as a negative-saturating unit in the layer.',
        'Its derivative is 1, so its weights change faster than those of the other neurons.',
      ],
      correct: 1,
    },
    {
      // Question 68
      text: 'In the two-layer XOR network, the hidden layer maps (0,0)→(0,0), (0,1)→(1,0), (1,0)→(1,0) and (1,1)→(1,1). The output neuron computes step(y₁ − 2y₂ − 0.5). What are the outputs for inputs (0,0), (0,1), (1,0), (1,1), and why does this work?',
      options: [
        '0, 1, 1, 0: both class-A inputs map to the same point (1,0), which one line separates from (0,0) and (1,1).',
        '0, 1, 1, 1: the output neuron behaves as an OR gate on the original inputs.',
        '0, 1, 1, 0: but only because the hidden layer already outputs the XOR result.',
        '0, 0, 0, 1: the output neuron behaves as an AND gate on the transformed data.',
      ],
      correct: 0,
    },
    {
      // Question 69
      text: 'A student trains a single perceptron on the XOR data and never exceeds 75% accuracy, however long it is trained. Which explanation is correct?',
      options: [
        'The step activation is the problem; replacing it with a sigmoid would give a linear separator for XOR.',
        'No single line separates the two XOR classes, so one perceptron cannot classify all four points correctly.',
        'XOR has too few samples (only 4) to train any model.',
        'The learning rate must be too small; a larger one would reach 100%.',
      ],
      correct: 1,
    },
    {
      // Question 70
      text: 'A model must be updated on-the-fly as new examples stream in, and the whole dataset does not fit in memory. Which gradient-descent variant is clearly unsuitable?',
      options: [
        'Gradient descent with a learning-rate schedule',
        'Stochastic gradient descent',
        'Mini-batch gradient descent with n = 100',
        'Batch gradient descent',
      ],
      correct: 3,
    },
    {
      // Question 71
      text: 'An AND-gate perceptron (z = x₁ + x₂ − 1.5, step activation) and an OR-gate perceptron (z = x₁ + x₂ − 0.5, step activation) are both applied to the XOR truth table. What accuracies do they achieve, respectively?',
      options: [
        '100% and 100%',
        '50% and 50%',
        '25% and 75%',
        '75% and 25%',
      ],
      correct: 2,
    },
    {
      // Question 72
      text: 'A sigmoid perceptron computes ŷ = σ(1 + 3x₁ − 2x₂). Consider P = (1, 2), Q = (0, 1) and R = (2, 0). Which statement is correct?',
      options: [
        'P gives ŷ = 0, because it lies on the boundary; Q gives ŷ ≈ 0.27; R gives ŷ ≈ 0.999.',
        'P lies on the decision boundary and gives ŷ = 0.5; Q gives ŷ ≈ 0.27 (< 0.5); R gives ŷ ≈ 0.999 (> 0.5).',
        'P gives ŷ = 0.5; Q gives ŷ ≈ 0.73 (> 0.5); R gives ŷ ≈ 0.001 (< 0.5).',
        'P gives ŷ = 1 because it lies on the boundary; Q gives ŷ ≈ 0.27; R gives ŷ = 0.5 exactly.',
      ],
      correct: 1,
    },
    {
      // Question 73
      text: 'Why is cross-entropy loss, −(1/n) Σ [y log f(x) + (1−y) log(1−f(x))], paired with a sigmoid output neuron for binary classification?',
      options: [
        'Sigmoid guarantees f ≥ 1, which keeps the logarithms positive.',
        'The logarithms need 0 < f < 1, which the sigmoid output guarantees as a probability.',
        'Cross-entropy is used for regression, and sigmoid makes regression outputs continuous.',
        'A linear output keeps f in (0,1) automatically, so the sigmoid is only optional.',
      ],
      correct: 1,
    },
    {
      // Question 74
      text: 'The AND perceptron z = x₁ + x₂ − 1.5 is modified: the step function is replaced by a sigmoid and a 0.5 threshold is used for the decision. For the inputs (0,0), (0,1), (1,0), (1,1), which outputs and accuracy result?',
      options: [
        'Outputs ≈ 0.82, 0.62, 0.62, 0.38; accuracy falls to 0%.',
        'Outputs ≈ 0.18, 0.38, 0.38, 0.62; accuracy falls to 75% since 0.38 is not 0.',
        'Outputs ≈ 0.18, 0.38, 0.38, 0.62; accuracy stays 100%.',
        'Outputs 0, 0, 0, 1; accuracy stays 100% because sigmoid is identical to a step.',
      ],
      correct: 2,
    },
    {
      // Question 75
      text: 'Using the derivative plots, how are the derivatives of ReLU, sigmoid and tanh ordered at x = 4, from largest to smallest?',
      options: [
        'sigmoid > tanh > ReLU',
        'tanh > sigmoid > ReLU',
        'ReLU (= 1) > sigmoid (≈ 0.02) > tanh (≈ 0.001)',
        'ReLU > tanh > sigmoid',
      ],
      correct: 2,
    },
    {
      // Question 76
      text: 'A hidden layer uses ReLU and the output neuron uses a linear (identity) activation, as for a regression output. Hidden layer: W⁽¹⁾ = [[1, 2],[0, −1]], b⁽¹⁾ = [1, 0]ᵀ. Output: W⁽²⁾ = [1 3], b⁽²⁾ = −2. For x = [2, 1]ᵀ, what is the network output?',
      options: [
        '3',
        '0',
        '6',
        '−2',
      ],
      correct: 0,
    },
    {
      // Question 77
      text: 'Two layers with identity (linear) activations are defined by W⁽¹⁾ = [[1, 2],[3, −1]], b⁽¹⁾ = [0, 1]ᵀ, W⁽²⁾ = [2 1], b⁽²⁾ = −1. Which single-layer model gives exactly the same output for every input x?',
      options: [
        'W = [2 1], b = −1',
        'W = [5 3], b = 0',
        'W = [3 4], b = 1',
        'W = [5 3], b = −1',
      ],
      correct: 1,
    },
    {
      // Question 78
      text: 'For strongly negative pre-activation (z = −5), which statement about ReLU, Leaky ReLU (max(αx, x) with small α > 0) and ELU (α(eˣ − 1)) is correct?',
      options: [
        'ReLU and Leaky ReLU both have a gradient of 0, while ELU has a gradient of exactly 1.',
        "ReLU's gradient is α; Leaky ReLU's gradient is 0; ELU's output saturates near +α.",
        'All three activations have a gradient of exactly 1 for every negative input value.',
        "ReLU's gradient is 0; Leaky ReLU's is a small constant α; ELU saturates near −α with a tiny gradient.",
      ],
      correct: 3,
    },
    {
      // Question 79
      text: 'In the XOR worked example the training case (0,0) gives zero weight changes for all input-to-hidden weights, yet the hidden-neuron biases and output weights change. Why?',
      options: [
        'The input-to-hidden weights are not part of W, so backpropagation never updates them at all.',
        "A weight's gradient is proportional to its input (∂z/∂w = input); here the inputs are 0, while the bias input is 1.",
        'The learning rate becomes zero for any weight that is connected to a zero input.',
        'Those weights already equal their optimal values after the random initialisation step.',
      ],
      correct: 1,
    },
    {
      // Question 80
      text: "A colleague claims: 'ReLU always has a larger gradient than sigmoid and tanh.' Which response, based on the derivative plots, is correct?",
      options: [
        'True: the ReLU derivative equals 1 for every input value, positive or negative.',
        'False: the tanh derivative is larger than 1 near x = 0, so tanh is larger there.',
        'True: the sigmoid derivative is larger than the ReLU derivative for every x > 0.',
        "False: for x < 0 ReLU's derivative is 0, while sigmoid/tanh derivatives are small but positive.",
      ],
      correct: 3,
    },
    {
      // Question 81
      text: 'Considering only the activation-derivative factors in backpropagation, what is the largest possible product of these factors across 5 stacked sigmoid layers, and how does a 5-layer ReLU path (x > 0) compare?',
      options: [
        '≈ 0.25 for sigmoid versus 0.25 for ReLU',
        '≈ 0.001 for sigmoid versus ≈ 0.001 for ReLU',
        '≈ 0.001 (0.25⁵) for sigmoid versus 1 for ReLU',
        '≈ 1.25 for sigmoid versus 1 for ReLU',
      ],
      correct: 2,
    },
    {
      // Question 82
      text: 'A binary classifier with 8 hidden sigmoid layers and a sigmoid output trains very slowly: the weights of the earliest layers barely change. Which modification is most appropriate?',
      options: [
        'Use tanh in the hidden layers because the tanh derivative never shrinks.',
        'Replace the hidden sigmoids with ReLU (or a variant) and keep the sigmoid output for the binary decision.',
        'Replace the output sigmoid by a linear activation so that the output can no longer saturate.',
        'Use linear (identity) activations in the hidden layers, since their derivative is exactly 1.',
      ],
      correct: 1,
    },
    {
      // Question 83
      text: 'In backpropagation notation, for z₁ = g¹(W¹X + b¹) and ŷ = g²(W²z₁ + b²), the gradient ∂J/∂w₁ includes the factor ∂ŷ/∂z₁. Which statement about this factor is correct?',
      options: [
        'It is independent of W², because W² is only updated later in the training procedure.',
        'It contains only the input X, so the choice of activation function does not matter for it.',
        "It includes g²′ (the output activation's derivative) and W², so a saturating g² can shrink the gradient for w₁.",
        'It always equals exactly 1 for any activation function that might be chosen.',
      ],
      correct: 2,
    },
  ];

  await prisma.quizQuestion.createMany({
    data: mcqQuestions.map((q, idx) => ({
      quizId: quiz.id,
      type: QuestionType.MCQ,
      text: q.text,
      points: q.points ?? 1,
      options: q.options,
      correctOptionIndex: q.correct,
      version: QuizQuestionVersion.A,
      orderIndex: idx + 1,
    })),
  });

  console.log(`Successfully inserted ${mcqQuestions.length} MCQ questions (1 point each) into "${quiz.title}"!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

