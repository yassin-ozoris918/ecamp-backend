-- CreateEnum
CREATE TYPE "LectureAccessSource" AS ENUM ('CODE', 'COURSE', 'FREE', 'ADMIN', 'DEMO');

-- AlterTable
ALTER TABLE "Lecture" ADD COLUMN     "requiresOwnCode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentLectureAccess" ADD COLUMN     "source" "LectureAccessSource" NOT NULL DEFAULT 'COURSE';

-- Backfill how each EXISTING lecture-access row was obtained (new rows always set it explicitly).
-- Order matters: the first rule that matches wins.
-- 1) Demo accounts
UPDATE "StudentLectureAccess" sla SET "source" = 'DEMO'
FROM "User" u WHERE u."id" = sla."studentId" AND u."isDemo" = true;

-- 2) The student redeemed a lecture code for this lecture
UPDATE "StudentLectureAccess" sla SET "source" = 'CODE'
WHERE sla."source" = 'COURSE'
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = sla."studentId" AND u."isDemo" = true)
  AND EXISTS (
    SELECT 1 FROM "ActivationCode" ac
    WHERE ac."studentId" = sla."studentId" AND ac."redeemedLectureId" = sla."lectureId" AND ac."status" = 'REDEEMED'
  );

-- 3) No code and no full-course access, but the course is free → started from the free course
UPDATE "StudentLectureAccess" sla SET "source" = 'FREE'
FROM "Lecture" l JOIN "Course" c ON c."id" = l."courseId"
WHERE l."id" = sla."lectureId" AND sla."source" = 'COURSE' AND c."isFree" = true
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = sla."studentId" AND u."isDemo" = true)
  AND NOT EXISTS (SELECT 1 FROM "StudentCourseAccess" ca WHERE ca."studentId" = sla."studentId" AND ca."courseId" = l."courseId");

-- 4) No code and no full-course access → it can only have been granted by an admin
UPDATE "StudentLectureAccess" sla SET "source" = 'ADMIN'
FROM "Lecture" l
WHERE l."id" = sla."lectureId" AND sla."source" = 'COURSE'
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = sla."studentId" AND u."isDemo" = true)
  AND NOT EXISTS (SELECT 1 FROM "StudentCourseAccess" ca WHERE ca."studentId" = sla."studentId" AND ca."courseId" = l."courseId")
  AND NOT EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = l."courseId" AND c."isFree" = true);
-- Everything else stays 'COURSE' (opened through full-course access).
