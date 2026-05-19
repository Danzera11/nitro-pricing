import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CrudService } from "../common/crud.service";
import { CreateCustomerDto } from "../common/json.dto";

@Controller("customers")
export class CustomersController {
  constructor(private readonly crud: CrudService) {}

  @Get() findAll() { return this.crud.findMany("customer", { orderBy: { name: "asc" } }); }
  @Post() @Roles("admin", "tecnico", "comercial", "gestor") create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) { return this.crud.create("customer", dto, user); }
  @Patch(":id") @Roles("admin", "comercial", "gestor") update(@Param("id") id: string, @Body() dto: Partial<CreateCustomerDto>, @CurrentUser() user: AuthenticatedUser) { return this.crud.update("customer", id, dto, user); }
  @Delete(":id") @Roles("admin") remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.crud.remove("customer", id, user); }
}
