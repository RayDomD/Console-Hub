/**
 * The Orchestrator conversation: a persistent planning transcript that frames a
 * Fan run, answers questions about it, and receives its synthesis (ADR 0049).
 */
export { OrchestratorConversation } from './_internal/conversation'
export type {
  ConversationHarnessPort,
  ConversationOptions,
  DelegationNote,
  ProposedTask,
  SynthesisNote
} from './_internal/conversation'
export type { CapturedSnapshot } from './_internal/reducer'
export { elapsedLabel, type WorkerDescriptor, type PromptOptions } from './_internal/prompt'
