import { NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { generateKioskQr } from "@/lib/kiosk";

/**
 * GET /api/kiosk/qr
 *
 * Requiere una cookie de autenticación válida del dispositivo:
 * kioskAuth.
 *
 * Genera un código QR temporal firmado con la clave secreta
 * del dispositivo kiosco.
 */
export const GET = requireDeviceAuth(
  async (_request: Request, kiosk) => {
    try {
      const { qrDataUrl, expiresIn } = await generateKioskQr(kiosk);

      return NextResponse.json({
        qrDataUrl,
        expiresIn,
      });
    } catch (error) {
      console.error("[GET /api/kiosk/qr] Error:", error);

      return NextResponse.json(
        { error: "No se pudo generar el código QR" },
        { status: 500 }
      );
    }
  }
);