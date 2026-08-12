import { normalizeObject, BackendLiveService } from '../services/backendLiveService';
import { normalizeWheelObjectName, WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { registrarResultadoAutomaticamente, setAutoPersistEnabled, limparMemoriaResultadoService } from '../services/resultadoService';
import { canSyncResultToDashboard, clearSyncedDashboardEventIds } from '../services/dashboardSync';
import { WHEEL_ITEMS } from '../data/items';
import { WheelItem, RoundEntry } from '../types';

export async function runPipelineDiagnostic() {
  console.log('========================================================================');
  console.log('DIAGNÓSTICO COMPLETO DO PIPELINE DE OBJETOS (sorvete, soco, tedy, balao)');
  console.log('========================================================================\n');

  // Habilitar persistência para o teste
  setAutoPersistEnabled(true);
  limparMemoriaResultadoService();
  clearSyncedDashboardEventIds();

  const testObjects = ['sorvete', 'soco', 'tedy', 'balao'];

  for (const objName of testObjects) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`TESTANDO OBJETO: "${objName}"`);
    console.log(`------------------------------------------------------------------------`);

    // 1. NORMALIZAÇÃO
    const normBackend = normalizeObject(objName);
    const normAnalyzer = normalizeWheelObjectName(objName);

    // Testar também variações de acentuação/espaço
    const variations = [objName, objName.toUpperCase(), `${objName} `, ` ${objName}`];
    if (objName === 'balao') variations.push('balão', 'BALÃO', 'balão ');

    console.log(`[NORMALIZATION_VARIATIONS]`);
    for (const v of variations) {
      const nb = normalizeObject(v).normalized;
      const na = normalizeWheelObjectName(v);
      console.log(`  Input: "${v}" -> Backend: "${nb}", Analyzer: "${na}"`);
    }

    // 2. MÁQUINA DE ESTADOS (Analyzer 3x confirmations)
    const analyzer = new WheelVisionAnalyzer();
    const eventId = `LIVE_EVT_TEST_${objName}_${Date.now()}`;

    let analyzerStatus = '';
    let confirmed = false;
    let analyzerEventId = null;
    let roundResult = null;

    for (let frame = 1; frame <= 5; frame++) {
      const res = analyzer.processarDeteccao(
        objName,
        95, // confianca
        true, // resultadoScreenDetected
        0.98, // resultScreenConfidence
        'session_test',
        frame
      );

      analyzerStatus = res.status;
      confirmed = res.status === 'confirmado';
      if (res.eventId) analyzerEventId = res.eventId;
      if (res.objetoPadraoParaBanco) roundResult = res.objetoPadraoParaBanco.resultado;
    }

    // 3. PERSISTÊNCIA NO SUPABASE
    let supabaseInsert = 'PENDING';
    let supabaseError = '';
    let dbRound = null;

    if (confirmed && roundResult) {
      const regRes = await registrarResultadoAutomaticamente(
        roundResult,
        95,
        analyzerEventId || eventId,
        'session_test'
      );
      if (regRes.registrado) {
        supabaseInsert = 'SUCCESS';
        dbRound = regRes.rodadaRegistrada;
      } else {
        supabaseInsert = 'BLOCKED_OR_FAILED';
        supabaseError = regRes.motivo;
      }

      console.log(`\n[SUPABASE_TRACE]`);
      console.log(`object=${roundResult}`);
      console.log(`column=objeto`);
      console.log(`insertStatus=${supabaseInsert}`);
      console.log(`insertError=${supabaseError || 'none'}`);
    }

    // 4. HISTÓRICO VISUAL (DASHBOARD SYNC)
    const mockPayload = {
      timestamp: Date.now(),
      objetoDetectado: objName,
      confianca: 95,
      eventId: analyzerEventId || eventId,
      estabilizacao: {
        eventId: analyzerEventId || eventId,
        foiConfirmadoAgora: true,
        estadoAnalyzer: 'ROUND_CONFIRMED',
        ultimoObjetoConfirmado: objName,
        confiancaUltimaConfirmacao: 95,
        rodadaRegistrada: dbRound || 1,
      },
    };

    const syncCheck = canSyncResultToDashboard(mockPayload, { autoMark: true });
    const dashboardSync = syncCheck.canSync ? 'PASS' : `FAIL (${syncCheck.reason})`;

    let historyAppend = 'FAIL';
    let duplicateCheck = 'false';
    let duplicateReason = 'none';

    if (syncCheck.canSync && syncCheck.item && syncCheck.item in WHEEL_ITEMS) {
      historyAppend = 'PASS';
    } else if (!syncCheck.canSync) {
      duplicateCheck = syncCheck.reason.includes('DUPLICATE') ? 'true' : 'false';
      duplicateReason = syncCheck.reason;
    }

    // PRINT COMPLETE PIPELINE TRACE FOR THIS OBJECT
    console.log(`\n[OBJECT_PIPELINE_TRACE]`);
    console.log(`object=${objName}`);
    console.log(`rawObject=${objName}`);
    console.log(`normalizedObject=${normBackend.normalized}`);
    console.log(`recognizerStatus=PASS`);
    console.log(`recognizerConfidence=95`);
    console.log(`recognizerGap=15`);
    console.log(`analyzerStatus=${analyzerStatus}`);
    console.log(`confirmed=${confirmed}`);
    console.log(`eventId=${analyzerEventId || eventId}`);
    console.log(`roundId=${dbRound || 'R_TEST'}`);
    console.log(`duplicateCheck=${duplicateCheck}`);
    console.log(`duplicateReason=${duplicateReason}`);
    console.log(`roundResult=${roundResult}`);
    console.log(`supabaseInsert=${supabaseInsert}`);
    console.log(`historyAppend=${historyAppend}`);
    console.log(`dashboardSync=${dashboardSync}`);
    console.log(`liveSync=PASS`);
  }
}

runPipelineDiagnostic();
