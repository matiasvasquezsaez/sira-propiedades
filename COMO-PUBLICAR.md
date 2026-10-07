# Sira Propiedades: cómo dejar el sitio funcionando (gratis)

- **El sitio público** vive en **GitHub Pages**: gratis y sin vencimiento.
- **Las propiedades, las fotos y el equipo** viven en **Supabase**: base de datos gratis, con inicio de sesión y permisos que se aplican en el servidor.
- El **panel** (`admin.html`) es donde trabaja el equipo, cada persona con su correo, su clave y su perfil.

Tiempo total: unos 30 minutos, una sola vez.

---

## Paso 1: Crear la base de datos en Supabase
1. Entra a https://supabase.com → **Start your project** → inicia sesión (puedes usar tu cuenta de GitHub).
2. **New project**:
   - Name: `sira-propiedades`
   - Database password: inventa una larga y **guárdala** (no la vas a usar en el día a día).
   - Region: **South America (São Paulo)**, la más cercana a Chile.
   - Plan: **Free**.
3. Espera 1 o 2 minutos a que se cree.
4. Menú izquierdo: **SQL Editor** → **New query**. Abre el archivo `supabase/configurar-base.sql`, copia **todo**, pégalo y toca **Run**.
   Debe decir *Success*. (Si algún día te envío una mejora, se hace igual: se puede volver a ejecutar sin perder datos.)

## Paso 2: Conectar el sitio con Supabase
1. En Supabase toca **Connect** (arriba) o ve a **Project Settings → API**.
2. Copia:
   - **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - La clave pública: **anon public** o **Publishable key**.
     ⚠️ **Nunca** uses la `service_role` ni la `secret key`.
3. Abre `config.js` y reemplaza los dos valores. Queda así:
   ```js
   window.SIRA_CONFIG = {
     supabaseUrl: 'https://abcdxyz.supabase.co',
     supabaseKey: 'eyJhbGciOi...'
   };
   ```
   La clave pública puede estar a la vista sin problema: la seguridad la ponen las reglas de la base de datos.

## Paso 3: Publicar el sitio en GitHub Pages
1. Crea una cuenta en https://github.com (si no tienes).
2. **+ → New repository** → nombre `sira-propiedades` → **Public** → **Create repository**.
3. Toca **uploading an existing file** y arrastra todo el contenido de esta carpeta (index.html, admin.html, app.js, admin.js, datos.js, config.js y las carpetas assets y supabase). Luego **Commit changes**.
4. **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, carpeta **/(root)** → **Save**.
5. En 1 o 2 minutos el sitio queda en `https://TU-USUARIO.github.io/sira-propiedades/`.

## Paso 4: Que los correos de Supabase lleven al panel
En Supabase: **Authentication → URL Configuration**:
- **Site URL:** `https://TU-USUARIO.github.io/sira-propiedades/admin.html`
- **Redirect URLs → Add URL:** la misma dirección.

Sin esto, los correos de "confirma tu cuenta" y "recuperar clave" abren una página que no existe.

**Importante sobre los correos:** el correo gratuito que trae Supabase solo envía unos 2 correos por hora y **solo a las personas que son parte de tu organización en Supabase**. Por eso:
- En **Authentication → Sign In / Providers → Email**, desactiva **"Confirm email"**. Así los integrantes entran apenas crean su cuenta (igual nadie puede registrarse si tú no abres el registro, y quedan *Pendientes* hasta que les des un perfil).
- Para que funcione "Olvidé mi clave" con todo el equipo, configura un correo propio gratis en **Authentication → Emails → SMTP Settings** (por ejemplo, tu Gmail con una "contraseña de aplicación": servidor `smtp.gmail.com`, puerto `587`).

## Paso 5: Crear tu cuenta de DUEÑO (hazlo de inmediato)
1. Abre `https://TU-USUARIO.github.io/sira-propiedades/admin.html`.
2. **Crear cuenta** → tu nombre, correo y clave.
3. Confirma el correo que te llega (revisa spam) y entra.

**La primera cuenta que se crea queda como Dueño automáticamente.** Por eso hazlo apenas termines el paso 4.

## Paso 6: Activar la visita diaria (evita que la base se pause)
El plan gratis de Supabase pausa el proyecto si pasa una semana sin uso. Esta tarea automática lo visita todos los días.
1. En tu repositorio de GitHub: **Add file → Create new file**.
2. En el nombre escribe exactamente: `.github/workflows/mantener-activo.yml`
3. Abre el archivo `.github/workflows/mantener-activo.yml` de esta carpeta (en Mac la carpeta `.github` está oculta: presiona Cmd+Shift+. para verla), copia todo y pégalo. **Commit changes.**
4. Pestaña **Actions** → si pide activarlas, actívalas → **Mantener activa la base de datos** → **Run workflow** para probar. Debe quedar con ✓ verde.

Si alguna vez llega un correo de Supabase avisando que el proyecto se pausó, entra a Supabase y toca **Restore**: los datos no se pierden.

---

## Sumar personas al equipo
1. En la pestaña **Equipo**, toca **Abrir registro** (por defecto está cerrado y nadie puede crear cuentas).
2. Envíales el enlace del panel (`.../admin.html`) y pídeles que toquen **Crear cuenta**.
3. Aparecen como *Pendiente*: les eliges un perfil y vuelves a tocar **Cerrar registro**.
4. Para quitarle el acceso a alguien, **desactívalo** (queda su historial). Si quieres borrarlo del todo: Supabase → Authentication → Users → eliminar. Sus propiedades se conservan.

| Perfil | Puede |
|---|---|
| **Dueño** | Todo: publicar, cambiar estados, eliminar, administrar el equipo, ver el historial, actualizar la UF |
| **Gerente** | Crear y editar cualquier propiedad, aprobar, publicar y cambiar estados, actualizar la UF, ver el equipo y el historial. **No elimina** ni cambia perfiles |
| **Corredor** | Publicar directo **sus** propiedades y cambiarles el estado. Ve las de los demás sin modificarlas. El gerente y el dueño pueden editar las suyas. Elimina solo sus borradores |
| **Asistente inmobiliario** | Crear propiedades, que quedan **"En revisión"** hasta que un gerente o el dueño las aprueba. Edita o elimina solo las suyas mientras no estén publicadas |
| **Solo lectura** | Ver todo el stock interno, sin cambiar nada |

Si alguien que no conoces crea una cuenta mientras el registro está abierto, queda *Pendiente* y no puede hacer nada.

**Seguimiento, datos del propietario y arriendos:** todos marcan pasos del seguimiento, menos Solo lectura (que lo ve). Los datos del propietario y el mandato los ven el Dueño, el Gerente y el Corredor de esa propiedad. Los arriendos administrados los ven el Dueño y el Gerente (todos) y cada Corredor (los que tiene a cargo). Las plantillas de los procesos las editan el Dueño y el Gerente.

## Día a día
- **Vendida o arrendada:** cambia el estado. Sigue en el sitio con el sello **VENDIDO / ARRENDADO** y sin precio.
- **Pausada:** oculta del sitio, sirve como borrador.
- **Historial:** quién creó, editó, aprobó o cambió el estado de cada propiedad, y cuándo. Nadie puede borrarlo.
- **Si dos personas editan la misma propiedad a la vez,** el panel avisa al segundo en vez de pisar el trabajo del primero.
- **UF:** "Traer UF de hoy" → "Guardar UF" de vez en cuando.
- Los cambios se ven en el sitio **al instante**.

- **Seguimiento:** cada propiedad tiene el checklist de su operación (venta o arriendo). Los pasos se marcan en cualquier orden; "No aplica" lo saca de la cuenta.
- **Avisos en la lista:** pasos que quedaron atrás, propiedades **dormidas** (30 días sin movimiento) y mandatos vencidos o por vencer (30 días antes).
- **La volví a publicar:** cuando republicas una propiedad en redes o portales, toca ese botón (en la lista, junto a "Dormida", o en su seguimiento) y deja de estar dormida.
- **Publicación:** en el seguimiento de cada propiedad están "Copiar texto para publicar" y "QR para el letrero". La lista de portales donde publican se edita en la pestaña Procesos.
- **WhatsApp del sitio:** el botón verde llega con un mensaje que dice desde qué publicación o búsqueda te escriben.
- **Arriendos:** al entrar a la pestaña verás lo que hay que atender esta semana: atrasos, cobros que vencen, contratos que terminan y reajustes.

## Cuando haya una actualización del sitio
1. Sube los archivos nuevos a GitHub (**Add file → Upload files**; los que tienen el mismo nombre se reemplazan).
2. Si la actualización trae cambios en la base de datos (hazlo justo después del paso 1, el sitio puede fallar unos minutos entre uno y otro): Supabase → **SQL Editor** → New query → pega TODO `supabase/configurar-base.sql` → **Run**. Se puede ejecutar las veces que quieras: no borra datos.

## Bueno saber
- **Límites del plan gratis de Supabase:** 1 GB de fotos (unas 4.000 con la compresión del panel), 500 MB de datos y 5 GB de transferencia al mes. La transferencia es lo primero que se va a llenar si el sitio tiene mucho tráfico: alcanza para miles de visitas al mes. Si algún día se queda corto, es buena señal y se puede ajustar.
- **Correos de confirmación:** el envío gratuito de Supabase es limitado (pocos por hora). Si varias personas se registran el mismo día y alguna no recibe el correo, espera una hora. También puedes desactivar la confirmación en Authentication → Sign In / Providers → Email → *Confirm email*. Si la desactivas, igual nadie entra sin que tú le asignes un perfil.
- **Privacidad:** lo que se escribe en la ficha de una propiedad publicada es público (incluida la dirección, aunque no se marque en el mapa).
- **Probar en tu computador:** abrir `index.html` con doble clic puede no cargar las propiedades. Míralo siempre en la dirección de GitHub Pages.
- **Dominio propio** (ej. sirapropiedades.cl): GitHub → Settings → Pages → Custom domain. El dominio se paga aparte; el resto sigue gratis. Si lo cambias, actualiza también el paso 4.
