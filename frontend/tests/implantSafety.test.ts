import { evaluateImplantSafety, annotateImplantSafety, isPosteriorTooth } from '../utils/implantSafety';

let pass = 0, fail = 0;
const eq = (a: any, b: any, label: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗', label, '\n      got:', JSON.stringify(a), '\n      exp:', JSON.stringify(b)); }
};

console.log('Posterior tooth set');
['14','15','16','17','24','25','26','27','35','36','37','45','46','47'].forEach(t => eq(isPosteriorTooth(t), true, `posterior ${t}`));
['11','12','13','21','22','23','31','32','33','41','42','43','38','48'].forEach(t => eq(isPosteriorTooth(t), false, `non-posterior ${t}`));

console.log('\nRule 2 — mandibular posterior IAN block');
const r1 = evaluateImplantSafety({ toothPosition: '46', boneHeightMm: 11.0, implantLengthMm: 10.0 });
eq(r1.kind, 'length_block', 'block fires');
eq((r1 as any).message.includes('inferior alveolar nerve'), true, 'IAN message');
eq((r1 as any).actualShortBy, 1.0, 'short by 1mm — below 1.5');

console.log('\nRule 2 — maxillary posterior sinus block');
const r2 = evaluateImplantSafety({ toothPosition: '16', boneHeightMm: 9.5, implantLengthMm: 8.5 });
eq(r2.kind, 'length_block', 'block fires');
eq((r2 as any).message.includes('maxillary sinus floor'), true, 'sinus message');

console.log('\nRule 2 — exact 1.5mm safety margin → ok');
const r3 = evaluateImplantSafety({ toothPosition: '46', boneHeightMm: 11.5, implantLengthMm: 10.0 });
eq(r3.kind, 'ok', '1.5 mm margin allowed');

console.log('\nRule 2 — anterior tooth never blocks (rule is posterior only)');
eq(evaluateImplantSafety({ toothPosition: '11', boneHeightMm: 10, implantLengthMm: 11 }).kind, 'ok', 'anterior allowed');

console.log('\nRule 1 — width margin warning');
const w1 = evaluateImplantSafety({ boneWidthMm: 5.0, implantDiameterMm: 4.0 });
eq(w1.kind, 'width_warning', 'margin 0.5 mm → warning');
eq((w1 as any).marginMm, 0.5, 'margin 0.5 mm reported');

console.log('\nRule 1 — exact 1mm margin → ok');
eq(evaluateImplantSafety({ boneWidthMm: 6.0, implantDiameterMm: 4.0 }).kind, 'ok', 'margin 1.0 mm allowed');

console.log('\nLength rule beats width rule when both fail (length is hard block)');
const r4 = evaluateImplantSafety({ toothPosition: '46', boneHeightMm: 10, implantLengthMm: 10, boneWidthMm: 4, implantDiameterMm: 4 });
eq(r4.kind, 'length_block', 'length_block reported first');

console.log('\nannotateImplantSafety on a recommendation list');
const list = [
  { brand: 'Neodent', system: 'Drive', diameter: 3.5, length: 8 },
  { brand: 'Neodent', system: 'Drive', diameter: 3.5, length: 11 },
  { brand: 'Nobel', system: 'NobelActive', diameter: 5.5, length: 8 },
];
const annotated = annotateImplantSafety(list, { toothPosition: '46', boneHeightMm: 10, boneWidthMm: 6 });
eq(annotated[0]._safety.kind, 'ok', 'safe option ok');
eq(annotated[1]._safety.kind, 'length_block', 'too long → block');
eq(annotated[2]._safety.kind, 'width_warning', 'too wide → warning (5.5 → margin 0.25)');

console.log(`\n${pass}/${pass + fail} pass`);
if (fail) process.exit(1);
