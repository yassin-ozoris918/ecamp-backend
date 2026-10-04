/**
 * enable-demo-account.ts
 *
 * Upgrades a user account to a "demo" account.
 * Demo accounts bypass all access restrictions:
 *   - Device binding (can log in from any device)
 *   - Course targeting (sees all university + high school courses)
 *   - Paid/code gates (can access all lectures without redeeming codes)
 *   - View limits (no video view count restrictions)
 *
 * Usage:
 *   npx ts-node scripts/enable-demo-account.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'yassinstudy918@gmail.com';

async function main() {
  console.log(`\n🔍 Looking up account: ${DEMO_EMAIL}`);

  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      isDemo: true,
      educationLevel: true,
    },
  });

  if (!user) {
    console.error(`❌ No user found with email: ${DEMO_EMAIL}`);
    process.exit(1);
  }

  console.log('\n📋 Current account state:');
  console.table(user);

  if ((user as any).isDemo) {
    console.log('\n✅ Account is already a demo account. No changes needed.');
    return;
  }

  const updated = await prisma.user.update({
    where: { email: DEMO_EMAIL },
    data: {
      isDemo: true,
      isActive: true,   // ensure the account is active
      deviceId: null,   // clear any device binding so it can log in from any device
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      isDemo: true,
      educationLevel: true,
    },
  });

  console.log('\n✅ Account successfully upgraded to DEMO:');
  console.table(updated);
  console.log('\n🎉 This account can now:');
  console.log('   • Log in from ANY device (no device binding)');
  console.log('   • See ALL courses (university + high school) as a student');
  console.log('   • Access ALL lectures without redeeming codes');
  console.log('   • Watch ALL videos with no view limit restrictions');
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
