'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * Pantalla del kiosco.
 *
 * URL esperada:
 * /kiosk?kioskId=UUID
 *
 * Obtiene un QR temporal desde /api/kiosk/qr.
 * Muestra su cuenta regresiva y lo renueva automáticamente.
 */
export default function KioskPage() {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchingRef = useRef(false);
  const mountedRef = useRef(false);

  // ---------------------------------------------------------------------
  // 1. Obtener kioskId desde la URL
  // ---------------------------------------------------------------------

  const getKioskId = () => {
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams(window.location.search);

    return params.get("kioskId");
  };

  // ---------------------------------------------------------------------
  // 2. Obtener un nuevo QR desde el backend
  // ---------------------------------------------------------------------

  const fetchQr = useCallback(async () => {
    // Evitar solicitudes simultáneas.
    if (fetchingRef.current) return;

    const kioskId = getKioskId();

    if (!kioskId) {
      if (mountedRef.current) {
        setError("Falta el parámetro kioskId en la URL.");
        setQrUrl(null);
        setExpiresAt(null);
      }

      return;
    }

    fetchingRef.current = true;

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(
        `/api/kiosk/qr?kioskId=${encodeURIComponent(kioskId)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      // Leer como texto para manejar respuestas vacías o no JSON.
      const responseText = await response.text();

      let data: {
        qrDataUrl?: string;
        expiresIn?: number;
        error?: string;
      } | null = null;

      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error("El servidor devolvió una respuesta inválida.");
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.error || `Error del servidor: HTTP ${response.status}`
        );
      }

      if (
        !data ||
        typeof data.qrDataUrl !== "string" ||
        !data.qrDataUrl.startsWith("data:image/")
      ) {
        throw new Error("El servidor no devolvió una imagen QR válida.");
      }

      // El valor debe ser positivo y numérico.
      const rawExpiresIn = Number(data.expiresIn);

      if (!Number.isFinite(rawExpiresIn) || rawExpiresIn <= 0) {
        throw new Error("El tiempo de expiración del QR no es válido.");
      }

      /*
       * Normalización:
       * 30     = 30 segundos.
       * 30000  = 30000 milisegundos.
       */
      const expiresInSeconds =
        rawExpiresIn > 1000
          ? rawExpiresIn / 1000
          : rawExpiresIn;

      const expiration = Date.now() + expiresInSeconds * 1000;

      if (!mountedRef.current) return;

      setQrUrl(data.qrDataUrl);
      setExpiresAt(expiration);

      setRemaining(
        Math.max(
          0,
          Math.ceil((expiration - Date.now()) / 1000)
        )
      );

      setError(null);

    } catch (e) {
      console.error("[KIOSK QR] Error al obtener QR:", e);

      if (!mountedRef.current) return;

      setQrUrl(null);
      setExpiresAt(null);
      setRemaining(0);

      setError(
        e instanceof Error
          ? e.message
          : "No se pudo obtener el código QR."
      );

      // Intentar recuperar automáticamente la conexión.
      retryTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          void fetchQr();
        }
      }, 3000);

    } finally {
      fetchingRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // ---------------------------------------------------------------------
  // 3. Primera carga y limpieza
  // ---------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    void fetchQr();

    return () => {
      mountedRef.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [fetchQr]);

  // ---------------------------------------------------------------------
  // 4. Cuenta regresiva y renovación automática
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (expiresAt === null) return;

    const updateCountdown = () => {
      const millisecondsRemaining = expiresAt - Date.now();

      const secondsRemaining = Math.max(
        0,
        Math.ceil(millisecondsRemaining / 1000)
      );

      setRemaining(secondsRemaining);

      /*
       * Solicitar un nuevo QR 2,5 segundos antes
       * de que expire el token actual.
       */
      if (
        millisecondsRemaining <= 2500 &&
        !fetchingRef.current
      ) {
        // Retirar el QR anterior para evitar que se escanee vencido.
        setQrUrl(null);

        void fetchQr();
      }
    };

    updateCountdown();

    timerRef.current = setInterval(
      updateCountdown,
      250
    );

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [expiresAt, fetchQr]);

  // ---------------------------------------------------------------------
  // 5. Estado de conexión
  // ---------------------------------------------------------------------

  const connectionOk = Boolean(qrUrl && !error);

  // ---------------------------------------------------------------------
  // 6. Interfaz
  // ---------------------------------------------------------------------

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D0D] text-[#D9CF43] font-sans p-4">

      <div className="flex flex-col items-center w-full max-w-md rounded-xl bg-[#1A1A1A] border border-[#333333] p-6 shadow-xl">

        <h1 className="text-2xl font-semibold mb-6 text-center">
          Código QR del kiosco
        </h1>

        {/* Estado de carga */}
        {loading && (
          <p className="mb-4 text-sm text-[#D9CF43]">
            {qrUrl
              ? "Renovando código QR..."
              : "Generando código QR..."}
          </p>
        )}

        {/* Imagen QR */}
        <div className="flex items-center justify-center w-[280px] h-[280px] bg-white rounded-lg p-3">

          {qrUrl ? (
            <Image
              src={qrUrl}
              alt="Código QR del kiosco"
              width={256}
              height={256}
              unoptimized
              priority
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-600 text-center">
              <span className="text-4xl mb-3">
                {loading ? "⟳" : "QR"}
              </span>

              <span className="text-sm">
                {loading
                  ? "Generando nuevo código..."
                  : "Código QR no disponible"}
              </span>
            </div>
          )}

        </div>

        {/* Cuenta regresiva */}
        <div className="mt-6 text-center">

          <p className="text-sm text-gray-400 mb-2">
            Tiempo restante del código
          </p>

          <div className="flex items-center justify-center gap-2">

            <span className="text-5xl font-bold tabular-nums">
              {qrUrl ? remaining : "--"}
            </span>

            <span className="text-lg text-gray-400">
              segundos
            </span>

          </div>

          {qrUrl && remaining <= 5 && (
            <p className="mt-2 text-sm text-[#D9CF43]">
              Renovando código...
            </p>
          )}

        </div>

        {/* Barra de estado */}
        <div className="w-full mt-6">

          <div
            className={`flex items-center justify-center gap-2 rounded-md p-3 text-sm ${connectionOk
              ? "bg-green-900/30 text-green-400"
              : "bg-red-900/30 text-red-400"
              }`}
          >
            <span>
              {connectionOk ? "●" : "●"}
            </span>

            <span>
              {connectionOk
                ? "Kiosco conectado"
                : "Esperando conexión"}
            </span>
          </div>

        </div>

        {/* Errores */}
        {error && (
          <div className="w-full mt-4 p-3 rounded-md bg-red-900/30 border border-red-800">

            <p className="text-sm text-red-300 text-center">
              {error}
            </p>

            <p className="text-xs text-gray-400 text-center mt-2">
              Se intentará recuperar la conexión automáticamente.
            </p>

          </div>
        )}

        {/* Información inferior */}
        <p className="text-xs text-gray-500 text-center mt-6">
          El código QR se renueva automáticamente antes de vencer.
        </p>

      </div>

    </main>
  );
}