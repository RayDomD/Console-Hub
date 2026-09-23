import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import styles from './ConsoleView.module.css'
import type { ConsoleInfo, ConsoleSpec } from './types'
import type { ConsoleLauncher } from './lineup'
import type { ConsoleAssignmentState } from '../../../../../shared/console-run'
import type { MissionLaneState } from '../../../../../shared/mission'
import type { ConsoleAgent } from '../../../../../shared/consoles'
import { SubmittedLine } from './submittedLine'
import { workerHeader } from './workerHeader'

/**
 * One console: a real shell in a pty, rendered by xterm.js, as one card in the
 * Console Recipe's lineup (ADR 0050).
 *
 * Mounting is the whole lifecycle - unmounting closes the pty - but the card
 * itself is hidden rather than unmounted across a Recipe switch, so leaving and
 * returning to Console never loses a running shell or its scrollback (the
 * `ConsoleLineup` parent is what stays mounted; this component does not know
 * that and does not need to).
 *
 * xterm.js owns the screen. Console Hub never parses the output: `data` goes to the
 * emulator verbatim and keystrokes go back to the pty verbatim, so anything that
 * runs in a real terminal runs in this one.
 */

/** Matches `--ink` / `--page` in the token layer; the shell is achromatic. */
const THEME = {
  background: '#0A0A0B',
  foreground: '#EDEDEA',
  cursor: '#EDEDEA',
  selectionBackground: '#2A2A2C'
} as const

const FONT = '"Cascadia Mono", "Cascadia Code", ui-monospace, Consolas, monospace'
const FONT_SIZE = 12

function verifyAttrs(label: string, header: ReturnType<typeof workerHeader>, error: string | null) {
  return {
    'data-verify-unit': 'ConsoleView',
    'data-verify-label': label,
    'data-verify-status': header.state?.toLowerCase() ?? 'unobserved',
    'data-verify-assignment': header.assignment ?? 'none',
    'data-verify-error': String(error !== null)
  }
}

export function ConsoleView({ label, launcher = 'shell', spec, assignment, missionAssignment, canClose, onClose, onReady, onOpenError, onAgent, purpose = 'worker', onInput, onCommand }: {
  purpose?: 'worker' | 'orchestrator'
  onInput?: (submitted: boolean) => void
  /** Return true to consume a complete line as a Console Hub control instead of submitting it to the PTY. */
  onCommand?: (line: string) => boolean
  onAgent?: (agent: ConsoleAgent | undefined) => void
  assignment?: ConsoleAssignmentState
  missionAssignment?: MissionLaneState | { phase: 'unused'; reason: string }
  label: string
  launcher?: ConsoleLauncher
  spec?: ConsoleSpec
  canClose: boolean
  onClose: () => void
  /** Fired once this card's real console id is known - the Orchestrator needs it to type into. */
  onReady?: (consoleId: string) => void
  onOpenError?: (error: string) => void
}): React.JSX.Element {
  const mount = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const [info, setInfo] = useState<ConsoleInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exitCode, setExitCode] = useState<number>()

  // The id the event listener reads. Kept in a ref because the listener is
  // registered once and would otherwise close over the id's first value - the
  // console does not exist yet when the effect runs.
  const consoleId = useRef<string | null>(null)
  const initialSpec = useRef(spec)
  // Read fresh on every render without re-running the mount effect for it -
  // the same reason `consoleId` is a ref rather than a dependency.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onOpenErrorRef = useRef(onOpenError)
  onOpenErrorRef.current = onOpenError
  const onAgentRef = useRef(onAgent)
  onAgentRef.current = onAgent
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  // Ctrl+L already reaches the shell and clears its screen, because keystrokes
  // pass to the pty verbatim. What it cannot reach is the emulator's own
  // scrollback, which is what this clears. The pty is untouched: no keystroke is
  // sent, so nothing running in the shell sees anything happen.
  const clearScreen = useCallback(() => {
    term.current?.clear()
  }, [])

  const resize = useCallback(() => {
    const id = consoleId.current
    if (!fit.current || !id) return
    fit.current.fit()
    const t = term.current
    if (t) void window.consoleHub.consoles.resize(id, t.cols, t.rows)
  }, [])

  useEffect(() => {
    if (!mount.current) return undefined
    let disposed = false

    const t = new Terminal({
      theme: THEME,
      fontFamily: FONT,
      fontSize: FONT_SIZE,
      cursorBlink: true,
      // The pty is the source of truth for what happened; the emulator only draws
      // it. Echoing locally would double every keystroke the shell already echoes.
      convertEol: false
    })
    const f = new FitAddon()
    const submittedLine = new SubmittedLine()
    t.loadAddon(f)
    t.open(mount.current)
    f.fit()
    term.current = t
    fit.current = f
    t.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const isEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
      onInputRef.current?.(isEnter)
      if (!isEnter || purpose !== 'orchestrator') return true
      const id = consoleId.current
      const line = submittedLine.submit()
      if (!id || line === undefined || !onCommandRef.current?.(line)) return true
      // Characters before Enter already reached the CLI as they were typed.
      // Clear its editor, then veto Enter itself so xterm never turns this
      // keydown into a submitted '\r' - the vendor CLI never sees it.
      void window.consoleHub.consoles.write(id, '\x15')
      return false
    })

    // Subscribe before opening, so output that arrives during the open round-trip
    // is not dropped. The registry streams and forgets - there is no scrollback to
    // catch up from.
    const stop = window.consoleHub.consoles.onEvent((event) => {
      if (event.consoleId !== consoleId.current) return
      if (event.type === 'agent-launched') onAgentRef.current?.(event.agent)
      if (event.type === 'agent-exited') onAgentRef.current?.(undefined)
      if (event.type === 'activity') setInfo((current) => current ? { ...current, observedState: event.state } : current)
      if (event.type === 'opened') { setInfo(event.info); setExitCode(undefined); onReadyRef.current?.(event.info.id) }
      if (event.type === 'data') t.write(event.chunk)
      if (event.type === 'exited') { setExitCode(event.exitCode); t.write(`\r\n[console exited ${event.exitCode}]\r\n`) }
    })

    const typed = t.onData((data) => {
      const id = consoleId.current
      if (!id) return
      const submitted = submittedLine.write(data)
      if (purpose === 'orchestrator' && submitted !== undefined && onCommandRef.current?.(submitted)) {
        // Characters before Enter have already reached the CLI. Clear its editor without submitting them.
        void window.consoleHub.consoles.write(id, '\x15')
        return
      }
      void window.consoleHub.consoles.write(id, data)
    })

    window.consoleHub.consoles
      .open({ ...initialSpec.current, cols: t.cols, rows: t.rows })
      .then((opened) => {
        if (disposed) {
          void window.consoleHub.consoles.close(opened.id)
          return
        }
        consoleId.current = opened.id
        setInfo(opened)
        onReadyRef.current?.(opened.id)
      })
      .catch((e: Error) => { if (!disposed) { setError(e.message); onOpenErrorRef.current?.(e.message) } })

    const observer = new ResizeObserver(resize)
    observer.observe(mount.current)

    return () => {
      disposed = true
      observer.disconnect()
      stop()
      typed.dispose()
      // Leaving the Recipe closes the shell. A console with no window is exactly
      // the orphan the registry's tree-kill exists to prevent.
      const id = consoleId.current
      if (id) void window.consoleHub.consoles.close(id)
      consoleId.current = null
      t.dispose()
      term.current = null
      fit.current = null
    }
  }, [resize])

  const header = workerHeader({ label, launcher, assignment, missionAssignment, observedState: info?.observedState, exitCode })

  return (
    <section className={styles.plate} data-verify={purpose === 'worker' ? 'console-view' : 'orchestrator-console-view'} data-verify-launcher={launcher} {...verifyAttrs(label, header, error)}>
      <header className={styles.head}>
        <span className={styles.identity}>{purpose === 'worker' ? header.identity : `${label}${launcher !== 'shell' ? ` · ${launcher.toUpperCase()}` : ''}`}</span>
        {purpose === 'worker' && <>
          <span className={styles.assignmentTitle} title={header.assignment}>{header.assignment ?? 'No Mission assignment'}</span>
          {header.state && <span className={`${styles.observedState} ${header.state === 'Failed' ? styles.failedState : ''}`}><span aria-hidden="true">{header.glyph}</span> {header.state}</span>}
        </>}
        <span className={styles.machineState} data-verify="console-cwd">{info ? `${info.shell} · ${info.cwd}` : 'opening…'}</span>
        <span className={styles.spacer} />
        {purpose === 'worker' && assignment?.phase === 'dispatched' && <button type="button" className={styles.complete} onClick={() => { void window.consoleHub.consoleConversation.markDone(label) }}>Mark complete</button>}
        <button
          type="button"
          className={styles.clear}
          onClick={clearScreen}
          disabled={!info}
          title="Clear the scrollback. The shell and anything running in it are untouched."
          data-verify="console-clear"
        >
          Clear
        </button>
        {canClose && (
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            title="Close this terminal. Its shell and anything running in it are stopped."
            data-verify="console-close"
          >
            ×
          </button>
        )}
      </header>
      {error && (
        <p className={styles.error} data-verify="console-error">
          {error}
        </p>
      )}
      <div className={styles.screen} ref={mount} data-verify="console-screen" />
    </section>
  )
}
