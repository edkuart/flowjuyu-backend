import { SignOptions } from "jsonwebtoken";
import type { Rol } from "../middleware/auth";
interface JwtPayload {
    id: string | number;
    correo: string;
    roles: Rol[];
}
export declare function signJwt(user: JwtPayload, opts?: {
    expiresIn?: SignOptions["expiresIn"];
}): string;
export declare function verifyJwt<T = any>(token: string): T;
export {};
