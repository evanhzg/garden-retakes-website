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
    
    if (config.Wingman) {
        const toAdd = [
            "mp_t_default_secondary weapon_glock",
            "mp_ct_default_secondary weapon_hkp2000",
            "mp_t_default_primary \"\"",
            "mp_ct_default_primary \"\"",
            "mp_t_default_melee weapon_knife",
            "mp_ct_default_melee weapon_knife"
        ];
        
        for (const cmd of toAdd) {
            const prefix = cmd.split(' ')[0];
            config.Wingman.StartCommands = config.Wingman.StartCommands.filter(c => !c.startsWith(prefix));
            config.Wingman.StartCommands.push(cmd);
        }
    }
    
    fs.writeFileSync("/home/evan/projects/Garden-website/R5e-games-patched5.json", JSON.stringify(config, null, 2));
    await client.uploadFrom("/home/evan/projects/Garden-website/R5e-games-patched5.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    console.log("Patched Wingman default weapons on server!");
  } catch (e) {
    console.error(e);
  }
  client.close();
}
run();
