// src/components/layout/Header.tsx
"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "../../app/_components/AuthProvider";
import { Menu } from "lucide-react";

type HeaderProps = {
  /** Called when the hamburger menu button is clicked (mobile). */
  onMenuClick?: () => void;
};

export default function Header({ onMenuClick }: HeaderProps = {}) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };
  const title = user?.role === 'ADMIN' ? 'INTECOAL Asistencia - Administración' : 'INTECOAL Asistencia';
  return (
    <header className="flex items-center justify-between bg-[var(--color-nav-bg)] border-b border-[var(--color-nav-border)] px-4 py-2">
      {/* Hamburger button – visible on mobile only */}
      {onMenuClick && (
        <button
          aria-label="Abrir menú"
          onClick={onMenuClick}
          className="md:hidden p-2 text-[var(--color-nav-text)]"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      <h1 className="text-xl font-semibold text-[var(--color-nav-text)]">
        {title}
      </h1>
      <button
        onClick={handleLogout}
        className="bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] font-medium px-3 py-1 rounded transition-colors"
        title="Cerrar sesión"
      >
        Cerrar sesión
      </button>
    </header>
  );
}


