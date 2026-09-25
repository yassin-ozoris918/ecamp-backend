import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
dotenv.config();

async function setCors() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error('Missing R2 environment variables');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const command = new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
          AllowedOrigins: ['*'], // Allowing all origins for the presigned URLs
          ExposeHeaders: [],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  });

  try {
    await client.send(command);
    console.log('Successfully set CORS configuration on bucket:', bucketName);
  } catch (error) {
    console.error('Failed to set CORS:', error);
  }
}

setCors();
