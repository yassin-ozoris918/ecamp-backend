const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({where:{role:'STUDENT', educationLevel:'UNIVERSITY'}, select:{email:true, isActive:true, createdAt:true}}).then(console.log).finally(()=>prisma.$disconnect());
