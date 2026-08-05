# Garden Capture Daemon

This is a local Node.js daemon that connects to the Garden website via WebSockets. It listens for requests to update a lineup's screenshot.

When you click "Update Screenshot" on the website, this daemon:
1. Receives the `capture_job` via socket.io
2. Generates a custom CS2 config (`garden_capture_daemon.cfg`) with the lineup's `setpos` and visual cleanup commands (no bots, no hud).
3. Launches CS2 (via Steam protocol) directly into the map, executing the config.
4. Takes a screenshot using the in-game `jpeg` command.
5. Grabs the latest screenshot from your CS2 screenshots folder.
6. Uploads it to the website.
7. The website will immediately show you a preview modal!

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure your environment variables.
   Set `STEAM_ID` to your Steam64 ID so the website knows to send capture requests to *you*.
   Set `CS2_CFG_DIR` and `CS2_SCREENSHOT_DIR` if they differ from the defaults.
3. Run the daemon:
   ```bash
   node index.js
   ```

*Note: This must be run on the Windows machine where CS2 is installed.*
