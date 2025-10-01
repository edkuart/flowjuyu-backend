import type { RequestHandler } from "express";
export type Rol = "buyer" | "seller" | "admin";
export declare const verifyToken: (roles?: Rol[]) => RequestHandler;
export declare const requireAuth: RequestHandler;
export declare const requireRole: (...allowed: Rol[]) => RequestHandler;
