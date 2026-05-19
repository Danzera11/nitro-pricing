export type UserRole = "admin" | "editor" | "visualizador" | "tecnico" | "comercial" | "gestor";

export interface AuthenticatedUser {
  externalId: string;
  email: string;
  name: string;
  roles: UserRole[];
  dbUserId?: string;
}

export interface LocalAuthUser {
  username?: string;
  email: string;
  password: string;
  name: string;
  roles: UserRole[];
}
