import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiPromptsController } from "./ai-prompts.controller";
import { AiPromptsService } from "./ai-prompts.service";

@Module({
  imports: [PrismaModule],
  controllers: [AiPromptsController],
  providers: [AiPromptsService],
  exports: [AiPromptsService]
})
export class AiPromptsModule {}
