-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REPLACED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeviceAttemptOutcome" AS ENUM ('BOUND', 'ALLOWED', 'NEW_BROWSER', 'LEGACY', 'BLOCKED', 'NEEDS_APPROVAL');

-- CreateEnum
CREATE TYPE "DeviceChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PlaybackSession" ADD COLUMN     "browserId" TEXT,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StudentDevice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "signals" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'unknown',
    "category" TEXT NOT NULL DEFAULT 'unknown',
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "StudentDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceBrowser" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "keyThumbprint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastIp" TEXT,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceBrowser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceLoginAttempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "outcome" "DeviceAttemptOutcome" NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "reason" TEXT,
    "label" TEXT,
    "kind" TEXT,
    "signals" JSONB,
    "publicKey" TEXT,
    "keyThumbprint" TEXT,
    "browserId" TEXT,
    "browserName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceChangeRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DeviceChangeStatus" NOT NULL DEFAULT 'PENDING',
    "signals" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'unknown',
    "category" TEXT NOT NULL DEFAULT 'unknown',
    "publicKey" TEXT,
    "keyThumbprint" TEXT,
    "browserName" TEXT,
    "note" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentDevice_studentId_status_idx" ON "StudentDevice"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudentDevice_legacyId_idx" ON "StudentDevice"("legacyId");

-- CreateIndex
CREATE INDEX "DeviceBrowser_keyThumbprint_idx" ON "DeviceBrowser"("keyThumbprint");

-- CreateIndex
CREATE INDEX "DeviceBrowser_deviceId_idx" ON "DeviceBrowser"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceBrowser_studentId_keyThumbprint_key" ON "DeviceBrowser"("studentId", "keyThumbprint");

-- CreateIndex
CREATE INDEX "DeviceLoginAttempt_studentId_createdAt_idx" ON "DeviceLoginAttempt"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceLoginAttempt_outcome_createdAt_idx" ON "DeviceLoginAttempt"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceLoginAttempt_keyThumbprint_idx" ON "DeviceLoginAttempt"("keyThumbprint");

-- CreateIndex
CREATE INDEX "DeviceLoginAttempt_createdAt_idx" ON "DeviceLoginAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "DeviceChangeRequest_status_createdAt_idx" ON "DeviceChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceChangeRequest_studentId_idx" ON "DeviceChangeRequest"("studentId");

-- AddForeignKey
ALTER TABLE "StudentDevice" ADD CONSTRAINT "StudentDevice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBrowser" ADD CONSTRAINT "DeviceBrowser_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "StudentDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBrowser" ADD CONSTRAINT "DeviceBrowser_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLoginAttempt" ADD CONSTRAINT "DeviceLoginAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceChangeRequest" ADD CONSTRAINT "DeviceChangeRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
