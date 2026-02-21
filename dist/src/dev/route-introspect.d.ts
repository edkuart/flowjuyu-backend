import type { Express } from "express";
export type RouteRow = {
    method: string;
    path: string;
    handlers: string[];
};
export declare function dumpRoutes(app: Express): RouteRow[];
