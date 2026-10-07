/* =====================================================================
   Sira Propiedades: administración mensual de arriendos
   contratos, cobros mes a mes, gastos, liquidación al propietario
   y recordatorios. Lo ven: dueño y gerente (todo) y cada corredor (los suyos).
   ===================================================================== */
(() => {
const X = window.PANEL; if (!X) return;
const { $, $$, esc, sb } = X;

let CTR = [], PAG = [], GAS = [];
let ABIERTO = null, NUEVO = null, SUCIO = false, VER_TODOS = false, EDIT_PAGO = null, MES_LIQ = null, VER_TERMINADOS = false;
const yo = () => X.yo();
const puede = () => !!X.P().arriendos;
const puedeBorrar = () => ['dueno','gerente'].includes(yo().rol);

/* ---------------- números y fechas ---------------- */
const $$m = v => '$' + SIRA.num(Math.round(+v || 0));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoy = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const dia = s => X.dia(s);
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const mesTxt = per => { const d = dia(per); return d ? MESES[d.getMonth()] + ' ' + d.getFullYear() : per; };
const mesCorto = per => { const d = dia(per); return d ? MESES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() : per; };
const fTxt = d => d ? d.getDate() + ' de ' + MESES[d.getMonth()] : '';
const diasEntre = (a, b) => Math.round((b - a) / 864e5);
const sumarMeses = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
const plural = (n, s, p) => X.plural(n, s, p);

/* ---------------- reglas del contrato ---------------- */
const D = c => c.datos || {};
const nombre = c => D(c).nombre || 'Contrato sin nombre';
function esperado(c){ const d = D(c); return d.moneda === 'UF' ? Math.round((+d.monto || 0) * X.uf()) : (+d.monto || 0); }
function meses(c){
  const ini = dia(D(c).inicio); if (!ini) return [];
  const fin = dia(D(c).termino), h = hoy();
  let tope = new Date(h.getFullYear(), h.getMonth(), 1);
  if (fin && fin < tope) tope = new Date(fin.getFullYear(), fin.getMonth(), 1);
  const out = [];
  for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= tope; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(iso(d));
  return out;
}
function vence(c, per){
  const d = dia(per), ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const v = new Date(d.getFullYear(), d.getMonth(), Math.min(+D(c).diaPago || 5, ult));
  /* el primer mes no puede vencer antes de que empiece el contrato */
  const ini = dia(D(c).inicio);
  return ini && ini > v ? ini : v;
}
const pagoDe = (c, per) => PAG.find(p => p.contrato_id === c.id && String(p.periodo).slice(0, 10) === per);
function estadoMes(c, per){
  const p = pagoDe(c, per), v = vence(c, per), dd = diasEntre(hoy(), v);
  const esp = p && +p.monto_cobrado > 0 ? +p.monto_cobrado : esperado(c);   /* si ya se registró algo, queda fijo el monto de ese mes (UF del momento) */
  const pagado = p ? +p.monto_pagado : 0;
  if (p && p.estado === 'pagado') return { k:'pagado', p, esp, v, pagado, dias: dd };
  if (dd < 0) return { k:'atrasado', p, esp, v, pagado, dias: -dd, falta: esp - pagado };
  return { k: p ? 'parcial' : 'pendiente', p, esp, v, pagado, dias: dd, falta: esp - pagado };
}
const deudas = c => c.activo ? meses(c).map(per => ({ per, ...estadoMes(c, per) })).filter(s => s.k === 'atrasado') : [];
function proxReajuste(c){
  const d = D(c), m = +d.reajusteMeses; if (!m) return null;
  const base = dia(d.ultimoReajuste) || dia(d.inicio); if (!base) return null;
  return sumarMeses(base, m);
}
function comision(c, cobrado){
  const d = D(c), v = +d.comisionValor || 0;
  if (!cobrado || !v) return 0;
  return d.comisionTipo === 'fijo' ? v : Math.round(cobrado * v / 100);
}
const comisionTxt = c => { const d = D(c); return !+d.comisionValor ? 'sin comisión' : d.comisionTipo === 'fijo' ? $$m(d.comisionValor) + ' fijo al mes' : SIRA.num(+d.comisionValor) + '% del arriendo'; };
const montoTxt = c => { const d = D(c); return d.moneda === 'UF' ? 'UF ' + SIRA.num(+d.monto || 0) + ' (≈ ' + $$m(esperado(c)) + ')' : $$m(d.monto); };

/* qué hay que atender: atrasos, cobros de la semana, términos, reajustes, garantías */
function alertasDe(c){
  const out = [], d = D(c), h = hoy();
  if (!c.activo) return out;
  deudas(c).forEach(s => out.push({ k:'bad', c, per:s.per, s, orden: 0,
    t: `<b>${esc(nombre(c))}</b>: arriendo de ${mesTxt(s.per)} atrasado ${plural(s.dias, 'día')}`,
    sub: `Debe ${$$m(s.falta)}${s.pagado ? ' (abonó ' + $$m(s.pagado) + ')' : ''} · venció el ${fTxt(s.v)} · ${esc(d.arrendatario && d.arrendatario.nombre || 'arrendatario sin nombre')}` }));
  const ms = meses(c), act = ms[ms.length - 1], ini = dia(d.inicio);
  if (ini) [act, iso(new Date(h.getFullYear(), h.getMonth() + 1, 1))].forEach(per => {
    if (!per || (dia(d.termino) && dia(per) > dia(d.termino)) || dia(per) < new Date(ini.getFullYear(), ini.getMonth(), 1)) return;
    const s = estadoMes(c, per);
    if ((s.k === 'pendiente' || s.k === 'parcial') && s.dias <= 7 && !out.some(a => a.per === per))
      out.push({ k:'warn', c, per, s, orden: 1, t: `<b>${esc(nombre(c))}</b>: cobro de ${mesTxt(per)} ${s.dias === 0 ? 'vence hoy' : 'vence en ' + plural(s.dias, 'día')}`, sub: `${$$m(s.falta)} · el ${fTxt(s.v)}` });
  });
  const fin = dia(d.termino);
  if (fin){ const n = diasEntre(h, fin); if (n <= 60) out.push({ k: n < 0 ? 'bad' : 'info', c, orden: 2, t: `<b>${esc(nombre(c))}</b>: el contrato ${n < 0 ? 'terminó hace ' + plural(-n, 'día') : n === 0 ? 'termina hoy' : 'termina en ' + plural(n, 'día')}`, sub: n < 0 ? 'Si se renovó, actualiza la fecha de término; si terminó, desmárcalo como vigente.' : 'Hora de conversar la renovación o buscar nuevo arrendatario.' }); }
  const rj = proxReajuste(c);
  if (rj){ const n = diasEntre(h, rj); if (n <= 30) out.push({ k:'info', c, orden: 3, t: `<b>${esc(nombre(c))}</b>: ${n < 0 ? 'reajuste pendiente desde el ' + fTxt(rj) : 'toca reajuste ' + (n === 0 ? 'hoy' : 'en ' + plural(n, 'día'))}`, sub: `${esc(d.reajusteTipo || 'Reajuste')} cada ${d.reajusteMeses} meses. Cuando lo apliques, cambia el monto y la fecha del último reajuste.` }); }
  if (d.garantiaEstado === 'pendiente' && +d.garantia) out.push({ k:'warn', c, orden: 4, t: `<b>${esc(nombre(c))}</b>: garantía de ${$$m(d.garantia)} sin recibir`, sub: 'Cuando la recibas, márcala como recibida en el contrato.' });
  return out;
}

/* ---------------- WhatsApp ---------------- */
function recordatorio(c, per, s){
  const d = D(c), a = d.arrendatario || {};
  const prop = d.direccion || nombre(c);
  const t = s.k === 'atrasado'
    ? `Hola ${a.nombre || ''}, te saludamos de Sira Propiedades. Te recordamos que el arriendo de ${mesTxt(per)} de ${prop} (${$$m(s.falta || s.esp)}) venció el ${fTxt(s.v)}. Si ya lo pagaste, avísanos para registrarlo. ¡Gracias!`
    : `Hola ${a.nombre || ''}, te saludamos de Sira Propiedades. Te recordamos que el arriendo de ${mesTxt(per)} de ${prop} (${$$m(s.falta || s.esp)}) vence el ${fTxt(s.v)}. ¡Gracias!`;
  return X.wa(a.telefono, t.replace('Hola ,', 'Hola,'));
}

/* ---------------- carga ---------------- */
X.GANCHOS.cargar.push(async () => {
  if (!puede()){ CTR = PAG = GAS = []; return; }
  [CTR, PAG, GAS] = await Promise.all([
    X.todo(() => sb.from('contratos').select('*').order('creada', { ascending:false }).order('id')),
    X.todo(() => sb.from('pagos').select('*').order('contrato_id').order('periodo')),
    X.todo(() => sb.from('gastos').select('*').order('id'))
  ]);
  marcaTab();
  if (X.tab() === 'arr' && !$('#t-arr').hidden) pintarTab();
});
X.GANCHOS.refrescar.push(id => { if (id === 'v-ctr') pintarCtr(); });
X.GANCHOS.tab.arr = () => pintarTab();
function marcaTab(){
  const b = $('#tabs button[data-t=arr]'); if (!b) return;
  const n = CTR.filter(c => deudas(c).length).length;
  b.innerHTML = 'Arriendos' + (n ? `<span class="n" title="Contratos con arriendo atrasado" style="background:var(--bad)">${n}</span>` : '');
}

/* ---------------- pestaña Arriendos ---------------- */
function pintarTab(){
  const sec = $('#t-arr'); if (!sec) return;
  const act = CTR.filter(c => c.activo), h = hoy(), perHoy = iso(new Date(h.getFullYear(), h.getMonth(), 1));
  const al = CTR.flatMap(alertasDe).sort((a, b) => a.orden - b.orden || (a.s && b.s ? a.s.v - b.s.v : 0));
  let porCobrar = 0, atrasado = 0, comMes = 0;
  act.forEach(c => {
    const s = meses(c).includes(perHoy) ? estadoMes(c, perHoy) : null;
    if (s && (s.k === 'pendiente' || s.k === 'parcial')) porCobrar += s.esp - s.pagado;   /* lo atrasado va aparte */
    deudas(c).forEach(x => atrasado += x.falta);
    const p = pagoDe(c, perHoy); if (p) comMes += comision(c, +p.monto_pagado);
  });
  const lista = CTR.filter(c => VER_TERMINADOS || c.activo);
  sec.innerHTML = `<div class="bar" style="justify-content:space-between">
      <div><h1>Arriendos administrados</h1><p class="sub" style="margin:0">Cobros mes a mes, gastos y liquidación al propietario. ${yo().rol === 'corredor' ? 'Ves los contratos que tienes a cargo.' : ''}</p></div>
      <button class="btn" type="button" data-r="nuevo">+ Nuevo contrato</button></div>
    <div class="kpis mt">
      <div class="kpi"><span>Contratos vigentes</span><b>${act.length}</b></div>
      <div class="kpi"><span>Por cobrar (al día)</span><b>${$$m(porCobrar)}</b></div>
      <div class="kpi ${atrasado ? 'bad' : 'ok'}"><span>Atrasado</span><b>${$$m(atrasado)}</b></div>
      <div class="kpi"><span>Comisión cobrada del mes</span><b>${$$m(comMes)}</b></div>
    </div>
    <h2>Esta semana</h2>
    <div class="alertas">${al.length ? al.map(alertaHTML).join('') : `<div class="alerta ok"><div class="t"><b>Todo al día.</b><small>No hay cobros atrasados, ni vencimientos en los próximos 7 días, ni contratos o reajustes por vencer.</small></div></div>`}</div>
    <h2 style="display:flex;justify-content:space-between;align-items:center">Contratos ${CTR.some(c => !c.activo) ? `<label class="chk" style="font-size:13px;letter-spacing:0;text-transform:none;color:var(--mu)"><input type="checkbox" data-r="term"${VER_TERMINADOS ? ' checked' : ''} style="width:16px;height:16px"> Ver terminados</label>` : ''}</h2>
    <div class="ctrs">${lista.length ? lista.map(ctrFila).join('') : `<div class="empty">${CTR.length ? 'No hay contratos vigentes.' : 'Aún no hay arriendos administrados. Toca <b>+ Nuevo contrato</b> para agregar el primero.'}</div>`}</div>`;
}
function alertaHTML(a){
  const s = a.s, w = s && a.c.datos.arrendatario && a.c.datos.arrendatario.telefono ? recordatorio(a.c, a.per, s) : '';
  return `<div class="alerta ${a.k}"><div class="t">${a.t}<small>${a.sub}</small></div><div class="a">
    ${s && s.k !== 'pagado' && a.per ? `<button class="btn ok sm" type="button" data-r="pagar" data-c="${esc(a.c.id)}" data-per="${a.per}">Pagó ${$$m(s.falta || s.esp)}</button>` : ''}
    ${w ? `<a class="btn sec sm" href="${esc(w)}" target="_blank" rel="noopener">Recordar por WhatsApp</a>` : ''}
    <button class="btn sec sm" type="button" data-r="abrir" data-c="${esc(a.c.id)}">Abrir</button></div></div>`;
}
function ctrFila(c){
  const d = D(c), ms = meses(c), act = ms[ms.length - 1], s = act ? estadoMes(c, act) : null, dd = deudas(c);
  const k = !c.activo ? 'off' : dd.length ? 'bad' : s && s.k === 'pagado' ? 'ok' : 'warn';
  const tags = [];
  if (!c.activo) tags.push('<span class="tag">Terminado</span>');
  else if (!s) tags.push(`<span class="tag">Parte el ${fTxt(dia(d.inicio))}</span>`);
  else if (s.k === 'pagado') tags.push(`<span class="tag ok">${mesCorto(act)}: pagado</span>`);
  else if (s.k === 'atrasado') tags.push(`<span class="tag bad">${mesCorto(act)}: atrasado ${plural(s.dias, 'día')}</span>`);
  else tags.push(`<span class="tag warn">${mesCorto(act)}: vence el ${fTxt(s.v)}</span>`);
  if (c.activo && (dd.length > 1 || (dd.length === 1 && dd[0].per !== act))) tags.push(`<span class="tag bad">${plural(dd.length, 'mes', 'meses')} con deuda · ${$$m(dd.reduce((n, x) => n + x.falta, 0))}</span>`);
  const enc = c.encargado ? (c.encargado === yo().id ? 'tú' : X.nombreDe(c.encargado)) : '';
  return `<div class="ctr ${k}"><div>
      <div class="ti">${esc(nombre(c))}</div>
      <div class="me">${esc(d.arrendatario && d.arrendatario.nombre || 'Sin arrendatario')} · ${montoTxt(c)} · cobra el día ${esc(d.diaPago || 5)}${enc === 'tú' ? ' · a tu cargo' : enc ? ' · a cargo de ' + esc(enc) : ''}</div>
      <div class="es">${tags.join('')}</div></div>
    <div><button class="btn sm" type="button" data-r="abrir" data-c="${esc(c.id)}">Abrir</button></div></div>`;
}
$('#t-arr').addEventListener('click', e => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  const a = b.dataset.r, c = CTR.find(x => x.id === b.dataset.c);
  if (a === 'nuevo') abrir(null, {});
  else if (a === 'abrir' && c) abrir(c);
  else if (a === 'pagar' && c) pagar(c, b.dataset.per, esperado(c) - (pagoDe(c, b.dataset.per) ? +pagoDe(c, b.dataset.per).monto_pagado : 0), true);
});
$('#t-arr').addEventListener('change', e => { if (e.target.closest('[data-r=term]')){ VER_TERMINADOS = e.target.checked; pintarTab(); } });

/* ---------------- contrato ---------------- */
function abrir(c, pre){
  ABIERTO = c ? c.id : null; NUEVO = c ? null : (pre || {}); SUCIO = false; VER_TODOS = false; EDIT_PAGO = null; MES_LIQ = null;
  pintarCtr(); X.vista('ctr');
}
function nuevoDesde(p, priv){
  const pv = priv || {};
  abrir(null, { propiedad_id: p.id, datos: { nombre: SIRA.titulo(p).replace(/^Se arrienda /, ''), direccion: p.direccion || '', comuna: p.comuna || '',
    monto: p.precio || '', moneda: p.moneda || 'CLP', diaPago: 5, comisionTipo: 'porcentaje', garantiaEstado: 'pendiente',
    propietario: { nombre: pv.propietario || '', telefono: pv.telefono || '', correo: pv.correo || '' } } });
  X.toast('Revisa los datos, completa el arrendatario y las fechas, y guarda.');
}
const actual = () => ABIERTO ? CTR.find(c => c.id === ABIERTO) : null;
const campo = (k, lbl, tipo, extra = '') => `<label class="f"><span>${lbl}</span><input type="${tipo || 'text'}" data-k="${k}" ${extra}></label>`;
const sel = (k, lbl, l) => `<label class="f"><span>${lbl}</span><select data-k="${k}">${l.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;
function pintarCtr(){
  const c = actual();
  if (ABIERTO && !c){ X.vista('list'); X.pestana('arr'); return; }
  const base = c || { activo: true, encargado: yo().id, ...NUEVO, datos: { diaPago: 5, moneda: 'CLP', comisionTipo: 'porcentaje', garantiaEstado: 'pendiente', ...((NUEVO && NUEVO.datos) || {}) } };
  const props = X.lista().filter(p => p.operacion === 'Arriendo' || p.id === base.propiedad_id);
  const eq = X.equipo().filter(u => u.activo && ['dueno','gerente','corredor'].includes(u.rol));
  const encs = eq.length ? eq.map(u => [u.id, (u.nombre || u.email) + (u.id === yo().id ? ' (tú)' : '')]) : [[yo().id, (yo().nombre || yo().email) + ' (tú)']];
  if (base.encargado && !encs.some(x => x[0] === base.encargado)) encs.push([base.encargado, X.nombreDe(base.encargado) || 'Otra persona']);
  const v = $('#v-ctr');
  v.innerHTML = `<a href="#" data-r="volver" style="color:var(--mu);text-decoration:none" class="noprint">&larr; Volver a Arriendos</a>
    <h1 style="margin-top:10px">${c ? esc(nombre(c)) : 'Nuevo contrato de administración'}</h1>
    <p class="sub">${c ? `${montoTxt(c)} · cobra el día ${esc(D(c).diaPago || 5)} · comisión: ${esc(comisionTxt(c))}` : 'Completa los datos y guarda. Después podrás registrar los pagos de cada mes.'}</p>
    ${c ? `<div class="alertas">${alertasDe(c).map(alertaHTML).join('').replace(/<button class="btn sec sm" type="button" data-r="abrir"[^>]*>Abrir<\/button>/g, '')}</div>` : ''}
    ${c ? pagosHTML(c) + gastosHTML(c) + liqHTML(c) : ''}
    <form id="f-ctr" novalidate class="noprint">
      <section class="box"><h2>Contrato</h2>
        <div class="g2 r1">${campo('nombre', 'Nombre para reconocerlo', 'text', 'maxlength="90" placeholder="ej: Casa Los Pinos 123"')}
          ${sel('propiedad_id', 'Propiedad del stock <i>(opcional)</i>', [['', '— No está publicada en el sitio —'], ...props.map(p => [p.id, p.codigo + ' · ' + SIRA.titulo(p)])])}</div>
        <div class="g2 r1 mt">${campo('direccion', 'Dirección', 'text', 'maxlength="150"')}${campo('comuna', 'Comuna', 'text', 'maxlength="60" list="dl-comunas"')}</div>
        <div class="g4 mt">${campo('inicio', 'Inicio del contrato', 'date')}${campo('termino', 'Término <i>(opcional)</i>', 'date')}
          ${campo('monto', 'Arriendo mensual', 'number', 'min="0" step="any" inputmode="decimal"')}${sel('moneda', 'Moneda', [['CLP', 'Pesos ($)'], ['UF', 'UF']])}</div>
        <div class="g4 mt">${campo('diaPago', 'Día de pago', 'number', 'min="1" max="31" inputmode="numeric"')}
          ${sel('encargado', 'A cargo de', encs)}
          <label class="chk cw" style="align-self:end;padding-bottom:12px"><input type="checkbox" data-k="activo"> Contrato vigente</label></div>
        <p class="hint">Los cobros se cuentan desde el mes de inicio hasta el de término (o hasta hoy). Si el arriendo está en UF, el monto en pesos se calcula con la UF guardada en el panel.</p>
      </section>
      <section class="box"><h2>Personas</h2>
        <div class="g4">${campo('propietario.nombre', 'Propietario', 'text', 'maxlength="120"')}${campo('propietario.telefono', 'Teléfono', 'tel', 'maxlength="30" placeholder="9 1234 5678"')}
          ${campo('propietario.correo', 'Correo', 'email', 'maxlength="120"')}${campo('propietario.cuenta', 'Cuenta para transferirle', 'text', 'maxlength="160" placeholder="Banco, tipo y n° de cuenta"')}</div>
        <div class="g3 mt">${campo('arrendatario.nombre', 'Arrendatario', 'text', 'maxlength="120"')}${campo('arrendatario.telefono', 'Teléfono', 'tel', 'maxlength="30"')}${campo('arrendatario.correo', 'Correo', 'email', 'maxlength="120"')}</div>
        <div class="g3 mt">${campo('aval.nombre', 'Aval o codeudor <i>(opcional)</i>', 'text', 'maxlength="120"')}${campo('aval.telefono', 'Teléfono del aval', 'tel', 'maxlength="30"')}</div>
      </section>
      <section class="box"><h2>Garantía, comisión y reajuste</h2>
        <div class="g4">${campo('garantia', 'Garantía ($)', 'number', 'min="0" inputmode="numeric"')}
          ${sel('garantiaEstado', 'Estado de la garantía', [['pendiente', 'Por recibir'], ['recibida', 'Recibida'], ['devuelta', 'Devuelta'], ['descontada', 'Usada en descuentos']])}
          ${sel('comisionTipo', 'Comisión de Sira', [['porcentaje', 'Porcentaje del arriendo'], ['fijo', 'Monto fijo mensual']])}
          ${campo('comisionValor', 'Valor <i id="com-u">(%)</i>', 'number', 'min="0" step="any" inputmode="decimal"')}</div>
        <div class="g3 mt">${sel('reajusteMeses', 'Reajuste', [['', 'No se reajusta'], ['3', 'Cada 3 meses'], ['6', 'Cada 6 meses'], ['12', 'Cada 12 meses']])}
          ${sel('reajusteTipo', 'Según', [['IPC', 'IPC'], ['UF', 'UF'], ['Monto acordado', 'Monto acordado']])}
          ${campo('ultimoReajuste', 'Último reajuste <i>(si ya hubo)</i>', 'date')}</div>
        <label class="f mt"><span>Notas</span><textarea data-k="notas" maxlength="3000" rows="3" style="min-height:80px" placeholder="Condiciones especiales, mascotas, inventario, llaves…"></textarea></label>
      </section>
      ${c && puedeBorrar() ? '<div class="bar"><button class="btn dan sm" type="button" data-r="borrar">Eliminar contrato</button><span class="hint" style="margin:0">Si solo terminó, mejor desmarca "Contrato vigente": así queda el historial de pagos.</span></div>' : ''}
    </form>
    <div class="foot noprint" id="c-foot"${c ? ' hidden' : ''}><div class="in"><div class="msg" id="c-msg" role="status"></div>
      <button class="btn sec" type="button" data-r="volver">Volver</button>
      <button class="btn" type="button" data-r="guardar">${c ? 'Guardar cambios' : 'Guardar contrato'}</button></div></div>`;
  /* rellenar */
  const d = base.datos || {};
  $$('#f-ctr [data-k]').forEach(i => {
    const k = i.dataset.k;
    const val = k === 'activo' ? base.activo : k === 'propiedad_id' ? base.propiedad_id : k === 'encargado' ? base.encargado : k.split('.').reduce((o, x) => o && o[x], d);
    if (i.type === 'checkbox') i.checked = val !== false; else i.value = val ?? '';
  });
  if (yo().rol === 'corredor') $('#f-ctr [data-k=encargado]').disabled = true;
  unidadCom();
}
function unidadCom(){ const t = $('#f-ctr [data-k=comisionTipo]'); if (t) $('#com-u').textContent = t.value === 'fijo' ? '($ al mes)' : '(% del arriendo)'; }

/* pagos mes a mes */
function pagosHTML(c){
  const ms = meses(c).slice().reverse();
  if (!ms.length) return `<section class="box"><h2>Pagos</h2><p class="hint" style="margin:0">${D(c).inicio ? 'El primer cobro es en ' + mesTxt(iso(new Date(dia(D(c).inicio).getFullYear(), dia(D(c).inicio).getMonth(), 1))) + '.' : 'Pon la fecha de inicio del contrato para ver los cobros.'}</p></section>`;
  /* en la vista corta: todo lo que no está pagado + los últimos 3 pagados */
  let pagados = 0;
  const ver = VER_TODOS ? ms : ms.filter(per => estadoMes(c, per).k !== 'pagado' || ++pagados <= 3);
  const ocultos = ms.length - ver.length;
  const tel = D(c).arrendatario && D(c).arrendatario.telefono;
  return `<section class="box"><h2>Pagos mes a mes</h2>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Mes</th><th>Vence</th><th class="num">Arriendo</th><th class="num">Pagado</th><th>Estado</th><th></th></tr></thead><tbody>
    ${ver.map(per => {
      const s = estadoMes(c, per), p = s.p;
      const tag = s.k === 'pagado' ? `<span class="tag ok">Pagado${p.fecha_pago ? ' el ' + fTxt(dia(p.fecha_pago)) : ''}</span>`
        : s.k === 'atrasado' ? `<span class="tag bad">${p ? 'Abono · ' : ''}Atrasado ${plural(s.dias, 'día')}</span>`
        : s.k === 'parcial' ? '<span class="tag warn">Abono parcial</span>' : `<span class="tag">${s.dias === 0 ? 'Vence hoy' : 'Vence en ' + plural(s.dias, 'día')}</span>`;
      if (EDIT_PAGO === per) return `<tr><td>${mesTxt(per)}</td><td colspan="5"><form class="inl" data-pago="${per}">
          <input type="number" min="0" step="any" name="monto" value="${esc(p ? p.monto_pagado : s.esp)}" aria-label="Monto pagado" style="width:130px!important">
          <input type="date" name="fecha" value="${esc(p && p.fecha_pago || iso(hoy()))}" aria-label="Fecha de pago">
          <input type="text" name="nota" maxlength="200" value="${esc(p && p.nota || '')}" placeholder="Nota (ej: transferencia)" style="flex:1;min-width:140px">
          <button class="btn ok sm" type="submit">Guardar</button><button class="btn sec sm" type="button" data-r="pago-no">Cancelar</button></form></td></tr>`;
      const w = tel && s.k !== 'pagado' ? recordatorio(c, per, s) : '';
      return `<tr class="${s.k === 'atrasado' ? 'bad' : s.k === 'pagado' ? 'ok' : ''}"><td><b>${mesTxt(per)}</b>${p && p.nota ? `<br><span class="mu">${esc(p.nota)}</span>` : ''}</td><td class="mu" data-l="Vence">${fTxt(s.v)}</td>
        <td class="num" data-l="Cobro">${$$m(s.esp)}</td><td class="num" data-l="Pagado">${p ? $$m(p.monto_pagado) : '—'}</td><td>${tag}</td>
        <td><div class="acts">${s.k !== 'pagado' ? `<button class="btn ok sm" type="button" data-r="pagar" data-per="${per}">Pagado</button>` : ''}
          <button class="btn sec sm" type="button" data-r="pago-ed" data-per="${per}">${p ? 'Editar' : 'Otro monto'}</button>
          ${w ? `<a class="btn sec sm" href="${esc(w)}" target="_blank" rel="noopener" title="Recordar por WhatsApp">WhatsApp</a>` : ''}
          ${p ? `<button class="btn dan sm" type="button" data-r="pago-del" data-per="${per}" title="Anular el pago registrado">Anular</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody></table></div>
    ${ocultos || VER_TODOS ? `<button class="btn sec sm mt" type="button" data-r="todos">${VER_TODOS ? 'Ver menos' : 'Ver meses anteriores (' + ocultos + ')'}</button>` : ''}
    ${D(c).moneda === 'UF' ? `<p class="hint">Montos en pesos calculados con UF ${SIRA.num(X.uf())}.</p>` : ''}
  </section>`;
}
/* gastos del mes (reparaciones, gastos comunes, cuentas) */
function gastosHTML(c){
  const ms = meses(c), h = hoy(), sig = iso(new Date(h.getFullYear(), h.getMonth() + 1, 1));
  const opts = [...new Set([...ms.slice().reverse(), ...(D(c).inicio ? [sig] : [])])];
  const gs = GAS.filter(g => g.contrato_id === c.id).sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
  const CARGO = { propietario: 'Lo paga el propietario (se descuenta)', arrendatario: 'Lo paga el arrendatario (se le cobra)', sira: 'Lo asume Sira' };
  return `<section class="box"><h2>Gastos</h2>
    ${gs.length ? `<div style="overflow-x:auto;margin-bottom:14px"><table class="tbl"><thead><tr><th>Mes</th><th>Concepto</th><th class="num">Monto</th><th>A cargo de</th><th></th></tr></thead><tbody>
      ${gs.map(g => `<tr><td>${mesCorto(String(g.periodo).slice(0, 10))}</td><td>${esc(g.concepto)}</td><td class="num">${$$m(g.monto)}</td><td class="mu">${esc(CARGO[g.cargo] || g.cargo)}</td>
        <td><div class="acts"><button class="btn dan sm" type="button" data-r="gasto-del" data-g="${esc(g.id)}">Quitar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint" style="margin:0 0 12px">Sin gastos registrados.</p>'}
    ${opts.length ? `<form class="gs" id="f-gasto"><label class="f"><span>Mes</span><select name="periodo">${opts.map(p => `<option value="${p}">${mesCorto(p)}</option>`).join('')}</select></label>
      <label class="f"><span>Concepto</span><input type="text" name="concepto" maxlength="200" placeholder="ej: gasfíter"></label>
      <label class="f"><span>Monto ($)</span><input type="number" name="monto" min="0" step="any" inputmode="numeric"></label>
      <label class="f"><span>Lo paga</span><select name="cargo">${Object.entries(CARGO).map(([k, t]) => `<option value="${k}">${esc(t.replace(/ \(.*/, '').replace(/^Lo paga el |^Lo asume /, ''))}</option>`).join('')}</select></label>
      <button class="btn sec sm" type="submit" style="align-self:end">+ Agregar gasto</button></form>` : ''}
  </section>`;
}
/* liquidación al propietario */
function liquidacion(c, per){
  const p = pagoDe(c, per), cobrado = p ? +p.monto_pagado : 0, com = comision(c, cobrado);
  const gs = GAS.filter(g => g.contrato_id === c.id && String(g.periodo).slice(0, 10) === per);
  const gp = gs.filter(g => g.cargo === 'propietario'), ga = gs.filter(g => g.cargo === 'arrendatario');
  const sum = l => l.reduce((n, g) => n + (+g.monto || 0), 0);
  return { p, cobrado, com, gp, ga, total: cobrado - com - sum(gp), cobrarArr: sum(ga) };
}
function liqHTML(c){
  const ms = meses(c); if (!ms.length) return '';
  if (!MES_LIQ || !ms.includes(MES_LIQ)) MES_LIQ = ms.filter(per => pagoDe(c, per)).pop() || ms[ms.length - 1];
  const L = liquidacion(c, MES_LIQ), d = D(c);
  return `<section class="box"><h2>Liquidación al propietario</h2>
    <div class="bar"><select id="liq-mes" style="width:auto" aria-label="Mes">${ms.slice().reverse().map(p => `<option value="${p}"${p === MES_LIQ ? ' selected' : ''}>${mesTxt(p)}</option>`).join('')}</select></div>
    <div class="liq">
      <div><span>Arriendo recibido${L.p && L.p.fecha_pago ? ' <span class="mu">(' + fTxt(dia(L.p.fecha_pago)) + ')</span>' : ''}</span><b>${$$m(L.cobrado)}</b></div>
      <div><span>Comisión Sira <span class="mu">(${esc(comisionTxt(c))})</span></span><span>− ${$$m(L.com)}</span></div>
      ${L.gp.map(g => `<div><span>${esc(g.concepto)}</span><span>− ${$$m(g.monto)}</span></div>`).join('')}
      <div class="tot"><span>A transferir</span><span>${$$m(L.total)}</span></div>
      ${L.cobrarArr ? `<div class="sub2"><span>Además, cobrar al arrendatario: ${L.ga.map(g => esc(g.concepto)).join(', ')}</span><span>${$$m(L.cobrarArr)}</span></div>` : ''}
      ${!L.p ? '<div class="sub2"><span>Este mes todavía no tiene pago registrado.</span></div>' : ''}
      ${d.propietario && d.propietario.cuenta ? `<div class="sub2"><span>Cuenta del propietario: ${esc(d.propietario.cuenta)}</span></div>` : ''}
    </div>
    <div class="bar mt noprint" style="margin-bottom:0"><button class="btn sec sm" type="button" data-r="liq-copiar">Copiar resumen</button>
      ${d.propietario && d.propietario.telefono ? `<a class="btn sec sm" href="${esc(X.wa(d.propietario.telefono, liqTexto(c, MES_LIQ)))}" target="_blank" rel="noopener">Enviar al propietario por WhatsApp</a>` : ''}
      <button class="btn sec sm" type="button" data-r="imprimir">Imprimir</button></div>
  </section>`;
}
function liqTexto(c, per){
  const L = liquidacion(c, per), d = D(c);
  return [`Liquidación ${mesTxt(per)} · ${nombre(c)}`, '',
    `Arriendo recibido: ${$$m(L.cobrado)}`,
    `Comisión Sira (${comisionTxt(c)}): -${$$m(L.com)}`,
    ...L.gp.map(g => `${g.concepto}: -${$$m(g.monto)}`),
    `Total a transferir: ${$$m(L.total)}`, '',
    `Sira Propiedades`].join('\n').replace(/^/, d.propietario && d.propietario.nombre ? `Hola ${d.propietario.nombre}, aquí va el resumen del mes.\n\n` : '');
}

/* ---------------- acciones ---------------- */
async function pagar(c, per, monto, completo, fecha, nota){
  const previo = pagoDe(c, per), esp = previo && +previo.monto_cobrado > 0 ? +previo.monto_cobrado : esperado(c);
  const fila = { contrato_id: c.id, periodo: per, monto_pagado: Math.max(0, Math.round(+monto || 0)), monto_cobrado: esp, fecha_pago: fecha || iso(hoy()), nota: nota || null };
  const antes = previo ? { ...previo } : null;
  if (completo && previo) fila.monto_pagado = esp;
  fila.estado = fila.monto_pagado >= esp ? 'pagado' : 'parcial';
  if (!fila.monto_pagado){ X.toast('Escribe cuánto pagó.', true); return; }
  X.overlay(true, 'Registrando pago…');
  try{
    const { data, error } = await sb.from('pagos').upsert(fila, { onConflict: 'contrato_id,periodo' }).select();
    if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
    PAG = PAG.filter(p => !(p.contrato_id === c.id && String(p.periodo).slice(0, 10) === per)).concat(data);
    EDIT_PAGO = null;
    X.toast(`${nombre(c)}: ${mesTxt(per)} ${fila.estado === 'pagado' ? 'pagado' : 'con abono de ' + $$m(fila.monto_pagado)}.`, false,
      { texto: 'Deshacer', fn: () => deshacerPago(c, per, antes) });
  }catch(err){ X.toast(X.errTxt(err), true); }
  finally{ X.overlay(false); marcaTab(); repintar(); }
}
/* vuelve el mes a como estaba antes del último registro */
async function deshacerPago(c, per, antes){
  X.overlay(true, 'Deshaciendo…');
  try{
    const r = antes
      ? await sb.from('pagos').upsert({ contrato_id: c.id, periodo: per, monto_pagado: antes.monto_pagado, monto_cobrado: antes.monto_cobrado ?? null, fecha_pago: antes.fecha_pago, estado: antes.estado, nota: antes.nota }, { onConflict: 'contrato_id,periodo' }).select()
      : await sb.from('pagos').delete().eq('contrato_id', c.id).eq('periodo', per).select();
    if (r.error) throw r.error;
    PAG = PAG.filter(p => !(p.contrato_id === c.id && String(p.periodo).slice(0, 10) === per)).concat(antes ? r.data : []);
    X.toast('Listo, quedó como estaba.');
  }catch(err){ X.toast(X.errTxt(err), true); }
  finally{ X.overlay(false); marcaTab(); repintar(); }
}
function repintar(){ if (!$('#v-ctr').hidden) pintarCtr(); else if (!$('#t-arr').hidden) pintarTab(); }
function leerCtr(){
  const datos = {}, out = { datos };
  $$('#f-ctr [data-k]').forEach(i => {
    const k = i.dataset.k;
    let v = i.type === 'checkbox' ? i.checked : i.value.trim();
    if (k === 'activo'){ out.activo = v; return; }
    if (k === 'propiedad_id'){ out.propiedad_id = v || null; return; }
    if (k === 'encargado'){ out.encargado = v || yo().id; return; }
    if (['monto','diaPago','garantia','comisionValor'].includes(k)) v = v === '' ? '' : +v;
    if (v === '' || v == null) return;
    const ps = k.split('.'); let o = datos;
    while (ps.length > 1){ const x = ps.shift(); o = o[x] = o[x] || {}; }
    o[ps[0]] = v;
  });
  return out;
}
async function guardarCtr(){
  const f = leerCtr(), d = f.datos, c = actual(), malos = [];
  const marca = (k, ok) => { const el = $(`#f-ctr [data-k="${k}"]`); el.classList.toggle('err', !ok); if (!ok) malos.push(el); };
  const anioOk = v => !v || (+String(v).slice(0, 4) >= 2000 && +String(v).slice(0, 4) <= 2100);
  marca('nombre', !!d.nombre); marca('inicio', !!d.inicio && anioOk(d.inicio)); if (!anioOk(d.termino)) marca('termino', false); if (!anioOk(d.ultimoReajuste)) marca('ultimoReajuste', false); marca('monto', d.monto > 0); marca('diaPago', d.diaPago >= 1 && d.diaPago <= 31 && Number.isInteger(d.diaPago));
  if (d.termino && d.inicio && d.termino < d.inicio) marca('termino', false);
  if (d.moneda === 'CLP' && d.monto && d.monto < 10000){ marca('monto', false); X.toast('Ese monto parece estar en UF. Cambia la moneda a UF.', true); }
  if (d.comisionTipo === 'porcentaje' && d.comisionValor > 100){ marca('comisionValor', false); X.toast('La comisión en porcentaje no puede ser mayor a 100%.', true); }
  if (malos.length){ $('#c-msg').textContent = 'Revisa los campos marcados en rojo.'; malos[0].focus(); malos[0].scrollIntoView({ block:'center', behavior:'smooth' }); return; }
  if (yo().rol === 'corredor') f.encargado = yo().id;
  X.overlay(true, 'Guardando contrato…');
  try{
    const q = c ? sb.from('contratos').update(f).eq('id', c.id).eq('actualizada', c.actualizada).select() : sb.from('contratos').insert({ id: X.uuid(), ...f }).select();
    const { data, error } = await q;
    if (error) throw error;
    if (!data || !data.length){
      if (c){ const { data: hoyC } = await sb.from('contratos').select('actualizada').eq('id', c.id).maybeSingle();
        if (hoyC && hoyC.actualizada !== c.actualizada) throw new Error('Otra persona modificó este contrato mientras lo editabas. Copia tus cambios, toca "Volver" y ábrelo de nuevo.'); }
      throw new Error('permission denied');
    }
    CTR = CTR.filter(x => x.id !== data[0].id); CTR.unshift(data[0]);
    ABIERTO = data[0].id; NUEVO = null; SUCIO = false;
    X.toast(c ? 'Contrato guardado.' : 'Contrato creado. Ya puedes registrar los pagos de cada mes.');
  }catch(err){ X.toast(X.errTxt(err), true); }
  finally{ X.overlay(false); marcaTab(); pintarCtr(); }
}
function volver(e){
  if (e) e.preventDefault();
  if (SUCIO && !confirm('Tienes cambios sin guardar en el contrato. ¿Salir igual?')) return;
  SUCIO = false; X.vista('list'); X.pestana('arr');
}
const conCambios = () => { SUCIO = true; const ft = $('#c-foot'); if (ft) ft.hidden = false; };
$('#v-ctr').addEventListener('input', e => { if (e.target.closest('#f-ctr')) conCambios(); });
$('#v-ctr').addEventListener('change', e => {
  if (e.target.closest('#f-ctr')){ conCambios(); if (e.target.dataset.k === 'comisionTipo') unidadCom();
    if (e.target.dataset.k === 'propiedad_id' && e.target.value){ const p = X.porId(e.target.value), f = $('#f-ctr');
      const pon = (k, v) => { const i = f.querySelector(`[data-k="${k}"]`); if (i && !i.value && v) i.value = v; };
      pon('nombre', SIRA.titulo(p).replace(/^Se arrienda /, '')); pon('direccion', p.direccion); pon('comuna', p.comuna); pon('monto', p.precio);
      const pv = X.seg && X.seg.privado(p.id); if (pv && pv.datos){ pon('propietario.nombre', pv.datos.propietario); pon('propietario.telefono', pv.datos.telefono); pon('propietario.correo', pv.datos.correo); } } }
  if (e.target.id === 'liq-mes'){ MES_LIQ = e.target.value; pintarCtr(); }
});
$('#v-ctr').addEventListener('click', async e => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  const a = b.dataset.r, c = actual(), per = b.dataset.per;
  if (a === 'volver') return volver(e);
  if (a === 'guardar') return guardarCtr();
  if (!c) return;
  if (a === 'pagar'){ const p = pagoDe(c, per); return pagar(c, per, esperado(c), true, p && p.fecha_pago, p && p.nota); }
  if (a === 'pago-ed'){ EDIT_PAGO = per; pintarCtr(); const i = $(`#v-ctr form[data-pago="${per}"] input`); if (i){ i.focus(); i.select(); } return; }
  if (a === 'pago-no'){ EDIT_PAGO = null; return pintarCtr(); }
  if (a === 'todos'){ VER_TODOS = !VER_TODOS; return pintarCtr(); }
  if (a === 'imprimir') return print();
  if (a === 'liq-copiar'){
    const t = liqTexto(c, MES_LIQ);
    try{ await navigator.clipboard.writeText(t); X.toast('Resumen copiado. Pégalo en un correo o mensaje.'); }
    catch(err){ X.toast('No se pudo copiar automáticamente. Usa "Imprimir" o el botón de WhatsApp.', true); }
    return;
  }
  if (a === 'pago-del'){
    if (!confirm(`¿Anular el pago registrado de ${mesTxt(per)}?`)) return;
    X.overlay(true, 'Anulando…');
    try{
      const { data, error } = await sb.from('pagos').delete().eq('contrato_id', c.id).eq('periodo', per).select();
      if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
      PAG = PAG.filter(p => !(p.contrato_id === c.id && String(p.periodo).slice(0, 10) === per)); X.toast('Pago anulado.');
    }catch(err){ X.toast(X.errTxt(err), true); }
    finally{ X.overlay(false); marcaTab(); pintarCtr(); }
    return;
  }
  if (a === 'gasto-del'){
    X.overlay(true, 'Quitando gasto…');
    try{
      const { data, error } = await sb.from('gastos').delete().eq('id', b.dataset.g).select();
      if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
      GAS = GAS.filter(g => g.id !== b.dataset.g);
    }catch(err){ X.toast(X.errTxt(err), true); }
    finally{ X.overlay(false); pintarCtr(); }
    return;
  }
  if (a === 'borrar'){
    if (!confirm(`¿Eliminar el contrato "${nombre(c)}" con todos sus pagos y gastos? Esto no se puede deshacer.`)) return;
    X.overlay(true, 'Eliminando…');
    try{
      const { data, error } = await sb.from('contratos').delete().eq('id', c.id).select();
      if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
      CTR = CTR.filter(x => x.id !== c.id); PAG = PAG.filter(p => p.contrato_id !== c.id); GAS = GAS.filter(g => g.contrato_id !== c.id);
      SUCIO = false; X.toast('Contrato eliminado.'); X.vista('list'); X.pestana('arr');
    }catch(err){ X.toast(X.errTxt(err), true); }
    finally{ X.overlay(false); marcaTab(); }
  }
});
$('#v-ctr').addEventListener('submit', async e => {
  e.preventDefault();
  const c = actual(); if (!c) return;
  const fp = e.target.closest('form[data-pago]');
  if (fp){ const fd = new FormData(fp); return pagar(c, fp.dataset.pago, fd.get('monto'), false, fd.get('fecha'), String(fd.get('nota') || '').trim()); }
  if (e.target.id === 'f-gasto'){
    const fd = new FormData(e.target), concepto = String(fd.get('concepto') || '').trim(), monto = +fd.get('monto');
    if (!concepto || !(monto > 0)){ X.toast('Escribe el concepto y el monto del gasto.', true); return; }
    X.overlay(true, 'Agregando gasto…');
    try{
      const { data, error } = await sb.from('gastos').insert({ id: X.uuid(), contrato_id: c.id, periodo: fd.get('periodo'), concepto, monto: Math.round(monto), cargo: fd.get('cargo') }).select();
      if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
      GAS = GAS.concat(data); MES_LIQ = String(data[0].periodo).slice(0, 10);
    }catch(err){ X.toast(X.errTxt(err), true); }
    finally{ X.overlay(false); pintarCtr(); }
  }
});

X.arr = { nuevoDesde: (p, pv) => { X.pestana('arr'); nuevoDesde(p, pv); } };
})();
