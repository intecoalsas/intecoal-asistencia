// src/app/api/auth/me/route.ts
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

// GET /api/auth/me – devuelve el usuario de la sesión actual
export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return NextResponse.json({ error: 'Sesión no iniciada' }, { status: 401 });
  }
  const match = cookieHeader.match(/session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  if (!token) {
    return NextResponse.json({ error: 'Sesión no iniciada' }, { status: 401 });
  }
  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as { sub: string; role: string };
    const user = await db.user.findUnique({
      where: { id: payload.sub, isActive: true },
      select: { id: true, nombre: true, apellido: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado o inactivo' }, { status: 404 });
    }
    return NextResponse.json({
      id: user.id,
      name: `${user.nombre} ${user.apellido}`,
      role: user.role,
    });
  } catch {
    return NextResponse.json({ error: 'Sesión no válida o expirada' }, { status: 401 });
  }
}
