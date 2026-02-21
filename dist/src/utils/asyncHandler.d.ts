import { RequestHandler } from "express";
declare const asyncHandler: (fn: RequestHandler) => RequestHandler;
export default asyncHandler;
