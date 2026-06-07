import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { extractApartmentPdfImagesForPageFromBuffer } from '@/lib/apartments/pdf-import';

describe('PDF import image extraction', () => {
  it('does not use small thumbnails from the next page as a location image', async () => {
    const pdfBuffer = await createPdfWithApartmentAndImagePages([
      [{ width: 800, height: 800 }],
      [
        { width: 243, height: 135 },
        { width: 243, height: 135 },
        { width: 243, height: 135 },
      ],
      [{ width: 800, height: 800 }],
      [
        { width: 673, height: 400 },
        { width: 243, height: 135 },
      ],
    ]);

    const rowWithoutMap = await extractApartmentPdfImagesForPageFromBuffer(pdfBuffer, 1);
    const rowWithMap = await extractApartmentPdfImagesForPageFromBuffer(pdfBuffer, 3);

    expect(rowWithoutMap.layoutImage).toBeTruthy();
    expect(rowWithoutMap.locationImage).toBeNull();
    expect(rowWithMap.layoutImage).toBeTruthy();
    expect(rowWithMap.locationImage).toBeTruthy();
  });
});

async function createPdfWithApartmentAndImagePages(
  pageImages: Array<Array<{ width: number; height: number }>>
) {
  const pdfDoc = await PDFDocument.create();

  for (const images of pageImages) {
    const page = pdfDoc.addPage([1000, 1000]);
    let offsetY = 900;

    for (const imageSize of images) {
      const imageBuffer = await createJpeg(imageSize.width, imageSize.height);
      const image = await pdfDoc.embedJpg(imageBuffer);
      const drawWidth = Math.min(imageSize.width, 700);
      const drawHeight = (drawWidth / imageSize.width) * imageSize.height;
      page.drawImage(image, {
        x: 40,
        y: Math.max(40, offsetY - drawHeight),
        width: drawWidth,
        height: drawHeight,
      });
      offsetY -= drawHeight + 24;
    }
  }

  return Buffer.from(await pdfDoc.save());
}

async function createJpeg(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 245, g: 245, b: 245 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}
