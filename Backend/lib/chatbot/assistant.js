import "server-only";
import { generateText, isStepCount } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { buildChatTools, listAvailableTools } from "./tools.js";
import { buildInstructions } from "./prompt.js";
import { redactSecrets } from "./guards.js";

const DEFAULT_MODEL = "openai/gpt-oss-120b";
const MAX_STEPS = 6;

export function isChatConfigured() {
    return Boolean(process.env.GROQ_API_KEY);
}

export function getChatModelId() {
    return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

/**
 * Loads the non-secret store context (name, currency, timezone, local date) for the prompt.
 */
export async function loadChatContext(client) {
    const { data, error } = await client.rpc("chat_context");
    if (error || !data) {
        throw new Error(`Failed to load chat context: ${error?.message || "no data"}`);
    }
    return data;
}

/**
 * Runs one assistant turn: the model may call several read-only tools, then answers.
 * `messages` is the prior conversation plus the new user message.
 */
export async function runAssistant({ user, client, context, messages }) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    const tools = buildChatTools(user, client);
    const toolLabels = listAvailableTools(user).map((t) => t.label);

    const result = await generateText({
        model: groq(getChatModelId()),
        instructions: buildInstructions({ user, context, toolLabels }),
        messages,
        tools,
        stopWhen: isStepCount(MAX_STEPS),
        temperature: 0.2,
        maxOutputTokens: 1500,
        maxRetries: 1,
        providerOptions: {
            groq: { reasoningEffort: "low", user: user.id },
        },
    });

    const toolsUsed = result.steps.flatMap((step) =>
        step.toolCalls.map((call) => ({ name: call.toolName, input: call.input }))
    );

    const reply = redactSecrets(result.text).trim() ||
        "Sorry, I couldn't put an answer together for that. Could you rephrase the question?";

    return {
        reply,
        toolsUsed,
        usage: {
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
        },
    };
}
