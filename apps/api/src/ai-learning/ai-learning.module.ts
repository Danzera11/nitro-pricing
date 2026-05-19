import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiLearningController } from "./ai-learning.controller";
import { AiLearningService } from "./ai-learning.service";

@Module({
  imports: [PrismaModule],
  controllers: [AiLearningController],
  providers: [AiLearningService],
  exports: [AiLearningService]
})
export class AiLearningModule {}
