const fs = require('fs');
const path = 'c:/Users/user/Desktop/Platform/lms-backend/prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf-8');

// Remove deletedAt lines
schema = schema.replace(/^[ \t]*deletedAt[ \t]+DateTime\?[ \t]*(\/\/[^\n]*)?(\r?\n)/gm, '');

fs.writeFileSync(path, schema);
console.log('done');
