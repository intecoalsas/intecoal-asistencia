import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


/**
 * Formatea una duración en minutos para mostrarla en pantalla.
 * Solo presentación: no altera el valor calculado.
 *   35 → "35 min" · 60 → "1h" · 65 → "1h 5min" · 224 → "3h 44min"
 */
export function formatMinutos(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 60) return `${minutos} min`;
  const total = Math.round(minutos);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
