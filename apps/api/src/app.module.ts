import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AiModule } from "./ai/ai.module";
import { AiLearningModule } from "./ai-learning/ai-learning.module";
import { AiPromptsModule } from "./ai-prompts/ai-prompts.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { CustomersModule } from "./customers/customers.module";
import { GroupsModule } from "./groups/groups.module";
import { MaterialKitsModule } from "./material-kits/material-kits.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QuoteRequestsModule } from "./quote-requests/quote-requests.module";
import { QuotesModule } from "./quotes/quotes.module";
import { RulesModule } from "./rules/rules.module";
import { ServicesModule } from "./services/services.module";
import { SuggestedMaterialsModule } from "./suggested-materials/suggested-materials.module";
import { UnitsModule } from "./units/units.module";
import { UsersModule } from "./users/users.module";
import { VariablesModule } from "./variables/variables.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AuditModule,
    UsersModule,
    CustomersModule,
    GroupsModule,
    ServicesModule,
    SuggestedMaterialsModule,
    UnitsModule,
    MaterialKitsModule,
    VariablesModule,
    RulesModule,
    QuoteRequestsModule,
    QuotesModule,
    AiLearningModule,
    AiPromptsModule,
    AiModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
