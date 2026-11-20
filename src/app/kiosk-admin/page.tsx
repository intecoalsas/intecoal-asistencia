"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/_components/AuthProvider";
import { useRouter } from "next/navigation";

interface KioskInfo {
  id: string;
  codigo: string;
  nombre?: string;
  ubicacion?: string;
}

interface KioskQrResponse {
  qrDataUrl?: string;
  expiresIn?: number;
  error?: string;
}

export default function KioskAdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [kiosks, setKiosks] = useState<KioskInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [qr, setQr] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // 1. Control de acceso
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (user && user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [user, router]);

  // ---------------------------------------------------------------------
  // 2. Cargar listado de kioscos
  // ---------------------------------------------------------------------

  useEffect(() => {
    let active = true;

    const loadKiosks = async () => {
      try {
        const response = await fetch("/api/kiosk/list", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const responseText = await response.text();

        let data: unknown = null;

        if (responseText.trim()) {
          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error("El servidor devolvió una respuesta inválida.");
          }
        }

        if (!response.ok) {
          const message =
            typeof data === "object" &&
              data !== null &&
              "error" in data &&
              typeof data.error === "string"
              ? data.error
              : `Error HTTP ${response.status}`;

          throw new Error(message);
        }

        if (!Array.isArray(data)) {
          throw new Error("La respuesta de kioscos no es válida.");
        }

        if (active) {
          setKiosks(data as KioskInfo[]);
        }
      } catch (e) {
        console.error("[KIOSK ADMIN] Error al cargar kioscos:", e);

        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo cargar el listado de kioscos."
          );
        }
      }
    };

    void loadKiosks();

    return () => {
      active = false;
    };
  }, []);

  // ---------------------------------------------------------------------
  // 3. Obtener QR y administrar su renovación
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!selected) {
      setQr(null);
      setExpiresIn(0);
      setLoading(false);
      return;
    }

    let active = true;
    let requestInProgress = false;

    let expirationTime: number | null = null;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const scheduleRefresh = (delay: number) => {
      clearRefreshTimer();

      if (!active) return;

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void fetchQr();
      }, delay);
    };

    const fetchQr = async () => {
      if (!active || requestInProgress) return;

      requestInProgress = true;
      clearRefreshTimer();

      setLoading(true);
      setError(null);

      let successful = false;

      try {
        const response = await fetch(
          `/api/kiosk/qr-admin?kioskId=${encodeURIComponent(selected)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const responseText = await response.text();

        let data: KioskQrResponse | null = null;

        if (responseText.trim()) {
          try {
            data = JSON.parse(responseText) as KioskQrResponse;
          } catch {
            throw new Error("El servidor devolvió una respuesta inválida.");
          }
        }

        if (!response.ok) {
          throw new Error(
            data?.error || `Error al obtener QR: HTTP ${response.status}`
          );
        }

        if (
          !data ||
          typeof data.qrDataUrl !== "string" ||
          !data.qrDataUrl.startsWith("data:image/")
        ) {
          throw new Error("El servidor no devolvió una imagen QR válida.");
        }

        const duration = Number(data.expiresIn);

        // El endpoint informa expiresIn en segundos.
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new Error("El tiempo de expiración del QR no es válido.");
        }

        if (!active) return;

        // Calcular la expiración del QR recibido.
        expirationTime = Date.now() + duration * 1000;

        setQr(data.qrDataUrl);
        setExpiresIn(Math.ceil(duration));
        setError(null);

        successful = true;

      } catch (e) {
        console.error("[KIOSK ADMIN] Error al obtener QR:", e);

        if (active) {
          // No conservar un QR que puede estar vencido.
          expirationTime = null;

          setQr(null);
          setExpiresIn(0);

          setError(
            e instanceof Error
              ? e.message
              : "No se pudo obtener el código QR."
          );
        }

      } finally {
        requestInProgress = false;

        if (active) {
          setLoading(false);

          // Renovar a los 25 segundos o reintentar en 3 segundos.
          scheduleRefresh(successful ? 25_000 : 3_000);
        }
      }
    };

    // Primera solicitud al seleccionar el kiosco.
    setQr(null);
    setExpiresIn(0);

    void fetchQr();

    // -------------------------------------------------------------------
    // 4. Cuenta regresiva real
    // -------------------------------------------------------------------

    countdownTimer = setInterval(() => {
      if (!active || expirationTime === null) return;

      const millisecondsRemaining =
        expirationTime - Date.now();

      const secondsRemaining = Math.max(
        0,
        Math.ceil(millisecondsRemaining / 1000)
      );

      setExpiresIn(secondsRemaining);

      // Si el QR vence antes de completar la renovación,
      // dejar de mostrarlo y solicitar uno nuevo.
      if (
        millisecondsRemaining <= 0 &&
        !requestInProgress
      ) {
        setQr(null);
        void fetchQr();
      }
    }, 250);

    // -------------------------------------------------------------------
    // 5. Limpieza de intervalos y solicitudes programadas
    // -------------------------------------------------------------------

    return () => {
      active = false;

      clearRefreshTimer();

      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };

  }, [selected]);

  // ---------------------------------------------------------------------
  // 6. Interfaz
  // ---------------------------------------------------------------------

  return (
    <section className="p-4 min-w-0">

      <h1 className="text-2xl font-bold mb-4 text-[var(--color-text-primary)]">
        Módulo Kiosco – Admin
      </h1>

      {error && (
        <p className="text-[var(--color-error)] mb-3">
          {error}
        </p>
      )}

      {/* Listado de kioscos */}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        {kiosks.map((kiosk) => (
          <button
            key={kiosk.id}
            onClick={() => setSelected(kiosk.id)}
            className={`p-4 border rounded text-left text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition ${selected === kiosk.id
              ? "border-[var(--color-primary)] bg-[var(--color-secondary-soft)]"
              : "border-[var(--color-border)] bg-[var(--color-bg-card)]"
              }`}
          >
            <p className="font-medium">
              {kiosk.nombre ?? kiosk.codigo}
            </p>

            {kiosk.ubicacion && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {kiosk.ubicacion}
              </p>
            )}

            <p className="text-xs text-[var(--color-text-secondary)]">
              ID: {kiosk.id}
            </p>
          </button>
        ))}

      </div>

      {/* Pantalla QR */}

      {selected && (
        <div className="mt-8 flex flex-col items-center">

          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4">
            QR del kiosco seleccionado
          </h2>

          {loading && (
            <p className="text-[var(--color-text-secondary)] mb-3">
              {qr
                ? "Preparando renovación del QR..."
                : "Generando QR..."}
            </p>
          )}

          {/* Imagen */}

          <div className="flex items-center justify-center w-[270px] h-[270px] bg-white rounded-lg p-2">

            {qr ? (
              <Image
                src={qr}
                alt="QR del kiosco"
                width={250}
                height={250}
                unoptimized
                priority
              />
            ) : (
              <p className="text-gray-600 text-center text-sm">
                {loading
                  ? "Generando nuevo código..."
                  : "QR no disponible"}
              </p>
            )}

          </div>

          {/* Cuenta regresiva */}

          <div className="mt-4 text-center">

            <p className="text-[var(--color-text-secondary)] text-sm mb-1">
              Tiempo restante del QR
            </p>

            <p className="text-[var(--color-text-primary)] text-3xl font-bold tabular-nums">
              {qr ? `Expira en ${expiresIn}s` : "Esperando QR..."}
            </p>

            <p className="text-[var(--color-text-secondary)] text-xs mt-2">
              Renovación automática cada 25 segundos.
            </p>

          </div>

          {/* Estado de conexión */}

          <div className="mt-4">

            {qr && !error ? (
              <p className="text-[var(--color-success)] text-sm">
                ● Kiosco conectado
              </p>
            ) : (
              <p className="text-[var(--color-error)] text-sm">
                ● Esperando conexión
              </p>
            )}

          </div>

        </div>
      )}

    </section>
  );
}