import { WheelResultScreenDetector } from '../src/services/WheelResultScreenDetector';
import { WheelObjectVisualMatcher } from '../src/services/WheelObjectVisualMatcher';
import { WheelVisionAnalyzer } from '../src/services/WheelVisionAnalyzer';
import { ALLOWED_WHEEL_OBJECTS } from '../src/config/wheelObjectReferences';

async function runWheelRegionDetectorTests() {
  console.log('===========================================================');
  console.log('  SUÍTE COMPLETA DE TESTES - RECORTE CENTRALIZADO & GATEKEEPER');
  console.log('===========================================================');

  let passed = 0;
  let total = 8;

  // ---------------------------------------------------------------------
  // TESTE 1: Frame 1080x1920 Retrato -> Recorte no Centro Geométrico da ROI
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 1] Frame 1080x1920 Retrato - Recorte no Centro Geométrico');
  const res1 = WheelResultScreenDetector.detectResultScreen({
    width: 1080,
    height: 1920,
    isBlackOrEmpty: false,
  });

  const roi1 = res1.roi;
  const isCentered1 =
    roi1 &&
    Math.abs(roi1.centerX - Math.round(roi1.width / 2)) <= 1 &&
    Math.abs(roi1.centerY - Math.round(roi1.height / 2)) <= 1 &&
    Math.abs(roi1.cropX + Math.round(roi1.cropWidth / 2) - roi1.centerX) <= 1 &&
    Math.abs(roi1.cropY + Math.round(roi1.cropHeight / 2) - roi1.centerY) <= 1;

  if (isCentered1 && roi1) {
    console.log(
      `  ✓ PASSOU: Recorte perfeitamente centralizado! ROI: ${roi1.width}x${roi1.height}, Crop: ${roi1.cropWidth}x${roi1.cropHeight} @ Centro (${roi1.centerX}, ${roi1.centerY})`
    );
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Recorte não centralizado em 1080x1920.`, roi1);
  }

  // ---------------------------------------------------------------------
  // TESTE 2: Frame 478x1038 (scrcpy) -> Recorte no Centro Geométrico
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 2] Frame 478x1038 (scrcpy) - Centralização Invariante à Resolução');
  const res2 = WheelResultScreenDetector.detectResultScreen({
    width: 478,
    height: 1038,
    isBlackOrEmpty: false,
  });

  const roi2 = res2.roi;
  const isCentered2 =
    roi2 &&
    Math.abs(roi2.centerX - Math.round(roi2.width / 2)) <= 1 &&
    Math.abs(roi2.centerY - Math.round(roi2.height / 2)) <= 1 &&
    Math.abs(roi2.cropX + Math.round(roi2.cropWidth / 2) - roi2.centerX) <= 1 &&
    Math.abs(roi2.cropY + Math.round(roi2.cropHeight / 2) - roi2.centerY) <= 1;

  if (isCentered2 && roi2) {
    console.log(
      `  ✓ PASSOU: Recorte adaptado e centralizado para 478x1038! ROI: ${roi2.width}x${roi2.height}, Crop: ${roi2.cropWidth}x${roi2.cropHeight} @ Centro (${roi2.centerX}, ${roi2.centerY})`
    );
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Falha na centralização em 478x1038.`, roi2);
  }

  // ---------------------------------------------------------------------
  // TESTE 3: Frame 1280x720 Paisagem -> Recorte no Centro Geométrico
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 3] Frame 1280x720 Paisagem - Centralização Invariante à Orientação');
  const res3 = WheelResultScreenDetector.detectResultScreen({
    width: 1280,
    height: 720,
    isBlackOrEmpty: false,
  });

  const roi3 = res3.roi;
  const isCentered3 =
    roi3 &&
    Math.abs(roi3.centerX - Math.round(roi3.width / 2)) <= 1 &&
    Math.abs(roi3.centerY - Math.round(roi3.height / 2)) <= 1 &&
    Math.abs(roi3.cropX + Math.round(roi3.cropWidth / 2) - roi3.centerX) <= 1 &&
    Math.abs(roi3.cropY + Math.round(roi3.cropHeight / 2) - roi3.centerY) <= 1;

  if (isCentered3 && roi3) {
    console.log(
      `  ✓ PASSOU: Recorte centralizado em paisagem 1280x720! ROI: ${roi3.width}x${roi3.height}, Crop: ${roi3.cropWidth}x${roi3.cropHeight} @ Centro (${roi3.centerX}, ${roi3.centerY})`
    );
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Falha na centralização em paisagem.`, roi3);
  }

  // ---------------------------------------------------------------------
  // TESTE 4: Validação do Gatekeeper - Descarte na Roda Normal (Sem Tela de Resultado)
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 4] Gatekeeper - Bloqueio de Símbolos durante Roda Normal (Giro)');
  const visionAnalyzer = new WheelVisionAnalyzer();
  // Simula símbolo aparecendo durante a roda normal
  const analysisRodaNormal = visionAnalyzer.processarDeteccao(
    'sorvete',
    95,
    false, // Tela de resultado NÃO detectada
    0.30,
    'SESSAO_TESTE_01',
    1
  );

  if (analysisRodaNormal.status === 'descartado_fora_de_tela_resultado') {
    console.log(`  ✓ PASSOU: Símbolo em roda normal descartado pelo Gatekeeper (status: "${analysisRodaNormal.status}").`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Símbolo em roda normal não deveria ser aceito!`, analysisRodaNormal);
  }

  // ---------------------------------------------------------------------
  // TESTE 5: Tela de Resultado com BOIA -> Aceite e Confirmação
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 5] Tela de Resultado com Símbolo BOIA');
  const matchBoia = WheelObjectVisualMatcher.matchObject('boia', 95);
  if (matchBoia.isValid && matchBoia.matchedObject === 'boia') {
    console.log(`  ✓ PASSOU: Símbolo "boia" validado com sucesso!`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: "boia" não foi validada.`, matchBoia);
  }

  // ---------------------------------------------------------------------
  // TESTE 6: Tela de Resultado com SORVETE -> Aceite e Confirmação
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 6] Tela de Resultado com Símbolo SORVETE');
  const matchSorvete = WheelObjectVisualMatcher.matchObject('sorvete', 92);
  if (matchSorvete.isValid && matchSorvete.matchedObject === 'sorvete') {
    console.log(`  ✓ PASSOU: Símbolo "sorvete" validado com sucesso!`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: "sorvete" não foi validado.`, matchSorvete);
  }

  // ---------------------------------------------------------------------
  // TESTE 7: Tela de Resultado com BALÃO -> Aceite e Confirmação
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 7] Tela de Resultado com Símbolo BALAO');
  const matchBalao = WheelObjectVisualMatcher.matchObject('balao', 94);
  if (matchBalao.isValid && matchBalao.matchedObject === 'balao') {
    console.log(`  ✓ PASSOU: Símbolo "balao" validado com sucesso!`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: "balao" não foi validado.`, matchBalao);
  }

  // ---------------------------------------------------------------------
  // TESTE 8: Validação Estrita dos 8 Objetos Permitidos e Rejeição de Inválidos
  // ---------------------------------------------------------------------
  console.log('\n[TESTE 8] Validação dos 8 Objetos Oficiais e Rejeição de Inválidos');
  let validCount = 0;
  for (const obj of ALLOWED_WHEEL_OBJECTS) {
    const resObj = WheelObjectVisualMatcher.matchObject(obj, 90);
    if (resObj.isValid) validCount++;
  }

  const resInvalid = WheelObjectVisualMatcher.matchObject('objeto_desconhecido_x', 95);

  if (validCount === 8 && !resInvalid.isValid) {
    console.log(`  ✓ PASSOU: Exatamente os 8 objetos oficiais são aceitos e inválidos rejeitados.`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: Erro na validação dos 8 objetos.`);
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
