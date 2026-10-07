/* =====================================================================
   Sira Propiedades — sitio público
   Las propiedades se leen de Supabase (las edita el equipo desde admin.html).
   ===================================================================== */
const { esc, num } = SIRA;

/* escala: 1 "unidad" = 1px del lienzo de Canva (1366 px de ancho) */
function setU(){
  const r=document.documentElement,w=r.clientWidth;
  const l=w>=900?'d':w>=620?'t':'m';
  const u=l==='d'?w/1366:l==='t'?w/880:w/432;
  r.style.setProperty('--u',u+'px'); r.dataset.l=l;
}
setU(); addEventListener('resize',setU);

const $=s=>document.querySelector(s);

/* ---------- datos reales ---------- */
let ALL=[], ITEMS=[], UF=SIRA.UF_RESPALDO, ESTADO_CARGA='cargando';
function normalizar(p){
  const fotos=(p.fotos||[]).filter(Boolean);
  return {...p,
    _t:SIRA.titulo(p), _lugar:SIRA.lugar(p), _precio:SIRA.precioTxt(p),
    _n:SIRA.precioCLP(p,UF), _mc:SIRA.supPrincipal(p), _mt:SIRA.supTerreno(p),
    _fotos:fotos, _creada:p.creada||'', _orden:(p.destacada?1:0)};
}
const recientes=(a,b)=>b._creada.localeCompare(a._creada);
async function cargar(){
  try{
    if(!SIRA.configurado()) throw new Error('Falta completar config.js con los datos de Supabase');
    const base=SIRA.CFG.supabaseUrl.replace(/\/+$/,'')+'/rest/v1/', k=SIRA.CFG.supabaseKey;
    const H={apikey:k}; if(/^eyJ/.test(k)) H.Authorization='Bearer '+k;
    const [rp,rc]=await Promise.all([
      fetch(base+'publicas?select=codigo,estado,creada,datos&order=creada.desc',{headers:H,cache:'no-store'}),
      fetch(base+'config?select=valor&clave=eq.uf',{headers:H,cache:'no-store'})]);
    if(!rp.ok) throw new Error('Supabase respondió '+rp.status);
    const filas=await rp.json();
    try{ const c=rc.ok?await rc.json():[]; const v=c[0]&&c[0].valor&&+c[0].valor.valor; if(v>0) UF=v; }catch(e){}
    /* una ficha con datos raros no debe botar todo el catálogo: se salta y se sigue */
    ALL=filas.map(f=>{try{
      const d=f.datos&&typeof f.datos==='object'?f.datos:{};
      const txt=['titulo','tipo','operacion','comuna','sector','region','descripcion','direccion','moneda'];
      const limpio={...d}; txt.forEach(k=>{ if(limpio[k]!=null&&typeof limpio[k]!=='string') limpio[k]=String(limpio[k]); });
      ['caracteristicas','detalles','fotos'].forEach(k=>{ if(!Array.isArray(limpio[k])) limpio[k]=[]; });
      return normalizar({...limpio,codigo:String(f.codigo),estado:f.estado,creada:f.creada,fotos:limpio.fotos.filter(x=>typeof x==='string').map(SIRA.fotoURL).filter(Boolean)});
    }catch(e){ console.warn('Ficha omitida',f&&f.codigo,e); return null; }}).filter(Boolean);
    /* disponibles primero; las vendidas/arrendadas al final, con su sello */
    ITEMS=ALL.filter(SIRA.publica).sort((a,b)=>(SIRA.cerrada(a)-SIRA.cerrada(b))||recientes(a,b));
    ESTADO_CARGA='ok';
  }catch(e){
    console.error('No se pudieron cargar las propiedades',e);
    ESTADO_CARGA='error';
  }
}

const PER=9; let page=1;
const M2='<svg class="m2i" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h14v14H1zM3 3v3h3V3zm5 0v3h3V3zM3 8v3h3V8zm5 0v3h3V8z" fill-rule="evenodd"/></svg>';
const NOFOTO='<svg class="nofoto" fill="#c95d2a" aria-hidden="true"><use href="#key"/></svg>';
function areaTxt(p){
  const a=p._mc, t=p._mt;
  if(a!=null&&t!=null) return num(a)+' / '+SIRA.m2(t);
  if(a!=null) return SIRA.m2(a);
  if(t!=null) return SIRA.m2(t);
  return '';
}
function card(p,i){
  const g=[];
  if(SIRA.usa(p,'dormitorios')&&p.dormitorios) g.push(`<span class="g"><i class="ic i-bed"></i>${esc(p.dormitorios)}</span>`);
  if(SIRA.usa(p,'banos')&&p.banos) g.push(`<span class="g"><i class="ic i-bath"></i>${esc(p.banos)}</span>`);
  if(SIRA.usa(p,'estacionamientos')&&p.estacionamientos) g.push(`<span class="g"><i class="ic i-car"></i>${esc(p.estacionamientos)}</span>`);
  const a=areaTxt(p); if(a) g.push(`<span class="g m2">${M2}${a}</span>`);
  const f=p._fotos[0], s=SIRA.sello(p);
  return `<article class="card${s?' closed':''}" tabindex="0" role="button" aria-label="Ver ${esc(p._t)}" data-id="${esc(p.codigo)}" style="animation-delay:${(i%9)*50}ms">
   <div class="ph">${f?`<img src="${esc(f)}" alt="${esc(p._lugar)}" loading="lazy">`:NOFOTO}<span class="tag">${esc(p.operacion)}</span>${p.estado==='reservada'?'<span class="tag tag2">Reservada</span>':''}${s?`<div class="sold"><b>${s}</b></div>`:`<span class="price">${esc(p._precio)}</span>`}</div>
   <div class="loc"><i class="ic i-pin"></i>${esc(p._lugar)}</div>
   <h3 class="t">${esc(p._t)}</h3>
   <div class="feat">${g.join('')}</div></article>`;
}
function msgVacio(txt){return `<p class="empty">${txt}</p>`;}
const TXT_CARGA='Cargando propiedades…';
const TXT_ERROR='No pudimos cargar las propiedades en este momento. Escríbenos por WhatsApp y te contamos lo que tenemos disponible.';

/* inicio: destacadas primero, luego las más recientes */
function renderHome(){
  const g=$('#grid');
  if(ESTADO_CARGA!=='ok'){g.innerHTML=msgVacio(ESTADO_CARGA==='error'?TXT_ERROR:TXT_CARGA);return;}
  const l=ITEMS.filter(SIRA.visible).sort((a,b)=>b._orden-a._orden||recientes(a,b)).slice(0,6);
  g.innerHTML=l.length?l.map(card).join(''):msgVacio('Muy pronto publicaremos nuevas propiedades. Si buscas algo en particular, <a href="#contacto">cuéntanos qué necesitas</a> y te ayudamos a encontrarlo.');
  $('#recientes .vall').style.display=l.length?'':'none';
}

/* ---------- catálogo (vista Propiedades) ---------- */
const F0={tipo:'',op:'',reg:'',com:'',dorm:'',ban:'',est:'',sup:'',ter:'',pr:''};
const F={...F0};
let ORD='';
const fmt=n=>'$'+n.toLocaleString('es-CL');
const fm=n=>n>=1e7?'$'+(n/1e6)+' millones':fmt(n);
const PR={
  Arriendo:[[0,300000],[300000,500000],[500000,800000],[800000,1200000],[1200000,0]],
  Venta:[[0,40e6],[40e6,70e6],[70e6,100e6],[100e6,150e6],[150e6,250e6],[250e6,0]]
};
const nm=n=>n.toLocaleString('es-CL');
const rl=(r,f,u)=>r[0]===0?'Hasta '+f(r[1])+u:r[1]===0?'Más de '+f(r[0])+u:f(r[0])+' – '+f(r[1])+u;
const prLabel=(op,i)=>rl(PR[op][i],fm,'');
const eq=(v,x)=>!v||(x!=null&&(v.endsWith('+')?x>=parseInt(v):x===parseInt(v)));
/* campos que tienen sentido según el tipo de propiedad */
const cnt=(n,sing,plur)=>({t:'cnt',n,sing,plur});
const rg=(ranges,word)=>({t:'rng',ranges,word});
const A=[[0,60],[60,100],[100,150],[150,250],[250,0]];       /* casa: construidos */
const D=[[0,40],[40,60],[60,80],[80,120],[120,0]];            /* depto/oficina: útiles */
const L=[[0,30],[30,60],[60,120],[120,300],[300,0]];          /* local */
const TC=[[0,200],[200,300],[300,500],[500,1000],[1000,0]];   /* casa: terreno */
const TP=[[0,5000],[5000,10000],[10000,20000],[20000,50000],[50000,0]]; /* parcela */
const TT=[[0,300],[300,500],[500,1000],[1000,5000],[5000,0]]; /* terreno */
const FIELD={
  dorm:{label:'Dormitorios',sing:'dormitorio',plur:'dormitorios'},
  ban:{label:'Baños',sing:'baño',plur:'baños'},
  est:{label:'Estacionamientos',sing:'estacionamiento',plur:'estacionamientos'},
  sup:{label:'Superficie construida'},
  ter:{label:'Superficie del terreno'},
  pr:{label:'Rango de precio'}
};
const CFG={
  '':{dorm:cnt(5),ban:cnt(3),est:cnt(3)},
  'Casa':{dorm:cnt(5),ban:cnt(3),est:cnt(3),sup:rg(A,'construidos'),ter:rg(TC,'de terreno')},
  'Departamento':{dorm:cnt(4),ban:cnt(3),est:cnt(2),sup:rg(D,'útiles'),label_sup:'Superficie útil'},
  'Parcela':{ter:rg(TP,'de terreno')},
  'Terreno':{ter:rg(TT,'de terreno')},
  'Local comercial':{ban:cnt(2),est:cnt(3),sup:rg(L,'construidos')},
  'Oficina':{ban:cnt(2),est:cnt(3),sup:rg(D,'útiles'),label_sup:'Superficie útil'}
};
const cfgFor=()=>CFG[F.tipo]||CFG[''];
const fieldLabel=k=>k==='sup'&&cfgFor().label_sup?cfgFor().label_sup:FIELD[k].label;
function optsFor(k){
  const c=cfgFor()[k];
  if(k==='pr') return F.op?PR[F.op].map((r,i)=>[String(i),prLabel(F.op,i)]):[];
  if(c.t==='cnt'){const o=[];for(let i=1;i<c.n;i++)o.push([String(i),String(i)]);o.push([c.n+'+',c.n+' o más']);return o;}
  return c.ranges.map((r,i)=>[String(i),rl(r,nm,' m²')]);
}
const KEYS=['dorm','ban','est','sup','ter','pr'];
const avail=k=>k==='pr'||!!cfgFor()[k];
let fxSig='';
function buildFx(){
  const sig=F.tipo+'|'+F.op; if(sig===fxSig) return; fxSig=sig;
  const h=KEYS.filter(avail).map(k=>{
    const dis=k==='pr'&&!F.op;
    const o=dis?'<option value="">Elige operación primero</option>':'<option value="">Cualquiera</option>'+optsFor(k).map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
    return `<label${k==='pr'?' class="wide"':''}><span>${fieldLabel(k)}</span><select data-k="${k}"${dis?' disabled':''}>${o}</select></label>`;
  }).join('');
  const full=h+(F.tipo?'':'<p class="hint">Elige un tipo de propiedad para ver filtros específicos, como superficie útil, de terreno o construida.</p>');
  [$('#fx'),$('#more')].forEach(c=>c.innerHTML=full);
}
/* región y comuna salen del stock publicado (no se escriben a mano) */
function fillGeo(){
  const regs=[...new Set(ITEMS.map(p=>p.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  if(F.reg&&!regs.includes(F.reg)) F.reg='';
  const coms=[...new Set(ITEMS.filter(p=>!F.reg||p.region===F.reg).map(p=>p.comuna).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  if(F.com&&!coms.includes(F.com)) F.com='';
  const op=(ph,l)=>`<option value="">${ph}</option>`+l.map(x=>`<option>${esc(x)}</option>`).join('');
  ['f-reg','c-reg'].forEach(id=>{$('#'+id).innerHTML=op('Región',regs);});
  ['f-com','c-com'].forEach(id=>{$('#'+id).innerHTML=op('Comuna',coms);});
}
function sanitize(){
  KEYS.forEach(k=>{
    if(!avail(k)||(k==='pr'&&!F.op)){F[k]='';return;}
    if(F[k]!==''&&!optsFor(k).some(([v])=>v===F[k])) F[k]='';
  });
}
function setPill(id,v){const sel=$('#'+id);sel.value=v;const lb=sel.parentElement.querySelector('.lb');lb.textContent=sel.value||lb.dataset.ph;}
function chipText(k,v){
  const c=cfgFor()[k];
  if(k==='pr') return prLabel(F.op,+v);
  if(c.t==='cnt'){const n=parseInt(v);const f=FIELD[k];return v.endsWith('+')?n+' o más '+f.plur:n+' '+(n===1?f.sing:f.plur);}
  return rl(c.ranges[+v],nm,' m² '+c.word);
}
function syncUI(){
  sanitize(); fillGeo(); buildFx();
  setPill('c-tipo',F.tipo);setPill('c-op',F.op);setPill('c-reg',F.reg);setPill('c-com',F.com);
  setPill('f-tipo',F.tipo);setPill('f-op',F.op);setPill('f-reg',F.reg);setPill('f-com',F.com);
  document.querySelectorAll('#fx select[data-k],#more select[data-k]').forEach(sel=>sel.value=F[sel.dataset.k]);
  const ex=KEYS.filter(k=>F[k]!=='').length;
  $('#c-plus').classList.toggle('has',ex>0);$('#btn-plus').classList.toggle('has',ex>0);
  const chips=[['tipo',F.tipo],['op',F.op],['reg',F.reg],['com',F.com]].filter(x=>x[1]).map(([k,v])=>[k,esc(v)]).concat(KEYS.filter(k=>F[k]!=='').map(k=>[k,chipText(k,F[k])]));
  $('#chips').innerHTML=chips.map(([k,t])=>`<button type="button" data-k="${k}" aria-label="Quitar filtro">${t} <span aria-hidden="true">&times;</span></button>`).join('');
  $('#csort-l').textContent=ORDL[ORD]; $('#csort').classList.toggle('on',!!ORD);
  layoutFilters();
}
const ORDS=['','asc','desc'], ORDL={'':'Más recientes',asc:'Menor precio',desc:'Mayor precio'};
function inR(r,x){return x!=null&&x>=r[0]&&(!r[1]||x<=r[1]);}
function renderCat(){
  if(ESTADO_CARGA!=='ok'){$('#ccount').innerHTML='';$('#cgrid').innerHTML=msgVacio(ESTADO_CARGA==='error'?TXT_ERROR:TXT_CARGA);$('#cpager').innerHTML='';return;}
  const c=cfgFor();
  const pr=F.pr!==''&&F.op?PR[F.op][+F.pr]:null, su=F.sup!==''&&c.sup?c.sup.ranges[+F.sup]:null, te=F.ter!==''&&c.ter?c.ter.ranges[+F.ter]:null;
  let r=ITEMS.filter(p=>(!F.op||p.operacion===F.op)&&(!F.tipo||p.tipo===F.tipo)&&(!F.reg||p.region===F.reg)&&(!F.com||p.comuna===F.com)
    &&eq(F.dorm,SIRA.n0(p.dormitorios))&&eq(F.ban,SIRA.n0(p.banos))&&eq(F.est,SIRA.n0(p.estacionamientos))
    &&(!pr||inR(pr,p._n))&&(!su||inR(su,p._mc))&&(!te||inR(te,p._mt)));
  /* sin precio publicado: al final al ordenar por precio */
  if(ORD) r=[...r].sort((a,b)=>(SIRA.cerrada(a)-SIRA.cerrada(b))||(a._n==null?1:b._n==null?-1:ORD==='asc'?a._n-b._n:b._n-a._n));
  const pages=Math.max(1,Math.ceil(r.length/PER)); page=Math.min(page,pages);
  const sl=r.slice((page-1)*PER,page*PER);
  const nd=r.filter(SIRA.visible).length, nc=r.length-nd;
  $('#ccount').innerHTML='<b>'+nd+'</b> '+(nd===1?'propiedad disponible':'propiedades disponibles')+(nc?' · '+nc+(nc===1?' ya cerrada':' ya cerradas'):'');
  const sinStock=!ITEMS.some(SIRA.visible);
  $('#cgrid').innerHTML=sl.length?sl.map(card).join(''):msgVacio(sinStock?'Estamos preparando nuevas publicaciones. Escríbenos y te contamos lo que tenemos disponible.':'No encontramos propiedades con esos filtros. Prueba quitando alguno o escríbenos y la buscamos por ti.');
  let h='';
  if(page>1) h+=`<button type="button" class="next" data-p="${page-1}">anterior</button>`;
  for(let n=1;n<=pages;n++) h+=`<button type="button" data-p="${n}" class="${n===page?'on':''}">${n}</button>`;
  if(page<pages) h+=`<button type="button" class="next" data-p="${page+1}">siguiente</button>`;
  $('#cpager').innerHTML=pages>1?h:'';
}
function upd(){page=1;syncUI();renderCat();}
function setF(k,v){
  F[k]=v;
  if(k==='tipo'){F.sup='';F.ter='';}
  if(k==='op') F.pr='';
  if(k==='reg') F.com='';
  upd();
}
$('#cpager').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; page=+b.dataset.p; renderCat(); $('#cfil').scrollIntoView({behavior:'smooth',block:'start'});});
[['c-tipo','tipo'],['c-op','op'],['c-reg','reg'],['c-com','com'],['f-tipo','tipo'],['f-op','op'],['f-reg','reg'],['f-com','com']].forEach(([id,k])=>$('#'+id).addEventListener('change',e=>setF(k,e.target.value)));
[$('#fx'),$('#more')].forEach(c=>c.addEventListener('change',e=>{const k=e.target.dataset.k; if(!k) return; F[k]=e.target.value; upd();}));
$('#chips').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; setF(b.dataset.k,'');});
$('#c-plus').addEventListener('click',e=>{const o=$('#fx').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',o);});
$('#c-search').addEventListener('click',()=>{$('#ccount').scrollIntoView({behavior:'smooth',block:'center'});});
$('#csort').addEventListener('click',()=>{ORD=ORDS[(ORDS.indexOf(ORD)+1)%3];page=1;syncUI();renderCat();});
function clearF(){Object.assign(F,F0);page=1;syncUI();renderCat();}
$('#cclear').addEventListener('click',clearF);

/* ---------- publicación (detalle de propiedad) ---------- */
const WA=SIRA.WA;
const IC={
 bed:'<svg viewBox="0 0 24 24"><path d="M3 19V6M3 14h18v5M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5M7 11.5h.01"/></svg>',
 bath:'<svg viewBox="0 0 24 24"><path d="M4 12h16v2.5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 14.5V12zM6 12V6.5a2 2 0 0 1 3.7-1M7 19l-1 2M17 19l1 2"/></svg>',
 car:'<svg viewBox="0 0 24 24"><path d="M5 15l1.6-4.8A2 2 0 0 1 8.5 9h7a2 2 0 0 1 1.9 1.2L19 15M4 15h16v3.5H4zM7.5 18.5V20M16.5 18.5V20M7.5 12.5h.01M16.5 12.5h.01"/></svg>',
 area:'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 12h8v8"/></svg>',
 land:'<svg viewBox="0 0 24 24"><path d="M3 18l5-9 4 6 3-4 6 7zM3 18h18"/></svg>',
 pin:'<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.400-6.500 11-6.500 11z"/><circle cx="12" cy="10" r="2.300"/></svg>'
};
let GI=0, DP=null;
const pl=(n,s,p)=>n+' '+(+n===1?s:p);
const CIERRE='Para coordinar una visita, conocer las condiciones o resolver cualquier duda, escríbenos y te acompañamos en todo el proceso, con ética, imparcialidad, orden y transparencia.';
function descHTML(p){
  const parr=String(p.descripcion||'').split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean)
    .map(t=>`<p>${esc(t).replace(/\n/g,'<br>')}</p>`).join('');
  const car=(p.caracteristicas||[]).map(x=>String(x).trim()).filter(Boolean);
  return (parr||`<p>${esc(p.tipo)} ${p.operacion==='Venta'?'en venta':'en arriendo'} en ${esc(p.sector?p.sector+', ':'')}${esc(p.comuna)}.</p>`)
    +(car.length?`<h4 class="dsub">Lo que destaca:</h4><ul class="dul">${car.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:'')
    +`<p>${CIERRE}</p>`;
}
function similares(p){
  const otras=ITEMS.filter(x=>SIRA.visible(x)&&x.codigo!==p.codigo);
  const a=otras.filter(x=>x.tipo===p.tipo&&x.operacion===p.operacion);
  const b=otras.filter(x=>!a.includes(x)&&x.operacion===p.operacion);
  return a.concat(b).slice(0,3);
}
function renderNoDisp(p){
  DP=null;
  const sim=p?similares(p):ITEMS.filter(SIRA.visible).slice(0,3);
  const que=p&&p.estado==='vendida'?'ya fue vendida':p&&p.estado==='arrendada'?'ya fue arrendada':'ya no está disponible';
  $('#det-body').innerHTML=`
  <nav class="crumb" aria-label="Ruta"><a href="#inicio">Inicio</a><span>/</span><a href="#propiedades">Propiedades</a></nav>
  <div class="nodisp"><svg class="k" fill="#c95d2a" aria-hidden="true"><use href="#key"/></svg>
    <h2 class="dtitle">Esta propiedad ${que}</h2>
    <p>${p?esc(p._t)+' · Código '+esc(p.codigo):'El enlace que abriste no corresponde a una publicación vigente.'}</p>
    <a class="btn" href="#propiedades">Ver propiedades disponibles</a></div>
  ${sim.length?`<section class="dsim"><h3 class="dh">Te puede interesar</h3><div class="grid" id="sgrid">${sim.map(card).join('')}</div></section>`:''}`;
}
function renderDet(p){
  DP=p; GI=0;
  const s=SIRA.sello(p), hecho=p.estado==='vendida'?'vendida':'arrendada';
  const ph=p._fotos, u=k=>SIRA.usa(p,k), v=k=>SIRA.n0(p[k]);
  const tile=(ic,val,l)=>`<div>${IC[ic]}<b>${val}</b><span>${l}</span></div>`;
  const row=(k,val)=>`<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`;
  let tiles='';
  if(u('dormitorios')&&v('dormitorios')!=null) tiles+=tile('bed',v('dormitorios'),v('dormitorios')===1?'Dormitorio':'Dormitorios');
  if(u('banos')&&v('banos')!=null) tiles+=tile('bath',v('banos'),v('banos')===1?'Baño':'Baños');
  if(u('estacionamientos')&&v('estacionamientos')!=null) tiles+=tile('car',v('estacionamientos')||'—',v('estacionamientos')===1?'Estacionamiento':v('estacionamientos')?'Estacionamientos':'Sin estacionamiento');
  if(u('supUtil')&&v('supUtil')!=null) tiles+=tile('area',SIRA.m2(v('supUtil')),'Superficie útil');
  if(u('supConstruida')&&v('supConstruida')!=null) tiles+=tile('area',SIRA.m2(v('supConstruida')),'Superficie construida');
  if(u('supTerreno')&&v('supTerreno')!=null) tiles+=tile('land',SIRA.m2(v('supTerreno')),'Terreno');
  let rows=row('Código',p.codigo)+row('Operación',p.operacion)+row('Tipo',p.tipo)+(p.estado==='reservada'?row('Estado','Reservada'):'')
    +(p.comuna?row('Comuna',p.comuna):'')+(p.sector?row('Sector',p.sector):'');
  if(u('dormitorios')&&v('dormitorios')!=null) rows+=row('Dormitorios',v('dormitorios'));
  if(u('banos')&&v('banos')!=null) rows+=row('Baños',v('banos'));
  if(u('estacionamientos')&&v('estacionamientos')!=null) rows+=row('Estacionamientos',v('estacionamientos')||'No');
  if(u('supUtil')&&v('supUtil')!=null) rows+=row('Sup. útil',SIRA.m2(v('supUtil')));
  if(u('supConstruida')&&v('supConstruida')!=null) rows+=row('Sup. construida',SIRA.m2(v('supConstruida')));
  if(u('supTerreno')&&v('supTerreno')!=null) rows+=row('Sup. terreno',SIRA.m2(v('supTerreno')));
  if(v('gastosComunes')) rows+=row('Gastos comunes','$'+num(v('gastosComunes')));
  rows+=(p.detalles||[]).filter(d=>d&&d[0]&&d[1]).map(([k,val])=>row(k,val)).join('');
  const aprox=p.moneda==='UF'&&p._n?`<div class="dpx">≈ $${num(Math.round(p._n))} (valor UF de referencia)</div>`:'';
  const sim=similares(p);
  const pin=p.mapaExacto&&isFinite(+p.lat)&&isFinite(+p.lng)&&p.lat!=null&&p.lng!=null?(+p.lat).toFixed(6)+','+(+p.lng).toFixed(6):'';
  const dondeMapa=pin||(p.mapaExacto&&p.direccion?p.direccion+', ':(p.sector?p.sector+', ':''))+(p.comuna||'')+(p.region?', '+p.region:'')+', Chile';
  const exacto=!!pin||!!(p.mapaExacto&&p.direccion);
  const ubic=[p.sector,p.comuna,p.region].filter(Boolean).join(', ');
  $('#det-body').innerHTML=`
  <nav class="crumb" aria-label="Ruta"><a href="#inicio">Inicio</a><span>/</span><a href="#propiedades">Propiedades</a><span>/</span><b>${esc(p._t)}</b></nav>
  <div class="dhead">
    <div class="dmeta"><span class="dop">${esc(p.operacion)}</span>${s?`<span class="dop dres">${s}</span>`:''}${p.estado==='reservada'?'<span class="dop dres">Reservada</span>':''}<span class="dcode">Código ${esc(p.codigo)}</span></div>
    <h2 class="dtitle">${esc(p._t)}</h2>
    <div class="dloc">${IC.pin}<span>${esc(ubic)}</span></div>
  </div>
  <div class="dgrid">
    <div class="dgal">
      <div class="gmain${ph.length?'':' sinfoto'}">${ph.length?`<img id="g-img" data-act="zoom" src="${esc(ph[0])}" alt="${esc(p._t)}">`:NOFOTO}<span class="tag">${esc(p.operacion)}</span>${s?`<div class="sold big"><b>${s}</b></div>`:''}
        ${ph.length>1?`<button type="button" class="gnav gp" data-act="prev" aria-label="Foto anterior">&lsaquo;</button><button type="button" class="gnav gn" data-act="next" aria-label="Foto siguiente">&rsaquo;</button>`:''}
        ${ph.length?`<span class="gzoom" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>Ampliar</span><span class="gcount" id="g-count">1 / ${ph.length}</span>`:''}</div>
      ${ph.length>1?`<div class="gthumbs">${ph.map((x,i)=>`<button type="button" data-act="thumb" data-i="${i}" class="${i?'':'on'}" aria-label="Ver foto ${i+1}"><img src="${esc(x)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}
    </div>
    <aside class="dside">
      <div class="dcard">${s?`<div class="dp">${s}</div><div class="dpl">Esta propiedad ya fue ${hecho}</div>`:`<div class="dp">${esc(p._precio)}</div><div class="dpl">${p.operacion==='Venta'?'Precio de venta':'Arriendo mensual'}</div>${aprox}`}<dl class="dtable">${rows}</dl><p class="dref">Información y fotos referenciales, entregadas por el propietario. Confírmalas con nosotros antes de cerrar un acuerdo.</p></div>
      <div class="dcard dform">
        <h3>${s?'¿Buscas algo parecido?':'¿Te interesa esta propiedad?'}</h3>
        <form id="dform" novalidate>
          <label><span>Nombre</span><input type="text" id="d-nom" autocomplete="name" placeholder="Tu nombre"></label>
          <label><span>Teléfono</span><input type="tel" id="d-tel" autocomplete="tel" placeholder="+56 9 1234 5678"></label>
          <label><span>Mensaje</span><textarea id="d-msg">${s?`Hola, vi la propiedad ${esc(p.codigo)} que ya fue ${hecho}. Busco algo parecido, ¿me pueden ayudar?`:`Hola, me interesa esta propiedad (${esc(p.codigo)}). ¿Me pueden dar más información?`}</textarea></label>
          <button type="submit" class="btn">Enviar por WhatsApp</button>
          <p class="dref">Usamos tus datos solo para responderte. <a href="privacidad.html">Privacidad</a>.</p>
        </form>
        <div class="dact"><a href="tel:+${WA}">Llamar</a><button type="button" data-act="share">Compartir</button></div>
        <div class="dmsg" id="d-status" role="status"></div>
      </div>
    </aside>
    <div class="dinfo">
      ${tiles?`<h3 class="dh">Características</h3><div class="dfeat">${tiles}</div>`:''}
      <h3 class="dh">Descripción</h3><div class="ddesc">${descHTML(p)}</div>
      <h3 class="dh">Mapa de ubicación</h3><div class="dmap"><iframe title="Mapa de ubicación" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(dondeMapa)}${pin?'&amp;z=16':''}&amp;output=embed"></iframe></div>
      <p class="dmapn">${exacto?'':'Ubicación referencial del sector. '}<a href="${esc(SIRA.mapaLink(dondeMapa))}" target="_blank" rel="noopener">Abrir en Google Maps &#8599;</a></p>
    </div>
  </div>
  ${sim.length?`<section class="dsim"><h3 class="dh">${s?'Disponibles parecidas':'Propiedades similares'}</h3><div class="grid" id="sgrid">${sim.map(card).join('')}</div></section>`:''}`;
}
function gShow(i){
  if(!DP||!DP._fotos.length) return; const n=DP._fotos.length; GI=(i+n)%n; const x=DP._fotos[GI];
  const im=$('#g-img'); if(!im) return; im.src=x;
  const gc=$('#g-count'); if(gc) gc.textContent=(GI+1)+' / '+n;
  document.querySelectorAll('.gthumbs button').forEach((b,k)=>b.classList.toggle('on',k===GI));
  lbSync();
}
$('#det-body').addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b) return; const a=b.dataset.act;
  if(a==='prev') gShow(GI-1); else if(a==='next') gShow(GI+1); else if(a==='thumb') gShow(+b.dataset.i); else if(a==='zoom') openLb();
  else if(a==='share'){
    const st=$('#d-status'), url=location.href;
    if(navigator.share){navigator.share({title:DP._t+' | Sira Propiedades',url}).catch(()=>{});}
    else if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>{st.textContent='Enlace copiado';},()=>{st.textContent=url;});}
    else st.textContent=url;
  }
});
$('#det-body').addEventListener('submit',e=>{
  e.preventDefault(); if(!DP) return;
  const nom=$('#d-nom'), tel=$('#d-tel'), st=$('#d-status');
  [nom,tel].forEach(x=>x.classList.remove('err'));
  if(nom.value.trim().length<3){nom.classList.add('err');nom.focus();st.textContent='Escribe tu nombre.';return;}
  if(tel.value.replace(/\D/g,'').length<8){tel.classList.add('err');tel.focus();st.textContent='Escribe un teléfono válido.';return;}
  const t='Hola Sira Propiedades, soy '+nom.value.trim()+' ('+tel.value.trim()+').\n'+$('#d-msg').value.trim()+'\n\n'+DP._t+' — '+(SIRA.sello(DP)||DP._precio)+'\n'+location.href;
  window.open('https://wa.me/'+WA+'?text='+encodeURIComponent(t),'_blank','noopener');
  st.textContent='¡Gracias! Te abrimos WhatsApp para enviar tu mensaje.';
});
const escribiendo=e=>e.target&&e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]');
addEventListener('keydown',e=>{if(document.body.classList.contains('v-det')&&!$('#lb').classList.contains('open')&&!escribiendo(e)){if(e.key==='ArrowLeft') gShow(GI-1); else if(e.key==='ArrowRight') gShow(GI+1);}});

/* ---------- visor de fotos ---------- */
function lbSync(){
  const lb=$('#lb'); if(!lb||!DP||!lb.classList.contains('open')) return;
  const x=DP._fotos[GI]; $('#lb-img').src=x; $('#lb-img').alt=DP._t;
  $('#lb-count').textContent=(GI+1)+' / '+DP._fotos.length;
  document.querySelectorAll('#lb-thumbs button').forEach((b,k)=>{b.classList.toggle('on',k===GI); if(k===GI) b.scrollIntoView({block:'nearest',inline:'center'});});
}
function openLb(){
  if(!DP||!DP._fotos.length) return;
  $('#lb-thumbs').innerHTML=DP._fotos.map((x,i)=>`<button type="button" data-i="${i}" aria-label="Ver foto ${i+1}"><img src="${esc(x)}" alt=""></button>`).join('');
  $('#lb').classList.add('open'); document.body.style.overflow='hidden'; lbSync();
}
function closeLb(){ const lb=$('#lb'); if(lb&&lb.classList.contains('open')){lb.classList.remove('open'); document.body.style.overflow='';} }
$('#lb').addEventListener('click',e=>{
  const t=e.target.closest('[data-lb]'), th=e.target.closest('#lb-thumbs button');
  if(th){gShow(+th.dataset.i);return;}
  if(t){const a=t.dataset.lb; if(a==='close') closeLb(); else if(a==='prev') gShow(GI-1); else gShow(GI+1); return;}
  if(!e.target.closest('#lb-img,.lbt')) closeLb();
});
addEventListener('keydown',e=>{
  if(!$('#lb').classList.contains('open')) return;
  if(e.key==='Escape') closeLb(); else if(e.key==='ArrowLeft') gShow(GI-1); else if(e.key==='ArrowRight') gShow(GI+1);
});
(function(){let x0=null; const el=$('#lb');
  el.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
  el.addEventListener('touchend',e=>{if(x0===null) return; const dx=e.changedTouches[0].clientX-x0; x0=null; if(Math.abs(dx)>50) gShow(GI+(dx<0?1:-1));},{passive:true});
})();
/* abrir publicación al tocar cualquier tarjeta */
const goDet=id=>{location.hash='#propiedad/'+encodeURIComponent(id);};
document.addEventListener('click',e=>{const c=e.target.closest('.card[data-id]'); if(c) goDet(c.dataset.id);});
document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const c=e.target.closest&&e.target.closest('.card[data-id]'); if(c){e.preventDefault();goDet(c.dataset.id);}}});

/* ---------- filtros ---------- */
document.querySelectorAll('.pill select').forEach(sel=>sel.addEventListener('change',()=>{
  const lb=sel.parentElement.querySelector('.lb'); lb.textContent=sel.value||lb.dataset.ph;
  layoutFilters();
}));
/* los botones del buscador se agrandan según el texto elegido (solo escritorio) */
function layoutFilters(){document.querySelectorAll('.filters').forEach(layoutOne);}
function layoutOne(form){
  const root=document.documentElement,els=[...form.querySelectorAll('.pill, .plus, .search')];
  if(!form.offsetWidth) return;
  if(root.dataset.l!=='d'){
    const u2=parseFloat(root.style.getPropertyValue('--u'))||1;
    els.forEach(e=>{
      e.style.left='';
      if(e.classList.contains('pill')){const lb=e.querySelector('.lb');e.style.width='auto';e.style.flex='1 1 auto';e.style.minWidth=(lb.offsetWidth+(22.9+44)*u2)+'px';}
    });return;}
  els.forEach(e=>{e.style.flex='';e.style.minWidth='';});
  const u=parseFloat(root.style.getPropertyValue('--u'))||1,gap=9.34;
  const base={'p-tipo':284.02,'p-op':193.75,'p-reg':138.67,'p-com':158.44};
  let items=els.map(e=>{
    let w=e.offsetWidth/u;
    const k=Object.keys(base).find(c=>e.classList.contains(c));
    if(k){const lb=e.querySelector('.lb'); w=Math.max(base[k],lb.offsetWidth/u+22.9+44);}
    return {e,w};
  });
  const total=items.reduce((a,i)=>a+i.w,0)+gap*(items.length-1);
  let x=Math.max(10,(1366.99-total)/2);
  items.forEach(i=>{i.e.style.left=(x*u)+'px';i.e.style.width=(i.w*u)+'px';x+=i.w+gap;});
}
addEventListener('resize',layoutFilters);
addEventListener('load',layoutFilters);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(layoutFilters);
layoutFilters();
$('#btn-search').addEventListener('click',()=>{$('#more').classList.remove('open');$('#btn-plus').setAttribute('aria-expanded','false');
  if(location.hash==='#propiedades') route(); else location.hash='#propiedades';});
document.addEventListener('click',e=>{if(!e.target.closest('#more,.filters')){$('#more').classList.remove('open');$('#btn-plus').setAttribute('aria-expanded','false');}});
$('#btn-plus').addEventListener('click',e=>{const o=$('#more').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',o);});

/* ---------- logo: vuelve al inicio y limpia todos los filtros ---------- */
function resetAll(){
  $('#more').classList.remove('open');$('#btn-plus').setAttribute('aria-expanded','false');
  clearF();
}
document.querySelectorAll('a.logo').forEach(a=>a.addEventListener('click',e=>{
  e.preventDefault();resetAll();location.hash='#inicio';scrollTo({top:0,behavior:'smooth'});
  cerrarMenu();
}));

/* ---------- menú ---------- */
const links=[...document.querySelectorAll('.menu a')];
const setOn=id=>links.forEach(a=>a.classList.toggle('on',a.dataset.s===id));
let moved=false,lockUntil=0;
function cerrarMenu(){$('#menu').classList.remove('open');$('#burger').setAttribute('aria-expanded','false');}
links.forEach(a=>a.addEventListener('click',()=>{moved=true;lockUntil=Date.now()+1300;setOn(a.dataset.s);cerrarMenu();}));
$('#burger').addEventListener('click',e=>{const o=$('#menu').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',o);});
document.addEventListener('click',e=>{if($('#menu').classList.contains('open')&&!e.target.closest('#menu,#burger')) cerrarMenu();});
addEventListener('keydown',e=>{if(e.key==='Escape') cerrarMenu();});
function onScroll(){
  if(Date.now()<lockUntil) return;
  if(document.body.classList.contains('v-prop')||document.body.classList.contains('v-det')){setOn('propiedades');return;}
  if(document.body.classList.contains('v-con')){setOn('contacto');return;}
  if(document.body.classList.contains('v-nos')){setOn('nosotros');return;}
  if(scrollY>2) moved=true;
  const hh=$('#top').offsetHeight+2, y=scrollY+hh;
  let cur='inicio';
  if($('#recientes').offsetTop<=y) cur='propiedades';
  setOn(moved?cur:'');
}
addEventListener('scroll',onScroll,{passive:true});

/* ---------- vistas (misma página, sin recargar) ---------- */
const VIEWS={'#nosotros':'nos','#contacto':'con','#propiedades':'prop'};
const TITLES={nos:'Quiénes somos | Sira Propiedades',con:'Contacto | Sira Propiedades',prop:'Propiedades | Sira Propiedades'};
let SAVED=null;
function route(){
  const h=location.hash, b=document.body;
  const cur=['nos','con','prop','det'].find(v=>b.classList.contains('v-'+v))||'';
  let v=cur, p=null, cod=null;
  const m=/^#propiedad\/(.+)$/.exec(h);
  if(m){ v='det'; try{cod=decodeURIComponent(m[1]);}catch(e){cod=m[1];} p=ALL.find(x=>x.codigo===cod)||null; }
  else if(VIEWS[h]) v=VIEWS[h]; else if(h===''||h==='#inicio'||h==='#recientes') v='';
  if(v==='det'&&cur!=='det') SAVED={view:cur,y:scrollY};
  ['nos','con','prop','det'].forEach(k=>b.classList.toggle('v-'+k,k===v));
  if(v==='det'){
    if(ESTADO_CARGA==='cargando'){ $('#det-body').innerHTML=msgVacio(TXT_CARGA); document.title='Sira Propiedades'; }
    else if(p&&SIRA.publica(p)){ renderDet(p); document.title=p._t+' | Sira Propiedades'; }
    else { renderNoDisp(p); document.title='Propiedad no disponible | Sira Propiedades'; }
  }
  else document.title=v?TITLES[v]:'Sira Propiedades';
  closeLb(); layoutFilters();
  const back=cur==='det'&&SAVED&&SAVED.view===v&&v!=='det';
  if(v==='det') scrollTo({top:0,behavior:'auto'});
  else if(back) requestAnimationFrame(()=>scrollTo({top:SAVED.y,behavior:'auto'}));
  else if(v){ if(v!==cur||VIEWS[h]) scrollTo({top:0,behavior:'auto'}); }
  else if(cur){
    if(h==='#recientes') requestAnimationFrame(()=>$('#recientes').scrollIntoView());
    else scrollTo({top:0,behavior:'auto'});
  }
  onScroll();
}
addEventListener('hashchange',route);

/* aparición suave al hacer scroll */
(function(){
  const els=[...document.querySelectorAll('.rv')];
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    els.forEach(e=>io.observe(e));
  }else els.forEach(e=>e.classList.add('in'));
})();

/* ---------- formulario de contacto -> WhatsApp ---------- */
(function(){
  const f=$('#cform'); if(!f) return;
  f.addEventListener('submit',e=>{
    e.preventDefault();
    const st=$('#c-status'), nom=$('#c-nom'), mail=$('#c-mail'), tel=$('#c-tel'), msg=$('#c-msg');
    [nom,mail,tel,msg].forEach(x=>x.classList.remove('err'));
    if($('#c-hp').value) return;
    let bad=null;
    if(nom.value.trim().length<3) bad=nom;
    else if(!/^\S+@\S+\.\S+$/.test(mail.value.trim()) && tel.value.replace(/\D/g,'').length<8) bad=mail;
    else if(msg.value.trim().length<5) bad=msg;
    if(bad){bad.classList.add('err');bad.focus();st.textContent='Revisa los campos marcados: nombre, un correo o teléfono válido y tu comentario.';return;}
    const t='Hola Sira Propiedades, soy '+nom.value.trim()+'.\nMe interesa: '+$('#c-int').value+'.\n'+(tel.value.trim()?'Teléfono: '+tel.value.trim()+'\n':'')+(mail.value.trim()?'Correo: '+mail.value.trim()+'\n':'')+'\n'+msg.value.trim();
    window.open('https://wa.me/'+WA+'?text='+encodeURIComponent(t),'_blank','noopener');
    st.textContent='¡Gracias! Te abrimos WhatsApp para enviar tu mensaje.';
    f.reset();
  });
})();
/* enlaces del pie: si ya estás en esa vista, sube al inicio */
document.querySelectorAll('.fnav a,.flogo2').forEach(a=>a.addEventListener('click',e=>{
  const h=a.getAttribute('href'); if(h===location.hash||(h==='#inicio'&&location.hash==='')){e.preventDefault();scrollTo({top:0,behavior:'smooth'});}
}));
const anio=$('#anio'); if(anio) anio.textContent=new Date().getFullYear();

/* ---------- arranque ---------- */
route(); renderHome(); syncUI(); renderCat();
cargar().then(()=>{ renderHome(); syncUI(); renderCat(); if(document.body.classList.contains('v-det')) route(); });

/* ---------- WhatsApp: el mensaje llega escrito según desde dónde escribe la persona ---------- */
function mensajeWA(){
  const b=document.body;
  if(b.classList.contains('v-det')&&DP){
    if(SIRA.cerrada(DP)) return `Hola, vi que ${DP.codigo} (${SIRA.titulo(DP)}) ya se ${DP.estado==='vendida'?'vendió':'arrendó'}. ¿Tienen algo parecido?\n${location.href}`;
    return `Hola, me interesó esta publicación:\n${DP.codigo} · ${DP._t} · ${DP._precio}\n${location.href}`;
  }
  if(b.classList.contains('v-prop')&&(F.op||F.tipo||F.com||F.reg)){
    const que=F.op==='Venta'?'comprar':F.op==='Arriendo'?'arrendar':'';
    const tipo=F.tipo?F.tipo.toLowerCase():'una propiedad';
    const donde=F.com||F.reg;
    return `Hola, estoy buscando ${que?que+' ':''}${tipo}${donde?' en '+donde:''}.`;
  }
  return 'Hola, vengo desde la página de Sira Propiedades.';
}
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="https://wa.me/'+WA+'"]'); if(!a||/\?text=/.test(a.getAttribute('href'))) return;
  a.href='https://wa.me/'+WA+'?text='+encodeURIComponent(mensajeWA());
  setTimeout(()=>{a.href='https://wa.me/'+WA;},0);   /* vuelve a quedar limpio para el próximo clic */
},true);
