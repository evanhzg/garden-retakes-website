// Garden games Discord bot — /lobby create and /lobby join.
//
// Run as its own process:  node scripts/discordBot.js
// Needs (in .env):
//   DISCORD_BOT_TOKEN     the bot token (secret)
//   DISCORD_BOT_SECRET    shared secret the game server also holds
//   GAME_SERVER_URL       where the socket/HTTP server lives (default :3001)
//   GAMES_PUBLIC_URL      public base for lobby links (default games.retakes.fr)
//   DISCORD_GUILD_ID      optional — register commands to one guild (instant)
// The application id is derived from the token, so DISCORD_CLIENT_ID is optional.

const fs = require("fs");
const path = require("path");

// Minimal .env loader (no dependency), only fills vars not already set.
(function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env — rely on the real environment */ }
})();

const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN missing — set it in .env"); process.exit(1); }

// The token's first segment is base64 of the bot's application id.
const CLIENT_ID = process.env.DISCORD_CLIENT_ID
  || (() => { try { return Buffer.from(TOKEN.split(".")[0], "base64").toString("utf8"); } catch { return ""; } })();
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const GAME_SERVER_URL = (process.env.GAME_SERVER_URL || "http://localhost:3001").replace(/\/$/, "");
const GAMES_PUBLIC_URL = (process.env.GAMES_PUBLIC_URL || "https://games.retakes.fr").replace(/\/$/, "");
const BOT_SECRET = process.env.DISCORD_BOT_SECRET || "";
const ACCENT = 0xa855f7;

const GAME_CHOICES = [
  { name: "OUNO", value: "uno" },
  { name: "Monopoly", value: "monopoly" },
  { name: "Skribbl", value: "skribbl" },
  { name: "HASAMEME", value: "meme" },
];

const commands = [
  new SlashCommandBuilder()
    .setName("lobby")
    .setDescription("Garden party-game lobbies")
    .addSubcommand((s) =>
      s.setName("create")
        .setDescription("Create a lobby and get a link to share")
        .addStringOption((o) => o.setName("game").setDescription("Which game to start with").addChoices(...GAME_CHOICES))
        .addStringOption((o) => o.setName("language").setDescription("Game language")
          .addChoices({ name: "English", value: "en" }, { name: "Français", value: "fr" })))
    .addSubcommand((s) =>
      s.setName("join")
        .setDescription("Get the link to join a lobby by its code")
        .addStringOption((o) => o.setName("code").setDescription("Lobby code or link").setRequired(true)))
    .toJSON(),
];

async function registerCommands() {
  if (!CLIENT_ID) { console.warn("No application id — skipping command registration"); return; }
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`Registered /lobby commands to guild ${GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Registered /lobby commands globally (can take up to 1h to appear)");
  }
}

const linkButton = (url) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open lobby ↗").setURL(url)
  );

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => console.log(`Bot online as ${client.user.tag} (app ${CLIENT_ID})`));

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "lobby") return;
  const sub = interaction.options.getSubcommand();

  if (sub === "join") {
    const raw = interaction.options.getString("code").trim();
    const code = raw.split("/").pop().split("?")[0];
    const url = `${GAMES_PUBLIC_URL}/lobby/${encodeURIComponent(code)}`;
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Join a lobby").setDescription(`Lobby \`${code}\``).setColor(ACCENT)],
      components: [linkButton(url)],
    });
  }

  // create
  await interaction.deferReply();
  const game = interaction.options.getString("game") || undefined;
  const lang = interaction.options.getString("language") || "en";
  try {
    const res = await fetch(`${GAME_SERVER_URL}/discord/create-lobby`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-secret": BOT_SECRET },
      body: JSON.stringify({ game, lang, name: `${interaction.user.username}'s lobby` }),
    });
    if (!res.ok) throw new Error(`server ${res.status}`);
    const data = await res.json();
    const gameName = GAME_CHOICES.find((g) => g.value === game)?.name || "Just hanging out";
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Lobby ready")
          .setDescription(`**${gameName}** · opened by ${interaction.user}`)
          .addFields({ name: "Code", value: `\`${data.id}\``, inline: true })
          .setFooter({ text: "First to open the link becomes host" })
          .setColor(ACCENT),
      ],
      components: [linkButton(data.url)],
    });
  } catch (err) {
    await interaction.editReply({ content: "⚠️ Couldn't reach the game server — try again in a moment." });
    console.error("create-lobby failed:", err.message);
  }
});

registerCommands().catch((e) => console.error("Command registration failed:", e.message));
client.login(TOKEN).catch((e) => { console.error("Login failed:", e.message); process.exit(1); });
