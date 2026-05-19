import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { SuggestedMaterialsController } from "./suggested-materials.controller";

@Module({ imports: [CrudModule], controllers: [SuggestedMaterialsController] })
export class SuggestedMaterialsModule {}
