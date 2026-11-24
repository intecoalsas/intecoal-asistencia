import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';
import { leerSecretoRequerido } from '@/lib/secrets';
import {
  claveCuenta,
  minutosDeBloqueo,
  registrarFallo,
  registrarExito,
  limpiarRegistrosAntiguos,
  mensajeBloqueo,
} from '@/lib/login-throttle';

// Hash ficticio para igualar el tiempo de respuesta cuando la cuenta no existe
// (evita revelar su existencia por diferencia de tiempos).
let hashFicticio: string | null = null;
function obtenerHashFicticio(): string {
  const hash = hashFicticio ?? bcrypt.hashSync('intecoal-cuenta-inexistente', 10);
  hashFicticio = hash;
  return hash;
}

function respuestaBloqueo(minutos: number) {
  return NextResponse.json(
    { error: mensajeBloqueo(minutos) },
    { status: 429, headers: { 'Retry-After': String(minutos * 60) } }
  );
}

// POST /api/auth/login
export async function POST(request: Request) {
  try {
    const { emailOrDoc, password } = await request.json();

    if (!emailOrDoc || !password) {
      const res = NextResponse.json(
        { error: 'Ingresa tu correo o documento y tu contraseña' },
        { status: 400 }
      );
      return res;
    }

    limpiarRegistrosAntiguos();

    // F4 — Bloqueo vigente: no se evalúa la contraseña ni se modifica el contador.
    const clave = claveCuenta(String(emailOrDoc));
    const minutosBloqueo = await minutosDeBloqueo(clave);
    if (minutosBloqueo !== null) {
      return respuestaBloqueo(minutosBloqueo);
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: emailOrDoc },
          { documento: emailOrDoc },
        ],
        isActive: true,
      },
    });

    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? obtenerHashFicticio()
    );

    if (!user || !passwordMatches) {
      // Mismo tratamiento para cuentas inexistentes y contraseñas incorrectas.
      const minutos = await registrarFallo(clave);
      if (minutos !== null) {
        return respuestaBloqueo(minutos);
      }
      const res = NextResponse.json(
        { error: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      );
      return res;
    }

    // Revalidar: fallos concurrentes pudieron bloquear la cuenta mientras se
    // verificaba la contraseña. Una contraseña correcta no libera un bloqueo.
    const minutosTrasVerificar = await minutosDeBloqueo(clave);
    if (minutosTrasVerificar !== null) {
      return respuestaBloqueo(minutosTrasVerificar);
    }
    await registrarExito(clave);

    // Generar JWT con vencimiento de 7 días
    const token = jwt.sign(
      { sub: user.id, role: user.role },
      leerSecretoRequerido('NEXTAUTH_SECRET'),
      { expiresIn: '7d' }
    );

    const response = NextResponse.json({
      ok: true,
      role: user.role,
    });

    setSessionCookie(response, token);
    return response;
  } catch (e) {
    console.error('[POST /api/auth/login] Error:', e);

    const res = NextResponse.json(
      { error: 'Error del servidor. Intenta nuevamente' },
      { status: 500 }
    );
    return res;
  }
}
