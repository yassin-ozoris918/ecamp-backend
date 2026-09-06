-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('NATIVE', 'AMAAN');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "amaanVideoId" TEXT,
ADD COLUMN     "videoProvider" "VideoProvider" NOT NULL DEFAULT 'NATIVE';
