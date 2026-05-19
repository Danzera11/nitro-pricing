import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CrudService } from "./crud.service";
import { RuleEngineService } from "./rule-engine.service";

@Module({
  imports: [AuditModule],
  providers: [CrudService, RuleEngineService],
  exports: [CrudService, RuleEngineService]
})
export class CrudModule {}
