import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { SlotConfig } from '../../../../../shared/fan'

/**
 * The arrangement shown until the persisted one arrives, and if the seam ever
 * fails to answer. Never the authority on what the Stack is.
 */
const DEFAULT_SLOTS: readonly SlotConfig[] = [
  { id: 'w1', role: 'worker', vendor: 'claude', model: 'opus', effort: 'high' },
  { id: 'w2', role: 'worker', vendor: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
  { id: 'orchestrator', role: 'orchestrator', vendor: 'claude', model: 'opus', effort: 'high' }
]

interface LiveStackContextValue {
  slots: readonly SlotConfig[]
  /** Every edit goes through here, so one place writes and a change survives a restart. */
  edit: (next: (current: readonly SlotConfig[]) => SlotConfig[]) => void
}

const LiveStackContext = createContext<LiveStackContextValue | null>(null)

export function LiveStackProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [slots, setSlots] = useState<readonly SlotConfig[]>(DEFAULT_SLOTS)

  useEffect(() => {
    let mounted = true
    void window.consoleHub.fan.arrangement().then((stored) => {
      if (mounted) setSlots(stored)
    })
    return () => { mounted = false }
  }, [])

  const edit = useCallback((next: (current: readonly SlotConfig[]) => SlotConfig[]) => {
    setSlots((current) => {
      const edited = next(current)
      // A state updater must stay pure, and this one writes to disk - so the
      // write is fired here rather than inside the reducer body above it.
      queueMicrotask(() => { void window.consoleHub.fan.saveArrangement(edited) })
      return edited
    })
  }, [])

  const value = useMemo(() => ({ slots, edit }), [slots, edit])
  return <LiveStackContext.Provider value={value}>{children}</LiveStackContext.Provider>
}

export function useLiveStack(): LiveStackContextValue {
  const value = useContext(LiveStackContext)
  if (!value) throw new Error('useLiveStack must be used inside LiveStackProvider')
  return value
}
