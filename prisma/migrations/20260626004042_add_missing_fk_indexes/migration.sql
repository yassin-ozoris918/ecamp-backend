-- CreateIndex
CREATE INDEX "AIExtractionLog_instructorId_idx" ON "AIExtractionLog"("instructorId");

-- CreateIndex
CREATE INDEX "ActivationCodeHistory_actorId_idx" ON "ActivationCodeHistory"("actorId");

-- CreateIndex
CREATE INDEX "Certificate_courseId_idx" ON "Certificate"("courseId");

-- CreateIndex
CREATE INDEX "CourseInstructor_instructorId_idx" ON "CourseInstructor"("instructorId");

-- CreateIndex
CREATE INDEX "Exam_chapterId_idx" ON "Exam"("chapterId");

-- CreateIndex
CREATE INDEX "ExamQuestion_examId_idx" ON "ExamQuestion"("examId");

-- CreateIndex
CREATE INDEX "Lecture_chapterId_idx" ON "Lecture"("chapterId");

-- CreateIndex
CREATE INDEX "ParentNotificationLog_studentId_idx" ON "ParentNotificationLog"("studentId");

-- CreateIndex
CREATE INDEX "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");

-- CreateIndex
CREATE INDEX "SessionProgress_sessionId_idx" ON "SessionProgress"("sessionId");

-- CreateIndex
CREATE INDEX "StudentBadge_badgeId_idx" ON "StudentBadge"("badgeId");

-- CreateIndex
CREATE INDEX "StudentLectureAccess_lectureId_idx" ON "StudentLectureAccess"("lectureId");
