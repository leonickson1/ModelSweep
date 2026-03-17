'use client';

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  FileText,
  Image,
  FileJson,
  FileSpreadsheet,
  FileType,
  Loader2,
} from 'lucide-react';

interface ExportReportProps {
  runId: string;
  contentRef: RefObject<HTMLDivElement>;
}

type ExportFormat = 'pdf' | 'png' | 'md' | 'json' | 'csv';

export function ExportReport({ runId, contentRef }: ExportReportProps) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState<ExportFormat | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const shortId = runId.slice(0, 8);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [open]);

  const captureCanvas = useCallback(async () => {
    if (!contentRef.current) {
      throw new Error('Content element not found');
    }

    const html2canvas = (await import('html2canvas')).default;

    return html2canvas(contentRef.current, {
      scale: 2,
      backgroundColor: '#09090b',
      useCORS: true,
      logging: false,
    });
  }, [contentRef]);

  const handlePDF = useCallback(async () => {
    setGenerating('pdf');
    setOpen(false);

    try {
      const canvas = await captureCanvas();
      const { jsPDF } = await import('jspdf');

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`modelsweep-${shortId}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setGenerating(null);
    }
  }, [captureCanvas, shortId]);

  const handlePNG = useCallback(async () => {
    setGenerating('png');
    setOpen(false);

    try {
      const canvas = await captureCanvas();
      const link = document.createElement('a');
      link.download = `modelsweep-${shortId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      setGenerating(null);
    }
  }, [captureCanvas, shortId]);

  const handleAPIExport = useCallback(
    (format: 'md' | 'json' | 'csv') => {
      setOpen(false);
      const link = document.createElement('a');
      link.href = `/api/results/${runId}/export?format=${format}`;
      link.download = `modelsweep-${shortId}.${format}`;
      link.click();
    },
    [runId, shortId]
  );

  const items: {
    label: string;
    format: ExportFormat;
    icon: typeof Download;
    action: () => void;
  }[] = [
    { label: 'Download as PDF', format: 'pdf', icon: FileText, action: handlePDF },
    { label: 'Download as PNG', format: 'png', icon: Image, action: handlePNG },
    {
      label: 'Download as Markdown',
      format: 'md',
      icon: FileType,
      action: () => handleAPIExport('md'),
    },
    {
      label: 'Download as JSON',
      format: 'json',
      icon: FileJson,
      action: () => handleAPIExport('json'),
    },
    {
      label: 'Download as CSV',
      format: 'csv',
      icon: FileSpreadsheet,
      action: () => handleAPIExport('csv'),
    },
  ];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={generating !== null}
        className={
          'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ' +
          'bg-white/5 text-zinc-300 border border-white/[0.08] hover:bg-white/10 hover:text-zinc-100 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ' +
          'disabled:opacity-40 disabled:cursor-not-allowed'
        }
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating...</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span>Export</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={
              'absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl ' +
              'bg-zinc-900 border border-white/10 shadow-xl shadow-black/40'
            }
          >
            <div className="py-1">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.format}
                    onClick={item.action}
                    className={
                      'flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 ' +
                      'hover:bg-white/5 hover:text-zinc-100 transition-colors text-left'
                    }
                  >
                    <Icon className="h-4 w-4 text-zinc-500" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
