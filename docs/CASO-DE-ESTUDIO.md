# Explanada · Caso de estudio

## El problema

La operación de una plaza comercial reúne procesos que suelen vivir separados: entradas y salidas del estacionamiento, cortes de caja, contratos, cobranza y reservas. El sistema nació como una solución a medida para una plaza real en producción; este repositorio presenta una versión generalizada y configurable.

## La solución

Una aplicación web con vistas por rol y un cliente de escritorio para la caseta. La marca, los espacios, las tarifas y la maqueta se definen en `config/plaza.config.json`.

| Necesidad | Decisión técnica | Evidencia |
| --- | --- | --- |
| Mantener consistentes el ticket y su cobro | Escritura atómica y cola offline separada por usuario | [Servicio de datos](../src/services/dataService.ts) |
| Restringir el acceso por responsabilidad | Roles y reglas en Firestore y Storage; gestión de cuentas en el servidor | [Seguridad](SEGURIDAD.md) |
| Evitar que los secretos de IA lleguen al cliente | Cloud Functions y Secret Manager | [Arquitectura](ARQUITECTURA.md) |
| Adaptar la plataforma a otra plaza | Configuración validada y adaptadores para POS | [Configuración](CONFIGURACION.md) · [POS](POS.md) |
| Integrar la impresión de tickets | Cliente Electron y puente de impresión aislado | [Cliente de escritorio](../electron) |

## Recorrido de demostración

[**Abrir la demo**](https://aloner23.github.io/Explanada/)

1. Explora la página pública, los espacios y la maqueta.
2. Pulsa **Acceso Interno** y entra como `dueno`, con contraseña `demo1234`.
3. Revisa el tablero y los indicadores por periodo.
4. Cierra sesión y entra como `cajero` para explorar el estacionamiento, o como `admin` para consultar locatarios y cobranza.

Las cuentas y la información de la demo son ficticias. Pages utiliza un backend simulado en el navegador: permite explorar la interfaz, pero no demuestra las reglas de Firebase ni un despliegue de producción. El análisis de IA devuelve un ejemplo y el POS es simulado.

![Tablero del dueño](screenshots/04-dashboard-dueno.png)

## Verificación

La [integración continua](https://github.com/Aloner23/Explanada/actions/workflows/ci.yml) comprueba tipos, pruebas unitarias y compilación. Un segundo trabajo ejecuta reglas de Firestore/Storage y endpoints con emuladores Firebase.

Las pruebas cubren, entre otros casos, la cola de cobros, el aislamiento de caché por usuario, el saneamiento de HTML y el contrato permitido del proxy POS. El [informe de seguridad](SEGURIDAD.md) explica el alcance de esos controles.

## Límites y decisiones pendientes

- El modo offline permite encolar cobros; la sincronización requiere recuperar conexión.
- La demo web no valida la impresión en hardware de caseta.
- El repositorio no publica métricas cuantificadas de impacto operativo.
- La separación de varias plazas en un mismo proyecto y los pagos en línea siguen en el [roadmap](../README.md#roadmap).

[Volver al proyecto](../README.md) · [Ver arquitectura](ARQUITECTURA.md)
