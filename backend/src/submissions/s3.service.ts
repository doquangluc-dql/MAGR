import { Injectable, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service implements OnModuleInit {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    const isLocalMinio = (process.env.S3_ENDPOINT || '').includes('minio') || (process.env.S3_ENDPOINT || '').includes('localhost') || (process.env.S3_ENDPOINT || '').includes('127.0.0.1');
    
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
      region: process.env.AWS_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: isLocalMinio,
    });
    this.bucket = process.env.S3_BUCKET || 'math-grading';
  }

  async onModuleInit() {
    // Bucket is automatically created by minio-create-bucket container
  }

  async getPresignedUploadUrl(key: string, contentType: string, clientHost?: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 300 });
    
    const s3Internal = process.env.S3_ENDPOINT || 'http://minio:9000';
    const isLocalMinio = s3Internal.includes('minio') || s3Internal.includes('localhost') || s3Internal.includes('127.0.0.1');
    let s3External = process.env.S3_EXTERNAL_ENDPOINT || 'http://localhost:9000';
    
    if (isLocalMinio && clientHost) {
      s3External = `http://${clientHost}:9000`;
    }
    
    return url.replace(s3Internal, s3External);
  }

  getPublicUrl(key: string, clientHost?: string): string {
    const s3Internal = process.env.S3_ENDPOINT || 'http://minio:9000';
    const isLocalMinio = s3Internal.includes('minio') || s3Internal.includes('localhost') || s3Internal.includes('127.0.0.1');
    let s3External = process.env.S3_EXTERNAL_ENDPOINT || 'http://localhost:9000';
    
    if (isLocalMinio && clientHost) {
      s3External = `http://${clientHost}:9000`;
    }
    
    // AWS S3 standard public URL when path style is false
    if (!isLocalMinio) {
      return `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    
    return `${s3External}/${this.bucket}/${key}`;
  }
}
