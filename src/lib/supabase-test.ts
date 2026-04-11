import { supabase } from "./supabase";

export async function testSupabaseConnection() {
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase non configurato",
    };
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return {
        ok: false,
        message: `Errore sessione: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: data.session ? "Connessione ok • sessione trovata" : "Connessione ok • nessuna sessione attiva",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Errore sconosciuto",
    };
  }
}