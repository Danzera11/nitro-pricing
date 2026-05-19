import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { RulesController } from "./rules.controller";

@Module({ imports: [CrudModule], controllers: [RulesController] })
export class RulesModule {}
