# Architecture

> 🌐 **Language:** **English** | [Español](es/architecture.md)

## Single-file MCP Server

`index.js` (2250 lines) is intentionally **monolithic** to simplify distribution with OpenCode (copy one file + `yarn install`).

```
index.js
├── Shebang + Imports (MCP SDK, child_process, fs, path, os)
├── Helpers (shellEscape, expandTilde, runCommand, formatResult, findLatestXcresult)
├── TOOLS (47 JSON Schema definitions)
├── Handlers (47 async functions handle_*)
├── Dispatcher (HANDLERS map)
└── Server (Server + StdioServerTransport + ListTools/CallTool)
```

### Key Imports

```js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
```

`promisify(exec)` runs async commands with `maxBuffer:10MB`. `spawn` is imported for future extensions (streaming logs).

### Helpers

- **`shellEscape(arg)`** (`index.js:25`): wraps in `'...'` and escapes `'`. Prevents injection.
- **`expandTilde(p)`** (`index.js:32`): `~/` → `os.homedir()`
- **`runCommand(cmd, opts)`** (`index.js:39`): `execAsync` with try/catch, returns `{success, stdout, stderr, code, error, cmd}`. Never throws.
- **`formatResult(title, result)`** (`index.js:60`): pretty `$ cmd` + `exit:` + `stdout/stderr`
- **`textContent(text)` / `errorContent(msg, details)`** (`index.js:87`): MCP adapters `content` + `isError`
- **`buildXcodebuildBase({...})`** (`index.js:96`): builds `xcodebuild -workspace/-project -scheme -configuration -destination`
- **`findLatestXcresult()`** (`index.js:106`): `find DerivedData -name *.xcresult` + `stat mtimeMs`
- **`xcrunExists(tool)`** (`index.js:133`): `which swift-format` / `swiftlint`

### Tools

`TOOLS` array (`index.js:142`) declares each tool with `name`, `description`, `inputSchema` (JSON Schema draft-07, `additionalProperties:false`). OpenCode generates UI from this.

### Handlers

Each handler follows the pattern:

```js
async function handle_xcode_build(args){
  const cmd = buildXcodebuildBase(args) + " build";
  const result = await runCommand(cmd);
  const text = formatResult("🔨 xcode_build", result);
  if(!result.success) return errorContent("Failed...", text);
  return textContent(text);
}
```

- Arg validation (e.g. `latitude` range, `payloadJson` JSON.parse)
- `fs.access` / `fs.readFile` for paths
- Fallbacks (e.g. `swift_format_lint` tries `swift-format` then `swiftlint`; `xcode_open_at_line` tries `xed` then `open xcode://`)
- Global `try/catch` in `server.setRequestHandler(CallTool)` (`index.js:1195`) that catches any throw and returns `errorContent`.

### Dispatcher

```js
const HANDLERS = { xcode_build: handle_xcode_build, ... };
server.setRequestHandler(CallToolRequestSchema, async (req)=>{
  const handler = HANDLERS[req.params.name];
  if(!handler) return errorContent(`Unknown tool`);
  try{ return await handler(req.params.arguments); }
  catch(e){ return errorContent(`Exception: ${e.message}`, e.stack); }
});
```

### Server

```js
const server = new Server({name:"xcode-mcp-server", version:"1.0.0"}, {capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema, async ()=>({tools: TOOLS}));
await server.connect(new StdioServerTransport());
```

Stdio means: stdin = JSON-RPC, stdout = JSON-RPC, stderr = logs (`✅ Xcode MCP Server started`).

### Data Flow

```
OpenCode / Codex / Claude Code Client
  ──JSON-RPC tools/call {name, arguments}──> stdin
  Server.dispatch -> handler -> runCommand("xcrun ...") -> stdout/stderr
  <──JSON-RPC result {content:[{type:"text", text}]}── stdout
  stderr: logs for debug
```

### Design Decisions

- **Single-file** for OpenCode DX (no build step, no tsc)
- **Yarn Berry** with vendored `yarnPath` for reproducibility without global install
- **Make** as UX orchestrator (idempotent, self-documenting `help`)
- **`exec` vs `spawn`**: `exec` for short commands with full capture; `spawn` reserved for streaming (devicectl logs) if needed later
- **No `// TODO`** — fully implemented, ready to save and run

### Extensibility

To add HTTP/SSE integration (remote Inspector) or unit tests:

- Add `src/` modular and bundle to `index.js` with `esbuild`
- Add `vitest` + `yarn test`
- Keep `index.js` as generated entrypoint

For now, the project prioritizes single-file simplicity.
