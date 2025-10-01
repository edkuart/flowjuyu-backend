import "express-session";

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      nombre: string;
      correo: string;
      rol: string;
    };
  }
}
