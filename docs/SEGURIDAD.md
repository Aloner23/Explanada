# Modelo de seguridad

Principio general: **el cliente no es de confianza.** Cada permiso se aplica en las reglas de Firestore/Storage o en una Cloud Function. La UI solo oculta lo que de todos modos sería rechazado.

## 1. Identidad y sesión

- **Firebase Authentication** con correo y contraseña. El usuario escribe un *nombre de usuario*, y el cliente y el servidor derivan el mismo alias `sha256(username)@users.explanada.invalid` (`authService.usernameEmail`, `functions/security.js`). El dominio `.invalid` garantiza que no sea un buzón real y el hash evita exponer nombres en Auth.
- El registro libre está deshabilitado: las cuentas solo se crean desde `accountApi`.
- La persistencia es de sesión (`browserSessionPersistence`): cerrar el navegador cierra la sesión.
- `restoreSession()` y `login()` leen el perfil con `getDocFromServer`, nunca de la caché, y rechazan perfiles inactivos o con un rol desconocido.
- `useSessionGuard` escucha el propio perfil. Si un administrador desactiva la cuenta, la sesión se cierra en vivo. Además, `accountApi` llama a `revokeRefreshTokens` y `requireUser` verifica el token con `checkRevoked = true`.

## 2. Autorización en Firestore (`firestore.rules`)

```
active()     perfil existe y active == true      (se evalúa en cada petición)
manager()    active && role in [OWNER, ADMIN]
parking()    active && role in [OWNER, ADMIN, PARKING_STAFF]
employee()   active && role in [OWNER, ADMIN, PARKING_STAFF, STAFF]
ownTenant(id) active && role == TENANT && perfil.tenantId == id
```

| Colección | Lectura | Escritura | Por qué |
|---|---|---|---|
| `plz_users` | propio perfil o empleados | **nunca** | Roles, activación y contraseñas solo se cambian por `accountApi`. Evita la autoescalada de privilegios. |
| `plz_config/global` | pública (`get`) | manager | La tarifa es pública, pero solo administración la modifica. |
| `plz_tenants` | manager o el propio locatario | manager, rechazando `systemPassword` | Un locatario no ve a los demás. Se bloquea el campo legado de contraseña. |
| `plz_tickets` | parking | crear solo `active` con `id` coherente; actualizar sin cambiar `entryTime`; borrar solo manager | Impide "rejuvenecer" un ticket para cobrar menos. |
| `plz_transactions` | parking o el locatario dueño (`resource.data.tenantId`) | manager, o parking solo para tipos `PARKING`/`VISIT`/`AUDIT` sin cambiar el tipo | Un cajero no puede registrar rentas ni convertir movimientos. Un locatario no puede inventar pagos. |
| finanzas, nómina, contabilidad, reservas | manager | manager | Lista explícita de colecciones permitidas. |
| cualquier otra ruta | — | — | Denegado por defecto (incluye `plz_rate_limits` y subcolecciones). |

**Storage** (`storage.rules`): solo un manager activo lee o sube a `uploads/`, con límite de 20 MB y tipo `image/*` o `application/pdf`. Las subidas anónimas o de HTML se rechazan (hay una prueba para esto).

## 3. Validación en el servidor (`functions/index.js`)

- `requireUser`: token Bearer → `verifyIdToken(token, true)` → perfil activo en Firestore → `req.user`. Cualquier fallo devuelve 401/403 sin detalles.
- `/users` aplica las reglas de negocio que no caben en las reglas de Firestore:
  - formato del `id`, del `username` y del rol (lista cerrada);
  - un `ADMIN` no puede crear ni editar un `OWNER`;
  - nadie puede desactivarse ni cambiarse el rol a sí mismo;
  - contraseña mínima de 6 caracteres (en Auth, **nunca** en Firestore: se guarda el perfil mediante una lista blanca de campos);
  - **compensación entre servicios**: si la escritura del perfil falla, la identidad de Auth recién creada se borra o la existente se restaura, para que el reintento sea seguro.
- `/stamp`: el locatario solo puede sellar tickets `active` que aún no estén sellados, dentro de `runTransaction`. El nombre del local se toma del expediente en el servidor y no del cuerpo de la petición.
- **Límite de tasa** en las rutas públicas y en `/analysis`: 20 peticiones por hora por `sha256(ip:hora)`, con transacción de Firestore y `expiresAt` para TTL.
- **Errores opacos:** el manejador final solo registra `error.code`, porque los mensajes del SDK pueden incluir datos de cuentas.
- CORS: orígenes de Hosting del proyecto, `localhost:3000` y `null` (Electron con `file://`). Las rutas protegidas exigen token de todos modos.

## 4. Integridad de cobros y modo offline

- **Atomicidad.** `dataService.saveParkingPayment` escribe ticket y transacción en un mismo `writeBatch`. En la cola offline se guardan como **una sola acción `BATCH`** y se reproducen con otro `writeBatch`. No puede quedar uno sin el otro.
- **Errores definitivos frente a transitorios.** `permission-denied`, `unauthenticated`, `invalid-argument` y `failed-precondition` **no** se encolan: se propagan y la caché local se revierte (`previousCache`). Solo los fallos de red se reintentan.
- **Aislamiento por identidad.** La caché, la cola y la bitácora de sincronización usan claves con sufijo `_{uid}`. `_getCache()` descarta la caché en memoria si cambió el usuario. La cola sin sufijo de versiones antiguas **no se reproduce automáticamente**: se informa a administración para revisarla, evitando aplicar cambios bajo una cuenta equivocada.
- `syncPendingRecords` omite cualquier acción sobre `plz_users`: las cuentas solo se modifican por el endpoint autenticado.
- `upsertRecord` rechaza identificadores vacíos, `"undefined"` o con `/`, antes de tocar la caché o la cola.
- `scrubLegacyCredentials` elimina `password` y `systemPassword` de cualquier dato `explanada_*` en `localStorage`, conservando el trabajo pendiente.

## 5. IA sin secretos en el cliente

- `GEMINI_API_KEY` se declara como secreto de la función (`runWith({ secrets: ['GEMINI_API_KEY'] })`) y vive en Secret Manager. No existe ninguna variable `VITE_*` con claves.
- El cliente calcula las métricas agregadas del periodo y envía solo el prompt (máximo 50 000 caracteres). La función exige `OWNER`/`ADMIN`.
- `functions/analysis.js` clasifica los fallos del proveedor (`AI_CREDENTIAL`, `AI_QUOTA`, `AI_MODEL`, `AI_CONNECTION`, `AI_EMPTY`) sin devolver el cuerpo original, la clave ni el prompt, y descarta las partes de "razonamiento" del modelo.
- El prompt obliga al modelo a no inventar metas ni causas, a distinguir hechos de hipótesis y a responder solo en HTML simple.
- **Saneamiento de salida:** `utils/safeHtml.ts` reconstruye el HTML nodo por nodo con una lista blanca (`P, STRONG, UL, OL, LI, BR, EM`). Elimina **todos** los atributos y descarta `SCRIPT`, `STYLE`, `IFRAME`, `OBJECT`, `SVG`, `MATH` y `TEMPLATE`. Solo el resultado llega a `dangerouslySetInnerHTML`.

## 6. Proxy POS

- Roles permitidos: `OWNER`, `ADMIN` y `PARKING_STAFF`.
- Lista blanca por método y expresión regular de ruta (`allowedPosRequest`): solo `POST /sales`, `GET /sales/:ref` y `GET /health` del contrato genérico ([POS.md](POS.md)). Cualquier otra ruta, incluidas `/sales/../admin` y cualquier `DELETE`, se rechaza con 403.
- El token de Firebase **no** se reenvía al POS: solo se envían `Accept` y `Content-Type`.
- Se exige HTTPS. Una excepción HTTP requiere `POS_ALLOW_HTTP=true` **y** que `POS_API_URL` coincida exactamente con `POS_HTTP_EXCEPTION_URL`.
- `maxRedirects: 0` evita que una redirección del POS lleve el proxy a otro host.

## 7. Electron

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` y `webSecurity: true`.
- `will-navigate` bloqueado y `setWindowOpenHandler → deny`.
- El `preload` expone solo `getPrinters` y `printTicket`.
- Los manejadores IPC verifican que el emisor sea el `webContents` y el **frame principal** de la ventana.
- Los tickets se imprimen en una ventana oculta con `javascript: false`, con una CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data:` y un límite de tamaño de 2 MB. El archivo temporal se borra después.

## 8. Pruebas que respaldan lo anterior

| Prueba | Archivo |
|---|---|
| Público no lee usuarios ni reservas ni escribe finanzas; un dueño no puede editar roles; un dueño desactivado pierde el acceso; un locatario solo ve lo suyo; un cajero no puede cambiar `entryTime`; Storage rechaza anónimos | `src/tests/firebase.rules.test.cjs` |
| Proxy POS rechaza anónimos, tokens inválidos, cuentas inactivas y locatarios; el snapshot público no expone contactos; `/users` no guarda contraseñas y evita la autodesactivación; la reserva pública no crea pagos; el análisis exige rol | `src/tests/functions.integration.test.cjs` |
| Saneamiento HTML, caché por usuario, lote offline atómico, rechazo de IDs inválidos, lista blanca POS, errores de IA sin filtrar la clave, restauración de sesión | `src/tests/security.test.cjs` |
| Validación de `plaza.config`, maqueta generada, precios por fecha, ingresos por espacio, contrato POS genérico y adaptadores, reglas de tarifa configurables | `src/tests/plaza.test.cjs` |

## 9. Configuración y datos de la plaza

- `plaza.config.json` solo contiene datos **públicos** de la plaza (marca, espacios, precios, contacto, maqueta). Se empaqueta en el bundle del cliente, así que **nunca** debe incluir claves, URLs internas ni datos personales. Los secretos siguen en Secret Manager y `functions/.env`.
- La configuración se valida al arrancar (`normalizePlazaConfig`): un archivo mal formado rompe el build/arranque en lugar de publicar una app a medias.
- Las tarifas que se muestran al público salen de la configuración; el cobro real se calcula en la caseta y las reglas de Firestore siguen limitando qué puede escribir cada rol.
