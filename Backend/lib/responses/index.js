/**
 * Standard API Response Helpers for Next.js Route Handlers
 */

export function successResponse(data = {}, message = "Operation successful", status = 200) {
    return Response.json(
        {
            success: true,
            message,
            data,
        },
        { status }
    );
}

export function errorResponse(message = "Something went wrong", status = 400, extra = {}) {
    return Response.json(
        {
            success: false,
            message,
            ...extra,
        },
        { status }
    );
}
