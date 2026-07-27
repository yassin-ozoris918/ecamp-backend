-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'UNIVERSITY');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "Lecture" ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "educationLevel" "EducationLevel" NOT NULL DEFAULT 'UNIVERSITY',
ADD COLUMN     "parentPhoneNumber" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "profilePictureUrl" TEXT;
