import { Module } from "@nestjs/common";
import { AiLearningModule } from "../ai-learning/ai-learning.module";
import { AiPromptsModule } from "../ai-prompts/ai-prompts.module";
import { AuditModule } from "../audit/audit.module";
import { CrudModule } from "../common/crud.module";
import { AiService } from "./ai.service";

@Module({
  imports: [AuditModule, CrudModule, AiPromptsModule, AiLearningModule],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}
