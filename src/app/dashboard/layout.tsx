// src/app/dashboard/layout.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import type { Role } from '@prisma/client';
import { Suspense } from 'react';

/** Simple loading fallback displayed while authentication resolves. */
const Loading = () => <div className="p-4">Cargando...</div>;

/** Server‑side component that performs the authentication steps.
 * It runs before rendering the protected children.
 */
async function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Establish DB connection (required for Prisma queries)
  await connection();

  // Retrieve session cookie (cookies() returns a Promise when used on the server)
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) redirect('/login');

  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as {
      sub: string; // user id
      role: Role;
    };
    const user = await db.user.findUnique({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) redirect('/login');
  } catch {
    redirect('/login');
  }

  // Authentication succeeded – render protected content
  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Wrap the auth logic in Suspense so the layout can be cached while the
  // async authentication resolves lazily.
  return (
    <Suspense fallback={<Loading />}>
      <AuthWrapper>{children}</AuthWrapper>
    </Suspense>
  );
}
