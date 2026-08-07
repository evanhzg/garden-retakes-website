const ftp = require("basic-ftp");

async function run() {
  const client = new ftp.Client();
  try {
    await client.access({
      host: "baroque.dathost.net",
      user: "67fd3fd5caae0fdc8408ff64",
      password: "iyoGJKy0aEQ",
      secure: false
    });
    
    await client.uploadFrom("/home/evan/projects/Garden-retakes/wingman_ready.cfg", "/cfg/wingman_ready.cfg");
    console.log("Uploaded wingman_ready.cfg to server!");
  } catch (e) {
    console.error(e);
  }
  client.close();
}
run();
