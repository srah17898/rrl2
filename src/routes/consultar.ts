import { Router } from 'express';
import {
  buscarUltimosResultados,
  buscarResultadoAnterior,
  buscarQuantidadePorObjeto,
  buscarObjetoMaisFrequente,
  buscarObjetoMenosFrequente,
  buscarMaiorAtraso,
  buscarUltimaOcorrencia,
} from '../services/consultaService';
import {
  buscarDepoisDe,
  buscarMaisProvavelDepoisDe,
  buscarTransicaoEspecifica,
} from '../services/transicaoService';
import {
  analisarSequencia3,
  analisarSequencia4,
  buscarProximoDepoisDaSequencia,
} from '../services/sequenciaService';
import { logger } from '../utils/logger';

const router = Router();

router.post('/consultar', async (req, res) => {
  try {
    const { tipo, objeto, objetoAnterior, objetoAtual, sequencia, limite = 10 } = req.body || {};

    if (!tipo) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O parâmetro "tipo" é obrigatório. Tipos aceitos: ultimos, frequencia, mais_frequente, menos_frequente, maior_atraso, ultima_ocorrencia, depois_de, mais_provavel_depois, transicao_especifica, sequencia_3, sequencia_4, proximo_depois_sequencia',
      });
    }

    const tipoNormalizado = String(tipo).trim().toLowerCase();

    let resultado;
    switch (tipoNormalizado) {
      case 'ultimos':
        resultado = await buscarUltimosResultados(Number(limite) || 10);
        break;

      case 'resultado_anterior':
      case 'anterior':
        resultado = await buscarResultadoAnterior();
        break;

      case 'frequencia':
      case 'quantidade':
        resultado = await buscarQuantidadePorObjeto();
        break;

      case 'mais_frequente':
      case 'mais_saiu':
        resultado = await buscarObjetoMaisFrequente();
        break;

      case 'menos_frequente':
      case 'menos_saiu':
        resultado = await buscarObjetoMenosFrequente();
        break;

      case 'maior_atraso':
      case 'atraso':
        resultado = await buscarMaiorAtraso();
        break;

      case 'ultima_ocorrencia':
      case 'ultima_vez':
        if (!objeto) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O parâmetro "objeto" é obrigatório para consultas do tipo ultima_ocorrencia.',
          });
        }
        resultado = await buscarUltimaOcorrencia(String(objeto));
        break;

      case 'depois_de':
      case 'sucessores':
        if (!objeto && !objetoAnterior) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O parâmetro "objeto" é obrigatório para consultas do tipo depois_de.',
          });
        }
        resultado = await buscarDepoisDe(String(objeto || objetoAnterior));
        break;

      case 'mais_provavel_depois':
      case 'proximo_provavel':
        if (!objeto && !objetoAnterior) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O parâmetro "objeto" é obrigatório para consultas do tipo mais_provavel_depois.',
          });
        }
        resultado = await buscarMaisProvavelDepoisDe(String(objeto || objetoAnterior));
        break;

      case 'transicao_especifica':
        if (!objetoAnterior || !objetoAtual) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'Os parâmetros "objetoAnterior" e "objetoAtual" são obrigatórios para transicao_especifica.',
          });
        }
        resultado = await buscarTransicaoEspecifica(String(objetoAnterior), String(objetoAtual));
        break;

      case 'sequencia_3':
      case 'sequencia3':
        resultado = await analisarSequencia3(Array.isArray(sequencia) ? sequencia : undefined);
        break;

      case 'sequencia_4':
      case 'sequencia4':
        resultado = await analisarSequencia4(Array.isArray(sequencia) ? sequencia : undefined);
        break;

      case 'proximo_depois_sequencia':
      case 'proximo_sequencia':
        if (!Array.isArray(sequencia) || sequencia.length === 0) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O parâmetro "sequencia" (array de strings) é obrigatório para proximo_depois_sequencia.',
          });
        }
        resultado = await buscarProximoDepoisDaSequencia(sequencia);
        break;

      default:
        return res.status(400).json({
          sucesso: false,
          mensagem: `Tipo de consulta desconhecido: "${tipo}". Tipos aceitos: ultimos, frequencia, mais_frequente, menos_frequente, maior_atraso, ultima_ocorrencia, depois_de, mais_provavel_depois, transicao_especifica, sequencia_3, sequencia_4, proximo_depois_sequencia`,
        });
    }

    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro no endpoint /api/consultar:', error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || 'Erro interno ao processar a consulta.',
    });
  }
});

export default router;
