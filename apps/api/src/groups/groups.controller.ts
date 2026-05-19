import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CreateGroupDto } from "../common/json.dto";
import { CrudService } from "../common/crud.service";

@Controller("groups")
export class GroupsController {
  constructor(private readonly crud: CrudService) {}

  @Get() findAll() { return this.crud.findMany("group", { orderBy: { code: "asc" } }); }
  @Post() @Roles("admin") create(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthenticatedUser) { return this.crud.create("group", dto, user); }
  @Patch(":id") @Roles("admin") update(@Param("id") id: string, @Body() dto: Partial<CreateGroupDto>, @CurrentUser() user: AuthenticatedUser) { return this.crud.update("group", id, dto, user); }
  @Delete(":id") @Roles("admin") remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.crud.remove("group", id, user); }
}
