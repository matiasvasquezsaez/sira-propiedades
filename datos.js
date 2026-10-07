/* =====================================================================
   Sira Propiedades — reglas compartidas por el sitio público y el panel.
   Si cambias algo aquí, cambia en ambos lados.
   ===================================================================== */
const SIRA = (() => {
  const WA = '56930882610';
  const TIPOS = ['Casa', 'Departamento', 'Parcela', 'Terreno', 'Local comercial', 'Oficina'];
  const OPERACIONES = ['Venta', 'Arriendo'];

  /* qué datos tiene sentido pedir/mostrar según el tipo */
  const CAMPOS = {
    'Casa':            ['dormitorios', 'banos', 'estacionamientos', 'supConstruida', 'supTerreno'],
    'Departamento':    ['dormitorios', 'banos', 'estacionamientos', 'supUtil'],
    'Parcela':         ['dormitorios', 'banos', 'estacionamientos', 'supConstruida', 'supTerreno'],
    'Terreno':         ['supTerreno'],
    'Local comercial': ['banos', 'estacionamientos', 'supConstruida'],
    'Oficina':         ['banos', 'estacionamientos', 'supUtil']
  };
  const ETIQUETA = {
    dormitorios: 'Dormitorios', banos: 'Baños', estacionamientos: 'Estacionamientos',
    supUtil: 'Superficie útil (m²)', supConstruida: 'Superficie construida (m²)', supTerreno: 'Superficie del terreno (m²)'
  };

  /* disponible y reservada: publicadas; vendida y arrendada: visibles con sello;
     pausada y en revisión: solo en el panel */
  const ESTADOS = {
    disponible: 'Disponible', reservada: 'Reservada',
    vendida: 'Vendida', arrendada: 'Arrendada', pausada: 'Pausada (oculta)', revision: 'En revisión'
  };
  const visible = p => p && (p.estado === 'disponible' || p.estado === 'reservada');
  /* vendidas y arrendadas siguen en el sitio con el sello encima (prueba de que el negocio se mueve) */
  const cerrada = p => !!p && (p.estado === 'vendida' || p.estado === 'arrendada');
  const publica = p => visible(p) || cerrada(p);
  const sello = p => p.estado === 'vendida' ? 'Vendido' : p.estado === 'arrendada' ? 'Arrendado' : '';

  const REGIONES = ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso',
    'Metropolitana', "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'];

  const UF_RESPALDO = 39500;   /* solo si la base de datos no trae valor de UF */
  /* conexión (config.js) */
  const CFG = window.SIRA_CONFIG || {};
  const configurado = () => /^https?:\/\/.+/.test(CFG.supabaseUrl || '') && !/TU-PROYECTO/.test(CFG.supabaseUrl) && CFG.supabaseKey && !/PEGA-AQUI/.test(CFG.supabaseKey);
  /* solo fotos del propio almacenamiento (o recién elegidas en el navegador) */
  const fotoURL = path => /^(data:image\/|blob:)/.test(path) ? path
    : /^[\w\-./]+$/.test(String(path)) && !/\.\./.test(path) ? String(CFG.supabaseUrl || '').replace(/\/+$/, '') + '/storage/v1/object/public/fotos/' + String(path).split('/').map(encodeURIComponent).join('/')
    : '';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });
  const n0 = v => (v === '' || v == null || isNaN(+v)) ? null : +v;   /* número o null */
  const usa = (p, campo) => (CAMPOS[p.tipo] || []).includes(campo);

  function precioTxt(p) {
    if (!p.precio) return 'Precio a consultar';
    return p.moneda === 'UF' ? 'UF ' + num(p.precio) : '$' + num(Math.round(p.precio));
  }
  /* precio en pesos, para filtrar y ordenar */
  function precioCLP(p, uf) {
    if (!p.precio) return null;
    return p.moneda === 'UF' ? p.precio * (uf || UF_RESPALDO) : p.precio;
  }
  function titulo(p) {
    if (p.titulo && String(p.titulo).trim()) return String(p.titulo).trim();
    if (cerrada(p)) return (p.tipo || 'Propiedad') + ' en ' + (p.comuna || '');
    const v = p.operacion === 'Venta' ? 'Se vende ' : 'Se arrienda ';
    return v + (p.tipo || 'propiedad').toLowerCase() + ' en ' + (p.comuna || '');
  }
  const lugar = p => (p.tipo || 'Propiedad') + ' en ' + (p.sector || p.comuna || '');
  /* superficie que se usa en filtros: útil (depto/oficina) o construida */
  const supPrincipal = p => usa(p, 'supUtil') ? n0(p.supUtil) : usa(p, 'supConstruida') ? n0(p.supConstruida) : null;
  const supTerreno = p => usa(p, 'supTerreno') ? n0(p.supTerreno) : null;

  /* enlace a Google Maps: con la dirección si está, si no el sector y la comuna */
  const mapaQ = (p, conDireccion) => [conDireccion && p.direccion, p.sector, p.comuna, p.region, 'Chile'].filter(Boolean).join(', ');
  const mapaLink = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

  function m2(v) {
    if (v == null) return '';
    return v >= 10000 ? num(+(v / 10000).toFixed(2)) + ' ha' : num(v) + ' m²';
  }

  return { WA, TIPOS, OPERACIONES, CAMPOS, ETIQUETA, ESTADOS, visible, cerrada, publica, sello, REGIONES, UF_RESPALDO, CFG, configurado, fotoURL,
    esc, num, n0, usa, mapaQ, mapaLink, precioTxt, precioCLP, titulo, lugar, supPrincipal, supTerreno, m2 };
})();
