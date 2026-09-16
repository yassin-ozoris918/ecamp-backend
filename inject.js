const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'quizzes', 'quizzes.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const adminMethods = fs.readFileSync(path.join(process.env.USERPROFILE, '.gemini', 'antigravity-ide', 'brain', '0d88ad3e-44ae-4656-b232-4798de26bb62', 'scratch', 'admin_methods.ts'), 'utf8');

const lastBraceIndex = content.lastIndexOf('}');
if (lastBraceIndex !== -1) {
  content = content.substring(0, lastBraceIndex) + adminMethods + '\n}\n';
}

fs.writeFileSync(filePath, content);
console.log('Successfully injected admin methods');
