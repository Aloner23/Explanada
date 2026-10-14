
import { authenticatedFetch } from './authService';
import { Tenant, Transaction, Reservation } from "../types";
import { calculateFinancialBreakdown } from "../utils/financialCalculations";
import { plaza } from '../config/plaza';

/**
 * Analyzes the business performance using Gemini AI.
 * Now detects temporal intent (specific dates) to provide contextual reporting.
 */
export const analyzeBusinessPerformance = async (
  allTransactions: Transaction[],
  tenants: Tenant[],
  reservations: Reservation[],
  defaultPeriodLabel: string = "actual",
  userQuery: string = ""
): Promise<string> => {
  const ai = { models: { generateContent: async (request: { model: string; contents: string }): Promise<{ text: string }> => {
    const response = await authenticatedFetch('/account-api/analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: request.contents })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'El análisis no está disponible en este momento.');
    if (typeof body.text !== 'string' || !body.text.trim()) throw new Error('El auditor devolvió una respuesta vacía. Intenta nuevamente.');
    return body;
  } } };

  // Start with the exact dashboard period, including a historical whole year.
  const currentYear = new Date().getFullYear().toString();
  const selected = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(defaultPeriodLabel);
  let year = selected?.[2] || (/^\d{4}$/.test(defaultPeriodLabel) ? defaultPeriodLabel : currentYear);
  let month = selected?.[1] || 'ALL';

  if (userQuery.trim()) {
    const extractionResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Fecha actual: ${new Date().toISOString().slice(0, 10)}. Periodo seleccionado: ${defaultPeriodLabel}.
      Extrae SOLO el periodo explícitamente pedido en la consulta, resolviendo fechas relativas con la fecha actual.
      Si no pide cambiar el periodo, devuelve {"month":"SELECTED","year":"SELECTED"}.
      En otro caso devuelve {"month":"MM" o "ALL","year":"YYYY"} con mes de dos dígitos y año de cuatro.
      Responde exclusivamente JSON. Consulta: ${JSON.stringify(userQuery)}`,
    });
    let intent;
    try { intent = JSON.parse(extractionResult.text.replace(/```json|```/g, '').trim()); }
    catch { throw new Error('No se pudo interpretar el periodo de la consulta. Indica mes y año, o usa IA Audit sin consulta.'); }
    if (!(intent.month === 'SELECTED' && intent.year === 'SELECTED')) {
      if (!/^(ALL|0[1-9]|1[0-2])$/.test(intent.month) || !/^\d{4}$/.test(intent.year)) {
        throw new Error('El periodo recibido no es válido. Indica mes y año explícitamente.');
      }
      month = intent.month; year = intent.year;
    }
  }
  const periodLabel = month === 'ALL' ? `Año ${year}` : `${month}/${year}`;
  const transactionsToAnalyze = allTransactions.filter(t => {
    if (t.status && t.status !== 'completed') return false;
    const [y, m] = (t.date || '').split('-');
    return y === year && (month === 'ALL' || m === month);
  });

  // STEP 2: Calculate metrics for the detected/selected period
  const financialData = calculateFinancialBreakdown(transactionsToAnalyze, tenants, reservations);

  const activeTenants = tenants.filter(t => t.status === 'active').length;
  const vacantLocals = tenants.filter(t => t.status === 'vacant').length;
  const morosos = tenants.filter(t => t.status === 'late').length;

  const occupiedTenants = activeTenants + morosos;

  const prompt = `
    Eres un AUDITOR CONTABLE Y CONSULTOR ESTRATÉGICO SENIOR para la plaza comercial "${plaza.name}".
    Tu misión es explicar las cifras registradas en el Dashboard y sus límites, sin atribuir causas no demostradas.

    ESTADO FINANCIERO DEL PERIODO DETECTADO (${periodLabel}):
    
    1. INGRESOS (Registrados en sistema: $${financialData.totalRevenue.toLocaleString()} | Ajustados por arqueo: $${financialData.realGeneralIncome.toLocaleString()}):
       - Estacionamiento declarado en arqueos y pendientes sin arqueo: $${financialData.realParking.toLocaleString()}
       - Estacionamiento (Sistema): $${financialData.parking.toLocaleString()}
       - Arqueo de Caja (Diferencia): $${financialData.audit_discrepancy.toLocaleString()} (${financialData.audit_discrepancy >= 0 ? "Sobrante" : "Faltante"})
       - Locales Comerciales: $${financialData.local.toLocaleString()}
       - Oficinas: $${financialData.office.toLocaleString()}
       - Publicidad: $${financialData.ad_income.toLocaleString()}
       - Eventos y espacios rentables: $${financialData.events.toLocaleString()}
       - Fondo e ingresos históricos registrados: $${financialData.historical_fund.toLocaleString()}
       - Membresías de estacionamiento (dato informativo ya incluido en categorías anteriores, NO sumar otra vez): $${financialData.parking_memberships.toLocaleString()}
       - Desglose por espacio (ya incluido en Eventos, NO sumar otra vez): ${Object.entries(financialData.events_by_space || {}).map(([id, amount]) => `${plaza.spaces.find(sp => sp.id === id)?.name || 'Otros'} ($${amount.toLocaleString()})`).join(', ') || 'sin registros'}
    
    2. EGRESOS (Total: $${financialData.totalExpense.toLocaleString()}):
       - Nómina: $${financialData.expense_nomina.toLocaleString()}
       - Mantenimiento: $${financialData.expense_manto.toLocaleString()}
       - Servicios Básicos (Luz/Agua/Internet): $${(financialData.expense_luz + financialData.expense_agua + financialData.expense_internet + financialData.expense_basic).toLocaleString()}
       - Servicios Prof. (Legal/Contable/TI/Mkt): $${(financialData.expense_marketing + financialData.expense_contabilidad + financialData.expense_legal + financialData.expense_ti + financialData.expense_pro).toLocaleString()}
       - Impuestos: $${financialData.taxes.toLocaleString()}
       - Otros: $${financialData.expense_other.toLocaleString()}

    3. MÉTRICAS CLAVE:
       - Neto registrado (ingresos del sistema menos egresos registrados, sin sumar diferencia de arqueo): $${financialData.totalNeto.toLocaleString()}
       - Margen registrado sobre ingresos del sistema: ${financialData.totalRevenue > 0 ? ((financialData.totalNeto / financialData.totalRevenue) * 100).toFixed(2) : 0}%
       - Operación Parking: ${financialData.totalCars.toLocaleString()} vehículos atendidos.
       - Ocupación Actual de la Plaza: ${occupiedTenants} ocupados (${activeTenants} al corriente y ${morosos} morosos), ${vacantLocals} vacantes (${(occupiedTenants + vacantLocals > 0 ? ((occupiedTenants / (occupiedTenants + vacantLocals)) * 100).toFixed(1) : "0.0")}%).
       - Riesgo de Cartera: ${morosos} inquilinos morosos acumulados.

    ${userQuery ? `CONSULTA ESPECÍFICA DEL DUEÑO: "${userQuery}"` : "Realiza una auditoría financiera general y evaluación de salud del negocio para este periodo."}

    INSTRUCCIONES CRÍTICAS:
    - Si la consulta pide datos de un mes que NO es el actual, asegúrate de mencionar explícitamente que estás analizando el periodo [${periodLabel}].
    - Promedio observado de estacionamiento según arqueos por vehículo (NO meta ni tarifa esperada): $${financialData.totalCars > 0 ? (financialData.realParking / financialData.totalCars).toFixed(2) : 0}.
    - Reporta cualquier anomalía en el arqueo.
    - El neto y margen registrados excluyen la diferencia de arqueo por definición; no es un error aritmético. Si calculas neto ajustado, identifícalo por separado y explica su fórmula.
    - Los importes cero significan que no hay registros de esa categoría en el periodo; no prueban ausencia de actividad ni de gastos. Solicita verificar la integridad de los datos.
    - La ocupación y morosidad son el estado ACTUAL, no una reconstrucción histórica del periodo.
    - Reconcilia el total con TODAS las categorías incluidas, también fondo histórico y eventos. Los promedios por vehículo están redondeados; no reconstruyas totales multiplicándolos ni infieras tarifas.
    - No inventes metas, tarifas, pérdidas potenciales o causas. No infieras fraude, desvíos, insolvencia ni conductas deliberadas con estas cifras agregadas.
    - Distingue hechos registrados, posibles explicaciones por verificar y recomendaciones. No presentes esta orientación automática como una auditoría forense realizada.
    - Evalúa la rentabilidad solo de los registros disponibles.
    - Proporciona EXACTAMENTE 3 recomendaciones de alto impacto.
    - FORMATO: Devuelve tu respuesta EXCLUSIVAMENTE en HTML limpio (tags: <p>, <strong>, <ul>, <li>, <br>). NO uses Markdown ni bloques de código.
  `;

  const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
  return response.text;
};
