import type { RequestHandler } from "express";
export type Rol = "buyer" | "seller" | "admin" | "support";
export declare const verifyToken: (rolesRequeridos?: Rol[]) => RequestHandler;
export declare const requireAuth: RequestHandler;
export declare const requireRole: (...allowed: Rol[]) => RequestHandler;
