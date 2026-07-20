import { Response } from 'express';
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ExportFormat, ReportService, ReportSpec } from './report.service';

// Custom report builder (T-2.7, FR-M10-03). Gated by analytics:read like the
// dashboards (FR-M10-05).
@Controller('reports')
@RequirePermissions('analytics:read')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  // The datasets, columns, group dimensions, and filters the UI builds its form
  // from.
  @Get('datasets')
  datasets() {
    return this.reports.datasets();
  }

  // Runs a report and returns its columns and rows for the on-screen preview.
  @Post('run')
  run(@Body() spec: ReportSpec) {
    return this.reports.run(spec);
  }

  @Post('export')
  async export(
    @Body() spec: ReportSpec,
    @Query('format') format: ExportFormat,
    @Res() res: Response,
  ) {
    const file = await this.reports.export(spec, format);
    res.setHeader('Content-Type', file.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.end(file.bytes);
  }
}
