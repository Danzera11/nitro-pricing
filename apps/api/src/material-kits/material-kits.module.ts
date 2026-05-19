import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { MaterialKitsController } from "./material-kits.controller";

@Module({ imports: [CrudModule], controllers: [MaterialKitsController] })
export class MaterialKitsModule {}
