import { Module } from "@nestjs/common";
import { AiLearningModule } from "../ai-learning/ai-learning.module";
import { AuditModule } from "../audit/audit.module";
import { QuotesController } from "./quotes.controller";

@Module({ imports: [AuditModule, AiLearningModule], controllers: [QuotesController] })
export class QuotesModule {}
