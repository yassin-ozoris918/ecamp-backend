const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('Cleaning up universities, keeping only Suez Canal University and Other...');
  
  // Find SCU and Other
  const scu = await p.academicUniversity.findFirst({ where: { nameEn: 'Suez Canal University' } });
  const other = await p.academicUniversity.findFirst({ where: { isOther: true } });
  
  const keepIds = [];
  if (scu) keepIds.push(scu.id);
  if (other) keepIds.push(other.id);
  
  if (keepIds.length === 0) {
    console.log('No universities to keep? Aborting.');
    return;
  }
  
  // Delete all other universities
  const result = await p.academicUniversity.deleteMany({
    where: {
      id: { notIn: keepIds }
    }
  });
  
  console.log(`Deleted ${result.count} extra universities.`);
  
  // They also said "no no i don't need all these universities and faculties"
  // Should I also delete the extra faculties from SCU? They said "and check that faculty and departement and program as we specified up there"
  
}

main().catch(console.error).finally(() => p.$disconnect());
