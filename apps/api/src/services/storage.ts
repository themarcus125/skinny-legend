import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

export const PRESIGN_TTL_SECONDS = 300;

export interface Storage {
  presignPut(key: string, contentType: string): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  listKeys(prefix: string): Promise<{ key: string; lastModified: Date }[]>;
  publicUrl(key: string): Promise<string>;
}

export type UploadKind = 'photo' | 'avatar' | 'feedback';
const PREFIX: Record<UploadKind | 'thumb', string> = { photo: 'photos', thumb: 'thumbs', avatar: 'avatars', feedback: 'feedback' };

export function newKey(kind: UploadKind | 'thumb', userId: string, ext = 'jpg'): string {
  return `${PREFIX[kind]}/${userId}/${randomUUID()}.${ext}`;
}

function r2(): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const Bucket = env.R2_BUCKET;
  return {
    presignPut: (Key, ContentType) => getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: PRESIGN_TTL_SECONDS }),
    async getObject(Key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async putObject(Key, Body, ContentType) { await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType })); },
    async deleteObject(Key) { await client.send(new DeleteObjectCommand({ Bucket, Key })); },
    async listKeys(Prefix) {
      const res = await client.send(new ListObjectsV2Command({ Bucket, Prefix }));
      return (res.Contents ?? []).map((o) => ({ key: o.Key!, lastModified: o.LastModified! }));
    },
    publicUrl: (Key) => getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: 3600 }),
  };
}

export function memoryStorage(): Storage & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    presignPut: async (key) => `memory://put/${key}`,
    getObject: async (key) => { const b = objects.get(key); if (!b) throw new Error(`missing ${key}`); return b; },
    putObject: async (key, body) => { objects.set(key, body); },
    deleteObject: async (key) => { objects.delete(key); },
    listKeys: async (prefix) => [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, lastModified: new Date(0) })),
    publicUrl: async (key) => `memory://get/${key}`,
  };
}

export const storage: Storage = env.AUTH_MODE === 'test' ? memoryStorage() : r2();
