/**
 * Phase 1 — Implant-procedure clinical correlation rules.
 *
 * Validates the relationship between `implant_procedure_type`, `teeth_present`
 * (the missing teeth marked in Phase 1) and the `implant_plans` (positions
 * where implants are planned) and surfaces clinical prompts:
 *
 *   1. Single Conventional Implant   → exactly 1 implant. >1 is HARD-blocked.
 *   2. Multiple Conventional Implants → if a missing tooth sits BETWEEN two
 *      implants without its own implant, that tooth becomes a pontic in an
 *      implant-supported bridge — surface a 3-unit bridge nudge.
 *
 * Adjacency follows FDI numbering across each arch:
 *   maxillary:  18-17-16-15-14-13-12-11 | 21-22-23-24-25-26-27-28
 *   mandibular: 48-47-46-45-44-43-42-41 | 31-32-33-34-35-36-37-38
 * The two halves are joined at the midline (11↔21, 41↔31).
 */

const MAX_SEQ = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
const MAND_SEQ = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];

type Arch = 'maxillary' | 'mandibular';
const archOf = (tooth: string): Arch | null => {
  if (MAX_SEQ.includes(tooth)) return 'maxillary';
  if (MAND_SEQ.includes(tooth)) return 'mandibular';
  return null;
};
const seqOf = (arch: Arch) => (arch === 'maxillary' ? MAX_SEQ : MAND_SEQ);

/**
 * Group teeth into consecutive missing runs within each arch.
 * "Consecutive" = adjacent indices in the FDI sequence for the arch.
 *
 * Exported for use by the new-case form's Edentulous Site clustering UI:
 *   • run.length === 1 → singleton (Scenario 1 — scattered missing tooth).
 *   • run.length ≥ 2  → cluster (Scenario 2 — adjacent missing teeth share
 *     a single mesiodistal span between the two bordering natural teeth).
 */
export function findMissingRuns(teeth: string[]): Array<{ arch: Arch; positions: string[] }> {
  const runs: Array<{ arch: Arch; positions: string[] }> = [];
  for (const arch of ['maxillary', 'mandibular'] as Arch[]) {
    const seq = seqOf(arch);
    const present = teeth.filter(t => seq.includes(t)).sort((a, b) => seq.indexOf(a) - seq.indexOf(b));
    let cur: string[] = [];
    for (const t of present) {
      if (cur.length === 0 || seq.indexOf(t) === seq.indexOf(cur[cur.length - 1]) + 1) cur.push(t);
      else { runs.push({ arch, positions: cur }); cur = [t]; }
    }
    if (cur.length) runs.push({ arch, positions: cur });
  }
  return runs;
}

export type BridgeCandidate = {
  arch: Arch;
  /** All consecutive missing teeth in this run (e.g. ['14','15','16']). */
  run: string[];
  /** Implant positions inside the run, sorted by FDI order. */
  implants: string[];
  /** Missing teeth INSIDE the implant span that have no implant — pontics. */
  pontics: string[];
};

/**
 * A bridge is indicated when a missing tooth sits between two implants in the
 * same consecutive missing-tooth run and itself has no implant. Examples:
 *   • 14, 15, 16 missing; implants at 14 + 16 → pontic at 15 (3-unit bridge)
 *   • 23-26 missing; implants at 23, 24, 26 → pontic at 25 (3-unit bridge over 24-25-26 + crown on 23)
 */
export function detectBridgeCandidates(teeth: string[], implantPositions: string[]): BridgeCandidate[] {
  const cands: BridgeCandidate[] = [];
  const runs = findMissingRuns(teeth);
  for (const { arch, positions } of runs) {
    if (positions.length < 3) continue;                         // need ≥3 in a row to allow a pontic
    const seq = seqOf(arch);
    const implants = positions.filter(p => implantPositions.includes(p))
      .sort((a, b) => seq.indexOf(a) - seq.indexOf(b));
    if (implants.length < 2) continue;                          // need ≥2 implants spanning a gap
    const lo = seq.indexOf(implants[0]);
    const hi = seq.indexOf(implants[implants.length - 1]);
    const pontics = positions.filter(p => {
      const i = seq.indexOf(p);
      return i > lo && i < hi && !implantPositions.includes(p);
    });
    if (pontics.length === 0) continue;                         // implants cover everything → not a bridge
    cands.push({ arch, run: positions, implants, pontics });
  }
  return cands;
}

export type CantileverCandidate = {
  arch: Arch;
  /** The missing tooth that becomes the cantilever pontic. */
  pontic: string;
  /** The single supporting implant (the "anchor"). */
  implant: string;
};

/**
 * A cantilever pontic = a missing tooth at the END of a consecutive missing
 * run, supported by an implant on ONE side only (no implant on the other side
 * because there's no tooth there or the run ends there). Examples:
 *   • 24, 25 missing; implant only at 25 → 24 dangles distally as a cantilever.
 *   • 36, 37, 38 missing; implants at 36 + 37 → 38 dangles as a cantilever.
 * Multiple cantilevers can co-exist (one at each end of a run).
 */
export function detectCantileverCandidates(teeth: string[], implantPositions: string[]): CantileverCandidate[] {
  const out: CantileverCandidate[] = [];
  const runs = findMissingRuns(teeth);
  for (const { arch, positions } of runs) {
    if (positions.length < 2) continue;
    const seq = seqOf(arch);
    const implants = positions.filter(p => implantPositions.includes(p))
      .sort((a, b) => seq.indexOf(a) - seq.indexOf(b));
    if (implants.length === 0) continue;

    // Mesial cantilever — first missing tooth without an implant; only support is to its distal side.
    const first = positions[0];
    if (!implantPositions.includes(first)) {
      const nearest = implants[0];
      if (seq.indexOf(nearest) === seq.indexOf(first) + 1) out.push({ arch, pontic: first, implant: nearest });
    }
    // Distal cantilever — last missing tooth without an implant; only support is to its mesial side.
    const last = positions[positions.length - 1];
    if (last !== first && !implantPositions.includes(last)) {
      const nearest = implants[implants.length - 1];
      if (seq.indexOf(nearest) === seq.indexOf(last) - 1) out.push({ arch, pontic: last, implant: nearest });
    }
  }
  return out;
}

export type ImplantValidationResult = {
  /** Hard-blocking message — caller must abort the action. */
  block?: string;
  /** Soft prompts the caller should surface to the user. */
  bridgeCandidates: BridgeCandidate[];
  cantileverCandidates: CantileverCandidate[];
};

/**
 * Centralised entry point. Pass `pendingPosition` when the user is about to
 * add an implant — the rule will be evaluated AS IF that implant were added.
 */
export function validateImplantSelection(
  procedureType: string | undefined,
  teethPresent: string[],
  implantPositions: string[],
  pendingPosition?: string,
): ImplantValidationResult {
  const positions = pendingPosition ? [...implantPositions, pendingPosition] : implantPositions;
  const result: ImplantValidationResult = { bridgeCandidates: [], cantileverCandidates: [] };

  if (procedureType === 'Single Conventional Implant' && positions.length > 1) {
    result.block = 'More than one implant selected. Please change Type of Implant Procedure.';
    return result;
  }

  if (procedureType === 'Multiple Conventional Implants') {
    result.bridgeCandidates = detectBridgeCandidates(teethPresent, positions);
    result.cantileverCandidates = detectCantileverCandidates(teethPresent, positions);
  }

  return result;
}

/**
 * Human-readable summary used inside the bridge nudge prompt.
 *   "implants at 14 + 16 will replace the missing 15 — a three-unit
 *   implant-supported bridge with 15 as a pontic."
 */
export function describeBridgeCandidate(c: BridgeCandidate): string {
  const implantStr = c.implants.join(' + ');
  const ponticStr = c.pontics.join(', ');
  return `Implants at ${implantStr} would replace ${ponticStr} as a ${c.implants.length + c.pontics.length}-unit implant-supported bridge with ${ponticStr} as ${c.pontics.length === 1 ? 'a pontic' : 'pontics'}.`;
}

export function describeCantileverCandidate(c: CantileverCandidate): string {
  return `Tooth ${c.pontic} has implant support on one side only (implant at ${c.implant}). It would dangle as a cantilever pontic.`;
}

export const BRIDGE_MATERIALS = ['Metal', 'Porcelain Fused to Metal', 'Zirconia'] as const;
export type BridgeMaterial = typeof BRIDGE_MATERIALS[number];

/**
 * For a given tooth, return the sorted list of teeth in its run (cluster).
 * Returns [] if the tooth isn't in the missing-teeth list.
 *   • A run of length 1 means the tooth is a singleton (Scenario 1).
 *   • A run of length ≥2 means the tooth is in a cluster (Scenario 2).
 */
export function clusterOfTooth(tooth: string, missingTeeth: string[]): string[] {
  const runs = findMissingRuns(missingTeeth || []);
  for (const r of runs) {
    if (r.positions.includes(tooth)) {
      // Sort by FDI sequence within its arch
      const seq = seqOf(r.arch);
      return [...r.positions].sort((a, b) => seq.indexOf(a) - seq.indexOf(b));
    }
  }
  return [];
}

/**
 * For a cluster, return the leader tooth (lowest FDI index in the arch
 * sequence). The leader is the tooth that owns the shared mesiodistal
 * value for the whole cluster. Returns null for empty input.
 */
export function clusterLeader(cluster: string[]): string | null {
  if (!cluster || cluster.length === 0) return null;
  if (cluster.length === 1) return cluster[0];
  // cluster is already sorted by clusterOfTooth's seqOf order
  return cluster[0];
}
