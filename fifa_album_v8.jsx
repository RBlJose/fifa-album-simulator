import { useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

// ── Math ──────────────────────────────────────────────────────────────────
const harmonicN = (n) => { let h=0; for(let k=1;k<=n;k++) h+=1/k; return h; };
const expTotalStickers = (n) => n * harmonicN(n);
const calcExpPacks     = (n, spp) => expTotalStickers(n) / spp;
const calcExpCost      = (n, spp, p) => calcExpPacks(n,spp)*p;
const calcInflPacks    = (n, spp) => (n * Math.LN2) / spp;
const calcRemainingCost  = (k, n, spp, price) => k>=n ? 0 : (n*harmonicN(n-k)/spp)*price;
const calcRemainingPacks = (k, n, spp)         => k>=n ? 0 : n*harmonicN(n-k)/spp;
const costPerNew = (k, n, price, spp) => (price/spp)*(n/Math.max(1,n-k));
const crossoverK = (n, price, spp, indPrice) =>
  Math.max(0,Math.min(n-1,Math.round(n*(1-price/(indPrice*spp)))));
const dupsAtK = (k, n) => {
  if(k<=0) return 0;
  let d=0; for(let i=1;i<=Math.min(k,n-1);i++) d+=n/(n-i+1);
  return Math.max(0,Math.round(d-k));
};
const estimateUnique = (total,n) => Math.min(n,Math.round(n*(1-Math.pow(1-1/n,total))));

// ── Rareza realista ───────────────────────────────────────────────────────
// Los raros se compran sueltos. Costo = álbum sin raros + n_raros × precio_suelto_raro
const realisticRareCost = (n, spp, price, nRare, rarePrice) =>
  +(calcExpCost(n-nRare, spp, price) + nRare*rarePrice).toFixed(2);

// ── Ventana de intercambio ────────────────────────────────────────────────
const tradingWindow = (n, spp, price, indPrice) => ({
  minK:   Math.round(n*0.50),
  idealK: Math.round(n*0.75),
  crossK: crossoverK(n,price,spp,indPrice),
});
const tradeScore = (k, n, spp, price, indPrice) => {
  const {minK,idealK,crossK} = tradingWindow(n,spp,price,indPrice);
  if(k<minK)     return {score:Math.round(k/minK*30),       label:"Muy pocos repetidos aún",           color:"#ef4444",ready:false};
  if(k<idealK)   return {score:30+Math.round((k-minK)/(idealK-minK)*50), label:"Puedes empezar a intercambiar",color:"#f97316",ready:true};
  if(k<=crossK)  return {score:95,                           label:"¡Momento óptimo para intercambiar!",color:"#22c55e",ready:true};
  if(k<=crossK*1.1) return {score:65,                        label:"Aún útil, mejor compra sueltos",   color:"#f0c040",ready:true};
  return                  {score:35,                          label:"Tus repetidos ya no son tan útiles",color:"#7a9ab8",ready:false};
};

// ── Datos gráficos ────────────────────────────────────────────────────────

// FIX: zoom a 5× la inflexión — el cruce queda en el primer tercio con buena perspectiva
const makeGrowthData = (n, spp) => {
  const inflPacks = Math.round(calcInflPacks(n,spp));
  const maxP = Math.round(inflPacks * 5);          // ← 5× inflexión (~485 sobres)
  const step = Math.max(1, Math.round(maxP/70));
  return Array.from({length:Math.ceil(maxP/step)+1},(_,i)=>{
    const packs=i*step, t=packs*spp;
    const unique=n*(1-Math.pow(1-1/n,t));
    return {packs, unique:Math.min(Math.round(unique),n), dups:Math.round(Math.max(0,t-unique))};
  });
};

const makeBudgetData = (n, spp, price) => {
  const mean=expTotalStickers(n), std=Math.sqrt(n*n*(Math.PI**2/6)-n*harmonicN(n));
  const maxB=Math.ceil(calcExpCost(n,spp,price)*2.2), step=Math.max(1,Math.round(maxB/50));
  return Array.from({length:Math.ceil(maxB/step)+1},(_,i)=>{
    const budget=i*step, z=((budget/price)*spp-mean)/std;
    return {budget:+budget.toFixed(1), prob:Math.round(Math.min(100,Math.max(0,100/(1+Math.exp(-1.7*z)))))};
  });
};

const makeStageData = (n, spp, price) =>
  [["0→50%",0,.5],["50→75%",.5,.75],["75→90%",.75,.9],
   ["90→95%",.9,.95],["95→99%",.95,.99],["99→100%",.99,1]].map(([label,s,e])=>{
    const k1=Math.max(1,Math.floor(s*n)+1),k2=Math.floor(e*n);
    let draws=0; for(let k=k1;k<=k2;k++) draws+=n/(n-k+1);
    const packs=Math.round(draws/spp);
    return {label,stickers:k2-k1+1,packs,cost:+(packs*price).toFixed(2)};
  });

// ── Simulaciones ──────────────────────────────────────────────────────────
const runOneSim=(n,spp)=>{
  const col=new Uint8Array(n); let u=0,t=0,p=0;
  while(u<n){p++;for(let i=0;i<spp;i++){const s=Math.floor(Math.random()*n);t++;if(!col[s]){col[s]=1;u++;}}}
  return{packs:p,dups:t-n};
};
const runSimFromK=(startK,n,spp)=>{
  const col=new Uint8Array(n); let placed=0;
  while(placed<startK){const s=Math.floor(Math.random()*n);if(!col[s]){col[s]=1;placed++;}}
  let u=startK,p=0;
  while(u<n){p++;for(let i=0;i<spp;i++){const s=Math.floor(Math.random()*n);if(!col[s]){col[s]=1;u++;}}}
  return{packs:p};
};
const buildSimResults=(packs,price)=>{
  const N=packs.length, sorted=[...packs].sort((a,b)=>a-b);
  const avg=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
  const pct=p=>sorted[Math.floor(p*N/100)];
  const mn=sorted[0],mx=sorted[N-1],B=22,bs=Math.max(1,(mx-mn)/B);
  const hist=Array.from({length:B},(_,i)=>({x:Math.round(mn+i*bs),y:0}));
  sorted.forEach(v=>{const i=Math.min(Math.floor((v-mn)/bs),B-1);hist[i].y++;});
  return{n:N,mean:Math.round(avg(sorted)),median:pct(50),p5:pct(5),p25:pct(25),p75:pct(75),p95:pct(95),
    meanCost:+avg(sorted.map(p=>p*price)).toFixed(2),hist};
};

// ── Colores ───────────────────────────────────────────────────────────────
const C={bg:"#060d1b",card:"#0b1628",border:"#1b2e48",gold:"#f0c040",goldDim:"#c49a20",
  blue:"#2196f3",green:"#22c55e",orange:"#f97316",red:"#ef4444",
  purple:"#a855f7",teal:"#14b8a6",muted:"#4a607a",text:"#ddeaf8",dim:"#7a9ab8"};

// ── UI helpers ────────────────────────────────────────────────────────────
const NumInput=({label,raw,setRaw,min,max,step,accent=null,width=82})=>(
  <label style={{display:"flex",flexDirection:"column",gap:4}}>
    <span style={{fontSize:10,color:accent||C.dim}}>{label}</span>
    <input type="number" value={raw} min={min} max={max} step={step}
      onChange={e=>setRaw(e.target.value)}
      style={{width,background:accent?"#0f2010":"#0f1e35",border:`1px solid ${accent||C.muted}`,
        borderRadius:7,color:accent||C.gold,padding:"6px 8px",fontSize:14,fontWeight:700,
        fontFamily:"monospace",outline:"none"}}/>
  </label>
);
const KPI=({icon,label,val,sub,accent=C.gold,glow=false,small=false})=>(
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
    padding:small?"11px 13px":"15px 17px",position:"relative",overflow:"hidden",
    boxShadow:glow?`0 0 20px ${accent}44`:"none"}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${accent},transparent)`}}/>
    <div style={{fontSize:small?16:20,marginBottom:3}}>{icon}</div>
    <div style={{fontSize:small?17:22,fontWeight:800,color:accent,letterSpacing:-0.5}}>{val}</div>
    <div style={{fontSize:small?10:12,color:C.text,fontWeight:600,marginTop:2}}>{label}</div>
    {sub&&<div style={{fontSize:10,color:C.dim,marginTop:3}}>{sub}</div>}
  </div>
);
const Tab=({active,onClick,children})=>(
  <button onClick={onClick} style={{padding:"7px 13px",borderRadius:8,border:"none",cursor:"pointer",
    background:active?C.gold:"transparent",color:active?C.bg:C.dim,fontWeight:active?700:500,fontSize:12}}>
    {children}
  </button>
);
const TradeGauge=({score,label,color})=>{
  const r=38,circ=2*Math.PI*r,dash=circ*(score/100);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke={C.border} strokeWidth={8}/>
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"
          transform="rotate(-90 50 50)" style={{transition:"stroke-dasharray 0.5s"}}/>
        <text x={50} y={46} textAnchor="middle" fill={color} fontSize={18} fontWeight={800} fontFamily="monospace">{score}</text>
        <text x={50} y={62} textAnchor="middle" fill={C.dim} fontSize={9}>/100</text>
      </svg>
      <div style={{fontSize:11,color,fontWeight:700,textAlign:"center",maxWidth:120}}>{label}</div>
    </div>
  );
};
const SimHistogram=({hist,mean,price,height=170})=>(
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={hist} barSize={16}>
      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
      <XAxis dataKey="x" stroke={C.muted} tick={{fill:C.dim,fontSize:9}}/>
      <YAxis stroke={C.muted} tick={{fill:C.dim,fontSize:9}}/>
      <Tooltip content={({active,payload,label})=>{
        if(!active||!payload?.length) return null;
        return<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",fontSize:11}}>
          <div style={{color:C.dim}}>~{label} sobres (${(label*price).toFixed(0)})</div>
          <div style={{color:C.gold}}>Frecuencia: <strong>{payload[0]?.value}</strong></div>
        </div>;
      }}/>
      <ReferenceLine x={mean} stroke={C.gold} strokeDasharray="4 4" label={{value:"Media",fill:C.gold,fontSize:9}}/>
      <Bar dataKey="y" fill={C.blue} opacity={0.85} radius={[3,3,0,0]}/>
    </BarChart>
  </ResponsiveContainer>
);

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]           = useState("progress");
  const [rawN,setRawN]         = useState("980");
  const [rawSpp,setRawSpp]     = useState("7");
  const [rawPrice,setRawPrice] = useState("1.20");
  const [rawInd,setRawInd]     = useState("0.25");
  const [inputMode,setInputMode]   = useState("unique");
  const [rawOwned,setRawOwned]     = useState("600");
  const [rawDups,setRawDups]       = useState("");
  const [socialMode,setSocialMode] = useState("social");
  const [rawNRare,setRawNRare]         = useState("3");
  const [rawRarePrice,setRawRarePrice] = useState("2.00");
  const [rawSimN,setRawSimN]   = useState("1000");
  const [sim,setSim]           = useState(null);
  const [running,setRunning]   = useState(false);
  const [simProg,setSimProg]   = useState(null);
  const [runningP,setRunningP] = useState(false);

  // Valores validados
  const n        = Math.max(100,Math.min(2000,parseInt(rawN)||980));
  const spp      = Math.max(1,  Math.min(20,  parseInt(rawSpp)||7));
  const price    = Math.max(0.05,Math.min(50, parseFloat(rawPrice)||1.20));
  const indPrice = Math.max(0.01,Math.min(20, parseFloat(rawInd)||0.25));
  const nRare    = Math.max(0,  Math.min(50,  parseInt(rawNRare)||3));
  const rarePrice= Math.max(0.50,Math.min(20, parseFloat(rawRarePrice)||2.00));
  const simN     = Math.max(100,Math.min(5000,parseInt(rawSimN)||1000));

  const rawOwnedNum = parseInt(rawOwned)||0;
  const kUnique = inputMode==="unique"
    ? Math.max(0,Math.min(n,rawOwnedNum))
    : estimateUnique(Math.max(0,rawOwnedNum),n);

  const missing      = n-kUnique;
  const pctDone      = +(kUnique/n*100).toFixed(1);
  const EP           = Math.round(calcExpPacks(n,spp));
  const EC           = +calcExpCost(n,spp,price).toFixed(2);
  const INF          = Math.round(calcInflPacks(n,spp));
  const kCross       = crossoverK(n,price,spp,indPrice);
  const pctCross     = +(kCross/n*100).toFixed(1);
  const remPacks     = Math.round(calcRemainingPacks(kUnique,n,spp));
  const remCost      = +calcRemainingCost(kUnique,n,spp,price).toFixed(2);

  // FIX: costo de comprar los que faltan uno por uno a diferentes precios
  const remCostInd    = +(missing * indPrice).toFixed(2);              // al precio de suelto configurado
  const remCostIndLow = +(missing * Math.max(0.10, indPrice*0.6)).toFixed(2);   // precio mínimo razonable
  const remCostIndHigh= +(missing * Math.min(3.00, indPrice*3.0)).toFixed(2);   // precio máximo razonable

  const dupsExp      = dupsAtK(kUnique,n);
  const dupsReal     = rawDups!==""&&parseInt(rawDups)>=0 ? parseInt(rawDups) : null;
  const dupsUsable   = dupsReal!==null ? dupsReal : dupsExp;
  const tradeable    = Math.min(dupsUsable,missing);
  const savingTrade  = +(tradeable*indPrice).toFixed(2);
  const ECRare       = realisticRareCost(n,spp,price,nRare,rarePrice);
  const rarePremium  = +(nRare*rarePrice).toFixed(2);

  const {score:tScore,label:tLabel,color:tColor,ready:tReady} = tradeScore(kUnique,n,spp,price,indPrice);
  const {minK,idealK,crossK} = tradingWindow(n,spp,price,indPrice);

  const growthData = makeGrowthData(n,spp);
  const budgetData = makeBudgetData(n,spp,price);
  const stageData  = makeStageData(n,spp,price);

  const getRecommendation = () => {
    if(kUnique>=n) return{title:"🏆 ¡Álbum completo!",msg:"¡Felicitaciones!",color:C.gold};
    const cpn=costPerNew(kUnique,n,price,spp);
    if(kUnique<minK) return{
      title:"📦 Sigue comprando sobres",
      msg:`Con ${kUnique} únicos todavía no tienes suficientes repetidos para intercambiar bien.\nSigue comprando hasta llegar al ${Math.round(minK/n*100)}% (~${minK} únicos).\nEn ese punto tendrás ~${dupsAtK(minK,n).toLocaleString()} repetidos disponibles.`,
      color:C.green};
    if(tReady&&socialMode!=="solo"&&tradeable>=5) return{
      title:"🤝 ¡Ahora es el momento de intercambiar!",
      msg:`Tienes ~${dupsUsable.toLocaleString()} repetidos y faltan ${missing} cromos.\n~${tradeable} son intercambiables directamente. Cada uno te ahorra $${indPrice}.\n${kUnique>crossK?"⚠️ Ya pasaste el punto ideal — hazlo cuanto antes.":"Estás en la ventana ideal."}`,
      color:C.teal};
    if(cpn>=indPrice||socialMode==="solo") return{
      title:"🏷️ Compra los que faltan sueltos",
      msg:`${socialMode==="solo"?"Como prefieres no intercambiar, c":"C"}omprar sueltos es más barato.\nFaltan ${missing} cromos × $${indPrice} = $${remCostInd}.\nVersus seguir con sobres: ~$${remCost}.\nAhorro: $${(remCost-remCostInd).toFixed(2)}.`,
      color:C.purple};
    return{
      title:"📦 Sigue comprando sobres por ahora",
      msg:`A tu progreso (${pctDone}%), cada sobre sale a $${cpn.toFixed(2)} por cromo nuevo — menor que suelto ($${indPrice}).\nEn el ${pctCross}% conviene cambiar de estrategia (${kCross-kUnique} cromos más).`,
      color:C.orange};
  };
  const rec=getRecommendation();

  const runSimProgress=useCallback(()=>{
    setRunningP(true);setSimProg(null);
    setTimeout(()=>{
      const res=Array.from({length:500},()=>runSimFromK(kUnique,n,spp));
      setSimProg(buildSimResults(res.map(r=>r.packs),price));
      setRunningP(false);
    },30);
  },[kUnique,n,spp,price]);

  const runSim=useCallback(()=>{
    setRunning(true);setSim(null);
    setTimeout(()=>{
      const res=Array.from({length:simN},()=>runOneSim(n,spp));
      setSim(buildSimResults(res.map(r=>r.packs),price));
      setRunning(false);
    },30);
  },[n,spp,price,simN]);

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"Georgia,serif",paddingBottom:40}}>

      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,#060d1b,#0c1e3a,#060d1b)`,borderBottom:`1px solid ${C.border}`,padding:"20px 24px 16px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${C.gold},${C.blue},${C.gold})`}}/>
        {[0,1,2,3].map(i=><div key={i} style={{position:"absolute",borderRadius:"50%",width:50+i*40,height:50+i*40,border:`1px solid ${C.gold}${(14-i*3).toString(16)}`,right:-8+i*7,top:-8+i*5,pointerEvents:"none"}}/>)}
        <div style={{maxWidth:940,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
            <span style={{fontSize:28}}>🏆</span>
            <div>
              <div style={{fontSize:9,color:C.goldDim,letterSpacing:3,textTransform:"uppercase"}}>Portfolio Case Study · Statistical Research</div>
              <div style={{fontSize:20,fontWeight:800,color:C.gold}}>FIFA World Cup Album Simulator</div>
              <div style={{fontSize:10,color:C.dim,fontStyle:"italic"}}>Monte Carlo · Coupon Collector · Behavioral Economics · Decision Strategy</div>
            </div>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
            <NumInput label="🎴 Cromos únicos"   raw={rawN}     setRaw={setRawN}     min={100} max={2000} step={1}/>
            <NumInput label="📦 Cromos/sobre"     raw={rawSpp}   setRaw={setRawSpp}   min={1}   max={20}   step={1}/>
            <NumInput label="💵 Precio sobre ($)" raw={rawPrice} setRaw={setRawPrice} min={0.05}max={50}   step={0.05}/>
            <NumInput label="🏷️ Suelto común ($)" raw={rawInd}   setRaw={setRawInd}   min={0.01}max={10}   step={0.05}/>
            <span style={{background:`${C.gold}22`,border:`1px solid ${C.goldDim}`,color:C.gold,padding:"5px 10px",borderRadius:20,fontSize:10,alignSelf:"flex-end",marginBottom:2}}>Ecuador 🇪🇨</span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"7px 24px",display:"flex",gap:3,flexWrap:"wrap"}}>
        {[["progress","📍 Mi Progreso"],["trading","🔄 ¿Intercambio ahora?"],["rarity","✨ Cromos Raros"],
          ["growth","📈 Dinámica"],["budget","💰 Presupuesto"],["stages","🎯 Etapas"],["monte","🎲 Monte Carlo"]
        ].map(([id,lbl])=><Tab key={id} active={tab===id} onClick={()=>setTab(id)}>{lbl}</Tab>)}
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"20px 20px"}}>

        {/* KPIs globales */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          <KPI icon="📦" label="Sobres esperados"     val={EP.toLocaleString()}  sub={`${n}÷${spp}/sobre`}     accent={C.gold} glow/>
          <KPI icon="💵" label="Costo esperado total" val={`$${EC}`}             sub="Sin intercambio ni raros" accent={C.orange}/>
          <KPI icon="✨" label={`Total con ${nRare} raros`} val={`$${ECRare}`}   sub={`+$${rarePremium} por raros`} accent={C.purple}/>
          <KPI icon="🔄" label="Ventana intercambio"  val={`${Math.round(minK/n*100)}–${pctCross}%`} sub="Rango óptimo" accent={C.teal}/>
        </div>

        {/* ══ MI PROGRESO ══════════════════════════════════════════════════ */}
        {tab==="progress"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:15,marginBottom:16}}>📍 ¿Dónde estás ahora mismo?</div>

            {/* Input */}
            <div style={{background:C.card,border:`2px solid ${C.teal}44`,borderRadius:14,padding:18,marginBottom:16}}>
              <div style={{fontWeight:700,color:C.teal,fontSize:12,marginBottom:12}}>✏️ Tu colección actual</div>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {[["unique","Tengo X únicos"],["total","Compré X cromos en total"]].map(([m,l])=>(
                  <button key={m} onClick={()=>setInputMode(m)} style={{padding:"6px 13px",borderRadius:8,
                    border:`1px solid ${inputMode===m?C.teal:C.border}`,background:inputMode===m?`${C.teal}22`:"transparent",
                    color:inputMode===m?C.teal:C.dim,fontSize:11,cursor:"pointer",fontWeight:inputMode===m?700:400}}>{l}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
                <NumInput label={inputMode==="unique"?`🎴 Únicos (de ${n})`:"🛍️ Total comprados"}
                  raw={rawOwned} setRaw={setRawOwned} min={0} max={inputMode==="unique"?n:n*15} step={1} accent={C.green}/>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:10,color:C.dim,marginBottom:5}}>Desliza para ajustar</div>
                  <input type="range" min={0} max={inputMode==="unique"?n:n*10}
                    value={rawOwnedNum||0} onChange={e=>setRawOwned(e.target.value)}
                    style={{width:"100%",accentColor:C.green}}/>
                </div>
                <NumInput label="♻️ Repetidos reales (opcional)"
                  raw={rawDups} setRaw={setRawDups} min={0} max={50000} step={1} accent={C.orange}/>
              </div>
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:7}}>¿Intercambiarías cromos?</div>
                <div style={{display:"flex",gap:8}}>
                  {[["social","🤝 Sí, sin problema"],["maybe","🤔 Si es fácil"],["solo","🙅 Prefiero no"]].map(([m,l])=>(
                    <button key={m} onClick={()=>setSocialMode(m)} style={{padding:"6px 13px",borderRadius:8,
                      border:`1px solid ${socialMode===m?C.teal:C.border}`,background:socialMode===m?`${C.teal}22`:"transparent",
                      color:socialMode===m?C.teal:C.dim,fontSize:11,cursor:"pointer",fontWeight:socialMode===m?700:400}}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Barra progreso */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{fontSize:11,color:C.dim,marginBottom:10}}>
                Progreso — zona <span style={{color:C.green,fontWeight:700}}>verde</span> = ventana óptima de intercambio
              </div>
              <div style={{position:"relative",marginBottom:12}}>
                <div style={{background:C.border,borderRadius:8,height:18,overflow:"hidden",position:"relative"}}>
                  <div style={{position:"absolute",left:`${minK/n*100}%`,width:`${(crossK-minK)/n*100}%`,height:"100%",background:`${C.green}30`}}/>
                  <div style={{position:"absolute",left:0,width:`${pctDone}%`,height:"100%",background:`linear-gradient(90deg,${C.teal}cc,${tColor})`}}/>
                  <div style={{position:"absolute",left:`${pctDone}%`,top:0,width:3,height:"100%",background:C.gold,transform:"translateX(-50%)"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:9,color:C.muted}}>
                  <span>0%</span>
                  <span style={{color:C.green}}>Zona intercambio ({Math.round(minK/n*100)}%–{pctCross}%)</span>
                  <span>100%</span>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:C.text}}>
                  <strong style={{color:C.gold}}>{kUnique}</strong> / <strong>{n}</strong> únicos ({pctDone}%)
                </span>
                <span style={{fontSize:12,color:C.orange}}>Faltan <strong>{missing}</strong> cromos</span>
              </div>
            </div>

            {/* RECOMENDACIÓN */}
            <div style={{background:`linear-gradient(135deg,${rec.color}18,${rec.color}06)`,
              border:`2px solid ${rec.color}66`,borderRadius:16,padding:20,marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:800,color:rec.color,marginBottom:10}}>{rec.title}</div>
              <div style={{fontSize:12,color:C.text,lineHeight:1.8,whiteSpace:"pre-line"}}>{rec.msg}</div>
            </div>

            {/* FIX: Cuánto cuestan los cromos que faltan — comparativa clara */}
            {missing>0&&(
              <div style={{marginBottom:16}}>
                <div style={{color:C.gold,fontWeight:700,fontSize:13,marginBottom:10}}>
                  💰 ¿Cuánto te costaría completar desde aquí?
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
                  <div style={{fontSize:11,color:C.dim,marginBottom:14}}>
                    Te faltan <strong style={{color:C.gold}}>{missing} cromos</strong>. Así se ven los costos según la ruta que elijas:
                  </div>

                  {/* Tabla de costos restantes */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>

                    {/* Ruta 1: solo sobres */}
                    <div style={{background:`${C.orange}11`,border:`1px solid ${C.orange}44`,borderRadius:10,padding:14}}>
                      <div style={{fontSize:11,color:C.dim,marginBottom:4}}>📦 Siguiendo con sobres</div>
                      <div style={{fontSize:26,fontWeight:800,color:C.orange}}>${remCost}</div>
                      <div style={{fontSize:10,color:C.dim,marginTop:4}}>
                        ~{remPacks} sobres más × ${price}<br/>
                        Algunos ya los tendrás repetidos
                      </div>
                    </div>

                    {/* Ruta 2: comprar sueltos */}
                    <div style={{background:`${C.purple}11`,border:`1px solid ${C.purple}44`,borderRadius:10,padding:14}}>
                      <div style={{fontSize:11,color:C.dim,marginBottom:4}}>🏷️ Comprando {missing} sueltos</div>
                      <div style={{fontSize:26,fontWeight:800,color:C.purple}}>${remCostInd}</div>
                      <div style={{fontSize:10,color:C.dim,marginTop:4}}>
                        {missing} × ${indPrice} (precio que pusiste)<br/>
                        Cero repetidos, pagas solo lo que falta
                      </div>
                    </div>
                  </div>

                  {/* Rango de precios realista */}
                  <div style={{background:`${C.border}60`,borderRadius:10,padding:14}}>
                    <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:8}}>
                      📊 Rango de precio real si compras los {missing} sueltos
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:10}}>
                      {/* Barra de rango */}
                      <div style={{flex:1,position:"relative",height:28}}>
                        <div style={{background:C.border,borderRadius:6,height:10,position:"absolute",top:9,left:0,right:0}}/>
                        <div style={{background:`linear-gradient(90deg,${C.green},${C.gold},${C.red})`,
                          borderRadius:6,height:10,position:"absolute",top:9,left:0,right:0,opacity:0.7}}/>
                        {/* Marcador precio actual */}
                        {(()=>{
                          const maxVal=missing*3, minVal=missing*0.10;
                          const pos=Math.min(100,Math.max(0,(remCostInd-minVal)/(maxVal-minVal)*100));
                          return<div style={{position:"absolute",top:3,left:`${pos}%`,transform:"translateX(-50%)",
                            display:"flex",flexDirection:"column",alignItems:"center"}}>
                            <div style={{width:2,height:22,background:C.gold}}/>
                          </div>;
                        })()}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[
                        [`Precio mínimo\n($${(indPrice*0.6).toFixed(2)}/cromo)`,`$${remCostIndLow}`,C.green,"Mercado secundario, lotes"],
                        [`Precio medio\n($${indPrice}/cromo)`,`$${remCostInd}`,C.gold,"Tu precio configurado"],
                        [`Precio máximo\n($${Math.min(3,indPrice*3).toFixed(2)}/cromo)`,`$${remCostIndHigh}`,C.red,"Cromos escasos"],
                      ].map(([lbl,val,col,desc])=>(
                        <div key={lbl} style={{textAlign:"center",padding:"10px 8px",background:`${col}11`,borderRadius:8,border:`1px solid ${col}33`}}>
                          <div style={{fontSize:9,color:C.dim,marginBottom:4,whiteSpace:"pre-line",lineHeight:1.4}}>{lbl}</div>
                          <div style={{fontSize:18,fontWeight:800,color:col}}>{val}</div>
                          <div style={{fontSize:9,color:C.muted,marginTop:3}}>{desc}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:10,fontSize:11,color:C.dim,lineHeight:1.6}}>
                      💡 <strong style={{color:C.text}}>Lo más inteligente:</strong> combina las rutas.
                      Intercambia lo que puedas (~{tradeable} cromos = ahorro de ~${savingTrade}),
                      compra sueltos los que encuentres a buen precio, y usa sobres solo si estás por debajo del {pctCross}%.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
              <KPI icon="♻️" label="Repetidos" val={(dupsReal!==null?dupsReal:dupsExp).toLocaleString()}
                sub={dupsReal!==null?"Ingresados por ti":"Estimado matemáticamente"} accent={C.orange} small/>
              <KPI icon="🔁" label="Intercambiables" val={tradeable}
                sub={`de los ${missing} que faltan`} accent={C.teal} small glow/>
              <KPI icon="💸" label="Ahorro potencial intercambio" val={`~$${savingTrade}`}
                sub={`${tradeable} cromos × $${indPrice}`} accent={C.green} small/>
            </div>

            {/* Simulación */}
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
              <button onClick={runSimProgress} disabled={runningP||missing===0} style={{
                padding:"10px 22px",borderRadius:10,border:"none",cursor:(runningP||missing===0)?"not-allowed":"pointer",
                background:(runningP||missing===0)?C.muted:C.teal,color:C.bg,fontWeight:800,fontSize:13,
                boxShadow:(runningP||missing===0)?"none":`0 0 14px ${C.teal}55`,
              }}>{missing===0?"✅ ¡Álbum completo!":runningP?"⏳ Simulando...":"🎲 Simular los cromos restantes"}</button>
              {simProg&&<span style={{fontSize:11,color:C.green}}>✅ Media: {simProg.mean} sobres más (~${simProg.meanCost})</span>}
            </div>
            {simProg&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
                  <KPI icon="📊" val={simProg.mean}           label="Media"    sub="sobres más" accent={C.gold} glow small/>
                  <KPI icon="📍" val={simProg.median}         label="Mediana"  sub="sobres más" accent={C.blue}     small/>
                  <KPI icon="📈" val={simProg.p95}            label="P95"      sub="sobres más" accent={C.orange}   small/>
                  <KPI icon="💸" val={`$${simProg.meanCost}`} label="Costo"    sub="USD"        accent={C.green}    small/>
                </div>
                <SimHistogram hist={simProg.hist} mean={simProg.mean} price={price}/>
              </div>
            )}
          </div>
        )}

        {/* ══ INTERCAMBIO ══════════════════════════════════════════════════ */}
        {tab==="trading"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:15,marginBottom:4}}>🔄 ¿Puedo intercambiar ahora?</div>
            <div style={{color:C.dim,fontSize:11,marginBottom:18}}>El intercambio tiene una ventana óptima — ni muy temprano ni muy tarde</div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:16,
              display:"grid",gridTemplateColumns:"auto 1fr",gap:24,alignItems:"center"}}>
              <TradeGauge score={tScore} label={tLabel} color={tColor}/>
              <div>
                <div style={{fontWeight:700,color:tColor,fontSize:14,marginBottom:10}}>
                  Tu situación: {kUnique} únicos ({pctDone}%)
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    ["Repetidos disponibles",`~${dupsUsable.toLocaleString()}`,C.orange],
                    ["Intercambiables útiles",`~${tradeable}`,C.teal],
                    ["Ahorro potencial",`~$${savingTrade}`,C.green],
                    ["Posición vs ventana",kUnique<minK?"Muy temprano":kUnique<=crossK?"✓ En la ventana":"Pasaste el cruce",tColor],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{background:`${C.border}80`,borderRadius:8,padding:"9px 12px"}}>
                      <div style={{fontSize:10,color:C.dim,marginBottom:2}}>{l}</div>
                      <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{color:C.gold,fontWeight:700,fontSize:13,marginBottom:10}}>Línea de tiempo — ventana óptima</div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18,marginBottom:14}}>
              <div style={{position:"relative",height:58,marginBottom:22}}>
                <div style={{position:"absolute",top:18,left:0,right:0,height:8,background:C.border,borderRadius:4}}/>
                <div style={{position:"absolute",top:18,left:0,width:`${minK/n*100}%`,height:8,background:`${C.red}66`,borderRadius:"4px 0 0 4px"}}/>
                <div style={{position:"absolute",top:18,left:`${minK/n*100}%`,width:`${(idealK-minK)/n*100}%`,height:8,background:`${C.orange}88`}}/>
                <div style={{position:"absolute",top:18,left:`${idealK/n*100}%`,width:`${(crossK-idealK)/n*100}%`,height:8,background:`${C.green}99`}}/>
                <div style={{position:"absolute",top:18,left:`${crossK/n*100}%`,right:0,height:8,background:`${C.gold}44`,borderRadius:"0 4px 4px 0"}}/>
                <div style={{position:"absolute",top:12,left:`${Math.min(parseFloat(pctDone),99.5)}%`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center"}}>
                  <div style={{fontSize:14}}>👤</div><div style={{width:2,height:8,background:C.gold}}/>
                </div>
                {[[0,"0%",C.muted],[minK/n*100,`${Math.round(minK/n*100)}%\nMín`,C.red],
                  [idealK/n*100,`${Math.round(idealK/n*100)}%\n★Ideal`,C.green],
                  [crossK/n*100,`${pctCross}%\nCruce`,C.orange],[100,"100%",C.muted]
                ].map(([pos,lbl,col])=>(
                  <div key={pos} style={{position:"absolute",top:30,left:`${pos}%`,transform:"translateX(-50%)",
                    textAlign:"center",whiteSpace:"pre-line",fontSize:9,color:col,fontWeight:700,lineHeight:1.3}}>{lbl}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {[[C.red,"Muy temprano","Pocos repetidos"],[C.orange,"Empieza a tradear","Intercambios pequeños"],
                  [C.green,"★ Ventana ideal","Máximo provecho"],[C.gold,"Pasaste el cruce","Mejor comprar sueltos"]
                ].map(([col,title,desc],i)=>(
                  <div key={i} style={{background:`${col}11`,border:`1px solid ${col}33`,borderRadius:9,padding:"10px 11px"}}>
                    <div style={{color:col,fontWeight:700,fontSize:11,marginBottom:2}}>{title}</div>
                    <div style={{color:C.dim,fontSize:10}}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:`${tColor}11`,border:`1px solid ${tColor}44`,borderRadius:12,padding:16}}>
              <div style={{fontWeight:700,color:tColor,fontSize:12,marginBottom:8}}>💡 Tu consejo concreto</div>
              <div style={{fontSize:11,color:C.text,lineHeight:1.7}}>
                {kUnique<minK&&`Todavía no. Sigue comprando hasta el ${Math.round(minK/n*100)}% (~${minK} únicos). Tendrás ~${dupsAtK(minK,n).toLocaleString()} repetidos en ese punto.`}
                {kUnique>=minK&&kUnique<=crossK&&`¡Sí, ahora! Tienes ~${dupsUsable.toLocaleString()} repetidos. ~${tradeable} son útiles para intercambiar directamente. Cada intercambio exitoso = $${indPrice} ahorrado.`}
                {kUnique>crossK&&`Ya pasaste el mejor momento (${pctCross}%). Comprar los ${missing} restantes sueltos ($${remCostInd}) es más barato que seguir con sobres ($${remCost}).`}
              </div>
            </div>
          </div>
        )}

        {/* ══ CROMOS RAROS — modelo realista ═══════════════════════════════ */}
        {tab==="rarity"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:15,marginBottom:4}}>✨ Cromos raros — costo real y concreto</div>
            <div style={{color:C.dim,fontSize:11,marginBottom:18}}>
              Los cromos raros (el "00", ediciones especiales) se consiguen sueltos en el mercado. El modelo los trata como compra directa, no vía sobres.
            </div>

            <div style={{background:C.card,border:`2px solid ${C.purple}44`,borderRadius:14,padding:18,marginBottom:18}}>
              <div style={{fontWeight:700,color:C.purple,fontSize:12,marginBottom:14}}>⚙️ Define los cromos raros</div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
                <NumInput label="✨ Cuántos cromos raros tiene el álbum"
                  raw={rawNRare} setRaw={setRawNRare} min={0} max={50} step={1} width={70}/>
                <NumInput label="💎 Precio de mercado del raro ($)"
                  raw={rawRarePrice} setRaw={setRawRarePrice} min={0.50} max={20} step={0.25} width={80}/>
                <div style={{flex:1,minWidth:180,paddingBottom:2}}>
                  <div style={{fontSize:10,color:C.dim,marginBottom:5}}>Precio del cromo raro</div>
                  <input type="range" min={0.5} max={10} step={0.25} value={parseFloat(rawRarePrice)||2}
                    onChange={e=>setRawRarePrice(e.target.value)}
                    style={{width:"100%",accentColor:C.purple}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginTop:2}}>
                    <span>$0.50</span><span>$3 (típico)</span><span>$10</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FIX: KPIs útiles y reales */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:18}}>
              <KPI icon="🎯" label="Cromos raros que debes buscar sueltos"
                val={nRare} sub="No los busques en sobres — es ineficiente" accent={C.purple}/>
              <KPI icon="💎" label={`Costo de esos ${nRare} raros`}
                val={`$${rarePremium}`} sub={`${nRare} × $${rarePrice} c/u`} accent={C.gold} glow/>
              <KPI icon="📊" label="Costo álbum completo (raros incl.)"
                val={`$${ECRare}`} sub={`$${EC} normal + $${rarePremium} raros`} accent={C.orange}/>
            </div>

            {/* Tabla comparativa realista */}
            <div style={{color:C.gold,fontWeight:700,fontSize:13,marginBottom:10}}>
              Escenarios reales — cuánto suman los raros al costo total
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:`${C.border}80`}}>
                  {["Escenario","Cromos raros","Precio c/u","Costo raros","Costo total","Vs. sin raros"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,color:C.dim,fontWeight:600}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[[0,0,"Sin raros"],
                    [1,1.50,"Solo cromo 00"],
                    [1,3.00,"Cromo 00 (caro)"],
                    [3,2.00,"00 + 2 especiales"],
                    [5,2.50,"Caso con más raros"],
                  ].map(([nr,rp,label])=>{
                    const tc=realisticRareCost(n,spp,price,nr,rp);
                    const extra=+(tc-EC).toFixed(2);
                    const isActive=nr===nRare&&Math.abs(rp-rarePrice)<0.1;
                    return<tr key={label} style={{borderTop:`1px solid ${C.border}`,background:isActive?`${C.purple}08`:"transparent"}}>
                      <td style={{padding:"9px 14px",fontWeight:700,color:isActive?C.gold:C.text,fontSize:12}}>
                        {isActive?"→ ":""}{label}
                      </td>
                      <td style={{padding:"9px 14px",color:C.dim,fontSize:12}}>{nr}</td>
                      <td style={{padding:"9px 14px",color:C.dim,fontSize:12}}>${rp.toFixed(2)}</td>
                      <td style={{padding:"9px 14px",color:C.purple,fontWeight:700,fontSize:12}}>${(nr*rp).toFixed(2)}</td>
                      <td style={{padding:"9px 14px",color:C.gold,fontWeight:800,fontSize:13}}>${tc}</td>
                      <td style={{padding:"9px 14px"}}>
                        <span style={{background:extra>0?`${C.orange}22`:`${C.green}22`,
                          color:extra>0?C.orange:C.green,padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>
                          {extra>0?`+$${extra}`:"Base"}
                        </span>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>

            <div style={{background:`${C.teal}11`,border:`1px solid ${C.teal}44`,borderRadius:12,padding:16,fontSize:11,color:C.dim,lineHeight:1.6}}>
              💡 <strong style={{color:C.teal}}>Conclusión:</strong> los cromos raros añaden <strong style={{color:C.gold}}>${rarePremium}</strong> al costo total — un impacto <strong style={{color:C.text}}>menor y controlable</strong>. Lo que realmente encarece el álbum no son los raros, sino el último 5% de cromos comunes que estadísticamente cuestan más que el primer 50%.
            </div>
          </div>
        )}

        {/* ══ DINÁMICA — zoom 5× inflexión ═════════════════════════════════ */}
        {tab==="growth"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:14,marginBottom:4}}>
              Únicos vs Repetidos — el punto de inflexión visible
            </div>
            <div style={{background:`${C.orange}11`,border:`1px solid ${C.orange}33`,borderRadius:8,
              padding:"8px 14px",marginBottom:14,fontSize:11,color:C.dim}}>
              📍 Punto de inflexión: <strong style={{color:C.orange}}>~{INF} sobres</strong> (${(INF*price).toFixed(0)})
              &nbsp;— la línea roja cruza la verde aquí. El gráfico muestra hasta ~{Math.round(INF*5)} sobres para darte perspectiva de lo que viene después.
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
              <ResponsiveContainer width="100%" height={290}>
                <AreaChart data={growthData}>
                  <defs>
                    <linearGradient id="ug" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.green} stopOpacity={0.4}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.red} stopOpacity={0.4}/><stop offset="95%" stopColor={C.red} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis dataKey="packs" stroke={C.muted} tick={{fill:C.dim,fontSize:10}}
                    label={{value:"Sobres abiertos",fill:C.dim,fontSize:10,position:"insideBottom",dy:10}}/>
                  <YAxis stroke={C.muted} tick={{fill:C.dim,fontSize:10}}/>
                  <Tooltip content={({active,payload,label})=>{
                    if(!active||!payload?.length) return null;
                    return<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:11}}>
                      <div style={{color:C.gold,fontWeight:700,marginBottom:4}}>{label} sobres (${(label*price).toFixed(0)})</div>
                      {payload.map((p,i)=><div key={i} style={{color:p.color,margin:"2px 0"}}>{p.name}: <strong>{p.value}</strong></div>)}
                    </div>;
                  }}/>
                  <Legend wrapperStyle={{fontSize:11,color:C.dim,paddingTop:4}}/>
                  {/* Línea de inflexión bien visible */}
                  <ReferenceLine x={INF} stroke={C.orange} strokeWidth={2.5} strokeDasharray="6 3"
                    label={{value:`⬆ Inflexión: ${INF} sobres`,fill:C.orange,fontSize:11,position:"insideTopLeft",fontWeight:700}}/>
                  <Area type="monotone" dataKey="unique" stroke={C.green} fill="url(#ug)" strokeWidth={2.5} name="Únicos acumulados" dot={false}/>
                  <Area type="monotone" dataKey="dups"   stroke={C.red}   fill="url(#dg)" strokeWidth={2}   name="Repetidos acumulados" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:10}}>
                {[[C.green,"Antes de la inflexión","Vale la pena cada sobre"],[C.red,"Después de la inflexión","La mayoría del sobre son repetidos"]].map(([col,t,d])=>(
                  <div key={t} style={{background:`${col}11`,border:`1px solid ${col}33`,borderRadius:8,padding:"8px 14px",textAlign:"center"}}>
                    <div style={{color:col,fontWeight:700,fontSize:11}}>{t}</div>
                    <div style={{color:C.dim,fontSize:10,marginTop:2}}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ PRESUPUESTO ══════════════════════════════════════════════════ */}
        {tab==="budget"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:14,marginBottom:14}}>Probabilidad de completar según presupuesto</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[["10%",Math.round(EP*.72*price),"Suerte extrema"],["50%",Math.round(EP*.97*price),"Mediana"],
                ["90%",Math.round(EP*1.21*price),"Recomendado"],["99%",Math.round(EP*1.56*price),"Casi seguro"]
              ].map(([lbl,val,sub])=><KPI key={lbl} icon="🎯" label={`P(completar)=${lbl}`} val={`$${val}`} sub={sub} accent={C.blue} small/>)}
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={budgetData}>
                  <defs><linearGradient id="prob" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.blue} stopOpacity={0.4}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/>
                  </linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis dataKey="budget" stroke={C.muted} tick={{fill:C.dim,fontSize:10}} tickFormatter={v=>`$${v}`}
                    label={{value:"Presupuesto (USD)",fill:C.dim,fontSize:10,position:"insideBottom",dy:10}}/>
                  <YAxis stroke={C.muted} tick={{fill:C.dim,fontSize:10}} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                  <Tooltip formatter={v=>`${v}%`} labelFormatter={v=>`$${v}`}/>
                  <ReferenceLine y={50} stroke={C.gold}  strokeDasharray="3 3" label={{value:"50%",fill:C.gold,fontSize:10}}/>
                  <ReferenceLine y={90} stroke={C.green} strokeDasharray="3 3" label={{value:"90%",fill:C.green,fontSize:10}}/>
                  <ReferenceLine x={EC} stroke={C.orange} strokeDasharray="3 3" label={{value:`E=$${EC}`,fill:C.orange,fontSize:10}}/>
                  <Area type="monotone" dataKey="prob" stroke={C.blue} fill="url(#prob)" strokeWidth={2.5} name="P(completar)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══ ETAPAS ═══════════════════════════════════════════════════════ */}
        {tab==="stages"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:14,marginBottom:14}}>Costo por etapa — la trampa del final</div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:`${C.border}80`}}>
                  {["Etapa","Cromos","Sobres","Costo","Estado"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,color:C.dim,fontWeight:600}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {stageData.map((row,i)=>{
                    const col=i<2?C.green:i<4?C.orange:C.red;
                    return<tr key={row.label} style={{borderTop:`1px solid ${C.border}`}}>
                      <td style={{padding:"9px 14px",fontWeight:700,color:C.text,fontSize:13}}>{row.label}</td>
                      <td style={{padding:"9px 14px",color:C.dim,fontSize:12}}>{row.stickers}</td>
                      <td style={{padding:"9px 14px",color:C.orange,fontWeight:700,fontSize:12}}>{row.packs.toLocaleString()}</td>
                      <td style={{padding:"9px 14px",color:C.gold,fontWeight:700,fontSize:12}}>${row.cost}</td>
                      <td style={{padding:"9px 14px"}}>
                        <span style={{background:`${col}22`,color:col,padding:"3px 9px",borderRadius:8,fontSize:10,fontWeight:700}}>
                          {i<2?"EFICIENTE":i<4?"COSTOSO":"⚠️ CRÍTICO"}
                        </span>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ MONTE CARLO ══════════════════════════════════════════════════ */}
        {tab==="monte"&&(
          <div>
            <div style={{color:C.gold,fontWeight:700,fontSize:14,marginBottom:4}}>🎲 Simulación Monte Carlo</div>
            <div style={{color:C.dim,fontSize:11,marginBottom:16}}>Distribución real del costo bajo incertidumbre — ajusta todos los parámetros</div>

            <div style={{background:C.card,border:`2px solid ${C.gold}33`,borderRadius:14,padding:18,marginBottom:18}}>
              <div style={{fontWeight:700,color:C.gold,fontSize:12,marginBottom:14}}>⚙️ Parámetros de la simulación</div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <span style={{fontSize:10,color:C.dim}}>🔁 Número de simulaciones</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input type="number" value={rawSimN} min={100} max={5000} step={100}
                      onChange={e=>setRawSimN(e.target.value)}
                      style={{width:90,background:"#0f1e35",border:`1px solid ${C.gold}`,borderRadius:7,
                        color:C.gold,padding:"6px 8px",fontSize:14,fontWeight:700,fontFamily:"monospace",outline:"none"}}/>
                    <div style={{display:"flex",gap:5}}>
                      {[200,500,1000,2000].map(v=>(
                        <button key={v} onClick={()=>setRawSimN(String(v))} style={{
                          padding:"5px 10px",borderRadius:7,border:`1px solid ${simN===v?C.gold:C.border}`,
                          background:simN===v?`${C.gold}22`:"transparent",
                          color:simN===v?C.gold:C.dim,fontSize:11,cursor:"pointer",fontWeight:simN===v?700:400}}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{background:`${C.border}60`,borderRadius:9,padding:"8px 14px",fontSize:11,color:C.dim,alignSelf:"stretch",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                  <div>Cromos: <strong style={{color:C.text}}>{n}</strong> · {spp}/sobre · ${price}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>Cambia en los parámetros globales del header</div>
                </div>
              </div>
            </div>

            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
              <button onClick={runSim} disabled={running} style={{
                padding:"11px 26px",borderRadius:10,border:"none",cursor:running?"wait":"pointer",
                background:running?C.muted:C.gold,color:C.bg,fontWeight:800,fontSize:14,
                boxShadow:running?"none":`0 0 16px ${C.gold}55`,
              }}>{running?`⏳ Simulando ${simN} álbumes...`:`🎲 Simular ${simN} colecciones`}</button>
              {sim&&<div style={{fontSize:11,color:C.green}}>✅ {sim.n} sims · Media: {sim.mean} sobres · ${sim.meanCost}</div>}
            </div>

            {!sim&&!running&&(
              <div style={{background:C.card,border:`1px dashed ${C.border}`,borderRadius:12,padding:36,textAlign:"center",color:C.dim,fontSize:11}}>
                <div style={{fontSize:34,marginBottom:8}}>🎴</div>
                Elige cuántas simulaciones y pulsa para ver la distribución real de costos
              </div>
            )}

            {sim&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
                  <KPI icon="📊" val={sim.mean}           label="Media"    sub="sobres" accent={C.gold} glow small/>
                  <KPI icon="📍" val={sim.median}         label="Mediana"  sub="sobres" accent={C.blue}     small/>
                  <KPI icon="📉" val={sim.p25}            label="P25"      sub="sobres" accent={C.green}    small/>
                  <KPI icon="📈" val={sim.p75}            label="P75"      sub="sobres" accent={C.orange}   small/>
                  <KPI icon="⚠️" val={sim.p95}            label="P95"      sub="sobres" accent={C.red}      small/>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
                  <div style={{fontSize:11,color:C.dim,marginBottom:8}}>
                    Distribución de sobres necesarios · {sim.n} simulaciones · {n} cromos · {spp}/sobre · ${price}
                  </div>
                  <SimHistogram hist={sim.hist} mean={sim.mean} price={price} height={190}/>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,display:"grid",gridTemplateColumns:"repeat(5,1fr)"}}>
                  {[["P5",sim.p5,C.green,"Suerte"],["P25",sim.p25,C.blue,"Q1"],["P50",sim.median,C.gold,"Mediana"],
                    ["P75",sim.p75,C.orange,"Q3"],["P95",sim.p95,C.red,"Difícil"]].map(([lbl,val,col,desc])=>(
                    <div key={lbl} style={{textAlign:"center",padding:"12px 8px",borderRight:`1px solid ${C.border}`}}>
                      <div style={{fontSize:10,color:C.dim}}>{lbl}</div>
                      <div style={{fontSize:18,fontWeight:800,color:col}}>{val}</div>
                      <div style={{fontSize:9,color:C.dim}}>sobres</div>
                      <div style={{fontSize:11,color:col,fontWeight:700,marginTop:2}}>${(val*price).toFixed(0)}</div>
                      <div style={{fontSize:9,color:C.muted,marginTop:1}}>{desc}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{marginTop:24,padding:"10px 0",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10,color:C.muted}}>
          <div>🏆 FIFA WC Album · Statistical Research Portfolio · Monte Carlo Simulation</div>
          <div style={{display:"flex",gap:6}}>
            {["Python","NumPy","SciPy","Streamlit","Numba"].map(t=>(
              <span key={t} style={{background:C.border,padding:"2px 6px",borderRadius:4,color:C.dim,fontSize:9}}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
