const { spawn } = require("node:child_process");
const path = require("node:path");

function syncAddonsToServer() {
  return new Promise((resolve, reject) => {
    // The deploy script is in Garden-retakes/deploy/deploy.mjs
    const deployScript = path.resolve(__dirname, "..", "..", "..", "Garden-retakes", "deploy", "deploy.mjs");
    
    // We run it with --addons-only to just sync the workshop ids
    const child = spawn("node", [deployScript, "--addons-only"], {
      stdio: "pipe",
    });

    let output = "";
    child.stdout.on("data", (d) => { output += d; });
    child.stderr.on("data", (d) => { output += d; });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Deploy script failed with code ${code}: \n${output}`));
      }
    });
    
    child.on("error", (err) => {
      reject(new Error(`Could not spawn deploy script: ${err.message}`));
    });
  });
}

module.exports = { syncAddonsToServer };
