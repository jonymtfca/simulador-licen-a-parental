import React, { useState, useMemo } from 'react';
import { Baby, CalendarDays, Info, ArrowRight, Sun, Moon } from 'lucide-react';

/* ============================================================================
 * REGRAS (Portugal) — isoladas para fácil atualização
 * percent = % da remuneração de referência paga pela Segurança Social
 * ========================================================================== */
const PAI_OBRIGATORIOS = 28; // dias obrigatórios do pai (sempre a 100%)
const PAI_FACULTATIVOS = 7; // dias facultativos do pai (sempre a 100%)

const MODALIDADES = [
  {
    id: '120',
    nome: 'Inicial — 120 dias',
    partilhada: false,
    maeDias: 120,
    percent: 100,
  },
  {
    id: '150',
    nome: 'Inicial — 150 dias',
    partilhada: false,
    maeDias: 150,
    percent: 80,
  },
  {
    id: 'p150',
    nome: 'Partilhada — 120 + 30 (150 dias)',
    partilhada: true,
    pool: 150,
    paiMin: 30,
    percent: 100,
  },
  {
    id: 'p180',
    nome: 'Partilhada — 150 + 30 (180 dias)',
    partilhada: true,
    pool: 180,
    paiMin: 30,
    percent: 83,
  },
  {
    id: 'p180b',
    nome: 'Partilhada — 180 dias · pai 60 dias',
    partilhada: true,
    pool: 180,
    paiMin: 60,
    percent: 90,
  },
];

/* ============================================================================
 * DATAS
 * ========================================================================== */
const parse = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt) ? null : dt;
};
const addDays = (dt, n) => {
  const r = new Date(dt);
  r.setDate(r.getDate() + n);
  return r;
};
const key = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
const fmt = (dt) =>
  dt
    ? dt.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';
const inRange = (dt, a, b) => dt >= a && dt < b; // [a, b)

/* ============================================================================
 * MOTOR — blocos de ausência de cada progenitor
 * ========================================================================== */
function calcular(dataNascimento, modId, paiFacultativo, paiPartilhaDias) {
  const birth = parse(dataNascimento);
  const mod = MODALIDADES.find((m) => m.id === modId);
  if (!birth || !mod) return null;

  const paiExclDias =
    PAI_OBRIGATORIOS + (paiFacultativo ? PAI_FACULTATIVOS : 0);
  const paiExcl = {
    tipo: 'pai',
    inicio: birth,
    fim: addDays(birth, paiExclDias),
    dias: paiExclDias,
  };

  let maeBloco,
    paiPartilha = null;
  if (!mod.partilhada) {
    maeBloco = {
      tipo: 'mae',
      inicio: birth,
      fim: addDays(birth, mod.maeDias),
      dias: mod.maeDias,
    };
  } else {
    const paiP = Math.max(
      mod.paiMin,
      Math.min(paiPartilhaDias || mod.paiMin, mod.pool - 42)
    );
    const maeDias = mod.pool - paiP;
    maeBloco = {
      tipo: 'mae',
      inicio: birth,
      fim: addDays(birth, maeDias),
      dias: maeDias,
    };
    paiPartilha = {
      tipo: 'partilha',
      inicio: maeBloco.fim,
      fim: addDays(maeBloco.fim, paiP),
      dias: paiP,
    };
  }

  const regressoMae = maeBloco.fim;
  const regressoPai = paiPartilha ? paiPartilha.fim : paiExcl.fim;
  const fimGeral = new Date(Math.max(regressoMae, regressoPai));

  return {
    birth,
    mod,
    maeBloco,
    paiExcl,
    paiPartilha,
    regressoMae,
    regressoPai,
    fimGeral,
    paiExclDias,
  };
}

function categoriaDia(dt, r) {
  if (r.paiPartilha && inRange(dt, r.paiPartilha.inicio, r.paiPartilha.fim))
    return 'pai';
  const naMae = inRange(dt, r.maeBloco.inicio, r.maeBloco.fim);
  const noPai = inRange(dt, r.paiExcl.inicio, r.paiExcl.fim);
  if (naMae && noPai) return 'ambos';
  if (naMae) return 'mae';
  if (noPai) return 'pai';
  return null;
}

const CORES = {
  mae: { cor: 'var(--mae)', nome: 'Licença da mãe' },
  pai: { cor: 'var(--pai)', nome: 'Licença do pai' },
  ambos: { cor: 'var(--ambos)', nome: 'Mãe e pai em casa' },
  partilha: { cor: 'var(--pai)', nome: 'Bloco partilhado' },
};

/* ============================================================================
 * CALENDÁRIO
 * ========================================================================== */
function Calendario({ r }) {
  const meses = useMemo(() => {
    const ini = new Date(r.birth.getFullYear(), r.birth.getMonth(), 1);
    const out = [];
    let cur = new Date(ini);
    while (cur <= r.fimGeral && out.length < 18) {
      out.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [r]);
  const wd = [
    ['seg', 0],
    ['ter', 0],
    ['qua', 0],
    ['qui', 0],
    ['sex', 0],
    ['sáb', 1],
    ['dom', 1],
  ];

  return (
    <div className="cal-grid">
      {meses.map((m, mi) => {
        const first = new Date(m.getFullYear(), m.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7; // segunda = 0
        const nd = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const dias = Array.from(
          { length: nd },
          (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1)
        );
        return (
          <div className="cal-month" key={mi}>
            <div className="cal-title">
              {m.toLocaleDateString('pt-PT', {
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <div className="cal-head">
              {wd.map(([d, we], i) => (
                <span key={i} className={`cal-wd${we ? ' we' : ''}`}>
                  {d}
                </span>
              ))}
            </div>
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
                  style.borderRadius = `${runStart ? 10 : 0}px ${
                    runEnd ? 10 : 0
                  }px ${runEnd ? 10 : 0}px ${runStart ? 10 : 0}px`;
                }
                const cls = ['cal-cell'];
                if (cat) cls.push('leave');
                else if (weekend) cls.push('we');
                if (isBirth) cls.push('birth');
                return (
                  <span
                    key={idx}
                    className={cls.join(' ')}
                    style={style}
                    title={cat ? CORES[cat].nome : ''}
                  >
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
 * APP
 * ========================================================================== */
export default function App() {
  const [dark, setDark] = useState(true); // dark por defeito
  const [dataNascimento, setData] = useState('');
  const [modId, setModId] = useState('120');
  const [paiFacultativo, setPaiFac] = useState(true);
  const [paiPartilha, setPaiPartilha] = useState(30);

  const mod = MODALIDADES.find((m) => m.id === modId);
  const r = useMemo(
    () => calcular(dataNascimento, modId, paiFacultativo, paiPartilha),
    [dataNascimento, modId, paiFacultativo, paiPartilha]
  );

  return (
    <div className={`app ${dark ? '' : 'light'}`}>
      <style>{CSS}</style>

      <header className="hdr">
        <div className="brand">
          <div className="logo">
            <Baby size={22} />
          </div>
          <div>
            <h1>Licença Parental</h1>
            <p>Dias de ausência a comunicar à empresa</p>
          </div>
        </div>
        <button
          className="theme"
          onClick={() => setDark((d) => !d)}
          aria-label="Tema"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <div className="controls">
        <label className="ctl">
          <span>Data de nascimento (prevista ou efetiva)</span>
          <input
            type="date"
            value={dataNascimento}
            onChange={(e) => setData(e.target.value)}
          />
        </label>

        <label className="ctl">
          <span>Modalidade</span>
          <select
            value={modId}
            onChange={(e) => {
              const id = e.target.value;
              setModId(id);
              const nm = MODALIDADES.find((m) => m.id === id);
              if (nm?.partilhada) setPaiPartilha(nm.paiMin);
            }}
          >
            {MODALIDADES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · {m.percent}%
              </option>
            ))}
          </select>
        </label>

        <label className="ctl check">
          <input
            type="checkbox"
            checked={paiFacultativo}
            onChange={(e) => setPaiFac(e.target.checked)}
          />
          <span>
            Pai goza os 7 dias facultativos (total{' '}
            {PAI_OBRIGATORIOS + PAI_FACULTATIVOS})
          </span>
        </label>

        {mod?.partilhada && (
          <label className="ctl">
            <span>Dias do bloco exclusivo do pai (mín. {mod.paiMin})</span>
            <input
              type="number"
              min={mod.paiMin}
              max={mod.pool - 42}
              value={paiPartilha}
              onChange={(e) => setPaiPartilha(Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {!r ? (
        <div className="empty">
          <CalendarDays size={36} />
          <p>Escolhe a data de nascimento para ver os dias.</p>
        </div>
      ) : (
        <>
          <div className="pctbar">
            <div className="pctmain">
              <span className="pctnum">{r.mod.percent}%</span>
              <span className="pctlbl">
                do salário de referência
                <br />
                <b>licença da mãe</b>
              </span>
            </div>
            <div className="pctsep" />
            <div className="pctmain">
              <span className="pctnum">100%</span>
              <span className="pctlbl">
                dias obrigatórios
                <br />
                <b>do pai</b>
              </span>
            </div>
            {r.paiPartilha && (
              <>
                <div className="pctsep" />
                <div className="pctmain">
                  <span className="pctnum">{r.mod.percent}%</span>
                  <span className="pctlbl">
                    bloco partilhado
                    <br />
                    <b>do pai</b>
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="cards">
            <div className="card mae">
              <div className="card-head">
                <span className="dot" style={{ background: 'var(--mae)' }} />
                Mãe
              </div>
              <div className="big">
                {r.maeBloco.dias} <small>dias</small>
              </div>
              <div
                className="pill"
                style={{ background: 'var(--mae-soft)', color: 'var(--mae)' }}
              >
                {r.mod.percent}% do salário
              </div>
              <div className="period">
                {fmt(r.maeBloco.inicio)} <ArrowRight size={13} />{' '}
                {fmt(addDays(r.maeBloco.fim, -1))}
              </div>
              <div className="back">
                Regressa ao trabalho · <b>{fmt(r.regressoMae)}</b>
              </div>
            </div>

            <div className="card pai">
              <div className="card-head">
                <span className="dot" style={{ background: 'var(--pai)' }} />
                Pai
              </div>
              <div className="big">
                {r.paiExclDias + (r.paiPartilha ? r.paiPartilha.dias : 0)}{' '}
                <small>dias</small>
              </div>
              <div className="period">
                <span className="tag">100%</span> Exclusiva ·{' '}
                {fmt(r.paiExcl.inicio)} <ArrowRight size={13} />{' '}
                {fmt(addDays(r.paiExcl.fim, -1))} ({r.paiExclDias} dias)
              </div>
              {r.paiPartilha && (
                <div className="period">
                  <span className="tag">{r.mod.percent}%</span> Partilhada ·{' '}
                  {fmt(r.paiPartilha.inicio)} <ArrowRight size={13} />{' '}
                  {fmt(addDays(r.paiPartilha.fim, -1))} ({r.paiPartilha.dias}{' '}
                  dias)
                </div>
              )}
              <div className="back">
                Regressa ao trabalho · <b>{fmt(r.regressoPai)}</b>
              </div>
            </div>
          </div>

          <div className="note">
            <Info size={14} />
            <span>
              Os 28 dias obrigatórios do pai: os primeiros 7 seguidos logo após
              o nascimento, os restantes 21 dentro das 6 semanas seguintes.
              Mostrados como bloco seguido para simplificar. A percentagem é
              sobre a remuneração de referência (média dos descontos).
            </span>
          </div>

          <div className="legend">
            {['mae', 'pai', 'ambos'].map((k) => (
              <span key={k} className="leg">
                <i style={{ background: CORES[k].cor }} />
                {CORES[k].nome}
              </span>
            ))}
          </div>

          <Calendario r={r} />
        </>
      )}
    </div>
  );
}

/* ============================================================================
 * ESTILOS — tipografia do sistema (San Francisco em dispositivos Apple)
 * ========================================================================== */
const CSS = `
.app{
  --bg:#000000; --bg-grad:#0a1622; --card:#1c1c1e; --card2:#2c2c2e;
  --ink:#f5f5f7; --muted:#98989d; --line:rgba(255,255,255,.10);
  --accent:#0a84ff; --field:#2c2c2e;
  --mae:#ff6482; --mae-soft:rgba(255,100,130,.16);
  --pai:#409cff; --ambos:#bf5af2;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
  color:var(--ink);max-width:1000px;margin:0 auto;padding:24px;min-height:100vh;
  background:radial-gradient(1100px 600px at 100% -15%,var(--bg-grad),transparent 60%),var(--bg);
}
.app.light{
  --bg:#f2f2f7; --bg-grad:#dbe9ff; --card:#ffffff; --card2:#f2f2f7;
  --ink:#1d1d1f; --muted:#6e6e73; --line:rgba(0,0,0,.09);
  --accent:#007aff; --field:#ffffff;
  --mae:#ff2d55; --mae-soft:rgba(255,45,85,.10);
  --pai:#007aff; --ambos:#af52de;
}
.app *{box-sizing:border-box}
h1{font-size:25px;font-weight:600;margin:0;letter-spacing:-.022em}

.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.brand{display:flex;gap:14px;align-items:center}
.hdr p{margin:2px 0 0;font-size:13px;color:var(--muted);letter-spacing:-.01em}
.logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(160deg,var(--accent),#0066cc);color:#fff;display:grid;place-items:center;box-shadow:0 10px 26px -10px var(--accent)}
.theme{width:42px;height:42px;border-radius:13px;border:1px solid var(--line);background:var(--card);color:var(--ink);display:grid;place-items:center;cursor:pointer;transition:.15s}
.theme:hover{border-color:var(--accent);color:var(--accent)}

.controls{display:grid;grid-template-columns:1fr 1fr;gap:15px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:18px}
@media(max-width:640px){.controls{grid-template-columns:1fr}}
.ctl{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;letter-spacing:-.01em}
.ctl input,.ctl select{padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--ink);font:inherit;font-size:15px;font-weight:400}
.ctl input:focus,.ctl select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}
.ctl.check{flex-direction:row;align-items:center;gap:10px;font-weight:500;grid-column:1/-1}
.ctl.check input{width:20px;height:20px;accent-color:var(--accent)}

.empty{text-align:center;color:var(--muted);padding:64px 20px;background:var(--card);border:1px solid var(--line);border-radius:20px}
.empty svg{color:var(--accent);margin-bottom:10px}

.pctbar{display:flex;align-items:stretch;gap:0;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px 8px;margin-bottom:16px}
.pctmain{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;padding:0 8px}
.pctnum{font-size:34px;font-weight:600;letter-spacing:-.03em;line-height:1}
.pctlbl{font-size:11.5px;color:var(--muted);line-height:1.35}
.pctlbl b{color:var(--ink);font-weight:600}
.pctsep{width:1px;background:var(--line);margin:4px 0}

.cards{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px}
@media(max-width:640px){.cards{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px}
.card-head{display:flex;align-items:center;gap:9px;font-weight:600;font-size:15px;margin-bottom:8px;letter-spacing:-.01em}
.dot{width:11px;height:11px;border-radius:50%}
.big{font-size:40px;font-weight:600;letter-spacing:-.03em;line-height:1}
.big small{font-size:16px;font-weight:500;color:var(--muted);letter-spacing:-.01em}
.pill{display:inline-block;font-size:12.5px;font-weight:600;padding:4px 11px;border-radius:99px;margin-top:10px}
.period{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-top:9px;letter-spacing:-.01em;flex-wrap:wrap}
.tag{font-size:11px;font-weight:700;color:#fff;background:var(--pai);border-radius:6px;padding:2px 6px}
.back{font-size:13px;color:var(--muted);margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.back b{color:var(--ink)}

.note{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 15px;margin-bottom:18px;line-height:1.5}
.note svg{flex:none;margin-top:1px;color:var(--accent)}

.legend{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:14px}
.leg{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);letter-spacing:-.01em}
.leg i{width:14px;height:14px;border-radius:5px}

.cal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.cal-month{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px}
.cal-title{font-size:16px;font-weight:600;text-transform:capitalize;margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid var(--line);letter-spacing:-.02em}
.cal-head{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:8px}
.cal-wd{font-size:11px;color:var(--muted);text-align:center;font-weight:500;text-transform:lowercase}
.cal-wd.we{opacity:.5}
.cal-body{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:40px;row-gap:3px}
.cal-cell{height:100%;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:500;color:var(--ink);letter-spacing:-.01em}
.cal-cell.we{color:var(--muted);opacity:.55}
.cal-cell.leave{color:#fff;font-weight:600}
.cal-cell.birth{box-shadow:0 0 0 2.5px var(--accent) inset}
`;
