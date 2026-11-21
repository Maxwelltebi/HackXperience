import 'server-only';
import QRCode from 'qrcode';

/**
 * A QR code as inline SVG, drawn on the server so the browser downloads no QR library.
 * Ink on transparent, so it sits on the neumorphic surface; medium error correction
 * survives a cracked phone screen.
 */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1F2A37', light: '#00000000' },
  });
}
