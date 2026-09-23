import { describe, expect, it, vi } from 'vitest'
import { LaunchHandoff } from './launchHandoff'

const project = { action: 'project' as const, workspace: 'C:\\FIles\\Studybuddy' }

describe('launch handoff', () => {
  it('applies a cold project launch and requests the default agent', () => {
    const apply = vi.fn()
    const activate = vi.fn()
    const inbox = new LaunchHandoff(() => undefined, () => false, apply, activate)
    inbox.receive(project, false)
    expect(apply).toHaveBeenCalledWith(project.workspace)
    expect(activate).toHaveBeenCalledWith(project)
    expect(inbox.pending()).toBeUndefined()
  })

  it('holds a different warm Workspace until accepted', () => {
    const apply = vi.fn()
    const activate = vi.fn()
    const inbox = new LaunchHandoff(() => 'C:\\FIles\\Cockpit', () => false, apply, activate)
    inbox.receive(project, true)
    expect(apply).not.toHaveBeenCalled()
    expect(inbox.pending()).toEqual({ request: project, blocked: false })
    expect(inbox.accept()).toBe(true)
    expect(apply).toHaveBeenCalledWith(project.workspace)
    expect(activate).toHaveBeenCalledWith(project)
  })

  it('keeps a handoff pending while a Mission is unresolved', () => {
    const apply = vi.fn()
    const inbox = new LaunchHandoff(() => 'C:\\FIles\\Cockpit', () => true, apply, vi.fn())
    inbox.receive(project, true)
    expect(inbox.pending()?.blocked).toBe(true)
    expect(inbox.accept()).toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })

  it('holds a cold different-Workspace launch when a Mission was restored unresolved', () => {
    const apply = vi.fn()
    const inbox = new LaunchHandoff(() => 'C:\\FIles\\Cockpit', () => true, apply, vi.fn())
    inbox.receive(project, false)
    expect(inbox.pending()?.blocked).toBe(true)
    expect(apply).not.toHaveBeenCalled()
  })

  it('focuses an active Workspace without a switch prompt', () => {
    const activate = vi.fn()
    const inbox = new LaunchHandoff(() => project.workspace, () => false, vi.fn(), activate)
    inbox.receive(project, true)
    expect(inbox.pending()).toBeUndefined()
    expect(activate).toHaveBeenCalledWith(project)
  })
})
