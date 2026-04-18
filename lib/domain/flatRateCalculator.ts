/**
 * flatRateCalculator.ts
 *
 * Lógica matemática para préstamos de cargo fijo (Flat Rate).
 * Aplica a frecuencias DAILY y WEEKLY.
 *
 * REGLAS DE NEGOCIO:
 * - El cargo financiero es FIJO desde el día 1 (no varía con el saldo)
 * - Abono extra = cuotas adelantadas (cargo sagrado, no se recalcula)
 * - Liquidación total = pago de todas las cuotas restantes de una vez
 * - Mora = cargo por cada cuota vencida no pagada en su fecha
 */

import { PaymentFrequency } from "@prisma/client";
import { addDays, addWeeks, addMonths } from "date-fns";

// ============================================
// INTERFACES
// ============================================

export interface FlatRateLoanInput {
  principalAmount: number;
  totalFinanceCharge: number; // cargo total acordado (ej. RD$3,500)
  termCount: number;          // número de cuotas (ej. 45 días, 8 semanas)
  paymentFrequency: PaymentFrequency;
  startDate: Date;
}

export interface FlatRateLoanResult {
  principalAmount: number;
  totalFinanceCharge: number;
  totalPayableAmount: number;    // capital + cargo
  termCount: number;
  installmentAmount: number;     // cuota fija por período
  paymentFrequency: PaymentFrequency;
  // Desglose proporcional por cuota (para reportes)
  principalPerInstallment: number;
  interestPerInstallment: number;
  // Tasas efectivas (informativas para contratos)
  effectiveRatePerTerm: number;  // % ganancia sobre el capital
  schedule: FlatRateScheduleEntry[];
}

export interface FlatRateScheduleEntry {
  installmentNumber: number;
  dueDate: Date;
  expectedAmount: number;
  // Desglose proporcional
  principalExpected: number;
  interestExpected: number;
}

export interface FlatRatePaymentDistribution {
  installmentsCovered: number;     // cuántas cuotas cubre este pago
  capitalApplied: number;          // proporcional al capital
  interestApplied: number;         // proporcional al cargo
  lateFeeApplied: number;          // mora si aplica
  totalAmount: number;
  // Cuotas específicas que se marcan como pagadas
  scheduleIdsToMark: string[];     // se llenan en el servicio
  isFullSettlement: boolean;
  excessAmount: number;            // excedente si pagó de más
}

export interface FlatRateOverdueInfo {
  daysOverdue: number;
  overdueInstallments: number;     // cuotas vencidas sin pagar
  overdueAmount: number;           // monto total vencido
  lateFee: number;                 // mora calculada
}

// ============================================
// CONSTANTES
// ============================================

// Mora por cuota vencida en Flat Rate
const LATE_FEE_RATE_PER_INSTALLMENT = 0.05; // 5% sobre el valor de la cuota vencida

// ============================================
// CÁLCULOS PRINCIPALES
// ============================================

export function calculateFlatRateLoan(input: FlatRateLoanInput): FlatRateLoanResult {
  const { principalAmount, totalFinanceCharge, termCount, paymentFrequency, startDate } = input;

  if (principalAmount <= 0) throw new Error("El capital debe ser mayor a cero");
  if (totalFinanceCharge < 0) throw new Error("El cargo financiero no puede ser negativo");
  if (totalFinanceCharge > principalAmount) throw new Error("El cargo financiero no puede superar el monto del capital");
  if (termCount <= 0) throw new Error("El número de cuotas debe ser mayor a cero");
  if (termCount > 360) throw new Error("El número de cuotas no puede superar 360");

  const totalPayableAmount = principalAmount + totalFinanceCharge;
  const installmentAmount = Math.round((totalPayableAmount / termCount) * 100) / 100;
  const principalPerInstallment = Math.round((principalAmount / termCount) * 100) / 100;
  const interestPerInstallment = Math.round((totalFinanceCharge / termCount) * 100) / 100;
  const effectiveRatePerTerm = (totalFinanceCharge / principalAmount) * 100;

  const schedule = generateFlatRateSchedule(
    termCount,
    installmentAmount,
    principalPerInstallment,
    interestPerInstallment,
    paymentFrequency,
    startDate
  );

  // Assign rounding residual to last installment so sum of all installments equals totalPayableAmount exactly
  if (termCount > 1) {
    const last = schedule[schedule.length - 1];
    last.expectedAmount = Math.round((totalPayableAmount - installmentAmount * (termCount - 1)) * 100) / 100;
    last.principalExpected = Math.round((principalAmount - principalPerInstallment * (termCount - 1)) * 100) / 100;
    last.interestExpected = Math.round((totalFinanceCharge - interestPerInstallment * (termCount - 1)) * 100) / 100;
  }

  return {
    principalAmount,
    totalFinanceCharge,
    totalPayableAmount,
    termCount,
    installmentAmount,
    paymentFrequency,
    principalPerInstallment,
    interestPerInstallment,
    effectiveRatePerTerm,
    schedule,
  };
}

export function generateFlatRateSchedule(
  termCount: number,
  installmentAmount: number,
  principalPerInstallment: number,
  interestPerInstallment: number,
  paymentFrequency: PaymentFrequency,
  startDate: Date
): FlatRateScheduleEntry[] {
  const schedule: FlatRateScheduleEntry[] = [];

  for (let i = 1; i <= termCount; i++) {
    const dueDate = calculateFlatRateNextDate(startDate, paymentFrequency, i);
    schedule.push({
      installmentNumber: i,
      dueDate,
      expectedAmount: installmentAmount,
      principalExpected: principalPerInstallment,
      interestExpected: interestPerInstallment,
    });
  }

  return schedule;
}

export function calculateFlatRateNextDate(
  startDate: Date,
  frequency: PaymentFrequency,
  installmentNumber: number
): Date {
  switch (frequency) {
    case PaymentFrequency.DAILY:
      return addDays(startDate, installmentNumber);
    case PaymentFrequency.WEEKLY:
      return addWeeks(startDate, installmentNumber);
    case PaymentFrequency.BIWEEKLY:
      return addWeeks(startDate, installmentNumber * 2);
    case PaymentFrequency.MONTHLY:
      return addMonths(startDate, installmentNumber);
    default:
      throw new Error(`Frecuencia no soportada: ${frequency}`);
  }
}

// ============================================
// DISTRIBUCIÓN DE PAGO FLAT RATE
// ============================================

export function calculateFlatRatePaymentDistribution(params: {
  paymentAmount: number;
  installmentAmount: number;
  pendingInstallments: number;
  overdueInstallments: number;
  installmentAmount_lateFee?: number;
}): FlatRatePaymentDistribution {
  const {
    paymentAmount,
    installmentAmount,
    pendingInstallments,
    overdueInstallments,
    installmentAmount_lateFee = 0,
  } = params;

  if (paymentAmount <= 0) {
    throw new Error("El monto del pago debe ser mayor a cero");
  }

  const totalPendingAmount = installmentAmount * pendingInstallments;
  const isFullSettlement = paymentAmount >= totalPendingAmount + installmentAmount_lateFee;

  if (isFullSettlement) {
    return {
      installmentsCovered: pendingInstallments,
      capitalApplied: 0,
      interestApplied: 0,
      lateFeeApplied: installmentAmount_lateFee,
      totalAmount: paymentAmount,
      scheduleIdsToMark: [],
      isFullSettlement: true,
      excessAmount: Math.max(0, paymentAmount - totalPendingAmount - installmentAmount_lateFee),
    };
  }

  let remaining = paymentAmount;
  let lateFeeApplied = 0;

  if (installmentAmount_lateFee > 0) {
    lateFeeApplied = Math.min(remaining, installmentAmount_lateFee);
    remaining -= lateFeeApplied;
  }

  const installmentsCovered = Math.floor(remaining / installmentAmount);
  const excessAmount = remaining - installmentsCovered * installmentAmount;

  if (installmentsCovered === 0 && lateFeeApplied === 0) {
    throw new Error(
      `El monto RD$${paymentAmount} es insuficiente para cubrir una cuota de RD$${installmentAmount}`
    );
  }

  return {
    installmentsCovered,
    capitalApplied: 0,
    interestApplied: 0,
    lateFeeApplied,
    totalAmount: paymentAmount,
    scheduleIdsToMark: [],
    isFullSettlement: false,
    excessAmount,
  };
}

// ============================================
// MORA EN FLAT RATE
// ============================================

export function calculateFlatRateLateFee(
  overdueInstallments: number,
  installmentAmount: number
): number {
  const lateFee = overdueInstallments * installmentAmount * LATE_FEE_RATE_PER_INSTALLMENT;
  return Math.round(lateFee * 100) / 100;
}

export function calculateFlatRateOverdueInfo(params: {
  scheduleEntries: Array<{
    installmentNumber: number;
    dueDate: Date;
    status: string;
    expectedAmount: number;
  }>;
  today?: Date;
}): FlatRateOverdueInfo {
  const today = params.today ?? new Date();
  today.setHours(0, 0, 0, 0);

  const overdueEntries = params.scheduleEntries.filter(
    (e) => e.status === "PENDING" && new Date(e.dueDate) < today
  );

  const overdueInstallments = overdueEntries.length;
  const overdueAmount = overdueEntries.reduce((sum, e) => sum + e.expectedAmount, 0);
  const lateFee = calculateFlatRateLateFee(
    overdueInstallments,
    overdueEntries[0]?.expectedAmount ?? 0
  );

  const firstOverdue = overdueEntries[0];
  const daysOverdue = firstOverdue
    ? Math.floor((today.getTime() - new Date(firstOverdue.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    daysOverdue,
    overdueInstallments,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    lateFee,
  };
}

// ============================================
// TEXTOS PARA DOCUMENTOS (PDFs / Contratos)
// ============================================

export interface FrequencyTexts {
  label: string;
  cuota: string;
  periodo: string;
  periodoSingular: string;
}

export function getFrequencyTexts(frequency: PaymentFrequency): FrequencyTexts {
  const map: Record<PaymentFrequency, FrequencyTexts> = {
    DAILY: {
      label: "Diaria",
      cuota: "cuotas diarias",
      periodo: "días",
      periodoSingular: "día",
    },
    WEEKLY: {
      label: "Semanal",
      cuota: "cuotas semanales",
      periodo: "semanas",
      periodoSingular: "semana",
    },
    BIWEEKLY: {
      label: "Quincenal",
      cuota: "cuotas quincenales",
      periodo: "quincenas",
      periodoSingular: "quincena",
    },
    MONTHLY: {
      label: "Mensual",
      cuota: "cuotas mensuales",
      periodo: "meses",
      periodoSingular: "mes",
    },
  };

  return map[frequency];
}

export interface LoanStructureTexts {
  interestLabel: string;
  interestClause: string;
  paymentClause: (params: {
    termCount: number;
    installmentAmount: number;
    frequency: PaymentFrequency;
    totalFinanceCharge?: number;
  }) => string;
}

export function getLoanStructureTexts(): LoanStructureTexts {
  return {
    interestLabel: "Cargo Financiero",
    interestClause:
      "El presente préstamo conlleva un cargo financiero fijo acordado entre las partes, " +
      "calculado sobre el monto total del capital prestado. Dicho cargo es fijo e invariable " +
      "durante toda la vigencia del préstamo, independientemente de pagos anticipados.",
    paymentClause: ({ termCount, installmentAmount, frequency, totalFinanceCharge }) => {
      const freq = getFrequencyTexts(frequency);
      const fmt = (n: number) =>
        n.toLocaleString("es-DO", { style: "currency", currency: "DOP" });
      return (
        `EL DEUDOR se compromete a pagar el préstamo en ${termCount} ${freq.cuota} de ` +
        `${fmt(installmentAmount)} cada una. El cargo financiero total acordado es de ` +
        `${fmt(totalFinanceCharge ?? 0)}, el cual está incluido en las cuotas descritas.`
      );
    },
  };
}
