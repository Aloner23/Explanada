const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopPrinter', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printTicket: ({ content, printerName, silent }) => ipcRenderer.send('print-ticket', { content, printerName, silent })
});
