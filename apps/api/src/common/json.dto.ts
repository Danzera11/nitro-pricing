import { IsBoolean, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

export class CreateCustomerDto {
  @IsString() name!: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateGroupDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateUnitDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() example?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateServiceDto {
  @IsString() groupId!: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() unit!: string;
  @IsNumber() baseLaborPrice!: number;
  @IsOptional() @IsNumber() defaultDifficulty?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateSuggestedMaterialDto {
  @IsOptional() @IsString() groupId?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateMaterialKitDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsObject() itemsJson!: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateVariableDto {
  @IsString() key!: string;
  @IsString() label!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

export class CreateRuleDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsObject() conditionJson!: Record<string, unknown>;
  @IsObject() actionJson!: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateQuoteRequestDto {
  @IsString() customerId!: string;
  @IsString() title!: string;
  @IsString() description!: string;
  @IsOptional() @IsObject() inputVariables?: Record<string, unknown>;
}

export class UpdateQuoteItemDto {
  @IsOptional() @IsString() groupCode?: string;
  @IsOptional() @IsString() serviceName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() difficultyFactor?: number;
  @IsOptional() @IsNumber() unitLaborPrice?: number;
  @IsOptional() @IsString() notes?: string;
}
