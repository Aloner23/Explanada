
import emailjs from '@emailjs/browser';
import { plaza } from '../config/plaza';

/**
 * CONFIGURACIÓN DE EMAILJS
 * Asegúrate de que en tu Dashboard de EmailJS:
 * 1. El campo "To Email" de la plantilla sea: {{to_email}}
 * 2. El campo "Subject" sea: {{subject}} (opcional)
 */
// Sin estas variables el servicio funciona en modo simulación (no envía correos).
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";

// Email del administrador de la plaza
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "admin@example.com";

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  status: 'sent' | 'failed' | 'simulated';
}

/**
 * Envía un folio de reserva o parking.
 */
export const sendFolioEmail = async (
  to: string, 
  clientName: string, 
  folio: string, 
  details: string
): Promise<boolean> => {
  const isSimulation = !EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID;
  const recipientEmail = to.trim();
  const subject = `Confirmación ${plaza.name} - Folio: ${folio}`;
  const body = `Hola ${clientName},\n\nConfirmamos tu solicitud.\nFOLIO: ${folio}\nDetalles: ${details}\n\nGracias por tu preferencia.`;

  if (!recipientEmail) return false;

  try {
    if (isSimulation) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      logEmail(recipientEmail, subject, body, 'simulated');
      return true;
    }

    const templateParams = {
      to_email: recipientEmail,
      client_name: clientName,
      folio: folio,
      details: details,
      subject: subject,
      reply_to: import.meta.env.VITE_REPLY_TO_EMAIL || "no-reply@example.com"
    };

    const response = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY);
    if (response.status === 200) {
      logEmail(recipientEmail, subject, body, 'sent');
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

/**
 * Envía alertas de solicitud de cancelación (Al cliente y al Administrador)
 */
export const sendCancellationAlert = async (
  clientEmail: string,
  clientName: string,
  folio: string,
  reason: string
): Promise<boolean> => {
  const isSimulation = !EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID;
  
  // 1. Notificación al CLIENTE
  const clientSubject = `Solicitud de Cancelación en Revisión - Folio: ${folio}`;
  const clientBody = `Hola ${clientName}, hemos recibido tu solicitud de cancelación por el siguiente motivo: "${reason}". Tu caso está siendo revisado por la administración. Te avisaremos pronto.`;

  // 2. Notificación al ADMIN
  const adminSubject = `URGENTE: Solicitud de Cancelación de Cliente - ${folio}`;
  const adminBody = `El cliente ${clientName} (${clientEmail}) solicita cancelar la reserva ${folio}.\nMotivo: ${reason}\n\nPor favor, ingresa al panel administrativo para aprobar o rechazar esta solicitud.`;

  try {
    if (isSimulation) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      logEmail(clientEmail, clientSubject, clientBody, 'simulated');
      logEmail(ADMIN_EMAIL, adminSubject, adminBody, 'simulated');
      return true;
    }

    // Enviar correo al Cliente
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: clientEmail.trim(),
      client_name: clientName,
      subject: clientSubject,
      details: `Solicitud de cancelación recibida. Motivo: ${reason}. En breve la administración te dará respuesta.`,
      folio: folio
    }, EMAILJS_PUBLIC_KEY);

    // Enviar correo al Administrador
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: ADMIN_EMAIL,
      client_name: `Administración ${plaza.name}`,
      subject: adminSubject,
      details: `El cliente ${clientName} solicita cancelar la reserva ${folio} por el motivo: "${reason}". Revisa el panel de control para gestionar esta solicitud.`,
      folio: folio
    }, EMAILJS_PUBLIC_KEY);

    return true;
  } catch (error) {
    console.error("Error enviando alertas de cancelación:", error);
    return false;
  }
};

/**
 * Notifica al cliente si su solicitud de cancelación fue aprobada o rechazada.
 */
export const sendCancellationResolution = async (
  to: string,
  clientName: string,
  folio: string,
  resolution: 'approved' | 'rejected'
): Promise<boolean> => {
  const isSimulation = !EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID;
  const statusText = resolution === 'approved' ? 'APROBADA' : 'RECHAZADA';
  const subject = `Resolución de Cancelación - Folio: ${folio} (${statusText})`;
  
  const details = resolution === 'approved' 
    ? `Tu solicitud de cancelación ha sido aprobada. El espacio ha sido liberado y tu reserva ha sido anulada exitosamente.`
    : `Tu solicitud de cancelación ha sido rechazada. Tu reserva sigue vigente en nuestro sistema. Para más detalles, por favor contacta a administración.`;

  const body = `Hola ${clientName},\n\nTe informamos que tu solicitud para el folio ${folio} ha sido ${statusText}.\n${details}`;

  try {
    if (isSimulation) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      logEmail(to, subject, body, 'simulated');
      return true;
    }

    const templateParams = {
      to_email: to.trim(),
      client_name: clientName,
      subject: subject,
      details: details,
      folio: folio
    };

    const response = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY);
    if (response.status === 200) {
      logEmail(to, subject, body, 'sent');
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error enviando resolución de cancelación:", error);
    return false;
  }
};

const logEmail = (to: string, subject: string, body: string, status: 'sent' | 'failed' | 'simulated') => {
  const newLog: EmailLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    to, subject, body, timestamp: new Date().toISOString(), status
  };
  const history = JSON.parse(localStorage.getItem('explanada_email_history') || '[]');
  localStorage.setItem('explanada_email_history', JSON.stringify([newLog, ...history].slice(0, 100)));
};
