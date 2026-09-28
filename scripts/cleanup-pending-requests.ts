import { PrismaClient, EducationLevel } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const badRequests = await prisma.profileUpdateRequest.findMany({
    where: {
      status: 'PENDING',
      requestedParentPhone: { not: null },
      student: {
        educationLevel: EducationLevel.UNIVERSITY,
      },
    },
  });

  console.log(`Found ${badRequests.length} pending requests from UNIVERSITY students with requestedParentPhone.`);

  for (const req of badRequests) {
    if (!req.requestedFullName && !req.requestedPhoneNumber) {
      // If the only thing they requested was parent phone, and they are university, it's invalid.
      // We can just reject it or delete it.
      await prisma.profileUpdateRequest.update({
        where: { id: req.id },
        data: {
          status: 'REJECTED',
          rejectionReason: 'Parent phone number is not applicable for university students.',
        },
      });
      console.log(`Rejected request ${req.id} as it only contained invalid fields.`);
    } else {
      // They requested other valid things. Just clear the invalid field.
      await prisma.profileUpdateRequest.update({
        where: { id: req.id },
        data: { requestedParentPhone: null },
      });
      console.log(`Cleared requestedParentPhone for request ${req.id}.`);
    }
  }
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
