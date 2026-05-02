/**
 * iter-138 — Attachment Cuff-Height Catalogue exec test.
 *
 * Dependency-free so it runs without a jest config. Exec:
 *   cd /app/frontend && node -e "require('ts-node/register'); require('./tests/attachmentCuffCatalogue.test.ts')"
 */
import { getCuffHeightsFor, ATTACHMENT_CUFF_CATALOGUE } from '../constants/attachmentCuffCatalogue';

let pass = 0, fail = 0;
const eq = (a: any, b: any, label: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('  ✓', label); }
  else { fail++; console.error('  ✗', label, '\n    expected:', b, '\n    got:     ', a); }
};

console.log('iter-138 · Attachment Cuff-Height Catalogue');

// Null / empty inputs → null
eq(getCuffHeightsFor(''), null, 'empty string returns null');
eq(getCuffHeightsFor(undefined), null, 'undefined returns null');
eq(getCuffHeightsFor(null), null, 'null returns null');

// Known vendor catalogues
eq(getCuffHeightsFor('Locator - Zest Dental Solutions'), ['1','2','3','4','5'], 'Locator classic 1-5 mm');
eq(getCuffHeightsFor('Locator R-Tx - Zest Dental Solutions'), ['1','2','3','4','5','6'], 'Locator R-Tx 1-6 mm');
eq(getCuffHeightsFor('Rheine 83 - OT Equator'), ['0.5','1','2','3','4','5','6','7'], 'Rheine 83 / OT Equator 0.5-7 mm');
eq(getCuffHeightsFor('Novaloc - Straumann'), ['0.5','1.5','2.5','3.5','4.5','5.5'], 'Novaloc half-mm series');
eq(getCuffHeightsFor('TiSi Snap - Bredent'), ['0.5','1','2','3','4','5'], 'TiSi Snap 0.5-5 mm');
eq(getCuffHeightsFor('Stud and Ball Attachment'), ['1','2','3','4'], 'Stud and Ball 1-4 mm');

// Bar-type → no catalogue (custom-milled)
eq(getCuffHeightsFor('Bar Attachment'), null, 'Bar Attachment → null (custom-milled, no SKU catalogue)');
eq(getCuffHeightsFor('Locator Bar'), null, 'Locator Bar → null');

// "Other" / "Other: <custom>" → always null
eq(getCuffHeightsFor('Other'), null, '"Other" selection → null');
eq(getCuffHeightsFor('Other: Custom OverDent-X'), null, '"Other: <custom>" wrapper → null');
eq(getCuffHeightsFor('Other: '), null, '"Other: " empty custom → null');

// Catalogue integrity — unique, non-empty, numeric entries for every vendor.
for (const [brand, list] of Object.entries(ATTACHMENT_CUFF_CATALOGUE)) {
  eq(list.length > 0, true, `${brand}: has ≥1 entry`);
  eq(list.length === new Set(list).size, true, `${brand}: entries unique`);
  const allNumeric = list.every(v => /^\d+(\.\d+)?$/.test(v));
  eq(allNumeric, true, `${brand}: all entries numeric strings`);
}

console.log(`\nPassed ${pass} · Failed ${fail}`);
if (fail > 0) process.exit(1);
