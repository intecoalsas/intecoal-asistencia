import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { leerSecretoRequerido } from "./secrets";
import type { Role, User } from "@prisma/client";

interface SessionPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

/**
 * Decodifica el payload de un JWT sin verificarlo.
 * El resultado no debe considerarse confiable hasta verificar la firma.
 */
function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  const parts = token.split(".");

  if (parts.length !== 3) return null;

  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload: unknown = JSON.parse(decoded);

    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return null;
    }

    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extrae el token de sesión de las cookies.
 */
function getTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) return null;

  const match = cookieHeader.match(/session=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Verifica el token y devuelve el usuario asociado.
 */
export async function getUserFromRequest(
  request: Request
): Promise<User | null> {
  const token = getTokenFromRequest(request);

  if (!token) return null;

  // Fuera del try: un secreto mal configurado debe fallar explícitamente,
  // no tratarse como una sesión inválida.
  const secreto = leerSecretoRequerido("NEXTAUTH_SECRET");

  try {
    const payload = jwt.verify(token, secreto) as SessionPayload;

    const user = await db.user.findUnique({
      where: { id: payload.sub },
    });

    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Exige autenticación y uno de los roles permitidos.
 */
export function requireRole(
  handler: (req: Request, user: User) => Promise<NextResponse>,
  allowedRoles: Role[]
) {
  return async (req: Request): Promise<NextResponse> => {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { error: "Sesión no iniciada o expirada" },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Usuario inactivo" },
        { status: 403 }
      );
    }

    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: "No tienes permiso para realizar esta acción" },
        { status: 403 }
      );
    }

    return handler(req, user);
  };
}

/**
 * Obtiene el dispositivo kiosco autenticado mediante su cookie.
 */
export async function getKioskFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) return null;

  const match = cookieHeader.match(/kioskAuth=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token) return null;

  const decoded = decodeJwtPayload(token);

  if (
    !decoded ||
    typeof decoded.sub !== "string" ||
    decoded.type !== "KIOSK_DEVICE"
  ) {
    return null;
  }

  const kiosk = await db.kioskDevice.findUnique({
    where: { id: decoded.sub },
  });

  if (!kiosk || !kiosk.isActive) return null;

  try {
    jwt.verify(token, kiosk.secretKey, {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }

  return kiosk;
}

/**
 * Exige autenticación de un dispositivo kiosco.
 */
export function requireDeviceAuth(
  handler: (req: Request, kiosk: any) => Promise<NextResponse>
) {
  return async (req: Request): Promise<NextResponse> => {
    const kiosk = await getKioskFromRequest(req);

    if (!kiosk) {
      return NextResponse.json(
        { error: "Sesión no iniciada o expirada" },
        { status: 401 }
      );
    }

    return handler(req, kiosk);
  };
}

/**
 * Middleware de autenticación para rutas API.
 * Permite especificar roles opcionales.
 */
export function requireAuth(
  handler: (req: Request, user: User) => Promise<NextResponse>,
  allowedRoles?: Role[]
) {
  return async (req: Request): Promise<NextResponse> => {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { error: "Sesión no iniciada o expirada" },
        { status: 401 }
      );
    }

    // New check: block inactive users
    if (!user.isActive) {
      return NextResponse.json(
        { error: "Usuario inactivo" },
        { status: 403 }
      );
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: "No tienes permiso para realizar esta acción" },
        { status: 403 }
      );
    }

    return handler(req, user);
  };
}

/**
 * Establece la cookie de sesión.
 */
export function setSessionCookie(
  response: NextResponse,
  token: string
) {
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}