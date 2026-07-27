import { Injectable, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import type { Response } from 'express';
import { ExportStrategy } from './interfaces/export-strategy.interface';
import { DataProvider } from './interfaces/data-provider.interface';
import { XlsxStrategy } from './strategies/xlsx.strategy';
import { CsvStrategy } from './strategies/csv.strategy';
import { JsonStrategy } from './strategies/json.strategy';
import { PdfStrategy } from './strategies/pdf.strategy';
import { UsersProvider } from './providers/users.provider';
import { CoursesProvider } from './providers/courses.provider';
import { LecturesProvider } from './providers/lectures.provider';
import { QuizAttemptsProvider } from './providers/quiz-attempts.provider';
import { ExamAttemptsProvider } from './providers/exam-attempts.provider';
import { ActivationCodesProvider } from './providers/activation-codes.provider';
import { AuditLogsProvider } from './providers/audit-logs.provider';
import { ProgressProvider } from './providers/progress.provider';

@Injectable()
export class ExportService implements OnModuleInit {
  private strategies: Map<string, ExportStrategy> = new Map();
  private providers: Map<string, DataProvider> = new Map();

  constructor(
    private moduleRef: ModuleRef,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.registerStrategy(this.moduleRef.get(XlsxStrategy));
    this.registerStrategy(this.moduleRef.get(CsvStrategy));
    this.registerStrategy(this.moduleRef.get(JsonStrategy));
    this.registerStrategy(this.moduleRef.get(PdfStrategy));

    this.registerProvider(this.moduleRef.get(UsersProvider));
    this.registerProvider(this.moduleRef.get(CoursesProvider));
    this.registerProvider(this.moduleRef.get(LecturesProvider));
    this.registerProvider(this.moduleRef.get(QuizAttemptsProvider));
    this.registerProvider(this.moduleRef.get(ExamAttemptsProvider));
    this.registerProvider(this.moduleRef.get(ActivationCodesProvider));
    this.registerProvider(this.moduleRef.get(AuditLogsProvider));
    this.registerProvider(this.moduleRef.get(ProgressProvider));
  }

  registerStrategy(strategy: ExportStrategy) {
    this.strategies.set(strategy.format, strategy);
  }

  registerProvider(provider: DataProvider) {
    this.providers.set(provider.entity, provider);
  }

  async export(entity: string, format: string, filters: Record<string, any> | undefined, res: Response) {
    const strategy = this.strategies.get(format);
    if (!strategy) {
      throw new BadRequestException(`Unsupported export format: ${format}`);
    }

    const provider = this.providers.get(entity);
    if (!provider) {
      throw new BadRequestException(`Unsupported export entity: ${entity}`);
    }

    const { data, headers } = await provider.collect(filters, this.prisma);

    if (data.length === 0) {
      throw new NotFoundException('No data found for the requested export');
    }

    const filename = `${entity}_${new Date().toISOString().split('T')[0]}`;
    await strategy.export(data, headers, filename, res);
  }
}
