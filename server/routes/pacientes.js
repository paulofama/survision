// ============================================
// RUTAS DE PACIENTES - BÚSQUEDA POR DNI
// Sistema de Costos - Instituto Dr. Mercado
// Fuente: GECLISA (Ficha + FichaPlan + ObrasSociales)
// v1.2 - Fallback a MovEnca para OS + mejor logging
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery, sql } = require('../config/database');

// ============================================
// GET /api/pacientes/buscar-dni/:dni
// Busca paciente por número de documento
// Retorna datos personales + obra social + afiliado
// Estrategia OS: FichaPlan → MovEnca (última atención)
// ============================================

router.get('/buscar-dni/:dni', async (req, res) => {
  try {
    const { dni } = req.params;

    // Validar que el DNI tenga al menos 6 dígitos
    if (!dni || dni.trim().length < 6) {
      return res.status(400).json({
        error: 'DNI inválido',
        message: 'El documento debe tener al menos 6 dígitos'
      });
    }

    const dniLimpio = dni.trim().replace(/\D/g, ''); // Solo números

    console.log(`🔍 Buscando paciente con DNI: ${dniLimpio}`);

    // ── QUERY PRINCIPAL ──
    // Busca paciente + OS desde FichaPlan (plan más reciente)
    // Si FichaPlan no tiene OS, hace fallback a la última atención en MovEnca
    const query = `
      SELECT TOP 1
        f.Ficha_id,
        RTRIM(LTRIM(f.fic_ape)) AS apellido,
        RTRIM(LTRIM(f.fic_nombre)) AS nombre,
        RTRIM(LTRIM(f.fic_nrodoc)) AS documento,
        RTRIM(LTRIM(ISNULL(f.fic_cel, f.fic_tele))) AS telefono,
        f.fic_fechanac AS fechaNacimiento,
        RTRIM(LTRIM(ISNULL(f.fic_email, ''))) AS email,

        -- OS desde FichaPlan (fuente primaria)
        os_fp.os_id AS fp_os_id,
        RTRIM(LTRIM(os_fp.os_nombre)) AS fp_obraSocial,
        RTRIM(LTRIM(os_fp.os_sigla)) AS fp_obraSocialSigla,
        os_fp.esParticular AS fp_esParticular,
        RTRIM(LTRIM(ISNULL(fp.Nro_Afiliado, ''))) AS fp_numeroAfiliado,
        ISNULL(p_fp.plan_nombre, '') AS fp_planNombre,

        -- OS desde MovEnca - última atención (fallback)
        os_me.os_id AS me_os_id,
        RTRIM(LTRIM(os_me.os_nombre)) AS me_obraSocial,
        RTRIM(LTRIM(os_me.os_sigla)) AS me_obraSocialSigla,
        os_me.esParticular AS me_esParticular,
        RTRIM(LTRIM(ISNULL(me_last.Nro_Afiliado, ''))) AS me_numeroAfiliado,
        ISNULL(p_me.plan_nombre, '') AS me_planNombre,
        me_last.Me_Fecha AS me_ultimaAtencion

      FROM Ficha f

      -- Fuente 1: FichaPlan (prioriza plan NO particular, luego el más reciente)
      LEFT JOIN (
        SELECT 
          fp2.Ficha_id, fp2.Plan_id, fp2.Nro_Afiliado,
          ROW_NUMBER() OVER (
            PARTITION BY fp2.Ficha_id 
            ORDER BY 
              CASE WHEN os_chk.esParticular = 1 OR os_chk.esParticular IS NULL THEN 1 ELSE 0 END,
              fp2.FicPlan_id DESC
          ) AS rn
        FROM FichaPlan fp2
        LEFT JOIN Planes p_chk ON fp2.Plan_id = p_chk.plan_id
        LEFT JOIN ObrasSociales os_chk ON p_chk.os_id = os_chk.os_id
      ) fp ON f.Ficha_id = fp.Ficha_id AND fp.rn = 1
      LEFT JOIN Planes p_fp ON fp.Plan_id = p_fp.plan_id
      LEFT JOIN ObrasSociales os_fp ON p_fp.os_id = os_fp.os_id

      -- Fuente 2: MovEnca (última atención con OS)
      LEFT JOIN (
        SELECT 
          me2.Ficha_id, me2.Os_id, me2.Plan_id, me2.Nro_Afiliado, me2.Me_Fecha,
          ROW_NUMBER() OVER (PARTITION BY me2.Ficha_id ORDER BY me2.Me_Fecha DESC, me2.Me_id DESC) AS rn
        FROM MovEnca me2
        WHERE me2.Os_id IS NOT NULL AND me2.Os_id > 0
      ) me_last ON f.Ficha_id = me_last.Ficha_id AND me_last.rn = 1
      LEFT JOIN Planes p_me ON me_last.Plan_id = p_me.plan_id
      LEFT JOIN ObrasSociales os_me ON me_last.Os_id = os_me.os_id

      WHERE TRY_CAST(f.fic_nrodoc AS bigint) = TRY_CAST(@dni AS bigint)
      ORDER BY f.Ficha_id DESC
    `;

    const result = await executeQuery(query, { dni: dniLimpio });

    if (result.recordset.length === 0) {
      console.log(`⚠️ Paciente no encontrado: ${dniLimpio}`);
      return res.status(404).json({
        encontrado: false,
        message: 'Paciente no encontrado en GECLISA'
      });
    }

    const pac = result.recordset[0];

    // ── Normalizar texto: MAYÚSCULAS → Title Case ──
    const toTitleCase = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str
        .trim()
        .toLowerCase()
        .replace(/(?:^|\s|[-/.(])\S/g, (char) => char.toUpperCase());
    };

    // Obra Social se mantiene en MAYÚSCULAS (es nombre institucional/sigla)
    const toUpperTrim = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str.trim().toUpperCase();
    };

    // ── Determinar la mejor fuente de OS ──
    // Prioridad: FichaPlan (si tiene OS no particular) → MovEnca → Particular
    let obraSocial = '';
    let obraSocialSigla = '';
    let esParticular = true;
    let numeroAfiliado = '';
    let planNombre = '';
    let fuenteOS = 'ninguna';

    // Intentar FichaPlan primero
    if (pac.fp_os_id && pac.fp_esParticular !== true && pac.fp_esParticular !== 1) {
      obraSocial = pac.fp_obraSocial || '';
      obraSocialSigla = pac.fp_obraSocialSigla || '';
      esParticular = false;
      numeroAfiliado = pac.fp_numeroAfiliado || '';
      planNombre = pac.fp_planNombre || '';
      fuenteOS = 'FichaPlan';
    }
    // Fallback a MovEnca
    else if (pac.me_os_id && pac.me_esParticular !== true && pac.me_esParticular !== 1) {
      obraSocial = pac.me_obraSocial || '';
      obraSocialSigla = pac.me_obraSocialSigla || '';
      esParticular = false;
      numeroAfiliado = pac.me_numeroAfiliado || '';
      planNombre = pac.me_planNombre || '';
      fuenteOS = 'MovEnca';
    }
    // FichaPlan tiene OS pero es Particular
    else if (pac.fp_os_id) {
      obraSocial = pac.fp_obraSocial || 'Particular';
      obraSocialSigla = pac.fp_obraSocialSigla || '';
      esParticular = true;
      fuenteOS = 'FichaPlan (Particular)';
    }
    // MovEnca tiene OS pero es Particular  
    else if (pac.me_os_id) {
      obraSocial = pac.me_obraSocial || 'Particular';
      obraSocialSigla = pac.me_obraSocialSigla || '';
      esParticular = true;
      fuenteOS = 'MovEnca (Particular)';
    }
    // Sin ninguna OS
    else {
      obraSocial = 'Particular';
      esParticular = true;
      fuenteOS = 'Sin registros OS';
    }

    // Formatear fecha de nacimiento a YYYY-MM-DD
    let fechaNacFormatted = '';
    if (pac.fechaNacimiento) {
      const fecha = new Date(pac.fechaNacimiento);
      fechaNacFormatted = fecha.toISOString().split('T')[0];
    }

    const respuesta = {
      encontrado: true,
      fuente: 'GECLISA',
      paciente: {
        fichaId: pac.Ficha_id,
        apellido: toTitleCase(pac.apellido),
        nombre: toTitleCase(pac.nombre),
        documento: (pac.documento || dniLimpio).trim(),
        telefono: (pac.telefono || '').trim(),
        fechaNacimiento: fechaNacFormatted,
        email: (pac.email || '').trim().toLowerCase(),
        obraSocial: esParticular ? '' : toUpperTrim(obraSocial),
        obraSocialSigla: toUpperTrim(obraSocialSigla),
        numeroAfiliado: (numeroAfiliado || '').trim(),
        planNombre: toUpperTrim(planNombre),
        esParticular: esParticular
      },
      _debug: {
        fuenteOS: fuenteOS,
        fp_os_id: pac.fp_os_id || null,
        fp_obraSocial: pac.fp_obraSocial || null,
        fp_esParticular: pac.fp_esParticular,
        me_os_id: pac.me_os_id || null,
        me_obraSocial: pac.me_obraSocial || null,
        me_esParticular: pac.me_esParticular,
        me_ultimaAtencion: pac.me_ultimaAtencion || null
      }
    };

    console.log(`✅ Paciente: ${respuesta.paciente.apellido}, ${respuesta.paciente.nombre}`);
    console.log(`   📋 OS fuente: ${fuenteOS}`);
    console.log(`   🏥 OS: ${obraSocial || 'Particular'} | Plan: ${planNombre || '-'} | Afiliado: ${numeroAfiliado || '-'}`);
    if (pac.me_ultimaAtencion) {
      console.log(`   📅 Última atención: ${new Date(pac.me_ultimaAtencion).toLocaleDateString('es-AR')}`);
    }

    res.json(respuesta);

  } catch (error) {
    console.error('❌ Error buscando paciente:', error.message);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

// ============================================
// GET /api/pacientes/buscar/:termino
// Búsqueda por apellido (para autocompletado)
// ============================================

router.get('/buscar/:termino', async (req, res) => {
  try {
    const { termino } = req.params;

    if (!termino || termino.trim().length < 3) {
      return res.status(400).json({
        error: 'Término muy corto',
        message: 'Ingrese al menos 3 caracteres'
      });
    }

    const query = `
      SELECT TOP 10
        f.Ficha_id,
        RTRIM(LTRIM(f.fic_ape)) AS apellido,
        RTRIM(LTRIM(f.fic_nombre)) AS nombre,
        RTRIM(LTRIM(f.fic_nrodoc)) AS documento,
        RTRIM(LTRIM(ISNULL(f.fic_cel, ''))) AS telefono
      FROM Ficha f
      WHERE f.fic_ape LIKE @termino + '%'
         OR f.fic_nombre LIKE @termino + '%'
         OR f.fic_nrodoc LIKE '%' + @termino + '%'
      ORDER BY f.fic_ape, f.fic_nombre
    `;

    const result = await executeQuery(query, { termino: termino.trim() });

    res.json({
      resultados: result.recordset,
      total: result.recordset.length
    });

  } catch (error) {
    console.error('❌ Error buscando pacientes:', error.message);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

module.exports = router;
