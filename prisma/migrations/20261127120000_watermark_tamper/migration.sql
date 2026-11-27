-- AlterTable
ALTER TABLE "PlaybackSession" ADD COLUMN     "lastTamperAt" TIMESTAMP(3),
ADD COLUMN     "lastTamperKind" TEXT,
ADD COLUMN     "tamperCount" INTEGER NOT NULL DEFAULT 0;
