'use client';

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/_components/AuthProvider";
import QrScanner from "qr-scanner";

/**
 * Página para que los EMPLEADOS escaneen el QR del kiosco
 * y registren su asistencia.
 */
export default function AttendantPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const processingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const switchingRef = useRef(false);
  const initializingRef = useRef(false);
  const cameraIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);

  const [cameras, setCameras] = useState<
    Array<{ id: string; label: string }>
  >([]);

  const [cameraIndex, setCameraIndex] = useState(0);

  const [status, setStatus] = useState<
    'idle' | 'requesting' | 'scanning' | 'detected' |
    'sending' | 'error' | 'success' | 'late'
  >('idle');

  const [qrToken, setQrToken] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState('');

  // ---------------------------------------------------------------------
  // 1. Redirección según sesión y rol
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace("/login");
      } else if (user.role !== "EMPLEADO") {
        router.replace("/");
      }
    }
  }, [authLoading, user, router]);

  // ---------------------------------------------------------------------
  // 2. Inicializar cámara y escáner
  // ---------------------------------------------------------------------

  const startScanner = async () => {
    if (initializingRef.current) return;

    initializingRef.current = true;

    // Si el escáner ya existe, solamente lo reanuda.
    if (scannerRef.current) {
      try {
        await scannerRef.current.start();

        processingRef.current = false;
        setQrToken(null);
        setStatus('scanning');
        setMessage('Escaneando… Apunte el código QR del kiosco.');
      } catch (e) {
        console.error('[QR] Resume error:', e);

        setStatus('error');
        setMessage('No se pudo reiniciar el escáner.');
      } finally {
        initializingRef.current = false;
      }

      return;
    }

    if (!videoRef.current) {
      initializingRef.current = false;
      return;
    }

    setStatus('requesting');
    setMessage('Solicitando acceso a la cámara…');

    try {
      const tempStream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
        });

      tempStream.getTracks().forEach((track) => track.stop());
    } catch (permErr) {
      console.error('[QR] Camera permission error:', permErr);

      setStatus('error');

      setMessage(
        permErr instanceof Error
          ? `Permiso de cámara denegado: ${permErr.message}`
          : 'No se pudo obtener permiso para la cámara.'
      );

      initializingRef.current = false;
      return;
    }

    try {
      const hasCam = await QrScanner.hasCamera();

      if (!hasCam) {
        throw new Error('No se encontró cámara disponible.');
      }

      const camList = await QrScanner.listCameras();

      setCameras(camList);

      const front = camList.find((camera) =>
        /front|user|selfie/i.test(camera.label)
      );

      const chosen = front?.id ?? camList[0]?.id;

      if (!chosen) {
        throw new Error('No se pudo seleccionar una cámara.');
      }

      cameraIdRef.current = chosen;

      const idx = camList.findIndex(
        (camera) => camera.id === chosen
      );

      setCameraIndex(idx >= 0 ? idx : 0);

      const scanner = new QrScanner(
        videoRef.current,
        async (result: any) => {
          // No procesar otro QR mientras exista uno pendiente.
          if (processingRef.current || sendingRef.current) {
            return;
          }

          const token = result?.data?.trim?.() ?? '';

          if (!token) return;

          processingRef.current = true;

          setQrToken(token);
          setStatus('detected');
          setMessage('QR detectado. Confirma la marcación.');

          try {
            await scannerRef.current?.pause(true);
          } catch (e) {
            console.error('[QR] Pause error:', e);
          }
        },
        {
          preferredCamera: chosen,
          returnDetailedScanResult: true,
        }
      );

      scannerRef.current = scanner;

      await scanner.start();

      setStatus('scanning');
      setMessage('Escaneando… Apunte el código QR del kiosco.');
    } catch (e) {
      console.error('[QR] Initialization error:', e);

      setStatus('error');

      setMessage(
        e instanceof Error
          ? `No se pudo acceder a la cámara: ${e.message}`
          : 'Error inesperado al iniciar la cámara.'
      );
    } finally {
      initializingRef.current = false;
    }
  };

  // ---------------------------------------------------------------------
  // 3. Cambiar cámara frontal/trasera
  // ---------------------------------------------------------------------

  const switchCamera = async () => {
    if (switchingRef.current) return;

    switchingRef.current = true;

    if (!scannerRef.current || !videoRef.current) {
      switchingRef.current = false;
      return;
    }

    const previousCamId = cameraIdRef.current;
    const previousIdx = cameraIndex;

    const nextIdx = (cameraIndex + 1) % cameras.length;
    const nextCam = cameras[nextIdx];

    if (!nextCam) {
      setMessage('No hay otra cámara disponible.');
      setStatus('error');

      switchingRef.current = false;
      return;
    }

    try {
      await scannerRef.current.setCamera(nextCam.id);

      cameraIdRef.current = nextCam.id;

      setCameraIndex(nextIdx);
      setStatus('scanning');
      setMessage('Escaneando… Apunte el código QR del kiosco.');
    } catch (e) {
      console.error('[QR] Camera switch error:', e);

      if (previousCamId) {
        try {
          await scannerRef.current.setCamera(previousCamId);

          setCameraIndex(previousIdx);
          cameraIdRef.current = previousCamId;

          setStatus('scanning');
          setMessage('Escaneando… Cámara anterior restaurada.');
        } catch (fallbackErr) {
          console.error('[QR] Camera fallback error:', fallbackErr);

          setStatus('error');

          setMessage(
            'No se pudo iniciar la nueva cámara ni restaurar la anterior.'
          );
        }
      } else {
        setStatus('error');
        setMessage('No se pudo iniciar la cámara.');
      }
    } finally {
      switchingRef.current = false;
    }
  };

  // ---------------------------------------------------------------------
  // 4. Enviar asistencia al backend
  // ---------------------------------------------------------------------

  const sendAttendance = async (token: string) => {
    // Evitar envíos simultáneos.
    if (sendingRef.current) return;

    if (!token || !token.trim()) {
      setStatus('error');
      setMessage('No hay un QR válido para enviar.');
      return;
    }

    sendingRef.current = true;

    setIsSending(true);
    setStatus('sending');
    setMessage('Enviando marcación al servidor…');

    try {
      const res = await fetch('/api/kiosk/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      /*
       * Leer primero como texto.
       * Así evitamos que una respuesta vacía o no JSON
       * provoque el error Unexpected end of JSON input.
       */
      const responseText = await res.text();

      type AttendanceResponse = {
        success?: boolean;
        attendanceId?: string;
        lateMarcacion?: boolean;
        lateMarcacionId?: string;
        message?: string;
        tipo?: string;
        error?: string;
        details?: string;
      };

      let data: AttendanceResponse | null = null;

      if (responseText.trim()) {
        try {
          const parsed: unknown = JSON.parse(responseText);

          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            data = parsed as AttendanceResponse;
          }
        } catch {
          // La respuesta no contiene JSON válido.
          data = null;
        }
      }

      // ---------------------------------------------------------------
      // Respuesta exitosa
      // ---------------------------------------------------------------

      if (res.ok) {
        if (data?.lateMarcacion === true) {
          /*
           * HTTP 202: semana cerrada. La marcación quedó recibida como
           * marcación tardía pendiente de revisión administrativa.
           * No es una asistencia registrada definitivamente.
           */
          setStatus('late');

          const tipoTexto = data.tipo ? ` (${data.tipo})` : '';

          setMessage(
            `⏳ Marcación recibida${tipoTexto}, pendiente de aprobación administrativa. ` +
              'La semana ya estaba cerrada, así que todavía no cuenta como asistencia. ' +
              'Puedes consultar su estado en «Marcaciones».'
          );
        } else if (data?.success === true) {
          setStatus('success');

          setMessage(
            `✅ Marcación registrada (${data.tipo ?? 'tipo no especificado'})`
          );
        } else {
          /*
           * El servidor respondió correctamente a nivel HTTP,
           * pero no entregó la confirmación esperada.
           *
           * No debemos asumir que la asistencia no se registró.
           */
          setStatus('error');

          setMessage(
            `El servidor respondió HTTP ${res.status}, pero no confirmó la marcación. Verifica el módulo de asistencias antes de intentar otra vez.`
          );
        }

        return;
      }

      // ---------------------------------------------------------------
      // Identificar QR vencido
      // ---------------------------------------------------------------

      const serverError = data?.error ?? '';
      const normalizedError = serverError.toLowerCase();
      const normalizedBody = responseText.toLowerCase();

      const tokenExpired =
        normalizedError.includes('código qr expiró') ||
        normalizedError.includes('jwt expired') ||
        normalizedError.includes('token expired') ||
        normalizedBody.includes('jwt expired') ||
        normalizedBody.includes('token expired');

      if (tokenExpired) {
        setQrToken(null);
        setStatus('error');

        setMessage(
          '⚠️ QR vencido. Pulsa "Reanudar escáner" y escanea el QR actualizado.'
        );

        return;
      }

      // ---------------------------------------------------------------
      // Error de autenticación
      // ---------------------------------------------------------------

      if (res.status === 401 && !serverError) {
        setStatus('error');

        setMessage(
          'La sesión no pudo validarse. Inicia sesión nuevamente.'
        );

        return;
      }

      // ---------------------------------------------------------------
      // Otros errores del servidor
      // ---------------------------------------------------------------

      setStatus('error');

      if (serverError) {
        setMessage(
          `❌ ${serverError} (HTTP ${res.status})`
        );
      } else {
        setMessage(
          `El servidor respondió con HTTP ${res.status}, sin proporcionar una descripción del error.`
        );
      }
    } catch (e) {
      console.error('[QR] Attendance request error:', e);

      /*
       * Una falla de comunicación no demuestra que el POST
       * haya fallado antes de llegar al servidor.
       */
      setStatus('error');

      setMessage(
        'No fue posible confirmar la respuesta del servidor. La solicitud pudo haber sido procesada. Consulta el módulo de asistencias antes de volver a marcar.'
      );
    } finally {
      setIsSending(false);
      sendingRef.current = false;
      setQrToken(null);
      processingRef.current = false;

      // El escáner permanece pausado.
      // El usuario debe reanudarlo manualmente.
    }
  };

  // ---------------------------------------------------------------------
  // 5. Limpieza al desmontar
  // ---------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop();
      }

      const stream =
        videoRef.current?.srcObject as MediaStream | null;

      stream?.getTracks().forEach((track) => track.stop());

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------
  // 6. Auto-inicio cuando la autenticación está lista
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!authLoading && user && user.role === "EMPLEADO") {
      startScanner();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // ---------------------------------------------------------------------
  // 7. Interfaz
  // ---------------------------------------------------------------------

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg-main)] text-[var(--color-accent-text)] font-sans p-4">

      <h1 className="text-2xl mb-4">
        Escanear QR – Asistencia
      </h1>

      {status === 'idle' && (
        <button
          className="px-4 py-2 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded"
          onClick={startScanner}
        >
          Iniciar escáner
        </button>
      )}

      {cameras.length > 1 && status === 'scanning' && (
        <button
          className="mt-2 px-3 py-1 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded"
          onClick={switchCamera}
        >
          Cambiar cámara
        </button>
      )}

      <video
        ref={videoRef}
        className="w-full max-w-md rounded-md bg-black mt-4"
        playsInline
        muted
        autoPlay
      />

      <p
        role={status === 'late' ? 'status' : undefined}
        className={`mt-2 text-center max-w-md ${
          status === 'success'
            ? 'rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-3 text-[var(--color-success)]'
            : status === 'error'
              ? 'rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-3 text-[var(--color-error)]'
              : status === 'late'
                ? 'rounded border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-[var(--color-warning)]'
                : 'text-[var(--color-info)]'
        }`}
      >
        {message}
      </p>

      {status === 'error' && (
        <button
          className="mt-2 px-3 py-1 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded"
          onClick={startScanner}
          disabled={isSending}
        >
          Reintentar
        </button>
      )}

      {(status === 'detected' || status === 'sending') && qrToken && (
        <button
          className="mt-2 px-3 py-1 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded"
          onClick={() => sendAttendance(qrToken)}
          disabled={isSending}
        >
          {isSending
            ? 'Enviando…'
            : 'Confirmar marcación'}
        </button>
      )}

      {(status === 'detected' ||
        status === 'success' ||
        status === 'late' ||
        status === 'error') && (
          <button
            className="mt-2 ml-2 px-3 py-1 bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded"
            onClick={async () => {
              if (isSending || initializingRef.current) return;

              try {
                processingRef.current = false;
                setQrToken(null);

                await scannerRef.current?.start();

                setStatus('scanning');
                setMessage('Escaneando… Apunte el código QR actualizado del kiosco.');
              } catch (e) {
                console.error('[QR] Resume error:', e);

                setStatus('error');
                setMessage('No se pudo reanudar el escáner.');
              }
            }}
            disabled={isSending}
          >
            Reanudar escáner
          </button>
        )}

    </div>
  );
}