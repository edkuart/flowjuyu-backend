import { Request, Response } from "express";
export declare const createTicket: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAllTickets: (req: Request, res: Response) => Promise<void>;
export declare const updateTicketStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
