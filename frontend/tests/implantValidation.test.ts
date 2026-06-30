/**
 * Manual exec test for Phase 1 implant validation.
 * Run: node -e "require('ts-node/register'); require('./tests/implantValidation.test.ts')"
 *
 * Kept dependency-free so it runs without a jest config.
 */
import { validateImplantSelection, detectBridgeCandidates, detectCantileverCandidates } from '../utils/implantValidation';

let pass = 0, fail = 0;
const eq = (a: any, b: any, label: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗', label, '\n      got:', JSON.stringify(a), '\n      exp:', JSON.stringify(b)); }
};

console.log('Single Conventional Implant');
eq(validateImplantSelection('Single Conventional Implant', ['16'], ['16']).block, undefined, '1 implant → ok');
eq(validateImplantSelection('Single Conventional Implant', ['16','17'], ['16','17']).block,
   'More than one implant selected. Please change Type of Implant Procedure.', '2 implants → block');
eq(validateImplantSelection('Single Conventional Implant', ['16'], ['16'], '17').block,
   'More than one implant selected. Please change Type of Implant Procedure.', 'pending 2nd → block');

console.log('\nBridge detection — 14/15/16 missing, implants at 14 + 16');
const c1 = detectBridgeCandidates(['14','15','16'], ['14','16']);
eq(c1.length, 1, 'one candidate');
eq(c1[0].pontics, ['15'], 'pontic = 15');
eq([...c1[0].implants].sort(), ['14','16'].sort(), 'span = 14 ↔ 16');

console.log('\nBridge detection — 23/24/25/26 missing, implants 23/24/26');
const c2 = detectBridgeCandidates(['23','24','25','26'], ['23','24','26']);
eq(c2.length, 1, 'one candidate');
eq(c2[0].pontics, ['25'], 'pontic = 25');
eq(c2[0].implants, ['23','24','26'], 'span = 23 → 26');

console.log('\nBridge detection — implants on every missing tooth → no bridge');
eq(detectBridgeCandidates(['14','15','16'], ['14','15','16']).length, 0, 'no bridge');

console.log('\nBridge detection — only 2 missing teeth → no bridge');
eq(detectBridgeCandidates(['14','15'], ['14','15']).length, 0, 'no bridge (need 3 in row)');

console.log('\nBridge detection — non-adjacent missing teeth (14, 16; 15 NOT missing)');
eq(detectBridgeCandidates(['14','16'], ['14','16']).length, 0, 'no bridge — 15 is healthy');

console.log('\nMultiple Conventional flow — no block, surfaces candidates');
const v = validateImplantSelection('Multiple Conventional Implants', ['14','15','16'], ['14','16']);
eq(v.block, undefined, 'no block');
eq(v.bridgeCandidates.length, 1, 'surfaces 1 bridge candidate');
eq(v.cantileverCandidates.length, 0, 'no cantilever (flanked)');

console.log('\nCantilever — distal (24, 25 missing; implant only at 25)');
const cd = detectCantileverCandidates(['24','25'], ['25']);
eq(cd.length, 1, 'one cantilever');
eq(cd[0].pontic, '24', 'pontic = 24');
eq(cd[0].implant, '25', 'anchor = 25');

console.log('\nCantilever — distal (36, 37, 38 missing; implants at 36 + 37)');
const cm = detectCantileverCandidates(['36','37','38'], ['36','37']);
eq(cm.length, 1, 'one cantilever');
eq(cm[0].pontic, '38', 'pontic = 38');
eq(cm[0].implant, '37', 'anchor = 37');

console.log('\nCantilever — both ends (15, 16, 17 missing; implant only at 16)');
const cb = detectCantileverCandidates(['15','16','17'], ['16']);
eq(cb.length, 2, 'two cantilevers');
eq(new Set(cb.map(c => c.pontic)), new Set(['15','17']), 'pontics 15 + 17');

console.log('\nCantilever — bridge case (14, 15, 16 with implants at 14 + 16) → no cantilever');
eq(detectCantileverCandidates(['14','15','16'], ['14','16']).length, 0, 'no cantilever — flanked');

console.log('\nCantilever — full implant coverage → no cantilever');
eq(detectCantileverCandidates(['14','15'], ['14','15']).length, 0, 'no cantilever');

console.log('\nValidation surfaces both bridge + cantilever (15, 16, 17 missing; implants 16 + 17 → 15 cantilever)');
const cv = validateImplantSelection('Multiple Conventional Implants', ['15','16','17'], ['16','17']);
eq(cv.bridgeCandidates.length, 0, 'no bridge — implants adjacent at 16-17, 15 dangles mesially');
eq(cv.cantileverCandidates.length, 1, '1 cantilever');

console.log(`\n${pass}/${pass + fail} pass`);
if (fail) process.exit(1);
