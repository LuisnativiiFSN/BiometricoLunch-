import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateKioskDeviceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name no puede contener solo espacios' })
  @MaxLength(100)
  name!: string;
}
