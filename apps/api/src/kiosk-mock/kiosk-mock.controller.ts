import { Body, Controller, Post } from '@nestjs/common';
import { IdentifyEmployeeDto } from './dto/identify-employee.dto.js';
import { KioskMockService } from './kiosk-mock.service.js';
import { Roles } from '../auth/auth.decorators.js';
import { UserRole } from '../auth/auth.constants.js';

@Roles(UserRole.ADMIN, UserRole.RH)
@Controller('kiosk-mock')
export class KioskMockController {
  constructor(private readonly kioskMockService: KioskMockService) {}

  @Post('identify')
  identify(@Body() identifyEmployeeDto: IdentifyEmployeeDto) {
    return this.kioskMockService.identify(identifyEmployeeDto.employeeId);
  }
}
