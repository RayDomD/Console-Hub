/** A configured skill is one direct folder below a skill root on every supported filesystem. */
export function isFilesystemSkillName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value)
}
