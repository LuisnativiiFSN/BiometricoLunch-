import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PendingMealQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;
}
