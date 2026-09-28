import { PrismaClient } from '@prisma/client'; 
const prisma = new PrismaClient(); 
async function main() { 
  const depts = await prisma.academicDepartment.findMany({ 
    where: { faculty: { nameEn: 'Faculty of Computers and Information' } },
    include: { faculty: true }
  }); 
  console.log(JSON.stringify(depts, null, 2)); 
} 
main().catch(console.error).finally(() => prisma.$disconnect());
