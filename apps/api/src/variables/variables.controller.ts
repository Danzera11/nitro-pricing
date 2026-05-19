import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateVariableDto } from "../common/json.dto";

@Controller("variables")
export class VariablesController {
  constructor(private readonly crud: CrudService) {}

  @Get() findAll() { return this.crud.findMany("variable", { orderBy: { key: "asc" } }); }
  @Post() @Roles("admin") create(@Body() dto: CreateVariableDto, @CurrentUser() user: AuthenticatedUser) { return this.crud.create("variable", dto, user); }
  @Patch(":id") @Roles("admin") update(@Param("id") id: string, @Body() dto: Partial<CreateVariableDto>, @CurrentUser() user: AuthenticatedUser) { return this.crud.update("variable", id, dto, user); }
  @Delete(":id") @Roles("admin") remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.crud.remove("variable", id, user); }
}
