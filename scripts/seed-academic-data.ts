import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getOrCreateUniversity(nameAr: string, nameEn: string, sortOrder: number, isOther: boolean = false) {
  let uni = await prisma.academicUniversity.findFirst({ where: { nameAr } });
  if (!uni) {
    uni = await prisma.academicUniversity.create({
      data: { nameAr, nameEn, sortOrder, isOther }
    });
  }
  return uni;
}

async function getOrCreateFaculty(universityId: string, nameAr: string, nameEn: string, sortOrder: number, isOther: boolean = false) {
  let fac = await prisma.academicFaculty.findFirst({ where: { universityId, nameAr } });
  if (!fac) {
    fac = await prisma.academicFaculty.create({
      data: { universityId, nameAr, nameEn, sortOrder, isOther }
    });
  }
  return fac;
}

async function getOrCreateDepartment(universityId: string, facultyId: string, nameAr: string, nameEn: string, sortOrder: number, isOther: boolean = false) {
  let dep = await prisma.academicDepartment.findFirst({ where: { facultyId, nameAr } });
  if (!dep) {
    dep = await prisma.academicDepartment.create({
      data: { universityId, facultyId, nameAr, nameEn, sortOrder, isOther }
    });
  }
  return dep;
}

async function getOrCreateProgram(facultyId: string, departmentId: string | null, nameAr: string, nameEn: string, sortOrder: number, isOther: boolean = false) {
  let prog = await prisma.academicProgram.findFirst({ where: { facultyId, nameAr } }); // Simplified check
  if (!prog) {
    prog = await prisma.academicProgram.create({
      data: { facultyId, departmentId, nameAr, nameEn, sortOrder, isOther }
    });
  }
  return prog;
}

async function main() {
  console.log('Seeding academic master data...');

  // --- 1. جامعة قناة السويس (Suez Canal University) ---
  const scu = await getOrCreateUniversity('جامعة قناة السويس', 'Suez Canal University', 1);
  const scuEng = await getOrCreateFaculty(scu.id, 'كلية الهندسة', 'Faculty of Engineering', 1);
  const scuEngElec = await getOrCreateDepartment(scu.id, scuEng.id, 'الهندسة الكهربائية', 'Electrical Engineering', 1);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة القوى والآلات الكهربائية', 'Power & Electrical Machines', 1);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة الاتصالات والإلكترونيات', 'Communications & Electronics', 2);
  await getOrCreateProgram(scuEng.id, scuEngElec.id, 'هندسة الحاسبات والتحكم', 'Computer & Control Engineering', 3);
  
  const scuEngCivil = await getOrCreateDepartment(scu.id, scuEng.id, 'الهندسة المدنية', 'Civil Engineering', 2);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة الإنشاءات', 'Structural', 1);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة الأشغال العامة', 'Public Works', 2);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة الري والموارد المائية', 'Irrigation & Water Resources', 3);
  await getOrCreateProgram(scuEng.id, scuEngCivil.id, 'هندسة التشييد وإدارة المشروعات', 'Construction & Project Management', 4);

  const scuEngMech = await getOrCreateDepartment(scu.id, scuEng.id, 'الهندسة الميكانيكية', 'Mechanical Engineering', 3);
  await getOrCreateProgram(scuEng.id, scuEngMech.id, 'هندسة الإنتاج والتصميم الميكانيكي', 'Production & Mechanical Design', 1);
  await getOrCreateProgram(scuEng.id, scuEngMech.id, 'هندسة القوى الميكانيكية', 'Mechanical Power', 2);
  
  const scuEngArch = await getOrCreateDepartment(scu.id, scuEng.id, 'هندسة العمارة والتخطيط العمراني', 'Architecture & Urban Planning', 4);
  await getOrCreateProgram(scuEng.id, scuEngArch.id, 'هندسة العمارة', 'Architecture', 1);
  await getOrCreateProgram(scuEng.id, scuEngArch.id, 'هندسة تخطيط المدن', 'Urban Planning', 2);

  const scuComp = await getOrCreateFaculty(scu.id, 'كلية الحاسبات والمعلومات', 'Faculty of Computers & Information', 2);
  const scuCompCs = await getOrCreateDepartment(scu.id, scuComp.id, 'علوم الحاسب', 'Computer Science', 1);
  const scuCompIs = await getOrCreateDepartment(scu.id, scuComp.id, 'نظم المعلومات', 'Information Systems', 2);
  const scuCompIt = await getOrCreateDepartment(scu.id, scuComp.id, 'تكنولوجيا المعلومات', 'Information Technology', 3);
  const scuCompAi = await getOrCreateDepartment(scu.id, scuComp.id, 'الذكاء الاصطناعي وعلوم البيانات', 'AI & Data Science', 4);
  const scuCompSe = await getOrCreateDepartment(scu.id, scuComp.id, 'هندسة البرمجيات', 'Software Engineering', 5);
  const scuCompBio = await getOrCreateDepartment(scu.id, scuComp.id, 'الحوسبة والمعلوماتية الحيوية', 'Bioinformatics', 6);

  // --- 2. جامعة الإسماعيلية الجديدة الأهلية (New Ismailia National University) ---
  const ismailia = await getOrCreateUniversity('جامعة الإسماعيلية الجديدة الأهلية', 'New Ismailia National University', 2);
  const ismailiaEng = await getOrCreateFaculty(ismailia.id, 'كلية الهندسة', 'Faculty of Engineering', 1);
  // Programs directly under faculty
  await getOrCreateProgram(ismailiaEng.id, null, 'هندسة الذكاء الاصطناعي', 'AI Engineering', 1);
  await getOrCreateProgram(ismailiaEng.id, null, 'هندسة التشييد وإدارة المشروعات', 'Construction & Project Management', 2);
  await getOrCreateProgram(ismailiaEng.id, null, 'هندسة نظم الاتصالات الحديثة', 'Modern Communications Systems Engineering', 3);

  await getOrCreateFaculty(ismailia.id, 'كلية الطب البشري', 'Faculty of Medicine', 2);
  await getOrCreateFaculty(ismailia.id, 'كلية طب الأسنان', 'Faculty of Dentistry', 3);
  await getOrCreateFaculty(ismailia.id, 'كلية الصيدلة', 'Faculty of Pharmacy', 4);
  await getOrCreateFaculty(ismailia.id, 'كلية العلاج الطبيعي', 'Faculty of Physical Therapy', 5);
  await getOrCreateFaculty(ismailia.id, 'كلية التمريض', 'Faculty of Nursing', 6);
  await getOrCreateFaculty(ismailia.id, 'كلية تكنولوجيا العلوم الصحية التطبيقية', 'Faculty of Applied Health Sciences Technology', 7);
  await getOrCreateFaculty(ismailia.id, 'كلية التجارة الدولية واللغات', 'Faculty of International Business & Languages', 8);

  // --- 3. جامعة الزقازيق (Zagazig University) ---
  const zagu = await getOrCreateUniversity('جامعة الزقازيق', 'Zagazig University', 3);
  const zaguEng = await getOrCreateFaculty(zagu.id, 'كلية الهندسة', 'Faculty of Engineering', 1);
  await getOrCreateDepartment(zagu.id, zaguEng.id, 'الهندسة المدنية', 'Civil Engineering', 1);
  const zaguEngElec = await getOrCreateDepartment(zagu.id, zaguEng.id, 'الهندسة الكهربائية', 'Electrical Engineering', 2);
  await getOrCreateProgram(zaguEng.id, zaguEngElec.id, 'هندسة الإلكترونيات والاتصالات الكهربائية', 'Electronics & Electrical Communications', 1);
  await getOrCreateProgram(zaguEng.id, zaguEngElec.id, 'هندسة القوى والآلات الكهربائية', 'Power & Electrical Machines', 2);
  const zaguEngMech = await getOrCreateDepartment(zagu.id, zaguEng.id, 'الهندسة الميكانيكية', 'Mechanical Engineering', 3);
  await getOrCreateProgram(zaguEng.id, zaguEngMech.id, 'التصميم الميكانيكي والإنتاج', 'Mechanical Design & Production', 1);
  await getOrCreateProgram(zaguEng.id, zaguEngMech.id, 'القوى الميكانيكية', 'Mechanical Power', 2);
  await getOrCreateDepartment(zagu.id, zaguEng.id, 'الهندسة المعمارية', 'Architecture', 4);
  await getOrCreateDepartment(zagu.id, zaguEng.id, 'الهندسة الصناعية', 'Industrial Engineering', 5);
  await getOrCreateDepartment(zagu.id, zaguEng.id, 'هندسة الحاسبات والمنظومات', 'Computer & Systems Engineering', 6);
  await getOrCreateDepartment(zagu.id, zaguEng.id, 'هندسة المواد', 'Materials Engineering', 7);
  await getOrCreateDepartment(zagu.id, zaguEng.id, 'الفيزياء والرياضيات الهندسية', 'Engineering Physics & Mathematics', 8);

  const zaguComp = await getOrCreateFaculty(zagu.id, 'كلية الحاسبات والمعلومات', 'Faculty of Computers & Information', 2);
  await getOrCreateDepartment(zagu.id, zaguComp.id, 'علوم الحاسب', 'Computer Science', 1);
  await getOrCreateDepartment(zagu.id, zaguComp.id, 'نظم المعلومات', 'Information Systems', 2);
  await getOrCreateDepartment(zagu.id, zaguComp.id, 'تكنولوجيا المعلومات', 'Information Technology', 3);
  await getOrCreateDepartment(zagu.id, zaguComp.id, 'دعم القرار', 'Decision Support', 4);

  // --- 4. جامعة الزقازيق الأهلية (Zagazig National University) ---
  const zaguNat = await getOrCreateUniversity('جامعة الزقازيق الأهلية', 'Zagazig National University', 4);
  const zaguNatEng = await getOrCreateFaculty(zaguNat.id, 'كلية الهندسة', 'Faculty of Engineering', 1);
  await getOrCreateProgram(zaguNatEng.id, null, 'الميكاترونيك', 'Mechatronics', 1);
  await getOrCreateProgram(zaguNatEng.id, null, 'هندسة إنشاءات وإدارة التشييد', 'Construction Engineering & Management', 2);

  const zaguNatComp = await getOrCreateFaculty(zaguNat.id, 'كلية الحاسبات والمعلومات', 'Faculty of Computers & Information', 2);
  await getOrCreateProgram(zaguNatComp.id, null, 'الذكاء الاصطناعي وعلوم البيانات', 'AI & Data Science', 1);
  await getOrCreateProgram(zaguNatComp.id, null, 'المعلوماتية الطبية', 'Medical Informatics', 2);
  await getOrCreateProgram(zaguNatComp.id, null, 'نظم معلومات الطيران', 'Aviation Information Systems', 3);

  // --- 5. أخرى (Other) ---
  const otherUni = await getOrCreateUniversity('أخرى', 'Other', 99, true);

  console.log('Done seeding.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
