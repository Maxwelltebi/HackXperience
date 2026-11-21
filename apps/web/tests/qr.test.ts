// The ticket QR and the scanner's fallback decoder agree: a ticket code encoded with our QR
// settings, drawn to pixels, decodes back to the same code with jsQR.
import { generateTicketCode } from '@hx/core';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { qrSvg } from '@/lib/server/qr';

function rasterize(text: string, scale = 4, quiet = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = (modules.size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (row + quiet) * scale + dy;
          const x = (col + quiet) * scale + dx;
          const i = (y * size + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    }
  }
  return { pixels, size };
}

describe('ticket QR codes', () => {
  it('decode back to the exact ticket code', () => {
    for (let i = 0; i < 10; i++) {
      const code = generateTicketCode();
      const { pixels, size } = rasterize(code);
      expect(jsQR(pixels, size, size)?.data).toBe(code);
    }
  });

  it('render as inline SVG with transparent background', async () => {
    const svg = await qrSvg(generateTicketCode());
    expect(svg).toMatch(/^<svg[^>]+viewBox/);
    expect(svg.toLowerCase()).toContain('#1f2a37');
    expect(svg).not.toContain('<script');
  });
});
