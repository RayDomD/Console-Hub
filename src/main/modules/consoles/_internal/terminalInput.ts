// Codex can interpret Enter during a paste burst as another pasted newline.
// Allow its input loop to finish the paste before sending the submit key.
// A 500 ms delay still lost Enter with a 4.8 KiB paste in Codex 0.153.2 on Windows.
export const PASTE_SUBMIT_DELAY_MS = 1500

const TERMINAL_FOCUS_REPORT = /^\x1b\[[IO]$/
const TERMINAL_MOUSE_REPORT = /^\x1b\[<\d+;\d+;\d+[Mm]$/

export class TerminalInput {
  private pending?: ReturnType<typeof setTimeout>
  constructor(private readonly writeRaw: (data: string) => void) {}

  cancel(): void { clearTimeout(this.pending); this.pending = undefined }

  write(data: string): void {
    if (TERMINAL_FOCUS_REPORT.test(data) || TERMINAL_MOUSE_REPORT.test(data)) {
      this.writeRaw(data)
      return
    }
    this.cancel()
    if (data.startsWith('\x1b[200~') && data.endsWith('\x1b[201~\r')) {
      this.writeRaw(data.slice(0, -1))
      this.pending = setTimeout(() => {
        this.pending = undefined
        this.writeRaw('\r')
      }, PASTE_SUBMIT_DELAY_MS)
    } else this.writeRaw(data)
  }
}
