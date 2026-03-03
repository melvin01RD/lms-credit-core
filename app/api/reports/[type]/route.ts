// ============================================================================
// LMS-Credit-Core: API Route para Reportes PDF
// Archivo: app/api/reports/[type]/route.ts
//
// Uso:
//   GET /api/reports/recibo-pago?paymentId=xxx
//   GET /api/reports/estado-cuenta?loanId=xxx
//   GET /api/reports/plan-pagos?loanId=xxx
//   GET /api/reports/nota-pagare?loanId=xxx
//   GET /api/reports/cartera-vigente
//   GET /api/reports/cartera-vigente-excel
// ============================================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/auth-middleware';
import { generatePdfReport, PdfReportType } from '@/lib/services/pdf-report.service';
import { getCarteraVigente } from '@/lib/services/cartera-vigente.service';
import { generateCarteraVigentePDF } from '@/lib/reports/cartera-vigente';
import { generateCarteraVigenteExcel } from '@/lib/reports/cartera-vigente-excel';
import { getCarteraMora } from '@/lib/services/cartera-mora.service';
import { generateCarteraMoraPDF } from '@/lib/reports/cartera-mora';
import { generateCarteraMoraExcel } from '@/lib/reports/cartera-mora-excel';

export const dynamic = 'force-dynamic';

const REPORT_CONFIG: Record<PdfReportType, { paramName: string; fileName: string }> = {
  'recibo-pago': {
    paramName: 'paymentId',
    fileName: 'Recibo_de_Pago',
  },
  'estado-cuenta': {
    paramName: 'loanId',
    fileName: 'Estado_de_Cuenta',
  },
  'plan-pagos': {
    paramName: 'loanId',
    fileName: 'Plan_de_Pagos',
  },
  'nota-pagare': {
    paramName: 'loanId',
    fileName: 'Nota_de_Pagare',
  },
  'contrato': {
    paramName: 'loanId',
    fileName: 'Contrato_Prestamo',
  },
};

export const GET = withAuth(async (req, context) => {
  const params = await context!.params;
  const reportType = params.type as string;
  const timestamp = new Date().toISOString().split('T')[0];

  // -------------------------------------------------------------------------
  // Reportes globales (sin entityId): Cartera Vigente
  // -------------------------------------------------------------------------
  if (reportType === 'cartera-vigente') {
    const data = await getCarteraVigente();
    const buffer = await generateCarteraVigentePDF(data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Cartera_Vigente_${timestamp}.pdf"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  if (reportType === 'cartera-vigente-excel') {
    const data = await getCarteraVigente();
    const buffer = await generateCarteraVigenteExcel(data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Cartera_Vigente_${timestamp}.xlsx"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  if (reportType === 'cartera-mora') {
    const data = await getCarteraMora();
    const buffer = await generateCarteraMoraPDF(data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Cartera_Mora_${timestamp}.pdf"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  if (reportType === 'cartera-mora-excel') {
    const data = await getCarteraMora();
    const buffer = await generateCarteraMoraExcel(data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Cartera_Mora_${timestamp}.xlsx"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  // -------------------------------------------------------------------------
  // Reportes por entidad (requieren entityId)
  // -------------------------------------------------------------------------
  const pdfReportType = reportType as PdfReportType;

  // Validar tipo de reporte
  const config = REPORT_CONFIG[pdfReportType];
  if (!config) {
    return NextResponse.json(
      { error: { code: 'INVALID_REPORT_TYPE', message: `Tipo de reporte no válido: ${reportType}` } },
      { status: 400 }
    );
  }

  // Obtener el ID de la entidad
  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get(config.paramName);

  if (!entityId) {
    return NextResponse.json(
      { error: { code: 'MISSING_PARAMETER', message: `Parámetro requerido: ${config.paramName}` } },
      { status: 400 }
    );
  }

  // Generar el PDF
  const pdfBuffer = await generatePdfReport(pdfReportType, entityId);

  // Construir nombre del archivo
  const fileName = `${config.fileName}_${timestamp}.pdf`;

  // Retornar el PDF como respuesta
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': pdfBuffer.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
