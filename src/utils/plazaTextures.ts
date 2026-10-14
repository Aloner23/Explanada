import * as THREE from 'three';

/** Texturas procedurales (canvas 2D) para la maqueta 3D: pavimento, cajones, pasto,
 * techos y fachadas. Se generan una sola vez en memoria, sin depender de assets externos.
 */

/** Oscurece un color hex un factor (0-1) — para el zócalo/base de cada edificio. */
export function darkenColor(hex: string, factor = 0.55): string {
    const c = new THREE.Color(hex);
    c.multiplyScalar(factor);
    return `#${c.getHexString()}`;
}

function makeCanvas(size = 256): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

/** Asfalto con speckle sutil, para el piso general del predio. */
export function createAsphaltTexture(repeat = 24): THREE.CanvasTexture {
    const { canvas, ctx } = makeCanvas(128);
    ctx.fillStyle = '#75787d';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        const shade = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${(Math.random() * 0.08).toFixed(3)})`;
        ctx.fillRect(x, y, 1.4, 1.4);
    }
    return toTexture(canvas, repeat, repeat);
}

/** Franja de cajones de estacionamiento con líneas blancas, orientable por quien la usa. */
export function createParkingStripeTexture(spaces = 8): THREE.CanvasTexture {
    const w = 512, h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#6c6f74';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    const step = w / spaces;
    for (let i = 0; i <= spaces; i++) {
        const x = i * step;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.12);
        ctx.lineTo(x, h * 0.88);
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

/** Pasto con variación de tono, para jardines. */
export function createGrassTexture(repeat = 6): THREE.CanvasTexture {
    const { canvas, ctx } = makeCanvas(128);
    ctx.fillStyle = '#5a9450';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        const g = 110 + Math.floor(Math.random() * 60);
        ctx.fillStyle = `rgba(60,${g},60,0.35)`;
        ctx.fillRect(x, y, 1.6, 1.6);
    }
    return toTexture(canvas, repeat, repeat);
}

/** Techo de lámina metálica (naves deportivas): franjas horizontales tipo lámina acanalada. */
export function createMetalRoofTexture(repeat = 10): THREE.CanvasTexture {
    const { canvas, ctx } = makeCanvas(64);
    ctx.fillStyle = '#dfe4ea';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4) {
        ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(120,130,145,0.35)';
        ctx.fillRect(0, y, 64, 2);
    }
    return toTexture(canvas, repeat, 1.6);
}

/** Techo de teja terracota, para salones y gastronomía. */
export function createTileRoofTexture(repeat = 6): THREE.CanvasTexture {
    const { canvas, ctx } = makeCanvas(64);
    ctx.fillStyle = '#a3402f';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
        for (let x = 0; x < 64; x += 8) {
            const offset = (y / 8) % 2 === 0 ? 0 : 4;
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.beginPath();
            ctx.arc(((x + offset) % 64) + 4, y + 4, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    return toTexture(canvas, repeat, repeat * 0.6);
}

export type FacadeStyle = 'windows' | 'glass' | 'metal' | 'plain';

/**
 * Fachada procedural para las paredes de cada edificio (antes color plano liso). El
 * `ExtrudeGeometry` de three.js genera el UV de las caras laterales en coordenadas de
 * MUNDO REALES (metros), no normalizadas 0-1 — por eso el `tileMeters` que devolvemos
 * es directamente el tamaño real (en metros) de un módulo de la textura, y quien la use
 * solo necesita `texture.repeat.set(1/tileMeters, 1/tileMeters)` para que las ventanas
 * queden a escala real y consistente sin importar el tamaño de cada edificio.
 */
export function createFacadeTexture(baseColor: string, style: FacadeStyle): { texture: THREE.CanvasTexture; tileMeters: number } {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    let tileMeters = 3;

    // Base tipo estuco con textura sutil, común a (casi) todos los estilos.
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * size, y = Math.random() * size;
        const shade = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${(Math.random() * 0.06).toFixed(3)})`;
        ctx.fillRect(x, y, 1.2, 1.2);
    }

    if (style === 'windows') {
        // Muro de estuco con una ventana grande por módulo de 3m (locales, salones).
        tileMeters = 3;
        const wx = size * 0.22, wy = size * 0.16, ww = size * 0.56, wh = size * 0.5;
        ctx.fillStyle = '#33475a';
        ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        grad.addColorStop(0, '#c3dcee');
        grad.addColorStop(1, '#82abc7');
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wx, wy + wh * 0.5); ctx.lineTo(wx + ww, wy + wh * 0.5); ctx.stroke();
    } else if (style === 'glass') {
        // Muro cortina de vidrio (oficinas): casi todo cristal, mullion delgado.
        tileMeters = 2;
        ctx.fillStyle = '#3c5164';
        ctx.fillRect(0, 0, size, size);
        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#d7e9f5');
        grad.addColorStop(0.5, '#a7c9df');
        grad.addColorStop(1, '#d7e9f5');
        ctx.fillStyle = grad;
        const m = 3;
        ctx.fillRect(m, m, size - m * 2, size - m * 2);
    } else if (style === 'metal') {
        // Lámina acanalada vertical (naves deportivas): mismo lenguaje que el techo metálico.
        tileMeters = 1;
        for (let x = 0; x < size; x += 8) {
            ctx.fillStyle = (x / 8) % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)';
            ctx.fillRect(x, 0, 4, size);
        }
    }
    // 'plain' (servicios): solo el estuco de base, sin aberturas.

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // UV de ExtrudeGeometry en las caras laterales = coordenadas de mundo reales (metros),
    // así que este repeat basta para que la textura quede a escala real en cualquier edificio.
    tex.repeat.set(1 / tileMeters, 1 / tileMeters);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return { texture: tex, tileMeters };
}

/** Cancha de usos múltiples (líneas sobre pavimento), para el piso de las áreas deportivas. */
export function createMultiCourtTexture(): THREE.CanvasTexture {
    const w = 512, h = 300;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#797d82';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const shade = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${(Math.random() * 0.06).toFixed(3)})`;
        ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.strokeStyle = '#c1502e';
    ctx.lineWidth = 4;
    const m = 16;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.beginPath(); ctx.moveTo(w / 2, m); ctx.lineTo(w / 2, h - m); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2); ctx.stroke();
    const key = 110, keyH = 110;
    ctx.strokeRect(m, h / 2 - keyH / 2, key, keyH);
    ctx.strokeRect(w - m - key, h / 2 - keyH / 2, key, keyH);
    ctx.beginPath(); ctx.arc(m + key, h / 2, keyH / 2, Math.PI * 1.5, Math.PI * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(w - m - key, h / 2, keyH / 2, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    return toTexture(canvas, 1, 1);
}
