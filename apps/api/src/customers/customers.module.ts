import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { CustomersController } from "./customers.controller";

@Module({ imports: [CrudModule], controllers: [CustomersController] })
export class CustomersModule {}
