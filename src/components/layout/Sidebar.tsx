
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  Clock,
  AlertCircle,
  Calendar,
  BarChart2,
  QrCode,
  CreditCardReader,
  History,
  CalendarCheck,
} from "lucide-react";
import React from "react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  roles?: string[];
}

const allNavigation: NavItem[] = [
  { name: "Kiosco", href: "/kiosk-admin", icon: CreditCardReader, roles: ["ADMIN"] },
  { name: "Dashboard", href: "/dashboard", icon: Home, roles: ["ADMIN", "SUPERVISOR"] },
  { name: "Empleados", href: "/empleados", icon: Users, roles: ["ADMIN", "SUPERVISOR"] },
  { name: "Escanear QR", href: "/marcar-asistencia", icon: QrCode, roles: ["EMPLEADO"] },
  { name: "Marcaciones", href: "/marcaciones", icon: Clock, roles: ["ADMIN", "EMPLEADO", "SUPERVISOR"] },
  { name: "Incidencias", href: "/incidencias", icon: AlertCircle, roles: ["ADMIN", "SUPERVISOR"] },
  { name: "Horarios",  href: "/horarios",  icon: Calendar, roles: ["ADMIN", "SUPERVISOR"] },
  { name: "Historial", href: "/historial", icon: History,  roles: ["ADMIN", "SUPERVISOR"] },
  { name: "Calendario", href: "/calendario", icon: CalendarCheck, roles: ["ADMIN", "SUPERVISOR"] },
  { name: "Reportes",  href: "/reportes",  icon: BarChart2, roles: ["ADMIN", "SUPERVISOR"] },
];

interface SidebarProps {
  onLinkClick?: () => void;
  role?: string;
}

export default function Sidebar({
  onLinkClick = () => { },
  role,
}: SidebarProps = {}) {
  const pathname = usePathname();

  const navigation = role
    ? allNavigation.filter(
      (item) => !item.roles || item.roles.includes(role)
    )
    : allNavigation;

  return (
    <nav className="w-64 min-h-full bg-[var(--color-nav-bg)] border-r border-[var(--color-nav-border)] text-[var(--color-nav-text)] flex flex-col">
      <ul className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onLinkClick}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${isActive
                  ? "bg-[var(--color-nav-active-bg)] text-[var(--color-nav-active-text)] font-medium"
                  : "text-[var(--color-nav-text)] hover:bg-[var(--color-nav-hover)]"
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span className="inline">{item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
