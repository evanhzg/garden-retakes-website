const { io } = require("socket.io-client");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");

const SERVER_URL = process.env.SERVER_URL || "https://retakes.fr";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://retakes.fr";

// Make sure to set your SteamId in an env variable
const steamId = process.env.STEAM_ID || "76561198154541270"; 

// Paths for Windows
const CS2_CFG_DIR = process.env.CS2_CFG_DIR ?? "D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg";
const CS2_SCREENSHOT_DIR = process.env.CS2_SCREENSHOT_DIR ?? "D:\\Steam\\userdata\\194275542\\760\\remote\\730\\screenshots";

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
    // 1. Write the custom CFG
    // Added a small delay before jpeg so the viewmodel has time to draw and settle
    const cfgContent = `
sv_cheats 1
mp_freezetime 0
mp_roundtime 60
mp_warmup_end
mp_team_intro_time 0
bot_kick
cl_draw_only_deathnotices 1
cl_drawhud_force_radar -1
cl_showfps 0
net_graph 0
r_drawviewmodel 1
viewmodel_offset_x 2.5
viewmodel_offset_y 2
viewmodel_offset_z -2
sv_skyname_set 0
ent_fire smokegrenade_projectile kill
ent_fire molotov_projectile kill
ent_fire flashbang_projectile kill
${job.setpos}
give weapon_${job.utility || "smokegrenade"}
use weapon_${job.utility || "smokegrenade"}

alias "capture_shot" "jpeg"
// Wait 1 second (approx 64 ticks) before taking the screenshot so the teleport finishes
// CS2 doesn't have a reliable wait command, so we just take the shot immediately
// For better results, user should bind a key or we just fire jpeg.
jpeg
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

    // 2. Launch or focus CS2
    // steam://rungame/730/76561202255233023/+map de_mirage +exec garden_capture_daemon
    const command = `start steam://rungame/730/76561202255233023/+map%20${job.map}%20+exec%20garden_capture_daemon`;
    console.log(`Executing: ${command}`);
    
    if (process.platform === "win32") {
      execSync(command, { stdio: "ignore" });
    } else {
      console.log("(Skipped execution because not on Windows)");
    }

    console.log("Waiting 15 seconds for map to load and screenshot to be taken...");
    await new Promise(r => setTimeout(r, 15000));

    // 3. Find the newest screenshot
    if (fs.existsSync(CS2_SCREENSHOT_DIR)) {
      const files = fs.readdirSync(CS2_SCREENSHOT_DIR)
        .filter(f => f.endsWith(".jpg") || f.endsWith(".jpeg"))
        .map(f => ({ file: f, mtime: fs.statSync(path.join(CS2_SCREENSHOT_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      
      if (files.length === 0) {
        throw new Error("No screenshots found in dir");
      }
      const newest = files[0].file;
      const shotPath = path.join(CS2_SCREENSHOT_DIR, newest);
      console.log(`Found newest screenshot: ${shotPath}`);

      // 4. Upload to website
      console.log("Uploading to website...");
      const form = new FormData();
      form.append("file", fs.createReadStream(shotPath));

      const res = await fetch(`${WEBSITE_URL}/api/utility/capture-upload`, {
        method: "POST",
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
    } else {
      console.log("(Skipped upload because screenshot dir not found)");
    }

  } catch (err) {
    console.error("Capture job failed:", err);
  }
});
