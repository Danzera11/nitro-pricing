import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { VariablesController } from "./variables.controller";

@Module({ imports: [CrudModule], controllers: [VariablesController] })
export class VariablesModule {}
