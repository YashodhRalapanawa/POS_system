import { z } from "zod";
import { APICallError, RetryError } from "ai";
import { requireAuthAndRole } from "../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../lib/responses/index.js";
import { listAvailableTools } from "../../../lib/chatbot/tools.js";
import { ASSISTANT_NAME } from "../../../lib/chatbot/prompt.js";
import { isSecretRequest, SECRET_REFUSAL, checkRateLimit } from "../../../lib/chatbot/guards.js";
import { isChatConfigured, getChatModelId, loadChatContext, runAssistant } from "../../../lib/chatbot/assistant.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HISTORY = 20;

const chatRequestSchema = z.object({
    message: z.string().trim().min(1, "Message is required.").max(1000, "Message is too long (max 1000 characters)."),
    history: z
        .array(
            z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().max(4000),
            })
        )
        .max(MAX_HISTORY, `History can contain at most ${MAX_HISTORY} messages.`)
        .optional()
        .default([]),
});

const SUGGESTIONS = [
    { label: "📊 Today's sales", question: "How much did we sell today?", tool: "get_sales_summary" },
    { label: "📈 This week vs last week", question: "Compare this week's sales with last week.", tool: "get_sales_summary" },
    { label: "🏆 Best sellers", question: "What are the best-selling products this month?", tool: "get_top_products" },
    { label: "📦 Low stock", question: "Which products need to be reordered?", tool: "get_low_stock" },
    { label: "🔎 Find a product", question: "How many units of milk do we have?", tool: "find_products" },
    { label: "↩️ Returns", question: "How many returns did we have this week?", tool: "get_returns_summary" },
    { label: "🧾 My shift", question: "Show me today's shift summary.", tool: "get_shift_summary" },
];

/**
 * GET /api/chat
 * Describes the assistant for the signed-in user: what it can look up and suggested questions.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndRole(request, []);
        if (!auth.authorized) {
            return auth.response;
        }

        const tools = listAvailableTools(auth.user);
        const toolNames = new Set(tools.map((t) => t.name));

        return successResponse(
            {
                assistant: ASSISTANT_NAME,
                configured: isChatConfigured(),
                model: getChatModelId(),
                capabilities: tools.map(({ name, label, description }) => ({ name, label, description })),
                suggestions: SUGGESTIONS.filter((s) => toolNames.has(s.tool)).map(({ label, question }) => ({ label, question })),
            },
            "Assistant info retrieved successfully"
        );
    } catch {
        return errorResponse("Something went wrong while loading the assistant.", 500);
    }
}

/**
 * POST /api/chat
 * Body: { "message": "How much did we sell today?", "history": [{ "role": "user"|"assistant", "content": "..." }] }
 * Answers using read-only data tools that run with the caller's own permissions (RLS).
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndRole(request, []);
        if (!auth.authorized) {
            return auth.response;
        }

        if (!isChatConfigured()) {
            return errorResponse("The assistant is not configured on the server.", 503);
        }

        const rate = checkRateLimit(auth.user.id);
        if (!rate.allowed) {
            return errorResponse(
                `You're sending messages too quickly. Please wait ${rate.retryAfterSeconds} seconds and try again.`,
                429,
                { retryAfterSeconds: rate.retryAfterSeconds }
            );
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request body.", 400);
        }

        const parsed = chatRequestSchema.safeParse(body);
        if (!parsed.success) {
            return errorResponse(parsed.error.issues[0]?.message || "Invalid request.", 400);
        }
        const { message, history } = parsed.data;

        if (isSecretRequest(message)) {
            return successResponse({ reply: SECRET_REFUSAL, toolsUsed: [], blocked: true }, "Assistant replied");
        }

        let context;
        try {
            context = await loadChatContext(auth.client);
        } catch (error) {
            console.error("[chat] context error:", error.message);
            return errorResponse("Couldn't load your store details. Please try again.", 500);
        }

        const result = await runAssistant({
            user: auth.user,
            client: auth.client,
            context,
            messages: [...history, { role: "user", content: message }],
        });

        return successResponse(
            { reply: result.reply, toolsUsed: result.toolsUsed, usage: result.usage, blocked: false },
            "Assistant replied"
        );
    } catch (error) {
        // The SDK wraps provider errors in a RetryError once its retries are used up.
        const cause = RetryError.isInstance(error) ? error.lastError : error;

        if (APICallError.isInstance(cause)) {
            console.error("[chat] model API error:", cause.statusCode, cause.message);
            if (cause.statusCode === 429) {
                return errorResponse("I'm a bit busy right now 🙂 Please try again in a moment.", 429);
            }
            if (cause.statusCode === 401 || cause.statusCode === 403) {
                return errorResponse("The assistant is not configured correctly on the server.", 503);
            }
            return errorResponse("The assistant is temporarily unavailable. Please try again.", 502);
        }

        console.error("[chat] unexpected error:", cause);
        return errorResponse("Something went wrong while answering. Please try again.", 500);
    }
}
