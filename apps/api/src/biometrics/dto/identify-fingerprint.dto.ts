import { IsBase64, IsIn, IsString, MaxLength } from 'class-validator';
import { BIOMETRIC_TEMPLATE_FORMAT } from '../biometric.constants.js';

export class IdentifyFingerprintDto {
  @IsString()
  @IsIn([BIOMETRIC_TEMPLATE_FORMAT])
  templateFormat!: string;

  @IsString()
  @IsBase64()
  @MaxLength(90_000)
  templateData!: string;
}
