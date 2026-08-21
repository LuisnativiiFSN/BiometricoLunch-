import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateManualReservationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  employeeId!: string;

  @IsUUID()
  mealId!: string;
}
