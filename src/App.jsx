import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase, supabaseConfigured } from "./supabase.js";

/* ─── Global Styles & Fonts ─────────────────────────────────────────────────── */
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 15px; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    body { background: #F7F6F3; font-family: 'Plus Jakarta Sans', sans-serif; color: #111111; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #C8C4BC; border-radius: 4px; }
    input, textarea, button { font-family: 'Plus Jakarta Sans', sans-serif; }
    input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }
    @keyframes fadeUp   { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
    @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
    @keyframes scaleIn  { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
    @keyframes spin     { to { transform: rotate(360deg); } }
    .page-enter  { animation: fadeUp 0.38s cubic-bezier(0.16,1,0.3,1) forwards; }
    .modal-enter { animation: scaleIn 0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
    .tr:hover { background: #F2F0EB !important; }
    .task-row:hover .del-x { opacity: 1 !important; }
    .ghost:hover { color: #111111 !important; }
    .tab:hover { color: #111111 !important; }
    .btn-dark:hover { background: #2a2a2a !important; }
    .btn-ghost:hover { background: #ECEAE4 !important; }
    input:focus { outline: none; }
    .spinner { animation: spin 0.8s linear infinite; }
  `}</style>
);

/* ─── Tokens ────────────────────────────────────────────────────────────────── */
const T = {
  bg:         "#F7F6F3",
  surface:    "#FFFFFF",
  border:     "#E2E0DA",
  borderLight:"#ECEAE5",
  text:       "#111111",
  textMid:    "#555250",
  textLight:  "#9A9690",
  mono:       "'IBM Plex Mono', monospace",
  green:      "#146B3A",
  amber:      "#9A5C00",
  red:        "#B5291E",
  greenBg:    "#E4F2EA",
  amberBg:    "#FDF0DC",
  redBg:      "#FAEAE8",
};
const border = `1px solid #E2E0DA`;

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat"];
const DFULL  = { Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday" };
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const uid   = () => Math.random().toString(36).slice(2,9);
const clamp = (v,a,b) => Math.min(Math.max(Number(v)||0,a),b);

const DEFAULT_METRICS = [
  { id:"rich",   label:"Rich",             color:"#B06A00" },
  { id:"fit",    label:"Fit",              color:"#1A7A4A" },
  { id:"intel",  label:"Intelligent",      color:"#1D5FAA" },
  { id:"spirit", label:"Psycho-Spiritual", color:"#7B3FA0" },
];

const makeTasks = () => {
  const w = {};
  DAYS.forEach(d => {
    w[d] = {};
    DEFAULT_METRICS.forEach(m => {
      const n = m.id==="spirit"?6:m.id==="rich"?3:2;
      w[d][m.id] = Array.from({length:n},(_,i)=>({id:`${d}-${m.id}-${i}`,text:"To-do",done:false}));
    });
  });
  return w;
};

const makeYearData = () => {
  const y = {};
  MONTHS.forEach(mo => { y[mo] = { w1:null,w2:null,w3:null,w4:null }; });
  return y;
};

const freshData = () => ({
  metrics:    DEFAULT_METRICS,
  benchmarks: { best:90, worst:50 },
  weeklyGoal:  { label:"Weekly Goal",  items:[{id:"wg0",text:"To-do",done:false}] },
  monthlyGoal: { label:"Monthly Goal", items:[{id:"mg0",text:"To-do",done:false}] },
  tasks:       makeTasks(),
  misc:        [],
  weeks:       [{id:"w0",label:"Week 1",rate:null},{id:"w1",label:"Week 2",rate:null},{id:"w2",label:"Week 3",rate:null},{id:"w3",label:"Week 4",rate:null}],
  yearData:    makeYearData(),
  currentMonth: MONTHS[new Date().getMonth()],
});

/* ─── Calculations ──────────────────────────────────────────────────────────── */
const calcDay  = (tasks,metrics,day) => {
  let done=0,total=0;
  metrics.forEach(m => { const ts=tasks[day]?.[m.id]||[]; done+=ts.filter(t=>t.done).length; total+=ts.length; });
  return { done, total, pct: total>0?Math.round(done/total*100):0 };
};
const calcWeek = (tasks,metrics) => {
  let done=0,total=0;
  DAYS.forEach(d => { const r=calcDay(tasks,metrics,d); done+=r.done; total+=r.total; });
  return { done, total, pct: total>0?Math.round(done/total*100):0 };
};
const monthAvg   = weeks => { const f=weeks.filter(w=>w.rate!==null); return f.length>0?Math.round(f.reduce((s,w)=>s+w.rate,0)/f.length):null; };
const statusColor= (pct,b) => pct===null?"#ccc":pct>=b.best?T.green:pct>=b.worst?T.amber:T.red;
const statusBg   = (pct,b) => pct===null?"#f5f5f3":pct>=b.best?T.greenBg:pct>=b.worst?T.amberBg:T.redBg;
const statusLabel= (pct,b) => pct>=b.best?"Excellent 🔥":pct>=b.worst?"On Track ⚡":"You're Below Best – Attack Now.";

/* ─── Local cache (instant UI, sync in background) ─────────────────────────── */
const LC_KEY = "ps_cache_v1";
const lcSave = (uid, d) => { try { localStorage.setItem(`${LC_KEY}:${uid}`, JSON.stringify(d)); } catch {} };
const lcLoad = (uid)    => { try { return JSON.parse(localStorage.getItem(`${LC_KEY}:${uid}`)); } catch { return null; } };

/* ══════════════════════════════════════════════════════════════════════════════
   ROOT — Auth gate + data loader
══════════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [authUser, setAuthUser] = useState(null);   // supabase user object
  const [data,     setData]     = useState(null);   // app data
  const [loading,  setLoading]  = useState(true);   // initial auth check
  const [syncing,  setSyncing]  = useState(false);  // background save indicator
  const saveTimer = useRef(null);

  /* ── Listen to Supabase auth state ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadData(session.user);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) loadData(session.user);
      else { setData(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ── Load data from Supabase, fall back to local cache ── */
  const loadData = async (user) => {
    // Show cached data instantly while fetching
    const cached = lcLoad(user.id);
    if (cached) { setData(cached); setLoading(false); }

    const { data: row, error } = await supabase
      .from("user_data")
      .select("payload")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) { console.error("Load error:", error); setLoading(false); return; }

    if (row?.payload) {
      const merged = { ...freshData(), ...row.payload };
      setData(merged);
      lcSave(user.id, merged);
    } else {
      // First time user — create fresh data in DB
      const fresh = freshData();
      await supabase.from("user_data").insert({ user_id: user.id, payload: fresh });
      setData(fresh);
      lcSave(user.id, fresh);
    }
    setLoading(false);
  };

  /* ── Debounced cloud save (saves 1.5s after last change) ── */
  const saveToCloud = useCallback((userId, newData) => {
    lcSave(userId, newData); // immediate local cache
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncing(true);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("user_data").upsert({ user_id: userId, payload: newData, updated_at: new Date().toISOString() });
      setSyncing(false);
    }, 1500);
  }, []);

  /* ── Update function passed to all sections ── */
  const update = useCallback(fn => {
    setData(prev => {
      const next = fn(prev);
      if (authUser) saveToCloud(authUser.id, next);
      return next;
    });
  }, [authUser, saveToCloud]);

  /* ── Auth handlers ── */
  const logout = async () => {
    await supabase.auth.signOut();
    setData(null);
  };

  /* ── Render ── */
  if (!supabaseConfigured) return <ConfigError />
  if (loading) return <Loader />

  return (
    <>
      <GlobalStyles />
      {!authUser
        ? <AuthPage />
        : <Dashboard data={data} update={update} onLogout={logout} user={authUser} syncing={syncing} />
      }
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   LOADER
══════════════════════════════════════════════════════════════════════════════ */
function Loader() {
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <GlobalStyles/>
      <div style={{width:48,height:48,background:T.text,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🎯</div>
      <div style={{width:20,height:20,border:`2px solid #E2E0DA`,borderTopColor:T.text,borderRadius:"50%"}} className="spinner"/>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   AUTH PAGE — Sign up + Sign in
══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   CONFIG ERROR — shown when env vars are missing
══════════════════════════════════════════════════════════════════════════════ */
function ConfigError() {
  return (
    <div style={{minHeight:"100vh",background:"#F7F6F3",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:480,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
        <h1 style={{fontSize:24,fontWeight:700,color:"#111",marginBottom:12}}>Supabase not configured</h1>
        <p style={{color:"#555",lineHeight:1.6,marginBottom:24}}>The app is missing its environment variables. Go to your <strong>Vercel project → Settings → Environment Variables</strong> and make sure these two are added:</p>
        <div style={{background:"#fff",border:"1px solid #E2E0DA",borderRadius:12,padding:20,textAlign:"left",fontFamily:"monospace",fontSize:13,lineHeight:2}}>
          <div><strong>VITE_SUPABASE_URL</strong><br/>https://yourproject.supabase.co</div>
          <div style={{marginTop:8}}><strong>VITE_SUPABASE_ANON_KEY</strong><br/>eyJ...</div>
        </div>
        <p style={{color:"#9A9690",fontSize:13,marginTop:16}}>After adding them, go to Deployments → Redeploy (uncheck build cache).</p>
      </div>
    </div>
  );
}

function AuthPage() {
  const [mode,    setMode]   = useState("signin"); // "signin" | "signup"
  const [email,   setEmail]  = useState("");
  const [pw,      setPw]     = useState("");
  const [err,     setErr]    = useState("");
  const [msg,     setMsg]    = useState("");
  const [loading, setLoading]= useState(false);

  const go = async () => {
    if (!email.includes("@")) return setErr("Enter a valid email address.");
    if (pw.length < 6)         return setErr("Password must be at least 6 characters.");
    setErr(""); setMsg(""); setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password: pw });
      if (error) setErr(error.message);
      else setMsg("Check your email to confirm your account, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setErr(error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:400,animation:"fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards"}}>
        {/* Brand */}
        <div style={{marginBottom:48,textAlign:"center"}}>
          <div style={{width:52,height:52,background:T.text,borderRadius:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,marginBottom:20}}>🎯</div>
          <h1 style={{fontSize:34,fontWeight:800,letterSpacing:-1.2,color:T.text,marginBottom:8,lineHeight:1.05}}>Power System</h1>
          <p style={{fontSize:14,color:T.textMid,fontWeight:500,letterSpacing:-0.2}}>Your personal performance dashboard</p>
        </div>

        {/* Card */}
        <div style={{background:T.surface,borderRadius:20,padding:32,border,boxShadow:"0 8px 40px rgba(0,0,0,0.07)"}}>
          {/* Mode toggle */}
          <div style={{display:"flex",background:"#F7F6F3",borderRadius:12,padding:3,marginBottom:24,gap:3}}>
            {[{id:"signin",label:"Sign in"},{id:"signup",label:"Create account"}].map(m=>(
              <button key={m.id} onClick={()=>{setMode(m.id);setErr("");setMsg("");}} style={{
                flex:1,padding:"9px 0",border:"none",borderRadius:10,
                fontWeight:mode===m.id?700:500,fontSize:13,letterSpacing:-0.2,
                background:mode===m.id?T.surface:"transparent",
                color:mode===m.id?T.text:T.textLight,cursor:"pointer",
                boxShadow:mode===m.id?"0 1px 4px rgba(0,0,0,0.08)":"none",
                transition:"all 0.15s",
              }}>{m.label}</button>
            ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            {[{ph:"Email address",type:"email",v:email,s:setEmail},{ph:"Password",type:"password",v:pw,s:setPw}].map(f=>(
              <input key={f.ph} type={f.type} placeholder={f.ph} value={f.v}
                onChange={e=>{f.s(e.target.value);setErr("");}}
                onKeyDown={e=>e.key==="Enter"&&go()}
                style={{width:"100%",padding:"14px 16px",border,borderRadius:12,fontSize:14,
                  color:T.text,background:"#FAFAF8",transition:"border-color 0.18s"}}
                onFocus={e=>e.currentTarget.style.borderColor=T.text}
                onBlur={e=>e.currentTarget.style.borderColor="#E2E0DA"}
              />
            ))}
          </div>

          {err && <p style={{fontSize:12,color:T.red,marginBottom:12,fontFamily:T.mono}}>{err}</p>}
          {msg && <p style={{fontSize:12,color:T.green,marginBottom:12,fontFamily:T.mono,lineHeight:1.5}}>{msg}</p>}

          <button className="btn-dark" onClick={go} disabled={loading} style={{
            width:"100%",padding:"14px",background:T.text,color:"#fff",border:"none",
            borderRadius:12,fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",
            letterSpacing:-0.3,transition:"background 0.18s",opacity:loading?0.7:1,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          }}>
            {loading && <span style={{width:14,height:14,border:"2px solid #ffffff60",borderTopColor:"#fff",borderRadius:"50%",display:"inline-block"}} className="spinner"/>}
            {mode==="signin" ? "Sign in →" : "Create account →"}
          </button>

          {mode==="signin" && (
            <button onClick={async()=>{
              if(!email.includes("@"))return setErr("Enter your email first.");
              const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
              if(error)setErr(error.message); else setMsg("Password reset email sent. Check your inbox.");
            }} style={{width:"100%",marginTop:10,background:"transparent",border:"none",fontSize:12,
              color:T.textLight,cursor:"pointer",fontFamily:T.mono,textDecoration:"underline"}}>
              Forgot password?
            </button>
          )}
        </div>

        <p style={{fontSize:11,color:T.textLight,marginTop:16,textAlign:"center",fontFamily:T.mono}}>
          Your data is saved to the cloud — access from any device.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD SHELL
══════════════════════════════════════════════════════════════════════════════ */
const TABS = [
  {id:"now",    label:"Now – Do It"},
  {id:"define", label:"Define – Your Direction"},
  {id:"exec",   label:"Execution Board"},
  {id:"winrate",label:"Win Rate"},
  {id:"review", label:"Performance Review"},
  {id:"track",  label:"Track"},
];

function Dashboard({ data, update, onLogout, user, syncing }) {
  const [tab, setTab] = useState("now");
  const ws = useMemo(()=>calcWeek(data.tasks,data.metrics),[data.tasks,data.metrics]);
  const sc = statusColor(ws.pct, data.benchmarks);

  if (!data) return <Loader />;

  return (
    <div style={{minHeight:"100vh",background:T.bg}}>
      {/* ── TOPBAR ── */}
      <header style={{
        position:"sticky",top:0,zIndex:100,
        background:"rgba(247,246,243,0.94)",backdropFilter:"blur(12px)",
        borderBottom:border,display:"flex",alignItems:"center",
        justifyContent:"space-between",padding:"0 28px",height:56,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,background:T.text,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>🎯</div>
            <span style={{fontWeight:800,fontSize:16,letterSpacing:-0.6,color:T.text}}>Power System</span>
          </div>
          <div style={{width:1,height:18,background:"#E2E0DA"}}/>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:sc}}/>
            <span style={{fontFamily:T.mono,fontSize:12,color:sc,fontWeight:500}}>{ws.pct}% this week</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* Sync indicator */}
          {syncing
            ? <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:10,height:10,border:`1.5px solid #C8C4BC`,borderTopColor:T.amber,borderRadius:"50%",display:"inline-block"}} className="spinner"/>
                <span style={{fontFamily:T.mono,fontSize:10,color:T.amber}}>saving…</span>
              </div>
            : <span style={{fontFamily:T.mono,fontSize:10,color:T.green}}>✓ saved</span>
          }
          <div style={{width:1,height:18,background:"#E2E0DA"}}/>
          <span style={{fontFamily:T.mono,fontSize:11,color:T.textLight}}>{user.email}</span>
          <button className="btn-ghost" onClick={onLogout} style={{
            fontSize:12,fontWeight:500,color:T.textMid,background:"transparent",
            border,borderRadius:8,padding:"5px 12px",cursor:"pointer",transition:"background 0.15s",
          }}>Logout</button>
        </div>
      </header>

      {/* ── NAV ── */}
      <nav style={{background:T.surface,borderBottom:border,padding:"0 28px",display:"flex",gap:2,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} className="tab" onClick={()=>setTab(t.id)} style={{
            padding:"14px 18px",fontWeight:tab===t.id?700:500,fontSize:13,
            color:tab===t.id?T.text:T.textLight,background:"transparent",border:"none",
            borderBottom:tab===t.id?`2px solid ${T.text}`:"2px solid transparent",
            cursor:"pointer",transition:"color 0.15s",whiteSpace:"nowrap",letterSpacing:-0.3,
          }}>{t.label}</button>
        ))}
      </nav>

      {/* ── CONTENT ── */}
      <main style={{maxWidth:1320,margin:"0 auto",padding:"36px 28px"}} key={tab} className="page-enter">
        {tab==="now"     && <Now        data={data} update={update}/>}
        {tab==="define"  && <Define     data={data} update={update}/>}
        {tab==="exec"    && <ExecBoard  data={data} update={update}/>}
        {tab==="winrate" && <WinRate    data={data}/>}
        {tab==="review"  && <PerfReview data={data} update={update}/>}
        {tab==="track"   && <Track      data={data}/>}
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   1. NOW – DO IT
══════════════════════════════════════════════════════════════════════════════ */
function Now({ data, update }) {
  const todayIdx = new Date().getDay();
  const defaultDay = todayIdx===0||todayIdx===7?"Mon":DAYS[todayIdx-1];
  const [day,setDay] = useState(defaultDay);

  const dayStats  = useMemo(()=>calcDay(data.tasks,data.metrics,day),[data.tasks,data.metrics,day]);
  const miscDone  = data.misc.filter(t=>t.done).length;
  const totalDone = dayStats.done + miscDone;
  const totalAll  = dayStats.total + data.misc.length;
  const totalPct  = totalAll>0?Math.round(totalDone/totalAll*100):0;
  const sc        = statusColor(totalPct,data.benchmarks);

  const toggleTask = (mId,id) => update(d=>({...d,tasks:{...d.tasks,[day]:{...d.tasks[day],[mId]:d.tasks[day][mId].map(t=>t.id===id?{...t,done:!t.done}:t)}}}));
  const toggleMisc = id       => update(d=>({...d,misc:d.misc.map(t=>t.id===id?{...t,done:!t.done}:t)}));
  const addMisc    = ()       => update(d=>({...d,misc:[...d.misc,{id:uid(),text:"New task",done:false}]}));
  const renameMisc = (id,v)   => update(d=>({...d,misc:d.misc.map(t=>t.id===id?{...t,text:v}:t)}));
  const delMisc    = id       => update(d=>({...d,misc:d.misc.filter(t=>t.id!==id)}));

  return (
    <div>
      <PageHead title="Now – Do It" sub="What are you doing today?"/>
      <div style={{display:"flex",gap:6,marginBottom:28,flexWrap:"wrap"}}>
        {DAYS.map(d=>(
          <button key={d} onClick={()=>setDay(d)} style={{
            padding:"8px 18px",borderRadius:20,border,fontWeight:d===day?800:500,fontSize:13,
            color:d===day?"#fff":T.textMid,background:d===day?T.text:"transparent",
            cursor:"pointer",transition:"all 0.15s",letterSpacing:-0.3,
          }}>{DFULL[d]}</button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:20,alignItems:"start"}}>
        {/* Ring */}
        <div style={{background:T.surface,borderRadius:20,padding:28,border,boxShadow:"0 4px 24px rgba(0,0,0,0.05)",textAlign:"center",position:"sticky",top:80}}>
          <div style={{fontSize:11,fontFamily:T.mono,color:T.textLight,marginBottom:20,letterSpacing:0.8,fontWeight:600}}>{DFULL[day].toUpperCase()}</div>
          <div style={{position:"relative",width:120,height:120,margin:"0 auto 20px"}}>
            <svg width="120" height="120" style={{transform:"rotate(-90deg)"}}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="#F0EDE6" strokeWidth="10"/>
              <circle cx="60" cy="60" r="50" fill="none" stroke={sc} strokeWidth="10"
                strokeDasharray={`${2*Math.PI*50}`}
                strokeDashoffset={`${2*Math.PI*50*(1-totalPct/100)}`}
                strokeLinecap="round" style={{transition:"stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontWeight:800,fontSize:26,color:T.text,letterSpacing:-1}}>{totalPct}<span style={{fontSize:15}}>%</span></span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[{l:"Done",v:totalDone,c:T.green},{l:"Left",v:totalAll-totalDone,c:T.red},{l:"Total",v:totalAll,c:T.text}].map(s=>(
              <div key={s.l} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"#FAFAF8",borderRadius:10}}>
                <span style={{fontSize:13,color:T.textMid}}>{s.l}</span>
                <span style={{fontWeight:700,fontSize:14,color:s.c}}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Tasks */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {data.metrics.map(m=>{
            const tasks=data.tasks[day]?.[m.id]||[]; const done=tasks.filter(t=>t.done).length;
            return (
              <div key={m.id} style={{background:T.surface,borderRadius:16,padding:20,border,borderLeft:`3px solid ${m.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <span style={{fontWeight:700,fontSize:14,color:m.color,letterSpacing:-0.3}}>{m.label}</span>
                  <span style={{fontFamily:T.mono,fontSize:12,color:T.textLight}}>{done}/{tasks.length}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {tasks.map(t=>(
                    <label key={t.id} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                      <input type="checkbox" checked={t.done} onChange={()=>toggleTask(m.id,t.id)} style={{width:16,height:16,accentColor:m.color,flexShrink:0}}/>
                      <span style={{fontSize:14,color:t.done?T.textLight:T.text,textDecoration:t.done?"line-through":"none",flex:1,fontWeight:t.done?400:500}}>{t.text}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Misc */}
          <div style={{background:T.surface,borderRadius:16,padding:20,border,borderLeft:"3px solid #D8D4CC"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{fontWeight:700,fontSize:14,color:T.textMid,letterSpacing:-0.3}}>Miscellaneous To-Do</span>
              <span style={{fontFamily:T.mono,fontSize:12,color:T.textLight}}>{miscDone}/{data.misc.length}</span>
            </div>
            {data.misc.length===0&&<p style={{fontSize:13,color:T.textLight,fontStyle:"italic",marginBottom:10}}>Errands, calls, anything unplanned…</p>}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
              {data.misc.map(t=>(
                <div key={t.id} className="task-row" style={{display:"flex",alignItems:"center",gap:12}}>
                  <input type="checkbox" checked={t.done} onChange={()=>toggleMisc(t.id)} style={{width:16,height:16,flexShrink:0}}/>
                  <Editable value={t.text} onSave={v=>renameMisc(t.id,v)} style={{flex:1,fontSize:14,color:t.done?T.textLight:T.text,textDecoration:t.done?"line-through":"none"}}/>
                  <button className="del-x" onClick={()=>delMisc(t.id)} style={{opacity:0,background:"transparent",border:"none",color:T.red,cursor:"pointer",fontSize:16,transition:"opacity 0.15s"}}>×</button>
                </div>
              ))}
            </div>
            <button className="ghost" onClick={addMisc} style={{background:"transparent",border:"none",fontSize:13,color:T.textLight,cursor:"pointer",transition:"color 0.15s"}}>+ Add task</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   2. DEFINE – YOUR DIRECTION
══════════════════════════════════════════════════════════════════════════════ */
function Define({ data, update }) {
  const [newLabel,setNewLabel] = useState("");
  const [newColor,setNewColor] = useState("#888888");

  const addMetric  = () => {
    if (!newLabel.trim()) return;
    const m = {id:uid(),label:newLabel.trim(),color:newColor};
    update(d => { const tasks={...d.tasks}; DAYS.forEach(day=>{tasks[day]={...tasks[day],[m.id]:[{id:uid(),text:"To-do",done:false}]};}); return {...d,metrics:[...d.metrics,m],tasks}; });
    setNewLabel(""); setNewColor("#888888");
  };
  const delMetric  = id    => update(d=>({...d,metrics:d.metrics.filter(m=>m.id!==id)}));
  const editMetric = (id,f,v) => update(d=>({...d,metrics:d.metrics.map(m=>m.id===id?{...m,[f]:v}:m)}));
  const setBench   = (f,v) => update(d=>({...d,benchmarks:{...d.benchmarks,[f]:clamp(v,0,100)}}));

  const goalOps = which => ({
    toggle:   id    => update(d=>({...d,[which]:{...d[which],items:d[which].items.map(t=>t.id===id?{...t,done:!t.done}:t)}})),
    rename:   (id,v)=> update(d=>({...d,[which]:{...d[which],items:d[which].items.map(t=>t.id===id?{...t,text:v}:t)}})),
    add:      ()    => update(d=>({...d,[which]:{...d[which],items:[...d[which].items,{id:uid(),text:"To-do",done:false}]}})),
    del:      id    => update(d=>({...d,[which]:{...d[which],items:d[which].items.filter(t=>t.id!==id)}})),
    setLabel: v     => update(d=>({...d,[which]:{...d[which],label:v}})),
  });

  return (
    <div>
      <PageHead title="Define – Your Direction" sub="Set up your metrics, benchmarks, and goals"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card title="Core Metrics" sub="The dimensions you're developing">
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
            {data.metrics.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#FAFAF8",borderRadius:12,border}}>
                <input type="color" value={m.color} onChange={e=>editMetric(m.id,"color",e.target.value)} style={{width:26,height:26,border:"none",background:"none",cursor:"pointer",padding:0,flexShrink:0,borderRadius:6}}/>
                <div style={{width:3,height:24,background:m.color,borderRadius:2,flexShrink:0}}/>
                <Editable value={m.label} onSave={v=>editMetric(m.id,"label",v)} style={{flex:1,fontWeight:700,fontSize:14,color:T.text,letterSpacing:-0.3}}/>
                <Btn ghost small onClick={()=>delMetric(m.id)} style={{color:T.textLight,fontSize:18,padding:"0 4px"}}>×</Btn>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input type="color" value={newColor} onChange={e=>setNewColor(e.target.value)} style={{width:38,height:38,border,background:"none",cursor:"pointer",padding:0,borderRadius:8,flexShrink:0}}/>
            <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addMetric()} placeholder="New metric name…"
              style={{flex:1,padding:"10px 14px",border,borderRadius:10,fontSize:14,color:T.text,background:"#FAFAF8"}}
              onFocus={e=>e.currentTarget.style.borderColor=T.text} onBlur={e=>e.currentTarget.style.borderColor="#E2E0DA"}/>
            <Btn dark onClick={addMetric}>Add</Btn>
          </div>
        </Card>
        <Card title="Performance Benchmarks" sub="Your personal standards">
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[{f:"best",label:"Best Performance",color:T.green,bg:T.greenBg,desc:"Anything above this is excellent"},{f:"worst",label:"Worst Performance",color:T.red,bg:T.redBg,desc:"Anything below this needs work"}].map(b=>(
              <div key={b.f} style={{padding:"16px 18px",background:b.bg,borderRadius:14,border:`1px solid ${b.color}30`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:15,color:T.text,marginBottom:3}}>{b.label}</div>
                    <div style={{fontSize:12,color:T.textMid}}>{b.desc}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <input type="number" min={0} max={100} value={data.benchmarks[b.f]} onChange={e=>setBench(b.f,e.target.value)}
                      style={{width:62,padding:"8px",border:`1px solid ${b.color}40`,borderRadius:10,fontFamily:T.mono,fontSize:18,fontWeight:700,color:b.color,textAlign:"center",background:T.surface}}
                      onFocus={e=>e.currentTarget.style.borderColor=b.color} onBlur={e=>e.currentTarget.style.borderColor=`${b.color}40`}/>
                    <span style={{fontFamily:T.mono,fontWeight:700,color:b.color,fontSize:16}}>%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <GoalBlock g={data.weeklyGoal}  ops={goalOps("weeklyGoal")}  accentColor={T.amber} tag="Weekly Goal"/>
        <GoalBlock g={data.monthlyGoal} ops={goalOps("monthlyGoal")} accentColor="#1D5FAA" tag="Monthly Goal"/>
      </div>
    </div>
  );
}

function GoalBlock({ g, ops, accentColor, tag }) {
  const done=g.items.filter(t=>t.done).length; const pct=g.items.length>0?Math.round(done/g.items.length*100):0;
  return (
    <Card title={<Editable value={g.label} onSave={ops.setLabel} style={{fontWeight:700,fontSize:16,color:T.text}}/>} accent={accentColor}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:600,color:accentColor,background:`${accentColor}18`,padding:"2px 10px",borderRadius:20}}>{tag}</span>
        <span style={{fontFamily:T.mono,fontSize:12,color:T.textLight}}>{done}/{g.items.length} · {pct}%</span>
      </div>
      <div style={{height:4,background:"#F0EDE6",borderRadius:2,marginBottom:16,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:accentColor,borderRadius:2,transition:"width 0.4s ease"}}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
        {g.items.map(t=>(
          <div key={t.id} className="task-row" style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" checked={t.done} onChange={()=>ops.toggle(t.id)} style={{width:15,height:15,flexShrink:0,accentColor}}/>
            <Editable value={t.text} onSave={v=>ops.rename(t.id,v)} style={{flex:1,fontSize:14,color:t.done?T.textLight:T.text,textDecoration:t.done?"line-through":"none"}}/>
            <button className="del-x" onClick={()=>ops.del(t.id)} style={{opacity:0,background:"transparent",border:"none",color:T.red,cursor:"pointer",fontSize:16,lineHeight:1,transition:"opacity 0.15s"}}>×</button>
          </div>
        ))}
      </div>
      <button className="ghost" onClick={ops.add} style={{background:"transparent",border:"none",fontSize:13,color:T.textLight,cursor:"pointer",transition:"color 0.15s"}}>+ Add item</button>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   3. EXECUTION BOARD
══════════════════════════════════════════════════════════════════════════════ */
function ExecBoard({ data, update }) {
  const toggle  = (d,m,id)      => update(st=>({...st,tasks:{...st.tasks,[d]:{...st.tasks[d],[m]:st.tasks[d][m].map(t=>t.id===id?{...t,done:!t.done}:t)}}}));
  const rename  = (d,m,id,text) => update(st=>({...st,tasks:{...st.tasks,[d]:{...st.tasks[d],[m]:st.tasks[d][m].map(t=>t.id===id?{...t,text}:t)}}}));
  const addTask = (d,m)         => update(st=>({...st,tasks:{...st.tasks,[d]:{...st.tasks[d],[m]:[...(st.tasks[d][m]||[]),{id:uid(),text:"To-do",done:false}]}}}));
  const delTask = (d,m,id)      => update(st=>({...st,tasks:{...st.tasks,[d]:{...st.tasks[d],[m]:st.tasks[d][m].filter(t=>t.id!==id)}}}));
  const COL = "180px repeat(6,1fr)";

  return (
    <div>
      <PageHead title="Execution Board" sub="Plan your week across every metric"/>
      <div style={{overflowX:"auto"}}>
        <div style={{minWidth:980}}>
          <div style={{display:"grid",gridTemplateColumns:COL,gap:0,marginBottom:6}}>
            <div/>
            {DAYS.map(d=>{
              const s=calcDay(data.tasks,data.metrics,d); const c=statusColor(s.pct,data.benchmarks);
              return (
                <div key={d} style={{margin:"0 3px",background:T.surface,borderRadius:14,padding:"18px 18px 16px",border,borderTop:`3px solid ${c}`,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <div style={{fontWeight:800,fontSize:16,color:T.text,letterSpacing:-0.6,marginBottom:10}}>{DFULL[d]}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                    <span style={{fontFamily:T.mono,fontSize:11,color:T.textLight,fontWeight:500}}>{s.done} / {s.total}</span>
                    <span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:c,letterSpacing:-0.3}}>{s.pct}%</span>
                  </div>
                  <div style={{height:3,background:"#EDE9E2",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${s.pct}%`,background:c,borderRadius:2,transition:"width 0.45s ease"}}/>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
            {data.metrics.map(m=>(
              <div key={m.id} style={{display:"grid",gridTemplateColumns:COL,gap:0}}>
                <div style={{display:"flex",alignItems:"center",paddingRight:12,paddingTop:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,background:T.surface,border,borderLeft:`3px solid ${m.color}`,borderRadius:10,padding:"14px 14px",width:"100%",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
                    <span style={{fontWeight:700,fontSize:13,color:m.color,letterSpacing:-0.3,lineHeight:1.3}}>{m.label}</span>
                  </div>
                </div>
                {DAYS.map(d=>{
                  const tasks=data.tasks[d]?.[m.id]||[];
                  return (
                    <div key={d} style={{margin:"0 3px",background:T.surface,borderRadius:10,border,padding:"16px 16px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.03)"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {tasks.map(t=>(
                          <div key={t.id} className="task-row" style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:"1px solid #F4F2EE"}}>
                            <input type="checkbox" checked={t.done} onChange={()=>toggle(d,m.id,t.id)} style={{marginTop:3,flexShrink:0,width:14,height:14,accentColor:m.color,cursor:"pointer"}}/>
                            <Editable value={t.text} onSave={v=>rename(d,m.id,t.id,v)} style={{fontSize:13,fontWeight:t.done?400:600,color:t.done?T.textLight:T.text,textDecoration:t.done?"line-through":"none",flex:1,lineHeight:1.5,letterSpacing:-0.2}}/>
                            <button className="del-x" onClick={()=>delTask(d,m.id,t.id)} style={{opacity:0,background:"transparent",border:"none",color:T.red,cursor:"pointer",fontSize:15,lineHeight:1,padding:0,transition:"opacity 0.15s",flexShrink:0,marginTop:3}}>×</button>
                          </div>
                        ))}
                      </div>
                      <button className="ghost" onClick={()=>addTask(d,m.id)} style={{background:"transparent",border:"none",fontSize:12,fontWeight:500,color:"#C8C4BC",cursor:"pointer",marginTop:tasks.length>0?10:0,transition:"color 0.15s",letterSpacing:-0.1,display:"block",padding:0}}>+ add</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   4. WIN RATE
══════════════════════════════════════════════════════════════════════════════ */
function WinRate({ data }) {
  const ws=useMemo(()=>calcWeek(data.tasks,data.metrics),[data.tasks,data.metrics]);
  const sc=statusColor(ws.pct,data.benchmarks);
  return (
    <div>
      <PageHead title="Win Rate" sub="Auto-calculated from your Execution Board — no manual entry needed"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:20,alignItems:"start"}}>
        <div style={{background:T.surface,borderRadius:20,border,overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,0.04)"}}>
          <div style={{padding:"18px 22px",borderBottom:`1px solid #F0EDE6`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,fontSize:16,color:T.text}}>Daily Breakdown</span>
            <span style={{fontFamily:T.mono,fontSize:11,color:T.textLight}}>live · auto-synced</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#FAFAF8"}}>
                {["Day","Completed","Total","Win Rate",""].map(h=>(
                  <th key={h} style={{padding:"10px 20px",textAlign:"left",fontSize:10,fontFamily:T.mono,color:T.textLight,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map(d=>{
                const s=calcDay(data.tasks,data.metrics,d); const c=statusColor(s.pct,data.benchmarks);
                return (
                  <tr key={d} className="tr" style={{borderTop:`1px solid #F5F3EF`,transition:"background 0.12s"}}>
                    <td style={{padding:"14px 20px",fontWeight:700,fontSize:14,color:T.text,letterSpacing:-0.4}}>{DFULL[d]}</td>
                    <td style={{padding:"14px 20px",fontFamily:T.mono,fontSize:13,color:T.green,fontWeight:600}}>{s.done}</td>
                    <td style={{padding:"14px 20px",fontFamily:T.mono,fontSize:13,color:T.textMid}}>{s.total}</td>
                    <td style={{padding:"14px 20px",fontFamily:T.mono,fontSize:16,fontWeight:700,color:c,letterSpacing:-0.3}}>{s.pct}%</td>
                    <td style={{padding:"14px 20px",width:140}}>
                      <div style={{background:"#F0EDE6",height:5,borderRadius:3,overflow:"hidden",width:110}}>
                        <div style={{height:"100%",width:`${s.pct}%`,background:c,borderRadius:3,transition:"width 0.5s ease"}}/>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{padding:"16px 22px",borderTop:"2px solid #F0EDE6",background:"#FAFAF8",display:"flex",alignItems:"center",gap:24}}>
            <span style={{fontWeight:800,fontSize:14,color:T.text,letterSpacing:-0.4}}>Weekly Total</span>
            <span style={{fontFamily:T.mono,fontSize:13,color:T.green,fontWeight:600}}>{ws.done} done</span>
            <span style={{fontFamily:T.mono,fontSize:13,color:T.textMid}}>{ws.total} planned</span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:T.mono,fontSize:22,fontWeight:700,color:sc}}>{ws.pct}%</span>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:T.surface,borderRadius:20,padding:28,border,textAlign:"center",boxShadow:"0 4px 24px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:11,fontFamily:T.mono,color:T.textLight,marginBottom:16,letterSpacing:0.8,fontWeight:600}}>WEEKLY SCORE</div>
            <div style={{fontWeight:800,fontSize:64,color:sc,lineHeight:1,letterSpacing:-3,marginBottom:8}}>{ws.pct}<span style={{fontSize:28,letterSpacing:-1}}>%</span></div>
            <div style={{fontSize:13,color:T.textMid,marginBottom:18,fontWeight:500}}>{ws.done} / {ws.total} tasks</div>
            <div style={{padding:"10px 14px",background:statusBg(ws.pct,data.benchmarks),borderRadius:10,fontSize:13,fontWeight:600,color:sc}}>{statusLabel(ws.pct,data.benchmarks)}</div>
          </div>
          <div style={{background:T.surface,borderRadius:16,padding:20,border}}>
            <div style={{fontSize:11,fontFamily:T.mono,color:T.textLight,marginBottom:12,letterSpacing:0.5}}>FORMULA</div>
            <div style={{fontFamily:T.mono,fontSize:13,color:T.textMid,lineHeight:2}}>
              Win Rate = Completed ÷ Total × 100
              <div style={{marginTop:8,padding:"10px 12px",background:"#FAFAF8",borderRadius:10,color:T.text,fontWeight:600}}>{ws.done} ÷ {ws.total} × 100 = {ws.pct}%</div>
            </div>
          </div>
          <div style={{background:T.surface,borderRadius:16,padding:20,border}}>
            <div style={{fontSize:11,fontFamily:T.mono,color:T.textLight,marginBottom:12,letterSpacing:0.5}}>BENCHMARKS</div>
            {[{l:"Best",v:`≥${data.benchmarks.best}%`,c:T.green,bg:T.greenBg},{l:"Worst",v:`<${data.benchmarks.worst}%`,c:T.red,bg:T.redBg}].map(b=>(
              <div key={b.l} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:b.bg,borderRadius:8,marginBottom:8}}>
                <span style={{fontSize:13,color:T.textMid}}>{b.l}</span>
                <span style={{fontFamily:T.mono,fontWeight:700,fontSize:13,color:b.c}}>{b.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   5. PERFORMANCE REVIEW
══════════════════════════════════════════════════════════════════════════════ */
function PerfReview({ data, update }) {
  const ws=useMemo(()=>calcWeek(data.tasks,data.metrics),[data.tasks,data.metrics]);
  const avg=monthAvg(data.weeks); const sc=statusColor(avg,data.benchmarks);
  const setRate  = (id,v) => update(d=>({...d,weeks:d.weeks.map(w=>w.id===id?{...w,rate:v===""?null:clamp(v,0,100)}:w)}));
  const setLabel = (id,v) => update(d=>({...d,weeks:d.weeks.map(w=>w.id===id?{...w,label:v}:w)}));
  const logWeek  = ()     => { const idx=data.weeks.findIndex(w=>w.rate===null); if(idx===-1)return; update(d=>({...d,weeks:d.weeks.map((w,i)=>i===idx?{...w,rate:ws.pct}:w)})); };
  const logToYear= ()     => update(d=>({...d,yearData:{...d.yearData,[d.currentMonth]:{w1:d.weeks[0]?.rate??null,w2:d.weeks[1]?.rate??null,w3:d.weeks[2]?.rate??null,w4:d.weeks[3]?.rate??null}}}));

  return (
    <div>
      <PageHead title="Performance Review" sub={`Monthly overview · ${data.currentMonth}`}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select value={data.currentMonth} onChange={e=>update(d=>({...d,currentMonth:e.target.value}))}
            style={{padding:"7px 12px",border,borderRadius:10,fontSize:13,color:T.textMid,background:T.surface,cursor:"pointer"}}>
            {MONTHS.map(m=><option key={m}>{m}</option>)}
          </select>
          <Btn ghost onClick={logWeek}>→ Log this week</Btn>
          <Btn dark onClick={logToYear}>Save to Track</Btn>
        </div>
      </PageHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:20,alignItems:"start"}}>
        <div style={{background:T.surface,borderRadius:20,border,overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,0.04)"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#FAFAF8"}}>
                {["Week","Win Rate","Progress","Status"].map(h=>(
                  <th key={h} style={{padding:"12px 20px",textAlign:"left",fontFamily:T.mono,fontSize:10,color:T.textLight,fontWeight:600,letterSpacing:0.6}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.weeks.map(w=>{
                const c=statusColor(w.rate,data.benchmarks);
                return (
                  <tr key={w.id} className="tr" style={{borderTop:`1px solid #F5F3EF`,transition:"background 0.12s"}}>
                    <td style={{padding:"14px 20px"}}><Editable value={w.label} onSave={v=>setLabel(w.id,v)} style={{fontWeight:700,fontSize:14,color:T.text,letterSpacing:-0.4}}/></td>
                    <td style={{padding:"14px 20px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <input type="number" min={0} max={100} value={w.rate??""} placeholder="—" onChange={e=>setRate(w.id,e.target.value)}
                          style={{width:60,padding:"7px 10px",border,borderRadius:10,fontFamily:T.mono,fontSize:15,fontWeight:700,color:c,textAlign:"center",background:"#FAFAF8"}}
                          onFocus={e=>e.currentTarget.style.borderColor=T.text} onBlur={e=>e.currentTarget.style.borderColor="#E2E0DA"}/>
                        <span style={{fontFamily:T.mono,color:c,fontWeight:700}}>%</span>
                      </div>
                    </td>
                    <td style={{padding:"14px 20px",width:160}}>
                      <div style={{background:"#F0EDE6",height:5,borderRadius:3,overflow:"hidden",width:120}}>
                        <div style={{height:"100%",width:`${w.rate??0}%`,background:c,borderRadius:3,transition:"width 0.5s ease"}}/>
                      </div>
                    </td>
                    <td style={{padding:"14px 20px"}}>{w.rate!==null&&<StatusPill pct={w.rate} b={data.benchmarks}/>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{padding:"16px 22px",borderTop:"2px solid #F0EDE6",background:"#FAFAF8",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:T.text}}>Monthly Average</div>
              <div style={{fontFamily:T.mono,fontSize:11,color:T.textLight,marginTop:2}}>{data.weeks.filter(w=>w.rate!==null).length} of 4 weeks logged</div>
            </div>
            <div style={{fontFamily:T.mono,fontWeight:800,fontSize:32,color:sc??T.textLight}}>{avg!==null?`${avg}%`:"—"}</div>
          </div>
        </div>
        <div style={{background:T.surface,borderRadius:20,padding:28,border,boxShadow:"0 4px 24px rgba(0,0,0,0.04)"}}>
          <div style={{fontFamily:T.mono,fontSize:11,color:T.textLight,marginBottom:16,fontWeight:600,letterSpacing:0.6}}>MONTHLY SCORE</div>
          <div style={{fontWeight:800,fontSize:52,color:sc??T.textLight,lineHeight:1,letterSpacing:-2,marginBottom:6}}>{avg!==null?<>{avg}<span style={{fontSize:22}}>%</span></>:"—"}</div>
          {avg!==null&&<div style={{padding:"8px 12px",background:statusBg(avg,data.benchmarks),borderRadius:10,fontSize:13,fontWeight:600,color:sc,marginBottom:20}}>{statusLabel(avg,data.benchmarks)}</div>}
          <div style={{borderTop:`1px solid #F0EDE6`,paddingTop:16,display:"flex",flexDirection:"column",gap:6}}>
            {data.weeks.map(w=>(
              <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:T.textMid}}>{w.label}</span>
                <span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:statusColor(w.rate,data.benchmarks)??T.textLight}}>{w.rate!==null?`${w.rate}%`:"—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   6. TRACK
══════════════════════════════════════════════════════════════════════════════ */
function Track({ data }) {
  const currentMo = data.currentMonth;
  const liveWeek  = useMemo(()=>calcWeek(data.tasks,data.metrics),[data.tasks,data.metrics]);

  const allMonths = MONTHS.map(mo=>{
    const isCurrent = mo===currentMo;
    if (isCurrent) {
      const weeks=[...data.weeks.map(w=>w.rate)];
      const firstNull=weeks.findIndex(v=>v===null);
      if(firstNull!==-1) weeks[firstNull]=liveWeek.pct;
      const filled=weeks.filter(v=>v!==null);
      const avg=filled.length>0?Math.round(filled.reduce((s,v)=>s+v,0)/filled.length):null;
      return {mo,weeks,avg,isCurrent:true};
    } else {
      const yd=data.yearData?.[mo]||{w1:null,w2:null,w3:null,w4:null};
      const weeks=[yd.w1,yd.w2,yd.w3,yd.w4];
      const filled=weeks.filter(v=>v!==null);
      const avg=filled.length>0?Math.round(filled.reduce((s,v)=>s+v,0)/filled.length):null;
      return {mo,weeks,avg,isCurrent:false};
    }
  });

  const filledMonths=allMonths.filter(m=>m.avg!==null);
  const yearAvg=filledMonths.length>0?Math.round(filledMonths.reduce((s,m)=>s+m.avg,0)/filledMonths.length):null;
  const bestMo=filledMonths.length>0?filledMonths.reduce((a,b)=>a.avg>=b.avg?a:b):null;
  const worstMo=filledMonths.length>0?filledMonths.reduce((a,b)=>a.avg<=b.avg?a:b):null;

  return (
    <div>
      <PageHead title="Track" sub="Real-time year-long progress — auto-updated from your Execution Board"/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[{label:"Year Average",val:yearAvg,color:statusColor(yearAvg,data.benchmarks)},
          {label:"Best Month",val:bestMo?`${bestMo.avg}%\n${bestMo.mo}`:null,color:T.green},
          {label:"Worst Month",val:worstMo?`${worstMo.avg}%\n${worstMo.mo}`:null,color:T.red},
          {label:"Months Logged",val:`${filledMonths.length}/12`,color:T.text,noPercent:true},
        ].map(s=>(
          <div key={s.label} style={{background:T.surface,borderRadius:16,padding:"18px 20px",border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}}>
            <div style={{fontFamily:T.mono,fontSize:10,color:T.textLight,marginBottom:8,letterSpacing:0.4,fontWeight:600}}>{s.label.toUpperCase()}</div>
            {s.val?(
              <div>
                <div style={{fontWeight:800,fontSize:28,color:s.color,letterSpacing:-1,lineHeight:1}}>{s.noPercent?s.val:typeof s.val==="string"&&s.val.includes("\n")?s.val.split("\n")[0]:`${s.val}%`}</div>
                {typeof s.val==="string"&&s.val.includes("\n")&&<div style={{fontSize:11,color:T.textLight,marginTop:4,fontFamily:T.mono}}>{s.val.split("\n")[1]}</div>}
              </div>
            ):<div style={{fontWeight:800,fontSize:28,color:T.textLight,letterSpacing:-1}}>—</div>}
          </div>
        ))}
      </div>
      <div style={{background:T.surface,borderRadius:20,border,overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,0.04)"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#FAFAF8"}}>
              {["Month","Week 1","Week 2","Week 3","Week 4","Monthly Avg",""].map(h=>(
                <th key={h} style={{padding:"12px 18px",textAlign:"left",fontFamily:T.mono,fontSize:10,color:T.textLight,fontWeight:600,letterSpacing:0.6}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allMonths.map(({mo,weeks,avg,isCurrent})=>{
              const ac=statusColor(avg,data.benchmarks);
              const hasAny=weeks.some(v=>v!==null);
              if(!hasAny&&!isCurrent) return (
                <tr key={mo} className="tr" style={{borderTop:`1px solid #F5F3EF`,opacity:0.35}}>
                  <td style={{padding:"12px 18px",fontWeight:500,fontSize:14,color:T.textLight}}>{mo}</td>
                  {[0,1,2,3].map(i=><td key={i} style={{padding:"12px 18px",fontFamily:T.mono,fontSize:13,color:"#DDD"}}>—</td>)}
                  <td style={{padding:"12px 18px",fontFamily:T.mono,fontSize:13,color:"#DDD"}}>—</td><td/>
                </tr>
              );
              return (
                <tr key={mo} className="tr" style={{borderTop:`1px solid #F5F3EF`,transition:"background 0.12s",background:isCurrent?"#FDFCF8":""}}>
                  <td style={{padding:"14px 18px",minWidth:120}}>
                    <div style={{fontWeight:700,fontSize:15,color:T.text}}>{mo}</div>
                    {isCurrent&&<div style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:4}}><div style={{width:5,height:5,borderRadius:"50%",background:T.amber}}/><span style={{fontFamily:T.mono,fontSize:9,color:T.amber,letterSpacing:0.5}}>LIVE</span></div>}
                  </td>
                  {weeks.map((v,i)=>{
                    const isLiveSlot=isCurrent&&data.weeks[i]?.rate===null&&i===data.weeks.findIndex(w=>w.rate===null);
                    const c=statusColor(v,data.benchmarks);
                    return (
                      <td key={i} style={{padding:"12px 18px"}}>
                        {v!==null?(
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontFamily:T.mono,fontSize:14,fontWeight:700,color:c}}>{v}%</span>
                            {isLiveSlot&&<span style={{fontFamily:T.mono,fontSize:8,color:T.amber,background:T.amberBg,padding:"1px 5px",borderRadius:4}}>now</span>}
                          </div>
                        ):<span style={{fontFamily:T.mono,fontSize:13,color:"#DDD"}}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{padding:"14px 18px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontFamily:T.mono,fontWeight:800,fontSize:20,color:ac??T.textLight,letterSpacing:-0.5}}>{avg!==null?`${avg}%`:"—"}</span>
                      {avg!==null&&<StatusPill pct={avg} b={data.benchmarks}/>}
                    </div>
                  </td>
                  <td style={{padding:"12px 18px",width:130}}>
                    {avg!==null&&<div style={{background:"#F0EDE6",height:5,borderRadius:3,overflow:"hidden",width:100}}><div style={{height:"100%",width:`${avg}%`,background:ac,borderRadius:3,transition:"width 0.5s ease"}}/></div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
══════════════════════════════════════════════════════════════════════════════ */
function PageHead({ title, sub, children }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,paddingBottom:24,borderBottom:border}}>
      <div>
        <h2 style={{fontWeight:800,fontSize:28,color:T.text,letterSpacing:-1,marginBottom:5,lineHeight:1.1}}>{title}</h2>
        <p style={{fontSize:13,color:T.textMid,fontFamily:T.mono,fontWeight:400,letterSpacing:-0.1}}>{sub}</p>
      </div>
      {children&&<div style={{flexShrink:0,display:"flex",alignItems:"center",gap:8}}>{children}</div>}
    </div>
  );
}

function Card({ title, sub, accent, children }) {
  return (
    <div style={{background:T.surface,borderRadius:18,padding:22,border,borderTop:accent?`3px solid ${accent}`:border,boxShadow:"0 2px 16px rgba(0,0,0,0.04)"}}>
      <div style={{marginBottom:18}}>
        <div style={{fontWeight:700,fontSize:15,color:T.text,marginBottom:4,letterSpacing:-0.4}}>{title}</div>
        {sub&&<div style={{fontSize:11,color:T.textLight,fontFamily:T.mono,fontWeight:500}}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ pct, b }) {
  const c=statusColor(pct,b); const bg=statusBg(pct,b);
  return <span style={{fontSize:11,fontWeight:600,color:c,background:bg,padding:"3px 9px",borderRadius:20,whiteSpace:"nowrap"}}>{pct>=b.best?"Excellent":pct>=b.worst?"On Track":"Needs Work"}</span>;
}

function Btn({ dark, ghost, small, onClick, style={}, children }) {
  if(dark)  return <button className="btn-dark" onClick={onClick} style={{background:T.text,color:"#fff",border:"none",borderRadius:10,padding:small?"6px 12px":"9px 18px",fontSize:small?12:13,fontWeight:600,cursor:"pointer",transition:"background 0.15s",letterSpacing:-0.2,...style}}>{children}</button>;
  if(ghost) return <button className="btn-ghost" onClick={onClick} style={{background:"transparent",color:T.textMid,border,borderRadius:10,padding:small?"6px 12px":"9px 18px",fontSize:small?12:13,fontWeight:500,cursor:"pointer",transition:"background 0.15s",...style}}>{children}</button>;
  return <button onClick={onClick} style={{background:"transparent",border:"none",cursor:"pointer",...style}}>{children}</button>;
}

function Editable({ value, onSave, style }) {
  const [editing,setEditing]=useState(false); const [v,setV]=useState(value);
  useEffect(()=>setV(value),[value]);
  if(editing) return (
    <input autoFocus value={v} onChange={e=>setV(e.target.value)}
      onBlur={()=>{onSave(v);setEditing(false);}}
      onKeyDown={e=>{if(e.key==="Enter"){onSave(v);setEditing(false);}if(e.key==="Escape"){setV(value);setEditing(false);}}}
      style={{...style,background:"#FAFAF8",border:`1px solid ${T.text}`,borderRadius:6,outline:"none",padding:"1px 8px",minWidth:80}}
    />
  );
  return <span style={{...style,cursor:"text"}} onClick={()=>setEditing(true)} title="Click to edit">{value}</span>;
}
