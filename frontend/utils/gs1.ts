/**
 * gs1.ts — GS1 DataMatrix / GS1-128 element-string parser.
 *
 * Dental implant boxes carry a GS1 DataMatrix that concatenates Application
 * Identifiers (AIs). Fixed-length AIs (01, 11, 17 …) are followed directly by
 * their value; variable-length AIs (10, 21 …) run until the next FNC1 / GS
 * (ASCII 29) separator or end of string. Scanners commonly return the payload
 * either with raw GS separators, with a leading "]d2" symbology prefix, or
 * already in human-readable bracketed form "(01)0123…(10)LOT…".
 */

export type Gs1Fields = {
  gtin?: string;
  lot?: string;
  serial?: string;
  expiry?: string;    // ISO yyyy-mm-dd
  mfg_date?: string;  // ISO yyyy-mm-dd
  raw: string;
  is_gs1: boolean;
};

const GS = String.fromCharCode(29);

// AI → fixed length of the value (undefined = variable length, max 20/30)
const FIXED: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2,
};
const KNOWN_AIS = ['00', '01', '02', '10', '11', '12', '13', '15', '16', '17', '20', '21', '22', '240', '241', '30', '37', '91', '92', '93', '94', '95', '96', '97', '98', '99', '710', '711', '712', '713', '714', '8012'];

function yymmddToIso(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const yy = parseInt(v.slice(0, 2), 10);
  const mm = v.slice(2, 4);
  let dd = v.slice(4, 6);
  // GS1: century pivot — 00-50 → 20xx, 51-99 → 19xx. DD "00" = last day of month.
  const yyyy = yy <= 50 ? 2000 + yy : 1900 + yy;
  if (dd === '00') dd = String(new Date(yyyy, parseInt(mm, 10), 0).getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function assign(out: Gs1Fields, ai: string, value: string) {
  switch (ai) {
    case '01': out.gtin = value; break;
    case '10': out.lot = value; break;
    case '21': out.serial = value; break;
    case '17': out.expiry = yymmddToIso(value) || value; break;
    case '11': out.mfg_date = yymmddToIso(value) || value; break;
    default: break;
  }
}

/** Parse bracketed human-readable form: (01)00123456789012(10)ABC123(17)261231 */
function parseBracketed(s: string, out: Gs1Fields): boolean {
  const re = /\((\d{2,4})\)([^()]*)/g;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(s))) {
    any = true;
    assign(out, m[1], m[2].trim());
  }
  return any;
}

/** Parse concatenated element string with FNC1/GS separators. */
function parseConcatenated(s: string, out: Gs1Fields): boolean {
  let i = 0;
  let any = false;
  let guard = 0;
  while (i < s.length && guard++ < 50) {
    if (s[i] === GS) { i++; continue; }
    // Match the longest known AI at this position (2, 3 or 4 digits)
    let ai: string | null = null;
    for (const len of [4, 3, 2]) {
      const cand = s.slice(i, i + len);
      if (KNOWN_AIS.includes(cand)) { ai = cand; break; }
    }
    if (!ai) return any;
    i += ai.length;
    const fixedLen = FIXED[ai];
    let value: string;
    if (fixedLen) {
      value = s.slice(i, i + fixedLen);
      i += fixedLen;
    } else {
      const end = s.indexOf(GS, i);
      value = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
    }
    assign(out, ai, value);
    any = true;
  }
  return any;
}

export function parseGs1(rawInput: string): Gs1Fields {
  const raw = (rawInput || '').trim();
  const out: Gs1Fields = { raw, is_gs1: false };
  if (!raw) return out;
  // Strip symbology identifier (]d2 = GS1 DataMatrix, ]C1 = GS1-128, ]Q3 = GS1 QR)
  let s = raw.replace(/^\](d2|C1|Q3|e0)/i, '');
  // Some scanners emit FNC1 as literal "\x1d" text or "<GS>"/"<FNC1>" tokens
  s = s.replace(/\\x1d|<GS>|<FNC1>|\u00e8/gi, GS);
  let ok = false;
  if (s.includes('(')) ok = parseBracketed(s, out);
  if (!ok) ok = parseConcatenated(s, out);
  out.is_gs1 = ok && !!(out.gtin || out.lot || out.serial);
  return out;
}

/** GTIN-14 mod-10 check digit validation (also accepts 8/12/13 after left-padding). */
export function isValidGtin(gtin: string | undefined): boolean {
  if (!gtin || !/^\d{8}$|^\d{12,14}$/.test(gtin)) return false;
  const padded = gtin.padStart(14, '0');
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = parseInt(padded[i], 10);
    sum += (i % 2 === 0) ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(padded[13], 10);
}
