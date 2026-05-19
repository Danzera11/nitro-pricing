import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { AiLearningStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { AiLearningService } from "./ai-learning.service";

@Controller("ai-learning")
@Roles("admin")
export class AiLearningController {
  constructor(private readonly learning: AiLearningService) {}

  @Get()
  findAll() {
    return this.learning.findAll();
  }

  @Post()
  create(@Body() body: { title: string; content: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.learning.createManual({ title: body.title, content: body.content }, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: { title?: string; content?: string; active?: boolean; status?: AiLearningStatus },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.learning.update(id, body, user);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learning.approve(id, user);
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learning.reject(id, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.learning.remove(id);
  }
}
