export interface Employee {
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeInput {
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  active: boolean;
}

export type CreateEmployeeInput = EmployeeInput;
export type UpdateEmployeeInput = Partial<EmployeeInput>;
