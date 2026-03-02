import type { Ledger, LedgerGroupMaster, Unit, StockItem, StockGroup } from './types';

export const initialLedgers: Ledger[] = [];

export const initialLedgerGroups: LedgerGroupMaster[] = [];

export const initialUnits: Unit[] = [
  { name: 'Nos' },
  { name: 'Kg' },
  { name: 'Ltr' },
  { name: 'Mtr' },
  { name: 'Box' },
  { name: 'Pack' },
  { name: 'Bottle' },
  { name: 'Piece' },
  { name: 'Dozen' },
  { name: 'Gram' },
  { name: 'Liter' },
  { name: 'Meter' },
];

export const initialStockGroups: StockGroup[] = [
  { name: 'Primary' },
  { name: 'Finished Goods' },
  { name: 'Raw Materials' },
  { name: 'Work-in-Progress' },
  { name: 'Consumables' },
  { name: 'Packing Materials' },
  { name: 'Spare Parts' },
];

export const initialStockItems: StockItem[] = [
  // Finished Goods
  { name: 'Product A', group: 'Finished Goods', unit: 'Nos', hsn: '123456', gstRate: 18 },
  { name: 'Product B', group: 'Finished Goods', unit: 'Kg', hsn: '234567', gstRate: 12 },
  { name: 'Product C', group: 'Finished Goods', unit: 'Ltr', hsn: '345678', gstRate: 18 },

  // Raw Materials
  { name: 'Raw Material A', group: 'Raw Materials', unit: 'Kg', hsn: '456789', gstRate: 18 },
  { name: 'Raw Material B', group: 'Raw Materials', unit: 'Ltr', hsn: '567890', gstRate: 12 },
  { name: 'Raw Material C', group: 'Raw Materials', unit: 'Mtr', hsn: '678901', gstRate: 18 },

  // Consumables
  { name: 'Stationery', group: 'Consumables', unit: 'Pack', hsn: '789012', gstRate: 18 },
  { name: 'Cleaning Supplies', group: 'Consumables', unit: 'Bottle', hsn: '890123', gstRate: 12 },
];
