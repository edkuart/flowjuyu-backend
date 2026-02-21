import { Request, Response, NextFunction } from "express";
declare const asyncHandler: (fn: any) => (req: Request, res: Response, next: NextFunction) => Promise<any>;
export default asyncHandler;
