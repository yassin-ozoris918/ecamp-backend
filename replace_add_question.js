const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'quizzes', 'quizzes.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldStr =     if (dto.correctOptionIndex < 0 || dto.correctOptionIndex >= dto.options.length) {
      throw new BadRequestException('correctOptionIndex is out of bounds.');
    }

    return this.prisma.quizQuestion.create({
      data: {
        quizId: dto.quizId,
        text: dto.text,
        type: dto.type,
        options: dto.options,
        correctOptionIndex: dto.correctOptionIndex,
        points: dto.points || 1,
        version: dto.version ?? 'A',
      },
    });;

const newStr =     const type = dto.type || 'MCQ';
    const options = dto.options || [];
    const correctOptionIndex = dto.correctOptionIndex ?? -1;

    if ((type === 'MCQ' || type === 'TRUE_FALSE') && (correctOptionIndex < 0 || correctOptionIndex >= options.length)) {
      throw new BadRequestException('correctOptionIndex is out of bounds.');
    }

    return this.prisma.quizQuestion.create({
      data: {
        quizId: dto.quizId,
        text: dto.text,
        type: type,
        options: options,
        correctOptionIndex: correctOptionIndex,
        referenceAnswer: dto.referenceAnswer,
        matchOptions: dto.matchOptions ? (dto.matchOptions as any) : Prisma.JsonNull,
        correctOrder: dto.correctOrder || [],
        points: dto.points || 1,
        version: dto.version ?? 'A',
      },
    });;

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(filePath, content);
  console.log('Successfully replaced addQuestion');
} else {
  console.log('Could not find old string');
}
