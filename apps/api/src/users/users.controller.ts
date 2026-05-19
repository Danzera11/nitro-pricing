import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthService } from "../auth/auth.service";
import { AuthenticatedUser, UserRole } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

class CreateUserDto {
  @IsString()
  username!: string;

  @IsOptional()
  @ValidateIf((_, value) => Boolean(value))
  @IsEmail()
  email?: string;

  @IsString()
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsArray()
  roles!: UserRole[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateUserDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @ValidateIf((_, value) => Boolean(value)) @IsEmail() email?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() roles?: UserRole[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller("users")
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService
  ) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get()
  @Roles("admin")
  async findAll() {
    await this.auth.ensureDefaultLocalUsers();
    return this.prisma.userExternal.findMany({
      orderBy: { name: "asc" },
      select: { id: true, username: true, email: true, name: true, roles: true, active: true, createdAt: true, updatedAt: true }
    });
  }

  @Post()
  @Roles("admin")
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const username = dto.username.trim().toLowerCase();
    const email = this.normalizeEmail(dto.email, username);
    const record = await this.prisma.userExternal.create({
      data: {
        externalId: `local:${username}`,
        username,
        email,
        name: dto.name,
        roles: this.normalizeRoles(dto.roles),
        passwordHash: this.auth.hashPassword(dto.password),
        active: dto.active ?? true
      },
      select: { id: true, username: true, email: true, name: true, roles: true, active: true, createdAt: true, updatedAt: true }
    });
    await this.audit.record({ actor, entity: "userExternal", entityId: record.id, action: "create", afterJson: record });
    return record;
  }

  @Patch(":id")
  @Roles("admin")
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const before = await this.prisma.userExternal.findUniqueOrThrow({ where: { id } });
    const username = dto.username?.trim().toLowerCase();
    const record = await this.prisma.userExternal.update({
      where: { id },
      data: {
        username,
        email: dto.email !== undefined ? this.normalizeEmail(dto.email, username ?? before.username ?? before.id) : undefined,
        name: dto.name,
        roles: dto.roles ? this.normalizeRoles(dto.roles) : undefined,
        active: dto.active
      },
      select: { id: true, username: true, email: true, name: true, roles: true, active: true, createdAt: true, updatedAt: true }
    });
    await this.audit.record({ actor, entity: "userExternal", entityId: id, action: "update", beforeJson: this.redact(before), afterJson: record });
    return record;
  }

  @Patch(":id/password")
  @Roles("admin")
  async resetPassword(@Param("id") id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: AuthenticatedUser) {
    const before = await this.prisma.userExternal.findUniqueOrThrow({ where: { id } });
    const record = await this.prisma.userExternal.update({
      where: { id },
      data: { passwordHash: this.auth.hashPassword(dto.password) },
      select: { id: true, username: true, email: true, name: true, roles: true, active: true, createdAt: true, updatedAt: true }
    });
    await this.audit.record({ actor, entity: "userExternal", entityId: id, action: "update", beforeJson: this.redact(before), afterJson: record });
    return record;
  }

  private normalizeRoles(roles: UserRole[]) {
    return roles.filter((role): role is UserRole => ["admin", "editor", "visualizador", "tecnico", "comercial", "gestor"].includes(role));
  }

  private normalizeEmail(email: string | undefined, username: string) {
    const cleanEmail = email?.trim().toLowerCase();
    return cleanEmail || `${username}@local.nitropricing.internal`;
  }

  private redact(user: { passwordHash?: string | null } & Record<string, unknown>) {
    const { passwordHash, ...rest } = user;
    void passwordHash;
    return rest;
  }
}
