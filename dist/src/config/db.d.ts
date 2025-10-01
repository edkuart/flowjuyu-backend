import "dotenv/config";
import { Sequelize } from "sequelize";
declare let sequelize: Sequelize;
export { sequelize };
export declare function assertDbConnection(): Promise<void>;
