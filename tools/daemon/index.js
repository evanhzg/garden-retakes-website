const { io } = require("socket.io-client");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");
const screenshot = require("screenshot-desktop");

const SERVER_URL = process.env.SERVER_URL || "https://node-sockets-reeeeetakes.onrender.com";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.retakes.fr";

// Provide the same key used for INVSIM_API_KEY in your Vercel env
const ADMIN_KEY = process.env.ADMIN_KEY || "9fWH9jh3FwkUywtSyhdLJ8sX";

const steamId = process.env.STEAM_ID || "76561198154541270"; 

const CS2_CFG_DIR = process.env.CS2_CFG_DIR ?? "D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg";

const socket = io(SERVER_URL);

socket.on("connect", () => {
  console.log("Connected to server, authenticating...");
  socket.emit("authenticate", { steamId });
});

socket.on("authenticated", () => {
  console.log("Authenticated as", steamId);
  console.log("Waiting for capture jobs...");
});

socket.on("capture_job", async (job) => {
  console.log("\n--- Received capture job ---");
  console.log(`Lineup ID: ${job.lineupId}`);
  console.log(`Map: ${job.map}`);
  console.log(`Setpos: ${job.setpos}`);

  try {
    const utilitySlot = job.utility === "flashbang" ? "slot7" : job.utility === "molotov" || job.utility === "incgrenade" ? "slot10" : "slot8";
    const cfgContent = `
sv_cheats 1
mp_freezetime 0
mp_roundtime 60
mp_warmup_pausetimer 1
mp_warmuptime 9999
mp_warmup_start
mp_team_intro_time 0
bot_kick
cl_draw_only_deathnotices 1
cl_drawhud_force_radar -1
cl_showfps 0
r_drawviewmodel 1
viewmodel_offset_x 2.5
viewmodel_offset_y 2
viewmodel_offset_z -2
jointeam 2
ent_fire smokegrenade_projectile kill
ent_fire molotov_projectile kill
ent_fire flashbang_projectile kill
${job.setpos}
give weapon_${job.utility || "smokegrenade"}
${utilitySlot}
`;
    // On Linux/WSL for dev, use a dummy path if CS2_CFG_DIR doesn't exist
    const cfgDirExists = fs.existsSync(CS2_CFG_DIR);
    if (!cfgDirExists) {
      console.warn(`WARNING: CS2_CFG_DIR ${CS2_CFG_DIR} not found. Are you on Windows? Writing to local dir instead.`);
      fs.writeFileSync("garden_capture_daemon.cfg", cfgContent);
    } else {
      const cfgPath = path.join(CS2_CFG_DIR, "garden_capture_daemon.cfg");
      fs.writeFileSync(cfgPath, cfgContent);
      console.log(`Wrote config to ${cfgPath}`);
    }

    if (process.platform === "win32") {
      console.log(">>> AUTOMATIC CAPTURE INITIATED <<<");
      console.log("The daemon will automatically focus CS2, execute the command, and capture the screen in 4 seconds...");
      
      // Wait 4 seconds for safety
      await new Promise(r => setTimeout(r, 4000));
      
      console.log("Executing command in CS2...");
      try {
        const consoleKey = process.env.CONSOLE_KEY || '{APP}';
        const psScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
"@
$original = [Win32]::GetForegroundWindow()
$wshell = New-Object -ComObject wscript.shell
$wshell.AppActivate('Counter-Strike 2')
Start-Sleep -m 1000
$wshell.SendKeys('${consoleKey}')
Start-Sleep -m 500
$wshell.SendKeys('map ${job.map}{ENTER}')
Start-Sleep -m 15000
$wshell.SendKeys('${consoleKey}')
Start-Sleep -m 500
$wshell.SendKeys('exec garden_capture_daemon{ENTER}')
Start-Sleep -m 500
$wshell.SendKeys('${consoleKey}')
Start-Sleep -m 3500
Out-File -FilePath "$env:TEMP\\garden_capture_ready.txt" -InputObject "READY"
Start-Sleep -m 1500
[Win32]::SetForegroundWindow($original)
`;
        
        const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'garden_capture_ready.txt');
        const scriptFile = path.join(__dirname, 'capture.ps1');
        
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        fs.writeFileSync(scriptFile, psScript);
        
        require('child_process').exec(`powershell -ExecutionPolicy Bypass -File "${scriptFile}"`);
        
        // Wait for the powershell script to signal readiness
        console.log("Waiting up to 30 seconds for map to load and teleport...");
        let attempts = 0;
        while (!fs.existsSync(tmpFile) && attempts < 300) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        if (fs.existsSync(scriptFile)) fs.unlinkSync(scriptFile);
      } catch (e) {
        console.error("Failed to focus and type in CS2:", e);
      }
    } else {
      console.log(">>> PLEASE GO IN-GAME, LOAD THE MAP, AND PASTE 'exec garden_capture_daemon' IN CONSOLE <<<");
      console.log("Taking screenshot automatically in 8 seconds. Switch to the game now!");
      await new Promise(r => setTimeout(r, 8000));
    }

    console.log("Capturing screen...");
    const shotPath = path.join(__dirname, `capture_${Date.now()}.jpg`);
    await screenshot({ filename: shotPath, format: 'jpg' });

    console.log(`Saved screenshot to: ${shotPath}`);

    // 4. Upload to website
    console.log("Uploading to website...");
    const form = new FormData();
    form.append("file", fs.createReadStream(shotPath));

    const adminKey = process.env.ADMIN_KEY || "9fWH9jh3FwkUywtSyhdLJ8sX";
    const res = await fetch(`${WEBSITE_URL}/api/utility/capture-upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminKey}`
      },
      body: form
    });
    
    if (!res.ok) {
      throw new Error(`Upload failed: ${await res.text()}`);
    }

    const { url } = await res.json();
    console.log(`Upload successful: ${url}`);

    // 5. Reply with result
    socket.emit("capture_result", {
      steamId: job.steamId,
      lineupId: job.lineupId,
      url: url,
      type: job.type || "aim"
    });

  } catch (err) {
    console.error("Capture job failed:", err);
  }
});

