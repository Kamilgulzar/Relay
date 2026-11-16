import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

function r2Storage() {
  const {R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY} = process.env;
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return undefined;

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY},
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return {
    async put(key: string, file: File) {
      const body = Buffer.from(await file.arrayBuffer());
      await client.send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'application/octet-stream',
      }));
    },
    async get(key: string) {
      try {
        const result = await client.send(new GetObjectCommand({Bucket: R2_BUCKET, Key: key}));
        return result.Body ? {body: result.Body.transformToWebStream()} : null;
      } catch (error) {
        if (error instanceof Error && error.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async delete(key: string) {
      await client.send(new DeleteObjectCommand({Bucket: R2_BUCKET, Key: key}));
    },
  };
}

export const env = {
  get POSTGRES_URL() {return process.env.POSTGRES_URL;},
  get RELAY_SETUP_TOKEN() {return process.env.RELAY_SETUP_TOKEN;},
  DB: undefined as D1Database | undefined,
  HYPERDRIVE: undefined as {connectionString: string} | undefined,
  get BUCKET() {return r2Storage();},
};

