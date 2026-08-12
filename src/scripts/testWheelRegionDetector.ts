import { WheelRegionDetector } from '../services/WheelRegionDetector';
import { WheelResultScreenDetector } from '../services/WheelResultScreenDetector';
import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { WheelObjectVisualMatcher } from '../services/WheelObjectVisualMatcher';
import { ALLOWED_WHEEL_OBJECTS } from '../config/wheelObjectReferences';

async function runWheelRegionDetectorTests() {
  console.log('===========================================================');
  console.log('  SUÍTE COMPLETA DE TESTES - CORREÇÃO ROI E RECONHECIMENTO');
  console.log('===========================================================');

  let passed = 0;
  let total = 8;

  // ---------------------------------------------------------------------
  // TESTE 1: Frame 1080x1920 Retrato -> ROI na Região Inferior da Roda
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 1] Frame 1080x1920 Retrato (Região Inferior da Roda)');
  const res1 = WheelResultScreenDetector.detectResultScreen({
    width: 1080,
    height: 1920,
    isBlackOrEmpty: false,
  });

  const roi1 = res1.roi;
  const centerY1 = roi1 ? roi1.y + Math.round(roi1.height / 2) : 0;

  if (
    roi1 &&
    roi1.x >= 0 &&
    roi1.y >= 0 &&
    roi1.x + roi1.width <= 1080 &&
    roi1.y + roi1.height <= 1920 &&
    centerY1 > 1920 * 0.60 // Centro Y > 60% da altura (parte inferior)
  ) {
    console.log(
      `  ✓ PASSOU: ROI localizada na região inferior! ROI: ${roi1.width}x${roi1.height} @ (X:${roi1.x}, Y:${roi1.y}), Centro Y: ${centerY1}px (Pós Y:${roi1.y} > 1150px)`
    );
    passed++;
  } else {
    console.error(`  ✗ FALHOU: ROI 1080x1920 fora da posição inferior esperada.`, roi1);
  }

  // ---------------------------------------------------------------------
  // TESTE 2: Frame 478x1038 Retrato Reduzido -> ROI na Região Inferior
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 2] Frame 478x1038 Retrato (Resolução Especial scrcpy/Mobile)');
  const res2 = WheelResultScreenDetector.detectResultScreen({
    width: 478,
    height: 1038,
    isBlackOrEmpty: false,
  });

  const roi2 = res2.roi;
  const centerY2 = roi2 ? roi2.y + Math.round(roi2.height / 2) : 0;

  if (
    roi2 &&
    roi2.x >= 0 &&
    roi2.y >= 0 &&
    roi2.x + roi2.width <= 478 &&
    roi2.y + roi2.height <= 1038 &&
    centerY2 > 1038 * 0.60
  ) {
    console.log(
      `  ✓ PASSOU: ROI adaptada para 478x1038! ROI: ${roi2.width}x${roi2.height} @ (X:${roi2.x}, Y:${roi2.y}), Centro Y: ${centerY2}px`
    );
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Falha ao adaptar ROI para 478x1038.`, roi2);
  }

  // ---------------------------------------------------------------------
  // TESTE 3: Frame em Paisagem (1280x720) -> ROI Proporcionalmente Adaptada
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 3] Frame 1280x720 Paisagem');
  const res3 = WheelResultScreenDetector.detectResultScreen({
    width: 1280,
    height: 720,
    isBlackOrEmpty: false,
  });

  const roi3 = res3.roi;
  const centerY3 = roi3 ? roi3.y + Math.round(roi3.height / 2) : 0;

  if (
    roi3 &&
    roi3.x >= 0 &&
    roi3.y >= 0 &&
    roi3.x + roi3.width <= 1280 &&
    roi3.y + roi3.height <= 720 &&
    centerY3 > 720 * 0.55
  ) {
    console.log(
      `  ✓ PASSOU: ROI proporcional em paisagem 1280x720! ROI: ${roi3.width}x${roi3.height} @ (X:${roi3.x}, Y:${roi3.y}), Centro Y: ${centerY3}px`
    );
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Falha ao adaptar ROI em paisagem.`, roi3);
  }

  // ---------------------------------------------------------------------
  // TESTE 4: Tela Normal da Roda (Giro/Sem Modal) -> RESULTADO NÃO DETECTADO
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 4] Tela Normal da Roda (Sem Modal de Resultado)');
  // Criar mock de imageData com brilho uniforme (sem o modal central contrastado)
  const samplePixels = new Uint8ClampedArray(400 * 400 * 4);
  for (let i = 0; i < samplePixels.length; i += 4) {
    samplePixels[i] = 120;     // R
    samplePixels[i + 1] = 120; // G
    samplePixels[i + 2] = 120; // B
    samplePixels[i + 3] = 255; // A
  }
  const mockImageData = { data: samplePixels, width: 400, height: 400 } as any;

  const res4 = WheelResultScreenDetector.detectResultScreen({
    width: 400,
    height: 400,
    imageData: mockImageData,
  });

  if (!res4.resultadoScreenDetected || res4.confidence < 0.80) {
    console.log(`  ✓ PASSOU: Tela normal descartada corretamente (detectado: ${res4.resultadoScreenDetected}, conf: ${res4.confidence})`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Tela normal não deveria ser detectada como tela de resultado.`, res4);
  }

  // ---------------------------------------------------------------------
  // TESTE 5: Tela de Resultado com BOIA -> BOIA
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 5] Tela de Resultado com Símbolo BOIA');
  const matchBoia = WheelObjectVisualMatcher.matchObject('boia', 95);
  if (matchBoia.isValid && matchBoia.matchedObject === 'boia') {
    console.log(`  ✓ PASSOU: Símbolo "boia" validado com sucesso! Score: ${matchBoia.score}%`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: "boia" não foi validada.`, matchBoia);
  }

  // ---------------------------------------------------------------------
  // TESTE 6: Tela de Resultado com SORVETE -> SORVETE
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 6] Tela de Resultado com Símbolo SORVETE');
  const matchSorvete = WheelObjectVisualMatcher.matchObject('sorvete', 92);
  if (matchSorvete.isValid && matchSorvete.matchedObject === 'sorvete') {
    console.log(`  ✓ PASSOU: Símbolo "sorvete" validado com sucesso! Score: ${matchSorvete.score}%`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: "sorvete" não foi validado.`, matchSorvete);
  }

  // ---------------------------------------------------------------------
  // TESTE 7: Tela de Resultado com BALÃO -> BALAO
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 7] Tela de Resultado com Símbolo BALAO');
  const matchBalao = WheelObjectVisualMatcher.matchObject('balao', 94);
  if (matchBalao.isValid && matchBalao.matchedObject === 'balao') {
    console.log(`  ✓ PASSOU: Símbolo "balao" validado com sucesso! Score: ${matchBalao.score}%`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: "balao" não foi validado.`, matchBalao);
  }

  // ---------------------------------------------------------------------
  // TESTE 8: Validação Estrita dos 8 Objetos Permitidos (Nenhum Objeto Extra)
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 8] Validação dos 8 Objetos Oficiais e Rejeição de Inválidos');
  let validCount = 0;
  for (const obj of ALLOWED_WHEEL_OBJECTS) {
    const resObj = WheelObjectVisualMatcher.matchObject(obj, 90);
    if (resObj.isValid) validCount++;
  }

  const resInvalid = WheelObjectVisualMatcher.matchObject('objeto_desconhecido_x', 95);
  const resAguardando = WheelObjectVisualMatcher.matchObject('aguardando', 95);

  if (validCount === 8 && !resInvalid.isValid && !resAguardando.isValid) {
    console.log(`  ✓ PASSOU: Exatamente os 8 objetos oficiais são aceitos, e objetos inválidos ("objeto_desconhecido_x", "aguardando") foram REJEITADOS.`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Erro na validação dos 8 objetos. Aceitos: ${validCount}/8`);
  }

  console.log('\n===========================================================');
  if (passed === total) {
    console.log(`  ✓ TODOS OS ${total} TESTES OBRIGATÓRIOS PASSARAM COM SUCESSO!`);
  } else {
    console.error(`  ✗ FALHA: ${passed}/${total} testes passaram.`);
  }
  console.log('===========================================================');
}

runWheelRegionDetectorTests().catch(console.error);
