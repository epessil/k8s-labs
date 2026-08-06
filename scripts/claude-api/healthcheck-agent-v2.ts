// Healthcheck Agent v2 — Tool Use + Agent Loop
//
// Propósito: healthcheck autónomo del cluster kind vía Claude API. A diferencia
// de la v1 (healthcheck-agent.ts), que recopila datos con comandos fijos y hace
// un único llamado a Claude, esta versión define tools (get_cluster_pods,
// get_pod_logs, create_incident) y deja que Claude decida en tiempo real qué
// tool invocar y en qué orden, iterando el loop hasta que decide que terminó
// (stop_reason "end_turn"). Genera un reporte en /tmp con el resumen ejecutivo
// y los incidentes detectados.
// Autor: Erick Diaz
// Fecha: 2026-08-06
// Ambiente objetivo: lab (cluster kind local)
// Dependencias: @anthropic-ai/sdk, kubectl configurado contra el cluster kind

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const client = new Anthropic();

// ── DEFINICION DE TOOLS ──────────────────────────────────────────────────────
const tools: Anthropic.Tool[] = [
  {
    name: "get_cluster_pods",
    description: "Lista todos los pods del cluster con su namespace, estado, reinicios y edad.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_pod_logs",
    description: "Obtiene los últimos logs de un pod específico para diagnosticar la causa del problema.",
    input_schema: {
      type: "object" as const,
      properties: {
        pod_name: { type: "string", description: "Nombre exacto del pod" },
        namespace: { type: "string", description: "Namespace del pod" },
      },
      required: ["pod_name", "namespace"],
    },
  },
  {
    name: "create_incident",
    description: "Registra un incidente cuando se detecta un problema crítico en el cluster.",
    input_schema: {
      type: "object" as const,
      properties: {
        severity: { type: "string", enum: ["low", "medium", "critical"] },
        pod_name: { type: "string" },
        namespace: { type: "string" },
        cause: { type: "string", description: "Causa raíz identificada" },
        action: { type: "string", description: "Acción de remediación recomendada" },
      },
      required: ["severity", "pod_name", "namespace", "cause", "action"],
    },
  },
];

// ── EJECUTORES DE TOOLS ──────────────────────────────────────────────────────
const incidents: any[] = [];

function executeTool(name: string, input: any): string {
  switch (name) {
    case "get_cluster_pods": {
      console.log("  → Ejecutando: kubectl get pods --all-namespaces");
      return execSync("kubectl get pods --all-namespaces", { encoding: "utf-8" });
    }
    case "get_pod_logs": {
      console.log(`  → Ejecutando: kubectl logs ${input.pod_name} -n ${input.namespace}`);
      try {
        return execSync(
          `kubectl logs ${input.pod_name} -n ${input.namespace} --tail=30 --previous 2>/dev/null || kubectl logs ${input.pod_name} -n ${input.namespace} --tail=30 2>/dev/null`,
          { encoding: "utf-8" }
        );
      } catch {
        return "No hay logs disponibles para este pod.";
      }
    }
    case "create_incident": {
      console.log(`  → Registrando incidente: ${input.severity.toUpperCase()} — ${input.pod_name}`);
      incidents.push(input);
      return `Incidente registrado: ${input.severity} en ${input.pod_name}`;
    }
    default:
      return "Tool no reconocida.";
  }
}

// ── AGENT LOOP CON TOOL USE ──────────────────────────────────────────────────
async function runAgentLoop(): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Ejecuta un healthcheck completo del cluster Kubernetes. " +
        "1) Lista todos los pods. " +
        "2) Para cualquier pod que NO esté Running, obtén sus logs. " +
        "3) Crea un incidente por cada problema crítico encontrado. " +
        "4) Entrega un resumen ejecutivo al final.",
    },
  ];

  let finalResponse = "";
  let iteration = 0;

  // El loop agéntico
  while (true) {
    iteration++;
    console.log(`\n[Loop iteración ${iteration}]`);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      tools,
      messages,
    });

    console.log(`  Stop reason: ${response.stop_reason}`);
    console.log(`  Tokens: input=${response.usage.input_tokens} | output=${response.usage.output_tokens}`);

    // Agregar respuesta de Claude al historial
    messages.push({ role: "assistant", content: response.content });

    // Si Claude terminó — no necesita más tools
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      finalResponse = textBlock?.text ?? "Sin respuesta final.";
      break;
    }

    // Si Claude quiere usar tools
    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`  Claude pide tool: ${block.name} con params: ${JSON.stringify(block.input)}`);
          const result = executeTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Devolver resultados de tools a Claude
      messages.push({ role: "user", content: toolResults });
    }
  }

  return finalResponse;
}

// ── GUARDAR REPORTE ──────────────────────────────────────────────────────────
function saveReport(summary: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filepath = `/tmp/healthcheck-v2-${timestamp}.md`;

  let report = `# Healthcheck v2 — Agent Loop + Tool Use\n`;
  report += `**Fecha:** ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}\n\n`;
  report += `## Resumen ejecutivo\n${summary}\n\n`;

  if (incidents.length > 0) {
    report += `## Incidentes registrados\n`;
    for (const inc of incidents) {
      report += `### ❌ ${inc.severity.toUpperCase()} — ${inc.pod_name} (${inc.namespace})\n`;
      report += `- **Causa:** ${inc.cause}\n`;
      report += `- **Acción:** ${inc.action}\n\n`;
    }
  } else {
    report += `## Incidentes\n✅ Sin incidentes críticos detectados.\n`;
  }

  writeFileSync(filepath, report, "utf-8");
  console.log(`\nReporte guardado: ${filepath}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Healthcheck Agent v2 — Tool Use + Agent Loop ===");
  console.log(`Inicio: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}\n`);

  const summary = await runAgentLoop();

  console.log("\n" + "=".repeat(60));
  console.log(summary);
  console.log("=".repeat(60));

  saveReport(summary);

  if (incidents.length > 0) {
    console.log(`\n⚠️  ${incidents.length} incidente(s) registrado(s):`);
    for (const inc of incidents) {
      console.log(`   ❌ ${inc.severity.toUpperCase()} — ${inc.pod_name} en ${inc.namespace}`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
