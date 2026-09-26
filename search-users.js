const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { 
      email: true, 
      fullName: true,
      educationLevel: true, 
      role: true, 
      createdAt: true 
    },
    orderBy: { createdAt: 'desc' }
  });

  const formattedUsers = users.map(u => ({
    Name: u.fullName,
    Email: u.email,
    Role: u.role,
    Level: u.educationLevel,
    Date: u.createdAt.toISOString().split('T')[0]
  }));

  console.table(formattedUsers);
  console.log(`\nTotal Users: ${users.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
