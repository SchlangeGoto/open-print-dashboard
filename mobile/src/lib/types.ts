export interface UserPublic {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
}

export interface TenantMembership {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  role: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string | null;
}

export interface TenantMember {
  user_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: string;
  created_at: string | null;
}

export interface TenantInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string | null;
  invited_by: string | null;
}

export interface TenantInviteCreated extends TenantInvite {
  token: string | null;
  accept_url: string | null;
}

export interface Filament {
  id: string;
  brand: string;
  material: string;
  series: string | null;
  color_name: string;
  color_hex: string;
  nozzle_temp_min: number | null;
  nozzle_temp_max: number | null;
  bed_temp: number | null;
  bambu_info_idx: string | null;
  spool_weight_g: number;
  default_price_per_kg: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface FilamentInput {
  brand: string;
  material: string;
  series?: string;
  color_name: string;
  color_hex: string;
  spool_weight_g?: number;
  default_price_per_kg?: number;
  nozzle_temp_min?: number;
  nozzle_temp_max?: number;
  bed_temp?: number;
  notes?: string;
}

export interface Spool {
  id: string;
  filament_id: string | null;
  printer_id: string | null;
  total_weight_g: number;
  remaining_g: number;
  remaining_unknown: boolean;
  tag_uid: string | null;
  barcode: string | null;
  source: string | null;
  active: boolean;
  price_per_kg: number | null;
  purchased_at: string | null;
  last_used_at: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface Printer {
  id: string | null;
  name: string;
  serial: string;
  model: string | null;
  online: boolean;
  configured: boolean;
  status: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PrintJob {
  id: string;
  title: string;
  cover: string | null;
  weight: number | null;
  estimated_cost: number | null;
  duration_seconds: number | null;
  start_time: string | null;
  finished_at: string | null;
  status: number | null;
  bambu_task_id: string | null;
  device_id: string | null;
  ams_detail_mapping?: string | null;
  filament_id: string | null;
  spool_id: string | null;
  created_at: string | null;
}

export type PrintJobStatus = "printing" | "finished" | "failed" | "unknown";

export interface ListResponse<T> {
  data: T[];
  count: number;
}

export interface SuggestedFilament {
  sku?: string;
  series_code?: string;
  series?: string | null;
  color_code?: string;
  diameter?: number;
  spool_weight_g?: number;
  refill?: boolean;
}

export interface BarcodeScanResult {
  found: boolean;
  code: string;
  filament: Filament | null;
  spool: Spool | null;
  created: boolean;
  existing_spools: Spool[];
  suggested_filament: SuggestedFilament | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface SpoolsLoadResult {
  spools: Spool[];
  filaments: Filament[];
  printers: Printer[];
}

export interface PrintersLoadResult {
  printers: Printer[];
  spools: Spool[];
  filaments: Filament[];
}

export interface SpoolDetailData {
  spool: Spool;
  filament: Filament | null;
  printers: Printer[];
}
