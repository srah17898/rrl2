import sharp from 'sharp';
import { LocalWheelRecognizer } from '../services/LocalWheelRecognizer';
import { WheelObjectVisualMatcher } from '../services/WheelObjectVisualMatcher';
import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import {
  WHEEL_OBJECT_REFERENCES,
  ALLOWED_WHEEL_OBJECTS,
  WheelObjectName,
} from '../config/wheelObjectReferences';

interface ImageStreamScenario {
  objectName: WheelObjectName;
  frameIndex: number;
  jpegQuality: number;
  brightness: number;
  saturation: number;
  offsetX: number;
  offsetY: number;
}

// Memory cache for reference images buffers to avoid repeated HTTP fetches
const imageBufferCache: Record<string, Buffer> = {};

async function getRefBuffer(objName: WheelObjectName): Promise<Buffer> {
  if (imageBufferCache[objName]) {
    return imageBufferCache[objName];
  }
  const url = WHEEL_OBJECT_REFERENCES[objName].imageUrl;
  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  imageBufferCache[objName] = buf;
  return buf;
}

/**
  Gera um crop 153x153 com overlay do modal dourado e efeitos de stream real
 */
async function generateRealStreamFrame(
  objName: WheelObjectName,
  scenario: Partial<ImageStreamScenario> = {},
  targetWidth: number = 153,
  targetHeight: number = 153
): Promise<string> {
  const rawBuf = await getRefBuffer(objName);

  const jpegQuality = scenario.jpegQuality ?? 80;
  const brightness = scenario.brightness ?? 1.0;
  const saturation = scenario.saturation ?? 1.0;
  const offsetX = scenario.offsetX ?? 0;
  const offsetY = scenario.offsetY ?? 0;

  // 1. Redimensionar/crop do símbolo base
  const resized = await sharp(rawBuf)
    .resize(targetWidth, targetHeight, { fit: 'cover' })
    .modulate({ brightness, saturation })
    .toBuffer();

  // 2. Overlay do anel dourado (raio proporcional)
  const cx = targetWidth / 2 + offsetX;
  const cy = targetHeight / 2 + offsetY;
  const outerR = Math.min(targetWidth, targetHeight) * (75 / 153);
  const innerR = Math.min(targetWidth, targetHeight) * (62 / 153);

  const overlayBuf = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= innerR && dist <= outerR) {
        overlayBuf[idx] = 212;     // R
        overlayBuf[idx + 1] = 175; // G
        overlayBuf[idx + 2] = 55;  // B
        overlayBuf[idx + 3] = 255; // Alpha
      } else if (dist > outerR) {
        overlayBuf[idx] = 15;
        overlayBuf[idx + 1] = 20;
        overlayBuf[idx + 2] = 30;
        overlayBuf[idx + 3] = 255;
      } else {
        overlayBuf[idx] = 0;
        overlayBuf[idx + 1] = 0;
        overlayBuf[idx + 2] = 0;
        overlayBuf[idx + 3] = 0;
      }
    }
  }

  const finalBuf = await sharp(resized)
    .composite([
      {
        input: overlayBuf,
        raw: { width: targetWidth, height: targetHeight, channels: 4 },
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: jpegQuality })
    .toBuffer();

  return `data:image/jpeg;base64,${finalBuf.toString('base64')}`;
}

async function runVisualRecognitionAudit() {
  console.log('========================================================================');
  console.log('       AUDITORIA DE RECONHECIMENTO VISUAL REAL (LOCAL ONLY MODE)');
  console.log('========================================================================\n');

  console.log('[1/8] Aquecendo referências oficiais...');
  await LocalWheelRecognizer.warmup();
  console.log('      Referências aquecidas com sucesso.\n');

  // ========================================================================
  // AUDITORIA 1: TESTE DOS 8 OBJETOS DE REFERÊNCIA OFICIAIS
  // ========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('1. TESTE DAS REFERÊNCIAS OFICIAIS (8 SÍMBOLOS)');
  console.log('------------------------------------------------------------------------');

  const refResults: Array<{
    object: string;
    winnerVisual: string;
    winnerScore: number;
    secondVisual: string;
    secondScore: number;
    gap: number;
    validCandidate: boolean;
    invalidReason: string;
  }> = [];

  for (const obj of ALLOWED_WHEEL_OBJECTS) {
    const refUrl = WHEEL_OBJECT_REFERENCES[obj].imageUrl;
    const res = await LocalWheelRecognizer.recognizeCrop(refUrl, true);

    const winnerVisual = res.candidato1;
    const winnerScore = Math.round(res.score1 * 100);
    const secondVisual = res.candidato2;
    const secondScore = Math.round(res.score2 * 100);
    const gap = Math.round(res.gap * 100);
    const validCandidate = res.accepted;
    const invalidReason = res.reason;

    refResults.push({
      object: obj,
      winnerVisual,
      winnerScore,
      secondVisual,
      secondScore,
      gap,
      validCandidate,
      invalidReason,
    });
  }

  console.table(
    refResults.map((r) => ({
      OBJETO: r.object,
      WINNER: r.winnerVisual,
      SCORE: `${r.winnerScore}%`,
      SEGUNDO: r.secondVisual,
      '2º_SCORE': `${r.secondScore}%`,
      GAP: `${r.gap}%`,
      VALIDO: r.validCandidate ? 'Sim' : 'Não',
      MOTIVO: r.invalidReason,
    }))
  );

  // ========================================================================
  // AUDITORIA 2: MATRIZ CROSS-MATCH 8x8
  // ========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('2. MATRIZ DE CROSS-MATCH (8x8) DE COMPARAÇÃO CRUZADA DE SCORES (%)');
  console.log('------------------------------------------------------------------------');

  const crossMatrix: Record<string, Record<string, number>> = {};

  for (const inputObj of ALLOWED_WHEEL_OBJECTS) {
    crossMatrix[inputObj] = {};
    const refUrl = WHEEL_OBJECT_REFERENCES[inputObj].imageUrl;
    const res = await LocalWheelRecognizer.recognizeCrop(refUrl, true);

    for (const refObj of ALLOWED_WHEEL_OBJECTS) {
      const score = Math.round((res.scoresPorObjeto[refObj] || 0) * 100);
      crossMatrix[inputObj][refObj] = score;
    }
  }

  console.table(crossMatrix);

  console.log('\n>>> DIAGNÓSTICO ESPECÍFICO DE COMPARAÇÃO CRUZADA:');
  console.log(`- tedy   vs camera : ${crossMatrix['tedy']['camera']}%`);
  console.log(`- camera vs tedy   : ${crossMatrix['camera']['tedy']}%`);
  console.log(`- tedy   vs tedy   : ${crossMatrix['tedy']['tedy']}%`);
  console.log(`- camera vs camera : ${crossMatrix['camera']['camera']}%`);

  // ========================================================================
  // AUDITORIA 3: TESTE EM DIFERENTES ESCALAS (50%, 60%, 70%, 80%, 90%, 100%)
  // ========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('3. TESTE DE IMPACTO DA ESCALA DO CROP (50% a 100%)');
  console.log('------------------------------------------------------------------------');

  const scales = [0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
  const scaleResults: Array<{
    scalePct: string;
    avgScore: number;
    avgGap: number;
    accuracyPct: number;
  }> = [];

  for (const sc of scales) {
    let totalScore = 0;
    let totalGap = 0;
    let correctCount = 0;

    for (const obj of ALLOWED_WHEEL_OBJECTS) {
      const rawBuf = await getRefBuffer(obj);
      const scaledW = Math.round(153 * sc);
      const scaledH = Math.round(153 * sc);

      const scaledBuf = await sharp(rawBuf)
        .resize(scaledW, scaledH, { fit: 'contain' })
        .toBuffer();

      const dataUrl = `data:image/png;base64,${scaledBuf.toString('base64')}`;
      const res = await LocalWheelRecognizer.recognizeCrop(dataUrl, true);

      totalScore += res.score1;
      totalGap += res.gap;
      if (res.candidato1 === obj && res.accepted) {
        correctCount++;
      }
    }

    scaleResults.push({
      scalePct: `${Math.round(sc * 100)}%`,
      avgScore: Math.round((totalScore / ALLOWED_WHEEL_OBJECTS.length) * 100),
      avgGap: Math.round((totalGap / ALLOWED_WHEEL_OBJECTS.length) * 100),
      accuracyPct: Math.round((correctCount / ALLOWED_WHEEL_OBJECTS.length) * 100),
    });
  }

  console.table(scaleResults);

  // ========================================================================
  // AUDITORIA 4: TESTE DE QUALIDADE JPEG (50, 60, 70, 80, 85, 90, 95)
  // ========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('4. TESTE DE COMPRESSÃO DE TRANSMISSÃO JPEG (QUALIDADE 50 a 95)');
  console.log('------------------------------------------------------------------------');

  const jpegQualities = [50, 60, 70, 80, 85, 90, 95];
  const jpegResults: Array<{
    quality: number;
    avgScore: number;
    avgGap: number;
    acceptedCount: string;
  }> = [];

  for (const q of jpegQualities) {
    let totalScore = 0;
    let totalGap = 0;
    let accCount = 0;

    for (const obj of ALLOWED_WHEEL_OBJECTS) {
      const dataUrl = await generateRealStreamFrame(obj, { jpegQuality: q });
      const res = await LocalWheelRecognizer.recognizeCrop(dataUrl, true);

      totalScore += res.score1;
      totalGap += res.gap;
      if (res.accepted && res.candidato1 === obj) accCount++;
    }

    jpegResults.push({
      quality: q,
      avgScore: Math.round((totalScore / ALLOWED_WHEEL_OBJECTS.length) * 100),
      avgGap: Math.round((totalGap / ALLOWED_WHEEL_OBJECTS.length) * 100),
      acceptedCount: `${accCount}/${ALLOWED_WHEEL_OBJECTS.length}`,
    });
  }

  console.table(jpegResults);

  // ========================================================================
  // AUDITORIA 5: TESTE DE RESOLUÇÕES DE CROP
  // ========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('5. TESTE DE RESOLUÇÕES DO CROP (64x64 até 256x256)');
  console.log('------------------------------------------------------------------------');

  const resolutions = [64, 96, 128, 153, 192, 256];
  const resResults: Array<{
    resolution: string;
    avgLatencyMs: number;
    avgScorePct: number;
    avgGapPct: number;
    acceptedCount: string;
  }> = [];

  for (const dim of resolutions) {
    let totalLatency = 0;
    let totalScore = 0;
    let totalGap = 0;
    let accepted = 0;

    for (const obj of ALLOWED_WHEEL_OBJECTS) {
      const dataUrl = await generateRealStreamFrame(obj, { jpegQuality: 80 }, dim, dim);

      const t0 = performance.now();
      const res = await LocalWheelRecognizer.recognizeCrop(dataUrl, true);
      const t1 = performance.now();

      totalLatency += t1 - t0;
      totalScore += res.score1;
      totalGap += res.gap;
      if (res.accepted && res.candidato1 === obj) accepted++;
    }

    resResults.push({
      resolution: `${dim}x${dim}`,
      avgLatencyMs: Math.round((totalLatency / ALLOWED_WHEEL_OBJECTS.length) * 10) / 10,
      avgScorePct: Math.round((totalScore / ALLOWED_WHEEL_OBJECTS.length) * 100),
      avgGapPct: Math.round((totalGap / ALLOWED_WHEEL_OBJECTS.length) * 100),
      acceptedCount: `${accepted}/${ALLOWED_WHEEL_OBJECTS.length}`,
    });
  }

  console.table(resResults);

  // ========================================================================
  // AUDITORIA 6: TESTE DE CROP REAL (153x153, ESCALA 60%, CENTRO 0px)
  // ========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('6. AVALIAÇÃO DO CROP REAL DE PRODUÇÃO (153x153, MOLDURA E ROI)');
  console.log('------------------------------------------------------------------------');

  const realCropDetails: Array<{
    object: string;
    winnerVisual: string;
    score: string;
    second: string;
    secondScore: string;
    gap: string;
    status: string;
  }> = [];

  for (const obj of ALLOWED_WHEEL_OBJECTS) {
    const dataUrl = await generateRealStreamFrame(obj, {
      jpegQuality: 80,
      brightness: 0.98,
      saturation: 1.02,
    });

    const res = await LocalWheelRecognizer.recognizeCrop(dataUrl, true);

    realCropDetails.push({
      object: obj,
      winnerVisual: res.candidato1,
      score: `${Math.round(res.score1 * 100)}%`,
      second: res.candidato2,
      secondScore: `${Math.round(res.score2 * 100)}%`,
      gap: `${Math.round(res.gap * 100)}%`,
      status: res.accepted ? 'ACCEPTED' : 'REJECTED',
    });
  }

  console.table(realCropDetails);

  // ========================================================================
  // AUDITORIA 7: TESTE DE ESTABILIDADE (30 FRAMES CONSECUTIVOS POR OBJETO)
  // ========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('7. TESTE DE ESTABILIDADE EM SEQUÊNCIAS REAIS (30 FRAMES / OBJETO)');
  console.log('------------------------------------------------------------------------');

  const stabilityReport: Array<{
    object: string;
    avgScore: number;
    minScore: number;
    maxScore: number;
    avgGap: number;
    acertos: number;
    erros: number;
    mudancasVencedor: number;
    classificacao: '🟢 Excelente' | '🟡 Aceitável' | '🔴 Problemático';
  }> = [];

  const topConfusions: Array<{ from: string; to: string; count: number; scoreAvg: number }> = [];
  const confusionMap: Record<string, Record<string, { count: number; totalScore: number }>> = {};

  // Latencies
  let totalCaptureTime = 0;
  let totalRecognizerTime = 0;
  let totalAnalyzerTime = 0;
  let totalFramesTested = 0;

  const analyzer = new WheelVisionAnalyzer(3, 85, 2500);

  for (const obj of ALLOWED_WHEEL_OBJECTS) {
    const scores: number[] = [];
    const gaps: number[] = [];
    let acertos = 0;
    let erros = 0;
    let mudancasVencedor = 0;
    let lastWinner: string | null = null;

    for (let f = 1; f <= 30; f++) {
      totalFramesTested++;

      // Medição 1: Captura / Geração do Frame Buffer
      const tCapStart = performance.now();
      const brightnessShift = 0.95 + (f % 10) * 0.01; // 0.95 a 1.04
      const saturationShift = 0.96 + ((f * 3) % 8) * 0.01;
      const jitterX = (f % 3) - 1; // -1, 0, 1
      const jitterY = ((f + 1) % 3) - 1;

      const dataUrl = await generateRealStreamFrame(obj, {
        jpegQuality: 78 + (f % 7),
        brightness: brightnessShift,
        saturation: saturationShift,
        offsetX: jitterX,
        offsetY: jitterY,
      });
      const tCapEnd = performance.now();
      totalCaptureTime += tCapEnd - tCapStart;

      // Medição 2: Local Recognizer
      const tRecStart = performance.now();
      const res = await LocalWheelRecognizer.recognizeCrop(dataUrl, true);
      const tRecEnd = performance.now();
      totalRecognizerTime += tRecEnd - tRecStart;

      // Medição 3: WheelVisionAnalyzer (State Machine)
      const tAnaStart = performance.now();
      analyzer.processarDeteccao(
        res.candidato1,
        Math.round(res.score1 * 100),
        true,
        0.95,
        undefined,
        f,
        undefined,
        Math.round(res.gap * 100)
      );
      const tAnaEnd = performance.now();
      totalAnalyzerTime += tAnaEnd - tAnaStart;

      const currentWinner = res.candidato1;
      const scorePct = Math.round(res.score1 * 100);
      const gapPct = Math.round(res.gap * 100);

      scores.push(scorePct);
      gaps.push(gapPct);

      if (lastWinner !== null && currentWinner !== lastWinner) {
        mudancasVencedor++;
      }
      lastWinner = currentWinner;

      if (res.accepted && currentWinner === obj) {
        acertos++;
      } else {
        erros++;
        // Track confusion
        if (!confusionMap[obj]) confusionMap[obj] = {};
        if (!confusionMap[obj][currentWinner]) {
          confusionMap[obj][currentWinner] = { count: 0, totalScore: 0 };
        }
        confusionMap[obj][currentWinner].count++;
        confusionMap[obj][currentWinner].totalScore += scorePct;
      }
    }

    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);

    let classificacao: '🟢 Excelente' | '🟡 Aceitável' | '🔴 Problemático' = '🔴 Problemático';
    if (acertos === 30 && mudancasVencedor === 0 && minScore >= 88 && avgGap >= 5) {
      classificacao = '🟢 Excelente';
    } else if (acertos === 30 && minScore >= 85 && avgGap >= 3) {
      classificacao = '🟡 Aceitável';
    } else {
      classificacao = '🔴 Problemático';
    }

    stabilityReport.push({
      object: obj,
      avgScore,
      minScore,
      maxScore,
      avgGap,
      acertos,
      erros,
      mudancasVencedor,
      classificacao,
    });
  }

  // Aggregate top confusions
  for (const fromObj in confusionMap) {
    for (const toObj in confusionMap[fromObj]) {
      const entry = confusionMap[fromObj][toObj];
      topConfusions.push({
        from: fromObj,
        to: toObj,
        count: entry.count,
        scoreAvg: Math.round(entry.totalScore / entry.count),
      });
    }
  }

  // ========================================================================
  // TABELA RESUMO FINAL DA AUDITORIA VISUAL
  // ========================================================================
  console.log('\n========================================================================');
  console.log('               RELATÓRIO DE AUDITORIA VISUAL DE PRODUÇÃO');
  console.log('========================================================================\n');

  console.table(
    stabilityReport.map((r) => ({
      OBJETO: r.object,
      'SCORE MÉDIO': `${r.avgScore}%`,
      'SCORE MÍNIMO': `${r.minScore}%`,
      'SCORE MÁXIMO': `${r.maxScore}%`,
      'GAP MÉDIO': `${r.avgGap}%`,
      ACERTO: `${r.acertos}/30`,
      ERROS: r.erros,
      'MUDANÇAS WINNER': r.mudancasVencedor,
      CLASSIFICAÇÃO: r.classificacao,
    }))
  );

  console.log('\n------------------------------------------------------------------------');
  console.log('TOP CONFUSÕES VISUAIS IDENTIFICADAS');
  console.log('------------------------------------------------------------------------');
  if (topConfusions.length === 0) {
    console.log('  Nenhuma confusão visual registrada! 100% de acerto em todos os 240 frames de teste.');
  } else {
    topConfusions.forEach((c) => {
      console.log(`  - ${c.from} -> ${c.to} | Ocorrências: ${c.count} | Score Médio: ${c.scoreAvg}%`);
    });
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('MÉTRICAS DE LATÊNCIA POR FRAME (MÉDIA DE 240 FRAMES)');
  console.log('------------------------------------------------------------------------');
  const avgCap = Math.round((totalCaptureTime / totalFramesTested) * 10) / 10;
  const avgRec = Math.round((totalRecognizerTime / totalFramesTested) * 10) / 10;
  const avgAna = Math.round((totalAnalyzerTime / totalFramesTested) * 10) / 10;
  const avgTotal = Math.round((avgCap + avgRec + avgAna) * 10) / 10;

  console.log(`- Captura (Crop/Buffer Prep) : ${avgCap} ms`);
  console.log(`- Recognizer (Feature Match): ${avgRec} ms`);
  console.log(`- Analyzer (State Machine)  : ${avgAna} ms`);
  console.log(`- Total por Frame           : ${avgTotal} ms`);
  console.log('------------------------------------------------------------------------\n');

  console.log('========================================================================');
  console.log('CONCLUSÃO E CLASSIFICAÇÃO DOS 8 OBJETOS DA RODA');
  console.log('========================================================================');
  stabilityReport.forEach((r) => {
    console.log(`  ${r.classificacao.padEnd(15)} | ${r.object.padEnd(10)} | Score Mín: ${r.minScore}% | Gap Médio: ${r.avgGap}%`);
  });
  console.log('========================================================================\n');

  import('fs').then(fs => {
    fs.writeFileSync('./src/tests/audit_summary.json', JSON.stringify({
      refResults,
      crossMatrix,
      scaleResults,
      jpegResults,
      resResults,
      realCropDetails,
      stabilityReport,
      topConfusions,
      latencies: { avgCap, avgRec, avgAna, avgTotal }
    }, null, 2));
  });
}

runVisualRecognitionAudit().catch((err) => {
  console.error('Erro ao executar auditoria visual:', err);
  process.exit(1);
});
