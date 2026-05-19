import { Module } from "@nestjs/common";
import { AiPromptsModule } from "../ai-prompts/ai-prompts.module";
import { AuditModule } from "../audit/audit.module";
import { CrudModule } from "../common/crud.module";
import { AiService } from "./ai.service";

@Module({
  imports: [AuditModule, CrudModule, AiPromptsModule],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}
