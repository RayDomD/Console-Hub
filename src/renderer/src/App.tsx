import { useEffect, useState } from 'react'
import { RecipeSelectionProvider } from './modules/recipe-selection'
import { LiveStackProvider } from './modules/live-stack'
import { HubShell } from './modules/hub-shell'
import { useRecipeSelection } from './modules/recipe-selection'
import type { ActivatedLaunch, PendingLaunch } from '../../shared/launch'

export function App(): React.JSX.Element {
  const [fonts, setFonts] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    void document.fonts.ready.then(() => setFonts('ready'))
  }, [])

  return (
    <RecipeSelectionProvider>
      <LiveStackProvider>
        <LaunchCoordinator fonts={fonts} />
      </LiveStackProvider>
    </RecipeSelectionProvider>
  )
}

function LaunchCoordinator({ fonts }: { fonts: 'loading' | 'ready' }): React.JSX.Element {
  const { select } = useRecipeSelection()
  const [pending, setPending] = useState<PendingLaunch>()
  const [activation, setActivation] = useState<ActivatedLaunch>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let mounted = true
    const stopPending = window.consoleHub.launch.onPending((next) => setPending(next))
    const stopAccepted = window.consoleHub.launch.onAccepted((next) => setActivation(next))
    void window.consoleHub.launch.pending().then((next) => { if (mounted) setPending(next) })
    void window.consoleHub.launch.current().then((next) => { if (mounted) setActivation(next) })
    return () => { mounted = false; stopPending(); stopAccepted() }
  }, [])

  useEffect(() => {
    if (activation?.request.action === 'project') select('console')
  }, [activation, select])

  const refreshPending = (): void => {
    void window.consoleHub.launch.pending().then(setPending).catch((reason: Error) => setError(reason.message))
  }

  return (
    <div data-verify="app-root" data-fonts={fonts}>
      <HubShell activation={activation} />
      {pending && (
        <section className="launchHandoff" aria-label="Incoming Workspace">
          <strong>Open Workspace</strong>
          <span>{pending.request.workspace}</span>
          {pending.blocked ? (
            <>
              <p>Apply or Reject the current Mission and finish cleanup before switching.</p>
              <button type="button" onClick={refreshPending}>Check again</button>
              <button type="button" onClick={() => { void window.consoleHub.launch.reject() }}>Keep current</button>
            </>
          ) : (
            <>
              <p>Switch to this Workspace?</p>
              <button type="button" onClick={() => {
                void window.consoleHub.launch.accept().then((accepted) => {
                  if (!accepted) refreshPending()
                }).catch((reason: Error) => setError(reason.message))
              }}>Switch</button>
              <button type="button" onClick={() => { void window.consoleHub.launch.reject() }}>Keep current</button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      )}
    </div>
  )
}
