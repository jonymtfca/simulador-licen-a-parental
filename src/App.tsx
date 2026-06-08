import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Baby, CalendarDays, Info, ArrowRight, Heart, ChevronLeft, ChevronRight, Copy, Check, Send } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

/* ============================================================================
 * REGRAS (Portugal) — isoladas para fácil atualização
 * percent = % da remuneração de referência paga pela Segurança Social
 * ========================================================================== */
const PAI_OBRIGATORIOS = 28; // dias obrigatórios do pai (sempre a 100%)
const PAI_FACULTATIVOS = 7;  // dias facultativos do pai (sempre a 100%)

// 👉 SUBSTITUI por TEUS dados de doação. Deixa em branco ("") qualquer método que não queiras mostrar.
//    PayPal/Revolut usam links públicos (o valor é acrescentado ao link) — não expõem telefone nem IBAN.
//    Para reativar MB WAY ou IBAN, basta pôr o número/IBAN nas linhas abaixo.
const DONATE = {
  mbway: "",                                          // (desativado) número de telemóvel MB WAY
  paypal: "https://www.paypal.com/paypalme/jonymtfca", // PayPal.me
  revolut: "https://revolut.me/joodrns",             // Revolut.me
  iban: "",                                           // (desativado) IBAN
};

// 👉 Formulário de contacto: cria uma "Access Key" grátis em https://web3forms.com
//    (mete o teu email lá; as sugestões chegam-te a esse email). Cola a chave aqui:
const WEB3FORMS_KEY = "2b1d9895-efc4-463b-8075-976b89ac0b73";

// 👉 O teu perfil de LinkedIn:
const LINKEDIN_URL = "https://www.linkedin.com/in/jonyr/";

const MODALIDADES = [
  { id: "120", nome: "Licença parental inicial — 120 dias", partilhada: false, maeDias: 120, percent: 100 },
  { id: "150", nome: "Licença parental inicial — 150 dias", partilhada: false, maeDias: 150, percent: 80 },
  { id: "p150", nome: "Licença parental inicial partilhada — 150 dias (120 + 30)", partilhada: true, pool: 150, paiMin: 30, percent: 100 },
  { id: "p180", nome: "Licença parental inicial partilhada — 180 dias (150 + 30)", partilhada: true, pool: 180, paiMin: 30, percent: 83 },
  { id: "p180b", nome: "Licença parental inicial partilhada — 180 dias (pai 60 dias)", partilhada: true, pool: 180, paiMin: 60, percent: 90 },
];

/* ============================================================================
 * DATAS
 * ========================================================================== */
const parse = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); const dt = new Date(y, m - 1, d); return isNaN(dt) ? null : dt; };
const addDays = (dt, n) => { const r = new Date(dt); r.setDate(r.getDate() + n); return r; };
const key = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const fmt = (dt) => dt ? dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const inRange = (dt, a, b) => dt >= a && dt < b; // [a, b)

/* ============================================================================
 * VALOR DO SUBSÍDIO (estimativa)
 * remuneração de referência diária ≈ salário bruto mensal / 30
 * subsídio diário = RR × percentagem, com mínimo legal de 80% do IAS / 30
 * ========================================================================== */
const IAS_2026 = 537.13;
const MIN_DIARIO = +(0.8 * IAS_2026 / 30).toFixed(2); // ≈ 14,32 €
const eur = (n) => `${Math.round(n).toLocaleString("pt-PT")} €`;
const eur2 = (n) => `${n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function valorSubsidio(salarioMensal, pct, dias) {
  const s = Number(salarioMensal);
  if (!s || s <= 0 || !dias) return null;
  const diario = Math.max((s / 30) * (pct / 100), MIN_DIARIO);
  return { diario, total: diario * dias };
}

/* ============================================================================
 * MOTOR — blocos de ausência de cada progenitor
 * ========================================================================== */
function calcular(dataNascimento, modId, paiFacultativo, paiPartilhaDias, bebes) {
  const birth = parse(dataNascimento);
  const mod = MODALIDADES.find((m) => m.id === modId);
  if (!birth || !mod) return null;

  // Gémeos/múltiplos: +30 dias na licença inicial e +2 dias na licença do pai, por cada bebé além do primeiro
  const extra = Math.max(0, (Number(bebes) || 1) - 1);
  const bonusInicial = 30 * extra;
  const bonusPai = 2 * extra;

  const paiExclDias = PAI_OBRIGATORIOS + (paiFacultativo ? PAI_FACULTATIVOS : 0) + bonusPai;
  const paiExcl = { tipo: "pai", inicio: birth, fim: addDays(birth, paiExclDias), dias: paiExclDias };

  let maeBloco, paiPartilha = null;
  if (!mod.partilhada) {
    const maeDias = mod.maeDias + bonusInicial;
    maeBloco = { tipo: "mae", inicio: birth, fim: addDays(birth, maeDias), dias: maeDias };
  } else {
    const pool = mod.pool + bonusInicial;
    const paiP = Math.max(mod.paiMin, Math.min(paiPartilhaDias || mod.paiMin, pool - 42));
    const maeDias = pool - paiP;
    maeBloco = { tipo: "mae", inicio: birth, fim: addDays(birth, maeDias), dias: maeDias };
    paiPartilha = { tipo: "partilha", inicio: maeBloco.fim, fim: addDays(maeBloco.fim, paiP), dias: paiP };
  }

  const regressoMae = maeBloco.fim;
  const regressoPai = paiPartilha ? paiPartilha.fim : paiExcl.fim;
  const fimGeral = new Date(Math.max(regressoMae, regressoPai));

  return { birth, mod, maeBloco, paiExcl, paiPartilha, regressoMae, regressoPai, fimGeral, paiExclDias, bebes: Number(bebes) || 1 };
}

function categoriaDia(dt, r) {
  if (r.paiPartilha && inRange(dt, r.paiPartilha.inicio, r.paiPartilha.fim)) return "pai";
  const naMae = inRange(dt, r.maeBloco.inicio, r.maeBloco.fim);
  const noPai = inRange(dt, r.paiExcl.inicio, r.paiExcl.fim);
  if (naMae && noPai) return "ambos";
  if (naMae) return "mae";
  if (noPai) return "pai";
  return null;
}

const CORES = {
  mae: { cor: "var(--mae)", nome: "Licença da mãe" },
  pai: { cor: "var(--pai)", nome: "Licença do pai" },
  ambos: { cor: "var(--ambos)", nome: "Mãe e pai em casa" },
  partilha: { cor: "var(--pai)", nome: "Bloco partilhado" },
};

/* ============================================================================
 * CALENDÁRIO
 * ========================================================================== */
function Calendario({ r }) {
  const meses = useMemo(() => {
    const ini = new Date(r.birth.getFullYear(), r.birth.getMonth(), 1);
    const out = []; let cur = new Date(ini);
    while (cur <= r.fimGeral && out.length < 18) { out.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
    return out;
  }, [r]);
  const wd = [["seg", 0], ["ter", 0], ["qua", 0], ["qui", 0], ["sex", 0], ["sáb", 1], ["dom", 1]];

  return (
    <div className="cal-grid">
      {meses.map((m, mi) => {
        const first = new Date(m.getFullYear(), m.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7; // segunda = 0
        const nd = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const dias = Array.from({ length: nd }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1));
        return (
          <div className="cal-month" key={mi}>
            <div className="cal-title">{m.toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}</div>
            <div className="cal-head">{wd.map(([d, we], i) => <span key={i} className={`cal-wd${we ? " we" : ""}`}>{d}</span>)}</div>
            <div className="cal-body">
              {dias.map((dt, idx) => {
                const cat = categoriaDia(dt, r);
                const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                const isBirth = key(dt) === key(r.birth);
                const style = {};
                if (idx === 0) style.gridColumnStart = offset + 1; // alinha o dia 1 na coluna certa
                if (cat) {
                  // arredonda só o verdadeiro início/fim do período; nas quebras de semana fica reto
                  const runStart = categoriaDia(addDays(dt, -1), r) !== cat;
                  const runEnd = categoriaDia(addDays(dt, 1), r) !== cat;
                  style.background = CORES[cat].cor;
                  style.borderRadius = `${runStart ? 10 : 0}px ${runEnd ? 10 : 0}px ${runEnd ? 10 : 0}px ${runStart ? 10 : 0}px`;
                }
                const cls = ["cal-cell"];
                if (cat) cls.push("leave"); else if (weekend) cls.push("we");
                if (isBirth) cls.push("birth");
                return (
                  <span key={idx} className={cls.join(" ")} style={style} title={cat ? CORES[cat].nome : ""}>
                    {dt.getDate()}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
 * DATE PICKER (popover próprio, estilo moderno)
 * ========================================================================== */
function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });
  const triggerRef = useRef(null);
  const selected = parse(value);
  const [view, setView] = useState(() => {
    const base = selected || new Date(2026, 5, 1);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // posiciona o popover relativamente ao botão (recalcula em scroll/resize)
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      let left = rect.left;
      if (left + width > window.innerWidth - 12) left = window.innerWidth - 12 - width;
      if (left < 12) left = 12;
      setPos({ top: rect.bottom + 8, left, width });
    };
    reposition();
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const wd = ["S", "T", "Q", "Q", "S", "S", "D"];
  const y = view.getFullYear(), mo = view.getMonth();
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
  const nd = new Date(y, mo + 1, 0).getDate();
  const dias = Array.from({ length: nd }, (_, i) => new Date(y, mo, i + 1));
  const label = selected
    ? selected.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })
    : "Escolher data";

  const escolher = (dt) => { onChange(key(dt)); setOpen(false); };

  return (
    <div className="dp">
      <button ref={triggerRef} type="button" className={`dp-trigger${selected ? "" : " empty"}`} onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={18} />
        <span>{label}</span>
      </button>
      {open && createPortal(
        <>
          <div className="dp-backdrop" onPointerDown={() => setOpen(false)} />
          <div className="dp-pop" style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 1000 }}>
            <div className="dp-head">
              <button type="button" className="dp-nav" onClick={() => setView(new Date(y, mo - 1, 1))} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
              <span className="dp-month">{view.toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}</span>
              <button type="button" className="dp-nav" onClick={() => setView(new Date(y, mo + 1, 1))} aria-label="Mês seguinte"><ChevronRight size={18} /></button>
            </div>
            <div className="dp-wd">{wd.map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="dp-grid">
              {dias.map((dt, idx) => {
                const isSel = selected && key(dt) === key(selected);
                const style = idx === 0 ? { gridColumnStart: offset + 1 } : undefined;
                return (
                  <button type="button" key={idx} style={style}
                    className={`dp-day${isSel ? " sel" : ""}`}
                    onClick={() => escolher(dt)}>
                    {dt.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

/* ============================================================================
 * DOAÇÃO — vários métodos (MB WAY, PayPal, Revolut, IBAN)
 * ========================================================================== */
function CopyRow({ label, value, hint }) {
  const [copied, setCopied] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement("textarea");
      t.value = value; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <>
      <div className="copy-row">
        <div className="copy-val">
          <span className="copy-label">{label}</span>
          <span className="copy-num">{value}</span>
        </div>
        <button type="button" className="copy-btn" onClick={copiar}>
          {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
        </button>
      </div>
      {hint && <span className="donate-hint">{hint}</span>}
    </>
  );
}

function AmountChips({ base, build }) {
  return (
    <div className="donate-chips">
      {[2, 5, 10].map((a) => (
        <a key={a} className="chip" href={build(a)} target="_blank" rel="noopener noreferrer">{a} €</a>
      ))}
      <a className="chip ghost" href={base} target="_blank" rel="noopener noreferrer">Outro valor</a>
    </div>
  );
}

function DonateSection() {
  const tabs = [
    DONATE.mbway && ["mbway", "MB WAY"],
    DONATE.paypal && ["paypal", "PayPal"],
    DONATE.revolut && ["revolut", "Revolut"],
    DONATE.iban && ["iban", "IBAN"],
  ].filter(Boolean);
  const [metodo, setMetodo] = useState(tabs[0] ? tabs[0][0] : "");
  if (!tabs.length) return null;

  return (
    <section className="donate rise">
      <div className="donate-orb" />
      <div className="donate-head"><span className="donate-heart"><Heart size={16} fill="currentColor" /></span> Ajuda a manter o site online</div>
      <p>Este simulador é gratuito e sem publicidade. Se te foi útil, um pequeno gesto ajuda a pagar o alojamento e a mantê-lo a crescer.</p>

      <div className="seg">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={`seg-btn${metodo === id ? " on" : ""}`} onClick={() => setMetodo(id)}>{label}</button>
        ))}
      </div>

      <div className="donate-body">
        {metodo === "mbway" && <CopyRow label="Número MB WAY" value={DONATE.mbway} hint="Na app MB WAY: Enviar dinheiro → introduz este número e o valor que quiseres." />}
        {metodo === "iban" && <CopyRow label="IBAN" value={DONATE.iban} hint="Transferência bancária para este IBAN. Obrigado!" />}
        {metodo === "paypal" && <AmountChips base={DONATE.paypal} build={(a) => `${DONATE.paypal}/${a}`} />}
        {metodo === "revolut" && (
          <>
            <a className="chip" href={DONATE.revolut} target="_blank" rel="noopener noreferrer">Abrir Revolut</a>
            <span className="donate-hint">Escolhes o valor na app do Revolut.</span>
          </>
        )}
      </div>

      <span className="donate-foot">Obrigado pelo apoio 💙</span>
    </section>
  );
}

/* ============================================================================
 * CONTACTO (Web3Forms — envia para o teu email, sem backend)
 * ========================================================================== */
function ContactSection() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [estado, setEstado] = useState("idle"); // idle | sending | ok | error
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef(null);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const valido = nome.trim() && emailOk && msg.trim() && captchaToken;

  const enviar = async () => {
    if (!valido || estado === "sending") return;
    setEstado("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: "Nova sugestão — minhalicenca.pt",
          from_name: "minhalicenca.pt",
          name: nome, email, message: msg,
          "h-captcha-response": captchaToken,
        }),
      });
      const data = await res.json();
      if (data.success) { setEstado("ok"); setNome(""); setEmail(""); setMsg(""); }
      else setEstado("error");
    } catch {
      setEstado("error");
    } finally {
      // o token do hCaptcha é de uso único — repõe sempre após uma tentativa
      setCaptchaToken("");
      captchaRef.current?.resetCaptcha?.();
    }
  };

  return (
    <section className="contact">
      <div className="contact-head">Tens uma sugestão?</div>
      <p>Encontraste um erro ou tens uma ideia para melhorar a ferramenta? Escreve abaixo — cada sugestão ajuda a tornar isto mais útil para toda a gente.</p>
      <div className="cf">
        <input className="cf-input" placeholder="O teu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className="cf-input" type="email" inputMode="email" placeholder="O teu email (ex.: nome@email.com)" value={email} onChange={(e) => setEmail(e.target.value)} />
        {email.trim() && !emailOk && <span className="cf-hint">Introduz um email válido para poderes enviar.</span>}
        <textarea className="cf-textarea" rows={4} placeholder="A tua mensagem…" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="cf-captcha">
          <HCaptcha
            ref={captchaRef}
            sitekey="50b2fe65-b00b-4b9e-ad62-3ba471098be2"
            reCaptchaCompat={false}
            theme="dark"
            onVerify={(token) => setCaptchaToken(token)}
            onExpire={() => setCaptchaToken("")}
            onError={() => setCaptchaToken("")}
          />
        </div>
        <button type="button" className="cf-btn" onClick={enviar} disabled={!valido || estado === "sending"}>
          {estado === "sending" ? "A enviar…" : <><Send size={16} /> Enviar sugestão</>}
        </button>
        {estado === "ok" && <div className="cf-msg ok"><Check size={15} /> Mensagem enviada. Obrigado pelo contributo!</div>}
        {estado === "error" && <div className="cf-msg err">Algo correu mal. Tenta de novo ou escreve-me no LinkedIn.</div>}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ftr">
      <a className="ftr-link" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>
        </svg>
        LinkedIn
      </a>
      <span className="ftr-meta">minhalicenca.pt · feito com 💙 · {new Date().getFullYear()}</span>
      <span className="ftr-disc">Esta ferramenta é informativa e pode conter erros. Confirma sempre os valores junto da Segurança Social — e se encontrares algo errado, avisa-me pelo formulário acima.</span>
    </footer>
  );
}

/* ============================================================================
 * CONTEÚDO + FAQ (SEO — foco nos dias de licença)
 * ========================================================================== */
function InfoFAQ() {
  const faqs = [
    { q: "Quantos dias de licença parental tem a mãe?", a: "A licença parental inicial da mãe é de 120 ou 150 dias (cerca de 4 a 5 meses). Com a partilha entre mãe e pai, o período pode chegar a 180 dias. A escolha entre 120 e 150 dias altera a percentagem do salário recebida." },
    { q: "Quantos dias de licença tem o pai?", a: "O pai tem 28 dias obrigatórios mais 7 dias facultativos, num total de até 35 dias de licença exclusiva, pagos a 100%. Pode ainda gozar dias adicionais através da licença parental partilhada." },
    { q: "O que é a licença parental partilhada e quantos dias acrescenta?", a: "É quando a mãe e o pai dividem a licença inicial. Permite aumentar o total para 180 dias, desde que o pai goze um número mínimo de dias em exclusivo. Em troca, a percentagem do subsídio é mais elevada." },
    { q: "Quando começam a contar os dias de licença?", a: "A licença conta a partir do nascimento da criança. Os primeiros dias obrigatórios do pai são gozados logo após o nascimento e a licença da mãe inicia-se no parto." },
    { q: "Os dias de licença do pai são seguidos ou interpolados?", a: "Os primeiros 7 dias são gozados de forma seguida logo após o nascimento. Os restantes 21 dias obrigatórios podem ser gozados seguidos ou interpolados, dentro das 6 semanas seguintes ao nascimento." },
    { q: "E em caso de gémeos?", a: "Por cada bebé além do primeiro, somam-se 30 dias à licença parental inicial e 2 dias à licença exclusiva do pai. Escolhe \"Gémeos\" ou \"Trigémeos\" no simulador e os dias são ajustados automaticamente." },
  ];
  return (
    <section className="info">
      <h2 className="info-title">Como funciona a licença parental em dias</h2>
      <p className="info-lead">
        Este simulador mostra-te, de forma simples, <b>quantos dias de licença parental</b> tens direito —
        para a <b>mãe</b> e para o <b>pai</b> — e desenha o <b>calendário</b> completo da ausência ao trabalho.
        Escolhe a data de nascimento e a modalidade, e vês logo os dias de cada um, quem está em casa e quando regressas ao trabalho.
      </p>
      <div className="faq">
        {faqs.map((f, i) => (
          <details className="faq-item" key={i}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>

      <div className="info-flag">
        <b>Em discussão:</b> está a ser debatida no Parlamento uma proposta para alargar a licença parental inicial a 180 dias pagos a 100%. Foi aprovada apenas na generalidade (janeiro de 2026) e <b>ainda não é lei</b> — só deverá aplicar-se a partir de 2027, se for aprovada em definitivo. Em 2026 mantêm-se as regras atuais usadas neste simulador.
      </div>

      <p className="info-note">
        Os dias e valores apresentados são uma estimativa informativa. Confirma sempre a tua situação concreta junto da Segurança Social.
      </p>
      <p className="info-sources">
        Atualizado em junho de 2026 · Fontes: Segurança Social e gov.pt (Código do Trabalho e Decreto-Lei n.º 91/2009).
      </p>
    </section>
  );
}

/* ============================================================================
 * APP
 * ========================================================================== */
export default function App() {
  const [dataNascimento, setData] = useState("");
  const [modId, setModId] = useState("120");
  const [paiFacultativo, setPaiFac] = useState(true);
  const [paiPartilha, setPaiPartilha] = useState(30);
  const [bebes, setBebes] = useState(1);
  const [salarioMae, setSalarioMae] = useState("");
  const [salarioPai, setSalarioPai] = useState("");

  const mod = MODALIDADES.find((m) => m.id === modId);
  const r = useMemo(
    () => calcular(dataNascimento, modId, paiFacultativo, paiPartilha, bebes),
    [dataNascimento, modId, paiFacultativo, paiPartilha, bebes]
  );

  // Valores estimados do subsídio
  const vMae = r ? valorSubsidio(salarioMae, r.mod.percent, r.maeBloco.dias) : null;
  const vPaiExcl = r ? valorSubsidio(salarioPai, 100, r.paiExclDias) : null;
  const vPaiPart = r && r.paiPartilha ? valorSubsidio(salarioPai, r.mod.percent, r.paiPartilha.dias) : null;
  const vPaiTotal = (vPaiExcl || vPaiPart) ? (vPaiExcl?.total || 0) + (vPaiPart?.total || 0) : null;

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="hdr rise">
        <div className="logo"><Baby size={26} /></div>
        <span className="eyebrow">Portugal · 2026</span>
        <h1>Licença Parental</h1>
        <p>Planeia os dias e o que vais receber</p>
      </header>

      <DonateSection />

      <div className="controls rise">
        <label className="ctl">
          <span>Data de nascimento (prevista ou efetiva)</span>
          <DatePicker value={dataNascimento} onChange={setData} />
        </label>

        <label className="ctl">
          <span>Modalidade</span>
          <select value={modId} onChange={(e) => {
            const id = e.target.value; setModId(id);
            const nm = MODALIDADES.find((m) => m.id === id);
            if (nm?.partilhada) setPaiPartilha(nm.paiMin);
          }}>
            {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.percent}%</option>)}
          </select>
        </label>

        <label className="ctl">
          <span>Número de bebés</span>
          <select value={bebes} onChange={(e) => setBebes(Number(e.target.value))}>
            <option value={1}>1 bebé</option>
            <option value={2}>Gémeos (2)</option>
            <option value={3}>Trigémeos (3)</option>
          </select>
        </label>

        <label className="ctl">
          <span>Salário médio da mãe (bruto/mês)</span>
          <input type="number" min="0" placeholder="€ por mês" value={salarioMae} onChange={(e) => setSalarioMae(e.target.value)} />
        </label>

        <label className="ctl">
          <span>Salário médio do pai (bruto/mês)</span>
          <input type="number" min="0" placeholder="€ por mês" value={salarioPai} onChange={(e) => setSalarioPai(e.target.value)} />
        </label>

        <div className="ctl toggle-row">
          <span>Pai goza os 7 dias facultativos (total {PAI_OBRIGATORIOS + PAI_FACULTATIVOS + 2 * Math.max(0, bebes - 1)})</span>
          <button type="button" role="switch" aria-checked={paiFacultativo}
            className={`switch${paiFacultativo ? " on" : ""}`} onClick={() => setPaiFac((v) => !v)}>
            <span className="knob" />
          </button>
        </div>

        {mod?.partilhada && (
          <label className="ctl">
            <span>Dias do bloco exclusivo do pai (mín. {mod.paiMin})</span>
            <input type="number" min={mod.paiMin} max={mod.pool - 42} value={paiPartilha}
              onChange={(e) => setPaiPartilha(Number(e.target.value))} />
          </label>
        )}
      </div>

      {!r ? (
        <div className="empty"><CalendarDays size={36} /><p>Escolhe a data de nascimento para ver os dias.</p></div>
      ) : (
        <>
          <div className="pctbar rise">
            <div className="pctmain">
              <span className="pctnum">{r.mod.percent}%</span>
              <span className="pctlbl">do salário de referência<br /><b>licença da mãe</b></span>
            </div>
            <div className="pctsep" />
            <div className="pctmain">
              <span className="pctnum">100%</span>
              <span className="pctlbl">dias obrigatórios<br /><b>do pai</b></span>
            </div>
            {r.paiPartilha && (
              <>
                <div className="pctsep" />
                <div className="pctmain">
                  <span className="pctnum">{r.mod.percent}%</span>
                  <span className="pctlbl">bloco partilhado<br /><b>do pai</b></span>
                </div>
              </>
            )}
          </div>

          <div className="cards rise">
            <div className="card mae">
              <div className="card-head"><span className="dot" style={{ background: "var(--mae)" }} />Mãe</div>
              <div className="big">{r.maeBloco.dias} <small>dias</small></div>
              <div className="pill" style={{ background: "var(--mae-soft)", color: "var(--mae)" }}>{r.mod.percent}% do salário</div>
              <div className="period">{fmt(r.maeBloco.inicio)} <ArrowRight size={13} /> {fmt(addDays(r.maeBloco.fim, -1))}</div>
              {vMae && (
                <div className="valor">{eur(vMae.total)} <small>no total · {eur2(vMae.diario)}/dia · ≈ {eur(vMae.diario * 30)}/mês</small></div>
              )}
              <div className="back">Regressa ao trabalho · <b>{fmt(r.regressoMae)}</b></div>
            </div>

            <div className="card pai">
              <div className="card-head"><span className="dot" style={{ background: "var(--pai)" }} />Pai</div>
              <div className="big">{r.paiExclDias + (r.paiPartilha ? r.paiPartilha.dias : 0)} <small>dias</small></div>
              <div className="period">
                <span className="tag">100%</span> Exclusiva · {fmt(r.paiExcl.inicio)} <ArrowRight size={13} /> {fmt(addDays(r.paiExcl.fim, -1))} ({r.paiExclDias} dias)
              </div>
              {r.paiPartilha && (
                <div className="period">
                  <span className="tag">{r.mod.percent}%</span> Partilhada · {fmt(r.paiPartilha.inicio)} <ArrowRight size={13} /> {fmt(addDays(r.paiPartilha.fim, -1))} ({r.paiPartilha.dias} dias)
                </div>
              )}
              {vPaiTotal != null && (
                <div className="valor">
                  {eur(vPaiTotal)} <small>no total</small>
                  {vPaiPart ? (
                    <div className="valor-break">
                      {vPaiExcl && <span>{r.paiExclDias} dias a 100% · {eur(vPaiExcl.total)} ({eur2(vPaiExcl.diario)}/dia)</span>}
                      <span>{r.paiPartilha.dias} dias a {r.mod.percent}% · {eur(vPaiPart.total)} ({eur2(vPaiPart.diario)}/dia)</span>
                    </div>
                  ) : (
                    vPaiExcl && <small>{eur2(vPaiExcl.diario)}/dia · ≈ {eur(vPaiExcl.diario * 30)}/mês</small>
                  )}
                </div>
              )}
              <div className="back">Regressa ao trabalho · <b>{fmt(r.regressoPai)}</b></div>
            </div>
          </div>

          <div className="note">
            <Info size={14} />
            <span>
              Os 28 dias obrigatórios do pai: os primeiros 7 seguidos logo após o nascimento, os restantes 21 dentro das 6 semanas seguintes.
              Mostrados como bloco seguido para simplificar. A percentagem é sobre a remuneração de referência (média dos descontos).
              Os valores são estimativas: salário ÷ 30 × percentagem, com o mínimo legal de {eur2(MIN_DIARIO)}/dia.
            </span>
          </div>

          <div className="legend">
            {["mae", "pai", "ambos"].map((k) => (
              <span key={k} className="leg"><i style={{ background: CORES[k].cor }} />{CORES[k].nome}</span>
            ))}
          </div>

          <div className="rise calwrap"><Calendario r={r} /></div>
        </>
      )}

      <InfoFAQ />
      <ContactSection />
      <Footer />
      <Analytics />
    </div>
  );
}

/* ============================================================================
 * ESTILOS — tipografia do sistema (San Francisco em dispositivos Apple)
 * ========================================================================== */
const CSS = `
html{overflow-y:scroll;scrollbar-gutter:stable}
body{margin:0;padding:0;display:block;background:#08080c;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,Roboto,sans-serif}
/* variáveis globais (necessárias para o calendário que é renderizado via portal no body) */
:root{
  --bg:#08080c; --ink:#f5f5f7; --muted:rgba(235,235,245,.6);
  --glass:rgba(24,24,28,.55); --glass2:rgba(44,44,50,.5);
  --glass-brd:rgba(255,255,255,.10); --field:rgba(255,255,255,.06);
  --accent:#0a84ff; --shadow:0 24px 60px -28px rgba(0,0,0,.7);
  --mae:#ff6482; --mae-soft:rgba(255,100,130,.18);
  --pai:#4aa3ff; --ambos:#c06bff;
}
#root{max-width:none;width:auto;margin:0;padding:0;text-align:left;display:block;place-items:initial}
.app{
  --bg:#08080c; --ink:#f5f5f7; --muted:rgba(235,235,245,.6);
  --glass:rgba(24,24,28,.55); --glass2:rgba(44,44,50,.5);
  --glass-brd:rgba(255,255,255,.10); --field:rgba(255,255,255,.06);
  --accent:#0a84ff; --shadow:0 24px 60px -28px rgba(0,0,0,.7);
  --mae:#ff6482; --mae-soft:rgba(255,100,130,.18);
  --pai:#4aa3ff; --ambos:#c06bff;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  color:var(--ink);max-width:1040px;margin:0 auto;padding:28px 24px 48px;min-height:100vh;
  position:relative;background:var(--bg);
}
.app.light{
  --bg:#eaedf3; --ink:#1d1d1f; --muted:rgba(60,60,67,.62);
  --glass:rgba(255,255,255,.6); --glass2:rgba(255,255,255,.5);
  --glass-brd:rgba(255,255,255,.75); --field:rgba(255,255,255,.85);
  --accent:#007aff; --shadow:0 24px 60px -30px rgba(20,50,100,.28);
  --mae:#ff2d55; --mae-soft:rgba(255,45,85,.10);
  --pai:#007aff; --ambos:#af52de;
}
/* fundo com gradiente vivo (cores da própria app) */
.app::before{content:"";position:fixed;inset:-30vmax;z-index:-2;pointer-events:none;
  background:
    radial-gradient(38vmax 38vmax at 16% 10%, color-mix(in srgb,var(--mae) 60%,transparent), transparent 60%),
    radial-gradient(42vmax 42vmax at 88% 6%, color-mix(in srgb,var(--pai) 60%,transparent), transparent 60%),
    radial-gradient(46vmax 46vmax at 72% 92%, color-mix(in srgb,var(--ambos) 55%,transparent), transparent 62%);
  filter:blur(72px) saturate(150%);opacity:.55;
  animation:drift 28s ease-in-out infinite alternate;
}
.app.light::before{opacity:.42}
@keyframes drift{
  0%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(2.5%,-2%,0) scale(1.07)}
  100%{transform:translate3d(-2.5%,2%,0) scale(1.05)}
}
/* grão subtil */
.app::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.04;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.app *{box-sizing:border-box}

/* superfície de vidro reutilizável */
.controls,.empty,.pctbar,.card,.note,.cal-month,.donate{
  background:var(--glass);
  -webkit-backdrop-filter:blur(34px) saturate(180%);backdrop-filter:blur(34px) saturate(180%);
  border:1px solid var(--glass-brd);
  box-shadow:var(--shadow), inset 0 1px 0 rgba(255,255,255,.08);
}

h1{font-size:33px;font-weight:700;margin:1px 0 0;letter-spacing:-.03em;line-height:1.02}
.eyebrow{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:var(--accent);margin-bottom:1px}

.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}
.brand{display:flex;gap:16px;align-items:center}
.hdr p{margin:4px 0 0;font-size:13.5px;color:var(--muted);letter-spacing:-.01em}
.logo{width:54px;height:54px;border-radius:17px;background:linear-gradient(150deg,var(--mae),var(--ambos) 55%,var(--pai));
  color:#fff;display:grid;place-items:center;box-shadow:0 14px 34px -12px var(--ambos);flex:none}
.theme{width:44px;height:44px;border-radius:14px;border:1px solid var(--glass-brd);background:var(--glass2);
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);color:var(--ink);display:grid;place-items:center;cursor:pointer;transition:.2s}
.theme:hover{color:var(--accent);transform:translateY(-1px)}

.controls{display:grid;grid-template-columns:1fr 1fr;gap:16px;border-radius:24px;padding:22px;margin-bottom:18px;position:relative;z-index:30}
@media(max-width:640px){.controls{grid-template-columns:1fr}}
.ctl{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600;letter-spacing:-.01em}
.ctl input,.ctl select{padding:12px 14px;border:1px solid var(--glass-brd);border-radius:13px;background:var(--field);
  color:var(--ink);font:inherit;font-size:15px;font-weight:500;transition:.18s;-webkit-appearance:none;appearance:none}
.ctl select{background-image:none}
.ctl input:focus,.ctl select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 26%,transparent)}
.ctl.check{flex-direction:row;align-items:center;gap:11px;font-weight:500;grid-column:1/-1}
.ctl.check input{width:21px;height:21px;accent-color:var(--accent)}

.empty{text-align:center;color:var(--muted);padding:70px 20px;border-radius:24px}
.empty svg{color:var(--accent);margin-bottom:12px}

.pctbar{display:flex;align-items:stretch;border-radius:24px;padding:22px 10px;margin-bottom:18px}
.pctmain{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;padding:0 10px}
.pctnum{font-size:42px;font-weight:700;letter-spacing:-.04em;line-height:1;
  background:linear-gradient(180deg,var(--ink),color-mix(in srgb,var(--ink) 52%,transparent));
  -webkit-background-clip:text;background-clip:text;color:transparent}
.pctlbl{font-size:11.5px;color:var(--muted);line-height:1.35}
.pctlbl b{color:var(--ink);font-weight:600}
.pctsep{width:1px;background:var(--glass-brd);margin:6px 0}

.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
@media(max-width:640px){.cards{grid-template-columns:1fr}}
.card{border-radius:24px;padding:22px;transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s;position:relative;overflow:hidden}
.card:hover{transform:translateY(-4px)}
.card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;opacity:.9}
.card.mae::before{background:linear-gradient(90deg,var(--mae),transparent)}
.card.pai::before{background:linear-gradient(90deg,var(--pai),transparent)}
.card-head{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;margin-bottom:10px;letter-spacing:-.01em}
.dot{width:11px;height:11px;border-radius:50%;box-shadow:0 0 14px currentColor}
.big{font-size:46px;font-weight:700;letter-spacing:-.04em;line-height:1;
  background:linear-gradient(180deg,var(--ink),color-mix(in srgb,var(--ink) 55%,transparent));
  -webkit-background-clip:text;background-clip:text;color:transparent}
.big small{font-size:17px;font-weight:500;color:var(--muted);letter-spacing:-.01em;-webkit-text-fill-color:var(--muted)}
.pill{display:inline-block;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:99px;margin-top:12px}
.valor{margin-top:14px;font-size:25px;font-weight:700;letter-spacing:-.025em}
.valor small{display:block;font-size:12px;font-weight:500;color:var(--muted);letter-spacing:0;margin-top:3px}
.valor-break{display:flex;flex-direction:column;gap:3px;margin-top:7px;font-size:12.5px;font-weight:500;color:var(--muted);letter-spacing:0;line-height:1.5}
.period{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-top:10px;letter-spacing:-.01em;flex-wrap:wrap}
.tag{font-size:11px;font-weight:700;color:#fff;background:var(--pai);border-radius:6px;padding:2px 7px}
.back{font-size:13px;color:var(--muted);margin-top:14px;padding-top:14px;border-top:1px solid var(--glass-brd)}
.back b{color:var(--ink)}

.note{display:flex;gap:11px;align-items:flex-start;font-size:12.5px;color:var(--muted);border-radius:18px;padding:15px 17px;margin-bottom:18px;line-height:1.55}
.note svg{flex:none;margin-top:1px;color:var(--accent)}

.legend{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:18px;padding-left:2px}
.leg{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);letter-spacing:-.01em}
.leg i{width:14px;height:14px;border-radius:5px;box-shadow:0 0 12px color-mix(in srgb,currentColor 0%,transparent)}

.cal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:18px}
.cal-month{border-radius:22px;padding:20px}
.cal-title{font-size:16px;font-weight:600;text-transform:capitalize;margin:0 0 16px;padding-bottom:13px;border-bottom:1px solid var(--glass-brd);letter-spacing:-.02em}
.cal-head{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:9px}
.cal-wd{font-size:11px;color:var(--muted);text-align:center;font-weight:500;text-transform:lowercase}
.cal-wd.we{opacity:.5}
.cal-body{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:40px;row-gap:3px}
.cal-cell{height:100%;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:500;color:var(--ink);letter-spacing:-.01em;transition:transform .12s}
.cal-cell.we{color:var(--muted);opacity:.5}
.cal-cell.leave{color:#fff;font-weight:600;box-shadow:0 6px 16px -10px rgba(0,0,0,.5)}
.cal-cell.birth{box-shadow:0 0 0 2.5px var(--accent) inset}

/* doação */
.donate{position:relative;overflow:hidden;text-align:center;border-radius:28px;padding:38px 26px;margin:0 0 18px}
.donate-orb{position:absolute;top:-70px;left:50%;transform:translateX(-50%);width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle,var(--mae),var(--ambos) 45%,transparent 72%);filter:blur(46px);opacity:.45;pointer-events:none}
.donate-head{position:relative;display:inline-flex;align-items:center;gap:10px;font-size:21px;font-weight:700;letter-spacing:-.025em;justify-content:center}
.donate-heart{color:var(--mae);display:inline-grid;place-items:center;animation:beat 1.7s ease-in-out infinite}
@keyframes beat{0%,100%{transform:scale(1)}12%{transform:scale(1.28)}24%{transform:scale(1)}36%{transform:scale(1.18)}50%{transform:scale(1)}}
.donate p{position:relative;max-width:460px;margin:12px auto 22px;color:var(--muted);font-size:14px;line-height:1.6}
.donate-chips{position:relative;display:flex;gap:11px;justify-content:center;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;justify-content:center;min-width:74px;padding:13px 24px;border-radius:15px;
  background:var(--field);border:1px solid var(--glass-brd);font-weight:700;font-size:16px;color:var(--ink);
  text-decoration:none;cursor:pointer;transition:.22s cubic-bezier(.22,1,.36,1);letter-spacing:-.01em}
.chip:hover{transform:translateY(-3px) scale(1.02);color:#fff;border-color:transparent;
  background:linear-gradient(135deg,var(--mae),var(--ambos));box-shadow:0 16px 34px -12px var(--ambos)}
.chip.ghost{font-weight:600;font-size:14.5px;color:var(--muted)}
.chip.ghost:hover{color:#fff}
.donate-foot{position:relative;display:block;margin-top:18px;font-size:12px;color:var(--muted)}

/* seletor de método de doação */
.seg{position:relative;display:inline-flex;flex-wrap:wrap;justify-content:center;gap:3px;margin:18px auto 0;
  padding:4px;border-radius:15px;background:var(--field);border:1px solid var(--glass-brd)}
.seg-btn{border:none;background:transparent;color:var(--muted);font:inherit;font-size:13.5px;font-weight:600;
  padding:9px 17px;border-radius:11px;cursor:pointer;transition:.2s cubic-bezier(.22,1,.36,1);letter-spacing:-.01em}
.seg-btn:hover{color:var(--ink)}
.seg-btn.on{color:#fff;background:linear-gradient(135deg,var(--mae),var(--ambos));box-shadow:0 8px 20px -10px var(--ambos)}

.donate-body{position:relative;margin-top:20px;display:flex;flex-direction:column;align-items:center;gap:12px;min-height:64px;justify-content:center}
.copy-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center}
.copy-val{display:flex;flex-direction:column;align-items:flex-start;text-align:left}
.copy-label{font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.copy-num{font-size:22px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.copy-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--glass-brd);background:var(--field);
  color:var(--ink);font:inherit;font-size:14px;font-weight:600;padding:11px 18px;border-radius:13px;cursor:pointer;transition:.22s cubic-bezier(.22,1,.36,1)}
.copy-btn:hover{border-color:transparent;color:#fff;transform:translateY(-2px);background:linear-gradient(135deg,var(--mae),var(--ambos));box-shadow:0 14px 30px -12px var(--ambos)}
.copy-btn svg{flex:none}
.donate-hint{position:relative;font-size:12px;color:var(--muted);max-width:380px;line-height:1.5}

/* contacto */
.contact{background:var(--glass);-webkit-backdrop-filter:blur(34px) saturate(180%);backdrop-filter:blur(34px) saturate(180%);
  border:1px solid var(--glass-brd);box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.08);
  border-radius:24px;padding:24px;margin-top:18px;text-align:center}
.contact-head{font-size:21px;font-weight:700;letter-spacing:-.025em}
.contact p{color:var(--muted);font-size:14px;margin:8px auto 18px;max-width:420px;line-height:1.55}
.cf{display:flex;flex-direction:column;gap:11px;max-width:520px;margin:0 auto;text-align:left}
.cf-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.cf-input,.cf-textarea{width:100%;min-width:0;padding:12px 14px;border:1px solid var(--glass-brd);border-radius:13px;
  background:var(--field);color:var(--ink);font:inherit;font-size:15px;font-weight:500;transition:.18s;resize:vertical}
.cf-input:focus,.cf-textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}
.cf-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;border-radius:13px;padding:13px 20px;
  font:inherit;font-size:15px;font-weight:600;color:#fff;cursor:pointer;transition:.22s cubic-bezier(.22,1,.36,1);
  background:linear-gradient(135deg,var(--mae),var(--ambos))}
.cf-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 34px -12px var(--ambos)}
.cf-btn:disabled{opacity:.5;cursor:not-allowed}
.cf-msg{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;padding:10px 14px;border-radius:11px}
.cf-captcha{display:flex;justify-content:center;min-height:78px}
.cf-hint{font-size:12px;color:var(--mae);margin-top:-4px;font-weight:600}
.cf-msg.ok{color:#30d158;background:rgba(48,209,88,.12)}
.cf-msg.err{color:var(--mae);background:var(--mae-soft)}

/* footer */
.ftr{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;
  margin-top:24px;padding:24px 16px 8px;border-top:1px solid var(--glass-brd)}
.ftr-link{display:inline-flex;align-items:center;gap:8px;color:var(--ink);text-decoration:none;font-weight:600;font-size:14px;
  padding:9px 16px;border:1px solid var(--glass-brd);border-radius:12px;background:var(--glass);transition:.2s}
.ftr-link:hover{color:#fff;border-color:transparent;transform:translateY(-2px);background:linear-gradient(135deg,var(--pai),var(--ambos));box-shadow:0 12px 28px -12px var(--pai)}
.ftr-meta{font-size:12.5px;color:var(--muted)}
.ftr-disc{font-size:11.5px;color:var(--muted);max-width:460px;line-height:1.5;opacity:.85}

/* conteúdo + FAQ */
.info{background:var(--glass);-webkit-backdrop-filter:blur(34px) saturate(180%);backdrop-filter:blur(34px) saturate(180%);
  border:1px solid var(--glass-brd);box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.08);
  border-radius:24px;padding:26px;margin-top:18px}
.info-title{font-size:21px;font-weight:700;letter-spacing:-.025em;margin:0 0 12px;text-align:center}
.info-lead{color:var(--muted);font-size:14px;line-height:1.65;margin:0 auto 20px;max-width:640px;text-align:center}
.info-lead b{color:var(--ink);font-weight:600}
.faq{display:flex;flex-direction:column;gap:10px;max-width:680px;margin:0 auto}
.faq-item{border:1px solid var(--glass-brd);border-radius:14px;background:var(--field);overflow:hidden}
.faq-item summary{cursor:pointer;list-style:none;padding:15px 18px;font-size:14.5px;font-weight:600;letter-spacing:-.01em;
  display:flex;align-items:center;justify-content:space-between;gap:12px;transition:.18s}
.faq-item summary::-webkit-details-marker{display:none}
.faq-item summary::after{content:"+";font-size:21px;font-weight:300;color:var(--accent);transition:transform .2s;line-height:1}
.faq-item[open] summary::after{transform:rotate(45deg)}
.faq-item summary:hover{color:var(--accent)}
.faq-item p{margin:0;padding:0 18px 16px;color:var(--muted);font-size:13.5px;line-height:1.6}
.info-note{max-width:640px;margin:18px auto 0;text-align:center;font-size:12px;color:var(--muted);opacity:.85;line-height:1.5}
.info-flag{max-width:680px;margin:20px auto 0;padding:14px 18px;border-radius:14px;font-size:13px;line-height:1.55;
  color:var(--ink);background:color-mix(in srgb,var(--pai) 12%,transparent);border:1px solid color-mix(in srgb,var(--pai) 35%,transparent)}
.info-flag b{font-weight:700}
.info-sources{max-width:640px;margin:10px auto 0;text-align:center;font-size:11.5px;color:var(--muted);opacity:.7;line-height:1.5}

/* cabeçalho centrado */
.hdr{display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;margin:6px 0 18px}
.hdr .logo{width:60px;height:60px;border-radius:19px;margin-bottom:12px}
.hdr h1{font-size:36px}
.hdr p{margin-top:5px}

/* toggle estilo iOS */
.toggle-row{flex-direction:row;align-items:center;justify-content:space-between;gap:14px;grid-column:1/-1;font-weight:500}
.switch{position:relative;flex:none;width:52px;height:31px;border-radius:99px;border:none;cursor:pointer;padding:0;
  background:#39393d;transition:background .25s cubic-bezier(.22,1,.36,1)}
.switch.on{background:#30d158}
.switch .knob{position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;
  box-shadow:0 3px 8px rgba(0,0,0,.35);transition:transform .25s cubic-bezier(.22,1,.36,1)}
.switch.on .knob{transform:translateX(21px)}

/* date picker próprio */
.dp{position:relative}
.dp-backdrop{position:fixed;inset:0;z-index:999;background:transparent}
.dp-trigger{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--glass-brd);
  border-radius:13px;background:var(--field);color:var(--ink);font:inherit;font-size:15px;font-weight:500;cursor:pointer;transition:.18s;line-height:1}
.dp-trigger svg{color:var(--accent);flex:none;display:block}
.dp-trigger span{display:inline-flex;align-items:center;height:18px;line-height:1}
.dp-trigger.empty{color:var(--muted)}
.dp-trigger:hover{border-color:var(--accent)}
.dp-pop{position:absolute;z-index:50;top:calc(100% + 8px);left:0;width:300px;max-width:calc(100vw - 48px);
  padding:16px;border-radius:20px;background:var(--glass2);border:1px solid var(--glass-brd);
  -webkit-backdrop-filter:blur(40px) saturate(180%);backdrop-filter:blur(40px) saturate(180%);
  box-shadow:0 30px 70px -24px rgba(0,0,0,.7);animation:rise .28s cubic-bezier(.22,1,.36,1) forwards}
.dp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.dp-month{font-size:15px;font-weight:600;text-transform:capitalize;letter-spacing:-.01em}
.dp-nav{width:32px;height:32px;border-radius:10px;border:1px solid var(--glass-brd);background:var(--field);
  color:var(--ink);display:grid;place-items:center;cursor:pointer;transition:.15s}
.dp-nav:hover{color:var(--accent);border-color:var(--accent)}
.dp-wd{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px}
.dp-wd span{text-align:center;font-size:10.5px;font-weight:600;color:var(--muted);text-transform:uppercase}
.dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.dp-day{aspect-ratio:1;border:none;background:transparent;color:var(--ink);border-radius:10px;font:inherit;
  font-size:13.5px;font-weight:500;cursor:pointer;transition:.14s;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.dp-day:hover{background:var(--field)}
.dp-day.sel{background:var(--accent);color:#fff;font-weight:700;box-shadow:0 8px 18px -8px var(--accent)}

/* animações de entrada escalonadas */
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
.rise{opacity:0;animation:rise .8s cubic-bezier(.22,1,.36,1) forwards}
.hdr.rise{animation-delay:.05s}
.donate.rise{animation-delay:.12s}
.controls.rise{animation-delay:.19s}
.pctbar.rise{animation-delay:.26s}
.cards.rise{animation-delay:.33s}
.calwrap.rise{animation-delay:.40s}
@media(prefers-reduced-motion:reduce){.rise{animation:none;opacity:1}.app::before{animation:none}.donate-heart{animation:none}.dp-pop{animation:none}}

/* robustez mobile — impede que inputs/cartões fiquem mais largos que o ecrã */
body{overflow-x:hidden}
.app{overflow-x:hidden}
.controls,.cards,.pctbar,.ctl,.card,.pctmain,.stat{min-width:0}
.ctl input,.ctl select,.dp-trigger{min-width:0;max-width:100%}
.dp-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

@media(max-width:520px){
  .app{padding:20px 16px 40px}
  h1{font-size:30px}
  .eyebrow{font-size:10.5px}
  .controls{padding:18px;border-radius:20px;gap:14px}
  .card{padding:18px;border-radius:20px}
  .pctbar{padding:18px 4px;border-radius:20px}
  .pctnum{font-size:32px}
  .big{font-size:38px}
  .valor{font-size:22px}
  .donate{padding:28px 18px;border-radius:22px}
  .donate-head{font-size:18px}
  .donate p{font-size:13.5px}
  .cal-grid{grid-template-columns:1fr}
  .cal-month{padding:16px}
  .cf-grid{grid-template-columns:1fr}
  .contact{padding:20px;border-radius:20px}
  .contact-head{font-size:18px}
  .info{padding:20px;border-radius:20px}
  .info-title{font-size:18px}
}
`;