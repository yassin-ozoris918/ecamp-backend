import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Resolving remaining active duplicates...");

  // IDs of the duplicate accounts (test918@gmail.com and JoyGoergeJoyGoerge29@gmail.com)
  const usersToChange = [
    'ebc5ae6a-9437-4361-813b-892ccc1c7872', 
    '89556123-f59f-4052-b871-bffb56dcec9a', 
  ];

  let count = 0;
  for (const userId of usersToChange) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user && user.phoneNumber && !user.phoneNumber.includes('_dup')) {
      const newPhone = `${user.phoneNumber}_dup_${Date.now()}`;
      await prisma.user.update({
        where: { id: userId },
        data: {
          phoneNumber: newPhone
        }
      });
      console.log(`✅ Changed phone for ${user.email} to ${newPhone}`);
      count++;
    }
  }
  
  console.log(`Done resolving ${count} active duplicates! You can now safely apply the database update.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
