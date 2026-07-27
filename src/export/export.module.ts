import { Module, OnModuleInit } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { PrismaModule } from '../prisma/prisma.module';
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

@Module({
  imports: [PrismaModule],
  controllers: [ExportController],
  providers: [
    ExportService,
    XlsxStrategy,
    CsvStrategy,
    JsonStrategy,
    PdfStrategy,
    UsersProvider,
    CoursesProvider,
    LecturesProvider,
    QuizAttemptsProvider,
    ExamAttemptsProvider,
    ActivationCodesProvider,
    AuditLogsProvider,
    ProgressProvider,
  ],
})
export class ExportModule {}
