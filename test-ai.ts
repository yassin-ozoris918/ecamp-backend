import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AiService } from './src/ai/ai.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('TestAI');
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const aiService = app.get(AiService);

    const testPrompt = [
      {
        responseId: 'test-123',
        questionText: 'Explain the principle of superposition.',
        referenceAnswer: 'Superposition is the ability of a quantum system to be in multiple states at the same time until it is measured.',
        studentAnswer: 'It means a quantum bit can be both 0 and 1 at the same time before you measure it.',
        maxPoints: 5,
      }
    ];

    logger.log('Testing AI grading with Gemini...');
    const result = await aiService.evaluateQuizEssays(testPrompt);
    logger.log('AI Grading Result: ' + JSON.stringify(result, null, 2));

    await app.close();
    process.exit(0);
  } catch (err) {
    logger.error('Failed to run AI test script', err);
    process.exit(1);
  }
}

bootstrap();
