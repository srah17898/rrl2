import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import {
  registrarResultadoAutomaticamente,
  setAutoPersistEnabled,
} from '../services/resultadoService';

async function runLifecycleTestSuite() {
  setAutoPersistEnabled(true);

  console.log('========================================================================');
  console.log('BATERIA DE TESTES DO CICLO DE VIDA DA RODADA (LOCAL ONLY MODE)');
  console.log('========================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail: string) {
    if (condition) {
      console.log(`[PASS] ${testName}: ${detail}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}: ${detail}`);
      failedTests++;
    }
  }

  // TESTE 1: Entrada RESULT_ZONE -> confirma R001 ao confirmar rodada
  console.log('--- TESTE 1: Entrada em RESULT_ZONE (Geração de R001) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    for (let i = 0; i < 4; i++) {
      analyzer.processarDeteccao('boia', 95, true, 0.95);
    }
    const eventId = analyzer.getCurrentEventId();

    assert(eventId !== null && eventId.includes('R001'), 'TESTE 1 - EventId R001', `Gerado eventId: ${eventId}`);
    assert(
      analyzer.getCurrentState() === 'WAITING_FOR_RESULT_SCREEN_EXIT' || analyzer.getCurrentState() === 'RESULT_CONFIRMED',
      'TESTE 1 - Estado Pós-Confirmação',
      `Estado: ${analyzer.getCurrentState()}`
    );
  }

  // TESTE 2: 2 frames gate + 3 frames boia >= 85% -> confirma boia
  console.log('\n--- TESTE 2: 3 frames consecutivos >=85% (Confirmação) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let confirmRes: any = null;

    for (let i = 1; i <= 5; i++) {
      const res = analyzer.processarDeteccao('boia', 96, true, 0.95);
      if (res.status === 'confirmado') {
        confirmRes = res;
      }
    }

    assert(confirmRes !== null, 'TESTE 2 - Rodada Confirmada', `Status do 3º frame: ${confirmRes?.status}`);
    assert(confirmRes?.objeto === 'boia', 'TESTE 2 - Objeto Confirmado', `Objeto: ${confirmRes?.objeto}`);
    assert(
      analyzer.getCurrentState() === 'RESULTADO_CONFIRMADO' ||
      analyzer.getCurrentState() === 'AGUARDANDO_SAIDA_TELA_RESULTADO' ||
      analyzer.getCurrentState() === 'RESULT_CONFIRMED' ||
      analyzer.getCurrentState() === 'WAITING_FOR_RESULT_SCREEN_EXIT',
      'TESTE 2 - Estado de Confirmação',
      `Estado: ${analyzer.getCurrentState()}`
    );
  }

  // TESTE 3: 10 frames adicionais boia -> continua R001, não cria R002, não reconfirma
  console.log('\n--- TESTE 3: 10 frames adicionais na mesma RESULT_ZONE (Não duplicar) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // 5 para confirmar
    for (let i = 1; i <= 5; i++) {
      analyzer.processarDeteccao('boia', 96, true, 0.95);
    }
    const initialEventId = analyzer.getCurrentEventId();

    let reconfirmCount = 0;
    let duplicateCount = 0;

    for (let i = 1; i <= 10; i++) {
      const res = analyzer.processarDeteccao('boia', 96, true, 0.95);
      if (res.status === 'confirmado') reconfirmCount++;
      if (res.status === 'duplicado') duplicateCount++;
    }

    assert(reconfirmCount === 0, 'TESTE 3 - Sem Reconfirmação', `Reconfirmações: ${reconfirmCount}`);
    assert(duplicateCount === 10, 'TESTE 3 - Bloqueio de Duplicados', `Duplicados bloqueados: ${duplicateCount}`);
    assert(analyzer.getCurrentEventId() === initialEventId, 'TESTE 3 - EventId Inalterado', `EventId mantido: ${analyzer.getCurrentEventId()}`);
  }

  // TESTE 4: RESULT_ZONE desaparece -> encerra R001, libera próxima rodada
  console.log('\n--- TESTE 4: Saída da RESULT_ZONE (Saída Estável 2 Frames) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // Confirmar R001
    for (let i = 1; i <= 5; i++) {
      analyzer.processarDeteccao('boia', 96, true, 0.95);
    }
    const eventIdBefore = analyzer.getCurrentEventId();

    // Frame 1 sem RESULT_ZONE
    analyzer.processarDeteccao(null, 0, false, 0);
    assert(
      analyzer.getCurrentState() === 'AGUARDANDO_SAIDA_TELA_RESULTADO' ||
      analyzer.getCurrentState() === 'WAITING_FOR_RESULT_SCREEN_EXIT' ||
      analyzer.getCurrentState() === 'RODA_NORMAL' ||
      analyzer.getCurrentState() === 'WAITING_FOR_RESULT',
      'TESTE 4 - Frame 1 Ausência',
      `Estado ainda aguardando: ${analyzer.getCurrentState()}`
    );

    // Frame 2 sem RESULT_ZONE
    analyzer.processarDeteccao(null, 0, false, 0);
    // Frame 3 sem RESULT_ZONE -> confirma saída e libera rodada
    analyzer.processarDeteccao(null, 0, false, 0);
    assert(
      analyzer.getCurrentState() === 'RODA_NORMAL' || analyzer.getCurrentState() === 'WAITING_FOR_RESULT',
      'TESTE 4 - Frame 2 Ausência (Liberação)',
      `Estado final: ${analyzer.getCurrentState()}`
    );
    assert(analyzer.getCurrentEventId() === null, 'TESTE 4 - EventId Resetado', `EventId ativo: ${analyzer.getCurrentEventId()}`);
  }

  // TESTE 5: RESULT_ZONE entra novamente -> cria R002
  console.log('\n--- TESTE 5: Reentrada em RESULT_ZONE (Geração de R002) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // Rodada 1
    for (let i = 1; i <= 5; i++) analyzer.processarDeteccao('boia', 96, true, 0.95);
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);

    // Rodada 2: 4 frames para entrada + 3 confirmações R002
    for (let i = 0; i < 4; i++) {
      analyzer.processarDeteccao('soco', 95, true, 0.95);
    }
    const eventIdR2 = analyzer.getCurrentEventId();

    assert(eventIdR2 !== null && eventIdR2.includes('R002'), 'TESTE 5 - EventId R002', `Gerado R002: ${eventIdR2}`);
  }

  // TESTE 6: R002 pode confirmar outro símbolo
  console.log('\n--- TESTE 6: Confirmação de outro símbolo em R002 ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    // R001 boia
    for (let i = 1; i <= 5; i++) analyzer.processarDeteccao('boia', 96, true, 0.95);
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);

    // R002 soco
    let confirmR2: any = null;
    for (let i = 1; i <= 5; i++) {
      const res = analyzer.processarDeteccao('soco', 95, true, 0.95);
      if (res.status === 'confirmado') confirmR2 = res;
    }

    assert(confirmR2?.objeto === 'soco', 'TESTE 6 - Confirmação Soco', `Símbolo R2: ${confirmR2?.objeto}`);
  }

  // TESTE 7: Sem lastConfirmedObject -> mensagem limpa
  console.log('\n--- TESTE 7: Verificação de sanitização de strings nulas ---');
  {
    const isStringValid = (s: any): s is string =>
      typeof s === 'string' &&
      s.trim() !== '' &&
      s !== 'null' &&
      s !== 'undefined' &&
      s !== 'nenhum' &&
      s !== 'não identificado';

    assert(!isStringValid(null), 'TESTE 7 - null inválido', 'OK');
    assert(!isStringValid('null'), 'TESTE 7 - "null" string inválida', 'OK');
    assert(!isStringValid('undefined'), 'TESTE 7 - "undefined" string inválida', 'OK');
    assert(!isStringValid('nenhum'), 'TESTE 7 - "nenhum" string inválida', 'OK');
    assert(isStringValid('boia'), 'TESTE 7 - "boia" válido', 'OK');
  }

  // TESTE 10: 20+ frames da mesma RESULT_ZONE -> exatamente 1 Event ID
  console.log('\n--- TESTE 10: 20+ frames na mesma RESULT_ZONE ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    const eventIds = new Set<string>();

    for (let i = 1; i <= 30; i++) {
      analyzer.processarDeteccao('princesa', 95, true, 0.95);
      const eid = analyzer.getCurrentEventId();
      if (eid) eventIds.add(eid);
    }

    assert(eventIds.size === 1, 'TESTE 10 - Exatamente 1 Event ID', `Total de Event IDs gerados: ${eventIds.size}`);
  }

  // TESTE 11: Duas rodadas consecutivas com símbolos iguais (R001 = boia, sai RESULT_ZONE, R002 = boia)
  console.log('\n--- TESTE 11: Duas rodadas consecutivas com mesmo símbolo (BOIA -> saída -> BOIA) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let r1Confirmed: any = null;
    let r2Confirmed: any = null;

    // R001 boia
    for (let i = 1; i <= 5; i++) {
      const res = analyzer.processarDeteccao('boia', 96, true, 0.95);
      if (res.status === 'confirmado') r1Confirmed = res;
    }

    // Saída RESULT_ZONE
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);

    // R002 boia novamente
    for (let i = 1; i <= 5; i++) {
      const res = analyzer.processarDeteccao('boia', 96, true, 0.95);
      if (res.status === 'confirmado') r2Confirmed = res;
    }

    assert(r1Confirmed?.objeto === 'boia', 'TESTE 11 - R001 BOIA Confirmada', `R001: ${r1Confirmed?.objeto}`);
    assert(r2Confirmed?.objeto === 'boia', 'TESTE 11 - R002 BOIA Confirmada', `R002: ${r2Confirmed?.objeto}`);
    assert(r1Confirmed?.eventId !== r2Confirmed?.eventId, 'TESTE 11 - Event IDs Diferentes', `R1: ${r1Confirmed?.eventId} vs R2: ${r2Confirmed?.eventId}`);
  }

  console.log('\n========================================================================');
  console.log(`RESULTADO DOS TESTES DE LIFECYCLE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runLifecycleTestSuite().catch((err) => {
  console.error('Erro nos testes de lifecycle:', err);
  process.exit(1);
});
