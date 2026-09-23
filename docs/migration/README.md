# Console Hub extraction source

The Console Hub implementation is being extracted from Cockpit at `C:\FIles\Cockpit`.
The reviewed source baseline is Cockpit commit `b4fbd283c3f70b4f6c651ffe6efddaa3cdff148a`
(freeze the Console Hub source baseline for extraction). Cockpit commit
`e1fb66fd6414aaf2a35ff0197c0a89a76ffe962b` updates the product and design documents for
the independent application.

This application has its own Electron identity and storage. On first ordinary launch, it copies
allowlisted Hub configuration, conversations, and durable run records from Cockpit's user-data
directory. Cockpit's source files remain unchanged. The copy writes
`cockpit-migration-receipt.json` in Console Hub's user-data directory after it completes. An I/O
interruption leaves no receipt so the next launch retries; malformed individual records are listed
as skipped in the receipt. Live consoles and agent sessions are not transferred.
