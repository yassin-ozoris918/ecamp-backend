-- Migrate points and score fields from Int to Float (Double Precision)
-- to support decimal marks like 0.5

-- QuizQuestion.points: Int -> Float
ALTER TABLE "QuizQuestion" ALTER COLUMN "points" TYPE DOUBLE PRECISION;

-- QuizAttempt.score: Int -> Float
ALTER TABLE "QuizAttempt" ALTER COLUMN "score" TYPE DOUBLE PRECISION;

-- QuizAttemptResponse.earnedPoints: Int? -> Float?
ALTER TABLE "QuizAttemptResponse" ALTER COLUMN "earnedPoints" TYPE DOUBLE PRECISION;

-- ExamQuestion.points: Int -> Float
ALTER TABLE "ExamQuestion" ALTER COLUMN "points" TYPE DOUBLE PRECISION;

-- ExamAttempt.score: Int? -> Float?
ALTER TABLE "ExamAttempt" ALTER COLUMN "score" TYPE DOUBLE PRECISION;

-- StudentExamResponse.earnedPoints: Int? -> Float?
ALTER TABLE "StudentExamResponse" ALTER COLUMN "earnedPoints" TYPE DOUBLE PRECISION;
