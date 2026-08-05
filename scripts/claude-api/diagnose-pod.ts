import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

const client = new Anthropic();

async function diagnosePod(podOutputPath: string) {
  const podOutput = readFileSync(podOutputPath, "utf-8");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system:
      "Eres un asistente SRE especializado en Kubernetes. " +
      "Analiza el output de 'kubectl describe pod' que te entreguen y responde SIEMPRE en este formato: " +
      "1) Causa probable (1 linea). 2) Evidencia concreta del output que lo confirma. " +
      "3) Accion de remediacion recomendada. Se conciso, sin relleno.",
    messages: [
      {
        role: "user",
        content: `Diagnostica este pod:\n\n${podOutput}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  console.log(textBlock?.text ?? "Sin respuesta de texto.");
  console.log(`\n[tokens] input: ${response.usage.input_tokens} | output: ${response.usage.output_tokens}`);
}

const podOutputPath = process.argv[2];
if (!podOutputPath) {
  console.error("Uso: npx tsx diagnose-pod.ts <archivo>");
  process.exit(1);
}

diagnosePod(podOutputPath).catch((err) => {
  console.error("Error al llamar la API de Claude:", err.message);
  process.exit(1);
});
