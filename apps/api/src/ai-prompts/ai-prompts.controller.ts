import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { AiPromptsService } from "./ai-prompts.service";

@Controller("ai-prompts")
export class AiPromptsController {
  constructor(private readonly prompts: AiPromptsService) {}

  @Get()
  @Roles("admin", "gestor")
  findAll() {
    return this.prompts.findAll();
  }

  @Get("active")
  @Roles("admin", "gestor")
  active() {
    return this.prompts.getActive();
  }

  @Patch("active")
  @Roles("admin", "gestor")
  saveActive(@Body() body: { name: string; content: string; active?: boolean }) {
    return this.prompts.saveActive(body);
  }

  @Post("restore-default")
  @Roles("admin", "gestor")
  restoreDefault() {
    return this.prompts.restoreDefault();
  }
}
