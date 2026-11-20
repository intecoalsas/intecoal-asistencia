// src/proxy.ts – Next.js 16 Proxy (formerly middleware)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import type { Role } from '@prisma/client';

// Role‑based access matrix – map route prefixes to allowed roles
const roleAccess: Record<string, Role[]> = {
  '/dashboard': ['ADMIN', 'SUPERVISOR'],
  '/empleados': ['ADMIN', 'SUPERVISOR'],
  '/incidencias': ['ADMIN', 'SUPERVISOR'],
  '/reportes': ['ADMIN', 'SUPERVISOR'],
  '/horarios': ['ADMIN', 'EMPLEADO', 'SUPERVISOR'],
  '/marcaciones': ['ADMIN', 'EMPLEADO', 'SUPERVISOR'],
  '/marcar-asistencia': ['EMPLEADO'], // ruta exclusiva del escáner QR
};

// Extract role from the session cookie (server‑side)
async function getUserRole(request: NextRequest): Promise<Role | null> {
  const token = request.cookies.get('session')?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as { sub: string; role: Role };
    // JWT already carries role; additional DB validation can be added elsewhere if needed.
    return payload.role;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internal routes, static assets, images, and API routes to pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/public') ||
    // Recursos PWA públicos (el navegador los solicita sin sesión)
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/apple-icon')
  ) {
    return NextResponse.next();
  }

  // Public pages – login, home (root) and kiosk UI (unrestricted UI)
  const publicPages = ['/', '/login', '/kiosk'];
  if (publicPages.includes(pathname)) {
    const role = await getUserRole(request);
    if (role) {
      // Redirect authenticated users to their appropriate landing page
      let redirectTo: string;
      if (role === 'ADMIN') redirectTo = '/dashboard';
      else if (role === 'SUPERVISOR') redirectTo = '/dashboard';
      else if (role === 'EMPLEADO') redirectTo = '/horarios';
      else redirectTo = '/'; // KIOSCO, etc.
      if (pathname !== redirectTo) {
        return NextResponse.redirect(new URL(redirectTo, request.url));
      }
    }
    return NextResponse.next();
  }

  // Protected routes – require a valid session
  const role = await getUserRole(request);
  if (!role) {
    // No valid session – send to login, preserving intended destination
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role‑based access check
  for (const [routePrefix, allowedRoles] of Object.entries(roleAccess)) {
    if (pathname.startsWith(routePrefix)) {
      if (!allowedRoles.includes(role)) {
        // Redirect to a safe page for the role
        let fallback: string;
        if (role === 'ADMIN') fallback = '/dashboard';
        else if (role === 'SUPERVISOR') fallback = '/dashboard';
        else if (role === 'EMPLEADO') fallback = '/horarios';
        else fallback = '/';
        return NextResponse.redirect(new URL(fallback, request.url));
      }
      break; // matched and allowed
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply proxy to all non‑API, non‑static routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
