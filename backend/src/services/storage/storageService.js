/**
 * StorageService — abstração de provider de arquivos
 * Provider ativo controlado por STORAGE_PROVIDER no .env
 * local → volume Docker | s3 → AWS S3 | r2 → Cloudflare R2
 */

const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

class StorageService {
  constructor() {
    this.provider  = process.env.STORAGE_PROVIDER || 'local';
    this.localPath = process.env.STORAGE_LOCAL_PATH || '/app/uploads';

    if (this.provider === 'local') {
      fs.mkdirSync(this.localPath, { recursive: true });
    }
  }

  /**
   * Salva um arquivo e retorna a URL pública
   * @param {Buffer} buffer  — conteúdo do arquivo
   * @param {string} originalName — nome original
   * @param {string} folder   — subpasta (ex: 'listings')
   * @returns {Promise<string>} URL pública
   */
  async upload(buffer, originalName, folder = 'misc') {
    const ext      = path.extname(originalName).toLowerCase();
    const filename = `${uuidv4()}${ext}`;

    if (this.provider === 'local') {
      const dir  = path.join(this.localPath, folder);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), buffer);
      return `/uploads/${folder}/${filename}`;
    }

    // Placeholder S3/R2 — ativado apenas mudando STORAGE_PROVIDER no .env
    if (this.provider === 's3' || this.provider === 'r2') {
      // Lazy-load do SDK para não exigir as deps em dev local
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({
        region:   process.env.AWS_REGION || 'auto',
        endpoint: process.env.AWS_ENDPOINT,
        credentials: {
          accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      const key = `${folder}/${filename}`;
      await client.send(new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key:    key,
        Body:   buffer,
        ACL:    'public-read',
        ContentType: this._mime(ext),
      }));
      const base = process.env.AWS_ENDPOINT
        ? `${process.env.AWS_ENDPOINT}/${process.env.AWS_BUCKET_NAME}`
        : `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      return `${base}/${key}`;
    }

    throw new Error(`Storage provider não suportado: ${this.provider}`);
  }

  async delete(url) {
    if (this.provider === 'local') {
      const filePath = path.join(this.localPath, url.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    // S3/R2 delete pode ser implementado após contrato
  }

  _mime(ext) {
    const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    return map[ext] || 'application/octet-stream';
  }
}

module.exports = new StorageService();
