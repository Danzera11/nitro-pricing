import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateUnitDto } from "../common/json.dto";

@Controller("units")
export class UnitsController {
  constructor(private readonly crud: CrudService) {}

  @Get()
  findAll() {
    return this.crud.findMany("unit", { orderBy: { name: "asc" } });
  }

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.crud.create("unit", dto, user);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: Partial<CreateUnitDto>, @CurrentUser() user: AuthenticatedUser) {
    return this.crud.update("unit", id, dto, user);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.crud.remove("unit", id, user);
  }
}
