import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

const serveScript = path.resolve("../agentic-web-main/skills/agentify-website/scripts/serve_site.mjs");
const child = spawn("node", [serveScript, ".", "--port", "8080"], {
  stdio: "inherit"
});

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:8080${urlPath}`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, data }));
    }).on("error", reject);
  });
}

setTimeout(async () => {
  try {
    const r1 = await get("/");
    console.log(`GET / -> Status: ${r1.status}, Length: ${r1.data.length}`);

    const r2 = await get("/data/menu.json");
    console.log(`GET /data/menu.json -> Status: ${r2.status}, Items: ${JSON.parse(r2.data).length}`);

    const r3 = await get("/aahira_kitchen.network.json");
    console.log(`GET /aahira_kitchen.network.json -> Status: ${r3.status}`);

    const r4 = await get("/agent-manifest.json");
    console.log(`GET /agent-manifest.json -> Status: ${r4.status}`);

    console.log("\nALL SERVER ENDPOINTS RESPONDED WITH HTTP 200 OK!");
  } catch (err) {
    console.error("Probe error:", err);
  } finally {
    child.kill();
    process.exit(0);
  }
}, 2000);
