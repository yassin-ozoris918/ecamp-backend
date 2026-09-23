import { PrismaClient, ProgramType } from '@prisma/client';

const prisma = new PrismaClient();

const SCU_CANONICAL_AR = 'جامعة قناة السويس (SCU)';
const SCU_CANONICAL_EN = 'Suez Canal University (SCU)';
const SCU_VARIANTS = [SCU_CANONICAL_AR, 'جامعة قناة السويس', 'Suez Canal University'];

const NINU_CANONICAL_AR = 'جامعة الإسماعيلية الجديدة الأهلية (NINU)';
const NINU_CANONICAL_EN = 'New Ismailia National University (NINU)';
const NINU_VARIANTS = [NINU_CANONICAL_AR, 'جامعة الإسماعيلية الجديدة الأهلية', 'New Ismailia National University'];

async function getOrCreateUniversity(canonicalAr: string, canonicalEn: string, variants: string[], sortOrder: number) {
  let uni = await prisma.academicUniversity.findFirst({
    where: { nameAr: { in: variants } },
    orderBy: { isActive: 'desc' }
  });

  if (!uni) {
    uni = await prisma.academicUniversity.create({
      data: { nameAr: canonicalAr, nameEn: canonicalEn, sortOrder, isOther: false, isActive: true }
    });
  } else {
    uni = await prisma.academicUniversity.update({
      where: { id: uni.id },
      data: { nameAr: canonicalAr, nameEn: canonicalEn, sortOrder, isOther: false, isActive: true }
    });
  }
  return uni;
}

async function getOrCreateFaculty(universityId: string, nameAr: string, nameEn: string, sortOrder: number) {
  let fac = await prisma.academicFaculty.findFirst({ where: { universityId, nameAr } });
  if (!fac) {
    fac = await prisma.academicFaculty.create({
      data: { universityId, nameAr, nameEn, sortOrder, isOther: false, isActive: true }
    });
  } else {
    fac = await prisma.academicFaculty.update({
      where: { id: fac.id },
      data: { nameEn, sortOrder, isActive: true }
    });
  }
  return fac;
}

async function getOrCreateDepartment(universityId: string, facultyId: string, nameAr: string, nameEn: string, sortOrder: number) {
  let dep = await prisma.academicDepartment.findFirst({ where: { facultyId, nameAr } });
  if (!dep) {
    dep = await prisma.academicDepartment.create({
      data: { universityId, facultyId, nameAr, nameEn, sortOrder, isOther: false, isActive: true }
    });
  } else {
    dep = await prisma.academicDepartment.update({
      where: { id: dep.id },
      data: { nameEn, sortOrder, isActive: true }
    });
  }
  return dep;
}

async function getOrCreateProgram(facultyId: string, departmentId: string | null, nameAr: string, nameEn: string, sortOrder: number, type: ProgramType) {
  let prog = await prisma.academicProgram.findFirst({ where: { facultyId, nameAr, departmentId } });
  if (!prog) {
    prog = await prisma.academicProgram.create({
      data: { facultyId, departmentId, nameAr, nameEn, sortOrder, type, isOther: false, isActive: true }
    });
  } else {
    prog = await prisma.academicProgram.update({
      where: { id: prog.id },
      data: { nameEn, sortOrder, type, isActive: true }
    });
  }
  return prog;
}

async function main() {
  console.log('Seeding active academic master data...');

  // --- 1. SCU ---
  const scu = await getOrCreateUniversity(SCU_CANONICAL_AR, SCU_CANONICAL_EN, SCU_VARIANTS, 1);
  
  // Faculty 1: Engineering
  const scuEng = await getOrCreateFaculty(scu.id, 'كلية الهندسة', 'Faculty of Engineering', 1);
  
  // SCU Eng - Architecture
  const scuEngArch = await getOrCreateDepartment(scu.id, scuEng.id, 'العمارة', 'Architecture', 1);
  await getOrCreateProgram(scuEng.id, scuEngArch.id, 'هندسة العمارة', 'Architecture Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngArch.id, 'هندسة وتكنولوجيا العمارة المستدامة', 'Sustainable Architecture Engineering and Technology', 2, ProgramType.SPECIAL);
  await getOrCreateProgram(scuEng.id, scuEngArch.id, 'هندسة تخطيط المدن', 'Urban Planning Engineering', 3, ProgramType.SPECIAL);
  
  // SCU Eng - Civil
  const scuEngCivil = await getOrCreateDepartment(scu.id, scuEng.id, 'مدني', 'Civil Engineering', 2);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'الهندسة الإنشائية', 'Structural Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة الأشغال العامة', 'Public Works Engineering', 2, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة الري والموارد المائية', 'Water Resources and Irrigation Engineering', 3, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة التشييد وإدارة المشروعات', 'Construction and Project Management Engineering', 4, ProgramType.SPECIAL);

  // SCU Eng - Electrical
  const scuEngElec = await getOrCreateDepartment(scu.id, scuEng.id, 'كهرباء', 'Electrical Engineering', 3);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة القوى والآلات الكهربية', 'Electrical Power and Machines Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة الاتصالات والإلكترونيات', 'Communications and Electronics Engineering', 2, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة الحاسبات والتحكم', 'Computer and Control Engineering', 3, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة تكنولوجيا المعلومات والاتصالات', 'Information and Communications Technology Engineering', 4, ProgramType.SPECIAL);

  // SCU Eng - Mechanical
  const scuEngMech = await getOrCreateDepartment(scu.id, scuEng.id, 'ميكانيكا', 'Mechanical Engineering', 4);
  await getOrCreateProgram(scuEng.id, scuEngMech.id, 'هندسة القوى الميكانيكية', 'Mechanical Power Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngMech.id, 'هندسة الإنتاج والتصميم الميكانيكي', 'Production and Mechanical Design Engineering', 2, ProgramType.REGULAR);
  await getOrCreateProgram(scuEng.id, scuEngMech.id, 'هندسة الطاقة المستدامة', 'Sustainable Energy Engineering', 3, ProgramType.SPECIAL);

  // SCU Eng - Preparatory
  await getOrCreateDepartment(scu.id, scuEng.id, 'إعدادي', 'Preparatory / Undeclared', 5);

  // Faculty 2: Computers and Information
  const scuComp = await getOrCreateFaculty(scu.id, 'كلية الحاسبات والمعلومات', 'Faculty of Computers and Information', 2);
  
  const scuCompCs = await getOrCreateDepartment(scu.id, scuComp.id, 'علوم الحاسب', 'Department of Computer Science', 1);
  const scuCompIs = await getOrCreateDepartment(scu.id, scuComp.id, 'نظم المعلومات', 'Department of Information Systems', 2);
  const scuCompIt = await getOrCreateDepartment(scu.id, scuComp.id, 'تكنولوجيا المعلومات', 'Department of Information Technology', 3);
  
  await getOrCreateProgram(scuComp.id, scuCompCs.id, 'هندسة البرمجيات', 'Software Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(scuComp.id, scuCompCs.id, 'الذكاء الاصطناعي وعلوم البيانات', 'Artificial Intelligence and Data Science', 2, ProgramType.REGULAR);
  await getOrCreateProgram(scuComp.id, scuCompIt.id, 'الأمن السيبراني', 'Cybersecurity', 3, ProgramType.REGULAR);

  // --- 2. NINU ---
  const ninu = await getOrCreateUniversity(NINU_CANONICAL_AR, NINU_CANONICAL_EN, NINU_VARIANTS, 2);
  
  const ninuEng = await getOrCreateFaculty(ninu.id, 'كلية الهندسة', 'Faculty of Engineering', 1);

  // NINU Eng - Civil
  const ninuEngCivil = await getOrCreateDepartment(ninu.id, ninuEng.id, 'قسم الهندسة المدنية', 'Department of Civil Engineering', 1);
  await getOrCreateProgram(ninuEng.id, ninuEngCivil.id, 'هندسة التشييد وإدارة المشروعات', 'Construction and Project Management Engineering', 1, ProgramType.REGULAR);

  // NINU Eng - Electrical
  const ninuEngElec = await getOrCreateDepartment(ninu.id, ninuEng.id, 'قسم الهندسة الكهربائية', 'Department of Electrical Engineering', 2);
  await getOrCreateProgram(ninuEng.id, ninuEngElec.id, 'هندسة الذكاء الاصطناعي', 'Artificial Intelligence Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(ninuEng.id, ninuEngElec.id, 'نظم الاتصالات الحديثة', 'Modern Communication Systems', 2, ProgramType.REGULAR);

  // NINU Eng - Mechanical
  const ninuEngMech = await getOrCreateDepartment(ninu.id, ninuEng.id, 'قسم الهندسة الميكانيكية', 'Department of Mechanical Engineering', 3);
  await getOrCreateProgram(ninuEng.id, ninuEngMech.id, 'هندسة التصميم الابتكاري', 'Innovative Design Engineering', 1, ProgramType.REGULAR);
  await getOrCreateProgram(ninuEng.id, ninuEngMech.id, 'هندسة المواد والتصنيع', 'Materials and Manufacturing Engineering', 2, ProgramType.REGULAR);

  // NINU Eng - Ship
  const ninuEngShip = await getOrCreateDepartment(ninu.id, ninuEng.id, 'قسم هندسة السفن', 'Department of Naval / Ship Engineering', 4);
  await getOrCreateProgram(ninuEng.id, ninuEngShip.id, 'الهندسة البحرية', 'Marine Engineering', 1, ProgramType.REGULAR);

  console.log('Done seeding active academic data.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
