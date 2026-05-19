import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthService } from "../auth/auth.service";
import { AuthenticatedUser, UserRole } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

class CreateUserDto {
  @IsString()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsArray()
  roles!: UserRole[];
}

class UpdateUserDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsEmail() email?: string;
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
    const record = await this.prisma.userExternal.create({
      data: {
        externalId: `local:${dto.username.toLowerCase()}`,
        username: dto.username.toLowerCase(),
        email: dto.email.toLowerCase(),
        name: dto.name,
        roles: this.normalizeRoles(dto.roles),
        passwordHash: this.auth.hashPassword(dto.password),
        active: true
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
    const record = await this.prisma.userExternal.update({
      where: { id },
      data: {
        username: dto.username?.toLowerCase(),
        email: dto.email?.toLowerCase(),
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

  private redact(user: { passwordHash?: string | null } & Record<string, unknown>) {
    const { passwordHash, ...rest } = user;
    void passwordHash;
    return rest;
  }
}
