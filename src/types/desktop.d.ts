export {};
declare global {
  interface Window {
    desktopPrinter?: {
      getPrinters(): Promise<{ name: string; displayName: string }[]>;
      printTicket(payload: { content: string; printerName?: string; silent: boolean }): void;
    };
  }
}
