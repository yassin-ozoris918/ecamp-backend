# Production Migration Strategy: Academic Master Data (University Segmentation)

## CRITICAL WARNING

**DO NOT simply run `npx prisma db push` on the production database!**

The recent schema changes removed legacy string-based columns (`university`, `faculty`, `department`, `academicYear`) and replaced them with structured foreign key relationships (`universityId`, `facultyId`, `departmentId`, `programId`).
If you push the schema destructively before migrating existing production data, **ALL EXISTING ACADEMIC DATA WILL BE PERMANENTLY LOST.**

You MUST follow the exact sequence below to ensure existing production student and course data is preserved.

---

## Migration Sequence

### 1. DATABASE BACKUP
Before performing any operations, take a full logical backup of the production database (e.g., using `pg_dump`).

### 2. LEGACY DATA AUDIT & ARCHIVE
Ensure that you are running the codebase from a commit *prior* to the Prisma schema changes (i.e. where `university`, `faculty`, `department`, and `academicYear` still exist in `schema.prisma`).

Run the provided script to extract and preserve the existing academic data:
```bash
ts-node scripts/archive-academic-year.ts
```
This script must output an immutable CSV/JSON archive of all students and courses currently containing non-null academic text values.

### 3. SEED ACADEMIC MASTER DATA
Run the seed script to populate the new lookup tables (`AcademicUniversity`, `AcademicFaculty`, `AcademicDepartment`, `AcademicProgram`). This script is idempotent and safe to run multiple times:
```bash
npx ts-node scripts/seed-academic-data.ts
```

### 4. DETERMINISTIC DATA MAPPING
Run the audit/migration tool to map legacy raw strings to the newly seeded deterministic IDs.
```bash
npx ts-node scripts/audit-migration.ts
```
Review the output. Only if the mappings are deterministic and correct (no fuzzy mismatches), proceed to the actual execution:
```bash
npx ts-node scripts/migrate-academic-data.ts
```
This will set the foreign keys (`universityId`, `targetUniversityId`, etc.) while the old string columns still exist.

### 5. MIGRATION VERIFICATION
Log into the database manually or use `npx prisma studio` to verify that students who had a legacy string `university` now have a correct non-null `universityId`.
Also verify that `Course` entities have properly populated `targetUniversityId` fields.

### 6. DROP LEGACY COLUMNS (DESTRUCTIVE UPDATE)
Only after completing step 5 and verifying the mapping is successful, you may checkout the latest code (with the new Prisma schema) and apply the changes.

```bash
npx prisma db push
# or npx prisma migrate deploy
```
This will safely drop the redundant legacy columns, apply the `onDelete: Restrict` relationships, and build the required indexes.

### 7. POST-MIGRATION VERIFICATION
Verify that the LMS backend starts successfully and tests the UI flows to ensure dropdowns and courses properly resolve the new structured academic hierarchy.
