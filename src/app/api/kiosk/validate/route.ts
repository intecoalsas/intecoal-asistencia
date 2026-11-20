import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from "jsonwebtoken";
import type { KioskDevice } from '@prisma/client';

/**
 * Validate a QR token sent by a client.
 * Expected query param: ?token=<jwt>
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Falta el código QR' }, { status: 400 });
  }

  // Decode without verifying to get kioskId
  let decoded: any;
  try {
    decoded = (jwt as any).decode(token) as any;
  } catch {
    return NextResponse.json({ error: 'Formato de código QR no válido' }, { status: 400 });
  }

  const kioskId = decoded?.kioskId;
  if (!kioskId) {
    return NextResponse.json({ error: 'El código QR no identifica el kiosco' }, { status: 400 });
  }

  // Get kiosk secret
  const kiosk = await db.kioskDevice.findUnique({
    where: { id: kioskId, isActive: true },
  });
  if (!kiosk) {
    return NextResponse.json({ error: 'El kiosco no es válido o está inactivo' }, { status: 403 });
  }

  try {
    // Verify signature and expiration
    jwt.verify(token, kiosk.secretKey, { algorithms: ['HS256'] });
    return NextResponse.json({ valid: true });
  } catch (e) {
    return NextResponse.json({ valid: false, error: (e as Error).message }, { status: 401 });
  }
}

