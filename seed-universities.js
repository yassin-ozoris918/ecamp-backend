const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('Seeding Egyptian universities...');

  const universities = [
    { nameEn: 'Suez Canal University',          nameAr: 'جامعة قناة السويس',         sortOrder: 1 },
    { nameEn: 'Cairo University',                nameAr: 'جامعة القاهرة',              sortOrder: 2 },
    { nameEn: 'Ain Shams University',            nameAr: 'جامعة عين شمس',             sortOrder: 3 },
    { nameEn: 'Alexandria University',           nameAr: 'جامعة الإسكندرية',          sortOrder: 4 },
    { nameEn: 'Mansoura University',             nameAr: 'جامعة المنصورة',            sortOrder: 5 },
    { nameEn: 'Tanta University',                nameAr: 'جامعة طنطا',                sortOrder: 6 },
    { nameEn: 'Zagazig University',              nameAr: 'جامعة الزقازيق',            sortOrder: 7 },
    { nameEn: 'Benha University',                nameAr: 'جامعة بنها',                sortOrder: 8 },
    { nameEn: 'Fayoum University',               nameAr: 'جامعة الفيوم',              sortOrder: 9 },
    { nameEn: 'Beni Suef University',            nameAr: 'جامعة بني سويف',           sortOrder: 10 },
    { nameEn: 'Minia University',                nameAr: 'جامعة المنيا',              sortOrder: 11 },
    { nameEn: 'Assiut University',               nameAr: 'جامعة أسيوط',              sortOrder: 12 },
    { nameEn: 'Sohag University',                nameAr: 'جامعة سوهاج',              sortOrder: 13 },
    { nameEn: 'South Valley University',         nameAr: 'جامعة جنوب الوادي',        sortOrder: 14 },
    { nameEn: 'Aswan University',                nameAr: 'جامعة أسوان',              sortOrder: 15 },
    { nameEn: 'Menoufia University',             nameAr: 'جامعة المنوفية',           sortOrder: 16 },
    { nameEn: 'Port Said University',            nameAr: 'جامعة بورسعيد',            sortOrder: 17 },
    { nameEn: 'Damietta University',             nameAr: 'جامعة دمياط',              sortOrder: 18 },
    { nameEn: 'Kafr El Sheikh University',       nameAr: 'جامعة كفر الشيخ',          sortOrder: 19 },
    { nameEn: 'Helwan University',               nameAr: 'جامعة حلوان',              sortOrder: 20 },
    { nameEn: 'Suez University',                 nameAr: 'جامعة السويس',             sortOrder: 21 },
    { nameEn: 'Damanhour University',            nameAr: 'جامعة دمنهور',             sortOrder: 22 },
    { nameEn: 'Arish University',                nameAr: 'جامعة العريش',             sortOrder: 23 },
    { nameEn: 'Luxor University',                nameAr: 'جامعة الأقصر',             sortOrder: 24 },
    { nameEn: 'New Valley University',           nameAr: 'جامعة الوادي الجديد',     sortOrder: 25 },
    { nameEn: 'Matrouh University',              nameAr: 'جامعة مطروح',              sortOrder: 26 },
    { nameEn: 'Al-Azhar University',             nameAr: 'جامعة الأزهر',             sortOrder: 27 },
    { nameEn: 'Misr International University',   nameAr: 'جامعة مصر الدولية',        sortOrder: 28 },
    { nameEn: 'British University in Egypt (BUE)', nameAr: 'الجامعة البريطانية في مصر', sortOrder: 29 },
    { nameEn: 'German University in Cairo (GUC)', nameAr: 'الجامعة الألمانية بالقاهرة', sortOrder: 30 },
    { nameEn: 'American University in Cairo (AUC)', nameAr: 'الجامعة الأمريكية بالقاهرة', sortOrder: 31 },
    { nameEn: 'Future University in Egypt',      nameAr: 'جامعة المستقبل في مصر',   sortOrder: 32 },
    { nameEn: 'Galala University',               nameAr: 'جامعة الجلالة',            sortOrder: 33 },
    { nameEn: 'King Salman International University', nameAr: 'جامعة الملك سلمان الدولية', sortOrder: 34 },
    { nameEn: 'Modern Sciences and Arts University (MSA)', nameAr: 'جامعة العلوم الحديثة والآداب', sortOrder: 35 },
    { nameEn: 'Ahram Canadian University',       nameAr: 'جامعة الأهرام الكندية',   sortOrder: 36 },
  ];

  const created = {};

  for (const uni of universities) {
    let existing = await p.academicUniversity.findFirst({ where: { nameEn: uni.nameEn } });
    if (!existing) {
      existing = await p.academicUniversity.create({ data: uni });
      console.log('  + University: ' + uni.nameEn);
    } else {
      console.log('  = Already exists: ' + uni.nameEn);
    }
    created[uni.nameEn] = existing.id;
  }

  // ── Detailed faculties for Suez Canal University ──────────────
  const scuId = created['Suez Canal University'];
  const scuFaculties = [
    { nameEn: 'Faculty of Medicine',                  nameAr: 'كلية الطب',                       sortOrder: 1 },
    { nameEn: 'Faculty of Pharmacy',                  nameAr: 'كلية الصيدلة',                    sortOrder: 2 },
    { nameEn: 'Faculty of Dentistry',                 nameAr: 'كلية طب الأسنان',                 sortOrder: 3 },
    { nameEn: 'Faculty of Nursing',                   nameAr: 'كلية التمريض',                    sortOrder: 4 },
    { nameEn: 'Faculty of Veterinary Medicine',       nameAr: 'كلية الطب البيطري',               sortOrder: 5 },
    { nameEn: 'Faculty of Engineering',               nameAr: 'كلية الهندسة',                    sortOrder: 6 },
    { nameEn: 'Faculty of Science',                   nameAr: 'كلية العلوم',                     sortOrder: 7 },
    { nameEn: 'Faculty of Commerce',                  nameAr: 'كلية التجارة',                    sortOrder: 8 },
    { nameEn: 'Faculty of Law',                       nameAr: 'كلية الحقوق',                     sortOrder: 9 },
    { nameEn: 'Faculty of Education',                 nameAr: 'كلية التربية',                    sortOrder: 10 },
    { nameEn: 'Faculty of Arts',                      nameAr: 'كلية الآداب',                     sortOrder: 11 },
    { nameEn: 'Faculty of Physical Education',        nameAr: 'كلية التربية الرياضية',           sortOrder: 12 },
    { nameEn: 'Faculty of Agriculture',               nameAr: 'كلية الزراعة',                    sortOrder: 13 },
    { nameEn: 'Faculty of Computers and Information', nameAr: 'كلية الحاسبات والمعلومات',        sortOrder: 14 },
    { nameEn: 'Faculty of Tourism and Hotels',        nameAr: 'كلية السياحة والفنادق',           sortOrder: 15 },
    { nameEn: 'Faculty of Fine Arts',                 nameAr: 'كلية الفنون الجميلة',            sortOrder: 16 },
  ];

  const scuFacultyIds = {};
  for (const fac of scuFaculties) {
    let existing = await p.academicFaculty.findFirst({ where: { universityId: scuId, nameEn: fac.nameEn } });
    if (!existing) {
      existing = await p.academicFaculty.create({ data: { ...fac, universityId: scuId } });
      console.log('    + Faculty (SCU): ' + fac.nameEn);
    }
    scuFacultyIds[fac.nameEn] = existing.id;
  }

  // Other faculty for SCU
  const scuOtherFac = await p.academicFaculty.findFirst({ where: { universityId: scuId, isOther: true } });
  if (!scuOtherFac) {
    await p.academicFaculty.create({ data: { universityId: scuId, nameEn: 'Other', nameAr: 'أخرى', isOther: true, sortOrder: 99 } });
  }

  // Departments for SCU – Medicine
  const scuMedId = scuFacultyIds['Faculty of Medicine'];
  if (scuMedId) {
    const depts = [
      { nameEn: 'Internal Medicine',          nameAr: 'الطب الداخلي',              sortOrder: 1 },
      { nameEn: 'Surgery',                    nameAr: 'الجراحة العامة',             sortOrder: 2 },
      { nameEn: 'Pediatrics',                 nameAr: 'طب الأطفال',                sortOrder: 3 },
      { nameEn: 'Obstetrics and Gynecology',  nameAr: 'النساء والتوليد',           sortOrder: 4 },
      { nameEn: 'Cardiology',                 nameAr: 'أمراض القلب والأوعية',     sortOrder: 5 },
      { nameEn: 'Orthopedic Surgery',         nameAr: 'جراحة العظام',              sortOrder: 6 },
      { nameEn: 'Psychiatry',                 nameAr: 'الطب النفسي',               sortOrder: 7 },
      { nameEn: 'Neurology',                  nameAr: 'الأمراض العصبية',          sortOrder: 8 },
      { nameEn: 'Radiology',                  nameAr: 'الأشعة التشخيصية',         sortOrder: 9 },
      { nameEn: 'Anesthesia',                 nameAr: 'التخدير والعناية المركزة', sortOrder: 10 },
      { nameEn: 'Oncology',                   nameAr: 'أورام',                     sortOrder: 11 },
      { nameEn: 'Ophthalmology',              nameAr: 'طب وجراحة العيون',         sortOrder: 12 },
      { nameEn: 'ENT (Ear, Nose and Throat)', nameAr: 'أمراض الأنف والأذن والحنجرة', sortOrder: 13 },
      { nameEn: 'Dermatology',                nameAr: 'الأمراض الجلدية',          sortOrder: 14 },
    ];
    for (const dept of depts) {
      const existing = await p.academicDepartment.findFirst({ where: { facultyId: scuMedId, nameEn: dept.nameEn } });
      if (!existing) {
        await p.academicDepartment.create({ data: { ...dept, facultyId: scuMedId, universityId: scuId } });
        console.log('      + Dept (SCU Med): ' + dept.nameEn);
      }
    }
    const otherDeptExists = await p.academicDepartment.findFirst({ where: { facultyId: scuMedId, isOther: true } });
    if (!otherDeptExists) {
      await p.academicDepartment.create({ data: { facultyId: scuMedId, universityId: scuId, nameEn: 'Other', nameAr: 'أخرى', isOther: true, sortOrder: 99 } });
    }
  }

  // Departments for SCU – Engineering
  const scuEngId = scuFacultyIds['Faculty of Engineering'];
  if (scuEngId) {
    const depts = [
      { nameEn: 'Civil Engineering',        nameAr: 'الهندسة المدنية',          sortOrder: 1 },
      { nameEn: 'Mechanical Engineering',   nameAr: 'الهندسة الميكانيكية',     sortOrder: 2 },
      { nameEn: 'Electrical Engineering',   nameAr: 'الهندسة الكهربائية',      sortOrder: 3 },
      { nameEn: 'Computer Engineering',     nameAr: 'هندسة الحاسبات',          sortOrder: 4 },
      { nameEn: 'Chemical Engineering',     nameAr: 'الهندسة الكيميائية',      sortOrder: 5 },
      { nameEn: 'Architecture',             nameAr: 'الهندسة المعمارية',       sortOrder: 6 },
      { nameEn: 'Marine Engineering',       nameAr: 'الهندسة البحرية',         sortOrder: 7 },
    ];
    for (const dept of depts) {
      const existing = await p.academicDepartment.findFirst({ where: { facultyId: scuEngId, nameEn: dept.nameEn } });
      if (!existing) {
        await p.academicDepartment.create({ data: { ...dept, facultyId: scuEngId, universityId: scuId } });
      }
    }
    const otherDeptExists = await p.academicDepartment.findFirst({ where: { facultyId: scuEngId, isOther: true } });
    if (!otherDeptExists) {
      await p.academicDepartment.create({ data: { facultyId: scuEngId, universityId: scuId, nameEn: 'Other', nameAr: 'أخرى', isOther: true, sortOrder: 99 } });
    }
  }

  // ── Common faculties for all other universities ───────────────
  const commonFaculties = [
    { nameEn: 'Faculty of Medicine',                  nameAr: 'كلية الطب',                sortOrder: 1 },
    { nameEn: 'Faculty of Pharmacy',                  nameAr: 'كلية الصيدلة',             sortOrder: 2 },
    { nameEn: 'Faculty of Dentistry',                 nameAr: 'كلية طب الأسنان',          sortOrder: 3 },
    { nameEn: 'Faculty of Nursing',                   nameAr: 'كلية التمريض',             sortOrder: 4 },
    { nameEn: 'Faculty of Engineering',               nameAr: 'كلية الهندسة',             sortOrder: 5 },
    { nameEn: 'Faculty of Science',                   nameAr: 'كلية العلوم',              sortOrder: 6 },
    { nameEn: 'Faculty of Commerce',                  nameAr: 'كلية التجارة',             sortOrder: 7 },
    { nameEn: 'Faculty of Law',                       nameAr: 'كلية الحقوق',              sortOrder: 8 },
    { nameEn: 'Faculty of Arts',                      nameAr: 'كلية الآداب',              sortOrder: 9 },
    { nameEn: 'Faculty of Education',                 nameAr: 'كلية التربية',             sortOrder: 10 },
    { nameEn: 'Faculty of Agriculture',               nameAr: 'كلية الزراعة',             sortOrder: 11 },
    { nameEn: 'Faculty of Computers and Information', nameAr: 'كلية الحاسبات والمعلومات', sortOrder: 12 },
    { nameEn: 'Faculty of Veterinary Medicine',       nameAr: 'كلية الطب البيطري',        sortOrder: 13 },
  ];

  const skipUnis = new Set(['Suez Canal University', 'Cairo University']);
  for (const uni of universities) {
    if (skipUnis.has(uni.nameEn)) continue;
    const uniId = created[uni.nameEn];
    if (!uniId) continue;
    for (const fac of commonFaculties) {
      const existing = await p.academicFaculty.findFirst({ where: { universityId: uniId, nameEn: fac.nameEn } });
      if (!existing) {
        await p.academicFaculty.create({ data: { ...fac, universityId: uniId } });
      }
    }
    const otherExists = await p.academicFaculty.findFirst({ where: { universityId: uniId, isOther: true } });
    if (!otherExists) {
      await p.academicFaculty.create({ data: { universityId: uniId, nameEn: 'Other', nameAr: 'أخرى', isOther: true, sortOrder: 99 } });
    }
  }

  // ── Ensure global "Other" university is preserved ─────────────
  const globalOther = await p.academicUniversity.findFirst({ where: { isOther: true } });
  if (!globalOther) {
    await p.academicUniversity.create({ data: { nameEn: 'Other', nameAr: 'أخرى', isOther: true, sortOrder: 99 } });
    console.log('  + Created global Other university');
  }

  const finalUniCount = await p.academicUniversity.count();
  const finalFacCount = await p.academicFaculty.count();
  const finalDeptCount = await p.academicDepartment.count();
  console.log('\nSeeding complete!');
  console.log('  Universities: ' + finalUniCount);
  console.log('  Faculties:    ' + finalFacCount);
  console.log('  Departments:  ' + finalDeptCount);
}

main().catch(console.error).finally(() => p.$disconnect());
