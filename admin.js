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
  dueno:     { crear:1, editarTodo:1, publicar:1, aprobar:1, borrarTodo:1, equipo:'editar', historial:1, uf:1 },
  gerente:   { crear:1, editarTodo:1, publicar:1, aprobar:1, borrarTodo:0, equipo:'ver',    historial:1, uf:1 },
  corredor:  { crear:1, editarTodo:0, publicar:1, aprobar:0, borrarTodo:0, equipo:0,        historial:0, uf:0 },
  asistente: { crear:1, editarTodo:0, publicar:0, aprobar:0, borrarTodo:0, equipo:0,        historial:0, uf:0 },
  lectura:   { crear:0, editarTodo:0, publicar:0, aprobar:0, borrarTodo:0, equipo:0,        historial:0, uf:0 }
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
const puedeBorrar = p => !!(P().borrarTodo || (['corredor','asistente'].includes(YO.rol) && esMia(p) && BORRADOR.includes(p.estado)));
/* una propiedad en arriendo no puede quedar "Vendida" ni una en venta "Arrendada" */
const encaja = (k, op) => !(op === 'Arriendo' && k === 'vendida') && !(op === 'Venta' && k === 'arrendada');
const estadosPermitidos = op => (P().publicar ? Object.keys(SIRA.ESTADOS) : BORRADOR).filter(k => encaja(k, op));

/* ---------------- interfaz general ---------------- */
function vista(v){
  ['setup','login','clave','espera','list','edit'].forEach(k => $('#v-'+k).hidden = k !== v);
  $('#hdr-r').hidden = !['list','edit','espera'].includes(v);
  scrollTo(0,0);
}
let toastT;
function toast(t, mala){
  let el = $('.toast'); if (!el){ el = document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el); }
  el.textContent = t; el.classList.toggle('bad', !!mala); el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, mala ? 7000 : 4500);
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
let MODO = 'entrar';
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
  $('#a-sw').innerHTML = (m !== 'entrar' ? '<a data-m="entrar">Ya tengo cuenta</a>' : '<a data-m="crear">Crear cuenta</a>') + (m !== 'olvide' ? '<a data-m="olvide">Olvidé mi clave</a>' : '');
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
  SUCIO = false; await sb.auth.signOut(); YO = null; modoAuth('entrar'); vista('login');
});
$('#b-reint').addEventListener('click', () => entrar());

async function entrar(){
  const { data: { user } } = await sb.auth.getUser();
  if (!user){ modoAuth('entrar'); vista('login'); return; }
  const { data: perfil, error } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
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
  pestana('prop');
  await cargar();
}

/* ---------------- datos ---------------- */
let LISTA = [], UF = { valor: SIRA.UF_RESPALDO, fecha: null }, EQUIPO = [];
const nombreDe = id => { const x = EQUIPO.find(e => e.id === id); return x ? (x.nombre || x.email) : ''; };
const META = ['id','codigo','estado','creada','creada_por','actualizada','actualizada_por'];
function deFila(f){ return { ...(f.datos||{}), id:f.id, codigo:f.codigo, estado:f.estado, creada:f.creada, creada_por:f.creada_por, actualizada:f.actualizada }; }
function aDatos(p){ const d = { ...p }; META.forEach(k => delete d[k]); return d; }

async function cargar(silencioso){
  if (!silencioso) overlay(true, 'Cargando propiedades…');
  try{
    const [rp, rc, re] = await Promise.all([
      sb.from('propiedades').select('*').order('creada', { ascending:false }),
      sb.from('config').select('valor').eq('clave','uf').maybeSingle(),
      P().equipo ? sb.from('perfiles').select('*').order('creado') : Promise.resolve({ data: [] })
    ]);
    if (rp.error) throw rp.error;
    LISTA = rp.data.map(deFila);
    if (rc.data && rc.data.valor) UF = rc.data.valor;
    EQUIPO = re.data || [];
    pintarLista(); if ($('#v-edit').hidden) vista('list');
  }catch(err){ toast(errTxt(err), true); vista('list'); }
  finally{ overlay(false); }
}
$('#b-recargar').addEventListener('click', () => cargar());

/* ---------------- pestañas ---------------- */
function pestana(t){
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  ['prop','equipo','hist'].forEach(k => $('#t-'+k).hidden = k !== t);
  if (t === 'equipo') pintarEquipo();
  if (t === 'hist') cargarHistorial();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) pestana(b.dataset.t); });

/* ---------------- lista de propiedades ---------------- */
let FILTRO_EST = '';
function pintarLista(){
  const ps = LISTA, cuenta = k => ps.filter(p => p.estado === k).length;
  const rev = cuenta('revision');
  $('#tabs button[data-t=prop]').innerHTML = 'Propiedades' + (rev && P().aprobar ? `<span class="n" title="Esperando aprobación">${rev}</span>` : '');
  $('#stats').innerHTML = `<button type="button" class="st${FILTRO_EST?'':' on'}" data-e=""><b>${ps.length}</b> Todas</button>` +
    Object.entries(SIRA.ESTADOS).map(([k,l]) => `<button type="button" class="st${FILTRO_EST===k?' on':''}" data-e="${k}"><b>${cuenta(k)}</b> ${esc(l.replace(' (oculta)',''))}</button>`).join('');
  $('#uf').value = UF.valor || SIRA.UF_RESPALDO;
  $('#uf-f').textContent = UF.fecha ? 'Actualizada: ' + UF.fecha : '';
  const q = $('#q').value.trim().toLowerCase(), op = $('#q-op').value;
  const l = ps.filter(p => (!FILTRO_EST || p.estado === FILTRO_EST) && (!op || p.operacion === op) &&
      (!q || [p.codigo, SIRA.titulo(p), p.comuna, p.sector, p.tipo, p.direccion].join(' ').toLowerCase().includes(q)));
  const est = p => {
    const ok = puedeEditar(p), ep = estadosPermitidos(p.operacion), lista = ep.includes(p.estado) ? ep : [p.estado, ...ep];
    return `<select data-a="estado" data-id="${esc(p.id)}" aria-label="Estado"${ok?'':' disabled'}>${lista.map(k => `<option value="${k}"${p.estado===k?' selected':''}>${esc(SIRA.ESTADOS[k])}</option>`).join('')}</select>`;
  };
  $('#rows').innerHTML = l.length ? l.map(p => {
    const f = (p.fotos||[])[0], ed = puedeEditar(p);
    const por = P().equipo && p.creada_por ? ` · <span class="por">por ${esc(nombreDe(p.creada_por) || '—')}</span>` : (esMia(p) ? ' · <span class="por">tuya</span>' : '');
    return `<div class="row${SIRA.publica(p)?'':' oc'}" data-cod="${esc(p.codigo)}">
      <div class="th" style="${f?`background-image:url('${esc(SIRA.fotoURL(f))}')`:''}">${f?'':'<svg fill="#c95d2a"><use href="#key"/></svg>'}</div>
      <div><div class="ti"><span class="pill">${esc(p.operacion||'')}</span>${p.estado==='revision'?'<span class="pill rev">En revisión</span>':''}${p.destacada?'<span class="pill d">★ Destacada</span>':''}${esc(SIRA.titulo(p))}</div>
        <div class="me">${esc(p.codigo)} · ${esc(SIRA.precioTxt(p))} · ${esc([p.sector,p.comuna].filter(Boolean).join(', '))} · ${(p.fotos||[]).length} foto(s)${por}</div></div>
      <div class="ac">${est(p)}
        ${p.estado==='revision' && P().aprobar ? `<button class="btn ok sm" type="button" data-a="aprobar" data-id="${esc(p.id)}">Aprobar y publicar</button>` : ''}
        <button class="btn ${ed?'':'sec '}sm" type="button" data-a="editar" data-id="${esc(p.id)}">${ed?'Editar':'Ver ficha'}</button>
        ${SIRA.publica(p)?`<a class="btn sec sm" href="index.html#propiedad/${encodeURIComponent(p.codigo)}" target="_blank" rel="noopener">Ver en sitio</a>`:''}
        ${P().crear?`<button class="btn sec sm" type="button" data-a="duplicar" data-id="${esc(p.id)}">Duplicar</button>`:''}
        ${puedeBorrar(p)?`<button class="btn dan sm" type="button" data-a="borrar" data-id="${esc(p.id)}">Eliminar</button>`:''}</div>
    </div>`;
  }).join('') : `<div class="empty">${ps.length ? 'No hay propiedades con ese filtro.' : (P().crear ? 'Aún no hay propiedades. Toca <b>+ Nueva propiedad</b> para publicar la primera.' : 'Aún no hay propiedades.')}</div>`;
}
$('#stats').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (!b) return; FILTRO_EST = b.dataset.e; pintarLista(); });
$('#q').addEventListener('input', pintarLista);
$('#q-op').addEventListener('change', pintarLista);
const porId = id => LISTA.find(p => p.id === id);

/* fotos que ya no usa ninguna otra propiedad (las duplicadas comparten archivos) */
async function borrarFotos(paths, salvoId){
  const usadas = new Set(LISTA.filter(p => p.id !== salvoId).flatMap(p => p.fotos||[]));
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
    const { data, error } = await sb.from('config').update({ valor: { valor: v, fecha: new Date().toISOString().slice(0,10) }, actualizada: new Date().toISOString() }).eq('clave','uf').select();
    if (error) throw error; if (!data.length) throw new Error('permission denied');
    UF = data[0].valor; toast('UF guardada.');
  }catch(err){ toast(errTxt(err), true); }
  finally{ overlay(false); pintarLista(); }
});

/* ---------------- equipo ---------------- */
function pintarEquipo(){
  const edita = P().equipo === 'editar';
  $('#eq-rows').innerHTML = EQUIPO.map(u => {
    const yo = u.id === YO.id, dis = !edita || yo ? ' disabled' : '';
    return `<tr><td><b>${esc(u.nombre || '(sin nombre)')}</b>${yo?' <span class="mu">(tú)</span>':''}<br><span class="mu">${esc(u.email||'')}</span></td>
      <td><select data-u="${esc(u.id)}" data-c="rol" aria-label="Perfil"${dis}>${Object.entries(ROLES).map(([k,t]) => `<option value="${k}"${u.rol===k?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><label class="chk"><input type="checkbox" data-u="${esc(u.id)}" data-c="activo"${u.activo?' checked':''}${dis}> ${u.activo?'Activo':'Desactivado'}</label></td>
      <td class="mu">${esc(fecha(u.creado))}</td></tr>`;
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
  vista('edit');
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
  const a = $('#e-maplink'); a.hidden = !p.comuna;
  a.href = SIRA.mapaLink(SIRA.mapaQ(p, true));
  a.firstChild.textContent = (p.direccion ? 'Comprobar la dirección en Google Maps ' : 'Comprobar el sector en Google Maps ');
}
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
  const nueva = !p.id, id = p.id || uuid();
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
      res = await sb.from('propiedades').insert({ id, estado: p.estado, datos: aDatos(p) }).select();
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
    toast(`${fila.codigo} guardada. ` + (SIRA.visible(fila) ? 'Ya se ve en el sitio.' : SIRA.cerrada(fila) ? `Se ve en el sitio con el sello "${SIRA.sello(fila)}".` : fila.estado === 'revision' ? 'Quedó esperando aprobación.' : 'Quedó oculta (Pausada).'));
    vista('list');
    await cargar(true);
  }catch(err){
    if (subidas.length) sb.storage.from('fotos').remove(subidas).catch(() => {});
    EDF.forEach(f => { if (subidas.includes(f.path)) delete f.path; });
    toast(errTxt(err), true); $('#e-msg').textContent = 'No se guardó. Puedes reintentar.';
  }finally{ overlay(false); btn.disabled = false; }
}
$('#e-save').addEventListener('click', guardar);
function salirEditor(e){ if (e) e.preventDefault(); if (SUCIO && !SOLO_VER && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return; SUCIO = false; pintarLista(); vista('list'); }
$('#e-cancel').addEventListener('click', salirEditor);
$('#e-volver').addEventListener('click', salirEditor);

/* ---------------- arranque ---------------- */
let enRecuperacion = /type=recovery/.test(location.hash);
sb.auth.onAuthStateChange(ev => {
  if (ev === 'PASSWORD_RECOVERY'){ enRecuperacion = true; vista('clave'); }
});
(async () => {
  modoAuth('entrar');
  const { data: { session } } = await sb.auth.getSession();
  if (enRecuperacion){ vista('clave'); return; }
  if (session) await entrar(); else vista('login');
})();
})();
