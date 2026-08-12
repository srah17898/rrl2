import { WheelItem } from '../types';
import { runWheelFullAnalysis } from '../services/wheelAnalysisService';
import { compressConsecutiveResults } from '../services/wheelPatternService';
import { filterLowHistory, analyzeLowCycles } from '../services/wheelSequenceService';
import { WHEEL_ITEM_METAS } from '../types/wheelAnalysis';

console.log('====================================================');
console.log('TESTANDO MOTOR DE ANÁLISE ESTATÍSTICA E PADRÕES DA RODA');
console.log('====================================================');

// 1. Validar Mapeamentos dos 8 Objetos
console.log('\n--- 1. Validação do Mapeamento dos 8 Objetos ---');
const items: WheelItem[] = ['sorvete', 'balao', 'boia', 'soco', 'tedy', 'princesa', 'camera', 'coroa'];
items.forEach((item) => {
  const meta = WHEEL_ITEM_METAS[item];
  console.log(`- ${meta.label}: Categoria=${meta.category} (Código=${meta.categoryCode}), Multiplicador=${meta.multiplier}x, ItemCode=${meta.itemCode}`);
});

// 2. Testar Compressão de Consecutivos
console.log('\n--- 2. Teste de Compressão de Consecutivos ---');
const rawHistory: WheelItem[] = ['balao', 'boia', 'soco', 'soco', 'tedy', 'princesa', 'soco', 'sorvete'];
const compressed = compressConsecutiveResults(rawHistory);
console.log('Original:  ', rawHistory.join(' -> '));
console.log('Comprimido:', compressed.join(' -> '));

// 3. Testar Histórico de Baixos e Ciclo dos 4 Baixos
console.log('\n--- 3. Teste de Ciclo dos 4 Baixos ---');
const lowHistory = filterLowHistory(['sorvete', 'soco', 'balao', 'tedy', 'boia', 'sorvete', 'soco']);
const lowCycles = analyzeLowCycles(['sorvete', 'soco', 'balao', 'tedy', 'boia', 'sorvete', 'soco']);
console.log('Histórico Filtrado de Baixos:', lowHistory.join(' -> '));
console.log('Itens do Ciclo Ativo:', lowCycles.currentCycleItems.join(', '));
console.log('Baixos Ausentes no Ciclo:', lowCycles.missingLowItems.join(', '));

// 4. Executar Análise Completa do Motor
console.log('\n--- 4. Executando Análise Completa do Motor ---');
const fullSampleHistory: WheelItem[] = [
  'sorvete', 'soco', 'balao', 'tedy', 'boia', 'sorvete', 'sorvete', 'princesa', 'soco', 'boia',
  'balao', 'coroa', 'sorvete', 'boia', 'soco', 'balao', 'tedy', 'princesa', 'camera', 'coroa',
  'sorvete', 'boia', 'soco', 'balao', 'sorvete', 'soco', 'boia', 'balao', 'coroa', 'tedy'
];

const report = runWheelFullAnalysis(fullSampleHistory, { lowCount: 3, highCount: 1 });

console.log('Amostra Total Analisada:', report.sampleSize);
console.log('Estratégia Escolhida:', report.strategy);
console.log('Confiança Geral:', report.recommendation.globalConfidence);

console.log('\n--- RECOMENDAÇÕES TOP BAIXOS ---');
report.recommendation.topLows.forEach((c, idx) => {
  console.log(`${idx + 1}º ${c.item.toUpperCase()} | Score: ${c.score}% | Prob: ${(c.estimatedProbability * 100).toFixed(1)}% | Confiança: ${c.confidence}`);
  console.log('   Por que?:', c.reasons.join('; '));
});

console.log('\n--- RECOMENDAÇÕES TOP ALTOS ---');
report.recommendation.topHighs.forEach((c, idx) => {
  console.log(`${idx + 1}º ${c.item.toUpperCase()} | Score: ${c.score}% | Prob: ${(c.estimatedProbability * 100).toFixed(1)}% | Confiança: ${c.confidence}`);
  console.log('   Por que?:', c.reasons.join('; '));
});

console.log('\n--- DESEMPENHO DO BACKTESTING (SIMULAÇÃO HISTÓRICA) ---');
console.log(`Rodadas Simuladas: ${report.backtest.totalSimulatedRounds}`);
console.log(`Acertos: ${report.backtest.hits}`);
console.log(`Taxa de Acerto (Hit Rate): ${report.backtest.hitRatePercent}%`);

console.log('\n✅ TESTES DO MOTOR DE ANÁLISE ESTATÍSTICA E PADRÕES CONCLUÍDOS COM SUCESSO!');
