const ftp = require("basic-ftp");
const fs = require("fs");

async function run() {
  const client = new ftp.Client();
  try {
    await client.access({
      host: "baroque.dathost.net",
      user: "67fd3fd5caae0fdc8408ff64",
      password: "iyoGJKy0aEQ",
      secure: false
    });
    console.log("Connected");
    
    // Download config
    await client.downloadTo("/home/evan/projects/Garden-website/R5e-games.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    
    // Read and patch
    let configStr = fs.readFileSync("/home/evan/projects/Garden-website/R5e-games.json", "utf8");
    // Clean JSON comments if any, simple replace for this file
    configStr = configStr.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    const config = JSON.parse(configStr);
    
    if (config.Wingman && config.Wingman.StartCommands) {
        if (!config.Wingman.StartCommands.includes("mp_warmuptime 999999")) {
            const pausetimerIdx = config.Wingman.StartCommands.indexOf("mp_warmup_pausetimer 1");
            if (pausetimerIdx !== -1) {
                config.Wingman.StartCommands.splice(pausetimerIdx + 1, 0, "mp_warmuptime 999999");
            } else {
                config.Wingman.StartCommands.push("mp_warmuptime 999999");
            }
        }
        
        // Remove mp_restartgame 1 if it's there
        config.Wingman.StartCommands = config.Wingman.StartCommands.filter(c => c !== "mp_restartgame 1");
    }
    
    fs.writeFileSync("/home/evan/projects/Garden-website/R5e-games-patched.json", JSON.stringify(config, null, 2));
    
    // Upload patched
    await client.uploadFrom("/home/evan/projects/Garden-website/R5e-games-patched.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    console.log("Patched Wingman start commands on server!");
  } catch (e) {
    console.error(e);
  }
  client.close();
}
run();
