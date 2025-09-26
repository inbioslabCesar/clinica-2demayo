import { useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';

export const usePrintHistoriaClinica = () => {
  const componentRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: 'Historia Clínica',
    onBeforeGetContent: useCallback(() => {
      return new Promise((resolve) => {
        // Pequeño delay para asegurar que el contenido esté listo
        setTimeout(resolve, 100);
      });
    }, []),
    pageStyle: `
      @page {
        size: A4;
        margin: 10mm;
      }
      
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          color-adjust: exact;
        }
        
        .print\\:shadow-none {
          box-shadow: none !important;
        }
        
        .print\\:max-w-none {
          max-width: none !important;
        }
        
        .no-print {
          display: none !important;
        }
        
        /* Colores de fondo para impresión */
        .bg-blue-50, .bg-yellow-50, .bg-green-50, 
        .bg-purple-50, .bg-orange-50, .bg-teal-50, 
        .bg-red-50, .bg-indigo-50 {
          background-color: #f8f9fa !important;
          border: 1px solid #dee2e6 !important;
        }
        
        /* Asegurar que los bordes se impriman */
        .border, .border-b, .border-t-2 {
          border-color: #6c757d !important;
        }
        
        /* Mejorar legibilidad de texto */
        .text-gray-600, .text-gray-800 {
          color: #333 !important;
        }
      }
    `
  });

  return { componentRef, handlePrint };
};

export const usePrintLaboratorio = () => {
  const componentRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: 'Orden de Laboratorio',
    onBeforeGetContent: useCallback(() => {
      return new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }, []),
    pageStyle: `
      @page {
        size: A4;
        margin: 15mm;
      }
      
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          color-adjust: exact;
          font-family: 'Times New Roman', serif;
        }
        
        .no-print {
          display: none !important;
        }
        
        .print\\:border-black {
          border-color: black !important;
        }
        
        .print\\:text-black {
          color: black !important;
        }
      }
    `
  });

  return { componentRef, handlePrint };
};

export const usePrintReceta = () => {
  const componentRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: 'Receta Médica',
    onBeforeGetContent: useCallback(() => {
      return new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }, []),
    pageStyle: `
      @page {
        size: A4;
        margin: 15mm;
      }
      
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          color-adjust: exact;
          font-family: 'Times New Roman', serif;
        }
        
        .no-print {
          display: none !important;
        }
        
        .print\\:border-black {
          border-color: black !important;
        }
        
        .print\\:text-black {
          color: black !important;
        }
      }
    `
  });

  return { componentRef, handlePrint };
};