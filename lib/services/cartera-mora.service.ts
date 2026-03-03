// ============================================================================
// LMS-Credit-Core: Servicio de Cartera en Mora
// Archivo: lib/services/cartera-mora.service.ts
// Descripcion: Obtiene todos los préstamos con status OVERDUE para el reporte
// ============================================================================

import { prisma } from "../db/prisma";

export interface CarteraMoraLoan {
  clienteNombre: string;
  clienteCedula: string;
  montoOriginal: number;
  capitalRestante: number;
  capitalRecuperado: number;
  cuotasPagadas: number;
  totalCuotas: number;
  diasEnMora: number;
  montoMora: number;
  ultimoPago: string | null;
  fechaDesembolso: string;
}

export interface CarteraMoraData {
  empresaNombre: string;
  empresaDireccion: string;
  empresaTelefono: string;
  empresaRnc: string;
  fechaGeneracion: string;
  prestamos: CarteraMoraLoan[];
  totales: {
    cantidadEnMora: number;
    totalCapitalOriginal: number;
    totalCapitalEnRiesgo: number;
    totalCapitalRecuperado: number;
    totalMontoMora: number;
    promedioDiasEnMora: number;
  };
}

export async function getCarteraMora(): Promise<CarteraMoraData> {
  const empresaNombre = process.env.EMPRESA_NOMBRE ?? 'LMS Credit Core SRL';
  const empresaDireccion = process.env.EMPRESA_DIRECCION ?? 'Santo Domingo, República Dominicana';
  const empresaTelefono = process.env.EMPRESA_TELEFONO ?? '';
  const empresaRnc = process.env.EMPRESA_RNC ?? '';

  const now = new Date();

  // Obtener todos los préstamos OVERDUE con sus datos de cliente y pagos
  const loans = await prisma.loan.findMany({
    where: { status: 'OVERDUE' },
    include: {
      client: {
        select: {
          firstName: true,
          lastName: true,
          documentId: true,
        },
      },
      payments: {
        orderBy: { paymentDate: 'desc' },
        select: {
          totalAmount: true,
          capitalApplied: true,
          paymentDate: true,
          lateFeeApplied: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const prestamos: CarteraMoraLoan[] = loans.map((loan) => {
    const principalAmount = Number(loan.principalAmount);
    const remainingCapital = Number(loan.remainingCapital);
    const capitalRecuperado = principalAmount - remainingCapital;

    // Calcular días en mora desde la fecha de creación del préstamo
    // o desde el último pago si existe
    const lastPayment = loan.payments[0] ?? null;
    const referenceDate = lastPayment
      ? new Date(lastPayment.paymentDate)
      : new Date(loan.createdAt);
    const diasEnMora = Math.floor(
      (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Monto mora: suma de late fees registradas en pagos
    const montoMoraRegistrado = loan.payments.reduce(
      (sum, p) => sum + Number(p.lateFeeApplied ?? 0),
      0
    );

    // Cuotas pagadas: contar pagos completados
    const cuotasPagadas = loan.payments.length;

    const ultimoPago = lastPayment
      ? new Date(lastPayment.paymentDate).toLocaleDateString('es-DO', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null;

    const fechaDesembolso = new Date(loan.createdAt).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return {
      clienteNombre: `${loan.client.firstName} ${loan.client.lastName ?? ''}`.trim(),
      clienteCedula: loan.client.documentId,
      montoOriginal: principalAmount,
      capitalRestante: remainingCapital,
      capitalRecuperado,
      cuotasPagadas,
      totalCuotas: loan.termCount,
      diasEnMora: Math.max(0, diasEnMora),
      montoMora: montoMoraRegistrado,
      ultimoPago,
      fechaDesembolso,
    };
  });

  // Calcular totales
  const totalCapitalOriginal = prestamos.reduce((s, p) => s + p.montoOriginal, 0);
  const totalCapitalEnRiesgo = prestamos.reduce((s, p) => s + p.capitalRestante, 0);
  const totalCapitalRecuperado = prestamos.reduce((s, p) => s + p.capitalRecuperado, 0);
  const totalMontoMora = prestamos.reduce((s, p) => s + p.montoMora, 0);
  const promedioDiasEnMora =
    prestamos.length > 0
      ? Math.round(prestamos.reduce((s, p) => s + p.diasEnMora, 0) / prestamos.length)
      : 0;

  const fechaGeneracion = now.toLocaleDateString('es-DO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    empresaNombre,
    empresaDireccion,
    empresaTelefono,
    empresaRnc,
    fechaGeneracion,
    prestamos,
    totales: {
      cantidadEnMora: prestamos.length,
      totalCapitalOriginal,
      totalCapitalEnRiesgo,
      totalCapitalRecuperado,
      totalMontoMora,
      promedioDiasEnMora,
    },
  };
}
