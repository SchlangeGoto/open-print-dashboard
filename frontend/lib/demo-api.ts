import type { ApiShape } from "./api";
import { DEMO_USER, demoStorageKey } from "./demo";
import {
  DEMO_BAMBU_PROFILE,
  DEMO_CLOUD_STATUS,
  DEMO_FILAMENTS,
  DEMO_FIRMWARE,
  DEMO_PRINTER_RECORDS,
  DEMO_PRINTER_STATUS,
  DEMO_PRINTS,
  DEMO_SETTINGS,
  DEMO_SPOOLS,
} from "./demo-data";

/**
 * In-browser implementation of the API used by demo mode. Reads/writes mock
 * data from localStorage so creating, editing and deleting things in the
 * dashboard actually works, without a backend.
 */

function delay<T>(value: T, ms = 70): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function load<T>(name: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(demoStorageKey(name));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(name: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(demoStorageKey(name), JSON.stringify(value));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getFilamentsRaw(): any[] {
  return load("filaments", DEMO_FILAMENTS as any[]);
}

function getSpoolsRaw(): any[] {
  return load("spools", DEMO_SPOOLS as any[]);
}

function getPrintsRaw(): any[] {
  return load("prints", DEMO_PRINTS as any[]);
}

function filamentsWithStats(): any[] {
  const spools = getSpoolsRaw();
  return getFilamentsRaw().map((filament) => {
    const owned = spools.filter((spool) => spool.filament_id === filament.id);
    const prices = owned
      .map((spool) => spool.price_per_kg)
      .filter((price): price is number => typeof price === "number");
    return {
      ...filament,
      total_remaining_g: round(
        owned.reduce((sum, spool) => sum + (spool.remaining_g ?? 0), 0),
      ),
      avg_price_per_kg:
        prices.length > 0
          ? round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
          : null,
    };
  });
}

function sortedPrints(): any[] {
  return [...getPrintsRaw()].sort(
    (a, b) =>
      new Date(b.start_time ?? 0).getTime() -
      new Date(a.start_time ?? 0).getTime(),
  );
}

function getPrintersRaw(): any[] {
  return load("printers", DEMO_PRINTER_RECORDS as any[]).map((printer) => ({
    ...printer,
    status: printer.status ? { ...printer.status } : null,
  }));
}

export const demoApi: ApiShape = {
  // ── Setup / auth ──────────────────────────────────────────────────────────
  getSetupStatus: () =>
    delay({
      user_created: true,
      bambu_logged_in: true,
      printer_configured: true,
      setup_complete: true,
    }),

  register: (email, _password, fullName) => {
    void _password;
    return delay({
      ...DEMO_USER,
      email: email || DEMO_USER.email,
      full_name: fullName ?? DEMO_USER.full_name,
    });
  },

  loginUser: (email) =>
    delay({
      ok: true,
      username: email || DEMO_USER.email,
      token: "demo-token",
    }),

  getMe: () => delay({ ...DEMO_USER }),

  recoverPassword: () =>
    delay({ message: "Password recovery email sent (demo mode)" }),

  resetPassword: () =>
    delay({ message: "Password reset (demo mode)" }),

  // ── Bambu Cloud Auth ──────────────────────────────────────────────────────
  bambuLoginStart: () =>
    delay({ message: "Login successful", requireCode: false }),

  bambuLoginVerify: () =>
    delay({ message: "Verified", codeExpired: false }),

  getBambuProfile: () => delay({ ...DEMO_BAMBU_PROFILE }),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: () => delay(load("settings", DEMO_SETTINGS as any[])),

  // ── Printers ──────────────────────────────────────────────────────────────
  getPrinters: () => delay(getPrintersRaw()),

  createPrinter: (data) => {
    const printers = getPrintersRaw();
    if (printers.some((printer) => printer.serial === data.serial)) {
      return Promise.reject(
        new Error("A printer with this serial number is already configured"),
      );
    }
    const now = new Date().toISOString();
    const printer = {
      id: newId(),
      ...data,
      model: null,
      configured: true,
      online: false,
      status: null,
      created_at: now,
      updated_at: now,
    };
    save("printers", [...printers, printer]);
    return delay(printer);
  },

  updatePrinter: (printerId, data) => {
    const printers = getPrintersRaw();
    let updated: any = null;
    const next = printers.map((printer) => {
      if (printer.id !== printerId) return printer;
      updated = {
        ...printer,
        ...data,
        updated_at: new Date().toISOString(),
      };
      return updated;
    });
    save("printers", next);
    return delay(updated);
  },

  deletePrinter: (printerId) => {
    save(
      "printers",
      getPrintersRaw().filter((printer) => printer.id !== printerId),
    );
    return delay({ message: "Printer removed (demo mode)" });
  },

  getPrinterStatus: () => delay({ ...DEMO_PRINTER_STATUS }),

  getCloudStatus: () =>
    delay(DEMO_CLOUD_STATUS.map((status) => ({ ...status }))),

  getTasks: (limit = 20) => delay(sortedPrints().slice(0, limit)),

  getPrinterTasks: (serial, limit = 20) =>
    delay(
      sortedPrints()
        .filter((print) => print.device_id === serial)
        .slice(0, limit),
    ),

  getFirmware: () => delay({ ...DEMO_FIRMWARE }),

  getProjects: () => delay([]),

  getMessages: () => delay([]),

  reconnectPrinter: () =>
    delay({ message: "Printer connection restarted (demo mode)" }, 400),

  // ── Print Jobs ────────────────────────────────────────────────────────────
  getPrintJobs: () => delay(sortedPrints()),

  getActivePrints: () =>
    delay(sortedPrints().filter((print) => print.status === 4)),

  getPrint: (printId) =>
    delay(getPrintsRaw().find((print) => print.id === printId) ?? null),

  deletePrint: (printId) => {
    save(
      "prints",
      getPrintsRaw().filter((print) => print.id !== printId),
    );
    return delay({ message: "Print job deleted (demo mode)" });
  },

  // ── Filaments ─────────────────────────────────────────────────────────────
  getFilaments: () => delay(filamentsWithStats()),

  getFilament: (filamentId) =>
    delay(
      filamentsWithStats().find((filament) => filament.id === filamentId) ??
        null,
    ),

  createFilament: (data) => {
    const filament = {
      ...data,
      id: newId(),
      created_at: new Date().toISOString(),
    };
    save("filaments", [...getFilamentsRaw(), filament]);
    return delay(filament, 120);
  },

  updateFilament: (filamentId, data) => {
    let updated: any = null;
    const filaments = getFilamentsRaw().map((filament) => {
      if (filament.id !== filamentId) return filament;
      updated = { ...filament, ...data };
      return updated;
    });
    save("filaments", filaments);
    return delay(updated ?? { ...data, id: filamentId }, 120);
  },

  deleteFilament: (filamentId) => {
    const spools = getSpoolsRaw();
    const removedSpoolIds = spools
      .filter((spool) => spool.filament_id === filamentId)
      .map((spool) => spool.id);

    save(
      "filaments",
      getFilamentsRaw().filter((filament) => filament.id !== filamentId),
    );
    save(
      "spools",
      spools.filter((spool) => spool.filament_id !== filamentId),
    );
    save(
      "prints",
      getPrintsRaw().map((print) =>
        removedSpoolIds.includes(print.spool_id)
          ? { ...print, spool_id: null }
          : print,
      ),
    );
    return delay({ message: "Filament deleted (demo mode)" }, 120);
  },

  getFilamentSpools: (filamentId) =>
    delay(
      getSpoolsRaw().filter((spool) => spool.filament_id === filamentId),
    ),

  getFilamentStats: (filamentId) => {
    const spools = getSpoolsRaw().filter(
      (spool) => spool.filament_id === filamentId,
    );
    const spoolIds = spools.map((spool) => spool.id);
    const prints = getPrintsRaw().filter((print) =>
      spoolIds.includes(print.spool_id),
    );
    const remaining = spools.reduce(
      (sum, spool) => sum + (spool.remaining_g ?? 0),
      0,
    );
    const total = spools.reduce(
      (sum, spool) => sum + (spool.total_weight_g ?? 0),
      0,
    );
    const prices = spools
      .map((spool) => spool.price_per_kg)
      .filter((price): price is number => typeof price === "number");

    return delay({
      remaining_g: round(remaining),
      total_g: round(total),
      used_percent:
        total > 0 ? Math.round((1 - remaining / total) * 100) : 0,
      spool_count: spools.length,
      print_count: prints.length,
      total_used_g: round(
        prints.reduce((sum, print) => sum + (print.weight ?? 0), 0),
      ),
      total_cost: round(
        prints.reduce((sum, print) => sum + (print.estimated_cost ?? 0), 0),
      ),
      avg_price_per_kg:
        prices.length > 0
          ? round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
          : null,
    });
  },

  // ── Spools ────────────────────────────────────────────────────────────────
  getSpools: (filamentId?) => {
    const spools = getSpoolsRaw();
    return delay(
      filamentId
        ? spools.filter((spool) => spool.filament_id === filamentId)
        : spools,
    );
  },

  getActiveSpool: () =>
    delay(getSpoolsRaw().find((spool) => spool.active) ?? null),

  getSpool: (spoolId) =>
    delay(getSpoolsRaw().find((spool) => spool.id === spoolId) ?? null),

  createSpool: (data) => {
    const spool = {
      ...data,
      id: newId(),
      active: false,
      last_used_at: data.last_used_at ?? null,
      created_at: new Date().toISOString(),
    };
    save("spools", [...getSpoolsRaw(), spool]);
    return delay(spool, 120);
  },

  updateSpool: (spoolId, data) => {
    let updated: any = null;
    const spools = getSpoolsRaw().map((spool) => {
      if (spool.id !== spoolId) return spool;
      updated = { ...spool, ...data };
      return updated;
    });
    save("spools", spools);
    return delay(updated ?? { ...data, id: spoolId }, 120);
  },

  deleteSpool: (spoolId) => {
    save(
      "spools",
      getSpoolsRaw().filter((spool) => spool.id !== spoolId),
    );
    save(
      "prints",
      getPrintsRaw().map((print) =>
        print.spool_id === spoolId ? { ...print, spool_id: null } : print,
      ),
    );
    return delay({ message: "Spool deleted (demo mode)" }, 120);
  },

  activateSpool: (spoolId) => {
    const now = new Date().toISOString();
    const spools = getSpoolsRaw().map((spool) => ({
      ...spool,
      active: spool.id === spoolId,
      last_used_at: spool.id === spoolId ? now : spool.last_used_at,
    }));
    save("spools", spools);
    return delay(
      spools.find((spool) => spool.id === spoolId) ?? { id: spoolId },
      120,
    );
  },

  scanNfc: (uid) =>
    delay({
      found: false,
      uid,
      spool: null,
      unassigned_spools: getSpoolsRaw().filter((spool) => !spool.nfc_uid),
    }),

  assignNfc: (uid, spoolId) => {
    let assigned: any = null;
    const spools = getSpoolsRaw().map((spool) => {
      if (spool.id !== spoolId) return spool;
      assigned = { ...spool, nfc_uid: uid };
      return assigned;
    });
    save("spools", spools);
    return delay({ ok: true, spool: assigned });
  },

  // ── Health ────────────────────────────────────────────────────────────────
  health: () => delay(true),
};
