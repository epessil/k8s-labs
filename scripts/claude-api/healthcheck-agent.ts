import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const client = new Anthropic();

// ── 1. RECOPILAR DATOS DEL CLUSTER ──────────────────────────────────────────
function collectClusterData(): string {
  const commands = [
    "kubectl get nodes -o wide",
    "kubectl get pods --all-namespaces",
  ];

  let output = "";
  for (const cmd of commands) {
    try {
      const result = execSync(cmd, { encoding: "utf-8" });
      output += `\n### ${cmd}\n${result}\n`;
    } catch (err: any) {
      output += `\n### ${cmd}\nERROR: ${err.message}\n`;
    }
  }
  return output;
}

// ── 2. ANALIZAR CON CLAUDE ───────────────────────────────────────────────────
async function analyzeWithClaude(clusterData: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system:
      "Eres un SRE especializado en Kubernetes. " +
      "Analiza el estado del cluster y genera un reporte de healthcheck. " +
      "Responde SIEMPRE en este formato Markdown:\n" +
      "## Resumen ejecutivo\n" +
      "## Nodos\n" +
      "## Pods con problemas\n" +
      "## Pods en estado normal\n" +
      "## Recomendaciones\n" +
      "Se conciso. Marca con ⚠️ advertencias y ❌ problemas críticos.",
    messages: [
      {
        role: "user",
        content: `Genera el healthcheck de este cluster:\n\n${clusterData}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const report = textBlock?.text ?? "Sin respuesta.";

  console.log(`[tokens] input: ${response.usage.input_tokens} | output: ${response.usage.output_tokens}`);
  return report;
}

// ── 3. GUARDAR REPORTE ───────────────────────────────────────────────────────
function saveReport(report: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `healthcheck-${timestamp}.md`;
  const filepath = `/tmp/${filename}`;

  const fullReport =
    `# Healthcheck — Cluster kind-sre-lab\n` +
    `**Fecha:** ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}\n\n` +
    report;

  writeFileSync(filepath, fullReport, "utf-8");
  console.log(`\nReporte guardado en: ${filepath}`);
  return filepath;
}

// ── 4. AGENT LOOP ────────────────────────────────────────────────────────────
async function runHealthcheck() {
  console.log("=== Healthcheck Agent — Cluster kind-sre-lab ===");
  console.log(`Iniciando: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}\n`);

  // THINK: recopilar contexto
  console.log("[1/3] Recopilando estado del cluster...");
  const clusterData = collectClusterData();

  // ACT + OBSERVE: enviar a Claude y leer respuesta
  console.log("[2/3] Analizando con Claude Haiku...");
  const report = await analyzeWithClaude(clusterData);

  // DECIDE: guardar resultado
  console.log("[3/3] Guardando reporte...\n");
  const filepath = saveReport(report);

  // Output final
  console.log("\n" + "=".repeat(60));
  console.log(report);
  console.log("=".repeat(60));
  console.log(`\nReporte completo: ${filepath}`);
}

// Punto de entrada con manejo de errores
runHealthcheck().catch((err) => {
  console.error("Error en healthcheck agent:", err.message);
  process.exit(1);
});
