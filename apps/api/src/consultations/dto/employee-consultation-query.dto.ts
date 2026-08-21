import { IsOptional, Matches } from 'class-validator';

export class EmployeeConsultationQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month debe tener el formato YYYY-MM',
  })
  month?: string;
}
