const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'quizzes', 'quizzes.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const newSubmitQuiz = fs.readFileSync(path.join(process.env.USERPROFILE, '.gemini', 'antigravity-ide', 'brain', '0d88ad3e-44ae-4656-b232-4798de26bb62', 'scratch', 'new_submit_quiz.ts'), 'utf8');

const startIndex = content.indexOf('  async submitQuiz(dto: SubmitQuizDto, studentId: string) {');
const endIndex = content.indexOf('  async surrenderQuiz(quizId: string, studentId: string) {');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newSubmitQuiz + '\n\n' + content.substring(endIndex);
  fs.writeFileSync(filePath, content);
  console.log('Successfully replaced submitQuiz');
} else {
  console.log('Could not find start or end index');
}
