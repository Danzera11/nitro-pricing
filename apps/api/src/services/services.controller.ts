import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateServiceDto } from "../common/json.dto";

@Controller("services")
export class ServicesController {
  constructor(private readonly crud: CrudService) {}

  @Get() findAll() { return this.crud.findMany("service", { include: { group: true }, orderBy: { code: "asc" } }); }
  @Post() @Roles("admin") create(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthenticatedUser) { return this.crud.create("service", dto, user); }
  @Patch(":id") @Roles("admin") update(@Param("id") id: string, @Body() dto: Partial<CreateServiceDto>, @CurrentUser() user: AuthenticatedUser) { return this.crud.update("service", id, dto, user); }
  @Delete(":id") @Roles("admin") remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.crud.remove("service", id, user); }
}
