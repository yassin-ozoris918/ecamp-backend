const fs = require('fs');

async function log(message) {
  console.log(message);
  fs.appendFileSync('uat_results.txt', message + '\n');
}

async function startUAT() {
  await log('================================================');
  await log('PHASE 6 UAT: END-TO-END WORKFLOW VERIFICATION');
  await log('================================================\n');

  const BASE_URL = 'http://localhost:3000';
  let instructorToken = '';
  let studentToken = '';
  let courseId = '';
  let chapterId = '';
  let lectureId = '';
  let quizId = '';
  let examId = '';
  let activationCode = '';

  const instructorEmail = `inst_${Date.now()}@test.com`;
  const studentEmail = `stu_${Date.now()}@test.com`;

  try {
    // ---------------------------------------------------------
    // TEST SCENARIO 1 — INSTRUCTOR
    // ---------------------------------------------------------
    await log('--- SCENARIO 1: INSTRUCTOR WORKFLOW ---');

    // 1. Create instructor account (We will register an admin/instructor or just register and assume we have a script to promote them, 
    // OR we can just register and use the API to promote them if there's no protection, wait, we need to know the auth flow).
    // Let's first register an account.
    await log(`[1] Registering Instructor Account: ${instructorEmail}`);
    let res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: instructorEmail, password: 'Password123!', fullName: 'Test Instructor', educationLevel: 'UNIVERSITY' })
    });
    let data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    if (res.status !== 201) throw new Error('Failed to register instructor');
    
    // We need instructor token. The API returns tokens on register usually.
    instructorToken = data.accessToken || data.access_token || '';
    if (!instructorToken) {
      // Let's try to login
      res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: instructorEmail, password: 'Password123!' })
      });
      data = await res.json();
      instructorToken = data.accessToken || data.access_token || '';
    }
    
    // In our LMS, new users might be "STUDENT" by default. Let's see if we can create a course.
    await log(`[2] Creating Course`);
    res = await fetch(`${BASE_URL}/courses`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instructorToken}`
      },
      body: JSON.stringify({ title: 'UAT Test Course', description: 'Testing End to End', price: 100 })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    if (res.status === 403) {
      await log('Got 403 Forbidden. The user must be promoted to INSTRUCTOR.');
      // Need to promote user directly in DB using Prisma
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.user.update({
        where: { email: instructorEmail },
        data: { role: 'INSTRUCTOR' }
      });
      await log('Promoted user to INSTRUCTOR via DB.');
      
      // Retry course creation
      res = await fetch(`${BASE_URL}/courses`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${instructorToken}`
        },
        body: JSON.stringify({ title: 'UAT Test Course', description: 'Testing End to End', price: 100 })
      });
      data = await res.json();
      await log(`Status (Retry): ${res.status} | Response: ${JSON.stringify(data)}`);
    }
    courseId = data.id;

    // 3. Create chapter
    await log(`[3] Creating Chapter in Course ${courseId}`);
    res = await fetch(`${BASE_URL}/courses/${courseId}/chapters`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instructorToken}`
      },
      body: JSON.stringify({ title: 'Chapter 1: Intro', order: 1 })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    chapterId = data.id;

    // 4. Create lecture
    await log(`[4] Creating Lecture in Chapter ${chapterId}`);
    res = await fetch(`${BASE_URL}/chapters/${chapterId}/lectures`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instructorToken}`
      },
      body: JSON.stringify({ title: 'Lecture 1: Basics', order: 1, isFree: false })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    lectureId = data.id;

    // 5. Upload attachment marked HOMEWORK
    await log(`[5] Uploading HOMEWORK attachment to Lecture ${lectureId}`);
    // Need a multipart form-data.
    const FormData = require('form-data');
    const form1 = new FormData();
    form1.append('file', Buffer.from('Fake Homework PDF'), { filename: 'homework.pdf', contentType: 'application/pdf' });
    form1.append('type', 'HOMEWORK');
    form1.append('lectureId', lectureId);
    
    res = await fetch(`${BASE_URL}/attachments`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${instructorToken}`,
        ...form1.getHeaders()
      },
      body: form1
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 6. Upload PDF
    await log(`[6] Uploading PDF attachment to Lecture ${lectureId}`);
    const form2 = new FormData();
    form2.append('file', Buffer.from('Fake Reference PDF'), { filename: 'reference.pdf', contentType: 'application/pdf' });
    form2.append('type', 'PDF');
    form2.append('lectureId', lectureId);
    
    res = await fetch(`${BASE_URL}/attachments`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${instructorToken}`,
        ...form2.getHeaders()
      },
      body: form2
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 7. Create quiz
    await log(`[7] Creating Quiz for Lecture ${lectureId}`);
    res = await fetch(`${BASE_URL}/quizzes`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instructorToken}`
      },
      body: JSON.stringify({ lectureId: lectureId, title: 'Lecture 1 Quiz' })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    quizId = data.id;

    // 8. Create exam
    await log(`[8] Creating Exam for Course ${courseId}`);
    res = await fetch(`${BASE_URL}/exams`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instructorToken}`
      },
      body: JSON.stringify({ courseId: courseId, title: 'Midterm Exam', durationMinutes: 60 })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    examId = data.id;

    // 9. Publish course
    await log(`[9] Publishing Course ${courseId}`);
    res = await fetch(`${BASE_URL}/courses/${courseId}/publish`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${instructorToken}`
      }
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 10. Generate activation code
    await log(`[10] Generating Activation Code for Course ${courseId}`);
    res = await fetch(`${BASE_URL}/admin/activation-codes`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instructorToken}`
      },
      body: JSON.stringify({ courseId: courseId, limit: 1 })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    if (res.status === 403) {
       await log('Got 403 Forbidden. Code generation might require ADMIN role. Trying to promote to Admin.');
       const { PrismaClient } = require('@prisma/client');
       const prisma = new PrismaClient();
       await prisma.user.update({
         where: { email: instructorEmail },
         data: { role: 'ADMIN' }
       });
       // Need to re-login to get fresh token with ADMIN role
       res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: instructorEmail, password: 'Password123!' })
       });
       let loginData = await res.json();
       instructorToken = loginData.accessToken;
       
       // Retry code generation
       res = await fetch(`${BASE_URL}/admin/activation-codes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${instructorToken}`
        },
        body: JSON.stringify({ courseId: courseId, count: 1 })
      });
      data = await res.json();
      await log(`Status (Retry): ${res.status} | Response: ${JSON.stringify(data)}`);
    }
    
    if (data && data.length > 0) {
       activationCode = data[0].code;
       await log(`Activation Code generated: ${activationCode}`);
    }

    // ---------------------------------------------------------
    // TEST SCENARIO 2 — STUDENT
    // ---------------------------------------------------------
    await log('\n--- SCENARIO 2: STUDENT WORKFLOW ---');

    // 1. Register student
    await log(`[1] Registering Student Account: ${studentEmail}`);
    res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: 'Password123!', fullName: 'Test Student', educationLevel: 'UNIVERSITY' })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);
    studentToken = data.accessToken || data.access_token || '';
    if (!studentToken) {
      res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentEmail, password: 'Password123!' })
      });
      data = await res.json();
      studentToken = data.accessToken || data.access_token || '';
    }

    // 2. Redeem activation code
    await log(`[2] Redeeming Activation Code: ${activationCode}`);
    res = await fetch(`${BASE_URL}/courses/redeem`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ code: activationCode })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 3. Access course
    await log(`[3] Accessing Course ${courseId}`);
    res = await fetch(`${BASE_URL}/courses/${courseId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${studentToken}`
      }
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data).substring(0, 200)}...`);

    // 4. Watch lecture
    await log(`[4] Watching Lecture ${lectureId} (Fetching stream token)`);
    // Assuming there's a session or stream-token endpoint
    res = await fetch(`${BASE_URL}/lectures/${lectureId}/stream-token`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${studentToken}`
      }
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 5. Download HOMEWORK attachment
    await log(`[5] Fetching attachments for Lecture ${lectureId}`);
    res = await fetch(`${BASE_URL}/lectures/${lectureId}/attachments`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${studentToken}`
      }
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 6. Complete quiz
    await log(`[6] Completing Quiz ${quizId}`);
    res = await fetch(`${BASE_URL}/quizzes/${quizId}/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ responses: [] })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 7. Complete exam
    await log(`[7] Completing Exam ${examId}`);
    res = await fetch(`${BASE_URL}/exams/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ examId: examId, attemptId: 'test-attempt', responses: [] })
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

    // 8. View score
    await log(`[8] Viewing Exam Score`);
    res = await fetch(`${BASE_URL}/exams/${examId}/results`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${studentToken}`
      }
    });
    data = await res.json();
    await log(`Status: ${res.status} | Response: ${JSON.stringify(data)}`);

  } catch (err) {
    await log(`CRITICAL ERROR: ${err.message}`);
    console.error(err);
  }

}

startUAT();
