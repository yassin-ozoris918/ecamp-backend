import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Searching for duplicate student phone numbers...");

  // Find all phone numbers that appear more than once
  const duplicates = await prisma.user.groupBy({
    by: ['phoneNumber'],
    having: {
      phoneNumber: {
        _count: {
          gt: 1,
        },
      },
    },
    where: {
      phoneNumber: {
        not: null,
      },
      // Exclude empty strings just in case
      NOT: {
        phoneNumber: ""
      }
    }
  });

  if (duplicates.length === 0) {
    console.log("✅ Awesome! No duplicate phone numbers found. It is safe to enforce uniqueness.");
  } else {
    console.log(`❌ Found ${duplicates.length} duplicate phone number(s)! You must resolve these before applying the @unique migration.\n`);
    
    for (const dup of duplicates) {
      console.log(`Phone Number: ${dup.phoneNumber}`);
      
      const users = await prisma.user.findMany({
        where: { phoneNumber: dup.phoneNumber },
        select: { id: true, fullName: true, email: true, educationLevel: true }
      });
      
      console.table(users);
      console.log("---------------------------------------------------");
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
