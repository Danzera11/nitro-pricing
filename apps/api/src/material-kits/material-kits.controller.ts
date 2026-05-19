import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateMaterialKitDto } from "../common/json.dto";

@Controller("material-kits")
export class MaterialKitsController {
  constructor(private readonly crud: CrudService) {}

  @Get()
  findAll() {
    return this.crud.findMany("materialKit", { include: { group: true }, orderBy: { code: "asc" } });
  }

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateMaterialKitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.crud.create("materialKit", dto, user);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: Partial<CreateMaterialKitDto>, @CurrentUser() user: AuthenticatedUser) {
    return this.crud.update("materialKit", id, dto, user);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.crud.remove("materialKit", id, user);
  }
}
