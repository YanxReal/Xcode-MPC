# Arquitectura

## Single-file MCP Server

`index.js` (1220 líneas) es intencionalmente **monolítico** para facilitar distribución con OpenCode (copiar un archivo + `yarn install`).

```
index.js
├── Shebang + Imports (MCP SDK, child_process, fs, path, os)
├── Helpers (shellEscape, expandTilde, runCommand, formatResult, findLatestXcresult)
├── TOOLS (25 definiciones JSON Schema)
├── Handlers (25 async functions handle_*)
├── Dispatcher (HANDLERS map)
└── Server (Server + StdioServerTransport + ListTools/CallTool)
```

### Imports clave

```js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
```

`promisify(exec)` ejecuta comandos asíncronos con `maxBuffer:10MB`. `spawn` está importado para extensiones futuras (streaming logs).

### Helpers

- **`shellEscape(arg)`** (`index.js:25`): envuelve en `'...'` y escapa `'`. Evita inyección.
- **`expandTilde(p)`** (`index.js:32`): `~/` → `os.homedir()`
- **`runCommand(cmd, opts)`** (`index.js:39`): `execAsync` con try/catch, retorna `{success, stdout, stderr, code, error, cmd}`. Nunca lanza.
- **`formatResult(title, result)`** (`index.js:60`): pretty `$ cmd` + `exit:` + `stdout/stderr`
- **`textContent(text)` / `errorContent(msg, details)`** (`index.js:87`): adaptadores MCP `content` + `isError`
- **`buildXcodebuildBase({...})`** (`index.js:96`): construye `xcodebuild -workspace/-project -scheme -configuration -destination`
- **`findLatestXcresult()`** (`index.js:106`): `find DerivedData -name *.xcresult` + `stat mtimeMs`
- **`xcrunExists(tool)`** (`index.js:133`): `which swift-format` / `swiftlint`

### Tools

`TOOLS` array (`index.js:142`) declara cada herramienta con `name`, `description`, `inputSchema` (JSON Schema draft-07, `additionalProperties:false`). OpenCode genera UI a partir de esto.

### Handlers

Cada handler sigue el patrón:

```js
async function handle_xcode_build(args){
  const cmd = buildXcodebuildBase(args) + " build";
  const result = await runCommand(cmd);
  const text = formatResult("🔨 xcode_build", result);
  if(!result.success) return errorContent("Falló...", text);
  return textContent(text);
}
```

- Validación de args (ej. `latitude` rango, `payloadJson` JSON.parse)
- `fs.access` / `fs.readFile` para paths
- Fallbacks (ej. `swift_format_lint` prueba `swift-format` luego `swiftlint`; `xcode_open_at_line` prueba `xed` luego `open xcode://`)
- `try/catch` global en `server.setRequestHandler(CallTool)` (`index.js:1195`) que captura cualquier throw y retorna `errorContent`.

### Dispatcher

```js
const HANDLERS = { xcode_build: handle_xcode_build, ... };
server.setRequestHandler(CallToolRequestSchema, async (req)=>{
  const handler = HANDLERS[req.params.name];
  if(!handler) return errorContent(`Herramienta desconocida`);
  try{ return await handler(req.params.arguments); }
  catch(e){ return errorContent(`Excepción: ${e.message}`, e.stack); }
});
```

### Server

```js
const server = new Server({name:"xcode-mcp-server", version:"1.0.0"}, {capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema, async ()=>({tools: TOOLS}));
await server.connect(new StdioServerTransport());
```

Stdio significa: stdin = JSON-RPC, stdout = JSON-RPC, stderr = logs (`✅ Xcode MCP Server iniciado`).

### Flujo de datos

```
OpenCode Client
  ──JSON-RPC tools/call {name, arguments}──> stdin
  Server.dispatch -> handler -> runCommand("xcrun ...") -> stdout/stderr
  <──JSON-RPC result {content:[{type:"text", text}]}── stdout
  stderr: logs para debug
```

### Decisiones de diseño

- **Single-file** para DX OpenCode (sin build step, sin tsc)
- **Yarn Berry** con `yarnPath` vendorizado para reproducibilidad sin instalación global
- **Make** como orquestador UX (idempotente, `help` autodocumentado)
- **`exec` vs `spawn`**: `exec` para comandos cortos con captura completa; `spawn` reservado para streaming (devicectl logs) si se necesita en futuro
- **No `// TODO`** — implementación completa lista para guardar y ejecutar

### Extensibilidad

Para añadir integración HTTP/SSE (Inspector remoto) o tests unitarios:

- Añadir `src/` modular y bundlear a `index.js` con `esbuild`
- Añadir `vitest` + `yarn test`
- Mantener `index.js` como entrypoint generado

Por ahora, el proyecto prioriza simplicidad single-file.
