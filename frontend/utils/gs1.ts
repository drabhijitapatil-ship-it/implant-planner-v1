/**
 * gs1.ts - Minimal GS1 barcode parser for implant box labels (UDI).
 *
 * Handles the two forms scanners hand us:
 *  - Raw element strings from DataMatrix / GS1-128, with FNC1 sent as the
 *    GS character (\x1d) and an optional symbology prefix (]d2, ]C1, ]Q3).
 *  - Human-readable strings typed or OCR'd from the label: "(01)...(17)...(10)...".
 */

export interface Gs1Result {
  is_gs1: boolean;
  gtin?: string;
  lot?: string;
  serial?: string;
  expiry?: string; // YYYY-MM-DD
  mfg_date?: string; // YYYY-MM-DD
}

const GS = '\x1d';

// AIs with a fixed data length (no GS terminator follows them).
const FIXED_LENGTH: Record<string, number> = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2,
};

// Variable-length AIs we may meet on medical device labels (terminated by GS or end of data).
const VARIABLE_AIS = ['10', '21', '22', '30', '37', '240', '241', '250', '251', '7003', '8003', '8004', '8020',
  '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];

const matchAi = (s: string): string | null => {
  const two = s.slice(0, 2);
  if (FIXED_LENGTH[two] !== undefined) return two;
  // Longest match first so '240' wins over a hypothetical '24'.
  for (const len of [4, 3, 2]) {
    const ai = s.slice(0, len);
    if (VARIABLE_AIS.includes(ai)) return ai;
  }
  return null;
};

/** GS1 YYMMDD -> YYYY-MM-DD. Day "00" means the last day of that month. */
const toIsoDate = (yymmdd: string): string | undefined => {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  let dd = parseInt(yymmdd.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return undefined;
  // GS1 century rule simplified: labels in use are 2000-2099 for our purposes.
  const yyyy = 2000 + yy;
  if (dd === 0) dd = new Date(yyyy, mm, 0).getDate();
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
};

const parseElements = (input: string): Record<string, string> | null => {
  const out: Record<string, string> = {};
  const trimmed = input.trim();

  // Human-readable form: (01)0123...(17)261231(10)ABC
  if (trimmed.startsWith('(')) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    let any = false;
    while ((m = re.exec(trimmed))) {
      out[m[1]] = m[2].trim();
      any = true;
    }
    return any ? out : null;
  }

  // Raw form. Strip symbology identifier and a leading FNC1.
  let s = trimmed.replace(/^\][A-Za-z]\d/, '');
  if (s.startsWith(GS)) s = s.slice(1);

  while (s.length) {
    const ai = matchAi(s);
    if (!ai) return Object.keys(out).length ? out : null;
    s = s.slice(ai.length);
    const fixed = FIXED_LENGTH[ai];
    if (fixed !== undefined) {
      if (s.length < fixed) return Object.keys(out).length ? out : null;
      out[ai] = s.slice(0, fixed);
      s = s.slice(fixed);
      if (s.startsWith(GS)) s = s.slice(1);
    } else {
      const end = s.indexOf(GS);
      out[ai] = end === -1 ? s : s.slice(0, end);
      s = end === -1 ? '' : s.slice(end + 1);
    }
  }
  return Object.keys(out).length ? out : null;
};

export const parseGs1 = (raw: string): Gs1Result => {
  if (!raw) return { is_gs1: false };
  const el = parseElements(raw);
  // Require a GTIN so arbitrary numeric strings aren't mistaken for GS1.
  if (!el || !el['01'] || !/^\d{14}$/.test(el['01'])) return { is_gs1: false };
  return {
    is_gs1: true,
    gtin: el['01'],
    lot: el['10'] || undefined,
    serial: el['21'] || undefined,
    expiry: el['17'] ? toIsoDate(el['17']) : undefined,
    mfg_date: el['11'] ? toIsoDate(el['11']) : undefined,
  };
};

/** Validates a GTIN-8/12/13/14 by its mod-10 check digit. */
export const isValidGtin = (gtin: string): boolean => {
  const g = (gtin || '').trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(g)) return false;
  const digits = g.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
};
