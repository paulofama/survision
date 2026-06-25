// ============================================
// RECETARIO MÉDICO — Herramientas
// Sistema Integral de Gestión - Survisión S.A.
// ============================================
//
// Embebe el recetario médico (public/recetario.html) en un iframe aislado.
// Se integra como app standalone para que la impresión (A4 landscape, muy
// afinada) salga idéntica al original, sin interferir con el CSS de la app.
// ============================================

import React from 'react';

const RecetarioPage: React.FC = () => {
  return (
    <div className="w-full" style={{ height: 'calc(100vh - 90px)' }}>
      <iframe
        src="/recetario.html"
        title="Recetario Médico"
        className="w-full h-full rounded-xl border border-gray-200 bg-white shadow-sm"
      />
    </div>
  );
};

export default RecetarioPage;
