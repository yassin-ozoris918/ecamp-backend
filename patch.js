const fs = require('fs');

let content = fs.readFileSync('prisma/schema.prisma', 'utf8');

const userInjection = `
  // Legacy fields (temporarily kept for safe migration)
  university            String?
  faculty               String?
  department            String?
  academicYear          String?
`;

const courseInjection = `
  // Legacy fields (temporarily kept for safe migration)
  targetUniversity         String?
  targetFaculty            String?
  targetDepartment         String?
  targetAcademicYear       String?
`;

// using regex to match whitespace
content = content.replace(
  /\s*\/\/\s*Academic Master Data Segmentation\s*universityId\s*String\?/,
  userInjection + '\n  // Academic Master Data Segmentation\n  universityId          String?'
);

content = content.replace(
  /\s*\/\/\s*Academic Master Data Targeting\s*targetUniversityId\s*String\?/,
  courseInjection + '\n  // Academic Master Data Targeting\n  targetUniversityId       String?'
);

fs.writeFileSync('prisma/schema.prisma', content);
console.log('Patched schema.prisma');
