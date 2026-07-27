
const path = require('path');
const crypto = require('crypto');

const allowedMimes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
];
const blockedExtensions = ['.exe', '.dll', '.php', '.js', '.sh', '.bat', '.apk'];

async function simulateUpload(originalname, mimetype, buffer) {
  let output = `[TEST] ${originalname} | Mime: ${mimetype}\n`;
  
  // --- LAYER 1 & 2: Multer FileFilter ---
  const ext = originalname.split('.').pop()?.toLowerCase();
  if (!ext || !['pdf','doc','docx','ppt','pptx','jpg','jpeg','png','webp','txt'].includes(ext)) {
    return output + `❌ REJECTED Layer 1: File extension is not allowed.\n`;
  }

  if (!mimetype.match(/\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation|jpg|jpeg|png|webp|plain)$/)) {
    return output + `❌ REJECTED Layer 2: Only safe document and image files are allowed.\n`;
  }

  output += `✅ Passed Layer 1 & 2 (Multer Interceptor)\n`;

  // --- LAYER 3: Storage Service Magic Byte ---
  try {
    const fileType = await import('file-type');
    const typeInfo = await fileType.default.fromBuffer(buffer);
    let secureExtension = '';
    let secureMime = mimetype;

    if (typeInfo) {
      secureExtension = `.${typeInfo.ext}`;
      secureMime = typeInfo.mime;
      if (!allowedMimes.includes(secureMime)) {
         return output + `❌ REJECTED Layer 3: File type ${secureMime} is not allowed.\n`;
      }
    } else {
      if (mimetype === 'text/plain') {
        let isText = true;
        for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
          if (buffer[i] === 0x00) isText = false;
        }
        if (!isText) return output + `❌ REJECTED Layer 3: Disguised binary file detected.\n`;
        secureExtension = '.txt';
        secureMime = 'text/plain';
      } else {
         return output + `❌ REJECTED Layer 3: Unknown or unsafe file signature detected.\n`;
      }
    }

    const originalExt = path.extname(originalname).toLowerCase();
    if (blockedExtensions.includes(originalExt)) {
      return output + `❌ REJECTED Layer 3: Dangerous file extension detected in original name.\n`;
    }

    const parts = originalname.toLowerCase().split('.');
    for (const part of parts) {
      if (blockedExtensions.includes(`.${part}`)) {
        return output + `❌ REJECTED Layer 3: Hidden executable extension detected.\n`;
      }
    }

    output += `✅ Passed Layer 3! Uploaded as: randomUUID${secureExtension}\n`;
    return output;
  } catch (err) {
    return output + `❌ ERROR: ${err.message}\n`;
  }
}

async function runTests() {
  console.log("=========================================");
  console.log("FILE UPLOAD PENETRATION TEST SIMULATION");
  console.log("=========================================\n");

  // 1. shell.php (mime=image/jpeg)
  console.log(await simulateUpload('shell.php', 'image/jpeg', Buffer.from('<?php echo "hacked"; ?>')));

  // 2. virus.exe (mime=application/pdf)
  // MZ header is 4D 5A
  const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
  console.log(await simulateUpload('virus.exe', 'application/pdf', exeBuffer));

  // 3. invoice.pdf.exe
  console.log(await simulateUpload('invoice.pdf.exe', 'application/pdf', exeBuffer));

  // 4. shell.jpg.php
  console.log(await simulateUpload('shell.jpg.php', 'image/jpeg', Buffer.from('<?php echo "hacked"; ?>')));

  // 5. fake.pdf containing executable bytes
  // Give it a valid pdf extension and mime, but binary EXE bytes
  console.log(await simulateUpload('fake.pdf', 'application/pdf', exeBuffer));

  // 6. zip bomb simulation (actually a valid zip file, but our system doesn't allow zip!)
  // PK header is 50 4B 03 04
  const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
  console.log(await simulateUpload('bomb.zip', 'application/zip', zipBuffer));
  
  // 7. valid jpeg
  const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  console.log(await simulateUpload('vacation.jpg', 'image/jpeg', jpegBuffer));
}

runTests();
