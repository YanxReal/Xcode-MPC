#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const execAsync = promisify(exec);
const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

/**
 * Escapa un argumento para shell POSIX.
 * Envuelve en comillas simples y escapa comillas internas.
 */
function shellEscape(arg) {
  if (arg === undefined || arg === null) return "''";
  const str = String(arg);
  if (/^[a-zA-Z0-9_./:@-]+$/.test(str)) return str;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function expandTilde(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  return p;
}

async function runCommand(cmd, opts = {}) {
  const execOpts = {
    maxBuffer: MAX_BUFFER,
    encoding: "utf-8",
    ...opts,
  };
  try {
    const { stdout, stderr } = await execAsync(cmd, execOpts);
    return { success: true, stdout: stdout?.trim() ?? "", stderr: stderr?.trim() ?? "", cmd };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout?.toString()?.trim() ?? "",
      stderr: err.stderr?.toString()?.trim() ?? err.message,
      cmd,
      error: err.message,
      code: err.code ?? 1,
    };
  }
}

function formatResult(title, result, jsonMode = false) {
  if (jsonMode) {
    try {
      const parsed = JSON.parse(result.stdout);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // fallthrough to text
    }
  }
  const lines = [];
  lines.push(`$ ${result.cmd}`);
  lines.push(`exit: ${result.success ? "0 (ok)" : `${result.code} (error)`}`);
  if (result.stdout) {
    lines.push(`\n--- stdout ---\n${result.stdout}`);
  }
  if (result.stderr) {
    lines.push(`\n--- stderr ---\n${result.stderr}`);
  }
  if (result.error && !result.stderr.includes(result.error)) {
    lines.push(`\n--- error ---\n${result.error}`);
  }
  if (!result.stdout && !result.stderr) {
    lines.push("(sin salida)");
  }
  return `${title}\n${lines.join("\n")}`;
}

function textContent(text) {
  return { content: [{ type: "text", text }] };
}

function errorContent(message, details) {
  const text = details ? `${message}\n\nDetalles:\n${details}` : message;
  return { content: [{ type: "text", text }], isError: true };
}

function buildXcodebuildBase({ workspace, project, scheme, configuration, destination }) {
  const parts = ["xcodebuild"];
  if (workspace) parts.push(`-workspace ${shellEscape(workspace)}`);
  else if (project) parts.push(`-project ${shellEscape(project)}`);
  if (scheme) parts.push(`-scheme ${shellEscape(scheme)}`);
  if (configuration) parts.push(`-configuration ${shellEscape(configuration)}`);
  if (destination) parts.push(`-destination ${shellEscape(destination)}`);
  return parts.join(" ");
}

async function findLatestXcresult() {
  // Busca el .xcresult más reciente en DerivedData
  const dd = expandTilde("~/Library/Developer/Xcode/DerivedData");
  try {
    const cmd = `find ${shellEscape(dd)} -name "*.xcresult" -type d -maxdepth 4 2>/dev/null | head -n 50`;
    const res = await runCommand(cmd);
    if (!res.success || !res.stdout) return null;
    const candidates = res.stdout.split("\n").filter(Boolean);
    if (candidates.length === 0) return null;
    // Obtener el más reciente por mtime
    let latest = candidates[0];
    let latestMtime = 0;
    for (const c of candidates) {
      try {
        const stat = await fs.stat(c);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latest = c;
        }
      } catch {}
    }
    return latest;
  } catch {
    return null;
  }
}

async function xcrunExists(tool) {
  const r = await runCommand(`which ${shellEscape(tool)}`);
  return r.success && !!r.stdout;
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "xcode_build",
    description:
      "Ejecuta xcodebuild build. Compila el proyecto/workspace con el scheme especificado. Retorna stdout/stderr completos.",
    inputSchema: {
      type: "object",
      properties: {
        scheme: { type: "string", description: "Nombre del scheme (requerido)" },
        workspace: { type: "string", description: "Ruta al .xcworkspace (opcional, alternativo a project)" },
        project: { type: "string", description: "Ruta al .xcodeproj (opcional, alternativo a workspace)" },
        destination: {
          type: "string",
          description:
            'Destino de compilación, ej: "platform=iOS Simulator,name=iPhone 15,OS=17.5" . Si se omite usa genérico.',
        },
        configuration: {
          type: "string",
          description: "Configuración Debug o Release",
          enum: ["Debug", "Release"],
        },
      },
      required: ["scheme"],
      additionalProperties: false,
    },
  },
  {
    name: "xcode_clean",
    description:
      "Ejecuta xcodebuild clean y opcionalmente purga DerivedData (rm -rf ~/Library/Developer/Xcode/DerivedData).",
    inputSchema: {
      type: "object",
      properties: {
        scheme: { type: "string", description: "Scheme opcional para clean dirigido" },
        workspace: { type: "string", description: "Ruta al .xcworkspace" },
        project: { type: "string", description: "Ruta al .xcodeproj" },
        purgeDerivedData: {
          type: "boolean",
          description: "Si true, borra ~/Library/Developer/Xcode/DerivedData",
          default: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "xcode_list_schemes",
    description:
      "Lista schemes disponibles ejecutando xcodebuild -list -json en el directorio actual o en workspace/project dado.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Ruta al .xcworkspace" },
        project: { type: "string", description: "Ruta al .xcodeproj" },
        directory: { type: "string", description: "Directorio donde ejecutar el comando (default: cwd)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "xcode_analyze",
    description: "Ejecuta el analizador estático: xcodebuild analyze.",
    inputSchema: {
      type: "object",
      properties: {
        scheme: { type: "string", description: "Scheme a analizar" },
        workspace: { type: "string", description: "Ruta al .xcworkspace" },
        project: { type: "string", description: "Ruta al .xcodeproj" },
        destination: { type: "string", description: "Destino, ej: platform=iOS Simulator,name=iPhone 15" },
        configuration: { type: "string", enum: ["Debug", "Release"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "xcode_archive_export",
    description:
      "Ejecuta xcodebuild archive y luego exporta el .ipa usando -exportArchive con un exportOptionsPlist.",
    inputSchema: {
      type: "object",
      properties: {
        scheme: { type: "string", description: "Scheme a archivar (requerido)" },
        workspace: { type: "string", description: "Ruta al .xcworkspace" },
        project: { type: "string", description: "Ruta al .xcodeproj" },
        configuration: { type: "string", enum: ["Debug", "Release"], default: "Release" },
        archivePath: { type: "string", description: "Ruta del .xcarchive a generar (ej: build/App.xcarchive)" },
        exportPath: { type: "string", description: "Directorio de exportación del .ipa" },
        exportOptionsPlist: {
          type: "string",
          description: "Ruta al exportOptions.plist requerido para exportar",
        },
        destination: { type: "string", description: "Destino genérico, ej: generic/platform=iOS" },
      },
      required: ["scheme", "exportOptionsPlist"],
      additionalProperties: false,
    },
  },
  {
    name: "swift_format_lint",
    description:
      "Ejecuta swift-format o swiftlint en una ruta dada. Mode lint verifica, format reescribe/archiva diff. Intenta swift-format primero y hace fallback a swiftlint.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Archivo o directorio a analizar (default: .)" },
        mode: { type: "string", enum: ["lint", "format"], description: "lint = verificar, format = formatear" },
        tool: {
          type: "string",
          enum: ["auto", "swift-format", "swiftlint"],
          description: "Herramienta a usar, auto detecta",
          default: "auto",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "xcode_run_tests",
    description: "Ejecuta xcodebuild test para el scheme y destino dados. Soporta filtro onlyTesting.",
    inputSchema: {
      type: "object",
      properties: {
        scheme: { type: "string", description: "Scheme (requerido)" },
        destination: { type: "string", description: "Destino (requerido), ej: platform=iOS Simulator,name=iPhone 15,OS=17.5" },
        workspace: { type: "string", description: "Ruta al .xcworkspace" },
        project: { type: "string", description: "Ruta al .xcodeproj" },
        configuration: { type: "string", enum: ["Debug", "Release"] },
        onlyTesting: {
          type: "string",
          description: "Filtro de tests, ej: MyAppTests/MyTestSuite/testExample o MyAppTests",
        },
        enableCodeCoverage: {
          type: "boolean",
          description: "Si true añade -enableCodeCoverage YES",
          default: false,
        },
      },
      required: ["scheme", "destination"],
      additionalProperties: false,
    },
  },
  {
    name: "xcode_test_coverage",
    description:
      "Extrae la cobertura en JSON usando xcrun xccov view --report --json de la última racha de pruebas (busca .xcresult en DerivedData).",
    inputSchema: {
      type: "object",
      properties: {
        xcresultPath: {
          type: "string",
          description: "Ruta explícita al .xcresult. Si se omite busca el más reciente en DerivedData.",
        },
        arch: { type: "string", description: "Filtro de arquitectura (opcional)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "simctl_list",
    description: "Lista simuladores vía xcrun simctl list --json devices. Filtrado opcional por booted.",
    inputSchema: {
      type: "object",
      properties: {
        booted: { type: "boolean", description: "Si true solo devuelve simuladores en estado Booted" },
        json: { type: "boolean", description: "Si true devuelve JSON crudo", default: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: "simctl_lifecycle",
    description: "Gestiona ciclo de vida de simuladores: boot, shutdown, erase.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["boot", "shutdown", "erase"], description: "Acción a ejecutar" },
        udid: { type: "string", description: 'UDID del simulador o "booted" para el actual booted' },
      },
      required: ["action", "udid"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_install_launch",
    description: "Instala un .app en el simulador booted y opcionalmente lo inicia por bundleId.",
    inputSchema: {
      type: "object",
      properties: {
        appPath: { type: "string", description: "Ruta al .app compilado (requerida para instalar)" },
        bundleId: { type: "string", description: "Bundle identifier (requerido si launch=true)" },
        launch: { type: "boolean", description: "Si true lanza la app tras instalar", default: false },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: "simctl_media_capture",
    description: "Toma captura (screenshot) o graba pantalla del simulador.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["screenshot", "record"], description: "Tipo de captura" },
        outputPath: { type: "string", description: "Ruta de salida (.png para screenshot, .mp4 para record)" },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
        durationSeconds: { type: "number", description: "Duración para record (segundos). Si se omite graba hasta señal." },
      },
      required: ["type", "outputPath"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_push_notification",
    description: "Envía una notificación Push simulada al simulador booted.",
    inputSchema: {
      type: "object",
      properties: {
        bundleId: { type: "string", description: "Bundle ID destino (requerido)" },
        payloadJson: {
          type: "string",
          description: "String JSON del payload APNs. Ej: '{\"aps\":{\"alert\":\"Hola\"}}'",
        },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
      },
      required: ["bundleId", "payloadJson"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_location_mock",
    description: "Simula ubicación GPS en el simulador booted.",
    inputSchema: {
      type: "object",
      properties: {
        latitude: { type: "number", description: "Latitud (-90 a 90)" },
        longitude: { type: "number", description: "Longitud (-180 a 180)" },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
      },
      required: ["latitude", "longitude"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_privacy_control",
    description: "Otorga o revoca permisos de privacidad (camera, photos, location, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Servicio de privacidad",
          enum: ["all", "calendar", "camera", "contacts", "homekit", "location", "location-always", "media-library", "microphone", "motion", "photos", "reminders", "siri"],
        },
        action: { type: "string", enum: ["grant", "revoke", "reset"], description: "Acción" },
        bundleId: { type: "string", description: "Bundle ID objetivo" },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
      },
      required: ["service", "action", "bundleId"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_ui_appearance",
    description: "Ajusta el modo visual del simulador (light/dark).",
    inputSchema: {
      type: "object",
      properties: {
        appearance: { type: "string", enum: ["light", "dark"], description: "Apariencia" },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
      },
      required: ["appearance"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_open_url",
    description: "Abre Deep Links / URLs en el simulador booted.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL a abrir, ej: myapp://item/123 o https://example.com" },
        udid: { type: "string", description: 'UDID o "booted" (default: booted)' },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "devicectl_list",
    description: "Lista iPhones/iPads físicos conectados vía xcrun devicectl list devices --json.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "devicectl_logs",
    description: "Captura logs en streaming del dispositivo físico durante N segundos.",
    inputSchema: {
      type: "object",
      properties: {
        deviceUdid: { type: "string", description: "UDID del dispositivo físico (requerido)" },
        durationSeconds: { type: "number", description: "Duración en segundos (default 10, max 120)", default: 10 },
      },
      required: ["deviceUdid"],
      additionalProperties: false,
    },
  },
  {
    name: "xctrace_profile",
    description: "Graba una traza de rendimiento con Instruments vía xcrun xctrace.",
    inputSchema: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: "Plantilla de Instruments",
          enum: ["Time Profiler", "Allocations", "Leaks", "System Trace", "Network", "Core Data"],
        },
        timeLimitSeconds: { type: "number", description: "Duración de la grabación en segundos (default 10)" },
        outputFilePath: { type: "string", description: "Ruta de salida .trace (ej: /tmp/trace.trace)" },
        device: { type: "string", description: "UDID o nombre de dispositivo/simulador (opcional)" },
        launchApp: { type: "string", description: "Bundle ID o ruta de app a lanzar bajo perfilado (opcional)" },
      },
      required: ["template", "outputFilePath"],
      additionalProperties: false,
    },
  },
  {
    name: "agvtool_version_bump",
    description: "Modifica la versión del proyecto usando agvtool (xcrun agvtool).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["bump_build", "set_version", "bump_version", "set_build"],
          description: "bump_build = next-version -all, set_version = new-version / new-marketing-version",
        },
        versionString: {
          type: "string",
          description: "Versión a establecer (requerido para set_version / set_build). Ej: 2.0.0 o 42",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "xcode_certificates_check",
    description: "Lista certificados válidos de Apple vía security find-identity -p codesigning -v.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "xcode_get_active_file",
    description: "Usa AppleScript (osascript) para devolver la ruta del archivo activo en el editor de Xcode.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "xcode_open_at_line",
    description: "Abre Xcode en un archivo y línea específicos usando xed o URL scheme xcode://.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Ruta absoluta al archivo" },
        line: { type: "number", description: "Número de línea (1-indexed)" },
        column: { type: "number", description: "Número de columna (opcional, default 1)" },
      },
      required: ["filePath", "line"],
      additionalProperties: false,
    },
  },
  {
    name: "xcode_sync_strings",
    description:
      "Escanea archivos .xcstrings (String Catalog) y devuelve las claves pendientes por traducir o faltantes por idioma.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Ruta al archivo .xcstrings" },
      },
      required: ["filePath"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Implementaciones
// ---------------------------------------------------------------------------

async function handle_xcode_build(args) {
  const { scheme, workspace, project, destination, configuration } = args;
  const base = buildXcodebuildBase({ workspace, project, scheme, configuration, destination });
  const cmd = `${base} build`;
  const result = await runCommand(cmd);
  const text = formatResult("🔨 xcode_build", result);
  if (!result.success) return errorContent("Falló xcodebuild build", text);
  return textContent(text);
}

async function handle_xcode_clean(args) {
  const { scheme, workspace, project, purgeDerivedData } = args;
  const lines = [];
  // 1) xcodebuild clean
  let base = "xcodebuild";
  if (workspace) base += ` -workspace ${shellEscape(workspace)}`;
  else if (project) base += ` -project ${shellEscape(project)}`;
  if (scheme) base += ` -scheme ${shellEscape(scheme)}`;
  base += " clean";
  const resClean = await runCommand(base);
  lines.push(formatResult("🧹 xcodebuild clean", resClean));
  if (!resClean.success) {
    return errorContent("Falló xcodebuild clean", lines.join("\n\n"));
  }
  // 2) purge DerivedData opcional
  if (purgeDerivedData) {
    const dd = expandTilde("~/Library/Developer/Xcode/DerivedData");
    const cmdRm = `rm -rf ${shellEscape(dd)} && mkdir -p ${shellEscape(dd)} && echo "purged:${shellEscape(dd)}"`;
    const resPurge = await runCommand(cmdRm);
    lines.push(formatResult("🗑️ purge DerivedData", resPurge));
    if (!resPurge.success) return errorContent("Falló purge DerivedData", lines.join("\n\n"));
  }
  return textContent(lines.join("\n\n"));
}

async function handle_xcode_list_schemes(args) {
  const { workspace, project, directory } = args;
  let cmd = "xcodebuild -list -json";
  if (workspace) cmd += ` -workspace ${shellEscape(workspace)}`;
  else if (project) cmd += ` -project ${shellEscape(project)}`;
  if (directory) cmd = `cd ${shellEscape(directory)} && ${cmd}`;
  const result = await runCommand(cmd);
  if (!result.success) return errorContent("Falló xcodebuild -list -json", formatResult("xcode_list_schemes", result));
  // Intentar pretty-print JSON
  let pretty = result.stdout;
  try {
    const parsed = JSON.parse(result.stdout);
    pretty = JSON.stringify(parsed, null, 2);
  } catch {}
  return textContent(`$ ${result.cmd}\n${pretty}${result.stderr ? `\n--- stderr ---\n${result.stderr}` : ""}`);
}

async function handle_xcode_analyze(args) {
  const { scheme, workspace, project, destination, configuration } = args;
  if (!scheme && !workspace && !project) {
    return errorContent("xcode_analyze requiere al menos scheme, workspace o project");
  }
  const base = buildXcodebuildBase({ workspace, project, scheme, configuration, destination });
  const cmd = `${base} analyze`;
  const result = await runCommand(cmd);
  const text = formatResult("🔍 xcode_analyze", result);
  if (!result.success) return errorContent("Falló xcodebuild analyze", text);
  return textContent(text);
}

async function handle_xcode_archive_export(args) {
  const { scheme, workspace, project, configuration = "Release", archivePath, exportPath, exportOptionsPlist, destination } = args;
  const resolvedArchive = archivePath || `build/${scheme}.xcarchive`;
  const resolvedExport = exportPath || "build/export";

  // 1) archive
  let archiveCmd = "xcodebuild archive";
  if (workspace) archiveCmd += ` -workspace ${shellEscape(workspace)}`;
  else if (project) archiveCmd += ` -project ${shellEscape(project)}`;
  archiveCmd += ` -scheme ${shellEscape(scheme)}`;
  archiveCmd += ` -configuration ${shellEscape(configuration)}`;
  archiveCmd += ` -archivePath ${shellEscape(resolvedArchive)}`;
  if (destination) archiveCmd += ` -destination ${shellEscape(destination)}`;
  else archiveCmd += ` -destination ${shellEscape("generic/platform=iOS")}`;
  archiveCmd += ` SKIP_INSTALL=NO BUILD_LIBRARY_FOR_DISTRIBUTION=YES`;

  const resArchive = await runCommand(archiveCmd);
  const outArchive = formatResult("📦 xcodebuild archive", resArchive);
  if (!resArchive.success) return errorContent("Falló fase archive", outArchive);

  // 2) export
  const exportCmd = `xcodebuild -exportArchive -archivePath ${shellEscape(resolvedArchive)} -exportPath ${shellEscape(resolvedExport)} -exportOptionsPlist ${shellEscape(expandTilde(exportOptionsPlist))}`;
  const resExport = await runCommand(exportCmd);
  const outExport = formatResult("📤 xcodebuild -exportArchive", resExport);
  const combined = `${outArchive}\n\n${outExport}`;
  if (!resExport.success) return errorContent("Falló fase exportArchive", combined);
  return textContent(combined + `\n\n✅ IPA exportado en: ${resolvedExport}`);
}

async function handle_swift_format_lint(args) {
  const p = expandTilde(args.path || ".");
  const mode = args.mode || "lint";
  const toolPref = args.tool || "auto";

  // Verificar existencia de la ruta
  try {
    await fs.access(p);
  } catch {
    return errorContent(`La ruta no existe: ${p}`);
  }

  const trySwiftFormat = async () => {
    const exists = await xcrunExists("swift-format");
    if (!exists) return null;
    // swift-format lint vs format
    let cmd;
    if (mode === "lint") cmd = `swift-format lint --recursive ${shellEscape(p)}`;
    else cmd = `swift-format format --in-place --recursive ${shellEscape(p)} && echo "formatted:${shellEscape(p)}"`;
    return runCommand(cmd);
  };

  const trySwiftLint = async () => {
    const exists = await xcrunExists("swiftlint");
    if (!exists) return null;
    let cmd;
    if (mode === "lint") cmd = `swiftlint lint --path ${shellEscape(p)}`;
    else cmd = `swiftlint --fix --path ${shellEscape(p)}`;
    // swiftlint puede no tener --fix en versiones viejas, fallback a lint
    const r = await runCommand(cmd);
    if (!r.success && r.stderr.includes("unknown") && mode === "format") {
      const fallback = await runCommand(`swiftlint lint --path ${shellEscape(p)}`);
      return fallback;
    }
    return r;
  };

  let result = null;
  let usedTool = "";

  if (toolPref === "swift-format" || toolPref === "auto") {
    result = await trySwiftFormat();
    if (result) usedTool = "swift-format";
    if (toolPref === "swift-format" && !result) return errorContent("swift-format no encontrado en PATH");
  }
  if (!result && (toolPref === "swiftlint" || (toolPref === "auto" && (!result || !result.success)))) {
    // Si auto y swift-format falló o no existe, probar swiftlint
    if (!result || toolPref === "swiftlint") {
      const r2 = await trySwiftLint();
      if (r2) {
        // Si veníamos de auto y swift-format no existía, usar swiftlint
        if (!result) {
          result = r2;
          usedTool = "swiftlint";
        } else if (toolPref === "swiftlint") {
          result = r2;
          usedTool = "swiftlint";
        } else if (!result.success) {
          // swift-format lint encontró issues, también mostrar swiftlint?
          // Priorizar swift-format si existía
        }
      }
    } else {
      // auto y swift-format ejecutó pero falló, intentar complementar con swiftlint no es necesario
    }
  }
  if (toolPref === "swiftlint" && !result) return errorContent("swiftlint no encontrado en PATH");
  if (!result) return errorContent("Ni swift-format ni swiftlint encontrados. Instala uno: brew install swift-format swiftlint");

  const title = `✨ swift_format_lint (${usedTool} / ${mode})`;
  const text = formatResult(title, result);
  if (!result.success && mode === "lint") {
    // lint con issues no es error fatal, devolver como texto pero marcar isError false para que el cliente vea output
    // Sin embargo si exit code !=0 y hay issues, lo mostramos como texto normal
    return textContent(text + `\n\n⚠️ ${usedTool} reportó incidencias (revisa stdout).`);
  }
  if (!result.success) return errorContent(`${usedTool} falló`, text);
  return textContent(text);
}

async function handle_xcode_run_tests(args) {
  const { scheme, destination, workspace, project, configuration, onlyTesting, enableCodeCoverage } = args;
  let cmd = "xcodebuild test";
  if (workspace) cmd += ` -workspace ${shellEscape(workspace)}`;
  else if (project) cmd += ` -project ${shellEscape(project)}`;
  cmd += ` -scheme ${shellEscape(scheme)}`;
  cmd += ` -destination ${shellEscape(destination)}`;
  if (configuration) cmd += ` -configuration ${shellEscape(configuration)}`;
  if (onlyTesting) cmd += ` -only-testing:${shellEscape(onlyTesting)}`;
  if (enableCodeCoverage) cmd += ` -enableCodeCoverage YES`;
  cmd += ` -resultBundlePath ${shellEscape("build/TestResults.xcresult")}`;
  const result = await runCommand(cmd);
  const text = formatResult("🧪 xcode_run_tests", result);
  if (!result.success) return errorContent("Fallaron los tests (xcodebuild test)", text);
  return textContent(text);
}

async function handle_xcode_test_coverage(args) {
  const xcresult = args.xcresultPath ? expandTilde(args.xcresultPath) : await findLatestXcresult();
  if (!xcresult) {
    return errorContent(
      "No se encontró ningún .xcresult. Ejecuta xcode_run_tests primero o proporciona xcresultPath.",
      "Buscado en ~/Library/Developer/Xcode/DerivedData"
    );
  }
  try {
    await fs.access(xcresult);
  } catch {
    return errorContent(`xcresult no existe: ${xcresult}`);
  }
  let cmd = `xcrun xccov view --report --json ${shellEscape(xcresult)}`;
  if (args.arch) cmd += ` --arch ${shellEscape(args.arch)}`;
  const result = await runCommand(cmd);
  if (!result.success) return errorContent("Falló xcrun xccov view --report --json", formatResult("xcode_test_coverage", result));
  // Pretty + resumen
  let summary = "";
  try {
    const j = JSON.parse(result.stdout);
    // xccov report tiene lineCoverage en tanto por uno
    if (j.lineCoverage !== undefined) summary = `\nCobertura de líneas: ${(j.lineCoverage * 100).toFixed(2)}%`;
    if (j.targets) summary += `\nTargets: ${j.targets.length}`;
  } catch {}
  return textContent(`$ ${result.cmd}\nRuta: ${xcresult}${summary}\n\n${JSON.stringify(JSON.parse(result.stdout), null, 2)}`);
}

async function handle_simctl_list(args) {
  const result = await runCommand("xcrun simctl list --json devices");
  if (!result.success) return errorContent("Falló simctl list", formatResult("simctl_list", result));
  try {
    const parsed = JSON.parse(result.stdout);
    if (args.booted) {
      const filtered = {};
      for (const [runtime, devices] of Object.entries(parsed.devices || {})) {
        const bootedOnly = devices.filter((d) => d.state === "Booted");
        if (bootedOnly.length) filtered[runtime] = bootedOnly;
      }
      parsed.devices = filtered;
      return textContent(JSON.stringify(parsed, null, 2));
    }
    return textContent(JSON.stringify(parsed, null, 2));
  } catch {
    return textContent(formatResult("simctl_list", result));
  }
}

async function handle_simctl_lifecycle(args) {
  const { action, udid } = args;
  const cmd = `xcrun simctl ${shellEscape(action)} ${shellEscape(udid)}`;
  const result = await runCommand(cmd);
  const text = formatResult(`📱 simctl ${action} ${udid}`, result);
  if (!result.success) return errorContent(`Falló simctl ${action}`, text);
  return textContent(text);
}

async function handle_simctl_install_launch(args) {
  const udid = args.udid || "booted";
  const lines = [];
  if (args.appPath) {
    const p = expandTilde(args.appPath);
    try {
      await fs.access(p);
    } catch {
      return errorContent(`appPath no existe: ${p}`);
    }
    const cmdInstall = `xcrun simctl install ${shellEscape(udid)} ${shellEscape(p)}`;
    const rInstall = await runCommand(cmdInstall);
    lines.push(formatResult(`📲 simctl install ${udid}`, rInstall));
    if (!rInstall.success) return errorContent("Falló instalación en simulador", lines.join("\n\n"));
  }
  if (args.launch) {
    if (!args.bundleId) return errorContent("launch=true requiere bundleId");
    const cmdLaunch = `xcrun simctl launch ${shellEscape(udid)} ${shellEscape(args.bundleId)}`;
    const rLaunch = await runCommand(cmdLaunch);
    lines.push(formatResult(`🚀 simctl launch ${args.bundleId}`, rLaunch));
    if (!rLaunch.success) return errorContent("Falló launch", lines.join("\n\n"));
  }
  if (lines.length === 0) return errorContent("Debe proporcionar appPath y/o launch=true con bundleId");
  return textContent(lines.join("\n\n"));
}

async function handle_simctl_media_capture(args) {
  const udid = args.udid || "booted";
  const out = expandTilde(args.outputPath);
  await fs.mkdir(path.dirname(out), { recursive: true }).catch(() => {});
  if (args.type === "screenshot") {
    const cmd = `xcrun simctl io ${shellEscape(udid)} screenshot ${shellEscape(out)} && echo "screenshot:${shellEscape(out)}" && ls -lh ${shellEscape(out)}`;
    const result = await runCommand(cmd);
    const text = formatResult("📸 simctl screenshot", result);
    if (!result.success) return errorContent("Falló screenshot", text);
    return textContent(text);
  } else {
    // record: simctl io booted recordVideo --type=mp4 out.mp4
    // Para evitar bloqueo indefinido, si durationSeconds está definido usamos timeout
    const duration = args.durationSeconds;
    let cmd;
    if (duration && duration > 0) {
      // Usar timeout si está disponible, sino xcrun con límite manual
      cmd = `xcrun simctl io ${shellEscape(udid)} recordVideo --type=mp4 ${shellEscape(out)} & pid=$!; sleep ${Math.ceil(duration)}; kill -SIGINT $pid 2>/dev/null; wait $pid 2>/dev/null; echo "recorded:${shellEscape(out)}"; ls -lh ${shellEscape(out)} 2>&1`;
    } else {
      cmd = `xcrun simctl io ${shellEscape(udid)} recordVideo --type=mp4 ${shellEscape(out)}`;
    }
    const result = await runCommand(cmd, { timeout: duration ? (duration + 15) * 1000 : undefined });
    const text = formatResult("🎥 simctl recordVideo", result);
    if (!result.success) return errorContent("Falló recordVideo", text);
    return textContent(text);
  }
}

async function handle_simctl_push_notification(args) {
  const udid = args.udid || "booted";
  let payload;
  try {
    payload = JSON.parse(args.payloadJson);
  } catch (e) {
    return errorContent(`payloadJson no es JSON válido: ${e.message}`);
  }
  // Escribir payload temporal
  const tmp = path.join(os.tmpdir(), `push-${Date.now()}.json`);
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
  const cmd = `xcrun simctl push ${shellEscape(udid)} ${shellEscape(args.bundleId)} ${shellEscape(tmp)}`;
  const result = await runCommand(cmd);
  await fs.unlink(tmp).catch(() => {});
  const text = formatResult("🔔 simctl push", result);
  if (!result.success) return errorContent("Falló envío de push", text);
  return textContent(text + `\nPayload: ${JSON.stringify(payload, null, 2)}`);
}

async function handle_simctl_location_mock(args) {
  const udid = args.udid || "booted";
  const { latitude, longitude } = args;
  if (latitude < -90 || latitude > 90) return errorContent("latitude fuera de rango [-90, 90]");
  if (longitude < -180 || longitude > 180) return errorContent("longitude fuera de rango [-180, 180]");
  const cmd = `xcrun simctl location ${shellEscape(udid)} set ${shellEscape(String(latitude))} ${shellEscape(String(longitude))}`;
  const result = await runCommand(cmd);
  const text = formatResult("📍 simctl location set", result);
  if (!result.success) return errorContent("Falló mock de ubicación", text);
  return textContent(text);
}

async function handle_simctl_privacy_control(args) {
  const udid = args.udid || "booted";
  const { service, action, bundleId } = args;
  const cmd = `xcrun simctl privacy ${shellEscape(udid)} ${shellEscape(action)} ${shellEscape(service)} ${shellEscape(bundleId)}`;
  const result = await runCommand(cmd);
  const text = formatResult(`🔒 simctl privacy ${action} ${service}`, result);
  if (!result.success) return errorContent("Falló control de privacidad", text);
  return textContent(text);
}

async function handle_simctl_ui_appearance(args) {
  const udid = args.udid || "booted";
  const { appearance } = args;
  const cmd = `xcrun simctl ui ${shellEscape(udid)} appearance ${shellEscape(appearance)}`;
  const result = await runCommand(cmd);
  const text = formatResult(`🌓 simctl ui appearance ${appearance}`, result);
  if (!result.success) return errorContent("Falló cambio de apariencia", text);
  return textContent(text);
}

async function handle_simctl_open_url(args) {
  const udid = args.udid || "booted";
  const cmd = `xcrun simctl openurl ${shellEscape(udid)} ${shellEscape(args.url)}`;
  const result = await runCommand(cmd);
  const text = formatResult(`🔗 simctl openurl ${args.url}`, result);
  if (!result.success) return errorContent("Falló openurl", text);
  return textContent(text);
}

async function handle_devicectl_list() {
  // Intentar --json primero, fallback a texto
  let result = await runCommand("xcrun devicectl list devices --json 2>&1");
  if (result.success && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      return textContent(JSON.stringify(parsed, null, 2));
    } catch {
      return textContent(formatResult("devicectl_list", result));
    }
  }
  // Fallback sin --json
  result = await runCommand("xcrun devicectl list devices 2>&1");
  const text = formatResult("devicectl_list", result);
  if (!result.success) return errorContent("Falló devicectl list devices (¿dispositivo conectado? ¿Xcode 15+?)", text);
  return textContent(text);
}

async function handle_devicectl_logs(args) {
  const { deviceUdid, durationSeconds = 10 } = args;
  const dur = Math.min(Math.max(Number(durationSeconds) || 10, 1), 120);
  // xcrun devicectl device logs --device <udid> --timeout? Usamos streaming con timeout
  // Sintaxis varía por versión; probamos varias
  const outFile = path.join(os.tmpdir(), `devicectl-logs-${Date.now()}.log`);
  // Intentar comando con timeout: gtimeout o bash timeout
  const hasTimeout = (await runCommand("which timeout")).success;
  const hasGtimeout = (await runCommand("which gtimeout")).success;
  const timeoutBin = hasTimeout ? "timeout" : hasGtimeout ? "gtimeout" : null;

  let cmd;
  if (timeoutBin) {
    cmd = `${timeoutBin} ${dur} xcrun devicectl device logs --device ${shellEscape(deviceUdid)} > ${shellEscape(outFile)} 2>&1; echo "exit:$?"; cat ${shellEscape(outFile)} | head -n 500`;
  } else {
    // Fallback: usar perl timeout via bash
    cmd = `bash -c 'xcrun devicectl device logs --device ${shellEscape(deviceUdid)} > ${shellEscape(outFile)} 2>&1 & pid=$!; sleep ${dur}; kill $pid 2>/dev/null; wait $pid 2>/dev/null; echo "exit:$?"; cat ${shellEscape(outFile)} | head -n 500'`;
  }
  const result = await runCommand(cmd, { timeout: (dur + 20) * 1000 });
  // Leer archivo completo si existe
  let fileContent = "";
  try {
    fileContent = await fs.readFile(outFile, "utf-8");
  } catch {}
  await fs.unlink(outFile).catch(() => {});

  const header = `$ xcrun devicectl device logs --device ${deviceUdid} (duración ${dur}s)`;
  const body = fileContent ? fileContent.slice(0, 8000) : result.stdout;
  const truncated = fileContent.length > 8000 ? "\n... (truncado a 8000 chars)" : "";
  const text = `${header}\n${body}${truncated}${result.stderr ? `\n--- stderr ---\n${result.stderr}` : ""}`;
  // No marcar como error si timeout mató el proceso (exit 124)
  return textContent(text || "(sin logs capturados — verifica que el dispositivo esté conectado y trusted)");
}

async function handle_xctrace_profile(args) {
  const { template, timeLimitSeconds = 10, outputFilePath, device, launchApp } = args;
  const out = expandTilde(outputFilePath);
  await fs.mkdir(path.dirname(out), { recursive: true }).catch(() => {});
  let cmd = `xcrun xctrace record --template ${shellEscape(template)} --time-limit ${shellEscape(String(Math.ceil(timeLimitSeconds)))}s --output ${shellEscape(out)}`;
  if (device) cmd += ` --device ${shellEscape(device)}`;
  if (launchApp) cmd += ` --launch -- ${shellEscape(launchApp)}`;
  const result = await runCommand(cmd, { timeout: (timeLimitSeconds + 30) * 1000 });
  const text = formatResult("📈 xctrace record", result);
  if (!result.success) return errorContent("Falló xctrace record", text);
  // Verificar que el archivo se creó
  try {
    const stat = await fs.stat(out);
    return textContent(text + `\n\n✅ Traza guardada: ${out} (${(stat.size / 1024).toFixed(1)} KB)`);
  } catch {
    return textContent(text + `\n⚠️ Comando OK pero no se encontró el archivo: ${out}`);
  }
}

async function handle_agvtool_version_bump(args) {
  const { action, versionString } = args;
  let cmd;
  switch (action) {
    case "bump_build":
      cmd = "xcrun agvtool next-version -all";
      break;
    case "bump_version":
      cmd = "xcrun agvtool next-version -all";
      break;
    case "set_version":
      if (!versionString) return errorContent("set_version requiere versionString (ej: 2.0.0)");
      // new-marketing-version es el preferido en Xcode modernos
      cmd = `xcrun agvtool new-marketing-version ${shellEscape(versionString)}`;
      break;
    case "set_build":
      if (!versionString) return errorContent("set_build requiere versionString (ej: 42)");
      cmd = `xcrun agvtool new-version -all ${shellEscape(versionString)}`;
      break;
    default:
      return errorContent(`Acción desconocida: ${action}`);
  }
  const result = await runCommand(cmd);
  const text = formatResult(`🏷️ agvtool ${action}`, result);
  if (!result.success) {
    // Fallback para set_version en proyectos sin agvtool habilitado
    if (action === "set_version") {
      const fallback = await runCommand(`xcrun agvtool new-version -all ${shellEscape(versionString)}`);
      const t2 = formatResult("🏷️ agvtool fallback new-version", fallback);
      if (!fallback.success) return errorContent("Falló agvtool (¿CURRENT_PROJECT_VERSION configurado?)", text + "\n\n" + t2);
      return textContent(text + "\n\n" + t2);
    }
    return errorContent("Falló agvtool", text);
  }
  return textContent(text);
}

async function handle_xcode_certificates_check() {
  const result = await runCommand("security find-identity -p codesigning -v");
  const text = formatResult("🔐 security find-identity -p codesigning -v", result);
  // security retorna exit 0 incluso si no hay certs, pero avisa en stderr
  if (!result.success) return errorContent("Falló security find-identity", text);
  if (result.stdout.includes("0 valid identities found")) {
    return textContent(text + "\n\n⚠️ No se encontraron identidades de firma válidas.");
  }
  return textContent(text);
}

async function handle_xcode_get_active_file() {
  // AppleScript para obtener el path del documento activo en Xcode
  const script = `
tell application "Xcode"
  if (count of documents) = 0 then
    return "NO_DOCUMENT"
  end if
  try
    set doc to front document
    set p to path of doc
    return p
  on error errMsg
    return "ERROR:" & errMsg
  end try
end tell
`;
  const tmpScript = path.join(os.tmpdir(), `xcode-active-${Date.now()}.applescript`);
  await fs.writeFile(tmpScript, script, "utf-8");
  const result = await runCommand(`osascript ${shellEscape(tmpScript)}`);
  await fs.unlink(tmpScript).catch(() => {});
  if (!result.success) return errorContent("Falló osascript (¿Xcode en ejecución? ¿Permisos de Automation?)", formatResult("xcode_get_active_file", result));
  const out = result.stdout.trim();
  if (out === "NO_DOCUMENT") return errorContent("Xcode no tiene ningún documento abierto");
  if (out.startsWith("ERROR:")) return errorContent(`AppleScript error: ${out.slice(6)}`);
  if (!out) return errorContent("No se pudo obtener el archivo activo (¿Xcode no está al frente?)");
  return textContent(`Archivo activo en Xcode:\n${out}`);
}

async function handle_xcode_open_at_line(args) {
  const filePath = expandTilde(args.filePath);
  const line = Math.max(1, Math.floor(args.line));
  const column = args.column ? Math.max(1, Math.floor(args.column)) : 1;
  try {
    await fs.access(filePath);
  } catch {
    return errorContent(`Archivo no existe: ${filePath}`);
  }
  // Estrategia 1: xed --line (más confiable)
  const xedCmd = `xed --line ${shellEscape(String(line))} ${shellEscape(filePath)} 2>&1 && echo "xed:ok"`;
  const resXed = await runCommand(xedCmd);
  if (resXed.success && resXed.stdout.includes("xed:ok")) {
    return textContent(`✅ Abierto en Xcode vía xed:\nArchivo: ${filePath}\nLínea: ${line}\nColumna: ${column}\n\n$ ${resXed.cmd}\n${resXed.stdout}`);
  }
  // Estrategia 2: URL scheme xcode://  (open)
  const absPath = path.resolve(filePath);
  // xed también soporta columna vía AppleScript, pero intentamos URL scheme como fallback
  const url = `xcode://open?path=${encodeURIComponent(absPath)}&line=${line}&column=${column}`;
  const openCmd = `open ${shellEscape(url)} 2>&1 && echo "open:ok"`;
  const resOpen = await runCommand(openCmd);
  const combined = formatResult("xed (intento 1)", resXed) + "\n\n" + formatResult(`open ${url} (intento 2)`, resOpen);
  if (resOpen.success) return textContent(combined + `\n\n✅ Abierto: ${absPath}:${line}:${column}`);
  return errorContent("Falló abrir en Xcode (xed y open fallaron)", combined);
}

async function handle_xcode_sync_strings(args) {
  const filePath = expandTilde(args.filePath);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (e) {
    return errorContent(`No se pudo leer ${filePath}: ${e.message}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return errorContent(`JSON inválido en ${filePath}: ${e.message}`);
  }
  // Formato .xcstrings: { sourceLanguage, strings: { key: { localizations: { lang: { stringUnit: {state, value}}}}}, version }
  const strings = json.strings || {};
  const sourceLang = json.sourceLanguage || "en";
  const allLangs = new Set([sourceLang]);
  for (const v of Object.values(strings)) {
    const locs = v.localizations || {};
    for (const lang of Object.keys(locs)) allLangs.add(lang);
  }
  const langs = [...allLangs].sort();
  const report = {
    file: filePath,
    sourceLanguage: sourceLang,
    totalKeys: Object.keys(strings).length,
    languages: langs,
    missing: {}, // lang -> [keys]
    pendingTranslation: {}, // lang -> [keys con stringUnit.state != translated]
    emptyValues: {}, // lang -> [keys con value vacío]
  };
  for (const lang of langs) {
    report.missing[lang] = [];
    report.pendingTranslation[lang] = [];
    report.emptyValues[lang] = [];
  }
  for (const [key, entry] of Object.entries(strings)) {
    const locs = entry.localizations || {};
    for (const lang of langs) {
      const loc = locs[lang];
      if (!loc) {
        report.missing[lang].push(key);
        continue;
      }
      const unit = loc.stringUnit || {};
      const state = unit.state || "translated";
      const value = unit.value ?? "";
      if (state !== "translated") report.pendingTranslation[lang].push({ key, state, value });
      if (!value || !value.trim()) report.emptyValues[lang].push(key);
    }
  }
  // Limpiar langs sin issues para salida concisa
  const compact = {
    ...report,
    missing: Object.fromEntries(Object.entries(report.missing).filter(([, v]) => v.length > 0)),
    pendingTranslation: Object.fromEntries(Object.entries(report.pendingTranslation).filter(([, v]) => v.length > 0)),
    emptyValues: Object.fromEntries(Object.entries(report.emptyValues).filter(([, v]) => v.length > 0)),
  };
  const hasIssues = Object.keys(compact.missing).length > 0 || Object.keys(compact.pendingTranslation).length > 0 || Object.keys(compact.emptyValues).length > 0;
  const summary = hasIssues
    ? `⚠️ Se encontraron claves pendientes/traducciones faltantes.`
    : `✅ Todas las claves están traducidas para: ${langs.join(", ")}`;
  return textContent(`${summary}\n\nArchivo: ${filePath}\nIdioma fuente: ${sourceLang}\nClaves totales: ${report.totalKeys}\nIdiomas detectados: ${langs.join(", ")}\n\n${JSON.stringify(compact, null, 2)}`);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const HANDLERS = {
  xcode_build: handle_xcode_build,
  xcode_clean: handle_xcode_clean,
  xcode_list_schemes: handle_xcode_list_schemes,
  xcode_analyze: handle_xcode_analyze,
  xcode_archive_export: handle_xcode_archive_export,
  swift_format_lint: handle_swift_format_lint,
  xcode_run_tests: handle_xcode_run_tests,
  xcode_test_coverage: handle_xcode_test_coverage,
  simctl_list: handle_simctl_list,
  simctl_lifecycle: handle_simctl_lifecycle,
  simctl_install_launch: handle_simctl_install_launch,
  simctl_media_capture: handle_simctl_media_capture,
  simctl_push_notification: handle_simctl_push_notification,
  simctl_location_mock: handle_simctl_location_mock,
  simctl_privacy_control: handle_simctl_privacy_control,
  simctl_ui_appearance: handle_simctl_ui_appearance,
  simctl_open_url: handle_simctl_open_url,
  devicectl_list: handle_devicectl_list,
  devicectl_logs: handle_devicectl_logs,
  xctrace_profile: handle_xctrace_profile,
  agvtool_version_bump: handle_agvtool_version_bump,
  xcode_certificates_check: handle_xcode_certificates_check,
  xcode_get_active_file: handle_xcode_get_active_file,
  xcode_open_at_line: handle_xcode_open_at_line,
  xcode_sync_strings: handle_xcode_sync_strings,
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "xcode-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return errorContent(`Herramienta desconocida: ${name}`);
  }
  try {
    const result = await handler(args);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return errorContent(`Excepción en ${name}: ${message}`, stack);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Xcode MCP Server iniciado (stdio) — 25 herramientas registradas");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
