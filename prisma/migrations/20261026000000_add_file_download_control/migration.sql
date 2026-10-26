ALTER TABLE "Course" ADD COLUMN "allowFileDownload" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Attachment" ADD COLUMN "allowDownload" BOOLEAN;
