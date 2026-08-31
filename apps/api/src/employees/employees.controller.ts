import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { EmployeeQueryDto } from './dto/employee-query.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { EmployeesService } from './employees.service.js';
import { Roles } from '../auth/auth.decorators.js';
import { UserRole } from '../auth/auth.constants.js';

@Roles(UserRole.ADMIN, UserRole.RH)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  findAll(@Query() query: EmployeeQueryDto) {
    return this.employeesService.findAll(query.search, query.active);
  }

  @Get('departments')
  findDepartments() {
    return this.employeesService.findDepartments();
  }

  @Get(':employeeCode')
  findOne(@Param('employeeCode') employeeCode: string) {
    return this.employeesService.findOne(employeeCode);
  }

  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Patch(':employeeCode')
  update(
    @Param('employeeCode') employeeCode: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(employeeCode, updateEmployeeDto);
  }
}
