import { Request, Response, RequestHandler } from "express";
export declare const register: (req: Request, res: Response) => Promise<void>;
export declare const registerVendedor: (req: Request, res: Response) => Promise<void>;
export declare const login: (req: Request, res: Response) => Promise<void>;
export declare const changePassword: RequestHandler;
export declare const logoutAll: RequestHandler;
export declare const forgotPassword: RequestHandler;
export declare const resetPassword: RequestHandler;
