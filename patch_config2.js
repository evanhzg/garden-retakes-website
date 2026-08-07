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
    configStr = configStr.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    const config = JSON.parse(configStr);
    
    if (config.Wingman && config.Wingman.StartCommands) {
        const toAdd = [
            "mp_startmoney 800",
            "mp_maxmoney 8000",
            "mp_afterroundmoney 0",
            "mp_playercashawards 1",
            "mp_teamcashawards 1",
            "mp_buy_anywhere 0",
            "mp_buy_during_immunity 0"
        ];
        
        for (const cmd of toAdd) {
            if (!config.Wingman.StartCommands.some(c => c.startsWith(cmd.split(' ')[0]))) {
                config.Wingman.StartCommands.push(cmd);
            }
        }
    }
    
    fs.writeFileSync("/home/evan/projects/Garden-website/R5e-games-patched.json", JSON.stringify(config, null, 2));
    
    // Upload patched
    await client.uploadFrom("/home/evan/projects/Garden-website/R5e-games-patched.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    console.log("Patched Wingman money commands on server!");
  } catch (e) {
    console.error(e);
  }
  client.close();
}
run();
