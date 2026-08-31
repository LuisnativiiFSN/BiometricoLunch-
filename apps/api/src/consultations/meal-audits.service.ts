import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthenticatedUser } from '../auth/auth.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';

const LUNCH = 'LUNCH';
const APPROVED = 'APPROVED';
const MAX_RANGE_DAYS = 366;
const DARK_GREEN = 'FF073B3A';
const TEAL = 'FF009C95';
const LIGHT_TEAL = 'FFDDF3F1';
const PALE_TEAL = 'FFF2FAF9';
const WHITE = 'FFFFFFFF';
const TEXT_GREEN = 'FF075D59';
const BORDER_GREEN = 'FFD5E8E6';

@Injectable()
export class MealAuditsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportEmployeeMeals(
    employeeCode: string,
    startDate: string,
    endDate: string,
    actor: AuthenticatedUser,
    now = new Date(),
  ) {
    const normalizedCode = employeeCode.trim();
    if (!normalizedCode || normalizedCode.length > 50) {
      throw new BadRequestException('Código de empleado inválido');
    }

    const start = this.parseDateOnly(startDate);
    const end = this.parseDateOnly(endDate);
    if (end < start) {
      throw new BadRequestException(
        'La fecha final debe ser igual o posterior a la fecha inicial',
      );
    }

    const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `El período máximo de exportación es de ${MAX_RANGE_DAYS} días`,
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: normalizedCode },
      select: {
        employeeCode: true,
        name: true,
        department: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('No se encontró información para ese código');
    }

    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        mealType: LUNCH,
        mealDate: { gte: start, lt: this.addDays(end, 1) },
        OR: [
          { transferEmployeeId: normalizedCode },
          { employeeId: normalizedCode, transferEmployeeId: null },
        ],
      },
      select: {
        mealDate: true,
        quantity: true,
        meal: { select: { name: true } },
        mealRequests: {
          where: { status: APPROVED },
          select: { requestedAt: true },
          orderBy: { requestedAt: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ mealDate: 'asc' }, { createdAt: 'asc' }],
    });

    const rows = reservations.map((reservation) => {
      const delivery = reservation.mealRequests[0];
      return {
        employeeCode: employee.employeeCode,
        employeeName: employee.name,
        department: employee.department.trim() || 'Sin departamento',
        mealDate: reservation.mealDate,
        dayName: this.getDayName(reservation.mealDate),
        mealName: reservation.meal.name,
        quantity: reservation.quantity,
        status: delivery ? 'Entregado' : 'Pendiente',
        deliveredAt: delivery?.requestedAt ?? null,
      };
    });
    const total = rows.reduce((sum, row) => sum + row.quantity, 0);
    const delivered = rows
      .filter((row) => row.status === 'Entregado')
      .reduce((sum, row) => sum + row.quantity, 0);

    const workbook = this.buildWorkbook({
      employee,
      start,
      end,
      now,
      rows,
      totals: { total, delivered, pending: total - delivered },
    });
    const content = await workbook.xlsx.writeBuffer();

    await this.prisma.auditLog.create({
      data: {
        entityName: 'meal_audit_export',
        entityId: employee.employeeCode,
        action: 'CREATE',
        actorUserId: actor.id,
        newValues: JSON.stringify({
          employeeCode: employee.employeeCode,
          startDate,
          endDate,
          reservations: rows.length,
          totalLunches: total,
        }),
      },
    });

    const safeCode = employee.employeeCode.replace(/[^a-zA-Z0-9_-]/g, '-');
    return {
      fileName: `historial-almuerzos-empleado-${safeCode}-${startDate}-a-${endDate}.xlsx`,
      buffer: Buffer.from(content),
    };
  }

  async exportPayrollReport(
    startDate: string,
    endDate: string,
    actor: AuthenticatedUser,
    now = new Date(),
  ) {
    const { start, end } = this.validateDateRange(startDate, endDate);
    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        mealType: LUNCH,
        mealDate: { gte: start, lt: this.addDays(end, 1) },
      },
      select: {
        quantity: true,
        employee: {
          select: { employeeCode: true, name: true, department: true },
        },
        transferEmployee: {
          select: { employeeCode: true, name: true, department: true },
        },
      },
    });

    const grouped = new Map<
      string,
      {
        employeeCode: string;
        name: string;
        department: string;
        consumedMeals: number;
      }
    >();

    for (const reservation of reservations) {
      const chargedEmployee = reservation.transferEmployee ?? reservation.employee;
      const current = grouped.get(chargedEmployee.employeeCode);
      if (current) {
        current.consumedMeals += reservation.quantity;
        continue;
      }
      grouped.set(chargedEmployee.employeeCode, {
        employeeCode: chargedEmployee.employeeCode,
        name: chargedEmployee.name,
        department: chargedEmployee.department.trim() || 'Sin departamento',
        consumedMeals: reservation.quantity,
      });
    }

    const rows = [...grouped.values()].sort((left, right) =>
      left.employeeCode.localeCompare(right.employeeCode, 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
    const totalMeals = rows.reduce(
      (total, row) => total + row.consumedMeals,
      0,
    );
    const workbook = this.buildPayrollWorkbook({ start, end, now, rows });
    const content = await workbook.xlsx.writeBuffer();

    await this.prisma.auditLog.create({
      data: {
        entityName: 'payroll_meal_report',
        entityId: `${startDate}:${endDate}`,
        action: 'CREATE',
        actorUserId: actor.id,
        newValues: JSON.stringify({
          startDate,
          endDate,
          employees: rows.length,
          totalMeals,
        }),
      },
    });

    return {
      fileName: `reporte-nomina-almuerzos-${startDate}-a-${endDate}.xlsx`,
      buffer: Buffer.from(content),
    };
  }

  async exportWeeklyOrders(
    weekStart: string,
    actor: AuthenticatedUser,
    now = new Date(),
  ) {
    const start = this.parseDateOnly(weekStart);
    if (start.getUTCDay() !== 1) {
      throw new BadRequestException(
        'La semana debe comenzar un lunes',
      );
    }
    const currentWeekStart = this.getMonday(this.getGuatemalaDate(now));
    if (start > currentWeekStart) {
      throw new BadRequestException(
        'Solo puedes exportar la semana actual o semanas anteriores',
      );
    }
    const end = this.addDays(start, 4);
    const report = await this.getOrderReportData(start, end);
    const workbook = this.buildOrdersWorkbook({
      title: 'PEDIDOS SEMANALES DE ALMUERZO',
      start,
      end,
      now,
      ...report,
    });
    const content = await workbook.xlsx.writeBuffer();

    await this.saveReportAudit(
      'weekly_meal_orders_export',
      `${weekStart}:${this.getDateOnly(end)}`,
      actor,
      {
        weekStart,
        weekEnd: this.getDateOnly(end),
        reservations: report.rows.length,
        totalMeals: report.rows.reduce((sum, row) => sum + row.quantity, 0),
      },
    );

    return {
      fileName: `pedidos-semanales-${weekStart}-al-${this.getDateOnly(end)}.xlsx`,
      buffer: Buffer.from(content),
    };
  }

  async exportDailyOrders(
    date: string,
    actor: AuthenticatedUser,
    now = new Date(),
  ) {
    const selectedDate = this.parseDateOnly(date);
    const day = selectedDate.getUTCDay();
    if (day < 1 || day > 5) {
      throw new BadRequestException(
        'El reporte diario solamente admite fechas de lunes a viernes',
      );
    }
    const report = await this.getOrderReportData(selectedDate, selectedDate);
    const workbook = this.buildOrdersWorkbook({
      title: 'PEDIDOS DIARIOS DE ALMUERZO',
      start: selectedDate,
      end: selectedDate,
      now,
      ...report,
    });
    const content = await workbook.xlsx.writeBuffer();

    await this.saveReportAudit(
      'daily_meal_orders_export',
      date,
      actor,
      {
        date,
        reservations: report.rows.length,
        totalMeals: report.rows.reduce((sum, row) => sum + row.quantity, 0),
      },
    );

    return {
      fileName: `pedidos-diarios-${date}.xlsx`,
      buffer: Buffer.from(content),
    };
  }

  private async getOrderReportData(start: Date, end: Date) {
    const [reservations, availableMeals] = await Promise.all([
      this.prisma.mealReservation.findMany({
        where: {
          mealType: LUNCH,
          mealDate: { gte: start, lt: this.addDays(end, 1) },
        },
        select: {
          mealId: true,
          mealDate: true,
          quantity: true,
          meal: { select: { name: true } },
          employee: {
            select: { employeeCode: true, name: true, department: true },
          },
          transferEmployee: {
            select: { employeeCode: true, name: true, department: true },
          },
        },
      }),
      this.prisma.meal.findMany({
        where: {
          availableDate: { gte: start, lt: this.addDays(end, 1) },
          mealType: LUNCH,
          OR: [{ active: true }, { mealReservations: { some: {} } }],
        },
        select: { id: true, name: true, availableDate: true },
        orderBy: [{ availableDate: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const rows = reservations.map((reservation) => {
      const employee = reservation.transferEmployee ?? reservation.employee;
      return {
        employeeCode: employee.employeeCode,
        employeeName: employee.name,
        department: employee.department.trim() || 'Sin departamento',
        mealName: reservation.meal.name,
        mealDate: reservation.mealDate,
        dayName: this.getDayName(reservation.mealDate),
        quantity: reservation.quantity,
      };
    }).sort(
      (left, right) =>
        left.department.localeCompare(right.department, 'es', {
          sensitivity: 'base',
        }) ||
        left.employeeCode.localeCompare(right.employeeCode, 'es', {
          numeric: true,
          sensitivity: 'base',
        }) ||
        left.mealDate.getTime() - right.mealDate.getTime() ||
        left.mealName.localeCompare(right.mealName, 'es', {
          sensitivity: 'base',
        }),
    );
    const totalsByMeal = new Map<string, number>();
    reservations.forEach((reservation) => {
      totalsByMeal.set(
        reservation.mealId,
        (totalsByMeal.get(reservation.mealId) ?? 0) + reservation.quantity,
      );
    });
    const mealTotals = availableMeals.map((meal) => ({
      date: meal.availableDate,
      dayName: this.getDayName(meal.availableDate),
      mealName: meal.name,
      quantity: totalsByMeal.get(meal.id) ?? 0,
    }));

    return { rows, mealTotals };
  }

  private buildOrdersWorkbook(input: {
    title: string;
    start: Date;
    end: Date;
    now: Date;
    rows: Array<{
      employeeCode: string;
      employeeName: string;
      department: string;
      mealName: string;
      mealDate: Date;
      dayName: string;
      quantity: number;
    }>;
    mealTotals: Array<{
      date: Date;
      dayName: string;
      mealName: string;
      quantity: number;
    }>;
  }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Comedor Fasani';
    workbook.created = input.now;
    workbook.modified = input.now;
    workbook.calcProperties.fullCalcOnLoad = true;
    const periodLabel = input.start.getTime() === input.end.getTime()
      ? `${this.getDayName(input.start)} ${this.formatDate(input.start)}`
      : `${this.formatDate(input.start)} al ${this.formatDate(input.end)}`;

    const details = workbook.addWorksheet('Pedidos', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.4,
          bottom: 0.4,
          header: 0.2,
          footer: 0.2,
        },
      },
    });
    details.columns = [
      { width: 17 },
      { width: 38 },
      { width: 28 },
      { width: 42 },
      { width: 25 },
    ];
    details.mergeCells('A1:E1');
    this.styleReportTitle(details, 'A1', input.title);
    details.mergeCells('A2:E2');
    this.styleReportSubtitle(
      details,
      'A2',
      `Período: ${periodLabel} · Ordenado por departamento, código y día`,
    );
    const detailHeader = details.getRow(4);
    detailHeader.values = [
      'Código',
      'Nombre del empleado',
      'Departamento',
      'Comida solicitada',
      'Día de la solicitud',
    ];
    this.styleReportHeader(detailHeader, 5);
    const firstDetailRow = 5;
    const lastDetailRow = Math.max(firstDetailRow, firstDetailRow + input.rows.length - 1);

    if (input.rows.length === 0) {
      details.mergeCells('A5:E5');
      const empty = details.getCell('A5');
      empty.value = 'No existen pedidos para el período seleccionado.';
      empty.font = { italic: true, color: { argb: 'FF64748B' } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      details.getRow(5).height = 30;
    } else {
      input.rows.forEach((item, index) => {
        const row = details.getRow(firstDetailRow + index);
        row.values = [
          item.employeeCode,
          item.employeeName,
          item.department,
          item.mealName,
          `${item.dayName} ${this.formatDate(item.mealDate)}`,
        ];
        row.height = 23;
        row.eachCell((cell, columnNumber) => {
          cell.alignment = {
            horizontal: columnNumber === 1 ? 'center' : 'left',
            vertical: 'middle',
            wrapText: [2, 3, 4, 5].includes(columnNumber),
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: index % 2 === 0 ? PALE_TEAL : WHITE },
          };
          cell.border = {
            bottom: { style: 'hair', color: { argb: BORDER_GREEN } },
          };
        });
        row.getCell(1).numFmt = '@';
      });
    }
    details.autoFilter = { from: 'A4', to: 'E4' };
    details.pageSetup.printArea = `A1:E${lastDetailRow}`;
    details.headerFooter.oddFooter =
      `${periodLabel} · Página &P de &N`;

    const totals = workbook.addWorksheet('Totales por día', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.35,
          right: 0.35,
          top: 0.4,
          bottom: 0.4,
          header: 0.2,
          footer: 0.2,
        },
      },
    });
    totals.columns = [
      { width: 17 },
      { width: 16 },
      { width: 44 },
      { width: 18 },
    ];
    totals.mergeCells('A1:D1');
    this.styleReportTitle(totals, 'A1', 'TOTALES DE PLATOS POR DÍA');
    totals.mergeCells('A2:D2');
    this.styleReportSubtitle(totals, 'A2', `Período: ${periodLabel}`);
    const totalsHeader = totals.getRow(4);
    totalsHeader.values = ['Día', 'Fecha', 'Comida solicitada', 'Total de platos'];
    this.styleReportHeader(totalsHeader, 4);

    let summaryRow = 5;
    const daySubtotalRows: number[] = [];
    for (
      let date = new Date(input.start);
      date <= input.end;
      date = this.addDays(date, 1)
    ) {
      const dayLabel = `${this.getDayName(date)} ${this.formatDate(date)}`;
      const options = input.mealTotals.filter(
        (item) => this.getDateOnly(item.date) === this.getDateOnly(date),
      );
      const firstMealRow = summaryRow;
      const visibleOptions = options.length > 0
        ? options
        : [{
            date,
            dayName: this.getDayName(date),
            mealName: 'Sin opciones registradas',
            quantity: 0,
          }];
      visibleOptions.forEach((item) => {
        const row = totals.getRow(summaryRow);
        row.values = [item.dayName, item.date, item.mealName, null];
        row.getCell(2).numFmt = 'dd/mm/yyyy';
        row.getCell(4).value = {
          formula: `COUNTIFS('Pedidos'!$D$${firstDetailRow}:$D$${lastDetailRow},C${summaryRow},'Pedidos'!$E$${firstDetailRow}:$E$${lastDetailRow},"${dayLabel}")`,
          result: item.quantity,
        };
        row.getCell(4).numFmt = '#,##0';
        row.height = 23;
        row.eachCell((cell, columnNumber) => {
          cell.alignment = {
            horizontal: columnNumber === 4 ? 'center' : 'left',
            vertical: 'middle',
            wrapText: columnNumber === 3,
          };
          cell.border = {
            bottom: { style: 'hair', color: { argb: BORDER_GREEN } },
          };
        });
        summaryRow += 1;
      });

      const subtotal = totals.getRow(summaryRow);
      subtotal.getCell(3).value = `TOTAL ${this.getDayName(date).toUpperCase()}`;
      subtotal.getCell(4).value = {
        formula: `SUM(D${firstMealRow}:D${summaryRow - 1})`,
        result: visibleOptions.reduce((sum, item) => sum + item.quantity, 0),
      };
      subtotal.getCell(4).numFmt = '#,##0';
      subtotal.height = 25;
      subtotal.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: TEXT_GREEN } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: LIGHT_TEAL },
        };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });
      daySubtotalRows.push(summaryRow);
      summaryRow += 2;
    }

    const grandTotalRow = totals.getRow(summaryRow);
    grandTotalRow.getCell(3).value = 'TOTAL GENERAL';
    grandTotalRow.getCell(4).value = {
      formula: daySubtotalRows.length > 0
        ? `SUM(${daySubtotalRows.map((row) => `D${row}`).join(',')})`
        : '=0',
      result: input.rows.reduce((sum, row) => sum + row.quantity, 0),
    };
    grandTotalRow.getCell(4).numFmt = '#,##0';
    grandTotalRow.height = 30;
    grandTotalRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: WHITE }, size: 12 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: TEAL },
      };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    totals.pageSetup.printArea = `A1:D${summaryRow}`;
    totals.headerFooter.oddFooter =
      `${periodLabel} · Página &P de &N`;

    return workbook;
  }

  private styleReportTitle(
    worksheet: ExcelJS.Worksheet,
    address: string,
    value: string,
  ) {
    const cell = worksheet.getCell(address);
    cell.value = value;
    cell.font = { bold: true, color: { argb: WHITE }, size: 16 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: DARK_GREEN },
    };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(Number(address.match(/\d+$/)?.[0] ?? 1)).height = 34;
  }

  private styleReportSubtitle(
    worksheet: ExcelJS.Worksheet,
    address: string,
    value: string,
  ) {
    const cell = worksheet.getCell(address);
    cell.value = value;
    cell.font = { bold: true, color: { argb: TEXT_GREEN }, size: 10 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: LIGHT_TEAL },
    };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(Number(address.match(/\d+$/)?.[0] ?? 1)).height = 25;
  }

  private styleReportHeader(row: ExcelJS.Row, visibleColumns: number) {
    row.height = 28;
    for (let column = 1; column <= visibleColumns; column += 1) {
      const cell = row.getCell(column);
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: TEAL },
      };
      cell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        bottom: { style: 'medium', color: { argb: DARK_GREEN } },
      };
    }
  }

  private async saveReportAudit(
    entityName: string,
    entityId: string,
    actor: AuthenticatedUser,
    values: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        entityName,
        entityId,
        action: 'CREATE',
        actorUserId: actor.id,
        newValues: JSON.stringify(values),
      },
    });
  }

  private buildWorkbook(input: {
    employee: { employeeCode: string; name: string; department: string };
    start: Date;
    end: Date;
    now: Date;
    rows: Array<{
      employeeCode: string;
      employeeName: string;
      department: string;
      mealDate: Date;
      dayName: string;
      mealName: string;
      quantity: number;
      status: string;
      deliveredAt: Date | null;
    }>;
    totals: { total: number; delivered: number; pending: number };
  }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Comedor Fasani';
    workbook.created = input.now;
    workbook.modified = input.now;
    workbook.calcProperties.fullCalcOnLoad = true;

    const worksheet = workbook.addWorksheet('Auditoría de almuerzos', {
      views: [{ state: 'frozen', ySplit: 9, showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.45,
          bottom: 0.45,
          header: 0.2,
          footer: 0.2,
        },
      },
    });
    worksheet.columns = [
      { width: 16 },
      { width: 34 },
      { width: 25 },
      { width: 14 },
      { width: 14 },
      { width: 40 },
      { width: 11 },
      { width: 15 },
      { width: 22 },
    ];

    worksheet.mergeCells('A1:I1');
    const title = worksheet.getCell('A1');
    title.value = 'REGISTRO INDIVIDUAL DE ALMUERZOS';
    title.font = { bold: true, color: { argb: WHITE }, size: 16 };
    title.alignment = { horizontal: 'left', vertical: 'middle' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_GREEN } };
    worksheet.getRow(1).height = 34;

    worksheet.mergeCells('A2:I2');
    const subtitle = worksheet.getCell('A2');
    subtitle.value = `Período auditado: ${this.formatDate(input.start)} al ${this.formatDate(input.end)}`;
    subtitle.font = { bold: true, color: { argb: TEXT_GREEN }, size: 11 };
    subtitle.alignment = { horizontal: 'left', vertical: 'middle' };
    subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_TEAL } };
    worksheet.getRow(2).height = 25;

    worksheet.mergeCells('B4:C4');
    worksheet.mergeCells('E4:F4');
    worksheet.mergeCells('H4:I4');
    worksheet.mergeCells('B5:C5');
    this.setMetadataPair(worksheet, 'A4', 'B4', 'Código', input.employee.employeeCode);
    this.setMetadataPair(worksheet, 'D4', 'E4', 'Nombre', input.employee.name);
    this.setMetadataPair(
      worksheet,
      'G4',
      'H4',
      'Departamento',
      input.employee.department.trim() || 'Sin departamento',
    );
    this.setMetadataPair(
      worksheet,
      'A5',
      'B5',
      'Fecha de generación',
      input.now,
      'dd/mm/yyyy hh:mm',
    );

    const firstDataRow = 10;
    const finalDataRow = Math.max(firstDataRow, firstDataRow + input.rows.length - 1);
    const summaryCells = [
      { labelRange: 'A7:B7', valueCell: 'C7', label: 'TOTAL RESERVADO', value: input.totals.total, formula: `SUM(G${firstDataRow}:G${finalDataRow})` },
      { labelRange: 'D7:E7', valueCell: 'F7', label: 'ENTREGADOS', value: input.totals.delivered, formula: `SUMIF(H${firstDataRow}:H${finalDataRow},"Entregado",G${firstDataRow}:G${finalDataRow})` },
      { labelRange: 'G7:H7', valueCell: 'I7', label: 'PENDIENTES', value: input.totals.pending, formula: `SUMIF(H${firstDataRow}:H${finalDataRow},"Pendiente",G${firstDataRow}:G${finalDataRow})` },
    ];
    summaryCells.forEach((summary) => {
      worksheet.mergeCells(summary.labelRange);
      const label = worksheet.getCell(summary.labelRange.split(':')[0]);
      label.value = summary.label;
      label.font = { bold: true, color: { argb: TEXT_GREEN }, size: 10 };
      label.alignment = { horizontal: 'left', vertical: 'middle' };
      label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_TEAL } };
      const value = worksheet.getCell(summary.valueCell);
      value.value = { formula: summary.formula, result: summary.value };
      value.numFmt = '#,##0';
      value.font = { bold: true, color: { argb: WHITE }, size: 15 };
      value.alignment = { horizontal: 'center', vertical: 'middle' };
      value.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    });
    worksheet.getRow(7).height = 31;

    const header = worksheet.getRow(9);
    header.values = [
      'Código',
      'Nombre del empleado',
      'Departamento',
      'Fecha',
      'Día',
      'Comida solicitada',
      'Cantidad',
      'Estado',
      'Entregado el',
    ];
    header.height = 27;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
      cell.border = { bottom: { style: 'medium', color: { argb: DARK_GREEN } } };
    });

    if (input.rows.length === 0) {
      worksheet.mergeCells('A10:I10');
      const empty = worksheet.getCell('A10');
      empty.value = 'No existen reservaciones para este empleado en el período seleccionado.';
      empty.font = { italic: true, color: { argb: 'FF64748B' } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      empty.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      worksheet.getRow(10).height = 30;
    } else {
      input.rows.forEach((item, index) => {
        const row = worksheet.getRow(firstDataRow + index);
        row.values = [
          item.employeeCode,
          item.employeeName,
          item.department,
          item.mealDate,
          item.dayName,
          item.mealName,
          item.quantity,
          item.status,
          item.deliveredAt,
        ];
        row.height = 23;
        row.eachCell((cell, columnNumber) => {
          cell.alignment = {
            horizontal: [7, 8].includes(columnNumber) ? 'center' : 'left',
            vertical: 'middle',
            wrapText: [2, 3, 6].includes(columnNumber),
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: index % 2 === 0 ? PALE_TEAL : WHITE },
          };
          cell.border = { bottom: { style: 'hair', color: { argb: BORDER_GREEN } } };
        });
        row.getCell(1).numFmt = '@';
        row.getCell(4).numFmt = 'dd/mm/yyyy';
        row.getCell(7).numFmt = '#,##0';
        row.getCell(8).font = {
          bold: true,
          color: { argb: item.status === 'Entregado' ? TEXT_GREEN : 'FFC2410C' },
        };
        if (item.deliveredAt) row.getCell(9).numFmt = 'dd/mm/yyyy hh:mm';
      });
    }

    worksheet.autoFilter = { from: 'A9', to: 'I9' };
    worksheet.pageSetup.printArea = `A1:I${finalDataRow}`;
    worksheet.headerFooter.oddFooter =
      `Auditoría ${input.employee.employeeCode} · ${this.formatDate(input.start)} a ${this.formatDate(input.end)} · Página &P de &N`;

    return workbook;
  }

  private buildPayrollWorkbook(input: {
    start: Date;
    end: Date;
    now: Date;
    rows: Array<{
      employeeCode: string;
      name: string;
      department: string;
      consumedMeals: number;
    }>;
  }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Comedor Fasani';
    workbook.created = input.now;
    workbook.modified = input.now;
    workbook.calcProperties.fullCalcOnLoad = true;

    const worksheet = workbook.addWorksheet('REGISTROS', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.2,
          footer: 0.2,
        },
      },
    });
    worksheet.columns = [
      { width: 23.85546875 },
      { width: 48.140625 },
      { width: 36.85546875 },
      { width: 21.140625 },
      { width: 33.7109375 },
    ];

    const rangeLabel = `${this.formatDate(input.start)} al ${this.formatDate(input.end)}`;
    const tableRows = input.rows.map((row) => [
      row.employeeCode,
      row.name,
      row.department,
      row.consumedMeals,
      rangeLabel,
    ]);
    const table = worksheet.addTable({
      name: 'registrosNomina',
      ref: 'A1',
      headerRow: true,
      totalsRow: true,
      style: {
        showFirstColumn: false,
        showLastColumn: false,
        showRowStripes: false,
        showColumnStripes: false,
      },
      columns: [
        { name: 'Codigo Colaborador', totalsRowLabel: '' },
        { name: 'Nombres' },
        { name: 'Centro de trabajo' },
        { name: 'Platos Consumidos', totalsRowFunction: 'sum' },
        { name: 'Rango De Fechas' },
      ],
      rows: tableRows,
    });
    (
      table as unknown as {
        table: { style: { theme: string | null } };
      }
    ).table.style.theme = null;
    table.commit();

    const totalRow = input.rows.length + 2;
    const border: Partial<ExcelJS.Borders> = {
      left: { style: 'thin', color: { argb: 'FF666666' } },
      right: { style: 'thin', color: { argb: 'FF666666' } },
      top: { style: 'thin', color: { argb: 'FF666666' } },
      bottom: { style: 'thin', color: { argb: 'FF666666' } },
    };

    worksheet.getRow(1).height = 19.9;
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = {
        name: 'Helvetica',
        size: 10,
        bold: true,
        color: { argb: 'FF000000' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' },
      };
      cell.border = border;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });

    input.rows.forEach((_, index) => {
      const row = worksheet.getRow(index + 2);
      row.eachCell((cell, columnNumber) => {
        cell.font = {
          name: 'Helvetica',
          size: 10,
          color: { argb: 'FF000000' },
          bold: columnNumber === 1 || columnNumber === 5,
        };
        cell.border = border;
        cell.alignment = {
          horizontal: columnNumber === 4 ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
      });
      row.getCell(1).numFmt = '@';
      row.getCell(4).numFmt = '#,##0';
    });

    const totals = worksheet.getRow(totalRow);
    totals.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    totals.getCell(4).numFmt = '#,##0';

    worksheet.pageSetup.printArea = `A1:E${totalRow}`;
    worksheet.headerFooter.oddFooter =
      `Reporte de vales · ${rangeLabel} · Página &P de &N`;

    return workbook;
  }

  private setMetadataPair(
    worksheet: ExcelJS.Worksheet,
    labelAddress: string,
    valueAddress: string,
    labelText: string,
    valueContent: string | Date,
    numberFormat?: string,
  ) {
    const label = worksheet.getCell(labelAddress);
    label.value = labelText;
    label.font = { bold: true, color: { argb: TEXT_GREEN }, size: 9 };
    label.alignment = { horizontal: 'left', vertical: 'middle' };

    const value = worksheet.getCell(valueAddress);
    value.value = valueContent;
    value.font = { bold: true, color: { argb: 'FF1F3434' }, size: 10 };
    value.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (numberFormat) value.numFmt = numberFormat;
  }

  private getDayName(date: Date) {
    const value = new Intl.DateTimeFormat('es-GT', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(date);
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private formatDate(date: Date) {
    return new Intl.DateTimeFormat('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD');
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('La fecha indicada no es válida');
    }
    return date;
  }

  private validateDateRange(startDate: string, endDate: string) {
    const start = this.parseDateOnly(startDate);
    const end = this.parseDateOnly(endDate);
    if (end < start) {
      throw new BadRequestException(
        'La fecha final debe ser igual o posterior a la fecha inicial',
      );
    }

    const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `El período máximo de exportación es de ${MAX_RANGE_DAYS} días`,
      );
    }
    return { start, end };
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private getDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private getGuatemalaDate(now: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Guatemala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return new Date(
      Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
      ),
    );
  }

  private getMonday(date: Date) {
    const day = date.getUTCDay();
    return this.addDays(date, day === 0 ? -6 : 1 - day);
  }
}
