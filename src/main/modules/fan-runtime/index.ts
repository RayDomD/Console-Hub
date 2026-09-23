/**
 * The fan runtime: the pure fan machine driven against real harnessed processes.
 */

export { FanRuntime } from './_internal/runtime'
export {
  toHarnessVendor,
  toSlotEvent,
  toSlotFault,
  toSlotUsage,
  writeDocumentAtomically
} from './_internal/runtime'
export type { DocumentWriter, HarnessPort, RuntimeOptions } from './_internal/runtime'
