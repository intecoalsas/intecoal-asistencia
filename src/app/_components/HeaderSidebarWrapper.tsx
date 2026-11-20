// src/app/_components/HeaderSidebarWrapper.tsx
"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

import { useAuth } from "./AuthProvider";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";


export default function HeaderSidebarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isRoot = pathname === "/";
  const { logout, user } = useAuth();
  const role = user?.role;
  const router = useRouter();
  const handleLogout = async () => {
    await logout();
    setDrawerOpen(false);
    router.push('/login');
  };

  const isLogin = pathname === "/login";

  // Mobile drawer state
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDrawerOpen) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDrawerOpen]);

  // Prevent background scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = isDrawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  if (isRoot) {
    // Public landing page – no admin UI
    return <>{children}</>;
  }

  // New: hide layout for login page
  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Desktop sidebar */}
      <nav className="hidden md:block">
        <Sidebar role={role} onLinkClick={() => setDrawerOpen(false)} />
      </nav>

      {/* Mobile drawer */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex"
          onClick={() => setDrawerOpen(false)}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Drawer */}
          <aside
            className="relative w-64 h-full bg-[var(--color-nav-bg)] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Cerrar menú"
              className="absolute top-2 right-2 p-2 text-[var(--color-nav-text)]"
              onClick={() => setDrawerOpen(false)}
            >
              ✕
            </button>
            <Sidebar role={role} onLinkClick={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-auto">
        <Header onMenuClick={() => setDrawerOpen(true)} />
        {children}
      </div>
    </div>
  );
}
