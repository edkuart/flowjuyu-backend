import type { Request, RequestHandler } from "express";
export interface AuthedRequest extends Request {
    user?: {
        id: number;
        role: string;
    };
}
export declare function requireAuth(role?: "seller" | "buyer" | "admin"): RequestHandler;
