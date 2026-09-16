const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'quizzes', 'quizzes.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const startIndex = content.indexOf('  async addQuestion(dto: AddQuestionDto, instructorId: string, role: Role) {');
const endIndex = content.indexOf('  // --- STUDENT METHODS ---');

const replacement = fs.readFileSync(path.join(process.env.USERPROFILE, '.gemini', 'antigravity-ide', 'brain', '0d88ad3e-44ae-4656-b232-4798de26bb62', 'scratch', 'repair_add_question.ts'), 'utf8');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync(filePath, content);
  console.log('Successfully repaired addQuestion and abandonQuiz');
} else {
  console.log('Indices not found!');
}
