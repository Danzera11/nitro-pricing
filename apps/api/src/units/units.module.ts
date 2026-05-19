import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { UnitsController } from "./units.controller";

@Module({ imports: [CrudModule], controllers: [UnitsController] })
export class UnitsModule {}
