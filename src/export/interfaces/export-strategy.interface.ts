import type { Response } from 'express';

export interface ExportStrategy {
  format: string;
  mimeType: string;
  extension: string;
  export(data: Record<string, any>[], headers: { key: string; label: string }[], filename: string, res: Response): Promise<void>;
}
