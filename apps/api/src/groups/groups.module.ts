import { Module } from "@nestjs/common";
import { CrudModule } from "../common/crud.module";
import { GroupsController } from "./groups.controller";

@Module({ imports: [CrudModule], controllers: [GroupsController] })
export class GroupsModule {}
