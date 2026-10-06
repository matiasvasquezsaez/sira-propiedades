/* =====================================================================
   Sira Propiedades: conexión con Supabase
   Copia estos dos valores desde Supabase → Project Settings → API
   (o "Connect" arriba en el panel de Supabase):
     - Project URL
     - la clave pública: "anon public" o "Publishable key"
   La clave pública PUEDE estar a la vista: la seguridad la ponen las reglas
   de la base de datos. NUNCA pongas aquí la "service_role" ni la "secret key".
   ===================================================================== */
window.SIRA_CONFIG = {
  supabaseUrl: 'https://ftssnowexxzswlyzgqcq.supabase.co',
  supabaseKey: 'sb_publishable_a1pghIRp6xuTAHPr06WnUw_WZtKGdBl'
};
