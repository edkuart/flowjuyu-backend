import type { Request, Response, NextFunction } from "express";
type PublicError = Error & {
    status?: number;
    publicMessage?: string;
    details?: unknown;
};
export declare function errorHandler(err: PublicError, _req: Request, res: Response, _next: NextFunction): void;
export {};
