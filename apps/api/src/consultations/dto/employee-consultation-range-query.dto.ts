import { Matches } from 'class-validator';

export class EmployeeConsultationRangeQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'startDate debe tener el formato YYYY-MM-DD',
  })
  startDate!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'endDate debe tener el formato YYYY-MM-DD',
  })
  endDate!: string;
}
