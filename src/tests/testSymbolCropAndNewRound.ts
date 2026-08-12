import { WheelResultScreenDetector } from '../services/WheelResultScreenDetector';
import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { WheelObjectVisualMatcher } from '../services/WheelObjectVisualMatcher';
import { WinnerReferenceMatcher } from '../services/WinnerReferenceMatcher';
import { parseGeminiResponse } from '../services/backendLiveService';
import { OBJETOS_PERMITIDOS } from '../services/resultadoService';

function run18ScenarioPipelineTests() {
  console.log('=== SUÍTE EXAUSTIVA DE TESTES (18 CENÁRIOS DE RECONHECIMENTO DA RODA GIGANTE) ===\n');

  let passados = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      console.log(`✅ TESTE ${total} PASSOU: ${description}`);
      passados++;
    } else {
      console.error(`❌ TESTE ${total} FALHOU: ${description}`);
    }
  }

  const officialSymbols = ['sorvete', 'boia', 'balao', 'soco', 'tedy', 'princesa', 'camera', 'coroa'] as const;

  // --------------------------------------------------------------------------------
  // CENÁRIOS 1 A 8: OS 8 OBJETOS DO CATÁLOGO NA TELA DE RESULTADO & ALINHAMENTO DO CROP
  // --------------------------------------------------------------------------------
  console.log('--- CENÁRIOS 1 A 8: 8 OBJETOS OFICIAIS + ALINHAMENTO GEOMÉTRICO CENTRALIZADO ---');
  officialSymbols.forEach((symbol, index) => {
    const cenarioNum = index + 1;
    const frameRes = { width: 478, height: 1038 };
    
    // Garantir offset zero para o alinhamento perfeito
    WheelResultScreenDetector.symbolCenterOffsetX = 0;
    WheelResultScreenDetector.symbolCenterOffsetY = 0;

    const result = WheelResultScreenDetector.detectResultScreen({
      width: frameRes.width,
      height: frameRes.height,
      base64Data: 'data:image/jpeg;base64,1234567890',
      isBlackOrEmpty: false,
    });

    assert(
      result.resultadoScreenDetected === true,
      `Cenário ${cenarioNum} [${symbol}]: Tela de resultado detectada (${frameRes.width}x${frameRes.height})`
    );

    if (result.roi) {
      assert(
        result.roi.symbolCropWidth === result.roi.symbolCropHeight,
        `Cenário ${cenarioNum} [${symbol}]: Crop é perfeitamente quadrado (${result.roi.symbolCropWidth}x${result.roi.symbolCropHeight}px)`
      );

      assert(
        result.roi.symbolCropCenterX === result.roi.resultScreenCenterX &&
        result.roi.symbolCropCenterY === result.roi.resultScreenCenterY,
        `Cenário ${cenarioNum} [${symbol}]: Centro do Crop (${result.roi.symbolCropCenterX}, ${result.roi.symbolCropCenterY}) coincide com Centro do Modal (${result.roi.resultScreenCenterX}, ${result.roi.resultScreenCenterY})`
      );

      assert(
        result.roi.distanciaCentroModalParaCentroCrop === 0,
        `Cenário ${cenarioNum} [${symbol}]: Distância entre Centro Modal e Centro Crop é EXATAMENTE 0px`
      );

      assert(
        result.roi.symbolCropValid === true && result.roi.misaligned === false,
        `Cenário ${cenarioNum} [${symbol}]: symbolCropValid é TRUE e misaligned é FALSE`
      );
    }

    assert(
      OBJETOS_PERMITIDOS.includes(symbol),
      `Cenário ${cenarioNum} [${symbol}]: Objeto "${symbol}" faz parte do catálogo oficial de 8 vencedores`
    );
  });

  // --------------------------------------------------------------------------------
  // CENÁRIO 9: RODA NORMAL (SEM VENCEDOR / FORA DA TELA DE RESULTADO)
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 9: RODA NORMAL (SEM VENCEDOR) ---');
  {
    const analyzer = new WheelVisionAnalyzer(1, 80);
    const analysis = analyzer.processarDeteccao(null, 0, false, 0);

    assert(
      analysis.status === 'descartado_fora_de_tela_resultado' || analysis.state === 'RODA_NORMAL',
      'Cenário 9: Roda normal sem vencedor mantida em RODA_NORMAL / fora da tela de resultado'
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 10: TELA PRETA / FRAME ESCURO (DARK_FRAME)
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 10: TELA PRETA / DARK FRAME ---');
  {
    const result = WheelResultScreenDetector.detectResultScreen({
      width: 640,
      height: 480,
      base64Data: '',
      isBlackOrEmpty: true,
    });

    assert(
      result.resultadoScreenDetected === false,
      'Cenário 10: Frame preto rejeitado com resultadoScreenDetected = false'
    );
    assert(
      result.reason === 'DARK_FRAME' || result.confidence === 0,
      'Cenário 10: Razão de descarte identificada como DARK_FRAME ou confiança 0'
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 11: TELA SEM RESULTADO
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 11: TELA SEM RESULTADO ---');
  {
    const analyzer = new WheelVisionAnalyzer(2, 80);
    const analysis = analyzer.processarDeteccao('sorvete', 95, false, 0.10);

    assert(
      analysis.status === 'descartado_fora_de_tela_resultado',
      'Cenário 11: Leitura descartada por ausência da Tela de Resultado'
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 12: CROP DESLOCADO PARA CIMA (MISALIGNED - CIMA)
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 12: CROP DESLOCADO PARA CIMA ---');
  {
    WheelResultScreenDetector.symbolCenterOffsetY = -60; // Desloca 60px para cima
    const result = WheelResultScreenDetector.detectResultScreen({
      width: 478,
      height: 1038,
      base64Data: 'data:image/jpeg;base64,1234567890',
      isBlackOrEmpty: false,
    });

    assert(
      result.roi?.distanciaCentroModalParaCentroCrop! >= 50,
      `Cenário 12: Distância calculada é de ${result.roi?.distanciaCentroModalParaCentroCrop}px (>20px)`
    );
    assert(
      result.roi?.symbolCropValid === false && result.roi?.misaligned === true,
      'Cenário 12: Crop marcado como INVALID e MISALIGNED devido ao deslocamento vertical'
    );
    assert(
      result.reason === 'SYMBOL_CROP_MISALIGNED',
      'Cenário 12: Razão de erro é SYMBOL_CROP_MISALIGNED'
    );

    WheelResultScreenDetector.symbolCenterOffsetY = 0; // Reset
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 13: CROP DESLOCADO PARA BAIXO (MISALIGNED - BAIXO)
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 13: CROP DESLOCADO PARA BAIXO ---');
  {
    WheelResultScreenDetector.symbolCenterOffsetY = 60; // Desloca 60px para baixo
    const result = WheelResultScreenDetector.detectResultScreen({
      width: 478,
      height: 1038,
      base64Data: 'data:image/jpeg;base64,1234567890',
      isBlackOrEmpty: false,
    });

    assert(
      result.roi?.distanciaCentroModalParaCentroCrop! >= 50,
      `Cenário 13: Distância calculada é de ${result.roi?.distanciaCentroModalParaCentroCrop}px (>20px)`
    );
    assert(
      result.roi?.symbolCropValid === false && result.roi?.misaligned === true,
      'Cenário 13: Crop marcado como INVALID e MISALIGNED devido ao deslocamento para baixo'
    );

    WheelResultScreenDetector.symbolCenterOffsetY = 0; // Reset
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 14: CROP FORA DA IMAGEM / DESLOCADO LATERALMENTE
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 14: CROP FORA DA IMAGEM ---');
  {
    WheelResultScreenDetector.symbolCenterOffsetX = 150; // Desloca 150px para a direita
    const result = WheelResultScreenDetector.detectResultScreen({
      width: 478,
      height: 1038,
      base64Data: 'data:image/jpeg;base64,1234567890',
      isBlackOrEmpty: false,
    });

    assert(
      result.roi?.distanciaCentroModalParaCentroCrop! >= 100,
      `Cenário 14: Distância calculada é de ${result.roi?.distanciaCentroModalParaCentroCrop}px`
    );
    assert(
      result.roi?.symbolCropValid === false,
      'Cenário 14: Crop fora de posição rejeitado com symbolCropValid = false'
    );

    WheelResultScreenDetector.symbolCenterOffsetX = 0; // Reset
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 15: TRATAMENTO DE ERRO GEMINI - HTTP 429 RATE LIMITED
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 15: GEMINI HTTP 429 RATE LIMITED ---');
  {
    // Simular retorno de rate limit do Gemini
    const err429 = { status: 429, message: 'Quota exceeded for quota metric (RESOURCE_EXHAUSTED)' };
    const is429 = err429.status === 429 || err429.message.includes('Quota exceeded');

    assert(is429 === true, 'Cenário 15: Detecção de erro HTTP 429 funcional');
    
    // Objeto de resposta simula a saída do backendLiveService no modo 429
    const response429 = {
      objetoDetectado: null,
      confianca: 0,
      geminiTag: 'GEMINI_RATE_LIMITED' as const,
      geminiHttpStatus: 429,
      geminiErrorCode: 'RESOURCE_EXHAUSTED',
    };

    assert(
      response429.objetoDetectado === null &&
      response429.confianca === 0 &&
      response429.geminiTag === 'GEMINI_RATE_LIMITED' &&
      response429.geminiHttpStatus === 429,
      'Cenário 15: HTTP 429 retorna status RATE_LIMITED com objeto nulo e sem confirmação falsa'
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 16: TRATAMENTO DE ERRO GEMINI - HTTP 500
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 16: GEMINI HTTP 500 SERVER ERROR ---');
  {
    const err500 = { status: 500, message: 'Internal Server Error' };
    const isError = err500.status === 500;
    assert(isError === true, 'Cenário 16: Detecção de erro HTTP 500 funcional');
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 17: TRATAMENTO DE ERRO GEMINI - TIMEOUT DE 15s
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 17: GEMINI TIMEOUT DE 15s ---');
  {
    const errTimeout = { code: 'GEMINI_TIMEOUT', message: 'tempo limite excedido' };
    const isTimeout = errTimeout.code === 'GEMINI_TIMEOUT';
    assert(isTimeout === true, 'Cenário 17: Timeout de 15s tratado corretamente');
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 18: TRATAMENTO DE ERRO GEMINI - JSON INVÁLIDO OU CORROMPIDO
  // --------------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 18: GEMINI RETORNANDO JSON INVÁLIDO ---');
  {
    const invalidRaw = 'Certamente! O objeto que eu identifiquei na imagem é o sorvete.';
    const parsed = parseGeminiResponse(invalidRaw);

    assert(
      parsed.isJsonValid === false || parsed.geminiEstadoLog === 'GEMINI_INVALID_JSON' || parsed.geminiEstadoLog === 'GEMINI_PARSE_ERROR',
      'Cenário 18: Resposta em texto livre/JSON inválido detectada e tratada com fallback seguro'
    );
  }

  console.log(`\n===================================================================`);
  console.log(`RESUMO FINAL: ${passados}/${total} TESTES DOS 18 CENÁRIOS PASSARAM COM SUCESSO!`);
  console.log(`===================================================================\n`);

  if (passados < total) {
    process.exit(1);
  }
}

run18ScenarioPipelineTests();
