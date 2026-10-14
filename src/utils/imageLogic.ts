
import { GalleryImage } from '../types';

/**
 * RESOLUTOR INTELIGENTE DE IMÁGENES
 * Intenta cargar URL, si no existe o falla, intenta Base64.
 * Maneja automáticamente el prefijo data:image si no existe.
 */
export const resolveImageUrl = (img?: GalleryImage): string => {
   if (!img) return 'https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=800';

   // 1. Prioridad: URL o Ruta Local (Si tiene extensión, es HTTP o es Data URL)
   if (img.url && img.url.trim() !== '') {
      const url = img.url.trim();
      if (url.startsWith('http') || url.includes('.') || url.startsWith('/') || url.startsWith('data:')) {
         return url;
      }
   }

   // 2. Respaldo: Base64
   if (img.base64 && img.base64.trim() !== '') {
      const b64 = img.base64.trim();
      if (b64.startsWith('data:image')) return b64;
      return `data:image/jpeg;base64,${b64}`;
   }

   // 3. Fallback
   return 'https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=800';
};
