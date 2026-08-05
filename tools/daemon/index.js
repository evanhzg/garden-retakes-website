const { io } = require("socket.io-client");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");

const SERVER_URL = process.env.SERVER_URL || "https://node-sockets-reeeeetakes.onrender.com";
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
    const utilitySlot = job.utility === "flashbang" ? "slot7" : job.utility === "molotov" || job.utility === "incgrenade" ? "slot10" : "slot8";
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
r_drawviewmodel 1
viewmodel_offset_x 2.5
viewmodel_offset_y 2
viewmodel_offset_z -2
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
      // Just copy it to clipboard so user can paste it
      execSync('echo exec garden_capture_daemon | clip', { stdio: "ignore" });
      console.log("Copied 'exec garden_capture_daemon' to your clipboard!");
    }
    
    console.log(">>> PLEASE GO IN-GAME, LOAD THE MAP, AND PASTE 'exec garden_capture_daemon' IN CONSOLE <<<");
    console.log("Waiting for a new screenshot to appear in your Steam screenshots folder (Press F12 in-game!)...");

    // Watch the directory for a new screenshot
    if (!fs.existsSync(CS2_SCREENSHOT_DIR)) {
      throw new Error(`Screenshot dir not found: ${CS2_SCREENSHOT_DIR}`);
    }

    const initialFiles = new Set(fs.readdirSync(CS2_SCREENSHOT_DIR));
    
    const shotPath = await new Promise((resolve, reject) => {
      const watcher = fs.watch(CS2_SCREENSHOT_DIR, (eventType, filename) => {
        if (filename && (filename.endsWith('.jpg') || filename.endsWith('.jpeg'))) {
          if (!initialFiles.has(filename)) {
            // Wait a brief moment to ensure file is fully written
            setTimeout(() => {
              watcher.close();
              resolve(path.join(CS2_SCREENSHOT_DIR, filename));
            }, 500);
          }
        }
      });
      // Timeout after 3 minutes
      setTimeout(() => {
        watcher.close();
        reject(new Error("Timed out waiting for screenshot after 3 minutes"));
      }, 180000);
    });

    console.log(`Found new screenshot: ${shotPath}`);

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

