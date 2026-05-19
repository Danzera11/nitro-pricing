import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { QuotesController } from "./quotes.controller";

@Module({ imports: [AuditModule], controllers: [QuotesController] })
export class QuotesModule {}
