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

function hexToRgbFloat(hex) {
  const clean = String(hex).replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean) && !/^[0-9a-fA-F]{8}$/.test(clean)) {
    throw new Error(`HEX inválido: ${hex} (esperado #RRGGBB o #RRGGBBAA)`);
  }
  const hasAlpha = clean.length === 8;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const a = hasAlpha ? parseInt(clean.substring(6, 8), 16) / 255 : 1;
  return { red: r.toFixed(3), green: g.toFixed(3), blue: b.toFixed(3), alpha: a.toFixed(3) };
}

function isValidAssetName(name) {
  return typeof name === "string" && /^[^/\\][^/]*$/.test(name) && !name.includes("..") && name.length <= 100;
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
  {
    name: "asset_list_contents",
    description:
      "Explora un catálogo Assets.xcassets y retorna la lista completa de assets (.colorset, .imageset, .appiconset, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        xcassetsPath: { type: "string", description: "Ruta absoluta al archivo .xcassets" },
      },
      required: ["xcassetsPath"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_manage_color",
    description:
      "Crea o actualiza un Color Set (.colorset) con soporte para hexadecimales y variación Claro/Oscuro (Dark Mode).",
    inputSchema: {
      type: "object",
      properties: {
        xcassetsPath: { type: "string", description: "Ruta absoluta al archivo .xcassets" },
        name: { type: "string", description: "Nombre del color (ej. 'PrimaryButton')" },
        hexLight: { type: "string", description: "Color en HEX para modo claro (ej. '#FF5733')" },
        hexDark: { type: "string", description: "Color en HEX opcional para modo oscuro (ej. '#900C3F')" },
      },
      required: ["xcassetsPath", "name", "hexLight"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_manage_image",
    description:
      "Crea o actualiza un Image Set (.imageset) con soporte para escalas (1x, 2x, 3x) o gráficos vectoriales (PDF/SVG).",
    inputSchema: {
      type: "object",
      properties: {
        xcassetsPath: { type: "string", description: "Ruta absoluta al archivo .xcassets" },
        name: { type: "string", description: "Nombre del asset de imagen" },
        imagePath1x: { type: "string", description: "Ruta local de la imagen 1x o vectorial" },
        imagePath2x: { type: "string", description: "Ruta local de la imagen 2x (opcional)" },
        imagePath3x: { type: "string", description: "Ruta local de la imagen 3x (opcional)" },
        isVector: { type: "boolean", description: "Si es verdadero, configura la imagen como vectorial preservada" },
      },
      required: ["xcassetsPath", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_read_info",
    description: "Lee la configuración JSON exacta (Contents.json) de un asset específico.",
    inputSchema: {
      type: "object",
      properties: {
        assetPath: { type: "string", description: "Ruta absoluta al .colorset, .imageset o subcarpeta dentro de .xcassets" },
      },
      required: ["assetPath"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_delete",
    description: "Elimina de forma segura un asset (.colorset, .imageset, etc.) del catálogo.",
    inputSchema: {
      type: "object",
      properties: {
        assetPath: { type: "string", description: "Ruta absoluta al asset que deseas eliminar" },
      },
      required: ["assetPath"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_validate_actool",
    description:
      "Compila y valida el catálogo .xcassets usando actool para detectar imágenes faltantes, errores o advertencias.",
    inputSchema: {
      type: "object",
      properties: {
        xcassetsPath: { type: "string", description: "Ruta absoluta al .xcassets" },
        platform: {
          type: "string",
          description: "Plataforma objetivo: iphoneos, macosx, appletvos (por defecto: iphoneos)",
          enum: ["iphoneos", "macosx", "appletvos", "watchos", "xros"],
        },
      },
      required: ["xcassetsPath"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_generate_appicon",
    description:
      "Genera la estructura completa de un AppIcon.appiconset para TODOS los OS de Apple (iOS, macOS, watchOS, tvOS, visionOS). Crea el Contents.json estándar y, si se proporciona una imagen base de 1024x1024, redimensiona automáticamente todos los tamaños usando sips de macOS.",
    inputSchema: {
      type: "object",
      properties: {
        xcassetsPath: { type: "string", description: "Ruta absoluta al catálogo .xcassets" },
        iconName: { type: "string", description: "Nombre del asset (por defecto: 'AppIcon')" },
        baseImagePath: { type: "string", description: "Ruta opcional a una imagen PNG de origen (1024x1024 px)" },
        includeIos: { type: "boolean", description: "Incluir tamaños para iPhone e iPad (por defecto: true)" },
        includeMacOs: { type: "boolean", description: "Incluir tamaños para macOS (por defecto: true)" },
        includeWatchOs: { type: "boolean", description: "Incluir tamaños para watchOS (por defecto: true)" },
        includeTvOs: { type: "boolean", description: "Incluir tamaños para tvOS (por defecto: true)" },
        includeVisionOs: { type: "boolean", description: "Incluir tamaños para visionOS (por defecto: true)" },
      },
      required: ["xcassetsPath"],
      additionalProperties: false,
    },
  },
  {
    name: "package_resolve",
    description: "Resuelve y descarga todas las dependencias de paquetes (Swift Package Manager / SPM) del proyecto.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Ruta al directorio raíz del proyecto o archivo .xcodeproj/.xcworkspace" },
      },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "package_update",
    description:
      "Actualiza las dependencias de Swift Package Manager a las últimas versiones permitidas por sus reglas de versión.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Ruta al directorio del proyecto que contiene Package.swift o .xcodeproj" },
      },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "package_list_dependencies",
    description: "Muestra el árbol completo de dependencias de Swift Package Manager en formato JSON.",
    inputSchema: {
      type: "object",
      properties: {
        packageDirectory: { type: "string", description: "Ruta al directorio que contiene el archivo Package.swift" },
      },
      required: ["packageDirectory"],
      additionalProperties: false,
    },
  },
  {
    name: "package_read_resolved",
    description:
      "Lee y analiza el archivo Package.resolved para inspeccionar los commits, tags y versiones exactas fijadas (pinned) en el proyecto.",
    inputSchema: {
      type: "object",
      properties: {
        resolvedFilePath: {
          type: "string",
          description:
            "Ruta absoluta al archivo Package.resolved (ej. TuProyecto.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved)",
        },
      },
      required: ["resolvedFilePath"],
      additionalProperties: false,
    },
  },
  {
    name: "package_reset_cache",
    description: "Limpia las cachés locales de paquetes Swift de Xcode cuando hay problemas de resolución o corrupción de dependencias.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Ruta al proyecto o workspace" },
      },
      required: ["projectPath"],
      additionalProperties: false,
    },
  },
  {
    name: "package_compute_checksum",
    description:
      "Calcula el suma de comprobación (checksum) SHA-256 de un binario o XCFramework zip para publicar paquetes SPM locales o remotos.",
    inputSchema: {
      type: "object",
      properties: {
        zipPath: { type: "string", description: "Ruta absoluta al archivo .zip del XCFramework o paquete" },
      },
      required: ["zipPath"],
      additionalProperties: false,
    },
  },
  {
    name: "spm_add_dependency",
    description: "Añade programáticamente un paquete Swift de terceros al archivo Package.swift en el arreglo de dependencias.",
    inputSchema: {
      type: "object",
      properties: {
        packageSwiftPath: { type: "string", description: "Ruta absoluta al archivo Package.swift" },
        url: { type: "string", description: "URL del repositorio Git (ej. 'https://github.com/Alamofire/Alamofire.git')" },
        requirement: {
          type: "string",
          description:
            "Regla de versión de SwiftPM (ej. 'from: \"5.8.0\"', 'exact: \"1.2.3\"', '.upToNextMajor(from: \"2.0.0\")')",
        },
      },
      required: ["packageSwiftPath", "url", "requirement"],
      additionalProperties: false,
    },
  },
  {
    name: "spm_remove_dependency",
    description: "Elimina una dependencia del archivo Package.swift especificando el nombre o la URL del paquete.",
    inputSchema: {
      type: "object",
      properties: {
        packageSwiftPath: { type: "string", description: "Ruta absoluta al archivo Package.swift" },
        dependencyUrlOrName: { type: "string", description: "URL o nombre del paquete a remover" },
      },
      required: ["packageSwiftPath", "dependencyUrlOrName"],
      additionalProperties: false,
    },
  },
  {
    name: "cocoapods_manage",
    description: "Ejecuta comandos de gestión de CocoaPods en proyectos heredados que utilizan Podfile.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Ruta al directorio que contiene el archivo Podfile" },
        action: {
          type: "string",
          enum: ["install", "update", "deintegrate", "outdated"],
          description: "Acción a ejecutar",
        },
        repoUpdate: { type: "boolean", description: "Ejecutar --repo-update durante install/update (por defecto: false)" },
      },
      required: ["projectPath", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "carthage_manage",
    description: "Gestión de dependencias para proyectos que utilizan Carthage (Cartfile).",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Ruta al directorio del proyecto que contiene Cartfile" },
        action: { type: "string", enum: ["update", "bootstrap", "build"], description: "Acción de Carthage a ejecutar" },
        platform: { type: "string", description: "Plataforma objetivo (ej. 'iOS', 'macOS', 'all')" },
        useXcframeworks: { type: "boolean", description: "Añade el flag --use-xcframeworks (por defecto: true)" },
      },
      required: ["projectPath", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "cocoapods_to_spm_migrate",
    description:
      "Lee las dependencias de un archivo Podfile, extrae los pods con sus versiones o repositorios Git, los convierte a sintaxis .package(...) de SPM y los inyecta en Package.swift.",
    inputSchema: {
      type: "object",
      properties: {
        podfilePath: { type: "string", description: "Ruta absoluta al archivo Podfile" },
        packageSwiftPath: { type: "string", description: "Ruta absoluta al archivo Package.swift objetivo" },
        dryRun: {
          type: "boolean",
          description: "Si es true, solo retorna la conversión en texto sin modificar Package.swift (por defecto: false)",
        },
      },
      required: ["podfilePath", "packageSwiftPath"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_get_screen_analysis",
    description:
      "Captura la pantalla actual del simulador y devuelve la ruta de la imagen junto con sus dimensiones en píxeles para que la IA la analice visualmente (Vision LLM).",
    inputSchema: {
      type: "object",
      properties: {
        udid: { type: "string", description: "UDID del simulador o 'booted' (por defecto: booted)" },
        outputPath: { type: "string", description: "Ruta de salida del PNG (por defecto: /tmp/sim_screen_latest.png)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "simctl_inspect_ui_tree",
    description:
      "Inspecciona la pantalla del simulador y devuelve un árbol JSON con todos los textos, botones e inputs accesibles visibles con sus posiciones y nombres (jerarquía de accesibilidad).",
    inputSchema: {
      type: "object",
      properties: {
        udid: { type: "string", description: "UDID del simulador o 'booted' (informativo, inspección es vía Simulator.app)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "simctl_tap_by_text",
    description:
      "Busca un botón, etiqueta o elemento en pantalla por su texto/título (ej. 'Iniciar Sesión', 'Guardar') y lo pulsa automáticamente calculando su centro.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto o etiqueta visible del botón a pulsar (soporta coincidencia parcial)" },
        exactMatch: { type: "boolean", description: "Si es true, busca coincidencia exacta (por defecto: false)" },
        udid: { type: "string", description: "UDID del simulador o 'booted' (informativo)" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "simctl_fill_field",
    description:
      "Localiza un campo de texto en el simulador mediante su etiqueta, placeholder o texto descriptivo, lo enfoca y escribe el contenido deseado.",
    inputSchema: {
      type: "object",
      properties: {
        labelOrPlaceholder: {
          type: "string",
          description: "Texto de la etiqueta, placeholder o nombre accesible del campo (ej. 'Correo', 'Contraseña', 'Buscar')",
        },
        textToType: { type: "string", description: "Texto que se va a ingresar en el campo" },
        clearFirst: { type: "boolean", description: "Limpia el contenido previo antes de escribir (por defecto: true)" },
      },
      required: ["labelOrPlaceholder", "textToType"],
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

async function handle_asset_list_contents(args) {
  const xcassetsPath = expandTilde(args.xcassetsPath);
  try {
    await fs.access(xcassetsPath);
  } catch {
    return errorContent(`xcassetsPath no existe: ${xcassetsPath}`);
  }
  try {
    const stat = await fs.stat(xcassetsPath);
    if (!stat.isDirectory() || !xcassetsPath.endsWith(".xcassets")) {
      return errorContent(`La ruta no es un .xcassets válido: ${xcassetsPath}`);
    }
  } catch (e) {
    return errorContent(`Error al verificar xcassets: ${e.message}`);
  }
  try {
    const entries = await fs.readdir(xcassetsPath, { recursive: true, withFileTypes: true });
    const assets = entries
      .filter((e) => e.isDirectory() && /\.(imageset|colorset|appiconset|symbolset|dataset|logoset|complicationset|brandassets|stickerset|spriteatlas)$/.test(e.name))
      .map((e) => {
        const parent = e.parentPath || e.path;
        return {
          name: e.name,
          type: path.extname(e.name).replace(".", ""),
          relativePath: path.relative(xcassetsPath, path.join(parent, e.name)),
          absolutePath: path.join(parent, e.name),
        };
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const summary = `Catálogo: ${xcassetsPath}\nTotal assets: ${assets.length}\nTipos: ${[...new Set(assets.map((a) => a.type))].join(", ") || "(vacío)"}`;
    return textContent(`${summary}\n\n${JSON.stringify(assets, null, 2)}`);
  } catch (e) {
    return errorContent(`Falló al listar assets: ${e.message}`, e.stack);
  }
}

async function handle_asset_manage_color(args) {
  const xcassetsPath = expandTilde(args.xcassetsPath);
  const name = args.name?.trim();
  const hexLight = args.hexLight?.trim();
  const hexDark = args.hexDark?.trim() || null;
  if (!isValidAssetName(name)) return errorContent(`Nombre de color inválido: "${name}" (no uses /, \\, .. y max 100 chars)`);
  if (!hexLight) return errorContent("hexLight es requerido");
  let lightComponents, darkComponents;
  try {
    lightComponents = hexToRgbFloat(hexLight);
    if (hexDark) darkComponents = hexToRgbFloat(hexDark);
  } catch (e) {
    return errorContent(e.message);
  }
  try {
    await fs.access(xcassetsPath);
  } catch {
    return errorContent(`xcassetsPath no existe: ${xcassetsPath}`);
  }
  const colorSetDir = path.join(xcassetsPath, `${name}.colorset`);
  try {
    await fs.mkdir(colorSetDir, { recursive: true });
    const colors = [
      { idiom: "universal", color: { "color-space": "srgb", components: lightComponents } },
    ];
    if (darkComponents) {
      colors.push({
        idiom: "universal",
        appearances: [{ appearance: "luminance", value: "dark" }],
        color: { "color-space": "srgb", components: darkComponents },
      });
    }
    const contents = { colors, info: { author: "xcode", version: 1 } };
    await fs.writeFile(path.join(colorSetDir, "Contents.json"), JSON.stringify(contents, null, 2), "utf-8");
    const detail = `Color Set '${name}' configurado en ${colorSetDir}\nLight: ${hexLight} → ${JSON.stringify(lightComponents)}${darkComponents ? `\nDark: ${hexDark} → ${JSON.stringify(darkComponents)}` : ""}`;
    return textContent(detail + `\n\n${JSON.stringify(contents, null, 2)}`);
  } catch (e) {
    return errorContent(`Falló al crear .colorset: ${e.message}`, e.stack);
  }
}

async function handle_asset_manage_image(args) {
  const xcassetsPath = expandTilde(args.xcassetsPath);
  const name = args.name?.trim();
  if (!isValidAssetName(name)) return errorContent(`Nombre de imagen inválido: "${name}"`);
  try {
    await fs.access(xcassetsPath);
  } catch {
    return errorContent(`xcassetsPath no existe: ${xcassetsPath}`);
  }
  const imageSetDir = path.join(xcassetsPath, `${name}.imageset`);
  try {
    await fs.mkdir(imageSetDir, { recursive: true });
    const images = [];
    const copyAndAdd = async (srcPath, scale) => {
      if (!srcPath) return;
      const p = expandTilde(srcPath);
      try {
        await fs.access(p);
      } catch {
        throw new Error(`imagePath ${scale} no existe: ${p}`);
      }
      const ext = path.extname(p);
      if (!ext) throw new Error(`imagePath ${scale} sin extensión: ${p}`);
      const destName = `${name}_${scale}${ext}`;
      await fs.copyFile(p, path.join(imageSetDir, destName));
      images.push({ idiom: "universal", scale, filename: destName });
    };
    if (args.isVector) {
      if (!args.imagePath1x) return errorContent("isVector=true requiere imagePath1x (vector PDF/SVG)");
      const src = expandTilde(args.imagePath1x);
      try {
        await fs.access(src);
      } catch {
        return errorContent(`Vector no existe: ${src}`);
      }
      const ext = path.extname(src);
      const destName = `${name}${ext}`;
      await fs.copyFile(src, path.join(imageSetDir, destName));
      images.push({ idiom: "universal", filename: destName, scale: "1x" });
      const contents = {
        images,
        info: { author: "xcode", version: 1 },
        properties: { "preserves-vector-representation": true },
      };
      await fs.writeFile(path.join(imageSetDir, "Contents.json"), JSON.stringify(contents, null, 2), "utf-8");
      return textContent(`Image Set vectorial '${name}' creado en ${imageSetDir}\nArchivo: ${destName} (preserves-vector-representation: true)\n\n${JSON.stringify(contents, null, 2)}`);
    } else {
      if (!args.imagePath1x && !args.imagePath2x && !args.imagePath3x) {
        // Crear placeholder vacío si no se proveen imágenes, pero con estructura válida
        images.push({ idiom: "universal", scale: "1x" }, { idiom: "universal", scale: "2x" }, { idiom: "universal", scale: "3x" });
      } else {
        await copyAndAdd(args.imagePath1x, "1x");
        await copyAndAdd(args.imagePath2x, "2x");
        await copyAndAdd(args.imagePath3x, "3x");
        if (images.length === 0) return errorContent("No se copiaron imágenes: verifica imagePath1x/2x/3x");
      }
      const contents = { images, info: { author: "xcode", version: 1 } };
      await fs.writeFile(path.join(imageSetDir, "Contents.json"), JSON.stringify(contents, null, 2), "utf-8");
      return textContent(`Image Set '${name}' creado/actualizado en ${imageSetDir}\nImágenes: ${images.map((i) => `${i.scale || "1x"}:${i.filename || "(vacío)"}`).join(", ")}\n\n${JSON.stringify(contents, null, 2)}`);
    }
  } catch (e) {
    return errorContent(`Falló al manejar .imageset: ${e.message}`, e.stack);
  }
}

async function handle_asset_read_info(args) {
  const assetPath = expandTilde(args.assetPath);
  try {
    await fs.access(assetPath);
  } catch {
    return errorContent(`assetPath no existe: ${assetPath}`);
  }
  try {
    const stat = await fs.stat(assetPath);
    const jsonPath = stat.isDirectory() ? path.join(assetPath, "Contents.json") : assetPath;
    const data = await fs.readFile(jsonPath, "utf-8");
    // Validar que es JSON
    try {
      JSON.parse(data);
    } catch (e) {
      return errorContent(`Contents.json no es JSON válido: ${e.message}\nRuta: ${jsonPath}`);
    }
    return textContent(`Asset: ${assetPath}\nContents.json: ${jsonPath}\n\n${data}`);
  } catch (e) {
    return errorContent(`Falló al leer asset: ${e.message}`, e.stack);
  }
}

async function handle_asset_delete(args) {
  const assetPath = expandTilde(args.assetPath);
  // Seguridad: debe estar dentro de un .xcassets y terminar en extensión conocida
  if (!/\.(colorset|imageset|appiconset|symbolset|dataset|logoset|complicationset|brandassets|stickerset|spriteatlas)$/.test(assetPath)) {
    return errorContent(`assetPath debe terminar en .colorset/.imageset/etc.: ${assetPath}`);
  }
  if (!assetPath.includes(".xcassets")) {
    return errorContent(`assetPath debe estar dentro de un .xcassets: ${assetPath}`);
  }
  try {
    await fs.access(assetPath);
  } catch {
    return errorContent(`assetPath no existe: ${assetPath}`);
  }
  try {
    await fs.rm(assetPath, { recursive: true, force: true });
    return textContent(`✅ Asset eliminado: ${assetPath}`);
  } catch (e) {
    return errorContent(`Falló al eliminar asset: ${e.message}`, e.stack);
  }
}

async function handle_asset_validate_actool(args) {
  const xcassetsPath = expandTilde(args.xcassetsPath);
  const platform = args.platform || "iphoneos";
  try {
    await fs.access(xcassetsPath);
  } catch {
    return errorContent(`xcassetsPath no existe: ${xcassetsPath}`);
  }
  const outDir = path.join(os.tmpdir(), `actool_out_${Date.now()}`);
  try {
    await fs.mkdir(outDir, { recursive: true });
  } catch {}
  const cmd = `xcrun actool ${shellEscape(xcassetsPath)} --compile ${shellEscape(outDir)} --platform ${shellEscape(platform)} --minimum-deployment-target 15.0 --output-format human-readable-text 2>&1`;
  const result = await runCommand(cmd);
  const text = formatResult(`🔍 actool validate (${platform})`, result);
  // actool sale con 0 si ok, aunque advierta; tratar warnings como éxito pero reportar
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  if (!result.success && result.stderr.includes("command not found")) {
    return errorContent("xcrun actool no encontrado (¿Xcode instalado?)", text);
  }
  if (!result.success) return errorContent(`actool reportó errores para ${xcassetsPath} (${platform})`, text);
  // Si stdout vacío, es éxito silencioso
  if (!result.stdout && !result.stderr) return textContent(text + "\n\n✅ Validación completada sin errores ni advertencias.");
  // Detectar warnings en salida
  const hasWarnings = /warning|error/i.test(result.stdout + result.stderr);
  return textContent(text + (hasWarnings ? "\n\n⚠️ Revisa advertencias arriba." : "\n\n✅ Validación completada sin errores."));
}

async function handle_asset_generate_appicon(args) {
  const xcassetsPath = expandTilde(args.xcassetsPath);
  const iconName = (args.iconName || "AppIcon").trim();
  if (!isValidAssetName(iconName)) return errorContent(`Nombre de AppIcon inválido: "${iconName}"`);
  try {
    await fs.access(xcassetsPath);
  } catch {
    return errorContent(`xcassetsPath no existe: ${xcassetsPath}`);
  }
  const appIconDir = path.join(xcassetsPath, `${iconName}.appiconset`);
  try {
    await fs.mkdir(appIconDir, { recursive: true });
  } catch (e) {
    return errorContent(`Falló al crear ${appIconDir}: ${e.message}`);
  }
  const includeIos = args.includeIos !== false;
  const includeMacOs = args.includeMacOs !== false;
  const includeWatchOs = args.includeWatchOs !== false;
  const includeTvOs = args.includeTvOs !== false;
  const includeVisionOs = args.includeVisionOs !== false;
  const slots = [];
  if (includeIos) {
    slots.push(
      { idiom: "iphone", size: "20x20", scale: "2x", pixels: 40 },
      { idiom: "iphone", size: "20x20", scale: "3x", pixels: 60 },
      { idiom: "iphone", size: "29x29", scale: "2x", pixels: 58 },
      { idiom: "iphone", size: "29x29", scale: "3x", pixels: 87 },
      { idiom: "iphone", size: "40x40", scale: "2x", pixels: 80 },
      { idiom: "iphone", size: "40x40", scale: "3x", pixels: 120 },
      { idiom: "iphone", size: "60x60", scale: "2x", pixels: 120 },
      { idiom: "iphone", size: "60x60", scale: "3x", pixels: 180 },
      { idiom: "ipad", size: "20x20", scale: "1x", pixels: 20 },
      { idiom: "ipad", size: "20x20", scale: "2x", pixels: 40 },
      { idiom: "ipad", size: "29x29", scale: "1x", pixels: 29 },
      { idiom: "ipad", size: "29x29", scale: "2x", pixels: 58 },
      { idiom: "ipad", size: "40x40", scale: "1x", pixels: 40 },
      { idiom: "ipad", size: "40x40", scale: "2x", pixels: 80 },
      { idiom: "ipad", size: "76x76", scale: "1x", pixels: 76 },
      { idiom: "ipad", size: "76x76", scale: "2x", pixels: 152 },
      { idiom: "ipad", size: "83.5x83.5", scale: "2x", pixels: 167 },
      { idiom: "ios-marketing", size: "1024x1024", scale: "1x", pixels: 1024 }
    );
  }
  if (includeMacOs) {
    slots.push(
      { idiom: "mac", size: "16x16", scale: "1x", pixels: 16 },
      { idiom: "mac", size: "16x16", scale: "2x", pixels: 32 },
      { idiom: "mac", size: "32x32", scale: "1x", pixels: 32 },
      { idiom: "mac", size: "32x32", scale: "2x", pixels: 64 },
      { idiom: "mac", size: "128x128", scale: "1x", pixels: 128 },
      { idiom: "mac", size: "128x128", scale: "2x", pixels: 256 },
      { idiom: "mac", size: "256x256", scale: "1x", pixels: 256 },
      { idiom: "mac", size: "256x256", scale: "2x", pixels: 512 },
      { idiom: "mac", size: "512x512", scale: "1x", pixels: 512 },
      { idiom: "mac", size: "512x512", scale: "2x", pixels: 1024 }
    );
  }
  if (includeWatchOs) {
    slots.push(
      { idiom: "watch", size: "40x40", scale: "2x", pixels: 80, role: "notificationCenter", subtype: "38mm" },
      { idiom: "watch", size: "44x44", scale: "2x", pixels: 88, role: "notificationCenter", subtype: "42mm" },
      { idiom: "watch", size: "50x50", scale: "2x", pixels: 100, role: "notificationCenter", subtype: "45mm" },
      { idiom: "watch", size: "86x86", scale: "2x", pixels: 172, role: "quickLook", subtype: "38mm" },
      { idiom: "watch", size: "98x98", scale: "2x", pixels: 196, role: "quickLook", subtype: "42mm" },
      { idiom: "watch", size: "108x108", scale: "2x", pixels: 216, role: "quickLook", subtype: "45mm" },
      { idiom: "watch", size: "1024x1024", scale: "1x", pixels: 1024, role: "watch-marketing" }
    );
  }
  if (includeTvOs) {
    slots.push(
      { idiom: "tv", size: "400x240", scale: "1x", pixels: 400 },
      { idiom: "tv", size: "400x240", scale: "2x", pixels: 800 },
      { idiom: "tv", size: "1280x768", scale: "1x", pixels: 1280 },
      { idiom: "tv", size: "1280x768", scale: "2x", pixels: 2560 }
    );
  }
  if (includeVisionOs) {
    slots.push(
      { idiom: "vision", size: "1024x1024", scale: "1x", pixels: 1024 },
      { idiom: "vision", size: "32x32", scale: "1x", pixels: 32 },
      { idiom: "vision", size: "32x32", scale: "2x", pixels: 64 }
    );
  }
  if (slots.length === 0) return errorContent("Debes incluir al menos un OS (iOS, macOS, watchOS, tvOS, visionOS)");
  const imagesJson = [];
  let resizedCount = 0;
  let sipsMissing = false;
  if (args.baseImagePath) {
    const base = expandTilde(args.baseImagePath);
    try {
      await fs.access(base);
    } catch {
      return errorContent(`baseImagePath no existe: ${base}`);
    }
    const sipsCheck = await runCommand("which sips");
    if (!sipsCheck.success) sipsMissing = true;
  }
  for (const slot of slots) {
    const safeSize = slot.size.replace(".", "_");
    const filename = `icon_${slot.idiom}_${safeSize}@${slot.scale}.png`;
    const imageEntry = { size: slot.size, idiom: slot.idiom, filename, scale: slot.scale };
    if (slot.role) imageEntry.role = slot.role;
    if (slot.subtype) imageEntry.subtype = slot.subtype;
    if (args.baseImagePath && !sipsMissing) {
      const outPath = path.join(appIconDir, filename);
      const base = expandTilde(args.baseImagePath);
      const resizeCmd = `sips -z ${slot.pixels} ${slot.pixels} ${shellEscape(base)} --out ${shellEscape(outPath)} 2>&1`;
      const r = await runCommand(resizeCmd);
      if (r.success) resizedCount++;
      else {
        // Si falla sips, crear entrada igualmente sin archivo físico
        imageEntry.filename = undefined;
      }
    }
    imagesJson.push(imageEntry);
  }
  const contents = { images: imagesJson, info: { author: "xcode", version: 1 } };
  await fs.writeFile(path.join(appIconDir, "Contents.json"), JSON.stringify(contents, null, 2), "utf-8");
  let statusMsg;
  if (args.baseImagePath) {
    statusMsg = sipsMissing
      ? `AppIcon '${iconName}' creado con ${imagesJson.length} slots (sips no disponible, sin redimensionar).`
      : `AppIcon '${iconName}' creado con ${imagesJson.length} imágenes redimensionadas (${resizedCount}/${slots.length} OK) desde la base.`;
  } else {
    statusMsg = `Estructura AppIcon '${iconName}' creada con ${imagesJson.length} slots definidos en Contents.json (sin imagen base).`;
  }
  const osList = [
    includeIos && "iOS",
    includeMacOs && "macOS",
    includeWatchOs && "watchOS",
    includeTvOs && "tvOS",
    includeVisionOs && "visionOS",
  ]
    .filter(Boolean)
    .join(", ");
  return textContent(`${statusMsg}\nOS incluidos: ${osList}\nRuta: ${appIconDir}\nSlots: ${slots.length}\n\n${JSON.stringify(contents, null, 2)}`);
}

async function handle_package_resolve(args) {
  const projectPath = expandTilde(args.projectPath);
  try {
    await fs.access(projectPath);
  } catch {
    return errorContent(`projectPath no existe: ${projectPath}`);
  }
  try {
    const pkgSwift = path.join(projectPath, "Package.swift");
    const hasPkg = await fs.access(pkgSwift).then(() => true).catch(() => false);
    let cmd;
    if (hasPkg) {
      cmd = `cd ${shellEscape(projectPath)} && swift package resolve 2>&1`;
    } else {
      const isWorkspace = projectPath.endsWith(".xcworkspace");
      const isProject = projectPath.endsWith(".xcodeproj");
      if (isWorkspace) cmd = `xcodebuild -resolvePackageDependencies -workspace ${shellEscape(projectPath)} 2>&1`;
      else if (isProject) cmd = `xcodebuild -resolvePackageDependencies -project ${shellEscape(projectPath)} 2>&1`;
      else {
        // Intentar detectar workspace/project dentro del directorio
        const entries = await fs.readdir(projectPath).catch(() => []);
        const ws = entries.find((e) => e.endsWith(".xcworkspace"));
        const proj = entries.find((e) => e.endsWith(".xcodeproj"));
        if (ws) cmd = `xcodebuild -resolvePackageDependencies -workspace ${shellEscape(path.join(projectPath, ws))} 2>&1`;
        else if (proj) cmd = `xcodebuild -resolvePackageDependencies -project ${shellEscape(path.join(projectPath, proj))} 2>&1`;
        else cmd = `cd ${shellEscape(projectPath)} && swift package resolve 2>&1`;
      }
    }
    const result = await runCommand(cmd);
    const text = formatResult("📦 package resolve", result);
    if (!result.success) return errorContent("Falló package resolve", text);
    return textContent(text);
  } catch (e) {
    return errorContent(`Excepción en package_resolve: ${e.message}`, e.stack);
  }
}

async function handle_package_update(args) {
  const projectPath = expandTilde(args.projectPath);
  try {
    await fs.access(projectPath);
  } catch {
    return errorContent(`projectPath no existe: ${projectPath}`);
  }
  try {
    const pkgSwift = path.join(projectPath, "Package.swift");
    const hasPkg = await fs.access(pkgSwift).then(() => true).catch(() => false);
    let cmd;
    if (hasPkg) {
      cmd = `cd ${shellEscape(projectPath)} && swift package update 2>&1`;
    } else {
      const isWorkspace = projectPath.endsWith(".xcworkspace");
      const isProject = projectPath.endsWith(".xcodeproj");
      if (isWorkspace) cmd = `xcodebuild -resolvePackageDependencies -workspace ${shellEscape(projectPath)} 2>&1 && xcodebuild -updatePackageDependencies -workspace ${shellEscape(projectPath)} 2>&1`;
      else if (isProject) cmd = `xcodebuild -updatePackageDependencies -project ${shellEscape(projectPath)} 2>&1`;
      else {
        const entries = await fs.readdir(projectPath).catch(() => []);
        const ws = entries.find((e) => e.endsWith(".xcworkspace"));
        const proj = entries.find((e) => e.endsWith(".xcodeproj"));
        if (ws) cmd = `xcodebuild -updatePackageDependencies -workspace ${shellEscape(path.join(projectPath, ws))} 2>&1`;
        else if (proj) cmd = `xcodebuild -updatePackageDependencies -project ${shellEscape(path.join(projectPath, proj))} 2>&1`;
        else cmd = `cd ${shellEscape(projectPath)} && swift package update 2>&1`;
      }
    }
    const result = await runCommand(cmd);
    const text = formatResult("🔄 package update", result);
    if (!result.success) return errorContent("Falló package update", text);
    return textContent(text);
  } catch (e) {
    return errorContent(`Excepción en package_update: ${e.message}`, e.stack);
  }
}

async function handle_package_list_dependencies(args) {
  const dir = expandTilde(args.packageDirectory);
  try {
    await fs.access(dir);
  } catch {
    return errorContent(`packageDirectory no existe: ${dir}`);
  }
  try {
    const pkgPath = path.join(dir, "Package.swift");
    await fs.access(pkgPath).catch(() => { throw new Error(`Package.swift no encontrado en ${dir}`); });
    const cmd = `cd ${shellEscape(dir)} && swift package show-dependencies --format json 2>&1`;
    const result = await runCommand(cmd);
    if (!result.success) return errorContent("Falló swift package show-dependencies", formatResult("package_list_dependencies", result));
    try {
      const parsed = JSON.parse(result.stdout);
      return textContent(JSON.stringify(parsed, null, 2));
    } catch {
      return textContent(result.stdout || "(sin salida JSON)");
    }
  } catch (e) {
    return errorContent(`Excepción en package_list_dependencies: ${e.message}`, e.stack);
  }
}

async function handle_package_read_resolved(args) {
  const filePath = expandTilde(args.resolvedFilePath);
  try {
    await fs.access(filePath);
  } catch {
    return errorContent(`resolvedFilePath no existe: ${filePath}`);
  }
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return errorContent(`Package.resolved no es JSON válido: ${e.message}`);
    }
    // Soporta formato v1/v2/v3
    const pinsRaw = parsed.pins || parsed.object?.pins || [];
    const pins = pinsRaw.map((p) => ({
      identity: p.identity || p.package || p.name || "unknown",
      location: p.location || p.repositoryURL || p.url || "",
      version: p.state?.version || p.state?.selectedVersion || p.state?.revision || "N/A",
      revision: p.state?.revision || "N/A",
      branch: p.state?.branch || null,
      kind: p.kind || p.state?.kind || null,
    }));
    const summary = { version: parsed.version ?? parsed.object?.version ?? 1, totalDependencies: pins.length, pins };
    return textContent(JSON.stringify(summary, null, 2));
  } catch (e) {
    return errorContent(`Falló al leer Package.resolved: ${e.message}`, e.stack);
  }
}

async function handle_package_reset_cache(args) {
  const projectPath = expandTilde(args.projectPath);
  try {
    await fs.access(projectPath);
  } catch {
    return errorContent(`projectPath no existe: ${projectPath}`);
  }
  const lines = [];
  try {
    const isWorkspace = projectPath.endsWith(".xcworkspace");
    const isProject = projectPath.endsWith(".xcodeproj");
    let cmd;
    if (isWorkspace) cmd = `xcodebuild -resetPackageCaches -workspace ${shellEscape(projectPath)} 2>&1`;
    else if (isProject) cmd = `xcodebuild -resetPackageCaches -project ${shellEscape(projectPath)} 2>&1`;
    else {
      const entries = await fs.readdir(projectPath).catch(() => []);
      const ws = entries.find((e) => e.endsWith(".xcworkspace"));
      const proj = entries.find((e) => e.endsWith(".xcodeproj"));
      if (ws) cmd = `xcodebuild -resetPackageCaches -workspace ${shellEscape(path.join(projectPath, ws))} 2>&1`;
      else if (proj) cmd = `xcodebuild -resetPackageCaches -project ${shellEscape(path.join(projectPath, proj))} 2>&1`;
      else cmd = `xcodebuild -resetPackageCaches -project ${shellEscape(projectPath)} 2>&1`;
    }
    const r = await runCommand(cmd);
    lines.push(formatResult("🧹 resetPackageCaches", r));
  } catch (e) {
    lines.push(`⚠️ xcodebuild reset falló: ${e.message}`);
  }
  const globalCache = path.join(os.homedir(), "Library/Caches/org.swift.swiftpm");
  try {
    await fs.rm(globalCache, { recursive: true, force: true });
    lines.push(`✅ Caché global SPM borrada: ${globalCache}`);
  } catch (e) {
    lines.push(`⚠️ No se pudo borrar caché global: ${e.message}`);
  }
  // También intentar DerivedData SourcePackages
  const derived = expandTilde("~/Library/Developer/Xcode/DerivedData");
  try {
    const cmd2 = `find ${shellEscape(derived)} -name "SourcePackages" -type d -maxdepth 3 2>/dev/null | head -n 5`;
    const r2 = await runCommand(cmd2);
    if (r2.stdout) lines.push(`SourcePackages encontrados:\n${r2.stdout}`);
  } catch {}
  return textContent(lines.join("\n\n"));
}

async function handle_package_compute_checksum(args) {
  const zipPath = expandTilde(args.zipPath);
  try {
    await fs.access(zipPath);
  } catch {
    return errorContent(`zipPath no existe: ${zipPath}`);
  }
  if (!zipPath.endsWith(".zip")) return errorContent(`zipPath debe ser .zip: ${zipPath}`);
  const cmd = `swift package compute-checksum ${shellEscape(zipPath)} 2>&1`;
  const result = await runCommand(cmd);
  if (!result.success) return errorContent("Falló swift package compute-checksum (¿swift 5.6+?)", formatResult("package_compute_checksum", result));
  const checksum = result.stdout.trim().split(/\s+/).pop();
  return textContent(JSON.stringify({ zipPath, checksum }, null, 2));
}

async function handle_spm_add_dependency(args) {
  const pkgPath = expandTilde(args.packageSwiftPath);
  const url = args.url?.trim();
  const requirement = args.requirement?.trim();
  if (!url || !requirement) return errorContent("url y requirement son requeridos");
  try {
    await fs.access(pkgPath);
  } catch {
    return errorContent(`Package.swift no existe: ${pkgPath}`);
  }
  try {
    let content = await fs.readFile(pkgPath, "utf-8");
    if (content.includes(url)) return textContent(`La dependencia '${url}' ya existe en Package.swift.`);
    const newDependency = `.package(url: "${url}", ${requirement})`;
    const dependenciesRegex = /(dependencies:\s*\[)([\s\S]*?)(\])/;
    if (!dependenciesRegex.test(content)) return errorContent("No se pudo localizar un bloque 'dependencies: [...]' válido dentro de Package.swift.");
    content = content.replace(dependenciesRegex, (match, p1, p2, p3) => {
      const trimmedP2 = p2.trim();
      const leadingSpaces = "        ";
      if (trimmedP2.length === 0) return `${p1}\n${leadingSpaces}${newDependency}\n    ${p3}`;
      return `${p1}${p2.replace(/\n$/, "")},\n${leadingSpaces}${newDependency}\n    ${p3}`;
    });
    await fs.writeFile(pkgPath, content, "utf-8");
    return textContent(`Dependencia '${url}' agregada exitosamente a Package.swift.\n${newDependency}`);
  } catch (e) {
    return errorContent(`Falló al editar Package.swift: ${e.message}`, e.stack);
  }
}

async function handle_spm_remove_dependency(args) {
  const pkgPath = expandTilde(args.packageSwiftPath);
  const target = args.dependencyUrlOrName?.trim();
  if (!target) return errorContent("dependencyUrlOrName requerido");
  try {
    await fs.access(pkgPath);
  } catch {
    return errorContent(`Package.swift no existe: ${pkgPath}`);
  }
  try {
    let content = await fs.readFile(pkgPath, "utf-8");
    const lines = content.split("\n");
    const lower = target.toLowerCase();
    const filtered = lines.filter((l) => !l.toLowerCase().includes(lower));
    if (lines.length === filtered.length) return textContent(`No se encontró la dependencia '${target}' en Package.swift.`);
    let newContent = filtered.join("\n").replace(/,\s*(\n\s*\])/g, "$1");
    await fs.writeFile(pkgPath, newContent, "utf-8");
    return textContent(`Dependencia '${target}' eliminada de Package.swift.`);
  } catch (e) {
    return errorContent(`Falló al eliminar dependencia: ${e.message}`, e.stack);
  }
}

async function handle_cocoapods_manage(args) {
  const projectPath = expandTilde(args.projectPath);
  const action = args.action;
  try {
    await fs.access(projectPath);
  } catch {
    return errorContent(`projectPath no existe: ${projectPath}`);
  }
  const podfile = path.join(projectPath, "Podfile");
  try {
    await fs.access(podfile);
  } catch {
    return errorContent(`Podfile no encontrado en ${projectPath}`);
  }
  const hasPod = await xcrunExists("pod");
  if (!hasPod) {
    const which = await runCommand("which pod");
    if (!which.stdout) return errorContent("CocoaPods no instalado (pod no encontrado). Instala con: sudo gem install cocoapods");
  }
  let cmd = `cd ${shellEscape(projectPath)} && pod ${shellEscape(action)}`;
  if (args.repoUpdate && (action === "install" || action === "update")) cmd += " --repo-update";
  cmd += " 2>&1";
  const result = await runCommand(cmd, { timeout: 300000 });
  const text = formatResult(`🍫 pod ${action}`, result);
  if (!result.success) return errorContent(`Falló pod ${action}`, text);
  return textContent(text);
}

async function handle_carthage_manage(args) {
  const projectPath = expandTilde(args.projectPath);
  const action = args.action;
  try {
    await fs.access(projectPath);
  } catch {
    return errorContent(`projectPath no existe: ${projectPath}`);
  }
  const cartfile = path.join(projectPath, "Cartfile");
  try {
    await fs.access(cartfile);
  } catch {
    return errorContent(`Cartfile no encontrado en ${projectPath}`);
  }
  if (!["update", "bootstrap", "build"].includes(action)) return errorContent(`Acción Carthage inválida: ${action}`);
  const hasCarthage = await runCommand("which carthage");
  if (!hasCarthage.success) return errorContent("Carthage no instalado. Instala con: brew install carthage");
  let cmd = `cd ${shellEscape(projectPath)} && carthage ${shellEscape(action)}`;
  if (args.platform) cmd += ` --platform ${shellEscape(args.platform)}`;
  if (args.useXcframeworks !== false) cmd += " --use-xcframeworks";
  cmd += " 2>&1";
  const result = await runCommand(cmd, { timeout: 600000 });
  const text = formatResult(`📦 carthage ${action}`, result);
  if (!result.success) return errorContent(`Falló carthage ${action}`, text);
  return textContent(text);
}

async function handle_cocoapods_to_spm_migrate(args) {
  const podfilePath = expandTilde(args.podfilePath);
  const packageSwiftPath = expandTilde(args.packageSwiftPath);
  const dryRun = !!args.dryRun;
  try {
    await fs.access(podfilePath);
  } catch {
    return errorContent(`Podfile no existe: ${podfilePath}`);
  }
  try {
    await fs.access(packageSwiftPath);
  } catch {
    return errorContent(`Package.swift no existe: ${packageSwiftPath}`);
  }
  try {
    const podfileContent = await fs.readFile(podfilePath, "utf-8");
    const podLines = podfileContent.split("\n");
    const migratedPackages = [];
    const podRegex = /pod\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?(?:\s*,\s*:git\s*=>\s*['"]([^'"]+)['"])?/;
    for (const line of podLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.startsWith("pod")) continue;
      const match = trimmed.match(podRegex);
      if (!match) continue;
      const podName = match[1];
      const versionSpec = match[2];
      const gitUrl = match[3];
      let repoUrl = gitUrl || `https://github.com/${podName}/${podName}.git`;
      // Heurística para pods populares con org distinta
      const knownOrgs = {
        Alamofire: "https://github.com/Alamofire/Alamofire.git",
        SnapKit: "https://github.com/SnapKit/SnapKit.git",
        SDWebImage: "https://github.com/SDWebImage/SDWebImage.git",
        Realm: "https://github.com/realm/realm-swift.git",
        RxSwift: "https://github.com/ReactiveX/RxSwift.git",
      };
      if (knownOrgs[podName]) repoUrl = knownOrgs[podName];
      let requirement = 'from: "1.0.0"';
      if (versionSpec) {
        if (versionSpec.startsWith("~>")) {
          const cleanVer = versionSpec.replace("~>", "").trim();
          const parts = cleanVer.split(".");
          if (parts.length === 2) requirement = `.upToNextMajor(from: "${cleanVer}.0")`;
          else requirement = `.upToNextMinor(from: "${cleanVer}")`;
        } else if (/^\d/.test(versionSpec)) {
          requirement = `exact: "${versionSpec.trim()}"`;
        } else {
          const cleanVer = versionSpec.replace(/[=>~<]/g, "").trim();
          requirement = `from: "${cleanVer}"`;
        }
      }
      const spmString = `.package(url: "${repoUrl}", ${requirement})`;
      migratedPackages.push({ podName, spmString, repoUrl });
    }
    if (migratedPackages.length === 0) return textContent("No se encontraron dependencias válidas de CocoaPods en el Podfile.");
    if (dryRun) {
      const summary = migratedPackages.map((p) => `// Pod: ${p.podName}\n${p.spmString}`).join("\n\n");
      return textContent(`[Dry Run] Vista previa de la migración (${migratedPackages.length} pods):\n\n${summary}`);
    }
    let packageContent = await fs.readFile(packageSwiftPath, "utf-8");
    let addedCount = 0;
    for (const item of migratedPackages) {
      if (packageContent.includes(item.repoUrl) || packageContent.toLowerCase().includes(item.podName.toLowerCase())) continue;
      const dependenciesRegex = /(dependencies:\s*\[)([\s\S]*?)(\])/;
      if (dependenciesRegex.test(packageContent)) {
        packageContent = packageContent.replace(dependenciesRegex, (match, p1, p2, p3) => {
          const trimmedP2 = p2.trim();
          const leadingSpaces = "        ";
          if (trimmedP2.length === 0) return `${p1}\n${leadingSpaces}${item.spmString}\n    ${p3}`;
          return `${p1}${p2.replace(/\n$/, "")},\n${leadingSpaces}${item.spmString}\n    ${p3}`;
        });
        addedCount++;
      }
    }
    if (addedCount > 0) await fs.writeFile(packageSwiftPath, packageContent, "utf-8");
    return textContent(`Migración completada. Se procesaron ${migratedPackages.length} pods y se inyectaron ${addedCount} nuevas dependencias en Package.swift.${addedCount === 0 ? " (todas ya existían)" : ""}`);
  } catch (e) {
    return errorContent(`Falló migración Podfile→SPM: ${e.message}`, e.stack);
  }
}

function escapeAppleScriptString(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").slice(0, 500);
}

async function handle_simctl_get_screen_analysis(args) {
  const udid = args.udid || "booted";
  const outputPath = expandTilde(args.outputPath || "/tmp/sim_screen_latest.png");
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
  } catch {}
  const shotCmd = `xcrun simctl io ${shellEscape(udid)} screenshot ${shellEscape(outputPath)} 2>&1`;
  const shotRes = await runCommand(shotCmd);
  if (!shotRes.success) return errorContent("Falló captura de pantalla (simctl screenshot)", formatResult("simctl_get_screen_analysis", shotRes));
  try {
    await fs.access(outputPath);
  } catch {
    return errorContent(`Screenshot no se creó: ${outputPath}`, formatResult("simctl_get_screen_analysis", shotRes));
  }
  let width = 0, height = 0;
  try {
    const sipsCmd = `sips -g pixelWidth -g pixelHeight ${shellEscape(outputPath)} 2>&1`;
    const sipsRes = await runCommand(sipsCmd);
    const wMatch = sipsRes.stdout.match(/pixelWidth:\s*(\d+)/);
    const hMatch = sipsRes.stdout.match(/pixelHeight:\s*(\d+)/);
    if (wMatch) width = parseInt(wMatch[1], 10);
    if (hMatch) height = parseInt(hMatch[1], 10);
    // Fallback via file stat if sips no disponible
    if (!width || !height) {
      try {
        const stat = await fs.stat(outputPath);
        // No real dimensions, leave 0
      } catch {}
    }
  } catch {}
  // Obtener escala del simulador si es posible
  let scale = 2;
  try {
    const listRes = await runCommand("xcrun simctl list --json devices 2>&1");
    if (listRes.success) {
      const parsed = JSON.parse(listRes.stdout);
      // No extra processing, scale queda 2 por defecto
    }
  } catch {}
  const payload = {
    message: "Captura de pantalla realizada correctamente.",
    imagePath: outputPath,
    resolution: { width, height },
    scale,
    udid,
    instructions: "Usa la imagen en imagePath para análisis visual con Vision LLM. Las coordenadas de toque están en píxeles (width x height). Puedes llamar simctl_tap_by_text o simctl_inspect_ui_tree para interacción.",
  };
  return textContent(JSON.stringify(payload, null, 2));
}

async function handle_simctl_inspect_ui_tree(args) {
  const udid = args.udid || "booted";
  // Usar AppleScript via archivo temporal para evitar inyección y límites de línea
  const script = `
    tell application "System Events"
      tell process "Simulator"
        set frontmost to true
        if (count of windows) is 0 then return "[]"
        set uiElements to {}
        try
          set allElems to entire contents of window 1
        on error
          return "[]"
        end try
        repeat with elem in allElems
          try
            set elemRole to ""
            try
              set elemRole to (role of elem) as text
            end try
            set elemName to ""
            try
              set elemName to (name of elem) as text
            end try
            set elemTitle to ""
            try
              set elemTitle to (title of elem) as text
            end try
            set elemValue to ""
            try
              set elemValue to (value of elem) as text
            end try
            set elemDesc to ""
            try
              set elemDesc to (description of elem) as text
            end try
            set posX to 0
            set posY to 0
            try
              set {posX, posY} to position of elem
            end try
            set sizeW to 0
            set sizeH to 0
            try
              set {sizeW, sizeH} to size of elem
            end try
            if (elemName is not "" or elemTitle is not "" or elemValue is not "" or elemDesc is not "") then
              set centerX to posX + (sizeW / 2)
              set centerY to posY + (sizeH / 2)
              set end of uiElements to "{\"role\":\"" & elemRole & "\",\"name\":\"" & elemName & "\",\"title\":\"" & elemTitle & "\",\"value\":\"" & elemValue & "\",\"description\":\"" & elemDesc & "\",\"position\":{\"x\":" & posX & ",\"y\":" & posY & "},\"size\":{\"w\":" & sizeW & ",\"h\":" & sizeH & "},\"center\":{\"x\":" & centerX & ",\"y\":" & centerY & "}}"
            end if
          end try
        end repeat
        set AppleScript's text item delimiters to ","
        set jsonArray to "[" & (uiElements as text) & "]"
        return jsonArray
      end tell
    end tell
  `;
  const tmp = path.join(os.tmpdir(), `inspect-ui-${Date.now()}.applescript`);
  try {
    await fs.writeFile(tmp, script, "utf-8");
    const result = await runCommand(`osascript ${shellEscape(tmp)} 2>&1`);
    await fs.unlink(tmp).catch(() => {});
    if (!result.success) return errorContent("Falló osascript para inspeccionar UI (¿Simulator.app en ejecución? ¿Permisos Automation?)", formatResult("simctl_inspect_ui_tree", result));
    const out = result.stdout.trim();
    if (!out || out === "[]") return textContent(`No se detectaron elementos interactivos accesibles en Simulator (udid: ${udid}).\nVerifica que el simulador esté visible y la app en primer plano.\n\n${out || "[]"}`);
    // Intentar parsear y pretty-print si es JSON
    try {
      const parsed = JSON.parse(out);
      const summary = `Árbol de UI: ${parsed.length} elementos detectados (udid: ${udid})\nUsa simctl_tap_by_text para pulsar por texto.`;
      return textContent(`${summary}\n\n${JSON.stringify(parsed, null, 2)}`);
    } catch {
      return textContent(`Árbol de UI (raw, udid: ${udid}):\n${out.slice(0, 8000)}`);
    }
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    return errorContent(`Excepción en simctl_inspect_ui_tree: ${e.message}`, e.stack);
  }
}

async function handle_simctl_tap_by_text(args) {
  const rawText = String(args.text || "").trim();
  if (!rawText) return errorContent("text es requerido y no puede estar vacío");
  if (rawText.length > 200) return errorContent("text demasiado largo (max 200 caracteres)");
  const exact = args.exactMatch === true;
  const udid = args.udid || "booted";
  const escaped = escapeAppleScriptString(rawText.toLowerCase());
  const script = `
    tell application "System Events"
      tell process "Simulator"
        set frontmost to true
        if (count of windows) is 0 then return "NO_WINDOW"
        set allElems to entire contents of window 1
        set targetText to "${escaped}"
        repeat with elem in allElems
          try
            set elemName to ""
            try
              set elemName to (name of elem) as text
            end try
            set elemTitle to ""
            try
              set elemTitle to (title of elem) as text
            end try
            set elemValue to ""
            try
              set elemValue to (value of elem) as text
            end try
            set elemDesc to ""
            try
              set elemDesc to (description of elem) as text
            end try
            set matchFound to false
            if ${exact ? "true" : "false"} then
              if (elemName as text) is not "" and (do shell script "echo " & quoted form of elemName & " | tr '[:upper:]' '[:lower:]'") is targetText then set matchFound to true
              if (elemTitle as text) is not "" and (do shell script "echo " & quoted form of elemTitle & " | tr '[:upper:]' '[:lower:]'") is targetText then set matchFound to true
              if (elemValue as text) is not "" and (do shell script "echo " & quoted form of elemValue & " | tr '[:upper:]' '[:lower:]'") is targetText then set matchFound to true
            else
              if elemName contains targetText or elemTitle contains targetText or elemValue contains targetText or elemDesc contains targetText then
                -- Segunda verificación case-insensitive via lowercase
                set lowerName to do shell script "echo " & quoted form of elemName & " | tr '[:upper:]' '[:lower:]'"
                set lowerTitle to do shell script "echo " & quoted form of elemTitle & " | tr '[:upper:]' '[:lower:]'"
                set lowerValue to do shell script "echo " & quoted form of elemValue & " | tr '[:upper:]' '[:lower:]'"
                set lowerDesc to do shell script "echo " & quoted form of elemDesc & " | tr '[:upper:]' '[:lower:]'"
                if lowerName contains targetText or lowerTitle contains targetText or lowerValue contains targetText or lowerDesc contains targetText then set matchFound to true
              end if
            end if
            if matchFound then
              try
                click elem
              on error
                -- Fallback: click por coordenadas
                set {posX, posY} to position of elem
                set {sizeW, sizeH} to size of elem
                set centerX to posX + (sizeW / 2)
                set centerY to posY + (sizeH / 2)
                click at {centerX, centerY}
              end try
              set {posX, posY} to position of elem
              set {sizeW, sizeH} to size of elem
              return "CLICKED:" & (posX + (sizeW / 2)) & "," & (posY + (sizeH / 2)) & ":" & (role of elem)
            end if
          end try
        end repeat
        return "NOT_FOUND"
      end tell
    end tell
  `;
  const tmp = path.join(os.tmpdir(), `tap-by-text-${Date.now()}.applescript`);
  try {
    await fs.writeFile(tmp, script, "utf-8");
    const result = await runCommand(`osascript ${shellEscape(tmp)} 2>&1`, { timeout: 15000 });
    await fs.unlink(tmp).catch(() => {});
    if (!result.success) return errorContent("Falló osascript para tap_by_text", formatResult("simctl_tap_by_text", result));
    const out = result.stdout.trim();
    if (out.startsWith("CLICKED:")) {
      const parts = out.replace("CLICKED:", "").split(":");
      const coords = parts[0];
      const role = parts[1] || "unknown";
      return textContent(`✅ Elemento '${rawText}' encontrado y pulsado con éxito en coordenadas (${coords}) [role: ${role}, udid: ${udid}].`);
    } else if (out === "NOT_FOUND") {
      // Sugerir inspect
      return textContent(`No se encontró ningún elemento que contenga '${rawText}' (exact=${exact}, udid: ${udid}).\nSugerencia: usa simctl_inspect_ui_tree para ver textos disponibles, o simctl_get_screen_analysis para análisis visual.`,);
    } else if (out === "NO_WINDOW") {
      return errorContent("No hay ventanas del simulador activas. Abre Simulator.app y asegúrate de que la app esté en primer plano.");
    } else {
      return textContent(`Resultado inesperado de tap_by_text (udid: ${udid}): ${out.slice(0, 2000)}`);
    }
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    return errorContent(`Excepción en simctl_tap_by_text: ${e.message}`, e.stack);
  }
}

async function handle_simctl_fill_field(args) {
  const rawLabel = String(args.labelOrPlaceholder || "").trim();
  const textToType = String(args.textToType || "");
  const clearFirst = args.clearFirst !== false;
  if (!rawLabel) return errorContent("labelOrPlaceholder es requerido");
  if (rawLabel.length > 200) return errorContent("labelOrPlaceholder demasiado largo (max 200)");
  const escapedLabel = escapeAppleScriptString(rawLabel.toLowerCase());
  const escapedType = escapeAppleScriptString(textToType);
  const script = `
    tell application "System Events"
      tell process "Simulator"
        set frontmost to true
        if (count of windows) is 0 then return "NO_WINDOW"
        set allElems to entire contents of window 1
        set targetText to "${escapedLabel}"
        repeat with elem in allElems
          try
            set elemName to ""
            try
              set elemName to (name of elem) as text
            end try
            set elemTitle to ""
            try
              set elemTitle to (title of elem) as text
            end try
            set elemValue to ""
            try
              set elemValue to (value of elem) as text
            end try
            set elemDesc to ""
            try
              set elemDesc to (description of elem) as text
            end try
            set elemRole to ""
            try
              set elemRole to (role of elem) as text
            end try
            set lowerName to do shell script "echo " & quoted form of elemName & " | tr '[:upper:]' '[:lower:]'"
            set lowerTitle to do shell script "echo " & quoted form of elemTitle & " | tr '[:upper:]' '[:lower:]'"
            set lowerValue to do shell script "echo " & quoted form of elemValue & " | tr '[:upper:]' '[:lower:]'"
            set lowerDesc to do shell script "echo " & quoted form of elemDesc & " | tr '[:upper:]' '[:lower:]'"
            set matchFound to false
            if lowerName contains targetText or lowerTitle contains targetText or lowerValue contains targetText or lowerDesc contains targetText then set matchFound to true
            set isTextField to (elemRole contains "text field" or elemRole contains "text area" or elemRole contains "secure")
            if matchFound and isTextField then
              click elem
              delay 0.3
              if ${clearFirst ? "true" : "false"} then
                keystroke "a" using command down
                delay 0.1
                key code 51
                delay 0.1
              end if
              keystroke "${escapedType}"
              delay 0.2
              return "SUCCESS:" & elemRole
            else if matchFound and not isTextField then
              -- Si el match es un label, buscar el text field cercano
              -- Por ahora intentar click igual
              click elem
              delay 0.2
              keystroke "${escapedType}"
              return "SUCCESS_LABEL:" & elemRole
            end if
          end try
        end repeat
        return "NOT_FOUND"
      end tell
    end tell
  `;
  const tmp = path.join(os.tmpdir(), `fill-field-${Date.now()}.applescript`);
  try {
    await fs.writeFile(tmp, script, "utf-8");
    const result = await runCommand(`osascript ${shellEscape(tmp)} 2>&1`, { timeout: 15000 });
    await fs.unlink(tmp).catch(() => {});
    if (!result.success) return errorContent("Falló osascript para fill_field (¿Permisos Automation?)" , formatResult("simctl_fill_field", result));
    const out = result.stdout.trim();
    if (out.startsWith("SUCCESS")) {
      return textContent(`✅ Campo '${rawLabel}' localizado y rellenado correctamente con '${textToType}' [${out}].`);
    } else if (out === "NOT_FOUND") {
      return errorContent(`No se encontró ningún campo de texto con la etiqueta/placeholder '${rawLabel}'. Sugerencia: usa simctl_inspect_ui_tree para ver labels disponibles.`);
    } else if (out === "NO_WINDOW") {
      return errorContent("No hay ventanas activas del simulador.");
    } else {
      return textContent(`Resultado fill_field: ${out.slice(0, 2000)}`);
    }
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    return errorContent(`Excepción en simctl_fill_field: ${e.message}`, e.stack);
  }
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
  asset_list_contents: handle_asset_list_contents,
  asset_manage_color: handle_asset_manage_color,
  asset_manage_image: handle_asset_manage_image,
  asset_read_info: handle_asset_read_info,
  asset_delete: handle_asset_delete,
  asset_validate_actool: handle_asset_validate_actool,
  asset_generate_appicon: handle_asset_generate_appicon,
  package_resolve: handle_package_resolve,
  package_update: handle_package_update,
  package_list_dependencies: handle_package_list_dependencies,
  package_read_resolved: handle_package_read_resolved,
  package_reset_cache: handle_package_reset_cache,
  package_compute_checksum: handle_package_compute_checksum,
  spm_add_dependency: handle_spm_add_dependency,
  spm_remove_dependency: handle_spm_remove_dependency,
  cocoapods_manage: handle_cocoapods_manage,
  carthage_manage: handle_carthage_manage,
  cocoapods_to_spm_migrate: handle_cocoapods_to_spm_migrate,
  simctl_get_screen_analysis: handle_simctl_get_screen_analysis,
  simctl_inspect_ui_tree: handle_simctl_inspect_ui_tree,
  simctl_tap_by_text: handle_simctl_tap_by_text,
  simctl_fill_field: handle_simctl_fill_field,
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "xcode-mcp-server",
    version: "1.3.0",
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
  console.error("✅ Xcode MCP Server iniciado (stdio) — 47 herramientas registradas");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
