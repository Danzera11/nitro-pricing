import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser, LocalAuthUser, UserRole } from "./types";

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

    if (mode === "local") {
      return this.authenticateLocalToken(authorization);
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

  async loginLocal(email: string, password: string) {
    const mode = this.config.get<string>("AUTH_MODE") ?? "dev";
    if (mode !== "local" && mode !== "dev") {
      throw new UnauthorizedException("Local login is disabled");
    }

    const user = this.localUsers().find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) {
      throw new UnauthorizedException("E-mail ou senha inválidos");
    }

    const authenticated = await this.upsertUser({
      externalId: `local:${user.email.toLowerCase()}`,
      email: user.email,
      name: user.name,
      roles: user.roles
    });
    const token = await this.signLocalToken(authenticated);
    return { accessToken: token, user: authenticated };
  }

  private async authenticateLocalToken(authorization?: string): Promise<AuthenticatedUser> {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const { payload } = await jwtVerify(authorization.replace("Bearer ", ""), this.localSecret(), {
      issuer: "nitro-pricing",
      audience: "nitro-pricing-api"
    });
    return this.upsertUser({
      externalId: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name ?? payload.email),
      roles: this.parseRoles(String(payload.roles ?? ""))
    });
  }

  private async signLocalToken(user: AuthenticatedUser) {
    return new SignJWT({
      email: user.email,
      name: user.name,
      roles: user.roles.join(",")
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("nitro-pricing")
      .setAudience("nitro-pricing-api")
      .setSubject(user.externalId)
      .setIssuedAt()
      .setExpirationTime(this.config.get<string>("LOCAL_AUTH_TOKEN_TTL") ?? "12h")
      .sign(this.localSecret());
  }

  private parseRoles(value: string): UserRole[] {
    return value
      .split(",")
      .map((role) => role.trim())
      .filter((role): role is UserRole => ["admin", "tecnico", "comercial", "gestor"].includes(role));
  }

  private localUsers(): LocalAuthUser[] {
    const raw = this.config.get<string>("LOCAL_AUTH_USERS");
    if (raw) {
      try {
        const users = JSON.parse(raw) as LocalAuthUser[];
        return users.map((user) => ({ ...user, roles: this.parseRoles(user.roles.join(",")) }));
      } catch {
        throw new UnauthorizedException("LOCAL_AUTH_USERS inválido");
      }
    }
    return [
      {
        email: this.config.get<string>("LOCAL_ADMIN_EMAIL") ?? "admin@nitro.local",
        password: this.config.get<string>("LOCAL_ADMIN_PASSWORD") ?? "admin123",
        name: this.config.get<string>("LOCAL_ADMIN_NAME") ?? "Administrador Nitro",
        roles: this.parseRoles(this.config.get<string>("LOCAL_ADMIN_ROLES") ?? "admin,tecnico,comercial,gestor")
      },
      {
        email: this.config.get<string>("LOCAL_USER_EMAIL") ?? "tecnico@nitro.local",
        password: this.config.get<string>("LOCAL_USER_PASSWORD") ?? "tecnico123",
        name: this.config.get<string>("LOCAL_USER_NAME") ?? "Técnico Nitro",
        roles: this.parseRoles(this.config.get<string>("LOCAL_USER_ROLES") ?? "tecnico,comercial")
      }
    ];
  }

  private localSecret() {
    return new TextEncoder().encode(this.config.get<string>("LOCAL_AUTH_SECRET") ?? "change-me-nitro-pricing-local-secret");
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
