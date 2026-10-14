import { CFDIMetadata } from '../types/accounting';

/**
 * Parsea el contenido de un archivo XML de CFDI mexicano (versiones 3.3 o 4.0)
 * y extrae los datos necesarios para su contabilización y registro fiscal.
 */
export const parseCFDIXml = (xmlText: string): CFDIMetadata => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Validar errores de parseo del DOM
        const parserError = xmlDoc.getElementsByTagName('parsererror');
        if (parserError.length > 0) {
            throw new Error('El archivo no tiene un formato XML válido.');
        }

        // Buscar nodo comprobante (admite namespace o tag puro)
        const comprobanteNode = xmlDoc.getElementsByTagName('cfdi:Comprobante')[0] || xmlDoc.getElementsByTagName('Comprobante')[0];
        if (!comprobanteNode) {
            throw new Error('No se encontró el nodo principal <cfdi:Comprobante>.');
        }

        // Buscar subnodos clave
        const emisorNode = xmlDoc.getElementsByTagName('cfdi:Emisor')[0] || xmlDoc.getElementsByTagName('Emisor')[0];
        const receptorNode = xmlDoc.getElementsByTagName('cfdi:Receptor')[0] || xmlDoc.getElementsByTagName('Receptor')[0];
        const timbreNode = xmlDoc.getElementsByTagName('tfd:TimbreFiscalDigital')[0] || xmlDoc.getElementsByTagName('TimbreFiscalDigital')[0];

        const uuid = timbreNode?.getAttribute('UUID') || '';
        const rfcIssuer = emisorNode?.getAttribute('Rfc') || emisorNode?.getAttribute('rfc') || '';
        const nameIssuer = emisorNode?.getAttribute('Nombre') || emisorNode?.getAttribute('nombre') || '';
        const rfcReceiver = receptorNode?.getAttribute('Rfc') || receptorNode?.getAttribute('rfc') || '';
        const total = Number(comprobanteNode.getAttribute('Total') || comprobanteNode.getAttribute('total') || '0');
        const date = comprobanteNode.getAttribute('Fecha') || comprobanteNode.getAttribute('fecha') || '';

        if (!uuid) {
            throw new Error('El archivo XML no cuenta con el Timbre Fiscal Digital (falta UUID).');
        }

        return {
            uuid,
            rfcIssuer,
            rfcReceiver,
            nameIssuer: nameIssuer || rfcIssuer,
            total,
            date: date ? date.split('T')[0] : new Date().toISOString().split('T')[0]
        };
    } catch (error: any) {
        console.error('Error al procesar XML:', error);
        throw new Error(error.message || 'Error desconocido al analizar el CFDI.');
    }
};
