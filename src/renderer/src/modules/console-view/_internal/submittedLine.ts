const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

/** Tracks only simple submitted input. Unknown cursor editing opts out instead of guessing. */
export class SubmittedLine {
  private text = ''
  private reliable = true

  write(data: string): string | undefined {
    let submitted: string | undefined
    for (let index = 0; index < data.length;) {
      if (data.startsWith(PASTE_START, index)) { index += PASTE_START.length; continue }
      if (data.startsWith(PASTE_END, index)) { index += PASTE_END.length; continue }
      const char = data[index]!
      if (char === '\r' || char === '\n') {
        submitted = this.reliable ? this.text : undefined
        this.reset()
        index += 1
        continue
      }
      if (char === '\x7f' || char === '\b') {
        this.text = this.text.slice(0, -1)
        index += 1
        continue
      }
      if (char === '\x03' || char === '\x15') {
        this.reset()
        index += 1
        continue
      }
      if (char === '\x1b') {
        const focus = data.slice(index).match(/^\x1b\[[IO]/)?.[0]
        if (focus) { index += focus.length; continue }
        const mouse = data.slice(index).match(/^\x1b\[<\d+;\d+;\d+[Mm]/)?.[0]
        if (mouse) { index += mouse.length; continue }
        const control = data.slice(index).match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/)?.[0]
        this.reliable = false
        index += control?.length ?? 1
        continue
      }
      if (char >= ' ') this.text += char
      else this.reliable = false
      index += 1
    }
    return submitted
  }

  /**
   * Reads the tracked line and resets, exactly as CR would in `write()`. For
   * consuming Enter at keydown - before xterm forwards it as data - so a
   * claimed command's Enter never reaches the vendor CLI at all.
   */
  submit(): string | undefined {
    const submitted = this.reliable ? this.text : undefined
    this.reset()
    return submitted
  }

  private reset(): void {
    this.text = ''
    this.reliable = true
  }
}
