import { registrarResultadoAutomaticamente } from '../services/resultadoService';

async function testRegistrarAuto() {
  console.log('--- TESTING REGISTRAR RESULTADO AUTOMATICAMENTE ---');
  const res1 = await registrarResultadoAutomaticamente('boia', 95);
  console.log('Result 1 (boia, 95%):', res1);

  const res2 = await registrarResultadoAutomaticamente('balao', 92);
  console.log('Result 2 (balao, 92%):', res2);

  const res3 = await registrarResultadoAutomaticamente('balao', 90);
  console.log('Result 3 (balao duplicate <2s):', res3);
}

testRegistrarAuto().catch(console.error);
