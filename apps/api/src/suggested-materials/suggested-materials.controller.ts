import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateSuggestedMaterialDto } from "../common/json.dto";

@Controller("suggested-materials")
export class SuggestedMaterialsController {
  constructor(private readonly crud: CrudService) {}

  @Get() findAll() { return this.crud.findMany("suggestedMaterial", { include: { group: true }, orderBy: { name: "asc" } }); }
  @Post() @Roles("admin") create(@Body() dto: CreateSuggestedMaterialDto, @CurrentUser() user: AuthenticatedUser) { return this.crud.create("suggestedMaterial", dto, user); }
  @Patch(":id") @Roles("admin") update(@Param("id") id: string, @Body() dto: Partial<CreateSuggestedMaterialDto>, @CurrentUser() user: AuthenticatedUser) { return this.crud.update("suggestedMaterial", id, dto, user); }
  @Delete(":id") @Roles("admin") remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.crud.remove("suggestedMaterial", id, user); }
}
