import { Request, Response, NextFunction } from "express";
export declare const uploadVendedorDocs: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare function validateRequiredDocs(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
