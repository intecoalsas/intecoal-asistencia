
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/_components/AuthProvider";

function LoginForm() {
  const [emailOrDoc, setEmailOrDoc] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null); // limpia cualquier error previo antes de cada intento

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrDoc, password }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error de autenticación");
        setLoading(false);
        return;
      }

      await refresh();

      const meRes = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });

      if (!meRes.ok) {
        setError("No se pudo establecer la sesión. Intenta nuevamente");
        setLoading(false);
        return;
      }

      const { role } = (await meRes.json()) as { role: string };

      const nextParam = searchParams.get("next");

      const isInternal = (path: string) =>
        path.startsWith("/") && !path.includes("://");

      const roleAccess: Record<string, string[]> = {
        "/dashboard": ["ADMIN"],
        "/empleados": ["ADMIN", "SUPERVISOR"],
        "/incidencias": ["ADMIN", "SUPERVISOR"],
        "/reportes": ["ADMIN"],
        "/horarios": ["ADMIN"],
        "/marcaciones": ["ADMIN", "EMPLEADO"],
      };

      const canAccess = (path: string) => {
        for (const [prefix, allowed] of Object.entries(roleAccess)) {
          if (path.startsWith(prefix)) {
            return allowed.includes(role);
          }
        }
        return true;
      };

      let destination =
        role === "ADMIN"
          ? "/dashboard"
          : role === "SUPERVISOR"
            ? "/incidencias"
            : role === "EMPLEADO"
              ? "/marcaciones"
              : "/";

      if (
        nextParam &&
        isInternal(nextParam) &&
        canAccess(nextParam)
      ) {
        destination = nextParam;
      }

      router.push(destination);
    } catch (e) {
      setError("Error del servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-main)] text-[var(--color-text-primary)]">
      <form
        onSubmit={handleSubmit}
        method="post"
        action="#"
        className="w-full max-w-sm space-y-4 p-6 bg-[var(--color-bg-card)] border border-[var(--color-border)] border-t-4 border-t-[var(--color-primary)] rounded-lg shadow-sm"
      >
        <h1 className="text-2xl font-bold text-center">
          Iniciar Sesión
        </h1>

        {error && (
          <p className="text-[var(--color-error)] text-center">
            {error}
          </p>
        )}

        <input
          type="text"
          placeholder="Email o documento"
          value={emailOrDoc}
          onChange={(e) => setEmailOrDoc(e.target.value)}
          required
          className="w-full p-2 rounded bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]"
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full p-2 rounded bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full p-2 rounded font-medium bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {loading ? "Cargando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  const fallback = (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-main)] text-[var(--color-text-primary)]">
      <div className="w-full max-w-sm space-y-4 p-6 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg animate-pulse">
        <p className="text-center">Cargando...</p>
        <h1 className="text-2xl font-bold text-center">
          Iniciar Sesión
        </h1>
        <div className="h-10 bg-[var(--color-bg-muted)] rounded" />
        <div className="h-10 bg-[var(--color-bg-muted)] rounded" />
        <div className="h-10 bg-[var(--color-bg-muted)] rounded" />
      </div>
    </div>
  );

  return (
    <Suspense fallback={fallback}>
      <LoginForm />
    </Suspense>
  );
}
