import { PrismaClient } from '@prisma/client';
import { validateUniversitySegmentation } from '../src/common/utils/segmentation-validation.util';

const prisma = new PrismaClient();

async function main() {
  const check = async (state: any) => {
    try {
      await validateUniversitySegmentation(prisma, { educationLevel: 'UNIVERSITY', ...state } as any);
      return 'VALID';
    } catch (e: any) {
      return e.message;
    }
  }

  // Get active IDs
  const scu = await prisma.academicUniversity.findFirst({ where: { nameEn: 'Suez Canal University' }});
  const ninu = await prisma.academicUniversity.findFirst({ where: { nameEn: 'New Ismailia National University' }});
  const scuEng = await prisma.academicFaculty.findFirst({ where: { nameEn: 'Faculty of Engineering', universityId: scu!.id }});
  const ninuEng = await prisma.academicFaculty.findFirst({ where: { nameEn: 'Faculty of Engineering', universityId: ninu!.id }});
  const scuCivil = await prisma.academicDepartment.findFirst({ where: { nameEn: 'Civil Engineering', facultyId: scuEng!.id }});
  const scuMech = await prisma.academicDepartment.findFirst({ where: { nameEn: 'Mechanical Engineering', facultyId: scuEng!.id }});
  const scuPrep = await prisma.academicDepartment.findFirst({ where: { nameEn: 'Preparatory / Undeclared', facultyId: scuEng!.id }});
  const ninuCivil = await prisma.academicDepartment.findFirst({ where: { nameEn: 'Department of Civil Engineering', facultyId: ninuEng!.id }});
  const scuCivilProg = await prisma.academicProgram.findFirst({ where: { departmentId: scuCivil!.id }});
  const scuMechProg = await prisma.academicProgram.findFirst({ where: { departmentId: scuMech!.id }});
  const ninuCivilProg = await prisma.academicProgram.findFirst({ where: { departmentId: ninuCivil!.id }});

  console.log('--- INVALID COMBINATIONS ---');
  console.log('SCU + NINU faculty:', await check({ universityId: scu!.id, facultyId: ninuEng!.id }));
  console.log('NINU + SCU faculty:', await check({ universityId: ninu!.id, facultyId: scuEng!.id }));
  console.log('SCU Engineering + NINU program:', await check({ universityId: scu!.id, facultyId: scuEng!.id, programId: ninuCivilProg!.id }));
  console.log('SCU Civil + Mechanical program:', await check({ universityId: scu!.id, facultyId: scuEng!.id, departmentId: scuCivil!.id, programId: scuMechProg!.id }));
  console.log('SCU Preparatory + any program:', await check({ universityId: scu!.id, facultyId: scuEng!.id, departmentId: scuPrep!.id, programId: scuCivilProg!.id }));

  console.log('--- VALID COMBINATIONS ---');
  console.log('SCU -> Eng -> Civil -> Structural:', await check({ universityId: scu!.id, facultyId: scuEng!.id, departmentId: scuCivil!.id, programId: scuCivilProg!.id }));
  console.log('SCU -> Eng -> Preparatory -> null:', await check({ universityId: scu!.id, facultyId: scuEng!.id, departmentId: scuPrep!.id, programId: null }));
  console.log('NINU -> Eng -> Civil -> Construction:', await check({ universityId: ninu!.id, facultyId: ninuEng!.id, departmentId: ninuCivil!.id, programId: ninuCivilProg!.id }));

}
main().catch(console.error).finally(() => prisma.$disconnect());
