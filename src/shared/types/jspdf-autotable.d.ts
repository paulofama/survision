// ============================================================
// Augmentación de tipos: jsPDF + jspdf-autotable
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// `jspdf-autotable` (5.0.7) agrega `lastAutoTable` a la instancia de jsPDF en
// tiempo de ejecución, pero NO lo declara en sus tipos. Todo el proyecto lo lee
// para saber dónde terminó la última tabla y seguir dibujando desde ahí:
//
//     L.y = (doc as any).lastAutoTable.finalY + 5;
//
// Ese `as any` estaba repetido 27 veces en cinco generadores de PDF, y cada uno
// apagaba el chequeo de tipos sobre el `doc` entero en esa línea. Declararlo una
// sola vez acá los deja a todos tipados, y si algún día la librería cambia el
// nombre de la propiedad, falla la compilación en vez del PDF.
//
// La forma se corresponde con lo que el proyecto usa de verdad (`finalY`). El
// objeto trae más cosas, pero declarar sólo lo que se consume evita prometer
// una API que no verificamos.
// ============================================================

import 'jspdf';

declare module 'jspdf' {
  interface jsPDF {
    /**
     * Estado de la última tabla dibujada por `autoTable`. La propiedad la crea
     * el plugin: no existe hasta que se dibujó al menos una tabla.
     */
    lastAutoTable: {
      /** Coordenada Y (mm) donde terminó la tabla. */
      finalY: number;
    };
  }
}
