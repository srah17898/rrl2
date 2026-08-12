import { StatisticsEngine, setFallbackHistory } from '../services/StatisticsEngine';

export function runStatisticsEngineTests() {
  console.log('=== TESTES DO MOTOR ESTATÍSTICO (LIVE 012) ===\n');

  // Teste 1: Exemplo controlado do prompt (soco -> boia, boia, sorvete, boia, soco)
  // Histórico em ordem cronológica (antigo -> novo):
  // 1. soco
  // 2. boia
  // 3. soco
  // 4. boia
  // 5. soco
  // 6. sorvete
  // 7. soco
  // 8. boia
  // 9. soco
  // 10. soco
  const testeControlado = [
    { objeto: 'soco' },
    { objeto: 'boia' },
    { objeto: 'soco' },
    { objeto: 'boia' },
    { objeto: 'soco' },
    { objeto: 'sorvete' },
    { objeto: 'soco' },
    { objeto: 'boia' },
    { objeto: 'soco' },
    { objeto: 'soco' },
  ];

  setFallbackHistory(testeControlado);

  StatisticsEngine.getNextAfter('soco').then((res) => {
    console.log('[Teste Controlado] Objeto:', res.objetoPesquisado);
    console.log('[Teste Controlado] Total ocorrências de soco:', res.ocorrencias);
    console.log('  -> boia:', res.resultados['boia']);
    console.log('  -> sorvete:', res.resultados['sorvete']);
    console.log('  -> soco:', res.resultados['soco']);

    const boiaPct = res.resultados['boia']?.porcentagem;
    const sorvetePct = res.resultados['sorvete']?.porcentagem;
    const socoPct = res.resultados['soco']?.porcentagem;

    if (boiaPct === 60 && sorvetePct === 20 && socoPct === 20) {
      console.log('✅ TESTE CONTROLADO PASSOU! (boia=60%, sorvete=20%, soco=20%)\n');
    } else {
      console.error('❌ TESTE CONTROLADO FALHOU:', { boiaPct, sorvetePct, socoPct });
    }
  });
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('testStatisticsEngineNext')) {
  runStatisticsEngineTests();
}
