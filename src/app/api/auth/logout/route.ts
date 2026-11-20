import { NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear cookie by setting empty value with immediate expiration
  response.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

