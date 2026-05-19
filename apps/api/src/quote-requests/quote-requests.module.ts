import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuditModule } from "../audit/audit.module";
import { CrudModule } from "../common/crud.module";
import { QuoteRequestsController } from "./quote-requests.controller";

@Module({ imports: [CrudModule, AiModule, AuditModule], controllers: [QuoteRequestsController] })
export class QuoteRequestsModule {}
