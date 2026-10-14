// Return actionable messages without leaking the provider response, prompt or secret.
function providerFailure(status, invalidKey = false) {
  if (invalidKey || status === 401 || status === 403) return { status: 503, code: 'AI_CREDENTIAL', error: 'Google Gemini rechazó la credencial del auditor. Administración debe revisar o renovar la clave del servicio.' };
  if (status === 429) return { status: 429, code: 'AI_QUOTA', error: 'Google Gemini agotó la cuota disponible o limitó las solicitudes. Revisa la cuota y facturación del servicio antes de reintentar.' };
  if (status === 404) return { status: 503, code: 'AI_MODEL', error: 'El modelo del auditor no está disponible. Administración debe actualizar su configuración.' };
  return { status: 502, code: 'AI_PROVIDER', error: 'Google Gemini no pudo completar el análisis. Intenta nuevamente más tarde.' };
}
async function generateAnalysis(prompt, apiKey, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(50000)
    });
  } catch (error) {
    return { status: 504, code: 'AI_CONNECTION', error: 'No se recibió respuesta del auditor a tiempo. Intenta nuevamente.' };
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const invalidKey = failure.error?.details?.some(detail => detail.reason === 'API_KEY_INVALID') || /API key not valid/i.test(failure.error?.message || '');
    return providerFailure(response.status, invalidKey);
  }
  const output = await response.json().catch(() => ({}));
  const text = (output.candidates?.[0]?.content?.parts || []).filter(part => !part.thought).map(part => part.text || '').join('').trim();
  if (!text) return { status: 502, code: 'AI_EMPTY', error: 'El auditor no devolvió un análisis. Reformula la consulta e intenta nuevamente.' };
  return { status: 200, text };
}
module.exports = { generateAnalysis, providerFailure };
