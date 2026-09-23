/**
 * The renderer's view of the console seam. Shapes come from the shared contract,
 * never from main's source - the renderer must not be able to reach across the
 * bridge even at compile time.
 */
export type { ConsoleEvent, ConsoleInfo, ConsoleSpec } from '../../../../../shared/consoles'
