import { WheelResultScreenDetector } from '../services/WheelResultScreenDetector';
import { WheelVisionAnalyzer } from '../services/WheelVisionAnalyzer';
import { WheelObjectVisualMatcher } from '../services/WheelObjectVisualMatcher';
import { WHEEL_OBJECT_REFERENCES } from '../config/wheelObjectReferences';
import { OBJETOS_PERMITIDOS } from '../services/resultadoService';

function runNewReferencesTestSuite() {
  console.log('=== SUÍTE DE TESTES EXAUSTIVA DA TELA DE RESULTADO E 8 NOVAS REFERÊNCIAS ===\n');

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, description: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ TESTE ${totalTests} PASSOU: ${description}`);
      passedTests++;
    } else {
      console.error(`❌ TESTE ${totalTests} FALHOU: ${description}`);
    }
  }

  // 1. TESTE DAS 8 REFERÊNCIAS OFICIAIS ATIVAS DA TELA DE RESULTADO
  console.log('--- CATEGORIA 1: VERIFICAÇÃO INTEGRAL DAS 8 NOVAS REFERÊNCIAS OFICIAIS ---');
  const expectedReferences = {
    sorvete: 'https://ik.imagekit.io/kqrijzbci/e547cdbd-6b88-4319-9ec5-1d64c151bf32.jpg',
    boia: 'https://ik.imagekit.io/kqrijzbci/65330d28-bd8d-426a-815f-84e8b1f933ac.jpg',
    balao: 'https://ik.imagekit.io/kqrijzbci/53d2c57e-0cfe-43fc-95b6-69221883077c.jpg',
    soco: 'https://ik.imagekit.io/kqrijzbci/38da51db-9f9f-47d5-8031-7ef398db5d02.jpg',
    tedy: 'https://ik.imagekit.io/kqrijzbci/780fa757-567e-4c5d-8cfc-1fd90edb6186.jpg',
    princesa: 'https://ik.imagekit.io/kqrijzbci/b49610cb-c698-4d43-b7b4-a8f79d94e882.jpg',
    camera: 'https://ik.imagekit.io/kqrijzbci/d860e5bd-41f5-440c-8a9d-0b58c2ff0091.jpg',
    coroa: 'https://ik.imagekit.io/kqrijzbci/5ca8eb04-5d85-4217-93bf-df470eff4532.jpg',
  };

  Object.entries(expectedReferences).forEach(([symbolName, expectedUrl]) => {
    const refConfig = (WHEEL_OBJECT_REFERENCES as any)[symbolName];
    assert(!!refConfig, `Configuração da referência '${symbolName}' existe`);
    assert(
      refConfig?.imageUrl === expectedUrl,
      `URL oficial de resultado para '${symbolName}' bate exatamente com a referência da Tela de Resultado (${refConfig?.imageUrl})`
    );
  });

  // 2. TESTE DE RANKING, SEGUNDO MELHOR CANDIDATO E IMAGEM DESCONHECIDA
  console.log('\n--- CATEGORIA 2: RANKING, SEGUNDO MELHOR CANDIDATO E IMAGENS DESCONHECIDAS ---');
  {
    // Mock visual match test for candidates
    const officialSymbols = ['sorvete', 'boia', 'balao', 'soco', 'tedy', 'princesa', 'camera', 'coroa'];

    officialSymbols.forEach((sym) => {
      const matchResult = WheelObjectVisualMatcher.findBestVisualMatch(sym);
      assert(
        matchResult.simboloCandidatoVisual === sym,
        `findBestVisualMatch('${sym}') identifica corretamente candidato '${sym}'`
      );
      assert(
        matchResult.scoreVisual >= 80,
        `scoreVisual para '${sym}' é elevado (${matchResult.scoreVisual}%)`
      );
      assert(
        matchResult.segundoMelhorCandidato !== null && matchResult.segundoMelhorCandidato !== sym,
        `Segundo melhor candidato para '${sym}' é idôneo (${matchResult.segundoMelhorCandidato})`
      );
      assert(
        matchResult.scoreSegundoMelhor < matchResult.scoreVisual,
        `Score do 2º melhor (${matchResult.scoreSegundoMelhor}%) é menor que o score do 1º (${matchResult.scoreVisual}%)`
      );
    });

    // Crop vazio / Imagem Desconhecida
    const emptyMatch = WheelObjectVisualMatcher.findBestVisualMatch('');
    assert(
      emptyMatch.simboloCandidatoVisual === null || emptyMatch.scoreVisual === 0,
      'Crop vazio/string vazia resulta em nenhum candidato com score 0'
    );

    const unknownMatch = WheelObjectVisualMatcher.findBestVisualMatch('objeto_desconhecido_x99');
    assert(
      unknownMatch.scoreVisual < 60,
      'Objeto desconhecido gera score visual baixo/rejeitado'
    );
  }

  // 3. TESTE DE CONTEXTO: RODA NORMAL VS TELA DE RESULTADO
  console.log('\n--- CATEGORIA 3: COMPORTAMENTO RODA NORMAL VS TELA DE RESULTADO ---');
  {
    const analyzer = new WheelVisionAnalyzer(1, 85);

    // 3.1 Frame da Roda Normal -> Não deve confirmar nem emitir vencedor
    const normalWheelResult = analyzer.processarDeteccao('sorvete', 95, false, 0);
    assert(
      normalWheelResult.status !== 'confirmado',
      'RODA NORMAL (resultadoScreenDetected = false) -> NÃO confirma vencedor nem gera EventID'
    );
    assert(
      analyzer.getUltimoObjetoConfirmado() === null || analyzer.getUltimoObjetoConfirmado()?.toLowerCase() === 'nenhum',
      'Último objeto confirmado permanece "nenhum"/null na roda normal'
    );

    // 3.2 Repetição na Roda Normal com outros objetos
    const normalWheelBoia = analyzer.processarDeteccao('boia', 98, false, 0);
    assert(
      normalWheelBoia.status !== 'confirmado',
      'RODA NORMAL + BOIA -> Não identifica nem confirma vencedor'
    );

    // 3.3 Transição para Tela de Resultado com cada um dos 8 símbolos
    const officialSymbols = ['sorvete', 'boia', 'balao', 'soco', 'tedy', 'princesa', 'camera', 'coroa'];

    officialSymbols.forEach((sym) => {
      const freshAnalyzer = new WheelVisionAnalyzer(1, 85);
      // Roda normal primeiro
      freshAnalyzer.processarDeteccao(null, 0, false, 0);

      // Tela de Resultado surge com o símbolo
      const resultScreenRes = freshAnalyzer.processarDeteccao(sym, 95, true, 0.95);
      assert(
        resultScreenRes.status === 'confirmado',
        `TELA DE RESULTADO + ${sym.toUpperCase()} -> Identifica e confirma "${sym}"`
      );
      assert(
        freshAnalyzer.getUltimoObjetoConfirmado() === sym,
        `Objeto verificado e confirmado no estado é "${sym}"`
      );
    });
  }

  // 4. TESTE DE RESOLUÇÃO, ESCALA E COMPRESSÃO
  console.log('\n--- CATEGORIA 4: TOLERÂNCIA A RESOLUÇÕES, ESCALA E COMPRESSÃO JPEG ---');
  {
    const resolutions = [
      { w: 640, h: 480, label: 'Standard SD 640x480' },
      { w: 1280, h: 720, label: 'HD 1280x720' },
      { w: 1920, h: 1080, label: 'Full HD 1920x1080' },
      { w: 2560, h: 1440, label: '2K QuadHD 2560x1440' },
    ];

    resolutions.forEach((res) => {
      const screenDiag = WheelResultScreenDetector.detectResultScreen({
        width: res.w,
        height: res.h,
        base64Data: '',
        isBlackOrEmpty: false,
      });

      assert(screenDiag.resultadoScreenDetected === true, `Tela de resultado detectada em ${res.label}`);
      assert(!!screenDiag.roi, `ROI gerada para ${res.label}`);
      assert(
        screenDiag.roi?.symbolCropWidth === screenDiag.roi?.symbolCropHeight,
        `SYMBOL_CROP em ${res.label} mantém proporção perfeitamente quadrada (${screenDiag.roi?.symbolCropWidth}px)`
      );
      assert(
        screenDiag.roi?.symbolCropValid === true,
        `Crop é validado como symbolCropValid em ${res.label}`
      );
    });

    // Teste de tolerância do Matcher a variações de nome/string de entrada simulando ruidos de compressão JPEG
    const noisyInputs = [
      { input: 'SORVETE', expected: 'sorvete' },
      { input: ' boia ', expected: 'boia' },
      { input: 'BALAO\n', expected: 'balao' },
      { input: 'soco_crop_80pct', expected: 'soco' },
      { input: 'tedy_res_1080p', expected: 'tedy' },
    ];

    noisyInputs.forEach(({ input, expected }) => {
      const match = WheelObjectVisualMatcher.findBestVisualMatch(input);
      assert(
        match.simboloCandidatoVisual === expected,
        `Entrada com ruído "${input}" resolve corretamente para "${expected}"`
      );
    });
  }

  // RESUMO E MATRIZ DE REFERÊNCIAS UTILIZADAS
  console.log('\n================================================================');
  console.log('MATRIZ DE REFERÊNCIAS OFICIAIS UTILIZADAS NAS REQUISIÇÕES:');
  console.log('----------------------------------------------------------------');
  Object.entries(expectedReferences).forEach(([sym, url]) => {
    console.log(`• ${sym.toUpperCase().padEnd(10)} => ${url}`);
  });
  console.log('================================================================');
  console.log(`RESUMO DA SUÍTE: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO!`);
  console.log('================================================================\n');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runNewReferencesTestSuite();
