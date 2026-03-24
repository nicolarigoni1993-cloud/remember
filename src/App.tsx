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

function formatOreItalianeFromMin(min: number): string {
  const ore = min / 60;
  return ore.toLocaleString("it-IT", { maximumFractionDigits: 2 });
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
                "linear-gradient(90deg, #e2e8f0 0%, #93c5fd 22%, #818cf8 52%, #c084fc 78%, #f8fafc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 0 24px rgba(99,102,241,0.12)",
            }}
          >
            REMEMBER
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








export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) ?? null, [users, currentUserId]);

  const [loginNome, setLoginNome] = useState("");
  const [loginPick, setLoginPick] = useState<string | null>(null);

 const [pagina, setPagina] = useState<"home" | "aggiungi" | "consulta" | "agenda" | "controllo" | "archivio">("home");
 const [consultaSezione, setConsultaSezione] = useState<"menu" | "turni" | "finanza" | "eventi" | "archivio">("menu");
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

  const [, setNotificheMinutiPrima] = useState<number[]>([]);
  const [, setCustomNotificaOre] = useState<string>("");
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

const categorieEntrataBase = useMemo(
  () => ["Stipendio", "Bonus", "Regalo", "Rimborso", "Vendita", "Extra"],
  []
);

const categorieUscitaBase = useMemo(
  () => ["Spesa", "Carburante", "Affitto", "Bollette", "Ristorante", "Svago", "Salute", "Casa"],
  []
);

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
  const [turnoModoOreFerie, setTurnoModoOreFerie] = useState<"giorni" | "ore">("giorni");
  const [turnoQuantitaFerie, setTurnoQuantitaFerie] = useState("");
  const [turnoManuale, setTurnoManuale] = useState(false);
  const [turnoModalitaPeriodo, setTurnoModalitaPeriodo] = useState<"singolo" | "intervallo">("singolo");
  const [turnoDataFine, setTurnoDataFine] = useState(new Date().toISOString().slice(0, 10));
  const [turnoTipoAssenza, setTurnoTipoAssenza] = useState<"malattia" | "104" | "maternita-facoltativa" | "permesso-sindacale">("malattia");

  const presetTurni = ["00-06", "06-12", "12-18", "18-24", "6-14", "14-22", "22-06", "8-18", "8-17"];

  const [controlloDettaglioData, setControlloDettaglioData] = useState<string | null>(null);

  const meseKey = useMemo(() => yyyymmFromDate(meseCorrente), [meseCorrente]);


const eventiProssimiAggiungi = useMemo(() => {
  return voci
    .filter((v) => v.tipo === "scadenza" || v.tipo === "appuntamento")
    .filter((v) => !v.fatto)
    .slice()
    .sort((a, b) => {
      const d = a.data.localeCompare(b.data);
      if (d !== 0) return d;
      return a.ora.localeCompare(b.ora);
    })
    .slice(0, 7);
}, [voci]);


  const [hoverCloseTurno, setHoverCloseTurno] = useState(false);

  const scheduledRef = useRef<Record<string, number[]>>({});

  function clearScheduledForVoce(voceId: string) {
    const ids = scheduledRef.current[voceId] ?? [];
    ids.forEach((t) => window.clearTimeout(t));
    delete scheduledRef.current[voceId];
  }

  function clearAllScheduled() {
    Object.keys(scheduledRef.current).forEach(clearScheduledForVoce);
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
        try {
          const tipoLabel =
            v.tipo === "scadenza"
              ? "Scadenza"
              : v.tipo === "appuntamento"
              ? "Appuntamento"
              : "Nota";

          new Notification(`${tipoLabel}: ${v.titolo}`, {
            body: `Tra ${formatOreItalianeFromMin(min)} ore • ${formattaDataBreve(v.data)} ${v.ora}`,
          });
        } catch {}
      }, diff);

      ids.push(id);
    }

    if (ids.length) scheduledRef.current[v.id] = ids;
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

        if (diff >= 0 && diff <= 60_000) {
          const firedKey = `remember_notifica_fired_${v.id}_${min}`;
          if (sessionStorage.getItem(firedKey) === "1") return;

          try {
            const tipoLabel =
              v.tipo === "scadenza"
                ? "Scadenza"
                : v.tipo === "appuntamento"
                ? "Appuntamento"
                : "Nota";

            new Notification(`${tipoLabel}: ${v.titolo}`, {
              body: `Tra ${formatOreItalianeFromMin(min)} ore • ${formattaDataBreve(v.data)} ${v.ora}`,
            });

            sessionStorage.setItem(firedKey, "1");
          } catch {}
        }
      });
    });
  }

  useEffect(() => {
    const timer = setInterval(() => setAdesso(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const u = caricaUtenti();
    setUsers(u);

    const curr = caricaUtenteCorrente();
    if (curr && u.some((x) => x.id === curr)) setCurrentUserId(curr);
    else setCurrentUserId(null);
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

function apriNuova() {
  resetForm();
  setTipo("appuntamento");
  setOra("09:00");
  setMostraForm(false);
  setAggiungiSezione("eventi");
}

function apriNuovaConData(dataSelezionata: string) {
  resetForm();
  setData(dataSelezionata);
  setOra("09:00");
  setTipo("appuntamento");
  setMostraForm(false);
  setAggiungiSezione("eventi");
}

function apriModifica(v: Voce) {
  setIdInModifica(v.id);
  setTitolo(v.titolo);
  setData(v.data);
  setOra(v.ora);
  setTipo(v.tipo === "nota" ? "scadenza" : v.tipo);
  setUrgente(v.urgente);
  setNota("");
  setImporto(v.importo !== null ? String(v.importo) : "");
  setNotificheMinutiPrima([]);
  setCustomNotificaOre("");
  setMostraForm(false);
  setAggiungiSezione("eventi");
}





function salva() {
  if (classNameIsEmpty(titolo)) {
    alert("Compila almeno la descrizione");
    return;
  }

  const dataFinale = data.trim();
  const oraFinale = ora.trim();

  if (classNameIsEmpty(dataFinale) || classNameIsEmpty(oraFinale)) {
    alert("Compila data e ora");
    return;
  }

  if (idInModifica) {
    setVoci((prev) =>
      prev.map((x) =>
        x.id === idInModifica
          ? {
              ...x,
              titolo: titolo.trim(),
              data: dataFinale,
              ora: oraFinale,
              tipo: "appuntamento",
              urgente: false,
              nota: "",
              importo: null,
              movimento: "nessuno" as Movimento,
              fatto: vocePassata(dataFinale, oraFinale),
              notificheMinutiPrima: [],
            }
          : x
      )
    );
  } else {
    const nuova: Voce = {
      id: safeUUID(),
      titolo: titolo.trim(),
      data: dataFinale,
      ora: oraFinale,
      tipo: "appuntamento",
      urgente: false,
      nota: "",
      importo: null,
      movimento: "nessuno",
      fatto: vocePassata(dataFinale, oraFinale),
      notificheMinutiPrima: [],
    };

    setVoci((prev) => [nuova, ...prev]);
  }

  chiudiForm();
}

function applicaPresetTurno(val: string) {
  setTurnoPreset(val);
  setTurnoManuale(false);

  const parti = val.split("-");
  if (parti.length !== 2) return;

  let start = parti[0].trim();
  let end = parti[1].trim();

  if (/^\d$/.test(start)) start = `0${start}`;
  if (/^\d$/.test(end)) end = `0${end}`;
  if (end === "24") end = "00";

  setTurnoInizio(`${start}:00`);
  setTurnoFine(`${end}:00`);

  if (turnoOreOrd.trim() === "") {
    const oreCalcolate =
      ((Number(end === "00" ? "24" : end) - Number(start) + 24) % 24) || 0;
    if (oreCalcolate > 0) setTurnoOreOrd(String(oreCalcolate));
  }
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

function resetCampiTurnoBase(dataSelezionata?: string) {
  const dataBase = dataSelezionata || new Date().toISOString().slice(0, 10);

  setTurnoIdInModifica(null);
  setTurnoData(dataBase);
  setTurnoDataFine(dataBase);
  setTurnoTipo("lavoro");
  setTurnoModoOreFerie("giorni");
  setTurnoQuantitaFerie("");
  setTurnoInizio("08:00");
  setTurnoFine("16:00");
  setTurnoOreOrd("");
  setTurnoOreStraord("");
  setTurnoNote("");
  setTurnoPreset("");
  setTurnoManuale(false);
  setTurnoModalitaPeriodo("singolo");
  setTurnoTipoAssenza("malattia");
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

    const notaPulita = (t.note || "").replace(/^RIPOSO\s*•?\s*/i, "").trim();
    setTurnoNote(notaPulita);
  } else if (sigla === "F") {
    setTurnoTipo("ferie");
    setTurnoInizio("08:00");
    setTurnoFine("16:00");
    setTurnoPreset("");
    setTurnoManuale(false);
    setTurnoTipoAssenza("malattia");

    const oreOrd = Number(t.oreOrdinarie || 0);

    if (oreOrd === 8) {
      setTurnoModoOreFerie("giorni");
      setTurnoQuantitaFerie("1");
    } else {
      setTurnoModoOreFerie("ore");
      setTurnoQuantitaFerie(String(oreOrd || ""));
    }

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
    } else {
      setTurnoPreset("");
      setTurnoManuale(true);
    }

    setTurnoModoOreFerie("giorni");
    setTurnoQuantitaFerie("");
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
}

function salvaTurno() {
  if (!turnoData) {
    alert("Inserisci la data del turno.");
    return;
  }

  if ((turnoTipo === "ferie" || turnoTipo === "assenza") && turnoModalitaPeriodo === "intervallo") {
    if (!turnoDataFine) {
      alert("Inserisci la data finale.");
      return;
    }

    const giorni = giorniTraDateInclusive(turnoData, turnoDataFine);

    if (giorni.length === 0) {
      alert("Intervallo date non valido.");
      return;
    }

    if (turnoIdInModifica) {
      alert("Per modificare un intervallo già creato, modifica o elimina i singoli giorni.");
      return;
    }

    if (turnoTipo === "ferie") {
      const recordFerie: Turno[] = giorni.map((dataGiorno) => ({
        id: safeUUID(),
        data: dataGiorno,
        inizio: "FERIE",
        fine: "FERIE",
        oreOrdinarie: 8,
        oreStraordinarie: 0,
        note:
          `FERIE • 1 g • intervallo ${turnoData} / ${turnoDataFine}` +
          (turnoNote.trim() ? ` • ${turnoNote.trim()}` : ""),
      }));

      setTurni((prev) => [...recordFerie, ...prev]);
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
    const quantita = parseOreItaliane(turnoQuantitaFerie);

    if (quantita === null || quantita <= 0) {
      alert(turnoModoOreFerie === "giorni" ? "Inserisci giorni ferie validi." : "Inserisci ore ferie valide.");
      return;
    }

    if (turnoModoOreFerie === "giorni" && quantita > 1) {
      alert("Per più di 1 giorno di ferie usa la modalità Da / A.");
      return;
    }

    const oreOrd = turnoModoOreFerie === "giorni" ? quantita * 8 : quantita;

    const aggiornato: Turno = {
      id: turnoIdInModifica ?? safeUUID(),
      data: turnoData,
      inizio: "FERIE",
      fine: "FERIE",
      oreOrdinarie: oreOrd,
      oreStraordinarie: 0,
      note:
        `FERIE • ${turnoModoOreFerie === "giorni" ? `${quantita} g` : `${quantita} h`}` +
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

  const oreOrd = parseOreItaliane(turnoOreOrd);
  const oreStra = turnoOreStraord.trim() === "" ? 0 : parseOreItaliane(turnoOreStraord);

  if (oreOrd === null || oreOrd < 0) {
    alert("Inserisci ore ordinarie valide.");
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
    oreOrdinarie: oreOrd,
    oreStraordinarie: oreStra,
    note: turnoNote.trim(),
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
  const giorno = (oggi.getDay() + 6) % 7; // lunedì = 0
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

        return (
          <div
            key={key}
            onClick={() => {
              if (turno) onEditTurno(turno);
            }}
            style={{
              padding: "10px 6px",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "rgba(255,255,255,0.9)",
              display: "grid",
              justifyItems: "center",
              gap: 4,
              cursor: turno ? "pointer" : "default",
              boxShadow: "0 6px 14px rgba(15,23,42,0.06)",
            }}
          >
            {/* giorno */}
            <div style={{ fontSize: 10, fontWeight: 900, opacity: 0.7 }}>
              {giorniLabel[idx]}
            </div>

            {/* numero */}
            <div style={{ fontSize: 16, fontWeight: 1000 }}>
              {d.getDate()}
            </div>

            {/* turno */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 1000,
                marginTop: 2,
                color:
                  sigla === "R"
                    ? "#6b7280"
                    : sigla === "F"
                    ? "#7c3aed"
                    : sigla === "A"
                    ? "#ef4444"
                    : "#2563eb",
              }}
            >
              {sigla || "-"}
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

  if (categoriaEntrata === "__altro__") {
    const nuovaLista = (() => {
      try {
        const raw = localStorage.getItem(K_CATEGORIE_ENTRATA_CUSTOM);
        const parsed = raw ? (JSON.parse(raw) as string[]) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    setCategoriaEntrata("");
    setNuovaCategoriaEntrata("");
    void nuovaLista;
  } else {
    setCategoriaEntrata("");
    setNuovaCategoriaEntrata("");
  }

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

  if (categoriaUscita === "__altro__") {
    const nuovaLista = (() => {
      try {
        const raw = localStorage.getItem(K_CATEGORIE_USCITA_CUSTOM);
        const parsed = raw ? (JSON.parse(raw) as string[]) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    setCategoriaUscita("");
    setNuovaCategoriaUscita("");
    void nuovaLista;
  } else {
    setCategoriaUscita("");
    setNuovaCategoriaUscita("");
  }

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

  const entrateControlloMese = useMemo(() => {
    return eventiControlloMese.filter((x) => x.movimento === "entrata");
  }, [eventiControlloMese]);

  const usciteControlloMese = useMemo(() => {
    return eventiControlloMese.filter((x) => x.movimento === "uscita" && x.importo !== null);
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

  const eventiControlloMeseVisibili = useMemo(() => {
    return eventiControlloMese.filter((ev) => {
      if (ev.tipo === "scadenza" || ev.tipo === "appuntamento") {
        return giorniMancanti(ev.data) >= 0;
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

  function esci() {
    salvaUtenteCorrente(null);
    setCurrentUserId(null);
    setPagina("home");
    setFiltro(null);
    setMeseCorrente(new Date());
  }



  
  function MiniCalendario({
    mese,
    vociDelMese,
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
    const [pinnedDate, setPinnedDate] = useState<string | null>(null);
    const [isTouchDevice, setIsTouchDevice] = useState(() => {
      if (typeof window === "undefined") return false;
      return (
        window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(pointer: coarse)").matches ||
        "ontouchstart" in window ||
        window.innerWidth <= 820
      );
    });

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

    const y = mese.getFullYear();
    const m0 = mese.getMonth();
    const first = new Date(y, m0, 1);
    const offset = weekdayMon0(first);
    const dim = daysInMonth(y, m0);

    const oggi = new Date();
    const oggiKey = ymd(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());

    const stats = useMemo(() => {
      const map = new Map<
        string,
        { count: number; urgent: boolean; hasScadenza: boolean; hasAppuntamento: boolean; turniCount: number }
      >();

      for (const v of vociDelMese) {
        const prev = map.get(v.data) ?? {
          count: 0,
          urgent: false,
          hasScadenza: false,
          hasAppuntamento: false,
          turniCount: 0,
        };

        prev.count += 1;
        if (v.urgente) prev.urgent = true;
        if (v.tipo === "scadenza") prev.hasScadenza = true;
        if (v.tipo === "appuntamento") prev.hasAppuntamento = true;

        map.set(v.data, prev);
      }

      for (const t of turniDelMese) {
        const prev = map.get(t.data) ?? {
          count: 0,
          urgent: false,
          hasScadenza: false,
          hasAppuntamento: false,
          turniCount: 0,
        };

        prev.turniCount += 1;
        map.set(t.data, prev);
      }

      return map;
    }, [vociDelMese, turniDelMese]);

    const giorni: Array<string | null> = [];
    for (let i = 0; i < offset; i++) giorni.push(null);
    for (let d = 1; d <= dim; d++) giorni.push(ymd(y, m0, d));
    while (giorni.length % 7 !== 0) giorni.push(null);

    const titoloMese = mese.toLocaleDateString("it-IT", {
      month: "long",
      year: "numeric",
    });

    const oggiTesto = oggi.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

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
      <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 14 }}>
        <div style={{ ...ui.card, padding: isTouchDevice ? 12 : 18, overflow: "visible" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isTouchDevice ? 18 : 20,
                  fontWeight: 1000,
                  letterSpacing: -0.45,
                  background: "linear-gradient(90deg, #4338ca 0%, #7c3aed 48%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Smemorario
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 850,
                  opacity: 0.66,
                }}
              >
                calendario, scadenze e turni
              </div>
            </div>

            <div
              style={{
                padding: isTouchDevice ? "8px 12px" : "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,59,48,0.20)",
                background: "linear-gradient(180deg, rgba(255,59,48,0.10), rgba(255,59,48,0.05))",
                color: "rgba(160,20,16,0.94)",
                fontWeight: 950,
                fontSize: isTouchDevice ? 11 : 13,
                textTransform: "capitalize",
                boxShadow: "0 10px 24px rgba(255,59,48,0.10)",
                whiteSpace: "nowrap",
              }}
            >
              {oggiTesto}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTouchDevice ? "44px minmax(0, 1fr) 44px" : "50px 1fr 50px",
              alignItems: "center",
              gap: isTouchDevice ? 12 : 14,
              marginBottom: 14,
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
                fontSize: isTouchDevice ? 18 : 28,
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

          <style>{`
            @media (hover: hover) and (pointer: fine) {
              [data-calday="1"] [data-preview="1"] {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition: opacity .14s ease, transform .14s ease;
              }

              [data-calday="1"]:hover [data-preview="1"] {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
              }
            }
          `}</style>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: isTouchDevice ? 6 : 12,
              overflow: "visible",
            }}
          >
            {giorni.map((key, idx) => {
              if (!key) {
                return (
                  <div
                    key={`e_${idx}`}
                    style={{
                      minHeight: isTouchDevice ? 78 : 118,
                      borderRadius: 18,
                      background: "transparent",
                    }}
                  />
                );
              }

              const d = Number(key.slice(-2));
              const info = stats.get(key);
              const count = info?.count ?? 0;
              const turniCount = info?.turniCount ?? 0;
              const isToday = key === oggiKey;
              const isPinnedOpen = isTouchDevice && pinnedDate === key;

              const cellDate = new Date(y, m0, d);
              const jsDay = cellDate.getDay();
              const isWeekend = jsDay === 0 || jsDay === 6;

              const numeroColor = isWeekend ? "rgba(200,20,16,0.98)" : "rgba(18,140,48,0.98)";

              let previewAccent = "rgba(79,70,229,0.95)";
              if (info?.hasScadenza && !info?.hasAppuntamento) previewAccent = "rgba(5,150,105,0.96)";
              if (!info?.hasScadenza && info?.hasAppuntamento) previewAccent = "rgba(147,51,234,0.96)";
              if (info?.urgent) previewAccent = "rgba(239,68,68,0.96)";

              const previewItems = vociDelMese
                .filter((v) => v.data === key)
                .slice()
                .sort((a, b) => {
                  if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
                  const o = a.ora.localeCompare(b.ora);
                  if (o !== 0) return o;
                  return a.titolo.localeCompare(b.titolo);
                })
                .slice(0, 4);

              const previewTurni = turniDelMese
                .filter((t) => t.data === key)
                .slice()
                .sort((a, b) => a.inizio.localeCompare(b.inizio))
                .slice(0, 3);

              const col = idx % 7;
              const previewStyle: React.CSSProperties =
                col <= 1
                  ? { left: 0, transform: "translateY(0)" }
                  : col >= 5
                  ? { right: 0, left: "auto", transform: "translateY(0)" }
                  : { left: "50%", transform: "translateX(-50%)" };

              return (
                <div
                  key={key}
                  data-calday="1"
                  style={{
                    position: "relative",
                    overflow: "visible",
                    minWidth: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (!isTouchDevice || count + turniCount <= 0) return;
                      setPinnedDate((prev) => (prev === key ? null : key));
                    }}
                    style={{
                      width: "100%",
                      minHeight: isTouchDevice ? 88 : 134,
                      borderRadius: isTouchDevice ? 18 : 24,
                      border: info?.urgent
                        ? "2px solid rgba(239,68,68,0.44)"
                        : isToday
                        ? "2px solid rgba(255,59,48,0.40)"
                        : "1px solid rgba(15,23,42,0.08)",
                      background: isToday
                        ? "linear-gradient(180deg, rgba(255,245,244,0.98), rgba(255,251,251,0.96))"
                        : "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.86))",
                      boxShadow: info?.urgent
                        ? "0 18px 36px rgba(239,68,68,0.14)"
                        : isToday
                        ? "0 18px 32px rgba(255,59,48,0.12)"
                        : "0 14px 28px rgba(15,23,42,0.08)",
                      cursor: count + turniCount > 0 ? "pointer" : "default",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      position: "relative",
                      padding: isTouchDevice ? "8px 4px 8px" : "12px 8px 10px",
                      transition:
                        "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
                    }}
                    title={`${d} ${titoloMese}`}
                  >
                    {info?.urgent && (
                      <div
                        style={{
                          position: "absolute",
                          top: isTouchDevice ? 6 : 8,
                          right: isTouchDevice ? 6 : 8,
                          width: isTouchDevice ? 8 : 10,
                          height: isTouchDevice ? 8 : 10,
                          borderRadius: 999,
                          background: "rgba(239,68,68,0.96)",
                          boxShadow: "0 0 0 4px rgba(239,68,68,0.12)",
                        }}
                      />
                    )}

                    <div
                      style={{
                        display: "grid",
                        justifyItems: "center",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: isTouchDevice ? 10 : 11,
                          fontWeight: 1000,
                          letterSpacing: 0.35,
                          textTransform: "uppercase",
                          color: isWeekend ? "rgba(185,28,28,0.86)" : "rgba(22,101,52,0.80)",
                          lineHeight: 1,
                        }}
                      >
                        {cellDate.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}
                      </div>

                      <div
                        style={{
                          fontWeight: 1000,
                          fontSize: isTouchDevice ? (isToday ? 24 : 20) : isToday ? 34 : 28,
                          lineHeight: 1,
                          color: numeroColor,
                          textAlign: "center",
                          textShadow: isToday ? "0 4px 18px rgba(255,59,48,0.18)" : "none",
                        }}
                      >
                        {d}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 5, width: "100%", justifyItems: "center" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                        {count > 0 && (
                          <div
                            style={{
                              minWidth: isTouchDevice ? 20 : 24,
                              padding: isTouchDevice ? "2px 6px" : "4px 10px",
                              borderRadius: 999,
                              fontSize: isTouchDevice ? 10 : 12,
                              fontWeight: 950,
                              color: "rgba(255,255,255,0.98)",
                              background: info?.urgent
                                ? "linear-gradient(180deg, rgba(239,68,68,0.96), rgba(220,38,38,0.94))"
                                : info?.hasScadenza && !info?.hasAppuntamento
                                ? "linear-gradient(180deg, rgba(16,185,129,0.96), rgba(5,150,105,0.92))"
                                : !info?.hasScadenza && info?.hasAppuntamento
                                ? "linear-gradient(180deg, rgba(168,85,247,0.96), rgba(147,51,234,0.92))"
                                : "linear-gradient(180deg, rgba(79,70,229,0.96), rgba(124,58,237,0.92))",
                              boxShadow: "0 10px 18px rgba(15,23,42,0.12)",
                            }}
                          >
                            {count}
                          </div>
                        )}

                        {turniCount > 0 &&
                          (() => {
                            const primoTurno = turniDelMese
                              .filter((t) => t.data === key)
                              .slice()
                              .sort((a, b) => a.inizio.localeCompare(b.inizio))[0];

                            const siglaTurno = primoTurno
                              ? normalizeTurnoLabel(primoTurno.inizio, primoTurno.fine, primoTurno.note)
                              : "T";
                            const descTurno = primoTurno
                              ? descrizioneTurnoBreve(primoTurno.inizio, primoTurno.fine, primoTurno.note)
                              : "Turno";

                            return (
                              <div
                                style={{
                                  minWidth: isTouchDevice ? 20 : 24,
                                  padding: isTouchDevice ? "2px 6px" : "4px 10px",
                                  borderRadius: 999,
                                  fontSize: isTouchDevice ? 10 : 12,
                                  fontWeight: 950,
                                  color: "rgba(255,255,255,0.98)",
                                  background:
                                    siglaTurno === "R"
                                      ? "linear-gradient(180deg, rgba(107,114,128,0.96), rgba(75,85,99,0.92))"
                                      : siglaTurno === "N"
                                      ? "linear-gradient(180deg, rgba(67,56,202,0.96), rgba(49,46,129,0.92))"
                                      : siglaTurno === "M"
                                      ? "linear-gradient(180deg, rgba(245,158,11,0.96), rgba(217,119,6,0.92))"
                                      : siglaTurno === "P"
                                      ? "linear-gradient(180deg, rgba(249,115,22,0.96), rgba(234,88,12,0.92))"
                                      : siglaTurno === "S"
                                      ? "linear-gradient(180deg, rgba(168,85,247,0.96), rgba(126,34,206,0.92))"
                                      : "linear-gradient(180deg, rgba(59,130,246,0.96), rgba(37,99,235,0.92))",
                                  boxShadow: "0 10px 18px rgba(15,23,42,0.12)",
                                }}
                                title={
                                  turniCount > 1
                                    ? `${descTurno} + altri ${turniCount - 1} turno${turniCount - 1 > 1 ? "i" : ""}`
                                    : descTurno
                                }
                              >
                                {siglaTurno}
                              </div>
                            );
                          })()}

                        {count === 0 && turniCount === 0 && (
                          <div
                            style={{
                              fontSize: isTouchDevice ? 9 : 11,
                              fontWeight: 850,
                              opacity: 0.22,
                              minHeight: 14,
                            }}
                          >
                            —
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          apriTurnoForm(key);
                        }}
                        style={{
                          width: "100%",
                          maxWidth: isTouchDevice ? 54 : 72,
                          padding: isTouchDevice ? "4px 0" : "5px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(59,130,246,0.22)",
                          background: "rgba(239,246,255,0.95)",
                          color: "rgba(30,64,175,0.95)",
                          fontSize: isTouchDevice ? 11 : 12,
                          fontWeight: 1000,
                          cursor: "pointer",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                        title="Aggiungi turno"
                      >
                        +
                      </button>

                      {isToday && (
                        <div
                          style={{
                            fontSize: isTouchDevice ? 9 : 10,
                            fontWeight: 1000,
                            letterSpacing: 0.35,
                            textTransform: "uppercase",
                            color: "rgba(255,59,48,0.95)",
                            lineHeight: 1,
                          }}
                        >
                          Oggi
                        </div>
                      )}
                    </div>
                  </button>




{/* Primo blocco fornito * */}













                  {!isTouchDevice && (previewItems.length > 0 || previewTurni.length > 0) && (
                    <div
                      data-preview="1"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 10px)",
                        width: 300,
                        maxWidth: 300,
                        padding: 12,
                        borderRadius: 24,
                        border: `1px solid ${previewAccent.replace("0.96", "0.18")}`,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.98))",
                        boxShadow: "0 30px 60px rgba(15,23,42,0.18)",
                        backdropFilter: "blur(16px)",
                        zIndex: 50,
                        ...previewStyle,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 950,
                          opacity: 0.72,
                          marginBottom: 10,
                          textTransform: "capitalize",
                        }}
                      >
                        {new Date(y, m0, d).toLocaleDateString("it-IT", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {previewItems.map((v) => {
                          const typeStyle =
                            v.tipo === "scadenza"
                              ? {
                                  bg: "rgba(16,185,129,0.10)",
                                  bd: "rgba(5,150,105,0.16)",
                                  tx: "rgba(6,95,70,0.96)",
                                }
                              : {
                                  bg: "rgba(168,85,247,0.10)",
                                  bd: "rgba(147,51,234,0.16)",
                                  tx: "rgba(91,33,182,0.96)",
                                };

                          return (
                            <div
                              key={v.id}
                              style={{
                                padding: 11,
                                borderRadius: 18,
                                background: typeStyle.bg,
                                border: `1px solid ${typeStyle.bd}`,
                                display: "grid",
                                gap: 5,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 950,
                                    color: "rgba(15,23,42,0.82)",
                                  }}
                                >
                                  {v.ora}
                                </span>

                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 900,
                                      padding: "4px 8px",
                                      borderRadius: 999,
                                      background: typeStyle.bg,
                                      color: typeStyle.tx,
                                      border: `1px solid ${typeStyle.bd}`,
                                    }}
                                  >
                                    {v.tipo === "scadenza" ? "Scadenza" : "Appuntamento"}
                                  </span>

                                  {v.urgente && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 950,
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        background: "rgba(239,68,68,0.14)",
                                        color: "rgba(185,28,28,0.98)",
                                        border: "1px solid rgba(239,68,68,0.20)",
                                      }}
                                    >
                                      Urgente
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 950,
                                  lineHeight: 1.25,
                                  color: "rgba(15,23,42,0.92)",
                                }}
                              >
                                {v.titolo}
                              </div>
                            </div>
                          );
                        })}

                        {previewTurni.map((t) => {
                          const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
                          const descr = descrizioneTurnoBreve(t.inizio, t.fine, t.note);
                          const isRiposo = sigla === "R";

                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTurno(t);
                              }}
                              style={{
                                padding: 11,
                                borderRadius: 18,
                                background: isRiposo ? "rgba(107,114,128,0.08)" : "rgba(59,130,246,0.08)",
                                border: isRiposo
                                  ? "1px solid rgba(107,114,128,0.18)"
                                  : "1px solid rgba(59,130,246,0.14)",
                                display: "grid",
                                gap: 5,
                                width: "100%",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                              title="Modifica turno"
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 950,
                                    color: isRiposo ? "rgba(55,65,81,0.95)" : "rgba(30,64,175,0.95)",
                                  }}
                                >
                                  {sigla} • {descr}
                                  {!isRiposo ? ` ${t.inizio} - ${t.fine}` : ""}
                                </span>

                                {!isRiposo && (
                                  <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(30,64,175,0.82)" }}>
                                    {formatNumeroOre(t.oreOrdinarie + t.oreStraordinarie)}h
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.78 }}>
                                {isRiposo
                                  ? "Giornata di riposo"
                                  : `Ord: ${formatNumeroOre(t.oreOrdinarie)}h • Straord: ${formatNumeroOre(t.oreStraordinarie)}h`}
                              </div>

                              <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.62 }}>
                                Tocca/clicca per modificare
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isTouchDevice && isPinnedOpen && (previewItems.length > 0 || previewTurni.length > 0) && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "calc(100% + 8px)",
                        width: "calc(100vw - 32px)",
                        maxWidth: 360,
                        padding: 12,
                        borderRadius: 20,
                        border: `1px solid ${previewAccent.replace("0.96", "0.18")}`,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.98))",
                        boxShadow: "0 30px 60px rgba(15,23,42,0.18)",
                        backdropFilter: "blur(16px)",
                        zIndex: 60,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 950,
                          opacity: 0.72,
                          marginBottom: 10,
                          textTransform: "capitalize",
                        }}
                      >
                        {new Date(y, m0, d).toLocaleDateString("it-IT", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {previewItems.map((v) => (
                          <div
                            key={v.id}
                            style={{
                              padding: 11,
                              borderRadius: 16,
                              background: "rgba(255,255,255,0.9)",
                              border: "1px solid rgba(15,23,42,0.08)",
                              display: "grid",
                              gap: 5,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 950 }}>{v.ora}</div>
                            <div style={{ fontSize: 14, fontWeight: 950 }}>{v.titolo}</div>
                          </div>
                        ))}

                        {previewTurni.map((t) => {
                          const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
                          const descr = descrizioneTurnoBreve(t.inizio, t.fine, t.note);
                          const isRiposo = sigla === "R";

                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTurno(t);
                              }}
                              style={{
                                padding: 11,
                                borderRadius: 16,
                                background: isRiposo ? "rgba(107,114,128,0.08)" : "rgba(59,130,246,0.08)",
                                border: isRiposo
                                  ? "1px solid rgba(107,114,128,0.18)"
                                  : "1px solid rgba(59,130,246,0.14)",
                                display: "grid",
                                gap: 5,
                                width: "100%",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                              title="Modifica turno"
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 950,
                                  color: isRiposo ? "rgba(55,65,81,0.95)" : "rgba(30,64,175,0.95)",
                                }}
                              >
                                {sigla} • {descr}
                                {!isRiposo ? ` ${t.inizio} - ${t.fine}` : ""}
                              </div>

                              <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.78 }}>
                                {isRiposo
                                  ? "Giornata di riposo"
                                  : `Ord: ${formatNumeroOre(t.oreOrdinarie)}h • Straord: ${formatNumeroOre(t.oreStraordinarie)}h`}
                              </div>

                              <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.62 }}>
                                Tocca per modificare
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => setPinnedDate(null)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(15,23,42,0.10)",
                            background: "rgba(255,255,255,0.92)",
                            fontSize: 12,
                            fontWeight: 900,
                            cursor: "pointer",
                            color: "rgba(15,23,42,0.82)",
                          }}
                        >
                          Chiudi
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
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
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                N = Notte
              </span>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                M = Mattina
              </span>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                P = Pomeriggio
              </span>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                S = Sera
              </span>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                R = Riposo
              </span>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                T = Altro turno
              </span>
            </div>

            <div
              style={{
                fontSize: 12,
                fontWeight: 850,
                opacity: 0.75,
                lineHeight: 1.35,
              }}
            >
              Desktop: passa col mouse sui giorni. Mobile: tocca il giorno per vedere dettagli. Tocca/clicca un turno per modificarlo. Il pulsante turno resta sempre dentro la casella senza sovrapporsi.
            </div>
          </div>
        </div>
      </div>
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
                    ? "linear-gradient(180deg, rgba(239,246,255,0.96), rgba(248,250,252,0.92))"
                    : "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
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

  if (!currentUser) {
    return (
      <div style={pageBg}>
        {GlobalStyle}
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18 }}>
          <div style={{ width: "min(520px, 100%)" }}>
            <div style={{ ...ui.card, padding: 26 }}>
              <RememberLogo size={52} centered />

              <div
                style={{
                  opacity: 0.72,
                  fontWeight: 850,
                  marginTop: 18,
                  textAlign: "center",
                  fontSize: 14,
                }}
              >
                Il tuo spazio personale per ricordare tutto, in modo bello.
              </div>

              <div
                style={{
                  marginTop: 22,
                  fontSize: 16,
                  fontWeight: 950,
                  letterSpacing: -0.2,
                }}
              >
                Accedi
              </div>

              {users.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 800, fontSize: 13 }}>
                  Nessun utente creato su questo dispositivo.
                </div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <select
                    value={loginPick ?? ""}
                    onChange={(e) => setLoginPick(e.target.value || null)}
                    style={{
                      ...inputLight(false),
                      height: 48,
                      background: "rgba(255,255,255,0.90)",
                      fontWeight: 850,
                    }}
                  >
                    <option value="">Seleziona utente…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>

                  <button
                    data-chip="1"
                    onClick={() => {
                      if (!loginPick) {
                        alert("Seleziona un utente.");
                        return;
                      }
                      entraCome(loginPick);
                    }}
                    style={chip(true)}
                  >
                    Entra
                  </button>
                </div>
              )}

              <div style={{ height: 1, background: "rgba(15,23,42,0.08)", margin: "18px 0" }} />

              <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.2 }}>Crea nuovo utente</div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <input
                  value={loginNome}
                  onChange={(e) => setLoginNome(e.target.value)}
                  placeholder="Nome utente"
                  style={inputLight(false)}
                />
                <button data-chip="1" onClick={creaEUentra} style={chip(true)}>
                  Crea & Entra
                </button>

                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800, lineHeight: 1.35 }}>
                  Profilo locale sul dispositivo.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
   <div style={pageBg}>
  {GlobalStyle}

{pagina !== "home" && pagina !== "aggiungi" && (
  <div style={topBar}>
    <div style={{ ...ui.glass, padding: 22 }}>
      <div style={{ display: "grid", gap: 18 }}>
        <RememberLogo size={54} centered />

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
              background: "rgba(255,255,255,0.82)",
              boxShadow: "0 18px 34px rgba(79,70,229,0.10)",
              fontSize: 13,
              fontWeight: 950,
              letterSpacing: -0.2,
              animation: "softGlow 2.4s ease-in-out infinite",
            }}
          >
            <span style={{ opacity: 0.8 }}>🕒</span>
            <span style={{ opacity: 0.88 }}>{formattaDataLunga(adesso)}</span>
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
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
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
    <div style={{ width: "min(520px, 100%)", display: "grid", gap: 20 }}>

      {/* LOGO */}
      <div style={{ ...ui.card, padding: 26, textAlign: "center" }}>
        <RememberLogo size={64} centered />

    <div
  style={{
    marginTop: 18,
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
    Scrivi qui il tuo titolo
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
    Sottotitolo personalizzabile
  </div>
</div>
      </div>

      {/* BOTTONI PRINCIPALI */}
      <div style={{ display: "grid", gap: 14 }}>

        {/* AGGIUNGI */}
    <button
  data-chip="1"
  onClick={() => setPagina("aggiungi")}
  style={{
    padding: "22px 18px",
    borderRadius: 26,
    border: "1px solid rgba(16,185,129,0.28)",
    background:
      "linear-gradient(180deg, rgba(16,185,129,0.30), rgba(5,150,105,0.18))",
    color: "rgba(6,95,70,0.98)",
    fontSize: 18,
    fontWeight: 1000,
    letterSpacing: 0.3,
    boxShadow: "0 22px 50px rgba(16,185,129,0.25)",
  }}
>
  ➕ AGGIUNGI
</button>

        {/* CONSULTA */}
        <button
            data-chip="1"
            onClick={() => {
                setConsultaSezione("menu");
                setPagina("consulta");
              }}
          style={{
            padding: "22px 18px",
            borderRadius: 26,
            border: "1px solid rgba(79,70,229,0.28)",
            background:
              "linear-gradient(180deg, rgba(79,70,229,0.30), rgba(124,58,237,0.18))",
            color: "rgba(67,56,202,0.98)",
            fontSize: 18,
            fontWeight: 1000,
            letterSpacing: 0.3,
            boxShadow: "0 22px 50px rgba(79,70,229,0.25)",
          }}
        >
          📊 CONSULTA
        </button>

        {/* NOTA RAPIDA */}
        <button
       onClick={() => apriNuova()}
          style={{
            padding: "22px 18px",
            borderRadius: 26,
            border: "1px solid rgba(249,115,22,0.28)",
            background:
              "linear-gradient(180deg, rgba(249,115,22,0.30), rgba(234,88,12,0.18))",
            color: "rgba(154,52,18,0.98)",
            fontSize: 18,
            fontWeight: 1000,
            letterSpacing: 0.3,
            boxShadow: "0 22px 50px rgba(249,115,22,0.25)",
          }}
        >
          📝 NOTA RAPIDA
        </button>
      </div>

    </div>
  </div>
)}





{pagina === "consulta" && (
  <div style={{ minHeight: "70vh", display: "grid", placeItems: "start center", padding: 16 }}>
    <div style={{ width: "min(1100px, 100%)", display: "grid", gap: 18 }}>
      {consultaSezione === "menu" ? (
        <>
          <div
            style={{
              ...ui.card,
              padding: 22,
              display: "grid",
              gap: 10,
              border: "1px solid rgba(79,70,229,0.18)",
              background:
                "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(255,255,255,0.94))",
              boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 1000,
                letterSpacing: -0.5,
                color: "rgba(15,23,42,0.96)",
              }}
            >
              Consulta
            </div>

            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "rgba(15,23,42,0.72)",
                lineHeight: 1.45,
              }}
            >
              Area principale di consultazione dell’app. Da qui accederai a turni, finanza, eventi e archivio generale.
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
              style={{
                ...ui.card,
                padding: 22,
                textAlign: "left",
                border: "1px solid rgba(249,115,22,0.18)",
                background:
                  "linear-gradient(180deg, rgba(249,115,22,0.12), rgba(255,255,255,0.94))",
                boxShadow: "0 18px 40px rgba(249,115,22,0.10)",
                cursor: "pointer",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(180deg, rgba(249,115,22,0.94), rgba(234,88,12,0.90))",
                  color: "white",
                  fontSize: 24,
                  boxShadow: "0 14px 28px rgba(249,115,22,0.20)",
                }}
              >
                ⏰
              </div>

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
                    opacity: 0.72,
                    lineHeight: 1.45,
                    color: "rgba(15,23,42,0.88)",
                  }}
                >
                  Calendario mensile, riepiloghi e gestione completa dei turni
                </div>
              </div>
            </button>

            <button
              data-chip="1"
              onClick={() => setConsultaSezione("finanza")}
              style={{
                ...ui.card,
                padding: 22,
                textAlign: "left",
                border: "1px solid rgba(16,185,129,0.18)",
                background:
                  "linear-gradient(180deg, rgba(16,185,129,0.12), rgba(255,255,255,0.94))",
                boxShadow: "0 18px 40px rgba(16,185,129,0.10)",
                cursor: "pointer",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(180deg, rgba(16,185,129,0.94), rgba(5,150,105,0.90))",
                  color: "white",
                  fontSize: 24,
                  boxShadow: "0 14px 28px rgba(16,185,129,0.20)",
                }}
              >
                €
              </div>

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
                    opacity: 0.72,
                    lineHeight: 1.45,
                    color: "rgba(15,23,42,0.88)",
                  }}
                >
                  Entrate, uscite, movimenti e riepiloghi economici
                </div>
              </div>
            </button>

            <button
              data-chip="1"
              onClick={() => setConsultaSezione("eventi")}
              style={{
                ...ui.card,
                padding: 22,
                textAlign: "left",
                border: "1px solid rgba(79,70,229,0.18)",
                background:
                  "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(255,255,255,0.94))",
                boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
                cursor: "pointer",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(180deg, rgba(79,70,229,0.94), rgba(124,58,237,0.90))",
                  color: "white",
                  fontSize: 24,
                  boxShadow: "0 14px 28px rgba(79,70,229,0.20)",
                }}
              >
                🗓
              </div>

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
                    opacity: 0.72,
                    lineHeight: 1.45,
                    color: "rgba(15,23,42,0.88)",
                  }}
                >
                  Eventi, promemoria e gestione del calendario eventi
                </div>
              </div>
            </button>

            <button
              data-chip="1"
              onClick={() => setConsultaSezione("archivio")}
              style={{
                ...ui.card,
                padding: 22,
                textAlign: "left",
                border: "1px solid rgba(148,163,184,0.18)",
                background:
                  "linear-gradient(180deg, rgba(148,163,184,0.12), rgba(255,255,255,0.94))",
                boxShadow: "0 18px 40px rgba(148,163,184,0.10)",
                cursor: "pointer",
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(180deg, rgba(100,116,139,0.94), rgba(71,85,105,0.90))",
                  color: "white",
                  fontSize: 24,
                  boxShadow: "0 14px 28px rgba(100,116,139,0.20)",
                }}
              >
                🗂
              </div>

              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 1000,
                    letterSpacing: -0.3,
                    color: "rgba(15,23,42,0.96)",
                  }}
                >
                  Archivio
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    opacity: 0.72,
                    lineHeight: 1.45,
                    color: "rgba(15,23,42,0.88)",
                  }}
                >
                  Archivio generale con storico dati e riepiloghi futuri
                </div>
              </div>
            </button>
          </div>
        </>
      ) : consultaSezione === "turni" ? (
        <>
          <div
            style={{
              ...ui.card,
              padding: 22,
              display: "grid",
              gap: 12,
              border: "1px solid rgba(249,115,22,0.18)",
              background:
                "linear-gradient(180deg, rgba(249,115,22,0.12), rgba(255,255,255,0.94))",
              boxShadow: "0 18px 40px rgba(249,115,22,0.10)",
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
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 1000,
                    letterSpacing: -0.4,
                    color: "rgba(15,23,42,0.96)",
                  }}
                >
                  Consulta turni
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "rgba(15,23,42,0.72)",
                    lineHeight: 1.45,
                  }}
                >
                  Calendario mensile turni con navigazione mese, riepilogo compatto e modifica rapida.
                </div>
              </div>

              <button
                data-chip="1"
                onClick={() => setConsultaSezione("menu")}
                style={chip(false)}
              >
                Torna a Consulta
              </button>
            </div>
          </div>

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
                padding: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 14,
                border: "1px solid rgba(255,255,255,0.55)",
                boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
              }}
            >
              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(14,165,233,0.14)",
                  background:
                    "linear-gradient(180deg, rgba(14,165,233,0.10), rgba(14,165,233,0.04))",
                  boxShadow: "0 10px 24px rgba(14,165,233,0.08)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                  Totale turni
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                  {totaleTurniMese}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                  Esclusi i riposi
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(16,185,129,0.14)",
                  background:
                    "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))",
                  boxShadow: "0 10px 24px rgba(16,185,129,0.08)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                  Ore ordinarie
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                  {formatNumeroOre(oreOrdMese)} h
                </div>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                  Monte ore base
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(249,115,22,0.14)",
                  background:
                    "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.04))",
                  boxShadow: "0 10px 24px rgba(249,115,22,0.08)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                  Ore straordinarie
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                  {formatNumeroOre(oreStraMese)} h
                </div>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                  Extra mensili
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(124,58,237,0.14)",
                  background:
                    "linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.04))",
                  boxShadow: "0 10px 24px rgba(124,58,237,0.08)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                  Ore totali
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                  {formatNumeroOre(oreTotMese)} h
                </div>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                  Totale mese
                </div>
              </div>
            </div>

            <div
              style={{
                ...ui.card,
                padding: 18,
                display: "grid",
                gap: 14,
                border: "1px solid rgba(255,255,255,0.55)",
                boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
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
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: -0.3 }}>
                    Monitoraggio ferie
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.62 }}>
                    Base ferie personalizzabile: giorni e ore modificabili direttamente da qui
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(16,185,129,0.14)",
                    background: "rgba(240,253,244,0.92)",
                    fontSize: 12,
                    fontWeight: 900,
                    color: "rgba(21,128,61,0.95)",
                    boxShadow: "0 8px 18px rgba(34,197,94,0.08)",
                  }}
                >
                  Sigla calendario: F
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(59,130,246,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.04))",
                    boxShadow: "0 10px 24px rgba(59,130,246,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
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
                      background: "rgba(255,255,255,0.92)",
                      fontWeight: 900,
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(168,85,247,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(168,85,247,0.10), rgba(168,85,247,0.04))",
                    boxShadow: "0 10px 24px rgba(168,85,247,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
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
                      background: "rgba(255,255,255,0.92)",
                      fontWeight: 900,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(34,197,94,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))",
                    boxShadow: "0 10px 24px rgba(34,197,94,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Giorni ferie effettuati
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {ferieGiorniEffettuati}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Conteggio automatico dai turni F
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(59,130,246,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.04))",
                    boxShadow: "0 10px 24px rgba(59,130,246,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Giorni ferie residui
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {ferieGiorniResidui}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Somma ore ferie inserite
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(168,85,247,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(168,85,247,0.10), rgba(168,85,247,0.04))",
                    boxShadow: "0 10px 24px rgba(168,85,247,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Ore ferie effettuate
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {formatNumeroOre(ferieOreEffettuate)} h
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Valore ore ferie
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(244,114,182,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(244,114,182,0.10), rgba(244,114,182,0.04))",
                    boxShadow: "0 10px 24px rgba(244,114,182,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Ore ferie residue
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {formatNumeroOre(ferieOreResidue)} h
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Residuo calcolato automaticamente
                  </div>
                </div>
              </div>
            </div>
          </div>
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
)}




{pagina === "aggiungi" && (
  <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 14, display: "grid", gap: 16 }}>
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <RememberLogo size={56} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {aggiungiSezione !== "menu" && (
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
            )}

            <button
              data-chip="1"
              onClick={() => {
                resetForm();
                setAggiungiSezione("menu");
                setPagina("home");
              }}
              style={chip(false)}
            >
              Torna Home
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 6,
          }}
        >
  <div
  style={{
    fontSize: 26,
    fontWeight: 1000,
    letterSpacing: -0.6,
    color: "rgba(241,245,249,0.98)",
    textShadow: "0 12px 30px rgba(79,70,229,0.18)",
  }}
>
  {aggiungiSezione === "menu"
    ? "Aggiungi"
    : aggiungiSezione === "movimenti"
    ? "Entrata / Uscita"
    : "Evento"}
</div>

<div
  style={{
    fontSize: 14,
    fontWeight: 800,
    color: "rgba(191,219,254,0.86)",
    lineHeight: 1.4,
  }}
>
  {aggiungiSezione === "menu"
    ? "Scegli cosa vuoi inserire nell’app"
    : aggiungiSezione === "movimenti"
    ? "Inserisci entrate e uscite con categorie personalizzabili"
    : "Inserisci un evento semplice con descrizione, data e ora"}
</div>
        </div>
      </div>
    </div>

{aggiungiSezione === "menu" ? (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 16,
    }}
    className="remember-grid-2"
  >
    <button
      data-chip="1"
      onClick={() => setAggiungiSezione("movimenti")}
      style={{
        ...ui.card,
        padding: 22,
        textAlign: "left",
        border: "1px solid rgba(16,185,129,0.18)",
        background:
          "linear-gradient(180deg, rgba(16,185,129,0.12), rgba(255,255,255,0.94))",
        boxShadow: "0 18px 40px rgba(16,185,129,0.10)",
        cursor: "pointer",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(180deg, rgba(16,185,129,0.94), rgba(5,150,105,0.90))",
          color: "white",
          fontSize: 24,
          boxShadow: "0 14px 28px rgba(16,185,129,0.20)",
        }}
      >
        €
      </div>

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
            opacity: 0.72,
            lineHeight: 1.45,
            color: "rgba(15,23,42,0.88)",
          }}
        >
          Nuova area dedicata ai movimenti economici
        </div>
      </div>
    </button>

    <button
      data-chip="1"
      onClick={() => {
        resetForm();
        setTipo("scadenza");
        setAggiungiSezione("eventi");
      }}
      style={{
        ...ui.card,
        padding: 22,
        textAlign: "left",
        border: "1px solid rgba(79,70,229,0.18)",
        background:
          "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(255,255,255,0.94))",
        boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
        cursor: "pointer",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(180deg, rgba(79,70,229,0.94), rgba(124,58,237,0.90))",
          color: "white",
          fontSize: 24,
          boxShadow: "0 14px 28px rgba(79,70,229,0.20)",
        }}
      >
        🗓
      </div>

      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 1000,
            letterSpacing: -0.3,
            color: "rgba(15,23,42,0.96)",
          }}
        >
          Appuntamento / Scadenza
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            fontWeight: 800,
            opacity: 0.72,
            lineHeight: 1.45,
            color: "rgba(15,23,42,0.88)",
          }}
        >
          Nuova area dedicata a promemoria, appuntamenti e scadenze
        </div>
      </div>
    </button>

    <button
      data-chip="1"
      onClick={() => apriTurnoForm()}
      style={{
        ...ui.card,
        padding: 22,
        textAlign: "left",
        border: "1px solid rgba(249,115,22,0.18)",
        background:
          "linear-gradient(180deg, rgba(249,115,22,0.12), rgba(255,255,255,0.94))",
        boxShadow: "0 18px 40px rgba(249,115,22,0.10)",
        cursor: "pointer",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(180deg, rgba(249,115,22,0.94), rgba(234,88,12,0.90))",
          color: "white",
          fontSize: 24,
          boxShadow: "0 14px 28px rgba(249,115,22,0.20)",
        }}
      >
        ⏰
      </div>

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
            opacity: 0.72,
            lineHeight: 1.45,
            color: "rgba(15,23,42,0.88)",
          }}
        >
          Inserisci un nuovo turno di lavoro, ferie o riposo
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
        "linear-gradient(180deg, rgba(16,185,129,0.12), rgba(255,255,255,0.94))",
      boxShadow: "0 18px 40px rgba(16,185,129,0.10)",
      display: "grid",
      gap: 16,
    }}
  >
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
          lineHeight: 1.45,
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
          borderRadius: 20,
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
        }}
      >
        <span>Entrata</span>
        <span style={{ fontSize: 22 }}>{movimentoAperto === "entrata" ? "−" : "+"}</span>
      </button>

      {movimentoAperto === "entrata" && (
        <div
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(16,185,129,0.16)",
            borderRadius: 20,
            padding: 16,
            display: "grid",
            gap: 12,
            boxShadow: "0 10px 28px rgba(16,185,129,0.10)",
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
              borderRadius: 16,
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
          borderRadius: 20,
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
        }}
      >
        <span>Uscita</span>
        <span style={{ fontSize: 22 }}>{movimentoAperto === "uscita" ? "−" : "+"}</span>
      </button>

      {movimentoAperto === "uscita" && (
        <div
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(239,68,68,0.16)",
            borderRadius: 20,
            padding: 16,
            display: "grid",
            gap: 12,
            boxShadow: "0 10px 28px rgba(239,68,68,0.10)",
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
              borderRadius: 16,
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
          "linear-gradient(180deg, rgba(79,70,229,0.12), rgba(255,255,255,0.94))",
        boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
        display: "grid",
        gap: 16,
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
            color: "rgba(15,23,42,0.96)",
          }}
        >
          {idInModifica ? "Modifica evento" : "Nuovo evento"}
        </div>

        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.45,
            color: "rgba(15,23,42,0.70)",
          }}
        >
          Inserisci un evento semplice con descrizione, data e ora
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={chiudiForm}
            style={{
              border: "none",
              borderRadius: 16,
              padding: "14px 16px",
              fontSize: 15,
              fontWeight: 1000,
              cursor: "pointer",
              color: "rgba(15,23,42,0.88)",
              background: "rgba(255,255,255,0.88)",
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
              borderRadius: 16,
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

    <div
      style={{
        ...ui.card,
        padding: 22,
        border: "1px solid rgba(79,70,229,0.18)",
        background:
          "linear-gradient(180deg, rgba(79,70,229,0.10), rgba(255,255,255,0.94))",
        boxShadow: "0 18px 40px rgba(79,70,229,0.10)",
        display: "grid",
        gap: 14,
        alignContent: "start",
      }}
    >
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
            opacity: 0.7,
            color: "rgba(15,23,42,0.88)",
          }}
        >
          I prossimi eventi salvati nel calendario
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
                  borderRadius: 18,
                  border: "1px solid rgba(79,70,229,0.14)",
                  background:
                    "linear-gradient(180deg, rgba(79,70,229,0.08), rgba(79,70,229,0.03))",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 950, color: "rgba(15,23,42,0.96)" }}>
                  {ev.titolo}
                </div>

                <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72, color: "rgba(15,23,42,0.86)" }}>
                  {formattaDataBreve(ev.data)} • {ev.ora}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
)}
  </div>
)}











               {false && (
          <>
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
                  padding: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 14,
                  border: "1px solid rgba(255,255,255,0.55)",
                  boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(14,165,233,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(14,165,233,0.10), rgba(14,165,233,0.04))",
                    boxShadow: "0 10px 24px rgba(14,165,233,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Totale turni
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {totaleTurniMese}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Esclusi i riposi
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(16,185,129,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))",
                    boxShadow: "0 10px 24px rgba(16,185,129,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Ore ordinarie
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {formatNumeroOre(oreOrdMese)} h
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Monte ore base
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(249,115,22,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.04))",
                    boxShadow: "0 10px 24px rgba(249,115,22,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Ore straordinarie
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {formatNumeroOre(oreStraMese)} h
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Extra mensili
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(124,58,237,0.14)",
                    background:
                      "linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.04))",
                    boxShadow: "0 10px 24px rgba(124,58,237,0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                    Ore totali
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                    {formatNumeroOre(oreTotMese)} h
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                    Totale mese
                  </div>
                </div>
              </div>

              <div
                style={{
                  ...ui.card,
                  padding: 18,
                  display: "grid",
                  gap: 14,
                  border: "1px solid rgba(255,255,255,0.55)",
                  boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
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
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: -0.3 }}>
                      Monitoraggio ferie
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.62 }}>
                      Base ferie personalizzabile: giorni e ore modificabili direttamente da qui
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: "1px solid rgba(16,185,129,0.14)",
                      background: "rgba(240,253,244,0.92)",
                      fontSize: 12,
                      fontWeight: 900,
                      color: "rgba(21,128,61,0.95)",
                      boxShadow: "0 8px 18px rgba(34,197,94,0.08)",
                    }}
                  >
                    Sigla calendario: F
                  </div>
                </div>


                                    <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(59,130,246,0.14)",
                      background:
                        "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.04))",
                      boxShadow: "0 10px 24px rgba(59,130,246,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
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
                        background: "rgba(255,255,255,0.92)",
                        fontWeight: 900,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(168,85,247,0.14)",
                      background:
                        "linear-gradient(180deg, rgba(168,85,247,0.10), rgba(168,85,247,0.04))",
                      boxShadow: "0 10px 24px rgba(168,85,247,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
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
                        background: "rgba(255,255,255,0.92)",
                        fontWeight: 900,
                      }}
                    />
                  </div>
                </div>



                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(34,197,94,0.14)",
                      background:
                        "linear-gradient(180deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))",
                      boxShadow: "0 10px 24px rgba(34,197,94,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                      Giorni ferie effettuati
                    </div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                      {ferieGiorniEffettuati}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                      Conteggio automatico dai turni F
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(59,130,246,0.14)",
                      background:
                        "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.04))",
                      boxShadow: "0 10px 24px rgba(59,130,246,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                      Giorni ferie residui
                    </div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                      {ferieGiorniResidui}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                      Somma ore ferie inserite
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(168,85,247,0.14)",
                      background:
                        "linear-gradient(180deg, rgba(168,85,247,0.10), rgba(168,85,247,0.04))",
                      boxShadow: "0 10px 24px rgba(168,85,247,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                      Ore ferie effettuate
                    </div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                      {formatNumeroOre(ferieOreEffettuate)} h
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                      Valore ore ferie
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(244,114,182,0.14)",
                      background:
                        "linear-gradient(180deg, rgba(244,114,182,0.10), rgba(244,114,182,0.04))",
                      boxShadow: "0 10px 24px rgba(244,114,182,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.7, letterSpacing: 0.2 }}>
                      Ore ferie residue
                    </div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000, lineHeight: 1 }}>
                      {formatNumeroOre(ferieOreResidue)} h
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.58 }}>
                      Residuo calcolato automaticamente
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {false && renderAreaControllo()}

        
       







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

                      <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
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
        maxWidth: 760,
        width: "min(760px, 100%)",
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
        <div>
          <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: -0.3, color: "rgba(15,23,42,0.96)" }}>
            {turnoIdInModifica ? "Modifica turno" : "Nuovo turno"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 5, fontWeight: 800, color: "rgba(15,23,42,0.76)" }}>
            Inserimento rapido, semplice e coerente con il resto dell'app.
          </div>
        </div>

        <button
          type="button"
          data-chip="1"
          onMouseEnter={() => setHoverCloseTurno(true)}
          onMouseLeave={() => setHoverCloseTurno(false)}
          onClick={chiudiTurnoForm}
          style={{ ...sx.closeBtn, ...(hoverCloseTurno ? sx.closeBtnHover : {}) }}
          title="Chiudi"
        >
          ✕
        </button>
      </div>

      <div style={{ ...sx.body, paddingTop: 18 }}>
        <div style={{ ...sx.content, display: "grid", gap: 18 }}>
          <MiniCalendarioSettimanaTurni
              turni={turni}
              onEditTurno={apriModificaTurno}
            />
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
              Qui inserisci solo turni, ferie, riposi e assenze in modo rapido. I riepiloghi grandi andranno nella sezione consulta/turni.
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
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
                        setTurnoOreOrd("");
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                      }

                      if (tipo === "ferie") {
                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoModoOreFerie("giorni");
                        setTurnoQuantitaFerie("1");
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
                        setTurnoOreOrd("8");
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                      }

                      if (tipo === "riposo") {
                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoQuantitaFerie("");
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
                        setTurnoOreOrd("");
                        setTurnoOreStraord("");
                        setTurnoModalitaPeriodo("singolo");
                        setTurnoDataFine(turnoData);
                      }

                      if (tipo === "assenza") {
                        setTurnoPreset("");
                        setTurnoManuale(false);
                        setTurnoQuantitaFerie("");
                        setTurnoInizio("08:00");
                        setTurnoFine("16:00");
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
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(turnoTipo === "ferie" || turnoTipo === "assenza") && (
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
              <div style={sx.sectionLabel}>Modalità</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  { key: "singolo", label: "Giorno singolo" },
                  { key: "intervallo", label: "Da / A" },
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
                    <div style={sx.sectionLabel}>Da</div>
                    <input
                      type="date"
                      value={turnoData}
                      onChange={(e) => setTurnoData(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>

                  <div>
                    <div style={sx.sectionLabel}>A</div>
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
                <div style={sx.sectionLabel}>Preset rapido</div>

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
                      setTurnoManuale((prev) => !prev);
                      setTurnoPreset("");
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

              {(turnoManuale || !turnoPreset) && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(255,255,255,0.82)",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={sx.sectionLabel}>Inizio turno</div>
                    <input
                      type="time"
                      value={turnoInizio}
                      onChange={(e) => setTurnoInizio(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>

                  <div>
                    <div style={sx.sectionLabel}>Fine turno</div>
                    <input
                      type="time"
                      value={turnoFine}
                      onChange={(e) => setTurnoFine(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
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
                  <div style={sx.sectionLabel}>Ore ordinarie</div>
                  <input
                    value={turnoOreOrd}
                    onChange={(e) => setTurnoOreOrd(e.target.value)}
                    placeholder="Es: 8"
                    style={inputLight(false)}
                    inputMode="decimal"
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
            </>
          )}

          {turnoTipo === "ferie" && turnoModalitaPeriodo === "singolo" && (
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
              <div style={sx.sectionLabel}>Ferie da scalare</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  { key: "giorni", label: "In giorni" },
                  { key: "ore", label: "In ore" },
                ].map((item) => {
                  const active = turnoModoOreFerie === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-chip="1"
                      onClick={() => {
                        const modo = item.key as "giorni" | "ore";
                        setTurnoModoOreFerie(modo);

                        if (modo === "giorni") {
                          setTurnoQuantitaFerie("1");
                          setTurnoOreOrd("8");
                        } else {
                          setTurnoQuantitaFerie(turnoQuantitaFerie === "1" ? "8" : turnoQuantitaFerie);
                          setTurnoOreOrd(turnoQuantitaFerie === "1" ? "8" : turnoQuantitaFerie);
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
                        color: "rgba(15,23,42,0.94)",
                        cursor: "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <div style={sx.sectionLabel}>
                  {turnoModoOreFerie === "giorni" ? "Quantità giorni" : "Quantità ore"}
                </div>
                <input
                  value={turnoQuantitaFerie}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTurnoQuantitaFerie(val);
                    if (turnoModoOreFerie === "giorni") {
                      const parsed = parseOreItaliane(val);
                      setTurnoOreOrd(parsed !== null ? String(parsed * 8) : "");
                    } else {
                      setTurnoOreOrd(val);
                    }
                  }}
                  placeholder={turnoModoOreFerie === "giorni" ? "Es: 1" : "Es: 4 oppure 8"}
                  style={inputLight(false)}
                  inputMode="decimal"
                />
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.62, color: "rgba(15,23,42,0.72)" }}>
                Se devi inserire più giorni consecutivi, usa la modalità Da / A.
              </div>
            </div>
          )}

          {turnoTipo === "ferie" && turnoModalitaPeriodo === "intervallo" && (
            <div
              style={{
                padding: 16,
                borderRadius: 22,
                border: "1px solid rgba(79,70,229,0.12)",
                background: "linear-gradient(180deg, rgba(238,242,255,0.96), rgba(245,243,255,0.92))",
                boxShadow: "0 10px 24px rgba(79,70,229,0.05)",
                fontSize: 13,
                fontWeight: 850,
                color: "rgba(15,23,42,0.82)",
                lineHeight: 1.5,
              }}
            >
              Verrà creato automaticamente un giorno di ferie per ogni data compresa nell'intervallo.
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
                Nel calendario comparirà la sigla A, mentre il dettaglio vero dell'assenza resta salvato nella nota.
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
              Riposo rapido: salva solo la data e, se vuoi, una nota.
            </div>
          )}

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
        </div>
      </div>

      <div
        style={{
          ...sx.footer,
          borderTop: "1px solid rgba(15,23,42,0.06)",
          background: "rgba(255,255,255,0.66)",
          backdropFilter: "blur(8px)",
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