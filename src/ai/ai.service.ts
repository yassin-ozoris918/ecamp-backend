import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GoogleGenAI, Type } from '@google/genai';
import * as mammoth from 'mammoth';

@Injectable()
export class AiService {
  private ai: GoogleGenAI;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {
    this.ai = new GoogleGenAI({ 
      apiKey: this.configService.get<string>('GEMINI_API_KEY') || '' 
    });
  }

  // --- 1. Phase F: Gemini Extraction ---
  async extractQuestionsFromUrl(
    fileUrl: string,
    instructorId: string,
    examId: string,
  ) {
    if (!fileUrl) throw new BadRequestException('No file URL provided');

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Failed to fetch file from URL');
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || '';
      
      return this.extractQuestionsFromBuffer(buffer, contentType, fileUrl, instructorId, examId);
    } catch (error) {
      this.logger.error('File fetch failed', error);
      throw new InternalServerErrorException('Failed to fetch the file from the provided URL.');
    }
  }

  async extractQuestionsFromBuffer(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    instructorId: string,
    examId: string,
  ) {
    let rawText = '';
    let isNativePdf = false;

    try {
      if (mimeType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
        isNativePdf = true; // Pass native PDF directly to Gemini 2.5 Flash for multimodal analysis
      } else if (
        mimeType.includes('wordprocessingml') ||
        mimeType.includes('msword') || 
        fileName.toLowerCase().endsWith('.docx')
      ) {
        const docxData = await mammoth.extractRawText({ buffer });
        rawText = docxData.value;
      } else {
        throw new BadRequestException(
          'Unsupported file type. Please upload a PDF or Word Document.',
        );
      }
    } catch (error) {
      this.logger.error('File parsing failed', error);
      await this.logExtraction(instructorId, fileName, mimeType, false, 0, 0, 'File parsing failed.');
      throw new InternalServerErrorException('Failed to read the file.');
    }

    if (!isNativePdf && !rawText.trim()) {
      await this.logExtraction(instructorId, fileName, mimeType, false, 0, 0, 'Empty or scanned document.');
      throw new BadRequestException('The document is empty or contains only images.');
    }

    return this.processWithGemini(rawText, fileName, mimeType, instructorId, examId, isNativePdf ? buffer : undefined);
  }

  private async processWithGemini(
    text: string,
    fileUrl: string,
    mimeType: string,
    instructorId: string,
    examId: string,
    pdfBuffer?: Buffer,
  ) {
    try {
      const prompt = `You are an expert educational assistant. Extract quiz/exam questions from the provided document. Map them strictly to the provided JSON schema. For read-only contextual passages, use the type 'READ_ONLY_TEXT'. For multiple-choice or true/false options, supply an array of choices and specify the correct 0-based choice index. For essay/short answers, supply an ideal text evaluation rubric inside 'referenceAnswer'.`;

      // 1. Construct the payload with strictly verified Base64 or text 
      const contentsPayload: any[] = [];
      
      if (pdfBuffer) {
        // Enforce correct native parsing boundary by placing inlineData first
        contentsPayload.push({
          inlineData: {
            data: pdfBuffer.toString('base64'),
            mimeType: 'application/pdf',
          },
        });
        contentsPayload.push(prompt);
      } else {
        contentsPayload.push(`${prompt}\n\nRaw Text:\n${text}`);
      }

      // 2. Fire the multimodal payload with model failover chain
      const envModel = this.configService.get<string>('GEMINI_MODEL');
      const candidateModels = Array.from(new Set([envModel, 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'].filter(Boolean)));
      
      let aiResponse: any = null;
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          aiResponse = await this.ai.models.generateContent({
            model: modelName as string,
            contents: contentsPayload,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: 'The actual question text or reading passage' },
                    type: { type: Type.STRING, enum: ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'READ_ONLY_TEXT'] },
                    points: { type: Type.INTEGER, description: 'Points for the question, default to 1' },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Only include for MCQ and TRUE_FALSE' },
                    correctOptionIndex: { type: Type.INTEGER, description: 'Index of the correct option' },
                    referenceAnswer: { type: Type.STRING, description: 'Rubric or ideal answer' },
                  },
                  required: ['text', 'type', 'points'],
                },
              },
            },
          });
          if (aiResponse?.text) {
            this.logger.log(`Gemini extraction succeeded using model: ${modelName}`);
            break;
          }
        } catch (mErr: any) {
          lastError = mErr;
          this.logger.warn(`Gemini model ${modelName} failed: ${mErr.message}`);
        }
      }

      if (!aiResponse || !aiResponse.text) {
        throw lastError || new Error('Gemini engine returned an empty output payload.');
      }

      const parsedQuestions = JSON.parse(aiResponse.text);
      
      await this.logExtraction(instructorId, fileUrl, mimeType, true, parsedQuestions.length, 0);

      return {
        message: 'Questions extracted successfully. Please review before saving.',
        count: parsedQuestions.length,
        questions: parsedQuestions,
      };
    } catch (error: any) {
      this.logger.error('Detailed extraction failure context trace:', error);
      
      const fallbackQs = await this.parseFallbackQuestions(text, pdfBuffer);
      if (fallbackQs.length > 0) {
        await this.logExtraction(instructorId, fileUrl, mimeType, true, fallbackQs.length, 0);
        return {
          message: 'Questions extracted successfully via local parser.',
          count: fallbackQs.length,
          questions: fallbackQs,
        };
      }

      await this.logExtraction(instructorId, fileUrl, mimeType, false, 0, 0, error.message || 'AI processing failed.');
      throw new BadRequestException(`The AI failed to process the document format accurately: ${error.message}`);
    }
  }

  private async parseFallbackQuestions(text: string, pdfBuffer?: Buffer): Promise<any[]> {
    let rawStr = text || '';
    if (pdfBuffer) {
      try {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: pdfBuffer });
        const res = await parser.getText();
        if (res && res.text) {
          rawStr = res.text;
        }
      } catch (e) {
        const pdfStr = pdfBuffer.toString('binary');
        const textMatches = pdfStr.match(/\((.*?)\)\s*Tj/g);
        if (textMatches && textMatches.length > 0) {
          rawStr = textMatches.map(m => m.replace(/^\(|\)\s*Tj$/g, '')).join('\n');
        } else {
          rawStr = pdfBuffer.toString('utf8');
        }
      }
    }

    const questions: any[] = [];
    const blocks = rawStr.split(/(?=(?:Question|\bQ\d+[:.]))/i);

    for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;

      const rawQLine = lines[0];
      if (!/^(?:Question|\bQ\d+)[:.\s]/i.test(rawQLine) && questions.length === 0) continue;

      const qText = rawQLine.replace(/^(?:Question\s*\d*|\bQ\d+)[:.\s]*/i, '').trim();
      const options: string[] = [];
      let correctIdx = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const optMatch = line.match(/^([A-D])[).\s]+(.*)/i);
        if (optMatch) {
          let optText = optMatch[2].trim();
          const isCorrect = /\[CORRECT\]|\*|\(correct\)/i.test(optText);
          optText = optText.replace(/\[CORRECT\]|\*|\(correct\)/gi, '').trim();
          if (isCorrect) {
            correctIdx = options.length;
          }
          options.push(optText);
        }
      }

      if (options.length > 0) {
        questions.push({
          text: qText,
          type: 'MCQ',
          points: 1,
          options,
          correctOptionIndex: correctIdx,
        });
      }
    }

    return questions;
  }

  private async logExtraction(
    instructorId: string,
    fileName: string,
    fileType: string,
    isSuccess: boolean,
    questionCount: number,
    estimatedTokens: number,
    errorMessage?: string,
  ) {
    await this.prisma.aIExtractionLog.create({
      data: {
        instructorId,
        fileName,
        fileType,
        isSuccess,
        questionCount,
        estimatedTokens,
        errorMessage,
      },
    });
  }

  // --- Phase F: AI Grading Engine ---
  async evaluateSubjectiveAnswers(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        responses: {
          include: { question: true },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');

    const subjectiveResponses = attempt.responses.filter(
       r => (r.question.type === 'ESSAY' || r.question.type === 'SHORT_ANSWER') && r.textResponse && r.instructorOverrideScore === null && r.aiScoreGuess === null
    );

    if (subjectiveResponses.length === 0) return { message: 'No pending subjective answers to grade.' };

    try {
      const promptData = subjectiveResponses.map((r) => ({
        responseId: r.id,
        questionText: r.question.text,
        referenceAnswer: r.question.referenceAnswer || 'No specific rubric. Grade based on general accuracy and depth.',
        studentAnswer: r.textResponse,
        maxPoints: r.question.points,
      }));

      const prompt = `You are a strict, expert AI teacher. Grade the following student essays/short answers against the provided reference rubric.
Evaluate semantic alignment. Return a JSON array matching exactly this schema:
[{ "responseId": "...", "aiScoreGuess": number (can be float), "aiConfidenceScore": number (float 0-1), "evaluationNote": "string explanation" }]
Questions and answers to grade:
${JSON.stringify(promptData, null, 2)}`;

      const aiResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                responseId: { type: Type.STRING },
                aiScoreGuess: { type: Type.NUMBER },
                aiConfidenceScore: { type: Type.NUMBER },
                evaluationNote: { type: Type.STRING },
              },
              required: ['responseId', 'aiScoreGuess', 'aiConfidenceScore', 'evaluationNote'],
            },
          },
        },
      });

      const grades = JSON.parse(aiResponse.text || '[]');

      // Update responses
      for (const grade of grades) {
         await this.prisma.studentExamResponse.update({
             where: { id: grade.responseId },
             data: {
                 aiScoreGuess: grade.aiScoreGuess,
                 aiConfidenceScore: grade.aiConfidenceScore,
                 evaluationNote: grade.evaluationNote,
                 earnedPoints: Math.round(grade.aiScoreGuess), // Map integer earnedPoints
             }
         });
      }

      return {
        message: 'AI Evaluation completed successfully',
        count: grades.length,
      };
    } catch (error) {
      this.logger.error('AI Subjective Grading Error:', error);
      throw new InternalServerErrorException('AI Grading failed.');
    }
  }

  // --- Quiz Subjective AI Grading ---
  async evaluateQuizEssays(
    promptData: {
      responseId: string;
      questionText: string;
      referenceAnswer: string;
      studentAnswer: string;
      maxPoints: number;
    }[]
  ): Promise<{
    responseId: string;
    aiScoreGuess: number;
    aiConfidenceScore: number;
    evaluationNote: string;
  }[]> {
    if (!promptData || promptData.length === 0) return [];

    try {
      const prompt = `You are a strict, expert AI teacher evaluating academic answers for a Quiz.
Your task is to grade the following student answers against the provided reference rubric.
The student is NOT required to reproduce the reference answer word-for-word. Focus on conceptual correctness, factual accuracy, relevance, and completeness.
Accept valid paraphrasing, different sentence structures, and equivalent terminology.
Do NOT penalize for spelling, grammar, or punctuation unless they materially change the meaning.
Award partial credit for partial understanding.
Distinguish between missing information and incorrect claims.

For each response, return a JSON object exactly matching this schema:
{
  "responseId": "string (the provided ID)",
  "aiScoreGuess": number (between 0 and maxPoints, can be a float),
  "aiConfidenceScore": number (float between 0.0 and 1.0 representing your confidence),
  "evaluationNote": "string explanation of the grade, highlighting strengths, missing concepts, or errors"
}

Never return an aiScoreGuess greater than maxPoints or less than 0.

Questions and answers to grade:
${JSON.stringify(promptData, null, 2)}`;

      const aiResponse = await this.ai.models.generateContent({
        model: this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-pro',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                responseId: { type: Type.STRING },
                aiScoreGuess: { type: Type.NUMBER },
                aiConfidenceScore: { type: Type.NUMBER },
                evaluationNote: { type: Type.STRING },
              },
              required: ['responseId', 'aiScoreGuess', 'aiConfidenceScore', 'evaluationNote'],
            },
          },
        },
      });

      const text = aiResponse.text || '[]';
      let grades: any[] = [];
      try {
        grades = JSON.parse(text);
      } catch (e) {
        this.logger.error('Failed to parse AI grading JSON: ' + text);
        return [];
      }

      // Validate grades
      return grades.map((g) => {
        const pd = promptData.find(p => p.responseId === g.responseId);
        const maxPoints = pd ? pd.maxPoints : 1;
        
        let score = typeof g.aiScoreGuess === 'number' && !isNaN(g.aiScoreGuess) ? g.aiScoreGuess : 0;
        score = Math.max(0, Math.min(score, maxPoints)); // Clamp
        
        let confidence = typeof g.aiConfidenceScore === 'number' && !isNaN(g.aiConfidenceScore) ? g.aiConfidenceScore : 0;
        confidence = Math.max(0, Math.min(confidence, 1));
        
        return {
          responseId: g.responseId,
          aiScoreGuess: score,
          aiConfidenceScore: confidence,
          evaluationNote: g.evaluationNote || 'AI Evaluation',
        };
      });
    } catch (error) {
      this.logger.error('AI Quiz Grading Error:', error);
      // Return empty array on failure so caller can handle gracefully
      return [];
    }
  }
}
