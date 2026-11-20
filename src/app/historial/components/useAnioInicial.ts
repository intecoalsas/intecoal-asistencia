// src/app/historial/components/useAnioInicial.ts
// Hook de un solo uso: detecta el año más reciente con semanas consolidadas
// consultando la API existente /api/historial/anio.
// Prueba currentYear, currentYear+1, currentYear+2.
// Si ninguno tiene datos, deja el año en currentYear.

import { useEffect, useState } from "react";

const currentYear = new Date().getFullYear();
const CANDIDATOS = [currentYear, currentYear + 1, currentYear + 2];

interface ResumenAnualMin {
  anio: number;
  meses: { mes: number; semanas: { inicioSemana: string; finSemana: string }[] }[];
}

/** Resultado del hook: año encontrado + fecha de la última semana con datos */
export interface AnioInicialResult {
  anio: number;
  /** Fecha ISO (YYYY-MM-DD) del inicio de la última semana con datos en ese año */
  ultimaFechaSemana: string | null;
  /** true mientras busca */
  buscando: boolean;
}

export function useAnioInicial(): AnioInicialResult {
  const [result, setResult] = useState<AnioInicialResult>({
    anio: currentYear,
    ultimaFechaSemana: null,
    buscando: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function buscar() {
      for (const candidato of CANDIDATOS) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/historial/anio?anio=${candidato}`, {
            credentials: "include",
          });
          if (!res.ok) continue;
          const j = (await res.json()) as { data: ResumenAnualMin };
          const mesesConDatos = j.data.meses.filter((m) => m.semanas.length > 0);
          if (mesesConDatos.length > 0) {
            // Último mes con datos → última semana de ese mes
            const ultimoMes = mesesConDatos[mesesConDatos.length - 1];
            const ultimaSemana = ultimoMes.semanas[ultimoMes.semanas.length - 1];
            // Tomar inicioSemana como fecha representativa para el input[type=date]
            const fechaStr = ultimaSemana.inicioSemana.slice(0, 10);
            if (!cancelled) {
              setResult({ anio: candidato, ultimaFechaSemana: fechaStr, buscando: false });
            }
            return;
          }
        } catch {
          // Error de red o parseo: continuar con el siguiente candidato
        }
      }
      // Ningún candidato tiene datos
      if (!cancelled) {
        setResult({ anio: currentYear, ultimaFechaSemana: null, buscando: false });
      }
    }

    buscar();
    return () => { cancelled = true; };
  }, []); // un solo disparo al montar

  return result;
}
