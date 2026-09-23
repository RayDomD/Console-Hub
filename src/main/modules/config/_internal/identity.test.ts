import { describe, expect, it } from 'vitest'
import { CONFIG_FILENAME, DEFAULT_CONFIG, FALLBACK_CONFIG_DIR } from './defaults'

describe('Console Hub configuration identity', () => {
  it('owns a separate configuration file and fallback directory', () => {
    expect(CONFIG_FILENAME).toBe('console-hub.config.json')
    expect(FALLBACK_CONFIG_DIR.toLowerCase()).toContain('console-hub')
  })

  it('does not seed Console Hub corpus or ground state', () => {
    expect(DEFAULT_CONFIG).not.toHaveProperty('corpus')
    expect(DEFAULT_CONFIG).not.toHaveProperty('corpusRoots')
    expect(DEFAULT_CONFIG).not.toHaveProperty('ground')
  })
})
