/**
 * useBankPartyOptions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the exact same Pay To / Receive From option list as
 * PaymentVoucherSingle / ReceiptVoucher — fetching the same APIs and applying
 * the same hierarchy-heading dedup logic.
 *
 * Returned options use   { label: name, value: name }
 * (SearchableSelect in the vouchers uses the name string as value, not id).
 *
 * Also exports `ledgerIdByName` map so BankUpload can resolve name → ledger_id
 * when patching the backend row.
 */

import { useState, useEffect } from 'react';
import { apiService } from '../../services';

export interface PartyOption {
  label: string;   // Display name
  value: string;   // Same as label (name string) — matches PaymentVoucherSingle
  ledger_id: number | string | null;
  id: number | string | null;  // Primary ID (Vendor/Customer ID)
  name: string;    // Raw name without suffix
  group?: string;
  type?: 'vendor' | 'customer' | 'ledger';
  category?: 'vendor' | 'customer';
  code?: string;
}

// ── Same helpers used in PaymentVoucherSingle ─────────────────────────────────
const normalizeName = (s: any) => (s ?? '').toString().trim().toLowerCase();

function buildHierarchySets(rows: any[]) {
  const nonLeaf = new Set<string>();
  const selectableMap = new Map<string, any>();

  for (const r of rows || []) {
    const mg  = normalizeName(r.major_group_1);
    const g   = normalizeName(r.group_1);
    const sg1 = normalizeName(r.sub_group_1_1);
    const sg2 = normalizeName(r.sub_group_2_1);
    const sg3 = normalizeName(r.sub_group_3_1);
    const led = normalizeName(r.ledger_1);

    if (mg)  nonLeaf.add(mg);
    if (g)   nonLeaf.add(g);
    if (sg1) nonLeaf.add(sg1);
    if (sg2) nonLeaf.add(sg2);
    if (sg3) nonLeaf.add(sg3);

    const endpoint = led || sg3 || sg2 || sg1 || g || mg;
    if (endpoint) {
      selectableMap.set(endpoint, {
        id:       r.id,
        name:     r.ledger_1 || r.sub_group_3_1 || r.sub_group_2_1 || r.sub_group_1_1 || r.group_1 || r.major_group_1,
        group:    r.group_1,
        category: r.major_group_1,
        code:     r.code || r.ledger_code,
      });
    }
  }

  return { nonLeaf, selectableMap };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useBankPartyOptions(_type?: 'payment' | 'receipt') {
  const [options, setOptions]   = useState<PartyOption[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      try {
        const [ledgersData, vendorsData, customersData, hierarchyData] = await Promise.all([
          apiService.getLedgers(),
          apiService.getRichVendors(),
          apiService.getRichCustomers(),
          apiService.getHierarchy(),
        ]);

        if (cancelled) return;

        // Handle both direct arrays and paginated responses ({results: [...]})
        const extractResults = (data: any) => {
          if (Array.isArray(data)) return data;
          if (data && Array.isArray(data.results)) return data.results;
          return [];
        };

        const ledgers   = extractResults(ledgersData);
        const vendors   = extractResults(vendorsData);
        const customers = extractResults(customersData);
        const hierarchy = extractResults(hierarchyData);

        const sets = buildHierarchySets(hierarchy);

        // 1. Hierarchy seed ledgers (leaf nodes only)
        const hierarchySeedOptions: PartyOption[] = Array.from(sets.selectableMap.values())
          .filter((l: any) => !sets.nonLeaf.has(normalizeName(l.name)))
          .map((l: any) => ({
            label:     l.code && l.code !== '00' ? `${l.name} - ${l.code}` : l.name,
            value:     l.name,
            ledger_id: l.id,
            id:        l.id,
            name:      l.name,
            group:     l.group,
            category:  l.category === 'Sundry Debtors' ? 'customer' : 'vendor',
            type:      'ledger' as const,
            code:      l.code,
          }));

        // 2. Portal vendors  (Sundry Creditors)
        const vendorOptions: PartyOption[] = vendors.map((v: any) => {
          const rawName = v.vendor_name || v.name || 'Unknown Vendor';
          const code = v.code || v.vendor_code;
          return {
            name:      rawName,
            label:     code && code !== '00' ? `${rawName} - ${code}` : rawName,
            value:     rawName,
            ledger_id: v.ledger_id || v.id,
            id:        v.id,
            group:     'Sundry Creditors',
            type:      'vendor' as const,
            category:  'vendor' as const,
            code:      code,
          };
        });

        // 3. Portal customers  (Sundry Debtors)
        const customerOptions: PartyOption[] = customers.map((c: any) => {
          const rawName = c.customer_name || c.name || 'Unknown Customer';
          const code = c.code || c.customer_code;
          return {
            name:      rawName,
            label:     code && code !== '00' ? `${rawName} - ${code}` : rawName,
            value:     rawName,
            ledger_id: c.ledger_id || c.id,
            id:        c.id,
            group:     'Sundry Debtors',
            type:      'customer' as const,
            category:  'customer' as const,
            code:      code,
          };
        });

        // 4. All tenant ledgers (excluding hierarchy headings)
        const ledgerOptions: PartyOption[] = ledgers
          .filter((l: any) => l.code && l.code !== '00')
          .map((l: any) => {
          const rawName = l.name || 'Unknown Ledger';
          return {
            name:      rawName,
            label:     l.code && l.code !== '00' ? `${rawName} - ${l.code}` : rawName,
            value:     rawName,
            ledger_id: l.id,
            id:        l.id,
            group:     l.group,
            type:      l.group === 'Sundry Debtors' ? 'customer' :
                       l.group === 'Sundry Creditors' ? 'vendor' : 'ledger' as const,
            category:  l.group === 'Sundry Debtors' ? 'customer' :
                       l.group === 'Sundry Creditors' ? 'vendor' : undefined,
            code:      l.code,
          };
        });

        // 5. Merge — same dedup order as PaymentVoucherSingle:
        //    hierarchy seeds → ledger entries → portal entities (portal wins)
        const masterMap = new Map<string, PartyOption>();
        hierarchySeedOptions.forEach(o => masterMap.set(o.value.toLowerCase(), o));
        ledgerOptions.forEach(o => {
          const key = o.value.toLowerCase();
          const existing = masterMap.get(key);
          const merged = existing ? { ...existing, ...o, code: o.code || existing.code } : o;
          merged.label = merged.code && merged.code !== '00' ? `${merged.name} - ${merged.code}` : merged.name;
          masterMap.set(key, merged);
        });
        vendorOptions.forEach(o => {
          const key = o.value.toLowerCase();
          const existing = masterMap.get(key);
          const merged = existing ? { ...existing, ...o, code: o.code || existing.code } : o;
          merged.label = merged.code && merged.code !== '00' ? `${merged.name} - ${merged.code}` : merged.name;
          masterMap.set(key, merged);
        });
        customerOptions.forEach(o => {
          const key = o.value.toLowerCase();
          const existing = masterMap.get(key);
          const merged = existing ? { ...existing, ...o, code: o.code || existing.code } : o;
          merged.label = merged.code && merged.code !== '00' ? `${merged.name} - ${merged.code}` : merged.name;
          masterMap.set(key, merged);
        });

        const merged = Array.from(masterMap.values())
          .sort((a, b) => a.label.localeCompare(b.label));

        setOptions(merged);
      } catch (e) {
        console.error('useBankPartyOptions: fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, []);

  return { options, loading };
}
