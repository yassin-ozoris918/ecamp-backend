-- CreateTable
CREATE TABLE "DeviceHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "browser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceHistory_studentId_idx" ON "DeviceHistory"("studentId");

-- CreateIndex
CREATE INDEX "DeviceHistory_createdAt_idx" ON "DeviceHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "DeviceHistory" ADD CONSTRAINT "DeviceHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
