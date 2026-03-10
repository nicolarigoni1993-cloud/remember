import React, { useEffect, useMemo, useRef, useState } from "react";

type Filtro = "oggi" | "7giorni" | "30giorni";
type Movimento = "uscita" | "entrata";

type Voce = {
  id: string;
  titolo: string;
  data: string;
  ora: string;
  tipo: "scadenza" | "appuntamento";
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

type IncassiMese = {
  entrateExtra: EntrataExtra[];
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
    tipo: x?.tipo === "appuntamento" ? "appuntamento" : "scadenza",
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
      const extrasRaw = Array.isArray((v as any)?.entrateExtra) ? (v as any).entrateExtra : [];

      out[k] = {
        entrateExtra: extrasRaw
          .map((x: any) => ({
            id: String(x?.id ?? safeUUID()),
            data: String(x?.data ?? ""),
            descrizione: String(x?.descrizione ?? "").trim(),
            importo: Number(x?.importo ?? 0) || 0,
          }))
          .filter((x: EntrataExtra) => x.descrizione.length > 0 && x.importo > 0),
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

function salvaTurni(userId: string, turni: Turno[]) {
  localStorage.setItem(kTurni(userId), JSON.stringify(turni));
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
  const defaultPos: FabPos = {
    x: window.innerWidth - 110,
    y: window.innerHeight - 150,
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

  const [pagina, setPagina] = useState<"home" | "archivio" | "controllo">("home");
  const [mostraForm, setMostraForm] = useState(false);
  const [idInModifica, setIdInModifica] = useState<string | null>(null);

  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:00");
  const [tipo, setTipo] = useState<Voce["tipo"]>("scadenza");
  const [urgente, setUrgente] = useState(false);
  const [nota, setNota] = useState("");
  
  

  const [notificheMinutiPrima, setNotificheMinutiPrima] = useState<number[]>([]);
  const [customNotificaOre, setCustomNotificaOre] = useState<string>("");

  const [voci, setVoci] = useState<Voce[]>([]);
  const [turni, setTurni] = useState<Turno[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [incassi, setIncassi] = useState<Record<string, IncassiMese>>({});
  const [adesso, setAdesso] = useState(new Date());
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [meseCorrente, setMeseCorrente] = useState(new Date());

  const [nuovaEntrataData, setNuovaEntrataData] = useState(new Date().toISOString().slice(0, 10));
  const [nuovaEntrataDesc, setNuovaEntrataDesc] = useState("");
  const [nuovaEntrataImporto, setNuovaEntrataImporto] = useState("");

  const [mostraTurnoForm, setMostraTurnoForm] = useState(false);
  const [turnoData, setTurnoData] = useState(new Date().toISOString().slice(0, 10));
  const [turnoInizio, setTurnoInizio] = useState("08:00");
  const [turnoFine, setTurnoFine] = useState("16:00");
  const [turnoOreOrd, setTurnoOreOrd] = useState("");
  const [turnoOreStraord, setTurnoOreStraord] = useState("");
  const [turnoNote, setTurnoNote] = useState("");
  const [turnoPreset, setTurnoPreset] = useState("");
  const presetTurni = ["00-06", "06-12", "12-18", "18-24", "6-14", "14-22", "22-06", "8-18", "8-17"];

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
      setCaricato(false);
      return;
    }

    salvaUtenteCorrente(currentUserId);
    setVoci(caricaVociDaMemoria(currentUserId));
    setTurni(caricaTurni(currentUserId));
    setIncassi(caricaIncassi(currentUserId));
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
    if (!currentUserId) return;
    clearAllScheduled();
    voci.forEach(scheduleNotificationsForVoce);
  }, [voci, currentUserId]);

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
    setNotificheMinutiPrima([]);
    setCustomNotificaOre("");
  }

  function apriNuova() {
    resetForm();
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
    setNotificheMinutiPrima(v.notificheMinutiPrima ?? []);
    setMostraForm(true);
  }

  function salva() {
    if (classNameIsEmpty(titolo) || classNameIsEmpty(data) || classNameIsEmpty(ora)) {
      alert("Compila titolo, data e ora");
      return;
    }

    const notiUniq = Array.from(new Set(notificheMinutiPrima))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a);

    if (idInModifica) {
      setVoci((prev) =>
        prev.map((x) =>
          x.id === idInModifica
            ? {
                ...x,
                titolo: titolo.trim(),
                data,
                ora,
                tipo,
                urgente,
                nota: nota.trim(),
                importo: null,
                movimento: "uscita",
                notificheMinutiPrima: notiUniq,
              }
            : x
        )
      );
    } else {
      const nuova: Voce = {
        id: safeUUID(),
        titolo: titolo.trim(),
        data,
        ora,
        tipo,
        urgente,
        nota: nota.trim(),
        importo: null,
        movimento: "uscita",
        fatto: false,
        notificheMinutiPrima: notiUniq,
      };
      setVoci((prev) => [nuova, ...prev]);
    }

    chiudiForm();
  }

function apriTurnoForm(dataSelezionata?: string) {
  setTurnoData(dataSelezionata || new Date().toISOString().slice(0, 10));
  setTurnoInizio("08:00");
  setTurnoFine("16:00");
  setTurnoOreOrd("");
  setTurnoOreStraord("");
  setTurnoNote("");
  setTurnoPreset("");
  setMostraTurnoForm(true);
}

function chiudiTurnoForm() {
  setMostraTurnoForm(false);
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

  const nuovo: Turno = {
    id: safeUUID(),
    data: turnoData,
    inizio: turnoInizio,
    fine: turnoFine,
    oreOrdinarie: oreOrd,
    oreStraordinarie: oreStra,
    note: turnoNote.trim(),
  };

  setTurni((prev) => [nuovo, ...prev]);
  chiudiTurnoForm();
}

  function eliminaTurno(id: string) {
    const ok = confirm("Vuoi eliminare questo turno?");
    if (!ok) return;
    setTurni((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleFatto(id: string) {
    setVoci((prev) => prev.map((v) => (v.id === id ? { ...v, fatto: true } : v)));
  }

  function ripristina(id: string) {
    setVoci((prev) => prev.map((v) => (v.id === id ? { ...v, fatto: false } : v)));
  }

  function elimina(id: string) {
    const ok = confirm("Vuoi eliminare questa voce?");
    if (!ok) return;
    clearScheduledForVoce(id);
    setVoci((prev) => prev.filter((v) => v.id !== id));
  }

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
      },
    }));
  }

  const totaleEntrateExtra = useMemo(() => entrateExtraVal.reduce((s, x) => s + x.importo, 0), [entrateExtraVal]);

  const turniMese = useMemo(() => turni.filter((t) => stessoMeseSelezionato(t.data)), [turni, meseCorrente]);
  const oreOrdMese = useMemo(() => turniMese.reduce((s, t) => s + t.oreOrdinarie, 0), [turniMese]);
  const oreStraMese = useMemo(() => turniMese.reduce((s, t) => s + t.oreStraordinarie, 0), [turniMese]);
  const oreTotMese = useMemo(() => oreOrdMese + oreStraMese, [oreOrdMese, oreStraMese]);

  const vociMeseNonFatte = useMemo(
    () => voci.filter((v) => !v.fatto && stessoMeseSelezionato(v.data)),
    [voci, meseCorrente]
  );

  const uscitePrevisteNonFatte = useMemo(
    () =>
      vociMeseNonFatte
        .filter((v) => v.importo !== null && v.movimento === "uscita")
        .reduce((s, v) => s + (v.importo ?? 0), 0),
    [vociMeseNonFatte]
  );

  const entrateVociNonFatte = useMemo(
    () =>
      vociMeseNonFatte
        .filter((v) => v.importo !== null && v.movimento === "entrata")
        .reduce((s, v) => s + (v.importo ?? 0), 0),
    [vociMeseNonFatte]
  );

  const entrateTotMese = totaleEntrateExtra + entrateVociNonFatte;
  const usciteTotMese = uscitePrevisteNonFatte;
  const saldoMese = entrateTotMese - usciteTotMese;

  const vociDelMesePerCalendario = useMemo(() => {
    const base = pagina === "archivio" ? voci.filter((v) => v.fatto) : voci.filter((v) => !v.fatto);
    return base.filter((v) => stessoMeseSelezionato(v.data));
  }, [voci, meseCorrente, pagina]);

  function vociFiltrate() {
    const base = pagina === "archivio" ? voci.filter((v) => v.fatto) : voci.filter((v) => !v.fatto);
    const nelMese = base.filter((v) => stessoMeseSelezionato(v.data));

    if (filtro === null) return ordinaIntelligente(nelMese);

    const oggi = new Date();
    const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
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

  const lista = vociFiltrate();

  function badgeTipo(t: Voce["tipo"]) {
    const map = {
      scadenza: {
        bg: "rgba(52,211,153,0.16)",
        bd: "rgba(5,150,105,0.26)",
        tx: "rgba(6,95,70,0.98)",
      },
      appuntamento: {
        bg: "rgba(168,85,247,0.16)",
        bd: "rgba(147,51,234,0.24)",
        tx: "rgba(91,33,182,0.98)",
      },
    } as const;

    const s = map[t];
    return (
      <span
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 900,
          background: s.bg,
          border: `1px solid ${s.bd}`,
          color: s.tx,
        }}
      >
        {t === "scadenza" ? "Scadenza" : "Appuntamento"}
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
}: {
  mese: Date;
  vociDelMese: Voce[];
  turniDelMese: Turno[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      const touch =
        window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(pointer: coarse)").matches ||
        "ontouchstart" in window;

      setIsTouchDevice(touch || window.innerWidth <= 820);
    };

    checkTouch();
    window.addEventListener("resize", checkTouch);
    return () => window.removeEventListener("resize", checkTouch);
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
    width: isTouchDevice ? 42 : 46,
    height: isTouchDevice ? 42 : 46,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "rgba(255,255,255,0.86)",
    boxShadow: "0 10px 22px rgba(15,23,42,0.08)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    fontSize: 20,
    fontWeight: 1000,
    color: "rgba(15,23,42,0.88)",
  };

  const weekdayHeader = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

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
            gridTemplateColumns: "42px 1fr 42px",
            alignItems: "center",
            gap: isTouchDevice ? 8 : 14,
            marginBottom: 14,
          }}
        >
          <button type="button" onClick={onPrevMonth} style={navBtnStyle} title="Mese precedente">
            ←
          </button>

          <div
            style={{
              textAlign: "center",
              fontSize: isTouchDevice ? 18 : 28,
              fontWeight: 1000,
              letterSpacing: -0.6,
              textTransform: "capitalize",
              color: "rgba(15,23,42,0.94)",
              lineHeight: 1.1,
            }}
          >
            {titoloMese}
          </div>

          <button type="button" onClick={onNextMonth} style={navBtnStyle} title="Mese successivo">
            →
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: isTouchDevice ? 4 : 10,
            marginBottom: isTouchDevice ? 8 : 12,
          }}
        >
          {weekdayHeader.map((w, i) => {
            const weekend = i === 5 || i === 6;
            return (
              <div
                key={w}
                style={{
                  textAlign: "center",
                  fontSize: isTouchDevice ? 10 : 11,
                  fontWeight: 1000,
                  letterSpacing: 0.4,
                  color: weekend ? "rgba(185,28,28,0.86)" : "rgba(22,101,52,0.80)",
                  textTransform: "uppercase",
                  paddingBottom: 2,
                }}
              >
                {w}
              </div>
            );
          })}
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

                      {turniCount > 0 && (
                        <div
                          style={{
                            minWidth: isTouchDevice ? 20 : 24,
                            padding: isTouchDevice ? "2px 6px" : "4px 10px",
                            borderRadius: 999,
                            fontSize: isTouchDevice ? 10 : 12,
                            fontWeight: 950,
                            color: "rgba(255,255,255,0.98)",
                            background: "linear-gradient(180deg, rgba(59,130,246,0.96), rgba(37,99,235,0.92))",
                            boxShadow: "0 10px 18px rgba(15,23,42,0.12)",
                          }}
                          title={`${turniCount} turno${turniCount > 1 ? "i" : ""}`}
                        >
                          T
                        </div>
                      )}

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
                        fontSize: isTouchDevice ? 9 : 10,
                        fontWeight: 1000,
                        cursor: "pointer",
                        textTransform: "uppercase",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                      title="Turno"
                    >
                      turno
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

                      {previewTurni.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            padding: 11,
                            borderRadius: 18,
                            background: "rgba(59,130,246,0.08)",
                            border: "1px solid rgba(59,130,246,0.14)",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 950, color: "rgba(30,64,175,0.95)" }}>
                              Turno {t.inizio} - {t.fine}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(30,64,175,0.82)" }}>
                              {formatNumeroOre(t.oreOrdinarie + t.oreStraordinarie)}h
                            </span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.78 }}>
                            Ord: {formatNumeroOre(t.oreOrdinarie)}h • Straord: {formatNumeroOre(t.oreStraordinarie)}h
                          </div>
                        </div>
                      ))}
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

                      {previewTurni.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            padding: 11,
                            borderRadius: 16,
                            background: "rgba(59,130,246,0.08)",
                            border: "1px solid rgba(59,130,246,0.14)",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(30,64,175,0.95)" }}>
                            Turno {t.inizio} - {t.fine}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 850, opacity: 0.78 }}>
                            Ord: {formatNumeroOre(t.oreOrdinarie)}h • Straord: {formatNumeroOre(t.oreStraordinarie)}h
                          </div>
                        </div>
                      ))}
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
            fontSize: 12,
            fontWeight: 850,
            opacity: 0.75,
            lineHeight: 1.35,
          }}
        >
          Desktop: passa col mouse sui giorni. Mobile: tocca il giorno per vedere dettagli. Il pulsante turno resta sempre dentro la casella senza sovrapporsi.
        </div>
      </div>
    </div>
  );
}





  function renderAreaControllo() {
    const controlloCardStyle: React.CSSProperties = {
      ...ui.card,
      padding: 20,
      overflow: "hidden",
      position: "relative",
    };

    const statBox = (accent: "blue" | "green" | "red" | "violet"): React.CSSProperties => {
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
      };

      return {
        padding: 16,
        borderRadius: 22,
        border: `1px solid ${map[accent].bd}`,
        background: map[accent].bg,
        boxShadow: map[accent].shadow,
      };
    };

    const totaleGrafico = Math.max(entrateTotMese + usciteTotMese, 1);
    const percEntrate = (entrateTotMese / totaleGrafico) * 100;
    const percUscite = (usciteTotMese / totaleGrafico) * 100;

    const prossimeUrgenti = ordinaIntelligente(
      voci
        .filter((v) => !v.fatto)
        .filter((v) => v.urgente || giorniMancanti(v.data) <= 7)
        .slice()
    ).slice(0, 5);

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
                  Centro controllo
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    opacity: 0.66,
                  }}
                >
                  Denaro, turni, ore mensili e scadenze sotto controllo
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
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate totali</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>
                  {entrateTotMese.toLocaleString("it-IT")} €
                </div>
              </div>

              <div style={statBox("red")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Uscite totali</div>
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

              <div style={statBox("violet")}>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Voci attive</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{vociMeseNonFatte.length}</div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "1.3fr 1fr",
                gap: 14,
              }}
            >
              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(15,23,42,0.08)",
                  background: "rgba(255,255,255,0.72)",
                  boxShadow: "0 14px 28px rgba(15,23,42,0.06)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(15,23,42,0.92)" }}>
                  Andamento del mese
                </div>

                <div
                  style={{
                    marginTop: 12,
                    height: 18,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "rgba(226,232,240,0.9)",
                    display: "flex",
                  }}
                >
                  <div
                    style={{
                      width: `${percEntrate}%`,
                      background: "linear-gradient(90deg, rgba(16,185,129,0.95), rgba(5,150,105,0.92))",
                    }}
                  />
                  <div
                    style={{
                      width: `${percUscite}%`,
                      background: "linear-gradient(90deg, rgba(239,68,68,0.95), rgba(220,38,38,0.92))",
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: "rgba(16,185,129,0.95)",
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                      Entrate: {entrateTotMese.toLocaleString("it-IT")} €
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: "rgba(239,68,68,0.95)",
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                      Uscite: {usciteTotMese.toLocaleString("it-IT")} €
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  border: "1px solid rgba(15,23,42,0.08)",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(248,250,252,0.78))",
                  boxShadow: "0 14px 28px rgba(15,23,42,0.06)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 950, color: "rgba(15,23,42,0.92)" }}>
                  Focus rapido
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 18,
                      border: "1px solid rgba(239,68,68,0.12)",
                      background: "rgba(254,242,242,0.84)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Scadenze/appuntamenti imminenti</div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{prossimeUrgenti.length}</div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 18,
                      border: "1px solid rgba(16,185,129,0.12)",
                      background: "rgba(236,253,245,0.84)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate inserite</div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{entrateExtraVal.length}</div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 18,
                      border: "1px solid rgba(59,130,246,0.12)",
                      background: "rgba(239,246,255,0.84)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Turni nel mese</div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{turniMese.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

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
              Aggiungi
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
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Entrate</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>
                {totaleEntrateExtra.toLocaleString("it-IT")} €
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
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Numero entrate</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{entrateExtraVal.length}</div>
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
                      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.65 }}>{formattaDataBreve(x.data)}</div>
                      <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950 }}>{x.descrizione}</div>
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
          <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Ore e turni del mese</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            Monitoraggio mensile di ore ordinarie, straordinarie e totale
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
                border: "1px solid rgba(59,130,246,0.12)",
                background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(59,130,246,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Turni</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{turniMese.length}</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(16,185,129,0.12)",
                background: "linear-gradient(180deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore ordinarie</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{formatNumeroOre(oreOrdMese)} h</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(249,115,22,0.16)",
                background: "linear-gradient(180deg, rgba(249,115,22,0.08), rgba(249,115,22,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore straordinarie</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{formatNumeroOre(oreStraMese)} h</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(124,58,237,0.12)",
                background: "linear-gradient(180deg, rgba(124,58,237,0.08), rgba(124,58,237,0.03))",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Ore totali</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1000 }}>{formatNumeroOre(oreTotMese)} h</div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {turniMese.length === 0 ? (
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
              turniMese
                .slice()
                .sort((a, b) => a.data.localeCompare(b.data) || a.inizio.localeCompare(b.inizio))
                .map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: "1px solid rgba(59,130,246,0.16)",
                      background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(59,130,246,0.04))",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.65 }}>{formattaDataBreve(t.data)}</div>
                      <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950 }}>
                        Turno {t.inizio} - {t.fine}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900, color: "rgba(30,64,175,0.95)" }}>
                        Ord: {formatNumeroOre(t.oreOrdinarie)}h • Straord: {formatNumeroOre(t.oreStraordinarie)}h • Tot:{" "}
                        {formatNumeroOre(t.oreOrdinarie + t.oreStraordinarie)}h
                      </div>
                      {t.note && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, opacity: 0.72 }}>{t.note}</div>}
                    </div>

                    <button data-chip="1" onClick={() => eliminaTurno(t.id)} style={chip(false)}>
                      Elimina
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        <div style={{ ...ui.card, padding: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Filtri rapidi</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                Applica filtri alla lista della Home e dell’Archivio
              </div>
            </div>

            <button
              data-chip="1"
              onClick={() => setFiltro(null)}
              style={{
                ...chip(false),
                opacity: 0.92,
              }}
            >
              Reset filtri
            </button>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              data-chip="1"
              onClick={() => setFiltro((p) => (p === "oggi" ? null : "oggi"))}
              style={chip(filtro === "oggi")}
            >
              Oggi
            </button>

            <button
              data-chip="1"
              onClick={() => setFiltro((p) => (p === "7giorni" ? null : "7giorni"))}
              style={chip(filtro === "7giorni")}
            >
              7 giorni
            </button>

            <button
              data-chip="1"
              onClick={() => setFiltro((p) => (p === "30giorni" ? null : "30giorni"))}
              style={chip(filtro === "30giorni")}
            >
              30 giorni
            </button>

            <button data-chip="1" onClick={() => setFiltro(null)} style={chip(filtro === null)}>
              Tutte
            </button>
          </div>
        </div>

        <div style={{ ...ui.card, padding: 18 }}>
          <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 18 }}>Scadenze da tenere d’occhio</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            Le prossime voci urgenti o vicine
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {prossimeUrgenti.length === 0 ? (
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
                Nessuna voce urgente o imminente.
              </div>
            ) : (
              prossimeUrgenti.map((v) => (
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
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button data-chip="1" onClick={() => setPagina("home")} style={pagina === "home" ? chip(true) : chip(false)}>
                Home
              </button>

              <button
                data-chip="1"
                onClick={() => setPagina("archivio")}
                style={pagina === "archivio" ? chip(true) : chip(false)}
              >
                Archivio
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

        {pagina === "controllo" ? (
          renderAreaControllo()
        ) : (
          <>
            <MiniCalendario
              mese={meseCorrente}
              vociDelMese={vociDelMesePerCalendario}
              turniDelMese={turniMese}
              onPrevMonth={mesePrecedente}
              onNextMonth={meseSuccessivo}
            />

            <div style={{ maxWidth: 1060, margin: "0 auto", marginTop: 14 }}>
              {lista.length === 0 ? (
                <div style={{ ...ui.card, padding: 18, opacity: 0.85 }}>Nessuna voce in questo periodo.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {lista.map((v, idx) => (
                    <div
                      key={v.id}
                      style={{
                        ...ui.card,
                        padding: 18,
                        animation: "cardIn .18s ease both",
                        animationDelay: `${Math.min(idx, 10) * 35}ms`,
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
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {badgeTipo(v.tipo)}
                          {v.urgente && badgeUrgente()}
                          {v.importo !== null && badgeMov(v.movimento)}

                          <button
                            type="button"
                            style={{
                              ...chipSmall(false),
                              cursor: "default",
                              opacity: 0.92,
                              boxShadow: "0 10px 20px rgba(15,23,42,0.08)",
                            }}
                            title="Data e ora"
                            onClick={(e) => e.preventDefault()}
                          >
                            {formattaDataBreve(v.data)} • {v.ora}
                          </button>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={styleBadgeScadenza(giorniMancanti(v.data), v.urgente)}>
                            {v.urgente ? "URGENTE" : labelGiorni(giorniMancanti(v.data))}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 19, fontWeight: 950, letterSpacing: -0.24 }}>{v.titolo}</div>

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {v.importo !== null && (
                          <span
                            style={{
                              padding: "7px 11px",
                              borderRadius: 999,
                              border:
                                v.movimento === "entrata"
                                  ? "2px solid rgba(16,185,129,0.28)"
                                  : "2px solid rgba(239,68,68,0.28)",
                              background:
                                v.movimento === "entrata"
                                  ? "rgba(236,253,245,0.96)"
                                  : "rgba(254,242,242,0.96)",
                              fontSize: 12,
                              fontWeight: 950,
                              color:
                                v.movimento === "entrata"
                                  ? "rgba(5,150,105,0.96)"
                                  : "rgba(185,28,28,0.96)",
                            }}
                          >
                            {v.importo.toLocaleString("it-IT")} €
                          </span>
                        )}

                        {v.nota && <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.72 }}>{v.nota}</span>}

                        {v.notificheMinutiPrima.length > 0 && (
                          <span style={{ fontSize: 14, fontWeight: 900, opacity: 0.8 }}>
                            Notifiche:{" "}
                            {v.notificheMinutiPrima
                              .slice()
                              .sort((a, b) => b - a)
                              .map((m) => `${formatOreItalianeFromMin(m)}h`)
                              .join(", ")}
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {pagina === "home" ? (
                          <>
                            <button data-chip="1" onClick={() => toggleFatto(v.id)} style={chip(true)}>
                              Segna fatto
                            </button>
                            <button data-chip="1" onClick={() => apriModifica(v)} style={chip(false)}>
                              Modifica
                            </button>
                            <button data-chip="1" onClick={() => elimina(v.id)} style={chip(false)}>
                              Elimina
                            </button>
                          </>
                        ) : (
                          <>
                            <button data-chip="1" onClick={() => ripristina(v.id)} style={chip(true)}>
                              Ripristina
                            </button>
                            <button data-chip="1" onClick={() => elimina(v.id)} style={chip(false)}>
                              Elimina
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

       {pagina !== "controllo" && <DraggableFab onClick={apriNuova} label="Aggiungi" />}

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
                    <button type="button" data-chip="1" onClick={() => setTipo("scadenza")} style={chipSmall(tipo === "scadenza")}>
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
                  </div>
                </div>

                <div>
                  <div style={sx.sectionLabel}>Titolo</div>
                  <input
                    value={titolo}
                    onChange={(e) => setTitolo(e.target.value)}
                    placeholder="Es: Affitto / Dentista"
                    style={inputLight(false)}
                  />
                </div>

                <div style={sx.row2}>
                  <div>
                    <div style={sx.sectionLabel}>Data</div>
                    <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inputLight(false)} />
                  </div>

                  <div>
                    <div style={sx.sectionLabel}>Ora</div>
                    <input type="time" value={ora} onChange={(e) => setOra(e.target.value)} style={inputLight(false)} />
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(59,130,246,0.14)",
                    background: "linear-gradient(180deg, rgba(239,246,255,0.86), rgba(239,246,255,0.56))",
                    boxShadow: "0 10px 22px rgba(59,130,246,0.06)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>
                    Entrate e uscite
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 850, opacity: 0.82, lineHeight: 1.4 }}>
                    Le entrate del mese si inseriscono solo nell’area Controllo, così non si sovrappongono alle scadenze e agli appuntamenti.
                  </div>
                </div>

                <div>
                  <div style={sx.sectionLabel}>Nota</div>
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={4}
                    placeholder="Scrivi una nota..."
                    style={{
                      ...inputLight(false),
                      height: "auto",
                      minHeight: 110,
                      resize: "vertical",
                      lineHeight: 1.4,
                    }}
                  />
                </div>

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
          <div style={sx.modal}>
            <div style={sx.header}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>Nuovo turno</div>
                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, fontWeight: 800 }}>
                  Inserisci turno, ore ordinarie e straordinarie
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

            <div style={sx.body}>
              <div style={sx.content}>
                <div>
                  <div style={sx.sectionLabel}>Data</div>
                  <input type="date" value={turnoData} onChange={(e) => setTurnoData(e.target.value)} style={inputLight(false)} />
                </div>

               <div style={{ display: "grid", gap: 12 }}>
  <div>
    <div style={sx.sectionLabel}>Turno predefinito</div>
    
<select
  value={turnoPreset || ""}
  onChange={(e) => {
    const val = e.target.value;
    setTurnoPreset(val);

    if (!val) return;

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
    background: "rgba(255,255,255,0.90)",
    fontWeight: 850,
  }}
  title="Seleziona turno predefinito"
>
  <option value="">Seleziona turno preset…</option>
  {presetTurni.map((p) => (
    <option key={p} value={p}>
      {p}
    </option>
  ))}
</select>

  </div>


  <div style={sx.row2}>
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
</div>

                <div style={sx.row2}>
                  <div>
                    <div style={sx.sectionLabel}>Ore ordinarie</div>
                    <input
                      value={turnoOreOrd}
                      onChange={(e) => setTurnoOreOrd(e.target.value)}
                      placeholder="Es: 8"
                      style={inputLight(false)}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <div style={sx.sectionLabel}>Ore straordinarie</div>
                    <input
                      value={turnoOreStraord}
                      onChange={(e) => setTurnoOreStraord(e.target.value)}
                      placeholder="Es: 2"
                      style={inputLight(false)}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div>
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

            <div style={sx.footer}>
              <button type="button" data-chip="1" onClick={chiudiTurnoForm} style={sx.actionBtn(false)}>
                Annulla
              </button>
              <button type="button" data-chip="1" onClick={salvaTurno} style={sx.actionBtn(true)}>
                Salva turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}