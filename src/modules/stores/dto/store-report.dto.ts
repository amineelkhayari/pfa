export interface StoreReportEvolutionPoint {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Sep 18"
  orders: number;
  revenue: number;
  confirmed: number;
  fulfilled: number;
  pending: number;
  cancelled: number;
}

export interface StoreReportStatusBreakdown {
  confirmed: number;
  fulfilled: number;
  pending: number;
  cancelled: number;
  notSent: number;
  failed: number;
}

export interface StoreReportSummary {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  averageOrderValue: number;
  confirmedOrders: number;
  confirmationRate: number; // percentage 0-100
  currency: string;
}

export interface StoreReportData {
  store: {
    id: string;
    name: string;
    provider: string;
    currency: string;
  };
  periodDays: number | null;
  summary: StoreReportSummary;
  statusBreakdown: StoreReportStatusBreakdown;
  evolution: StoreReportEvolutionPoint[];
}
