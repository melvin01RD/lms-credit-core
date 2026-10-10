'use client';

import { useState, useCallback } from 'react';

type ReportType = 'recibo-pago' | 'estado-cuenta' | 'plan-pagos' | 'nota-pagare' | 'contrato';

interface UseReportPDFOptions {
  onError?: (error: string) => void;
}

interface UseReportPDFReturn {
  loading: boolean;
  error: string | null;
  downloadPDF: (type: ReportType, entityId: string, fileName?: string) => Promise<void>;
  previewPDF: (type: ReportType, entityId: string) => Promise<void>;
}

const PARAM_MAP: Record<ReportType, string> = {
  'recibo-pago': 'paymentId',
  'estado-cuenta': 'loanId',
  'plan-pagos': 'loanId',
  'nota-pagare': 'loanId',
  'contrato': 'loanId',
};

export function useReportPDF(options?: UseReportPDFOptions): UseReportPDFReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPDF = useCallback(async (type: ReportType, entityId: string): Promise<Blob> => {
    const paramName = PARAM_MAP[type];
    const url = `/api/reports/${type}?${paramName}=${entityId}`;

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || errorData.error || `Error ${response.status} al generar el reporte`);
    }

    return response.blob();
  }, []);

  const downloadPDF = useCallback(async (
    type: ReportType,
    entityId: string,
    fileName?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const blob = await fetchPDF(type, entityId);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || `${type}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      const msg = err.message || 'Error al descargar el PDF';
      setError(msg);
      options?.onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [fetchPDF, options]);

  const previewPDF = useCallback(async (type: ReportType, entityId: string) => {
    const preview = window.open('about:blank', '_blank');
    if (!preview) { setError('Permite ventanas emergentes para abrir el PDF.'); return; }
    preview.opener = null;
    setLoading(true);
    setError(null);

    try {
      const blob = await fetchPDF(type, entityId);
      const url = URL.createObjectURL(blob);
      preview.location.href = url;

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      preview.close();
      const msg = err.message || 'Error al previsualizar el PDF';
      setError(msg);
      options?.onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [fetchPDF, options]);

  return { loading, error, downloadPDF, previewPDF };
}
