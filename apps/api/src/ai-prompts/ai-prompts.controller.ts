import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { AiPromptsService } from "./ai-prompts.service";

@Controller("ai-prompts")
export class AiPromptsController {
  constructor(private readonly prompts: AiPromptsService) {}

  @Get()
  @Roles("admin")
  findAll() {
    return this.prompts.findAll();
  }

  @Get("active")
  @Roles("admin")
  active() {
    return this.prompts.getActive();
  }

  @Patch("active")
  @Roles("admin")
  saveActive(@Body() body: { name: string; content: string; active?: boolean }) {
    return this.prompts.saveActive(body);
  }

  @Post("restore-default")
  @Roles("admin")
  restoreDefault() {
    return this.prompts.restoreDefault();
  }
}
