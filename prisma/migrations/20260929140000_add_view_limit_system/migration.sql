-- Migration: add_view_limit_system
-- Adds:
--   1. Lecture.maxViews (optional Int) - view limit configuration per lecture
--   2. StudentSessionViewUsage - tracks per-student per-session view count
--   3. PlaybackSession - idempotent view-consumption token

-- 1. Add maxViews column to Lecture (null = unlimited, backward-compatible)
ALTER TABLE "Lecture" ADD COLUMN "maxViews" INTEGER;

-- 2. Create StudentSessionViewUsage table
CREATE TABLE "StudentSessionViewUsage" (
    "id"        TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "usedViews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSessionViewUsage_pkey" PRIMARY KEY ("id")
);

-- 3. Create PlaybackSession table (idempotency token)
CREATE TABLE "PlaybackSession" (
    "id"        TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "consumed"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint on (studentId, sessionId) for StudentSessionViewUsage
CREATE UNIQUE INDEX "StudentSessionViewUsage_studentId_sessionId_key"
    ON "StudentSessionViewUsage"("studentId", "sessionId");

-- 5. Indexes for StudentSessionViewUsage
CREATE INDEX "StudentSessionViewUsage_sessionId_idx"
    ON "StudentSessionViewUsage"("sessionId");

-- 6. Indexes for PlaybackSession
CREATE INDEX "PlaybackSession_studentId_idx"
    ON "PlaybackSession"("studentId");

CREATE INDEX "PlaybackSession_sessionId_idx"
    ON "PlaybackSession"("sessionId");

-- 7. Foreign keys for StudentSessionViewUsage
ALTER TABLE "StudentSessionViewUsage"
    ADD CONSTRAINT "StudentSessionViewUsage_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentSessionViewUsage"
    ADD CONSTRAINT "StudentSessionViewUsage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Foreign keys for PlaybackSession
ALTER TABLE "PlaybackSession"
    ADD CONSTRAINT "PlaybackSession_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlaybackSession"
    ADD CONSTRAINT "PlaybackSession_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
