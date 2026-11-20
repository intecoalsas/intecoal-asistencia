import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/kiosk/list
 * Returns active kiosks (id, codigo, nombre, ubicacion).
 * Accessible only by ADMIN users.
 */
export const GET = requireAuth(async () => {
  const kiosks = await db.kioskDevice.findMany({
    where: { isActive: true },
    select: { id: true, codigo: true, nombre: true, ubicacion: true },
  });
  return NextResponse.json(kiosks);
}, ['ADMIN']);

