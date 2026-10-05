/**
 * iter-Jun-2026: Phase 4 Step 1 impression option lists + shared label helpers.
 * Mirrors backend/impression_options.py — keep both in sync.
 */
export const IMPRESSION_TECHNIQUES: { id: 'open_tray' | 'closed_tray'; label: string; sub: string; icon: string }[] = [
  { id: 'open_tray', label: 'Open Tray / Direct Impression', sub: 'Copings unscrewed through the tray window', icon: 'open-outline' },
  { id: 'closed_tray', label: 'Closed Tray / Indirect Impression', sub: 'Transfer copings reseated into the impression', icon: 'lock-closed-outline' },
];

export const IMPRESSION_MATERIAL_GROUPS: { family: string; options: string[] }[] = [
  { family: 'PVS / Addition Silicone', options: [
    'PVS/Addition Silicone - Putty - Light Body',
    'PVS/Addition Silicone - Heavy Body - Light Body',
    'PVS/Addition Silicone - Monophase',
  ] },
  { family: 'Polyether', options: [
    'Polyether - Heavy Body - Light Body',
    'Polyether Monophase',
    'Polyether - Medium Body',
    'Polyether - Light Body',
  ] },
  { family: 'Condensation Silicone', options: [
    'Condensation Silicone - Putty - Light Body',
  ] },
];

export const SCAN_BODY_MATERIALS = ['PEEK', 'Metal', 'Hybrid'];
export const SCAN_BODY_TYPES = ['Conventional/Vertical Scan Body', 'Horizontal Scan Body (Scan Flags)', 'Photogrammetry Scan Body'];
export const SCAN_LEVELS = ['Abutment level', 'Implant level', 'Multiunit level'];

const LEGACY_MATERIAL: Record<string, string> = {
  polyether: 'Polyether',
  heavy_light_body: 'Heavy and Light body',
  putty_light_body: 'Putty and Light body',
};
const TECH_LABEL: Record<string, string> = {
  open_tray: 'Open Tray / Direct Impression',
  closed_tray: 'Closed Tray / Indirect Impression',
};

export function materialLabel(p4: any): string {
  const m = p4?.impression_material;
  if (!m) return '';
  if (m === 'Other') return (p4.impression_material_other || 'Other').trim();
  return LEGACY_MATERIAL[m] || m;
}

export function scannerLabel(p4: any): string {
  let comp = p4?.ios_scanner_company || '';
  let model = p4?.ios_scanner_model || '';
  if (comp === 'Other') comp = (p4.ios_scanner_company_other || 'Other').trim();
  if (model === 'Other') model = (p4.ios_scanner_model_other || 'Other').trim();
  return [comp, model].filter(Boolean).join(' — ');
}

export type ImpressionRow = { label: string; value: string; values?: string[]; icon: string };

/** Ordered rows for review cards / PDFs. Handles legacy (pre-Jun-2026) field names. */
export function impressionRows(p4: any): ImpressionRow[] {
  if (!p4?.impression_type) return [];
  const rows: ImpressionRow[] = [];
  if (p4.impression_type === 'conventional') {
    rows.push({ label: 'Impression Type', value: 'Conventional Impression', icon: 'hand-left' });
    if (p4.conventional_tray_type) rows.push({ label: 'Impression Technique', value: TECH_LABEL[p4.conventional_tray_type] || p4.conventional_tray_type, icon: 'albums' });
    const mat = materialLabel(p4);
    if (mat) rows.push({ label: 'Impression Material Used', value: mat, icon: 'flask' });
    return rows;
  }
  rows.push({ label: 'Impression Type', value: 'Intraoral Scan', icon: 'phone-portrait' });
  const sc = scannerLabel(p4);
  if (sc) rows.push({ label: 'Intraoral Scanner Used', value: sc, icon: 'scan' });
  const sbm = p4.ios_scan_body_material || (Array.isArray(p4.scan_body_types) ? p4.scan_body_types.join(', ') : '');
  if (sbm) rows.push({ label: 'Scan Body Material', value: sbm, icon: 'cube' });
  const sbt: string[] = p4.ios_scan_body_types || p4.scan_types || [];
  if (sbt.length) rows.push({ label: 'Type of Scan Body', value: sbt.join(', '), values: sbt, icon: 'git-branch' });
  const lvl = p4.ios_scan_level || (Array.isArray(p4.scan_levels) ? p4.scan_levels.join(', ') : '');
  if (lvl) rows.push({ label: 'Scan Level', value: lvl, icon: 'layers' });
  return rows;
}
