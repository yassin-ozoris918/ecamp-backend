import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Copying a lecture to another course shares its video / file / thumbnail storage objects
 * (no re-upload). Before an object is removed from storage (R2 / Cloudflare Stream), call this
 * AFTER the database rows were deleted: it returns only the URLs that no remaining row still uses,
 * so deleting one copy can never break another.
 */
export async function filterUnreferencedUrls(prisma: PrismaService, urls: (string | null | undefined)[]): Promise<string[]> {
  const unique = [...new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0))];
  if (unique.length === 0) return [];

  const referenced = await prisma.$queryRaw<{ url: string }[]>(Prisma.sql`
    SELECT u.url FROM unnest(${unique}::text[]) AS u(url)
    WHERE EXISTS (SELECT 1 FROM "Session" s WHERE s."videoUrl" = u.url)
       OR EXISTS (SELECT 1 FROM "Attachment" a WHERE a."fileUrl" = u.url)
       OR EXISTS (SELECT 1 FROM "ChapterAttachment" ca WHERE ca."fileUrl" = u.url)
       OR EXISTS (SELECT 1 FROM "CourseAttachment" co WHERE co."fileUrl" = u.url)
       OR EXISTS (SELECT 1 FROM "Lecture" l WHERE l."thumbnailUrl" = u.url)
       OR EXISTS (SELECT 1 FROM "Course" c WHERE c."thumbnailUrl" = u.url OR c."introductoryVideoUrl" = u.url)
  `);
  const stillUsed = new Set(referenced.map((r) => r.url));
  return unique.filter((u) => !stillUsed.has(u));
}
