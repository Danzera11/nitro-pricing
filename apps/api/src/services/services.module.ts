import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { ServicesController } from "./services.controller";

@Module({ imports: [CrudModule], controllers: [ServicesController] })
export class ServicesModule {}
