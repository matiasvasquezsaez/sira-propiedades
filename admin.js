/* =====================================================================
   Sira Propiedades: panel de administración (Supabase)
   La seguridad real la ponen las reglas de la base de datos
   (supabase/configurar-base.sql). Este panel solo muestra u oculta
   botones según el perfil, para que cada uno vea lo que puede hacer.
   ===================================================================== */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const { esc } = SIRA;

/* ---------------- permisos por perfil (espejo de las reglas de la base) ---------------- */
const ROLES = { dueno:'Dueño', gerente:'Gerente', corredor:'Corredor', asistente:'Asistente inmobiliario', lectura:'Solo lectura', pendiente:'Pendiente' };
const PERM = {
  dueno:     { crear:1, editarTodo:1, publicar:1, aprobar:1, borrarTodo:1, equipo:'editar', historial:1, uf:1, seguir:1, procesos:1, arriendos:1, registro:1 },
  gerente:   { crear:1, editarTodo:1, publicar:1, aprobar:1, borrarTodo:0, equipo:'ver',    historial:1, uf:1, seguir:1, procesos:1, arriendos:1, registro:1 },
  corredor:  { crear:1, editarTodo:0, publicar:1, aprobar:0, borrarTodo:0, equipo:0,        historial:0, uf:0, seguir:1, procesos:0, arriendos:1, registro:0 },
  asistente: { crear:1, editarTodo:0, publicar:0, aprobar:0, borrarTodo:0, equipo:0,        historial:0, uf:0, seguir:1, procesos:0, arriendos:0, registro:0 },
  lectura:   { crear:0, editarTodo:0, publicar:0, aprobar:0, borrarTodo:0, equipo:0,        historial:0, uf:0, seguir:0, procesos:0, arriendos:0, registro:0 }
};
const TXT_PERM = {
  dueno: 'Tienes acceso completo.',
  gerente: 'Puedes crear, editar, aprobar y cambiar estados. Eliminar es solo del dueño.',
  corredor: 'Publicas directo tus propiedades y les cambias el estado. Las de otros las ves, sin modificarlas. El gerente y el dueño también pueden editar las tuyas.',
  asistente: 'Lo que crees queda "En revisión" hasta que un gerente o el dueño lo apruebe. Puedes editar tus propiedades mientras no estén publicadas.',
  lectura: 'Puedes ver todo el stock, sin hacer cambios.'
};
const BORRADOR = ['revision', 'pausada'];
let YO = null;          /* {id, email, nombre, rol, activo} */
const P = () => PERM[YO && YO.rol] || PERM.lectura;
const esMia = p => !!(p.creada_por && YO && p.creada_por === YO.id);
const puedeEditar = p => !!(P().editarTodo || (YO.rol === 'corredor' && esMia(p)) || (YO.rol === 'asistente' && esMia(p) && BORRADOR.includes(p.estado)));
const puedeBorrar = p => !!(P().borrarTodo || (['corredor','asistente'].includes(YO.rol) && esMia(p) && BORRADOR.includes(p.estado) && !p.publicada));
/* una propiedad en arriendo no puede quedar "Vendida" ni una en venta "Arrendada" */
const encaja = (k, op) => !(op === 'Arriendo' && k === 'vendida') && !(op === 'Venta' && k === 'arrendada');
const estadosPermitidos = op => (P().publicar ? Object.keys(SIRA.ESTADOS) : BORRADOR).filter(k => encaja(k, op));

/* ---------------- interfaz general ---------------- */
/* las vistas internas (ficha, seguimiento, contrato) dejan una entrada en el historial:
   así el botón "Atrás" del celular vuelve a la lista en vez de salir del panel */
const SUBVISTAS = ['edit','seg','ctr'];
let EN_SUB = false, SALTAR_POP = false;
function vista(v){
  $$('body > main[id^="v-"]').forEach(m => m.hidden = m.id !== 'v-' + v);
  $('#hdr-r').hidden = ['setup','login','clave'].includes(v);
  const sub = SUBVISTAS.includes(v);
  if (sub && !EN_SUB){ history.pushState({ sira: v }, ''); EN_SUB = true; }
  else if (!sub && EN_SUB){ EN_SUB = false; SALTAR_POP = true; history.back(); }
  scrollTo(0,0);
}
addEventListener('popstate', () => {
  if (SALTAR_POP){ SALTAR_POP = false; return; }
  if (!EN_SUB) return;
  EN_SUB = false;
  const v = $$('body > main[id^="v-"]').find(m => !m.hidden);
  const b = v && v.querySelector('[data-a=volver], [data-r=volver], #e-volver');
  if (b) b.click(); else vista('list');
  /* si había cambios sin guardar y la persona decidió quedarse, se repone la entrada */
  const sigue = $$('body > main[id^="v-"]').find(m => !m.hidden);
  if (sigue && SUBVISTAS.includes(sigue.id.slice(2))){ history.pushState({ sira: sigue.id.slice(2) }, ''); EN_SUB = true; }
});
let toastT;
/* aviso abajo; opcionalmente con un botón (ej: "Deshacer") */
function toast(t, mala, accion){
  let el = $('.toast'); if (!el){ el = document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el); }
  el.textContent = t; el.classList.toggle('bad', !!mala); el.hidden = false;
  if (accion){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.textContent = accion.texto;
    b.addEventListener('click', () => { el.hidden = true; accion.fn(); });
    el.appendChild(b);
  }
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, accion ? 8000 : mala ? 7000 : 4500);
}
function overlay(on, t, s){ $('#ov').hidden = !on; if (t) $('#ov-t').textContent = t; $('#ov-s').textContent = s || ''; }
function errTxt(e){
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Correo o clave incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Aún no confirmas tu correo. Revisa tu bandeja (y la carpeta de spam).';
  if (/already registered|already exists/i.test(m)) return 'Ese correo ya tiene cuenta. Usa "Entrar" o "Olvidé mi clave".';
  if (/Password should be|at least/i.test(m)) return 'La clave debe tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos.';
  if (/row-level security|permission denied|42501/i.test(m)) return 'Tu perfil no tiene permiso para hacer eso.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión a internet. Revisa tu señal e inténtalo otra vez.';
  if (/JWT expired/i.test(m)) return 'Tu sesión venció. Sal y vuelve a entrar.';
  if (/REGISTRO_CERRADO|Database error saving new user/i.test(m)) return 'El registro de nuevos integrantes está cerrado. Pídele al dueño o al gerente que lo abra un momento.';
  if (/duplicate key|23505/i.test(m)) return 'Eso ya estaba registrado. Toca "Actualizar" para ver lo último.';
  return m;
}
const fecha = iso => {
  /* acepta "2026-10-06T05:49:50.123456+00:00", "...+00" o con espacio */
  const t = String(iso || '').replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(t);
  return isNaN(d) ? String(iso || '') : d.toLocaleString('es-CL', { dateStyle:'short', timeStyle:'short' });
};

/* ---------------- conexión ---------------- */
if (!SIRA.configurado() || !window.supabase){ vista('setup'); return; }
const sb = window.supabase.createClient(SIRA.CFG.supabaseUrl, SIRA.CFG.supabaseKey);
const AQUI = location.origin + location.pathname;

/* ---------------- entrar / crear cuenta / recuperar ---------------- */
let MODO = 'entrar', SALIENDO = false;
function modoAuth(m){
  MODO = m;
  const T = {
    entrar: ['Entrar al panel', 'Usa tu correo y tu clave.', 'Entrar'],
    crear:  ['Crear cuenta', 'Después de crearla, el dueño te asigna un perfil para que puedas trabajar.', 'Crear cuenta'],
    olvide: ['Recuperar clave', 'Te enviaremos un correo con un enlace para elegir una clave nueva.', 'Enviar correo']
  }[m];
  $('#a-h').textContent = T[0]; $('#a-sub').textContent = T[1]; $('#a-btn').textContent = T[2];
  $('#a-nom-w').hidden = m !== 'crear'; $('#a-pass-w').hidden = m === 'olvide';
  $('#a-pass-i').textContent = m === 'crear' ? '(mínimo 8 caracteres)' : '';
  $('#a-pass').autocomplete = m === 'crear' ? 'new-password' : 'current-password';
  $('#a-msg').textContent = ''; $('#a-msg').className = 'msg';
  $('#a-sw').innerHTML = (m !== 'entrar' ? '<a data-m="entrar">Ya tengo cuenta</a>' : (REG_ABIERTO ? '<a data-m="crear">Crear cuenta</a>' : '')) + (m !== 'olvide' ? '<a data-m="olvide">Olvidé mi clave</a>' : '');
  $('#a-cerrado').hidden = REG_ABIERTO || m !== 'entrar';
}
/* ¿se pueden crear cuentas nuevas? (lo decide el dueño o el gerente en la pestaña Equipo) */
let REG_ABIERTO = false;
async function revisarRegistro(){
  try{ const { data, error } = await sb.rpc('registro_abierto'); if (!error) REG_ABIERTO = !!data; }catch(e){}
  if (MODO === 'crear' && !REG_ABIERTO) modoAuth('entrar'); else modoAuth(MODO);
}
$('#a-sw').addEventListener('click', e => { const a = e.target.closest('[data-m]'); if (a) modoAuth(a.dataset.m); });
$('#f-auth').addEventListener('submit', async e => {
  e.preventDefault();
  const m = $('#a-msg'), mail = $('#a-mail').value.trim().toLowerCase(), pass = $('#a-pass').value, nom = $('#a-nom').value.trim();
  m.className = 'msg';
  const mal = t => { m.textContent = t; m.classList.add('bad'); };
  if (!/^\S+@\S+\.\S+$/.test(mail)) return mal('Escribe un correo válido.');
  if (MODO !== 'olvide' && !pass) return mal('Escribe tu clave.');
  if (MODO === 'crear' && nom.length < 3) return mal('Escribe tu nombre.');
  if (MODO === 'crear' && pass.length < 8) return mal('La clave debe tener al menos 8 caracteres.');
  $('#a-btn').disabled = true; m.textContent = 'Un momento…';
  try{
    if (MODO === 'entrar'){
      const { error } = await sb.auth.signInWithPassword({ email: mail, password: pass });
      if (error) throw error;
      m.textContent = ''; await entrar();
    } else if (MODO === 'crear'){
      const { data, error } = await sb.auth.signUp({ email: mail, password: pass, options: { data: { nombre: nom }, emailRedirectTo: AQUI } });
      if (error) throw error;
      if (data.session){ m.textContent = ''; await entrar(); }
      else m.textContent = 'Listo. Te enviamos un correo para confirmar tu cuenta; ábrelo y luego entra aquí.';
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: AQUI });
      if (error) throw error;
      m.textContent = 'Si el correo tiene cuenta, te llegará un enlace para elegir una clave nueva.';
    }
  }catch(err){ mal(errTxt(err)); }
  finally{ $('#a-btn').disabled = false; }
});
$('#f-clave').addEventListener('submit', async e => {
  e.preventDefault();
  const p = $('#n-pass').value, m = $('#n-msg'); m.className = 'msg';
  if (p.length < 8){ m.textContent = 'Mínimo 8 caracteres.'; m.classList.add('bad'); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  if (error){ m.textContent = errTxt(error); m.classList.add('bad'); return; }
  history.replaceState(null, '', AQUI);
  toast('Clave actualizada.'); await entrar();
});
$('#b-salir').addEventListener('click', async () => {
  if (SUCIO && !confirm('Tienes cambios sin guardar. ¿Salir igual?')) return;
  SUCIO = false; SALIENDO = true; await sb.auth.signOut(); SALIENDO = false; YO = null; modoAuth('entrar'); vista('login'); revisarRegistro();
});
$('#b-reint').addEventListener('click', () => entrar());
function sinConexion(){
  $('#e-h1').textContent = 'No hay conexión';
  $('#e-txt').textContent = 'No pudimos conectarnos con la base de datos. Revisa tu internet y toca el botón para reintentar.';
  vista('espera');
}

async function entrar(){
  const { data: { user }, error: eu } = await sb.auth.getUser();
  if (eu && /fetch|network/i.test(eu.message || '')){ sinConexion(); return; }
  if (!user){ modoAuth('entrar'); vista('login'); revisarRegistro(); return; }
  const { data: perfil, error } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (error && /fetch|network/i.test(error.message || '')){ sinConexion(); return; }
  if (error) toast(errTxt(error), true);
  YO = perfil || { id:user.id, email:user.email, nombre:'', rol:'pendiente', activo:true };
  $('#who-n').textContent = YO.nombre || YO.email;
  $('#who-r').textContent = !YO.activo ? 'Sin acceso' : (innerWidth < 760 && YO.rol === 'asistente' ? 'Asistente' : ROLES[YO.rol] || YO.rol);
  if (!PERM[YO.rol] || !YO.activo){
    $('#e-h1').textContent = !YO.activo ? 'Acceso desactivado' : 'Tu cuenta está creada';
    $('#e-txt').textContent = !YO.activo
      ? 'Tu acceso fue desactivado. Si crees que es un error, habla con el dueño de Sira Propiedades.'
      : 'El dueño de Sira Propiedades todavía no te asigna un perfil. Avísale para que te dé acceso; cuando lo haga, vuelve a entrar.';
    vista('espera'); return;
  }
  $$('[data-perm]').forEach(el => el.hidden = !P()[el.dataset.perm]);
  $('#perm-txt').textContent = TXT_PERM[YO.rol];
  GANCHOS.entrar.forEach(h => h());
  pestana('prop');
  await cargar();
}

/* ---------------- datos ---------------- */
let LISTA = [], UF = { valor: SIRA.UF_RESPALDO, fecha: null }, EQUIPO = [];
const nombreDe = id => { const x = EQUIPO.find(e => e.id === id); return x ? (x.nombre || x.email) : ''; };
const META = ['id','codigo','estado','creada','creada_por','actualizada','actualizada_por','publicada'];
function deFila(f){ return { ...(f.datos||{}), id:f.id, codigo:f.codigo, estado:f.estado, creada:f.creada, creada_por:f.creada_por, actualizada:f.actualizada, publicada: !!f.publicada }; }
function aDatos(p){ const d = { ...p }; META.forEach(k => delete d[k]); return d; }

/* trae todas las filas aunque sean más de 1000 (el límite por consulta de Supabase) */
async function todo(consulta){
  let out = [];
  for (let i = 0; ; i += 1000){
    const { data, error } = await consulta().range(i, i + 999);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) return out;
  }
}
let CONFIG = {};
async function cargar(silencioso){
  if (!silencioso) overlay(true, 'Cargando propiedades…');
  try{
    const [rp, rc, re] = await Promise.all([
      todo(() => sb.from('propiedades').select('*').order('creada', { ascending:false }).order('id')),
      sb.from('config').select('clave,valor'),
      P().equipo ? sb.from('perfiles').select('*').order('creado') : Promise.resolve({ data: [] })
    ]);
    LISTA = rp.map(deFila);
    CONFIG = {}; (rc.data || []).forEach(c => CONFIG[c.clave] = c.valor);
    if (CONFIG.uf) UF = CONFIG.uf;
    EQUIPO = re.data || [];
    for (const h of GANCHOS.cargar) await h();
    pintarLista();
    const v = $$('body > main[id^="v-"]').find(m => !m.hidden);
    if (!v || !['v-edit','v-seg','v-ctr'].includes(v.id)) vista('list');
    else GANCHOS.refrescar.forEach(h => h(v.id));
  }catch(err){ toast(errTxt(err), true); vista('list'); }
  finally{ overlay(false); }
}
$('#b-recargar').addEventListener('click', () => cargar());

/* ---------------- pestañas ---------------- */
let TAB = 'prop';
function pestana(t){
  TAB = t;
  $$('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.t === t); if (b.dataset.t === t && b.scrollIntoView) b.scrollIntoView({ block:'nearest', inline:'nearest' }); });
  $$('#v-list > section[id^="t-"]').forEach(s => s.hidden = s.id !== 't-' + t);
  if (t === 'equipo') pintarEquipo();
  if (t === 'hist') cargarHistorial();
  if (GANCHOS.tab[t]) GANCHOS.tab[t]();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) pestana(b.dataset.t); });

/* ---------------- lista de propiedades ---------------- */
let FILTRO_EST = '';
const SEG = () => window.PANEL.seg;   /* módulo de seguimiento (checklist.js) */
function pintarLista(){
  const ps = LISTA, cuenta = k => ps.filter(p => p.estado === k).length;
  const S = SEG();
  const alertas = S ? { dormida: ps.filter(p => S.dormida(p)).length, mandato: ps.filter(p => S.mandato(p) && S.mandato(p).alerta).length, atras: ps.filter(p => S.resumen(p) && S.resumen(p).atras.length).length } : {};
  const rev = cuenta('revision');
  $('#tabs button[data-t=prop]').innerHTML = 'Propiedades' + (rev && P().aprobar ? `<span class="n" title="Esperando aprobación">${rev}</span>` : '');
  $('#stats').innerHTML = `<button type="button" class="st${FILTRO_EST?'':' on'}" data-e=""><b>${ps.length}</b> Todas</button>` +
    Object.entries(SIRA.ESTADOS).map(([k,l]) => { const n = cuenta(k), t = l.replace(' (oculta)',''); return `<button type="button" class="st${FILTRO_EST===k?' on':''}" data-e="${k}"><b>${n}</b> ${esc(n === 1 || k === 'revision' ? t : t + 's')}</button>`; }).join('') +
    [['atras', alertas.atras === 1 ? 'con pasos saltados' : 'con pasos saltados', 'Pasos que quedaron sin hacer en etapas que ya pasaron'], ['dormida', alertas.dormida === 1 ? 'dormida' : 'dormidas', 'Más de ' + (S ? S.DIAS_DORMIDA : 30) + ' días sin ningún movimiento'], ['mandato','mandato por vencer','Mandato u orden vencido o por vencer en 30 días']]
      .filter(([k]) => alertas[k]).map(([k,t,ti]) => `<button type="button" class="st al${FILTRO_EST===k?' on':''}" data-e="${k}" title="${esc(ti)}"><b>${alertas[k]}</b> ${t}</button>`).join('');
  $('#uf').value = UF.valor || SIRA.UF_RESPALDO;
  $('#uf-f').textContent = UF.fecha ? 'Actualizada: ' + UF.fecha : '';
  const q = $('#q').value.trim().toLowerCase(), op = $('#q-op').value;
  const filtroAlerta = { dormida: p => S.dormida(p), mandato: p => S.mandato(p) && S.mandato(p).alerta, atras: p => S.resumen(p) && S.resumen(p).atras.length };
  const pasa = p => !FILTRO_EST || (filtroAlerta[FILTRO_EST] ? (S && filtroAlerta[FILTRO_EST](p)) : p.estado === FILTRO_EST);
  const l = ps.filter(p => pasa(p) && (!op || p.operacion === op) &&
      (!q || [p.codigo, SIRA.titulo(p), p.comuna, p.sector, p.tipo, p.direccion].join(' ').toLowerCase().includes(q)));
  const est = p => {
    const ok = puedeEditar(p), ep = estadosPermitidos(p.operacion), lista = ep.includes(p.estado) ? ep : [p.estado, ...ep];
    if (!ok) return `<span class="estro">${esc((SIRA.ESTADOS[p.estado] || p.estado).replace(' (oculta)',''))}</span>`;
    return `<select data-a="estado" data-id="${esc(p.id)}" aria-label="Estado"${ok?'':' disabled'}>${lista.map(k => `<option value="${k}"${p.estado===k?' selected':''}>${esc(SIRA.ESTADOS[k])}</option>`).join('')}</select>`;
  };
  $('#rows').innerHTML = l.length ? l.map(p => {
    const f = (p.fotos||[])[0], ed = puedeEditar(p);
    const por = P().equipo && p.creada_por ? ` · <span class="por">por ${esc(nombreDe(p.creada_por) || '—')}</span>` : (esMia(p) ? ' · <span class="por">tuya</span>' : '');
    return `<div class="row${SIRA.publica(p)?'':' oc'}" data-cod="${esc(p.codigo)}">
      <div class="th" style="${f?`background-image:url('${esc(SIRA.fotoURL(f))}')`:''}">${f?'':'<svg fill="#c95d2a"><use href="#key"/></svg>'}</div>
      <div><div class="ti"><span class="pill">${esc(p.operacion||'')}</span>${p.estado==='revision'?'<span class="pill rev">En revisión</span>':''}${p.destacada?'<span class="pill d">★ Destacada</span>':''}${esc(SIRA.titulo(p))}</div>
        <div class="me">${esc(p.codigo)} · ${esc(SIRA.precioTxt(p))} · ${esc([p.sector,p.comuna].filter(Boolean).join(', '))} · ${(p.fotos||[]).length === 1 ? '1 foto' : (p.fotos||[]).length + ' fotos'}${por}</div>
        ${S ? S.chip(p) : ''}</div>
      <div class="ac">${est(p)}
        ${S && p.operacion ? `<button class="btn sec sm" type="button" data-a="seguir" data-id="${esc(p.id)}">Seguimiento</button>` : ''}
        ${p.estado==='revision' && P().aprobar ? `<button class="btn ok sm" type="button" data-a="aprobar" data-id="${esc(p.id)}">Aprobar y publicar</button>` : ''}
        <button class="btn ${ed?'':'sec '}sm" type="button" data-a="editar" data-id="${esc(p.id)}">${ed?'Editar':'Ver ficha'}</button>
        ${SIRA.publica(p) || P().crear || puedeBorrar(p) ? `<details class="mas"><summary class="btn sec sm" aria-label="Más opciones" title="Más opciones">&middot;&middot;&middot;</summary><div class="mmenu">
          ${SIRA.publica(p)?`<a href="index.html#propiedad/${encodeURIComponent(p.codigo)}" target="_blank" rel="noopener">Ver en sitio</a>`:''}
          ${P().crear?`<button type="button" data-a="duplicar" data-id="${esc(p.id)}">Duplicar</button>`:''}
          ${puedeBorrar(p)?`<button type="button" class="dan" data-a="borrar" data-id="${esc(p.id)}">Eliminar</button>`:''}</div></details>` : ''}</div>
    </div>`;
  }).join('') : `<div class="empty">${ps.length ? 'No hay propiedades con ese filtro.' : (P().crear ? 'Aún no hay propiedades. Toca <b>+ Nueva propiedad</b> para publicar la primera.' : 'Aún no hay propiedades.')}</div>`;
}
$('#rows').addEventListener('click', e => { const c = e.target.closest('[data-seg]'); if (c){ const p = porId(c.dataset.seg); if (p) SEG().abrir(p); } });
document.addEventListener('click', e => { $$('details.mas[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
$('#stats').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (!b) return; FILTRO_EST = b.dataset.e; pintarLista(); });
$('#q').addEventListener('input', pintarLista);
$('#q-op').addEventListener('change', pintarLista);
const porId = id => LISTA.find(p => p.id === id);

/* fotos que ya no usa ninguna otra propiedad (las duplicadas comparten archivos) */
async function borrarFotos(paths, salvoId){
  /* se consulta de nuevo: alguien pudo duplicar la propiedad hace un rato */
  let otras = LISTA;
  try{ otras = (await todo(() => sb.from('propiedades').select('id,datos').order('id'))).map(deFila); }catch(e){ return; }
  const usadas = new Set(otras.filter(p => p.id !== salvoId).flatMap(p => p.fotos||[]));
  const quitar = paths.filter(f => f && !usadas.has(f) && !/^(https?:|data:)/.test(f));
  if (quitar.length) await sb.storage.from('fotos').remove(quitar);   /* si no hay permiso, quedan; no afecta al sitio */
}
async function cambiarEstado(p, nuevo){
  overlay(true, 'Cambiando estado…');
  try{
    const { data, error } = await sb.from('propiedades').update({ estado: nuevo }).eq('id', p.id).select();
    if (error) throw error;
    if (!data.length) throw new Error('permission denied');
    toast(`${p.codigo} ahora está "${SIRA.ESTADOS[nuevo]}".${SIRA.cerrada({estado:nuevo}) ? ' En el sitio aparece con el sello encima de la foto.' : ''}`);
  }catch(err){ toast(errTxt(err), true); }
  finally{ await cargar(true); }
}
$('#rows').addEventListener('change', e => {
  const s = e.target.closest('select[data-a=estado]'); if (!s) return;
  const p = porId(s.dataset.id); if (p) cambiarEstado(p, s.value);
});
$('#rows').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const p = porId(b.dataset.id); if (!p) return;
  const a = b.dataset.a;
  if (a === 'editar') abrirEditor(p);
  else if (a === 'seguir') SEG().abrir(p);
  else if (a === 'aprobar') cambiarEstado(p, 'disponible');
  else if (a === 'duplicar'){
    const c = JSON.parse(JSON.stringify(p));
    META.forEach(k => delete c[k]); c.estado = P().publicar ? 'pausada' : 'revision';
    abrirEditor(c, true);
  }
  else if (a === 'borrar'){
    if (!confirm(`¿Eliminar definitivamente ${p.codigo} (${SIRA.titulo(p)})?\n\nSi solo se vendió o arrendó, mejor cambia el estado: queda en el sitio con el sello "Vendido" o "Arrendado".`)) return;
    overlay(true, 'Eliminando…');
    try{
      const { data, error } = await sb.from('propiedades').delete().eq('id', p.id).select();
      if (error) throw error;
      if (!data.length) throw new Error('permission denied');
      await borrarFotos(p.fotos||[], p.id);
      toast(`${p.codigo} eliminada.`);
    }catch(err){ toast(errTxt(err), true); }
    finally{ await cargar(true); }
  }
});
$('#b-nueva').addEventListener('click', () => {
  const ult = LISTA[0];
  abrirEditor({ estado: P().publicar ? 'disponible' : 'revision', moneda:'CLP', region: ult ? ult.region : '' }, true);
});

/* UF */
$('#b-ufget').addEventListener('click', async () => {
  try{
    const r = await fetch('https://mindicador.cl/api/uf'); const d = await r.json();
    const s = d.serie && d.serie[0]; if (!s) throw 0;
    $('#uf').value = s.valor; $('#uf-f').textContent = 'Valor del ' + s.fecha.slice(0,10) + ' (sin guardar)';
  }catch(e){ toast('No se pudo traer la UF automáticamente. Escríbela a mano (la encuentras en sii.cl).', true); }
});
$('#b-ufsave').addEventListener('click', async () => {
  const v = +$('#uf').value; if (!(v > 1000)){ toast('Escribe un valor de UF válido (ej: 39500).', true); return; }
  overlay(true, 'Guardando UF…');
  try{
    const { data, error } = await sb.from('config').update({ valor: { valor: v, fecha: new Date().toLocaleDateString('sv-SE') }, actualizada: new Date().toISOString() }).eq('clave','uf').select();
    if (error) throw error; if (!data.length) throw new Error('permission denied');
    UF = data[0].valor; toast('UF guardada.');
  }catch(err){ toast(errTxt(err), true); }
  finally{ overlay(false); pintarLista(); }
});

/* ---------------- equipo ---------------- */
function pintarRegistro(){
  const ab = !!(CONFIG.registro && CONFIG.registro.abierto);
  $('#reg-box').hidden = !P().registro;
  $('#reg-box').classList.toggle('abierto', ab);
  $('#reg-est').textContent = ab ? 'Abierto' : 'Cerrado';
  $('#reg-txt').innerHTML = ab
    ? 'Cualquier persona con el enlace del panel puede crear una cuenta (queda <i>Pendiente</i>, sin acceso, hasta que le asignes un perfil). <b>Ciérralo apenas se registre quien esperas.</b>'
    : 'Nadie puede crear cuentas nuevas. Cuando quieras sumar a alguien, ábrelo, pídele que se registre y vuelve a cerrarlo.';
  $('#reg-btn').textContent = ab ? 'Cerrar registro' : 'Abrir registro';
  $('#reg-btn').className = 'btn sm ' + (ab ? 'dan' : 'ok');
}
$('#reg-btn').addEventListener('click', async () => {
  const ab = !(CONFIG.registro && CONFIG.registro.abierto);
  overlay(true, ab ? 'Abriendo registro…' : 'Cerrando registro…');
  try{
    const { data, error } = await sb.from('config').update({ valor: { abierto: ab }, actualizada: new Date().toISOString() }).eq('clave','registro').select();
    if (error) throw error; if (!data.length) throw new Error('permission denied');
    CONFIG.registro = data[0].valor;
    toast(ab ? 'Registro abierto. Recuerda cerrarlo cuando la persona ya tenga su cuenta.' : 'Registro cerrado. Nadie más puede crear cuentas.');
  }catch(err){ toast(errTxt(err), true); }
  finally{ overlay(false); pintarRegistro(); }
});
/* respaldo: un archivo con todo lo que el dueño puede ver */
$('#resp-btn').addEventListener('click', async () => {
  overlay(true, 'Preparando respaldo…');
  try{
    const T = { propiedades:'id', checklist:'propiedad_id', privados:'propiedad_id', contratos:'id', pagos:'id', gastos:'id', perfiles:'id', historial:'id', config:'clave' };
    const out = { creado: new Date().toISOString(), por: YO.email, tablas: {} };
    for (const [t, o] of Object.entries(T)) out.tablas[t] = await todo(() => sb.from(t).select('*').order(o));
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'respaldo-sira-' + new Date().toLocaleDateString('sv-SE') + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Respaldo descargado: ' + out.tablas.propiedades.length + ' propiedades, ' + out.tablas.contratos.length + ' contratos.');
  }catch(err){ toast(errTxt(err), true); }
  finally{ overlay(false); }
});
function pintarEquipo(){
  pintarRegistro();
  $('#resp-box').hidden = YO.rol !== 'dueno';
  const edita = P().equipo === 'editar';
  $('#eq-rows').innerHTML = EQUIPO.map(u => {
    const yo = u.id === YO.id, dis = !edita || yo ? ' disabled' : '';
    return `<tr><td><b>${esc(u.nombre || '(sin nombre)')}</b>${yo?' <span class="mu">(tú)</span>':''}<br><span class="mu">${esc(u.email||'')}</span></td>
      <td><select data-u="${esc(u.id)}" data-c="rol" aria-label="Perfil"${dis}>${Object.entries(ROLES).map(([k,t]) => `<option value="${k}"${u.rol===k?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><label class="chk"><input type="checkbox" data-u="${esc(u.id)}" data-c="activo"${u.activo?' checked':''}${dis}> ${u.activo?'Activo':'Desactivado'}</label></td>
      <td class="mu" data-l="Cuenta creada">${esc(fecha(u.creado))}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="mu">Sin personas.</td></tr>';
}
$('#eq-rows').addEventListener('change', async e => {
  const el = e.target.closest('[data-u]'); if (!el) return;
  const u = EQUIPO.find(x => x.id === el.dataset.u); if (!u) return;
  const cambio = el.dataset.c === 'rol' ? { rol: el.value } : { activo: el.checked };
  if (cambio.rol === 'dueno' && !confirm(`¿Dar perfil de DUEÑO a ${u.nombre || u.email}? Tendrá acceso completo, incluido el equipo.`)){ pintarEquipo(); return; }
  overlay(true, 'Guardando…');
  try{
    const { data, error } = await sb.from('perfiles').update(cambio).eq('id', u.id).select();
    if (error) throw error; if (!data.length) throw new Error('permission denied');
    Object.assign(u, data[0]); toast(`${u.nombre || u.email}: ${ROLES[u.rol]}${u.activo ? '' : ' (desactivado)'}.`);
  }catch(err){ toast(errTxt(err), true); }
  finally{ overlay(false); pintarEquipo(); }
});

/* ---------------- historial ---------------- */
const trEst = t => String(t||'').replace(/\b(disponible|reservada|vendida|arrendada|pausada|revision|dueno|gerente|corredor|asistente|lectura|pendiente)\b/g, w => SIRA.ESTADOS[w] ? SIRA.ESTADOS[w].replace(' (oculta)','') : ROLES[w] || w);
async function cargarHistorial(){
  $('#hist').innerHTML = '<div><span></span><span class="mu">Cargando…</span></div>';
  const { data, error } = await sb.from('historial').select('*').order('id', { ascending:false }).limit(300);
  if (error){ $('#hist').innerHTML = `<div><span></span><span>${esc(errTxt(error))}</span></div>`; return; }
  $('#hist').innerHTML = data.length ? data.map(h => {
    let det = h.detalle || '';
    if (/^Actualizó uf$/i.test(h.accion)){ try{ det = 'UF = ' + SIRA.num(JSON.parse(det).valor); }catch(e){} }
    else if (/^Precio:/.test(det)) det = det.replace(/\d{4,}/g, n => SIRA.num(+n));
    return `<div><time>${esc(fecha(h.cuando))}</time><span><b>${esc(h.quien_nombre||'Sistema')}</b> ${esc(h.accion.toLowerCase())} ${h.codigo?`<code>${esc(h.codigo)}</code> `:''}${det?'· '+esc(trEst(det)):''}</span></div>`;
  }).join('') : '<div><span></span><span class="mu">Aún no hay movimientos.</span></div>';
}
$('#b-hist').addEventListener('click', cargarHistorial);

/* ---------------- editor ---------------- */
let ED = null, EDF = [], SUCIO = false, SOLO_VER = false;
const opts = (l, sel, ph) => (ph ? `<option value="">${ph}</option>` : '') + l.map(x => { const [v,t] = Array.isArray(x) ? x : [x,x]; return `<option value="${esc(v)}"${v===sel?' selected':''}>${esc(t)}</option>`; }).join('');
const CAMPOS_NUM = ['dormitorios','banos','estacionamientos','supUtil','supConstruida','supTerreno'];
function abrirEditor(p, nueva){
  ED = { ...p }; SUCIO = false;
  SOLO_VER = !nueva && !puedeEditar(p);
  EDF = (p.fotos||[]).map(f => ({ path:f, src: SIRA.fotoURL(f) }));
  $('#e-h').textContent = nueva ? (p.tipo ? 'Duplicar propiedad' : 'Nueva propiedad') : (SOLO_VER ? '' : 'Editar ') + p.codigo;
  $('#e-sub').textContent = SOLO_VER ? SIRA.titulo(p)
    : !P().publicar ? 'Al guardar, la propiedad queda "En revisión" hasta que un gerente o el dueño la apruebe.'
    : nueva && p.tipo ? 'Copia lista para editar. Quedó en "Pausada" para que no se publique hasta que la revises.'
    : 'Completa los datos. Al guardar, los cambios se ven en el sitio al instante.';
  $('#e-ro').hidden = !SOLO_VER;
  $('#e-ro').textContent = YO.rol === 'lectura' ? 'Tu perfil es de solo lectura: puedes ver la ficha completa pero no modificarla.'
    : YO.rol === 'corredor' ? 'Esta propiedad es de otra persona: solo quien la creó, un gerente o el dueño la pueden modificar.'
    : 'Esta propiedad ya fue aprobada o no es tuya: solo un gerente o el dueño la puede modificar.';
  pintarEstados(p.estado, p.operacion, nueva);
  $('#e-esthint').textContent = P().publicar
    ? '"Disponible" y "Reservada" se publican normal. "Vendida" y "Arrendada" quedan en el catálogo con el sello encima. "Pausada" y "En revisión" no se ven en el sitio.'
    : '"En revisión" la manda a aprobación. "Pausada" la guarda como borrador sin enviarla.';
  $('#e-operacion').innerHTML = opts(SIRA.OPERACIONES, p.operacion || '', 'Elige…');
  $('#e-tipo').innerHTML = opts(SIRA.TIPOS, p.tipo || '', 'Elige…');
  $('#e-region').innerHTML = opts(SIRA.REGIONES, p.region || '', 'Elige…');
  ['comuna','sector','direccion','titulo','descripcion'].forEach(k => $('#e-'+k).value = p[k] || '');
  $('#e-precio').value = p.precio ?? ''; $('#e-moneda').value = p.moneda || 'CLP'; $('#e-gastosComunes').value = p.gastosComunes ?? '';
  $('#e-destacada').checked = !!p.destacada; $('#e-mapaExacto').checked = !!p.mapaExacto;
  $('#e-caracteristicas').value = (p.caracteristicas||[]).join('\n');
  $('#e-det').innerHTML = ''; (p.detalles||[]).forEach(d => filaDet(d[0], d[1]));
  const uniq = k => [...new Set(LISTA.map(x => x[k]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  $('#dl-comunas').innerHTML = uniq('comuna').map(c => `<option value="${esc(c)}">`).join('');
  $('#dl-sectores').innerHTML = uniq('sector').map(c => `<option value="${esc(c)}">`).join('');
  $('#e-campos').innerHTML = '';   /* evita heredar números de la propiedad anterior */
  pintarCampos(); pintarFotos(); prevPrecio(); linkMapa();
  $$('#f-edit .err').forEach(x => x.classList.remove('err'));
  $$('#f-edit input, #f-edit select, #f-edit textarea, #f-edit button').forEach(x => x.disabled = SOLO_VER);
  $('#dz').hidden = SOLO_VER; $('#e-save').hidden = SOLO_VER; $('#e-cancel').textContent = SOLO_VER ? 'Volver' : 'Cancelar';
  $('#e-save').textContent = P().publicar ? 'Guardar y publicar' : 'Guardar';
  $('#e-msg').textContent = '';
  $('#e-seg').hidden = nueva || !p.id || !p.operacion;
  PIN = isFinite(+p.lat) && isFinite(+p.lng) && p.lat != null && p.lng != null ? { lat: +p.lat, lng: +p.lng } : null;
  if (MARCA){ MARCA.remove(); MARCA = null; }
  $('#e-pinmsg').textContent = '';
  $('#e-pinbuscar').hidden = SOLO_VER; $('#e-pinhint').hidden = SOLO_VER && !PIN;
  vista('edit');
  linkMapa(); setTimeout(mapaEditor, 30);
}
function pintarEstados(actual, op, nueva){
  const ep = estadosPermitidos(op), ests = ep.includes(actual) || nueva || !actual ? ep : [actual, ...ep];
  const sel = ests.includes(actual) ? actual : ests[0];
  $('#e-estado').innerHTML = opts(ests.map(k => [k, SIRA.ESTADOS[k]]), sel);
}
$('#e-operacion').addEventListener('change', () => pintarEstados($('#e-estado').value, $('#e-operacion').value, true));
function pintarCampos(){
  const t = $('#e-tipo').value, l = SIRA.CAMPOS[t] || [];
  $$('#e-campos input').forEach(i => ED[i.dataset.k] = i.value);
  $('#e-notipo').hidden = !!t;
  $('#e-campos').innerHTML = l.map(k => `<label class="f"><span>${esc(SIRA.ETIQUETA[k])}</span><input type="number" min="0" step="${k.startsWith('sup')?'any':'1'}" inputmode="${k.startsWith('sup')?'decimal':'numeric'}" data-k="${k}" value="${esc(ED[k] ?? '')}"${SOLO_VER?' disabled':''}></label>`).join('');
}
function prevPrecio(){
  const v = +$('#e-precio').value, m = $('#e-moneda').value, uf = UF.valor || SIRA.UF_RESPALDO;
  $('#e-prev').textContent = !v ? 'Sin precio: en el sitio dirá "Precio a consultar".'
    : 'Se verá como: ' + SIRA.precioTxt({ precio:v, moneda:m }) + (m === 'UF' ? `  (≈ $${SIRA.num(Math.round(v*uf))})` : '');
}
$('#e-tipo').addEventListener('change', pintarCampos);
function linkMapa(){
  const p = { direccion: $('#e-direccion').value.trim(), sector: $('#e-sector').value.trim(), comuna: $('#e-comuna').value.trim(), region: $('#e-region').value };
  const a = $('#e-maplink'); a.hidden = !p.comuna && !PIN;
  a.href = SIRA.mapaLink(PIN ? PIN.lat + ',' + PIN.lng : SIRA.mapaQ(p, true));
}

/* ---------------- pin en el mapa (OpenStreetMap + Leaflet, gratis) ---------------- */
let PIN = null, MAPA = null, MARCA = null, LF = null;
const TEMUCO = [-38.7359, -72.5904];
function cargarLeaflet(){
  if (window.L) return Promise.resolve();
  return LF = LF || new Promise((ok, mal) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'assets/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'assets/leaflet/leaflet.js'; s.onload = ok; s.onerror = () => { LF = null; mal(new Error('No se pudo cargar el mapa.')); }; document.head.appendChild(s);
  });
}
function ponerPin(lat, lng, centrar){
  PIN = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  if (!MAPA) return;
  if (!MARCA){
    MARCA = L.marker([PIN.lat, PIN.lng], { draggable: !SOLO_VER, keyboard: true, title: 'Ubicación de la propiedad' }).addTo(MAPA);
    MARCA.on('dragend', () => { const ll = MARCA.getLatLng(); PIN = { lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 }; SUCIO = true; linkMapa(); $('#e-pinmsg').textContent = 'Pin movido.'; });
  } else MARCA.setLatLng([PIN.lat, PIN.lng]);
  if (centrar) MAPA.setView([PIN.lat, PIN.lng], Math.max(MAPA.getZoom(), 16));
  linkMapa();
}
function quitarPin(){ PIN = null; if (MARCA){ MARCA.remove(); MARCA = null; } linkMapa(); }
async function mapaEditor(){
  try{ await cargarLeaflet(); }catch(e){ $('#e-pinmsg').textContent = e.message; return; }
  if (!MAPA){
    MAPA = L.map('e-mapa', { scrollWheelZoom: false }).setView(TEMUCO, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(MAPA);
    MAPA.on('click', e => { if (SOLO_VER) return; ponerPin(e.latlng.lat, e.latlng.lng); SUCIO = true; $('#e-pinmsg').textContent = 'Pin ubicado.'; });
  }
  MAPA.invalidateSize();
  if (MARCA){ MARCA.remove(); MARCA = null; }
  const p = PIN;
  if (p){ ponerPin(p.lat, p.lng); MAPA.setView([p.lat, p.lng], 16); }
  else MAPA.setView(TEMUCO, 13);
}
/* busca la dirección en OpenStreetMap (gratis; se usa solo al tocar el botón) */
async function buscarEnMapa(){
  const dir = $('#e-direccion').value.trim(), sec = $('#e-sector').value.trim(), com = $('#e-comuna').value.trim(), reg = $('#e-region').value;
  if (!com){ $('#e-pinmsg').textContent = 'Escribe al menos la comuna.'; return; }
  const m = $('#e-pinmsg'); m.textContent = 'Buscando…';
  const intentar = async q => {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&accept-language=es&q=' + encodeURIComponent(q));
    const d = r.ok ? await r.json() : []; return d[0] || null;
  };
  try{
    await mapaEditor();
    let r = dir ? await intentar([dir, com, reg, 'Chile'].filter(Boolean).join(', ')) : null, exacto = !!r;
    if (!r) r = await intentar([sec, com, reg, 'Chile'].filter(Boolean).join(', '));
    if (!r) r = await intentar([com, reg, 'Chile'].filter(Boolean).join(', '));
    if (!r){ m.textContent = 'No encontramos esa ubicación. Toca el mapa donde está la propiedad.'; return; }
    ponerPin(+r.lat, +r.lon, true); SUCIO = true;
    m.textContent = exacto ? 'Ubicada. Revisa que el pin esté en la propiedad y ajústalo si hace falta.' : 'No encontramos la dirección exacta: el pin quedó en el sector. Arrástralo hasta la propiedad.';
  }catch(e){ m.textContent = 'No se pudo buscar ahora (¿sin internet?). Puedes tocar el mapa para poner el pin.'; }
}
$('#e-pinbuscar').addEventListener('click', buscarEnMapa);
$('#e-pinquitar').addEventListener('click', e => { e.preventDefault(); if (SOLO_VER) return; quitarPin(); SUCIO = true; $('#e-pinmsg').textContent = 'Pin quitado.'; });
['e-direccion','e-sector','e-comuna'].forEach(id => $('#'+id).addEventListener('input', linkMapa));
$('#e-region').addEventListener('change', linkMapa);
$('#e-precio').addEventListener('input', prevPrecio);
$('#e-moneda').addEventListener('change', prevPrecio);
$('#f-edit').addEventListener('input', () => SUCIO = true);
$('#f-edit').addEventListener('change', () => SUCIO = true);
addEventListener('beforeunload', e => { if (SUCIO && !$('#v-edit').hidden){ e.preventDefault(); e.returnValue = ''; } });

function filaDet(k = '', v = ''){
  const d = document.createElement('div'); d.className = 'det';
  d.innerHTML = `<input type="text" list="dl-detk" placeholder="Dato (ej: Orientación)" value="${esc(k)}"><input type="text" placeholder="Valor (ej: Norte)" value="${esc(v)}"><button type="button" aria-label="Quitar">&times;</button>`;
  d.querySelector('button').addEventListener('click', () => { d.remove(); SUCIO = true; });
  $('#e-det').appendChild(d);
}
$('#e-adddet').addEventListener('click', () => { filaDet(); $('#e-det').lastChild.querySelector('input').focus(); });

/* fotos */
function pintarFotos(){
  $('#e-fotos').innerHTML = EDF.map((f,i) => `<div class="pi" style="background-image:url('${esc(f.src)}')">${f.nuevo?'<span class="nw">NUEVA</span>':''}
    ${SOLO_VER ? '' : `<div class="pb"><button type="button" data-f="izq" data-i="${i}" aria-label="Mover a la izquierda" title="Mover antes">&#9664;</button>
    <button type="button" data-f="port" data-i="${i}" aria-label="Usar como portada" title="Portada">&#9733;</button>
    <button type="button" data-f="der" data-i="${i}" aria-label="Mover a la derecha" title="Mover después">&#9654;</button>
    <button type="button" data-f="del" data-i="${i}" aria-label="Quitar foto" title="Quitar">&#10005;</button></div>`}</div>`).join('');
}
$('#e-fotos').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (!b || SOLO_VER) return;
  const i = +b.dataset.i, a = b.dataset.f;
  if (a === 'del') EDF.splice(i,1);
  else if (a === 'port') EDF.unshift(EDF.splice(i,1)[0]);
  else { const j = a === 'izq' ? i-1 : i+1; if (j < 0 || j >= EDF.length) return; [EDF[i],EDF[j]] = [EDF[j],EDF[i]]; }
  SUCIO = true; pintarFotos();
});
function comprimir(file, max = 1600, q = 0.82){
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? ok({ blob:b, src:URL.createObjectURL(b) }) : mal(new Error(file.name)), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error(file.name)); };
    img.src = url;
  });
}
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));
async function agregarFotos(files){
  const l = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
  if (!l.length) return;
  const malas = [];
  $('#e-msg').textContent = 'Preparando fotos…';
  for (const f of l){
    try{ const r = await comprimir(f); EDF.push({ ...r, nuevo:true }); pintarFotos(); }
    catch(e){ malas.push(f.name); }
  }
  SUCIO = true; $('#e-msg').textContent = '';
  if (malas.length) toast('No se pudieron leer: ' + malas.join(', ') + '. Si son HEIC del iPhone, súbelas desde el celular o conviértelas a JPG.', true);
}
const dz = $('#dz');
dz.addEventListener('click', () => $('#e-files').click());
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); $('#e-files').click(); } });
$('#e-files').addEventListener('change', e => { agregarFotos(e.target.files); e.target.value = ''; });
['dragenter','dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('on'); }));
['dragleave','drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('on'); }));
dz.addEventListener('drop', e => agregarFotos(e.dataTransfer.files));

/* leer y validar formulario */
function leerForm(){
  $$('#e-campos input').forEach(i => ED[i.dataset.k] = i.value);
  const p = { ...ED };
  ['estado','operacion','tipo','region','moneda'].forEach(k => p[k] = $('#e-'+k).value);
  ['comuna','sector','direccion','titulo'].forEach(k => p[k] = $('#e-'+k).value.trim().replace(/\s+/g,' '));
  p.descripcion = $('#e-descripcion').value.trim();
  p.precio = SIRA.n0($('#e-precio').value); p.gastosComunes = SIRA.n0($('#e-gastosComunes').value);
  p.destacada = $('#e-destacada').checked; p.mapaExacto = $('#e-mapaExacto').checked;
  if (PIN){ p.lat = PIN.lat; p.lng = PIN.lng; } else { delete p.lat; delete p.lng; }
  p.caracteristicas = $('#e-caracteristicas').value.split('\n').map(s => s.trim().replace(/^[-•✓*]\s*/,'')).filter(Boolean);
  p.detalles = $$('#e-det .det').map(d => { const [a,b] = d.querySelectorAll('input'); return [a.value.trim(), b.value.trim()]; }).filter(d => d[0] && d[1]);
  const usa = SIRA.CAMPOS[p.tipo] || [];
  CAMPOS_NUM.forEach(k => { if (usa.includes(k)) p[k] = SIRA.n0(p[k]); else delete p[k]; });
  Object.keys(p).forEach(k => { if (p[k] === '' || p[k] === null || p[k] === undefined) delete p[k]; });
  return p;
}
function validar(p){
  const malos = [];
  const marca = (id, cond) => { const el = $('#e-'+id); el.classList.toggle('err', !cond); if (!cond) malos.push(el); };
  marca('operacion', !!p.operacion); marca('tipo', !!p.tipo); marca('region', !!p.region); marca('comuna', !!p.comuna);
  marca('precio', p.precio == null || p.precio > 0);
  if (p.moneda === 'UF' && p.precio > 100000){ $('#e-precio').classList.add('err'); malos.push($('#e-precio')); toast('¿Seguro que el precio es en UF? ' + SIRA.num(p.precio) + ' UF es muchísimo. Revisa la moneda.', true); }
  if (p.moneda === 'CLP' && p.precio && p.precio < 50000){ $('#e-precio').classList.add('err'); malos.push($('#e-precio')); toast('Ese precio parece estar en UF. Cambia la moneda a UF.', true); }
  if (malos.length){ malos[0].focus(); malos[0].scrollIntoView({ block:'center', behavior:'smooth' }); return false; }
  return true;
}
async function guardar(){
  if (SOLO_VER) return;
  const p = leerForm();
  if (!validar(p)){ $('#e-msg').textContent = 'Revisa los campos marcados en rojo.'; return; }
  if (!EDF.length && SIRA.publica(p) && !confirm('La propiedad no tiene fotos. ¿Publicarla igual?')) return;
  const nueva = !p.id, id = p.id || (ED._idNuevo = ED._idNuevo || uuid());   /* mismo id si se reintenta: no se duplica */
  const original = nueva ? null : porId(id);
  const btn = $('#e-save'); btn.disabled = true;
  overlay(true, 'Guardando…');
  const subidas = [];
  try{
    /* 1. fotos nuevas */
    const nuevas = EDF.filter(f => f.nuevo && !f.path);
    for (let i = 0; i < nuevas.length; i++){
      overlay(true, 'Guardando…', `Subiendo foto ${i+1} de ${nuevas.length}…`);
      const path = id + '/' + rid() + '.jpg';
      const { error } = await sb.storage.from('fotos').upload(path, nuevas[i].blob, { contentType:'image/jpeg', cacheControl:'31536000', upsert:false });
      if (error) throw error;
      nuevas[i].path = path; subidas.push(path);
    }
    p.fotos = EDF.map(f => f.path);
    overlay(true, 'Guardando…', 'Guardando datos…');
    /* 2. datos */
    let res;
    if (nueva){
      const { data: ya } = await sb.from('propiedades').select('id').eq('id', id).maybeSingle();   /* ¿el intento anterior sí alcanzó a guardarse? */
      res = ya ? await sb.from('propiedades').update({ estado: p.estado, datos: aDatos(p) }).eq('id', id).select()
               : await sb.from('propiedades').insert({ id, estado: p.estado, datos: aDatos(p) }).select();
    } else {
      /* si otra persona la cambió mientras la editabas, no se pisa su trabajo */
      res = await sb.from('propiedades').update({ estado: p.estado, datos: aDatos(p) }).eq('id', id).eq('actualizada', ED.actualizada).select();
      if (!res.error && !res.data.length){
        const { data: hoy } = await sb.from('propiedades').select('actualizada').eq('id', id).maybeSingle();
        throw new Error(hoy && hoy.actualizada !== ED.actualizada
          ? 'Otra persona modificó esta propiedad mientras la editabas. Copia tus cambios, toca "Volver" y ábrela de nuevo.'
          : 'permission denied');
      }
    }
    if (res.error) throw res.error;
    const fila = res.data[0];
    /* 3. limpiar fotos quitadas */
    if (original) await borrarFotos((original.fotos||[]).filter(f => !p.fotos.includes(f)), id);
    SUCIO = false;
    const cambioOp = original && original.operacion && original.operacion !== p.operacion;
    toast(`${fila.codigo} guardada. ` + (cambioOp ? `Ahora usa el seguimiento de ${p.operacion.toLowerCase()} (lo marcado en ${original.operacion.toLowerCase()} queda guardado por si vuelves). ` : '') + (SIRA.visible(fila) ? 'Ya se ve en el sitio.' : SIRA.cerrada(fila) ? `Se ve en el sitio con el sello "${SIRA.sello(fila)}".` : fila.estado === 'revision' ? 'Quedó esperando aprobación.' : 'Quedó oculta (Pausada).'));
    vista('list');
    await cargar(true);
  }catch(err){
    /* las fotos recién subidas solo se borran si la propiedad de verdad no quedó guardada */
    let quedo = false;
    try{ const { data } = await sb.from('propiedades').select('id,datos').eq('id', id).maybeSingle(); quedo = !!(data && (data.datos.fotos||[]).some(f => subidas.includes(f))); }catch(e){ quedo = true; }
    if (subidas.length && !quedo) sb.storage.from('fotos').remove(subidas).catch(() => {});
    if (!quedo) EDF.forEach(f => { if (subidas.includes(f.path)) delete f.path; });
    toast(errTxt(err), true); $('#e-msg').textContent = 'No se guardó. Puedes reintentar.';
  }finally{ overlay(false); btn.disabled = false; }
}
$('#e-save').addEventListener('click', guardar);
$('#e-seg').addEventListener('click', () => {
  if (SUCIO && !confirm('Tienes cambios sin guardar en la ficha. ¿Ir al seguimiento igual? (los cambios de la ficha se pierden)')) return;
  SUCIO = false; const p = porId(ED.id); if (p) SEG().abrir(p);
});
function salirEditor(e){ if (e) e.preventDefault(); if (SUCIO && !SOLO_VER && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return; SUCIO = false; pintarLista(); vista('list'); }
$('#e-cancel').addEventListener('click', salirEditor);
$('#e-volver').addEventListener('click', salirEditor);

/* ---------------- lo que comparten los módulos (checklist.js, arriendos.js) ---------------- */
const GANCHOS = { cargar: [], refrescar: [], tab: {}, entrar: [] };
window.PANEL = {
  sb, $, $$, esc, toast, overlay, errTxt, fecha, vista, pestana, cargar, todo, uuid, rid, pintarLista, porId, nombreDe, ROLES,
  yo: () => YO, P, lista: () => LISTA, equipo: () => EQUIPO, uf: () => (UF && UF.valor) || SIRA.UF_RESPALDO, config: () => CONFIG,
  tab: () => TAB, abrirEditor: p => abrirEditor(p), GANCHOS, deFila
};

/* ---------------- arranque (después de cargar los módulos) ---------------- */
let enRecuperacion = /type=recovery/.test(location.hash);
sb.auth.onAuthStateChange((ev, ses) => {
  if (ev === 'PASSWORD_RECOVERY'){ enRecuperacion = true; vista('clave'); }
  /* si la sesión se cae (otro dispositivo cerró sesión, token vencido), no seguir como "visitante" */
  if (ev === 'SIGNED_OUT' && YO && !SALIENDO){
    YO = null; SUCIO = false; modoAuth('entrar'); vista('login'); revisarRegistro();
    toast('Tu sesión se cerró. Vuelve a entrar para seguir.', true);
  }
});
async function arrancar(){
  modoAuth('entrar');
  const { data: { session } } = await sb.auth.getSession();
  if (enRecuperacion){ vista('clave'); return; }
  if (session) await entrar(); else { vista('login'); revisarRegistro(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
