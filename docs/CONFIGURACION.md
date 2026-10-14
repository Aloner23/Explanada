# Configurar Explanada para tu plaza

Todo lo que cambia de una plaza a otra vive en **un archivo JSON**: `config/plaza.config.json`. La app lo importa al compilar (alias `@plaza-config` en `vite.config.ts`), lo valida con `normalizePlazaConfig` (`src/config/plazaLogic.ts`) y rellena los valores por defecto.

Para usar otro archivo sin tocar el de ejemplo:

```bash
PLAZA_CONFIG=config/mi-plaza.config.json npm run build
PLAZA_CONFIG=config/mi-plaza.config.json npm run demo:mock
```

El seed de emuladores (`npm run demo`) también respeta `PLAZA_CONFIG`.

> El archivo se empaqueta en el cliente: pon solo datos **públicos**. Las claves van en Secret Manager y `functions/.env`.

## Configuración mínima

```json
{
  "name": "Centro Comercial Norte",
  "spaces": [{ "name": "Salón de Eventos", "pricing": { "base": 3000 } }]
}
```

Con eso ya hay marca, agenda con un espacio reservable, landing pública y una maqueta 3D generada automáticamente. El resto de los campos son opcionales.

## Referencia

### Marca

| Campo | Ejemplo | Efecto |
|---|---|---|
| `name` | `"Plaza Demo"` | Nombre en landing, menú, tickets, correos, recordatorios de WhatsApp y prompt del auditor IA. **Obligatorio.** |
| `shortName` | `"Plaza Demo"` | Versión corta para la barra lateral y el encabezado. |
| `tagline`, `description` | | Textos de la landing. |
| `logo` | `"logo.png"` | Ruta relativa a `public/`. Se usa en login, menú, landing y comprobantes. |
| `colors.primary` | `"#0d9488"` | Color de marca. Se deriva una paleta completa (50–950) y se aplica a toda la UI. |
| `colors.accent`, `colors.dark` | | Variables CSS `--plaza-accent` y `--plaza-dark`. |
| `landing.*` | `heroTitle`, `heroSubtitle`, `heroBadge`, `about[]`, `yearsLabel`, `yearsText` | Contenido de la portada pública. |
| `contact.*` | `address`, `hours`, `whatsapp`, `email`, `instagram`, `facebook`, `tiktok`, `mapsUrl` | Sección de ubicación/contacto, pie de página y encabezado de tickets. |

### Región, moneda e impuestos

| Campo | Defecto | Notas |
|---|---|---|
| `locale` | `"es-MX"` | Formato de números y fechas. |
| `currency` | `"MXN"` | Código ISO 4217 (`formatMoney`). |
| `timezone` | `"America/Mexico_City"` | |
| `tax.vatRate` | `0.16` | Se envía al POS en cada venta. |
| `tax.pricesIncludeTax` | `true` | |
| `tax.taxIdLabel`, `tax.genericTaxId` | `"RFC"`, `"XAXX010101000"` | |
| `tax.satAccounting` | `true` | Módulo de contabilidad con catálogo SAT (México). |

### Espacios reservables (`spaces[]`)

Salones, terrazas, coworking, canchas… Cada espacio aparece en la landing, en el formulario público de reserva, en la agenda interna, en los filtros de movimientos y como una línea propia en el dashboard del dueño.

```json
{
  "id": "terraza",                 // opcional; si falta se genera del nombre ("terraza")
  "name": "Terraza",
  "kind": "outdoor",               // hall | outdoor | coworking | sports | other
  "capacity": 250,
  "description": "Espacio al aire libre…",
  "features": ["Iluminación ambiental", "Toldo opcional"],
  "pricing": { "base": 5000, "weekend": 9000, "holiday": 12000, "blockHours": 8 },
  "agendaWeight": 0.5              // qué tanto "llena" el día en el mapa de saturación (0–1)
}
```

- `weekend` aplica de viernes a domingo; `holiday` aplica en las fechas de `calendar.holidays` (y Jueves/Viernes Santo si `calendar.includeHolyWeek` es `true`).
- Las reservas y sus pagos guardan `spaceId`, así que puedes **renombrar** un espacio sin perder su historial. No cambies el `id` de un espacio que ya tiene movimientos.

### Estacionamiento (`parking`)

| Campo | Defecto | Regla |
|---|---|---|
| `hourlyRate` | 15 | Tarifa por hora (valor inicial; administración puede cambiarla en Ajustes). |
| `freeMinutes` | 15 | Tolerancia de entrada sin costo. |
| `dailyMax` | 200 | Tope diario. |
| `tenantRateDiscount` | 5 | Locatarios pagan `hourlyRate - tenantRateDiscount`. |
| `firstHourGraceMinutes` | 15 | Hasta 1 h + gracia se cobra 1 hora. |
| `excessGraceMinutes`, `excessFee` | 15, 5 | Después de 2 h, un excedente menor a la gracia cuesta `excessFee` en vez de una hora completa. |
| `frequentCustomerExtraMinutes` | 15 | Tolerancia extra para clientes frecuentes. |
| `partnerConvention` | `{ "label": "Convenio comercio aliado", "freeHours": 3 }` | Botón de convenio en la caseta (p. ej. un comercio aliado que absorbe las primeras horas). |
| `quickEntryTypes` | `[]` | Botones de entrada rápida (p. ej. `["INAPAM", "MAESTRO"]`). |

### Locales (`locales[]`)

```json
{ "id": "A-101", "type": "LOCAL", "areaM2": 45 }   // type: LOCAL | OFICINA | DEPORTIVO
```

Se usan en la maqueta 3D y en las cifras de la landing. Los expedientes de cada locatario (renta, contrato, adeudos) se capturan en la app.

### Maqueta 3D (`layout`)

Rectángulos en metros sobre un lote rectangular. `x` crece hacia la derecha y `y` hacia el fondo del lote.

```json
"layout": {
  "lot": { "width": 120, "depth": 80 },
  "buildings": [
    { "id": "edificio-a", "name": "Edificio A · Locales", "kind": "retail",
      "x": 8, "y": 6, "width": 45, "depth": 12, "height": 4.5, "locales": ["A-101", "A-102"] },
    { "id": "terraza", "name": "Terraza", "kind": "outdoor",
      "x": 33, "y": 22, "width": 28, "depth": 16, "height": 0.15, "space": "terraza" }
  ],
  "parking": [{ "x": 14, "y": 46, "width": 96, "depth": 10, "spaces": 32 }],
  "greens":  [{ "x": 4, "y": 44, "width": 6, "depth": 22, "trees": 3 }]
}
```

- `kind` define el estilo: `retail` (ventanales), `office` (muro cortina), `events` (techo de teja), `outdoor` (pasto, plano), `sports` (lámina), `food`, `service`.
- `height ≤ 0.5` dibuja una superficie plana (terrazas, jardines).
- **Sin `layout`**, la maqueta se genera sola: una fila de edificios por tipo de local, una fila con los espacios reservables y dos filas de estacionamiento.

### Integración POS (`pos`)

`{ "adapter": "disabled" | "mock" | "http", "terminalId": "CAJA-1", "branchId": "1" }`. Ver [POS.md](POS.md).

## Checklist para una plaza nueva

1. Copia `config/plaza.config.json` y edita marca, contacto, espacios, tarifas y locales.
2. Reemplaza `public/logo.png` (512×512, PNG con transparencia) y, si quieres, `public/watermark.png` (marca de agua de los tickets).
3. Dibuja tu `layout` o bórralo para usar el generado.
4. Prueba con `PLAZA_CONFIG=… npm run demo:mock`.
5. Crea un proyecto de Firebase, copia `.env.example` y `functions/.env.example`, despliega reglas y funciones, y crea la primera cuenta `OWNER` desde la consola (ver README).
