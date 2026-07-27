import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import { ExportStrategy } from '../interfaces/export-strategy.interface';

@Injectable()
export class XlsxStrategy implements ExportStrategy {
  format = 'xlsx';
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  extension = 'xlsx';

  async export(
    data: Record<string, any>[],
    headers: { key: string; label: string }[],
    filename: string,
    res: Response,
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Export');

    worksheet.columns = headers.map((h) => ({
      header: h.label,
      key: h.key,
      width: Math.max(h.label.length + 5, 15),
    }));

    data.forEach((row) => worksheet.addRow(row));

    res.setHeader('Content-Type', this.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${this.extension}"`);

    await workbook.xlsx.write(res);
    res.end();
  }
}
