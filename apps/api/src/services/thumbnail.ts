import sharp from 'sharp';

export async function makeThumbnail(image: Buffer): Promise<Buffer> {
  return sharp(image).rotate().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
}
