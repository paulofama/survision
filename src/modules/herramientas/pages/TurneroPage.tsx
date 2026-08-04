// ============================================
// TURNERO — Herramientas
// Sistema de Gestión Integral - Survisión S.A.
// ============================================
//
// Embebe el turnero (public/turnero.html) en un iframe aislado. Las secretarias
// lo usan para imprimir y recortar el comprobante de fecha/hora del turno del
// paciente. Se integra como app standalone para que la impresión salga idéntica
// al original, sin interferir con el CSS de la app.
// ============================================

import React from 'react';

const TurneroPage: React.FC = () => {
  return (
    <div className="w-full" style={{ height: 'calc(100vh - 90px)' }}>
      <iframe
        src="/turnero.html"
        title="Turnero"
        className="w-full h-full rounded-xl border border-gray-200 bg-white shadow-sm"
      />
    </div>
  );
};

export default TurneroPage;
