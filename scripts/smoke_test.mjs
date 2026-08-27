#!/usr/bin/env node
// Fallback JS smoke test. Usar si python no está disponible.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xcode-mcp-"));
const xcstrings = path.join(tmp, "Localizable.xcstrings");
fs.writeFileSync(xcstrings, JSON.stringify({
  sourceLanguage: "en",
  strings: {
    hello: { localizations: { en: { stringUnit: { state: "translated", value: "Hello" } } } }
  },
  version: "1.0"
}));

const proc = spawn("node", ["index.js"], { stdio: ["pipe", "pipe", "pipe"] });
let out = "";
proc.stdout.on("data", d => out += d.toString());
let err = "";
proc.stderr.on("data", d => err += d.toString());

function rpc(obj){ proc.stdin.write(JSON.stringify(obj)+"\n"); }

rpc({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"smoke",version:"1.0"}}});
setTimeout(()=> {
  rpc({jsonrpc:"2.0",method:"notifications/initialized"});
  rpc({jsonrpc:"2.0",id:2,method:"tools/list",params:{}});
  setTimeout(()=> {
    rpc({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"xcode_sync_strings",arguments:{filePath: xcstrings}}});
    setTimeout(()=> { proc.stdin.end(); }, 800);
  }, 400);
}, 600);

setTimeout(()=> {
  proc.kill();
  console.log("STDERR:", err.slice(0,800));
  try {
    const lines = out.split("\n").filter(Boolean).map(l=>JSON.parse(l));
    const tools = lines.find(j=>j.id===2)?.result?.tools || [];
    console.log(`✓ tools: ${tools.length}`);
    if(!tools.find(t=>t.name==="xcode_build")) throw new Error("xcode_build missing");
    console.log("✓ smoke PASSED");
    fs.rmSync(tmp,{recursive:true,force:true});
    process.exit(0);
  } catch(e){
    console.error("✗ FAILED", e.message);
    console.error(out.slice(0,2000));
    process.exit(1);
  }
}, 3000);
