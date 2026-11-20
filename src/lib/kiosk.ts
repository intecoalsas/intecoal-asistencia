import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import qrcode from 'qrcode';
import type { KioskDevice } from '@prisma/client';

/**
 * Helper that generates a QR code (data‑url) for a kiosk.
 * The implementation mirrors the original logic in
 * src/app/api/kiosk/qr/route.ts so that both device‑auth and
 * admin‑auth flows produce identical JWT payloads.
 */
export async function generateKioskQr(kiosk: KioskDevice) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 30; // 30 seconds validity (unchanged)

  const payload = {
    jti: randomUUID(),
    kioskId: kiosk.id,
    iat,
    exp,
    type: 'KIOSK_QR',
  } as const;

  // Sign with the kiosk's secretKey – never exposed to the client.
  const token = jwt.sign(payload, kiosk.secretKey, { algorithm: 'HS256' });
  const qrDataUrl = await qrcode.toDataURL(token);

  return { qrDataUrl, expiresIn: 30 };
}

