import rawInventory from '../../../../content/packs/electronic-filing/scenario-inventory.json';
import {inspectFirstPack, type PlannedPack} from '../../../../packages/legislation/src/pack-readiness.ts';

/** Publicly inspectable planning ONLY; this is not a published or verified law pack. */
export const plannedPack = rawInventory as PlannedPack;
export const plannedStatus = inspectFirstPack(rawInventory);

/** This route MUST NOT imply completeness even if source metadata is edited. */
export function planningPreviewAvailable(): boolean {
  return !plannedStatus.readyForPublication && plannedPack.sourceStatus === 'original-bill-not-available';
}
