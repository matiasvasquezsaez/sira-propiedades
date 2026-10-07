/* =====================================================================
   Sira Propiedades: seguimiento del proceso de cada propiedad
   - checklist por etapas (venta o arriendo, según la operación)
   - propiedades dormidas y mandatos por vencer
   - datos privados del propietario
   - plantillas de los procesos (pestaña "Procesos")
   Todo esto es interno: el sitio público nunca lo lee.
   ===================================================================== */
(() => {
const X = window.PANEL; if (!X) return;
const { $, $$, esc, sb } = X;

/* ---------------- procesos base (recreados desde el flujograma de Miro) ---------------- */
const BASE = {
  venta: [
    { id:'cap', titulo:'Captación', corto:'Captación', color:'#c95d2a', pasos:[
      { id:'v-cap-1', t:'Buscar propietario que quiera vender su propiedad' },
      { id:'v-cap-2', t:'Evaluar la propiedad', d:'Estado general, m² totales y construidos, ubicación y valor de mercado (barrio, tipología, m²).' },
      { id:'v-cap-3', t:'Presentar propuesta de corretaje', d:'Valor de venta sugerido, servicios incluidos y comisión.' },
      { id:'v-cap-4', t:'Firmar la orden de venta', d:'Entre vendedor y corredor.', tr:1 },
      { id:'v-cap-5', t:'Sacar fotos y poner el letrero', d:'Acordar términos y el momento de pago de la comisión.' } ] },
    { id:'leg', titulo:'Revisión estado legal', corto:'Papeles', color:'#3f7d4e', pasos:[
      { id:'v-leg-1', t:'Pedir los documentos al propietario', d:'Certificado de dominio vigente, de hipotecas y gravámenes, avalúo fiscal y los demás que correspondan.' },
      { id:'v-leg-2', t:'Revisar los documentos y aconsejar', d:'Tanto de la fachada como de aspectos legales, si hace falta.' },
      { id:'v-leg-3', t:'Hacer la ficha de propiedad', tr:1 },
      { id:'v-leg-4', t:'Publicar en distintos portales', d:'Sitio web, redes sociales y portales inmobiliarios.' } ] },
    { id:'vis', titulo:'Atención de prospectos', corto:'Visitas', color:'#8f5c12', pasos:[
      { id:'v-vis-1', t:'Preparar la orden de visita', d:'Con espacios para que la completen los interesados.' },
      { id:'v-vis-2', t:'En cada visita: orden de visita y cuaderno firmados', d:'Nombre, RUT, fecha y firma de cada visitante. Tener a mano: copia de la orden de venta, órdenes de visita, ficha de la propiedad y órdenes de oferta.' },
      { id:'v-vis-3', t:'Presentar la propiedad', d:'El pitch: destacar sus puntos fuertes, la ubicación y el entorno.' } ] },
    { id:'ofe', titulo:'Carta oferta y aceptación', corto:'Oferta', color:'#2b6777', pasos:[
      { id:'v-ofe-1', t:'Recibir la orden de oferta del interesado', d:'Con plazo de la oferta.', tr:1 },
      { id:'v-ofe-2', t:'El vendedor acepta y firma la orden de aceptación', d:'Suele ir al reverso de la oferta. Después se coordina la promesa ante notaría.', tr:1 } ] },
    { id:'pro', titulo:'Promesa de compraventa', corto:'Promesa', color:'#6b4c9a', pasos:[
      { id:'v-pro-1', t:'Firmar la promesa de compraventa ante notario', d:'Con abogado. Debe decir que el corredor presta servicios y cobra comisión. Incluye plazo, entrega, cuándo se paga la comisión, multas (10 a 15%), condiciones suspensivas y forma de pago.', tr:1 },
      { id:'v-pro-2', t:'Dejar las instrucciones notariales', d:'Vale vistas en custodia del notario, que se liberan al firmar la escritura. Los gastos de notaría se pagan mitad y mitad.' } ] },
    { id:'esc', titulo:'Escritura', corto:'Escritura', color:'#7a4e2d', pasos:[
      { id:'v-esc-1', t:'Estudio de títulos y tasación', d:'Lo hace el abogado o el banco. Avisar a las partes cómo va el trámite y si piden más documentos.' },
      { id:'v-esc-2', t:'Firmar la escritura en notaría', tr:1 },
      { id:'v-esc-3', t:'Inscripción en el Conservador de Bienes Raíces' },
      { id:'v-esc-4', t:'Liberar las instrucciones notariales y cobrar la comisión' } ] }
  ],
  arriendo: [
    { id:'cap', titulo:'Captación y evaluación', corto:'Captación', color:'#c95d2a', pasos:[
      { id:'a-cap-1', t:'Buscar propiedad y propietario interesado en arrendar' },
      { id:'a-cap-2', t:'Evaluar la propiedad', d:'Estado real, valor de mercado, condiciones, ubicación y tipología.' },
      { id:'a-cap-3', t:'Presentar propuesta de corretaje', d:'Oferta de servicio, plazos, honorarios y condiciones del arriendo.' },
      { id:'a-cap-4', t:'Pedir la documentación', d:'Certificado de dominio vigente.' } ] },
    { id:'man', titulo:'Contrato firmado y detalles', corto:'Mandato', color:'#3f7d4e', pasos:[
      { id:'a-man-1', t:'Revisar viabilidad, acordar con el arrendador y redactar el mandato de arriendo' },
      { id:'a-man-2', t:'Firmar el mandato y la orden de arriendo', tr:1 } ] },
    { id:'sel', titulo:'Selección y revisión', corto:'Selección', color:'#8f5c12', pasos:[
      { id:'a-sel-1', t:'Completar el listado de preguntas para el arrendatario' },
      { id:'a-sel-2', t:'Completar la ficha de propiedad' },
      { id:'a-sel-3', t:'Publicar en distintos portales', d:'Sitio web, redes sociales y portales inmobiliarios.' },
      { id:'a-sel-4', t:'Filtrar arrendatarios según los requisitos del propietario' } ] },
    { id:'cie', titulo:'Cierre y firma', corto:'Cierre', color:'#6b4c9a', pasos:[
      { id:'a-cie-1', t:'Preparar las órdenes de visita' },
      { id:'a-cie-2', t:'Agendar días y horas de visita con posibles arrendatarios' },
      { id:'a-cie-3', t:'Asegurar la firma de la orden de visita y el cierre del trato', tr:1 },
      { id:'a-cie-4', t:'Informar al arrendador, verificar la vigencia del dominio y coordinar la notaría' },
      { id:'a-cie-5', t:'Redactar el contrato de arrendamiento' },
      { id:'a-cie-6', t:'Firma ante notaría', d:'Depósito o transferencia del mes de garantía, el mes de arriendo y las comisiones.', tr:1 } ] }
  ]
};
const COLORES = ['#c95d2a','#3f7d4e','#8f5c12','#2b6777','#6b4c9a','#7a4e2d','#1c1410','#b3261e'];
const DIAS_DORMIDA = 30, DIAS_MANDATO = 30;
const SITIO = 'index.html';   /* la página pública (en la demo es otra) */
const PORTALES_BASE = [{ nombre:'Instagram', url:'https://www.instagram.com/sira_propiedades/' }, { nombre:'Facebook', url:'https://www.facebook.com/profile.php?id=61574322721504' }, { nombre:'Mercado Libre', url:'https://inmuebles.mercadolibre.cl/' }];
const urlSegura = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '#';   /* nunca "javascript:" */
const urlFicha = p => new URL(SITIO, location.href).href.replace(/[?#].*$/, '') + '#propiedad/' + encodeURIComponent(p.codigo);
const copia = o => JSON.parse(JSON.stringify(o));

/* ---------------- estado ---------------- */
let MARCAS = {};   /* propiedad -> { venta: { paso: fila }, arriendo: {...} } */
let PRIV = {};     /* propiedad -> { datos, actualizada } */
let ABIERTA = null, NOTA_EN = null;
const plantillas = () => { const c = X.config().plantillas; return c && c.venta && c.arriendo ? c : BASE; };
const opDe = p => p && p.operacion === 'Venta' ? 'venta' : p && p.operacion === 'Arriendo' ? 'arriendo' : null;
const yo = () => X.yo();
const puedeMarcar = () => !!X.P().seguir;
const puedePriv = p => ['dueno','gerente'].includes(yo().rol) || (yo().rol === 'corredor' && p.creada_por === yo().id);

/* fechas */
const hoy0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const dia = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2]-1, +m[3]) : null; };
const ts = iso => { const d = new Date(String(iso || '').replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00')); return isNaN(d) ? null : d; };
const DIA_MS = 864e5;
const diasDesde = d => Math.round((hoy0() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DIA_MS);   /* round: el cambio de hora no descuadra */
const fCorta = d => d ? d.toLocaleDateString('es-CL', { day:'numeric', month:'short', year:'numeric' }) : '';
const plural = (n, s, p) => n + ' ' + (n === 1 ? s : (p || s + 's'));

/* WhatsApp: acepta 9 1234 5678, +56 9…, 56 9… */
function wa(tel, texto){
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 8) d = '569' + d; else if (d.length === 9 && d[0] === '9') d = '56' + d;
  return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/* ---------------- cálculo ---------------- */
function etapasDe(pid, op){
  const m = (MARCAS[pid] || {})[op] || {};
  const et = copia(plantillas()[op] || []);
  const ids = new Set(et.map(e => e.id));
  et.forEach(e => e.pasos.forEach(s => { const f = m[s.id]; s.estado = f ? f.estado : 'pendiente'; s.f = f || null; }));
  /* pasos propios de esta propiedad */
  Object.values(m).filter(f => f.texto).sort((a, b) => String(a.paso).localeCompare(String(b.paso))).forEach(f => {
    const e = et.find(x => x.id === f.etapa) || et[et.length - 1]; if (!e) return;
    e.pasos.push({ id: f.paso, t: f.texto, propio: 1, estado: f.estado, f });
  });
  return et;
}
function frase(pct, he){
  if (!he) return 'Sin empezar';
  if (pct >= 100) return '¡Proceso completo!';
  if (pct >= 75) return 'Recta final';
  if (pct >= 50) return 'A mitad de camino';
  if (pct >= 25) return 'En marcha';
  return 'Arrancando';
}
function etiquetaEtapa(e){
  if (!e.tot) return e.corto + ': no aplica';
  if (e.he === e.tot) return e.corto + ' listo';
  return e.corto + ' al ' + Math.round(e.he * 100 / e.tot) + '%';
}
function resumen(p){
  const op = opDe(p); if (!op) return null;
  const et = etapasDe(p.id, op);
  let tot = 0, he = 0, na = 0, iVa = -1;
  et.forEach((e, i) => {
    e.tot = 0; e.he = 0;
    e.pasos.forEach((s, j) => { if (s.estado !== 'na') e.tot++; else na++; if (s.estado === 'hecho'){ e.he++; iVa = i; e.ult = j; } });
    tot += e.tot; he += e.he;
  });
  /* lo que quedó sin hacer en etapas (o pasos) que ya pasaron */
  const atras = [];
  et.forEach((e, i) => e.pasos.forEach((s, j) => {
    if (s.estado === 'pendiente' && (i < iVa || (i === iVa && j < e.ult))){ s.atras = 1; atras.push(s); }
  }));
  const pct = tot ? Math.round(he * 100 / tot) : 0;
  const va = iVa >= 0 ? et[iVa] : null;
  return { op, etapas: et, tot, he, na, pct, va, atras, frase: frase(pct, he), etiqueta: va ? etiquetaEtapa(va) : '' };
}
function ultimoMov(p){
  let t = ts(p.actualizada) || ts(p.creada) || new Date();
  const m = MARCAS[p.id] || {};
  Object.values(m).forEach(o => Object.values(o).forEach(f => { const x = ts(f.actualizada); if (x && x > t) t = x; }));
  const pv = PRIV[p.id]; if (pv){ const x = ts(pv.actualizada); if (x && x > t) t = x; }
  return t;
}
function dormida(p){
  if (SIRA.cerrada(p)) return 0;
  const d = diasDesde(ultimoMov(p));
  return d >= DIAS_DORMIDA ? d : 0;
}
function mandato(p){
  const pv = PRIV[p.id], v = pv && pv.datos && dia(pv.datos.mandatoVence);
  if (!v) return null;
  const dias = -diasDesde(v);
  const nom = p.operacion === 'Venta' ? 'Orden de venta' : 'Mandato';
  const txt = dias < 0 ? `${nom} vencido hace ${plural(-dias, 'día')}` : dias === 0 ? `${nom} vence hoy` : `${nom} vence en ${plural(dias, 'día')}`;
  return { dias, txt, alerta: !SIRA.cerrada(p) && dias <= DIAS_MANDATO, vencido: dias < 0 };
}

/* chip que va en cada fila de la lista */
function chip(p){
  const r = resumen(p), dz = dormida(p), md = mandato(p);
  const tags = [];
  if (r && r.atras.length) tags.push(`<span class="tag warn" title="${esc(r.atras.map(s => s.t).join(' · '))}">${r.atras.length === 1 ? 'Saltado: ' + esc(r.atras[0].t) : plural(r.atras.length, 'paso saltado', 'pasos saltados')}</span>`);
  if (dz) tags.push(`<span class="tag zz" title="Sin movimientos (ni en la ficha ni en el seguimiento)">Dormida · ${dz} días</span>` +
    (puedeMarcar() && SIRA.visible(p) ? `<button type="button" class="tag tagb" data-refrescar="${esc(p.id)}" title="Marca que la volviste a publicar: deja de estar dormida">La volví a publicar</button>` : ''));
  if (md && md.alerta) tags.push(`<span class="tag ${md.vencido ? 'bad' : 'warn'}">${esc(md.txt)}</span>`);
  if (!r) return tags.length ? `<div class="sg">${tags.join('')}</div>` : '';
  return `<div class="sg" data-seg="${esc(p.id)}" title="Abrir seguimiento">
    <span class="bar"><i class="${r.pct >= 100 ? 'full' : ''}" style="width:${r.pct}%"></i></span>
    <span class="n">${r.he} de ${r.tot} · ${r.pct}%</span>
    <span class="fr">${esc(r.va ? r.etiqueta : r.frase)}</span>${tags.join('')}</div>`;
}

/* ---------------- "La volví a publicar" ---------------- */
/* se guarda como un paso especial del seguimiento ("refresco"): cuenta como movimiento */
function refresco(p){
  const m = MARCAS[p.id] || {};
  return ['venta','arriendo'].map(o => m[o] && m[o].refresco).filter(Boolean).sort((a, b) => (ts(b.actualizada) || 0) - (ts(a.actualizada) || 0))[0] || null;
}
async function refrescar(p){
  const op = opDe(p) || 'venta';
  const fila = { propiedad_id: p.id, operacion: op, paso: 'refresco', estado: 'hecho', texto: null, etapa: null, nota: null };
  X.overlay(true, 'Guardando…');
  try{
    const { data, error } = await sb.from('checklist').upsert(fila, { onConflict: 'propiedad_id,operacion,paso' }).select();
    if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
    ((MARCAS[p.id] = MARCAS[p.id] || {})[op] = MARCAS[p.id][op] || {}).refresco = data[0];
    X.toast(`${p.codigo} refrescada: ya no está dormida.`);
  }catch(err){ X.toast(X.errTxt(err), true); }
  finally{ X.overlay(false); X.pintarLista(); if (ABIERTA === p.id && !$('#v-seg').hidden) pintar(p); }
}
$('#rows').addEventListener('click', e => {
  const b = e.target.closest('[data-refrescar]'); if (!b) return;
  e.stopPropagation(); const p = X.porId(b.dataset.refrescar); if (p) refrescar(p);
}, true);

/* ---------------- texto para publicar y QR del letrero ---------------- */
function textoPublicar(p){
  const v = k => SIRA.n0(p[k]), u = k => SIRA.usa(p, k);
  const op = p.operacion === 'Venta' ? 'SE VENDE' : 'SE ARRIENDA';
  const datos = [];
  if (u('dormitorios') && v('dormitorios') != null) datos.push(plural(v('dormitorios'), 'dormitorio'));
  if (u('banos') && v('banos') != null) datos.push(plural(v('banos'), 'baño'));
  if (u('estacionamientos') && v('estacionamientos') != null) datos.push(plural(v('estacionamientos'), 'estacionamiento'));
  const sup = [];
  if (u('supUtil') && v('supUtil')) sup.push(SIRA.m2(v('supUtil')) + ' útiles');
  if (u('supConstruida') && v('supConstruida')) sup.push(SIRA.m2(v('supConstruida')) + ' construidos');
  if (u('supTerreno') && v('supTerreno')) sup.push(SIRA.m2(v('supTerreno')) + ' de terreno');
  const precio = SIRA.precioTxt(p) + (p.precio && p.operacion === 'Arriendo' ? ' mensuales' : '') + (p.gastosComunes ? ' + gastos comunes ' + '$' + SIRA.num(p.gastosComunes) : '');
  const desc = String(p.descripcion || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).slice(0, 2).join('\n\n');
  const wa = String(SIRA.WA).replace(/^56(\d)(\d{4})(\d{4})$/, '+56 $1 $2 $3');
  return [
    `${op} · ${p.tipo || 'Propiedad'} en ${[p.sector, p.comuna].filter(Boolean).join(', ')}`,
    precio, '',
    datos.length ? '• ' + datos.join(' · ') : '', sup.length ? '• ' + sup.join(' · ') : '',
    desc ? '\n' + desc : '',
    (p.caracteristicas || []).length ? '\nLo que destaca:\n' + p.caracteristicas.map(c => '✓ ' + c).join('\n') : '',
    '', `Código ${p.codigo}`,
    SIRA.publica(p) ? `Más fotos y detalles: ${urlFicha(p)}` : '',
    `Escríbenos por WhatsApp: ${wa}`, 'Sira Propiedades'
  ].filter((x, i, l) => x !== '' || (l[i - 1] !== '' && i > 0)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function modal(html){
  const m = document.createElement('div'); m.className = 'md'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="mdb"><button type="button" class="mdx" aria-label="Cerrar">&times;</button>${html}</div>`;
  const cerrar = () => { m.remove(); removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') cerrar(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('.mdx')) cerrar(); });
  addEventListener('keydown', esc_);
  document.body.appendChild(m); return m;
}
function abrirTexto(p){
  const m = modal(`<h2>Texto para publicar</h2><p class="hint" style="margin:-6px 0 12px">Para Instagram, Facebook, Mercado Libre o donde quieras. Puedes editarlo antes de copiar.</p>
    <textarea rows="16" style="min-height:300px;font-size:14.5px" aria-label="Texto para publicar">${esc(textoPublicar(p))}</textarea>
    <div class="bar mt" style="margin-bottom:0"><button class="btn" type="button" data-m="copiar">Copiar texto</button><span class="hint" style="margin:0" data-m="st"></span></div>`);
  const ta = m.querySelector('textarea');
  m.querySelector('[data-m=copiar]').addEventListener('click', async () => {
    const st = m.querySelector('[data-m=st]');
    try{ await navigator.clipboard.writeText(ta.value); st.textContent = 'Copiado. Pégalo en la publicación.'; }
    catch(e){ ta.focus(); ta.select(); st.textContent = 'Quedó seleccionado: cópialo con Ctrl+C (o mantén presionado en el celular).'; }
  });
}
let QR_LIB = null;
function cargarQR(){
  if (window.qrcode) return Promise.resolve();
  return QR_LIB = QR_LIB || new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'assets/js/qrcode.js'; s.onload = ok; s.onerror = () => { QR_LIB = null; mal(new Error('No se pudo cargar el generador de QR. Revisa tu conexión.')); }; document.head.appendChild(s); });
}
async function abrirQR(p){
  try{ await cargarQR(); }catch(e){ return X.toast(e.message, true); }
  const url = urlFicha(p), q = qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), W = 1200, H = 1500, celda = Math.floor(980 / (n + 8)), lado = celda * (n + 8), x0 = (W - lado) / 2, y0 = 230;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1c1410'; g.fillRect(0, 0, W, 170);
  g.fillStyle = '#c95d2a'; g.fillRect(0, 170, W, 12);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 64px "DM Sans", Arial, sans-serif';
  g.fillText(p.operacion === 'Venta' ? 'SE VENDE' : 'SE ARRIENDA', W / 2, 112);
  g.fillStyle = '#1c1410';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(x0 + (k + 4) * celda, y0 + (r + 4) * celda, celda, celda);
  g.font = '700 54px "DM Sans", Arial, sans-serif'; g.fillText('Escanéame para ver fotos y precio', W / 2, y0 + lado + 70);
  g.fillStyle = '#c95d2a'; g.font = '700 46px "DM Sans", Arial, sans-serif'; g.fillText(p.codigo + ' · Sira Propiedades', W / 2, y0 + lado + 145);
  g.fillStyle = '#6b6b6b'; g.font = '400 36px "DM Sans", Arial, sans-serif'; g.fillText('WhatsApp ' + String(SIRA.WA).replace(/^56(\d)(\d{4})(\d{4})$/, '+56 $1 $2 $3'), W / 2, y0 + lado + 205);
  const png = c.toDataURL('image/png');
  modal(`<h2>QR para el letrero</h2><p class="hint" style="margin:-6px 0 12px">Lleva directo a la ficha de ${esc(p.codigo)} en el sitio. ${SIRA.publica(p) ? '' : '<b>Ojo:</b> esta propiedad todavía no está publicada; el QR funcionará cuando lo esté.'}</p>
    <img src="${png}" alt="Código QR de ${esc(p.codigo)}" style="display:block;width:100%;max-width:360px;margin:0 auto;border:1px solid var(--ln)">
    <div class="bar mt" style="margin-bottom:0;justify-content:center"><a class="btn" href="${png}" download="QR-${esc(p.codigo)}.png">Descargar imagen</a></div>
    <p class="hint" style="text-align:center">Imprímelo de al menos 10 cm de ancho para que se lea bien desde la vereda.</p>`);
}

/* ---------------- carga ---------------- */
X.GANCHOS.cargar.push(async () => {
  MARCAS = {}; PRIV = {};
  const [ck, pv] = await Promise.all([
    X.todo(() => sb.from('checklist').select('*').order('propiedad_id').order('operacion').order('paso')),
    X.todo(() => sb.from('privados').select('*').order('propiedad_id'))
  ]);
  ck.forEach(f => { ((MARCAS[f.propiedad_id] = MARCAS[f.propiedad_id] || {})[f.operacion] = MARCAS[f.propiedad_id][f.operacion] || {})[f.paso] = f; });
  pv.forEach(f => PRIV[f.propiedad_id] = f);
});
X.GANCHOS.refrescar.push(id => {
  if (id === 'v-seg' && ABIERTA){ const p = X.porId(ABIERTA); if (p) pintar(p); else X.vista('list'); }
});
X.GANCHOS.tab.proc = () => pintarProc();

/* ---------------- vista de seguimiento ---------------- */
function abrir(p){ ABIERTA = p.id; NOTA_EN = null; pintar(p); X.vista('seg'); }
function quien(f){
  if (!f || !f.actualizada) return '';
  const n = f.actualizada_por === yo().id ? 'ti' : X.nombreDe(f.actualizada_por);
  const t = ts(f.actualizada);
  return (n ? 'por ' + n + ' · ' : '') + (t ? t.toLocaleDateString('es-CL', { day:'numeric', month:'short' }) : '');
}
function pasoHTML(s, op, ro){
  const f = s.f, est = s.estado;
  const lbl = est === 'hecho' ? 'Hecho' : est === 'na' ? 'No aplica' : 'Pendiente';
  return `<li class="paso ${est}${s.atras ? ' atras' : ''}" data-paso="${esc(s.id)}">
    <button type="button" class="ck" data-a="ck" ${ro ? 'disabled' : ''} aria-pressed="${est === 'hecho'}" aria-label="${esc(s.t)}: ${lbl}" title="${ro ? lbl : est === 'hecho' ? 'Marcar como pendiente' : 'Marcar como hecho'}">${est === 'hecho' ? '&#10003;' : est === 'na' ? '&ndash;' : ''}</button>
    <div class="tx">${esc(s.t)}${s.tr ? '<span class="tr" title="Documento que se firma">Firma</span>' : ''}${s.propio ? '<span class="pr" title="Paso agregado solo para esta propiedad">Propio</span>' : ''}</div>
    ${s.d ? `<div class="dt">${esc(s.d)}</div>` : ''}
    ${s.atras ? '<div class="aviso">Saltado: quedó pendiente</div>' : ''}
    ${NOTA_EN === s.id ? `<textarea data-nota maxlength="500" placeholder="Ej: pedido el 5/10, falta el certificado de hipotecas">${esc(f && f.nota || '')}</textarea>
      <div class="mt2"><button type="button" data-a="nota-ok">Guardar nota</button><button type="button" data-a="nota-no">Cancelar</button></div>`
    : `${f && f.nota ? `<div class="nota">${esc(f.nota)}</div>` : ''}
    <div class="mt2">${est !== 'pendiente' && f ? `<span>${esc(lbl)} ${esc(quien(f))}</span>` : ''}
      ${ro ? '' : `<button type="button" data-a="na">${est === 'na' ? 'Sí aplica' : 'No aplica'}</button>
      <button type="button" data-a="nota">${f && f.nota ? 'Editar nota' : 'Nota'}</button>
      ${s.propio ? '<button type="button" data-a="del">Quitar</button>' : ''}`}</div>`}
  </li>`;
}
function pintar(p){
  const r = resumen(p), ro = !puedeMarcar(), dz = dormida(p), md = mandato(p);
  const mov = ultimoMov(p), dm = diasDesde(mov);
  const v = $('#v-seg');
  const tit = `<a href="#" data-a="volver" style="color:var(--mu);text-decoration:none">&larr; Volver a la lista</a>
    <h1 style="margin-top:10px">Seguimiento · ${esc(p.codigo)}</h1>
    <p class="sub">${esc(SIRA.titulo(p))} · ${esc(p.operacion || 'sin operación')} · ${esc((SIRA.ESTADOS[p.estado] || p.estado).replace(' (oculta)', ''))}</p>`;
  const acciones = `<div class="bar noprint">
      <button class="btn sec sm" type="button" data-a="ficha">${X.P().editarTodo || (p.creada_por === yo().id) ? 'Editar ficha' : 'Ver ficha'}</button>
      ${SIRA.publica(p) ? `<a class="btn sec sm" href="${esc(urlFicha(p))}" target="_blank" rel="noopener">Ver en sitio</a>` : ''}
      ${r && r.op === 'arriendo' && X.P().arriendos && X.arr ? '<button class="btn sec sm" type="button" data-a="admin">Pasar a administración mensual</button>' : ''}
    </div>`;
  if (!r){ v.innerHTML = tit + `<div class="box"><p>Esta propiedad no tiene operación (venta o arriendo). Edita la ficha y elígela: con eso aparece su checklist.</p></div>` + acciones; return; }
  const tags = [];
  if (r.va) tags.push(`<span class="tag">Va en: ${esc(r.va.titulo)}</span>`);
  r.etapas.forEach(e => { if (e.tot && e.he) tags.push(`<span class="tag ${e.he === e.tot ? 'ok' : ''}">${esc(etiquetaEtapa(e))}</span>`); });
  if (r.atras.length) tags.push(`<span class="tag warn">${plural(r.atras.length, 'paso saltado', 'pasos saltados')}</span>`);
  if (dz) tags.push(`<span class="tag zz">Dormida · ${dz} días sin movimiento</span>`);
  if (md) tags.push(`<span class="tag ${md.vencido ? 'bad' : md.alerta ? 'warn' : ''}">${esc(md.txt)}</span>`);
  v.innerHTML = tit + `
    <section class="box"><div class="sg-top">
      <div class="ring${r.pct >= 100 ? ' full' : ''}" style="--p:${r.pct}"><div><div><b>${r.pct}%</b><small>${r.he} de ${r.tot}</small></div></div></div>
      <div><div class="sg-frase">${esc(r.frase)}</div>
        <div class="hint" style="margin:0">Checklist de <b>${r.op}</b>: ${plural(r.he, 'paso hecho', 'pasos hechos')} de ${r.tot}${r.na ? ` · ${r.na} no ${r.na === 1 ? 'aplica' : 'aplican'}` : ''}. Último movimiento: ${dm === 0 ? 'hoy' : dm === 1 ? 'ayer' : 'hace ' + dm + ' días'}.</div>
        <div class="sg-tags">${tags.join('')}</div>
        <p class="hint">${ro ? 'Tu perfil puede ver el seguimiento, pero no marcarlo.' : 'Los pasos se marcan en cualquier orden y se guardan al instante. "No aplica" lo saca de la cuenta sin dejarlo como pendiente.'}</p></div>
    </div></section>
    ${difusionHTML(p, ro)}
    <div class="etapas${ro ? ' ro' : ''}">${r.etapas.map((e, i) => `
      <section class="etapa" data-etapa="${esc(e.id)}" style="--c:${esc(e.color || '#c95d2a')}">
        <div class="eh"><span class="num">${i + 1}</span><h3>${esc(e.titulo)}</h3><span class="c">${e.he}/${e.tot}</span></div>
        <div class="eb"><i style="width:${e.tot ? Math.round(e.he * 100 / e.tot) : 0}%"></i></div>
        <ul class="pasos">${e.pasos.map(s => pasoHTML(s, r.op, ro)).join('')}</ul>
        ${ro ? '' : `<form class="addp" data-add="${esc(e.id)}"><input type="text" maxlength="300" placeholder="Agregar paso propio…" aria-label="Agregar un paso solo para esta propiedad"><button class="btn sec sm" type="submit">+</button></form>`}
      </section>`).join('')}</div>
    ${privHTML(p)}
    ${acciones}`;
}

/* publicación: republicar, portales, texto y QR */
function difusionHTML(p, ro){
  const rf = refresco(p), t = rf && ts(rf.actualizada), d = t ? diasDesde(t) : null;
  const cuando = !SIRA.publica(p) ? 'Todavía no está publicada en el sitio. Cuando la publiques, aquí podrás marcar cada vez que la vuelvas a subir a redes y portales.'
    : SIRA.cerrada(p) ? 'Ya está cerrada: no hace falta republicarla.'
    : !rf ? 'Aún no se ha marcado como republicada.' : `Última vez que se volvió a publicar: <b>${d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días'}</b>${quien(rf) ? ' · ' + esc(quien(rf).replace(/ · .*$/, '')) : ''}.`;
  const ps = portales();
  return `<section class="box" id="dif"><h2>Publicación</h2>
    <p style="margin:0 0 12px">${cuando}</p>
    <div class="bar" style="margin-bottom:${ps.length ? '14px' : '0'}">
      ${!ro && SIRA.visible(p) ? '<button class="btn ok sm" type="button" data-a="refrescar">La volví a publicar</button>' : ''}
      <button class="btn sec sm" type="button" data-a="texto">Copiar texto para publicar</button>
      <button class="btn sec sm" type="button" data-a="qr">QR para el letrero</button></div>
    ${ps.length ? `<div class="ptl"><span>Dónde publicamos:</span>${ps.map(x => `<a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener">${esc(x.nombre)} &#8599;</a>`).join('')}</div>` : ''}
  </section>`;
}
const portales = () => { const c = X.config().portales; return Array.isArray(c) ? c : PORTALES_BASE; };

/* ---------------- datos privados del propietario ---------------- */
function privHTML(p){
  if (!puedePriv(p)) return '';
  const d = (PRIV[p.id] && PRIV[p.id].datos) || {}, nom = p.operacion === 'Venta' ? 'orden de venta' : 'mandato de arriendo';
  const t = d.telefono ? wa(d.telefono, `Hola ${d.propietario || ''}, te escribimos de Sira Propiedades por la propiedad ${SIRA.titulo(p)}.`) : '';
  return `<section class="box mt" id="pv">
    <h2>Propietario y ${esc(nom)} <span style="color:var(--mu);letter-spacing:.06em;text-transform:none;font-weight:400">· privado, no sale en el sitio</span></h2>
    <div class="pv-grid">
      <label class="f"><span>Propietario</span><input type="text" data-k="propietario" maxlength="120" value="${esc(d.propietario || '')}" placeholder="Nombre y apellido"></label>
      <label class="f"><span>Teléfono</span><input type="tel" data-k="telefono" maxlength="30" value="${esc(d.telefono || '')}" placeholder="9 1234 5678"></label>
      <label class="f"><span>Correo</span><input type="email" data-k="correo" maxlength="120" value="${esc(d.correo || '')}"></label>
      <label class="f"><span>Honorarios pactados</span><input type="text" data-k="honorarios" maxlength="120" value="${esc(d.honorarios || '')}" placeholder="${p.operacion === 'Venta' ? 'ej: 2% + IVA' : 'ej: 50% del primer mes'}"></label>
      <label class="f"><span>Firma del ${esc(nom)}</span><input type="date" data-k="mandatoFirma" value="${esc(d.mandatoFirma || '')}"></label>
      <label class="f"><span>Vence el</span><input type="date" data-k="mandatoVence" value="${esc(d.mandatoVence || '')}"></label>
    </div>
    <label class="chk mt"><input type="checkbox" data-k="exclusivo"${d.exclusivo ? ' checked' : ''}> Es exclusivo (solo Sira lo puede ofrecer)</label>
    <label class="f mt"><span>Notas internas</span><textarea data-k="notas" maxlength="2000" rows="3" style="min-height:80px" placeholder="Llaves, horarios de visita, condiciones especiales…">${esc(d.notas || '')}</textarea></label>
    <div class="bar mt" style="margin-bottom:0"><button class="btn sm" type="button" data-a="pv-save">Guardar datos del propietario</button>
      ${t ? `<a class="btn sec sm" href="${esc(t)}" target="_blank" rel="noopener">Escribirle por WhatsApp</a>` : ''}
      <span class="hint" style="margin:0">Si pones la fecha de vencimiento, la lista te avisa 30 días antes.</span></div>
  </section>`;
}
async function guardarPriv(p){
  const box = $('#pv'), d = {};
  box.querySelectorAll('[data-k]').forEach(i => { const v = i.type === 'checkbox' ? i.checked : i.value.trim(); if (v) d[i.dataset.k] = v; });
  if (d.mandatoFirma && d.mandatoVence && d.mandatoVence < d.mandatoFirma){ X.toast('La fecha de vencimiento es anterior a la de firma. Revísala.', true); return; }
  X.overlay(true, 'Guardando…');
  try{
    const { data, error } = await sb.from('privados').upsert({ propiedad_id: p.id, datos: d }, { onConflict: 'propiedad_id' }).select();
    if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
    PRIV[p.id] = data[0]; X.toast('Datos del propietario guardados.');
  }catch(err){ X.toast(X.errTxt(err), true); }
  finally{ X.overlay(false); pintar(p); X.pintarLista(); }
}

/* ---------------- marcar pasos ---------------- */
const GUARDANDO = new Set();
async function guardarPaso(p, op, paso, cambios, deshacible){
  const llave = p.id + op + paso;
  if (GUARDANDO.has(llave)) return;          /* doble toque: se ignora mientras se guarda */
  GUARDANDO.add(llave);
  const m = ((MARCAS[p.id] = MARCAS[p.id] || {})[op] = MARCAS[p.id][op] || {});
  const antes = m[paso] ? { ...m[paso] } : null;
  /* solo se envía lo que cambió: así no se pisa la nota que otra persona acaba de escribir */
  const fila = { propiedad_id: p.id, operacion: op, paso, ...cambios };
  m[paso] = { estado: 'pendiente', texto: null, etapa: null, nota: null, ...(antes || {}), ...fila, actualizada: new Date().toISOString(), actualizada_por: yo().id };   /* se ve al instante */
  pintar(p);
  const { data, error } = await sb.from('checklist').upsert(fila, { onConflict: 'propiedad_id,operacion,paso' }).select();
  GUARDANDO.delete(llave);
  if (error || !data || !data.length){
    if (antes) m[paso] = antes; else delete m[paso];
    X.toast(X.errTxt(error || new Error('permission denied')), true);
  } else {
    m[paso] = data[0];
    if (deshacible && antes) X.toast(deshacible, false, { texto: 'Deshacer', fn: () => guardarPaso(p, op, paso, { estado: antes.estado }) });
  }
  pintar(p); X.pintarLista();
}
async function quitarPaso(p, op, paso){
  const m = (MARCAS[p.id] || {})[op] || {}, antes = m[paso];
  delete m[paso]; pintar(p);
  const { error } = await sb.from('checklist').delete().eq('propiedad_id', p.id).eq('operacion', op).eq('paso', paso);
  if (error){ m[paso] = antes; X.toast(X.errTxt(error), true); }
  pintar(p); X.pintarLista();
}

$('#v-seg').addEventListener('click', e => {
  let b = e.target.closest('[data-a]');
  if (!b){ const tx = e.target.closest('.paso .tx'); if (tx && puedeMarcar() && !getSelection().toString()) b = tx.closest('.paso').querySelector('[data-a=ck]'); }
  if (!b) return;
  const p = X.porId(ABIERTA); if (!p) return;
  const a = b.dataset.a, op = opDe(p);
  if (a === 'volver'){ e.preventDefault(); X.pintarLista(); X.vista('list'); return; }
  if (a === 'ficha') return X.abrirEditor(p);
  if (a === 'admin') return X.arr.nuevoDesde(p, PRIV[p.id] && PRIV[p.id].datos);
  if (a === 'pv-save') return guardarPriv(p);
  if (a === 'refrescar') return refrescar(p);
  if (a === 'texto') return abrirTexto(p);
  if (a === 'qr') return abrirQR(p);
  const li = b.closest('[data-paso]'); if (!li || !puedeMarcar()) return;
  const paso = li.dataset.paso, f = ((MARCAS[p.id] || {})[op] || {})[paso], est = f ? f.estado : 'pendiente';
  if (a === 'ck') guardarPaso(p, op, paso, { estado: est === 'hecho' ? 'pendiente' : 'hecho' }, est === 'hecho' ? 'Paso desmarcado.' : '');
  else if (a === 'na') guardarPaso(p, op, paso, { estado: est === 'na' ? 'pendiente' : 'na' });
  else if (a === 'nota'){ NOTA_EN = paso; pintar(p); const t = $('#v-seg textarea[data-nota]'); if (t) t.focus(); }
  else if (a === 'nota-no'){ NOTA_EN = null; pintar(p); }
  else if (a === 'nota-ok'){ const t = li.querySelector('textarea[data-nota]'); NOTA_EN = null; guardarPaso(p, op, paso, { nota: t.value.trim() || null }); }
  else if (a === 'del'){ if (confirm('¿Quitar este paso propio?')) quitarPaso(p, op, paso); }
});
$('#v-seg').addEventListener('submit', e => {
  const f = e.target.closest('form[data-add]'); if (!f) return;
  e.preventDefault();
  const p = X.porId(ABIERTA), t = f.querySelector('input').value.trim();
  if (!p || !t) return;
  guardarPaso(p, opDe(p), 'x-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), { texto: t, etapa: f.dataset.add, estado: 'pendiente' });
});

/* ---------------- pestaña Procesos (plantillas) ---------------- */
let PROC_OP = 'venta', BORR = null;   /* BORR: copia en edición */
function pintarProc(){
  const sec = $('#t-proc'), edita = !!BORR, puede = !!X.P().procesos;
  const et = edita ? BORR[PROC_OP] : plantillas()[PROC_OP];
  const total = et.reduce((n, e) => n + e.pasos.length, 0);
  sec.innerHTML = `<div class="bar" style="justify-content:space-between">
      <div><h1>Procesos</h1><p class="sub" style="margin:0">Cómo trabajamos en Sira, paso a paso. Cada propiedad usa el de su operación como checklist.</p></div>
      ${puede && !edita ? '<button class="btn sec sm" type="button" data-p="editar">Editar plantilla</button>' : ''}
    </div>
    ${portalesHTML()}
    <div class="pl-sw mt">${['venta','arriendo'].map(o => `<button type="button" data-p="op" data-op="${o}" class="${PROC_OP === o ? 'on' : ''}">${o === 'venta' ? 'Venta' : 'Arriendo'}</button>`).join('')}</div>
    <p class="hint" style="margin:-6px 0 16px">${plural(et.length, 'etapa')} · ${plural(total, 'paso')}${edita ? ' · <b>Editando</b>: los cambios se aplican a todas las propiedades al guardar. Lo ya marcado se conserva; si quitas un paso, deja de contarse.' : ''}</p>
    ${edita ? editorHTML(et) : `<div class="etapas">${et.map((e, i) => `
      <section class="etapa" style="--c:${esc(e.color)}"><div class="eh"><span class="num">${i + 1}</span><h3>${esc(e.titulo)}</h3><span class="c">${e.pasos.length}</span></div>
        <ul class="pasos">${e.pasos.map((s, j) => `<li class="paso"><span class="ck" style="cursor:default;border-color:${esc(e.color)};color:${esc(e.color)};font:700 12px/1 'DM Sans'">${j + 1}</span>
          <div class="tx">${esc(s.t)}${s.tr ? '<span class="tr">Firma</span>' : ''}</div>${s.d ? `<div class="dt">${esc(s.d)}</div>` : ''}</li>`).join('')}</ul></section>`).join('')}</div>`}`;
}
function editorHTML(et){
  return `<div class="etapas pl-ed">${et.map((e, i) => `
    <section class="etapa" data-ei="${i}" style="--c:${esc(e.color)}">
      <div class="eh"><span class="num">${i + 1}</span><input type="text" data-f="titulo" value="${esc(e.titulo)}" maxlength="60" aria-label="Nombre de la etapa"></div>
      <div style="display:flex;gap:6px;align-items:center;padding:10px 14px;border-bottom:1px solid #f1ece8;flex-wrap:wrap">
        <label class="f" style="flex:1;min-width:120px"><span>Nombre corto</span><input type="text" data-f="corto" value="${esc(e.corto || '')}" maxlength="20" placeholder="ej: Papeles"></label>
        <span style="display:flex;gap:4px;align-self:end;padding-bottom:4px">${COLORES.map(c => `<button type="button" class="mini" data-p="color" data-c="${c}" title="Color" style="background:${c};border-color:${c === e.color ? '#000' : c};width:22px;height:22px"></button>`).join('')}</span>
        <span style="display:flex;gap:4px;align-self:end"><button type="button" class="mini" data-p="e-up" title="Mover antes">&#9664;</button><button type="button" class="mini" data-p="e-down" title="Mover después">&#9654;</button><button type="button" class="mini" data-p="e-del" title="Quitar etapa">&#10005;</button></span>
      </div>
      <ul class="pasos">${e.pasos.map((s, j) => `<li class="paso" data-si="${j}">
        <div style="display:flex;flex-direction:column;gap:6px">
          <input type="text" data-f="t" value="${esc(s.t)}" maxlength="200" aria-label="Paso">
          <textarea data-f="d" rows="2" maxlength="500" style="min-height:52px" placeholder="Detalle (opcional)">${esc(s.d || '')}</textarea>
          <label class="chk" style="font-size:13px"><input type="checkbox" data-f="tr"${s.tr ? ' checked' : ''} style="width:16px;height:16px"> Se firma un documento</label>
        </div>
        <div class="ctl"><button type="button" data-p="s-up" title="Subir">&#9650;</button><button type="button" data-p="s-down" title="Bajar">&#9660;</button><button type="button" data-p="s-del" title="Quitar">&#10005;</button></div>
      </li>`).join('')}</ul>
      <div class="addp"><button class="btn sec sm" type="button" data-p="s-add">+ Agregar paso</button></div>
    </section>`).join('')}</div>
    <div class="bar mt"><button class="btn sec sm" type="button" data-p="e-add">+ Agregar etapa</button></div>
    <div class="bar mt" style="justify-content:flex-end">
      <button class="btn sec sm" type="button" data-p="base">Volver al proceso original</button>
      <button class="btn sec" type="button" data-p="cancelar">Cancelar</button>
      <button class="btn" type="button" data-p="guardar">Guardar plantilla</button></div>`;
}
/* lista de portales donde publicamos (recordatorio con enlaces) */
let PORT_ED = null;
function portalesHTML(){
  const puede = !!X.P().procesos;
  if (PORT_ED) return `<section class="box mt" id="portales"><h2>Dónde publicamos</h2>
    ${PORT_ED.map((x, i) => `<div class="det" data-pi="${i}"><input type="text" data-pf="nombre" maxlength="40" value="${esc(x.nombre)}" placeholder="Nombre (ej: Yapo)"><input type="text" data-pf="url" maxlength="300" value="${esc(x.url)}" placeholder="Enlace (ej: https://www.yapo.cl/…)"><button type="button" data-p="port-del" aria-label="Quitar">&times;</button></div>`).join('')}
    <div class="bar" style="margin-bottom:0"><button class="btn sec sm" type="button" data-p="port-add">+ Agregar portal</button>
      <span style="flex:1"></span><button class="btn sec sm" type="button" data-p="port-no">Cancelar</button><button class="btn sm" type="button" data-p="port-ok">Guardar portales</button></div>
    <p class="hint">Tip: pon el enlace a tu perfil o al panel de publicaciones de cada portal, así entras directo.</p></section>`;
  const ps = portales();
  return `<section class="box mt" id="portales"><h2>Dónde publicamos</h2>
    <div class="ptl">${ps.length ? ps.map(x => `<a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener">${esc(x.nombre)} &#8599;</a>`).join('') : '<span>Aún no hay portales en la lista.</span>'}
    ${puede ? '<button class="btn sec sm" type="button" data-p="port-ed" style="margin-left:auto">Editar lista</button>' : ''}</div></section>`;
}
function leerPortales(){ if (PORT_ED) $$('#portales [data-pi]').forEach(r => { const i = +r.dataset.pi; PORT_ED[i] = { nombre: r.querySelector('[data-pf=nombre]').value.trim(), url: r.querySelector('[data-pf=url]').value.trim() }; }); }
async function accionPortal(a, b){
  if (a === 'port-ed'){ PORT_ED = copia(portales()); return pintarProc(); }
  if (a === 'port-no'){ PORT_ED = null; return pintarProc(); }
  leerPortales();
  if (a === 'port-add'){ PORT_ED.push({ nombre: '', url: '' }); pintarProc(); const l = $$('#portales [data-pf=nombre]'); return l[l.length - 1].focus(); }
  if (a === 'port-del'){ PORT_ED.splice(+b.closest('[data-pi]').dataset.pi, 1); return pintarProc(); }
  if (a === 'port-ok'){
    const l = PORT_ED.filter(x => x.nombre || x.url).map(x => ({ nombre: x.nombre || x.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: /^https?:\/\//i.test(x.url) ? x.url : x.url ? 'https://' + x.url : '' }));
    if (l.some(x => !x.url)) return X.toast('Cada portal necesita su enlace.', true);
    X.overlay(true, 'Guardando…');
    try{
      const { data, error } = await sb.from('config').update({ valor: l, actualizada: new Date().toISOString() }).eq('clave', 'portales').select();
      if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
      X.config().portales = data[0].valor; PORT_ED = null; X.toast('Lista de portales guardada.');
    }catch(err){ X.toast(X.errTxt(err), true); }
    finally{ X.overlay(false); pintarProc(); }
  }
}

/* lee lo escrito antes de reordenar o guardar */
function leerEditor(){
  if (!BORR) return;
  $$('#t-proc .pl-ed [data-ei]').forEach(sec => {
    const e = BORR[PROC_OP][+sec.dataset.ei];
    e.titulo = sec.querySelector('[data-f=titulo]').value.trim() || e.titulo;
    e.corto = sec.querySelector('[data-f=corto]').value.trim() || e.titulo.split(' ')[0];
    sec.querySelectorAll('[data-si]').forEach(li => {
      const s = e.pasos[+li.dataset.si];
      s.t = li.querySelector('[data-f=t]').value.trim();
      const d = li.querySelector('[data-f=d]').value.trim(); if (d) s.d = d; else delete s.d;
      if (li.querySelector('[data-f=tr]').checked) s.tr = 1; else delete s.tr;
    });
  });
}
const nuevoId = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
$('#t-proc').addEventListener('click', async e => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  const a = b.dataset.p;
  if (a.startsWith('port-')) return accionPortal(a, b);
  if (a === 'op'){ leerEditor(); PROC_OP = b.dataset.op; return pintarProc(); }
  if (a === 'editar'){ BORR = copia(plantillas()); return pintarProc(); }
  if (a === 'cancelar'){ if (!confirm('¿Descartar los cambios de la plantilla?')) return; BORR = null; return pintarProc(); }
  if (!BORR) return;
  leerEditor();
  const et = BORR[PROC_OP], sec = b.closest('[data-ei]'), i = sec ? +sec.dataset.ei : -1, li = b.closest('[data-si]'), j = li ? +li.dataset.si : -1;
  const mover = (l, x, y) => { if (y < 0 || y >= l.length) return; [l[x], l[y]] = [l[y], l[x]]; };
  if (a === 'color') et[i].color = b.dataset.c;
  else if (a === 'e-up') mover(et, i, i - 1);
  else if (a === 'e-down') mover(et, i, i + 1);
  else if (a === 'e-del'){ if (et.length < 2) return X.toast('El proceso necesita al menos una etapa.', true); if (!confirm(`¿Quitar la etapa "${et[i].titulo}" y sus pasos?`)) return; et.splice(i, 1); }
  else if (a === 'e-add') et.push({ id: nuevoId('e'), titulo: 'Nueva etapa', corto: 'Nueva', color: COLORES[et.length % COLORES.length], pasos: [{ id: nuevoId(PROC_OP[0]), t: 'Nuevo paso' }] });
  else if (a === 's-up') mover(et[i].pasos, j, j - 1);
  else if (a === 's-down') mover(et[i].pasos, j, j + 1);
  else if (a === 's-del'){ if (et[i].pasos.length < 2) return X.toast('Cada etapa necesita al menos un paso. Si sobra, quita la etapa.', true); et[i].pasos.splice(j, 1); }
  else if (a === 's-add'){ et[i].pasos.push({ id: nuevoId(PROC_OP[0]), t: '' }); pintarProc(); const l = $$(`#t-proc [data-ei="${i}"] [data-f=t]`); l[l.length - 1].focus(); return; }
  else if (a === 'base'){ if (!confirm(`¿Volver el proceso de ${PROC_OP} al original del flujograma? (lo marcado en las propiedades se conserva)`)) return; BORR[PROC_OP] = copia(BASE[PROC_OP]); }
  else if (a === 'guardar'){
    for (const o of ['venta','arriendo']) for (const et2 of BORR[o]) for (const s of et2.pasos) if (!s.t){ PROC_OP = o; pintarProc(); return X.toast('Hay un paso sin texto. Escríbelo o quítalo.', true); }
    X.overlay(true, 'Guardando plantilla…');
    try{
      const { data, error } = await sb.from('config').update({ valor: BORR, actualizada: new Date().toISOString() }).eq('clave', 'plantillas').select();
      if (error) throw error; if (!data || !data.length) throw new Error('permission denied');
      X.config().plantillas = data[0].valor; BORR = null; X.toast('Plantilla guardada. Ya se usa en todas las propiedades.'); X.pintarLista();
    }catch(err){ X.toast(X.errTxt(err), true); }
    finally{ X.overlay(false); }
  }
  pintarProc();
});

/* lo que usan admin.js y arriendos.js */
X.seg = { abrir, chip, resumen, dormida, mandato, DIAS_DORMIDA, privado: id => PRIV[id], refrescar, textoPublicar };
X.wa = wa; X.dia = dia; X.diasDesde = diasDesde; X.fCorta = fCorta; X.plural = plural;
})();
