import "dotenv/config";
import { Sequelize } from "sequelize";
export declare const sequelize: Sequelize;
export declare function assertDbConnection(): Promise<void>;
