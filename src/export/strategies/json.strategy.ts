import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ExportStrategy } from '../interfaces/export-strategy.interface';

@Injectable()
export class JsonStrategy implements ExportStrategy {
  format = 'json';
  mimeType = 'application/json';
  extension = 'json';

  async export(
    data: Record<string, any>[],
    _headers: { key: string; label: string }[],
    filename: string,
    res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', this.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${this.extension}"`);
    res.end(JSON.stringify(data, null, 2));
  }
}
