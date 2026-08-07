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
        config.Wingman.StartCommands = [
            "game_type 0",
            "game_mode 2",
            "mp_friendlyfire 1",
            "ff_damage_reduction_bullets 0.33",
            "ff_damage_reduction_grenade 0.85",
            "ff_damage_reduction_grenade_self 1",
            "ff_damage_reduction_other 0.4",
            "mp_maxrounds 16",
            "mp_halftime 1",
            "mp_halftime_duration 15",
            "mp_match_can_clinch 1",
            "mp_overtime_enable 1",
            "mp_overtime_maxrounds 6",
            "mp_roundtime 1.5",
            "mp_roundtime_defuse 1.5",
            "mp_c4timer 40",
            "mp_freezetime 15",
            "mp_round_restart_delay 5",
            "mp_buytime 20",
            "mp_buy_anywhere 0",
            "mp_buy_during_immunity 0",
            "mp_startmoney 800",
            "mp_maxmoney 8000",
            "mp_playercashawards 1",
            "mp_teamcashawards 1",
            "mp_free_armor 0",
            "mp_max_armor 2",
            "mp_weapons_allow_map_placed 1",
            "mp_death_drop_defuser 1",
            "mp_death_drop_grenade 2",
            "mp_death_drop_gun 1",
            "mp_defuser_allocation 0",
            "mp_solid_teammates 1",
            "mp_forcecamera 1",
            "mp_team_intro_time 0",
            "sv_infinite_ammo 0",
            "ammo_grenade_limit_total 4",
            "ammo_grenade_limit_flashbang 2",
            "sv_grenade_trajectory_prac_pipreview 0",
            "sv_grenade_trajectory_prac_trailtime 0",
            "mp_warmup_pausetimer 1",
            "mp_warmuptime 999999",
            "mp_warmup_start"
        ];
    }
    
    fs.writeFileSync("/home/evan/projects/Garden-website/R5e-games-patched4.json", JSON.stringify(config, null, 2));
    await client.uploadFrom("/home/evan/projects/Garden-website/R5e-games-patched4.json", "/addons/counterstrikesharp/configs/plugins/R5e-games/R5e-games.json");
    console.log("Patched Wingman start commands on server!");
  } catch (e) {
    console.error(e);
  }
  client.close();
}
run();
