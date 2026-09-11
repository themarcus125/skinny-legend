import sharp from 'sharp';

export async function makeThumbnail(image: Buffer): Promise<Buffer> {
  return sharp(image).rotate().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
}

/** Re-encodes any supported upload as an EXIF-rotated JPEG, max 1200px long edge, for the vision model. */
export async function normalizeImage(image: Buffer): Promise<Buffer> {
  return sharp(image).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}
