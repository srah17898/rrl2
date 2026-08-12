import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import {
  registrarResultadoAutomaticamente,
  setAutoPersistEnabled,
} from '../services/resultadoService';

async function runDeduplicationTestSuite() {
  setAutoPersistEnabled(true);

  console.log('========================================================================');
  console.log('FARM FISHING - BATERIA DE TESTES DE ANTI-DUPLICAÇÃO E ESTABILIDADE');
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

  // TEST 1: 100 FRAMES SEQUENCIAIS DE BOIA (95%) EM TELA DE RESULTADO
  console.log('--- TESTE 1: 100 frames sequenciais de BOIA @ 95% em Tela de Resultado ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let confirmados = 0;
    let duplicados = 0;
    let eventIds: string[] = [];

    for (let i = 1; i <= 100; i++) {
      const res = analyzer.processarDeteccao('boia', 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmados++;
        if (res.eventId) eventIds.push(res.eventId);
      } else if (res.status === 'duplicado') {
        duplicados++;
      }
    }

    assert(confirmados === 1, 'Teste 1 - Confirmações', `Esperado 1 confirmação, obtido ${confirmados}`);
    assert(duplicados >= 95, 'Teste 1 - Duplicações Bloqueadas', `Esperado >=95 bloqueios, obtido ${duplicados}`);
    assert(eventIds.length === 1, 'Teste 1 - Unicidade EventId', `Gerado ${eventIds.length} eventId (${eventIds[0]})`);
  }

  // TEST 2: SIMULAÇÃO DE 500 FRAMES COM PEQUENOS GLITCHES DE 1 FRAME "NÃO IDENTIFICADO" NA TELA DE RESULTADO
  console.log('\n--- TESTE 2: Simulação de 500 frames com pequenos glitches na Tela de Resultado ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let confirmados = 0;
    let duplicados = 0;

    for (let i = 1; i <= 500; i++) {
      const objeto = i % 20 === 0 ? 'não identificado' : 'boia';
      const res = analyzer.processarDeteccao(objeto, 92, true, 0.92);

      if (res.status === 'confirmado') {
        confirmados++;
      } else if (res.status === 'duplicado') {
        duplicados++;
      }
    }

    assert(confirmados === 1, 'Teste 2 - Trava contra múltiplos duplicados', `Confirmado apenas ${confirmados} vez(es)`);
    assert(duplicados > 400, 'Teste 2 - Bloqueio de duplicados', `Bloqueados ${duplicados} frames duplicados`);
  }

  // TEST 3: TRANSIÇÃO LEGÍTIMA DE TRÊS SÍMBOLOS DIFERENTES (BOIA -> SOCO -> PRINCESA)
  console.log('\n--- TESTE 3: Transição legítima de 3 rodadas (BOIA -> SOCO -> PRINCESA) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let confirmados = 0;
    const simbolosConfirmados: string[] = [];

    // 10 frames BOIA (Tela de Resultado)
    for (let i = 0; i < 10; i++) {
      const res = analyzer.processarDeteccao('boia', 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmados++;
        simbolosConfirmados.push(res.objeto);
      }
    }

    // 5 frames giro (Roda Normal - Fora de Tela de Resultado)
    for (let i = 0; i < 5; i++) {
      analyzer.processarDeteccao('não identificado', 0, false, 0);
    }

    // 10 frames SOCO (Tela de Resultado)
    for (let i = 0; i < 10; i++) {
      const res = analyzer.processarDeteccao('soco', 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmados++;
        simbolosConfirmados.push(res.objeto);
      }
    }

    // 5 frames giro (Roda Normal - Fora de Tela de Resultado)
    for (let i = 0; i < 5; i++) {
      analyzer.processarDeteccao('não identificado', 0, false, 0);
    }

    // 10 frames PRINCESA (Tela de Resultado)
    for (let i = 0; i < 10; i++) {
      const res = analyzer.processarDeteccao('princesa', 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmados++;
        simbolosConfirmados.push(res.objeto);
      }
    }

    assert(confirmados === 3, 'Teste 3 - Total de Confirmações Legítimas', `Esperado 3, obtido ${confirmados}`);
    assert(
      JSON.stringify(simbolosConfirmados) === JSON.stringify(['boia', 'soco', 'princesa']),
      'Teste 3 - Sequência de Símbolos',
      `Sequência: ${simbolosConfirmados.join(' -> ')}`
    );
  }

  // TEST 7: OBLIGATORY TEST 1 & 4 - MESMO OBJETO EM RODADAS CONSECUTIVAS (BOIA -> SAÍDA -> BOIA)
  console.log('\n--- TESTE 7: Rodadas consecutivas com o MESMO OBJETO (BOIA -> BOIA) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    let confirmados = 0;
    let duplicadosCount = 0;
    const simbolosConfirmados: string[] = [];
    const eventIds: string[] = [];

    // R001: 10 frames BOIA
    for (let i = 0; i < 10; i++) {
      const res = analyzer.processarDeteccao('boia', 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmados++;
        simbolosConfirmados.push(res.objeto);
        if (res.eventId) eventIds.push(res.eventId);
      } else if (res.status === 'duplicado') {
        duplicadosCount++;
      }
    }

    // Saída da tela de resultado (5 frames)
    for (let i = 0; i < 5; i++) {
      analyzer.processarDeteccao('não identificado', 0, false, 0);
    }

    // R002: 10 frames BOIA (Mesmo objeto na segunda rodada)
    for (let i = 0; i < 10; i++) {
      const res = analyzer.processarDeteccao('boia', 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmados++;
        simbolosConfirmados.push(res.objeto);
        if (res.eventId) eventIds.push(res.eventId);
      } else if (res.status === 'duplicado') {
        duplicadosCount++;
      }
    }

    assert(confirmados === 2, 'Teste 7 - Mesmos Objetos em Rodadas Consecutivas', `Esperado 2 confirmações, obtido ${confirmados}`);
    assert(
      JSON.stringify(simbolosConfirmados) === JSON.stringify(['boia', 'boia']),
      'Teste 7 - Sequência [boia, boia]',
      `Obtido: ${simbolosConfirmados.join(' -> ')}`
    );
    assert(eventIds.length === 2 && eventIds[0] !== eventIds[1], 'Teste 7 - EventIDs Distintos', `R1=${eventIds[0]}, R2=${eventIds[1]}`);
    assert(duplicadosCount >= 10, 'Teste 7 - Duplicações Bloqueadas por Frame', `Bloqueados ${duplicadosCount} frames do mesmo evento`);
  }

  // TEST 8: OBLIGATORY TEST 5 - QUATRO RODADAS COM OBJETOS REPETIDOS (BOIA -> BOIA -> SORVETE -> BOIA)
  console.log('\n--- TESTE 8: Quatro rodadas sequenciais (BOIA -> BOIA -> SORVETE -> BOIA) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    const sequenciaEntrada = ['boia', 'boia', 'sorvete', 'boia'];
    const simbolosConfirmados: string[] = [];
    const eventIds: string[] = [];

    for (const item of sequenciaEntrada) {
      // 10 frames na tela de resultado
      for (let f = 0; f < 10; f++) {
        const res = analyzer.processarDeteccao(item, 95, true, 0.95);
        if (res.status === 'confirmado') {
          simbolosConfirmados.push(res.objeto);
          if (res.eventId) eventIds.push(res.eventId);
        }
      }

      // 5 frames de saída (giro/roda normal)
      for (let f = 0; f < 5; f++) {
        analyzer.processarDeteccao(null, 0, false, 0);
      }
    }

    assert(simbolosConfirmados.length === 4, 'Teste 8 - 4 Rodadas Registradas', `Obtido ${simbolosConfirmados.length} rodadas`);
    assert(
      JSON.stringify(simbolosConfirmados) === JSON.stringify(sequenciaEntrada),
      'Teste 8 - Sequência Exata [boia, boia, sorvete, boia]',
      `Obtido: ${simbolosConfirmados.join(' -> ')}`
    );
    assert(new Set(eventIds).size === 4, 'Teste 8 - 4 Event IDs Únicos', `EventIDs únicos: ${new Set(eventIds).size}`);
  }

  // TEST 6: BATERIA COMPLETA DOS 8 SÍMBOLOS EM RODADAS SEQUENCIAIS COM SAÍDA VISUAL
  console.log('\n--- TESTE 6: Bateria completa de 8 símbolos em rodadas contínuas ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
    const simbolos = ['tedy', 'balao', 'princesa', 'sorvete', 'coroa', 'boia', 'soco', 'camera'];
    const confirmados: string[] = [];
    const eventIds: string[] = [];

    for (const simbolo of simbolos) {
      // 10 frames na Tela de Resultado do símbolo
      for (let f = 0; f < 10; f++) {
        const res = analyzer.processarDeteccao(simbolo, 95, true, 0.95);
        if (res.status === 'confirmado') {
          confirmados.push(res.objeto);
          if (res.eventId) eventIds.push(res.eventId);
        }
      }

      // 5 frames de Roda Normal (Saída da Tela de Resultado)
      for (let f = 0; f < 5; f++) {
        analyzer.processarDeteccao(null, 0, false, 0);
      }
    }

    const unicosEventIds = new Set(eventIds);

    assert(confirmados.length === 8, 'Teste 6 - 8 Rodadas Confirmadas', `Confirmadas ${confirmados.length} de 8 rodadas`);
    assert(
      JSON.stringify(confirmados) === JSON.stringify(simbolos),
      'Teste 6 - Sequência Exata dos 8 Símbolos',
      `Sequência: ${confirmados.join(' -> ')}`
    );
    assert(unicosEventIds.size === 8, 'Teste 6 - Unicidade dos 8 Event IDs', `Criados ${unicosEventIds.size} Event IDs únicos`);
  }

  // TEST 4: IDEMPOTÊNCIA DE PERSISTÊNCIA EM RESULTADO_SERVICE
  console.log('\n--- TESTE 4: Idempotência por EventID em resultadoService ---');
  {
    const testEventId = `TEST_IDEMPOTENCY_${Date.now()}`;
    const sessaoId = null;

    const res1 = await registrarResultadoAutomaticamente('boia', 95, testEventId, sessaoId);
    const res2 = await registrarResultadoAutomaticamente('boia', 95, testEventId, sessaoId);
    const res3 = await registrarResultadoAutomaticamente('boia', 95, testEventId, sessaoId);

    assert(res1.registrado === true || res1.motivo.includes('sucesso') || res1.motivo.includes('Supabase'), 'Teste 4 - 1ª tentativa', `Resultado: ${res1.motivo}`);
    assert(res2.registrado === false, 'Teste 4 - 2ª tentativa (Bloqueada Idempotente)', `Resultado: ${res2.motivo}`);
    assert(res3.registrado === false, 'Teste 4 - 3ª tentativa (Bloqueada Idempotente)', `Resultado: ${res3.motivo}`);
    assert(res2.motivo.includes('Idempotência') || res2.motivo.includes('já foi persistido') || res2.motivo.includes('DUPLICATE_EVENT_ID') || res2.motivo.includes('PERSISTENCE_REJECTED'), 'Teste 4 - Mensagem Idempotente', res2.motivo);
  }

  // TEST 5: LOCK CONCORRENTE CONTRA RACE CONDITION
  console.log('\n--- TESTE 5: Concorrência simultânea (Race Condition) no mesmo EventID ---');
  {
    const raceEventId = `TEST_RACE_${Date.now()}`;
    const sessaoId = null;

    // Dispara 5 chamadas idênticas simultaneamente em paralelo (Promise.all)
    const promises = Array.from({ length: 5 }).map(() =>
      registrarResultadoAutomaticamente('sorvete', 90, raceEventId, sessaoId)
    );

    const results = await Promise.all(promises);
    const registrados = results.filter((r) => r.registrado).length;

    assert(registrados <= 1, 'Teste 5 - Proteção contra Race Condition', `Apenas ${registrados} das 5 chamadas concorrentes efetuaram a inserção`);
  }

  console.log('\n========================================================================');
  console.log(`RESULTADO DOS TESTES: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDeduplicationTestSuite().catch((err) => {
  console.error('Erro na suíte de testes:', err);
  process.exit(1);
});
