import { canSyncResultToDashboard, clearSyncedDashboardEventIds } from '../src/services/dashboardService';
import { LiveResultPayload } from '../src/types/live';

console.log('=== TESTES DE SINCRONIZAÇÃO DA DASHBOARD ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASSED: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAILED: ${testName}`);
  }
}

// Reset state before tests
clearSyncedDashboardEventIds();

// Helper to build typed stabilization info for testing
function mockStabilization(partial: any): any {
  return {
    candidatoAtual: null,
    confirmacoesConsecutivas: 0,
    confirmacoesNecessarias: 3,
    minConfidence: 85,
    foiConfirmadoAgora: false,
    ultimoObjetoConfirmado: null,
    horarioUltimaConfirmacao: null,
    confiancaUltimaConfirmacao: null,
    totalRodadasDetectadasSessao: 0,
    ...partial,
  };
}

// 1. Resultado confirmado com ROUND_CONFIRMED -> Deve sincronizar
const evt1Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'boia',
  confianca: 92,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'boia',
    confirmacoesConsecutivas: 3,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: true,
    ultimoObjetoConfirmado: 'boia',
    horarioUltimaConfirmacao: Date.now(),
    confiancaUltimaConfirmacao: 92,
    totalRodadasDetectadasSessao: 1,
    eventId: 'evt_test_001',
  }),
};

const check1 = canSyncResultToDashboard(evt1Payload, { autoMark: true });
assert(check1.canSync === true && check1.item === 'boia' && check1.eventId === 'evt_test_001', '1. Resultado com ROUND_CONFIRMED e 92% conf e eventId novo -> sincroniza');

// 2. Duplicado com o mesmo eventId -> Deve bloquear por duplicidade (idempotência)
const check2 = canSyncResultToDashboard(evt1Payload, { autoMark: false });
assert(check2.canSync === false && check2.reason === 'DUPLICATE_EVENT_ID', '2. Segundo envio do mesmo eventId (evt_test_001) -> bloqueado por duplicidade');

// 3. Candidato em análise (não confirmado) -> Deve bloquear
const evt3Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'balao',
  confianca: 90,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'balao',
    confirmacoesConsecutivas: 1,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: false,
    eventId: 'evt_test_002',
  }),
};

const check3 = canSyncResultToDashboard(evt3Payload, { autoMark: false });
assert(check3.canSync === false && check3.reason === 'NOT_CONFIRMED_BY_ANALYZER', '3. Candidato em análise (foiConfirmadoAgora = false) -> bloqueado');

// 4. Resultado com confiança baixa (<85%) -> Deve bloquear
const evt4Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'soco',
  confianca: 75,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'soco',
    confirmacoesConsecutivas: 3,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: true,
    confiancaUltimaConfirmacao: 75,
    eventId: 'evt_test_003',
  }),
};

const check4 = canSyncResultToDashboard(evt4Payload, { autoMark: false });
assert(check4.canSync === false && check4.reason === 'LOW_CONFIDENCE', '4. Resultado com confiança < 85% -> bloqueado');

// 5. Novo eventId válido com item permitido -> Deve sincronizar
const evt5Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'tedy',
  confianca: 95,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'tedy',
    confirmacoesConsecutivas: 3,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: true,
    ultimoObjetoConfirmado: 'tedy',
    horarioUltimaConfirmacao: Date.now(),
    confiancaUltimaConfirmacao: 95,
    totalRodadasDetectadasSessao: 2,
    eventId: 'evt_test_004',
  }),
};

const check5 = canSyncResultToDashboard(evt5Payload, { autoMark: true });
assert(check5.canSync === true && check5.item === 'tedy' && check5.eventId === 'evt_test_004', '5. Novo eventId válido (evt_test_004) com item permitido "tedy" -> sincroniza');

// 6. Teste simulado confirmado -> Deve sincronizar
const evt6Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'princesa',
  confianca: 90,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'princesa',
    confirmacoesConsecutivas: 3,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: true,
    ultimoObjetoConfirmado: 'princesa',
    confiancaUltimaConfirmacao: 90,
    eventId: 'evt_simulated_001',
  }),
};

const check6 = canSyncResultToDashboard(evt6Payload, { autoMark: true });
assert(check6.canSync === true && check6.item === 'princesa' && check6.eventId === 'evt_simulated_001', '6. Teste simulado confirmado com "princesa" -> sincroniza');

// 7. Objeto não permitido na roda -> Deve bloquear
const evt7Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'desconhecido',
  confianca: 90,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'desconhecido',
    confirmacoesConsecutivas: 3,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: true,
    eventId: 'evt_test_005',
  }),
};

const check7 = canSyncResultToDashboard(evt7Payload, { autoMark: false });
assert(check7.canSync === false && check7.reason === 'INVALID_OBJECT', '7. Objeto inválido -> bloqueado');

// 8. Payload sem eventId -> Deve bloquear
const evt8Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'boia',
  confianca: 88,
  timestamp: Date.now(),
};

const check8 = canSyncResultToDashboard(evt8Payload, { autoMark: false });
assert(check8.canSync === false && check8.reason === 'MISSING_EVENT_ID', '8. Payload sem eventId -> bloqueado');

// 9. Evento com motivoEstabilizacao de Descarte -> Deve bloquear
const evt9Payload: LiveResultPayload = {
  sucesso: true,
  objetoDetectado: 'camera',
  confianca: 90,
  timestamp: Date.now(),
  estabilizacao: mockStabilization({
    candidatoAtual: 'camera',
    confirmacoesConsecutivas: 3,
    confirmacoesNecessarias: 3,
    foiConfirmadoAgora: true,
    motivoEstabilizacao: 'Descartado: Fora da Tela de Resultado.',
    eventId: 'evt_test_006',
  }),
};

const check9 = canSyncResultToDashboard(evt9Payload, { autoMark: false });
assert(check9.canSync === false && check9.reason === 'ANALYZER_DISCARDED', '9. Motivo de descarte pelo analyzer -> bloqueado');

// 10. Sequência de eventIds distintos (evt_seq_1, evt_seq_2) -> Ambos sincronizam na ordem
clearSyncedDashboardEventIds();
const seq1 = canSyncResultToDashboard({
  sucesso: true,
  objetoDetectado: 'coroa',
  confianca: 91,
  estabilizacao: { foiConfirmadoAgora: true, eventId: 'evt_seq_1', ultimoObjetoConfirmado: 'coroa', confiancaUltimaConfirmacao: 91 }
}, { autoMark: true });

const seq2 = canSyncResultToDashboard({
  sucesso: true,
  objetoDetectado: 'sorvete',
  confianca: 94,
  estabilizacao: { foiConfirmadoAgora: true, eventId: 'evt_seq_2', ultimoObjetoConfirmado: 'sorvete', confiancaUltimaConfirmacao: 94 }
}, { autoMark: true });

assert(seq1.canSync === true && seq2.canSync === true && seq1.item === 'coroa' && seq2.item === 'sorvete', '10. Sequência de eventIds distintos (evt_seq_1, evt_seq_2) -> ambos sincronizam em ordem');

console.log(`\nRESULTADO DOS TESTES: ${passedTests}/${totalTests} aprovados.`);
if (passedTests === totalTests) {
  console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
} else {
  process.exit(1);
}
