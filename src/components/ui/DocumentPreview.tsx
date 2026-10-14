import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, Download, ExternalLink } from 'lucide-react';

// Google Drive share/view links refuse to render in a plain iframe; their dedicated
// /preview endpoint is the only one that embeds. Everything else (Firebase Storage,
// direct PDFs/images) works as-is.
const toEmbeddableUrl = (url: string) => {
  const drive = /drive\.google\.com\/file\/d\/([^/]+)/.exec(url);
  return drive ? `https://drive.google.com/file/d/${drive[1]}/preview` : url;
};

interface DocumentPreviewButtonProps {
  url: string;
  label?: React.ReactNode;
  className?: string;
}

// Drop-in replacement for `<a href={url} target="_blank">`: opens the document
// (PDF or image) in an in-app modal instead of navigating away from the app.
export const DocumentPreviewButton: React.FC<DocumentPreviewButtonProps> = ({ url, label, className }) => {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-10" onClick={() => setOpen(false)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="relative z-10 w-full max-w-4xl h-[85vh] bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0">
                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest"><FileText size={16} /> Documento</div>
                <div className="flex items-center gap-2">
                  <a href={url} target="_blank" rel="noreferrer" title="Abrir en pestaña nueva" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"><ExternalLink size={16} /></a>
                  <a href={url} download title="Descargar" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"><Download size={16} /></a>
                  <button onClick={() => setOpen(false)} title="Cerrar" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-red-500 transition-colors"><X size={16} /></button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 overflow-auto">
                {isImage ? (
                  <img src={url} className="w-full h-full object-contain" alt="Documento" />
                ) : (
                  <iframe src={toEmbeddableUrl(url)} className="w-full h-full border-0" title="Documento" />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
