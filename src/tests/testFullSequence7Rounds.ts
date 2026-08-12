import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import {
  registrarResultadoAutomaticamente,
  setAutoPersistEnabled,
  limparMemoriaResultadoService,
} from '../services/resultadoService';

async function runTestFullSequence7Rounds() {
  console.log('========================================================================');
  console.log('TESTE DE CICLO COMPLETO DE 7 RODADAS (SEQUÊNCIA ESPECÍFICA)');
  console.log('Sequência: 1.boia -> 2.sorvete -> 3.boia -> 4.coroa -> 5.soco -> 6.boia -> 7.boia');
  console.log('========================================================================\n');

  setAutoPersistEnabled(true);
  limparMemoriaResultadoService();

  const analyzer = new WheelVisionAnalyzer(3, 85, 2500);
  const sequence = ['boia', 'sorvete', 'boia', 'coroa', 'soco', 'boia', 'boia'];
  const registeredEvents: Array<{ rodada: number; objeto: string; eventId: string }> = [];

  for (let r = 0; r < sequence.length; r++) {
    const expectedObj = sequence[r];
    const roundNumber = r + 1;
    console.log(`\n--- INICIANDO RODADA ${roundNumber}: "${expectedObj}" ---`);

    let confirmedResult: any = null;

    // Simular exibição da tela de resultado com 5 frames consecutivos
    for (let f = 1; f <= 5; f++) {
      const res = analyzer.processarDeteccao(expectedObj, 95, true, 0.95);
      if (res.status === 'confirmado') {
        confirmedResult = res;
        const reg = await registrarResultadoAutomaticamente(
          res.objeto,
          res.confianca,
          res.eventId
        );
        console.log(`[SUPABASE_INSERT] Rodada ${roundNumber} (${res.objeto}): eventId=${res.eventId} registrado=${reg.registrado}`);
        if (reg.registrado || reg.motivo?.includes('já foi persistido')) {
          registeredEvents.push({
            rodada: roundNumber,
            objeto: res.objeto,
            eventId: res.eventId!,
          });
        }
      }
    }

    if (!confirmedResult) {
      throw new Error(`FALHA: Rodada ${roundNumber} (${expectedObj}) não foi confirmada pelo analisador.`);
    }

    // Simular giro da roda / fechamento da tela de resultado (2 frames ausentes)
    analyzer.processarDeteccao('nenhum', 0, false, 0);
    analyzer.processarDeteccao('nenhum', 0, false, 0);

    // Pequeno delay entre rodadas no teste automatizado para respeitar rate limit (max 3/2s)
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  console.log('\n========================================================================');
  console.log(`RESUMO DA SEQUÊNCIA DE 7 RODADAS:`);
  registeredEvents.forEach((ev) => {
    console.log(`Rodada #${ev.rodada}: ${ev.objeto} -> eventId: ${ev.eventId}`);
  });

  const uniqueEventIds = new Set(registeredEvents.map((e) => e.eventId));
  const objectsRegistered = registeredEvents.map((e) => e.objeto);

  console.log(`Total de Registros Confirmados: ${registeredEvents.length} / 7`);
  console.log(`EventIDs Únicos Gerados: ${uniqueEventIds.size} / 7`);
  console.log(`Sequência Registrada:`, objectsRegistered);

  if (registeredEvents.length !== 7) {
    throw new Error(`FALHA: Esperado 7 registros, obtido ${registeredEvents.length}`);
  }

  if (uniqueEventIds.size !== 7) {
    throw new Error(`FALHA: Esperado 7 EventIDs únicos, obtido ${uniqueEventIds.size}`);
  }

  const matchesSequence = sequence.every((obj, idx) => objectsRegistered[idx] === obj);
  if (!matchesSequence) {
    throw new Error(`FALHA: Sequência registrada difere da esperada!`);
  }

  console.log('\n✅ TESTE DE 7 RODADAS CONCLUÍDO COM SUCESSO ABSOLUTO!');
  console.log('========================================================================\n');
}

runTestFullSequence7Rounds().catch((err) => {
  console.error('❌ ERRO NO TESTE DE 7 RODADAS:', err.message);
  process.exit(1);
});
