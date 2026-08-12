import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';

function runTests() {
  console.log('=== EXECUTANDO TESTE REAL E SUÍTE DE TESTES DA MÁQUINA DE ESTADOS (10 ETAPAS) ===\n');

  let totalPassados = 0;
  const totalTestes = 8;

  // TESTE 0: MANDATÓRIO - 3 CICLOS COMPLETOS DE RODADA
  console.log('--- TESTE 0: 3 CICLOS COMPLETOS DE RODADA (VERIFICAÇÃO DE PRODUCÃO) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: { objeto: string; eventId: string }[] = [];
    const eventIdsCriados = new Set<string>();
    let duplicacoesIncorretas = 0;
    let falsosPositivosGiro = 0;

    // --- CICLO 1: BOIA ---
    // 1. Roda girando
    let res = analyzer.processarDeteccao('boia', 92, false, 0, 's1', 1, 1000, 12);
    if (res.status === 'confirmado') falsosPositivosGiro++;

    // 2. Tela de resultado aparece (Frame 1: estabilização, Frame 2-4: 3/3 confirmações)
    analyzer.processarDeteccao('boia', 90, true, 0.95, 's1', 2, 1200, 10);
    analyzer.processarDeteccao('boia', 92, true, 0.95, 's1', 3, 1400, 11);
    analyzer.processarDeteccao('boia', 91, true, 0.95, 's1', 4, 1600, 12);
    res = analyzer.processarDeteccao('boia', 93, true, 0.95, 's1', 5, 1800, 13);

    if (res.status === 'confirmado' && res.eventId) {
      confirmados.push({ objeto: res.objeto, eventId: res.eventId });
      eventIdsCriados.add(res.eventId);
    }

    // 3. Tela permanece visível por mais 3 frames (deve bloquear duplicatas)
    for (let f = 6; f <= 8; f++) {
      const dupRes = analyzer.processarDeteccao('boia', 94, true, 0.95, 's1', f, 2000 + f * 200, 14);
      if (dupRes.status === 'confirmado' || (dupRes.eventId && dupRes.eventId !== res.eventId && dupRes.confirmedNow)) {
        duplicacoesIncorretas++;
      }
    }

    // 4. Tela desaparece (2 frames fora)
    analyzer.processarDeteccao(null, 0, false, 0, 's1', 9, 3600, 0);
    analyzer.processarDeteccao(null, 0, false, 0, 's1', 10, 3800, 0);

    // --- CICLO 2: SOCO ---
    // 1. Roda girando
    res = analyzer.processarDeteccao('soco', 95, false, 0, 's1', 11, 4000, 15);
    if (res.status === 'confirmado') falsosPositivosGiro++;

    // 2. Tela de resultado aparece
    analyzer.processarDeteccao('soco', 91, true, 0.95, 's1', 12, 4200, 10);
    analyzer.processarDeteccao('soco', 93, true, 0.95, 's1', 13, 4400, 12);
    analyzer.processarDeteccao('soco', 95, true, 0.95, 's1', 14, 4600, 14);
    res = analyzer.processarDeteccao('soco', 94, true, 0.95, 's1', 15, 4800, 13);

    if (res.status === 'confirmado' && res.eventId) {
      confirmados.push({ objeto: res.objeto, eventId: res.eventId });
      eventIdsCriados.add(res.eventId);
    }

    // 3. Tela desaparece
    analyzer.processarDeteccao(null, 0, false, 0, 's1', 16, 5000, 0);
    analyzer.processarDeteccao(null, 0, false, 0, 's1', 17, 5200, 0);

    // --- CICLO 3: COROA ---
    // 1. Roda girando
    res = analyzer.processarDeteccao('coroa', 90, false, 0, 's1', 18, 5400, 10);
    if (res.status === 'confirmado') falsosPositivosGiro++;

    // 2. Tela de resultado aparece
    analyzer.processarDeteccao('coroa', 92, true, 0.95, 's1', 19, 5600, 11);
    analyzer.processarDeteccao('coroa', 94, true, 0.95, 's1', 20, 5800, 13);
    analyzer.processarDeteccao('coroa', 91, true, 0.95, 's1', 21, 6000, 10);
    res = analyzer.processarDeteccao('coroa', 95, true, 0.95, 's1', 22, 6200, 15);

    if (res.status === 'confirmado' && res.eventId) {
      confirmados.push({ objeto: res.objeto, eventId: res.eventId });
      eventIdsCriados.add(res.eventId);
    }

    // 3. Tela desaparece
    analyzer.processarDeteccao(null, 0, false, 0, 's1', 23, 6400, 0);
    analyzer.processarDeteccao(null, 0, false, 0, 's1', 24, 6600, 0);

    console.log('Confirmados no Teste 0:', confirmados);
    console.log('Event IDs únicos:', Array.from(eventIdsCriados));
    console.log('Falsos Positivos Giro:', falsosPositivosGiro);
    console.log('Duplicações Incorretas:', duplicacoesIncorretas);

    const passou3Ciclos =
      confirmados.length === 3 &&
      confirmados[0].objeto === 'boia' &&
      confirmados[1].objeto === 'soco' &&
      confirmados[2].objeto === 'coroa' &&
      eventIdsCriados.size === 3 &&
      falsosPositivosGiro === 0 &&
      duplicacoesIncorretas === 0;

    if (passou3Ciclos) {
      console.log('✅ TESTE 0 (3 CICLOS COMPLETOS DE RODADA) PASSOU COM SUCESSO!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 0 FALHOU!');
    }
  }

  // TESTE 1: BOIA 4 FRAMES (1 Estabilização + 3 Confirmações) -> Esperado: 1 BOIA
  console.log('\n--- TESTE 1: BOIA 4 FRAMES (ESTABILIZAÇÃO + 3/3 CONFIRMAÇÕES) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];
    const sequence = [
      { item: 'boia', conf: 90 }, // Gate estabilização 1/2
      { item: 'boia', conf: 92 }, // Gate estabilização 2/2 -> Symbol 1/3
      { item: 'boia', conf: 91 }, // Symbol 2/3
      { item: 'boia', conf: 93 }, // Symbol 3/3 -> CONFIRMED!
    ];
    sequence.forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });
    console.log('Resultado Teste 1:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia'])) {
      console.log('✅ TESTE 1 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 1 FALHOU!', confirmados);
    }
  }

  // TESTE 2: BOIA 6 FRAMES -> Esperado: Apenas 1 BOIA confirmada
  console.log('\n--- TESTE 2: BOIA 6 FRAMES (SEM DUPLICAÇÕES) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];
    const sequence = [
      { item: 'boia', conf: 90 },
      { item: 'boia', conf: 92 },
      { item: 'boia', conf: 91 },
      { item: 'boia', conf: 95 },
      { item: 'boia', conf: 93 },
      { item: 'boia', conf: 94 },
    ];
    sequence.forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });
    console.log('Resultado Teste 2:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia'])) {
      console.log('✅ TESTE 2 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 2 FALHOU!', confirmados);
    }
  }

  // TESTE 3: BOIA -> TRANSIÇÃO -> SOCO
  console.log('\n--- TESTE 3: BOIA (RODADA 1) -> TRANSIÇÃO -> SOCO (RODADA 2) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];

    // Rodada 1: BOIA
    [{ item: 'boia', conf: 90 }, { item: 'boia', conf: 92 }, { item: 'boia', conf: 91 }, { item: 'boia', conf: 93 }].forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });

    // Saída de tela de resultado entre rodadas (2 frames fora)
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);

    // Rodada 2: SOCO
    [{ item: 'soco', conf: 93 }, { item: 'soco', conf: 95 }, { item: 'soco', conf: 94 }, { item: 'soco', conf: 92 }].forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });

    console.log('Resultado Teste 3:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia', 'soco'])) {
      console.log('✅ TESTE 3 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 3 FALHOU!', confirmados);
    }
  }

  // TESTE 4: BOIA (4x) e oscilações/glitches na mesma tela
  console.log('\n--- TESTE 4: BOIA (4x) E OSCILAÇÕES NA MESMA TELA DE RESULTADO ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];
    const sequence = [
      { item: 'boia', conf: 90 },
      { item: 'boia', conf: 92 },
      { item: 'boia', conf: 91 },
      { item: 'boia', conf: 93 }, // Confirma BOIA #1
      { item: 'coroa', conf: 90 },
      { item: 'boia', conf: 92 },
      { item: 'princesa', conf: 91 },
      { item: 'boia', conf: 93 },
      { item: 'balao', conf: 94 },
    ];
    sequence.forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });
    console.log('Resultado Teste 4:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia'])) {
      console.log('✅ TESTE 4 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 4 FALHOU!', confirmados);
    }
  }

  // TESTE 5: BOIA e SOCO com transição explícita
  console.log('\n--- TESTE 5: BOIA -> TRANSIÇÃO -> SOCO ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];

    [{ item: 'boia', conf: 90 }, { item: 'boia', conf: 92 }, { item: 'boia', conf: 94 }, { item: 'boia', conf: 91 }].forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });

    // Transição entre rodadas
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);

    [{ item: 'soco', conf: 90 }, { item: 'soco', conf: 93 }, { item: 'soco', conf: 95 }, { item: 'soco', conf: 94 }].forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });

    console.log('Resultado Teste 5:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia', 'soco'])) {
      console.log('✅ TESTE 5 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 5 FALHOU!', confirmados);
    }
  }

  // TESTE 6: BOIA com oscilação de baixa confiança
  console.log('\n--- TESTE 6: BOIA COM OSCILAÇÃO DE BAIXA CONFIANÇA ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];
    const sequence = [
      { item: 'boia', conf: 90 },
      { item: 'boia', conf: 92 },
      { item: 'coroa', conf: 40 }, // Baixa confiança (< 85%), descartado sem resetar o candidato BOIA
      { item: 'boia', conf: 93 },
      { item: 'boia', conf: 94 },
    ];
    sequence.forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });
    console.log('Resultado Teste 6:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia'])) {
      console.log('✅ TESTE 6 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 6 FALHOU!', confirmados);
    }
  }

  // TESTE 7: Mudança de resultado com transição de tela entre rodadas
  console.log('\n--- TESTE 7: MUDANÇA DE RESULTADO COM TRANSIÇÃO (BOIA -> COROA) ---');
  {
    const analyzer = new WheelVisionAnalyzer(3, 85);
    const confirmados: string[] = [];

    [{ item: 'boia', conf: 90 }, { item: 'boia', conf: 92 }, { item: 'boia', conf: 93 }, { item: 'boia', conf: 91 }].forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });

    // Transição de tela de resultado entre rodadas
    analyzer.processarDeteccao(null, 0, false, 0);
    analyzer.processarDeteccao(null, 0, false, 0);

    [{ item: 'coroa', conf: 90 }, { item: 'coroa', conf: 91 }, { item: 'coroa', conf: 94 }, { item: 'coroa', conf: 95 }].forEach((f) => {
      const res = analyzer.processarDeteccao(f.item, f.conf, true, 1.0);
      if (res.status === 'confirmado' && res.objetoPadraoParaBanco) {
        confirmados.push(res.objetoPadraoParaBanco.resultado);
      }
    });

    console.log('Resultado Teste 7:', confirmados);
    if (JSON.stringify(confirmados) === JSON.stringify(['boia', 'coroa'])) {
      console.log('✅ TESTE 7 PASSOU!');
      totalPassados++;
    } else {
      console.error('❌ TESTE 7 FALHOU!', confirmados);
    }
  }

  console.log(`\n==================================================`);
  console.log(`RESUMO DOS TESTES: ${totalPassados}/${totalTestes} PASSARAM PERFEITAMENTE!`);
  console.log(`==================================================\n`);

  if (totalPassados !== totalTestes) {
    process.exit(1);
  }
}

runTests();

