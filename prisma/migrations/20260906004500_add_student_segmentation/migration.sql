-- CreateEnum
CREATE TYPE "HighSchoolSystem" AS ENUM ('TRADITIONAL', 'BACCALAUREATE');

-- CreateEnum
CREATE TYPE "StudyMode" AS ENUM ('ONLINE', 'CENTER');

-- CreateEnum
CREATE TYPE "StudyLanguage" AS ENUM ('ARABIC', 'ENGLISH');

-- CreateEnum
CREATE TYPE "HighSchoolGrade" AS ENUM ('GRADE_1', 'GRADE_2', 'GRADE_3');

-- CreateEnum
CREATE TYPE "TraditionalBranch" AS ENUM ('SCIENCE', 'SCIENCE_BIOLOGY', 'SCIENCE_MATH', 'LITERARY');

-- CreateEnum
CREATE TYPE "BaccalaureatePath" AS ENUM ('MEDICINE_AND_LIFE_SCIENCES', 'ENGINEERING_AND_COMPUTER_SCIENCE', 'BUSINESS', 'ARTS_AND_HUMANITIES');

-- AlterTable
ALTER TABLE "User" 
  ADD COLUMN "highSchoolSystem" "HighSchoolSystem",
  ADD COLUMN "studyMode" "StudyMode",
  ADD COLUMN "studyLanguage" "StudyLanguage",
  ADD COLUMN "highSchoolGrade" "HighSchoolGrade",
  ADD COLUMN "traditionalBranch" "TraditionalBranch",
  ADD COLUMN "baccalaureatePath" "BaccalaureatePath",
  ADD COLUMN "university" TEXT,
  ADD COLUMN "faculty" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "academicYear" TEXT;

-- AlterTable
ALTER TABLE "Course" 
  ADD COLUMN "targetHighSchoolSystem" "HighSchoolSystem",
  ADD COLUMN "targetStudyMode" "StudyMode",
  ADD COLUMN "targetStudyLanguage" "StudyLanguage",
  ADD COLUMN "targetHighSchoolGrade" "HighSchoolGrade",
  ADD COLUMN "targetTraditionalBranch" "TraditionalBranch",
  ADD COLUMN "targetBaccalaureatePath" "BaccalaureatePath",
  ADD COLUMN "targetUniversity" TEXT,
  ADD COLUMN "targetFaculty" TEXT,
  ADD COLUMN "targetDepartment" TEXT,
  ADD COLUMN "targetAcademicYear" TEXT;
