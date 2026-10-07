/**
 * Health check Next.js Route Handler
 * GET /api/health
 */
export async function GET() {
    return Response.json({
        status: "ok",
        message: "POS backend is running",
    });
}
