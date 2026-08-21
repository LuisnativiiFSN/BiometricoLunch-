import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class IdentifyEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeId!: string;
}
