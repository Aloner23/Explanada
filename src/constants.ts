
import { Tenant, Transaction, ParkingConfig, Reservation, GalleryImage, LoginUser, UserRole } from './types';
import { plaza } from './config/plaza';

// Logo de la plaza (plaza.config → logo, relativo a public/)
export const LOGO_URL = plaza.logo;

export const INITIAL_USERS: LoginUser[] = [];

// Datos sintéticos de ejemplo (no corresponden a operación real).
const HISTORICAL_RAW = `2025-01-04,Matutino,20,2,1,300
2025-01-04,Vespertino,40,4,2,600
2025-02-08,Matutino,25,3,1,375
2025-02-08,Vespertino,50,5,2,750`;

const parseHistorical = (): Transaction[] => {
  return HISTORICAL_RAW.split('\n').map((line, i) => {
    const [fecha, turno, cobrados, tol, vis, importe] = line.split(',');
    return {
      id: `hist-${i}`,
      type: 'PARKING',
      amount: parseInt(importe) || 0,
      date: fecha,
      description: `Cierre Histórico ${turno} (${cobrados} autos)`,
      status: 'completed',
      paymentMethod: 'CASH',
      cars_charged: parseInt(cobrados) || 0, // Inyectamos el valor numérico directo
      courtesies: parseInt(tol) || 0
    };
  });
};

export const INITIAL_TRANSACTIONS: Transaction[] = [
  ...parseHistorical(),
  { id: 't-init-1', type: 'RENT', amount: 10000, date: '2025-01-05', description: 'Renta Enero - Negocio Demo A', status: 'completed', paymentMethod: 'CASH' },
];

export const INITIAL_TENANTS: Tenant[] = [
  { id: '1', name: 'Persona Demo A', businessName: 'Negocio Demo A', localNumber: 'A-101', rentAmount: 10000, maintenanceFee: 1000, paymentDay: 5, email: 'demo-a@example.com', status: 'active', lastPaymentDate: '2025-01-05', tenantType: 'LOCAL' },
  { id: '2', name: 'Persona Demo B', businessName: 'Negocio Demo B', localNumber: 'B-202', rentAmount: 8000, maintenanceFee: 800, paymentDay: 1, email: 'demo-b@example.com', status: 'late', lastPaymentDate: '2024-12-01', tenantType: 'LOCAL' },
];

export const INITIAL_PARKING_CONFIG: ParkingConfig = {
  hourlyRate: plaza.parking.hourlyRate,
  freeMinutes: plaza.parking.freeMinutes,
  dailyMax: plaza.parking.dailyMax,
  selloDiscount: 0,
  plazaName: plaza.name,
};

export const INITIAL_RESERVATIONS: Reservation[] = [];

export const INITIAL_GALLERY_IMAGES: GalleryImage[] = [
  { id: '1', category: 'exterior', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800', title: 'Fachada Principal' },
];

export const INITIAL_AD_SPACES: any[] = [];
export const INITIAL_STAFF: any[] = [];
export const INITIAL_TASKS: any[] = [];
