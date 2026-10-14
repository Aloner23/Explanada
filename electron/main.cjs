const { app, BrowserWindow } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
let mainWindow;
const isTrusted = event => mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            webSecurity: true, // Allow HTTP calls to POS API
        },
        icon: path.join(__dirname, '../public/logo.png') // Adjust if logo exists
    });

    // Check if we are in development mode
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // In production, load the built index.html
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // Remove default menu for a cleaner kiosk-like look
    mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

const { ipcMain } = require('electron');

ipcMain.handle('get-printers', async (event) => {
    if (!isTrusted(event)) throw new Error('Untrusted printer request');
    try {
        const printers = await event.sender.getPrintersAsync();
        return printers;
    } catch (e) {
        console.error("Error getting printers:", e);
        return [];
    }
});

ipcMain.on('print-ticket', (event, payload) => {
    if (!isTrusted(event) || !payload || typeof payload.content !== 'string' || payload.content.length > 2000000) return;
    const fs = require('fs');
    const os = require('os');
    const content = typeof payload === 'string' ? payload : payload.content;
    const printerName = typeof payload === 'object' ? payload.printerName : null;
    const silent = typeof payload === 'object' ? payload.silent !== false : true;

    console.log(`[Print] Printing job received. Printer: ${printerName || 'Default'} | Silent: ${silent}`);

    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            webSecurity: true,
            contextIsolation: true,
            sandbox: true,
            javascript: false
        }
    });

    const tempPath = path.join(os.tmpdir(), `ticket_${Date.now()}.html`);
    try {
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">`;
        fs.writeFileSync(tempPath, csp + content, 'utf8');
        console.log(`[Print] Temp file created: ${tempPath}`);
        win.webContents.on('will-navigate', event => event.preventDefault());
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.loadFile(tempPath);
    } catch (err) {
        console.error("[Print] Failed to write temp ticket file", err);
        return;
    }

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`[Print] Failed to load ticket content: ${errorCode} - ${errorDescription}`);
    });

    win.webContents.on('did-finish-load', () => {
        console.log(`[Print] Content loaded. Waiting for render...`);
        setTimeout(() => {
            const printOptions = {
                silent: silent,
                printBackground: true,
                color: false,
                margins: { marginType: 'none' }
            };
            
            if (printerName && printerName !== "") {
                printOptions.deviceName = printerName;
            }

            console.log(`[Print] Executing print command (Silent: ${silent})...`);
            win.webContents.print(printOptions, (success, errorType) => {
                if (!success) {
                    console.error("[Print] Print failed:", errorType);
                } else {
                    console.log("[Print] Print command sent successfully to OS spooler.");
                }
                
                win.close();
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch(e) { console.error("[Print] Error removing temp file", e); }
            });
        }, 2000); 
    });
});
