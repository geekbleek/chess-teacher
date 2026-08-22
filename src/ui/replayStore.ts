import type { DrillState } from '../modes/drill';

/**
 * The finished drill, handed from the drill screen to the replay screen.
 *
 * Deliberately in memory rather than storage: a replay is only meaningful for the
 * game you just played, and it should not survive a reload.
 */
let last: DrillState | null = null;

export const setLastDrill = (state: DrillState): void => {
  last = state;
};

export const getLastDrill = (): DrillState | null => last;
