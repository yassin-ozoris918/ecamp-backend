-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnail" TEXT,
    "altText" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_uploadedById_idx" ON "Media"("uploadedById");
CREATE INDEX "Media_uploadedAt_idx" ON "Media"("uploadedAt");
CREATE INDEX "Media_mimeType_idx" ON "Media"("mimeType");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN "profilePictureMediaId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_profilePictureMediaId_fkey" FOREIGN KEY ("profilePictureMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "User_profilePictureMediaId_key" ON "User"("profilePictureMediaId");

-- AlterTable: Course
ALTER TABLE "Course" ADD COLUMN "thumbnailMediaId" TEXT;
ALTER TABLE "Course" ADD COLUMN "introductoryVideoMediaId" TEXT;
ALTER TABLE "Course" ADD CONSTRAINT "Course_thumbnailMediaId_fkey" FOREIGN KEY ("thumbnailMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_introductoryVideoMediaId_fkey" FOREIGN KEY ("introductoryVideoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Course_thumbnailMediaId_key" ON "Course"("thumbnailMediaId");
CREATE UNIQUE INDEX "Course_introductoryVideoMediaId_key" ON "Course"("introductoryVideoMediaId");

-- AlterTable: Lecture
ALTER TABLE "Lecture" ADD COLUMN "thumbnailMediaId" TEXT;
ALTER TABLE "Lecture" ADD CONSTRAINT "Lecture_thumbnailMediaId_fkey" FOREIGN KEY ("thumbnailMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Lecture_thumbnailMediaId_key" ON "Lecture"("thumbnailMediaId");

-- AlterTable: Session
ALTER TABLE "Session" ADD COLUMN "videoMediaId" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_videoMediaId_fkey" FOREIGN KEY ("videoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Session_videoMediaId_key" ON "Session"("videoMediaId");

-- AlterTable: Attachment
ALTER TABLE "Attachment" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: ChapterAttachment
ALTER TABLE "ChapterAttachment" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "ChapterAttachment" ADD CONSTRAINT "ChapterAttachment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: CourseAttachment
ALTER TABLE "CourseAttachment" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "CourseAttachment" ADD CONSTRAINT "CourseAttachment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Certificate
ALTER TABLE "Certificate" ADD COLUMN "pdfMediaId" TEXT;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_pdfMediaId_fkey" FOREIGN KEY ("pdfMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Certificate_pdfMediaId_key" ON "Certificate"("pdfMediaId");
