-- CreateEnum
CREATE TYPE "ContentNotificationType" AS ENUM ('LECTURE_ADDED', 'SESSION_ADDED', 'MATERIAL_ADDED');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- DropForeignKey
ALTER TABLE "ParentNotificationLog" DROP CONSTRAINT "ParentNotificationLog_studentId_fkey";

-- DropTable
DROP TABLE "ParentNotificationLog";

-- DropEnum
DROP TYPE "NotificationEventCategory";

-- DropEnum
DROP TYPE "NotificationChannelType";

-- DropEnum
DROP TYPE "NotificationDeliveryStatus";

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "type" "ContentNotificationType" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "ContentNotificationType" NOT NULL,
    "courseId" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_dedupeKey_key" ON "NotificationEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationEvent_status_scheduledFor_idx" ON "NotificationEvent"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationEvent_groupKey_status_idx" ON "NotificationEvent"("groupKey", "status");

-- CreateIndex
CREATE INDEX "NotificationEvent_courseId_idx" ON "NotificationEvent"("courseId");

-- CreateIndex
CREATE INDEX "NotificationEvent_lectureId_idx" ON "NotificationEvent"("lectureId");

-- CreateIndex
CREATE INDEX "NotificationEvent_targetId_idx" ON "NotificationEvent"("targetId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_userId_key" ON "Notification"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
