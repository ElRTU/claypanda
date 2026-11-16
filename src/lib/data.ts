import { localSource } from "./localSource.ts";
import { createSupabaseSource } from "./supabaseSource.ts";
import type { DataSource } from "./types.ts";

// Con las variables de entorno se usa Supabase; sin ellas, el modo demo en memoria.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// "?demo" en la URL enseña el sitio con piezas de ejemplo (para revisar el diseño con el portafolio
// vacío); "?demo=off" vuelve a los datos reales. Dura lo que la pestaña.
function demoRequested(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("demo");
    if (param === "off") sessionStorage.removeItem("demo");
    else if (param !== null) sessionStorage.setItem("demo", "1");
    return sessionStorage.getItem("demo") === "1";
  } catch {
    return false;
  }
}

export const data: DataSource =
  url && key && !demoRequested() ? createSupabaseSource(url.replace(/\/$/, ""), key) : localSource;
