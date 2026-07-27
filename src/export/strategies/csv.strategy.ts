import { Injectable } from '@nestjs/common';
import { format } from 'fast-csv';
import type { Response } from 'express';
import { ExportStrategy } from '../interfaces/export-strategy.interface';

@Injectable()
export class CsvStrategy implements ExportStrategy {
  format = 'csv';
  mimeType = 'text/csv';
  extension = 'csv';

  async export(
    data: Record<string, any>[],
    headers: { key: string; label: string }[],
    filename: string,
    res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', this.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${this.extension}"`);

    return new Promise((resolve, reject) => {
      const csvStream = format({ headers: headers.map((h) => h.label) });
      csvStream.pipe(res).on('finish', resolve).on('error', reject);

      data.forEach((row) => {
        const csvRow: Record<string, any> = {};
        headers.forEach((h) => {
          csvRow[h.label] = row[h.key] !== undefined ? String(row[h.key]) : '';
        });
        csvStream.write(csvRow);
      });

      csvStream.end();
    });
  }
}
