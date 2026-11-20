import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { generateKioskQr } from '@/lib/kiosk';

/**
 * GET /api/kiosk/qr-admin?kioskId=...
 * Generates a QR code for the specified kiosk.
 * Accessible only by ADMIN users.
 */
export const GET = requireAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const kioskId = searchParams.get('kioskId');

  if (!kioskId) {
    return NextResponse.json({ error: 'Falta el parámetro kioskId' }, { status: 400 });
  }

  const kiosk = await db.kioskDevice.findUnique({
    where: { id: kioskId, isActive: true },
  });

  if (!kiosk) {
    return NextResponse.json({ error: 'Kiosco no encontrado o inactivo' }, { status: 404 });
  }

  const { qrDataUrl, expiresIn } = await generateKioskQr(kiosk);
  return NextResponse.json({ qrDataUrl, expiresIn });
}, ['ADMIN']);

