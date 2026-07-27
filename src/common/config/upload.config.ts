import { BadRequestException } from '@nestjs/common';

export const MIME_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
} as const;

export const ALL_MIME_TYPES = [
  ...MIME_TYPES.IMAGE,
  ...MIME_TYPES.VIDEO,
  ...MIME_TYPES.DOCUMENT,
];

export const UPLOAD_LIMITS = {
  AVATAR: 5 * 1024 * 1024,
  THUMBNAIL: 5 * 1024 * 1024,
  VIDEO: 500 * 1024 * 1024,
  ATTACHMENT: 50 * 1024 * 1024,
  EXAM: 50 * 1024 * 1024,
} as const;

export const BLOCKED_EXTENSIONS = [
  '.exe', '.dll', '.php', '.js', '.sh', '.bat', '.apk',
];

export function createFileFilter(allowedMimes: readonly string[]) {
  return (
    _req: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!allowedMimes.includes(file.mimetype)) {
      return callback(
        new BadRequestException(
          `Unsupported MIME type: "${file.mimetype}". Accepted: ${allowedMimes.join(', ')}`,
        ),
        false,
      );
    }
    callback(null, true);
  };
}

export const imageFileFilter = createFileFilter(MIME_TYPES.IMAGE);

export const videoFileFilter = createFileFilter(MIME_TYPES.VIDEO);

export const attachmentFileFilter = createFileFilter([
  ...MIME_TYPES.IMAGE,
  ...MIME_TYPES.DOCUMENT,
]);
