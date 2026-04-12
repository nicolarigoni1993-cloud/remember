import React, { useEffect, useMemo, useRef, useState } from "react";



type Filtro = "oggi" | "7giorni" | "30giorni";
type Movimento = "uscita" | "entrata" | "nessuno";

type Voce = {
  id: string;
  titolo: string;
  data: string;
  ora: string;
  tipo: "scadenza" | "appuntamento" | "nota";
  urgente: boolean;
  nota: string;
  importo: number | null;
  movimento: Movimento;
  fatto: boolean;
  notificheMinutiPrima: number[];
};

type User = { id: string; nome: string };

type EntrataExtra = {
  id: string;
  data: string;
  descrizione: string;
  importo: number;
};

type UscitaExtra = {
  id: string;
  data: string;
  descrizione: string;
  importo: number;
  nota: string;
};

type IncassiMese = {
  entrateExtra: EntrataExtra[];
  usciteExtra: UscitaExtra[];
};

type Turno = {
  id: string;
  data: string;
  inizio: string;
  fine: string;
  oreOrdinarie: number;
  oreStraordinarie: number;
  note: string;
};

function safeUUID() {
  return (crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`).toString();
}

function classNameIsEmpty(s: string) {
  return !s || s.trim().length === 0;
}

function yyyymmFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formattaDataBreve(data: string) {
  const [anno, mese, giorno] = data.split("-").map(Number);
  const d = new Date(anno, (mese ?? 1) - 1, giorno ?? 1);
  return d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formattaDataLunga(d: Date) {
  const data = d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const ora = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${data} • ore ${ora}`;
}

function parseOreItaliane(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}



function formatNumeroOre(n: number) {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

function normalizeTurnoLabel(inizio: string, fine: string, note?: string) {
  const i = (inizio || "").trim().toUpperCase();
  const f = (fine || "").trim().toUpperCase();
  const n = (note || "").trim().toUpperCase();

  if (
    n === "RIPOSO" ||
    n.startsWith("RIPOSO •") ||
    i === "RIPOSO" ||
    f === "RIPOSO" ||
    n === "R" ||
    i === "R" ||
    f === "R"
  ) {
    return "R" as const;
  }

  if (
    n === "FERIE" ||
    n.startsWith("FERIE •") ||
    i === "FERIE" ||
    f === "FERIE" ||
    n === "F" ||
    i === "F" ||
    f === "F"
  ) {
    return "F" as const;
  }

  if (
    n === "ASSENZA" ||
    n.startsWith("ASSENZA •") ||
    i === "ASSENZA" ||
    f === "ASSENZA" ||
    n === "A" ||
    i === "A" ||
    f === "A"
  ) {
    return "A" as const;
  }

  const key = `${i}-${f}`;

  if (key === "22:00-06:00" || key === "00:00-06:00") return "N" as const;
  if (key === "06:00-12:00" || key === "06:00-14:00") return "M" as const;
  if (key === "12:00-18:00" || key === "14:00-22:00") return "P" as const;
  if (key === "18:00-00:00") return "S" as const;

  return "T" as const;
}

function descrizioneTurnoBreve(inizio: string, fine: string, note?: string) {
  const sigla = normalizeTurnoLabel(inizio, fine, note);

  if (sigla === "R") return "Riposo";
  if (sigla === "F") return "Ferie";
  if (sigla === "A") return "Assenza";
  if (sigla === "N") return "Notte";
  if (sigla === "M") return "Mattina";
  if (sigla === "P") return "Pomeriggio";
  if (sigla === "S") return "Sera";

  return "Turno";
}

function componiDescrizioneMovimento(categoria: string, dettaglio?: string) {
  const cat = categoria.trim();
  const det = (dettaglio ?? "").trim();
  return det ? `${cat} • ${det}` : cat;
}

function estraiCategoriaMovimento(descrizione: string) {
  const raw = (descrizione || "").trim();
  if (!raw) return "";
  const parts = raw.split("•");
  return (parts[0] ?? "").trim();
}

function estraiDettaglioMovimento(descrizione: string) {
  const raw = (descrizione || "").trim();
  if (!raw) return "";
  const parts = raw.split("•");
  if (parts.length <= 1) return "";
  return parts.slice(1).join("•").trim();
}



const K_USERS = "scadenze_users";
const K_CURR = "scadenze_current_user";
const kVoci = (userId: string) => `voci_scadenze__${userId}`;
const kIncassi = (userId: string) => `incassi_mese__${userId}`;
const kTurni = (userId: string) => `turni_mese__${userId}`;


function caricaUtenti(): User[] {
  const raw = localStorage.getItem(K_USERS);
  if (!raw) return [];

  try {
    const arr = JSON.parse(raw) as any[];
    return arr
      .map((x) => ({
        id: String(x.id ?? safeUUID()),
        nome: String(x.nome ?? "").trim(),
      }))
      .filter((u) => u.nome.length > 0);
  } catch {
    return [];
  }
}

function salvaUtenti(users: User[]) {
  localStorage.setItem(K_USERS, JSON.stringify(users));
}

function caricaUtenteCorrente(): string | null {
  const raw = localStorage.getItem(K_CURR);
  if (!raw) return null;
  return raw;
}

function salvaUtenteCorrente(userId: string | null) {
  if (!userId) localStorage.removeItem(K_CURR);
  else localStorage.setItem(K_CURR, userId);
}

void caricaUtenti;
void salvaUtenti;
void caricaUtenteCorrente;
void salvaUtenteCorrente;

function normalizeVoce(x: any): Voce {
  const importoNum =
    typeof x?.importo === "number"
      ? x.importo
      : x?.importo === null || x?.importo === undefined || x?.importo === ""
      ? null
      : Number(x.importo);

  const movimento: Movimento =
  x?.movimento === "entrata"
    ? "entrata"
    : x?.movimento === "uscita"
    ? "uscita"
    : "nessuno";

  const noti: number[] = Array.isArray(x?.notificheMinutiPrima)
    ? x.notificheMinutiPrima
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const uniq = Array.from(new Set(noti)).sort((a, b) => b - a);
  const urgente = Boolean(x?.urgente === true || x?.priorita === "urgente");

  return {
    id: String(x?.id ?? safeUUID()),
    titolo: String(x?.titolo ?? ""),
    data: String(x?.data ?? ""),
    ora: typeof x?.ora === "string" && x.ora ? x.ora : "09:00",
    tipo:
  x?.tipo === "appuntamento"
    ? "appuntamento"
    : x?.tipo === "nota"
    ? "nota"
    : "scadenza",
    urgente,
    nota: typeof x?.nota === "string" ? x.nota : "",
    importo: Number.isFinite(importoNum) ? importoNum : null,
    movimento,
    fatto: Boolean(x?.fatto),
    notificheMinutiPrima: uniq,
  };
}

function caricaVociDaMemoria(userId: string): Voce[] {
  const testo = localStorage.getItem(kVoci(userId));
  if (!testo) return [];

  try {
    const arr = JSON.parse(testo) as any[];
    return arr.map(normalizeVoce);
  } catch {
    return [];
  }
}

function salvaVociInMemoria(userId: string, voci: Voce[]) {
  localStorage.setItem(kVoci(userId), JSON.stringify(voci));
}

function caricaIncassi(userId: string): Record<string, IncassiMese> {
  const raw = localStorage.getItem(kIncassi(userId));
  if (!raw) return {};

  try {
    const obj = JSON.parse(raw) as Record<string, any>;
    const out: Record<string, IncassiMese> = {};

    for (const [k, v] of Object.entries(obj ?? {})) {
      const vv = v as any;

      const extrasRaw = Array.isArray(vv?.entrateExtra) ? vv.entrateExtra : [];
      const usciteRaw = Array.isArray(vv?.usciteExtra) ? vv.usciteExtra : [];

      out[k] = {
        entrateExtra: extrasRaw
          .map((x: any) => ({
            id: String(x?.id ?? safeUUID()),
            data: String(x?.data ?? ""),
            descrizione: String(x?.descrizione ?? "").trim(),
            importo: Number(x?.importo ?? 0) || 0,
          }))
          .filter((x: EntrataExtra) => x.descrizione.length > 0 && x.importo > 0),

        usciteExtra: usciteRaw
          .map((x: any) => ({
            id: String(x?.id ?? safeUUID()),
            data: String(x?.data ?? ""),
            descrizione: String(x?.descrizione ?? "").trim(),
            importo: Number(x?.importo ?? 0) || 0,
            nota: String(x?.nota ?? "").trim(),
          }))
          .filter((x: UscitaExtra) => x.descrizione.length > 0 && x.importo > 0),
      };
    }

    return out;
  } catch {
    return {};
  }
}

function salvaIncassi(userId: string, m: Record<string, IncassiMese>) {
  localStorage.setItem(kIncassi(userId), JSON.stringify(m));
}

function caricaTurni(userId: string): Turno[] {
  const raw = localStorage.getItem(kTurni(userId));
  if (!raw) return [];

  try {
    const arr = JSON.parse(raw) as any[];
    return arr.map((x) => ({
      id: String(x?.id ?? safeUUID()),
      data: String(x?.data ?? ""),
      inizio: typeof x?.inizio === "string" && x.inizio ? x.inizio : "",
      fine: typeof x?.fine === "string" && x.fine ? x.fine : "",
      oreOrdinarie: Number(x?.oreOrdinarie ?? 0) || 0,
      oreStraordinarie: Number(x?.oreStraordinarie ?? 0) || 0,
      note: String(x?.note ?? ""),
    }));
  } catch {
    return [];
  }
}



function kFerieBase(userId: string) {
  return `remember_ferie_base_${userId}`;
}




function salvaTurni(userId: string, turni: Turno[]) {
  localStorage.setItem(kTurni(userId), JSON.stringify(turni));
}


function caricaFerieBase(userId: string): { giorni: number; ore: number } {
  const raw = localStorage.getItem(kFerieBase(userId));
  if (!raw) {
    return { giorni: 26, ore: 208 };
  }

  try {
    const parsed = JSON.parse(raw) as { giorni?: unknown; ore?: unknown };

    const giorniNum =
      typeof parsed?.giorni === "number" && Number.isFinite(parsed.giorni) && parsed.giorni >= 0
        ? parsed.giorni
        : 26;

    const oreNum =
      typeof parsed?.ore === "number" && Number.isFinite(parsed.ore) && parsed.ore >= 0
        ? parsed.ore
        : 208;

    return {
      giorni: giorniNum,
      ore: oreNum,
    };
  } catch {
    return { giorni: 26, ore: 208 };
  }
}

function salvaFerieBase(userId: string, ferieBase: { giorni: number; ore: number }) {
  localStorage.setItem(kFerieBase(userId), JSON.stringify(ferieBase));
}

function buildDateTime(data: string, ora: string) {
  const [a, m, g] = data.split("-").map(Number);
  const [hh, mm] = ora.split(":").map(Number);
  return new Date(a, (m ?? 1) - 1, g ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

function ymd(y: number, m0: number, d: number) {
  const mm = String(m0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function weekdayMon0(date: Date) {
  const js = date.getDay();
  return (js + 6) % 7;
}

function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate();
}

function giorniMancanti(dataStr: string) {
  const oggi = new Date();
  const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const [a, m, g] = dataStr.split("-").map(Number);
  const d = new Date(a, (m ?? 1) - 1, g ?? 1);
  const ms = d.getTime() - inizioOggi.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function vocePassata(data: string, ora: string) {
  const dt = buildDateTime(data, ora);
  return dt.getTime() < Date.now();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function urgenzaDaGiorni(g: number) {
  const x = 1 - clamp(g, 0, 10) / 10;
  return clamp(x, 0, 1);
}

function labelGiorni(g: number) {
  if (g === 0) return "OGGI";
  if (g > 0) return `- ${g}g`;
  return `+ ${Math.abs(g)}g`;
}

function styleBadgeScadenza(g: number, urgente = false): React.CSSProperties {
  if (urgente) {
    return {
      padding: "8px 12px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 1000,
      letterSpacing: 0.4,
      color: "rgba(255,255,255,0.98)",
      border: "1px solid rgba(255,59,48,0.55)",
      background: "linear-gradient(180deg, rgba(255,59,48,0.98), rgba(185,18,14,0.96))",
      boxShadow: "0 18px 38px rgba(255,59,48,0.32)",
      textTransform: "uppercase",
      animation: "pulseUrgent 1.2s ease-in-out infinite",
      userSelect: "none",
      whiteSpace: "nowrap",
    };
  }

  if (g < 0) {
    return {
      padding: "8px 12px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 1000,
      letterSpacing: 0.4,
      color: "rgba(255,255,255,0.96)",
      border: "1px solid rgba(255,59,48,0.55)",
      background: "linear-gradient(180deg, rgba(255,59,48,0.92), rgba(160,20,16,0.92))",
      boxShadow: "0 16px 36px rgba(255,59,48,0.28)",
      textTransform: "uppercase",
      animation: "pulseUrgent 1.35s ease-in-out infinite",
      userSelect: "none",
      whiteSpace: "nowrap",
    };
  }

  const u = urgenzaDaGiorni(g);
  const alpha1 = 0.18 + u * 0.7;
  const alpha2 = 0.1 + u * 0.62;
  const borderA = 0.18 + u * 0.52;
  const shadowA = 0.08 + u * 0.28;
  const isOggi = g === 0;

  return {
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 0.35,
    color: isOggi ? "rgba(255,255,255,0.96)" : "rgba(130,18,14,0.92)",
    border: `1px solid rgba(255,59,48,${borderA})`,
    background: isOggi
      ? "linear-gradient(180deg, rgba(255,59,48,0.96), rgba(210,24,20,0.96))"
      : `linear-gradient(180deg, rgba(255,59,48,${alpha1}), rgba(255,59,48,${alpha2}))`,
    boxShadow: `0 16px 36px rgba(255,59,48,${shadowA})`,
    textTransform: "uppercase",
    userSelect: "none",
    whiteSpace: "nowrap",
    transition: "transform .12s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease",
  };
}

function ordinaIntelligente(lista: Voce[]) {
  const copie = [...lista];
  copie.sort((a, b) => {
    const d = a.data.localeCompare(b.data);
    if (d !== 0) return d;
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    const o = a.ora.localeCompare(b.ora);
    if (o !== 0) return o;
    return a.titolo.localeCompare(b.titolo);
  });
  return copie;
}

function RememberLogo({ size = 44, centered = false }: { size?: number; centered?: boolean }) {
  const textSize = centered ? 40 : 32;
  const subSize = centered ? 13 : 12;

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: centered ? "center" : "flex-start",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          textAlign: centered ? "center" : "left",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            borderRadius: size * 0.32,
            display: "grid",
            placeItems: "center",
            position: "relative",
            flexShrink: 0,
            background:
              "linear-gradient(145deg, rgba(30,41,59,0.92), rgba(15,23,42,0.98))",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              "0 18px 40px rgba(2,6,23,0.44), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 30px rgba(79,70,229,0.18)",
            overflow: "hidden",
            cursor: "default",
            transition: "transform .22s ease, box-shadow .22s ease, filter .22s ease",
          }}
          title="Remember"
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 28% 24%, rgba(59,130,246,0.30), transparent 34%), radial-gradient(circle at 76% 22%, rgba(168,85,247,0.26), transparent 30%), radial-gradient(circle at 50% 100%, rgba(239,68,68,0.18), transparent 42%)",
              pointerEvents: "none",
            }}
          />

          <svg
            width={size}
            height={size}
            viewBox="0 0 72 72"
            style={{
              position: "relative",
              zIndex: 1,
              filter: "drop-shadow(0 0 12px rgba(99,102,241,0.22))",
            }}
          >
            <defs>
              <linearGradient id="rememberLogoStroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="48%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>

              <linearGradient id="rememberLogoFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
                <stop offset="100%" stopColor="rgba(226,232,240,0.92)" />
              </linearGradient>
            </defs>

            <path
              d="M19 55V17h17.5c9 0 14 4.6 14 11.6 0 5.9-3.4 9.4-8.8 10.7l10.3 15.7H42.5L33.4 40.7H28v14.3H19zm9-21.2h7.4c4.1 0 6.2-1.8 6.2-4.8 0-3.2-2.2-4.9-6.2-4.9H28v9.7z"
              fill="url(#rememberLogoFill)"
            />

            <path
              d="M17 55V17h18.5c10.1 0 15.6 5.3 15.6 12.4 0 5.8-3.1 9.6-8.4 11.4L53 55"
              fill="none"
              stroke="url(#rememberLogoStroke)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          </svg>
        </div>

        <div
          style={{
            display: "grid",
            justifyItems: centered ? "center" : "start",
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: textSize,
              fontWeight: 1000,
              letterSpacing: centered ? -1.5 : -1.2,
              lineHeight: 1,
              background:
                "linear-gradient(90deg, #e2e8f0 0%, #93c5fd 22%, #818cf8 52%, #c084fc 78%, #25303a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 0 24px rgba(99,102,241,0.12)",
            }}
          >
            REMEMBEЯ
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: subSize,
              fontWeight: 900,
              opacity: 0.78,
              letterSpacing: 0.35,
              textAlign: centered ? "center" : "left",
              color: "rgba(191,219,254,0.92)",
            }}
          >
            agenda smart • scadenze • appuntamenti • denaro
          </div>
        </div>
      </div>
    </div>
  );
}







type FiltroFinanza = {
  dal: string;
  al: string;
  categoria: string;
};

type MovimentoFinanzaItem = {
  id: string;
  origine: "uscita-extra" | "voce-uscita";
  meseKeyOrigine?: string;
  data: string;
  descrizione: string;
  importo: number;
  nota: string;
  categoria: string;
  dettaglio: string;
  voceTipo?: Voce["tipo"];
  voceOra?: string;
  voceUrgente?: boolean;
  voceFatto?: boolean;
};










export default function App() {
const [users, setUsers] = useState<User[]>([]);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
const currentUser = useMemo(
  () => users.find((u) => u.id === currentUserId) ?? { id: "guest", nome: "Utente" },
  [users, currentUserId]
);

const [loginNome, setLoginNome] = useState("");
const [, setLoginPick] = useState<string | null>(null);



useEffect(() => {
  const u = caricaUtenti();
  setUsers(u);

  const curr = caricaUtenteCorrente();

  if (curr && u.some((x) => x.id === curr)) {
    setCurrentUserId(curr);
    return;
  }

  if (u.length === 1) {
    setCurrentUserId(u[0].id);
    salvaUtenteCorrente(u[0].id);
    return;
  }

  setCurrentUserId(null);
}, []);







 const [pagina, setPagina] = useState<"home" | "aggiungi" | "consulta" | "agenda" | "controllo" | "archivio" | "note" | "account">("home");
 const [consultaSezione, setConsultaSezione] = useState<"menu" | "turni" | "finanza" | "eventi">("menu");
const [aggiungiSezione, setAggiungiSezione] = useState<"menu" | "movimenti" | "eventi">("menu");
  const [mostraForm, setMostraForm] = useState(false);
  const [idInModifica, setIdInModifica] = useState<string | null>(null);

  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:00");
  const [, setTipo] = useState<Voce["tipo"]>("scadenza");
  const [, setUrgente] = useState(false);
  const [, setNota] = useState("");
  const [, setImporto] = useState<string>("");

  const [notificheMinutiPrima, setNotificheMinutiPrima] = useState<number[]>([]);
  const [customNotificaOre, setCustomNotificaOre] = useState<string>("");
  const [voci, setVoci] = useState<Voce[]>([]);
  const [turni, setTurni] = useState<Turno[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [incassi, setIncassi] = useState<Record<string, IncassiMese>>({});
  const [adesso, setAdesso] = useState(new Date());
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [meseCorrente, setMeseCorrente] = useState(new Date());

  const [ferieTotaliGiorniBase, setFerieTotaliGiorniBase] = useState(26);
  const [ferieTotaliOreBase, setFerieTotaliOreBase] = useState(208);

  const [nuovaEntrataData, setNuovaEntrataData] = useState(new Date().toISOString().slice(0, 10));
  const [nuovaEntrataDesc, setNuovaEntrataDesc] = useState("");
  const [nuovaEntrataImporto, setNuovaEntrataImporto] = useState("");

  const [nuovaUscitaData, setNuovaUscitaData] = useState(new Date().toISOString().slice(0, 10));
  const [nuovaUscitaDesc, setNuovaUscitaDesc] = useState("");
  const [nuovaUscitaImporto, setNuovaUscitaImporto] = useState("");
  const [nuovaUscitaNota, setNuovaUscitaNota] = useState("");

  const [movimentoAperto, setMovimentoAperto] = useState<"entrata" | "uscita" | null>(null);
  const [apriConfigFerie, setApriConfigFerie] = useState(false);

const categorieEntrataBase = useMemo(
  () => ["Stipendio", "Bonus", "Regalo", "Rimborso", "Vendita", "Extra"],
  []
);

const categorieUscitaBase = useMemo(
  () => ["Spesa", "Carburante", "Affitto", "Bollette", "Ristorante", "Svago", "Salute", "Casa"],
  []
);


const [mostraPreviewHome, setMostraPreviewHome] = useState(false);
const [homePreviewTab, setHomePreviewTab] = useState<"oggi" | "domani">("oggi");




const [dataOraCorrenteLabel, setDataOraCorrenteLabel] = useState("");

useEffect(() => {
  const aggiornaDataOra = () => {
    const adesso = new Date();
    const testo = adesso.toLocaleString("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    setDataOraCorrenteLabel(testo);
  };

  aggiornaDataOra();
  const timer = window.setInterval(aggiornaDataOra, 30000);

  return () => window.clearInterval(timer);
}, []);













const K_CATEGORIE_ENTRATA_CUSTOM = "remember_categorie_entrata_custom";
const K_CATEGORIE_USCITA_CUSTOM = "remember_categorie_uscita_custom";

const [categoriaEntrata, setCategoriaEntrata] = useState("");
const [nuovaCategoriaEntrata, setNuovaCategoriaEntrata] = useState("");
const [categorieEntrataCustom] = useState<string[]>(() => {
  try {
    const raw = localStorage.getItem(K_CATEGORIE_ENTRATA_CUSTOM);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
});

const [categoriaUscita, setCategoriaUscita] = useState("");
const [nuovaCategoriaUscita, setNuovaCategoriaUscita] = useState("");
const [categorieUscitaCustom] = useState<string[]>(() => {
  try {
    const raw = localStorage.getItem(K_CATEGORIE_USCITA_CUSTOM);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
});

   const [mostraTurnoForm, setMostraTurnoForm] = useState(false);
  const [turnoData, setTurnoData] = useState(new Date().toISOString().slice(0, 10));
  const [turnoInizio, setTurnoInizio] = useState("08:00");
  const [turnoFine, setTurnoFine] = useState("16:00");
  const [turnoOreOrd, setTurnoOreOrd] = useState("");
  const [turnoOreStraord, setTurnoOreStraord] = useState("");
  const [turnoNote, setTurnoNote] = useState("");
  const [turnoPreset, setTurnoPreset] = useState("");
  const [turnoIdInModifica, setTurnoIdInModifica] = useState<string | null>(null);

 

const [turnoTipo, setTurnoTipo] = useState<"lavoro" | "ferie" | "riposo" | "assenza">("lavoro");
const [, setTurnoModoOreFerie] = useState<"giorni" | "ore">("giorni");
const [, setTurnoQuantitaFerie] = useState("");
const [turnoManuale, setTurnoManuale] = useState(false);
const [turnoModalitaPeriodo, setTurnoModalitaPeriodo] = useState<"singolo" | "intervallo">("singolo");
const [turnoDataFine, setTurnoDataFine] = useState(new Date().toISOString().slice(0, 10));
const [turnoTipoAssenza, setTurnoTipoAssenza] = useState<"malattia" | "104" | "maternita-facoltativa" | "permesso-sindacale">("malattia");

const [turnoAvanzato, setTurnoAvanzato] = useState(false);
const [turnoPausaMinuti, setTurnoPausaMinuti] = useState("0");
const [turnoConsideraSabato, setTurnoConsideraSabato] = useState(false);
const [turnoOrePerGiornoFerie, setTurnoOrePerGiornoFerie] = useState("8");




  const [note, setNote] = useState<{ id: string; testo: string }[]>([]);
const [notaInput, setNotaInput] = useState("");
const [notaInModifica, setNotaInModifica] = useState<string | null>(null);

  const presetTurni = ["00-06", "06-12", "12-18", "18-24", "6-14", "14-22", "22-06", "8-18", "8-17"];




const applicaPresetTurno = (val: string) => {
  setTurnoPreset(val);
  setTurnoManuale(false);

  const parti = val.split("-");
  if (parti.length !== 2) return;

  let start = parti[0].trim();
  let end = parti[1].trim();

  if (/^\d$/.test(start)) start = `0${start}`;
  if (/^\d$/.test(end)) end = `0${end}`;
  if (end === "24") end = "00";

  const inizioFinale = `${start}:00`;
  const fineFinale = `${end}:00`;

  setTurnoInizio(inizioFinale);
  setTurnoFine(fineFinale);

  const pausaPreset = presetPausaMinuti(val);
  setTurnoPausaMinuti(String(pausaPreset));

  const oreEffettive = calcolaOreTurnoEffettive(inizioFinale, fineFinale, pausaPreset);
  setTurnoOreOrd(oreEffettive > 0 ? formatNumeroCompatto(oreEffettive) : "");

  if (turnoOreStraord.trim() === "") {
    setTurnoOreStraord("");
  }
};


  

  const [controlloDettaglioData, setControlloDettaglioData] = useState<string | null>(null);

  const meseKey = useMemo(() => yyyymmFromDate(meseCorrente), [meseCorrente]);


const eventiProssimiAggiungi = useMemo(() => {
  return voci
    .filter((v) => v.tipo === "scadenza" || v.tipo === "appuntamento")
    .filter((v) => !vocePassata(v.data, v.ora))
    .slice()
    .sort((a, b) => {
      const d = a.data.localeCompare(b.data);
      if (d !== 0) return d;
      return a.ora.localeCompare(b.ora);
    })
    .slice(0, 7);
}, [voci]);


  





  const scheduledRef = useRef<Record<string, number[]>>({});

  function clearScheduledForVoce(voceId: string) {
    const ids = scheduledRef.current[voceId] ?? [];
    ids.forEach((t) => window.clearTimeout(t));
    delete scheduledRef.current[voceId];
  }

  function clearAllScheduled() {
    Object.keys(scheduledRef.current).forEach(clearScheduledForVoce);
  }

  function formatLeadTimeLabel(min: number) {
    if (min % 1440 === 0) {
      const giorni = min / 1440;
      return giorni === 1 ? "1 giorno" : `${giorni} giorni`;
    }

    if (min % 60 === 0) {
      const ore = min / 60;
      return ore === 1 ? "1 ora" : `${ore} ore`;
    }

    return min === 1 ? "1 minuto" : `${min} minuti`;
  }

  async function showVoceNotification(v: Voce, min: number, firedKey?: string) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const tipoLabel =
      v.tipo === "scadenza"
        ? "Scadenza"
        : v.tipo === "appuntamento"
        ? "Appuntamento"
        : "Nota";

    const leadLabel = formatLeadTimeLabel(min);
    const titoloNotifica = `${tipoLabel}: ${v.titolo}`;
    const corpoNotifica = `Promemoria ${leadLabel} prima • ${formattaDataBreve(v.data)} • ${v.ora}`;

    const notificationOptions = {
      body: corpoNotifica,
      tag: `remember_${v.id}_${min}`,
      renotify: false,
      data: {
        url: "/",
        voceId: v.id,
        tipo: v.tipo,
      },
    };

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(titoloNotifica, notificationOptions);
      } else {
        new Notification(titoloNotifica, {
          body: corpoNotifica,
        });
      }

      if (firedKey) {
        sessionStorage.setItem(firedKey, "1");
      }
    } catch {
      try {
        new Notification(titoloNotifica, {
          body: corpoNotifica,
        });

        if (firedKey) {
          sessionStorage.setItem(firedKey, "1");
        }
      } catch {}
    }
  }

  function requestNotifyPermission() {
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function scheduleNotificationsForVoce(v: Voce) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    clearScheduledForVoce(v.id);

    if (v.fatto || !v.data || !v.ora || !v.notificheMinutiPrima?.length) return;
    if (v.tipo !== "scadenza" && v.tipo !== "appuntamento" && v.tipo !== "nota") return;

    const dt = buildDateTime(v.data, v.ora).getTime();
    const now = Date.now();
    const ids: number[] = [];

    for (const min of v.notificheMinutiPrima) {
      const at = dt - min * 60_000;
      const diff = at - now;

      if (diff <= 0) continue;
      if (diff > 30 * 24 * 60 * 60 * 1000) continue;

      const id = window.setTimeout(() => {
        const firedKey = `remember_notifica_fired_${v.id}_${min}`;
        if (sessionStorage.getItem(firedKey) === "1") return;

        void showVoceNotification(v, min, firedKey);
      }, diff);

      ids.push(id);
    }

    if (ids.length) {
      scheduledRef.current[v.id] = ids;
    }
  }

  function checkDueNotifications() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const now = Date.now();

    voci.forEach((v) => {
      if (v.fatto || !v.data || !v.ora || !v.notificheMinutiPrima?.length) return;
      if (v.tipo !== "scadenza" && v.tipo !== "appuntamento" && v.tipo !== "nota") return;

      const dt = buildDateTime(v.data, v.ora).getTime();

      v.notificheMinutiPrima.forEach((min) => {
        const at = dt - min * 60_000;
        const diff = now - at;
        const firedKey = `remember_notifica_fired_${v.id}_${min}`;

        if (diff >= 0 && diff <= 60_000) {
          if (sessionStorage.getItem(firedKey) === "1") return;
          void showVoceNotification(v, min, firedKey);
        }
      });
    });
  }

  useEffect(() => {
    const timer = setInterval(() => setAdesso(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);



  useEffect(() => {
    clearAllScheduled();

    if (!currentUserId) {
      setVoci([]);
      setTurni([]);
      setIncassi({});
      setFerieTotaliGiorniBase(26);
      setFerieTotaliOreBase(208);
      setCaricato(false);
      return;
    }

    salvaUtenteCorrente(currentUserId);

    setVoci(caricaVociDaMemoria(currentUserId));
    setTurni(caricaTurni(currentUserId));
    setIncassi(caricaIncassi(currentUserId));

    const ferieBase = caricaFerieBase(currentUserId);
    setFerieTotaliGiorniBase(ferieBase.giorni);
    setFerieTotaliOreBase(ferieBase.ore);

    setCaricato(true);
    requestNotifyPermission();
  }, [currentUserId]);

  useEffect(() => {
    if (!caricato || !currentUserId) return;
    salvaVociInMemoria(currentUserId, voci);
  }, [voci, caricato, currentUserId]);

  useEffect(() => {
    if (!caricato || !currentUserId) return;
    salvaTurni(currentUserId, turni);
  }, [turni, caricato, currentUserId]);

  useEffect(() => {
    if (!caricato || !currentUserId) return;
    salvaIncassi(currentUserId, incassi);
  }, [incassi, caricato, currentUserId]);

  useEffect(() => {
    if (!caricato || !currentUserId) return;

    salvaFerieBase(currentUserId, {
      giorni: ferieTotaliGiorniBase,
      ore: ferieTotaliOreBase,
    });
  }, [currentUserId, caricato, ferieTotaliGiorniBase, ferieTotaliOreBase]);

  useEffect(() => {
    if (!currentUserId) return;
    clearAllScheduled();
    voci.forEach(scheduleNotificationsForVoce);
  }, [voci, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    checkDueNotifications();

    const interval = window.setInterval(() => {
      checkDueNotifications();
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkDueNotifications();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [voci, currentUserId]);

  useEffect(() => {
    setVoci((prev) => {
      let changed = false;

      const next = prev.map((v) => {
        if (!v.fatto && vocePassata(v.data, v.ora)) {
          changed = true;
          return { ...v, fatto: true };
        }
        return v;
      });

      return changed ? next : prev;
    });
  }, [adesso]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mostraForm) chiudiForm();
        if (mostraTurnoForm) chiudiTurnoForm();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mostraForm, mostraTurnoForm]);

const ui = useMemo(() => {
  const glass = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(2,6,23,0.78)",
    boxShadow:
      "0 34px 90px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.05)",
    borderRadius: 26,
    backdropFilter: "blur(20px)",
    color: "rgba(241,245,249,0.97)",
  } as const;

  const card = {
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(2,6,23,0.95), rgba(15,23,42,0.90))",
    boxShadow:
      "0 28px 80px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.04)",
    borderRadius: 24,
    backdropFilter: "blur(20px)",
    color: "rgba(241,245,249,0.97)",
  } as const;

  return { glass, card };
}, []);



useEffect(() => {
  if (!currentUserId) return;
  const raw = localStorage.getItem(`remember_note_${currentUserId}`);
  if (raw) {
    try {
      setNote(JSON.parse(raw));
    } catch {}
  }
}, [currentUserId]);

useEffect(() => {
  if (!currentUserId) return;
  localStorage.setItem(`remember_note_${currentUserId}`, JSON.stringify(note));
}, [note, currentUserId]);








function salvaNota() {
  if (!notaInput.trim()) return;

  if (notaInModifica) {
    setNote((prev) =>
      prev.map((n) =>
        n.id === notaInModifica ? { ...n, testo: notaInput } : n
      )
    );
    setNotaInModifica(null);
  } else {
    setNote((prev) => [
      { id: safeUUID(), testo: notaInput },
      ...prev,
    ]);
  }

  setNotaInput("");
}

function eliminaNota(id: string) {
  setNote((prev) => prev.filter((n) => n.id !== id));
}

function modificaNota(n: any) {
  setNotaInput(n.testo);
  setNotaInModifica(n.id);
}







function chiudiForm() {
  resetForm();
  setMostraForm(false);
  setAggiungiSezione("menu");
}

function resetForm() {
  setIdInModifica(null);
  setTitolo("");
  setData("");
  setOra("09:00");
  setTipo("scadenza");
  setUrgente(false);
  setNota("");
  setImporto("");
  setNotificheMinutiPrima([]);
  setCustomNotificaOre("");
}

function apriNuovaConData(dataSelezionata: string) {
  resetForm();
  setPagina("aggiungi");
  setConsultaSezione("eventi");
  setAggiungiSezione("eventi");
  setData(dataSelezionata);
  setOra("09:00");
  setTipo("appuntamento");
  setMostraForm(false);
}

function apriModifica(v: Voce) {
  setIdInModifica(v.id);
  setTitolo(v.titolo);
  setData(v.data);
  setOra(v.ora || "09:00");
  setTipo(v.tipo === "nota" ? "appuntamento" : v.tipo);
  setUrgente(Boolean(v.urgente));
  setNota(typeof v.nota === "string" ? v.nota : "");
  setImporto(v.importo !== null ? String(v.importo) : "");
  setNotificheMinutiPrima(
    Array.isArray(v.notificheMinutiPrima) ? [...v.notificheMinutiPrima].sort((a, b) => b - a) : []
  );
  setCustomNotificaOre("");
  setPagina("aggiungi");
  setAggiungiSezione("eventi");
  setMostraForm(false);
}

function salva() {
  const titoloFinale = titolo.trim();
  const dataFinale = data.trim();
  const oraFinale = ora.trim() || "09:00";

  if (classNameIsEmpty(titoloFinale)) {
    alert("Compila almeno la descrizione");
    return;
  }

  if (classNameIsEmpty(dataFinale) || classNameIsEmpty(oraFinale)) {
    alert("Compila data e ora");
    return;
  }

  const customOrePulite = customNotificaOre.trim();
  let customMinuti = 0;

  if (customOrePulite !== "") {
    const parsedOre = Number(customOrePulite.replace(",", "."));

    if (!Number.isFinite(parsedOre) || parsedOre <= 0) {
      alert("Inserisci un numero valido di ore personalizzate.");
      return;
    }

    customMinuti = Math.round(parsedOre * 60);

    if (customMinuti <= 0) {
      alert("Le ore personalizzate devono essere maggiori di zero.");
      return;
    }
  }

  const notificheFinali = Array.from(
    new Set([
      ...notificheMinutiPrima,
      ...(customMinuti > 0 ? [customMinuti] : []),
    ])
  )
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  const eraModifica = Boolean(idInModifica);

  if (idInModifica) {
    setVoci((prev) =>
      prev.map((x) =>
        x.id === idInModifica
          ? {
              ...x,
              titolo: titoloFinale,
              data: dataFinale,
              ora: oraFinale,
              tipo: "appuntamento",
              urgente: false,
              nota: "",
              importo: null,
              movimento: "nessuno" as Movimento,
              fatto: vocePassata(dataFinale, oraFinale),
              notificheMinutiPrima: notificheFinali,
            }
          : x
      )
    );
  } else {
    const nuova: Voce = {
      id: safeUUID(),
      titolo: titoloFinale,
      data: dataFinale,
      ora: oraFinale,
      tipo: "appuntamento",
      urgente: false,
      nota: "",
      importo: null,
      movimento: "nessuno",
      fatto: vocePassata(dataFinale, oraFinale),
      notificheMinutiPrima: notificheFinali,
    };

    setVoci((prev) => [nuova, ...prev]);
  }

  if (eraModifica) {
    resetForm();
    setMostraForm(false);
    setAggiungiSezione("menu");
    setPagina("consulta");
    setConsultaSezione("eventi");
    return;
  }

  chiudiForm();
}

function giorniTraDateInclusive(dataInizio: string, dataFine: string) {
  const start = new Date(`${dataInizio}T00:00:00`);
  const end = new Date(`${dataFine}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [] as string[];
  }

  const out: string[] = [];
  const cur = new Date(start);

  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  return out;
}


function calcolaOreTurnoEffettive(inizio: string, fine: string, pausaMinuti: number) {
  if (!inizio || !fine) return 0;

  const [h1, m1] = inizio.split(":").map(Number);
  const [h2, m2] = fine.split(":").map(Number);

  if (
    !Number.isFinite(h1) ||
    !Number.isFinite(m1) ||
    !Number.isFinite(h2) ||
    !Number.isFinite(m2)
  ) {
    return 0;
  }

  let minutiInizio = h1 * 60 + m1;
  let minutiFine = h2 * 60 + m2;

  if (minutiFine <= minutiInizio) {
    minutiFine += 24 * 60;
  }

  const durata = minutiFine - minutiInizio;
  const pausa = Math.max(0, pausaMinuti || 0);
  const minutiEffettivi = Math.max(0, durata - pausa);

  return Math.round((minutiEffettivi / 60) * 100) / 100;
}

function presetPausaMinuti(val: string) {
  if (val === "8-18") return 120;
  if (val === "8-17") return 60;
  return 0;
}

function formatNumeroCompatto(n: number) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function giorniFerieSelezionati(
  dataInizio: string,
  dataFine: string,
  consideraSabato: boolean
) {
  return giorniTraDateInclusive(dataInizio, dataFine).filter((dataStr) => {
    const d = new Date(`${dataStr}T12:00:00`);
    const giorno = d.getDay(); // 0 domenica, 6 sabato

    if (giorno === 0) return false;
    if (giorno === 6 && !consideraSabato) return false;

    return true;
  });
}

function aggiornaOreLavoroAutomatiche(
  inizioArg: string,
  fineArg: string,
  pausaArg: string
) {
  const pausa = Number((pausaArg || "0").replace(",", "."));
  const ore = calcolaOreTurnoEffettive(
    inizioArg,
    fineArg,
    Number.isFinite(pausa) ? pausa : 0
  );

  setTurnoOreOrd(ore > 0 ? formatNumeroCompatto(ore) : "");
}





function resetCampiTurnoBase(dataSelezionata?: string) {
  const dataBase = dataSelezionata || new Date().toISOString().slice(0, 10);
  const oreDefaultFerie =
    ferieTotaliGiorniBase > 0
      ? formatNumeroCompatto(ferieTotaliOreBase / ferieTotaliGiorniBase)
      : "8";

  setTurnoIdInModifica(null);
  setTurnoData(dataBase);
  setTurnoDataFine(dataBase);
  setTurnoTipo("lavoro");
  setTurnoModoOreFerie("giorni");
  setTurnoQuantitaFerie("");
  setTurnoInizio("08:00");
  setTurnoFine("16:00");
  setTurnoOreOrd("8");
  setTurnoOreStraord("");
  setTurnoNote("");
  setTurnoPreset("");
  setTurnoManuale(false);
  setTurnoModalitaPeriodo("singolo");
  setTurnoTipoAssenza("malattia");
  setTurnoAvanzato(false);
  setTurnoPausaMinuti("0");
  setTurnoConsideraSabato(false);
  setTurnoOrePerGiornoFerie(oreDefaultFerie);
}

function apriTurnoForm(dataSelezionata?: string) {
  setAggiungiSezione("menu");
  resetCampiTurnoBase(dataSelezionata);
  setMostraTurnoForm(true);
}

function apriModificaTurno(t: Turno) {
  const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);

  setTurnoIdInModifica(t.id);
  setTurnoData(t.data);
  setTurnoDataFine(t.data);
  setTurnoOreStraord(t.oreStraordinarie ? String(t.oreStraordinarie) : "");
  setTurnoModalitaPeriodo("singolo");
  setTurnoAvanzato(true);
  setTurnoConsideraSabato(false);

  if (sigla === "R") {
    setTurnoTipo("riposo");
    setTurnoModoOreFerie("giorni");
    setTurnoQuantitaFerie("");
    setTurnoInizio("08:00");
    setTurnoFine("16:00");
    setTurnoOreOrd("");
    setTurnoPreset("");
    setTurnoManuale(false);
    setTurnoTipoAssenza("malattia");
    setTurnoPausaMinuti("0");
    setTurnoOrePerGiornoFerie("8");

    const notaPulita = (t.note || "").replace(/^RIPOSO\s*•?\s*/i, "").trim();
    setTurnoNote(notaPulita);
  } else if (sigla === "F") {
    setTurnoTipo("ferie");
    setTurnoInizio("08:00");
    setTurnoFine("16:00");
    setTurnoPreset("");
    setTurnoManuale(false);
    setTurnoTipoAssenza("malattia");
    setTurnoPausaMinuti("0");

    const oreOrd = Number(t.oreOrdinarie || 0);
    setTurnoOrePerGiornoFerie(oreOrd > 0 ? formatNumeroCompatto(oreOrd) : "8");
    setTurnoOreOrd(String(oreOrd || ""));
    setTurnoOreStraord("");

    const notaPulita = (t.note || "").replace(/^FERIE\s*•?\s*/i, "").trim();
    setTurnoNote(notaPulita);
  } else if (sigla === "A") {
    setTurnoTipo("assenza");
    setTurnoInizio("08:00");
    setTurnoFine("16:00");
    setTurnoPreset("");
    setTurnoManuale(false);
    setTurnoModoOreFerie("giorni");
    setTurnoQuantitaFerie("");
    setTurnoOreOrd("");
    setTurnoOreStraord("");
    setTurnoPausaMinuti("0");
    setTurnoOrePerGiornoFerie("8");

    const notaUpper = (t.note || "").toUpperCase();
    if (notaUpper.includes("104")) {
      setTurnoTipoAssenza("104");
    } else if (notaUpper.includes("MATERNITA FACOLTATIVA") || notaUpper.includes("MATERNITÀ FACOLTATIVA")) {
      setTurnoTipoAssenza("maternita-facoltativa");
    } else if (notaUpper.includes("PERMESSO SINDACALE")) {
      setTurnoTipoAssenza("permesso-sindacale");
    } else {
      setTurnoTipoAssenza("malattia");
    }

    const notaPulita = (t.note || "").replace(/^ASSENZA\s*•?\s*/i, "").trim();
    setTurnoNote(notaPulita);
  } else {
    setTurnoTipo("lavoro");
    setTurnoInizio(t.inizio);
    setTurnoFine(t.fine);
    setTurnoOreOrd(String(t.oreOrdinarie ?? ""));
    setTurnoNote(t.note ?? "");
    setTurnoTipoAssenza("malattia");

    const key = `${t.inizio}-${t.fine}`
      .replace("06:00-14:00", "6-14")
      .replace("14:00-22:00", "14-22")
      .replace("22:00-06:00", "22-06")
      .replace("00:00-06:00", "00-06")
      .replace("06:00-12:00", "06-12")
      .replace("12:00-18:00", "12-18")
      .replace("18:00-00:00", "18-24")
      .replace("08:00-18:00", "8-18")
      .replace("08:00-17:00", "8-17");

    if (presetTurni.includes(key)) {
      setTurnoPreset(key);
      setTurnoManuale(false);
      setTurnoPausaMinuti(String(presetPausaMinuti(key)));
    } else {
      setTurnoPreset("");
      setTurnoManuale(true);
      setTurnoPausaMinuti("0");
    }

    setTurnoModoOreFerie("giorni");
    setTurnoQuantitaFerie("");
    setTurnoOrePerGiornoFerie("8");
  }

  setMostraTurnoForm(true);
}

void apriModificaTurno;

function chiudiTurnoForm() {
  setMostraTurnoForm(false);
  setTurnoIdInModifica(null);
  setTurnoTipo("lavoro");
  setTurnoModoOreFerie("giorni");
  setTurnoQuantitaFerie("");
  setTurnoOreOrd("");
  setTurnoOreStraord("");
  setTurnoNote("");
  setTurnoPreset("");
  setTurnoInizio("08:00");
  setTurnoFine("16:00");
  setTurnoManuale(false);
  setTurnoModalitaPeriodo("singolo");
  setTurnoDataFine(turnoData);
  setTurnoTipoAssenza("malattia");
  setTurnoAvanzato(false);
  setTurnoPausaMinuti("0");
  setTurnoConsideraSabato(false);
  setTurnoOrePerGiornoFerie("8");
}

function salvaTurno() {
  if (!turnoData) {
    alert("Inserisci la data del turno.");
    return;
  }

  if (
    (turnoTipo === "ferie" || turnoTipo === "assenza" || turnoTipo === "riposo") &&
    turnoModalitaPeriodo === "intervallo"
  ) {
    if (!turnoDataFine) {
      alert("Inserisci la data finale.");
      return;
    }

    if (turnoIdInModifica) {
      alert("Per modificare un intervallo già creato, modifica o elimina i singoli giorni.");
      return;
    }

    if (turnoTipo === "ferie") {
      const orePerGiorno = parseOreItaliane(turnoOrePerGiornoFerie);

      if (orePerGiorno === null || orePerGiorno <= 0) {
        alert("Inserisci ore valide per ogni giorno ferie.");
        return;
      }

      const giorniValidi = giorniFerieSelezionati(turnoData, turnoDataFine, turnoConsideraSabato);

      if (giorniValidi.length === 0) {
        alert("Nell'intervallo selezionato non ci sono giorni ferie validi.");
        return;
      }

      const oreTotali = giorniValidi.length * orePerGiorno;

      const recordFerie: Turno[] = giorniValidi.map((dataGiorno) => ({
        id: safeUUID(),
        data: dataGiorno,
        inizio: "FERIE",
        fine: "FERIE",
        oreOrdinarie: orePerGiorno,
        oreStraordinarie: 0,
        note:
          `FERIE • ${giorniValidi.length} g • ${formatNumeroCompatto(oreTotali)} h totali • ${formatNumeroCompatto(orePerGiorno)} h/g` +
          (turnoConsideraSabato ? " • sabato incluso" : " • sabato escluso") +
          (turnoNote.trim() ? ` • ${turnoNote.trim()}` : ""),
      }));

      setTurni((prev) => [...recordFerie, ...prev]);
      chiudiTurnoForm();
      return;
    }

    if (turnoTipo === "riposo") {
      const giorni = giorniTraDateInclusive(turnoData, turnoDataFine);

      if (giorni.length === 0) {
        alert("Intervallo date non valido.");
        return;
      }

      const recordRiposo: Turno[] = giorni.map((dataGiorno) => ({
        id: safeUUID(),
        data: dataGiorno,
        inizio: "RIPOSO",
        fine: "RIPOSO",
        oreOrdinarie: 0,
        oreStraordinarie: 0,
        note:
          `RIPOSO • intervallo ${turnoData} / ${turnoDataFine}` +
          (turnoNote.trim() ? ` • ${turnoNote.trim()}` : ""),
      }));

      setTurni((prev) => [...recordRiposo, ...prev]);
      chiudiTurnoForm();
      return;
    }

    const etichettaAssenza =
      turnoTipoAssenza === "104"
        ? "104"
        : turnoTipoAssenza === "maternita-facoltativa"
        ? "Maternità facoltativa"
        : turnoTipoAssenza === "permesso-sindacale"
        ? "Permesso sindacale"
        : "Malattia";

    const giorni = giorniTraDateInclusive(turnoData, turnoDataFine);

    if (giorni.length === 0) {
      alert("Intervallo date non valido.");
      return;
    }

    const recordAssenza: Turno[] = giorni.map((dataGiorno) => ({
      id: safeUUID(),
      data: dataGiorno,
      inizio: "ASSENZA",
      fine: "ASSENZA",
      oreOrdinarie: 0,
      oreStraordinarie: 0,
      note:
        `ASSENZA • ${etichettaAssenza} • intervallo ${turnoData} / ${turnoDataFine}` +
        (turnoNote.trim() ? ` • ${turnoNote.trim()}` : ""),
    }));

    setTurni((prev) => [...recordAssenza, ...prev]);
    chiudiTurnoForm();
    return;
  }

  if (turnoTipo === "riposo") {
    const aggiornato: Turno = {
      id: turnoIdInModifica ?? safeUUID(),
      data: turnoData,
      inizio: "RIPOSO",
      fine: "RIPOSO",
      oreOrdinarie: 0,
      oreStraordinarie: 0,
      note: turnoNote.trim() ? `RIPOSO • ${turnoNote.trim()}` : "RIPOSO",
    };

    if (turnoIdInModifica) {
      setTurni((prev) => prev.map((t) => (t.id === turnoIdInModifica ? aggiornato : t)));
    } else {
      setTurni((prev) => [aggiornato, ...prev]);
    }

    chiudiTurnoForm();
    return;
  }

  if (turnoTipo === "ferie") {
    const orePerGiorno = parseOreItaliane(turnoOrePerGiornoFerie);

    if (orePerGiorno === null || orePerGiorno <= 0) {
      alert("Inserisci ore valide per ogni giorno ferie.");
      return;
    }

    const aggiornato: Turno = {
      id: turnoIdInModifica ?? safeUUID(),
      data: turnoData,
      inizio: "FERIE",
      fine: "FERIE",
      oreOrdinarie: orePerGiorno,
      oreStraordinarie: 0,
      note:
        `FERIE • 1 g • ${formatNumeroCompatto(orePerGiorno)} h` +
        (turnoNote.trim() ? ` • ${turnoNote.trim()}` : ""),
    };

    if (turnoIdInModifica) {
      setTurni((prev) => prev.map((t) => (t.id === turnoIdInModifica ? aggiornato : t)));
    } else {
      setTurni((prev) => [aggiornato, ...prev]);
    }

    chiudiTurnoForm();
    return;
  }

  if (turnoTipo === "assenza") {
    const etichettaAssenza =
      turnoTipoAssenza === "104"
        ? "104"
        : turnoTipoAssenza === "maternita-facoltativa"
        ? "Maternità facoltativa"
        : turnoTipoAssenza === "permesso-sindacale"
        ? "Permesso sindacale"
        : "Malattia";

    const aggiornato: Turno = {
      id: turnoIdInModifica ?? safeUUID(),
      data: turnoData,
      inizio: "ASSENZA",
      fine: "ASSENZA",
      oreOrdinarie: 0,
      oreStraordinarie: 0,
      note:
        `ASSENZA • ${etichettaAssenza}` +
        (turnoNote.trim() ? ` • ${turnoNote.trim()}` : ""),
    };

    if (turnoIdInModifica) {
      setTurni((prev) => prev.map((t) => (t.id === turnoIdInModifica ? aggiornato : t)));
    } else {
      setTurni((prev) => [aggiornato, ...prev]);
    }

    chiudiTurnoForm();
    return;
  }

  if (!turnoInizio || !turnoFine) {
    alert("Inserisci inizio e fine turno.");
    return;
  }

  const pausaMin = Number(turnoPausaMinuti.replace(",", "."));
  const pausaValida = Number.isFinite(pausaMin) && pausaMin >= 0 ? pausaMin : 0;
  const oreCalcolate = calcolaOreTurnoEffettive(turnoInizio, turnoFine, pausaValida);
  const oreStra = turnoOreStraord.trim() === "" ? 0 : parseOreItaliane(turnoOreStraord);

  if (oreCalcolate <= 0) {
    alert("Le ore effettive del turno non sono valide.");
    return;
  }

  if (oreStra === null || oreStra < 0) {
    alert("Inserisci ore straordinarie valide.");
    return;
  }

  const aggiornato: Turno = {
    id: turnoIdInModifica ?? safeUUID(),
    data: turnoData,
    inizio: turnoInizio,
    fine: turnoFine,
    oreOrdinarie: oreCalcolate,
    oreStraordinarie: oreStra,
    note:
      (pausaValida > 0 ? `Pausa ${formatNumeroCompatto(pausaValida)} min` : "") +
      (turnoNote.trim() ? `${pausaValida > 0 ? " • " : ""}${turnoNote.trim()}` : ""),
  };

  if (turnoIdInModifica) {
    setTurni((prev) => prev.map((t) => (t.id === turnoIdInModifica ? aggiornato : t)));
  } else {
    setTurni((prev) => [aggiornato, ...prev]);
  }

  chiudiTurnoForm();
}

function eliminaTurno(id: string) {
  const ok = confirm("Vuoi eliminare questo turno?");
  if (!ok) return;
  setTurni((prev) => prev.filter((t) => t.id !== id));
}

void eliminaTurno;









  











function MiniCalendarioSettimanaTurni({
  turni,
  onEditTurno,
}: {
  turni: Turno[];
  onEditTurno: (t: Turno) => void;
}) {
  const oggi = new Date();

  const inizioSettimana = new Date(oggi);
  const giorno = (oggi.getDay() + 6) % 7;
  inizioSettimana.setDate(oggi.getDate() - giorno);

  const giorniSettimana: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inizioSettimana);
    d.setDate(inizioSettimana.getDate() + i);
    giorniSettimana.push(d);
  }

  const giorniLabel = ["L", "M", "M", "G", "V", "S", "D"];

  function getTurnoGiorno(data: string) {
    return turni.find((t) => t.data === data);
  }

  function getTurnoColor(sigla: string) {
    if (sigla === "R") return "linear-gradient(180deg, #64748b, #475569)";
    if (sigla === "F") return "linear-gradient(180deg, #8b5cf6, #7c3aed)";
    if (sigla === "A") return "linear-gradient(180deg, #ef4444, #dc2626)";
    if (sigla === "N") return "linear-gradient(180deg, #2563eb, #1d4ed8)";
    if (sigla === "M") return "linear-gradient(180deg, #f59e0b, #d97706)";
    if (sigla === "P") return "linear-gradient(180deg, #f97316, #ea580c)";
    if (sigla === "S") return "linear-gradient(180deg, #a855f7, #7e22ce)";
    return "linear-gradient(180deg, #3b82f6, #2563eb)";
  }

  function getTurnoGlow(sigla: string) {
    if (sigla === "R") return "rgba(100,116,139,0.22)";
    if (sigla === "F") return "rgba(124,58,237,0.24)";
    if (sigla === "A") return "rgba(239,68,68,0.24)";
    if (sigla === "N") return "rgba(37,99,235,0.24)";
    if (sigla === "M") return "rgba(245,158,11,0.24)";
    if (sigla === "P") return "rgba(249,115,22,0.24)";
    if (sigla === "S") return "rgba(168,85,247,0.24)";
    return "rgba(59,130,246,0.20)";
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 8,
        marginTop: 12,
      }}
    >
      {giorniSettimana.map((d, idx) => {
        const key = d.toISOString().slice(0, 10);
        const turno = getTurnoGiorno(key);

        const sigla = turno
          ? normalizeTurnoLabel(turno.inizio, turno.fine, turno.note)
          : "";

        const isToday = key === new Date().toISOString().slice(0, 10);
        const hasTurno = Boolean(turno);

        return (
          <div
            key={key}
            onClick={() => {
              if (turno) onEditTurno(turno);
            }}
            style={{
              padding: "10px 6px",
              borderRadius: 18,
              border: hasTurno
                ? "1px solid rgba(15,23,42,0.08)"
                : isToday
                ? "1px solid rgba(99,102,241,0.20)"
                : "1px solid rgba(15,23,42,0.06)",
              background: hasTurno
                ? "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))"
                : isToday
                ? "linear-gradient(180deg, rgba(238,242,255,0.98), rgba(245,243,255,0.95))"
                : "rgba(255,255,255,0.88)",
              display: "grid",
              justifyItems: "center",
              gap: 6,
              cursor: turno ? "pointer" : "default",
              boxShadow: hasTurno
                ? `0 10px 22px ${getTurnoGlow(sigla)}, inset 0 1px 0 rgba(255,255,255,0.70)`
                : "0 6px 14px rgba(15,23,42,0.05)",
              transition: "transform .18s ease, box-shadow .18s ease",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (!turno) return;
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                `0 14px 28px ${getTurnoGlow(sigla)}, inset 0 1px 0 rgba(255,255,255,0.70)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = hasTurno
                ? `0 10px 22px ${getTurnoGlow(sigla)}, inset 0 1px 0 rgba(255,255,255,0.70)`
                : "0 6px 14px rgba(15,23,42,0.05)";
            }}
          >
            {hasTurno && (
              <div
                style={{
                  position: "absolute",
                  top: -18,
                  right: -18,
                  width: 54,
                  height: 54,
                  borderRadius: 999,
                  background: `radial-gradient(circle, ${getTurnoGlow(sigla)}, transparent 68%)`,
                  pointerEvents: "none",
                }}
              />
            )}

            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                opacity: 0.72,
                color: "rgba(71,85,105,0.92)",
                position: "relative",
                zIndex: 1,
              }}
            >
              {giorniLabel[idx]}
            </div>

            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 15,
                fontWeight: 1000,
                color: isToday ? "rgba(49,46,129,0.98)" : "rgba(15,23,42,0.96)",
                background: isToday
                  ? "rgba(129,140,248,0.12)"
                  : "rgba(255,255,255,0.82)",
                border: isToday
                  ? "2px solid rgba(129,140,248,0.42)"
                  : "1px solid rgba(15,23,42,0.06)",
                boxShadow: isToday ? "0 8px 16px rgba(99,102,241,0.12)" : "none",
                position: "relative",
                zIndex: 1,
              }}
            >
              {d.getDate()}
            </div>

            <div
              style={{
                minHeight: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                zIndex: 1,
                width: "100%",
              }}
            >
              {sigla ? (
                <div
                  style={{
                    display: "inline-flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minWidth: 28,
                    height: 28,
                    padding: "0 8px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 1000,
                    color: "white",
                    background: getTurnoColor(sigla),
                    boxShadow:
                      "0 8px 16px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.20)",
                    lineHeight: 1,
                    letterSpacing: 0.2,
                  }}
                >
                  {sigla}
                </div>
              ) : (
                <div
                  style={{
                    display: "inline-flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minWidth: 28,
                    height: 28,
                    padding: "0 8px",
                    borderRadius: 999,
                    background: isToday
                      ? "rgba(99,102,241,0.12)"
                      : "rgba(148,163,184,0.10)",
                    border: isToday
                      ? "1px solid rgba(99,102,241,0.16)"
                      : "1px solid rgba(148,163,184,0.08)",
                    fontSize: 14,
                    color: isToday
                      ? "rgba(79,70,229,0.92)"
                      : "rgba(148,163,184,0.90)",
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  +
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}



function elimina(id: string) {
  const ok = confirm("Vuoi eliminare questa voce?");
  if (!ok) return;
  clearScheduledForVoce(id);
  setVoci((prev) => prev.filter((v) => v.id !== id));
}

void elimina;

function mesePrecedente() {
  setMeseCorrente((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

function meseSuccessivo() {
  setMeseCorrente((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

function nomeMese(d: Date) {
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function stessoMeseSelezionato(dataStr: string) {
  const [a, m, g] = dataStr.split("-").map(Number);
  const d = new Date(a, (m ?? 1) - 1, g ?? 1);
  return d.getFullYear() === meseCorrente.getFullYear() && d.getMonth() === meseCorrente.getMonth();
}

const entrateExtraVal = incassi[meseKey]?.entrateExtra ?? [];
const usciteExtraVal = incassi[meseKey]?.usciteExtra ?? [];

const [finanzaVistaGrafico, setFinanzaVistaGrafico] = useState<"mese" | "anno">("mese");
const [finanzaAnnoSelezionato, setFinanzaAnnoSelezionato] = useState(new Date().getFullYear());
const [finanzaMeseSelezionato, setFinanzaMeseSelezionato] = useState(new Date().getMonth());

const [filtroFinanzaMese] = useState<FiltroFinanza>({
  dal: "",
  al: "",
  categoria: "",
});

const [filtroFinanzaGrafico, setFiltroFinanzaGrafico] = useState<FiltroFinanza>({
  dal: "",
  al: "",
  categoria: "",
});

const [filtroFinanzaLista, setFiltroFinanzaLista] = useState<FiltroFinanza>({
  dal: "",
  al: "",
  categoria: "",
});

const [movimentoFinanzaInModifica, setMovimentoFinanzaInModifica] = useState<MovimentoFinanzaItem | null>(null);
const [finanzaModData, setFinanzaModData] = useState("");
const [finanzaModCategoria, setFinanzaModCategoria] = useState("");
const [finanzaModDettaglio, setFinanzaModDettaglio] = useState("");
const [finanzaModImporto, setFinanzaModImporto] = useState("");
const [finanzaModNota, setFinanzaModNota] = useState("");

const euro = (n: number) =>
  n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";

const nomeMesiCompleti = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const tutteUsciteExtraStorico = useMemo(() => {
  return Object.entries(incassi).flatMap(([meseKeyStorico, dati]) =>
    (dati.usciteExtra ?? []).map((x) => ({
      id: x.id,
      origine: "uscita-extra" as const,
      meseKeyOrigine: meseKeyStorico,
      data: x.data,
      descrizione: x.descrizione,
      importo: x.importo,
      nota: x.nota,
      categoria: estraiCategoriaMovimento(x.descrizione) || "Altro",
      dettaglio: estraiDettaglioMovimento(x.descrizione),
    }))
  );
}, [incassi]);

const tutteVociUscitaStorico = useMemo(() => {
  return voci
    .filter((v) => v.movimento === "uscita" && v.importo !== null)
    .map((v) => ({
      id: v.id,
      origine: "voce-uscita" as const,
      data: v.data,
      descrizione: v.titolo,
      importo: v.importo ?? 0,
      nota: v.nota ?? "",
      categoria: estraiCategoriaMovimento(v.titolo) || "Altro",
      dettaglio: estraiDettaglioMovimento(v.titolo),
      voceTipo: v.tipo,
      voceOra: v.ora,
      voceUrgente: v.urgente,
      voceFatto: v.fatto,
    }));
}, [voci]);

const tuttiMovimentiFinanza = useMemo<MovimentoFinanzaItem[]>(() => {
  return [...tutteUsciteExtraStorico, ...tutteVociUscitaStorico].sort((a, b) => {
    const d = a.data.localeCompare(b.data);
    if (d !== 0) return d;
    return a.descrizione.localeCompare(b.descrizione);
  });
}, [tutteUsciteExtraStorico, tutteVociUscitaStorico]);

const categorieUscitaFinanza = useMemo(() => {
  const base = [...categorieUscitaBase, ...categorieUscitaCustom];
  const dinamiche = tuttiMovimentiFinanza.map((x) => x.categoria).filter(Boolean);
  return Array.from(new Set([...base, ...dinamiche])).sort((a, b) => a.localeCompare(b, "it"));
}, [categorieUscitaBase, categorieUscitaCustom, tuttiMovimentiFinanza]);

function applicaFiltroFinanza<T extends { data: string; categoria?: string }>(
  lista: T[],
  filtro: FiltroFinanza
) {
  return lista.filter((item) => {
    if (filtro.dal && item.data < filtro.dal) return false;
    if (filtro.al && item.data > filtro.al) return false;
    if (filtro.categoria && (item.categoria ?? "") !== filtro.categoria) return false;
    return true;
  });
}

function apriModificaMovimentoFinanza(item: MovimentoFinanzaItem) {
  setMovimentoFinanzaInModifica(item);
  setFinanzaModData(item.data);
  setFinanzaModCategoria(item.categoria || "");
  setFinanzaModDettaglio(item.dettaglio || "");
  setFinanzaModImporto(String(item.importo ?? ""));
  setFinanzaModNota(item.nota ?? "");
}

function chiudiModificaMovimentoFinanza() {
  setMovimentoFinanzaInModifica(null);
  setFinanzaModData("");
  setFinanzaModCategoria("");
  setFinanzaModDettaglio("");
  setFinanzaModImporto("");
  setFinanzaModNota("");
}

function salvaModificaMovimentoFinanza() {
  if (!movimentoFinanzaInModifica) return;

  const importoNum = Number(finanzaModImporto.replace(",", "."));

  if (!finanzaModData) {
    alert("Inserisci la data.");
    return;
  }

  if (!finanzaModCategoria.trim()) {
    alert("Seleziona una categoria.");
    return;
  }

  if (!Number.isFinite(importoNum) || importoNum <= 0) {
    alert("Inserisci un importo valido.");
    return;
  }

  const descrizioneFinale = componiDescrizioneMovimento(
    finanzaModCategoria.trim(),
    finanzaModDettaglio.trim()
  );

  if (movimentoFinanzaInModifica.origine === "voce-uscita") {
    setVoci((prev) =>
      prev.map((x) =>
        x.id === movimentoFinanzaInModifica.id
          ? {
              ...x,
              data: finanzaModData,
              titolo: descrizioneFinale,
              importo: importoNum,
              nota: finanzaModNota.trim(),
              movimento: "uscita" as Movimento,
              fatto: vocePassata(finanzaModData, x.ora),
            }
          : x
      )
    );
  } else {
    const nuovoMeseKey = finanzaModData.slice(0, 7);
    const vecchioMeseKey = movimentoFinanzaInModifica.meseKeyOrigine ?? nuovoMeseKey;

    setIncassi((prev) => {
      const next = { ...prev };

      next[vecchioMeseKey] = {
        entrateExtra: next[vecchioMeseKey]?.entrateExtra ?? [],
        usciteExtra: (next[vecchioMeseKey]?.usciteExtra ?? []).filter(
          (x) => x.id !== movimentoFinanzaInModifica.id
        ),
      };

      const recordAggiornato: UscitaExtra = {
        id: movimentoFinanzaInModifica.id,
        data: finanzaModData,
        descrizione: descrizioneFinale,
        importo: importoNum,
        nota: finanzaModNota.trim(),
      };

      next[nuovoMeseKey] = {
        entrateExtra: next[nuovoMeseKey]?.entrateExtra ?? [],
        usciteExtra: [...(next[nuovoMeseKey]?.usciteExtra ?? []), recordAggiornato].sort((a, b) =>
          a.data.localeCompare(b.data)
        ),
      };

      return next;
    });
  }

  chiudiModificaMovimentoFinanza();
  setPagina("consulta");
  setConsultaSezione("finanza");
}

function eliminaMovimentoFinanza(item: MovimentoFinanzaItem) {
  const ok = confirm("Vuoi eliminare questo movimento?");
  if (!ok) return;

  if (item.origine === "voce-uscita") {
    setVoci((prev) => prev.filter((x) => x.id !== item.id));
    return;
  }

  const meseKeyOrigine = item.meseKeyOrigine ?? item.data.slice(0, 7);

  setIncassi((prev) => ({
    ...prev,
    [meseKeyOrigine]: {
      entrateExtra: prev[meseKeyOrigine]?.entrateExtra ?? [],
      usciteExtra: (prev[meseKeyOrigine]?.usciteExtra ?? []).filter((x) => x.id !== item.id),
    },
  }));
}

const entrateMeseSezioneFinanza = useMemo(() => {
  const base = entrateExtraVal.map((x) => ({
    ...x,
    categoria: estraiCategoriaMovimento(x.descrizione) || "",
  }));

  const filtrate = applicaFiltroFinanza(base, {
    ...filtroFinanzaMese,
    categoria: "",
  });

  return filtrate.reduce((s, x) => s + x.importo, 0);
}, [entrateExtraVal, filtroFinanzaMese]);

const usciteMeseSezioneFinanza = useMemo(() => {
  const base = tuttiMovimentiFinanza.filter((x) => {
    const [a, m] = x.data.split("-").map(Number);
    return a === meseCorrente.getFullYear() && m - 1 === meseCorrente.getMonth();
  });

  return applicaFiltroFinanza(base, filtroFinanzaMese).reduce((s, x) => s + x.importo, 0);
}, [tuttiMovimentiFinanza, meseCorrente, filtroFinanzaMese]);

const saldoMeseSezioneFinanza = entrateMeseSezioneFinanza - usciteMeseSezioneFinanza;

const usciteGraficoBase = useMemo(() => {
  return tuttiMovimentiFinanza.filter((x) => {
    const [a, m] = x.data.split("-").map(Number);

    if (finanzaVistaGrafico === "mese") {
      return a === finanzaAnnoSelezionato && m - 1 === finanzaMeseSelezionato;
    }

    return a === finanzaAnnoSelezionato;
  });
}, [tuttiMovimentiFinanza, finanzaVistaGrafico, finanzaAnnoSelezionato, finanzaMeseSelezionato]);

const usciteGraficoFiltrate = useMemo(() => {
  return applicaFiltroFinanza(usciteGraficoBase, filtroFinanzaGrafico);
}, [usciteGraficoBase, filtroFinanzaGrafico]);

const uscitePerCategoriaGrafico = useMemo(() => {
  const grouped = new Map<string, number>();

  for (const mov of usciteGraficoFiltrate) {
    grouped.set(mov.categoria, (grouped.get(mov.categoria) ?? 0) + mov.importo);
  }

  return Array.from(grouped.entries())
    .map(([categoria, totale]) => ({ categoria, totale }))
    .sort((a, b) => b.totale - a.totale);
}, [usciteGraficoFiltrate]);

const totaleGraficoUscite = useMemo(() => {
  return uscitePerCategoriaGrafico.reduce((s, x) => s + x.totale, 0);
}, [uscitePerCategoriaGrafico]);

const pieColors = [
  "#ff3b30",
  "#ff9500",
  "#ffd60a",
  "#34c759",
  "#00c7be",
  "#0a84ff",
  "#5856d6",
  "#bf5af2",
  "#ff2d55",
  "#8e8e93",
  "#30b0c7",
  "#64d2ff",
  "#c83597d1",
];

const pieGradientFinanza = useMemo(() => {
  if (uscitePerCategoriaGrafico.length === 0 || totaleGraficoUscite <= 0) {
    return "conic-gradient(#e5e7eb 0deg 360deg)";
  }

  let corrente = 0;
  const parti: string[] = [];

  uscitePerCategoriaGrafico.forEach((item, index) => {
    const angolo = (item.totale / totaleGraficoUscite) * 360;
    const start = corrente;
    const end = corrente + angolo;
    parti.push(`${pieColors[index % pieColors.length]} ${start}deg ${end}deg`);
    corrente = end;
  });

  return `conic-gradient(${parti.join(", ")})`;
}, [uscitePerCategoriaGrafico, totaleGraficoUscite]);

const maxBarFinanza = useMemo(() => {
  return Math.max(...uscitePerCategoriaGrafico.map((x) => x.totale), 1);
}, [uscitePerCategoriaGrafico]);

const listaMovimentiFinanza = useMemo(() => {
  return applicaFiltroFinanza(tuttiMovimentiFinanza, filtroFinanzaLista)
    .slice()
    .sort((a, b) => {
      const d = b.data.localeCompare(a.data);
      if (d !== 0) return d;
      return b.importo - a.importo;
    });
}, [tuttiMovimentiFinanza, filtroFinanzaLista]);


void setFiltroFinanzaGrafico;
void nomeMesiCompleti;
void apriModificaMovimentoFinanza;
void eliminaMovimentoFinanza;
void pieGradientFinanza;
void maxBarFinanza;
void listaMovimentiFinanza;


const anniFinanzaDisponibili = useMemo(() => {
  const anni = Array.from(
    new Set(
      tuttiMovimentiFinanza
        .map((x) => Number(x.data.slice(0, 4)))
        .filter((n) => Number.isFinite(n))
    )
  ).sort((a, b) => b - a);

  return anni.length ? anni : [new Date().getFullYear()];
}, [tuttiMovimentiFinanza]);

useEffect(() => {
  if (!anniFinanzaDisponibili.includes(finanzaAnnoSelezionato)) {
    setFinanzaAnnoSelezionato(anniFinanzaDisponibili[0]);
  }
}, [anniFinanzaDisponibili, finanzaAnnoSelezionato]);

function aggiungiEntrataExtra() {
  const importoNum = Number(nuovaEntrataImporto.replace(",", "."));
  const dettaglio = nuovaEntrataDesc.trim();

  if (!nuovaEntrataData) {
    alert("Inserisci una data.");
    return;
  }

  let categoriaFinale = categoriaEntrata;

  if (categoriaEntrata === "__altro__") {
    const pulita = nuovaCategoriaEntrata.trim();

    if (!pulita) {
      alert("Scrivi la nuova categoria entrata.");
      return;
    }

    const giaEsiste =
      categorieEntrataBase.some((x) => x.toLowerCase() === pulita.toLowerCase()) ||
      categorieEntrataCustom.some((x) => x.toLowerCase() === pulita.toLowerCase());

    if (!giaEsiste) {
      const updated = [...categorieEntrataCustom, pulita].sort((a, b) => a.localeCompare(b, "it"));
      localStorage.setItem(K_CATEGORIE_ENTRATA_CUSTOM, JSON.stringify(updated));
    }

    categoriaFinale = pulita;
  }

  if (!categoriaFinale) {
    alert("Seleziona una categoria entrata.");
    return;
  }

  if (!Number.isFinite(importoNum) || importoNum <= 0) {
    alert("Inserisci un importo valido.");
    return;
  }

  const nuova: EntrataExtra = {
    id: safeUUID(),
    data: nuovaEntrataData,
    descrizione: componiDescrizioneMovimento(categoriaFinale, dettaglio),
    importo: importoNum,
  };

  setIncassi((prev) => ({
    ...prev,
    [meseKey]: {
      entrateExtra: [...(prev[meseKey]?.entrateExtra ?? []), nuova],
      usciteExtra: prev[meseKey]?.usciteExtra ?? [],
    },
  }));

  setCategoriaEntrata("");
  setNuovaCategoriaEntrata("");
  setNuovaEntrataDesc("");
  setNuovaEntrataImporto("");
  setMovimentoAperto(null);
}

function eliminaEntrataExtra(id: string) {
  setIncassi((prev) => ({
    ...prev,
    [meseKey]: {
      entrateExtra: (prev[meseKey]?.entrateExtra ?? []).filter((x) => x.id !== id),
      usciteExtra: prev[meseKey]?.usciteExtra ?? [],
    },
  }));
}

function aggiungiUscitaExtra() {
  const importoNum = Number(nuovaUscitaImporto.replace(",", "."));
  const dettaglio = nuovaUscitaDesc.trim();

  if (!nuovaUscitaData) {
    alert("Inserisci una data.");
    return;
  }

  let categoriaFinale = categoriaUscita;

  if (categoriaUscita === "__altro__") {
    const pulita = nuovaCategoriaUscita.trim();

    if (!pulita) {
      alert("Scrivi la nuova categoria uscita.");
      return;
    }

    const giaEsiste =
      categorieUscitaBase.some((x) => x.toLowerCase() === pulita.toLowerCase()) ||
      categorieUscitaCustom.some((x) => x.toLowerCase() === pulita.toLowerCase());

    if (!giaEsiste) {
      const updated = [...categorieUscitaCustom, pulita].sort((a, b) => a.localeCompare(b, "it"));
      localStorage.setItem(K_CATEGORIE_USCITA_CUSTOM, JSON.stringify(updated));
    }

    categoriaFinale = pulita;
  }

  if (!categoriaFinale) {
    alert("Seleziona una categoria uscita.");
    return;
  }

  if (!Number.isFinite(importoNum) || importoNum <= 0) {
    alert("Inserisci un importo valido.");
    return;
  }

  const nuova: UscitaExtra = {
    id: safeUUID(),
    data: nuovaUscitaData,
    descrizione: componiDescrizioneMovimento(categoriaFinale, dettaglio),
    importo: importoNum,
    nota: nuovaUscitaNota.trim(),
  };

  setIncassi((prev) => ({
    ...prev,
    [meseKey]: {
      entrateExtra: prev[meseKey]?.entrateExtra ?? [],
      usciteExtra: [...(prev[meseKey]?.usciteExtra ?? []), nuova],
    },
  }));

  setCategoriaUscita("");
  setNuovaCategoriaUscita("");
  setNuovaUscitaDesc("");
  setNuovaUscitaImporto("");
  setNuovaUscitaNota("");
  setMovimentoAperto(null);
}

function eliminaUscitaExtra(id: string) {
  setIncassi((prev) => ({
    ...prev,
    [meseKey]: {
      entrateExtra: prev[meseKey]?.entrateExtra ?? [],
      usciteExtra: (prev[meseKey]?.usciteExtra ?? []).filter((x) => x.id !== id),
    },
  }));
}

const totaleEntrateExtra = useMemo(() => entrateExtraVal.reduce((s, x) => s + x.importo, 0), [entrateExtraVal]);

const turniMese = useMemo(() => turni.filter((t) => stessoMeseSelezionato(t.data)), [turni, meseCorrente]);
const oreOrdMese = useMemo(() => turniMese.reduce((s, t) => s + t.oreOrdinarie, 0), [turniMese]);
const oreStraMese = useMemo(() => turniMese.reduce((s, t) => s + t.oreStraordinarie, 0), [turniMese]);
const oreTotMese = useMemo(() => oreOrdMese + oreStraMese, [oreOrdMese, oreStraMese]);

const vociMese = useMemo(() => voci.filter((v) => stessoMeseSelezionato(v.data)), [voci, meseCorrente]);

const usciteTotMese = useMemo(() => {
  const usciteDaVoci = vociMese
    .filter((v) => v.importo !== null && v.movimento === "uscita")
    .reduce((s, v) => s + (v.importo ?? 0), 0);

  const usciteDaExtra = usciteExtraVal.reduce((s, x) => s + x.importo, 0);

  return usciteDaVoci + usciteDaExtra;
}, [vociMese, usciteExtraVal]);

const entrateTotMese = totaleEntrateExtra;
const saldoMese = entrateTotMese - usciteTotMese;

const entrateArchivioTotali = useMemo(() => {
  return Object.values(incassi).reduce((acc, mese) => {
    return acc + (mese.entrateExtra ?? []).reduce((s, x) => s + x.importo, 0);
  }, 0);
}, [incassi]);

const usciteArchivioTotali = useMemo(() => {
  return voci
    .filter((v) => v.importo !== null && v.movimento === "uscita")
    .reduce((s, v) => s + (v.importo ?? 0), 0);
}, [voci]);

const saldoArchivioTotale = entrateArchivioTotali - usciteArchivioTotali;
void saldoArchivioTotale;

const turniArchivio = useMemo(
  () => turni.filter((t) => !stessoMeseSelezionato(t.data) || vocePassata(t.data, "23:59")),
  [turni, meseCorrente]
);
void turniArchivio;

const vociArchivio = useMemo(() => voci.filter((v) => v.fatto), [voci]);
void vociArchivio;

const vociDelMesePerCalendario = useMemo(() => {
  if (pagina === "agenda") return [];
  if (pagina === "archivio") return voci.filter((v) => v.fatto).filter((v) => stessoMeseSelezionato(v.data));
  return voci.filter((v) => !v.fatto).filter((v) => stessoMeseSelezionato(v.data));
}, [voci, meseCorrente, pagina]);
void vociDelMesePerCalendario;

function vociFiltrate() {
  const base = pagina === "archivio" ? voci.filter((v) => v.fatto) : voci.filter((v) => !v.fatto);
  const nelMese = base.filter((v) => stessoMeseSelezionato(v.data));

  if (filtro === null) return ordinaIntelligente(nelMese);

  const oggi = new Date();
  const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());

  if (filtro === "oggi") {
    const filtrateOggi = nelMese.filter((v) => {
      const [a, m, g] = v.data.split("-").map(Number);
      const dataVoce = new Date(a, (m ?? 1) - 1, g ?? 1);
      return dataVoce.getTime() === inizioOggi.getTime();
    });

    return ordinaIntelligente(filtrateOggi);
  }

  const fine = new Date(inizioOggi);

  if (filtro === "7giorni") fine.setDate(fine.getDate() + 7);
  else if (filtro === "30giorni") fine.setDate(fine.getDate() + 30);

  const filtrate = nelMese.filter((v) => {
    const [a, m, g] = v.data.split("-").map(Number);
    const dataVoce = new Date(a, (m ?? 1) - 1, g ?? 1);
    return dataVoce >= inizioOggi && dataVoce <= fine;
  });

  return ordinaIntelligente(filtrate);
}
void vociFiltrate;

const totaleTurniMese = useMemo(() => {
  return turniMese.filter((t) => {
    const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
    return sigla !== "R";
  }).length;
}, [turniMese]);

const turniFerie = useMemo(() => {
  return turni.filter((t) => normalizeTurnoLabel(t.inizio, t.fine, t.note) === "F");
}, [turni]);

const ferieGiorniEffettuati = useMemo(() => {
  return turniFerie.reduce((tot, t) => {
    const testo = `${t.note || ""}`;
    const matchGiorni = testo.match(/FERIE\s*•\s*([\d.,]+)\s*g/i);
    if (matchGiorni) {
      const val = parseOreItaliane(matchGiorni[1]);
      return tot + (val ?? 0);
    }

    const ore = Number(t.oreOrdinarie || 0) + Number(t.oreStraordinarie || 0);
    return tot + (ore > 0 ? ore / 8 : 1);
  }, 0);
}, [turniFerie]);

const ferieOreEffettuate = useMemo(() => {
  return turniFerie.reduce((tot, t) => {
    return tot + Number(t.oreOrdinarie || 0) + Number(t.oreStraordinarie || 0);
  }, 0);
}, [turniFerie]);

const ferieGiorniResidui = useMemo(() => {
  return Math.max(0, ferieTotaliGiorniBase - ferieGiorniEffettuati);
}, [ferieTotaliGiorniBase, ferieGiorniEffettuati]);

const ferieOreResidue = useMemo(() => {
  return Math.max(0, ferieTotaliOreBase - ferieOreEffettuate);
}, [ferieTotaliOreBase, ferieOreEffettuate]);

const tutteEntrateExtra = useMemo(() => {
  return Object.entries(incassi).flatMap(([mese, dati]) =>
    (dati.entrateExtra ?? []).map((x) => ({
      ...x,
      mese,
    }))
  );
}, [incassi]);

const entrateAnnoCorrente = useMemo(() => {
  const anno = meseCorrente.getFullYear();
  return tutteEntrateExtra
    .filter((x) => {
      const [a] = x.data.split("-").map(Number);
      return a === anno;
    })
    .reduce((acc, x) => acc + x.importo, 0);
}, [tutteEntrateExtra, meseCorrente]);

const usciteAnnoCorrente = useMemo(() => {
  const anno = meseCorrente.getFullYear();

  const usciteDaVoci = voci
    .filter((v) => v.importo !== null && v.movimento === "uscita")
    .filter((v) => {
      const [a] = v.data.split("-").map(Number);
      return a === anno;
    })
    .reduce((acc, v) => acc + (v.importo ?? 0), 0);

  const usciteDaExtra = Object.values(incassi).reduce((acc, mese) => {
    return (
      acc +
      (mese.usciteExtra ?? [])
        .filter((x) => {
          const [a] = x.data.split("-").map(Number);
          return a === anno;
        })
        .reduce((s, x) => s + x.importo, 0)
    );
  }, 0);

  return usciteDaVoci + usciteDaExtra;
}, [voci, incassi, meseCorrente]);

const saldoAnno = useMemo(() => {
  return entrateAnnoCorrente - usciteAnnoCorrente;
}, [entrateAnnoCorrente, usciteAnnoCorrente]);

const eventiControlloMese = useMemo(() => {
  const eventiVoci = voci
    .filter((v) => stessoMeseSelezionato(v.data))
    .map((v) => ({
      id: v.id,
      data: v.data,
      tipo: v.tipo,
      titolo: v.titolo,
      ora: v.ora,
      importo: v.importo,
      movimento: v.movimento,
      nota: v.nota,
      urgente: v.urgente,
      sorgente: "voce" as const,
    }));

  const eventiEntrate = entrateExtraVal.map((e) => ({
    id: e.id,
    data: e.data,
    tipo: "entrata" as const,
    titolo: e.descrizione,
    ora: "09:00",
    importo: e.importo,
    movimento: "entrata" as const,
    nota: "",
    urgente: false,
    sorgente: "entrata" as const,
  }));

  const eventiUscite = usciteExtraVal.map((e) => ({
    id: e.id,
    data: e.data,
    tipo: "uscita" as const,
    titolo: e.descrizione,
    ora: "09:00",
    importo: e.importo,
    movimento: "uscita" as const,
    nota: e.nota,
    urgente: false,
    sorgente: "uscita-extra" as const,
  }));

  return [...eventiVoci, ...eventiEntrate, ...eventiUscite].sort((a, b) => {
    const d = a.data.localeCompare(b.data);
    if (d !== 0) return d;
    return a.ora.localeCompare(b.ora);
  });
}, [voci, entrateExtraVal, usciteExtraVal, meseCorrente]);

const scadenzeControlloMese = useMemo(() => {
  return eventiControlloMese.filter((x) => x.tipo === "scadenza");
}, [eventiControlloMese]);

const appuntamentiControlloMese = useMemo(() => {
  return eventiControlloMese.filter((x) => x.tipo === "appuntamento");
}, [eventiControlloMese]);



const eventiCalendarioControllo = useMemo(() => {
  return eventiControlloMese.filter((x) => {
    if (x.tipo !== "scadenza" && x.tipo !== "appuntamento" && x.tipo !== "nota") {
      return false;
    }

    if (x.tipo === "nota" && x.nota.startsWith("[NOTA_LIBERA_MESE]")) {
      return false;
    }

    return true;
  });
}, [eventiControlloMese]);

const eventiControlloGiornoSelezionato = useMemo(() => {
  if (!controlloDettaglioData) return [];

  return eventiCalendarioControllo
    .filter((ev) => ev.data === controlloDettaglioData)
    .slice()
    .sort((a, b) => {
      const oraA = a.ora || "09:00";
      const oraB = b.ora || "09:00";
      const d = oraA.localeCompare(oraB);
      if (d !== 0) return d;
      return a.titolo.localeCompare(b.titolo);
    });
}, [controlloDettaglioData, eventiCalendarioControllo]);

const entrateControlloMese = useMemo(() => {
  return eventiControlloMese.filter((x) => x.movimento === "entrata");
}, [eventiControlloMese]);

const usciteControlloMese = useMemo(() => {
  return eventiControlloMese.filter((x) => x.movimento === "uscita" && x.importo !== null);
}, [eventiControlloMese]);

const eventiControlloMeseVisibili = useMemo(() => {
  return eventiControlloMese.filter((ev) => {
    if (ev.tipo === "scadenza" || ev.tipo === "appuntamento") {
      return giorniMancanti(ev.data) >= 0;
    }
    return true;
  });
}, [eventiControlloMese]);

const annoCorrenteArchivio = meseCorrente.getFullYear();
const entrateArchivioMese = useMemo(() => {
  return entrateExtraVal.reduce((s, x) => s + x.importo, 0);
}, [entrateExtraVal]);

const usciteArchivioMese = useMemo(() => {
  const usciteVoci = voci
    .filter((v) => stessoMeseSelezionato(v.data))
    .filter((v) => v.importo !== null && v.movimento === "uscita")
    .reduce((s, v) => s + (v.importo ?? 0), 0);

  const usciteExtra = usciteExtraVal.reduce((s, x) => s + x.importo, 0);

  return usciteVoci + usciteExtra;
}, [voci, usciteExtraVal, meseCorrente]);

const saldoArchivioMese = useMemo(() => {
  return entrateArchivioMese - usciteArchivioMese;
}, [entrateArchivioMese, usciteArchivioMese]);

const turniArchivioMese = useMemo(() => {
  return turni.filter((t) => stessoMeseSelezionato(t.data));
}, [turni, meseCorrente]);

const turniStatsArchivioMese = useMemo(() => {
  const stats = { N: 0, M: 0, P: 0, S: 0, R: 0, F: 0, T: 0 };

  for (const t of turniArchivioMese) {
    const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
    stats[sigla as keyof typeof stats] += 1;
  }

  return stats;
}, [turniArchivioMese]);

const oreArchivioMese = useMemo(() => {
  return turniArchivioMese.reduce((s, t) => s + t.oreOrdinarie + t.oreStraordinarie, 0);
}, [turniArchivioMese]);

const entrateArchivioAnno = useMemo(() => {
  return Object.values(incassi).reduce((acc, mese) => {
    return (
      acc +
      (mese.entrateExtra ?? [])
        .filter((x) => {
          const [a] = x.data.split("-").map(Number);
          return a === annoCorrenteArchivio;
        })
        .reduce((s, x) => s + x.importo, 0)
    );
  }, 0);
}, [incassi, annoCorrenteArchivio]);

const usciteArchivioAnno = useMemo(() => {
  const usciteDaVoci = voci
    .filter((v) => v.importo !== null && v.movimento === "uscita")
    .filter((v) => {
      const [a] = v.data.split("-").map(Number);
      return a === annoCorrenteArchivio;
    })
    .reduce((s, v) => s + (v.importo ?? 0), 0);

  const usciteDaExtra = Object.values(incassi).reduce((acc, mese) => {
    return (
      acc +
      (mese.usciteExtra ?? [])
        .filter((x) => {
          const [a] = x.data.split("-").map(Number);
          return a === annoCorrenteArchivio;
        })
        .reduce((s, x) => s + x.importo, 0)
    );
  }, 0);

  return usciteDaVoci + usciteDaExtra;
}, [voci, incassi, annoCorrenteArchivio]);

const saldoArchivioAnno = useMemo(() => {
  return entrateArchivioAnno - usciteArchivioAnno;
}, [entrateArchivioAnno, usciteArchivioAnno]);

const eventiArchivioMese = useMemo(() => {
  const vociArchiviateMese = voci
    .filter((v) => stessoMeseSelezionato(v.data))
    .map((v) => ({
      id: v.id,
      data: v.data,
      ora: v.ora,
      titolo: v.titolo,
      tipo: v.tipo,
      importo: v.importo,
      movimento: v.movimento,
      nota: v.nota,
      urgente: v.urgente,
      origine: "voce" as const,
    }));

  const entrateMese = entrateExtraVal.map((x) => ({
    id: x.id,
    data: x.data,
    ora: "09:00",
    titolo: x.descrizione,
    tipo: "entrata" as const,
    importo: x.importo,
    movimento: "entrata" as const,
    nota: "",
    urgente: false,
    origine: "entrata" as const,
  }));

  const usciteMese = usciteExtraVal.map((x) => ({
    id: x.id,
    data: x.data,
    ora: "09:00",
    titolo: x.descrizione,
    tipo: "uscita" as const,
    importo: x.importo,
    movimento: "uscita" as const,
    nota: x.nota,
    urgente: false,
    origine: "uscita-extra" as const,
  }));

  return [...vociArchiviateMese, ...entrateMese, ...usciteMese].sort((a, b) => {
    const d = a.data.localeCompare(b.data);
    if (d !== 0) return d;
    return a.ora.localeCompare(b.ora);
  });
}, [voci, entrateExtraVal, usciteExtraVal, meseCorrente]);

function badgeTipo(t: Voce["tipo"]) {
  const map = {
    scadenza: {
      bg: "rgba(52,211,153,0.16)",
      bd: "rgba(5,150,105,0.26)",
      tx: "rgba(6,95,70,0.98)",
      label: "Scadenza",
    },
    appuntamento: {
      bg: "rgba(168,85,247,0.16)",
      bd: "rgba(147,51,234,0.24)",
      tx: "rgba(91,33,182,0.98)",
      label: "Appuntamento",
    },
    nota: {
      bg: "rgba(239,68,68,0.12)",
      bd: "rgba(220,38,38,0.22)",
      tx: "rgba(153,27,27,0.96)",
      label: "Nota",
    },
  } as const;

  const s = map[t];

  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 950,
        background: s.bg,
        border: `1px solid ${s.bd}`,
        color: s.tx,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function badgeMov(m: Exclude<Movimento, "nessuno">) {
  const map = {
    uscita: { bg: "rgba(255,59,48,0.10)", bd: "rgba(255,59,48,0.22)", tx: "rgba(120,10,8,0.88)" },
    entrata: { bg: "rgba(52,199,89,0.10)", bd: "rgba(52,199,89,0.22)", tx: "rgba(10,85,35,0.88)" },
  } as const;

  const s = map[m];
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 950,
        background: s.bg,
        border: `1px solid ${s.bd}`,
        color: s.tx,
        textTransform: "capitalize",
      }}
    >
      {m === "entrata" ? "Entrata" : "Uscita"}
    </span>
  );
}

function badgeUrgente() {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 1000,
        background: "linear-gradient(180deg, rgba(255,59,48,0.96), rgba(220,24,20,0.94))",
        border: "1px solid rgba(255,59,48,0.42)",
        color: "rgba(255,255,255,0.98)",
        boxShadow: "0 10px 24px rgba(255,59,48,0.22)",
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      Urgente
    </span>
  );
}

const pageBg: React.CSSProperties = {
  minHeight: "100vh",
  padding: 18,
  fontFamily: "Inter, system-ui, sans-serif",
  color: "rgba(241,245,249,0.96)",
  background:
    "radial-gradient(1200px 900px at 0% 0%, rgba(79,70,229,0.22), transparent 56%), radial-gradient(1000px 760px at 100% 10%, rgba(168,85,247,0.16), transparent 52%), radial-gradient(1000px 900px at 50% 100%, rgba(14,165,233,0.12), transparent 56%), linear-gradient(180deg, #020617 0%, #081127 36%, #0f172a 72%, #111827 100%)",
};

const topBar: React.CSSProperties = {
  maxWidth: 1060,
  margin: "0 auto",
  display: "grid",
  gap: 14,
};

const chip = (active: boolean): React.CSSProperties => ({
  padding: "11px 13px",
  borderRadius: 999,
  border: `1px solid ${
    active ? "rgba(99,102,241,0.34)" : "rgba(255,255,255,0.10)"
  }`,
  background: active
    ? "linear-gradient(180deg, rgba(79,70,229,0.34), rgba(124,58,237,0.20))"
    : "rgba(15,23,42,0.82)",
  boxShadow: active
    ? "0 16px 34px rgba(79,70,229,0.24)"
    : "0 10px 22px rgba(2,6,23,0.26)",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 13,
  color: active ? "rgba(255,255,255,0.98)" : "rgba(226,232,240,0.92)",
  transition: "transform .14s ease, box-shadow .14s ease, background .14s ease",
  userSelect: "none",
});

const inputLight = (focused = false): React.CSSProperties => ({
  width: "100%",
  height: 48,
  padding: "10px 14px",
  borderRadius: 18,
  border: `1px solid ${
    focused ? "rgba(99,102,241,0.40)" : "rgba(255,255,255,0.12)"
  }`,
  background: "rgba(2,6,23,0.96)",
  color: "rgba(248,250,252,0.99)",
  fontSize: 15,
  fontWeight: 700,
  outline: "none",
  boxShadow: focused ? "0 0 0 4px rgba(79,70,229,0.18)" : "none",
  boxSizing: "border-box",
  WebkitTextFillColor: "rgba(248,250,252,0.99)",
  caretColor: "rgba(255,255,255,0.98)",
  colorScheme: "dark",
});

const sx = useMemo(() => {
  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.48)",
    backdropFilter: "blur(18px)",
    display: "grid",
    placeItems: "center",
    padding: 18,
    zIndex: 999,
  };

  const modal: React.CSSProperties = {
    width: "min(680px, 100%)",
    borderRadius: 30,
    background: "linear-gradient(180deg, rgba(248,250,252,0.98), rgba(241,245,249,0.96))",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 54px 140px rgba(2,6,23,0.34)",
    overflow: "hidden",
    position: "relative",
    animation: "popIn .18s ease both",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    backdropFilter: "blur(18px)",
    color: "rgba(15,23,42,0.96)",
  };

  const header: React.CSSProperties = {
    padding: "22px 24px",
    borderBottom: "1px solid rgba(15,23,42,0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    color: "rgba(15,23,42,0.96)",
  };

  const closeBtn: React.CSSProperties = {
    color: "rgba(15,23,42,0.88)",
    width: 46,
    height: 46,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.96)",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 900,
    display: "grid",
    placeItems: "center",
    transition: "transform .12s ease, filter .12s ease",
  };

  const closeBtnHover: React.CSSProperties = {
    transform: "scale(1.03)",
    filter: "brightness(1.02)",
  };

  const body: React.CSSProperties = {
    padding: 24,
    display: "grid",
    gap: 16,
    position: "relative",
    zIndex: 1,
    justifyItems: "center",
    overflowY: "auto",
    flex: 1,
    color: "rgba(15,23,42,0.94)",
  };

  const content: React.CSSProperties = {
    width: "100%",
    maxWidth: 560,
    display: "grid",
    gap: 16,
    color: "rgba(15,23,42,0.94)",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.82,
    marginBottom: 8,
    fontWeight: 900,
    color: "rgba(30,41,59,0.96)",
  };

  const row2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "start",
  };

  const pills2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  const footer: React.CSSProperties = {
    padding: 20,
    borderTop: "1px solid rgba(15,23,42,0.08)",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    background: "rgba(248,250,252,0.90)",
  };

  const actionBtn = (primary: boolean): React.CSSProperties => ({
    padding: 14,
    borderRadius: 18,
    border: `1px solid ${primary ? "rgba(99,102,241,0.22)" : "rgba(15,23,42,0.10)"}`,
    background: primary
      ? "linear-gradient(180deg, rgba(99,102,241,0.18), rgba(124,58,237,0.12))"
      : "rgba(255,255,255,0.92)",
    color: "rgba(15,23,42,0.94)",
    fontWeight: 950,
    cursor: "pointer",
  });

  return {
    overlay,
    modal,
    header,
    closeBtn,
    closeBtnHover,
    body,
    content,
    sectionLabel,
    row2,
    pills2,
    footer,
    actionBtn,
  };
}, []);

  function entraCome(userId: string) {
    setCurrentUserId(userId);
    setLoginNome("");
    setLoginPick(null);
  }

  function creaEUentra() {
    const nome = loginNome.trim();
    if (nome.length < 2) {
      alert("Inserisci un nome utente valido (min 2 caratteri).");
      return;
    }
    const u: User = { id: safeUUID(), nome };
    const next = [u, ...users];
    setUsers(next);
    salvaUtenti(next);
    entraCome(u.id);
  }

  void creaEUentra;

function esci() {
  setPagina("home");
  setFiltro(null);
  setMeseCorrente(new Date());
}













  
function MiniCalendario({
  mese,
  vociDelMese: _vociDelMese,
  turniDelMese,
  onPrevMonth,
  onNextMonth,
  onEditTurno,
}: {
  mese: Date;
  vociDelMese: Voce[];
  turniDelMese: Turno[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEditTurno: (turno: Turno) => void;
}) {
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [popupTurno, setPopupTurno] = useState<{
    key: string;
    turno: Turno;
    count: number;
    sigla: string;
  } | null>(null);
  const [monthAnim, setMonthAnim] = useState<"idle" | "enter">("enter");

  const isMobileCalendar =
    typeof window !== "undefined" && window.innerWidth <= 640;

  const cellGap = isMobileCalendar ? 4 : 6;
  const dayNumberSize = isMobileCalendar ? 32 : 38;
  const badgeSize = isMobileCalendar ? 20 : 24;
  const badgeFontSize = isMobileCalendar ? 9 : 11;
  const plusFontSize = isMobileCalendar ? 13 : 16;
  const calendarPadding = isMobileCalendar ? 12 : 16;
  const monthTitleSize = isMobileCalendar ? 18 : 22;
  const weekLabelSize = isMobileCalendar ? 9 : 11;
  const dayCellPadding = isMobileCalendar ? 3 : 4;
  const navSize = isMobileCalendar ? 40 : 48;

  const y = mese.getFullYear();
  const m0 = mese.getMonth();

  const first = new Date(y, m0, 1);
  const offset = weekdayMon0(first);
  const dim = daysInMonth(y, m0);

  const oggi = new Date();
  const oggiKey = ymd(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());

  const giorniSettimana = ["L", "M", "M", "G", "V", "S", "D"];

  const giorni: Array<string | null> = [];
  for (let i = 0; i < offset; i++) giorni.push(null);
  for (let d = 1; d <= dim; d++) giorni.push(ymd(y, m0, d));
  while (giorni.length % 7 !== 0) giorni.push(null);

  const titoloMese = mese.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    setMonthAnim("enter");
    const t = window.setTimeout(() => setMonthAnim("idle"), 260);
    return () => window.clearTimeout(t);
  }, [mese]);

  const turniPerData = useMemo(() => {
    const map = new Map<string, Turno[]>();
    for (const t of turniDelMese) {
      const prev = map.get(t.data) ?? [];
      prev.push(t);
      map.set(t.data, prev);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.inizio.localeCompare(b.inizio));
    }
    return map;
  }, [turniDelMese]);

  function getTurnoColor(sigla: string) {
    if (sigla === "R") return "linear-gradient(180deg, #64748b, #475569)";
    if (sigla === "F") return "linear-gradient(180deg, #8b5cf6, #7c3aed)";
    if (sigla === "A") return "linear-gradient(180deg, #ef4444, #dc2626)";
    if (sigla === "N") return "linear-gradient(180deg, #2563eb, #1d4ed8)";
    if (sigla === "M") return "linear-gradient(180deg, #f59e0b, #d97706)";
    if (sigla === "P") return "linear-gradient(180deg, #f97316, #ea580c)";
    if (sigla === "S") return "linear-gradient(180deg, #a855f7, #7e22ce)";
    return "linear-gradient(180deg, #3b82f6, #2563eb)";
  }

  function getPasqua(year: number) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  const festivitaSet = useMemo(() => {
    const set = new Set<string>();

    const fisse = [
      [0, 1],
      [0, 6],
      [3, 25],
      [4, 1],
      [5, 2],
      [7, 15],
      [10, 1],
      [11, 8],
      [11, 25],
      [11, 26],
    ];

    for (const [month, day] of fisse) {
      set.add(ymd(y, month, day));
    }

    const pasqua = getPasqua(y);
    const pasquetta = addDays(pasqua, 1);

    set.add(ymd(pasqua.getFullYear(), pasqua.getMonth(), pasqua.getDate()));
    set.add(ymd(pasquetta.getFullYear(), pasquetta.getMonth(), pasquetta.getDate()));

    return set;
  }, [y]);

  function formattaDataPopup(key: string) {
    const [yy, mm, dd] = key.split("-").map(Number);
    const dt = new Date(yy, mm - 1, dd);
    return dt.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function descrizioneCompattaTurno(turno: Turno, sigla: string) {
    if (sigla === "R") return "Giornata di riposo";
    if (sigla === "F") return "Giornata di ferie";
    if (sigla === "A") return "Assenza";
    return `${turno.inizio} - ${turno.fine}`;
  }

  const navButton: React.CSSProperties = {
    width: navSize,
    height: navSize,
    borderRadius: isMobileCalendar ? 14 : 16,
    border: "1px solid rgba(255,255,255,0.84)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
    boxShadow:
      "0 14px 28px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.96)",
    fontSize: isMobileCalendar ? 16 : 18,
    fontWeight: 1000,
    color: "rgba(15,23,42,0.90)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <>
      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: "0 auto",
          marginTop: 10,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            ...ui.card,
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            padding: calendarPadding,
            border: "1px solid rgba(255,255,255,0.58)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
            boxShadow: "0 24px 60px rgba(15,23,42,0.14)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(500px 180px at 0% 0%, rgba(59,130,246,0.06), transparent 60%), radial-gradient(500px 180px at 100% 0%, rgba(124,58,237,0.06), transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: isMobileCalendar ? 10 : 14,
                gap: isMobileCalendar ? 8 : 12,
              }}
            >
              <button
                onClick={onPrevMonth}
                type="button"
                style={navButton}
                aria-label="Mese precedente"
                title="Mese precedente"
              >
                ←
              </button>

              <div
                style={{
                  fontSize: monthTitleSize,
                  fontWeight: 1000,
                  textTransform: "capitalize",
                  color: "rgba(15,23,42,0.98)",
                  letterSpacing: -0.6,
                  textAlign: "center",
                  flex: 1,
                  minWidth: 0,
                  textShadow: "0 6px 16px rgba(99,102,241,0.10)",
                  transform:
                    monthAnim === "enter"
                      ? "translateY(0) scale(1)"
                      : "translateY(0) scale(1)",
                  opacity: 1,
                  transition: "transform .24s ease, opacity .24s ease",
                }}
              >
                {titoloMese}
              </div>

              <button
                onClick={onNextMonth}
                type="button"
                style={navButton}
                aria-label="Mese successivo"
                title="Mese successivo"
              >
                →
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                marginBottom: isMobileCalendar ? 8 : 10,
                gap: cellGap,
                width: "100%",
              }}
            >
              {giorniSettimana.map((g, i) => (
                <div
                  key={`${g}_${i}`}
                  style={{
                    textAlign: "center",
                    fontSize: weekLabelSize,
                    fontWeight: 950,
                    color: i >= 5 ? "rgba(220,38,38,0.96)" : "rgba(100,116,139,0.98)",
                    letterSpacing: 0.25,
                    textTransform: "uppercase",
                  }}
                >
                  {g}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: cellGap,
                width: "100%",
              }}
            >
              {giorni.map((key, idx) => {
                if (!key) {
                  return <div key={idx} style={{ minWidth: 0 }} />;
                }

                const d = Number(key.slice(-2));
                const turni = turniPerData.get(key) ?? [];
                const primo = turni[0];

                const sigla = primo
                  ? normalizeTurnoLabel(primo.inizio, primo.fine, primo.note)
                  : null;

                const isToday = key === oggiKey;

                const cellDate = new Date(y, m0, d);
                const jsDay = cellDate.getDay();
                const isWeekend = jsDay === 0 || jsDay === 6;
                const isFestivo = festivitaSet.has(key);
                const isRedDay = isWeekend || isFestivo;
                const isPressed = pressedKey === key;

                return (
                  <div
                    key={key}
                    onMouseDown={() => setPressedKey(key)}
                    onMouseUp={() => setPressedKey(null)}
                    onMouseLeave={() =>
                      setPressedKey((prev) => (prev === key ? null : prev))
                    }
                    onTouchStart={() => setPressedKey(key)}
                    onTouchEnd={() => setPressedKey(null)}
                    onClick={() => {
                      if (primo) {
                        setPopupTurno({
                          key,
                          turno: primo,
                          count: turni.length,
                          sigla: sigla ?? "",
                        });
                      } else {
                        apriTurnoForm(key);
                      }
                    }}
                  style={{
                    aspectRatio: "1 / 1",
                    minWidth: 0,
                    width: "100%",
                    minHeight: isMobileCalendar ? 64 : 74,
                    borderRadius: isMobileCalendar ? 14 : 18,
                    padding: isMobileCalendar ? 4 : dayCellPadding,
                    cursor: "pointer",
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    alignItems: "center",
                    boxShadow: "none",
                    transition: "transform .16s ease",
                    position: "relative",
                    overflow: "visible",
                    transform: isPressed ? "scale(0.96)" : "scale(1)",
                    boxSizing: "border-box",
                  }}
                    title={isFestivo ? `${key} • Festivo` : key}
                  >
                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "center",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: dayNumberSize,
                          height: dayNumberSize,
                          maxWidth: "100%",
                          maxHeight: "100%",
                          borderRadius: "50%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: isMobileCalendar ? 11 : 14,
                          fontWeight: 1000,
                          color: isRedDay
                            ? "rgba(220,38,38,0.98)"
                            : isToday
                            ? "rgba(49,46,129,0.98)"
                            : "rgba(15,23,42,0.92)",
                          background: isToday
                            ? "rgba(129,140,248,0.10)"
                            : isFestivo
                            ? "rgba(254,242,242,0.72)"
                            : "rgba(255,255,255,0.46)",
                          border: isToday
                            ? "2px solid rgba(129,140,248,0.60)"
                            : isFestivo
                            ? "1px solid rgba(248,113,113,0.22)"
                            : "1px solid rgba(255,255,255,0.18)",
                          lineHeight: 1,
                          boxShadow: isToday
                            ? "0 8px 16px rgba(99,102,241,0.12)"
                            : "none",
                          boxSizing: "border-box",
                        }}
                      >
                        {d}
                      </div>
                    </div>

                    <div
                  style={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        minHeight: isMobileCalendar ? 24 : 28,
                        marginTop: isMobileCalendar ? 4 : 2,
                        marginBottom: isMobileCalendar ? 2 : 0,
                        minWidth: 0,
                        width: "100%",
                      }}
                    >
                      {sigla ? (
                        <div
                          style={{
                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",
                            width: badgeSize,
                            height: badgeSize,
                            margin: "0 auto",
                            borderRadius: "50%",
                            fontSize: badgeFontSize,
                            fontWeight: 1000,
                            color: "white",
                            background: getTurnoColor(sigla),
                            boxShadow:
                              "0 8px 14px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.20)",
                            letterSpacing: 0,
                            lineHeight: 1,
                            flexShrink: 0,
                            boxSizing: "border-box",
                          }}
                        >
                          {sigla}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",
                            width: badgeSize,
                            height: badgeSize,
                            margin: "0 auto",
                            borderRadius: "50%",
                            background: isToday
                              ? "rgba(99,102,241,0.12)"
                              : "rgba(148,163,184,0.10)",
                            border: isToday
                              ? "1px solid rgba(99,102,241,0.16)"
                              : "1px solid rgba(148,163,184,0.08)",
                            fontSize: plusFontSize,
                            color: isToday
                              ? "rgba(79,70,229,0.92)"
                              : "rgba(148,163,184,0.90)",
                            fontWeight: 900,
                            lineHeight: 1,
                            flexShrink: 0,
                            boxSizing: "border-box",
                          }}
                        >
                          +
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        minHeight: isMobileCalendar ? 4 : 8,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "flex-end",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {isFestivo ? (
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: "rgba(220,38,38,0.96)",
                          }}
                        />
                      ) : isWeekend ? (
                        <div
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 999,
                            background: "rgba(248,113,113,0.72)",
                          }}
                        />
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {popupTurno && (
        <div
          onClick={() => setPopupTurno(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.42)",
            backdropFilter: "blur(8px)",
            zIndex: 90,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.60)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
              boxShadow: "0 28px 70px rgba(15,23,42,0.24)",
              padding: 18,
              display: "grid",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 34,
                      textAlign: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 1000,
                      color: "white",
                      background: getTurnoColor(popupTurno.sigla),
                      boxShadow: "0 8px 18px rgba(15,23,42,0.14)",
                    }}
                  >
                    {popupTurno.sigla}
                  </span>

                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 1000,
                      color: "rgba(15,23,42,0.96)",
                    }}
                  >
                    Dettaglio turno
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "rgba(15,23,42,0.68)",
                    textTransform: "capitalize",
                  }}
                >
                  {formattaDataPopup(popupTurno.key)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPopupTurno(null)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.86)",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 900,
                  color: "rgba(15,23,42,0.74)",
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                background:
                  "linear-gradient(180deg, rgba(241,245,249,0.96), rgba(248,250,252,0.94))",
                border: "1px solid rgba(148,163,184,0.12)",
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 950,
                  color: "rgba(15,23,42,0.92)",
                }}
              >
                {descrizioneCompattaTurno(popupTurno.turno, popupTurno.sigla)}
              </div>

              {popupTurno.sigla !== "R" &&
                popupTurno.sigla !== "F" &&
                popupTurno.sigla !== "A" && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "rgba(15,23,42,0.72)",
                    }}
                  >
                    Ordinarie: {formatNumeroOre(popupTurno.turno.oreOrdinarie)} h •
                    Straordinarie:{" "}
                    {formatNumeroOre(popupTurno.turno.oreStraordinarie)} h
                  </div>
                )}

              {popupTurno.turno.note?.trim() && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "rgba(15,23,42,0.72)",
                  }}
                >
                  Nota: {popupTurno.turno.note}
                </div>
              )}

              {popupTurno.count > 1 && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "rgba(79,70,229,0.92)",
                  }}
                >
                  In questo giorno ci sono altri {popupTurno.count - 1} turni.
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setPopupTurno(null)}
                style={{
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.88)",
                  color: "rgba(15,23,42,0.84)",
                  padding: "12px 14px",
                  borderRadius: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Chiudi
              </button>

              <button
                type="button"
                onClick={() => {
                  const turno = popupTurno.turno;
                  setPopupTurno(null);
                  onEditTurno(turno);
                }}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(180deg, rgba(79,70,229,0.98), rgba(124,58,237,0.95))",
                  color: "white",
                  padding: "12px 14px",
                  borderRadius: 14,
                  fontWeight: 1000,
                  cursor: "pointer",
                  boxShadow: "0 14px 28px rgba(79,70,229,0.18)",
                }}
              >
                Modifica turno
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}





















function MiniCalendarioControllo({
  mese,
  eventi,
  onPrevMonth,
  onNextMonth,
  onAddScadenza,
  onAddAppuntamento,
  onAddNota,
  onOpenDayDetails,
}: {
  mese: Date;
  eventi: Array<{
    id: string;
    data: string;
    tipo: "scadenza" | "appuntamento" | "nota" | "entrata" | "uscita";
    titolo: string;
    ora: string;
    importo: number | null;
    movimento: Movimento;
    nota: string;
    urgente: boolean;
    sorgente: "voce" | "entrata" | "uscita-extra";
  }>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onAddScadenza: (data: string) => void;
  onAddAppuntamento: (data: string) => void;
  onAddNota: (data: string) => void;
  onOpenDayDetails: (data: string) => void;
}) {
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window ||
      window.innerWidth <= 820
    );
  });

  const [previewData, setPreviewData] = useState<string | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<{ top: number; left: number } | null>(null);
  const [mobileMenuData, setMobileMenuData] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;

    const checkTouch = () => {
      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const touch =
          window.matchMedia("(hover: none)").matches ||
          window.matchMedia("(pointer: coarse)").matches ||
          "ontouchstart" in window ||
          window.innerWidth <= 820;

        setIsTouchDevice((prev) => (prev !== touch ? touch : prev));
      });
    };

    checkTouch();
    window.addEventListener("resize", checkTouch, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", checkTouch);
    };
  }, []);

  const { titoloMese, giorni, oggiKey, stats } = useMemo(() => {
    const y = mese.getFullYear();
    const m0 = mese.getMonth();
    const first = new Date(y, m0, 1);
    const offset = weekdayMon0(first);
    const dim = daysInMonth(y, m0);

    const oggi = new Date();
    const oggiKeyLocal = ymd(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());

    const giorniLocal: Array<string | null> = [];
    for (let i = 0; i < offset; i++) giorniLocal.push(null);
    for (let d = 1; d <= dim; d++) giorniLocal.push(ymd(y, m0, d));
    while (giorniLocal.length % 7 !== 0) giorniLocal.push(null);

    const statsLocal = new Map<
      string,
      {
        scadenze: number;
        appuntamenti: number;
        note: number;
        urgente: boolean;
      }
    >();

    for (const ev of eventi) {
      const prev = statsLocal.get(ev.data) ?? {
        scadenze: 0,
        appuntamenti: 0,
        note: 0,
        urgente: false,
      };

      if (ev.tipo === "scadenza") prev.scadenze += 1;
      if (ev.tipo === "appuntamento") prev.appuntamenti += 1;
      if (ev.tipo === "nota") prev.note += 1;
      if (ev.urgente) prev.urgente = true;

      statsLocal.set(ev.data, prev);
    }

    const titoloMeseLocal = mese.toLocaleDateString("it-IT", {
      month: "long",
      year: "numeric",
    });

    return {
      titoloMese: titoloMeseLocal,
      giorni: giorniLocal,
      oggiKey: oggiKeyLocal,
      stats: statsLocal,
    };
  }, [mese, eventi]);

  const eventiPreviewGiorno = useMemo(() => {
    if (!previewData) return [];

    return eventi
      .filter(
        (ev) =>
          ev.data === previewData &&
          (ev.tipo === "scadenza" || ev.tipo === "appuntamento" || ev.tipo === "nota")
      )
      .slice()
      .sort((a, b) => {
        const oraA = a.ora || "09:00";
        const oraB = b.ora || "09:00";
        const d = oraA.localeCompare(oraB);
        if (d !== 0) return d;
        return a.titolo.localeCompare(b.titolo);
      });
  }, [previewData, eventi]);

  function chiudiPreview() {
    setPreviewData(null);
    setPreviewAnchor(null);
  }

  function apriPreviewDesktop(data: string, element: HTMLButtonElement) {
    const rect = element.getBoundingClientRect();

    const panelWidth = 320;
    const estimatedHeight = 260;

    let left = rect.left + rect.width / 2 - panelWidth / 2;
    let top = rect.top - estimatedHeight - 12;

    if (left < 12) left = 12;
    if (left + panelWidth > window.innerWidth - 12) {
      left = window.innerWidth - panelWidth - 12;
    }

    if (top < 12) {
      top = rect.bottom + 12;
    }

    setPreviewData(data);
    setPreviewAnchor({ top, left });
  }

  useEffect(() => {
    if (!previewData) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudiPreview();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", chiudiPreview, { passive: true });
    window.addEventListener("scroll", chiudiPreview, true);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", chiudiPreview);
      window.removeEventListener("scroll", chiudiPreview, true);
    };
  }, [previewData]);

  const navBtnStyle: React.CSSProperties = {
    width: isTouchDevice ? 44 : 50,
    height: isTouchDevice ? 44 : 50,
    borderRadius: isTouchDevice ? 18 : 20,
    border: "1px solid rgba(255,255,255,0.68)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(245,248,252,0.92))",
    boxShadow:
      "0 12px 30px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(148,163,184,0.08)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: "rgba(30,41,59,0.86)",
    padding: 0,
    flexShrink: 0,
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    backdropFilter: "blur(10px)",
  };

  return (
    <>
      <div
        style={{
          ...ui.card,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: isTouchDevice ? 8 : 18,
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTouchDevice ? "44px minmax(0, 1fr) 44px" : "50px 1fr 50px",
            alignItems: "center",
            gap: isTouchDevice ? 12 : 14,
            marginBottom: isTouchDevice ? 12 : 16,
          }}
        >
          <button
            type="button"
            onClick={onPrevMonth}
            style={navBtnStyle}
            title="Mese precedente"
            aria-label="Mese precedente"
          >
            <span
              style={{
                position: "relative",
                display: "block",
                width: isTouchDevice ? 16 : 18,
                height: isTouchDevice ? 16 : 18,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  margin: "auto",
                  width: isTouchDevice ? 9 : 10,
                  height: isTouchDevice ? 9 : 10,
                  borderLeft: "2.6px solid currentColor",
                  borderBottom: "2.6px solid currentColor",
                  transform: "rotate(45deg)",
                  borderRadius: 1,
                  boxSizing: "border-box",
                }}
              />
            </span>
          </button>

          <div
            style={{
              textAlign: "center",
              fontSize: isTouchDevice ? 17 : 24,
              fontWeight: 1000,
              letterSpacing: -0.7,
              textTransform: "capitalize",
              color: "rgba(15,23,42,0.96)",
              lineHeight: 1.05,
              minWidth: 0,
            }}
          >
            {titoloMese}
          </div>

          <button
            type="button"
            onClick={onNextMonth}
            style={navBtnStyle}
            title="Mese successivo"
            aria-label="Mese successivo"
          >
            <span
              style={{
                position: "relative",
                display: "block",
                width: isTouchDevice ? 16 : 18,
                height: isTouchDevice ? 16 : 18,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  margin: "auto",
                  width: isTouchDevice ? 9 : 10,
                  height: isTouchDevice ? 9 : 10,
                  borderTop: "2.6px solid currentColor",
                  borderRight: "2.6px solid currentColor",
                  transform: "rotate(45deg)",
                  borderRadius: 1,
                  boxSizing: "border-box",
                }}
              />
            </span>
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: isTouchDevice ? 4 : 10,
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          {giorni.map((key, idx) => {
            if (!key) {
              return (
                <div
                  key={`ec_${idx}`}
                  style={{
                    minHeight: isTouchDevice ? 92 : 124,
                    borderRadius: isTouchDevice ? 16 : 20,
                    background: "transparent",
                  }}
                />
              );
            }

            const cellDate = new Date(
              Number(key.slice(0, 4)),
              Number(key.slice(5, 7)) - 1,
              Number(key.slice(8, 10))
            );

            const d = cellDate.getDate();
            const info = stats.get(key);
            const isToday = key === oggiKey;
            const jsDay = cellDate.getDay();
            const isWeekend = jsDay === 0 || jsDay === 6;

            const scadenze = info?.scadenze ?? 0;
            const appuntamenti = info?.appuntamenti ?? 0;
            const noteCount = info?.note ?? 0;
            const totalEvents = scadenze + appuntamenti + noteCount;

            return (
              <div
                key={key}
                style={{
                  minHeight: isTouchDevice ? 92 : 128,
                  borderRadius: isTouchDevice ? 16 : 20,
                  border: info?.urgente
                    ? "2px solid rgba(239,68,68,0.34)"
                    : isToday
                    ? "2px solid rgba(59,130,246,0.28)"
                    : "1px solid rgba(15,23,42,0.08)",
               background: isToday
                    ? "linear-gradient(180deg, rgba(255,245,244,0.99), rgba(255,251,251,0.98))"
                    : isTouchDevice
                    ? "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))"
                    : "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.86))",
                  boxShadow: "0 10px 20px rgba(15,23,42,0.07)",
                  padding: isTouchDevice ? "6px 4px" : "10px",
                  display: "grid",
                  gridTemplateRows: isTouchDevice ? "auto 1fr auto" : "auto 1fr",
                  gap: isTouchDevice ? 6 : 8,
                  overflow: "hidden",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    justifyItems: "center",
                    gap: isTouchDevice ? 2 : 3,
                    alignContent: "start",
                    position: "relative",
                  }}
                >
                  {noteCount > 0 && (
                    <div
                      title={noteCount === 1 ? "Nota presente" : `${noteCount} note presenti`}
                      style={{
                        position: "absolute",
                        top: isTouchDevice ? 0 : -2,
                        right: isTouchDevice ? 4 : 2,
                        width: isTouchDevice ? 8 : 9,
                        height: isTouchDevice ? 8 : 9,
                        borderRadius: 999,
                        background: "rgba(220,38,38,0.96)",
                        boxShadow: "0 0 0 4px rgba(220,38,38,0.12)",
                      }}
                    />
                  )}

                  <div
                    style={{
                      fontSize: isTouchDevice ? 8 : 11,
                      fontWeight: 1000,
                      letterSpacing: 0.2,
                      textTransform: "uppercase",
                      color: isWeekend ? "rgba(185,28,28,0.86)" : "rgba(22,101,52,0.80)",
                      lineHeight: 1,
                    }}
                  >
                    {cellDate
                      .toLocaleDateString("it-IT", { weekday: "short" })
                      .replace(".", "")}
                  </div>

                  <div
                    style={{
                      fontSize: isTouchDevice ? (isToday ? 16 : 15) : isToday ? 24 : 20,
                      fontWeight: 1000,
                      lineHeight: 1,
                      color: isWeekend ? "rgba(200,20,16,0.98)" : "rgba(18,140,48,0.98)",
                      textAlign: "center",
                    }}
                  >
                    {d}
                  </div>
                </div>

                <div
                  style={{
                    minWidth: 0,
                    display: "grid",
                    alignItems: "center",
                    justifyItems: "center",
                    alignContent: "center",
                  }}
                >
                  {isTouchDevice ? (
                    totalEvents > 0 ? (
                      <button
                        type="button"
                        onClick={() => onOpenDayDetails(key)}
                        style={{
                          width: "100%",
                          maxWidth: 52,
                          minHeight: 32,
                          padding: "4px 6px",
                          borderRadius: 14,
                          fontSize: 8,
                          fontWeight: 950,
                          textAlign: "center",
                          color: info?.urgente
                            ? "rgba(185,28,28,0.98)"
                            : "rgba(15,23,42,0.82)",
                          background: info?.urgente
                            ? "rgba(254,226,226,0.95)"
                            : "rgba(241,245,249,0.92)",
                          border: info?.urgente
                            ? "1px solid rgba(239,68,68,0.18)"
                            : "1px solid rgba(148,163,184,0.16)",
                          cursor: "pointer",
                          lineHeight: 1.05,
                          display: "grid",
                          placeItems: "center",
                          boxSizing: "border-box",
                          boxShadow: info?.urgente
                            ? "0 6px 14px rgba(239,68,68,0.08)"
                            : "0 6px 14px rgba(15,23,42,0.05)",
                        }}
                        title="Apri dettagli del giorno"
                      >
                        <span style={{ fontSize: 11, fontWeight: 1000, lineHeight: 1 }}>
                          {totalEvents}
                        </span>
                        <span style={{ display: "block", lineHeight: 1, marginTop: 1 }}>
                          {totalEvents === 1 ? "evento" : "eventi"}
                        </span>
                      </button>
                    ) : (
                      <div
                        style={{
                          width: 34,
                          height: 20,
                          borderRadius: 999,
                          background: "rgba(241,245,249,0.65)",
                          border: "1px solid rgba(148,163,184,0.10)",
                          opacity: 0.55,
                        }}
                      />
                    )
                  ) : (
                    <div style={{ display: "grid", gap: 4, width: "100%", minWidth: 0 }}>
                      {scadenze > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => apriPreviewDesktop(key, e.currentTarget)}
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 900,
                            textAlign: "center",
                            color: "rgba(6,95,70,0.98)",
                            background: "rgba(220,252,231,0.95)",
                            border: "1px solid rgba(16,185,129,0.18)",
                            cursor: "pointer",
                          }}
                          title="Anteprima giorno"
                        >
                          SCA {scadenze}
                        </button>
                      ) : null}

                      {appuntamenti > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => apriPreviewDesktop(key, e.currentTarget)}
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 900,
                            textAlign: "center",
                            color: "rgba(107,33,168,0.98)",
                            background: "rgba(245,243,255,0.95)",
                            border: "1px solid rgba(168,85,247,0.18)",
                            cursor: "pointer",
                          }}
                          title="Anteprima giorno"
                        >
                          APP {appuntamenti}
                        </button>
                      ) : null}

                      {noteCount > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => apriPreviewDesktop(key, e.currentTarget)}
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 900,
                            textAlign: "center",
                            color: "rgba(153,27,27,0.98)",
                            background: "rgba(254,242,242,0.96)",
                            border: "1px solid rgba(239,68,68,0.18)",
                            cursor: "pointer",
                          }}
                          title="Anteprima note"
                        >
                          NOT {noteCount}
                        </button>
                      ) : null}

                      {totalEvents === 0 ? (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            opacity: 0.25,
                            textAlign: "center",
                          }}
                        >
                          —
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 4,
                          marginTop: 2,
                          width: "100%",
                          boxSizing: "border-box",
                          justifyItems: "center",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onAddScadenza(key)}
                          style={{
                            width: "100%",
                            maxWidth: 44,
                            minWidth: 0,
                            padding: "4px 6px",
                            borderRadius: 999,
                            border: "1px solid rgba(16,185,129,0.18)",
                            background: "rgba(220,252,231,0.92)",
                            fontSize: 10,
                            fontWeight: 900,
                            cursor: "pointer",
                            color: "rgba(6,95,70,0.98)",
                            textAlign: "center",
                            lineHeight: 1,
                          }}
                          title="Nuova scadenza"
                        >
                          +S
                        </button>

                        <button
                          type="button"
                          onClick={() => onAddAppuntamento(key)}
                          style={{
                            width: "100%",
                            maxWidth: 44,
                            minWidth: 0,
                            padding: "4px 6px",
                            borderRadius: 999,
                            border: "1px solid rgba(168,85,247,0.18)",
                            background: "rgba(245,243,255,0.92)",
                            fontSize: 10,
                            fontWeight: 900,
                            cursor: "pointer",
                            color: "rgba(107,33,168,0.98)",
                            textAlign: "center",
                            lineHeight: 1,
                          }}
                          title="Nuovo appuntamento"
                        >
                          +A
                        </button>

                        <button
                          type="button"
                          onClick={() => onAddNota(key)}
                          style={{
                            width: "100%",
                            maxWidth: 44,
                            minWidth: 0,
                            padding: "4px 6px",
                            borderRadius: 999,
                            border: "1px solid rgba(239,68,68,0.18)",
                            background: "rgba(254,242,242,0.96)",
                            fontSize: 10,
                            fontWeight: 900,
                            cursor: "pointer",
                            color: "rgba(153,27,27,0.98)",
                            textAlign: "center",
                            lineHeight: 1,
                          }}
                          title="Nuova nota rapida"
                        >
                          +N
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isTouchDevice ? (
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      minHeight: 28,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setMobileMenuData(key)}
                      style={{
                        width: 30,
                        height: 30,
                        padding: 0,
                        borderRadius: 999,
                        border: "1px solid rgba(99,102,241,0.16)",
                        background:
                          "linear-gradient(180deg, rgba(245,243,255,0.98), rgba(238,242,255,0.94))",
                        color: "rgba(79,70,229,0.98)",
                        fontSize: 18,
                        fontWeight: 1000,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        lineHeight: 1,
                        boxShadow: "0 6px 14px rgba(79,70,229,0.08)",
                        boxSizing: "border-box",
                      }}
                      title="Aggiungi"
                    >
                      <span
                        style={{
                          transform: "translateY(-1px)",
                          display: "block",
                          lineHeight: 1,
                        }}
                      >
                        +
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!isTouchDevice && (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              fontSize: 11,
              fontWeight: 900,
              opacity: 0.82,
            }}
          >
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(220,252,231,0.95)",
                border: "1px solid rgba(16,185,129,0.18)",
              }}
            >
              SCA = Scadenze
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(245,243,255,0.95)",
                border: "1px solid rgba(168,85,247,0.18)",
              }}
            >
              APP = Appuntamenti
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(254,242,242,0.96)",
                border: "1px solid rgba(239,68,68,0.18)",
              }}
            >
              NOT = Note
            </span>
          </div>
        )}
      </div>

      {isTouchDevice && mobileMenuData && (
        <div
          onClick={() => setMobileMenuData(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.28)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1400,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(320px, 100%)",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.58)",
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 30px 90px rgba(15,23,42,0.24)",
              padding: 16,
              display: "grid",
              gap: 10,
              animation: "popIn .16s ease",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.2 }}>
              Aggiungi elemento
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
              {formattaDataBreve(mobileMenuData)}
            </div>

            <button
              type="button"
              onClick={() => {
                onAddScadenza(mobileMenuData);
                setMobileMenuData(null);
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 16,
                border: "1px solid rgba(16,185,129,0.18)",
                background: "rgba(220,252,231,0.92)",
                color: "rgba(6,95,70,0.98)",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Nuova scadenza
            </button>

            <button
              type="button"
              onClick={() => {
                onAddAppuntamento(mobileMenuData);
                setMobileMenuData(null);
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 16,
                border: "1px solid rgba(168,85,247,0.18)",
                background: "rgba(245,243,255,0.92)",
                color: "rgba(107,33,168,0.98)",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Nuovo appuntamento
            </button>

            <button
              type="button"
              onClick={() => {
                onAddNota(mobileMenuData);
                setMobileMenuData(null);
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 16,
                border: "1px solid rgba(239,68,68,0.18)",
                background: "rgba(254,242,242,0.96)",
                color: "rgba(153,27,27,0.98)",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Nota rapida
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuData(null)}
              style={{
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "rgba(255,255,255,0.88)",
                color: "rgba(15,23,42,0.86)",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {!isTouchDevice && previewData && previewAnchor && (
        <div
          onClick={chiudiPreview}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: previewAnchor.top,
              left: previewAnchor.left,
              width: 340,
              maxWidth: "calc(100vw - 24px)",
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.58)",
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 28px 80px rgba(15,23,42,0.24)",
              backdropFilter: "blur(16px)",
              padding: 14,
              display: "grid",
              gap: 10,
              animation: "popIn .16s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: -0.2 }}>
                  Anteprima giorno
                </div>
                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, opacity: 0.68 }}>
                  {formattaDataBreve(previewData)}
                </div>
              </div>

              <button
                type="button"
                onClick={chiudiPreview}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.08)",
                  background: "rgba(255,255,255,0.88)",
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.82)",
                }}
              >
                ×
              </button>
            </div>

            {eventiPreviewGiorno.length === 0 ? (
              <div
                style={{
                  padding: 10,
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.08)",
                  background: "rgba(248,250,252,0.88)",
                  fontSize: 12,
                  fontWeight: 800,
                  opacity: 0.7,
                }}
              >
                Nessun evento visibile.
              </div>
            ) : (
              eventiPreviewGiorno.map((ev) => (
                <div
                  key={`${ev.sorgente}_${ev.id}`}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92))",
                    boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "5px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 900,
                        color:
                          ev.tipo === "scadenza"
                            ? "rgba(6,95,70,0.98)"
                            : ev.tipo === "appuntamento"
                            ? "rgba(107,33,168,0.98)"
                            : "rgba(153,27,27,0.98)",
                        background:
                          ev.tipo === "scadenza"
                            ? "rgba(220,252,231,0.95)"
                            : ev.tipo === "appuntamento"
                            ? "rgba(245,243,255,0.95)"
                            : "rgba(254,242,242,0.96)",
                        border:
                          ev.tipo === "scadenza"
                            ? "1px solid rgba(16,185,129,0.18)"
                            : ev.tipo === "appuntamento"
                            ? "1px solid rgba(168,85,247,0.18)"
                            : "1px solid rgba(239,68,68,0.18)",
                      }}
                    >
                      {ev.tipo === "scadenza"
                        ? "Scadenza"
                        : ev.tipo === "appuntamento"
                        ? "Appuntamento"
                        : "Nota"}
                    </span>

                    {ev.urgente && badgeUrgente()}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 950 }}>{ev.titolo}</div>

                  {ev.ora && (
                    <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                      {ev.ora}
                    </div>
                  )}

                  {ev.nota && (
                    <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
                      {ev.nota}
                    </div>
                  )}

                  {ev.importo !== null && (
                    <div
                      style={{
                        justifySelf: "start",
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(239,68,68,0.18)",
                        background: "rgba(254,242,242,0.96)",
                        fontSize: 12,
                        fontWeight: 950,
                        color: "rgba(185,28,28,0.96)",
                      }}
                    >
                      {ev.importo.toLocaleString("it-IT")} €
                    </div>
                  )}
                </div>
              ))
            )}




            <button
              type="button"
              onClick={() => {
                onOpenDayDetails(previewData);
                chiudiPreview();
              }}
              style={{
                marginTop: 2,
                padding: "10px 12px",
                borderRadius: 16,
                border: "1px solid rgba(79,70,229,0.18)",
                background: "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(124,58,237,0.10))",
                color: "rgba(67,56,202,0.98)",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Apri dettaglio completo
            </button>
          </div>
        </div>
      )}
    </>
  );
}













function MiniCalendarioEventi({
  mese,
  eventi,
  onPrevMonth,
  onNextMonth,
  onOpenEvent,
}: {
  mese: Date;
  eventi: Array<{
    id: string;
    data: string;
    ora: string;
    titolo: string;
    tipo: "scadenza" | "appuntamento" | "nota";
    urgente: boolean;
    nota: string;
  }>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenEvent: (id: string) => void;
}) {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;

  const [previewEventoId, setPreviewEventoId] = useState<string | null>(null);

  const y = mese.getFullYear();
  const m0 = mese.getMonth();
  const first = new Date(y, m0, 1);
  const offset = weekdayMon0(first);
  const dim = daysInMonth(y, m0);

  const oggi = new Date();
  const oggiKey = ymd(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());

  const giorniSettimana = ["L", "M", "M", "G", "V", "S", "D"];

  function getPasqua(year: number) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const mm = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * mm + 114) / 31);
    const day = ((h + l - 7 * mm + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  const festivitaSet = useMemo(() => {
    const set = new Set<string>();

    const fisse = [
      [0, 1],
      [0, 6],
      [3, 25],
      [4, 1],
      [5, 2],
      [7, 15],
      [10, 1],
      [11, 8],
      [11, 25],
      [11, 26],
    ];

    for (const [month, day] of fisse) {
      set.add(ymd(y, month, day));
    }

    const pasqua = getPasqua(y);
    const pasquetta = addDays(pasqua, 1);

    set.add(ymd(pasqua.getFullYear(), pasqua.getMonth(), pasqua.getDate()));
    set.add(ymd(pasquetta.getFullYear(), pasquetta.getMonth(), pasquetta.getDate()));

    return set;
  }, [y]);

  const giorni: Array<string | null> = [];
  for (let i = 0; i < offset; i++) giorni.push(null);
  for (let d = 1; d <= dim; d++) giorni.push(ymd(y, m0, d));
  while (giorni.length % 7 !== 0) giorni.push(null);

  const titoloMese = mese.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const eventiPerData = useMemo(() => {
    const map = new Map<string, typeof eventi>();

    for (const ev of eventi) {
      const prev = map.get(ev.data) ?? [];
      prev.push(ev);
      map.set(ev.data, prev);
    }

    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const d = a.ora.localeCompare(b.ora);
        if (d !== 0) return d;
        return a.titolo.localeCompare(b.titolo);
      });
    }

    return map;
  }, [eventi]);

  const previewEvento = useMemo(() => {
    if (!previewEventoId) return null;
    return eventi.find((ev) => ev.id === previewEventoId) ?? null;
  }, [previewEventoId, eventi]);

  const navBtnStyle: React.CSSProperties = {
    width: isMobile ? 40 : 46,
    height: isMobile ? 40 : 46,
    borderRadius: isMobile ? 14 : 16,
    border: "1px solid rgba(255,255,255,0.72)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
    boxShadow:
      "0 12px 26px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.96)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: "rgba(30,41,59,0.90)",
    padding: 0,
    flexShrink: 0,
  };

  function pillEventoStyle(ev: { urgente: boolean }) {
    return {
      background: ev.urgente
        ? "rgba(254,226,226,0.98)"
        : "rgba(237,233,254,0.98)",
      border: ev.urgente
        ? "1px solid rgba(239,68,68,0.22)"
        : "1px solid rgba(139,92,246,0.18)",
      color: ev.urgente
        ? "rgba(153,27,27,0.98)"
        : "rgba(91,33,182,0.98)",
    };
  }

  return (
    <>
      <div
        style={{
          ...ui.card,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: isMobile ? 10 : 18,
          border: "1px solid rgba(255,255,255,0.58)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
          boxShadow: "0 22px 54px rgba(15,23,42,0.12)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(700px 220px at 0% 0%, rgba(79,70,229,0.06), transparent 60%), radial-gradient(700px 220px at 100% 0%, rgba(16,185,129,0.06), transparent 60%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "40px minmax(0,1fr) 40px" : "46px 1fr 46px",
              alignItems: "center",
              gap: isMobile ? 10 : 14,
              marginBottom: isMobile ? 12 : 16,
            }}
          >
            <button type="button" onClick={onPrevMonth} style={navBtnStyle}>
              ←
            </button>

            <div
              style={{
                textAlign: "center",
                fontSize: isMobile ? 20 : 26,
                fontWeight: 1000,
                letterSpacing: -0.7,
                textTransform: "capitalize",
                color: "rgba(15,23,42,0.98)",
                lineHeight: 1.05,
                minWidth: 0,
              }}
            >
              {titoloMese}
            </div>

            <button type="button" onClick={onNextMonth} style={navBtnStyle}>
              →
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: isMobile ? 6 : 8,
              marginBottom: isMobile ? 8 : 10,
            }}
          >
            {giorniSettimana.map((g, i) => (
              <div
                key={`${g}_${i}`}
                style={{
                  textAlign: "center",
                  fontSize: isMobile ? 10 : 11,
                  fontWeight: 1000,
                  color: i >= 5 ? "rgba(220,38,38,0.94)" : "rgba(100,116,139,0.96)",
                  textTransform: "uppercase",
                  letterSpacing: 0.25,
                }}
              >
                {g}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: isMobile ? 6 : 10,
              width: "100%",
            }}
          >
            {giorni.map((key, idx) => {
              if (!key) {
                return (
                  <div
                    key={`empty_${idx}`}
                    style={{
                      minHeight: isMobile ? 54 : 86,
                      borderRadius: 16,
                    }}
                  />
                );
              }

              const cellDate = new Date(
                Number(key.slice(0, 4)),
                Number(key.slice(5, 7)) - 1,
                Number(key.slice(8, 10))
              );

              const d = cellDate.getDate();
              const items = eventiPerData.get(key) ?? [];
              const firstEvent = items[0] ?? null;

              const isToday = key === oggiKey;
              const jsDay = cellDate.getDay();
              const isWeekend = jsDay === 0 || jsDay === 6;
              const isFestivo = festivitaSet.has(key);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (items.length > 0 && firstEvent) {
                      setPreviewEventoId(firstEvent.id);
                    }
                  }}
                  style={{
                    minHeight: isMobile ? 54 : 86,
                    borderRadius: 18,
                    border: isToday
                      ? "2px solid rgba(99,102,241,0.24)"
                      : isFestivo
                      ? "1px solid rgba(22,101,52,0.24)"
                      : "1px solid rgba(148,163,184,0.14)",
                    background: isToday
                      ? "linear-gradient(180deg, rgba(238,242,255,0.98), rgba(255,255,255,0.96))"
                      : isFestivo
                      ? "linear-gradient(180deg, rgba(240,253,244,0.98), rgba(255,255,255,0.96))"
                      : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.95))",
                    boxShadow: isToday
                      ? "0 12px 28px rgba(99,102,241,0.10)"
                      : isFestivo
                      ? "0 8px 20px rgba(22,101,52,0.08)"
                      : "0 8px 20px rgba(15,23,42,0.05)",
                    padding: isMobile ? "6px 4px" : "8px 6px",
                    display: "grid",
                    alignContent: "space-between",
                    justifyItems: "center",
                    gap: isMobile ? 6 : 8,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    cursor: items.length > 0 ? "pointer" : "default",
                    appearance: "none",
                    WebkitAppearance: "none",
                    textAlign: "initial",
                  }}
                >
                  <div
                    style={{
                      fontSize: isMobile ? 13 : 15,
                      fontWeight: 1000,
                      color: isFestivo
                        ? "rgba(22,101,52,0.98)"
                        : isWeekend
                        ? "rgba(220,38,38,0.98)"
                        : "rgba(15,23,42,0.94)",
                      lineHeight: 1,
                    }}
                  >
                    {d}
                  </div>

                  <div
                    style={{
                      minHeight: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {items.length > 0 ? (
                      <div
                        style={{
                          width: isMobile ? 10 : 12,
                          height: isMobile ? 10 : 12,
                          borderRadius: 999,
                          background: firstEvent?.urgente
                            ? "rgba(239,68,68,0.98)"
                            : "rgba(139,92,246,0.98)",
                          boxShadow: firstEvent?.urgente
                            ? "0 0 0 5px rgba(239,68,68,0.12)"
                            : "0 0 0 4px rgba(139,92,246,0.10)",
                        }}
                      />
                    ) : isFestivo ? (
                      <div
                        style={{
                          width: isMobile ? 10 : 12,
                          height: isMobile ? 10 : 12,
                          borderRadius: 999,
                          background: "rgba(22,101,52,0.98)",
                          boxShadow: "0 0 0 4px rgba(22,101,52,0.10)",
                        }}
                      />
                    ) : (
                      <div style={{ width: isMobile ? 10 : 12, height: isMobile ? 10 : 12 }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 999,
                background: "rgba(248,250,252,0.95)",
                border: "1px solid rgba(148,163,184,0.16)",
                fontSize: 11,
                fontWeight: 900,
                color: "rgba(15,23,42,0.82)",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(22,101,52,0.98)",
                }}
              />
              Festivo
            </div>
          </div>
        </div>
      </div>

      {previewEvento && (
        <div
          onClick={() => setPreviewEventoId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.32)",
            backdropFilter: "blur(10px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1300,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              borderRadius: 26,
              border: "1px solid rgba(255,255,255,0.62)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
              boxShadow: "0 34px 90px rgba(15,23,42,0.24)",
              padding: 18,
              display: "grid",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                gap: 12,
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      ...pillEventoStyle(previewEvento),
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 950,
                    }}
                  >
                    Evento
                  </span>

                  {previewEvento.urgente && badgeUrgente()}
                </div>

                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 1000,
                    letterSpacing: -0.3,
                    color: "rgba(15,23,42,0.98)",
                    lineHeight: 1.2,
                  }}
                >
                  {previewEvento.titolo}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 850,
                    color: "rgba(71,85,105,0.82)",
                  }}
                >
                  {formattaDataBreve(previewEvento.data)} • {previewEvento.ora}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewEventoId(null)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.92)",
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.78)",
                }}
              >
                ✕
              </button>
            </div>

            {previewEvento.nota && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.14)",
                  background: "rgba(248,250,252,0.92)",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "rgba(51,65,85,0.88)",
                  lineHeight: 1.45,
                }}
              >
                {previewEvento.nota}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setPreviewEventoId(null)}
                style={{
                  padding: "11px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.92)",
                  fontWeight: 900,
                  cursor: "pointer",
                  color: "rgba(15,23,42,0.86)",
                }}
              >
                Chiudi
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenEvent(previewEvento.id);
                  setPreviewEventoId(null);
                }}
                style={{
                  padding: "11px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(79,70,229,0.20)",
                  background:
                    "linear-gradient(180deg, rgba(79,70,229,0.16), rgba(124,58,237,0.12))",
                  fontWeight: 1000,
                  cursor: "pointer",
                  color: "rgba(67,56,202,0.98)",
                  boxShadow: "0 12px 24px rgba(79,70,229,0.10)",
                }}
              >
                Modifica evento
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}








  function renderAreaControllo() {
    const controlloCardStyle: React.CSSProperties = {
      ...ui.card,
      padding: 20,
      overflow: "hidden",
      position: "relative",
    };

    const statBox = (accent: "blue" | "green" | "red" | "violet" | "orange"): React.CSSProperties => {
      const map = {
        blue: {
          bg: "linear-gradient(180deg, rgba(59,130,246,0.14), rgba(59,130,246,0.06))",
          bd: "rgba(59,130,246,0.18)",
          shadow: "0 16px 32px rgba(59,130,246,0.10)",
        },
        green: {
          bg: "linear-gradient(180deg, rgba(16,185,129,0.14), rgba(16,185,129,0.06))",
          bd: "rgba(16,185,129,0.18)",
          shadow: "0 16px 32px rgba(16,185,129,0.10)",
        },
        red: {
          bg: "linear-gradient(180deg, rgba(239,68,68,0.14), rgba(239,68,68,0.06))",
          bd: "rgba(239,68,68,0.18)",
          shadow: "0 16px 32px rgba(239,68,68,0.10)",
        },
        violet: {
          bg: "linear-gradient(180deg, rgba(124,58,237,0.14), rgba(124,58,237,0.06))",
          bd: "rgba(124,58,237,0.18)",
          shadow: "0 16px 32px rgba(124,58,237,0.10)",
        },
        orange: {
          bg: "linear-gradient(180deg, rgba(249,115,22,0.14), rgba(249,115,22,0.06))",
          bd: "rgba(249,115,22,0.18)",
          shadow: "0 16px 32px rgba(249,115,22,0.10)",
        },
      };

      return {
        padding: 16,
        borderRadius: 22,
        border: `1px solid ${map[accent].bd}`,
        background: map[accent].bg,
        boxShadow: map[accent].shadow,
      };
    };

    return (
      <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 8, display: "grid", gap: 14 }}>
        <div style={controlloCardStyle}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(700px 240px at 0% 0%, rgba(79,70,229,0.08), transparent 60%), radial-gradient(700px 240px at 100% 0%, rgba(16,185,129,0.08), transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 1000,
                    letterSpacing: -0.6,
                    color: "rgba(15,23,42,0.96)",
                  }}
                >
                  Controllo economico
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    opacity: 0.66,
                  }}
                >
                  Calendario economico con scadenze, appuntamenti, entrate e uscite
                </div>
              </div>

              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.86)",
                  border: "1px solid rgba(15,23,42,0.08)",
                  boxShadow: "0 12px 24px rgba(15,23,42,0.08)",
                  fontSize: 13,
                  fontWeight: 900,
                  textTransform: "capitalize",
                }}
              >
                {nomeMese(meseCorrente)}
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div style={statBox("green")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate mese</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>
                  {entrateTotMese.toLocaleString("it-IT")} €
                </div>
              </div>

              <div style={statBox("red")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Uscite mese</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>
                  {usciteTotMese.toLocaleString("it-IT")} €
                </div>
              </div>

              <div style={statBox(saldoMese >= 0 ? "blue" : "violet")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Saldo mese</div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 24,
                    fontWeight: 1000,
                    color: saldoMese >= 0 ? "rgba(30,64,175,0.96)" : "rgba(109,40,217,0.96)",
                  }}
                >
                  {saldoMese.toLocaleString("it-IT")} €
                </div>
              </div>

              <div style={statBox(saldoAnno >= 0 ? "green" : "orange")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Saldo anno</div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 24,
                    fontWeight: 1000,
                    color: saldoAnno >= 0 ? "rgba(5,150,105,0.96)" : "rgba(194,65,12,0.96)",
                  }}
                >
                  {saldoAnno.toLocaleString("it-IT")} €
                </div>
              </div>

              <div style={statBox("violet")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Scadenze mese</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>
                  {scadenzeControlloMese.length}
                </div>
              </div>

              <div style={statBox("blue")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Appuntamenti mese</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>
                  {appuntamentiControlloMese.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <MiniCalendarioControllo
          mese={meseCorrente}
          eventi={eventiCalendarioControllo}
          onPrevMonth={mesePrecedente}
          onNextMonth={meseSuccessivo}
          onAddScadenza={(dataSel) => apriNuovaConData(dataSel)}
          onAddAppuntamento={(dataSel) => apriNuovaConData(dataSel)}
          onAddNota={(data) => apriNuovaConData(data)}
          onOpenDayDetails={(dataSel) => setControlloDettaglioData(dataSel)}
        />

        {controlloDettaglioData && (
          <div
            onClick={() => setControlloDettaglioData(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.34)",
              backdropFilter: "blur(10px)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 1200,
              animation: "fadeIn .18s ease",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(680px, 100%)",
                maxHeight: "82vh",
                overflowY: "auto",
                borderRadius: 26,
                border: "1px solid rgba(255,255,255,0.58)",
                background: "rgba(255,255,255,0.90)",
                boxShadow: "0 40px 120px rgba(15,23,42,0.28)",
                padding: 18,
                animation: "popIn .18s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 20 }}>
                    Dettaglio giorno
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                    {formattaDataBreve(controlloDettaglioData)}
                  </div>
                </div>

                <button
                  data-chip="1"
                  onClick={() => setControlloDettaglioData(null)}
                  style={chip(false)}
                >
                  Chiudi
                </button>
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {eventiControlloGiornoSelezionato.length === 0 ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "rgba(255,255,255,0.72)",
                      fontSize: 13,
                      fontWeight: 800,
                      opacity: 0.65,
                    }}
                  >
                    Nessun elemento in questo giorno.
                  </div>
                ) : (
                  eventiControlloGiornoSelezionato.map((ev) => (
                    <div
                      key={`${ev.sorgente}_${ev.id}`}
                      style={{
                        padding: 14,
                        borderRadius: 18,
                        border: "1px solid rgba(15,23,42,0.08)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.90))",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        boxShadow: "0 12px 24px rgba(15,23,42,0.06)",
                      }}
                    >
                      <div style={{ display: "grid", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {ev.tipo === "scadenza" || ev.tipo === "appuntamento" || ev.tipo === "nota"
                            ? badgeTipo(ev.tipo as Voce["tipo"])
                            : null}
                          {ev.urgente && badgeUrgente()}
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 950 }}>{ev.titolo}</div>

                        <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                          {ev.ora}
                        </div>

                        {ev.nota && (
                          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
                            {ev.nota}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                        {ev.importo !== null && (
                          <div
                            style={{
                              padding: "7px 11px",
                              borderRadius: 999,
                              border: "2px solid rgba(239,68,68,0.22)",
                              background: "rgba(254,242,242,0.96)",
                              fontSize: 12,
                              fontWeight: 950,
                              color: "rgba(185,28,28,0.96)",
                            }}
                          >
                            {ev.importo.toLocaleString("it-IT")} €
                          </div>
                        )}

                        {ev.sorgente === "voce" && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button
                              data-chip="1"
                              onClick={() => {
                                const voceOriginale = voci.find((x) => x.id === ev.id);
                                if (!voceOriginale) return;
                                setControlloDettaglioData(null);
                                apriModifica(voceOriginale);
                              }}
                              style={chip(false)}
                            >
                              Modifica
                            </button>

                            <button
                              data-chip="1"
                              onClick={() => elimina(ev.id)}
                              style={{
                                ...chip(false),
                                border: "1px solid rgba(239,68,68,0.22)",
                                color: "rgba(185,28,28,0.96)",
                                background: "rgba(254,242,242,0.92)",
                              }}
                            >
                              Elimina
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 14,
          }}
          className="remember-grid-2"
        >

<div style={{ ...ui.card, padding: 18, overflow: "hidden" }}>
  <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Entrate del mese</div>
  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
    Aggiungi manualmente ogni entrata con data, descrizione e importo
  </div>

  <div
    style={{
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 10,
      alignItems: "end",
      maxWidth: "100%",
      overflow: "hidden",
    }}
  >
    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Data</div>
      <input
        type="date"
        value={nuovaEntrataData}
        onChange={(e) => setNuovaEntrataData(e.target.value)}
        style={inputLight(false)}
      />
    </div>

    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Descrizione</div>
      <input
        type="text"
        value={nuovaEntrataDesc}
        onChange={(e) => setNuovaEntrataDesc(e.target.value)}
        placeholder="Es: Rimborso, straordinario, regalo..."
        style={inputLight(false)}
      />
    </div>

    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Importo</div>
      <input
        type="text"
        inputMode="decimal"
        value={nuovaEntrataImporto}
        onChange={(e) => setNuovaEntrataImporto(e.target.value)}
        placeholder="Es: 150"
        style={inputLight(false)}
      />
    </div>

    <button
      data-chip="1"
      onClick={aggiungiEntrataExtra}
      style={{
        ...chip(true),
        height: 48,
        width: "100%",
        background: "linear-gradient(180deg, rgba(16,185,129,0.24), rgba(5,150,105,0.14))",
        border: "1px solid rgba(16,185,129,0.34)",
        color: "rgba(6,95,70,0.98)",
        boxShadow: "0 16px 30px rgba(16,185,129,0.16)",
      }}
    >
      Aggiungi entrata
    </button>
  </div>

  <div
    style={{
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: 10,
    }}
  >
    <div
      style={{
        padding: 14,
        borderRadius: 18,
        border: "1px solid rgba(16,185,129,0.12)",
        background: "linear-gradient(180deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate mese</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
        {entrateControlloMese.length}
      </div>
    </div>

    <div
      style={{
        padding: 14,
        borderRadius: 18,
        border: "1px solid rgba(124,58,237,0.12)",
        background: "linear-gradient(180deg, rgba(124,58,237,0.08), rgba(124,58,237,0.03))",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Totale entrate mese</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
        {totaleEntrateExtra.toLocaleString("it-IT")} €
      </div>
    </div>
  </div>

  <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
    {entrateExtraVal.length === 0 ? (
      <div
        style={{
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.08)",
          background: "rgba(255,255,255,0.72)",
          fontSize: 13,
          fontWeight: 800,
          opacity: 0.65,
        }}
      >
        Nessuna entrata inserita.
      </div>
    ) : (
      entrateExtraVal
        .slice()
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((x) => (
          <div
            key={x.id}
            style={{
              padding: 14,
              borderRadius: 18,
              border: "1px solid rgba(16,185,129,0.16)",
              background: "linear-gradient(180deg, rgba(16,185,129,0.08), rgba(16,185,129,0.04))",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.65 }}>
                {formattaDataBreve(x.data)}
              </div>
              <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950 }}>
                {x.descrizione}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 900,
                  color: "rgba(5,150,105,0.96)",
                }}
              >
                {x.importo.toLocaleString("it-IT")} €
              </div>
            </div>

            <button data-chip="1" onClick={() => eliminaEntrataExtra(x.id)} style={chip(false)}>
              Elimina
            </button>
          </div>
        ))
    )}
  </div>
</div>

<div style={{ ...ui.card, padding: 18, overflow: "hidden" }}>
  <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Uscite extra del mese</div>
  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
    Inserisci spese extra con data, descrizione, importo e nota
  </div>

  <div
    style={{
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 10,
      alignItems: "end",
      maxWidth: "100%",
      overflow: "hidden",
    }}
  >
    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Data</div>
      <input
        type="date"
        value={nuovaUscitaData}
        onChange={(e) => setNuovaUscitaData(e.target.value)}
        style={inputLight(false)}
      />
    </div>

    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Descrizione</div>
      <input
        type="text"
        value={nuovaUscitaDesc}
        onChange={(e) => setNuovaUscitaDesc(e.target.value)}
        placeholder="Es: Spesa extra, benzina, regalo..."
        style={inputLight(false)}
      />
    </div>

    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Importo</div>
      <input
        type="text"
        inputMode="decimal"
        value={nuovaUscitaImporto}
        onChange={(e) => setNuovaUscitaImporto(e.target.value)}
        placeholder="Es: 35"
        style={inputLight(false)}
      />
    </div>

    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Nota</div>
      <input
        type="text"
        value={nuovaUscitaNota}
        onChange={(e) => setNuovaUscitaNota(e.target.value)}
        placeholder="Facoltativa"
        style={inputLight(false)}
      />
    </div>

    <button
      data-chip="1"
      onClick={aggiungiUscitaExtra}
      style={{
        ...chip(true),
        height: 48,
        width: "100%",
        background: "linear-gradient(180deg, rgba(239,68,68,0.22), rgba(220,38,38,0.12))",
        border: "1px solid rgba(239,68,68,0.30)",
        color: "rgba(127,29,29,0.98)",
        boxShadow: "0 16px 30px rgba(239,68,68,0.14)",
      }}
    >
      Aggiungi uscita
    </button>
  </div>

  <div
    style={{
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: 10,
    }}
  >
    <div
      style={{
        padding: 14,
        borderRadius: 18,
        border: "1px solid rgba(239,68,68,0.12)",
        background: "linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Uscite extra mese</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
        {usciteExtraVal.length}
      </div>
    </div>

    <div
      style={{
        padding: 14,
        borderRadius: 18,
        border: "1px solid rgba(249,115,22,0.12)",
        background: "linear-gradient(180deg, rgba(249,115,22,0.08), rgba(249,115,22,0.03))",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Totale uscite extra</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
        {usciteExtraVal.reduce((s, x) => s + x.importo, 0).toLocaleString("it-IT")} €
      </div>
    </div>
  </div>

  <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
    {usciteExtraVal.length === 0 ? (
      <div
        style={{
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.08)",
          background: "rgba(255,255,255,0.72)",
          fontSize: 13,
          fontWeight: 800,
          opacity: 0.65,
        }}
      >
        Nessuna uscita extra inserita.
      </div>
    ) : (
      usciteExtraVal
        .slice()
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((x) => (
          <div
            key={x.id}
            style={{
              padding: 14,
              borderRadius: 18,
              border: "1px solid rgba(239,68,68,0.16)",
              background: "linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.04))",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.65 }}>
                {formattaDataBreve(x.data)}
              </div>
              <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950 }}>
                {x.descrizione}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 900,
                  color: "rgba(185,28,28,0.96)",
                }}
              >
                {x.importo.toLocaleString("it-IT")} €
              </div>
              {x.nota && (
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
                  {x.nota}
                </div>
              )}
            </div>

            <button data-chip="1" onClick={() => eliminaUscitaExtra(x.id)} style={chip(false)}>
              Elimina
            </button>
          </div>
        ))
    )}
  </div>
</div>






          <div style={{ ...ui.card, padding: 18 }}>
            <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Movimenti ed eventi del mese</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
              Scadenze, appuntamenti, entrate e uscite del mese selezionato
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10,
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(16,185,129,0.12)",
                  background: "rgba(236,253,245,0.84)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 1000 }}>
                  {entrateControlloMese.length}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(239,68,68,0.12)",
                  background: "rgba(254,242,242,0.84)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Uscite</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 1000 }}>
                  {usciteControlloMese.length}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(124,58,237,0.12)",
                  background: "rgba(245,243,255,0.84)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Scadenze</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 1000 }}>
                  {scadenzeControlloMese.length}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(59,130,246,0.12)",
                  background: "rgba(239,246,255,0.84)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Appuntamenti</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 1000 }}>
                  {appuntamentiControlloMese.length}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                 {eventiControlloMeseVisibili.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(255,255,255,0.72)",
                    fontSize: 13,
                    fontWeight: 800,
                    opacity: 0.65,
                  }}
                >
                  Nessun movimento o evento nel mese selezionato.
                </div>
              ) : (
                eventiControlloMeseVisibili.map((ev) => {
                  const isEntrata = ev.movimento === "entrata";
                  const isVoce = ev.sorgente === "voce";
                  const isNota = ev.tipo === "nota";
                  const isEvento = ev.tipo === "scadenza" || ev.tipo === "appuntamento" || ev.tipo === "nota";

                  return (
                    <div
                      key={`${ev.sorgente}_${ev.id}`}
                      style={{
                        padding: 14,
                        borderRadius: 18,
                        border: "1px solid rgba(15,23,42,0.08)",
                        background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {isVoce ? (
                            badgeTipo(ev.tipo as Voce["tipo"])
                          ) : isEntrata ? (
                            badgeMov("entrata")
                          ) : (
                            badgeMov("uscita")
                          )}

                          {ev.urgente && badgeUrgente()}
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 950, lineHeight: 1.25 }}>
                            {ev.movimento === "entrata" || ev.movimento === "uscita"
                              ? estraiCategoriaMovimento(ev.titolo)
                              : ev.titolo}
                          </div>

                        <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                          {formattaDataBreve(ev.data)} • {ev.ora}
                        </div>


                              {(ev.movimento === "entrata" || ev.movimento === "uscita") &&
                            estraiDettaglioMovimento(ev.titolo) && (
                              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68, lineHeight: 1.35 }}>
                                {estraiDettaglioMovimento(ev.titolo)}
                              </div>
                            )}



                        {ev.nota && (
                          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68, lineHeight: 1.35 }}>
                            {ev.nota}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 8,
                          justifyItems: "end",
                          alignContent: "start",
                          minWidth: 96,
                        }}
                      >
                        {ev.importo !== null ? (
                          <div
                            style={{
                              padding: "7px 11px",
                              borderRadius: 999,
                              border: isEntrata
                                ? "2px solid rgba(16,185,129,0.28)"
                                : "2px solid rgba(239,68,68,0.28)",
                              background: isEntrata ? "rgba(236,253,245,0.96)" : "rgba(254,242,242,0.96)",
                              fontSize: 12,
                              fontWeight: 950,
                              color: isEntrata ? "rgba(5,150,105,0.96)" : "rgba(185,28,28,0.96)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ev.importo.toLocaleString("it-IT")} €
                          </div>
                        ) : isEvento ? (
                          <div style={{ minHeight: 34, display: "grid", alignItems: "center" }}>
                            {(ev.tipo === "scadenza" || ev.tipo === "appuntamento") && !isNota ? (
                              <span style={styleBadgeScadenza(giorniMancanti(ev.data), ev.urgente)}>
                                {ev.urgente ? "URGENTE" : labelGiorni(giorniMancanti(ev.data))}
                              </span>
                            ) : (
                              <div style={{ height: 34 }} />
                            )}
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {isVoce && (
                            <button
                              data-chip="1"
                              onClick={() => {
                                const voceOriginale = voci.find((x) => x.id === ev.id);
                                if (!voceOriginale) return;
                                apriModifica(voceOriginale);
                              }}
                              style={chip(false)}
                            >
                              Modifica
                            </button>
                          )}

                          <button
                            data-chip="1"
                            onClick={() => {
                              if (ev.sorgente === "voce") elimina(ev.id);
                              else if (ev.sorgente === "entrata") eliminaEntrataExtra(ev.id);
                              else if (ev.sorgente === "uscita-extra") eliminaUscitaExtra(ev.id);
                            }}
                            style={{
                              ...chip(false),
                              border: "1px solid rgba(239,68,68,0.22)",
                              color: "rgba(185,28,28,0.96)",
                              background: "rgba(254,242,242,0.92)",
                            }}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }


 
  const GlobalStyle = (
  <style>{`
    @keyframes popIn {
      from { opacity: 0; transform: translateY(10px) scale(0.985); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes cardIn {
      from { opacity: 0; transform: translateY(8px) scale(0.985); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes pulseUrgent {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.025); }
    }

    @keyframes softGlow {
      0%, 100% { box-shadow: 0 16px 32px rgba(79,70,229,0.16); }
      50% { box-shadow: 0 24px 44px rgba(124,58,237,0.22); }
    }

    button[data-chip="1"]{
      transform: translateY(0);
      transition: transform .12s ease, filter .12s ease;
    }

    button[data-chip="1"]:hover{
      transform: translateY(-1px);
      filter: brightness(1.04);
    }

    button[data-chip="1"]:active{
      transform: translateY(0px) scale(0.985);
      filter: brightness(0.985);
    }

    input::placeholder,
    textarea::placeholder {
      color: rgba(148,163,184,0.92);
      opacity: 1;
    }

    input,
    textarea,
    select {
      color: rgba(248,250,252,0.99);
      -webkit-text-fill-color: rgba(248,250,252,0.99);
      font-weight: 700;
    }

    select option {
      background: #0f172a;
      color: rgba(248,250,252,0.99);
    }

    input[type="date"]::-webkit-calendar-picker-indicator,
    input[type="time"]::-webkit-calendar-picker-indicator {
      filter: invert(1) brightness(1.15);
      cursor: pointer;
    }

    @media (max-width: 820px) {
      .remember-hide-mobile-fab {
        display: none !important;
      }
    }

    @media (max-width: 760px) {
      .remember-grid-2 {
        grid-template-columns: 1fr !important;
      }
    }
  `}</style>
);

 

  return (
   <div style={pageBg}>
  {GlobalStyle}
















{pagina !== "home" && pagina !== "aggiungi" && pagina !== "note" && (
  <div style={topBar}>
    <div style={{ ...ui.glass, padding: 22 }}>
      <div style={{ display: "grid", gap: 18 }}>
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <RememberLogo size={54} centered />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 14px",
              borderRadius: 999,
              border: "1px solid rgba(79,70,229,0.12)",
              background: "rgba(255,255,255,0.55)",
              boxShadow: "0 18px 34px rgba(79,70,229,0.10)",
              fontSize: 13,
              fontWeight: 950,
              letterSpacing: -0.2,
              animation: "softGlow 2.4s ease-in-out infinite",
            }}
          >
            <span style={{ opacity: 0.8 }}>🕒</span>
            <span style={{ color: "rgba(15,23,42,0.92)" }}>
              {formattaDataLunga(adesso)}
            </span>
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 900,
            opacity: 0.72,
          }}
        >
          Utente attivo: <span style={{ opacity: 1 }}>{currentUser.nome}</span>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            justifyItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <button
              data-chip="1"
              onClick={() => setPagina("home")}
              style={chip(false)}
            >
              Home
            </button>

            {pagina === "consulta" && (
              <button
                data-chip="1"
                onClick={() => {
                  setConsultaSezione("menu");
                  setPagina("consulta");
                }}
                style={chip(true)}
              >
                Consulta
              </button>
            )}

            <button
              data-chip="1"
              onClick={() => setPagina("aggiungi")}
              style={chip(false)}
            >
              Aggiungi
            </button>

           
          </div>

          <button
            data-chip="1"
            onClick={esci}
            style={chip(false)}
          >
            Esci
          </button>
        </div>
      </div>
    </div>
  </div>
)}



{pagina === "home" && (
  <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 16 }}>
    <div style={{ width: "min(560px, 100%)", display: "grid", gap: 20 }}>
      {(() => {
        const oggi = new Date();
        const domani = new Date();
        domani.setDate(domani.getDate() + 1);

        const oggiKey = oggi.toISOString().slice(0, 10);
        const domaniKey = domani.toISOString().slice(0, 10);

        const meseKeyOggi = yyyymmFromDate(oggi);
        const meseKeyDomani = yyyymmFromDate(domani);

        const eventiOggi = voci
          .filter((v) => (v.tipo === "scadenza" || v.tipo === "appuntamento") && v.data === oggiKey)
          .slice()
          .sort((a, b) => a.ora.localeCompare(b.ora));

        const eventiDomani = voci
          .filter((v) => (v.tipo === "scadenza" || v.tipo === "appuntamento") && v.data === domaniKey)
          .slice()
          .sort((a, b) => a.ora.localeCompare(b.ora));

        const turniOggi = turni
          .filter((t) => t.data === oggiKey)
          .slice()
          .sort((a, b) => a.inizio.localeCompare(b.inizio));

        const turniDomani = turni
          .filter((t) => t.data === domaniKey)
          .slice()
          .sort((a, b) => a.inizio.localeCompare(b.inizio));

        const usciteOggi = (incassi[meseKeyOggi]?.usciteExtra ?? [])
          .filter((u) => u.data === oggiKey)
          .slice()
          .sort((a, b) => a.descrizione.localeCompare(b.descrizione));

        const usciteDomani = (incassi[meseKeyDomani]?.usciteExtra ?? [])
          .filter((u) => u.data === domaniKey)
          .slice()
          .sort((a, b) => a.descrizione.localeCompare(b.descrizione));

        const tabCorrente =
          homePreviewTab === "oggi"
            ? {
                titolo: "Oggi",
                dataKey: oggiKey,
                dataLabel: formattaDataBreve(oggiKey),
                eventi: eventiOggi,
                turni: turniOggi,
                uscite: usciteOggi,
              }
            : {
                titolo: "Domani",
                dataKey: domaniKey,
                dataLabel: formattaDataBreve(domaniKey),
                eventi: eventiDomani,
                turni: turniDomani,
                uscite: usciteDomani,
              };

        const totaleElementi =
          tabCorrente.eventi.length + tabCorrente.turni.length + tabCorrente.uscite.length;

        return (
          <>
            <div
              style={{
                ...ui.card,
                padding: 26,
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(700px 220px at 0% 0%, rgba(79,70,229,0.14), transparent 60%), radial-gradient(700px 220px at 100% 0%, rgba(16,185,129,0.12), transparent 60%), radial-gradient(500px 180px at 50% 100%, rgba(249,115,22,0.10), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 18 }}>
                <RememberLogo size={64} centered />

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 1000,
                      letterSpacing: -0.4,
                      color: "rgba(241,245,249,0.98)",
                      textShadow: "0 10px 30px rgba(79,70,229,0.18)",
                      lineHeight: 1.08,
                    }}
                  >
                    Ti amo Luanina
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "rgba(191,219,254,0.88)",
                      letterSpacing: 0.2,
                      lineHeight: 1.35,
                    }}
                  >
                    E non sai quanto
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMostraPreviewHome((prev) => !prev);
                      setHomePreviewTab("oggi");
                    }}
                    title="Centro rapido"
                    style={{
                      width: 78,
                      height: 78,
                      borderRadius: 999,
                      border: "1px solid rgba(250,204,21,0.35)",
                      background:
                        "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.6), transparent 40%), linear-gradient(180deg, rgba(250,204,21,0.55), rgba(234,179,8,0.25))",
                      color: "#1e293b",
                      fontSize: 34,
                      fontWeight: 1000,
                      cursor: "pointer",
                      position: "relative",
                      boxShadow:
                        "0 25px 60px rgba(250,204,21,0.45), inset 0 2px 6px rgba(255,255,255,0.6)",
                      transition: "all .25s ease",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      lineHeight: 1,
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.1) rotate(-3deg)";
                      e.currentTarget.style.boxShadow =
                        "0 35px 80px rgba(250,204,21,0.6), inset 0 2px 6px rgba(255,255,255,0.7)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1) rotate(0deg)";
                      e.currentTarget.style.boxShadow =
                        "0 25px 60px rgba(250,204,21,0.45), inset 0 2px 6px rgba(255,255,255,0.6)";
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                        transform: "translateY(-1px)",
                      }}
                    >
                      ⚡
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {mostraPreviewHome && (
              <div
                style={{
                  ...ui.card,
                  padding: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(2,6,23,0.95), rgba(15,23,42,0.92))",
                  boxShadow:
                    "0 26px 64px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04)",
                  display: "grid",
                  gap: 16,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(520px 180px at 0% 0%, rgba(79,70,229,0.14), transparent 60%), radial-gradient(520px 180px at 100% 0%, rgba(16,185,129,0.12), transparent 60%), radial-gradient(460px 180px at 50% 100%, rgba(250,204,21,0.08), transparent 60%)",
                    pointerEvents: "none",
                  }}
                />

                <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "grid", gap: 4, textAlign: "left" }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 1000,
                          color: "rgba(241,245,249,0.98)",
                          letterSpacing: -0.3,
                        }}
                      >
                        Centro rapido
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "rgba(191,219,254,0.78)",
                        }}
                      >
                        Eventi, turni e uscite di oggi e domani
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMostraPreviewHome(false)}
                      style={{
                        ...chip(false),
                        justifyContent: "center",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      Chiudi
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setHomePreviewTab("oggi")}
                      style={{
                        border:
                          homePreviewTab === "oggi"
                            ? "1px solid rgba(79,70,229,0.34)"
                            : "1px solid rgba(148,163,184,0.18)",
                        borderRadius: 20,
                        padding: "14px 16px",
                        cursor: "pointer",
                        fontWeight: 1000,
                        fontSize: 15,
                        color:
                          homePreviewTab === "oggi"
                            ? "rgba(255,255,255,0.98)"
                            : "rgba(226,232,240,0.88)",
                        background:
                          homePreviewTab === "oggi"
                            ? "linear-gradient(180deg, rgba(79,70,229,0.36), rgba(124,58,237,0.20))"
                            : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                        boxShadow:
                          homePreviewTab === "oggi"
                            ? "0 18px 34px rgba(79,70,229,0.22)"
                            : "0 10px 20px rgba(0,0,0,0.18)",
                        transition: "transform .18s ease, box-shadow .18s ease",
                      }}
                    >
                      OGGI
                    </button>

                    <button
                      type="button"
                      onClick={() => setHomePreviewTab("domani")}
                      style={{
                        border:
                          homePreviewTab === "domani"
                            ? "1px solid rgba(16,185,129,0.34)"
                            : "1px solid rgba(148,163,184,0.18)",
                        borderRadius: 20,
                        padding: "14px 16px",
                        cursor: "pointer",
                        fontWeight: 1000,
                        fontSize: 15,
                        color:
                          homePreviewTab === "domani"
                            ? "rgba(255,255,255,0.98)"
                            : "rgba(226,232,240,0.88)",
                        background:
                          homePreviewTab === "domani"
                            ? "linear-gradient(180deg, rgba(16,185,129,0.36), rgba(5,150,105,0.20))"
                            : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                        boxShadow:
                          homePreviewTab === "domani"
                            ? "0 18px 34px rgba(16,185,129,0.20)"
                            : "0 10px 20px rgba(0,0,0,0.18)",
                        transition: "transform .18s ease, box-shadow .18s ease",
                      }}
                    >
                      DOMANI
                    </button>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 24,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                      display: "grid",
                      gap: 14,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 1000,
                            color: "rgba(248,250,252,0.98)",
                          }}
                        >
                          {tabCorrente.titolo}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 850,
                            color: "rgba(191,219,254,0.82)",
                          }}
                        >
                          {tabCorrente.dataLabel}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.08)",
                          fontSize: 12,
                          fontWeight: 950,
                          color: "rgba(241,245,249,0.92)",
                          boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
                        }}
                      >
                        {totaleElementi} elementi
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {totaleElementi === 0 ? (
                        <div
                          style={{
                            padding: 15,
                            borderRadius: 18,
                            border: "1px solid rgba(148,163,184,0.14)",
                            background: "rgba(255,255,255,0.05)",
                            fontSize: 13,
                            fontWeight: 850,
                            color: "rgba(226,232,240,0.78)",
                            textAlign: "center",
                          }}
                        >
                          Nulla da ricordare per {tabCorrente.titolo.toLowerCase()}.
                        </div>
                      ) : (
                        <>
                          {tabCorrente.eventi.map((ev) => {
                            const giorni = giorniMancanti(ev.data);

                            return (
                              <div
                                key={ev.id}
                                style={{
                                  padding: 13,
                                  borderRadius: 18,
                                  background:
                                    "linear-gradient(180deg, rgba(79,70,229,0.14), rgba(79,70,229,0.06))",
                                  border: "1px solid rgba(79,70,229,0.16)",
                                  display: "grid",
                                  gap: 6,
                                  boxShadow: "0 10px 20px rgba(79,70,229,0.08)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 950,
                                      color: "rgba(199,210,254,0.96)",
                                    }}
                                  >
                                    EVENTO
                                  </div>

                                  <span style={styleBadgeScadenza(giorni, ev.urgente)}>
                                    {labelGiorni(giorni)}
                                  </span>
                                </div>

                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 950,
                                    color: "rgba(255,255,255,0.98)",
                                  }}
                                >
                                  {ev.titolo}
                                </div>

                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: "rgba(191,219,254,0.84)",
                                  }}
                                >
                                  {ev.ora}
                                </div>
                              </div>
                            );
                          })}

                          {tabCorrente.turni.map((t) => {
                            const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
                            const descrizione = descrizioneTurnoBreve(t.inizio, t.fine, t.note);

                            return (
                              <div
                                key={t.id}
                                style={{
                                  padding: 13,
                                  borderRadius: 18,
                                  background:
                                    "linear-gradient(180deg, rgba(249,115,22,0.14), rgba(249,115,22,0.06))",
                                  border: "1px solid rgba(249,115,22,0.16)",
                                  display: "grid",
                                  gap: 6,
                                  boxShadow: "0 10px 20px rgba(249,115,22,0.08)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 950,
                                    color: "rgba(254,215,170,0.96)",
                                  }}
                                >
                                  TURNO
                                </div>

                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 950,
                                    color: "rgba(255,255,255,0.98)",
                                  }}
                                >
                                  {descrizione}
                                </div>

                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: "rgba(255,237,213,0.84)",
                                  }}
                                >
                                  {sigla === "R" || sigla === "F" || sigla === "A"
                                    ? (t.note || descrizione)
                                    : `${t.inizio} • ${t.fine}`}
                                </div>
                              </div>
                            );
                          })}

                          {tabCorrente.uscite.map((u) => (
                            <div
                              key={u.id}
                              style={{
                                padding: 13,
                                borderRadius: 18,
                                background:
                                  "linear-gradient(180deg, rgba(239,68,68,0.14), rgba(239,68,68,0.06))",
                                border: "1px solid rgba(239,68,68,0.16)",
                                display: "grid",
                                gap: 6,
                                boxShadow: "0 10px 20px rgba(239,68,68,0.08)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 950,
                                  color: "rgba(254,202,202,0.96)",
                                }}
                              >
                                USCITA
                              </div>

                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 950,
                                  color: "rgba(255,255,255,0.98)",
                                }}
                              >
                                {u.descrizione}
                              </div>

                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: "rgba(254,226,226,0.84)",
                                }}
                              >
                                {euro(u.importo)}
                                {u.nota ? ` • ${u.nota}` : ""}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <button
                data-chip="1"
                onClick={() => setPagina("aggiungi")}
                style={{
                  padding: "22px 18px",
                  borderRadius: 28,
                  border: "1px solid rgba(16,185,129,0.28)",
                  background:
                    "linear-gradient(180deg, rgba(16,185,129,0.30), rgba(5,150,105,0.18))",
                  color: "rgba(6,95,70,0.98)",
                  fontSize: 18,
                  fontWeight: 1000,
                  letterSpacing: 0.3,
                  boxShadow:
                    "0 22px 50px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.22)",
                  transition: "transform .18s ease, box-shadow .18s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 28px 58px rgba(16,185,129,0.30), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 22px 50px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
              >
                ➕ AGGIUNGI
              </button>

              <button
                data-chip="1"
                onClick={() => {
                  setConsultaSezione("menu");
                  setPagina("consulta");
                }}
                style={{
                  padding: "22px 18px",
                  borderRadius: 28,
                  border: "1px solid rgba(79,70,229,0.28)",
                  background:
                    "linear-gradient(180deg, rgba(79,70,229,0.30), rgba(124,58,237,0.18))",
                  color: "rgba(67,56,202,0.98)",
                  fontSize: 18,
                  fontWeight: 1000,
                  letterSpacing: 0.3,
                  boxShadow:
                    "0 22px 50px rgba(79,70,229,0.25), inset 0 1px 0 rgba(255,255,255,0.22)",
                  transition: "transform .18s ease, box-shadow .18s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 28px 58px rgba(79,70,229,0.30), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 22px 50px rgba(79,70,229,0.25), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
              >
                📊 CONSULTA
              </button>

              <button
                onClick={() => setPagina("note")}
                style={{
                  padding: "22px 18px",
                  borderRadius: 28,
                  border: "1px solid rgba(249,115,22,0.28)",
                  background:
                    "linear-gradient(180deg, rgba(249,115,22,0.30), rgba(234,88,12,0.18))",
                  color: "rgba(154,52,18,0.98)",
                  fontSize: 18,
                  fontWeight: 1000,
                  letterSpacing: 0.3,
                  boxShadow:
                    "0 22px 50px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,255,255,0.22)",
                  transition: "transform .18s ease, box-shadow .18s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 28px 58px rgba(249,115,22,0.30), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 22px 50px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
              >
                📝 NOTA RAPIDA
              </button>

              <button
                onClick={() => setPagina("account")}
                style={{
                  padding: "22px 18px",
                  borderRadius: 28,
                  border: "1px solid rgba(14,165,233,0.28)",
                  background:
                    "linear-gradient(180deg, rgba(14,165,233,0.30), rgba(2,132,199,0.18))",
                  color: "rgba(3,105,161,0.98)",
                  fontSize: 18,
                  fontWeight: 1000,
                  letterSpacing: 0.3,
                  boxShadow:
                    "0 22px 50px rgba(14,165,233,0.25), inset 0 1px 0 rgba(255,255,255,0.22)",
                  transition: "transform .18s ease, box-shadow .18s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 28px 58px rgba(14,165,233,0.30), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 22px 50px rgba(14,165,233,0.25), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
              >
                👤 ACCOUNT
              </button>
            </div>
          </>
        );
      })()}
    </div>
  </div>
)}













{pagina === "consulta" && (() => {
  const isMobileConsulta = typeof window !== "undefined" && window.innerWidth <= 640;

  const consultaHeaderWrap: React.CSSProperties = {
    display: "grid",
    gap: 12,
    justifyItems: "center",
    textAlign: "center",
    padding: "8px 6px 2px",
  };

  const consultaTitleStyle: React.CSSProperties = {
    fontSize: isMobileConsulta ? 32 : 38,
    fontWeight: 1000,
    letterSpacing: -1,
    color: "rgba(241,245,249,0.98)",
    textShadow: "0 14px 36px rgba(79,70,229,0.24)",
    lineHeight: 1.03,
  };

  const consultaSubtitleStyle: React.CSSProperties = {
    maxWidth: 780,
    fontSize: 15,
    fontWeight: 800,
    color: "rgba(191,219,254,0.88)",
    lineHeight: 1.6,
    letterSpacing: 0.1,
  };

  const consultaSectionBadge = (
    icon: string,
    label: string,
    accent: "violet" | "green" | "orange" | "blue"
  ) => {
    const styles =
      accent === "green"
        ? {
            border: "1px solid rgba(16,185,129,0.18)",
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.16), rgba(16,185,129,0.06))",
            boxShadow: "0 18px 40px rgba(16,185,129,0.12)",
          }
        : accent === "orange"
        ? {
            border: "1px solid rgba(249,115,22,0.18)",
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.16), rgba(249,115,22,0.06))",
            boxShadow: "0 18px 40px rgba(249,115,22,0.12)",
          }
        : accent === "blue"
        ? {
            border: "1px solid rgba(59,130,246,0.18)",
            background:
              "linear-gradient(180deg, rgba(59,130,246,0.16), rgba(59,130,246,0.06))",
            boxShadow: "0 18px 40px rgba(59,130,246,0.12)",
          }
        : {
            border: "1px solid rgba(79,70,229,0.18)",
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.16), rgba(124,58,237,0.08))",
            boxShadow: "0 18px 40px rgba(79,70,229,0.14)",
          };

    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: isMobileConsulta ? "12px 18px" : "14px 22px",
          borderRadius: 999,
          ...styles,
        }}
      >
        <span style={{ fontSize: isMobileConsulta ? 22 : 24 }}>{icon}</span>
        <span style={consultaTitleStyle}>{label}</span>
      </div>
    );
  };

  const consultaMenuCardStyle = (
    accent: "orange" | "green" | "violet"
  ): React.CSSProperties => {
    const styles =
      accent === "orange"
        ? {
            border: "1px solid rgba(249,115,22,0.18)",
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 24px 54px rgba(249,115,22,0.12)",
          }
        : accent === "green"
        ? {
            border: "1px solid rgba(16,185,129,0.18)",
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 24px 54px rgba(16,185,129,0.12)",
          }
        : {
            border: "1px solid rgba(79,70,229,0.18)",
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 24px 54px rgba(79,70,229,0.12)",
          };

    return {
      ...ui.card,
      ...styles,
      padding: 22,
      textAlign: "left",
      cursor: "pointer",
      display: "grid",
      gap: 14,
      position: "relative",
      overflow: "hidden",
      transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
    };
  };

  const consultaMenuIconStyle = (
    accent: "orange" | "green" | "violet"
  ): React.CSSProperties => {
    const styles =
      accent === "orange"
        ? {
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.98), rgba(234,88,12,0.92))",
            boxShadow: "0 16px 30px rgba(249,115,22,0.20)",
          }
        : accent === "green"
        ? {
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.98), rgba(5,150,105,0.92))",
            boxShadow: "0 16px 30px rgba(16,185,129,0.20)",
          }
        : {
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.98), rgba(124,58,237,0.92))",
            boxShadow: "0 16px 30px rgba(79,70,229,0.20)",
          };

    return {
      width: 58,
      height: 58,
      borderRadius: 20,
      display: "grid",
      placeItems: "center",
      color: "white",
      fontSize: 24,
      ...styles,
    };
  };

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "start center", padding: 16 }}>
      <div style={{ width: "min(1100px, 100%)", display: "grid", gap: 18 }}>
        {consultaSezione === "menu" ? (
          <>
            <div style={consultaHeaderWrap}>
              {consultaSectionBadge("📘", "Consulta", "violet")}

              <div style={consultaSubtitleStyle}>
                Centro di consultazione dell’app. Da qui accedi rapidamente a turni,
                finanza ed eventi con una visuale più chiara, moderna e ordinata.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              <button
                data-chip="1"
                onClick={() => setConsultaSezione("turni")}
                style={consultaMenuCardStyle("orange")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = "0 30px 62px rgba(249,115,22,0.16)";
                  e.currentTarget.style.borderColor = "rgba(249,115,22,0.26)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 24px 54px rgba(249,115,22,0.12)";
                  e.currentTarget.style.borderColor = "rgba(249,115,22,0.18)";
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(500px 180px at 0% 0%, rgba(249,115,22,0.10), transparent 58%), radial-gradient(400px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                    pointerEvents: "none",
                  }}
                />

                <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                  <div style={consultaMenuIconStyle("orange")}>⏰</div>

                  <div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 1000,
                        letterSpacing: -0.3,
                        color: "rgba(15,23,42,0.96)",
                      }}
                    >
                      Turni
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        opacity: 0.76,
                        lineHeight: 1.5,
                        color: "rgba(15,23,42,0.88)",
                      }}
                    >
                      Calendario, riepiloghi mensili, ferie e modifica rapida.
                    </div>
                  </div>
                </div>
              </button>

              <button
                data-chip="1"
                onClick={() => setConsultaSezione("finanza")}
                style={consultaMenuCardStyle("green")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = "0 30px 62px rgba(16,185,129,0.16)";
                  e.currentTarget.style.borderColor = "rgba(16,185,129,0.26)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 24px 54px rgba(16,185,129,0.12)";
                  e.currentTarget.style.borderColor = "rgba(16,185,129,0.18)";
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(500px 180px at 0% 0%, rgba(16,185,129,0.10), transparent 58%), radial-gradient(400px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                    pointerEvents: "none",
                  }}
                />

                <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                  <div style={consultaMenuIconStyle("green")}>€</div>

                  <div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 1000,
                        letterSpacing: -0.3,
                        color: "rgba(15,23,42,0.96)",
                      }}
                    >
                      Finanza
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        opacity: 0.76,
                        lineHeight: 1.5,
                        color: "rgba(15,23,42,0.88)",
                      }}
                    >
                      Entrate, uscite, grafici e riepiloghi economici.
                    </div>
                  </div>
                </div>
              </button>

              <button
                data-chip="1"
                onClick={() => setConsultaSezione("eventi")}
                style={consultaMenuCardStyle("violet")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = "0 30px 62px rgba(79,70,229,0.16)";
                  e.currentTarget.style.borderColor = "rgba(79,70,229,0.26)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 24px 54px rgba(79,70,229,0.12)";
                  e.currentTarget.style.borderColor = "rgba(79,70,229,0.18)";
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(500px 180px at 0% 0%, rgba(79,70,229,0.10), transparent 58%), radial-gradient(400px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                    pointerEvents: "none",
                  }}
                />

                <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                  <div style={consultaMenuIconStyle("violet")}>🗓</div>

                  <div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 1000,
                        letterSpacing: -0.3,
                        color: "rgba(15,23,42,0.96)",
                      }}
                    >
                      Eventi
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        opacity: 0.76,
                        lineHeight: 1.5,
                        color: "rgba(15,23,42,0.88)",
                      }}
                    >
                      Calendario eventi, elementi futuri e archivio automatico.
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </>


        ) : consultaSezione === "turni" ? (
  (() => {
    const turniLavoroMese = turniMese.filter((t) => {
      const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
      return sigla !== "F" && sigla !== "A" && sigla !== "R";
    });

    const ferieMese = turniMese.filter((t) => {
      const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
      return sigla === "F";
    });

    const assenzeMese = turniMese.filter((t) => {
      const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
      return sigla === "A";
    });

    const riposiMese = turniMese.filter((t) => {
      const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
      return sigla === "R";
    });

    const totaleTurniLavoratiMese = turniLavoroMese.length;
    const ferieGiorniMese = ferieMese.length;
    const ferieOreMese = ferieMese.reduce((sum, t) => sum + (Number(t.oreOrdinarie) || 0), 0);
    const assenzeGiorniMese = assenzeMese.length;
    const riposiGiorniMese = riposiMese.length;

    return (
      <>
        <div style={consultaHeaderWrap}>
          {consultaSectionBadge("📘", "Consulta turni", "orange")}

          <div style={consultaSubtitleStyle}>
            Vista mensile dei turni con riepiloghi rapidi, ferie e modifica immediata.
          </div>
        </div>

        <div
          style={{
            maxWidth: 1060,
            margin: "0 auto",
            marginTop: 14,
            display: "grid",
            gap: 14,
          }}
        >
          <MiniCalendario
            mese={meseCorrente}
            vociDelMese={[]}
            turniDelMese={turniMese}
            onPrevMonth={mesePrecedente}
            onNextMonth={meseSuccessivo}
            onEditTurno={apriModificaTurno}
          />

          <div
            style={{
              ...ui.card,
              padding: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              border: "1px solid rgba(255,255,255,0.55)",
              boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(14,165,233,0.14)",
                background:
                  "linear-gradient(180deg, rgba(14,165,233,0.10), rgba(14,165,233,0.04))",
                boxShadow: "0 8px 20px rgba(14,165,233,0.06)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(8,47,73,0.82)" }}>
                Turni lavorati
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                }}
              >
                {totaleTurniLavoratiMese}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(16,185,129,0.14)",
                background:
                  "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))",
                boxShadow: "0 8px 20px rgba(16,185,129,0.06)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(6,78,59,0.82)" }}>
                Ore ordinarie lavorate
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                }}
              >
                {formatNumeroOre(oreOrdMese)} h
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(249,115,22,0.14)",
                background:
                  "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.04))",
                boxShadow: "0 8px 20px rgba(249,115,22,0.06)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(124,45,18,0.82)" }}>
                Ore straordinarie
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                }}
              >
                {formatNumeroOre(oreStraMese)} h
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(124,58,237,0.14)",
                background:
                  "linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.04))",
                boxShadow: "0 8px 20px rgba(124,58,237,0.06)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(76,29,149,0.82)" }}>
                Ore totali lavorate
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                }}
              >
                {formatNumeroOre(oreTotMese)} h
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(168,85,247,0.18)",
                background:
                  "linear-gradient(180deg, rgba(243,232,255,0.98), rgba(250,245,255,0.94))",
                boxShadow: "0 8px 20px rgba(168,85,247,0.08)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(107,33,168,0.92)" }}>
                Ferie effettuate
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 17,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                  lineHeight: 1.2,
                }}
              >
                {ferieGiorniMese} g • {formatNumeroOre(ferieOreMese)} h
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(239,68,68,0.16)",
                background:
                  "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(254,226,226,0.94))",
                boxShadow: "0 8px 20px rgba(239,68,68,0.08)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(153,27,27,0.92)" }}>
                Assenze mese
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                }}
              >
                {assenzeGiorniMese}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 18,
                border: "1px solid rgba(100,116,139,0.16)",
                background:
                  "linear-gradient(180deg, rgba(241,245,249,0.98), rgba(248,250,252,0.94))",
                boxShadow: "0 8px 20px rgba(100,116,139,0.08)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(71,85,105,0.92)" }}>
                Riposi mese
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(15,23,42,0.96)",
                }}
              >
                {riposiGiorniMese}
              </div>
            </div>
          </div>

          <div
            style={{
              ...ui.card,
              padding: 14,
              display: "grid",
              gap: 12,
              border: "1px solid rgba(255,255,255,0.58)",
              boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 1000,
                    letterSpacing: -0.3,
                    color: "rgba(15,23,42,0.98)",
                  }}
                >
                  Monitoraggio ferie
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 850,
                    color: "rgba(71,85,105,0.80)",
                  }}
                >
                  Riepilogo aggiornato di giorni e ore residue.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setApriConfigFerie((prev) => !prev)}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 16,
                    border: "1px solid rgba(148,163,184,0.18)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
                    boxShadow:
                      "0 10px 22px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 18,
                    color: "rgba(15,23,42,0.92)",
                    transition: "transform .18s ease, box-shadow .18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px) rotate(10deg)";
                    e.currentTarget.style.boxShadow =
                      "0 14px 26px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.95)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0) rotate(0deg)";
                    e.currentTarget.style.boxShadow =
                      "0 10px 22px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.95)";
                  }}
                  title="Configura basi ferie"
                >
                  ⚙️
                </button>

                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(16,185,129,0.22)",
                    background:
                      "linear-gradient(180deg, rgba(220,252,231,1), rgba(240,253,244,0.98))",
                    fontSize: 12,
                    fontWeight: 950,
                    color: "rgba(21,128,61,0.98)",
                    boxShadow: "0 8px 18px rgba(34,197,94,0.10)",
                  }}
                >
                  Sigla calendario: F
                </div>
              </div>
            </div>

            {apriConfigFerie && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(59,130,246,0.24)",
                    background:
                      "linear-gradient(180deg, rgba(219,234,254,1), rgba(239,246,255,1))",
                    boxShadow: "0 8px 18px rgba(59,130,246,0.10)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 950,
                      color: "rgba(30,64,175,0.98)",
                    }}
                  >
                    Base ferie giorni
                  </div>
                  <input
                    value={String(ferieTotaliGiorniBase)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setFerieTotaliGiorniBase(Number.isFinite(n) && n >= 0 ? n : 0);
                    }}
                    inputMode="numeric"
                    style={{
                      ...inputLight(false),
                      marginTop: 10,
                      background: "rgba(255,255,255,1)",
                      fontWeight: 900,
                      color: "rgba(15,23,42,0.98)",
                      WebkitTextFillColor: "rgba(15,23,42,0.98)",
                      caretColor: "rgba(15,23,42,0.98)",
                      border: "1px solid rgba(59,130,246,0.22)",
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(168,85,247,0.24)",
                    background:
                      "linear-gradient(180deg, rgba(243,232,255,1), rgba(250,245,255,1))",
                    boxShadow: "0 8px 18px rgba(168,85,247,0.10)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 950,
                      color: "rgba(107,33,168,0.98)",
                    }}
                  >
                    Base ferie ore
                  </div>
                  <input
                    value={String(ferieTotaliOreBase)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(",", "."));
                      setFerieTotaliOreBase(Number.isFinite(n) && n >= 0 ? n : 0);
                    }}
                    inputMode="decimal"
                    style={{
                      ...inputLight(false),
                      marginTop: 10,
                      background: "rgba(255,255,255,1)",
                      fontWeight: 900,
                      color: "rgba(15,23,42,0.98)",
                      WebkitTextFillColor: "rgba(15,23,42,0.98)",
                      caretColor: "rgba(15,23,42,0.98)",
                      border: "1px solid rgba(168,85,247,0.22)",
                    }}
                  />
                </div>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                gap: 10,
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(34,197,94,0.24)",
                  background:
                    "linear-gradient(180deg, rgba(220,252,231,1), rgba(240,253,244,1))",
                  boxShadow: "0 8px 18px rgba(34,197,94,0.10)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 950,
                    color: "rgba(21,128,61,0.98)",
                  }}
                >
                  Giorni ferie effettuati
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 18,
                    fontWeight: 1000,
                    color: "rgba(15,23,42,0.98)",
                  }}
                >
                  {ferieGiorniEffettuati}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(59,130,246,0.24)",
                  background:
                    "linear-gradient(180deg, rgba(219,234,254,1), rgba(239,246,255,1))",
                  boxShadow: "0 8px 18px rgba(59,130,246,0.10)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 950,
                    color: "rgba(30,64,175,0.98)",
                  }}
                >
                  Giorni ferie residui
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 18,
                    fontWeight: 1000,
                    color: "rgba(15,23,42,0.98)",
                  }}
                >
                  {ferieGiorniResidui}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(168,85,247,0.24)",
                  background:
                    "linear-gradient(180deg, rgba(243,232,255,1), rgba(250,245,255,1))",
                  boxShadow: "0 8px 18px rgba(168,85,247,0.10)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 950,
                    color: "rgba(107,33,168,0.98)",
                  }}
                >
                  Ore ferie effettuate
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 18,
                    fontWeight: 1000,
                    color: "rgba(15,23,42,0.98)",
                  }}
                >
                  {formatNumeroOre(ferieOreEffettuate)} h
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(244,114,182,0.24)",
                  background:
                    "linear-gradient(180deg, rgba(252,231,243,1), rgba(253,242,248,1))",
                  boxShadow: "0 8px 18px rgba(244,114,182,0.10)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 950,
                    color: "rgba(190,24,93,0.98)",
                  }}
                >
                  Ore ferie residue
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 18,
                    fontWeight: 1000,
                    color: "rgba(15,23,42,0.98)",
                  }}
                >
                  {formatNumeroOre(ferieOreResidue)} h
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  })()







        ) : consultaSezione === "finanza" ? (
          <>
            <div style={consultaHeaderWrap}>
              {consultaSectionBadge("📘", "Consulta finanza", "green")}

              <div style={consultaSubtitleStyle}>
                Panoramica economica con riepiloghi, grafici, filtri rapidi e movimenti.
              </div>
            </div>

            <div
              style={{
                maxWidth: 1060,
                margin: "0 auto",
                marginTop: 14,
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  ...ui.card,
                  padding: isMobileConsulta ? 12 : 16,
                  border: "1px solid rgba(255,255,255,0.58)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
                  boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
                  display: "grid",
                  gap: isMobileConsulta ? 10 : 14,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      mesePrecedente();
                      const nuovo = new Date(meseCorrente.getFullYear(), meseCorrente.getMonth() - 1, 1);
                      setFinanzaVistaGrafico("mese");
                      setFinanzaAnnoSelezionato(nuovo.getFullYear());
                      setFinanzaMeseSelezionato(nuovo.getMonth());
                    }}
                    style={{
                      width: isMobileConsulta ? 36 : 42,
                      height: isMobileConsulta ? 36 : 42,
                      borderRadius: isMobileConsulta ? 12 : 14,
                      border: "1px solid rgba(148,163,184,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                      cursor: "pointer",
                      fontSize: isMobileConsulta ? 16 : 18,
                      fontWeight: 1000,
                      color: "rgba(15,23,42,0.88)",
                      transition: "transform .18s ease, box-shadow .18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 12px 22px rgba(15,23,42,0.10)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 8px 18px rgba(15,23,42,0.08)";
                    }}
                  >
                    ←
                  </button>

                  <div
                    style={{
                      textAlign: "center",
                      flex: 1,
                      minWidth: isMobileConsulta ? 120 : 180,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "rgba(100,116,139,0.90)",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                      }}
                    >
                      Mese corrente
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: isMobileConsulta ? 22 : 28,
                        fontWeight: 1000,
                        letterSpacing: isMobileConsulta ? -0.3 : -0.6,
                        textTransform: "capitalize",
                        color: "rgba(15,23,42,0.98)",
                        lineHeight: 1.05,
                      }}
                    >
                      {nomeMese(meseCorrente)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      meseSuccessivo();
                      const nuovo = new Date(meseCorrente.getFullYear(), meseCorrente.getMonth() + 1, 1);
                      setFinanzaVistaGrafico("mese");
                      setFinanzaAnnoSelezionato(nuovo.getFullYear());
                      setFinanzaMeseSelezionato(nuovo.getMonth());
                    }}
                    style={{
                      width: isMobileConsulta ? 36 : 42,
                      height: isMobileConsulta ? 36 : 42,
                      borderRadius: isMobileConsulta ? 12 : 14,
                      border: "1px solid rgba(148,163,184,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                      cursor: "pointer",
                      fontSize: isMobileConsulta ? 16 : 18,
                      fontWeight: 1000,
                      color: "rgba(15,23,42,0.88)",
                      transition: "transform .18s ease, box-shadow .18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 12px 22px rgba(15,23,42,0.10)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 8px 18px rgba(15,23,42,0.08)";
                    }}
                  >
                    →
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      padding: isMobileConsulta ? 12 : 16,
                      borderRadius: 22,
                      border: "1px solid rgba(16,185,129,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(16,185,129,0.16), rgba(16,185,129,0.05))",
                      boxShadow:
                        "0 14px 28px rgba(16,185,129,0.10), inset 0 1px 0 rgba(255,255,255,0.45)",
                      position: "relative",
                      overflow: "hidden",
                      transition: "transform .18s ease, box-shadow .18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        "0 18px 34px rgba(16,185,129,0.14), inset 0 1px 0 rgba(255,255,255,0.45)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 14px 28px rgba(16,185,129,0.10), inset 0 1px 0 rgba(255,255,255,0.45)";
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -24,
                        right: -24,
                        width: 80,
                        height: 80,
                        borderRadius: 999,
                        background: "radial-gradient(circle, rgba(16,185,129,0.20), transparent 68%)",
                        pointerEvents: "none",
                      }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(6,78,59,0.82)" }}>
                      Entrate mese
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: isMobileConsulta ? 20 : 24,
                        fontWeight: 1000,
                        color: "rgba(15,23,42,0.96)",
                        letterSpacing: -0.3,
                      }}
                    >
                      {euro(entrateMeseSezioneFinanza)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: isMobileConsulta ? 12 : 16,
                      borderRadius: 22,
                      border: "1px solid rgba(239,68,68,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(239,68,68,0.16), rgba(239,68,68,0.05))",
                      boxShadow:
                        "0 14px 28px rgba(239,68,68,0.10), inset 0 1px 0 rgba(255,255,255,0.45)",
                      position: "relative",
                      overflow: "hidden",
                      transition: "transform .18s ease, box-shadow .18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        "0 18px 34px rgba(239,68,68,0.14), inset 0 1px 0 rgba(255,255,255,0.45)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 14px 28px rgba(239,68,68,0.10), inset 0 1px 0 rgba(255,255,255,0.45)";
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -24,
                        right: -24,
                        width: 80,
                        height: 80,
                        borderRadius: 999,
                        background: "radial-gradient(circle, rgba(239,68,68,0.20), transparent 68%)",
                        pointerEvents: "none",
                      }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(127,29,29,0.82)" }}>
                      Uscite mese
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: isMobileConsulta ? 20 : 24,
                        fontWeight: 1000,
                        color: "rgba(15,23,42,0.96)",
                        letterSpacing: -0.3,
                      }}
                    >
                      {euro(usciteMeseSezioneFinanza)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: isMobileConsulta ? 12 : 16,
                      borderRadius: 22,
                      border:
                        saldoMeseSezioneFinanza >= 0
                          ? "1px solid rgba(59,130,246,0.18)"
                          : "1px solid rgba(124,58,237,0.18)",
                      background:
                        saldoMeseSezioneFinanza >= 0
                          ? "linear-gradient(180deg, rgba(59,130,246,0.16), rgba(59,130,246,0.05))"
                          : "linear-gradient(180deg, rgba(124,58,237,0.16), rgba(124,58,237,0.05))",
                      boxShadow:
                        saldoMeseSezioneFinanza >= 0
                          ? "0 14px 28px rgba(59,130,246,0.10), inset 0 1px 0 rgba(255,255,255,0.45)"
                          : "0 14px 28px rgba(124,58,237,0.10), inset 0 1px 0 rgba(255,255,255,0.45)",
                      position: "relative",
                      overflow: "hidden",
                      transition: "transform .18s ease, box-shadow .18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        saldoMeseSezioneFinanza >= 0
                          ? "0 18px 34px rgba(59,130,246,0.14), inset 0 1px 0 rgba(255,255,255,0.45)"
                          : "0 18px 34px rgba(124,58,237,0.14), inset 0 1px 0 rgba(255,255,255,0.45)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        saldoMeseSezioneFinanza >= 0
                          ? "0 14px 28px rgba(59,130,246,0.10), inset 0 1px 0 rgba(255,255,255,0.45)"
                          : "0 14px 28px rgba(124,58,237,0.10), inset 0 1px 0 rgba(255,255,255,0.45)";
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -24,
                        right: -24,
                        width: 80,
                        height: 80,
                        borderRadius: 999,
                        background:
                          saldoMeseSezioneFinanza >= 0
                            ? "radial-gradient(circle, rgba(59,130,246,0.20), transparent 68%)"
                            : "radial-gradient(circle, rgba(124,58,237,0.20), transparent 68%)",
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 950,
                        color:
                          saldoMeseSezioneFinanza >= 0
                            ? "rgba(30,64,175,0.82)"
                            : "rgba(88,28,135,0.82)",
                      }}
                    >
                      Saldo mese
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: isMobileConsulta ? 20 : 24,
                        fontWeight: 1000,
                        color: "rgba(15,23,42,0.96)",
                        letterSpacing: -0.3,
                      }}
                    >
                      {euro(saldoMeseSezioneFinanza)}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  ...ui.card,
                  padding: 16,
                  border: "1px solid rgba(255,255,255,0.58)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
                  boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
                  display: "grid",
                  gap: 16,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 1000,
                        letterSpacing: -0.3,
                        color: "rgba(15,23,42,0.98)",
                      }}
                    >
                      Grafico uscite
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: 850,
                        color: "rgba(71,85,105,0.82)",
                      }}
                    >
                      Solo uscite raggruppate per categoria
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setFinanzaVistaGrafico("mese");
                        setFinanzaAnnoSelezionato(meseCorrente.getFullYear());
                        setFinanzaMeseSelezionato(meseCorrente.getMonth());
                      }}
                      style={chip(finanzaVistaGrafico === "mese")}
                    >
                      Mese
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFinanzaVistaGrafico("anno");
                        setFinanzaAnnoSelezionato(meseCorrente.getFullYear());
                      }}
                      style={chip(finanzaVistaGrafico === "anno")}
                    >
                      Anno
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
                      gap: 10,
                      width: "100%",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(71,85,105,0.86)", marginBottom: 6 }}>
                        Dal
                      </div>
                      <input
                        type="date"
                        value={filtroFinanzaGrafico.dal}
                        onChange={(e) => setFiltroFinanzaGrafico((prev) => ({ ...prev, dal: e.target.value }))}
                        style={{
                          ...inputLight(false),
                          width: "100%",
                          minWidth: 0,
                          maxWidth: "100%",
                          height: isMobileConsulta ? 56 : 52,
                          padding: "10px 14px",
                          boxSizing: "border-box",
                          appearance: "none",
                          WebkitAppearance: "none",
                          background: "rgba(255,255,255,1)",
                          color: "rgba(15,23,42,0.98)",
                          WebkitTextFillColor: "rgba(15,23,42,0.98)",
                          caretColor: "rgba(15,23,42,0.98)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          fontSize: 15,
                          fontWeight: 900,
                          borderRadius: 18,
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(71,85,105,0.86)", marginBottom: 6 }}>
                        Al
                      </div>
                      <input
                        type="date"
                        value={filtroFinanzaGrafico.al}
                        onChange={(e) => setFiltroFinanzaGrafico((prev) => ({ ...prev, al: e.target.value }))}
                        style={{
                          ...inputLight(false),
                          width: "100%",
                          minWidth: 0,
                          maxWidth: "100%",
                          height: isMobileConsulta ? 56 : 52,
                          padding: "10px 14px",
                          boxSizing: "border-box",
                          appearance: "none",
                          WebkitAppearance: "none",
                          background: "rgba(255,255,255,1)",
                          color: "rgba(15,23,42,0.98)",
                          WebkitTextFillColor: "rgba(15,23,42,0.98)",
                          caretColor: "rgba(15,23,42,0.98)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          fontSize: 15,
                          fontWeight: 900,
                          borderRadius: 18,
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(71,85,105,0.86)", marginBottom: 6 }}>
                        Categoria
                      </div>
                      <select
                        value={filtroFinanzaGrafico.categoria}
                        onChange={(e) => setFiltroFinanzaGrafico((prev) => ({ ...prev, categoria: e.target.value }))}
                        style={{
                          ...inputLight(false),
                          width: "100%",
                          minWidth: 0,
                          maxWidth: "100%",
                          height: isMobileConsulta ? 56 : 52,
                          padding: "10px 14px",
                          boxSizing: "border-box",
                          background: "rgba(255,255,255,1)",
                          color: "rgba(15,23,42,0.98)",
                          WebkitTextFillColor: "rgba(15,23,42,0.98)",
                          caretColor: "rgba(15,23,42,0.98)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          fontSize: 15,
                          fontWeight: 900,
                          borderRadius: 18,
                        }}
                      >
                        <option value="">Tutte</option>
                        {categorieUscitaFinanza.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFiltroFinanzaGrafico({ dal: "", al: "", categoria: "" })}
                    style={{
                      border: "1px solid rgba(148,163,184,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
                      borderRadius: 16,
                      fontWeight: 900,
                      cursor: "pointer",
                      color: "rgba(15,23,42,0.86)",
                      minHeight: 46,
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      transition: "transform .16s ease, box-shadow .16s ease",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 12px 22px rgba(15,23,42,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 8px 18px rgba(15,23,42,0.05)";
                    }}
                  >
                    Reset filtri
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      finanzaVistaGrafico === "mese"
                        ? "minmax(0, 0.95fr) minmax(0, 1.05fr)"
                        : "minmax(0, 1fr)",
                    gap: 16,
                    alignItems: "start",
                    minWidth: 0,
                  }}
                  className="remember-grid-2"
                >
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 24,
                      border: "1px solid rgba(148,163,184,0.16)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
                      boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
                      display: "grid",
                      gap: 16,
                      justifyItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 1000,
                        color: "rgba(15,23,42,0.96)",
                        textAlign: "center",
                      }}
                    >
                      {finanzaVistaGrafico === "mese"
                        ? `Torta uscite • ${nomeMesiCompleti[meseCorrente.getMonth()]} ${meseCorrente.getFullYear()}`
                        : `Torta uscite • anno ${meseCorrente.getFullYear()}`}
                    </div>

                    <div
                      style={{
                        width: isMobileConsulta ? 190 : 230,
                        height: isMobileConsulta ? 190 : 230,
                        maxWidth: "100%",
                        borderRadius: "50%",
                        background: pieGradientFinanza,
                        boxShadow:
                          "0 28px 60px rgba(15,23,42,0.16), inset 0 10px 18px rgba(255,255,255,0.28), inset 0 -14px 24px rgba(15,23,42,0.10)",
                        border: "14px solid rgba(255,255,255,0.98)",
                        outline: "7px solid rgba(226,232,240,0.95)",
                        position: "relative",
                        transition: "transform .22s ease, box-shadow .22s ease",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.03)";
                        e.currentTarget.style.boxShadow =
                          "0 34px 70px rgba(15,23,42,0.18), inset 0 10px 18px rgba(255,255,255,0.30), inset 0 -14px 24px rgba(15,23,42,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow =
                          "0 28px 60px rgba(15,23,42,0.16), inset 0 10px 18px rgba(255,255,255,0.28), inset 0 -14px 24px rgba(15,23,42,0.10)";
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "50%",
                          background:
                            "radial-gradient(circle at 50% 38%, rgba(255,255,255,0.18), transparent 34%)",
                          pointerEvents: "none",
                        }}
                      />

                      <div
                        style={{
                          position: "absolute",
                          inset: "50% auto auto 50%",
                          transform: "translate(-50%, -50%)",
                          width: isMobileConsulta ? 78 : 94,
                          height: isMobileConsulta ? 78 : 94,
                          borderRadius: "50%",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.96))",
                          display: "grid",
                          placeItems: "center",
                          boxShadow:
                            "0 10px 22px rgba(15,23,42,0.10), inset 0 0 0 1px rgba(148,163,184,0.12)",
                          border: "1px solid rgba(255,255,255,0.96)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(100,116,139,0.84)" }}>
                            Totale
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 1000, color: "rgba(15,23,42,0.96)" }}>
                            {euro(totaleGraficoUscite)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {uscitePerCategoriaGrafico.length === 0 ? (
                        <div
                          style={{
                            padding: 12,
                            borderRadius: 16,
                            border: "1px solid rgba(148,163,184,0.16)",
                            background: "rgba(255,255,255,0.82)",
                            fontSize: 13,
                            fontWeight: 800,
                            color: "rgba(100,116,139,0.86)",
                            textAlign: "center",
                          }}
                        >
                          Nessuna uscita da mostrare.
                        </div>
                      ) : (
                        uscitePerCategoriaGrafico.map((item, index) => {
                          const perc = totaleGraficoUscite > 0 ? (item.totale / totaleGraficoUscite) * 100 : 0;

                          return (
                            <div
                              key={item.categoria}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "16px minmax(0, 1fr) auto",
                                gap: 10,
                                alignItems: "center",
                                padding: "9px 11px",
                                borderRadius: 16,
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
                                border: "1px solid rgba(148,163,184,0.14)",
                                boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
                              }}
                            >
                              <div
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: 999,
                                  background: pieColors[index % pieColors.length],
                                  boxShadow: `0 0 0 4px ${pieColors[index % pieColors.length]}22`,
                                }}
                              />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 900,
                                    color: "rgba(15,23,42,0.92)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {item.categoria}
                                </div>
                                <div
                                  style={{
                                    marginTop: 2,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "rgba(100,116,139,0.84)",
                                  }}
                                >
                                  {perc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%
                                </div>
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 1000,
                                  color: "rgba(15,23,42,0.92)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {euro(item.totale)}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {finanzaVistaGrafico === "mese" && (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 24,
                        border: "1px solid rgba(148,163,184,0.16)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
                        boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
                        display: "grid",
                        gap: 14,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 1000,
                          color: "rgba(15,23,42,0.96)",
                        }}
                      >
                        Barre uscite • {nomeMesiCompleti[meseCorrente.getMonth()]} {meseCorrente.getFullYear()}
                      </div>

                      {uscitePerCategoriaGrafico.length === 0 ? (
                        <div
                          style={{
                            padding: 12,
                            borderRadius: 16,
                            border: "1px solid rgba(148,163,184,0.16)",
                            background: "rgba(255,255,255,0.82)",
                            fontSize: 13,
                            fontWeight: 800,
                            color: "rgba(100,116,139,0.86)",
                            textAlign: "center",
                          }}
                        >
                          Nessuna uscita da mostrare.
                        </div>
                      ) : (
                        uscitePerCategoriaGrafico.map((item, index) => {
                          const perc = maxBarFinanza > 0 ? (item.totale / maxBarFinanza) * 100 : 0;

                          return (
                            <div key={item.categoria} style={{ display: "grid", gap: 6 }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 950,
                                    color: "rgba(15,23,42,0.92)",
                                  }}
                                >
                                  {item.categoria}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 1000,
                                    color: "rgba(15,23,42,0.84)",
                                  }}
                                >
                                  {euro(item.totale)}
                                </div>
                              </div>

                              <div
                                style={{
                                  height: 16,
                                  borderRadius: 999,
                                  background: "rgba(226,232,240,0.92)",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.max(8, perc)}%`,
                                    height: "100%",
                                    borderRadius: 999,
                                    background: `linear-gradient(90deg, ${pieColors[index % pieColors.length]}, rgba(15,23,42,0.88))`,
                                    boxShadow: "0 10px 18px rgba(15,23,42,0.10)",
                                    transition: "width .25s ease",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  ...ui.card,
                  padding: 16,
                  border: "1px solid rgba(255,255,255,0.58)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
                  boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
                  display: "grid",
                  gap: 16,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                      letterSpacing: -0.3,
                      color: "rgba(15,23,42,0.98)",
                    }}
                  >
                    Lista movimenti
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 850,
                      color: "rgba(71,85,105,0.82)",
                      lineHeight: 1.45,
                    }}
                  >
                    Uscite del mese selezionato con card compatte e azioni rapide.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
                      gap: 10,
                      width: "100%",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: "rgba(71,85,105,0.86)",
                          marginBottom: 6,
                        }}
                      >
                        Dal
                      </div>
                      <input
                        type="date"
                        value={filtroFinanzaLista.dal}
                        onChange={(e) => setFiltroFinanzaLista((prev) => ({ ...prev, dal: e.target.value }))}
                        style={{
                          ...inputLight(false),
                          width: "100%",
                          minWidth: 0,
                          maxWidth: "100%",
                          height: isMobileConsulta ? 56 : 52,
                          padding: "10px 14px",
                          boxSizing: "border-box",
                          appearance: "none",
                          WebkitAppearance: "none",
                          background: "rgba(255,255,255,1)",
                          color: "rgba(15,23,42,0.98)",
                          WebkitTextFillColor: "rgba(15,23,42,0.98)",
                          caretColor: "rgba(15,23,42,0.98)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          fontSize: 15,
                          fontWeight: 900,
                          borderRadius: 18,
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: "rgba(71,85,105,0.86)",
                          marginBottom: 6,
                        }}
                      >
                        Al
                      </div>
                      <input
                        type="date"
                        value={filtroFinanzaLista.al}
                        onChange={(e) => setFiltroFinanzaLista((prev) => ({ ...prev, al: e.target.value }))}
                        style={{
                          ...inputLight(false),
                          width: "100%",
                          minWidth: 0,
                          maxWidth: "100%",
                          height: isMobileConsulta ? 56 : 52,
                          padding: "10px 14px",
                          boxSizing: "border-box",
                          appearance: "none",
                          WebkitAppearance: "none",
                          background: "rgba(255,255,255,1)",
                          color: "rgba(15,23,42,0.98)",
                          WebkitTextFillColor: "rgba(15,23,42,0.98)",
                          caretColor: "rgba(15,23,42,0.98)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          fontSize: 15,
                          fontWeight: 900,
                          borderRadius: 18,
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: "rgba(71,85,105,0.86)",
                          marginBottom: 6,
                        }}
                      >
                        Categoria
                      </div>
                      <select
                        value={filtroFinanzaLista.categoria}
                        onChange={(e) => setFiltroFinanzaLista((prev) => ({ ...prev, categoria: e.target.value }))}
                        style={{
                          ...inputLight(false),
                          width: "100%",
                          minWidth: 0,
                          maxWidth: "100%",
                          height: isMobileConsulta ? 56 : 52,
                          padding: "10px 14px",
                          boxSizing: "border-box",
                          background: "rgba(255,255,255,1)",
                          color: "rgba(15,23,42,0.98)",
                          WebkitTextFillColor: "rgba(15,23,42,0.98)",
                          caretColor: "rgba(15,23,42,0.98)",
                          border: "1px solid rgba(148,163,184,0.22)",
                          fontSize: 15,
                          fontWeight: 900,
                          borderRadius: 18,
                        }}
                      >
                        <option value="">Tutte</option>
                        {categorieUscitaFinanza.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFiltroFinanzaLista({ dal: "", al: "", categoria: "" })}
                    style={{
                      border: "1px solid rgba(148,163,184,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
                      borderRadius: 16,
                      fontWeight: 900,
                      cursor: "pointer",
                      color: "rgba(15,23,42,0.86)",
                      minHeight: 46,
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      transition: "transform .16s ease, box-shadow .16s ease",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 12px 22px rgba(15,23,42,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 8px 18px rgba(15,23,42,0.05)";
                    }}
                  >
                    Reset filtri
                  </button>
                </div>

                {(() => {
                  const listaMovimentiFinanzaVisibili = listaMovimentiFinanza.filter((mov) => {
                    const [annoMov, meseMov] = mov.data.split("-").map(Number);
                    return annoMov === meseCorrente.getFullYear() && meseMov - 1 === meseCorrente.getMonth();
                  });

                  return (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      {listaMovimentiFinanzaVisibili.length === 0 ? (
                        <div
                          style={{
                            padding: 16,
                            borderRadius: 18,
                            border: "1px solid rgba(148,163,184,0.16)",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.88))",
                            fontSize: 13,
                            fontWeight: 850,
                            color: "rgba(100,116,139,0.86)",
                            textAlign: "center",
                          }}
                        >
                          Nessun movimento trovato per il mese selezionato.
                        </div>
                      ) : (
                        listaMovimentiFinanzaVisibili.map((mov) => (
                          <div
                            key={`${mov.origine}_${mov.id}`}
                            style={{
                              padding: isMobileConsulta ? 12 : 14,
                              borderRadius: 22,
                              border: "1px solid rgba(239,68,68,0.14)",
                              background:
                                "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.95))",
                              boxShadow:
                                "0 10px 22px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.75)",
                              display: "grid",
                              gridTemplateColumns: isMobileConsulta ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto",
                              gap: 12,
                              alignItems: "start",
                              position: "relative",
                              overflow: "hidden",
                              transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow =
                                "0 16px 28px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.75)";
                              e.currentTarget.style.borderColor = "rgba(239,68,68,0.22)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow =
                                "0 10px 22px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.75)";
                              e.currentTarget.style.borderColor = "rgba(239,68,68,0.14)";
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                top: -24,
                                right: -24,
                                width: 90,
                                height: 90,
                                borderRadius: 999,
                                background: "radial-gradient(circle, rgba(239,68,68,0.14), transparent 68%)",
                                pointerEvents: "none",
                              }}
                            />

                            <div
                              style={{
                                minWidth: 0,
                                display: "grid",
                                gap: 7,
                                position: "relative",
                                zIndex: 1,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    minWidth: 0,
                                  }}
                                >
                                  <span
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      fontSize: 11,
                                      fontWeight: 950,
                                      background:
                                        "linear-gradient(180deg, rgba(254,226,226,0.98), rgba(254,242,242,0.98))",
                                      border: "1px solid rgba(239,68,68,0.18)",
                                      color: "rgba(153,27,27,0.96)",
                                      boxShadow: "0 6px 14px rgba(239,68,68,0.06)",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {mov.categoria}
                                  </span>

                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 900,
                                      color: "rgba(100,116,139,0.84)",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {formattaDataBreve(mov.data)}
                                  </span>
                                </div>

                                {isMobileConsulta && (
                                  <div
                                    style={{
                                      padding: "7px 11px",
                                      borderRadius: 999,
                                      border: "1px solid rgba(239,68,68,0.18)",
                                      background:
                                        "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(254,226,226,0.96))",
                                      fontSize: 12,
                                      fontWeight: 1000,
                                      color: "rgba(153,27,27,0.96)",
                                      whiteSpace: "nowrap",
                                      boxShadow: "0 8px 16px rgba(239,68,68,0.06)",
                                    }}
                                  >
                                    {euro(mov.importo)}
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  fontSize: 15,
                                  fontWeight: 1000,
                                  color: "rgba(15,23,42,0.97)",
                                  lineHeight: 1.25,
                                  letterSpacing: -0.1,
                                }}
                              >
                                {mov.dettaglio || mov.descrizione}
                              </div>

                              {mov.nota && (
                                <div
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 14,
                                    background: "rgba(241,245,249,0.88)",
                                    border: "1px solid rgba(148,163,184,0.14)",
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: "rgba(71,85,105,0.84)",
                                    lineHeight: 1.4,
                                  }}
                                >
                                  <span style={{ fontWeight: 950, color: "rgba(51,65,85,0.92)" }}>Nota:</span> {mov.nota}
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: 8,
                                justifyItems: isMobileConsulta ? "stretch" : "end",
                                minWidth: isMobileConsulta ? 0 : 112,
                                position: "relative",
                                zIndex: 1,
                              }}
                            >
                              {!isMobileConsulta && (
                                <div
                                  style={{
                                    padding: "7px 11px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(239,68,68,0.18)",
                                    background:
                                      "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(254,226,226,0.96))",
                                    fontSize: 12,
                                    fontWeight: 1000,
                                    color: "rgba(153,27,27,0.96)",
                                    whiteSpace: "nowrap",
                                    boxShadow: "0 8px 16px rgba(239,68,68,0.06)",
                                  }}
                                >
                                  {euro(mov.importo)}
                                </div>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexWrap: "wrap",
                                  justifyContent: isMobileConsulta ? "stretch" : "flex-end",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => apriModificaMovimentoFinanza(mov)}
                                  style={{
                                    ...chip(false),
                                    minWidth: isMobileConsulta ? 0 : 92,
                                    flex: isMobileConsulta ? 1 : undefined,
                                    justifyContent: "center",
                                    display: "inline-flex",
                                    alignItems: "center",
                                  }}
                                >
                                  Modifica
                                </button>

                                <button
                                  type="button"
                                  onClick={() => eliminaMovimentoFinanza(mov)}
                                  style={{
                                    ...chip(false),
                                    minWidth: isMobileConsulta ? 0 : 86,
                                    flex: isMobileConsulta ? 1 : undefined,
                                    justifyContent: "center",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    border: "1px solid rgba(239,68,68,0.22)",
                                    color: "rgba(185,28,28,0.96)",
                                    background:
                                      "linear-gradient(180deg, rgba(254,242,242,0.96), rgba(254,226,226,0.88))",
                                  }}
                                >
                                  Elimina
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {movimentoFinanzaInModifica && (
              <div style={sx.overlay} onClick={chiudiModificaMovimentoFinanza}>
                <div
                  style={{
                    ...sx.modal,
                    width: "min(640px, 100%)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={sx.header}>
                    <div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 1000,
                          letterSpacing: -0.4,
                          color: "rgba(15,23,42,0.96)",
                        }}
                      >
                        Modifica movimento
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          fontWeight: 850,
                          color: "rgba(71,85,105,0.80)",
                        }}
                      >
                        Salvataggio con ritorno diretto a Consulta → Finanza
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={chiudiModificaMovimentoFinanza}
                      style={sx.closeBtn}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={sx.body}>
                    <div style={sx.content}>
                      <div style={sx.row2}>
                        <div>
                          <div style={sx.sectionLabel}>Data</div>
                          <input
                            type="date"
                            value={finanzaModData}
                            onChange={(e) => setFinanzaModData(e.target.value)}
                            style={{
                              ...inputLight(false),
                              background: "rgba(255,255,255,1)",
                              color: "rgba(15,23,42,0.98)",
                              WebkitTextFillColor: "rgba(15,23,42,0.98)",
                              caretColor: "rgba(15,23,42,0.98)",
                              border: "1px solid rgba(148,163,184,0.22)",
                            }}
                          />
                        </div>

                        <div>
                          <div style={sx.sectionLabel}>Importo</div>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={finanzaModImporto}
                            onChange={(e) => setFinanzaModImporto(e.target.value)}
                            style={{
                              ...inputLight(false),
                              background: "rgba(255,255,255,1)",
                              color: "rgba(15,23,42,0.98)",
                              WebkitTextFillColor: "rgba(15,23,42,0.98)",
                              caretColor: "rgba(15,23,42,0.98)",
                              border: "1px solid rgba(148,163,184,0.22)",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div style={sx.sectionLabel}>Categoria</div>
                        <select
                          value={finanzaModCategoria}
                          onChange={(e) => setFinanzaModCategoria(e.target.value)}
                          style={{
                            ...inputLight(false),
                            background: "rgba(255,255,255,1)",
                            color: "rgba(15,23,42,0.98)",
                            WebkitTextFillColor: "rgba(15,23,42,0.98)",
                            caretColor: "rgba(15,23,42,0.98)",
                            border: "1px solid rgba(148,163,184,0.22)",
                          }}
                        >
                          <option value="">Seleziona categoria</option>
                          {categorieUscitaFinanza.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={sx.sectionLabel}>Descrizione</div>
                        <input
                          type="text"
                          value={finanzaModDettaglio}
                          onChange={(e) => setFinanzaModDettaglio(e.target.value)}
                          placeholder="Dettaglio movimento"
                          style={{
                            ...inputLight(false),
                            background: "rgba(255,255,255,1)",
                            color: "rgba(15,23,42,0.98)",
                            WebkitTextFillColor: "rgba(15,23,42,0.98)",
                            caretColor: "rgba(15,23,42,0.98)",
                            border: "1px solid rgba(148,163,184,0.22)",
                          }}
                        />
                      </div>

                      <div>
                        <div style={sx.sectionLabel}>Nota</div>
                        <input
                          type="text"
                          value={finanzaModNota}
                          onChange={(e) => setFinanzaModNota(e.target.value)}
                          placeholder="Nota facoltativa"
                          style={{
                            ...inputLight(false),
                            background: "rgba(255,255,255,1)",
                            color: "rgba(15,23,42,0.98)",
                            WebkitTextFillColor: "rgba(15,23,42,0.98)",
                            caretColor: "rgba(15,23,42,0.98)",
                            border: "1px solid rgba(148,163,184,0.22)",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={sx.footer}>
                    <button
                      type="button"
                      onClick={chiudiModificaMovimentoFinanza}
                      style={sx.actionBtn(false)}
                    >
                      Annulla
                    </button>

                    <button
                      type="button"
                      onClick={salvaModificaMovimentoFinanza}
                      style={{
                        ...sx.actionBtn(true),
                        background:
                          "linear-gradient(180deg, rgba(79,70,229,0.20), rgba(124,58,237,0.14))",
                        border: "1px solid rgba(79,70,229,0.26)",
                        fontWeight: 1000,
                      }}
                    >
                      Salva modifiche
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>









        ) : consultaSezione === "eventi" ? (
          <>
            <div style={consultaHeaderWrap}>
              {consultaSectionBadge("📘", "Consulta eventi", "violet")}

              <div style={consultaSubtitleStyle}>
                Calendario eventi collegato ai tuoi elementi con vista futura e archivio automatico.
              </div>
            </div>

            {(() => {
              const eventiConsultaMese = voci
                .filter((v) => stessoMeseSelezionato(v.data))
                .filter((v) => v.tipo === "scadenza" || v.tipo === "appuntamento")
                .slice()
                .sort((a, b) => {
                  const d = a.data.localeCompare(b.data);
                  if (d !== 0) return d;
                  return a.ora.localeCompare(b.ora);
                });

              const eventiProssimiConsulta = eventiConsultaMese.filter((v) => !vocePassata(v.data, v.ora));

              const eventiPassatiBase = voci
                .filter((v) => v.tipo === "scadenza" || v.tipo === "appuntamento")
                .filter((v) => vocePassata(v.data, v.ora))
                .slice()
                .sort((a, b) => {
                  const d = b.data.localeCompare(a.data);
                  if (d !== 0) return d;
                  return b.ora.localeCompare(a.ora);
                });

              const eventiPassatiFiltrati = eventiPassatiBase.filter((v) => {
                if (filtroFinanzaLista.dal && v.data < filtroFinanzaLista.dal) return false;
                if (filtroFinanzaLista.al && v.data > filtroFinanzaLista.al) return false;
                return true;
              });

              return (
                <div
                  style={{
                    maxWidth: 1060,
                    margin: "0 auto",
                    marginTop: 14,
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <MiniCalendarioEventi
                    mese={meseCorrente}
                    eventi={eventiConsultaMese}
                    onPrevMonth={mesePrecedente}
                    onNextMonth={meseSuccessivo}
                    onOpenEvent={(id) => {
                      const voceOriginale = voci.find((x) => x.id === id);
                      if (!voceOriginale) return;
                      apriModifica(voceOriginale);
                    }}
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                      gap: 14,
                    }}
                    className="remember-grid-2"
                  >
                    <div
                      style={{
                        ...ui.card,
                        padding: 18,
                        border: "1px solid rgba(255,255,255,0.58)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
                        boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 1000,
                            letterSpacing: -0.3,
                            color: "rgba(15,23,42,0.98)",
                          }}
                        >
                          Eventi del mese
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontWeight: 850,
                            color: "rgba(71,85,105,0.82)",
                          }}
                        >
                          Tutti gli eventi futuri del mese selezionato.
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        {eventiProssimiConsulta.length === 0 ? (
                          <div
                            style={{
                              padding: 14,
                              borderRadius: 18,
                              border: "1px solid rgba(148,163,184,0.16)",
                              background: "rgba(255,255,255,0.84)",
                              fontSize: 13,
                              fontWeight: 850,
                              color: "rgba(100,116,139,0.86)",
                              textAlign: "center",
                            }}
                          >
                            Nessun evento futuro nel mese selezionato.
                          </div>
                        ) : (
                          eventiProssimiConsulta.map((ev) => (
                            <div
                              key={ev.id}
                              style={{
                                padding: 14,
                                borderRadius: 20,
                                border: "1px solid rgba(79,70,229,0.12)",
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
                                boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
                                display: "grid",
                                gridTemplateColumns: isMobileConsulta ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto",
                                gap: 12,
                                alignItems: "start",
                              }}
                            >
                              <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 950,
                                      background: "rgba(79,70,229,0.10)",
                                      border: "1px solid rgba(79,70,229,0.18)",
                                      color: "rgba(79,70,229,0.98)",
                                      lineHeight: 1,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Evento
                                  </span>
                                  {ev.urgente && badgeUrgente()}
                                </div>

                                <div
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 950,
                                    color: "rgba(15,23,42,0.96)",
                                    lineHeight: 1.25,
                                  }}
                                >
                                  {ev.titolo}
                                </div>

                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 850,
                                    color: "rgba(100,116,139,0.84)",
                                  }}
                                >
                                  {formattaDataBreve(ev.data)} • {ev.ora}
                                </div>

                                {ev.nota && (
                                  <div
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 14,
                                      background: "rgba(241,245,249,0.88)",
                                      border: "1px solid rgba(148,163,184,0.14)",
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: "rgba(71,85,105,0.84)",
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {ev.nota}
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: 8,
                                  justifyItems: isMobileConsulta ? "stretch" : "end",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    const voceOriginale = voci.find((x) => x.id === ev.id);
                                    if (!voceOriginale) return;
                                    apriModifica(voceOriginale);
                                  }}
                                  style={{
                                    ...chip(false),
                                    justifyContent: "center",
                                    display: "inline-flex",
                                    alignItems: "center",
                                  }}
                                >
                                  Modifica
                                </button>

                                <button
                                  type="button"
                                  onClick={() => elimina(ev.id)}
                                  style={{
                                    ...chip(false),
                                    justifyContent: "center",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    border: "1px solid rgba(239,68,68,0.22)",
                                    color: "rgba(185,28,28,0.96)",
                                    background: "rgba(254,242,242,0.92)",
                                  }}
                                >
                                  Elimina
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        ...ui.card,
                        padding: 18,
                        border: "1px solid rgba(255,255,255,0.58)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.97))",
                        boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 1000,
                            letterSpacing: -0.3,
                            color: "rgba(15,23,42,0.98)",
                          }}
                        >
                          Eventi passati
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontWeight: 850,
                            color: "rgba(71,85,105,0.82)",
                          }}
                        >
                          Archivio automatico eventi con filtro data.
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          width: "100%",
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
                            gap: 10,
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                color: "rgba(71,85,105,0.86)",
                                marginBottom: 6,
                              }}
                            >
                              Dal
                            </div>
                            <input
                              type="date"
                              value={filtroFinanzaLista.dal}
                              onChange={(e) =>
                                setFiltroFinanzaLista((prev) => ({ ...prev, dal: e.target.value }))
                              }
                              style={{
                                ...inputLight(false),
                                width: "100%",
                                minWidth: 0,
                                maxWidth: "100%",
                                height: isMobileConsulta ? 56 : 52,
                                padding: "10px 14px",
                                boxSizing: "border-box",
                                appearance: "none",
                                WebkitAppearance: "none",
                                background: "rgba(255,255,255,1)",
                                color: "rgba(15,23,42,0.98)",
                                WebkitTextFillColor: "rgba(15,23,42,0.98)",
                                caretColor: "rgba(15,23,42,0.98)",
                                border: "1px solid rgba(148,163,184,0.22)",
                                fontSize: 15,
                                fontWeight: 900,
                                borderRadius: 18,
                              }}
                            />
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                color: "rgba(71,85,105,0.86)",
                                marginBottom: 6,
                              }}
                            >
                              Al
                            </div>
                            <input
                              type="date"
                              value={filtroFinanzaLista.al}
                              onChange={(e) =>
                                setFiltroFinanzaLista((prev) => ({ ...prev, al: e.target.value }))
                              }
                              style={{
                                ...inputLight(false),
                                width: "100%",
                                minWidth: 0,
                                maxWidth: "100%",
                                height: isMobileConsulta ? 56 : 52,
                                padding: "10px 14px",
                                boxSizing: "border-box",
                                appearance: "none",
                                WebkitAppearance: "none",
                                background: "rgba(255,255,255,1)",
                                color: "rgba(15,23,42,0.98)",
                                WebkitTextFillColor: "rgba(15,23,42,0.98)",
                                caretColor: "rgba(15,23,42,0.98)",
                                border: "1px solid rgba(148,163,184,0.22)",
                                fontSize: 15,
                                fontWeight: 900,
                                borderRadius: 18,
                              }}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setFiltroFinanzaLista((prev) => ({ ...prev, dal: "", al: "" }))
                          }
                          style={{
                            border: "1px solid rgba(148,163,184,0.18)",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.94))",
                            borderRadius: 16,
                            fontWeight: 900,
                            cursor: "pointer",
                            color: "rgba(15,23,42,0.86)",
                            minHeight: 46,
                            width: "100%",
                            minWidth: 0,
                            boxSizing: "border-box",
                            boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
                          }}
                        >
                          Reset filtri
                        </button>
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        {eventiPassatiFiltrati.length === 0 ? (
                          <div
                            style={{
                              padding: 14,
                              borderRadius: 18,
                              border: "1px solid rgba(148,163,184,0.16)",
                              background: "rgba(255,255,255,0.84)",
                              fontSize: 13,
                              fontWeight: 850,
                              color: "rgba(100,116,139,0.86)",
                              textAlign: "center",
                            }}
                          >
                            Nessun evento passato trovato.
                          </div>
                        ) : (
                          eventiPassatiFiltrati.map((ev) => (
                            <div
                              key={ev.id}
                              style={{
                                padding: 14,
                                borderRadius: 20,
                                border: "1px solid rgba(148,163,184,0.14)",
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
                                boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
                                display: "grid",
                                gridTemplateColumns: isMobileConsulta ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto",
                                gap: 12,
                                alignItems: "start",
                              }}
                            >
                              <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 950,
                                      background: "rgba(79,70,229,0.10)",
                                      border: "1px solid rgba(79,70,229,0.18)",
                                      color: "rgba(79,70,229,0.98)",
                                      lineHeight: 1,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Evento
                                  </span>
                                  {ev.urgente && badgeUrgente()}
                                </div>

                                <div
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 950,
                                    color: "rgba(15,23,42,0.96)",
                                    lineHeight: 1.25,
                                  }}
                                >
                                  {ev.titolo}
                                </div>

                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 850,
                                    color: "rgba(100,116,139,0.84)",
                                  }}
                                >
                                  {formattaDataBreve(ev.data)} • {ev.ora}
                                </div>

                                {ev.nota && (
                                  <div
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 14,
                                      background: "rgba(241,245,249,0.88)",
                                      border: "1px solid rgba(148,163,184,0.14)",
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: "rgba(71,85,105,0.84)",
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {ev.nota}
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: 8,
                                  justifyItems: isMobileConsulta ? "stretch" : "end",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    const voceOriginale = voci.find((x) => x.id === ev.id);
                                    if (!voceOriginale) return;
                                    apriModifica(voceOriginale);
                                  }}
                                  style={{
                                    ...chip(false),
                                    justifyContent: "center",
                                    display: "inline-flex",
                                    alignItems: "center",
                                  }}
                                >
                                  Modifica
                                </button>

                                <button
                                  type="button"
                                  onClick={() => elimina(ev.id)}
                                  style={{
                                    ...chip(false),
                                    justifyContent: "center",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    border: "1px solid rgba(239,68,68,0.22)",
                                    color: "rgba(185,28,28,0.96)",
                                    background: "rgba(254,242,242,0.92)",
                                  }}
                                >
                                  Elimina
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div
            style={{
              ...ui.card,
              padding: 22,
              fontSize: 16,
              fontWeight: 900,
              color: "rgba(15,23,42,0.82)",
            }}
          >
            Sezione in preparazione
          </div>
        )}
      </div>
    </div>
  );
})()}
















{pagina === "note" && (() => {
  const isMobileNote = typeof window !== "undefined" && window.innerWidth <= 640;

  const noteAttive = (note as any[]).filter((n) => !n.archiviata);
  const noteArchiviate = (note as any[]).filter((n) => n.archiviata);

  const archiviaNota = (id: string) => {
    setNote((prev: any[]) =>
      prev.map((n) => (n.id === id ? { ...n, archiviata: true } : n))
    );
  };

  const ripristinaNota = (id: string) => {
    setNote((prev: any[]) =>
      prev.map((n) => (n.id === id ? { ...n, archiviata: false } : n))
    );
  };

  const bubblePalette = (index: number) =>
    [
      {
        bg: "linear-gradient(180deg, rgba(99,102,241,0.34), rgba(79,70,229,0.18))",
        border: "rgba(129,140,248,0.26)",
        glow: "rgba(99,102,241,0.16)",
      },
      {
        bg: "linear-gradient(180deg, rgba(16,185,129,0.30), rgba(5,150,105,0.16))",
        border: "rgba(52,211,153,0.24)",
        glow: "rgba(16,185,129,0.16)",
      },
      {
        bg: "linear-gradient(180deg, rgba(236,72,153,0.30), rgba(190,24,93,0.16))",
        border: "rgba(244,114,182,0.24)",
        glow: "rgba(236,72,153,0.14)",
      },
      {
        bg: "linear-gradient(180deg, rgba(251,191,36,0.28), rgba(217,119,6,0.16))",
        border: "rgba(252,211,77,0.24)",
        glow: "rgba(251,191,36,0.14)",
      },
    ][index % 4];

  const estraiAnteprimaNota = (testo: string) => {
    const pulito = String(testo || "").replace(/\s+/g, " ").trim();
    if (!pulito) return "Nota";

    const parole = pulito.split(" ").filter(Boolean);
    if (parole.length <= 4) return pulito;

    const keyword = parole.slice(0, 4).join(" ");
    return `${keyword}...`;
  };

  const renderBollaNota = (
    n: any,
    index: number,
    archivio = false
  ) => {
    const palette = bubblePalette(index);
    const driftName =
      index % 3 === 0 ? "noteFloatA" : index % 3 === 1 ? "noteFloatB" : "noteFloatC";
    const anteprima = estraiAnteprimaNota(n.testo);

    return (
      <div
        key={n.id}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          minHeight: isMobileNote ? 148 : 156,
          padding: 2,
          boxSizing: "border-box",
        }}
      >
        <div
          className="note-bubble-shell"
          style={{
            width: isMobileNote ? "min(100%, 176px)" : "min(100%, 184px)",
            minWidth: isMobileNote ? 154 : 162,
            minHeight: isMobileNote ? 132 : 138,
            maxWidth: isMobileNote ? "94vw" : 300,
            touchAction: "none",
            cursor: "grab",
            userSelect: "none",
            transform: "translate3d(0px, 0px, 0)",
            overflow: "visible",
            position: "relative",
            transition: "width .22s ease, max-width .22s ease, transform .18s ease",
          }}
          onPointerDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("[data-note-action='1']")) return;

            const el = e.currentTarget as HTMLDivElement;
            el.setPointerCapture?.(e.pointerId);
            el.style.cursor = "grabbing";
            el.dataset.dragging = "1";
            el.dataset.startX = String(e.clientX);
            el.dataset.startY = String(e.clientY);
            el.dataset.baseX = el.dataset.baseX || "0";
            el.dataset.baseY = el.dataset.baseY || "0";
          }}
          onPointerMove={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            if (el.dataset.dragging !== "1") return;

            const startX = Number(el.dataset.startX || 0);
            const startY = Number(el.dataset.startY || 0);
            const baseX = Number(el.dataset.baseX || 0);
            const baseY = Number(el.dataset.baseY || 0);

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            el.style.transform = `translate3d(${baseX + dx}px, ${baseY + dy}px, 0)`;
          }}
          onPointerUp={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            const startX = Number(el.dataset.startX || 0);
            const startY = Number(el.dataset.startY || 0);
            const baseX = Number(el.dataset.baseX || 0);
            const baseY = Number(el.dataset.baseY || 0);

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            el.dataset.baseX = String(baseX + dx);
            el.dataset.baseY = String(baseY + dy);
            el.dataset.dragging = "0";
            el.style.cursor = "grab";
          }}
          onPointerCancel={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.dataset.dragging = "0";
            el.style.cursor = "grab";
          }}
          title={archivio ? "Nota archiviata" : "Puoi trascinare la bolla"}
        >
          <div
            style={{
              position: "relative",
              animation: `${driftName} ${7 + (index % 3)}s ease-in-out infinite`,
              width: "100%",
              height: "100%",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -10,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${palette.glow}, transparent 72%)`,
                filter: "blur(14px)",
                pointerEvents: "none",
                animation: `noteHalo ${3.2 + (index % 3)}s ease-in-out infinite`,
              }}
            />

            <div
              style={{
                position: "relative",
                width: "100%",
                minHeight: isMobileNote ? 132 : 138,
                height: "100%",
                borderRadius: 28,
                background: archivio
                  ? "linear-gradient(180deg, rgba(71,85,105,0.28), rgba(51,65,85,0.16))"
                  : palette.bg,
                border: archivio
                  ? "1px solid rgba(148,163,184,0.20)"
                  : `1px solid ${palette.border}`,
                boxShadow:
                  "0 18px 34px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -12px 22px rgba(15,23,42,0.08)",
                backdropFilter: "blur(16px)",
                overflow: "visible",
                padding: isMobileNote ? "11px 10px 9px" : "11px 10px 9px",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                gap: 7,
                transition: "transform .18s ease, box-shadow .18s ease, filter .18s ease",
                animation: "noteGlowSoft 4.6s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 28,
                  pointerEvents: "none",
                  background:
                    "radial-gradient(circle at 26% 20%, rgba(255,255,255,0.24), transparent 16%), radial-gradient(circle at 74% 24%, rgba(255,255,255,0.06), transparent 16%)",
                }}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  paddingTop: 2,
                  paddingLeft: 2,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  {archivio ? "🗂️" : "🫧"}
                </div>
              </div>

              <details
                style={{
                  width: "100%",
                  minHeight: 0,
                }}
              >
                <summary
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.98)",
                      lineHeight: 1.38,
                      wordBreak: "break-word",
                      textShadow: "0 8px 20px rgba(15,23,42,0.16)",
                      textAlign: "left",
                    }}
                  >
                    {anteprima}
                  </div>

                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 9,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.68)",
                      letterSpacing: 0.16,
                      textAlign: "left",
                    }}
                  >
                    Tocca per aprire
                  </div>
                </summary>

                <div
                  className="note-bubble-open-box"
                  style={{
                    marginTop: 10,
                    padding: "10px 10px 9px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.08)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "rgba(255,255,255,0.96)",
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {n.testo}
                  </div>
                </div>
              </details>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: 5,
                  flexWrap: "nowrap",
                  marginTop: "auto",
                  paddingLeft: 2,
                }}
              >
                {!archivio && (
                  <button
                    data-note-action="1"
                    onClick={() => modificaNota(n)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "1px solid rgba(167,139,250,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(99,102,241,0.12), rgba(79,70,229,0.06))",
                      fontSize: 11,
                      fontWeight: 1000,
                      cursor: "pointer",
                      backdropFilter: "blur(8px)",
                      boxShadow: "0 8px 14px rgba(15,23,42,0.12)",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    title="Modifica nota"
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                        transform: "translateY(0px)",
                        color: "rgba(238,242,255,0.98)",
                        textShadow: "0 0 10px rgba(167,139,250,0.45)",
                        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
                      }}
                    >
                      M
                    </span>
                  </button>
                )}

                {!archivio && (
                  <button
                    data-note-action="1"
                    onClick={() => archiviaNota(n.id)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "1px solid rgba(96,165,250,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(59,130,246,0.12), rgba(37,99,235,0.06))",
                      fontSize: 11,
                      fontWeight: 1000,
                      cursor: "pointer",
                      backdropFilter: "blur(8px)",
                      boxShadow: "0 8px 14px rgba(15,23,42,0.12)",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    title="Archivia nota"
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                        transform: "translateY(0px)",
                        color: "rgba(219,234,254,0.98)",
                        textShadow: "0 0 10px rgba(96,165,250,0.45)",
                        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
                      }}
                    >
                      A
                    </span>
                  </button>
                )}

                {archivio && (
                  <button
                    data-note-action="1"
                    onClick={() => ripristinaNota(n.id)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "1px solid rgba(52,211,153,0.18)",
                      background:
                        "linear-gradient(180deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))",
                      fontSize: 11,
                      fontWeight: 1000,
                      cursor: "pointer",
                      backdropFilter: "blur(8px)",
                      boxShadow: "0 8px 14px rgba(15,23,42,0.12)",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    title="Ripristina nota"
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        height: "100%",
                        transform: "translateY(0px)",
                        color: "rgba(220,252,231,0.98)",
                        textShadow: "0 0 10px rgba(74,222,128,0.38)",
                        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
                      }}
                    >
                      R
                    </span>
                  </button>
                )}

                <button
                  data-note-action="1"
                  onClick={() => eliminaNota(n.id)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "1px solid rgba(248,113,113,0.18)",
                    background:
                      "linear-gradient(180deg, rgba(239,68,68,0.12), rgba(185,28,28,0.06))",
                    fontSize: 12,
                    fontWeight: 1000,
                    cursor: "pointer",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 8px 14px rgba(15,23,42,0.12)",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Elimina nota"
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: "100%",
                      transform: "translateY(-1px)",
                      color: "rgba(254,226,226,0.98)",
                      textShadow: "0 0 10px rgba(248,113,113,0.4)",
                      fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
                    }}
                  >
                    ✕
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "start center", padding: 16 }}>
      <div style={{ width: "min(1180px, 100%)", display: "grid", gap: 20 }}>

        <style>
          {`
            details > summary::-webkit-details-marker {
              display: none;
            }

            .note-bubble-shell:has(details[open]) {
              width: ${isMobileNote ? "min(100%, 260px)" : "min(100%, 300px)"} !important;
              max-width: ${isMobileNote ? "94vw" : "300px"} !important;
            }

            .note-bubble-shell:has(details[open]) .note-bubble-open-box {
              max-height: 260px;
              overflow-y: auto;
            }

            @keyframes noteFloatA {
              0%   { transform: translate3d(0px, 0px, 0) scale(1); }
              25%  { transform: translate3d(0px, -8px, 0) scale(1.01); }
              50%  { transform: translate3d(0px, 4px, 0) scale(0.995); }
              75%  { transform: translate3d(0px, -10px, 0) scale(1.01); }
              100% { transform: translate3d(0px, 0px, 0) scale(1); }
            }

            @keyframes noteFloatB {
              0%   { transform: translate3d(0px, 0px, 0) scale(1); }
              20%  { transform: translate3d(0px, -10px, 0) scale(1.01); }
              50%  { transform: translate3d(0px, 6px, 0) scale(0.995); }
              80%  { transform: translate3d(0px, -7px, 0) scale(1.008); }
              100% { transform: translate3d(0px, 0px, 0) scale(1); }
            }

            @keyframes noteFloatC {
              0%   { transform: translate3d(0px, 0px, 0) scale(1); }
              30%  { transform: translate3d(0px, -7px, 0) scale(1.008); }
              60%  { transform: translate3d(0px, 5px, 0) scale(0.996); }
              100% { transform: translate3d(0px, 0px, 0) scale(1); }
            }

            @keyframes noteGlowSoft {
              0%, 100% {
                box-shadow:
                  0 18px 34px rgba(79,70,229,0.12),
                  0 0 0 rgba(16,185,129,0);
              }
              50% {
                box-shadow:
                  0 24px 46px rgba(79,70,229,0.16),
                  0 0 14px rgba(16,185,129,0.05);
              }
            }

            @keyframes noteHalo {
              0%, 100% { opacity: 0.46; transform: scale(1); }
              50% { opacity: 0.72; transform: scale(1.04); }
            }
          `}
        </style>

        {/* TOP BAR NOTE */}
        <div style={topBar}>
          <div style={{ ...ui.glass, padding: 22 }}>
            <div style={{ display: "grid", gap: 18 }}>
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <RememberLogo size={54} centered />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(79,70,229,0.14)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.56))",
                    boxShadow: "0 18px 34px rgba(79,70,229,0.10)",
                    fontSize: 13,
                    fontWeight: 950,
                    letterSpacing: -0.2,
                    animation: "softGlow 2.4s ease-in-out infinite",
                  }}
                >
                  <span style={{ opacity: 0.8 }}>🕒</span>
                  <span style={{ color: "rgba(15,23,42,0.92)" }}>
                    {formattaDataLunga(adesso)}
                  </span>
                </div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  opacity: 0.72,
                  color: "rgba(241,245,249,0.92)",
                }}
              >
                Utente attivo: <span style={{ opacity: 1 }}>{currentUser.nome}</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  justifyItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <button data-chip="1" onClick={() => setPagina("home")} style={chip(false)}>
                    Home
                  </button>

                  <button
                    data-chip="1"
                    onClick={() => {
                      setConsultaSezione("menu");
                      setPagina("consulta");
                    }}
                    style={chip(false)}
                  >
                    Consulta
                  </button>

                  <button data-chip="1" onClick={() => setPagina("aggiungi")} style={chip(false)}>
                    Aggiungi
                  </button>
                </div>

                <button data-chip="1" onClick={esci} style={chip(false)}>
                  Esci
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* HEADER NOTE */}
        <div
          style={{
            display: "grid",
            gap: 12,
            justifyItems: "center",
            textAlign: "center",
            padding: "4px 6px 0",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: isMobileNote ? "12px 18px" : "14px 22px",
              borderRadius: 999,
              border: "1px solid rgba(79,70,229,0.18)",
              background:
                "linear-gradient(180deg, rgba(79,70,229,0.16), rgba(124,58,237,0.08))",
              boxShadow: "0 18px 40px rgba(79,70,229,0.14)",
            }}
          >
            <span style={{ fontSize: isMobileNote ? 22 : 24 }}>🖋️</span>

            <div
              style={{
                fontSize: isMobileNote ? 32 : 40,
                fontWeight: 1000,
                letterSpacing: -1,
                color: "rgba(241,245,249,0.98)",
                textShadow: "0 12px 30px rgba(79,70,229,0.22)",
                lineHeight: 1.02,
              }}
            >
              Le tue Note
            </div>
          </div>

          <div
            style={{
              maxWidth: 760,
              fontSize: 15,
              fontWeight: 800,
              color: "rgba(191,219,254,0.86)",
              lineHeight: 1.55,
              letterSpacing: 0.1,
            }}
          >
            Uno spazio essenziale per raccogliere, consultare e riordinare ciò che conta.
          </div>
        </div>

        {/* AREA PRINCIPALE */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobileNote ? "1fr" : "minmax(320px, 410px) minmax(0, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* PANNELLO SCRITTURA */}
          <div
            style={{
              ...ui.card,
              padding: isMobileNote ? 16 : 22,
              display: "grid",
              gap: 16,
              position: "sticky",
              top: 14,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 28px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(700px 220px at 0% 0%, rgba(79,70,229,0.14), transparent 60%), radial-gradient(700px 220px at 100% 0%, rgba(16,185,129,0.10), transparent 60%), radial-gradient(500px 220px at 50% 100%, rgba(251,191,36,0.08), transparent 60%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 16 }}>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 18,
                  fontWeight: 1000,
                  color: "rgba(241,245,249,0.98)",
                  letterSpacing: -0.2,
                }}
              >
                {notaInModifica ? "Modifica nota" : "Nuova nota"}
              </div>

              <div
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  borderRadius: 26,
                  padding: isMobileNote ? 10 : 12,
                  background:
                    "linear-gradient(180deg, rgba(255,248,220,0.98), rgba(245,222,179,0.95))",
                  border: "1px solid rgba(214,170,94,0.45)",
                  boxShadow:
                    "0 18px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(160,82,45,0.06)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                      "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.34), transparent 18%), radial-gradient(circle at 86% 24%, rgba(160,82,45,0.08), transparent 22%), radial-gradient(circle at 28% 78%, rgba(210,180,140,0.18), transparent 24%), radial-gradient(circle at 76% 72%, rgba(139,69,19,0.08), transparent 22%)",
                    opacity: 0.95,
                  }}
                />

                <textarea
                  value={notaInput}
                  onChange={(e) => setNotaInput(e.target.value)}
                  placeholder="Scrivi qualcosa di importante, un promemoria o un’idea da ricordare..."
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    minHeight: isMobileNote ? 180 : 220,
                    borderRadius: 18,
                    border: "1px solid rgba(160,82,45,0.22)",
                    padding: isMobileNote ? "16px 14px" : "18px 16px",
                    fontSize: isMobileNote ? 16 : 17,
                    fontWeight: 700,
                    lineHeight: 1.65,
                    background:
                      "linear-gradient(180deg, rgba(255,252,240,0.78), rgba(250,240,210,0.72))",
                    color: "rgba(45,23,12,0.98)",
                    WebkitTextFillColor: "rgba(45,23,12,0.98)",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 18px rgba(160,82,45,0.04)",
                    fontFamily: "'Georgia', 'Times New Roman', serif",
                    letterSpacing: 0.2,
                    caretColor: "rgba(120,53,15,0.95)",
                    position: "relative",
                    zIndex: 1,
                    display: "block",
                  }}
                />
              </div>

              <button
                onClick={salvaNota}
                style={{
                  padding: "16px",
                  borderRadius: 20,
                  border: "1px solid rgba(16,185,129,0.30)",
                  background:
                    "linear-gradient(180deg, rgba(16,185,129,0.48), rgba(5,150,105,0.24))",
                  fontWeight: 1000,
                  fontSize: 16,
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.98)",
                  boxShadow:
                    "0 18px 36px rgba(16,185,129,0.20), inset 0 1px 0 rgba(255,255,255,0.10)",
                  transition: "transform .18s ease, box-shadow .18s ease, filter .18s ease",
                }}
              >
                {notaInModifica ? "Aggiorna Nota" : "Salva Nota"}
              </button>
            </div>
          </div>

          {/* COLONNA NOTE */}
          <div style={{ display: "grid", gap: 20 }}>
            <div
              style={{
                ...ui.card,
                minHeight: 340,
                padding: isMobileNote ? 14 : 18,
                position: "relative",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 28px 70px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
                background:
                  "radial-gradient(900px 360px at 0% 0%, rgba(79,70,229,0.12), transparent 58%), radial-gradient(900px 360px at 100% 0%, rgba(16,185,129,0.10), transparent 58%), radial-gradient(800px 420px at 50% 100%, rgba(244,114,182,0.08), transparent 58%), linear-gradient(180deg, rgba(2,6,23,0.96), rgba(15,23,42,0.94))",
              }}
            >
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 20,
                    fontWeight: 1000,
                    letterSpacing: -0.4,
                    color: "rgba(241,245,249,0.98)",
                  }}
                >
                  Note salvate
                </div>

                {noteAttive.length === 0 ? (
                  <div
                    style={{
                      minHeight: 180,
                      display: "grid",
                      placeItems: "center",
                      color: "rgba(226,232,240,0.88)",
                      fontSize: 16,
                      fontWeight: 900,
                      textAlign: "center",
                    }}
                  >
                    Nessuna nota attiva
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobileNote ? "1fr" : "repeat(auto-fit, minmax(190px, 1fr))",
                      gap: 14,
                      justifyItems: "center",
                      alignItems: "start",
                    }}
                  >
                    {noteAttive.map((n, index) => renderBollaNota(n, index, false))}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                ...ui.card,
                padding: isMobileNote ? 10 : 12,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.07)",
                background:
                  "linear-gradient(180deg, rgba(15,23,42,0.76), rgba(30,41,59,0.68))",
                boxShadow:
                  "0 16px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
                display: "grid",
                gap: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 1000,
                  letterSpacing: -0.2,
                  color: "rgba(241,245,249,0.94)",
                }}
              >
                Legenda pulsanti
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobileNote
                    ? "repeat(2, minmax(0, 1fr))"
                    : "repeat(4, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    padding: "7px 8px",
                    borderRadius: 14,
                    border: "1px solid rgba(167,139,250,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(99,102,241,0.10), rgba(79,70,229,0.05))",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "inline-grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(99,102,241,0.12), rgba(79,70,229,0.06))",
                      border: "1px solid rgba(167,139,250,0.18)",
                      color: "rgba(238,242,255,0.98)",
                      fontSize: 10,
                      fontWeight: 1000,
                      lineHeight: 1,
                    }}
                  >
                    M
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      color: "rgba(226,232,240,0.92)",
                    }}
                  >
                    Modifica
                  </span>
                </div>

                <div
                  style={{
                    padding: "7px 8px",
                    borderRadius: 14,
                    border: "1px solid rgba(96,165,250,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(37,99,235,0.05))",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "inline-grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(59,130,246,0.12), rgba(37,99,235,0.06))",
                      border: "1px solid rgba(96,165,250,0.18)",
                      color: "rgba(219,234,254,0.98)",
                      fontSize: 10,
                      fontWeight: 1000,
                      lineHeight: 1,
                    }}
                  >
                    A
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      color: "rgba(226,232,240,0.92)",
                    }}
                  >
                    Archivia
                  </span>
                </div>

                <div
                  style={{
                    padding: "7px 8px",
                    borderRadius: 14,
                    border: "1px solid rgba(52,211,153,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(5,150,105,0.05))",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "inline-grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))",
                      border: "1px solid rgba(52,211,153,0.18)",
                      color: "rgba(220,252,231,0.98)",
                      fontSize: 10,
                      fontWeight: 1000,
                      lineHeight: 1,
                    }}
                  >
                    R
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      color: "rgba(226,232,240,0.92)",
                    }}
                  >
                    Ripristina
                  </span>
                </div>

                <div
                  style={{
                    padding: "7px 8px",
                    borderRadius: 14,
                    border: "1px solid rgba(248,113,113,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(239,68,68,0.10), rgba(185,28,28,0.05))",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "inline-grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(239,68,68,0.12), rgba(185,28,28,0.06))",
                      border: "1px solid rgba(248,113,113,0.18)",
                      color: "rgba(254,226,226,0.98)",
                      fontSize: 10,
                      fontWeight: 1000,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      color: "rgba(226,232,240,0.92)",
                    }}
                  >
                    Elimina
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                ...ui.card,
                minHeight: 220,
                padding: isMobileNote ? 14 : 18,
                position: "relative",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 28px 70px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)",
                background:
                  "radial-gradient(800px 300px at 0% 0%, rgba(71,85,105,0.18), transparent 58%), radial-gradient(800px 300px at 100% 0%, rgba(100,116,139,0.12), transparent 58%), linear-gradient(180deg, rgba(9,13,24,0.96), rgba(20,28,45,0.94))",
              }}
            >
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 20,
                    fontWeight: 1000,
                    letterSpacing: -0.4,
                    color: "rgba(241,245,249,0.98)",
                  }}
                >
                  Note archiviate
                </div>

                {noteArchiviate.length === 0 ? (
                  <div
                    style={{
                      minHeight: 120,
                      display: "grid",
                      placeItems: "center",
                      color: "rgba(226,232,240,0.72)",
                      fontSize: 15,
                      fontWeight: 900,
                      textAlign: "center",
                    }}
                  >
                    Nessuna nota archiviata
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobileNote ? "1fr" : "repeat(auto-fit, minmax(190px, 1fr))",
                      gap: 14,
                      justifyItems: "center",
                      alignItems: "start",
                    }}
                  >
                    {noteArchiviate.map((n, index) => renderBollaNota(n, index, true))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
})()}



















{pagina === "aggiungi" && (() => {
  const isMobileAggiungi = typeof window !== "undefined" && window.innerWidth <= 640;

  const aggiungiHeaderWrap: React.CSSProperties = {
    display: "grid",
    gap: 12,
    justifyItems: "center",
    textAlign: "center",
    padding: "8px 6px 2px",
  };

  const aggiungiTitleStyle: React.CSSProperties = {
    fontSize: isMobileAggiungi ? 32 : 38,
    fontWeight: 1000,
    letterSpacing: -1,
    color: "rgba(241,245,249,0.98)",
    textShadow: "0 14px 36px rgba(16,185,129,0.22)",
    lineHeight: 1.03,
  };

  const aggiungiSubtitleStyle: React.CSSProperties = {
    maxWidth: 760,
    fontSize: 15,
    fontWeight: 800,
    color: "rgba(191,219,254,0.88)",
    lineHeight: 1.6,
    letterSpacing: 0.1,
  };

  const aggiungiBadge = (
    icon: string,
    label: string,
    accent: "green" | "violet" | "orange"
  ) => {
    const styleSet =
      accent === "green"
        ? {
            border: "1px solid rgba(16,185,129,0.18)",
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.16), rgba(16,185,129,0.06))",
            boxShadow: "0 18px 40px rgba(16,185,129,0.12)",
          }
        : accent === "orange"
        ? {
            border: "1px solid rgba(249,115,22,0.18)",
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.16), rgba(249,115,22,0.06))",
            boxShadow: "0 18px 40px rgba(249,115,22,0.12)",
          }
        : {
            border: "1px solid rgba(79,70,229,0.18)",
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.16), rgba(124,58,237,0.08))",
            boxShadow: "0 18px 40px rgba(79,70,229,0.14)",
          };

    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: isMobileAggiungi ? "12px 18px" : "14px 22px",
          borderRadius: 999,
          ...styleSet,
        }}
      >
        <span style={{ fontSize: isMobileAggiungi ? 22 : 24 }}>{icon}</span>
        <span style={aggiungiTitleStyle}>{label}</span>
      </div>
    );
  };

  const menuCardStyle = (
    accent: "green" | "violet" | "orange"
  ): React.CSSProperties => {
    const styleSet =
      accent === "green"
        ? {
            border: "1px solid rgba(16,185,129,0.18)",
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 24px 54px rgba(16,185,129,0.12)",
          }
        : accent === "orange"
        ? {
            border: "1px solid rgba(249,115,22,0.18)",
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 24px 54px rgba(249,115,22,0.12)",
          }
        : {
            border: "1px solid rgba(79,70,229,0.18)",
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 24px 54px rgba(79,70,229,0.12)",
          };

    return {
      ...ui.card,
      ...styleSet,
      padding: 22,
      minHeight: 220,
      textAlign: "left",
      cursor: "pointer",
      display: "grid",
      alignContent: "start",
      gap: 14,
      position: "relative",
      overflow: "hidden",
      transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
    };
  };

  const menuIconStyle = (
    accent: "green" | "violet" | "orange"
  ): React.CSSProperties => {
    const styleSet =
      accent === "green"
        ? {
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.98), rgba(5,150,105,0.92))",
            boxShadow: "0 16px 30px rgba(16,185,129,0.20)",
          }
        : accent === "orange"
        ? {
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.98), rgba(234,88,12,0.92))",
            boxShadow: "0 16px 30px rgba(249,115,22,0.20)",
          }
        : {
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.98), rgba(124,58,237,0.92))",
            boxShadow: "0 16px 30px rgba(79,70,229,0.20)",
          };

    return {
      width: 58,
      height: 58,
      borderRadius: 20,
      display: "grid",
      placeItems: "center",
      color: "white",
      fontSize: 24,
      ...styleSet,
    };
  };

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "start center", padding: 16 }}>
      <div style={{ width: "min(1100px, 100%)", display: "grid", gap: 18 }}>
        <div
          style={{
            ...ui.card,
            padding: 22,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(700px 260px at 0% 0%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(700px 260px at 100% 0%, rgba(79,70,229,0.08), transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 18 }}>
            <div
              style={{
                display: "grid",
                justifyItems: "center",
                textAlign: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <RememberLogo size={56} centered />
              </div>

              <div
                style={{
                  padding: "12px 18px",
                  borderRadius: 999,
                  background: "rgba(226,232,240,0.88)",
                  color: "rgba(15,23,42,0.92)",
                  fontWeight: 900,
                  fontSize: 14,
                  boxShadow: "0 16px 34px rgba(79,70,229,0.14)",
                  border: "1px solid rgba(203,213,225,0.95)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  maxWidth: "100%",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 16 }}>🕒</span>
                <span>
                  {dataOraCorrenteLabel.replace(/\balle\b/gi, "").replace(/\s+/g, " ").trim()}
                </span>
              </div>

              <div
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "rgba(241,245,249,0.92)",
                }}
              >
                Utente attivo: {currentUser.nome}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <button
                  data-chip="1"
                  onClick={() => {
                    resetForm();
                    setAggiungiSezione("menu");
                    setPagina("home");
                  }}
                  style={chip(false)}
                >
                  Home
                </button>

                <button
                  data-chip="1"
                  onClick={() => {
                    resetForm();
                    setAggiungiSezione("menu");
                    setPagina("consulta");
                  }}
                  style={chip(false)}
                >
                  Consulta
                </button>

                <button
                  data-chip="1"
                  onClick={() => {
                    resetForm();
                    setAggiungiSezione("menu");
                    setPagina("aggiungi");
                  }}
                  style={chip(true)}
                >
                  Aggiungi
                </button>

                <button
                  data-chip="1"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.close();
                    }
                  }}
                  style={chip(false)}
                >
                  Esci
                </button>
              </div>

              {aggiungiSezione !== "menu" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    data-chip="1"
                    onClick={() => {
                      resetForm();
                      setAggiungiSezione("menu");
                    }}
                    style={chip(false)}
                  >
                    Torna ad Aggiungi
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={aggiungiHeaderWrap}>
          {aggiungiSezione === "menu"
            ? aggiungiBadge("🖋️", "Aggiungi", "green")
            : aggiungiSezione === "movimenti"
            ? aggiungiBadge("🖋️", "Entrata / Uscita", "green")
            : aggiungiSezione === "eventi"
            ? aggiungiBadge("🖋️", "Evento", "violet")
            : aggiungiBadge("🖋️", "Turno", "orange")}

          <div style={aggiungiSubtitleStyle}>
            {aggiungiSezione === "menu"
              ? "Scegli cosa vuoi inserire nell’app e accedi al flusso corretto."
              : aggiungiSezione === "movimenti"
              ? "Inserisci movimenti economici con categorie, importi e note."
              : aggiungiSezione === "eventi"
              ? "Inserisci un evento con data, ora e descrizione."
              : "Inserisci un turno di lavoro, ferie o riposo."}
          </div>
        </div>

        {aggiungiSezione === "menu" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            <button
              data-chip="1"
              onClick={() => setAggiungiSezione("movimenti")}
              style={menuCardStyle("green")}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 30px 62px rgba(16,185,129,0.16)";
                e.currentTarget.style.borderColor = "rgba(16,185,129,0.26)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 24px 54px rgba(16,185,129,0.12)";
                e.currentTarget.style.borderColor = "rgba(16,185,129,0.18)";
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(500px 180px at 0% 0%, rgba(16,185,129,0.10), transparent 58%), radial-gradient(400px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                <div style={menuIconStyle("green")}>€</div>

                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                      letterSpacing: -0.3,
                      color: "rgba(15,23,42,0.96)",
                    }}
                  >
                    Entrata / Uscita
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      opacity: 0.76,
                      lineHeight: 1.5,
                      color: "rgba(15,23,42,0.88)",
                    }}
                  >
                    Inserisci nuovi movimenti economici in modo rapido.
                  </div>
                </div>
              </div>
            </button>

            <button
              data-chip="1"
              onClick={() => {
                resetForm();
                setAggiungiSezione("eventi");
              }}
              style={menuCardStyle("violet")}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 30px 62px rgba(79,70,229,0.16)";
                e.currentTarget.style.borderColor = "rgba(79,70,229,0.26)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 24px 54px rgba(79,70,229,0.12)";
                e.currentTarget.style.borderColor = "rgba(79,70,229,0.18)";
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(500px 180px at 0% 0%, rgba(79,70,229,0.10), transparent 58%), radial-gradient(400px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                <div style={menuIconStyle("violet")}>🗓</div>

                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                      letterSpacing: -0.3,
                      color: "rgba(15,23,42,0.96)",
                    }}
                  >
                    Evento
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      opacity: 0.76,
                      lineHeight: 1.5,
                      color: "rgba(15,23,42,0.88)",
                    }}
                  >
                    Crea un nuovo evento con un flusso unico e ordinato.
                  </div>
                </div>
              </div>
            </button>

            <button
              data-chip="1"
              onClick={() => apriTurnoForm()}
              style={menuCardStyle("orange")}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 30px 62px rgba(249,115,22,0.16)";
                e.currentTarget.style.borderColor = "rgba(249,115,22,0.26)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 24px 54px rgba(249,115,22,0.12)";
                e.currentTarget.style.borderColor = "rgba(249,115,22,0.18)";
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(500px 180px at 0% 0%, rgba(249,115,22,0.10), transparent 58%), radial-gradient(400px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                <div style={menuIconStyle("orange")}>⏰</div>

                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                      letterSpacing: -0.3,
                      color: "rgba(15,23,42,0.96)",
                    }}
                  >
                    Turno
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      opacity: 0.76,
                      lineHeight: 1.5,
                      color: "rgba(15,23,42,0.88)",
                    }}
                  >
                    Inserisci lavoro, ferie o riposo in modo diretto.
                  </div>
                </div>
              </div>
            </button>
          </div>
        ) : aggiungiSezione === "movimenti" ? (
          <div
            style={{
              ...ui.card,
              padding: 22,
              border: "1px solid rgba(16,185,129,0.18)",
              background:
                "linear-gradient(180deg, rgba(16,185,129,0.12), rgba(255,255,255,0.96))",
              boxShadow: "0 18px 40px rgba(16,185,129,0.10)",
              display: "grid",
              gap: 16,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(640px 220px at 0% 0%, rgba(16,185,129,0.10), transparent 58%), radial-gradient(480px 180px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 16 }}>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 1000,
                    letterSpacing: -0.3,
                    color: "rgba(15,23,42,0.96)",
                  }}
                >
                  Area movimenti economici
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "rgba(15,23,42,0.72)",
                    lineHeight: 1.5,
                  }}
                >
                  Inserisci entrate e uscite con categorie, importi e note. Le categorie personalizzate restano salvate.
                </div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <button
                  type="button"
                  title="Apri o chiudi form entrata"
                  onClick={() => setMovimentoAperto((prev) => (prev === "entrata" ? null : "entrata"))}
                  style={{
                    border: "none",
                    borderRadius: 22,
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    cursor: "pointer",
                    color: "white",
                    fontWeight: 1000,
                    fontSize: 18,
                    background:
                      "linear-gradient(180deg, rgba(34,197,94,0.98), rgba(22,163,74,0.95))",
                    boxShadow: "0 18px 34px rgba(34,197,94,0.20)",
                    transition: "transform .18s ease, box-shadow .18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 24px 40px rgba(34,197,94,0.24)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 18px 34px rgba(34,197,94,0.20)";
                  }}
                >
                  <span>Entrata</span>
                  <span style={{ fontSize: 22 }}>{movimentoAperto === "entrata" ? "−" : "+"}</span>
                </button>

                {movimentoAperto === "entrata" && (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.18)",
                      border: "1px solid rgba(16,185,129,0.16)",
                      borderRadius: 22,
                      padding: 16,
                      display: "grid",
                      gap: 12,
                      boxShadow: "0 10px 28px rgba(16,185,129,0.10)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Data</label>
                      <input
                        type="date"
                        value={nuovaEntrataData}
                        onChange={(e) => setNuovaEntrataData(e.target.value)}
                        style={inputLight(false)}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Categoria</label>
                      <select
                        value={categoriaEntrata}
                        onChange={(e) => setCategoriaEntrata(e.target.value)}
                        style={inputLight(false)}
                      >
                        <option value="">Seleziona categoria</option>
                        {categorieEntrataBase.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        {categorieEntrataCustom.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__altro__">Altro...</option>
                      </select>
                    </div>

                    {categoriaEntrata === "__altro__" && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>
                          Nuova categoria personalizzata
                        </label>
                        <input
                          type="text"
                          value={nuovaCategoriaEntrata}
                          onChange={(e) => setNuovaCategoriaEntrata(e.target.value)}
                          placeholder="Scrivi una nuova categoria"
                          style={inputLight(false)}
                        />
                      </div>
                    )}

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>
                        Nota facoltativa
                      </label>
                      <input
                        type="text"
                        value={nuovaEntrataDesc}
                        onChange={(e) => setNuovaEntrataDesc(e.target.value)}
                        placeholder="Es. bonus marzo, regalo, rimborso..."
                        style={inputLight(false)}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Importo</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={nuovaEntrataImporto}
                        onChange={(e) => setNuovaEntrataImporto(e.target.value)}
                        placeholder="0,00"
                        style={inputLight(false)}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={aggiungiEntrataExtra}
                      style={{
                        border: "none",
                        borderRadius: 18,
                        padding: "14px 16px",
                        fontSize: 15,
                        fontWeight: 1000,
                        cursor: "pointer",
                        color: "white",
                        background:
                          "linear-gradient(180deg, rgba(34,197,94,0.98), rgba(22,163,74,0.95))",
                        boxShadow: "0 18px 34px rgba(34,197,94,0.20)",
                      }}
                    >
                      + Aggiungi Entrata
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  title="Apri o chiudi form uscita"
                  onClick={() => setMovimentoAperto((prev) => (prev === "uscita" ? null : "uscita"))}
                  style={{
                    border: "none",
                    borderRadius: 22,
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    cursor: "pointer",
                    color: "white",
                    fontWeight: 1000,
                    fontSize: 18,
                    background:
                      "linear-gradient(180deg, rgba(239,68,68,0.98), rgba(220,38,38,0.95))",
                    boxShadow: "0 18px 34px rgba(239,68,68,0.20)",
                    transition: "transform .18s ease, box-shadow .18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 24px 40px rgba(239,68,68,0.24)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 18px 34px rgba(239,68,68,0.20)";
                  }}
                >
                  <span>Uscita</span>
                  <span style={{ fontSize: 22 }}>{movimentoAperto === "uscita" ? "−" : "+"}</span>
                </button>

                {movimentoAperto === "uscita" && (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.18)",
                      border: "1px solid rgba(239,68,68,0.16)",
                      borderRadius: 22,
                      padding: 16,
                      display: "grid",
                      gap: 12,
                      boxShadow: "0 10px 28px rgba(239,68,68,0.10)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Data</label>
                      <input
                        type="date"
                        value={nuovaUscitaData}
                        onChange={(e) => setNuovaUscitaData(e.target.value)}
                        style={inputLight(false)}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Categoria</label>
                      <select
                        value={categoriaUscita}
                        onChange={(e) => setCategoriaUscita(e.target.value)}
                        style={inputLight(false)}
                      >
                        <option value="">Seleziona categoria</option>
                        {categorieUscitaBase.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        {categorieUscitaCustom.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__altro__">Altro...</option>
                      </select>
                    </div>

                    {categoriaUscita === "__altro__" && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>
                          Nuova categoria personalizzata
                        </label>
                        <input
                          type="text"
                          value={nuovaCategoriaUscita}
                          onChange={(e) => setNuovaCategoriaUscita(e.target.value)}
                          placeholder="Scrivi una nuova categoria"
                          style={inputLight(false)}
                        />
                      </div>
                    )}

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>
                        Descrizione breve
                      </label>
                      <input
                        type="text"
                        value={nuovaUscitaDesc}
                        onChange={(e) => setNuovaUscitaDesc(e.target.value)}
                        placeholder="Es. supermercato, pieno auto..."
                        style={inputLight(false)}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>Importo</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={nuovaUscitaImporto}
                        onChange={(e) => setNuovaUscitaImporto(e.target.value)}
                        placeholder="0,00"
                        style={inputLight(false)}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.78)" }}>
                        Nota aggiuntiva
                      </label>
                      <input
                        type="text"
                        value={nuovaUscitaNota}
                        onChange={(e) => setNuovaUscitaNota(e.target.value)}
                        placeholder="Dettaglio extra facoltativo"
                        style={inputLight(false)}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={aggiungiUscitaExtra}
                      style={{
                        border: "none",
                        borderRadius: 18,
                        padding: "14px 16px",
                        fontSize: 15,
                        fontWeight: 1000,
                        cursor: "pointer",
                        color: "white",
                        background:
                          "linear-gradient(180deg, rgba(239,68,68,0.98), rgba(220,38,38,0.95))",
                        boxShadow: "0 18px 34px rgba(239,68,68,0.20)",
                      }}
                    >
                      + Aggiungi Uscita
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.05fr) minmax(280px, 0.95fr)",
              gap: 16,
            }}
            className="remember-grid-2"
          >
           
           
           
           
           
           
           
            <div
              style={{
                ...ui.card,
                padding: 22,
                border: "1px solid rgba(79,70,229,0.18)",
                background:
                  "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(255,255,255,0.96))",
                boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
                display: "grid",
                gap: 16,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(620px 220px at 0% 0%, rgba(79,70,229,0.10), transparent 58%), radial-gradient(420px 180px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                      letterSpacing: -0.3,
                      color: "rgba(15,23,42,0.96)",
                    }}
                  >
                    {idInModifica ? "Modifica evento" : "Nuovo evento"}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1.5,
                      color: "rgba(15,23,42,0.70)",
                    }}
                  >
                    Inserisci un evento semplice con descrizione, data, ora e promemoria personalizzabili.
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.72)" }}>
                      Evento
                    </label>
                    <input
                      type="text"
                      value={titolo}
                      onChange={(e) => setTitolo(e.target.value)}
                      placeholder="Es. Dentista, bollo, riunione, compleanno..."
                      style={inputLight(false)}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.72)" }}>
                        Data
                      </label>
                      <input
                        type="date"
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        style={inputLight(false)}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.72)" }}>
                        Ora
                      </label>
                      <input
                        type="time"
                        value={ora}
                        onChange={(e) => setOra(e.target.value)}
                        style={inputLight(false)}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: 14,
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.52)",
                      border: "1px solid rgba(79,70,229,0.14)",
                      boxShadow: "0 10px 24px rgba(79,70,229,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 950,
                        color: "rgba(15,23,42,0.90)",
                      }}
                    >
                      Promemoria notifiche
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        { label: "15 min", value: 15 },
                        { label: "30 min", value: 30 },
                        { label: "1 ora", value: 60 },
                        { label: "2 ore", value: 120 },
                        { label: "6 ore", value: 360 },
                        { label: "24 ore", value: 1440 },
                      ].map((opt) => {
                        const attiva = notificheMinutiPrima.includes(opt.value);

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setNotificheMinutiPrima((prev) =>
                                prev.includes(opt.value)
                                  ? prev.filter((x) => x !== opt.value)
                                  : [...prev, opt.value].sort((a, b) => b - a)
                              )
                            }
                            style={{
                              padding: "10px 12px",
                              borderRadius: 999,
                              border: attiva
                                ? "1px solid rgba(79,70,229,0.30)"
                                : "1px solid rgba(148,163,184,0.20)",
                              background: attiva
                                ? "linear-gradient(180deg, rgba(79,70,229,0.18), rgba(124,58,237,0.12))"
                                : "rgba(255,255,255,0.88)",
                              color: attiva
                                ? "rgba(67,56,202,0.98)"
                                : "rgba(15,23,42,0.82)",
                              fontSize: 12,
                              fontWeight: 900,
                              cursor: "pointer",
                              boxShadow: attiva
                                ? "0 10px 20px rgba(79,70,229,0.10)"
                                : "0 6px 12px rgba(15,23,42,0.04)",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 10,
                        alignItems: "end",
                      }}
                    >
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.72)" }}>
                          Ore personalizzate
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.5"
                          value={customNotificaOre}
                          onChange={(e) => setCustomNotificaOre(e.target.value)}
                          placeholder="Es. 3 oppure 1.5"
                          style={inputLight(false)}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const raw = customNotificaOre.trim();
                          if (!raw) return;

                          const parsedOre = Number(raw.replace(",", "."));
                          if (!Number.isFinite(parsedOre) || parsedOre <= 0) {
                            alert("Inserisci ore personalizzate valide.");
                            return;
                          }

                          const minuti = Math.round(parsedOre * 60);
                          if (minuti <= 0) {
                            alert("Inserisci ore personalizzate valide.");
                            return;
                          }

                          setNotificheMinutiPrima((prev) =>
                            Array.from(new Set([...prev, minuti])).sort((a, b) => b - a)
                          );
                          setCustomNotificaOre("");
                        }}
                        style={{
                          border: "none",
                          borderRadius: 16,
                          padding: "14px 14px",
                          fontSize: 13,
                          fontWeight: 1000,
                          cursor: "pointer",
                          color: "white",
                          background:
                            "linear-gradient(180deg, rgba(79,70,229,0.98), rgba(124,58,237,0.95))",
                          boxShadow: "0 14px 26px rgba(79,70,229,0.18)",
                          minWidth: 110,
                        }}
                      >
                        Aggiungi
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.72)" }}>
                        Promemoria selezionati
                      </div>

                      {notificheMinutiPrima.length === 0 ? (
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px dashed rgba(148,163,184,0.28)",
                            background: "rgba(255,255,255,0.62)",
                            fontSize: 12,
                            fontWeight: 800,
                            color: "rgba(15,23,42,0.62)",
                          }}
                        >
                          Nessun promemoria selezionato.
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {notificheMinutiPrima
                            .slice()
                            .sort((a, b) => b - a)
                            .map((minuti) => {
                              const label =
                                minuti % 1440 === 0
                                  ? `${minuti / 1440} g`
                                  : minuti % 60 === 0
                                  ? `${minuti / 60} h`
                                  : `${minuti} min`;

                              return (
                                <button
                                  key={minuti}
                                  type="button"
                                  onClick={() =>
                                    setNotificheMinutiPrima((prev) => prev.filter((x) => x !== minuti))
                                  }
                                  style={{
                                    padding: "9px 12px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(79,70,229,0.20)",
                                    background:
                                      "linear-gradient(180deg, rgba(79,70,229,0.14), rgba(124,58,237,0.10))",
                                    color: "rgba(67,56,202,0.98)",
                                    fontSize: 12,
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                  title="Tocca per rimuovere"
                                >
                                  {label} ✕
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={chiudiForm}
                      style={{
                        border: "none",
                        borderRadius: 18,
                        padding: "14px 16px",
                        fontSize: 15,
                        fontWeight: 1000,
                        cursor: "pointer",
                        color: "rgba(15,23,42,0.88)",
                        background: "rgba(255,255,255,0.90)",
                        boxShadow: "0 14px 28px rgba(15,23,42,0.08)",
                      }}
                    >
                      Annulla
                    </button>

                    <button
                      type="button"
                      onClick={salva}
                      style={{
                        border: "none",
                        borderRadius: 18,
                        padding: "14px 16px",
                        fontSize: 15,
                        fontWeight: 1000,
                        cursor: "pointer",
                        color: "white",
                        background:
                          "linear-gradient(180deg, rgba(79,70,229,0.98), rgba(124,58,237,0.95))",
                        boxShadow: "0 18px 34px rgba(79,70,229,0.20)",
                      }}
                    >
                      {idInModifica ? "Salva modifiche" : "+ Aggiungi"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                ...ui.card,
                padding: 22,
                border: "1px solid rgba(79,70,229,0.18)",
                background:
                  "linear-gradient(180deg, rgba(79,70,229,0.10), rgba(255,255,255,0.96))",
                boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
                display: "grid",
                gap: 14,
                alignContent: "start",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(500px 200px at 0% 0%, rgba(79,70,229,0.10), transparent 58%), radial-gradient(360px 160px at 100% 100%, rgba(255,255,255,0.16), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: 14 }}>
                <div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 1000,
                      letterSpacing: -0.2,
                      color: "rgba(15,23,42,0.96)",
                    }}
                  >
                    Eventi prossimi
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      opacity: 0.72,
                      color: "rgba(15,23,42,0.88)",
                    }}
                  >
                    I prossimi eventi salvati nel calendario.
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {eventiProssimiAggiungi.length === 0 ? (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(15,23,42,0.08)",
                        background: "rgba(255,255,255,0.72)",
                        fontSize: 13,
                        fontWeight: 800,
                        opacity: 0.65,
                        color: "rgba(15,23,42,0.86)",
                      }}
                    >
                      Nessun evento imminente.
                    </div>
                  ) : (
                    eventiProssimiAggiungi.map((ev) => {
                      const giorni = giorniMancanti(ev.data);

                      return (
                        <div
                          key={ev.id}
                          style={{
                            padding: 14,
                            borderRadius: 20,
                            border: "1px solid rgba(79,70,229,0.14)",
                            background:
                              "linear-gradient(180deg, rgba(79,70,229,0.08), rgba(79,70,229,0.03))",
                            display: "grid",
                            gap: 8,
                            boxShadow: "0 8px 18px rgba(79,70,229,0.06)",
                          }}
                        >
                          <div style={{ fontSize: 15, fontWeight: 950, color: "rgba(15,23,42,0.96)" }}>
                            {ev.titolo}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 850,
                              opacity: 0.74,
                              color: "rgba(15,23,42,0.86)",
                            }}
                          >
                            {formattaDataBreve(ev.data)} • {ev.ora}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={styleBadgeScadenza(giorni, false)}>
                              {labelGiorni(giorni)}
                            </span>

                            <button
                              type="button"
                              data-chip="1"
                              onClick={() => apriModifica(ev)}
                              style={chip(false)}
                            >
                              Modifica
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
})()}




























{false && renderAreaControllo()}

        
       






{pagina === "account" && (
  <div style={{ minHeight: "70vh", display: "grid", placeItems: "start center", padding: 16 }}>
    <div style={{ width: "min(1060px, 100%)", display: "grid", gap: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
        className="remember-grid-2"
      >
        <div
          style={{
            ...ui.card,
            padding: 22,
            border: "1px solid rgba(79,70,229,0.18)",
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(255,255,255,0.96))",
            boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
            display: "grid",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 1000,
                letterSpacing: -0.3,
                color: "rgba(15,23,42,0.96)",
              }}
            >
              Profilo attuale
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "rgba(15,23,42,0.72)",
                lineHeight: 1.5,
              }}
            >
              Base locale attuale dell’utente attivo.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              padding: 16,
              borderRadius: 20,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "rgba(255,255,255,0.78)",
              boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                Nome utente
              </div>
              <div style={{ fontSize: 18, fontWeight: 1000, color: "rgba(15,23,42,0.96)" }}>
                {currentUser.nome || "Utente"}
              </div>
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                ID locale attuale
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "rgba(67,56,202,0.94)",
                  wordBreak: "break-all",
                }}
              >
                {currentUserId || "Nessun ID attivo"}
              </div>
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                Stato account vero
              </div>
              <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(180,83,9,0.96)" }}>
                Non ancora collegato
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              data-chip="1"
              onClick={() => setPagina("home")}
              style={chip(false)}
            >
              Torna a Home
            </button>
          </div>
        </div>

        <div
          style={{
            ...ui.card,
            padding: 22,
            border: "1px solid rgba(14,165,233,0.18)",
            background:
              "linear-gradient(180deg, rgba(14,165,233,0.10), rgba(255,255,255,0.96))",
            boxShadow: "0 18px 40px rgba(14,165,233,0.10)",
            display: "grid",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 1000,
                letterSpacing: -0.3,
                color: "rgba(15,23,42,0.96)",
              }}
            >
              Stato app personale
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "rgba(15,23,42,0.72)",
                lineHeight: 1.5,
              }}
            >
              Mini riepilogo locale dell’utente attivo, utile come base per il futuro profilo cloud.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 14,
                borderRadius: 18,
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                Eventi
              </div>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "rgba(15,23,42,0.96)" }}>
                {voci.length}
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                Turni
              </div>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "rgba(15,23,42,0.96)" }}>
                {turni.length}
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                Note
              </div>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "rgba(15,23,42,0.96)" }}>
                {note.length}
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.62)" }}>
                Mesi finanza
              </div>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "rgba(15,23,42,0.96)" }}>
                {Object.keys(incassi).length}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 20,
              border: "1px solid rgba(14,165,233,0.16)",
              background:
                "linear-gradient(180deg, rgba(14,165,233,0.08), rgba(255,255,255,0.78))",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(15,23,42,0.92)" }}>
              Prossimo step previsto
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1.6,
                color: "rgba(15,23,42,0.76)",
              }}
            >
              Collegare qui il vero account, ma in modo isolato e sicuro, senza più toccare il cuore dell’app fino a quando non è tutto stabile.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)}














       {pagina === "archivio" && (
  <>
    <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 14, display: "grid", gap: 14 }}>
      <div
        style={{
          ...ui.card,
          padding: 18,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>Archivio Generale</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
              Filtra mese e consulta storico eventi, soldi e turni
            </div>
          </div>

          <input
            type="month"
            value={`${meseCorrente.getFullYear()}-${String(meseCorrente.getMonth() + 1).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (!y || !m) return;
              setMeseCorrente(new Date(y, m - 1, 1));
            }}
            style={{
              ...inputLight(false),
              width: "auto",
              minWidth: 180,
              maxWidth: "100%",
              fontWeight: 900,
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 18,
              border: "1px solid rgba(16,185,129,0.12)",
              background: "linear-gradient(180deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate mese</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
              {entrateArchivioMese.toLocaleString("it-IT")} €
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 18,
              border: "1px solid rgba(239,68,68,0.12)",
              background: "linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Uscite mese</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
              {usciteArchivioMese.toLocaleString("it-IT")} €
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 18,
              border: "1px solid rgba(59,130,246,0.12)",
              background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03))",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Saldo mese</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 20,
                fontWeight: 1000,
                color: saldoArchivioMese >= 0 ? "rgba(30,64,175,0.96)" : "rgba(185,28,28,0.96)",
              }}
            >
              {saldoArchivioMese.toLocaleString("it-IT")} €
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 18,
              border: "1px solid rgba(124,58,237,0.12)",
              background: "linear-gradient(180deg, rgba(124,58,237,0.08), rgba(124,58,237,0.03))",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore mese</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
              {formatNumeroOre(oreArchivioMese)} h
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
        }}
        className="remember-grid-2"
      >
        <div style={{ ...ui.card, padding: 18 }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Riepilogo anno</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            Totali annuali dell’anno selezionato
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(16,185,129,0.12)",
                background: "linear-gradient(180deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate anno</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                {entrateArchivioAnno.toLocaleString("it-IT")} €
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(239,68,68,0.12)",
                background: "linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Uscite anno</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                {usciteArchivioAnno.toLocaleString("it-IT")} €
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(59,130,246,0.12)",
                background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Saldo anno</div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 20,
                  fontWeight: 1000,
                  color: saldoArchivioAnno >= 0 ? "rgba(30,64,175,0.96)" : "rgba(185,28,28,0.96)",
                }}
              >
                {saldoArchivioAnno.toLocaleString("it-IT")} €
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...ui.card, padding: 18 }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Statistiche turni mese</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            Distribuzione sigle turni del mese selezionato
          </div>

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {(["N", "M", "P", "S", "R", "T"] as const).map((sigla) => (
              <div
                key={sigla}
                style={{
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid rgba(15,23,42,0.08)",
                  background: "rgba(255,255,255,0.76)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>{sigla}</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                  {turniStatsArchivioMese[sigla]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...ui.card, padding: 18 }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Storico del mese</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
          Eventi, entrate, uscite e voci registrate nel mese selezionato
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {eventiArchivioMese.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "rgba(255,255,255,0.72)",
                fontSize: 13,
                fontWeight: 800,
                opacity: 0.65,
              }}
            >
              Nessun elemento registrato nel mese selezionato.
            </div>
          ) : (
            eventiArchivioMese.map((ev) => {
              const isEntrata = ev.movimento === "entrata";
              const isVoce = ev.origine === "voce";
              const isNotaLibera = ev.tipo === "nota" && ev.nota.startsWith("[NOTA_LIBERA_MESE]");

              return (
                <div
                  key={`${ev.origine}_${ev.id}`}
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {isVoce ? (
                        badgeTipo(ev.tipo as Voce["tipo"])
                      ) : isEntrata ? (
                        badgeMov("entrata")
                      ) : (
                        badgeMov("uscita")
                      )}

                      {ev.urgente && badgeUrgente()}
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 950 }}>
                    {ev.movimento === "entrata" || ev.movimento === "uscita"
                      ? estraiCategoriaMovimento(ev.titolo)
                      : ev.titolo}
                  </div>

                    <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                      {isNotaLibera ? "Nota libera del mese" : `${formattaDataBreve(ev.data)} • ${ev.ora}`}
                    </div>


                    {(ev.movimento === "entrata" || ev.movimento === "uscita") &&
                    estraiDettaglioMovimento(ev.titolo) && (
                      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
                        {estraiDettaglioMovimento(ev.titolo)}
                      </div>
                    )}

                    {ev.nota && (
                      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
                        {ev.nota.replace(/^\[NOTA_LIBERA_MESE\]\s*/i, "")}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 8, justifyItems: "end", minWidth: 96 }}>
                    {ev.importo !== null && (
                      <div
                        style={{
                          padding: "7px 11px",
                          borderRadius: 999,
                          border: isEntrata
                            ? "2px solid rgba(16,185,129,0.28)"
                            : "2px solid rgba(239,68,68,0.28)",
                          background: isEntrata ? "rgba(236,253,245,0.96)" : "rgba(254,242,242,0.96)",
                          fontSize: 12,
                          fontWeight: 950,
                          color: isEntrata ? "rgba(5,150,105,0.96)" : "rgba(185,28,28,0.96)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ev.importo.toLocaleString("it-IT")} €
                      </div>
                    )}

                    {(ev.tipo === "scadenza" || ev.tipo === "appuntamento") && (
                      <span style={styleBadgeScadenza(giorniMancanti(ev.data), ev.urgente)}>
                        {ev.urgente ? "URGENTE" : labelGiorni(giorniMancanti(ev.data))}
                      </span>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {isVoce && (
                        <button
                          data-chip="1"
                          onClick={() => {
                            const voceOriginale = voci.find((x) => x.id === ev.id);
                            if (!voceOriginale) return;
                            apriModifica(voceOriginale);
                          }}
                          style={chip(false)}
                        >
                          Modifica
                        </button>
                      )}

                      <button
                        data-chip="1"
                        onClick={() => {
                          if (ev.origine === "voce") elimina(ev.id);
                          else if (ev.origine === "entrata") eliminaEntrataExtra(ev.id);
                          else if (ev.origine === "uscita-extra") eliminaUscitaExtra(ev.id);
                        }}
                        style={{
                          ...chip(false),
                          border: "1px solid rgba(239,68,68,0.22)",
                          color: "rgba(185,28,28,0.96)",
                          background: "rgba(254,242,242,0.92)",
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ ...ui.card, padding: 18 }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Turni del mese</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
          Elenco turni registrati nel mese selezionato
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {turniArchivioMese.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "rgba(255,255,255,0.72)",
                fontSize: 13,
                fontWeight: 800,
                opacity: 0.65,
              }}
            >
              Nessun turno registrato nel mese selezionato.
            </div>
          ) : (
            turniArchivioMese
              .slice()
              .sort((a, b) => a.data.localeCompare(b.data) || a.inizio.localeCompare(b.inizio))
              .map((t) => {
                const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
                const descr = descrizioneTurnoBreve(t.inizio, t.fine, t.note);
                const isRiposo = sigla === "R";

                return (
                  <div
                    key={t.id}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 12,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 950,
                            color: "rgba(255,255,255,0.98)",
                            background:
                              sigla === "R"
                                ? "linear-gradient(180deg, rgba(107,114,128,0.96), rgba(75,85,99,0.92))"
                                : sigla === "N"
                                ? "linear-gradient(180deg, rgba(67,56,202,0.96), rgba(49,46,129,0.92))"
                                : sigla === "M"
                                ? "linear-gradient(180deg, rgba(245,158,11,0.96), rgba(217,119,6,0.92))"
                                : sigla === "P"
                                ? "linear-gradient(180deg, rgba(249,115,22,0.96), rgba(234,88,12,0.92))"
                                : sigla === "S"
                                ? "linear-gradient(180deg, rgba(168,85,247,0.96), rgba(126,34,206,0.92))"
                                : "linear-gradient(180deg, rgba(59,130,246,0.96), rgba(37,99,235,0.92))",
                          }}
                        >
                          {sigla}
                        </span>

                        <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                          {formattaDataBreve(t.data)}
                        </div>
                      </div>

                      <div style={{ fontSize: 15, fontWeight: 950 }}>
                        {descr}
                        {!isRiposo ? ` • ${t.inizio} - ${t.fine}` : ""}
                      </div>

                      <div
                            style={{
                              fontSize: 12,
                              fontWeight: 850,
                              color: "rgba(15,23,42,0.72)",
                            }}
                          >
                        {isRiposo
                          ? "Giornata di riposo"
                          : `Ord: ${formatNumeroOre(t.oreOrdinarie)}h • Straord: ${formatNumeroOre(
                              t.oreStraordinarie
                            )}h • Tot: ${formatNumeroOre(t.oreOrdinarie + t.oreStraordinarie)}h`}
                      </div>
                    </div>

                    <button
                      data-chip="1"
                      onClick={() => eliminaTurno(t.id)}
                      style={{
                        ...chip(false),
                        border: "1px solid rgba(239,68,68,0.22)",
                        color: "rgba(185,28,28,0.96)",
                        background: "rgba(254,242,242,0.92)",
                      }}
                    >
                      Elimina
                    </button>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  </>
)}
     
     












  

    

{mostraTurnoForm && (
  <div
    style={sx.overlay}
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) chiudiTurnoForm();
    }}
  >
    <div
      style={{
        ...sx.modal,
        maxWidth: 780,
        width: "min(780px, 100%)",
        borderRadius: 28,
        border: "1px solid rgba(255,255,255,0.58)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,250,252,0.94))",
        boxShadow: "0 32px 90px rgba(15,23,42,0.20)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          ...sx.header,
          paddingBottom: 14,
          borderBottom: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: -0.3, color: "rgba(15,23,42,0.96)" }}>
            {turnoIdInModifica ? "Modifica turno" : "Nuovo turno"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 800, color: "rgba(15,23,42,0.76)" }}>
            Rapido = inserimento essenziale. Avanzato = preview, note e dettagli extra.
          </div>
        </div>

        <button
          type="button"
          data-chip="1"
          onClick={chiudiTurnoForm}
          style={sx.closeBtn}
          title="Chiudi"
        >
          ✕
        </button>
      </div>

      <div style={{ ...sx.body, paddingTop: 18 }}>
        <div style={{ ...sx.content, display: "grid", gap: 18 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              data-chip="1"
              onClick={() => setTurnoAvanzato(false)}
              style={chip(!turnoAvanzato)}
            >
              ⚡ Rapido
            </button>

            <button
              type="button"
              data-chip="1"
              onClick={() => setTurnoAvanzato(true)}
              style={chip(turnoAvanzato)}
            >
              ⚙️ Avanzato
            </button>
          </div>

          {turnoAvanzato && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(79,70,229,0.12)",
                background: "linear-gradient(180deg, rgba(238,242,255,0.96), rgba(245,243,255,0.92))",
                boxShadow: "0 10px 24px rgba(79,70,229,0.05)",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(55,48,163,0.96)" }}>
                Preview settimana
              </div>

              <MiniCalendarioSettimanaTurni
                turni={turni}
                onEditTurno={apriModificaTurno}
              />
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
              alignItems: "end",
            }}
          >
            <div>
              <div style={sx.sectionLabel}>Data</div>
              <input
                type="date"
                value={turnoData}
                onChange={(e) => {
                  setTurnoData(e.target.value);
                  if (turnoModalitaPeriodo === "singolo") setTurnoDataFine(e.target.value);
                }}
                style={inputLight(false)}
              />
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 18,
                border: "1px solid rgba(79,70,229,0.14)",
                background: "linear-gradient(180deg, rgba(79,70,229,0.08), rgba(124,58,237,0.04))",
                fontSize: 12,
                fontWeight: 850,
                color: "rgba(55,48,163,0.96)",
                lineHeight: 1.45,
                boxSizing: "border-box",
                maxWidth: "100%",
                overflowWrap: "break-word",
              }}
            >
              Inserimento rapido e coerente: lavoro, ferie, riposi e assenze. I riepiloghi restano in Consulta → Turni.
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 22,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "rgba(255,255,255,0.82)",
              boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
              display: "grid",
              gap: 14,
            }}
          >
            <div style={sx.sectionLabel}>Tipo</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 10,
              }}
            >
              {[
                { key: "lavoro", label: "Lavoro" },
                { key: "ferie", label: "Ferie" },
                { key: "riposo", label: "Riposo" },
                { key: "assenza", label: "Assenza" },
              ].map((item) => {
                const active = turnoTipo === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    data-chip="1"
                    onClick={() => {
                      const tipo = item.key as "lavoro" | "ferie" | "riposo" | "assenza";
                      setTurnoTipo(tipo);

                      if (tipo === "lavoro") {
                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
                        setTurnoPausaMinuti("0");
                        setTurnoOreOrd("8");
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                        setTurnoTipoAssenza("malattia");
                      }

                      if (tipo === "ferie") {
                        const oreDefault =
                          ferieTotaliGiorniBase > 0
                            ? formatNumeroCompatto(ferieTotaliOreBase / ferieTotaliGiorniBase)
                            : "8";

                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoModoOreFerie("giorni");
                        setTurnoQuantitaFerie("");
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
                        setTurnoPausaMinuti("0");
                        setTurnoOreOrd(oreDefault);
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                        setTurnoOrePerGiornoFerie(oreDefault);
                      }

                      if (tipo === "riposo") {
                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoQuantitaFerie("");
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
                        setTurnoPausaMinuti("0");
                        setTurnoOreOrd("");
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                        setTurnoTipoAssenza("malattia");
                      }

                      if (tipo === "assenza") {
                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoQuantitaFerie("");
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
                        setTurnoPausaMinuti("0");
                        setTurnoOreOrd("");
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                        setTurnoTipoAssenza("malattia");
                      }
                    }}
                    style={{
                      padding: "14px 12px",
                      borderRadius: 18,
                      border: active
                        ? "2px solid rgba(79,70,229,0.38)"
                        : "1px solid rgba(15,23,42,0.10)",
                      background: active
                        ? "linear-gradient(180deg, rgba(224,231,255,0.96), rgba(237,233,254,0.94))"
                        : "rgba(255,255,255,0.96)",
                      boxShadow: active
                        ? "0 10px 24px rgba(79,70,229,0.12)"
                        : "0 6px 18px rgba(15,23,42,0.04)",
                      fontWeight: 950,
                      fontSize: 14,
                      color: "rgba(15,23,42,0.94)",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(turnoTipo === "ferie" || turnoTipo === "assenza" || turnoTipo === "riposo") && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "rgba(255,255,255,0.82)",
                boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                display: "grid",
                gap: 14,
              }}
            >
              <div style={sx.sectionLabel}>Periodo</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  { key: "singolo", label: "Giorno singolo" },
                  { key: "intervallo", label: "Dal / Al" },
                ].map((item) => {
                  const active = turnoModalitaPeriodo === item.key;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-chip="1"
                      onClick={() => {
                        const val = item.key as "singolo" | "intervallo";
                        setTurnoModalitaPeriodo(val);
                        if (val === "singolo") setTurnoDataFine(turnoData);
                      }}
                      style={{
                        padding: "14px 12px",
                        borderRadius: 18,
                        border: active
                          ? "2px solid rgba(79,70,229,0.38)"
                          : "1px solid rgba(15,23,42,0.10)",
                        background: active
                          ? "linear-gradient(180deg, rgba(224,231,255,0.96), rgba(237,233,254,0.94))"
                          : "rgba(255,255,255,0.96)",
                        boxShadow: active
                          ? "0 10px 24px rgba(79,70,229,0.12)"
                          : "0 6px 18px rgba(15,23,42,0.04)",
                        fontWeight: 950,
                        fontSize: 14,
                        color: "rgba(15,23,42,0.94)",
                        cursor: "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {turnoModalitaPeriodo === "intervallo" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={sx.sectionLabel}>Dal</div>
                    <input
                      type="date"
                      value={turnoData}
                      onChange={(e) => setTurnoData(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>

                  <div>
                    <div style={sx.sectionLabel}>Al</div>
                    <input
                      type="date"
                      value={turnoDataFine}
                      onChange={(e) => setTurnoDataFine(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {turnoTipo === "lavoro" && (
            <>
              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(15,23,42,0.08)",
                  background: "rgba(255,255,255,0.82)",
                  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                  display: "grid",
                  gap: 14,
                }}
              >
                <div style={sx.sectionLabel}>Modalità lavoro</div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  {presetTurni.map((p) => {
                    const active = turnoPreset === p && !turnoManuale;
                    return (
                      <button
                        key={p}
                        type="button"
                        data-chip="1"
                        onClick={() => applicaPresetTurno(p)}
                        style={{
                          padding: "12px 10px",
                          borderRadius: 16,
                          border: active
                            ? "2px solid rgba(16,185,129,0.36)"
                            : "1px solid rgba(15,23,42,0.10)",
                          background: active
                            ? "linear-gradient(180deg, rgba(220,252,231,0.96), rgba(236,253,245,0.94))"
                            : "rgba(255,255,255,0.96)",
                          boxShadow: active
                            ? "0 10px 24px rgba(16,185,129,0.10)"
                            : "0 6px 18px rgba(15,23,42,0.04)",
                          fontWeight: 950,
                          fontSize: 13,
                          color: "rgba(15,23,42,0.94)",
                          cursor: "pointer",
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <button
                    type="button"
                    data-chip="1"
                    onClick={() => {
                      setTurnoManuale((prev) => {
                        const next = !prev;
                        if (next) {
                          setTurnoPreset("");
                          aggiornaOreLavoroAutomatiche(turnoInizio, turnoFine, turnoPausaMinuti);
                        }
                        return next;
                      });
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 999,
                      border: turnoManuale
                        ? "2px solid rgba(249,115,22,0.34)"
                        : "1px solid rgba(15,23,42,0.10)",
                      background: turnoManuale
                        ? "linear-gradient(180deg, rgba(255,237,213,0.96), rgba(255,247,237,0.94))"
                        : "rgba(255,255,255,0.96)",
                      fontWeight: 950,
                      color: "rgba(15,23,42,0.94)",
                      cursor: "pointer",
                    }}
                  >
                    {turnoManuale ? "Manuale attivo" : "Passa a manuale"}
                  </button>
                </div>
              </div>

              {(turnoManuale || !turnoPreset || turnoAvanzato) && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(255,255,255,0.82)",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={sx.sectionLabel}>Dettaglio orario</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={sx.sectionLabel}>Inizio</div>
                      <input
                        type="time"
                        value={turnoInizio}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTurnoInizio(val);
                          aggiornaOreLavoroAutomatiche(val, turnoFine, turnoPausaMinuti);
                        }}
                        style={inputLight(false)}
                      />
                    </div>

                    <div>
                      <div style={sx.sectionLabel}>Fine</div>
                      <input
                        type="time"
                        value={turnoFine}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTurnoFine(val);
                          aggiornaOreLavoroAutomatiche(turnoInizio, val, turnoPausaMinuti);
                        }}
                        style={inputLight(false)}
                      />
                    </div>

                    <div>
                      <div style={sx.sectionLabel}>Pausa da scalare (minuti)</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={turnoPausaMinuti}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTurnoPausaMinuti(val);
                          aggiornaOreLavoroAutomatiche(turnoInizio, turnoFine, val);
                        }}
                        placeholder="Es. 60"
                        style={inputLight(false)}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 22,
                        border: "1px solid rgba(16,185,129,0.12)",
                        background: "linear-gradient(180deg, rgba(236,253,245,0.96), rgba(240,253,250,0.92))",
                        boxShadow: "0 10px 24px rgba(16,185,129,0.05)",
                      }}
                    >
                      <div style={sx.sectionLabel}>Ore ordinarie effettive</div>
                      <input
                        value={turnoOreOrd}
                        readOnly
                        style={{
                          ...inputLight(false),
                          background: "rgba(241,245,249,0.95)",
                          color: "rgba(15,23,42,0.95)",
                          fontWeight: 950,
                          cursor: "default",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        padding: 16,
                        borderRadius: 22,
                        border: "1px solid rgba(249,115,22,0.12)",
                        background: "linear-gradient(180deg, rgba(255,247,237,0.96), rgba(255,251,235,0.92))",
                        boxShadow: "0 10px 24px rgba(249,115,22,0.05)",
                      }}
                    >
                      <div style={sx.sectionLabel}>Ore straordinarie</div>
                      <input
                        value={turnoOreStraord}
                        onChange={(e) => setTurnoOreStraord(e.target.value)}
                        placeholder="Es: 2"
                        style={inputLight(false)}
                        inputMode="decimal"
                      />
                      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, opacity: 0.62, color: "rgba(15,23,42,0.72)" }}>
                        Campo facoltativo.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {turnoTipo === "ferie" && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(79,70,229,0.12)",
                background: "linear-gradient(180deg, rgba(238,242,255,0.96), rgba(245,243,255,0.92))",
                boxShadow: "0 10px 24px rgba(79,70,229,0.05)",
                display: "grid",
                gap: 14,
              }}
            >
              <div style={sx.sectionLabel}>Configurazione ferie</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={sx.sectionLabel}>Ore per ogni giorno ferie</div>
                  <input
                    value={turnoOrePerGiornoFerie}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTurnoOrePerGiornoFerie(val);
                      if (turnoModalitaPeriodo === "singolo") {
                        const parsed = parseOreItaliane(val);
                        setTurnoOreOrd(parsed !== null && parsed > 0 ? formatNumeroCompatto(parsed) : "");
                      }
                    }}
                    placeholder="Es: 6 oppure 8"
                    style={inputLight(false)}
                    inputMode="decimal"
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "end",
                  }}
                >
                  <button
                    type="button"
                    data-chip="1"
                    onClick={() => setTurnoConsideraSabato((prev) => !prev)}
                    style={chip(turnoConsideraSabato)}
                  >
                    {turnoConsideraSabato ? "Sabato conteggiato" : "Sabato escluso"}
                  </button>
                </div>
              </div>

              {(() => {
                const orePerGiorno = parseOreItaliane(turnoOrePerGiornoFerie) || 0;
                const giorniSelezionati =
                  turnoModalitaPeriodo === "intervallo"
                    ? giorniFerieSelezionati(turnoData, turnoDataFine, turnoConsideraSabato)
                    : turnoData
                    ? [turnoData]
                    : [];

                const totaleGiorni = giorniSelezionati.length;
                const totaleOre = totaleGiorni * orePerGiorno;

                return (
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: "1px solid rgba(79,70,229,0.16)",
                      background: "rgba(255,255,255,0.72)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(55,48,163,0.96)" }}>
                      Riepilogo ferie selezionate
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(15,23,42,0.82)" }}>
                      Giorni conteggiati: <strong>{totaleGiorni}</strong>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(15,23,42,0.82)" }}>
                      Ore totali ferie: <strong>{formatNumeroCompatto(totaleOre)}</strong>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(71,85,105,0.80)" }}>
                      La domenica non viene conteggiata. Il sabato dipende dal pulsante sopra.
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {turnoTipo === "assenza" && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(225,29,72,0.12)",
                background: "linear-gradient(180deg, rgba(255,241,242,0.96), rgba(255,247,237,0.92))",
                boxShadow: "0 10px 24px rgba(225,29,72,0.05)",
                display: "grid",
                gap: 14,
              }}
            >
              <div style={sx.sectionLabel}>Tipo assenza</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  { key: "malattia", label: "Malattia" },
                  { key: "104", label: "104" },
                  { key: "maternita-facoltativa", label: "Maternità facoltativa" },
                  { key: "permesso-sindacale", label: "Permesso sindacale" },
                ].map((item) => {
                  const active = turnoTipoAssenza === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-chip="1"
                      onClick={() =>
                        setTurnoTipoAssenza(
                          item.key as "malattia" | "104" | "maternita-facoltativa" | "permesso-sindacale"
                        )
                      }
                      style={{
                        padding: "14px 12px",
                        borderRadius: 18,
                        border: active
                          ? "2px solid rgba(225,29,72,0.30)"
                          : "1px solid rgba(15,23,42,0.10)",
                        background: active
                          ? "linear-gradient(180deg, rgba(255,228,230,0.96), rgba(255,241,242,0.94))"
                          : "rgba(255,255,255,0.96)",
                        boxShadow: active
                          ? "0 10px 24px rgba(225,29,72,0.10)"
                          : "0 6px 18px rgba(15,23,42,0.04)",
                        fontWeight: 950,
                        fontSize: 13,
                        color: "rgba(15,23,42,0.94)",
                        cursor: "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.62, color: "rgba(15,23,42,0.72)" }}>
                Nel calendario comparirà la sigla A, mentre il dettaglio vero resta nella nota.
              </div>
            </div>
          )}

          {turnoTipo === "riposo" && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "linear-gradient(180deg, rgba(241,245,249,0.96), rgba(248,250,252,0.92))",
                boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
                fontSize: 13,
                fontWeight: 850,
                lineHeight: 1.5,
                color: "rgba(15,23,42,0.78)",
              }}
            >
              Puoi inserire un singolo giorno di riposo oppure un intervallo completo Dal / Al.
            </div>
          )}

          {turnoAvanzato && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "rgba(255,255,255,0.82)",
                boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
              }}
            >
              <div style={sx.sectionLabel}>Note</div>
              <textarea
                value={turnoNote}
                onChange={(e) => setTurnoNote(e.target.value)}
                rows={4}
                placeholder={
                  turnoTipo === "lavoro"
                    ? "Note turno..."
                    : turnoTipo === "ferie"
                    ? "Nota ferie..."
                    : turnoTipo === "assenza"
                    ? "Nota assenza..."
                    : "Nota riposo..."
                }
                style={{
                  ...inputLight(false),
                  height: "auto",
                  minHeight: 110,
                  resize: "vertical",
                  lineHeight: 1.4,
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          ...sx.footer,
          borderTop: "1px solid rgba(15,23,42,0.06)",
          background: "rgba(255,255,255,0.66)",
          backdropFilter: "blur(8px)",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          data-chip="1"
          onClick={chiudiTurnoForm}
          style={sx.actionBtn(false)}
        >
          Annulla
        </button>

        {turnoIdInModifica && (
          <button
            type="button"
            data-chip="1"
            onClick={() => {
              eliminaTurno(turnoIdInModifica);
              chiudiTurnoForm();
            }}
            style={{
              ...sx.actionBtn(false),
              border: "1px solid rgba(239,68,68,0.20)",
              color: "rgba(185,28,28,0.95)",
              background: "rgba(254,242,242,0.92)",
            }}
          >
            Elimina
          </button>
        )}

        <button
          type="button"
          data-chip="1"
          onClick={salvaTurno}
          style={sx.actionBtn(true)}
        >
          {turnoIdInModifica ? "Salva modifiche" : "Salva turno"}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}