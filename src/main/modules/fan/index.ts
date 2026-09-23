/**
 * question-fan lifecycle state machine.
 */
export { enter, step, release, retry, stop, shutdown, restoreInterrupted, onEvent, emitTransition } from './_internal/machine'
export type { EnterOptions } from './_internal/machine'
export type {
  FanConfig,
  FanState,
  FanTransition,
  FanCommand,
  FanKind,
  FanLifecycle,
  SlotConfig,
  SlotRole,
  SlotScope,
  SlotStatus,
  SlotEvent,
  SlotProgressEvent,
  SlotTerminalEvent,
  SlotOutcome,
  SlotCompleted,
  SlotFault,
  SlotFaultProcessCrash,
  SlotFaultQuota,
  SlotFaultStreamInvalid,
  SlotUsage,
  FanVendor,
  OrchestratorStatus,
  CmdLaunchWorkers,
  CmdLaunchSynthesis,
  CmdKillSlot,
  CmdWriteSynthesisDocument
} from '../../../shared/fan'
