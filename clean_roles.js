const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const srcDir = path.join(__dirname, 'src');

walkDir(srcDir, (filePath) => {
  if (!filePath.endsWith('.ts')) return;
  if (filePath.includes('instructor-dashboard.controller.ts')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace various combinations
  content = content.replace(/@Roles\(Role\.INSTRUCTOR,\s*Role\.ADMIN\)/g, '@Roles(Role.ADMIN)');
  content = content.replace(/@Roles\(Role\.ADMIN,\s*Role\.INSTRUCTOR\)/g, '@Roles(Role.ADMIN)');
  content = content.replace(/@Roles\(Role\.STUDENT,\s*Role\.ADMIN,\s*Role\.INSTRUCTOR\)/g, '@Roles(Role.STUDENT, Role.ADMIN)');
  content = content.replace(/@Roles\(Role\.STUDENT,\s*Role\.INSTRUCTOR,\s*Role\.ADMIN\)/g, '@Roles(Role.STUDENT, Role.ADMIN)');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
});
