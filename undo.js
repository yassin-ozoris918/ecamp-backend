const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'quizzes', 'quizzes.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// First undo the bad replace
content = content.replace('include: { questions: true   async verifyLectureOwnershipAdmin', 'include: { questions: true },\n  async verifyLectureOwnershipAdmin');

// Now we need to make sure the end of the file is correct, or just let it be. Wait! It replaced the whole end of the file improperly.
// Let's just do a git restore and run my scripts again. This is safer.
