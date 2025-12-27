import path from "path"
import { FileProcessInfo, FileProcessRole } from "@/lib/types/repository"

const ACTION_VERBS = [
  "upload",
  "create",
  "generate",
  "process",
  "convert",
  "save",
  "delete",
  "approve",
  "reject",
  "validate",
  "schedule",
  "sync",
  "fetch",
]

export function analyzeProcessFile(
  filePath: string,
  content?: string
): FileProcessInfo {
  const fileName = path.basename(filePath).toLowerCase()

  const category = detectCategory(filePath)
  const entrypoint = detectEntrypoint(filePath, category)

  const actions = content
    ? detectActions(fileName, content)
    : []

  const callsApi = content
    ? extractApiCalls(content)
    : []

  const role = detectRole({
    category,
    entrypoint,
    actions,
  })

  return {
    role,
    entrypoint,
    actions,
    callsApi,
  }
}

/* =========================
   DETECTORES
   ========================= */

function detectCategory(filePath: string): string {
  if (filePath.includes("/api/")) return "api"
  if (filePath.includes("/services/")) return "service"
  if (filePath.includes("/lib/")) return "utility"
  if (filePath.includes("/config")) return "config"
  return "other"
}

function detectEntrypoint(filePath: string, category: string): boolean {
  if (category === "api") return true
  if (filePath.endsWith("route.ts") || filePath.endsWith("route.js")) return true
  if (filePath.endsWith("index.ts") || filePath.endsWith("index.js")) return true
  return false
}

function detectRole(params: {
  category: string
  entrypoint: boolean
  actions: string[]
}): FileProcessRole {
  const { category, entrypoint, actions } = params

  if (category === "config") return "config"
  if (entrypoint) return "entrypoint"
  if (actions.length >= 2) return "orchestrator"
  if (actions.length === 1) return "worker"
  return "utility"
}

function detectActions(
  fileName: string,
  content: string
): string[] {
  const found = new Set<string>()

  for (const verb of ACTION_VERBS) {
    if (fileName.includes(verb)) {
      found.add(verb)
    }

    const rx = new RegExp(`\\b${verb}\\b`, "i")
    if (rx.test(content)) {
      found.add(verb)
    }
  }

  return [...found]
}

function extractApiCalls(content: string): string[] {
  const calls: string[] = []

  const fetchRx = /fetch\(['"`]([^'"`]+)['"`]/g
  const axiosRx =
    /axios\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/g

  let m
  while ((m = fetchRx.exec(content))) calls.push(m[1])
  while ((m = axiosRx.exec(content))) calls.push(m[2])

  return calls.filter(p => p.startsWith("/api/"))
}
