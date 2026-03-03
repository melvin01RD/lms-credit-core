// ============================================================================
// LMS-Credit-Core: Modulo de Reportes PDF
// Archivo: lib/reports/cartera-mora.ts
// Descripcion: Generador PDF para Cartera en Mora
// ============================================================================

import PDFDocument from 'pdfkit';
import { CarteraMoraData } from '../services/cartera-mora.service';

// --- Colores ---
const COLORS = {
  primary: '#1a365d',
  secondary: '#c53030',       // rojo para encabezados de mora
  accent: '#e53e3e',
  lightBg: '#fff5f5',
  border: '#fed7d7',
  textDark: '#1a202c',
  textGray: '#4a5568',
  danger: '#e53e3e',
  dangerDark: '#c53030',
  success: '#38a169',
  lightGray: '#f7fafc',
  divider: '#e2e8f0',
  white: '#ffffff',
  rowAlt: '#fff5f5',
  rowNormal: '#ffffff',
} as const;

// --- Utilidades ---

function formatCurrency(amount: number): string {
  return `RD$ ${amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTimestamp(): string {
  const now = new Date();
  return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// --- Generador ---

export function generateCarteraMoraPDF(data: CarteraMoraData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'letter',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: 'Cartera en Mora',
          Author: data.empresaNombre,
          Subject: 'Reporte de Préstamos en Mora',
          Creator: 'LMS Credit Core',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // =========================================================
      // HEADER
      // =========================================================
      const headerHeight = 75;
      doc.roundedRect(margin, y, contentWidth, headerHeight, 6).fill(COLORS.primary);

      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.white)
        .text(data.empresaNombre, margin + 15, y + 12, { width: contentWidth * 0.55 });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.white)
        .text(data.empresaDireccion, margin + 15, y + 32);
      doc.text(`Tel: ${data.empresaTelefono}  |  RNC: ${data.empresaRnc}`, margin + 15, y + 44);

      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.white)
        .text('CARTERA EN MORA', margin + contentWidth * 0.55, y + 12, {
          width: contentWidth * 0.42, align: 'right',
        });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.white)
        .text(`Fecha: ${data.fechaGeneracion}`, margin + contentWidth * 0.55, y + 34, {
          width: contentWidth * 0.42, align: 'right',
        });

      y += headerHeight + 14;

      // =========================================================
      // KPIs - 4 métricas principales
      // =========================================================
      const kpiHeight = 58;
      doc.roundedRect(margin, y, contentWidth, kpiHeight, 5).fill(COLORS.secondary);

      const colW = contentWidth / 4;
      const kpis = [
        { label: 'Préstamos en Mora', value: `${data.totales.cantidadEnMora}` },
        { label: 'Capital en Riesgo', value: formatCurrency(data.totales.totalCapitalEnRiesgo) },
        { label: 'Total Mora Acumulada', value: formatCurrency(data.totales.totalMontoMora) },
        { label: 'Promedio Días en Mora', value: `${data.totales.promedioDiasEnMora} días` },
      ];

      kpis.forEach((kpi, i) => {
        const kx = margin + colW * i + 10;
        doc.font('Helvetica').fontSize(7).fillColor('#fca5a5').text(kpi.label, kx, y + 10, { width: colW - 14 });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.white).text(kpi.value, kx, y + 24, { width: colW - 14 });
        if (i < 3) {
          doc.moveTo(margin + colW * (i + 1), y + 10)
            .lineTo(margin + colW * (i + 1), y + kpiHeight - 10)
            .strokeColor('#991b1b').lineWidth(0.5).stroke();
        }
      });

      y += kpiHeight + 14;

      // =========================================================
      // TABLA DE PRÉSTAMOS EN MORA
      // =========================================================
      // Columnas: Cliente | Monto Original | Cap. Restante | Recuperado | Cuotas | Días Mora | Último Pago
      const colWidths = [132, 75, 75, 72, 48, 58, 72];
      // Total: 532 = contentWidth
      const tableHeaders = ['Cliente', 'Monto Original', 'Cap. Restante', 'Recuperado', 'Cuotas', 'Días Mora', 'Último Pago'];
      const colAligns: Array<'left' | 'right' | 'center'> = ['left', 'right', 'right', 'right', 'center', 'center', 'center'];

      // Encabezado de tabla
      const thH = 24;
      doc.rect(margin, y, contentWidth, thH).fill(COLORS.primary);

      let hx = margin;
      tableHeaders.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white)
          .text(h, hx + 5, y + 8, { width: colWidths[i] - 10, align: colAligns[i] });
        hx += colWidths[i];
      });
      y += thH;

      // Filas de datos
      const rowH = 20;
      data.prestamos.forEach((prestamo, idx) => {
        if (y + rowH > pageHeight - 60) {
          doc.addPage();
          y = margin;
          // Repetir encabezado en nueva página
          doc.rect(margin, y, contentWidth, thH).fill(COLORS.primary);
          let hx2 = margin;
          tableHeaders.forEach((h, i) => {
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white)
              .text(h, hx2 + 5, y + 8, { width: colWidths[i] - 10, align: colAligns[i] });
            hx2 += colWidths[i];
          });
          y += thH;
        }

        const bg = idx % 2 === 0 ? COLORS.rowAlt : COLORS.rowNormal;
        doc.rect(margin, y, contentWidth, rowH).fill(bg);

        let rx = margin;
        const vals = [
          `${prestamo.clienteNombre}\n${prestamo.clienteCedula}`,
          formatCurrency(prestamo.montoOriginal),
          formatCurrency(prestamo.capitalRestante),
          formatCurrency(prestamo.capitalRecuperado),
          `${prestamo.cuotasPagadas}/${prestamo.totalCuotas}`,
          `${prestamo.diasEnMora}`,
          prestamo.ultimoPago ?? 'Sin pagos',
        ];

        vals.forEach((v, i) => {
          // Colorear días en mora según severidad
          const textColor = i === 5
            ? (prestamo.diasEnMora >= 30 ? COLORS.dangerDark : COLORS.danger)
            : COLORS.textDark;

          doc.font(i === 5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
            .fillColor(textColor)
            .text(v, rx + 5, y + 6, { width: colWidths[i] - 10, align: colAligns[i] });
          rx += colWidths[i];
        });

        doc.moveTo(margin, y + rowH).lineTo(margin + contentWidth, y + rowH)
          .strokeColor(COLORS.divider).lineWidth(0.3).stroke();
        y += rowH;
      });

      // Fila vacía si no hay datos
      if (data.prestamos.length === 0) {
        doc.rect(margin, y, contentWidth, 30).fill(COLORS.lightGray);
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.textGray)
          .text('No hay préstamos en mora en este momento', margin, y + 10, { width: contentWidth, align: 'center' });
        y += 30;
      }

      // =========================================================
      // FILA DE TOTALES
      // =========================================================
      if (y + rowH > pageHeight - 60) {
        doc.addPage();
        y = margin;
      }

      doc.rect(margin, y, contentWidth, rowH + 2).fill(COLORS.primary);

      let tx = margin;
      const totalesVals = [
        `TOTALES (${data.prestamos.length} préstamos en mora)`,
        formatCurrency(data.totales.totalCapitalOriginal),
        formatCurrency(data.totales.totalCapitalEnRiesgo),
        formatCurrency(data.totales.totalCapitalRecuperado),
        '',
        `${data.totales.promedioDiasEnMora} días prom.`,
        '',
      ];
      totalesVals.forEach((v, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white)
          .text(v, tx + 5, y + 7, { width: colWidths[i] - 10, align: colAligns[i] });
        tx += colWidths[i];
      });
      y += rowH + 2;

      // =========================================================
      // FOOTER
      // =========================================================
      const footerY = pageHeight - margin - 10;
      doc.moveTo(margin, footerY + 5).lineTo(pageWidth - margin, footerY + 5)
        .strokeColor(COLORS.divider).lineWidth(0.5).stroke();

      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.textGray)
        .text(
          `Documento generado por LMS Credit Core  |  ${data.empresaNombre}  |  ${getTimestamp()}`,
          margin, footerY - 5,
          { width: contentWidth, align: 'center' },
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
