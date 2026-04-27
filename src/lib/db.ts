import Dexie, { type Table } from 'dexie';

/**
 * TradeVision local cache (IndexedDB via Dexie).
 *
 * Purpose: offline-first job site usage. The tech can build a quote in a
 * basement with no signal; the entry is queued here and synced to Supabase
 * when connectivity returns.
 *
 * Schema versions are forward-only — never edit a past version, always add
 * a new one. Dexie handles migration automatically.
 */

export interface CachedItem {
  id: string;              // TV internal id
  webb_part_number?: string;
  fp_item_id?: string;
  description: string;
  unit_cost_cents: number; // pre-tax Webb cost
  category?: string;
  uom?: string;
  cached_at: number;
}

export interface PendingSync {
  id?: number;             // auto-increment
  type: 'quote' | 'video' | 'po';
  payload: unknown;
  created_at: number;
  attempts: number;
  last_error?: string;
}

class TradeVisionDB extends Dexie {
  items!: Table<CachedItem, string>;
  pending!: Table<PendingSync, number>;

  constructor() {
    super('tradevision');
    this.version(1).stores({
      items: 'id, webb_part_number, fp_item_id, category',
      pending: '++id, type, created_at',
    });
  }
}

export const db = new TradeVisionDB();
