import { useEffect, useMemo, useRef, useState } from "react";

type Priorita = "bassa" | "media" | "alta" | "urgente";
type Filtro = "oggi" | "7giorni" | "30giorni";
type Movimento = "uscita" | "entrata";

type Voce = {
  id: string;
  titolo: string;
  data: string; // "YYYY-MM-DD"
  ora: string; // "HH:MM"
  tipo: "scadenza" | "appuntamento";
  priorita: Priorita;
  nota: string;
  importo: number | null;
  movimento: Movimento;
  fatto: boolean;

  // ✅ notifiche salvate SEMPRE in minuti (interno)
  notificheMinutiPrima: number[];
};

type User = { id: string; nome: string };

type IncassiMese = {
  incassoMese: number;
  incassoExtra: number;
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
    second: "2-digit",
  });

  return `${data} • ore ${ora}`;
}

// ✅ Parsing ore con virgola: "1,5" => 1.5
function parseOreItaliane(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatOreItalianeFromMin(min: number): string {
  const ore = min / 60;
  return ore.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// ---------- STORAGE KEYS ----------
const K_USERS = "scadenze_users";
const K_CURR = "scadenze_current_user";
const kVoci = (userId: string) => `voci_scadenze__${userId}`;
const kIncassi = (userId: string) => `incassi_mese__${userId}`;

// ---------- USERS ----------
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

// ---------- VOCI ----------
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

  return {
    id: String(x?.id ?? safeUUID()),
    titolo: String(x?.titolo ?? ""),
    data: String(x?.data ?? ""),
    ora: typeof x?.ora === "string" && x.ora ? x.ora : "09:00",
    tipo: x?.tipo === "appuntamento" ? "appuntamento" : "scadenza",
    priorita:
      x?.priorita === "bassa" ||
      x?.priorita === "media" ||
      x?.priorita === "alta" ||
      x?.priorita === "urgente"
        ? x.priorita
        : "media",
    nota: typeof x?.nota === "string" ? x.nota : "",
    importo: importoNum,
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

// ---------- INCASSI ----------
function caricaIncassi(userId: string): Record<string, IncassiMese> {
  const raw = localStorage.getItem(kIncassi(userId));
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, any>;
    const out: Record<string, IncassiMese> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      out[k] = {
        incassoMese: Number((v as any)?.incassoMese ?? 0) || 0,
        incassoExtra: Number((v as any)?.incassoExtra ?? 0) || 0,
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

// ---------- DATE UTILS ----------
function buildDateTime(data: string, ora: string) {
  const [a, m, g] = data.split("-").map(Number);
  const [hh, mm] = ora.split(":").map(Number);
  return new Date(a, (m ?? 1) - 1, g ?? 1, hh ?? 0, mm ?? 0, 0, 0);
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

// ritorna: 0 (lontano) -> 1 (oggi/urgente)
function urgenzaDaGiorni(g: number) {
  const x = 1 - clamp(g, 0, 10) / 10;
  return clamp(x, 0, 1);
}

function labelGiorni(g: number) {
  if (g === 0) return "OGGI";
  if (g > 0) return `- ${g}g`;
  return `+ ${Math.abs(g)}g`;
}

function styleBadgeScadenza(g: number) {
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
      textTransform: "uppercase" as const,
      animation: "pulseUrgent 1.35s ease-in-out infinite",
      userSelect: "none" as const,
      whiteSpace: "nowrap" as const,
    };
  }

  const u = urgenzaDaGiorni(g); // 0..1
  const alpha1 = 0.18 + u * 0.70;
  const alpha2 = 0.10 + u * 0.62;
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
    textTransform: "uppercase" as const,
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
    transition: "transform .12s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease",
  };
}

function ordinaIntelligente(lista: Voce[]) {
  const pesoPriorita: Record<Priorita, number> = {
    urgente: 0,
    alta: 1,
    media: 2,
    bassa: 3,
  };
  const copie = [...lista];
  copie.sort((a, b) => {
    const d = a.data.localeCompare(b.data);
    if (d !== 0) return d;
    const p = pesoPriorita[a.priorita] - pesoPriorita[b.priorita];
    if (p !== 0) return p;
    const o = a.ora.localeCompare(b.ora);
    if (o !== 0) return o;
    return 0;
  });
  return copie;
}

// ✅ LOGO: REMEMBER (integrato)
function RememberLogo({ size = 34 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.18))" }}>
        <defs>
          <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(0,122,255,0.95)" />
            <stop offset="1" stopColor="rgba(175,82,222,0.90)" />
          </linearGradient>
          <linearGradient id="rg2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.00)" />
          </linearGradient>
        </defs>

        <rect x="6" y="6" width="52" height="52" rx="18" fill="url(#rg1)" />
        <path d="M18 36c6-16 22-16 28 0" fill="none" stroke="rgba(255,255,255,0.90)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="24" cy="26" r="3" fill="rgba(255,255,255,0.95)" />
        <circle cx="40" cy="26" r="3" fill="rgba(255,255,255,0.95)" />
        <path d="M10 14c12-10 34-10 44 0" fill="none" stroke="url(#rg2)" strokeWidth="6" strokeLinecap="round" />
      </svg>

      <div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 1000,
            letterSpacing: -0.9,
            lineHeight: 1,
            background: "linear-gradient(90deg, rgba(0,122,255,0.95), rgba(175,82,222,0.95))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          REMEMBER
        </div>
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900, opacity: 0.62 }}>scadenze • appuntamenti • entrate/uscite</div>
      </div>
    </div>
  );
}

export default function App() {
  // ---------- AUTH / UTENTI ----------
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) ?? null, [users, currentUserId]);

  const [loginNome, setLoginNome] = useState("");
  const [loginPick, setLoginPick] = useState<string | null>(null);

  // ---------- APP ----------
  const [pagina, setPagina] = useState<"home" | "archivio">("home");
  const [mostraForm, setMostraForm] = useState(false);
  const [idInModifica, setIdInModifica] = useState<string | null>(null);

  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:00");
  const [tipo, setTipo] = useState<Voce["tipo"]>("scadenza");
  const [priorita, setPriorita] = useState<Priorita>("media");
  const [nota, setNota] = useState("");
  const [importo, setImporto] = useState<string>("");
  const [movimento, setMovimento] = useState<Movimento>("uscita");

  // ✅ pannello filtri (apri/chiudi)
  const [showFiltri, setShowFiltri] = useState(false);

  const [notificheMinutiPrima, setNotificheMinutiPrima] = useState<number[]>([]);
  // ✅ adesso è ORE (con virgola)
  const [customNotificaOre, setCustomNotificaOre] = useState<string>("");

  const [voci, setVoci] = useState<Voce[]>([]);
  const [caricato, setCaricato] = useState(false);

  const [incassi, setIncassi] = useState<Record<string, IncassiMese>>({});
  const [adesso, setAdesso] = useState(new Date());
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [meseCorrente, setMeseCorrente] = useState(new Date());
  const meseKey = useMemo(() => yyyymmFromDate(meseCorrente), [meseCorrente]);

  const [hoverClose, setHoverClose] = useState(false);
  const [, setFocusKey] = useState<
  null | "titolo" | "data" | "ora" | "importo" | "nota" | "incassoMese" | "incassoExtra"
>(null);

  // ---------- Notification scheduling (in-app) ----------
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
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
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
          // ignore
        }
      }, diff);

      ids.push(id);
    }

    if (ids.length) scheduledRef.current[v.id] = ids;
  }

  // ---------- init clock ----------
  useEffect(() => {
    const timer = setInterval(() => setAdesso(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ---------- load users + current user ----------
  useEffect(() => {
    const u = caricaUtenti();
    setUsers(u);

    const curr = caricaUtenteCorrente();
    if (curr && u.some((x) => x.id === curr)) setCurrentUserId(curr);
    else setCurrentUserId(null);
  }, []);

  // ---------- when current user changes ----------
  useEffect(() => {
    clearAllScheduled();

    if (!currentUserId) {
      setVoci([]);
      setIncassi({});
      setCaricato(false);
      return;
    }

    salvaUtenteCorrente(currentUserId);

    setVoci(caricaVociDaMemoria(currentUserId));
    setIncassi(caricaIncassi(currentUserId));
    setCaricato(true);

    requestNotifyPermission();
  }, [currentUserId]);

  // ---------- save voci/incassi ----------
  useEffect(() => {
    if (!caricato) return;
    if (!currentUserId) return;
    salvaVociInMemoria(currentUserId, voci);
  }, [voci, caricato, currentUserId]);

  useEffect(() => {
    if (!caricato) return;
    if (!currentUserId) return;
    salvaIncassi(currentUserId, incassi);
  }, [incassi, caricato, currentUserId]);

  // ---------- schedule notifications when voci change ----------
  useEffect(() => {
    if (!currentUserId) return;
    clearAllScheduled();
    voci.forEach(scheduleNotificationsForVoce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voci, currentUserId]);

  // ESC closes modal
  useEffect(() => {
    if (!mostraForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudiForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostraForm]);

  const ui = useMemo(() => {
    const glass = {
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(255,255,255,0.78)",
      boxShadow: "0 18px 60px rgba(0,0,0,0.20), 0 2px 0 rgba(255,255,255,0.65) inset",
      borderRadius: 22,
    } as const;

    const card = {
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.72)",
      boxShadow: "0 14px 40px rgba(0,0,0,0.14)",
      borderRadius: 20,
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
    setPriorita("media");
    setNota("");
    setImporto("");
    setMovimento("uscita");
    setNotificheMinutiPrima([]);
    setCustomNotificaOre("");
    setFocusKey(null);
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
    setPriorita(v.priorita);
    setNota(v.nota ?? "");
    setImporto(v.importo === null ? "" : String(v.importo));
    setMovimento(v.movimento ?? "uscita");
    setNotificheMinutiPrima(v.notificheMinutiPrima ?? []);
    setMostraForm(true);
  }

  function salva() {
    if (classNameIsEmpty(titolo) || classNameIsEmpty(data) || classNameIsEmpty(ora)) {
      alert("Compila titolo, data e ora");
      return;
    }

    const importoNum = importo.trim() === "" ? null : Number(importo);
    if (importo.trim() !== "" && Number.isNaN(importoNum)) {
      alert("Importo non valido");
      return;
    }

    const mov: Movimento = importoNum === null ? "uscita" : movimento;

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
                priorita,
                nota: nota.trim(),
                importo: importoNum,
                movimento: mov,
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
        priorita,
        nota: nota.trim(),
        importo: importoNum,
        movimento: mov,
        fatto: false,
        notificheMinutiPrima: notiUniq,
      };
      setVoci((prev) => [nuova, ...prev]);
    }

    chiudiForm();
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
    setShowFiltri(false);
  }
  function meseSuccessivo() {
    setMeseCorrente((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    setShowFiltri(false);
  }
  function nomeMese(d: Date) {
    return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  }
  function stessoMeseSelezionato(dataStr: string) {
    const [a, m, g] = dataStr.split("-").map(Number);
    const d = new Date(a, (m ?? 1) - 1, g ?? 1);
    return d.getFullYear() === meseCorrente.getFullYear() && d.getMonth() === meseCorrente.getMonth();
  }

  function vociFiltrate() {
    const base = pagina === "archivio" ? voci.filter((v) => v.fatto) : voci.filter((v) => !v.fatto);
    const nelMese = base.filter((v) => stessoMeseSelezionato(v.data));
    if (filtro === null) return ordinaIntelligente(nelMese);

    const oggi = new Date();
    const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
    let fine = new Date(inizioOggi);

    if (filtro === "oggi") fine = new Date(inizioOggi);
    else if (filtro === "7giorni") fine.setDate(fine.getDate() + 7);
    else if (filtro === "30giorni") fine.setDate(fine.getDate() + 30);

    const filtrate = nelMese.filter((v) => {
      const [a, m, g] = v.data.split("-").map(Number);
      const dataVoce = new Date(a, (m ?? 1) - 1, g ?? 1);
      return dataVoce >= inizioOggi && dataVoce <= fine;
    });

    return ordinaIntelligente(filtrate);
  }

  const lista = vociFiltrate();

  // ---------- BADGES ----------
  function badgePriorita(p: Priorita) {
    const map: Record<Priorita, { bg: string; bd: string; tx: string }> = {
      urgente: { bg: "rgba(255,59,48,0.12)", bd: "rgba(255,59,48,0.30)", tx: "rgba(120,10,8,0.90)" },
      alta: { bg: "rgba(255,149,0,0.12)", bd: "rgba(255,149,0,0.30)", tx: "rgba(120,70,0,0.92)" },
      media: { bg: "rgba(52,199,89,0.12)", bd: "rgba(52,199,89,0.30)", tx: "rgba(10,85,35,0.92)" },
      bassa: { bg: "rgba(0,122,255,0.12)", bd: "rgba(0,122,255,0.30)", tx: "rgba(0,55,120,0.92)" },
    };
    const s = map[p];
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
          textTransform: "capitalize",
          letterSpacing: 0.2,
        }}
      >
        {p}
      </span>
    );
  }

  function badgeTipo(t: Voce["tipo"]) {
    const map = {
      scadenza: { bg: "rgba(67, 219, 7, 0.22)", bd: "rgba(21, 148, 4, 0.28)", tx: "rgba(10,85,35,0.92)" },
      appuntamento: { bg: "rgba(175,82,222,0.14)", bd: "rgba(175,82,222,0.28)", tx: "rgb(95,35,140)" },
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

  // ---------- STYLES ----------
  const pageBg = {
    minHeight: "100vh",
    padding: 18,
    fontFamily: "system-ui",
    color: "rgba(0,0,0,0.88)",
    background:
      "radial-gradient(1100px 800px at 20% 0%, rgba(0,122,255,0.10), transparent 60%), radial-gradient(900px 700px at 100% 35%, rgba(175,82,222,0.10), transparent 60%), linear-gradient(180deg, #f7f8fb, #eef1f7)",
  } as const;

  const topBar = {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 12,
  } as const;

  const chip = (active: boolean) =>
    ({
      padding: "10px 12px",
      borderRadius: 999,
      border: `1px solid ${active ? "rgba(0,122,255,0.22)" : "rgba(0,0,0,0.08)"}`,
      background: active ? "linear-gradient(180deg, rgba(0,122,255,0.16), rgba(0,122,255,0.08))" : "rgba(255,255,255,0.78)",
      boxShadow: active ? "0 14px 30px rgba(0,122,255,0.14)" : "0 10px 22px rgba(0,0,0,0.10)",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 13,
      color: "rgba(0,0,0,0.85)",
      transition: "transform .12s ease, box-shadow .12s ease, background .12s ease",
      userSelect: "none" as const,
    } as const);

  const chipSmall = (active: boolean) =>
    ({
      padding: "8px 10px",
      borderRadius: 999,
      border: `1px solid ${active ? "rgba(0,122,255,0.22)" : "rgba(0,0,0,0.08)"}`,
      background: active ? "linear-gradient(180deg, rgba(0,122,255,0.16), rgba(0,122,255,0.08))" : "rgba(255,255,255,0.78)",
      boxShadow: active ? "0 12px 24px rgba(0,122,255,0.12)" : "0 10px 18px rgba(0,0,0,0.08)",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      color: "rgba(0,0,0,0.82)",
      transition: "transform .12s ease, box-shadow .12s ease, background .12s ease",
      userSelect: "none" as const,
    } as const);

  const inputLight = (focused: boolean) =>
    ({
      width: "100%",
      height: 46,
      padding: "10px 14px",
      borderRadius: 16,
      border: `1px solid ${focused ? "rgba(0,122,255,0.30)" : "rgba(0,0,0,0.12)"}`,
      background: "rgba(255,255,255,0.82)",
      color: "rgba(0,0,0,0.88)",
      fontSize: 13,
      outline: "none",
      boxShadow: focused ? "0 0 0 4px rgba(0,122,255,0.12)" : "none",
      boxSizing: "border-box" as const,
    } as const);

  const fab = {
    position: "fixed" as const,
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    width: 72,
    height: 72,
    borderRadius: 999,
    border: "1px solid rgba(0,122,255,0.22)",
    background: "linear-gradient(180deg, rgba(0,122,255,0.22), rgba(0,122,255,0.12))",
    color: "rgba(0,0,0,0.88)",
    fontSize: 34,
    cursor: "pointer",
    fontWeight: 900,
    boxShadow: "0 30px 70px rgba(0,122,255,0.20), 0 18px 40px rgba(0,0,0,0.18)",
    display: "grid",
    placeItems: "center",
    zIndex: 50,
  } as const;

  const fabRing = {
    position: "fixed" as const,
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    width: 92,
    height: 92,
    borderRadius: 999,
    background: "radial-gradient(circle, rgba(0,122,255,0.25), transparent 55%)",
    zIndex: 49,
    pointerEvents: "none" as const,
  } as const;

  const fabHint = {
    position: "fixed" as const,
    left: "50%",
    bottom: 104,
    transform: "translateX(-50%)",
    padding: "10px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.80)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
    fontSize: 12,
    fontWeight: 900,
    color: "rgba(0,0,0,0.72)",
    zIndex: 48,
  } as const;

  const sx = useMemo(() => {
    const overlay = {
      position: "fixed" as const,
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      backdropFilter: "blur(16px)",
      display: "grid",
      placeItems: "center",
      padding: 18,
      zIndex: 999,
    };

    const modal = {
      width: "min(640px, 100%)",
      borderRadius: 28,
      background: "rgba(255,255,255,0.86)",
      border: "1px solid rgba(0,0,0,0.10)",
      boxShadow: "0 50px 140px rgba(0,0,0,0.35)",
      overflow: "hidden",
      position: "relative" as const,
      animation: "popIn .16s ease both",
      maxHeight: "86vh",
      display: "flex",
      flexDirection: "column",
    } as const;

    const header = {
      padding: "20px 22px",
      borderBottom: "1px solid rgba(0,0,0,0.08)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    };

    const closeBtn = {
      color: "rgba(0,0,0,0.88)",
      width: 44,
      height: 44,
      borderRadius: 14,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "rgba(255,255,255,0.90)",
      cursor: "pointer",
      fontSize: 18,
      fontWeight: 900,
      display: "grid",
      placeItems: "center",
      transition: "transform .12s ease, filter .12s ease",
    };

    const closeBtnHover = {
      transform: "scale(1.03)",
      filter: "brightness(1.02)",
    };

    const body = {
      padding: 22,
      display: "grid",
      gap: 16,
      position: "relative" as const,
      zIndex: 1,
      justifyItems: "center" as const,
      overflowY: "auto",
      flex: 1,
    } as const;

    const content = {
      width: "100%",
      maxWidth: 520,
      display: "grid",
      gap: 16,
    } as const;

    const sectionLabel = { fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 800 };

    const row2 = {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      alignItems: "start",
    } as const;

    const pills2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as const;

    const footer = {
      padding: 20,
      borderTop: "1px solid rgba(0,0,0,0.08)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
    } as const;

    const actionBtn = (primary: boolean) =>
      ({
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${primary ? "rgba(0,122,255,0.22)" : "rgba(0,0,0,0.10)"}`,
        background: primary ? "rgba(0,122,255,0.14)" : "rgba(255,255,255,0.78)",
        color: "rgba(0,0,0,0.88)",
        fontWeight: 900,
        cursor: "pointer",
      }) as const;

    return { overlay, modal, header, closeBtn, closeBtnHover, body, content, sectionLabel, row2, pills2, footer, actionBtn };
  }, []);

  // ---------- LOGIN UI ----------
  function entraCome(userId: string) {
    setCurrentUserId(userId);
    setLoginNome("");
    setLoginPick(null);
  }

  function creaEUentra() {
    const nome = loginNome.trim();
    if (nome.length < 2) return alert("Inserisci un nome utente valido (min 2 caratteri).");
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
    setShowFiltri(false);
  }

  // ---------- INCASSI UI ----------
  const incassoMeseVal = incassi[meseKey]?.incassoMese ?? 0;
  const incassoExtraVal = incassi[meseKey]?.incassoExtra ?? 0;

  function setIncassoForMonth(part: keyof IncassiMese, value: number) {
    setIncassi((prev) => ({
      ...prev,
      [meseKey]: {
        incassoMese: part === "incassoMese" ? value : prev[meseKey]?.incassoMese ?? 0,
        incassoExtra: part === "incassoExtra" ? value : prev[meseKey]?.incassoExtra ?? 0,
      },
    }));
  }

  // ---------- TOTALI ----------
  const vociMeseNonFatte = useMemo(
    () => voci.filter((v) => !v.fatto && stessoMeseSelezionato(v.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voci, meseCorrente]
  );

  const uscitePrevisteNonFatte = useMemo(
    () => vociMeseNonFatte.filter((v) => v.importo !== null && v.movimento === "uscita").reduce((s, v) => s + (v.importo ?? 0), 0),
    [vociMeseNonFatte]
  );

  const entrateVociNonFatte = useMemo(
    () => vociMeseNonFatte.filter((v) => v.importo !== null && v.movimento === "entrata").reduce((s, v) => s + (v.importo ?? 0), 0),
    [vociMeseNonFatte]
  );

  const entrateTotMese = (incassoMeseVal ?? 0) + (incassoExtraVal ?? 0) + entrateVociNonFatte;
  const usciteTotMese = uscitePrevisteNonFatte;
  const saldoMese = entrateTotMese - usciteTotMese;

  // ---------- NOTIFICHE UI (ORE) ----------
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
        50% { transform: scale(1.02); }
      }

      @keyframes softGlow {
        0%, 100% { box-shadow: 0 14px 30px rgba(0,0,0,0.10); }
        50% { box-shadow: 0 18px 42px rgba(0,122,255,0.16); }
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
        filter: brightness(0.98);
      }
    `}</style>
  );

  // ---------- LOGIN SCREEN ----------
  if (!currentUser) {
    return (
      <div style={pageBg}>
        {GlobalStyle}
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18 }}>
          <div style={{ width: "min(460px, 100%)" }}>
            <RememberLogo size={34} />
            <div style={{ opacity: 0.72, fontWeight: 850, marginTop: 10 }}>Area privata • scegli o crea un utente</div>

            <div style={{ marginTop: 16, ...ui.card, padding: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.2 }}>Accedi</div>

              {users.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 800, fontSize: 13 }}>Nessun utente creato su questo dispositivo.</div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <select
                    value={loginPick ?? ""}
                    onChange={(e) => setLoginPick(e.target.value || null)}
                    style={{ ...inputLight(false), height: 46, background: "rgba(255,255,255,0.86)", fontWeight: 850 }}
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
                      if (!loginPick) return alert("Seleziona un utente.");
                      entraCome(loginPick);
                    }}
                    style={chip(true)}
                  >
                    Entra
                  </button>
                </div>
              )}

              <div style={{ height: 1, background: "rgba(0,0,0,0.08)", margin: "16px 0" }} />

              <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.2 }}>Crea nuovo utente</div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <input value={loginNome} onChange={(e) => setLoginNome(e.target.value)} placeholder="Nome utente (es: Mario)" style={inputLight(false)} />
                <button data-chip="1" onClick={creaEUentra} style={chip(true)}>
                  Crea & Entra
                </button>

                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800, lineHeight: 1.35 }}>
                  Nota: questo è un profilo <b>locale</b> (sul dispositivo).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- APP SCREEN ----------
  return (
    <div style={pageBg}>
      {GlobalStyle}

      <div style={topBar}>
        {/* HEADER TOP */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <RememberLogo size={32} />

            {/* ✅ LIVE DATE più evidente + animata */}
            <div
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "rgba(255,255,255,0.78)",
                boxShadow: "0 14px 30px rgba(0,0,0,0.10)",
                fontSize: 13,
                fontWeight: 950,
                letterSpacing: -0.2,
                animation: "softGlow 2.2s ease-in-out infinite",
              }}
            >
              <span style={{ opacity: 0.78 }}>🕒</span>
              <span style={{ opacity: 0.86 }}>{formattaDataLunga(adesso)}</span>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, opacity: 0.7 }}>
              Utente: <span style={{ opacity: 1 }}>{currentUser.nome}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button data-chip="1" onClick={() => (setPagina("home"), setShowFiltri(false))} style={pagina === "home" ? chip(true) : chip(false)}>
              Home
            </button>
            <button data-chip="1" onClick={() => (setPagina("archivio"), setShowFiltri(false))} style={pagina === "archivio" ? chip(true) : chip(false)}>
              Archivio
            </button>

            {/* ✅ NUOVA verde */}
            <button
              data-chip="1"
              onClick={apriNuova}
              title="Nuova voce"
              style={{
                ...chip(false),
                background: "linear-gradient(180deg, rgba(52,199,89,0.22), rgba(52,199,89,0.12))",
                border: "1px solid rgba(52,199,89,0.30)",
                boxShadow: "0 16px 34px rgba(52,199,89,0.18)",
                fontWeight: 950,
              }}
            >
              + Nuova
            </button>

            <button data-chip="1" onClick={esci} style={chip(false)}>
              Esci
            </button>
          </div>
        </div>

        {/* STRISCIA CONTROLLI */}
        <div style={{ ...ui.glass, padding: 14, maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            {/* MESE */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button data-chip="1" onClick={mesePrecedente} style={chip(false)}>
                ←
              </button>
              <div style={{ fontWeight: 950, textTransform: "capitalize", fontSize: 14 }}>{nomeMese(meseCorrente)}</div>
              <button data-chip="1" onClick={meseSuccessivo} style={chip(false)}>
                →
              </button>
            </div>

            {/* BOTTONCINO UNICO FILTRI */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button data-chip="1" onClick={() => setShowFiltri((s) => !s)} style={chip(showFiltri || filtro !== null)} title="Apri/chiudi filtri">
                Filtri {filtro ? "• 1" : ""}
              </button>

              <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.78 }}>
                Uscite previste (da saldare): <span style={{ opacity: 1 }}>{uscitePrevisteNonFatte.toLocaleString("it-IT")} €</span>
              </div>
            </div>
          </div>

          {/* PANNELLO FILTRI (slide animato) */}
          <div
            style={{
              marginTop: 10,
              overflow: "hidden",
              maxHeight: showFiltri ? 120 : 0,
              opacity: showFiltri ? 1 : 0,
              transform: showFiltri ? "translateY(0px)" : "translateY(-6px)",
              transition: "max-height .22s ease, opacity .18s ease, transform .18s ease",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <button data-chip="1" onClick={() => setFiltro((p) => (p === "oggi" ? null : "oggi"))} style={chip(filtro === "oggi")}>
                Oggi
              </button>
              <button data-chip="1" onClick={() => setFiltro((p) => (p === "7giorni" ? null : "7giorni"))} style={chip(filtro === "7giorni")}>
                7 giorni
              </button>
              <button data-chip="1" onClick={() => setFiltro((p) => (p === "30giorni" ? null : "30giorni"))} style={chip(filtro === "30giorni")}>
                30 giorni
              </button>
              <button data-chip="1" onClick={() => setFiltro(null)} style={chip(filtro === null)}>
                Tutte
              </button>

              <div style={{ flex: 1 }} />

              <button data-chip="1" onClick={() => setShowFiltri(false)} style={{ ...chip(false), opacity: 0.85 }}>
                Chiudi
              </button>
            </div>
          </div>
        </div>

        {/* RESOCONTO */}
        <div style={{ maxWidth: 980, margin: "0 auto", marginTop: 14 }}>
          <div style={{ ...ui.card, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>Resoconto mese</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  Entrate = Incasso mese + Extra + voci “Entrata” • Uscite = voci “Uscita”
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.82 }}>
                  Entrate: <span style={{ opacity: 1 }}>{entrateTotMese.toLocaleString("it-IT")} €</span>
                </div>
                <div style={{ opacity: 0.35 }}>•</div>
                <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.82 }}>
                  Uscite: <span style={{ opacity: 1 }}>{usciteTotMese.toLocaleString("it-IT")} €</span>
                </div>
                <div style={{ opacity: 0.35 }}>•</div>
                <div style={{ fontWeight: 980, fontSize: 13, opacity: 0.9 }}>
                  Saldo: <span style={{ opacity: 1 }}>{saldoMese.toLocaleString("it-IT")} €</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Incasso mese</div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={String(incassoMeseVal)}
                  onChange={(e) => setIncassoForMonth("incassoMese", Number(e.target.value) || 0)}
                  style={inputLight(false)}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Incasso extra</div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={String(incassoExtraVal)}
                  onChange={(e) => setIncassoForMonth("incassoExtra", Number(e.target.value) || 0)}
                  style={inputLight(false)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* LISTA */}
        <div style={{ maxWidth: 980, margin: "0 auto", marginTop: 14 }}>
          {lista.length === 0 ? (
            <div style={{ ...ui.card, padding: 16, opacity: 0.85 }}>Nessuna voce in questo periodo.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {lista.map((v, idx) => (
                <div
                  key={v.id}
                  style={{
                    ...ui.card,
                    padding: 16,
                    animation: "cardIn .18s ease both",
                    animationDelay: `${Math.min(idx, 10) * 35}ms`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {badgeTipo(v.tipo)}
                      {badgePriorita(v.priorita)}
                      {v.importo !== null && badgeMov(v.movimento)}
                    <button
                        type="button"
                        style={{
                            ...chipSmall(false),
                            cursor: "default",
                            opacity: 0.92,
                            boxShadow: "0 10px 20px rgba(0,0,0,0.08)",
                        }}
                        title="Data e ora"
                        onClick={(e) => e.preventDefault()}
                        >
                        {formattaDataBreve(v.data)} • {v.ora}
                        </button>
                    </div>

                    {/* ✅ BADGE giorni mancanti evidente e sempre più rosso */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={styleBadgeScadenza(giorniMancanti(v.data))}>{labelGiorni(giorniMancanti(v.data))}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>{v.titolo}</div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {v.importo !== null && (
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "3px solid rgba(221, 10, 10, 0.56)",
                          background: "rgba(255, 250, 250, 0.9)",
                          fontSize: 12,
                          fontWeight: 950,
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
      </div>

      {/* FAB */}
      <>
        <div style={fabRing} />
        <div style={fabHint}>Aggiungi</div>
        <button data-chip="1" onClick={apriNuova} style={fab} title="Aggiungi">
          +
        </button>
      </>

      {/* MODAL */}
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
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>{idInModifica ? "Modifica voce" : "Nuova voce"}</div>
                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, fontWeight: 800 }}>Inserisci i dati e salva (Esc per chiudere)</div>
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
                    <button type="button" data-chip="1" onClick={() => setTipo("appuntamento")} style={chipSmall(tipo === "appuntamento")}>
                      Appuntamento
                    </button>
                  </div>
                </div>

                <div>
                  <div style={sx.sectionLabel}>Titolo</div>
                  <input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es: Affitto / Dentista" style={inputLight(false)} />
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

                <div>
                  <div style={sx.sectionLabel}>Importo (€)</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={importo}
                    onChange={(e) => setImporto(e.target.value)}
                    placeholder="Es: 650"
                    style={inputLight(false)}
                  />

                  {importo.trim() !== "" && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8, fontWeight: 850 }}>Movimento</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <button type="button" data-chip="1" onClick={() => setMovimento("uscita")} style={chipSmall(movimento === "uscita")}>
                          Uscita
                        </button>
                        <button type="button" data-chip="1" onClick={() => setMovimento("entrata")} style={chipSmall(movimento === "entrata")}>
                          Entrata
                        </button>
                      </div>
                    </div>
                  )}
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
                  <div style={sx.sectionLabel}>Priorità</div>
                  <div style={sx.pills2}>
                    <button type="button" data-chip="1" onClick={() => setPriorita("bassa")} style={chipSmall(priorita === "bassa")}>
                      Bassa
                    </button>
                    <button type="button" data-chip="1" onClick={() => setPriorita("media")} style={chipSmall(priorita === "media")}>
                      Media
                    </button>
                    <button type="button" data-chip="1" onClick={() => setPriorita("alta")} style={chipSmall(priorita === "alta")}>
                      Alta
                    </button>
                    <button type="button" data-chip="1" onClick={() => setPriorita("urgente")} style={chipSmall(priorita === "urgente")}>
                      Urgente
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {badgePriorita(priorita)}
                    {badgeTipo(tipo)}
                    {importo.trim() !== "" && badgeMov(movimento)}
                  </div>
                </div>

                {/* ✅ NOTIFICHE SOLO ORE */}
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
                    Nota: le notifiche sono “in-app”. Funzionano solo se l’app è aperta (in foreground o background), non funzionano
                    se l’app è chiusa.
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
    </div>
  );
}