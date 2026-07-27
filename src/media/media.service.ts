import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService) {}

  async createMedia(data: {
    filename: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
    thumbnail?: string;
    altText?: string;
    uploadedById: string;
  }) {
    return this.prisma.media.create({ data });
  }

  async findById(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }

  async getMetadata(id: string) {
    const media = await this.findById(id);
    return {
      id: media.id,
      filename: media.filename,
      originalName: media.originalName,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      thumbnail: media.thumbnail,
      altText: media.altText,
      uploadedAt: media.uploadedAt,
    };
  }

  async deleteMedia(id: string) {
    const media = await this.findById(id);
    await this.prisma.media.update({
      where: { id },
      data: { filename: `deleted_${media.filename}` },
    });
    return { message: 'Media record cleared' };
  }
}
