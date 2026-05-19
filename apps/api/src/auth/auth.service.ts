import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
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

  async loginLocal(login: string, password: string) {
    const mode = this.config.get<string>("AUTH_MODE") ?? "dev";
    if (mode !== "local" && mode !== "dev") {
      throw new UnauthorizedException("Local login is disabled");
    }

    await this.ensureDefaultLocalUsers();
    const identity = login.trim().toLowerCase();
    const dbUser = await this.prisma.userExternal.findFirst({
      where: {
        OR: [{ username: identity }, { email: identity }]
      }
    });
    if (!dbUser?.active || !dbUser.passwordHash || !this.verifyPassword(password, dbUser.passwordHash)) {
      throw new UnauthorizedException("E-mail ou senha inválidos");
    }

    const authenticated = await this.upsertUser({
      externalId: dbUser.externalId,
      email: dbUser.email,
      name: dbUser.name,
      roles: dbUser.roles as UserRole[]
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
    const dbUser = await this.prisma.userExternal.findUnique({ where: { externalId: String(payload.sub) } });
    if (dbUser && !dbUser.active) throw new UnauthorizedException("Usuário inativo");
    if (dbUser) {
      return {
        externalId: dbUser.externalId,
        email: dbUser.email,
        name: dbUser.name,
        roles: dbUser.roles as UserRole[],
        dbUserId: dbUser.id
      };
    }
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

  parseRoles(value: string): UserRole[] {
    return value
      .split(",")
      .map((role) => role.trim())
      .filter((role): role is UserRole => ["admin", "editor", "visualizador", "tecnico", "comercial", "gestor"].includes(role));
  }

  hashPassword(password: string) {
    const salt = randomBytes(16).toString("base64url");
    const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("base64url");
    return `pbkdf2_sha256$120000$${salt}$${hash}`;
  }

  verifyPassword(password: string, stored: string) {
    const [algorithm, iterations, salt, hash] = stored.split("$");
    if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !hash) return false;
    const expected = Buffer.from(hash, "base64url");
    const actual = pbkdf2Sync(password, salt, Number(iterations), expected.length, "sha256");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async ensureDefaultLocalUsers() {
    const users = this.localUsers();
    for (const user of users) {
      const username = (user.username ?? user.email.split("@")[0]).toLowerCase();
      const email = user.email.toLowerCase();
      const existing = await this.prisma.userExternal.findFirst({
        where: { OR: [{ username }, { email }] }
      });
      if (existing) {
        if (!existing.passwordHash) {
          await this.prisma.userExternal.update({
            where: { id: existing.id },
            data: {
              username: existing.username ?? username,
              externalId: existing.externalId.startsWith("local:") ? existing.externalId : `local:${username}`,
              roles: user.roles,
              passwordHash: this.hashPassword(user.password),
              active: true
            }
          });
        }
        continue;
      }
      await this.prisma.userExternal.create({
        data: {
          externalId: `local:${username}`,
          username,
          email,
          name: user.name,
          roles: user.roles,
          passwordHash: this.hashPassword(user.password),
          active: true
        }
      });
    }
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
        username: this.config.get<string>("LOCAL_ADMIN_USERNAME") ?? "admin",
        email: this.config.get<string>("LOCAL_ADMIN_EMAIL") ?? "admin@nitro.local",
        password: this.config.get<string>("LOCAL_ADMIN_PASSWORD") ?? "vgbrvx2ddm",
        name: this.config.get<string>("LOCAL_ADMIN_NAME") ?? "Administrador Nitro",
        roles: this.parseRoles(this.config.get<string>("LOCAL_ADMIN_ROLES") ?? "admin")
      },
      {
        username: this.config.get<string>("LOCAL_USER_USERNAME") ?? "editor",
        email: this.config.get<string>("LOCAL_USER_EMAIL") ?? "tecnico@nitro.local",
        password: this.config.get<string>("LOCAL_USER_PASSWORD") ?? "tecnico123",
        name: this.config.get<string>("LOCAL_USER_NAME") ?? "Técnico Nitro",
        roles: this.parseRoles(this.config.get<string>("LOCAL_USER_ROLES") ?? "editor")
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
      create: { externalId: user.externalId, username: user.externalId.startsWith("local:") ? user.email.split("@")[0] : undefined, email: user.email, name: user.name, roles: user.roles }
    });
    return { ...user, dbUserId: dbUser.id };
  }
}
