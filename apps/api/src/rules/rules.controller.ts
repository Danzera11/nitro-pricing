import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateRuleDto } from "../common/json.dto";

@Controller("rules")
export class RulesController {
  constructor(private readonly crud: CrudService) {}

  @Get() findAll() { return this.crud.findMany("rule", { orderBy: { code: "asc" } }); }
  @Post() @Roles("admin", "gestor") create(@Body() dto: CreateRuleDto, @CurrentUser() user: AuthenticatedUser) { return this.crud.create("rule", dto, user); }
  @Patch(":id") @Roles("admin", "gestor") update(@Param("id") id: string, @Body() dto: Partial<CreateRuleDto>, @CurrentUser() user: AuthenticatedUser) { return this.crud.update("rule", id, dto, user); }
  @Delete(":id") @Roles("admin") remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.crud.remove("rule", id, user); }
}
