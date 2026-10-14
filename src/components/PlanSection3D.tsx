import React, { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, PerspectiveCamera, ContactShadows, Sky } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import {
    Building2, Calendar, Dumbbell, Leaf, Loader2, ShoppingBag, Utensils, Wrench,
} from 'lucide-react';
import { plaza, LayoutBuilding, BuildingKind } from '../config/plaza';
import {
    createAsphaltTexture, createGrassTexture, createMetalRoofTexture, createTileRoofTexture,
    createParkingStripeTexture, createFacadeTexture, createMultiCourtTexture, darkenColor, FacadeStyle,
} from '../utils/plazaTextures';

/**
 * Interactive 3D master plan generated from `plaza.config → layout`.
 *
 * The layout is a list of axis-aligned rectangles in meters (lot, buildings,
 * parking rows, green areas), so any plaza can describe itself in a few lines of
 * JSON — or omit `layout` entirely and get one generated from its locales and
 * spaces (see `resolveLayout` in src/config/plazaLogic.ts).
 *
 * Coordinates: config `x` grows to the right (east) and `y` grows toward the back
 * of the lot; the scene is centered on the lot.
 */

const ICONS: Record<BuildingKind, React.ComponentType<any>> = {
    retail: ShoppingBag,
    office: Building2,
    events: Calendar,
    outdoor: Leaf,
    sports: Dumbbell,
    food: Utensils,
    service: Wrench,
};

const STYLE: Record<BuildingKind, { wall: string; facade: FacadeStyle; roof: 'metal' | 'tile' | 'flat' }> = {
    retail: { wall: '#f4ece0', facade: 'windows', roof: 'flat' },
    office: { wall: '#eef1f5', facade: 'glass', roof: 'flat' },
    events: { wall: '#f4ece0', facade: 'windows', roof: 'tile' },
    outdoor: { wall: '#6fa661', facade: 'plain', roof: 'flat' },
    sports: { wall: '#e9edf2', facade: 'metal', roof: 'metal' },
    food: { wall: '#f4ece0', facade: 'windows', roof: 'tile' },
    service: { wall: '#d9dde2', facade: 'plain', roof: 'flat' },
};

const { lot } = plaza.layout;
/** Config rectangle (top-left x/y + size) → scene center [x, z]. */
const center = (r: { x: number; y: number; width: number; depth: number }): [number, number] =>
    [r.x + r.width / 2 - lot.width / 2, r.y + r.depth / 2 - lot.depth / 2];

/** Clones a facade texture so each face tiles at real-world scale (meters). */
function faceTexture(base: THREE.Texture, tileMeters: number, w: number, h: number) {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, w / tileMeters), Math.max(1, h / tileMeters));
    t.needsUpdate = true;
    return t;
}

const Building: React.FC<{ b: LayoutBuilding; active: boolean; onSelect: (b: LayoutBuilding) => void }> = ({ b, active, onSelect }) => {
    const [hovered, setHovered] = useState(false);
    const [cx, cz] = center(b);
    const style = STYLE[b.kind] || STYLE.service;
    const Icon = ICONS[b.kind] || Building2;
    const flat = b.height <= 0.5;
    const plinth = Math.min(0.4, b.height * 0.18);

    const materials = useMemo(() => {
        if (flat) return null;
        const { texture, tileMeters } = createFacadeTexture(style.wall, style.facade);
        const wallH = b.height - plinth;
        const sideX = new THREE.MeshStandardMaterial({ map: faceTexture(texture, tileMeters, b.depth, wallH), roughness: 0.8 });
        const sideZ = new THREE.MeshStandardMaterial({ map: faceTexture(texture, tileMeters, b.width, wallH), roughness: 0.8 });
        const roofMap = style.roof === 'metal' ? createMetalRoofTexture(Math.ceil(b.width / 4)) : style.roof === 'tile' ? createTileRoofTexture(Math.ceil(b.width / 6)) : null;
        const roof = new THREE.MeshStandardMaterial({ map: roofMap, color: roofMap ? '#ffffff' : darkenColor(style.wall, 0.82), roughness: 0.6 });
        return [sideX, sideX, roof, roof, sideZ, sideZ];
    }, [b.width, b.depth, b.height, flat, plinth, style]);

    const grass = useMemo(() => (flat ? createGrassTexture(Math.max(2, Math.round(b.width / 6))) : null), [flat, b.width]);
    const highlight = hovered || active;

    const pointer = {
        onPointerOver: (e: any) => { e.stopPropagation(); setHovered(true); },
        onPointerOut: (e: any) => { e.stopPropagation(); setHovered(false); },
        onClick: (e: any) => { e.stopPropagation(); onSelect(b); },
    };

    return (
        <group>
            {flat ? (
                <mesh position={[cx, 0.08, cz]} receiveShadow {...pointer}>
                    <boxGeometry args={[b.width, 0.15, b.depth]} />
                    <meshStandardMaterial map={grass} color={highlight ? '#b8e0a8' : '#ffffff'} roughness={0.9} />
                </mesh>
            ) : (
                <>
                    <mesh position={[cx, plinth / 2, cz]} receiveShadow {...pointer}>
                        <boxGeometry args={[b.width + 0.2, plinth, b.depth + 0.2]} />
                        <meshStandardMaterial color={darkenColor(style.wall)} roughness={0.95} />
                    </mesh>
                    <mesh position={[cx, plinth + (b.height - plinth) / 2, cz]} castShadow receiveShadow material={materials!} {...pointer}
                        scale={highlight ? [1.015, 1.02, 1.015] : [1, 1, 1]}>
                        <boxGeometry args={[b.width, b.height - plinth, b.depth]} />
                    </mesh>
                </>
            )}
            <Html position={[cx, b.height + 1.6, cz]} center occlude={false} zIndexRange={[10, 0]}>
                <div className="relative select-none" onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)} onClick={() => onSelect(b)}>
                    <button className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer border-4 border-white/70 transition-all ${active ? 'bg-slate-900 scale-110' : hovered ? 'bg-slate-900' : 'bg-blue-600'}`}>
                        <Icon size={16} />
                    </button>
                    {highlight && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-white/40 pointer-events-none">
                            <p className="font-black text-slate-900 text-xs uppercase mb-0.5 tracking-tight">{b.name}</p>
                            {b.description && <p className="text-slate-500 text-[10px] font-medium leading-relaxed">{b.description}</p>}
                            {b.locales?.length ? <p className="text-blue-600 text-[10px] font-black mt-1">{b.locales.join(' · ')}</p> : null}
                        </div>
                    )}
                </div>
            </Html>
        </group>
    );
};

const CAR_COLORS = ['#c94f4f', '#3d5a80', '#e2e2e4', '#2b2d33', '#8a8f98', '#5c7a5f'];

const Car: React.FC<{ x: number; z: number; color: string }> = ({ x, z, color }) => (
    <group position={[x, 0, z]}>
        <mesh position={[0, 0.28, 0]} castShadow>
            <boxGeometry args={[1.8, 0.5, 4]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.62, -0.2]} castShadow>
            <boxGeometry args={[1.5, 0.34, 2]} />
            <meshStandardMaterial color="#1c2530" roughness={0.25} />
        </mesh>
    </group>
);

/** A parking row: striped stalls along its width, about two of every three occupied. */
const ParkingRow: React.FC<{ row: { x: number; y: number; width: number; depth: number; spaces: number }; seed: number }> = ({ row, seed }) => {
    const [cx, cz] = center(row);
    const tex = useMemo(() => createParkingStripeTexture(row.spaces), [row.spaces]);
    const cars = useMemo(() => {
        const slot = row.width / row.spaces;
        return Array.from({ length: row.spaces }, (_, i) => i)
            .filter(i => (i * 7 + seed * 3) % 3 !== 2)
            .map(i => ({ x: cx - row.width / 2 + (i + 0.5) * slot, color: CAR_COLORS[(i + seed) % CAR_COLORS.length] }));
    }, [cx, row.width, row.spaces, seed]);
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.09, cz]} receiveShadow>
                <planeGeometry args={[row.width, row.depth]} />
                <meshStandardMaterial map={tex} roughness={1} />
            </mesh>
            {row.depth >= 4.5 && cars.map((c, i) => <Car key={i} x={c.x} z={cz} color={c.color} />)}
        </group>
    );
};

const Tree: React.FC<{ x: number; z: number; variant: number }> = ({ x, z, variant }) => {
    const color = useMemo(() => new THREE.Color(`hsl(${96 + (variant % 5) * 6}, 38%, ${30 + (variant % 3) * 4}%)`), [variant]);
    return (
        <group position={[x, 0, z]}>
            <mesh position={[0, 0.55, 0]} castShadow>
                <cylinderGeometry args={[0.13, 0.18, 1.1, 6]} />
                <meshStandardMaterial color="#6b5236" roughness={0.95} />
            </mesh>
            <mesh position={[0, 1.6, 0]} castShadow>
                <icosahedronGeometry args={[1.05, 0]} />
                <meshStandardMaterial color={color} roughness={0.95} flatShading />
            </mesh>
            <mesh position={[0.4, 1.9, 0.2]} castShadow>
                <icosahedronGeometry args={[0.58, 0]} />
                <meshStandardMaterial color={color} roughness={0.95} flatShading />
            </mesh>
        </group>
    );
};

const Green: React.FC<{ g: { x: number; y: number; width: number; depth: number; trees?: number }; seed: number }> = ({ g, seed }) => {
    const [cx, cz] = center(g);
    const grass = useMemo(() => createGrassTexture(Math.max(1, Math.round(Math.max(g.width, g.depth) / 6))), [g.width, g.depth]);
    const trees = g.trees ?? 0;
    const long = g.depth >= g.width;
    return (
        <group>
            <mesh position={[cx, 0.07, cz]} receiveShadow>
                <boxGeometry args={[g.width, 0.12, g.depth]} />
                <meshStandardMaterial map={grass} roughness={1} />
            </mesh>
            {Array.from({ length: trees }, (_, i) => {
                const t = (i + 0.5) / trees;
                const x = long ? cx : cx - g.width / 2 + t * g.width;
                const z = long ? cz - g.depth / 2 + t * g.depth : cz;
                return <Tree key={i} x={x} z={z} variant={i + seed} />;
            })}
        </group>
    );
};

const Scene: React.FC<{ selected: LayoutBuilding | null; onSelect: (b: LayoutBuilding) => void }> = ({ selected, onSelect }) => {
    const asphalt = useMemo(() => createAsphaltTexture(Math.round(Math.max(lot.width, lot.depth) / 5)), []);
    const grassBorder = useMemo(() => createGrassTexture(30), []);
    const court = useMemo(() => createMultiCourtTexture(), []);
    const size = Math.max(lot.width, lot.depth);
    const hasSports = plaza.layout.buildings.some(b => b.kind === 'sports');

    return (
        <>
            <PerspectiveCamera makeDefault position={[size * 0.15, size * 1.05, size * 0.85]} fov={45} near={1} far={size * 8} />
            <OrbitControls makeDefault target={[0, 0, 0]} minDistance={size * 0.3} maxDistance={size * 2.2} maxPolarAngle={Math.PI / 2.15} enableDamping dampingFactor={0.08} />
            <Sky sunPosition={[140, 90, 80]} turbidity={3} rayleigh={1.2} mieCoefficient={0.006} mieDirectionalG={0.85} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[size, size * 1.4, size * 0.6]} intensity={1.7} color="#fff6e6" castShadow
                shadow-mapSize={[2048, 2048]} shadow-camera-left={-size} shadow-camera-right={size} shadow-camera-top={size} shadow-camera-bottom={-size} />
            <hemisphereLight args={['#eaf3ff', '#5a6270', 0.55]} />

            {/* Surroundings, then the lot slab with a brand-colored outline. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
                <planeGeometry args={[lot.width * 1.6, lot.depth * 1.7]} />
                <meshStandardMaterial map={grassBorder} color="#9db892" roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, lot.depth / 2 + 7]} receiveShadow>
                <planeGeometry args={[lot.width * 1.5, 10]} />
                <meshStandardMaterial map={asphalt} color="#83878d" roughness={1} />
            </mesh>
            <mesh position={[0, 0, 0]} receiveShadow>
                <boxGeometry args={[lot.width, 0.08, lot.depth]} />
                <meshStandardMaterial map={asphalt} color="#c7ccd2" roughness={0.95} />
            </mesh>
            <lineSegments position={[0, 0.06, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(lot.width, 0.01, lot.depth)]} />
                <lineBasicMaterial color={plaza.colors.primary} />
            </lineSegments>

            {plaza.layout.parking.map((row, i) => <ParkingRow key={i} row={row} seed={i} />)}
            {plaza.layout.greens.map((g, i) => <Green key={i} g={g} seed={i * 3} />)}
            {/* Sports buildings get a court painted on the pavement in front, when it fits. */}
            {hasSports && (() => {
                const b = plaza.layout.buildings.find(x => x.kind === 'sports')!;
                const [cx, cz] = center(b);
                const w = Math.min(16, b.width * 0.4), d = Math.min(10, b.depth * 0.6);
                const z = cz + b.depth / 2 + d / 2 + 1.5;
                return z + d / 2 < lot.depth / 2 && !plaza.layout.parking.some(p => Math.abs(center(p)[1] - z) < (p.depth + d) / 2) ? (
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.085, z]} receiveShadow>
                        <planeGeometry args={[w, d]} />
                        <meshStandardMaterial map={court} roughness={1} />
                    </mesh>
                ) : null;
            })()}
            {plaza.layout.buildings.map(b => <Building key={b.id} b={b} active={selected?.id === b.id} onSelect={onSelect} />)}

            <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={size * 2} blur={2.2} far={20} />
        </>
    );
};

const CanvasFallback: React.FC = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-[10px] font-black uppercase tracking-widest">Cargando modelo 3D...</span>
        </div>
    </div>
);

export const PlanSection3D: React.FC = () => {
    const [selected, setSelected] = useState<LayoutBuilding | null>(null);
    const cards = plaza.layout.buildings.filter(b => b.kind !== 'service');

    return (
        <section id="plan-3d" className="py-24 bg-white overflow-hidden">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16 space-y-4">
                    <motion.span initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        className="text-blue-600 font-black uppercase tracking-[0.3em] text-sm">
                        Explora {plaza.shortName}
                    </motion.span>
                    <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                        className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter">
                        Master Plan <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">3D Interactivo</span>
                    </motion.h2>
                    <motion.p initial={{ opacity: 0, y: 20 }} viewport={{ once: true }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="text-slate-500 max-w-2xl mx-auto font-medium text-lg">
                        Maqueta generada a partir de la configuración de la plaza: edificios, locales, espacios para eventos y estacionamiento.
                        Gira, acerca y explora cada espacio.
                    </motion.p>
                </div>

                <motion.div initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                    className="relative rounded-[3rem] overflow-hidden shadow-2xl border-4 border-slate-50 bg-slate-100" style={{ height: '640px' }}>
                    <Suspense fallback={<CanvasFallback />}>
                        <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: true, preserveDrawingBuffer: true }} onPointerMissed={() => setSelected(null)}>
                            <Scene selected={selected} onSelect={setSelected} />
                        </Canvas>
                    </Suspense>
                    <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-lg pointer-events-none">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Arrastra para girar · scroll para zoom</p>
                    </div>
                </motion.div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
                    {cards.map((b, idx) => {
                        const Icon = ICONS[b.kind] || Building2;
                        const isActive = selected?.id === b.id;
                        return (
                            <motion.button key={b.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                                transition={{ delay: 0.4 + idx * 0.06 }} onClick={() => setSelected(b)}
                                className={`text-left bg-slate-50 p-6 rounded-3xl border transition-all group ${isActive ? 'border-blue-400 bg-white shadow-md' : 'border-slate-100 hover:border-blue-200 hover:bg-white'}`}>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm mb-4 transition-all ${isActive ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 group-hover:bg-blue-600 group-hover:text-white'}`}>
                                    <Icon size={22} />
                                </div>
                                <h4 className="font-black text-slate-800 text-sm mb-2">{b.name}</h4>
                                {b.description && <p className="text-slate-500 text-[10px] font-bold uppercase leading-tight">{b.description}</p>}
                                <p className="text-blue-600 text-[10px] font-black uppercase mt-2">{Math.round(b.width * b.depth).toLocaleString(plaza.locale)} m²</p>
                            </motion.button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
