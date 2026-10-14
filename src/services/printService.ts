
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { ParkingTicket, ParkingConfig } from '../types';
import { plaza } from '../config/plaza';

const escapeHtml = (v: string) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

let watermarkCache: string | null = null;

const loadWatermark = async (): Promise<string> => {
    if (watermarkCache) return watermarkCache;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for watermark
        const response = await fetch('watermark.png', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const blob = await response.blob();
            watermarkCache = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
            return watermarkCache!;
        }
    } catch (e) {
        console.warn("Watermark load failed or timed out", e);
    }
    return '';
};

const getBarcodeDataUrl = (text: string): string => {
    const canvas = document.createElement("canvas");
    try {
        JsBarcode(canvas, text, {
            format: "CODE128",
            lineColor: "#000",
            width: 3,
            height: 80,
            displayValue: true,
            fontSize: 20
        });
        return canvas.toDataURL("image/png");
    } catch (e) {
        console.error("Barcode gen error", e);
        return '';
    }
};

const getQrDataUrl = async (text: string): Promise<string> => {
    try {
        return await QRCode.toDataURL(text, { width: 120, margin: 0 });
    } catch (e) {
        console.error("QR Error", e);
        return '';
    }
};

const isElectron = (): boolean => {
    return typeof window !== 'undefined' && 
           window.navigator && 
           window.navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
};

const openPrintWindow = (content: string) => {
    const printWindow = window.open('', '_blank', 'width=300,height=600,left=500,top=500');
    if (printWindow) {
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">`;
        printWindow.document.write(csp + content);
        printWindow.document.close();
        setTimeout(() => { if (!printWindow.closed) { printWindow.print(); printWindow.close(); } }, 2000);
    }
};

const executePrint = (content: string, silent: boolean = true) => {
    if (isElectron()) {
        try {
            const printer = window.desktopPrinter;
            const printerName = localStorage.getItem('selectedPrinterName');
            printer.printTicket({ content, printerName, silent });
        } catch (e) {
            console.error("IPC Send Error", e);
            openPrintWindow(content);
        }
    } else {
        openPrintWindow(content);
    }
};

const getCommonStyles = () => `
    @page { 
        size: 58mm auto; 
        margin: 0; 
    }
    html, body {
        margin: 0;
        padding: 0;
        width: 58mm;
        background-color: white;
    }
    body { 
        font-family: Arial, Helvetica, sans-serif; 
        text-align: center; 
        -webkit-print-color-adjust: exact;
    }
    .main-container {
        width: 48mm;
        margin: 0 auto;
        padding: 0;
        display: block;
    }
    .watermark-logo {
        width: 35mm;
        height: auto;
        margin: 0 auto 2mm auto;
        display: block;
    }
    .logo { font-size: 14pt; font-weight: bold; margin: 1mm 0; line-height: 1; }
    .info { font-size: 8pt; margin: 0.5mm 0; line-height: 1.1; font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 2mm 0; width: 100%; }
    .barcode-img { width: 100%; margin: 2mm auto; display: block; }
    .qr-img { width: 30mm; height: 30mm; margin: 2mm auto; display: block; }
    .type-badge { display: inline-block; padding: 1mm 3mm; border: 1px solid #000; font-weight: bold; font-size: 10pt; margin: 1mm 0; }
    .footer { font-size: 7pt; margin-top: 2mm; border-top: 1px dashed #000; padding-top: 1mm; font-weight: bold; }
    .rate-info { font-size: 10pt; font-weight: bold; margin: 1.5mm 0; }
    .total { font-size: 14pt; font-weight: bold; margin: 2mm 0; }
    .policy { font-size: 6.5pt; text-align: justify; line-height: 1.1; margin: 2mm 0; font-weight: normal; color: #000; }
`;

const getPolicyHtml = () => `
    <div class="policy">
        <strong>POL&Iacute;TICAS DE ESTACIONAMIENTO</strong><br/>
        El cliente se notifica y acepta que el estacionamiento del veh&iacute;culo no implica contrato de dep&oacute;sito y que el propietario se hace responsable por objetos de valor dejados dentro del veh&iacute;culo. Tampoco nos hacemos responsables por: robo de objetos, valores, documentos, autopartes o accesorios no declarados y/o depositados en la caseta de cobro, ni da&ntilde;os relacionados con colisiones o accidentes, terremotos, incendios, inundaciones, alborotos populares, vandalismo, da&ntilde;os mec&aacute;nicos o el&eacute;ctricos, ponchadura de llantas o ruptura de cristales.<br/>
        En caso de da&ntilde;os parciales por causas imputables a la empresa, &eacute;sta responder&aacute; de acuerdo a las pol&iacute;ticas de la compa&ntilde;&iacute;a de seguros. El usuario es responsable y pagar&aacute; por cualquier da&ntilde;o f&iacute;sico al estacionamiento, equipos, veh&iacute;culos o personas. Una vez que el veh&iacute;culo sea retirado del estacionamiento no se acepta reclamaci&oacute;n alguna.<br/>
        El recibir este boleto implica la aceptaci&oacute;n del contrato. Este ticket es el &uacute;nico documento v&aacute;lido de salida. Cuide su boleto, perderlo causar&aacute; el cobro de la tarifa m&aacute;xima vigente.
    </div>
`;

const getScriptHtml = () => '';

export const printService = {
    getPrinters: async (): Promise<{name: string, displayName: string}[]> => {
        if (isElectron()) {
            try {
                const printers = await window.desktopPrinter.getPrinters();
                return printers;
            } catch(e) {
                console.error("Failed to get printers", e);
                return [];
            }
        }
        return [];
    },

    printTicket: async (ticket: ParkingTicket, config: ParkingConfig) => {
        const watermarkDataUrl = await loadWatermark();
        const barcodeDataUrl = getBarcodeDataUrl(ticket.id);
        const qrDataUrl = await getQrDataUrl(ticket.id);
        const rateToShow = ticket.type === 'LOCATARIO' ? (config.hourlyRate - plaza.parking.tenantRateDiscount).toFixed(2) : config.hourlyRate.toFixed(2);

        const printContent = `
            <html>
              <head>
                <title>Ticket</title>
                <style>${getCommonStyles()}</style>
              </head>
              <body>
                <div class="main-container" style="font-weight: bold;">
                    ${watermarkDataUrl ? `<img src="${watermarkDataUrl}" class="watermark-logo" />` : ''}
                    <div class="logo">${escapeHtml(plaza.name.toUpperCase())}</div>
                    <div class="info">${escapeHtml(plaza.contact.address)}</div>
                    <div class="divider"></div>
                    <div class="info">ENTRADA: ${new Date(ticket.entryTime).toLocaleString('es-MX')}</div>
                    <div class="type-badge">${ticket.type}</div>
                    <div class="rate-info">TARIFA: $${rateToShow} / HR</div>
                    <img src="${qrDataUrl}" class="qr-img" />
                    <img src="${barcodeDataUrl}" class="barcode-img" />
                    <div class="info">FOLIO: ${ticket.id}</div>
                    ${getPolicyHtml()}
                    <div class="footer">CONSERVE SU BOLETO - GRACIAS</div>
                </div>
                ${getScriptHtml()}
              </body>
            </html>
        `;

        const silent = localStorage.getItem('silentPrint') !== 'false';
        executePrint(printContent, silent);
    },

    printReceipt: async (ticket: ParkingTicket, amount: number, duration: number) => {
        const watermarkDataUrl = await loadWatermark();
        const barcodeDataUrl = getBarcodeDataUrl(ticket.id);
        const qrDataUrl = await getQrDataUrl(ticket.id);
        
        const entryDate = new Date(ticket.entryTime);
        const exitDate = new Date();
        const hours = Math.floor(duration / 60);
        const mins = duration % 60;
        const durationStr = `${hours}h ${mins}m`;

        const printContent = `
            <html>
              <head>
                <title>Comprobante</title>
                <style>${getCommonStyles()}</style>
              </head>
              <body>
                <div class="main-container" style="font-weight: bold;">
                    ${watermarkDataUrl ? `<img src="${watermarkDataUrl}" class="watermark-logo" />` : ''}
                    <div class="logo">${escapeHtml(plaza.name.toUpperCase())}</div>
                    <div class="info">${escapeHtml(plaza.contact.address)}</div>
                    <div class="info" style="font-weight:bold; margin-top:5px">COMPROBANTE DE PAGO</div>
                    <div class="divider"></div>
                    
                    <div class="info">ENTRADA: ${entryDate.toLocaleString('es-MX')}</div>
                    <div class="info">SALIDA: ${exitDate.toLocaleString('es-MX')}</div>
                    <div class="info">TIEMPO: ${durationStr}</div>
                    
                    <div class="divider"></div>
                    <div class="type-badge">${ticket.type}</div>
                    <div class="total">PAGADO: $${amount.toLocaleString()}</div>
                    
                    <img src="${qrDataUrl}" class="qr-img" />
                    <img src="${barcodeDataUrl}" class="barcode-img" />
                    <div class="info">FOLIO: ${ticket.id}</div>
                    <div class="divider"></div>
                    <div class="info">PAGO EL: ${new Date().toLocaleString('es-MX')}</div>
                    ${getPolicyHtml()}
                    <div class="footer">¡GRACIAS POR SU VISITA!</div>
                </div>
                ${getScriptHtml()}
              </body>
            </html>
        `;

        const silent = localStorage.getItem('silentPrint') !== 'false';
        executePrint(printContent, silent);
    },

    testPrint: async () => {
        const printContent = `
            <html>
              <head>
                <title>Prueba de impresión</title>
                <style>${getCommonStyles()}</style>
              </head>
              <body>
                <div class="main-container" style="font-weight: bold;">
                    <div class="logo">PRUEBA DE IMPRESIÓN</div>
                    <div class="info">Si puedes leer esto, la impresora está correctamente configurada.</div>
                    <div class="divider"></div>
                    <div class="info">FECHA: ${new Date().toLocaleString('es-MX')}</div>
                    <div class="type-badge">TEST OK</div>
                    <div class="divider"></div>
                    <div class="footer">${escapeHtml(plaza.name.toUpperCase())} · EXPLANADA</div>
                </div>
                ${getScriptHtml()}
              </body>
            </html>
        `;
        const silent = localStorage.getItem('silentPrint') !== 'false';
        executePrint(printContent, silent);
    }
};
