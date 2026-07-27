import { Injectable } from '@nestjs/common';
import * as PDFKit from 'pdfkit';
import type { Response } from 'express';
import { ExportStrategy } from '../interfaces/export-strategy.interface';

@Injectable()
export class PdfStrategy implements ExportStrategy {
  format = 'pdf';
  mimeType = 'application/pdf';
  extension = 'pdf';

  async export(
    data: Record<string, any>[],
    headers: { key: string; label: string }[],
    filename: string,
    res: Response,
  ): Promise<void> {
    const doc = new PDFKit({ margin: 30, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', this.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${this.extension}"`);

    doc.pipe(res);

    doc.fontSize(16).text(filename, { align: 'center' });
    doc.moveDown();

    const pageWidth = doc.page.width - 60;
    const colCount = headers.length;
    const colWidth = Math.max(60, pageWidth / colCount);

    // Table header
    doc.fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h.label, 30 + i * colWidth, doc.y, { width: colWidth, align: 'left' });
    });
    doc.moveDown(0.5);

    // Draw a line
    const headerY = doc.y;
    doc.moveTo(30, headerY).lineTo(30 + pageWidth, headerY).stroke();
    doc.moveDown(0.3);

    // Table rows
    doc.fontSize(7).font('Helvetica');
    for (const row of data) {
      const startY = doc.y;
      if (startY > doc.page.height - 50) {
        doc.addPage();
      }

      headers.forEach((h, i) => {
        const val = row[h.key] !== undefined ? String(row[h.key]) : '';
        doc.text(val, 30 + i * colWidth, doc.y, { width: colWidth, align: 'left' });
      });
      doc.moveDown(0.3);
    }

    doc.end();
  }
}
