const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');

const lines = schema.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('@relation') && !line.includes('onDelete')) {
    // Only cascade for specific parent models
    if (
      line.match(/course\s+Course\b/) || 
      line.match(/chapter\s+Chapter\b/) || 
      line.match(/lecture\s+Lecture\b/) || 
      line.match(/session\s+Session\b/) ||
      line.match(/quiz\s+Quiz\b/) ||
      line.match(/exam\s+Exam\b/) ||
      line.match(/student\s+User\b/) ||
      line.match(/instructor\s+User\b/) ||
      line.match(/actor\s+User\b/)
    ) {
      lines[i] = line.replace(/\)\s*$/, ', onDelete: Cascade)');
    }
  }
}

fs.writeFileSync('prisma/schema.prisma', lines.join('\n'));
console.log('Success');
