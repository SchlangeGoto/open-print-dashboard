/**
 * Mock data used by the development-only demo mode (`lib/demo-api.ts`).
 *
 * Print timestamps are generated relative to "now" so the activity charts
 * always look populated instead of drifting into the past over time.
 */

type DemoPrint = {
  id: string;
  spool_id: string | null;
  title: string;
  cover: string | null;
  weight: number;
  estimated_cost: number;
  duration_seconds: number;
  start_time: string;
  finished_at: string | null;
  status: number;
  bambu_task_id: string;
  device_id: string;
  mc_percent?: number;
  mc_remaining_time?: number;
};

type DemoSpool = {
  id: string;
  filament_id: string;
  total_weight_g: number;
  remaining_g: number;
  nfc_uid: string | null;
  tag_uid?: string | null;
  barcode?: string | null;
  source?: string | null;
  active: boolean;
  printer_id?: string | null;
  price_per_kg: number;
  purchased_at: string;
  created_at: string;
  last_used_at: string | null;
  notes: string | null;
};

function id(prefix: number, value: number): string {
  return `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function isoDaysAgo(days: number, hour = 12, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function isoHoursAgo(hours: number, minute = 0): string {
  const date = new Date();
  date.setHours(date.getHours() - hours, minute, 0, 0);
  return date.toISOString();
}

function finishTime(start: string, durationSeconds: number): string {
  return new Date(
    new Date(start).getTime() + durationSeconds * 1000,
  ).toISOString();
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Printers ────────────────────────────────────────────────────────────────
export const X1C_DEVICE_ID = "01P09C450400001";
export const P1S_DEVICE_ID = "01P09C350200002";
export const A1_MINI_DEVICE_ID = "0309C5A1B700003";

export const DEMO_PRINTERS = [
  {
    dev_id: X1C_DEVICE_ID,
    name: "X1 Carbon",
    dev_model_name: "Bambu Lab X1 Carbon",
    online: true,
  },
  {
    dev_id: P1S_DEVICE_ID,
    name: "P1S Garage",
    dev_model_name: "Bambu Lab P1S",
    online: true,
  },
  {
    dev_id: A1_MINI_DEVICE_ID,
    name: "A1 Mini",
    dev_model_name: "Bambu Lab A1 mini",
    online: false,
  },
];

export const DEMO_PRINTER_STATUS = {
  dev_id: X1C_DEVICE_ID,
  connected: true,
  gcode_state: "RUNNING",
  subtask_name: "Time Saver Filament Clip",
  mc_percent: 47,
  mc_remaining_time: 83,
  nozzle_temper: 220,
  nozzle_target_temper: 220,
  bed_temper: 65,
  bed_target_temper: 65,
  cooling_fan_speed: 7,
  spd_lvl: 2,
  spd_mag: 100,
  mc_print_energy: 128,
};

export const DEMO_CLOUD_STATUS = [
  { ...DEMO_PRINTER_STATUS },
  {
    dev_id: P1S_DEVICE_ID,
    connected: true,
    gcode_state: "RUNNING",
    subtask_name: "A1 / A1 Mini Lube Nozzle - Y-Axis Lubrication",
    mc_percent: 31,
    mc_remaining_time: 142,
    nozzle_temper: 218,
    nozzle_target_temper: 220,
    bed_temper: 64,
    bed_target_temper: 65,
    cooling_fan_speed: 6,
    spd_lvl: 2,
    spd_mag: 100,
    mc_print_energy: 96,
  },
];

export const DEMO_PRINTER_RECORDS = [
  {
    id: "0000000a-0000-4000-8000-000000000001",
    name: "X1 Carbon",
    serial: X1C_DEVICE_ID,
    model: "Bambu Lab X1 Carbon",
    ip: "192.168.1.42",
    access_code: "12345678",
    configured: true,
    online: true,
    status: DEMO_CLOUD_STATUS[0],
    created_at: isoDaysAgo(30),
    updated_at: isoDaysAgo(30),
  },
  {
    id: "0000000a-0000-4000-8000-000000000002",
    name: "P1S Garage",
    serial: P1S_DEVICE_ID,
    model: "Bambu Lab P1S",
    ip: "192.168.1.43",
    access_code: "87654321",
    configured: true,
    online: true,
    status: DEMO_CLOUD_STATUS[1],
    created_at: isoDaysAgo(20),
    updated_at: isoDaysAgo(20),
  },
  {
    id: null,
    name: "A1 Mini",
    serial: A1_MINI_DEVICE_ID,
    model: "Bambu Lab A1 mini",
    ip: null,
    access_code: null,
    configured: false,
    online: false,
    status: null,
    created_at: null,
    updated_at: null,
  },
];

export const DEMO_FIRMWARE = {
  firmware: [
    { name: "ota", version: "01.08.04.00" },
    { name: "ahb", version: "00.00.05.66" },
    { name: "esp32", version: "01.03.01.00" },
    { name: "ams", version: "00.00.07.88" },
  ],
};

// ─── Filaments ───────────────────────────────────────────────────────────────
export const DEMO_FILAMENTS = [
  {
    id: id(1, 1),
    brand: "Bambu Lab",
    material: "PLA",
    color_name: "Bambu Green",
    color_hex: "#22c55e",
    nozzle_temp_min: 190,
    nozzle_temp_max: 230,
    bed_temp: 35,
    bambu_info_idx: "GFL00",
    notes: null,
    created_at: isoDaysAgo(280, 10, 0),
  },
  {
    id: id(1, 2),
    brand: "Bambu Lab",
    material: "PLA",
    color_name: "Galaxy Black",
    color_hex: "#1f2937",
    nozzle_temp_min: 190,
    nozzle_temp_max: 230,
    bed_temp: 35,
    bambu_info_idx: "GFL01",
    notes: null,
    created_at: isoDaysAgo(260, 10, 0),
  },
  {
    id: id(1, 3),
    brand: "Polymaker",
    material: "PLA",
    color_name: "Polar White",
    color_hex: "#f1f5f9",
    nozzle_temp_min: 195,
    nozzle_temp_max: 225,
    bed_temp: 40,
    bambu_info_idx: "GFL02",
    notes: null,
    created_at: isoDaysAgo(230, 10, 0),
  },
  {
    id: id(1, 4),
    brand: "Bambu Lab",
    material: "PETG",
    color_name: "Ocean Blue",
    color_hex: "#3b82f6",
    nozzle_temp_min: 230,
    nozzle_temp_max: 260,
    bed_temp: 75,
    bambu_info_idx: "GFG99",
    notes: null,
    created_at: isoDaysAgo(215, 10, 0),
  },
  {
    id: id(1, 5),
    brand: "Hatchbox",
    material: "ABS",
    color_name: "Signal Red",
    color_hex: "#ef4444",
    nozzle_temp_min: 220,
    nozzle_temp_max: 250,
    bed_temp: 100,
    bambu_info_idx: "GFA00",
    notes: "Needs enclosure",
    created_at: isoDaysAgo(245, 10, 0),
  },
  {
    id: id(1, 6),
    brand: "Prusament",
    material: "PLA",
    color_name: "Prusa Orange",
    color_hex: "#f97316",
    nozzle_temp_min: 215,
    nozzle_temp_max: 230,
    bed_temp: 60,
    bambu_info_idx: "GFL05",
    notes: null,
    created_at: isoDaysAgo(205, 10, 0),
  },
  {
    id: id(1, 7),
    brand: "Bambu Lab",
    material: "TPU",
    color_name: "Mist Gray",
    color_hex: "#9ca3af",
    nozzle_temp_min: 220,
    nozzle_temp_max: 240,
    bed_temp: 35,
    bambu_info_idx: "GFU01",
    notes: "Flex material",
    created_at: isoDaysAgo(190, 10, 0),
  },
  {
    id: id(1, 8),
    brand: "eSUN",
    material: "ASA",
    color_name: "Matte Black",
    color_hex: "#374151",
    nozzle_temp_min: 240,
    nozzle_temp_max: 260,
    bed_temp: 95,
    bambu_info_idx: "GFL99",
    notes: "UV resistant",
    created_at: isoDaysAgo(175, 10, 0),
  },
];

// ─── Spools ──────────────────────────────────────────────────────────────────
export const DEMO_SPOOLS: DemoSpool[] = [
  {
    id: id(2, 1),
    filament_id: id(1, 1),
    total_weight_g: 1000,
    remaining_g: 820,
    nfc_uid: "04:A2:3F:2B",
    active: true,
    printer_id: "0000000a-0000-4000-8000-000000000002",
    price_per_kg: 24.99,
    purchased_at: isoDaysAgo(250, 12, 0),
    created_at: isoDaysAgo(250, 12, 0),
    last_used_at: isoDaysAgo(12, 10, 30),
    notes: null,
  },
  {
    id: id(2, 2),
    filament_id: id(1, 1),
    total_weight_g: 1000,
    remaining_g: 600,
    nfc_uid: null,
    active: false,
    price_per_kg: 24.99,
    purchased_at: isoDaysAgo(230, 12, 0),
    created_at: isoDaysAgo(230, 12, 0),
    last_used_at: isoDaysAgo(16, 14, 20),
    notes: null,
  },
  {
    id: id(2, 3),
    filament_id: id(1, 2),
    total_weight_g: 1000,
    remaining_g: 380,
    nfc_uid: "04:B1:2A:FF",
    active: true,
    printer_id: "0000000a-0000-4000-8000-000000000001",
    price_per_kg: 24.99,
    purchased_at: isoDaysAgo(220, 12, 0),
    created_at: isoDaysAgo(220, 12, 0),
    last_used_at: isoDaysAgo(0, 9, 45),
    notes: null,
  },
  {
    id: id(2, 4),
    filament_id: id(1, 3),
    total_weight_g: 1000,
    remaining_g: 1000,
    nfc_uid: null,
    active: false,
    price_per_kg: 19.9,
    purchased_at: isoDaysAgo(200, 12, 0),
    created_at: isoDaysAgo(200, 12, 0),
    last_used_at: null,
    notes: "Unopened",
  },
  {
    id: id(2, 5),
    filament_id: id(1, 3),
    total_weight_g: 1000,
    remaining_g: 750,
    nfc_uid: null,
    active: false,
    price_per_kg: 19.9,
    purchased_at: isoDaysAgo(190, 12, 0),
    created_at: isoDaysAgo(190, 12, 0),
    last_used_at: isoDaysAgo(10, 16, 0),
    notes: null,
  },
  {
    id: id(2, 6),
    filament_id: id(1, 3),
    total_weight_g: 1000,
    remaining_g: 450,
    nfc_uid: null,
    active: false,
    price_per_kg: 19.9,
    purchased_at: isoDaysAgo(280, 12, 0),
    created_at: isoDaysAgo(280, 12, 0),
    last_used_at: isoDaysAgo(18, 11, 0),
    notes: null,
  },
  {
    id: id(2, 7),
    filament_id: id(1, 4),
    total_weight_g: 1000,
    remaining_g: 670,
    nfc_uid: null,
    active: false,
    price_per_kg: 27.99,
    purchased_at: isoDaysAgo(210, 12, 0),
    created_at: isoDaysAgo(210, 12, 0),
    last_used_at: isoDaysAgo(11, 9, 0),
    notes: null,
  },
  {
    id: id(2, 8),
    filament_id: id(1, 5),
    total_weight_g: 1000,
    remaining_g: 900,
    nfc_uid: null,
    active: false,
    price_per_kg: 22.5,
    purchased_at: isoDaysAgo(240, 12, 0),
    created_at: isoDaysAgo(240, 12, 0),
    last_used_at: null,
    notes: null,
  },
  {
    id: id(2, 9),
    filament_id: id(1, 6),
    total_weight_g: 1000,
    remaining_g: 880,
    nfc_uid: null,
    active: false,
    price_per_kg: 29.99,
    purchased_at: isoDaysAgo(205, 12, 0),
    created_at: isoDaysAgo(205, 12, 0),
    last_used_at: isoDaysAgo(7, 14, 0),
    notes: null,
  },
  {
    id: id(2, 10),
    filament_id: id(1, 6),
    total_weight_g: 1000,
    remaining_g: 880,
    nfc_uid: null,
    active: false,
    price_per_kg: 29.99,
    purchased_at: isoDaysAgo(195, 12, 0),
    created_at: isoDaysAgo(195, 12, 0),
    last_used_at: null,
    notes: null,
  },
  {
    id: id(2, 11),
    filament_id: id(1, 7),
    total_weight_g: 500,
    remaining_g: 430,
    nfc_uid: null,
    active: false,
    price_per_kg: 34.99,
    purchased_at: isoDaysAgo(225, 12, 0),
    created_at: isoDaysAgo(225, 12, 0),
    last_used_at: isoDaysAgo(14, 10, 0),
    notes: null,
  },
  {
    id: id(2, 12),
    filament_id: id(1, 8),
    total_weight_g: 1000,
    remaining_g: 950,
    nfc_uid: null,
    active: false,
    price_per_kg: 26,
    purchased_at: isoDaysAgo(198, 12, 0),
    created_at: isoDaysAgo(198, 12, 0),
    last_used_at: null,
    notes: null,
  },
  {
    id: id(2, 13),
    filament_id: id(1, 1),
    total_weight_g: 1000,
    remaining_g: 0,
    nfc_uid: null,
    active: false,
    price_per_kg: 24.99,
    purchased_at: isoDaysAgo(340, 12, 0),
    created_at: isoDaysAgo(340, 12, 0),
    last_used_at: isoDaysAgo(20, 9, 0),
    notes: "Empty",
  },
];

export const DEMO_BARCODES: Record<string, any> = {
  "6975337032380": {
    sku: "A01-A2-1.75-1000-SPL",
    brand: "Bambu Lab",
    material: "PLA",
    color_name: "Mandarin Orange",
    color_hex: "#F99963",
    bambu_info_idx: "GFA01",
    spool_weight_g: 1000,
    nozzle_temp_min: 190,
    nozzle_temp_max: 230,
    bed_temp: 45,
    notes: "Bambu PLA Matte · product 11300",
  },
  "6975337031376": {
    sku: "A01-R1-1.75-1000-SPL",
    brand: "Bambu Lab",
    material: "PLA",
    color_name: "Scarlet Red",
    color_hex: "#DE4343",
    bambu_info_idx: "GFA01",
    spool_weight_g: 1000,
    nozzle_temp_min: 190,
    nozzle_temp_max: 230,
    bed_temp: 45,
    notes: "Bambu PLA Matte · product 11200",
  },
};

function spoolPrice(spoolId: string): number {
  return DEMO_SPOOLS.find((spool) => spool.id === spoolId)?.price_per_kg ?? 24.99;
}

function printCost(spoolId: string, weightGrams: number): number {
  return round((weightGrams / 1000) * spoolPrice(spoolId));
}

// ─── Prints ──────────────────────────────────────────────────────────────────
const ACTIVE_PRINTS: DemoPrint[] = [
  {
    id: id(3, 1),
    spool_id: id(2, 3),
    title: "Time Saver Filament Clip",
    cover: "/covers/916732123_Time_Saver_Filament_Clip.png",
    weight: 1.16,
    estimated_cost: printCost(id(2, 3), 1.16),
    duration_seconds: 843,
    start_time: isoHoursAgo(2, 12),
    finished_at: null,
    status: 4,
    bambu_task_id: "demo-task-001",
    device_id: X1C_DEVICE_ID,
    mc_percent: 47,
    mc_remaining_time: 83,
  },
  {
    id: id(3, 2),
    spool_id: id(2, 1),
    title: "A1 / A1 Mini Lube Nozzle - Y-Axis Lubrication",
    cover: "/covers/916681792_A1___A1_Mini_Lube_Nozzle___Y_A.png",
    weight: 1.61,
    estimated_cost: printCost(id(2, 1), 1.61),
    duration_seconds: 1662,
    start_time: isoHoursAgo(1, 24),
    finished_at: null,
    status: 4,
    bambu_task_id: "demo-task-002",
    device_id: P1S_DEVICE_ID,
    mc_percent: 31,
    mc_remaining_time: 142,
  },
];

function finishedPrint(
  sequence: number,
  daysAgo: number,
  hour: number,
  minute: number,
  spoolId: string,
  title: string,
  cover: string,
  weight: number,
  duration: number,
  status = 2,
  deviceId = X1C_DEVICE_ID,
): DemoPrint {
  const start = isoDaysAgo(daysAgo, hour, minute);
  return {
    id: id(3, sequence),
    spool_id: spoolId,
    title,
    cover,
    weight,
    estimated_cost: printCost(spoolId, weight),
    duration_seconds: duration,
    start_time: start,
    finished_at: finishTime(start, duration),
    status,
    bambu_task_id: `demo-task-${String(sequence).padStart(3, "0")}`,
    device_id: deviceId,
  };
}

const CURATED_FINISHED_PRINTS: DemoPrint[] = [
  finishedPrint(
    3, 1, 9, 10,
    id(2, 3), "MotorCover.stl + MotorCover.stl",
    "/covers/878961270_MotorCover_stl___MotorCover_st.png",
    0.7, 617,
  ),
  finishedPrint(
    4, 2, 14, 5,
    id(2, 5), "2PinC.stl + 2PinC.stl",
    "/covers/803327579_2PinC_stl___2PinC_stl.png",
    1.36, 686,
  ),
  finishedPrint(
    5, 3, 10, 30,
    id(2, 7), "MuzzleCap.stl",
    "/covers/802865951_MuzzleCap_stl.png",
    29.77, 4744,
  ),
  finishedPrint(
    6, 4, 8, 15,
    id(2, 2), "2PinC.stl + 3PinB.stl + 3PinB.stl + 4PinA.stl + 4PinA.stl + 4PinA.stl",
    "/covers/801965274_2PinC_stl___3PinB_stl___3PinB_.png",
    2.79, 914,
  ),
  finishedPrint(
    7, 5, 16, 0,
    id(2, 11), "2Turnaround.stl + TurnaroundPin.stl + 2Turnaround.stl",
    "/covers/800987038_2Turnaround_stl___TurnaroundPi.png",
    7.02, 1414,
  ),
  finishedPrint(
    8, 7, 20, 10,
    id(2, 9), "MagLever.stl + Trigger.stl + TurnaroundPin.stl + TriggerLever.stl + PinD.stl",
    "/covers/800161732_MagLever_stl___Trigger_stl___T.png",
    16.91, 3090,
  ),
  finishedPrint(
    9, 8, 11, 45,
    id(2, 6), "MuzzleCap.stl + MagLever.stl + Trigger.stl + 2Turnaround.stl",
    "/covers/800158283_MuzzleCap_stl___MagLever_stl__.png",
    49.64, 7668, 3,
  ),
  finishedPrint(
    10, 10, 9, 20,
    id(2, 1), "Magwell.stl",
    "/covers/796962486_Magwell_stl.png",
    96.95, 16651,
  ),
  finishedPrint(
    11, 12, 8, 5,
    id(2, 8), "Magwell.stl + SlideL.stl + SlideR.stl + Triggerguard.stl",
    "/covers/796301286_Magwell_stl___SlideL_stl___Sli.png",
    134.32, 21669,
  ),
  finishedPrint(
    12, 14, 10, 40,
    id(2, 5), "robust Ski Vise",
    "/covers/772957823_robust_Ski_Vise.png",
    214.37, 39327,
  ),
  finishedPrint(
    13, 18, 19, 25,
    id(2, 10), "Time Saver Filament Clip x12",
    "/covers/828716410_Time_Saver_Filament_Clip.png",
    13.9, 5320,
  ),
  finishedPrint(
    14, 23, 13, 15,
    id(2, 4), "MotorCover.stl",
    "/covers/878961270_MotorCover_stl___MotorCover_st.png",
    0.86, 742,
  ),
];

function buildHistoricalPrints(): DemoPrint[] {
  const random = mulberry32(20261107);
  const result: DemoPrint[] = [];
  const templates = CURATED_FINISHED_PRINTS;

  for (let index = 0; index < 110; index += 1) {
    const template = templates[index % templates.length];
    const daysAgo =
      index < 30
        ? 1 + Math.floor(random() * 55)
        : 56 + Math.floor(random() * 300);
    const hour = 8 + Math.floor(random() * 13);
    const minute = Math.floor(random() * 60);
    const weight = round(template.weight * (0.65 + random() * 0.8));
    const duration = Math.max(
      60,
      Math.round(template.duration_seconds * (0.7 + random() * 0.6)),
    );
    const status = random() < 0.08 ? 3 : 2;
    const deviceId =
      random() < 0.72 ? X1C_DEVICE_ID : P1S_DEVICE_ID;
    const start = isoDaysAgo(daysAgo, hour, minute);

    result.push({
      id: id(3, 100 + index),
      spool_id: template.spool_id,
      title: template.title,
      cover: template.cover,
      weight,
      estimated_cost: printCost(template.spool_id ?? "", weight),
      duration_seconds: duration,
      start_time: start,
      finished_at: finishTime(start, duration),
      status,
      bambu_task_id: `demo-task-${100 + index}`,
      device_id: deviceId,
    });
  }

  return result;
}

export const DEMO_PRINTS: DemoPrint[] = [
  ...ACTIVE_PRINTS,
  ...CURATED_FINISHED_PRINTS,
  ...buildHistoricalPrints(),
].sort(
  (a, b) =>
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
);

// ─── App settings / printer config ───────────────────────────────────────────
export const DEMO_SETTINGS = [
  { key: "bambu_cloud_email", value: "demo@bambu.example" },
  { key: "bambu_cloud_token", value: "demo-token" },
  { key: "printer_ip", value: "192.168.1.42" },
  { key: "printer_serial", value: X1C_DEVICE_ID },
  { key: "printer_access_code", value: "12345678" },
];

export const DEMO_PRINTER_CONFIG = {
  ip: "192.168.1.42",
  serial: X1C_DEVICE_ID,
  access_code: "12345678",
};

export const DEMO_BAMBU_PROFILE = {
  uid: "demo_uid",
  name: "Demo User",
  email: "demo@bambu.example",
};
