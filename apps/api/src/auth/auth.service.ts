import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser, UserRole } from "./types";

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async authenticate(authorization?: string): Promise<AuthenticatedUser> {
    const mode = this.config.get<string>("AUTH_MODE") ?? "dev";
    if (mode === "dev") {
      return this.upsertUser({
        externalId: this.config.get<string>("DEV_USER_ID") ?? "dev-tecnico",
        email: this.config.get<string>("DEV_USER_EMAIL") ?? "tecnico@powerquote.local",
        name: this.config.get<string>("DEV_USER_NAME") ?? "Tecnico Dev",
        roles: this.parseRoles(this.config.get<string>("DEV_USER_ROLES") ?? "admin,tecnico")
      });
    }

    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const issuer = this.config.getOrThrow<string>("KEYCLOAK_ISSUER_URL");
    const audience = this.config.get<string>("KEYCLOAK_AUDIENCE");
    const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    const { payload } = await jwtVerify(authorization.replace("Bearer ", ""), jwks, {
      issuer,
      audience: audience || undefined
    });

    const roles = [
      ...((payload.realm_access as { roles?: string[] } | undefined)?.roles ?? []),
      ...Object.values((payload.resource_access as Record<string, { roles?: string[] }> | undefined) ?? {})
        .flatMap((resource) => resource.roles ?? [])
    ].filter((role): role is UserRole => ["admin", "tecnico", "comercial", "gestor"].includes(role));

    return this.upsertUser({
      externalId: String(payload.sub),
      email: String(payload.email ?? payload.preferred_username ?? `${payload.sub}@keycloak.local`),
      name: String(payload.name ?? payload.preferred_username ?? "Usuario"),
      roles
    });
  }

  private parseRoles(value: string): UserRole[] {
    return value
      .split(",")
      .map((role) => role.trim())
      .filter((role): role is UserRole => ["admin", "tecnico", "comercial", "gestor"].includes(role));
  }

  private async upsertUser(user: AuthenticatedUser): Promise<AuthenticatedUser> {
    const dbUser = await this.prisma.userExternal.upsert({
      where: { externalId: user.externalId },
      update: { email: user.email, name: user.name, roles: user.roles },
      create: { externalId: user.externalId, email: user.email, name: user.name, roles: user.roles }
    });
    return { ...user, dbUserId: dbUser.id };
  }
}
