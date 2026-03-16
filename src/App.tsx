import React, { useEffect, useMemo, useRef, useState } from "react";

type Filtro = "oggi" | "7giorni" | "30giorni";
type Movimento = "uscita" | "entrata";

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
    i === "FERIE" ||
    f === "FERIE" ||
    n === "F" ||
    i === "F" ||
    f === "F"
  ) {
    return "F" as const;
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
  if (sigla === "N") return "Notte";
  if (sigla === "M") return "Mattina";
  if (sigla === "P") return "Pomeriggio";
  if (sigla === "S") return "Sera";

  return "Turno";
}





const K_USERS = "scadenze_users";
const K_CURR = "scadenze_current_user";
const kVoci = (userId: string) => `voci_scadenze__${userId}`;
const kIncassi = (userId: string) => `incassi_mese__${userId}`;
const kTurni = (userId: string) => `turni_mese__${userId}`;
const K_FAB_POS = "remember_fab_position";

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

  const movimento: Movimento = x?.movimento === "entrata" ? "entrata" : "uscita";

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
          gap: 14,
          textAlign: centered ? "center" : "left",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 72 72"
          style={{ filter: "drop-shadow(0 16px 28px rgba(0,0,0,0.18))", flexShrink: 0 }}
        >
          <defs>
            <linearGradient id="rmA" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4f46e5" />
              <stop offset="0.52" stopColor="#7c3aed" />
              <stop offset="1" stopColor="#ef4444" />
            </linearGradient>
            <linearGradient id="rmB" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="1" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>
          </defs>

          <rect x="6" y="6" width="60" height="60" rx="20" fill="url(#rmA)" />
          <path d="M22 44V24h8l6 9 6-9h8v20h-7V34l-7 10-7-10v10z" fill="rgba(255,255,255,0.96)" />
          <path d="M14 16c14-12 32-12 44 0" fill="none" stroke="url(#rmB)" strokeWidth="6" strokeLinecap="round" />
        </svg>

        <div style={{ display: "grid", justifyItems: centered ? "center" : "start" }}>
          <div
            style={{
              fontSize: centered ? 40 : 32,
              fontWeight: 1000,
              letterSpacing: centered ? -1.4 : -1.15,
              lineHeight: 1,
              background: "linear-gradient(90deg, #4338ca 0%, #7c3aed 45%, #ef4444 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            REMEMBER
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: centered ? 13 : 12,
              fontWeight: 900,
              opacity: 0.66,
              letterSpacing: 0.25,
              textAlign: centered ? "center" : "left",
            }}
          >
            agenda smart • scadenze • appuntamenti • denaro
          </div>
        </div>
      </div>
    </div>
  );
}

type FabPos = {
  x: number;
  y: number;
};

function DraggableFab({
  onClick,
  label = "Aggiungi",
}: {
  onClick: () => void;
  label?: string;
}) {
    const isMobile = window.innerWidth <= 820;

  const defaultPos: FabPos = {
    x: window.innerWidth - 110,
    y: window.innerHeight - (isMobile ? 220 : 150),
  };

  const [pos, setPos] = useState<FabPos>(() => {
    try {
      const raw = localStorage.getItem(K_FAB_POS);
      if (!raw) return defaultPos;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
        return parsed as FabPos;
      }
      return defaultPos;
    } catch {
      return defaultPos;
    }
  });

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  useEffect(() => {
    localStorage.setItem(K_FAB_POS, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    const onResize = () => {
      setPos((prev: FabPos) => {
        const maxX = Math.max(16, window.innerWidth - 94);
        const maxY = Math.max(16, window.innerHeight - 94);
        return {
          x: Math.max(16, Math.min(prev.x, maxX)),
          y: Math.max(16, Math.min(prev.y, maxY)),
        };
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function clampPos(x: number, y: number): FabPos {
    const maxX = Math.max(16, window.innerWidth - 94);
    const maxY = Math.max(16, window.innerHeight - 94);

    return {
      x: Math.max(16, Math.min(x, maxX)),
      y: Math.max(16, Math.min(y, maxY)),
    };
  }

  function startDrag(clientX: number, clientY: number) {
    dragRef.current = {
      dragging: true,
      startX: clientX,
      startY: clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!dragRef.current.dragging) return;

    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragRef.current.moved = true;
    }

    const next = clampPos(dragRef.current.originX + dx, dragRef.current.originY + dy);
    setPos(next);
  }

  function endDrag() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onMouseUp = () => endDrag();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => endDrag();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: pos.x - 13,
          top: pos.y - 13,
          width: 104,
          height: 104,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(16,185,129,0.20), transparent 58%)",
          zIndex: 49,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "fixed",
          left: pos.x - 6,
          top: pos.y - 46,
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.90)",
          border: "1px solid rgba(15,23,42,0.08)",
          boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
          fontSize: 12,
          fontWeight: 900,
          color: "rgba(15,23,42,0.72)",
          zIndex: 50,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>

      <button
        type="button"
        data-chip="1"
        onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) startDrag(t.clientX, t.clientY);
        }}
        onClick={() => {
          if (dragRef.current.moved) return;
          onClick();
        }}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: 78,
          height: 78,
          borderRadius: 999,
          border: "1px solid rgba(16,185,129,0.30)",
          background: "linear-gradient(180deg, rgba(16,185,129,0.96), rgba(5,150,105,0.92))",
          color: "rgba(255,255,255,0.98)",
          fontSize: 34,
          cursor: "grab",
          fontWeight: 1000,
          boxShadow: "0 30px 80px rgba(16,185,129,0.28), 0 18px 40px rgba(15,23,42,0.18)",
          display: "grid",
          placeItems: "center",
          zIndex: 51,
          touchAction: "none",
          userSelect: "none",
        }}
        title="Aggiungi"
      >
        +
      </button>
    </>
  );
}





export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) ?? null, [users, currentUserId]);

  const [loginNome, setLoginNome] = useState("");
  const [loginPick, setLoginPick] = useState<string | null>(null);

  const [pagina, setPagina] = useState<"home" | "agenda" | "controllo" | "archivio">("home");
  const [mostraForm, setMostraForm] = useState(false);
  const [idInModifica, setIdInModifica] = useState<string | null>(null);

  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:00");
  const [tipo, setTipo] = useState<Voce["tipo"]>("scadenza");
  const [urgente, setUrgente] = useState(false);
  const [nota, setNota] = useState("");
  const [importo, setImporto] = useState<string>("");

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

  const [mostraTurnoForm, setMostraTurnoForm] = useState(false);
  const [turnoData, setTurnoData] = useState(new Date().toISOString().slice(0, 10));
  const [turnoInizio, setTurnoInizio] = useState("08:00");
  const [turnoFine, setTurnoFine] = useState("16:00");
  const [turnoOreOrd, setTurnoOreOrd] = useState("");
  const [turnoOreStraord, setTurnoOreStraord] = useState("");
  const [turnoNote, setTurnoNote] = useState("");
  const [turnoPreset, setTurnoPreset] = useState("");
  const [turnoIdInModifica, setTurnoIdInModifica] = useState<string | null>(null);

  const presetTurni = ["RIPOSO", "00-06", "06-12", "12-18", "18-24", "6-14", "14-22", "22-06", "8-18", "8-17"];

  const [controlloDettaglioData, setControlloDettaglioData] = useState<string | null>(null);

  const meseKey = useMemo(() => yyyymmFromDate(meseCorrente), [meseCorrente]);
  const [hoverClose, setHoverClose] = useState(false);
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
    if (v.fatto || !v.data || !v.ora) return;

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
          new Notification(`${v.tipo === "scadenza" ? "Scadenza" : "Appuntamento"}: ${v.titolo}`, {
            body: `Tra ${formatOreItalianeFromMin(min)} ore • ${formattaDataBreve(v.data)} ${v.ora}`,
          });
        } catch {
          //
        }
      }, diff);

      ids.push(id);
    }

    if (ids.length) scheduledRef.current[v.id] = ids;
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
      border: "1px solid rgba(255,255,255,0.55)",
      background: "rgba(255,255,255,0.72)",
      boxShadow: "0 24px 70px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.85)",
      borderRadius: 26,
      backdropFilter: "blur(16px)",
    } as const;

    const card = {
      border: "1px solid rgba(255,255,255,0.62)",
      background: "rgba(255,255,255,0.74)",
      boxShadow: "0 20px 48px rgba(15,23,42,0.12)",
      borderRadius: 24,
      backdropFilter: "blur(16px)",
    } as const;

    return { glass, card };
  }, []);












   function chiudiForm() {
    setMostraForm(false);
    resetForm();
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
    setMostraForm(true);
  }

  function apriNuovaConData(dataSelezionata: string, tipoDefault: Voce["tipo"]) {
    resetForm();
    setData(dataSelezionata);
    setOra("09:00");
    setTipo(tipoDefault);
    setMostraForm(true);
  }

  function apriModifica(v: Voce) {
    setIdInModifica(v.id);
    setTitolo(v.titolo);
    setData(v.data);
    setOra(v.ora);
    setTipo(v.tipo);
    setUrgente(v.urgente);
    setNota(v.nota ?? "");
    setImporto(v.movimento === "uscita" && v.importo !== null ? String(v.importo) : "");
    setNotificheMinutiPrima(v.notificheMinutiPrima ?? []);
    setMostraForm(true);
  }

  void apriModifica;

  function salva() {
    if (classNameIsEmpty(titolo)) {
      alert("Compila almeno il titolo");
      return;
    }

    const isNota = tipo === "nota";
    const dataFinale = data.trim();
    const oraFinale = ora.trim();

    if (!isNota && (classNameIsEmpty(dataFinale) || classNameIsEmpty(oraFinale))) {
      alert("Compila titolo, data e ora");
      return;
    }

    const importoNum = importo.trim() === "" ? null : Number(importo.replace(",", "."));

    if (importo.trim() !== "" && (!Number.isFinite(importoNum) || importoNum === null || importoNum < 0)) {
      alert("Importo non valido");
      return;
    }

    const notiUniq = Array.from(new Set(notificheMinutiPrima))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a);

    const voceData = isNota ? dataFinale : dataFinale;
    const voceOra = isNota ? oraFinale : oraFinale;

    if (idInModifica) {
      setVoci((prev) =>
        prev.map((x) =>
          x.id === idInModifica
            ? {
                ...x,
                titolo: titolo.trim(),
                data: voceData,
                ora: voceOra,
                tipo,
                urgente: isNota ? false : urgente,
                nota: nota.trim(),
                importo: isNota ? null : importoNum,
                movimento: "uscita" as Movimento,
                fatto: voceData && voceOra ? vocePassata(voceData, voceOra) : false,
                notificheMinutiPrima: isNota ? [] : notiUniq,
              }
            : x
        )
      );
    } else {
      const nuova: Voce = {
        id: safeUUID(),
        titolo: titolo.trim(),
        data: voceData,
        ora: voceOra,
        tipo,
        urgente: isNota ? false : urgente,
        nota: nota.trim(),
        importo: isNota ? null : importoNum,
        movimento: "uscita",
        fatto: voceData && voceOra ? vocePassata(voceData, voceOra) : false,
        notificheMinutiPrima: isNota ? [] : notiUniq,
      };

      setVoci((prev) => [nuova, ...prev]);
    }

    chiudiForm();
  }

  function apriTurnoForm(dataSelezionata?: string) {
    setTurnoIdInModifica(null);
    setTurnoData(dataSelezionata || new Date().toISOString().slice(0, 10));
    setTurnoInizio("08:00");
    setTurnoFine("16:00");
    setTurnoOreOrd("");
    setTurnoOreStraord("");
    setTurnoNote("");
    setTurnoPreset("");
    setMostraTurnoForm(true);
  }

  function apriModificaTurno(t: Turno) {
    const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);

    setTurnoIdInModifica(t.id);
    setTurnoData(t.data);

    if (sigla === "R") {
      setTurnoInizio("08:00");
      setTurnoFine("16:00");
      setTurnoOreOrd("0");
      setTurnoOreStraord("");
      setTurnoPreset("RIPOSO");
    } else if (sigla === "F") {
      setTurnoInizio("08:00");
      setTurnoFine("16:00");
      setTurnoOreOrd(String(t.oreOrdinarie ?? ""));
      setTurnoOreStraord(t.oreStraordinarie ? String(t.oreStraordinarie) : "");
      setTurnoPreset("FERIE");
    } else {
      setTurnoInizio(t.inizio);
      setTurnoFine(t.fine);
      setTurnoOreOrd(String(t.oreOrdinarie ?? ""));
      setTurnoOreStraord(t.oreStraordinarie ? String(t.oreStraordinarie) : "");

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

      setTurnoPreset([...presetTurni, "FERIE"].includes(key) ? key : "");
    }

    if (sigla === "R") {
      const notaPulita = (t.note || "").replace(/^RIPOSO\s*•?\s*/i, "").trim();
      setTurnoNote(notaPulita);
    } else if (sigla === "F") {
      const notaPulita = (t.note || "").replace(/^FERIE\s*•?\s*/i, "").trim();
      setTurnoNote(notaPulita);
    } else {
      setTurnoNote(t.note ?? "");
    }

    setMostraTurnoForm(true);
  }

  void apriModificaTurno;

  function chiudiTurnoForm() {
    setMostraTurnoForm(false);
    setTurnoIdInModifica(null);
    setTurnoOreOrd("");
    setTurnoOreStraord("");
    setTurnoNote("");
    setTurnoPreset("");
  }

  function salvaTurno() {
    if (!turnoData) {
      alert("Inserisci la data del turno.");
      return;
    }

    const isRiposo = turnoPreset === "RIPOSO";
    const isFerie = turnoPreset === "FERIE";

    if (isRiposo) {
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

    if (isFerie) {
      const oreOrd = turnoOreOrd.trim() === "" ? 8 : parseOreItaliane(turnoOreOrd);
      const oreStra = turnoOreStraord.trim() === "" ? 0 : parseOreItaliane(turnoOreStraord);

      if (oreOrd === null) {
        alert("Inserisci ore ferie valide.");
        return;
      }

      if (oreStra === null) {
        alert("Inserisci ore extra ferie valide.");
        return;
      }

      const aggiornato: Turno = {
        id: turnoIdInModifica ?? safeUUID(),
        data: turnoData,
        inizio: "FERIE",
        fine: "FERIE",
        oreOrdinarie: oreOrd,
        oreStraordinarie: oreStra,
        note: turnoNote.trim() ? `FERIE • ${turnoNote.trim()}` : "FERIE",
      };

      if (turnoIdInModifica) {
        setTurni((prev) => prev.map((t) => (t.id === turnoIdInModifica ? aggiornato : t)));
      } else {
        setTurni((prev) => [aggiornato, ...prev]);
      }

      chiudiTurnoForm();
      return;
    }

    const oreOrd = parseOreItaliane(turnoOreOrd);
    const oreStra = turnoOreStraord.trim() === "" ? 0 : parseOreItaliane(turnoOreStraord);

    if (oreOrd === null) {
      alert("Inserisci ore ordinarie valide.");
      return;
    }

    if (oreStra === null) {
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
    const descrizione = nuovaEntrataDesc.trim();
    const importoNum = Number(nuovaEntrataImporto.replace(",", "."));

    if (!nuovaEntrataData) {
      alert("Inserisci una data.");
      return;
    }
    if (!descrizione) {
      alert("Scrivi la descrizione dell’entrata.");
      return;
    }
    if (!Number.isFinite(importoNum) || importoNum <= 0) {
      alert("Inserisci un importo valido.");
      return;
    }

    const nuova: EntrataExtra = {
      id: safeUUID(),
      data: nuovaEntrataData,
      descrizione,
      importo: importoNum,
    };

    setIncassi((prev) => ({
      ...prev,
      [meseKey]: {
        entrateExtra: [...(prev[meseKey]?.entrateExtra ?? []), nuova],
        usciteExtra: prev[meseKey]?.usciteExtra ?? [],
      },
    }));

    setNuovaEntrataDesc("");
    setNuovaEntrataImporto("");
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
    const descrizione = nuovaUscitaDesc.trim();
    const importoNum = Number(nuovaUscitaImporto.replace(",", "."));

    if (!nuovaUscitaData) {
      alert("Inserisci una data.");
      return;
    }
    if (!descrizione) {
      alert("Scrivi la descrizione dell’uscita.");
      return;
    }
    if (!Number.isFinite(importoNum) || importoNum <= 0) {
      alert("Inserisci un importo valido.");
      return;
    }

    const nuova: UscitaExtra = {
      id: safeUUID(),
      data: nuovaUscitaData,
      descrizione,
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

    setNuovaUscitaDesc("");
    setNuovaUscitaImporto("");
    setNuovaUscitaNota("");
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






    const vociAttiveOrdinate = useMemo(() => {
    return ordinaIntelligente(voci.filter((v) => !v.fatto));
  }, [voci]);

  const prossimeScadenzeHome = useMemo(() => {
    return vociAttiveOrdinate.filter((v) => v.tipo === "scadenza").slice(0, 5);
  }, [vociAttiveOrdinate]);

  const prossimiAppuntamentiHome = useMemo(() => {
    return vociAttiveOrdinate.filter((v) => v.tipo === "appuntamento").slice(0, 5);
  }, [vociAttiveOrdinate]);

  const turniOrdinatiMese = useMemo(() => {
    return turniMese
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data) || a.inizio.localeCompare(b.inizio));
  }, [turniMese]);

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
    return turniFerie.length;
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

 



  const turniStatsMese = useMemo(() => {
    const stats = { N: 0, M: 0, P: 0, S: 0, R: 0, T: 0 };

    for (const t of turniMese) {
      const sigla = normalizeTurnoLabel(t.inizio, t.fine, t.note);
      stats[sigla as keyof typeof stats] += 1;
    }

    return stats;
  }, [turniMese]);

  const vociUrgentiHome = useMemo(() => {
    return vociAttiveOrdinate.filter((v) => v.urgente || giorniMancanti(v.data) <= 7).slice(0, 6);
  }, [vociAttiveOrdinate]);

  const appuntamentiCountHome = prossimiAppuntamentiHome.length;
  const scadenzeCountHome = prossimeScadenzeHome.length;


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
    return eventiControlloMese.filter(
      (x) => x.tipo === "scadenza" || x.tipo === "appuntamento"
    );
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
    const stats = { N: 0, M: 0, P: 0, S: 0, R: 0, T: 0 };

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

  function badgeMov(m: Movimento) {
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
    color: "rgba(15,23,42,0.94)",
    background:
      "radial-gradient(1200px 900px at 0% 0%, rgba(79,70,229,0.14), transparent 60%), radial-gradient(1000px 800px at 100% 20%, rgba(236,72,153,0.12), transparent 55%), radial-gradient(1100px 900px at 50% 100%, rgba(14,165,233,0.10), transparent 55%), linear-gradient(180deg, #f8fafc, #edf2f7)",
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
    border: `1px solid ${active ? "rgba(79,70,229,0.28)" : "rgba(15,23,42,0.08)"}`,
    background: active
      ? "linear-gradient(180deg, rgba(79,70,229,0.16), rgba(124,58,237,0.10))"
      : "rgba(255,255,255,0.82)",
    boxShadow: active ? "0 16px 32px rgba(79,70,229,0.14)" : "0 10px 22px rgba(15,23,42,0.08)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    color: "rgba(15,23,42,0.88)",
    transition: "transform .14s ease, box-shadow .14s ease, background .14s ease",
    userSelect: "none",
  });

  const chipSmall = (active: boolean): React.CSSProperties => ({
    padding: "9px 11px",
    borderRadius: 999,
    border: `1px solid ${active ? "rgba(79,70,229,0.26)" : "rgba(15,23,42,0.08)"}`,
    background: active
      ? "linear-gradient(180deg, rgba(79,70,229,0.16), rgba(124,58,237,0.10))"
      : "rgba(255,255,255,0.82)",
    boxShadow: active ? "0 12px 24px rgba(79,70,229,0.12)" : "0 10px 18px rgba(15,23,42,0.06)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
    color: "rgba(15,23,42,0.84)",
    transition: "transform .12s ease, box-shadow .12s ease, background .12s ease",
    userSelect: "none",
  });

  const inputLight = (focused = false): React.CSSProperties => ({
    width: "100%",
    height: 48,
    padding: "10px 14px",
    borderRadius: 18,
    border: `1px solid ${focused ? "rgba(79,70,229,0.28)" : "rgba(15,23,42,0.10)"}`,
    background: "rgba(255,255,255,0.88)",
    color: "rgba(15,23,42,0.90)",
    fontSize: 13,
    outline: "none",
    boxShadow: focused ? "0 0 0 4px rgba(79,70,229,0.12)" : "none",
    boxSizing: "border-box",
  });

  const sx = useMemo(() => {
    const overlay: React.CSSProperties = {
      position: "fixed",
      inset: 0,
      background: "rgba(15,23,42,0.34)",
      backdropFilter: "blur(18px)",
      display: "grid",
      placeItems: "center",
      padding: 18,
      zIndex: 999,
    };

    const modal: React.CSSProperties = {
      width: "min(680px, 100%)",
      borderRadius: 30,
      background: "rgba(255,255,255,0.88)",
      border: "1px solid rgba(255,255,255,0.62)",
      boxShadow: "0 54px 140px rgba(15,23,42,0.28)",
      overflow: "hidden",
      position: "relative",
      animation: "popIn .18s ease both",
      maxHeight: "88vh",
      display: "flex",
      flexDirection: "column",
      backdropFilter: "blur(18px)",
    };

    const header: React.CSSProperties = {
      padding: "22px 24px",
      borderBottom: "1px solid rgba(15,23,42,0.08)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    };

    const closeBtn: React.CSSProperties = {
      color: "rgba(15,23,42,0.88)",
      width: 46,
      height: 46,
      borderRadius: 16,
      border: "1px solid rgba(15,23,42,0.10)",
      background: "rgba(255,255,255,0.92)",
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
    };

    const content: React.CSSProperties = {
      width: "100%",
      maxWidth: 560,
      display: "grid",
      gap: 16,
    };

    const sectionLabel: React.CSSProperties = {
      fontSize: 12,
      opacity: 0.72,
      marginBottom: 8,
      fontWeight: 800,
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
    };

    const actionBtn = (primary: boolean): React.CSSProperties => ({
      padding: 14,
      borderRadius: 18,
      border: `1px solid ${primary ? "rgba(79,70,229,0.24)" : "rgba(15,23,42,0.10)"}`,
      background: primary
        ? "linear-gradient(180deg, rgba(79,70,229,0.18), rgba(124,58,237,0.10))"
        : "rgba(255,255,255,0.82)",
      color: "rgba(15,23,42,0.90)",
      fontWeight: 900,
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

  const presetOre = [
    { label: "24h", ore: 24 },
    { label: "12h", ore: 12 },
    { label: "2h", ore: 2 },
    { label: "0,5h", ore: 0.5 },
    { label: "0,25h", ore: 0.25 },
  ];

  function toggleNotificaMin(min: number) {
    setNotificheMinutiPrima((prev) => {
      const has = prev.includes(min);
      const next = has ? prev.filter((x) => x !== min) : [...prev, min];
      return Array.from(new Set(next)).sort((a, b) => b - a);
    });
  }

  function toggleNotificaOre(ore: number) {
    const minuti = Math.max(1, Math.round(ore * 60));
    toggleNotificaMin(minuti);
  }

  function addCustomNotificaOre() {
    const ore = parseOreItaliane(customNotificaOre);
    if (ore === null) {
      alert("Inserisci ore valide (es: 1,5 oppure 2).");
      return;
    }
    setCustomNotificaOre("");
    toggleNotificaOre(ore);
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
          onAddScadenza={(dataSel) => apriNuovaConData(dataSel, "scadenza")}
          onAddAppuntamento={(dataSel) => apriNuovaConData(dataSel, "appuntamento")}
          onAddNota={(data) => apriNuovaConData(data, "nota")}
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
                          {ev.tipo === "scadenza" || ev.tipo === "appuntamento"
                        ? badgeTipo(ev.tipo)
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
          <div style={{ ...ui.card, padding: 18 }}>
            <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Entrate del mese</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
              Aggiungi manualmente ogni entrata con data, descrizione e importo
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                alignItems: "end",
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
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
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

          <div style={{ ...ui.card, padding: 18 }}>
            <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Uscite extra del mese</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
              Inserisci spese extra con data, descrizione, importo e nota
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                alignItems: "end",
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
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
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
              {eventiControlloMese.length === 0 ? (
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
                eventiControlloMese.map((ev) => {
                  const isEntrata = ev.movimento === "entrata";

                  return (
                    <div
                      key={`${ev.sorgente}_${ev.id}`}
                      style={{
                        padding: 14,
                        borderRadius: 18,
                        border: "1px solid rgba(15,23,42,0.08)",
                        background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "grid", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {ev.tipo === "scadenza" || ev.tipo === "appuntamento" ? (
                            badgeTipo(ev.tipo)
                          ) : isEntrata ? (
                            badgeMov("entrata")
                          ) : (
                            badgeMov("uscita")
                          )}

                          {ev.urgente && badgeUrgente()}
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 950 }}>{ev.titolo}</div>

                        <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                          {formattaDataBreve(ev.data)} • {ev.ora}
                        </div>

                        {ev.nota && (
                          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
                            {ev.nota}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
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
                            }}
                          >
                            {ev.importo.toLocaleString("it-IT")} €
                          </div>
                        )}

                        {ev.tipo === "scadenza" || ev.tipo === "appuntamento" ? (
                          <span style={styleBadgeScadenza(giorniMancanti(ev.data), ev.urgente)}>
                            {ev.urgente ? "URGENTE" : labelGiorni(giorniMancanti(ev.data))}
                          </span>
                        ) : null}
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
        0%, 100% { box-shadow: 0 16px 32px rgba(79,70,229,0.12); }
        50% { box-shadow: 0 24px 44px rgba(124,58,237,0.18); }
      }

      button[data-chip="1"]{
        transform: translateY(0);
        transition: transform .12s ease, filter .12s ease;
      }

      button[data-chip="1"]:hover{
        transform: translateY(-1px);
        filter: brightness(1.02);
      }

      button[data-chip="1"]:active{
        transform: translateY(0px) scale(0.985);
        filter: brightness(0.985);
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
                style={pagina === "home" ? chip(true) : chip(false)}
              >
                Home
              </button>

              <button
                data-chip="1"
                onClick={() => setPagina("agenda")}
                style={pagina === "agenda" ? chip(true) : chip(false)}
              >
                Agenda
              </button>

              <button
                data-chip="1"
                onClick={() => setPagina("controllo")}
                style={pagina === "controllo" ? chip(true) : chip(false)}
              >
                Controllo
              </button>

              <button
                data-chip="1"
                onClick={() => setPagina("archivio")}
                style={pagina === "archivio" ? chip(true) : chip(false)}
              >
                Archivio Generale
              </button>

              <button
                data-chip="1"
                onClick={apriNuova}
                title="Nuova voce"
                style={{
                  ...chip(false),
                  background: "linear-gradient(180deg, rgba(16,185,129,0.28), rgba(5,150,105,0.16))",
                  border: "1px solid rgba(16,185,129,0.36)",
                  boxShadow: "0 16px 34px rgba(16,185,129,0.22)",
                  color: "rgba(6,95,70,0.98)",
                  fontWeight: 1000,
                }}
              >
                + Nuova
              </button>

              <button data-chip="1" onClick={esci} style={chip(false)}>
                Esci
              </button>
            </div>
          </div>
        </div>










                {pagina === "home" && (
          <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 8, display: "grid", gap: 14 }}>
            {/* HERO HOME */}
            <div
              style={{
                ...ui.card,
                padding: 20,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(700px 260px at 0% 0%, rgba(79,70,229,0.08), transparent 60%), radial-gradient(700px 260px at 100% 0%, rgba(16,185,129,0.08), transparent 60%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
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
                      Home Dashboard
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        opacity: 0.68,
                      }}
                    >
                      Panoramica rapida di scadenze, appuntamenti, turni, ore e saldo del mese
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
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      border: "1px solid rgba(239,68,68,0.14)",
                      background: "linear-gradient(180deg, rgba(239,68,68,0.10), rgba(239,68,68,0.05))",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Prossime scadenze</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{scadenzeCountHome}</div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      border: "1px solid rgba(168,85,247,0.14)",
                      background: "linear-gradient(180deg, rgba(168,85,247,0.10), rgba(168,85,247,0.05))",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Prossimi appuntamenti</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{appuntamentiCountHome}</div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      border: "1px solid rgba(59,130,246,0.14)",
                      background: "linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.05))",
                    }}
                  >
                  
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      border: "1px solid rgba(124,58,237,0.14)",
                      background: "linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.05))",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore mese</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{formatNumeroOre(oreTotMese)} h</div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      border: "1px solid rgba(16,185,129,0.14)",
                      background: "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.05))",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Saldo mensile</div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 24,
                        fontWeight: 1000,
                        color: saldoMese >= 0 ? "rgba(5,150,105,0.96)" : "rgba(185,28,28,0.96)",
                      }}
                    >
                      {saldoMese.toLocaleString("it-IT")} €
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      border: "1px solid rgba(245,158,11,0.14)",
                      background: "linear-gradient(180deg, rgba(245,158,11,0.10), rgba(245,158,11,0.05))",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Urgenti / 7 giorni</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{vociUrgentiHome.length}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGA CENTRALE */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
              className="remember-grid-2"
            >
              <div style={{ ...ui.card, padding: 18 }}>
                <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Prossime scadenze</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  Le prime scadenze attive da tenere sotto controllo
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {prossimeScadenzeHome.length === 0 ? (
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
                      Nessuna scadenza attiva.
                    </div>
                  ) : (
                    prossimeScadenzeHome.map((v) => (
                      <div
                        key={v.id}
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          border: "1px solid rgba(15,23,42,0.08)",
                          background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "grid", gap: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {badgeTipo(v.tipo)}
                            {v.urgente && badgeUrgente()}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 950 }}>{v.titolo}</div>
                          <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                            {formattaDataBreve(v.data)} • {v.ora}
                          </div>
                        </div>

                        <span style={styleBadgeScadenza(giorniMancanti(v.data), v.urgente)}>
                          {v.urgente ? "URGENTE" : labelGiorni(giorniMancanti(v.data))}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ ...ui.card, padding: 18 }}>
                <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Prossimi appuntamenti</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  I prossimi appuntamenti in programma
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {prossimiAppuntamentiHome.length === 0 ? (
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
                      Nessun appuntamento attivo.
                    </div>
                  ) : (
                    prossimiAppuntamentiHome.map((v) => (
                      <div
                        key={v.id}
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          border: "1px solid rgba(15,23,42,0.08)",
                          background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "grid", gap: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {badgeTipo(v.tipo)}
                            {v.urgente && badgeUrgente()}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 950 }}>{v.titolo}</div>
                          <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                            {formattaDataBreve(v.data)} • {v.ora}
                          </div>
                        </div>

                        <span style={styleBadgeScadenza(giorniMancanti(v.data), v.urgente)}>
                          {v.urgente ? "URGENTE" : labelGiorni(giorniMancanti(v.data))}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* RIGA BASSA */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
              className="remember-grid-2"
            >
              <div style={{ ...ui.card, padding: 18 }}>
                <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Riepilogo turni del mese</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  Statistiche rapide sulle sigle turno
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                    gap: 10,
                  }}
                >
                  {(["N", "M", "P", "S", "R", "T"] as const).map((sigla) => (
                    <div
                      key={sigla}
                      style={{
                        padding: 14,
                        borderRadius: 18,
                        border: "1px solid rgba(59,130,246,0.12)",
                        background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03))",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>{sigla}</div>
                      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 1000 }}>
                        {turniStatsMese[sigla]}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  {turniOrdinatiMese.length === 0 ? (
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
                      Nessun turno inserito nel mese.
                    </div>
                  ) : (
                    turniOrdinatiMese.slice(0, 5).map((t) => {
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
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "grid", gap: 5 }}>
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
                          </div>

                          <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                            {isRiposo
                              ? "Riposo"
                              : `${formatNumeroOre(t.oreOrdinarie + t.oreStraordinarie)} h`}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ ...ui.card, padding: 18 }}>
                <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Centro controllo sintetico</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  Vista veloce di economia e ore del mese
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
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
                      {entrateTotMese.toLocaleString("it-IT")} €
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
                      {usciteTotMese.toLocaleString("it-IT")} €
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
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore ordinarie</div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                      {formatNumeroOre(oreOrdMese)} h
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
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore straordinarie</div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                      {formatNumeroOre(oreStraMese)} h
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
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore totali mese</div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                      {formatNumeroOre(oreTotMese)} h
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "rgba(255,255,255,0.78)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Saldo mensile</div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 22,
                        fontWeight: 1000,
                        color: saldoMese >= 0 ? "rgba(5,150,105,0.96)" : "rgba(185,28,28,0.96)",
                      }}
                    >
                      {saldoMese.toLocaleString("it-IT")} €
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}














               {pagina === "agenda" && (
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
                      Conteggio automatico dai turni F
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
        {pagina === "controllo" && renderAreaControllo()}

        
       







                     {pagina === "archivio" && (
          <>
            <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 14, display: "grid", gap: 14 }}>
              <div
                style={{
                  ...ui.card,
                  padding: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

                      return (
                        <div
                          key={`${ev.origine}_${ev.id}`}
                          style={{
                            padding: 14,
                            borderRadius: 18,
                            border: "1px solid rgba(15,23,42,0.08)",
                            background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88))",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "grid", gap: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              {ev.tipo === "scadenza" || ev.tipo === "appuntamento" ? (
                                badgeTipo(ev.tipo)
                              ) : isEntrata ? (
                                badgeMov("entrata")
                              ) : (
                                badgeMov("uscita")
                              )}

                              {ev.urgente && badgeUrgente()}
                            </div>

                            <div style={{ fontSize: 15, fontWeight: 950 }}>{ev.titolo}</div>

                            <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.72 }}>
                              {formattaDataBreve(ev.data)} • {ev.ora}
                            </div>

                            {ev.nota && (
                              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>
                                {ev.nota}
                              </div>
                            )}
                          </div>

                          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
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
                                }}
                              >
                                {ev.importo.toLocaleString("it-IT")} €
                              </div>
                            )}

                            {ev.tipo === "scadenza" || ev.tipo === "appuntamento" ? (
                              <span style={styleBadgeScadenza(giorniMancanti(ev.data), ev.urgente)}>
                                {ev.urgente ? "URGENTE" : labelGiorni(giorniMancanti(ev.data))}
                              </span>
                            ) : null}
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
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ display: "grid", gap: 5 }}>
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
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>














            <DraggableFab onClick={apriNuova} label="Aggiungi" />

          {mostraForm && (
        <div
          style={sx.overlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) chiudiForm();
          }}
        >
          <div style={sx.modal}>
            <div style={sx.header}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>
                  {idInModifica ? "Modifica voce" : "Nuova voce"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, fontWeight: 800 }}>
                  Inserisci i dati e salva
                </div>
              </div>

              <button
                type="button"
                data-chip="1"
                onMouseEnter={() => setHoverClose(true)}
                onMouseLeave={() => setHoverClose(false)}
                onClick={chiudiForm}
                style={{ ...sx.closeBtn, ...(hoverClose ? sx.closeBtnHover : {}) }}
                title="Chiudi"
              >
                ✕
              </button>
            </div>

            <div style={sx.body}>
              <div style={sx.content}>
                <div>
                  <div style={sx.sectionLabel}>Tipo</div>
                  <div style={sx.pills2}>
                    <button
                      type="button"
                      data-chip="1"
                      onClick={() => setTipo("scadenza")}
                      style={chipSmall(tipo === "scadenza")}
                    >
                      Scadenza
                    </button>
                    <button
                      type="button"
                      data-chip="1"
                      onClick={() => setTipo("appuntamento")}
                      style={chipSmall(tipo === "appuntamento")}
                    >
                      Appuntamento
                    </button>
                    <button
                      type="button"
                      data-chip="1"
                      onClick={() => setTipo("nota")}
                      style={chipSmall(tipo === "nota")}
                    >
                      Nota rapida
                    </button>
                  </div>
                </div>

                <div>
                  <div style={sx.sectionLabel}>
                    {tipo === "nota" ? "Titolo nota" : "Titolo"}
                  </div>
                  <input
                    value={titolo}
                    onChange={(e) => setTitolo(e.target.value)}
                    placeholder={tipo === "nota" ? "Es: Da ricordare / Nota veloce" : "Es: Affitto / Dentista"}
                    style={inputLight(false)}
                  />
                </div>

                <div style={sx.row2}>
                  <div>
                    <div style={sx.sectionLabel}>
                      {tipo === "nota" ? "Data (facoltativa)" : "Data"}
                    </div>
                    <input
                      type="date"
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>

                  <div>
                    <div style={sx.sectionLabel}>
                      {tipo === "nota" ? "Ora (facoltativa)" : "Ora"}
                    </div>
                    <input
                      type="time"
                      value={ora}
                      onChange={(e) => setOra(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>
                </div>

                {tipo !== "nota" && (
                  <div>
                    <div style={sx.sectionLabel}>Importo uscita (€) facoltativo</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={importo}
                      onChange={(e) => setImporto(e.target.value)}
                      placeholder="Es: 650"
                      style={inputLight(false)}
                    />

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: 850,
                        opacity: 0.72,
                        lineHeight: 1.35,
                      }}
                    >
                      Qui inserisci solo eventuali uscite collegate a scadenze o appuntamenti. Le entrate si inseriscono solo nell’area Controllo.
                    </div>
                  </div>
                )}

                <div>
                  <div style={sx.sectionLabel}>{tipo === "nota" ? "Testo nota" : "Nota"}</div>
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={4}
                    placeholder={tipo === "nota" ? "Scrivi una nota veloce..." : "Scrivi una nota..."}
                    style={{
                      ...inputLight(false),
                      height: "auto",
                      minHeight: 110,
                      resize: "vertical",
                      lineHeight: 1.4,
                    }}
                  />
                </div>

                {tipo !== "nota" && (
                  <div>
                    <div style={sx.sectionLabel}>Stato</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        data-chip="1"
                        onClick={() => setUrgente((v) => !v)}
                        style={{
                          ...chipSmall(urgente),
                          background: urgente
                            ? "linear-gradient(180deg, rgba(239,68,68,0.22), rgba(220,38,38,0.12))"
                            : "rgba(255,255,255,0.82)",
                          border: urgente ? "1px solid rgba(239,68,68,0.30)" : "1px solid rgba(15,23,42,0.08)",
                          boxShadow: urgente
                            ? "0 14px 28px rgba(239,68,68,0.18)"
                            : "0 10px 18px rgba(15,23,42,0.06)",
                        }}
                      >
                        {urgente ? "Urgente attivo" : "Segna come urgente"}
                      </button>

                      {urgente && badgeUrgente()}
                      {badgeTipo(tipo)}
                    </div>
                  </div>
                )}

                {tipo !== "nota" && (
                  <div>
                    <div style={sx.sectionLabel}>Notifiche (ore prima)</div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {presetOre.map((p) => {
                        const min = Math.max(1, Math.round(p.ore * 60));
                        const active = notificheMinutiPrima.includes(min);
                        return (
                          <button
                            type="button"
                            data-chip="1"
                            key={p.label}
                            onClick={() => toggleNotificaOre(p.ore)}
                            style={chipSmall(active)}
                            title={`${p.ore} ore prima`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                      <input
                        value={customNotificaOre}
                        onChange={(e) => setCustomNotificaOre(e.target.value)}
                        placeholder="Ore custom (es: 1,5)"
                        style={inputLight(false)}
                        inputMode="decimal"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomNotificaOre();
                          }
                        }}
                      />
                      <button type="button" data-chip="1" onClick={addCustomNotificaOre} style={chip(true)}>
                        Aggiungi
                      </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, opacity: 0.7, lineHeight: 1.35 }}>
                      Le notifiche sono in-app: funzionano se l’app resta aperta.
                    </div>
                  </div>
                )}

                {tipo === "nota" && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "rgba(248,250,252,0.88)",
                      fontSize: 12,
                      fontWeight: 850,
                      opacity: 0.76,
                      lineHeight: 1.4,
                    }}
                  >
                    Se lasci la data vuota, la nota verrà considerata nota libera del mese corrente e la collegheremo all’Archivio Generale nel prossimo step.
                  </div>
                )}
              </div>
            </div>

            <div style={sx.footer}>
              <button type="button" data-chip="1" onClick={chiudiForm} style={sx.actionBtn(false)}>
                Annulla
              </button>
              <button type="button" data-chip="1" onClick={salva} style={sx.actionBtn(true)}>
                Salva
              </button>
            </div>
          </div>
        </div>
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
                <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: -0.3 }}>
                  {turnoIdInModifica ? "Modifica turno" : "Nuovo turno"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 5, fontWeight: 800 }}>
                  {turnoIdInModifica
                    ? "Modifica turno, ore ordinarie e straordinarie"
                    : "Inserisci turno, ore ordinarie e straordinarie"}
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
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(170px, 220px) 1fr",
                    gap: 14,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <div style={sx.sectionLabel}>Data</div>
                    <input
                      type="date"
                      value={turnoData}
                      onChange={(e) => setTurnoData(e.target.value)}
                      style={inputLight(false)}
                    />
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 18,
                      border: "1px solid rgba(79,70,229,0.10)",
                      background:
                        "linear-gradient(180deg, rgba(79,70,229,0.06), rgba(124,58,237,0.03))",
                      fontSize: 12,
                      fontWeight: 850,
                      color: "rgba(67,56,202,0.92)",
                    }}
                  >
                    Scegli un preset rapido oppure imposta manualmente orari e ore.
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(15,23,42,0.06)",
                    background: "rgba(255,255,255,0.72)",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div>
                    <div style={sx.sectionLabel}>Turno predefinito</div>

                    <select
                      value={turnoPreset}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTurnoPreset(val);

                        if (!val) return;

                        if (val === "RIPOSO") {
                          setTurnoInizio("RIPOSO");
                          setTurnoFine("RIPOSO");
                          setTurnoOreOrd("0");
                          setTurnoOreStraord("");
                          return;
                        }

                        if (val === "FERIE") {
                          setTurnoInizio("FERIE");
                          setTurnoFine("FERIE");
                          setTurnoOreOrd("8");
                          setTurnoOreStraord("");
                          return;
                        }

                        const parti = val.split("-");
                        if (parti.length !== 2) return;

                        let start = parti[0].trim();
                        let end = parti[1].trim();

                        if (/^\d$/.test(start)) start = `0${start}`;
                        if (/^\d$/.test(end)) end = `0${end}`;

                        if (end === "24") end = "00";

                        setTurnoInizio(`${start}:00`);
                        setTurnoFine(`${end}:00`);
                      }}
                      style={{
                        ...inputLight(false),
                        background: "rgba(255,255,255,0.92)",
                        fontWeight: 900,
                      }}
                      title="Seleziona turno predefinito"
                    >
                            <option value="">Seleziona turno predefinito</option>
{presetTurni
  .filter((p) => p !== "RIPOSO" && p !== "FERIE")
  .map((p) => (
    <option key={p} value={p}>
      {p}
    </option>
  ))}
<option value="RIPOSO">RIPOSO</option>
<option value="FERIE">FERIE</option>
                    </select>
                  </div>

                  <div style={sx.row2}>
                    <div>
                      <div style={sx.sectionLabel}>Inizio turno</div>
                      <input
                        type={
                          turnoInizio === "RIPOSO" || turnoInizio === "FERIE" ? "text" : "time"
                        }
                        value={turnoInizio}
                        onChange={(e) => setTurnoInizio(e.target.value)}
                        style={inputLight(false)}
                      />
                    </div>

                    <div>
                      <div style={sx.sectionLabel}>Fine turno</div>
                      <input
                        type={
                          turnoFine === "RIPOSO" || turnoFine === "FERIE" ? "text" : "time"
                        }
                        value={turnoFine}
                        onChange={(e) => setTurnoFine(e.target.value)}
                        style={inputLight(false)}
                      />
                    </div>
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
                      border: "1px solid rgba(16,185,129,0.10)",
                      background:
                        "linear-gradient(180deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))",
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
                    <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, opacity: 0.58 }}>
                      Per FERIE puoi lasciare 8 come base.
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 16,
                      borderRadius: 22,
                      border: "1px solid rgba(249,115,22,0.10)",
                      background:
                        "linear-gradient(180deg, rgba(249,115,22,0.06), rgba(249,115,22,0.02))",
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
                    <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, opacity: 0.58 }}>
                      Campo facoltativo.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 22,
                    border: "1px solid rgba(15,23,42,0.06)",
                    background: "rgba(255,255,255,0.72)",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                  }}
                >
                  <div style={sx.sectionLabel}>Note</div>
                  <textarea
                    value={turnoNote}
                    onChange={(e) => setTurnoNote(e.target.value)}
                    rows={4}
                    placeholder="Note turno..."
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
              <button type="button" data-chip="1" onClick={chiudiTurnoForm} style={sx.actionBtn(false)}>
                Annulla
              </button>
              <button type="button" data-chip="1" onClick={salvaTurno} style={sx.actionBtn(true)}>
                {turnoIdInModifica ? "Salva modifiche" : "Salva turno"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}