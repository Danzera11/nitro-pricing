export type UserRole = "admin" | "tecnico" | "comercial" | "gestor";

export interface AuthenticatedUser {
  externalId: string;
  email: string;
  name: string;
  roles: UserRole[];
  dbUserId?: string;
}
