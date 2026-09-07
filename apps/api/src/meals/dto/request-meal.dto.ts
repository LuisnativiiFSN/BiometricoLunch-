import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RequestMealDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  employeeCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  employeeId?: string;

  @IsUUID('4')
  @IsOptional()
  enrollmentId?: string;
}
