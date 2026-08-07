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
    
    await client.downloadTo("/home/evan/projects/Garden-website/R5e-games.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    
    let configStr = fs.readFileSync("/home/evan/projects/Garden-website/R5e-games.json", "utf8");
    configStr = configStr.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    const config = JSON.parse(configStr);
    
    if (config.Wingman && config.Wingman.StartCommands) {
        const toAdd = [
            "mp_buytime 20",
            "mp_free_armor 0",
            "mp_max_armor 2",
            "mp_forcecamera 1",
            "mp_team_intro_time 0"
        ];
        
        for (const cmd of toAdd) {
            const prefix = cmd.split(' ')[0];
            // Remove existing
            config.Wingman.StartCommands = config.Wingman.StartCommands.filter(c => !c.startsWith(prefix));
            // Add new
            config.Wingman.StartCommands.push(cmd);
        }
        
        // Remove mp_halftime_duration if it exists, replace with 0? Wait, the user said "remove start and halftime animations"
        // Let's just set mp_halftime_pausematch 0 and mp_halftime_pausetimer 0? Or mp_halftime_duration 0.
        config.Wingman.StartCommands = config.Wingman.StartCommands.filter(c => !c.startsWith("mp_halftime_duration"));
        config.Wingman.StartCommands.push("mp_halftime_duration 0");
    }
    
    fs.writeFileSync("/home/evan/projects/Garden-website/R5e-games-patched3.json", JSON.stringify(config, null, 2));
    await client.uploadFrom("/home/evan/projects/Garden-website/R5e-games-patched3.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    console.log("Patched Wingman buy menu commands on server!");
  } catch (e) {
    console.error(e);
  }
  client.close();
}
run();
