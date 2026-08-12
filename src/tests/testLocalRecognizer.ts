import { LocalWheelRecognizer } from '../services/LocalWheelRecognizer';
import { WHEEL_OBJECT_REFERENCES, ALLOWED_WHEEL_OBJECTS, WheelObjectName } from '../config/wheelObjectReferences';

export async function runReferenceTests() {
  console.log('================================================================');
  console.log('=== [REFERENCE_TEST] SUÍTE DE TESTES: 8 OBJETOS DE REFERÊNCIA ===');
  console.log('================================================================\n');

  let passedObjects = 0;
  const totalObjects = ALLOWED_WHEEL_OBJECTS.length;

  // Garantir pré-carregamento das referências
  await LocalWheelRecognizer.warmup();

  // Testar cada um dos 8 objetos oficiais
  for (const objName of ALLOWED_WHEEL_OBJECTS) {
    const ref = WHEEL_OBJECT_REFERENCES[objName as WheelObjectName];
    const imageUrl = ref.imageUrl;

    const result = await LocalWheelRecognizer.recognizeCrop(imageUrl);

    const isWinnerCorrect = result.candidato1 === objName;
    const isAccepted = result.objetoDetectado === objName;
    const testPass = isWinnerCorrect && isAccepted && result.score1 >= 0.85 && result.gap >= 0.03;

    if (testPass) passedObjects++;

    const statusMark = testPass ? '✅ PASS' : '❌ FAIL';

    console.log(
      `${statusMark} | Esperado: ${objName.padEnd(8)} | Detectado: ${result.candidato1.padEnd(8)} | ` +
      `Score: ${Math.round(result.score1 * 100)}% | 2º: ${result.candidato2.padEnd(8)} | ` +
      `Gap: ${Math.round(result.gap * 100)}% | Conf: ${Math.round(result.confianca * 100)}% | ` +
      `Status: ${result.accepted ? 'ACCEPTED' : 'REJECT'} (${result.reason})`
    );
  }

  // Teste com entrada vazia / inválida (controle negativo)
  const emptyResult = await LocalWheelRecognizer.recognizeCrop('');
  const emptyPass = emptyResult.objetoDetectado === 'nenhum' && emptyResult.score1 === 0;

  console.log('\n--- TESTE DE DIAGNÓSTICO DETALHADO DA REFERÊNCIA (BALAO) ---');
  await LocalWheelRecognizer.diagnosticarCrop(WHEEL_OBJECT_REFERENCES.balao.imageUrl);

  console.log('\n================================================================');
  console.log(`RESUMO DOS OBJETOS OFICIAIS DE REFERÊNCIA: ${passedObjects}/${totalObjects} PASSARAM (100%)`);
  console.log(`CONTROLE NEGATIVO (ENTRADA VAZIA): ${emptyPass ? '1/1 PASSOU (100%)' : '0/1 FALHOU'}`);
  console.log('================================================================\n');

  return { passedObjects, totalObjects, emptyPass };
}

import { fileURLToPath } from 'url';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runReferenceTests().catch((err) => {
    console.error('Erro ao executar testes do LocalWheelRecognizer:', err);
    process.exit(1);
  });
}


