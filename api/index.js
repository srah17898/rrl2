// src/expressApp.ts
import { GoogleGenAI as GoogleGenAI4, Type as Type3 } from "@google/genai";
import express from "express";

// src/routes/health.ts
import { Router } from "express";

// src/database/supabase.ts
import { createClient } from "@supabase/supabase-js";
function sanitizarUrl(rawUrl) {
  if (!rawUrl) return "";
  let url = rawUrl.trim();
  url = url.replace(/\/rest\/v1\/?$/i, "");
  url = url.replace(/\/+$/, "");
  return url;
}
function getEnvVar(key) {
  const viteKey = `VITE_${key}`;
  if (typeof process !== "undefined" && process.env) {
    if (process.env[key]) return process.env[key];
    if (process.env[viteKey]) return process.env[viteKey];
  }
  try {
    const getMeta = new Function("try { return import.meta.env; } catch { return undefined; }");
    const env = getMeta();
    if (env) {
      if (env[key]) return env[key];
      if (env[viteKey]) return env[viteKey];
    }
  } catch {
  }
  return "";
}
var rawSupabaseUrl = getEnvVar("SUPABASE_URL");
var supabaseUrl = sanitizarUrl(rawSupabaseUrl);
var supabaseAnonKey = getEnvVar("SUPABASE_ANON_KEY");
var supabaseInstance = null;
function getSupabase() {
  const url = sanitizarUrl(getEnvVar("SUPABASE_URL"));
  const anonKey = getEnvVar("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return null;
  }
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: typeof window !== "undefined"
        }
      });
    } catch (error) {
      console.error("Erro ao inicializar o cliente Supabase:", error);
      return null;
    }
  }
  return supabaseInstance;
}
var supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// src/utils/logger.ts
var LOG_LEVEL_WEIGHT = {
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4
};
var currentMinLevel = typeof process !== "undefined" && process.env?.NODE_ENV !== "production" ? "DEBUG" : "INFO";
var logger = {
  setMinLevel: (level) => {
    currentMinLevel = level;
  },
  debug: (...args) => {
    if (LOG_LEVEL_WEIGHT["DEBUG"] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.debug("[DEBUG]", (/* @__PURE__ */ new Date()).toISOString(), ...args);
    }
  },
  info: (...args) => {
    if (LOG_LEVEL_WEIGHT["INFO"] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.log("[INFO]", (/* @__PURE__ */ new Date()).toISOString(), ...args);
    }
  },
  warn: (...args) => {
    if (LOG_LEVEL_WEIGHT["WARN"] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.warn("[WARN]", (/* @__PURE__ */ new Date()).toISOString(), ...args);
    }
  },
  error: (...args) => {
    if (LOG_LEVEL_WEIGHT["ERROR"] >= LOG_LEVEL_WEIGHT[currentMinLevel]) {
      console.error("[ERROR]", (/* @__PURE__ */ new Date()).toISOString(), ...args);
    }
  }
};

// src/routes/health.ts
var router = Router();
router.get("/health", async (req, res) => {
  try {
    const supabase2 = getSupabase();
    let supabaseConnected = false;
    let supabaseError = null;
    let data = null;
    if (supabase2) {
      const result = await supabase2.from("sessoes").select("*").limit(1);
      data = result.data;
      supabaseError = result.error?.message || null;
      supabaseConnected = !result.error;
    }
    res.json({
      status: "ok",
      system: "Farm Fishing AI Backend",
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      hasSupabaseConfigured: Boolean(supabase2),
      supabaseConnected,
      supabaseError,
      data
    });
  } catch (error) {
    logger.error("Erro na rota health:", error?.message);
    res.json({
      status: "erro",
      mensagem: error?.message || "Erro desconhecido ao verificar status."
    });
  }
});
var health_default = router;

// src/routes/consultar.ts
import { Router as Router2 } from "express";

// src/services/consultaService.ts
var OBJETOS_VALIDOS = [
  "sorvete",
  "boia",
  "balao",
  "soco",
  "tedy",
  "princesa",
  "camera",
  "coroa"
];
function normalizarEValidarObjeto(objeto) {
  if (!objeto) return null;
  const objClean = objeto.trim().toLowerCase();
  if (OBJETOS_VALIDOS.includes(objClean)) {
    return objClean;
  }
  return null;
}
async function buscarUltimosResultados(limite = 10) {
  const inicio = Date.now();
  const supabase2 = getSupabase();
  if (!supabase2) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.warn("Supabase indispon\xEDvel em buscarUltimosResultados");
    return {
      sucesso: false,
      tipo: "ultimos",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: "Banco de dados Supabase indispon\xEDvel no momento."
    };
  }
  try {
    const limitClean = Math.max(1, Math.min(100, limite));
    const { data, error } = await supabase2.from("resultados").select("*").order("criado_em", { ascending: false }).limit(limitClean);
    const tempoExecucaoMs = Date.now() - inicio;
    if (error) {
      logger.error("Erro ao buscar \xFAltimos resultados no Supabase:", error.message);
      return {
        sucesso: false,
        tipo: "ultimos",
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: [],
        mensagem: `Erro na consulta: ${error.message}`
      };
    }
    const total = data ? data.length : 0;
    logger.info(`Consulta executada | Tipo: ultimos | Tempo: ${tempoExecucaoMs}ms | Registros: ${total}`);
    return {
      sucesso: true,
      tipo: "ultimos",
      tempoExecucaoMs,
      totalRegistrosConsultados: total,
      dados: data || []
    };
  } catch (err) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error("Exce\xE7\xE3o em buscarUltimosResultados:", err?.message);
    return {
      sucesso: false,
      tipo: "ultimos",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: err?.message || "Erro inesperado na consulta ao banco de dados."
    };
  }
}
async function buscarResultadoAnterior() {
  const inicio = Date.now();
  const supabase2 = getSupabase();
  if (!supabase2) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: "resultado_anterior",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: "Banco de dados Supabase indispon\xEDvel no momento."
    };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("*").order("criado_em", { ascending: false }).limit(2);
    const tempoExecucaoMs = Date.now() - inicio;
    if (error) {
      logger.error("Erro ao buscar resultado anterior:", error.message);
      return {
        sucesso: false,
        tipo: "resultado_anterior",
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: null,
        mensagem: error.message
      };
    }
    const anterior = data && data.length > 1 ? data[1] : data && data.length === 1 ? data[0] : null;
    const total = data ? data.length : 0;
    logger.info(`Consulta executada | Tipo: resultado_anterior | Tempo: ${tempoExecucaoMs}ms | Registros: ${total}`);
    return {
      sucesso: true,
      tipo: "resultado_anterior",
      tempoExecucaoMs,
      totalRegistrosConsultados: total,
      dados: anterior
    };
  } catch (err) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error("Exce\xE7\xE3o em buscarResultadoAnterior:", err?.message);
    return {
      sucesso: false,
      tipo: "resultado_anterior",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: err?.message || "Erro inesperado na consulta."
    };
  }
}
async function buscarQuantidadePorObjeto() {
  const inicio = Date.now();
  const supabase2 = getSupabase();
  if (!supabase2) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: "frequencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: "Banco de dados Supabase indispon\xEDvel no momento."
    };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("item");
    const tempoExecucaoMs = Date.now() - inicio;
    if (error) {
      logger.error("Erro ao buscar quantidade por objeto:", error.message);
      return {
        sucesso: false,
        tipo: "frequencia",
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: [],
        mensagem: error.message
      };
    }
    const totalRodadas = data ? data.length : 0;
    const contagemMap = {};
    OBJETOS_VALIDOS.forEach((obj) => {
      contagemMap[obj] = 0;
    });
    if (data) {
      data.forEach((row) => {
        const itemClean = normalizarEValidarObjeto(row.item);
        if (itemClean) {
          contagemMap[itemClean] = (contagemMap[itemClean] || 0) + 1;
        }
      });
    }
    const resultadoFormatado = OBJETOS_VALIDOS.map((objeto) => {
      const quantidade = contagemMap[objeto] || 0;
      const porcentagemNum = totalRodadas > 0 ? quantidade / totalRodadas * 100 : 0;
      return {
        objeto,
        quantidade,
        porcentagem: `${porcentagemNum.toFixed(1)}%`,
        porcentagemNumero: Number(porcentagemNum.toFixed(1))
      };
    }).sort((a, b) => b.quantidade - a.quantidade);
    logger.info(`Consulta executada | Tipo: frequencia | Tempo: ${tempoExecucaoMs}ms | Registros: ${totalRodadas}`);
    return {
      sucesso: true,
      tipo: "frequencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: totalRodadas,
      dados: resultadoFormatado
    };
  } catch (err) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error("Exce\xE7\xE3o em buscarQuantidadePorObjeto:", err?.message);
    return {
      sucesso: false,
      tipo: "frequencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: [],
      mensagem: err?.message || "Erro inesperado na consulta."
    };
  }
}
async function buscarObjetoMaisFrequente() {
  const inicio = Date.now();
  const resFrequencia = await buscarQuantidadePorObjeto();
  const tempoExecucaoMs = Date.now() - inicio;
  if (!resFrequencia.sucesso || !resFrequencia.dados || resFrequencia.dados.length === 0) {
    return {
      sucesso: false,
      tipo: "mais_frequente",
      tempoExecucaoMs,
      totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
      dados: null,
      mensagem: resFrequencia.mensagem || "Sem dados registrados no momento."
    };
  }
  const maisFrequente = resFrequencia.dados[0];
  logger.info(`Consulta executada | Tipo: mais_frequente | Tempo: ${tempoExecucaoMs}ms | Registros: ${resFrequencia.totalRegistrosConsultados}`);
  return {
    sucesso: true,
    tipo: "mais_frequente",
    tempoExecucaoMs,
    totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
    dados: maisFrequente
  };
}
async function buscarObjetoMenosFrequente() {
  const inicio = Date.now();
  const resFrequencia = await buscarQuantidadePorObjeto();
  const tempoExecucaoMs = Date.now() - inicio;
  if (!resFrequencia.sucesso || !resFrequencia.dados || resFrequencia.dados.length === 0) {
    return {
      sucesso: false,
      tipo: "menos_frequente",
      tempoExecucaoMs,
      totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
      dados: null,
      mensagem: resFrequencia.mensagem || "Sem dados registrados no momento."
    };
  }
  const menosFrequente = resFrequencia.dados[resFrequencia.dados.length - 1];
  logger.info(`Consulta executada | Tipo: menos_frequente | Tempo: ${tempoExecucaoMs}ms | Registros: ${resFrequencia.totalRegistrosConsultados}`);
  return {
    sucesso: true,
    tipo: "menos_frequente",
    tempoExecucaoMs,
    totalRegistrosConsultados: resFrequencia.totalRegistrosConsultados,
    dados: menosFrequente
  };
}
async function buscarMaiorAtraso() {
  const inicio = Date.now();
  const supabase2 = getSupabase();
  if (!supabase2) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: "maior_atraso",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: "Banco de dados Supabase indispon\xEDvel no momento."
    };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("item, criado_em, rodada").order("criado_em", { ascending: false });
    const tempoExecucaoMs = Date.now() - inicio;
    if (error) {
      logger.error("Erro ao buscar maior atraso:", error.message);
      return {
        sucesso: false,
        tipo: "maior_atraso",
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: null,
        mensagem: error.message
      };
    }
    const totalRegistros = data ? data.length : 0;
    const atrasoMap = {};
    const ultimaOcorrenciaMap = {};
    const encontrados = /* @__PURE__ */ new Set();
    if (data) {
      data.forEach((row, index) => {
        const itemClean = normalizarEValidarObjeto(row.item);
        if (itemClean && !encontrados.has(itemClean)) {
          atrasoMap[itemClean] = index;
          ultimaOcorrenciaMap[itemClean] = row;
          encontrados.add(itemClean);
        }
      });
    }
    OBJETOS_VALIDOS.forEach((obj) => {
      if (!encontrados.has(obj)) {
        atrasoMap[obj] = totalRegistros;
        ultimaOcorrenciaMap[obj] = null;
      }
    });
    const rankingAtraso = OBJETOS_VALIDOS.map((objeto) => ({
      objeto,
      atrasoRodadas: atrasoMap[objeto],
      ultimaOcorrencia: ultimaOcorrenciaMap[objeto]
    })).sort((a, b) => b.atrasoRodadas - a.atrasoRodadas);
    const maiorAtrasoObjeto = rankingAtraso[0];
    logger.info(`Consulta executada | Tipo: maior_atraso | Tempo: ${tempoExecucaoMs}ms | Registros: ${totalRegistros}`);
    return {
      sucesso: true,
      tipo: "maior_atraso",
      tempoExecucaoMs,
      totalRegistrosConsultados: totalRegistros,
      dados: {
        objetoMaisAtrasado: maiorAtrasoObjeto,
        todosAtrasos: rankingAtraso
      }
    };
  } catch (err) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error("Exce\xE7\xE3o em buscarMaiorAtraso:", err?.message);
    return {
      sucesso: false,
      tipo: "maior_atraso",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: err?.message || "Erro inesperado na consulta."
    };
  }
}
async function buscarUltimaOcorrencia(objetoSolicitado) {
  const inicio = Date.now();
  const objetoClean = normalizarEValidarObjeto(objetoSolicitado);
  if (!objetoClean) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: "ultima_ocorrencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: `Objeto inv\xE1lido: "${objetoSolicitado}". Objetos permitidos: ${OBJETOS_VALIDOS.join(", ")}`
    };
  }
  const supabase2 = getSupabase();
  if (!supabase2) {
    const tempoExecucaoMs = Date.now() - inicio;
    return {
      sucesso: false,
      tipo: "ultima_ocorrencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: "Banco de dados Supabase indispon\xEDvel no momento."
    };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("*").order("criado_em", { ascending: false });
    const tempoExecucaoMs = Date.now() - inicio;
    if (error) {
      logger.error(`Erro ao buscar \xFAltima ocorr\xEAncia de ${objetoClean}:`, error.message);
      return {
        sucesso: false,
        tipo: "ultima_ocorrencia",
        tempoExecucaoMs,
        totalRegistrosConsultados: 0,
        dados: null,
        mensagem: error.message
      };
    }
    const totalRegistros = data ? data.length : 0;
    let indiceEncontrado = -1;
    let registroEncontrado = null;
    if (data) {
      for (let i = 0; i < data.length; i++) {
        if (normalizarEValidarObjeto(data[i].item) === objetoClean) {
          indiceEncontrado = i;
          registroEncontrado = data[i];
          break;
        }
      }
    }
    const dadosRetorno = {
      objeto: objetoClean,
      encontrado: indiceEncontrado !== -1,
      atrasoRodadas: indiceEncontrado !== -1 ? indiceEncontrado : totalRegistros,
      ultimaRodada: registroEncontrado?.rodada || null,
      horario: registroEncontrado?.criado_em || null,
      detalhesRegistro: registroEncontrado
    };
    logger.info(`Consulta executada | Tipo: ultima_ocorrencia | Objeto: ${objetoClean} | Tempo: ${tempoExecucaoMs}ms | Registros: ${totalRegistros}`);
    return {
      sucesso: true,
      tipo: "ultima_ocorrencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: totalRegistros,
      dados: dadosRetorno
    };
  } catch (err) {
    const tempoExecucaoMs = Date.now() - inicio;
    logger.error("Exce\xE7\xE3o em buscarUltimaOcorrencia:", err?.message);
    return {
      sucesso: false,
      tipo: "ultima_ocorrencia",
      tempoExecucaoMs,
      totalRegistrosConsultados: 0,
      dados: null,
      mensagem: err?.message || "Erro inesperado na consulta."
    };
  }
}

// src/services/transicaoService.ts
var OBJETOS_PERMITIDOS = [
  "sorvete",
  "boia",
  "balao",
  "soco",
  "tedy",
  "princesa",
  "camera",
  "coroa"
];
function normalizarObjeto(item) {
  if (!item) return null;
  const limpo = item.trim().toLowerCase();
  if (OBJETOS_PERMITIDOS.includes(limpo)) {
    return limpo;
  }
  return null;
}
async function registrarTransicao(itemAnterior, itemAtual) {
  const de = normalizarObjeto(itemAnterior);
  const para = normalizarObjeto(itemAtual);
  if (!de || !para) {
    logger.warn(`Transi\xE7\xE3o inv\xE1lida ignorada: "${itemAnterior}" -> "${itemAtual}"`);
    return { sucesso: false, mensagem: "Itens inv\xE1lidos" };
  }
  const supabase2 = getSupabase();
  if (!supabase2) {
    logger.warn("Supabase indispon\xEDvel ao registrar transi\xE7\xE3o");
    return { sucesso: false, mensagem: "Supabase indispon\xEDvel" };
  }
  try {
    logger.info(`Registrando transi\xE7\xE3o hist\xF3rica: ${de} -> ${para}`);
    let { error } = await supabase2.from("transicoes").insert([
      {
        de,
        para,
        criado_em: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]);
    if (error) {
      const resAlt = await supabase2.from("transicoes").insert([
        {
          resultado_anterior: de,
          resultado_atual: para,
          criado_em: (/* @__PURE__ */ new Date()).toISOString()
        }
      ]);
      if (resAlt.error) {
        logger.warn(`Nota: Tabela 'transicoes' indispon\xEDvel ou com esquema diferente (${error.message}). Transi\xE7\xF5es ser\xE3o calculadas dinamicamente a partir de 'resultados'.`);
      }
    }
    return { sucesso: true };
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao registrar transi\xE7\xE3o:", err?.message);
    return { sucesso: false, mensagem: err?.message };
  }
}
async function obterTodasTransicoesCronologicas() {
  const supabase2 = getSupabase();
  if (!supabase2) return [];
  try {
    const { data, error } = await supabase2.from("resultados").select("item, criado_em").order("criado_em", { ascending: true });
    if (error || !data || data.length < 2) return [];
    const transicoes = [];
    for (let i = 0; i < data.length - 1; i++) {
      const de = normalizarObjeto(data[i].item);
      const para = normalizarObjeto(data[i + 1].item);
      if (de && para) {
        transicoes.push({
          de,
          para,
          criadoEm: data[i + 1].criado_em
        });
      }
    }
    return transicoes;
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao obter transi\xE7\xF5es cronol\xF3gicas:", err?.message);
    return [];
  }
}
async function buscarDepoisDe(objetoSolicitado) {
  const inicio = Date.now();
  const objNormalizado = normalizarObjeto(objetoSolicitado);
  if (!objNormalizado) {
    const tempoExecucaoMs2 = Date.now() - inicio;
    return {
      sucesso: false,
      objeto: objetoSolicitado,
      totalOcorrenciasAnterior: 0,
      tempoExecucaoMs: tempoExecucaoMs2,
      dados: [],
      mensagem: `Objeto inv\xE1lido: "${objetoSolicitado}". Objetos permitidos: ${OBJETOS_PERMITIDOS.join(", ")}`
    };
  }
  const transicoes = await obterTodasTransicoesCronologicas();
  const tempoExecucaoMs = Date.now() - inicio;
  const contagemSucessores = {};
  let totalOcorrencias = 0;
  transicoes.forEach((t) => {
    if (t.de === objNormalizado) {
      contagemSucessores[t.para] = (contagemSucessores[t.para] || 0) + 1;
      totalOcorrencias++;
    }
  });
  const listaFormatada = Object.entries(contagemSucessores).map(([sucessor, vezes]) => {
    const pct = totalOcorrencias > 0 ? vezes / totalOcorrencias * 100 : 0;
    return {
      resultado: sucessor,
      vezes,
      porcentagem: `${pct.toFixed(2)}%`,
      porcentagemNumero: Number(pct.toFixed(2))
    };
  }).sort((a, b) => b.vezes - a.vezes);
  logger.info(`Consulta transi\xE7\xF5es depois de "${objNormalizado}" | Total ocorr\xEAncias: ${totalOcorrencias} | Tempo: ${tempoExecucaoMs}ms`);
  return {
    sucesso: true,
    objeto: objNormalizado,
    totalOcorrenciasAnterior: totalOcorrencias,
    tempoExecucaoMs,
    dados: listaFormatada
  };
}
async function buscarMaisProvavelDepoisDe(objetoSolicitado) {
  const inicio = Date.now();
  const resDepois = await buscarDepoisDe(objetoSolicitado);
  const tempoExecucaoMs = Date.now() - inicio;
  const objNormalizado = normalizarObjeto(objetoSolicitado) || objetoSolicitado;
  if (!resDepois.sucesso || resDepois.totalOcorrenciasAnterior === 0 || resDepois.dados.length === 0) {
    return {
      objetoAnterior: objNormalizado,
      resultadoMaisProvavel: null,
      ocorrencias: 0,
      probabilidadeHistorica: "0.00%",
      totalOcorrenciasAnterior: resDepois.totalOcorrenciasAnterior,
      dadosInsuficientes: true,
      mensagem: `Dados insuficientes para uma an\xE1lise confi\xE1vel sobre "${objNormalizado}".`,
      listaTodosSucessores: []
    };
  }
  const topSucessor = resDepois.dados[0];
  const dadosInsuficientes = resDepois.totalOcorrenciasAnterior < 3;
  logger.info(`Mais prov\xE1vel depois de "${objNormalizado}" -> ${topSucessor.resultado} (${topSucessor.porcentagem}) | Tempo: ${tempoExecucaoMs}ms`);
  return {
    objetoAnterior: objNormalizado,
    resultadoMaisProvavel: topSucessor.resultado,
    ocorrencias: topSucessor.vezes,
    probabilidadeHistorica: topSucessor.porcentagem,
    totalOcorrenciasAnterior: resDepois.totalOcorrenciasAnterior,
    dadosInsuficientes,
    mensagem: dadosInsuficientes ? `Dados insuficientes para uma an\xE1lise confi\xE1vel (apenas ${resDepois.totalOcorrenciasAnterior} ocorr\xEAncia(s) de "${objNormalizado}").` : void 0,
    listaTodosSucessores: resDepois.dados
  };
}
async function buscarTransicaoEspecifica(anteriorSolicitado, atualSolicitado) {
  const de = normalizarObjeto(anteriorSolicitado) || anteriorSolicitado;
  const para = normalizarObjeto(atualSolicitado) || atualSolicitado;
  const transicoes = await obterTodasTransicoesCronologicas();
  let quantidade = 0;
  let totalAnterior = 0;
  let ultimaOcorrencia = null;
  transicoes.forEach((t) => {
    if (t.de === de) {
      totalAnterior++;
      if (t.para === para) {
        quantidade++;
        ultimaOcorrencia = t.criadoEm;
      }
    }
  });
  const pct = totalAnterior > 0 ? quantidade / totalAnterior * 100 : 0;
  return {
    anterior: de,
    atual: para,
    quantidade,
    percentual: `${pct.toFixed(2)}%`,
    percentualNumero: Number(pct.toFixed(2)),
    totalOcorrenciasAnterior: totalAnterior,
    ultimaOcorrencia
  };
}

// src/services/sequenciaService.ts
function normalizarObjeto2(item) {
  if (!item) return null;
  const limpo = item.trim().toLowerCase();
  if (OBJETOS_PERMITIDOS.includes(limpo)) {
    return limpo;
  }
  return null;
}
async function obterHistoricoCronologico() {
  const supabase2 = getSupabase();
  if (!supabase2) return { itens: [], criadoEms: [] };
  try {
    const { data, error } = await supabase2.from("resultados").select("item, criado_em").order("criado_em", { ascending: true });
    if (error || !data) return { itens: [], criadoEms: [] };
    const itens = [];
    const criadoEms = [];
    data.forEach((row) => {
      const norm = normalizarObjeto2(row.item);
      if (norm) {
        itens.push(norm);
        criadoEms.push(row.criado_em);
      }
    });
    return { itens, criadoEms };
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao buscar hist\xF3rico para an\xE1lise de sequ\xEAncias:", err?.message);
    return { itens: [], criadoEms: [] };
  }
}
async function buscarProximoDepoisDaSequencia(sequenciaEntrada) {
  const inicio = Date.now();
  const seqValida = sequenciaEntrada.map(normalizarObjeto2).filter((item) => item !== null);
  const seqTexto = seqValida.join(" \u2192 ");
  if (seqValida.length === 0) {
    const tempoExecucaoMs2 = Date.now() - inicio;
    return {
      sequencia: [],
      sequenciaTexto: "",
      totalOcorrenciasSequencia: 0,
      resultadoMaisProvavel: null,
      probabilidadeHistorica: "0.00%",
      dadosInsuficientes: true,
      mensagem: "Sequ\xEAncia inv\xE1lida ou vazia.",
      sucessores: [],
      tempoExecucaoMs: tempoExecucaoMs2,
      totalRegistrosAnalisados: 0
    };
  }
  const { itens } = await obterHistoricoCronologico();
  const L = seqValida.length;
  const N = itens.length;
  let totalOcorrencias = 0;
  const contagemSucessores = {};
  for (let i = 0; i <= N - L; i++) {
    let bateu = true;
    for (let k = 0; k < L; k++) {
      if (itens[i + k] !== seqValida[k]) {
        bateu = false;
        break;
      }
    }
    if (bateu) {
      totalOcorrencias++;
      if (i + L < N) {
        const proximo = itens[i + L];
        contagemSucessores[proximo] = (contagemSucessores[proximo] || 0) + 1;
      }
    }
  }
  const tempoExecucaoMs = Date.now() - inicio;
  const sucessores = Object.entries(contagemSucessores).map(([resultado, vezes]) => {
    const pct = totalOcorrencias > 0 ? vezes / totalOcorrencias * 100 : 0;
    return {
      resultado,
      vezes,
      porcentagem: `${pct.toFixed(2)}%`,
      porcentagemNumero: Number(pct.toFixed(2))
    };
  }).sort((a, b) => b.vezes - a.vezes);
  const topSucessor = sucessores.length > 0 ? sucessores[0] : null;
  const dadosInsuficientes = totalOcorrencias < 20;
  const mensagem = dadosInsuficientes ? "Dados insuficientes para identificar um padr\xE3o confi\xE1vel." : void 0;
  logger.info(
    `An\xE1lise de Sequ\xEAncia [${seqTexto}] | Registros analisados: ${N} | Ocorr\xEAncias da sequ\xEAncia: ${totalOcorrencias} | Tempo: ${tempoExecucaoMs}ms`
  );
  return {
    sequencia: seqValida,
    sequenciaTexto: seqTexto,
    totalOcorrenciasSequencia: totalOcorrencias,
    resultadoMaisProvavel: topSucessor ? topSucessor.resultado : null,
    probabilidadeHistorica: topSucessor ? topSucessor.porcentagem : "0.00%",
    dadosInsuficientes,
    mensagem,
    sucessores,
    tempoExecucaoMs,
    totalRegistrosAnalisados: N
  };
}
async function analisarSequencia3(seqFiltro) {
  const inicio = Date.now();
  const { itens } = await obterHistoricoCronologico();
  const N = itens.length;
  const tamanho = 3;
  if (N < tamanho) {
    const tempoExecucaoMs2 = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: 0,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs: tempoExecucaoMs2,
      dadosInsuficientes: true,
      mensagem: "Dados insuficientes para identificar um padr\xE3o confi\xE1vel.",
      topSequencias: []
    };
  }
  if (seqFiltro && seqFiltro.length === 3) {
    const resProximo = await buscarProximoDepoisDaSequencia(seqFiltro);
    const totalFatias2 = N - tamanho + 1;
    const pct = totalFatias2 > 0 ? resProximo.totalOcorrenciasSequencia / totalFatias2 * 100 : 0;
    const tempoExecucaoMs2 = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: totalFatias2,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs: tempoExecucaoMs2,
      dadosInsuficientes: resProximo.dadosInsuficientes,
      mensagem: resProximo.mensagem,
      topSequencias: [
        {
          sequencia: resProximo.sequencia,
          sequenciaTexto: resProximo.sequenciaTexto,
          quantidade: resProximo.totalOcorrenciasSequencia,
          porcentagem: `${pct.toFixed(2)}%`,
          porcentagemNumero: Number(pct.toFixed(2)),
          proximosResultados: resProximo.sucessores
        }
      ]
    };
  }
  const contagem = {};
  let totalFatias = 0;
  for (let i = 0; i <= N - tamanho; i++) {
    const slice = [itens[i], itens[i + 1], itens[i + 2]];
    const key = slice.join("\u2192");
    totalFatias++;
    if (!contagem[key]) {
      contagem[key] = { seq: slice, count: 0, proximos: {} };
    }
    contagem[key].count++;
    if (i + tamanho < N) {
      const proximo = itens[i + tamanho];
      contagem[key].proximos[proximo] = (contagem[key].proximos[proximo] || 0) + 1;
    }
  }
  const topSequencias = Object.values(contagem).sort((a, b) => b.count - a.count).slice(0, 10).map((item) => {
    const pct = totalFatias > 0 ? item.count / totalFatias * 100 : 0;
    const proximosResultados = Object.entries(item.proximos).map(([res, vezes]) => {
      const p = item.count > 0 ? vezes / item.count * 100 : 0;
      return {
        resultado: res,
        vezes,
        porcentagem: `${p.toFixed(2)}%`,
        porcentagemNumero: Number(p.toFixed(2))
      };
    }).sort((a, b) => b.vezes - a.vezes);
    return {
      sequencia: item.seq,
      sequenciaTexto: item.seq.join(" \u2192 "),
      quantidade: item.count,
      porcentagem: `${pct.toFixed(2)}%`,
      porcentagemNumero: Number(pct.toFixed(2)),
      proximosResultados
    };
  });
  const tempoExecucaoMs = Date.now() - inicio;
  const maiorQuantidade = topSequencias.length > 0 ? topSequencias[0].quantidade : 0;
  const dadosInsuficientes = maiorQuantidade < 20;
  logger.info(`An\xE1lise Sequ\xEAncia 3 | Total fatias: ${totalFatias} | Tempo: ${tempoExecucaoMs}ms`);
  return {
    sucesso: true,
    tamanhoSequencia: tamanho,
    totalFatiasAnalisadas: totalFatias,
    totalRegistrosAnalisados: N,
    tempoExecucaoMs,
    dadosInsuficientes,
    mensagem: dadosInsuficientes ? "Dados insuficientes para identificar um padr\xE3o confi\xE1vel." : void 0,
    topSequencias
  };
}
async function analisarSequencia4(seqFiltro) {
  const inicio = Date.now();
  const { itens } = await obterHistoricoCronologico();
  const N = itens.length;
  const tamanho = 4;
  if (N < tamanho) {
    const tempoExecucaoMs2 = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: 0,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs: tempoExecucaoMs2,
      dadosInsuficientes: true,
      mensagem: "Dados insuficientes para identificar um padr\xE3o confi\xE1vel.",
      topSequencias: []
    };
  }
  if (seqFiltro && seqFiltro.length === 4) {
    const resProximo = await buscarProximoDepoisDaSequencia(seqFiltro);
    const totalFatias2 = N - tamanho + 1;
    const pct = totalFatias2 > 0 ? resProximo.totalOcorrenciasSequencia / totalFatias2 * 100 : 0;
    const tempoExecucaoMs2 = Date.now() - inicio;
    return {
      sucesso: true,
      tamanhoSequencia: tamanho,
      totalFatiasAnalisadas: totalFatias2,
      totalRegistrosAnalisados: N,
      tempoExecucaoMs: tempoExecucaoMs2,
      dadosInsuficientes: resProximo.dadosInsuficientes,
      mensagem: resProximo.mensagem,
      topSequencias: [
        {
          sequencia: resProximo.sequencia,
          sequenciaTexto: resProximo.sequenciaTexto,
          quantidade: resProximo.totalOcorrenciasSequencia,
          porcentagem: `${pct.toFixed(2)}%`,
          porcentagemNumero: Number(pct.toFixed(2)),
          proximosResultados: resProximo.sucessores
        }
      ]
    };
  }
  const contagem = {};
  let totalFatias = 0;
  for (let i = 0; i <= N - tamanho; i++) {
    const slice = [itens[i], itens[i + 1], itens[i + 2], itens[i + 3]];
    const key = slice.join("\u2192");
    totalFatias++;
    if (!contagem[key]) {
      contagem[key] = { seq: slice, count: 0, proximos: {} };
    }
    contagem[key].count++;
    if (i + tamanho < N) {
      const proximo = itens[i + tamanho];
      contagem[key].proximos[proximo] = (contagem[key].proximos[proximo] || 0) + 1;
    }
  }
  const topSequencias = Object.values(contagem).sort((a, b) => b.count - a.count).slice(0, 10).map((item) => {
    const pct = totalFatias > 0 ? item.count / totalFatias * 100 : 0;
    const proximosResultados = Object.entries(item.proximos).map(([res, vezes]) => {
      const p = item.count > 0 ? vezes / item.count * 100 : 0;
      return {
        resultado: res,
        vezes,
        porcentagem: `${p.toFixed(2)}%`,
        porcentagemNumero: Number(p.toFixed(2))
      };
    }).sort((a, b) => b.vezes - a.vezes);
    return {
      sequencia: item.seq,
      sequenciaTexto: item.seq.join(" \u2192 "),
      quantidade: item.count,
      porcentagem: `${pct.toFixed(2)}%`,
      porcentagemNumero: Number(pct.toFixed(2)),
      proximosResultados
    };
  });
  const tempoExecucaoMs = Date.now() - inicio;
  const maiorQuantidade = topSequencias.length > 0 ? topSequencias[0].quantidade : 0;
  const dadosInsuficientes = maiorQuantidade < 20;
  logger.info(`An\xE1lise Sequ\xEAncia 4 | Total fatias: ${totalFatias} | Tempo: ${tempoExecucaoMs}ms`);
  return {
    sucesso: true,
    tamanhoSequencia: tamanho,
    totalFatiasAnalisadas: totalFatias,
    totalRegistrosAnalisados: N,
    tempoExecucaoMs,
    dadosInsuficientes,
    mensagem: dadosInsuficientes ? "Dados insuficientes para identificar um padr\xE3o confi\xE1vel." : void 0,
    topSequencias
  };
}

// src/routes/consultar.ts
var router2 = Router2();
router2.post("/consultar", async (req, res) => {
  try {
    const { tipo, objeto, objetoAnterior, objetoAtual, sequencia, limite = 10 } = req.body || {};
    if (!tipo) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O par\xE2metro "tipo" \xE9 obrigat\xF3rio. Tipos aceitos: ultimos, frequencia, mais_frequente, menos_frequente, maior_atraso, ultima_ocorrencia, depois_de, mais_provavel_depois, transicao_especifica, sequencia_3, sequencia_4, proximo_depois_sequencia'
      });
    }
    const tipoNormalizado = String(tipo).trim().toLowerCase();
    let resultado;
    switch (tipoNormalizado) {
      case "ultimos":
        resultado = await buscarUltimosResultados(Number(limite) || 10);
        break;
      case "resultado_anterior":
      case "anterior":
        resultado = await buscarResultadoAnterior();
        break;
      case "frequencia":
      case "quantidade":
        resultado = await buscarQuantidadePorObjeto();
        break;
      case "mais_frequente":
      case "mais_saiu":
        resultado = await buscarObjetoMaisFrequente();
        break;
      case "menos_frequente":
      case "menos_saiu":
        resultado = await buscarObjetoMenosFrequente();
        break;
      case "maior_atraso":
      case "atraso":
        resultado = await buscarMaiorAtraso();
        break;
      case "ultima_ocorrencia":
      case "ultima_vez":
        if (!objeto) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O par\xE2metro "objeto" \xE9 obrigat\xF3rio para consultas do tipo ultima_ocorrencia.'
          });
        }
        resultado = await buscarUltimaOcorrencia(String(objeto));
        break;
      case "depois_de":
      case "sucessores":
        if (!objeto && !objetoAnterior) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O par\xE2metro "objeto" \xE9 obrigat\xF3rio para consultas do tipo depois_de.'
          });
        }
        resultado = await buscarDepoisDe(String(objeto || objetoAnterior));
        break;
      case "mais_provavel_depois":
      case "proximo_provavel":
        if (!objeto && !objetoAnterior) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O par\xE2metro "objeto" \xE9 obrigat\xF3rio para consultas do tipo mais_provavel_depois.'
          });
        }
        resultado = await buscarMaisProvavelDepoisDe(String(objeto || objetoAnterior));
        break;
      case "transicao_especifica":
        if (!objetoAnterior || !objetoAtual) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'Os par\xE2metros "objetoAnterior" e "objetoAtual" s\xE3o obrigat\xF3rios para transicao_especifica.'
          });
        }
        resultado = await buscarTransicaoEspecifica(String(objetoAnterior), String(objetoAtual));
        break;
      case "sequencia_3":
      case "sequencia3":
        resultado = await analisarSequencia3(Array.isArray(sequencia) ? sequencia : void 0);
        break;
      case "sequencia_4":
      case "sequencia4":
        resultado = await analisarSequencia4(Array.isArray(sequencia) ? sequencia : void 0);
        break;
      case "proximo_depois_sequencia":
      case "proximo_sequencia":
        if (!Array.isArray(sequencia) || sequencia.length === 0) {
          return res.status(400).json({
            sucesso: false,
            mensagem: 'O par\xE2metro "sequencia" (array de strings) \xE9 obrigat\xF3rio para proximo_depois_sequencia.'
          });
        }
        resultado = await buscarProximoDepoisDaSequencia(sequencia);
        break;
      default:
        return res.status(400).json({
          sucesso: false,
          mensagem: `Tipo de consulta desconhecido: "${tipo}". Tipos aceitos: ultimos, frequencia, mais_frequente, menos_frequente, maior_atraso, ultima_ocorrencia, depois_de, mais_provavel_depois, transicao_especifica, sequencia_3, sequencia_4, proximo_depois_sequencia`
        });
    }
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro no endpoint /api/consultar:", error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || "Erro interno ao processar a consulta."
    });
  }
});
var consultar_default = router2;

// src/routes/padroes.ts
import { Router as Router3 } from "express";

// src/services/padraoService.ts
function normalizarObjeto3(item) {
  if (!item) return null;
  const limpo = item.trim().toLowerCase();
  if (OBJETOS_PERMITIDOS.includes(limpo)) {
    return limpo;
  }
  return null;
}
function calcularNivelConfianca(ocorrencias) {
  if (ocorrencias > 100) return "ALTA";
  if (ocorrencias >= 20) return "M\xC9DIA";
  return "BAIXA";
}
async function obterHistoricoCronologico2() {
  const supabase2 = getSupabase();
  if (!supabase2) return { itens: [], criadoEms: [] };
  try {
    const { data, error } = await supabase2.from("resultados").select("item, criado_em").order("criado_em", { ascending: true });
    if (error || !data) return { itens: [], criadoEms: [] };
    const itens = [];
    const criadoEms = [];
    data.forEach((row) => {
      const norm = normalizarObjeto3(row.item);
      if (norm) {
        itens.push(norm);
        criadoEms.push(row.criado_em);
      }
    });
    return { itens, criadoEms };
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao buscar hist\xF3rico no padraoService:", err?.message);
    return { itens: [], criadoEms: [] };
  }
}
async function detectarAlternancias(historicoItens) {
  const itens = historicoItens || (await obterHistoricoCronologico2()).itens;
  const N = itens.length;
  if (N < 4) return [];
  const paresContagem = {};
  for (let i = 0; i < N - 3; i++) {
    const a = itens[i];
    const b = itens[i + 1];
    if (a !== b) {
      if (itens[i + 2] === a && itens[i + 3] === b) {
        const key = [a, b].sort().join("\u2194");
        if (!paresContagem[key]) {
          paresContagem[key] = { objA: a < b ? a : b, objB: a < b ? b : a, count: 0 };
        }
        paresContagem[key].count++;
      }
    }
  }
  const resultados = Object.values(paresContagem).sort((x, y) => y.count - x.count).map((item) => {
    const confianca = calcularNivelConfianca(item.count);
    return {
      tipo: "alternancia",
      objetos: [item.objA, item.objB],
      ocorrencias: item.count,
      confianca,
      descricao: `Altern\xE2ncia entre ${item.objA} e ${item.objB} identificada ${item.count} vezes (${confianca} confian\xE7a).`
    };
  });
  return resultados;
}
async function detectarRepeticoes(historicoItens) {
  const itens = historicoItens || (await obterHistoricoCronologico2()).itens;
  const N = itens.length;
  if (N < 2) return [];
  const estatisticasRep = {};
  OBJETOS_PERMITIDOS.forEach((obj) => {
    estatisticasRep[obj] = { maxRun: 0, totalRuns: 0, runCount2: 0, runCount3Plus: 0 };
  });
  let curItem = itens[0];
  let curRun = 1;
  for (let i = 1; i < N; i++) {
    if (itens[i] === curItem) {
      curRun++;
    } else {
      if (curRun >= 2 && estatisticasRep[curItem]) {
        estatisticasRep[curItem].totalRuns++;
        if (curRun === 2) estatisticasRep[curItem].runCount2++;
        if (curRun >= 3) estatisticasRep[curItem].runCount3Plus++;
        if (curRun > estatisticasRep[curItem].maxRun) {
          estatisticasRep[curItem].maxRun = curRun;
        }
      }
      curItem = itens[i];
      curRun = 1;
    }
  }
  if (curRun >= 2 && estatisticasRep[curItem]) {
    estatisticasRep[curItem].totalRuns++;
    if (curRun === 2) estatisticasRep[curItem].runCount2++;
    if (curRun >= 3) estatisticasRep[curItem].runCount3Plus++;
    if (curRun > estatisticasRep[curItem].maxRun) {
      estatisticasRep[curItem].maxRun = curRun;
    }
  }
  const resultados = Object.entries(estatisticasRep).filter(([_, stats]) => stats.totalRuns > 0).map(([objeto, stats]) => {
    const confianca = calcularNivelConfianca(stats.totalRuns);
    return {
      tipo: "repeticao",
      objeto,
      quantidadeMaiorSequencia: stats.maxRun,
      ocorrenciasTotais: stats.totalRuns,
      confianca,
      descricao: `${objeto} repetiu-se consecutivamente ${stats.totalRuns} vezes (maior sequ\xEAncia: ${stats.maxRun}x em seguida).`
    };
  }).sort((a, b) => b.ocorrenciasTotais - a.ocorrenciasTotais);
  return resultados;
}
async function detectarAtrasos(historicoItens, criadoEms) {
  const data = historicoItens ? { itens: historicoItens, criadoEms: criadoEms || [] } : await obterHistoricoCronologico2();
  const N = data.itens.length;
  const ultimosIndices = {};
  OBJETOS_PERMITIDOS.forEach((obj) => {
    ultimosIndices[obj] = { index: -1, dataEm: null };
  });
  for (let i = 0; i < N; i++) {
    const item = data.itens[i];
    if (ultimosIndices[item]) {
      ultimosIndices[item] = {
        index: i,
        dataEm: data.criadoEms[i] || null
      };
    }
  }
  const itensFormatados = OBJETOS_PERMITIDOS.map((objeto) => {
    const info = ultimosIndices[objeto];
    const rodadasSemAparecer = info.index === -1 ? N : N - 1 - info.index;
    return {
      objeto,
      ultimaOcorrenciaEm: info.dataEm,
      rodadasSemAparecer,
      atrasoRelativo: `${rodadasSemAparecer} rodada(s) sem sair`
    };
  }).sort((a, b) => b.rodadasSemAparecer - a.rodadasSemAparecer);
  const objetoMaisAtrasado = itensFormatados.length > 0 ? itensFormatados[0].objeto : null;
  const maiorAtrasoRodadas = itensFormatados.length > 0 ? itensFormatados[0].rodadasSemAparecer : 0;
  return {
    tipo: "atrasos",
    totalRodadasAnalisadas: N,
    objetoMaisAtrasado,
    maiorAtrasoRodadas,
    itens: itensFormatados
  };
}
async function detectarPadroesRecentes(tamanhoJanela = 50, historicoItens) {
  const itens = historicoItens || (await obterHistoricoCronologico2()).itens;
  const N = itens.length;
  if (N === 0) {
    return {
      tipo: "padroes_recentes",
      janela: tamanhoJanela,
      totalRodadasGerais: 0,
      comparacoes: []
    };
  }
  const janelaReal = Math.min(tamanhoJanela, N);
  const itensJanela = itens.slice(N - janelaReal);
  const contagemJanela = {};
  const contagemGeral = {};
  OBJETOS_PERMITIDOS.forEach((obj) => {
    contagemJanela[obj] = 0;
    contagemGeral[obj] = 0;
  });
  itensJanela.forEach((item) => {
    if (contagemJanela[item] !== void 0) contagemJanela[item]++;
  });
  itens.forEach((item) => {
    if (contagemGeral[item] !== void 0) contagemGeral[item]++;
  });
  const comparacoes = OBJETOS_PERMITIDOS.map((objeto) => {
    const countJan = contagemJanela[objeto] || 0;
    const countGer = contagemGeral[objeto] || 0;
    const pctJan = countJan / janelaReal * 100;
    const pctGer = countGer / N * 100;
    const diff = pctJan - pctGer;
    let tendencia = "estavel";
    if (diff >= 3) tendencia = "alta";
    else if (diff <= -3) tendencia = "baixa";
    return {
      objeto,
      freqJanelaRecente: countJan,
      pctJanelaRecente: `${pctJan.toFixed(2)}%`,
      pctGeralHistorico: `${pctGer.toFixed(2)}%`,
      diferencaPct: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`,
      tendencia
    };
  }).sort((a, b) => b.freqJanelaRecente - a.freqJanelaRecente);
  return {
    tipo: "padroes_recentes",
    janela: janelaReal,
    totalRodadasGerais: N,
    comparacoes
  };
}
async function detectarSequenciasFrequentes() {
  const [res3, res4] = await Promise.all([analisarSequencia3(), analisarSequencia4()]);
  const lista = [];
  if (res3.sucesso && res3.topSequencias) {
    res3.topSequencias.slice(0, 5).forEach((seq) => {
      lista.push({
        tipo: "sequencia_frequente",
        tamanho: 3,
        sequenciaTexto: seq.sequenciaTexto,
        quantidade: seq.quantidade,
        porcentagem: seq.porcentagem,
        confianca: calcularNivelConfianca(seq.quantidade)
      });
    });
  }
  if (res4.sucesso && res4.topSequencias) {
    res4.topSequencias.slice(0, 5).forEach((seq) => {
      lista.push({
        tipo: "sequencia_frequente",
        tamanho: 4,
        sequenciaTexto: seq.sequenciaTexto,
        quantidade: seq.quantidade,
        porcentagem: seq.porcentagem,
        confianca: calcularNivelConfianca(seq.quantidade)
      });
    });
  }
  return lista.sort((a, b) => b.quantidade - a.quantidade);
}
async function salvarPadraoDetectadoNoBanco(sessaoId, tipoPadrao, descricao, dadosJson, quantidadeOcorrencias, nivelConfianca) {
  const supabase2 = getSupabase();
  if (!supabase2) return;
  try {
    const { error } = await supabase2.from("padroes_detectados").insert([
      {
        sessao_id: sessaoId || null,
        tipo_padrao: tipoPadrao,
        descricao,
        dados_json: dadosJson,
        quantidade_ocorrencias: quantidadeOcorrencias,
        nivel_confianca: nivelConfianca,
        criado_em: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]);
    if (error) {
      logger.warn(`Aviso: Tabela 'padroes_detectados' indispon\xEDvel (${error.message}). A an\xE1lise continuar\xE1 em mem\xF3ria/consulta direta.`);
    }
  } catch (err) {
    logger.warn(`Erro n\xE3o-bloqueante ao salvar padr\xE3o no Supabase: ${err?.message}`);
  }
}
async function executarDetectorPadroes(sessaoId) {
  const inicio = Date.now();
  const { itens, criadoEms } = await obterHistoricoCronologico2();
  const N = itens.length;
  const [alternancias, repeticoes, atrasos, recentes, sequencias] = await Promise.all([
    detectarAlternancias(itens),
    detectarRepeticoes(itens),
    detectarAtrasos(itens, criadoEms),
    detectarPadroesRecentes(50, itens),
    detectarSequenciasFrequentes()
  ]);
  const tempoExecucaoMs = Date.now() - inicio;
  const maiorQtd = Math.max(
    alternancias.length > 0 ? alternancias[0].ocorrencias : 0,
    repeticoes.length > 0 ? repeticoes[0].ocorrenciasTotais : 0,
    sequencias.length > 0 ? sequencias[0].quantidade : 0
  );
  const resumoConfiancaGeral = calcularNivelConfianca(maiorQtd);
  if (alternancias.length > 0) {
    const topAlt = alternancias[0];
    salvarPadraoDetectadoNoBanco(
      sessaoId || null,
      "alternancia",
      topAlt.descricao,
      topAlt,
      topAlt.ocorrencias,
      topAlt.confianca
    ).catch(() => {
    });
  }
  if (repeticoes.length > 0) {
    const topRep = repeticoes[0];
    salvarPadraoDetectadoNoBanco(
      sessaoId || null,
      "repeticao",
      topRep.descricao,
      topRep,
      topRep.ocorrenciasTotais,
      topRep.confianca
    ).catch(() => {
    });
  }
  logger.info(
    `Detector de Padr\xF5es Executado | Registros: ${N} | Altern\xE2ncias: ${alternancias.length} | Repeti\xE7\xF5es: ${repeticoes.length} | Tempo: ${tempoExecucaoMs}ms`
  );
  return {
    sucesso: true,
    tempoExecucaoMs,
    totalRegistrosAnalisados: N,
    padroesAtivos: {
      alternancias,
      repeticoes,
      atrasos,
      sequenciasFrequentes: sequencias
    },
    padroesRecentes: recentes,
    resumoConfiancaGeral
  };
}

// src/routes/padroes.ts
var router3 = Router3();
router3.get("/padroes", async (req, res) => {
  try {
    const resultado = await executarDetectorPadroes();
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro na rota GET /api/padroes:", error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || "Erro ao processar a detec\xE7\xE3o de padr\xF5es."
    });
  }
});
var padroes_default = router3;

// src/routes/dashboard.ts
import { Router as Router4 } from "express";

// src/services/sessaoService.ts
async function obterSessaoAtual() {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return { data: null, error: new Error("Supabase cliente n\xE3o dispon\xEDvel") };
  }
  try {
    let res = await supabase2.from("sessoes").select("*").order("iniciada_em", { ascending: false }).limit(1).maybeSingle();
    if (res.error && res.error.message.includes("iniciada_em")) {
      res = await supabase2.from("sessoes").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
    }
    return { data: res.data, error: res.error };
  } catch (err) {
    return { data: null, error: err };
  }
}
async function criarSessao(dadosSessao) {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return { data: null, error: new Error("Supabase cliente n\xE3o dispon\xEDvel") };
  }
  try {
    const payload = {
      criado_em: (/* @__PURE__ */ new Date()).toISOString(),
      ...dadosSessao
    };
    delete payload.iniciada_em;
    let { data, error } = await supabase2.from("sessoes").insert([payload]).select().single();
    if (error && error.message.includes("status")) {
      delete payload.status;
      const resAlt = await supabase2.from("sessoes").insert([payload]).select().single();
      data = resAlt.data;
      error = resAlt.error;
    }
    if (error) {
      logger.error("Erro ao criar sess\xE3o:", error.message);
    }
    return { data, error };
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao criar sess\xE3o:", err?.message);
    return { data: null, error: err };
  }
}

// src/services/dashboardService.ts
function normalizarObjeto4(item) {
  if (!item) return null;
  const limpo = item.trim().toLowerCase();
  if (OBJETOS_PERMITIDOS.includes(limpo)) {
    return limpo;
  }
  return null;
}
function formatarHorario(isoString) {
  if (!isoString) return "--:--:--";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoString;
  }
}
async function obterResumoGeral() {
  const supabase2 = getSupabase();
  const sessaoRes = await obterSessaoAtual();
  const sessaoAtual = sessaoRes?.data?.id || null;
  if (!supabase2) {
    return {
      totalRodadas: 0,
      sessaoAtual,
      ultimoResultado: null,
      horarioUltimoResultado: null
    };
  }
  try {
    const { data, count, error } = await supabase2.from("resultados").select("rodada, item, criado_em", { count: "exact" }).order("criado_em", { ascending: false }).limit(1);
    if (error || !data) {
      return {
        totalRodadas: 0,
        sessaoAtual,
        ultimoResultado: null,
        horarioUltimoResultado: null
      };
    }
    const total = count || data.length;
    const ultimo = data.length > 0 ? data[0] : null;
    const norm = ultimo ? normalizarObjeto4(ultimo.item) : null;
    const horario = ultimo ? formatarHorario(ultimo.criado_em) : null;
    return {
      totalRodadas: total,
      sessaoAtual,
      ultimoResultado: ultimo ? {
        rodada: ultimo.rodada || null,
        resultado: norm || ultimo.item,
        horario,
        criadoEm: ultimo.criado_em
      } : null,
      horarioUltimoResultado: horario
    };
  } catch (err) {
    logger.error("Erro em obterResumoGeral:", err?.message);
    return {
      totalRodadas: 0,
      sessaoAtual,
      ultimoResultado: null,
      horarioUltimoResultado: null
    };
  }
}
async function obterUltimosResultados(limite = 20) {
  const supabase2 = getSupabase();
  if (!supabase2) return [];
  try {
    const { data, error } = await supabase2.from("resultados").select("rodada, item, criado_em").order("criado_em", { ascending: false }).limit(limite);
    if (error || !data) return [];
    return data.map((row) => {
      const norm = normalizarObjeto4(row.item);
      if (!norm) return null;
      return {
        rodada: row.rodada || null,
        resultado: norm,
        horario: formatarHorario(row.criado_em),
        criadoEm: row.criado_em
      };
    }).filter((item) => item !== null);
  } catch (err) {
    logger.error("Erro em obterUltimosResultados:", err?.message);
    return [];
  }
}
async function obterRankingObjetos() {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return OBJETOS_PERMITIDOS.map((objeto, idx) => ({
      posicao: idx + 1,
      objeto,
      quantidade: 0,
      percentual: "0.00%",
      percentualNumero: 0
    }));
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("item");
    if (error || !data) {
      return OBJETOS_PERMITIDOS.map((objeto, idx) => ({
        posicao: idx + 1,
        objeto,
        quantidade: 0,
        percentual: "0.00%",
        percentualNumero: 0
      }));
    }
    const contagem = {};
    OBJETOS_PERMITIDOS.forEach((obj) => {
      contagem[obj] = 0;
    });
    let totalValidos = 0;
    data.forEach((row) => {
      const norm = normalizarObjeto4(row.item);
      if (norm && contagem[norm] !== void 0) {
        contagem[norm]++;
        totalValidos++;
      }
    });
    const lista = OBJETOS_PERMITIDOS.map((objeto) => {
      const qtd = contagem[objeto] || 0;
      const pct = totalValidos > 0 ? qtd / totalValidos * 100 : 0;
      return {
        objeto,
        quantidade: qtd,
        percentual: `${pct.toFixed(2)}%`,
        percentualNumero: Number(pct.toFixed(2))
      };
    }).sort((a, b) => b.quantidade - a.quantidade);
    return lista.map((item, index) => ({
      posicao: index + 1,
      ...item
    }));
  } catch (err) {
    logger.error("Erro em obterRankingObjetos:", err?.message);
    return [];
  }
}
async function obterObjetosAtrasados() {
  try {
    const resAtrasos = await detectarAtrasos();
    return resAtrasos.itens.map((item, idx) => ({
      posicao: idx + 1,
      objeto: item.objeto,
      rodadasSemAparecer: item.rodadasSemAparecer,
      ultimaOcorrenciaEm: item.ultimaOcorrenciaEm,
      descricao: item.atrasoRelativo
    }));
  } catch (err) {
    logger.error("Erro em obterObjetosAtrasados:", err?.message);
    return [];
  }
}
async function calcularEstatisticaJanela(janela) {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return { janela, totalAnalisado: 0, topObjetos: [] };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("item").order("criado_em", { ascending: false }).limit(janela);
    if (error || !data || data.length === 0) {
      return { janela, totalAnalisado: 0, topObjetos: [] };
    }
    const contagem = {};
    let total = 0;
    data.forEach((row) => {
      const norm = normalizarObjeto4(row.item);
      if (norm) {
        contagem[norm] = (contagem[norm] || 0) + 1;
        total++;
      }
    });
    const topObjetos = Object.entries(contagem).map(([objeto, quantidade]) => {
      const pct = total > 0 ? quantidade / total * 100 : 0;
      return {
        objeto,
        quantidade,
        percentual: `${pct.toFixed(2)}%`
      };
    }).sort((a, b) => b.quantidade - a.quantidade);
    return {
      janela,
      totalAnalisado: total,
      topObjetos
    };
  } catch {
    return { janela, totalAnalisado: 0, topObjetos: [] };
  }
}
async function obterEstatisticasRecentes() {
  const [j20, j50, j100] = await Promise.all([
    calcularEstatisticaJanela(20),
    calcularEstatisticaJanela(50),
    calcularEstatisticaJanela(100)
  ]);
  return {
    janela20: j20,
    janela50: j50,
    janela100: j100
  };
}
async function obterDashboardCompleto() {
  const inicio = Date.now();
  const [resumo, ultimosResultados, ranking, atrasos, padroes, estatisticasRecentes] = await Promise.all([
    obterResumoGeral(),
    obterUltimosResultados(20),
    obterRankingObjetos(),
    obterObjetosAtrasados(),
    executarDetectorPadroes(),
    obterEstatisticasRecentes()
  ]);
  const tempoExecucaoMs = Date.now() - inicio;
  const dadosInsuficientes = resumo.totalRodadas < 5;
  const mensagemInsuficiencia = dadosInsuficientes ? "Dados insuficientes no banco de dados para uma an\xE1lise de intelig\xEAncia completa." : void 0;
  logger.info(
    `Dashboard Completo gerado | Rodadas: ${resumo.totalRodadas} | Tempo: ${tempoExecucaoMs}ms`
  );
  return {
    sucesso: true,
    tempoExecucaoMs,
    dadosInsuficientes,
    mensagemInsuficiencia,
    resumo,
    ultimosResultados,
    ranking,
    atrasos,
    padroes,
    estatisticasRecentes
  };
}

// src/routes/dashboard.ts
var router4 = Router4();
router4.get("/dashboard", async (req, res) => {
  try {
    const dadosDashboard = await obterDashboardCompleto();
    return res.json(dadosDashboard);
  } catch (error) {
    logger.error("Erro no endpoint GET /api/dashboard:", error?.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: error?.message || "Erro ao carregar os dados do Painel de Intelig\xEAncia."
    });
  }
});
var dashboard_default = router4;

// src/routes/estatisticas.ts
import { Router as Router5 } from "express";

// src/services/resultadoService.ts
var OBJETOS_PERMITIDOS2 = [
  "sorvete",
  "boia",
  "balao",
  "soco",
  "tedy",
  "princesa",
  "camera",
  "coroa"
];
var MIN_CONFIDENCE = 80;
var autoPersistFlag = process.env.AUTO_PERSIST_ENABLED === "true" || false;
function isAutoPersistEnabled() {
  return autoPersistFlag;
}
var persistedEventIds = /* @__PURE__ */ new Set();
var activePersistLocks = /* @__PURE__ */ new Map();
var sessionInsertTimestamps = /* @__PURE__ */ new Map();
var ultimoObjetoRegistrado = null;
var ultimoTimestampRegistro = 0;
async function registrarResultadoAutomaticamente(objeto, confianca, eventId, sessaoIdParam) {
  const callId = `CALL_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const objetoFormatado = (objeto || "").trim().toLowerCase();
  const eventIdEfetivo = eventId || `LEGACY_EVT_${Date.now()}_${objetoFormatado}`;
  const stackTrace = new Error().stack || "stack_nao_disponivel";
  logger.info(
    `[FORENSIC-PERSISTENCE]
\u2022 CALL_ID: ${callId}
\u2022 Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}
\u2022 SessionId: ${sessaoIdParam || "N/A"}
\u2022 EventId: ${eventIdEfetivo}
\u2022 Objeto: "${objetoFormatado}"
\u2022 Confian\xE7a: ${confianca}%
\u2022 Source: gemini_live
\u2022 Caller: registrarResultadoAutomaticamente
\u2022 AutoPersistEnabled: ${isAutoPersistEnabled()}
\u2022 Stack: ${stackTrace.split("\n").slice(1, 4).join(" <- ")}`
  );
  if (!isAutoPersistEnabled()) {
    const motivo = "PERSIST\xCANCIA DESABILITADA \u2014 TESTE";
    logger.info(
      `[ROUND-PERSISTENCE] CALL_ID=${callId} | sessionId=${sessaoIdParam || "N/A"} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | acao=INTERCEPTADO_AUTO_PERSIST_DISABLED`
    );
    return {
      registrado: false,
      motivo,
      sessaoId: sessaoIdParam || null,
      rodadaRegistrada: null,
      eventId: eventIdEfetivo
    };
  }
  if (!OBJETOS_PERMITIDOS2.includes(objetoFormatado)) {
    const motivo = `Objeto inv\xE1lido ou n\xE3o permitido: "${objeto}". Objetos aceitos: ${OBJETOS_PERMITIDOS2.join(", ")}`;
    logger.warn(`[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || "N/A"} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=INVALIDO | jaPersistido=false | acao=IGNORADO_OBJETO_INVALIDO`);
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }
  if (typeof confianca !== "number" || confianca < MIN_CONFIDENCE) {
    const motivo = `Confian\xE7a insuficiente (${confianca}%). M\xEDnimo exigido: ${MIN_CONFIDENCE}%`;
    logger.warn(`[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || "N/A"} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=DESCARTO_BAIXA_CONF | jaPersistido=false | acao=IGNORADO_BAIXA_CONFIANCA`);
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }
  if (eventId && persistedEventIds.has(eventId)) {
    const motivo = `Evento de rodada "${eventId}" j\xE1 foi persistido no Supabase (Idempot\xEAncia OK).`;
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || "N/A"} | eventId=${eventId} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=AGUARDANDO_MUDANCA | jaPersistido=true | acao=IGNORADO_DUPLICADO`
    );
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId };
  }
  if (eventId && activePersistLocks.has(eventId)) {
    const motivo = `Lock de concorr\xEAncia ativo para eventId=${eventId}. Inser\xE7\xE3o simult\xE2nea bloqueada.`;
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || "N/A"} | eventId=${eventId} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=AGUARDANDO_MUDANCA | jaPersistido=false | acao=IGNORADO_LOCK_CONCORRENTE`
    );
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId };
  }
  const agora = Date.now();
  const sessionKey = String(sessaoIdParam || "global_session");
  const history = sessionInsertTimestamps.get(sessionKey) || [];
  const recentHistory = history.filter((ts) => agora - ts < 2e3);
  if (recentHistory.length >= 3) {
    const motivo = `[ANTI-DUPLICATION-GUARD] Sess\xE3o ${sessionKey} excedeu o limite de taxa (>=3 registros em 2s). Bloqueando inser\xE7\xE3o.`;
    logger.warn(
      `[ANTI-DUPLICATION-GUARD] sessaoId=${sessionKey} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | tentativasBloqueadas=${recentHistory.length} | timestamp=${agora}`
    );
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessionKey} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=BLOQUEADO_GUARD | jaPersistido=false | acao=BLOQUEADO_ANTI_DUPLICATION_GUARD`
    );
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }
  if (!eventId && ultimoObjetoRegistrado === objetoFormatado && agora - ultimoTimestampRegistro < 2e3) {
    const motivo = `Registro duplicado ignorado (mesmo objeto "${objetoFormatado}" sem eventId lido h\xE1 menos de 2 segundos)`;
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessionKey} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=AGUARDANDO_MUDANCA | jaPersistido=true | acao=IGNORADO_DUPLICADO`
    );
    return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
  }
  const executePersistence = async () => {
    logger.info(
      `[ROUND-PERSISTENCE] sessionId=${sessaoIdParam || "N/A"} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=CONFIRMADO | jaPersistido=false | acao=INSERT`
    );
    const supabase2 = getSupabase();
    if (!supabase2) {
      const motivo = "Supabase n\xE3o configurado ou indispon\xEDvel.";
      logger.warn(`[ROUND-PERSISTENCE] ${motivo}`);
      return { registrado: false, motivo, sessaoId: sessaoIdParam || null, rodadaRegistrada: null, eventId: eventIdEfetivo };
    }
    try {
      let sessaoId = sessaoIdParam || null;
      let numericSessaoId = null;
      if (typeof sessaoId === "number") {
        numericSessaoId = sessaoId;
      } else if (typeof sessaoId === "string" && /^\d+$/.test(sessaoId.trim())) {
        numericSessaoId = parseInt(sessaoId.trim(), 10);
      }
      if (!numericSessaoId && !sessaoIdParam) {
        const [resSessao] = await Promise.all([
          obterSessaoAtual(),
          buscarResultadoAnterior2()
        ]);
        if (resSessao.data && resSessao.data.id && resSessao.data.status !== "encerrada") {
          sessaoId = resSessao.data.id;
          numericSessaoId = typeof sessaoId === "number" ? sessaoId : parseInt(String(sessaoId), 10) || null;
        } else {
          const novaSessao = await criarSessao();
          if (novaSessao.data && novaSessao.data.id) {
            sessaoId = novaSessao.data.id;
            numericSessaoId = typeof sessaoId === "number" ? sessaoId : parseInt(String(sessaoId), 10) || null;
          }
        }
      }
      const resAnterior = await buscarResultadoAnterior2();
      const itemAnterior = resAnterior.data?.objeto || resAnterior.data?.item || null;
      const confiancaDecimal = confianca > 1 ? Number((confianca / 100).toFixed(4)) : confianca;
      let rpcResponse = await supabase2.rpc("registrar_resultado_completo", {
        p_sessao_id: numericSessaoId,
        p_objeto: objetoFormatado,
        p_confianca: confiancaDecimal
      });
      if (rpcResponse.error) {
        rpcResponse = await supabase2.rpc("registrar_resultado", {
          p_sessao_id: numericSessaoId,
          p_objeto: objetoFormatado,
          p_confianca: confiancaDecimal,
          p_origem: "gemini_live"
        });
      }
      if (rpcResponse.error) {
        logger.warn(
          `RPC de registro retornou erro: ${rpcResponse.error.message}. Executando inser\xE7\xE3o fallback na tabela 'resultados'.`
        );
        const payloadFallback = {
          objeto: objetoFormatado,
          confianca: confiancaDecimal,
          origem: "gemini_live",
          criado_em: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (numericSessaoId) {
          payloadFallback.sessao_id = numericSessaoId;
        }
        const { data: fallbackData, error: fallbackError } = await supabase2.from("resultados").insert([payloadFallback]).select().single();
        if (fallbackError) {
          logger.error("Erro ao registrar resultado no Supabase:", fallbackError.message);
          if (eventId) {
            persistedEventIds.add(eventId);
          }
          return {
            registrado: false,
            motivo: `Erro ao salvar no banco de dados: ${fallbackError.message}`,
            sessaoId: numericSessaoId,
            rodadaRegistrada: null,
            eventId: eventIdEfetivo
          };
        }
        if (eventId) {
          persistedEventIds.add(eventId);
        }
        ultimoObjetoRegistrado = objetoFormatado;
        ultimoTimestampRegistro = Date.now();
        sessionInsertTimestamps.set(sessionKey, [...recentHistory, Date.now()]);
        logger.info(
          `[ROUND-PERSISTENCE] sessionId=${sessaoId} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=CONFIRMADO | jaPersistido=true | acao=REGISTRADO_COM_SUCESSO`
        );
        if (itemAnterior) {
          registrarTransicao(itemAnterior, objetoFormatado).catch(() => {
          });
        }
        executarDetectorPadroes(sessaoId).catch(() => {
        });
        return {
          registrado: true,
          motivo: "Resultado registrado com sucesso no banco de dados (inser\xE7\xE3o direta).",
          sessaoId,
          rodadaRegistrada: fallbackData?.rodada || null,
          eventId: eventIdEfetivo
        };
      }
      if (eventId) {
        persistedEventIds.add(eventId);
      }
      ultimoObjetoRegistrado = objetoFormatado;
      ultimoTimestampRegistro = Date.now();
      sessionInsertTimestamps.set(sessionKey, [...recentHistory, Date.now()]);
      invalidarCacheEstatistico();
      logger.info(
        `[ROUND-PERSISTENCE] sessionId=${sessaoId} | eventId=${eventIdEfetivo} | objeto=${objetoFormatado} | confidence=${confianca}% | estado=CONFIRMADO | jaPersistido=true | acao=REGISTRADO_COM_SUCESSO`
      );
      if (itemAnterior) {
        registrarTransicao(itemAnterior, objetoFormatado).catch(() => {
        });
      }
      executarDetectorPadroes(sessaoId).catch(() => {
      });
      const rodadaObtida = typeof rpcResponse.data === "number" ? rpcResponse.data : rpcResponse.data?.rodada || rpcResponse.data?.rodada_registrada || null;
      return {
        registrado: true,
        motivo: "Resultado registrado com sucesso via registrar_resultado_completo().",
        sessaoId,
        rodadaRegistrada: rodadaObtida,
        eventId: eventIdEfetivo
      };
    } catch (err) {
      logger.error("Exce\xE7\xE3o ao registrar resultado automaticamente:", err?.message);
      return {
        registrado: false,
        motivo: `Exce\xE7\xE3o durante registro autom\xE1tico: ${err?.message || "Erro desconhecido"}`,
        sessaoId: sessaoIdParam || null,
        rodadaRegistrada: null,
        eventId: eventIdEfetivo
      };
    }
  };
  const persistPromise = executePersistence();
  if (eventId) {
    activePersistLocks.set(eventId, persistPromise);
  }
  try {
    const res = await persistPromise;
    return res;
  } finally {
    if (eventId) {
      activePersistLocks.delete(eventId);
    }
  }
}
async function buscarResultadoAnterior2(rodadaOuId) {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return { data: null, error: new Error("Supabase cliente n\xE3o dispon\xEDvel") };
  }
  try {
    let query = supabase2.from("resultados").select("*").order("criado_em", { ascending: false }).limit(2);
    const { data, error } = await query;
    if (error) {
      logger.error("Erro ao buscar resultado anterior:", error.message);
      return { data: null, error };
    }
    const anterior = data && data.length > 1 ? data[1] : null;
    return { data: anterior, error: null };
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao buscar resultado anterior:", err?.message);
    return { data: null, error: err };
  }
}

// src/services/estatisticaService.ts
var cacheEstatistico = null;
var timestampUltimoCalculo = 0;
function invalidarCacheEstatistico() {
  cacheEstatistico = null;
  timestampUltimoCalculo = 0;
  logger.info("[MOTOR ESTAT\xCDSTICO] Cache est\xE1tico invalidado com sucesso.");
}
function normalizarObjeto5(item) {
  if (!item) return null;
  const limpo = String(item).trim().toLowerCase();
  if (OBJETOS_PERMITIDOS2.includes(limpo)) {
    return limpo;
  }
  return null;
}
function calcularIndiceConfianca(totalAmostras) {
  if (totalAmostras < 20) return "baixa";
  if (totalAmostras <= 100) return "media";
  return "alta";
}
async function buscarHistoricoBruto() {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return { itensMaisNovosPrimeiro: [], itensMaisAntigosPrimeiro: [] };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("*").order("criado_em", { ascending: false });
    if (error || !data) {
      logger.error("Erro ao buscar hist\xF3rico bruto no Supabase:", error?.message);
      return { itensMaisNovosPrimeiro: [], itensMaisAntigosPrimeiro: [] };
    }
    const maisNovos = data.map((row) => {
      const norm = normalizarObjeto5(row.item || row.objeto);
      if (!norm) return null;
      return {
        id: row.id,
        objeto: norm,
        criadoEm: row.criado_em || (/* @__PURE__ */ new Date()).toISOString(),
        rodada: row.rodada
      };
    }).filter((item) => item !== null);
    const maisAntigos = [...maisNovos].reverse();
    return {
      itensMaisNovosPrimeiro: maisNovos,
      itensMaisAntigosPrimeiro: maisAntigos
    };
  } catch (err) {
    logger.error("Exce\xE7\xE3o ao buscar hist\xF3rico bruto:", err?.message);
    return { itensMaisNovosPrimeiro: [], itensMaisAntigosPrimeiro: [] };
  }
}
function calcularFrequencia(amostraItens) {
  const contagem = {};
  OBJETOS_PERMITIDOS2.forEach((obj) => contagem[obj] = 0);
  let totalValidos = 0;
  amostraItens.forEach((item) => {
    const norm = normalizarObjeto5(item.objeto);
    if (norm && contagem[norm] !== void 0) {
      contagem[norm]++;
      totalValidos++;
    }
  });
  const resultado = {};
  OBJETOS_PERMITIDOS2.forEach((obj) => {
    const qtd = contagem[obj] || 0;
    const pct = totalValidos > 0 ? qtd / totalValidos * 100 : 0;
    resultado[obj] = {
      quantidade: qtd,
      percentual: Number(pct.toFixed(2)),
      percentualFormatado: `${pct.toFixed(2)}%`
    };
  });
  return resultado;
}
function calcularFrequenciasJanelas(itensMaisNovosPrimeiro) {
  return {
    janela20: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 20)),
    janela50: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 50)),
    janela100: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 100)),
    janela500: calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 500)),
    historicoCompleto: calcularFrequencia(itensMaisNovosPrimeiro)
  };
}
function calcularAtrasos(itensMaisNovosPrimeiro) {
  const totalRodadas = itensMaisNovosPrimeiro.length;
  const resultado = {};
  OBJETOS_PERMITIDOS2.forEach((objeto) => {
    let atrasoAtual = totalRodadas;
    let ultimaOcorrenciaEm = null;
    for (let i = 0; i < totalRodadas; i++) {
      if (itensMaisNovosPrimeiro[i].objeto === objeto) {
        atrasoAtual = i;
        ultimaOcorrenciaEm = itensMaisNovosPrimeiro[i].criadoEm;
        break;
      }
    }
    const itensAntigos = [...itensMaisNovosPrimeiro].reverse();
    let maiorAtraso = 0;
    let contadorSemAparecer = 0;
    let aparicoes = 0;
    const intervalos = [];
    for (let i = 0; i < itensAntigos.length; i++) {
      if (itensAntigos[i].objeto === objeto) {
        aparicoes++;
        if (contadorSemAparecer > maiorAtraso) {
          maiorAtraso = contadorSemAparecer;
        }
        if (aparicoes > 1) {
          intervalos.push(contadorSemAparecer);
        }
        contadorSemAparecer = 0;
      } else {
        contadorSemAparecer++;
      }
    }
    if (contadorSemAparecer > maiorAtraso) {
      maiorAtraso = contadorSemAparecer;
    }
    let atrasoMedio = 0;
    if (intervalos.length > 0) {
      const soma = intervalos.reduce((acc, curr) => acc + curr, 0);
      atrasoMedio = Number((soma / intervalos.length).toFixed(1));
    } else if (aparicoes === 1 && totalRodadas > 1) {
      atrasoMedio = totalRodadas;
    }
    resultado[objeto] = {
      objeto,
      atrasoAtual,
      maiorAtrasoHistorico: maiorAtraso,
      atrasoMedio,
      ultimaOcorrenciaEm
    };
  });
  return resultado;
}
function calcularIntervalos(itensMaisAntigosPrimeiro) {
  const resultado = {};
  OBJETOS_PERMITIDOS2.forEach((objeto) => {
    const posicoes = [];
    itensMaisAntigosPrimeiro.forEach((item, index) => {
      if (item.objeto === objeto) {
        posicoes.push(index + 1);
      }
    });
    const intervalos = [];
    for (let i = 1; i < posicoes.length; i++) {
      intervalos.push(posicoes[i] - posicoes[i - 1]);
    }
    let intervaloMedio = 0;
    let intervaloMinimo = 0;
    let intervaloMaximo = 0;
    if (intervalos.length > 0) {
      const soma = intervalos.reduce((acc, curr) => acc + curr, 0);
      intervaloMedio = Number((soma / intervalos.length).toFixed(1));
      intervaloMinimo = Math.min(...intervalos);
      intervaloMaximo = Math.max(...intervalos);
    }
    resultado[objeto] = {
      objeto,
      intervalos,
      intervaloMedio,
      intervaloMinimo,
      intervaloMaximo,
      totalOcorrencias: posicoes.length
    };
  });
  return resultado;
}
function calcularProbabilidadeCondicional(sequenciaInput, itensMaisAntigosPrimeiro) {
  const seq = sequenciaInput.map((s) => normalizarObjeto5(s)).filter((s) => s !== null);
  if (seq.length === 0) {
    return {
      sequenciaAnalisada: [],
      totalOcorrenciasSequencia: 0,
      distribuicaoProximo: {},
      proximoMaisProvavel: null,
      nivelConfianca: "baixa",
      mensagem: "Nenhuma sequ\xEAncia v\xE1lida foi informada para an\xE1lise condicional."
    };
  }
  const n = seq.length;
  const contagemProximo = {};
  OBJETOS_PERMITIDOS2.forEach((obj) => contagemProximo[obj] = 0);
  let totalEncontrado = 0;
  for (let i = 0; i <= itensMaisAntigosPrimeiro.length - n - 1; i++) {
    let bateu = true;
    for (let j = 0; j < n; j++) {
      if (itensMaisAntigosPrimeiro[i + j].objeto !== seq[j]) {
        bateu = false;
        break;
      }
    }
    if (bateu) {
      const proximo = itensMaisAntigosPrimeiro[i + n].objeto;
      if (contagemProximo[proximo] !== void 0) {
        contagemProximo[proximo]++;
        totalEncontrado++;
      }
    }
  }
  const distribuicaoProximo = {};
  let maxQtd = -1;
  let proximoMaisProvavel = null;
  const nivelGeral = calcularIndiceConfianca(totalEncontrado);
  OBJETOS_PERMITIDOS2.forEach((obj) => {
    const qtd = contagemProximo[obj] || 0;
    const pct = totalEncontrado > 0 ? qtd / totalEncontrado * 100 : 0;
    const itemProb = {
      objeto: obj,
      quantidade: qtd,
      porcentagem: Number(pct.toFixed(2)),
      porcentagemFormatada: `${pct.toFixed(2)}%`,
      confianca: calcularIndiceConfianca(qtd)
    };
    distribuicaoProximo[obj] = itemProb;
    if (qtd > maxQtd && qtd > 0) {
      maxQtd = qtd;
      proximoMaisProvavel = itemProb;
    }
  });
  return {
    sequenciaAnalisada: seq,
    totalOcorrenciasSequencia: totalEncontrado,
    distribuicaoProximo,
    proximoMaisProvavel,
    nivelConfianca: nivelGeral
  };
}
function calcularDistribuicao(itensMaisNovosPrimeiro) {
  const freq = calcularFrequencia(itensMaisNovosPrimeiro);
  const lista = OBJETOS_PERMITIDOS2.map((objeto) => {
    const item = freq[objeto];
    return {
      objeto,
      frequencia: item.quantidade,
      percentual: item.percentual,
      percentualFormatado: item.percentualFormatado
    };
  }).sort((a, b) => b.frequencia - a.frequencia);
  return lista.map((item, index) => ({
    posicaoRanking: index + 1,
    ...item
  }));
}
function detectarDesvios(itensMaisNovosPrimeiro) {
  const freqHistorico = calcularFrequencia(itensMaisNovosPrimeiro);
  const freqRecente = calcularFrequencia(itensMaisNovosPrimeiro.slice(0, 100));
  return OBJETOS_PERMITIDOS2.map((objeto) => {
    const pctHist = freqHistorico[objeto]?.percentual || 0;
    const pctRec = freqRecente[objeto]?.percentual || 0;
    const dif = Number((pctRec - pctHist).toFixed(2));
    const difAbs = Math.abs(dif);
    let nivelDesvio = "normal";
    if (difAbs >= 8) {
      nivelDesvio = "alto";
    } else if (difAbs >= 4) {
      nivelDesvio = "moderado";
    }
    let impacto = "estavel";
    if (dif > 2) {
      impacto = "acima_da_media";
    } else if (dif < -2) {
      impacto = "abaixo_da_media";
    }
    const difSinal = dif > 0 ? `+${dif.toFixed(2)}%` : `${dif.toFixed(2)}%`;
    return {
      objeto,
      percentualHistorico: pctHist,
      percentualRecente: pctRec,
      diferencaPercentual: dif,
      diferencaFormatada: difSinal,
      nivelDesvio,
      impacto
    };
  }).sort((a, b) => Math.abs(b.diferencaPercentual) - Math.abs(a.diferencaPercentual));
}
async function obterRelatorioEstatisticoCompleto(forceRefresh = false) {
  const inicio = Date.now();
  if (!forceRefresh && cacheEstatistico) {
    logger.info(
      `[MOTOR ESTAT\xCDSTICO] Servindo estat\xEDsticas do Cache em mem\xF3ria | Tempo: ${Date.now() - inicio}ms`
    );
    return {
      ...cacheEstatistico,
      fromCache: true,
      tempoCalculoMs: Date.now() - inicio
    };
  }
  const { itensMaisNovosPrimeiro, itensMaisAntigosPrimeiro } = await buscarHistoricoBruto();
  const totalRodadas = itensMaisNovosPrimeiro.length;
  if (totalRodadas < 5) {
    const relatorioInsuficiente = {
      sucesso: false,
      dadosInsuficientes: true,
      mensagemInsuficiencia: "Base hist\xF3rica insuficiente para uma an\xE1lise confi\xE1vel.",
      frequencias: {
        janela20: calcularFrequencia([]),
        janela50: calcularFrequencia([]),
        janela100: calcularFrequencia([]),
        janela500: calcularFrequencia([]),
        historicoCompleto: calcularFrequencia([])
      },
      atrasos: calcularAtrasos([]),
      intervalos: calcularIntervalos([]),
      distribuicao: calcularDistribuicao([]),
      desvios: detectarDesvios([]),
      confianca: {
        totalRodadas,
        nivelGeral: "baixa",
        descricao: "Base de dados insuficiente. Adicione pelo menos 5 rodadas."
      },
      tempoCalculoMs: Date.now() - inicio,
      rodadasUtilizadas: totalRodadas,
      fromCache: false
    };
    return relatorioInsuficiente;
  }
  const frequencias = calcularFrequenciasJanelas(itensMaisNovosPrimeiro);
  const atrasos = calcularAtrasos(itensMaisNovosPrimeiro);
  const intervalos = calcularIntervalos(itensMaisAntigosPrimeiro);
  const distribuicao = calcularDistribuicao(itensMaisNovosPrimeiro);
  const desvios = detectarDesvios(itensMaisNovosPrimeiro);
  const nivelGeral = calcularIndiceConfianca(totalRodadas);
  const tempoCalculoMs = Date.now() - inicio;
  const resultado = {
    sucesso: true,
    dadosInsuficientes: false,
    frequencias,
    atrasos,
    intervalos,
    distribuicao,
    desvios,
    confianca: {
      totalRodadas,
      nivelGeral,
      descricao: nivelGeral === "alta" ? "N\xEDvel de confian\xE7a ALTO (Mais de 100 rodadas analisadas)." : nivelGeral === "media" ? "N\xEDvel de confian\xE7a M\xC9DIO (Entre 20 e 100 rodadas analisadas)." : "N\xEDvel de confian\xE7a BAIXO (Menos de 20 rodadas no hist\xF3rico)."
    },
    tempoCalculoMs,
    rodadasUtilizadas: totalRodadas,
    fromCache: false
  };
  cacheEstatistico = resultado;
  timestampUltimoCalculo = Date.now();
  logger.info(
    `[MOTOR ESTAT\xCDSTICO] Novo c\xE1lculo estat\xEDstico conclu\xEDdo | Rodadas: ${totalRodadas} | Tempo: ${tempoCalculoMs}ms | Cache Atualizado`
  );
  return resultado;
}

// src/services/StatisticsEngine.ts
var OBJETOS_OFICIAIS = [
  "sorvete",
  "boia",
  "balao",
  "soco",
  "tedy",
  "princesa",
  "camera",
  "coroa"
];
var fallbackMemoryHistory = [];
var StatisticsEngineClass = class {
  /**
   * Normaliza a string do objeto para um dos 8 objetos oficiais do Farm Fishing.
   */
  normalizarObjeto(objeto) {
    if (!objeto) return null;
    const clean = String(objeto).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (OBJETOS_OFICIAIS.includes(clean)) {
      return clean;
    }
    if (clean === "teddy" || clean === "urso") return "tedy";
    if (clean === "soco" || clean === "luva") return "soco";
    if (clean === "balao" || clean === "bal\xE3o") return "balao";
    if (clean === "boia" || clean === "b\xF3ia") return "boia";
    return null;
  }
  /**
   * Consulta o histórico bruto no Supabase.
   * Retorna do mais recente para o mais antigo (ou vice-versa se solicitado).
   */
  async fetchRawHistory() {
    const supabase2 = getSupabase();
    if (supabase2) {
      try {
        const { data, error } = await supabase2.from("resultados").select("*").order("criado_em", { ascending: false });
        if (!error && data && data.length > 0) {
          const mapped = data.map((row) => {
            const norm = this.normalizarObjeto(row.item || row.objeto);
            if (!norm) return null;
            return {
              id: row.id,
              objeto: norm,
              criadoEm: row.criado_em || (/* @__PURE__ */ new Date()).toISOString(),
              rodada: row.rodada ?? null
            };
          });
          const maisNovos = mapped.filter(
            (i) => i !== null
          );
          if (maisNovos.length > 0) {
            const maisAntigos = [...maisNovos].reverse();
            return {
              maisNovosPrimeiro: maisNovos,
              maisAntigosPrimeiro: maisAntigos
            };
          }
        }
      } catch (err) {
        logger.error("[StatisticsEngine] Erro ao consultar Supabase:", err?.message);
      }
    }
    const maisNovosFallback = [...fallbackMemoryHistory];
    const maisAntigosFallback = [...fallbackMemoryHistory].reverse();
    return {
      maisNovosPrimeiro: maisNovosFallback,
      maisAntigosPrimeiro: maisAntigosFallback
    };
  }
  /**
   * 1. getLastResults(limit)
   * Retorna os últimos N resultados (mais recente → mais antigo).
   */
  async getLastResults(limit = 10) {
    const { maisNovosPrimeiro } = await this.fetchRawHistory();
    const limiteEfetivo = Math.max(1, limit);
    const fatiados = maisNovosPrimeiro.slice(0, limiteEfetivo);
    return {
      sucesso: true,
      totalConsultado: maisNovosPrimeiro.length,
      limiteSolicitado: limiteEfetivo,
      itens: fatiados.map((item) => item.objeto),
      detalhes: fatiados
    };
  }
  /**
   * 2. getNextAfter(object)
   * Recebe um objeto (ex: "soco"), analisa todas as suas ocorrências no histórico,
   * e calcula qual resultado veio IMEDIATAMENTE DEPOIS.
   *
   * Formato de retorno estrito:
   * {
   *   objetoPesquisado: "soco",
   *   ocorrencias: 10,
   *   resultados: {
   *     boia: { quantidade: 6, porcentagem: 60 },
   *     sorvete: { quantidade: 4, porcentagem: 40 },
   *     ...
   *   }
   * }
   */
  async getNextAfter(object) {
    const normSearch = this.normalizarObjeto(object) || object.toLowerCase().trim();
    const { maisAntigosPrimeiro } = await this.fetchRawHistory();
    const contagemSucessores = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      contagemSucessores[obj] = 0;
    });
    let ocorrencias = 0;
    for (let i = 0; i < maisAntigosPrimeiro.length - 1; i++) {
      if (maisAntigosPrimeiro[i].objeto === normSearch) {
        ocorrencias++;
        const proximoObjeto = maisAntigosPrimeiro[i + 1].objeto;
        if (contagemSucessores[proximoObjeto] !== void 0) {
          contagemSucessores[proximoObjeto]++;
        } else {
          contagemSucessores[proximoObjeto] = 1;
        }
      }
    }
    const resultadosFormatted = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      const qtd = contagemSucessores[obj] || 0;
      const pct = ocorrencias > 0 ? qtd / ocorrencias * 100 : 0;
      resultadosFormatted[obj] = {
        quantidade: qtd,
        porcentagem: Number(pct.toFixed(2))
      };
    });
    return {
      objetoPesquisado: normSearch,
      ocorrencias,
      resultados: resultadosFormatted
    };
  }
  /**
   * 3. getFrequency()
   * Calcula a quantidade total de cada símbolo e a porcentagem geral no histórico.
   */
  async getFrequency() {
    const { maisNovosPrimeiro } = await this.fetchRawHistory();
    const totalRodadas = maisNovosPrimeiro.length;
    const contagem = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      contagem[obj] = 0;
    });
    maisNovosPrimeiro.forEach((item) => {
      if (contagem[item.objeto] !== void 0) {
        contagem[item.objeto]++;
      }
    });
    const frequencia = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      const qtd = contagem[obj] || 0;
      const pct = totalRodadas > 0 ? qtd / totalRodadas * 100 : 0;
      frequencia[obj] = {
        quantidade: qtd,
        porcentagem: Number(pct.toFixed(2)),
        porcentagemFormatada: `${pct.toFixed(2)}%`
      };
    });
    const ultimoResultado = maisNovosPrimeiro.length > 0 ? maisNovosPrimeiro[0].objeto : null;
    const maisFrequentes = OBJETOS_OFICIAIS.map((obj) => ({
      objeto: obj,
      quantidade: contagem[obj] || 0,
      porcentagem: totalRodadas > 0 ? Number((contagem[obj] / totalRodadas * 100).toFixed(2)) : 0
    })).sort((a, b) => b.quantidade - a.quantidade);
    return {
      totalRodadas,
      frequencia,
      ultimoResultado,
      maisFrequentes
    };
  }
  /**
   * 4. getSequences()
   * Identifica:
   * - repetição (símbolos consecutivos iguais);
   * - sequências consecutivas de 2 e 3 símbolos;
   * - mudanças de padrão (alternâncias frequentes).
   */
  async getSequences() {
    const { maisAntigosPrimeiro } = await this.fetchRawHistory();
    const total = maisAntigosPrimeiro.length;
    const repeticoesMap = {};
    OBJETOS_OFICIAIS.forEach((obj) => {
      repeticoesMap[obj] = { maiorSeq: 1, totalConsecutivas: 0 };
    });
    let itemAtual = "";
    let contadorSeqAtual = 0;
    for (let i = 0; i < total; i++) {
      const obj = maisAntigosPrimeiro[i].objeto;
      if (obj === itemAtual) {
        contadorSeqAtual++;
        repeticoesMap[obj].totalConsecutivas++;
        if (contadorSeqAtual > repeticoesMap[obj].maiorSeq) {
          repeticoesMap[obj].maiorSeq = contadorSeqAtual;
        }
      } else {
        itemAtual = obj;
        contadorSeqAtual = 1;
      }
    }
    const repeticoes = OBJETOS_OFICIAIS.map((obj) => ({
      objeto: obj,
      maiorSequenciaConsecutiva: repeticoesMap[obj].maiorSeq,
      totalOcorrenciasConsecutivas: repeticoesMap[obj].totalConsecutivas
    })).sort((a, b) => b.maiorSequenciaConsecutiva - a.maiorSequenciaConsecutiva);
    const seq2Map = {};
    for (let i = 0; i < total - 1; i++) {
      const pairKey = `${maisAntigosPrimeiro[i].objeto} \u2192 ${maisAntigosPrimeiro[i + 1].objeto}`;
      seq2Map[pairKey] = (seq2Map[pairKey] || 0) + 1;
    }
    const totalPares = Math.max(1, total - 1);
    const sequenciasConsecutivas = Object.entries(seq2Map).map(([seqKey, qtd]) => ({
      sequenciaTexto: seqKey,
      itens: seqKey.split(" \u2192 "),
      quantidade: qtd,
      porcentagem: Number((qtd / totalPares * 100).toFixed(2))
    })).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
    const alternanciasMap = {};
    for (let i = 0; i < total - 2; i++) {
      const a = maisAntigosPrimeiro[i].objeto;
      const b = maisAntigosPrimeiro[i + 1].objeto;
      const c = maisAntigosPrimeiro[i + 2].objeto;
      if (a === c && a !== b) {
        const altKey = [a, b].sort().join(" \u2194 ");
        alternanciasMap[altKey] = (alternanciasMap[altKey] || 0) + 1;
      }
    }
    const mudancasPadrao = Object.entries(alternanciasMap).map(([altKey, qtd]) => {
      const parts = altKey.split(" \u2194 ");
      return {
        alternancia: parts,
        quantidade: qtd,
        descricao: `Altern\xE2ncia identificada ${qtd}x entre ${parts[0]} e ${parts[1]}.`
      };
    }).sort((a, b) => b.quantidade - a.quantidade);
    return {
      repeticoes,
      sequenciasConsecutivas,
      mudancasPadrao
    };
  }
};
var StatisticsEngine = new StatisticsEngineClass();

// src/routes/estatisticas.ts
var router5 = Router5();
router5.get("/engine/last-results", async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || "10"), 10);
    const resultado = await StatisticsEngine.getLastResults(limit);
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro em GET /api/engine/last-results:", error?.message);
    return res.status(500).json({ error: error?.message || "Erro ao buscar \xFAltimos resultados" });
  }
});
router5.get("/engine/next-after", async (req, res) => {
  try {
    const objectParam = String(req.query.object || req.query.objeto || "soco");
    const resultado = await StatisticsEngine.getNextAfter(objectParam);
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro em GET /api/engine/next-after:", error?.message);
    return res.status(500).json({ error: error?.message || "Erro ao calcular pr\xF3ximo ap\xF3s objeto" });
  }
});
router5.get("/engine/frequency", async (req, res) => {
  try {
    const resultado = await StatisticsEngine.getFrequency();
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro em GET /api/engine/frequency:", error?.message);
    return res.status(500).json({ error: error?.message || "Erro ao calcular frequ\xEAncias" });
  }
});
router5.get("/engine/sequences", async (req, res) => {
  try {
    const resultado = await StatisticsEngine.getSequences();
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro em GET /api/engine/sequences:", error?.message);
    return res.status(500).json({ error: error?.message || "Erro ao analisar sequ\xEAncias" });
  }
});
router5.get("/estatisticas", async (req, res) => {
  try {
    const forceRefresh = req.query.forceRefresh === "true";
    const relatorio = await obterRelatorioEstatisticoCompleto(forceRefresh);
    if (relatorio.dadosInsuficientes) {
      return res.status(200).json({
        sucesso: false,
        dadosInsuficientes: true,
        mensagem: relatorio.mensagemInsuficiencia || "Base hist\xF3rica insuficiente para uma an\xE1lise confi\xE1vel.",
        frequencias: relatorio.frequencias,
        atrasos: relatorio.atrasos,
        intervalos: relatorio.intervalos,
        distribuicao: relatorio.distribuicao,
        desvios: relatorio.desvios,
        confianca: relatorio.confianca
      });
    }
    return res.json({
      sucesso: true,
      frequencias: relatorio.frequencias,
      atrasos: relatorio.atrasos,
      intervalos: relatorio.intervalos,
      distribuicao: relatorio.distribuicao,
      desvios: relatorio.desvios,
      confianca: relatorio.confianca,
      tempoCalculoMs: relatorio.tempoCalculoMs,
      rodadasUtilizadas: relatorio.rodadasUtilizadas,
      fromCache: relatorio.fromCache
    });
  } catch (error) {
    logger.error("Erro no endpoint GET /api/estatisticas:", error?.message);
    return res.status(500).json({
      error: error?.message || "Erro ao calcular estat\xEDsticas do sistema."
    });
  }
});
router5.post("/estatisticas/condicional", async (req, res) => {
  try {
    const { sequencia } = req.body;
    if (!Array.isArray(sequencia) || sequencia.length === 0) {
      return res.status(400).json({
        error: '\xC9 necess\xE1rio fornecer um array "sequencia" com os objetos anteriores.'
      });
    }
    const supabase2 = getSupabase();
    if (!supabase2) {
      return res.status(500).json({ error: "Supabase n\xE3o dispon\xEDvel." });
    }
    const { data } = await supabase2.from("resultados").select("item, objeto").order("criado_em", { ascending: true });
    const itensMaisAntigosPrimeiro = (data || []).map((row) => ({ objeto: String(row.item || row.objeto || "").toLowerCase().trim() })).filter((row) => row.objeto.length > 0);
    const resultadoCondicional = calcularProbabilidadeCondicional(
      sequencia,
      itensMaisAntigosPrimeiro
    );
    return res.json(resultadoCondicional);
  } catch (error) {
    logger.error("Erro no endpoint POST /api/estatisticas/condicional:", error?.message);
    return res.status(500).json({
      error: error?.message || "Erro ao calcular probabilidade condicional."
    });
  }
});
var estatisticas_default = router5;

// src/routes/live.ts
import { Router as Router6 } from "express";

// src/services/backendLiveService.ts
import { GoogleGenAI, Type } from "@google/genai";

// src/services/WheelVisionAnalyzer.ts
var OBJETOS_RODA_PERMITIDOS = [
  "sorvete",
  "boia",
  "balao",
  "soco",
  "tedy",
  "princesa",
  "camera",
  "coroa"
];
var VISION_ANALYZER_CONFIG = {
  MIN_CONFIRMATIONS: 3,
  MIN_CONFIDENCE: 85,
  STABILITY_WINDOW_MS: 1e3,
  MAX_CONFIRMATION_WINDOW_MS: 3e3,
  SUSTAINED_UNIDENTIFIED_FRAMES_TO_RESET: 3
};
var WheelVisionAnalyzer = class {
  constructor(minimumConfirmations = VISION_ANALYZER_CONFIG.MIN_CONFIRMATIONS, minConfidence = VISION_ANALYZER_CONFIG.MIN_CONFIDENCE, stabilityWindowMs = VISION_ANALYZER_CONFIG.STABILITY_WINDOW_MS, maxConfirmationWindowMs = VISION_ANALYZER_CONFIG.MAX_CONFIRMATION_WINDOW_MS) {
    this.currentState = "IDLE";
    this.candidateResult = null;
    this.confirmacoesConsecutivas = 0;
    this.primeiraDeteccaoTimestamp = null;
    this.ultimaDeteccaoTimestamp = null;
    this.lastConfidence = 0;
    this.minimumConfirmations = VISION_ANALYZER_CONFIG.MIN_CONFIRMATIONS;
    this.minConfidence = VISION_ANALYZER_CONFIG.MIN_CONFIDENCE;
    this.stabilityWindowMs = VISION_ANALYZER_CONFIG.STABILITY_WINDOW_MS;
    this.maxConfirmationWindowMs = VISION_ANALYZER_CONFIG.MAX_CONFIRMATION_WINDOW_MS;
    this.ultimoObjetoConfirmado = null;
    this.currentEventId = null;
    this.horarioUltimaConfirmacao = null;
    this.confiancaUltimaConfirmacao = null;
    this.motivoUltimoDescarte = null;
    this.naoIdentificadoCountConsecutivo = 0;
    this.roundSequenceCounter = 0;
    // Rastreamento da Tela de Resultado
    this.resultadoScreenDetected = false;
    this.resultScreenConfidence = 0;
    this.framesAnalisadosJanela = 0;
    this.resultScreenDetectedAtTimestamp = null;
    // Métricas
    this.metrics = {
      totalFramesProcessados: 0,
      totalDeteccoesValidas: 0,
      totalCandidatosIniciados: 0,
      totalConfirmados: 0,
      totalDuplicacoesBloqueadas: 0,
      totalDescartesBaixaConfianca: 0,
      totalNaoIdentificados: 0,
      totalInstabilidadesDetectadas: 0,
      totalJanelasExcedidas: 0,
      motivoUltimoDescarte: null
    };
    this.minimumConfirmations = minimumConfirmations;
    this.minConfidence = minConfidence;
    this.stabilityWindowMs = stabilityWindowMs;
    this.maxConfirmationWindowMs = maxConfirmationWindowMs;
  }
  setUltimoObjetoConfirmado(objeto, eventId = null) {
    this.ultimoObjetoConfirmado = objeto;
    this.currentEventId = eventId;
    if (objeto) {
      this.currentState = "RESULTADO_CONFIRMADO";
      this.horarioUltimaConfirmacao = Date.now();
    } else {
      this.currentState = "RODA_NORMAL";
    }
  }
  getUltimoObjetoConfirmado() {
    return this.ultimoObjetoConfirmado;
  }
  getCurrentEventId() {
    return this.currentEventId;
  }
  getCurrentState() {
    return this.currentState;
  }
  getMetrics() {
    return { ...this.metrics, motivoUltimoDescarte: this.motivoUltimoDescarte };
  }
  getCandidateState() {
    const tempoDesdeDeteccaoMs = this.resultScreenDetectedAtTimestamp ? Math.max(0, Date.now() - this.resultScreenDetectedAtTimestamp) : 0;
    return {
      candidato: this.candidateResult,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      confirmacoesNecessarias: this.minimumConfirmations,
      primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
      ultimaDeteccaoTimestamp: this.ultimaDeteccaoTimestamp,
      lastConfidence: this.lastConfidence,
      state: this.currentState,
      eventId: this.currentEventId,
      motivoUltimoDescarte: this.motivoUltimoDescarte,
      tempoEstavelMs: tempoDesdeDeteccaoMs,
      resultadoScreenDetected: this.resultadoScreenDetected,
      resultScreenConfidence: this.resultScreenConfidence,
      framesAnalisadosJanela: this.framesAnalisadosJanela,
      ultimoObjetoConfirmado: this.ultimoObjetoConfirmado
    };
  }
  getStateSnapshot() {
    return {
      currentState: this.currentState,
      candidateResult: this.candidateResult,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
      ultimaDeteccaoTimestamp: this.ultimaDeteccaoTimestamp,
      lastConfidence: this.lastConfidence,
      ultimoObjetoConfirmado: this.ultimoObjetoConfirmado,
      currentEventId: this.currentEventId,
      horarioUltimaConfirmacao: this.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: this.confiancaUltimaConfirmacao,
      motivoUltimoDescarte: this.motivoUltimoDescarte,
      naoIdentificadoCountConsecutivo: this.naoIdentificadoCountConsecutivo,
      roundSequenceCounter: this.roundSequenceCounter,
      resultadoScreenDetected: this.resultadoScreenDetected,
      resultScreenConfidence: this.resultScreenConfidence,
      framesAnalisadosJanela: this.framesAnalisadosJanela,
      resultScreenDetectedAtTimestamp: this.resultScreenDetectedAtTimestamp,
      metrics: { ...this.metrics }
    };
  }
  restoreState(snapshot) {
    if (snapshot.currentState !== void 0) this.currentState = snapshot.currentState;
    if (snapshot.candidateResult !== void 0) this.candidateResult = snapshot.candidateResult;
    if (snapshot.confirmacoesConsecutivas !== void 0) this.confirmacoesConsecutivas = snapshot.confirmacoesConsecutivas;
    if (snapshot.primeiraDeteccaoTimestamp !== void 0) this.primeiraDeteccaoTimestamp = snapshot.primeiraDeteccaoTimestamp;
    if (snapshot.ultimaDeteccaoTimestamp !== void 0) this.ultimaDeteccaoTimestamp = snapshot.ultimaDeteccaoTimestamp;
    if (snapshot.lastConfidence !== void 0) this.lastConfidence = snapshot.lastConfidence;
    if (snapshot.ultimoObjetoConfirmado !== void 0) this.ultimoObjetoConfirmado = snapshot.ultimoObjetoConfirmado;
    if (snapshot.currentEventId !== void 0) this.currentEventId = snapshot.currentEventId;
    if (snapshot.horarioUltimaConfirmacao !== void 0) this.horarioUltimaConfirmacao = snapshot.horarioUltimaConfirmacao;
    if (snapshot.confiancaUltimaConfirmacao !== void 0) this.confiancaUltimaConfirmacao = snapshot.confiancaUltimaConfirmacao;
    if (snapshot.motivoUltimoDescarte !== void 0) this.motivoUltimoDescarte = snapshot.motivoUltimoDescarte;
    if (snapshot.naoIdentificadoCountConsecutivo !== void 0) this.naoIdentificadoCountConsecutivo = snapshot.naoIdentificadoCountConsecutivo;
    if (snapshot.roundSequenceCounter !== void 0) this.roundSequenceCounter = snapshot.roundSequenceCounter;
    if (snapshot.resultadoScreenDetected !== void 0) this.resultadoScreenDetected = snapshot.resultadoScreenDetected;
    if (snapshot.resultScreenConfidence !== void 0) this.resultScreenConfidence = snapshot.resultScreenConfidence;
    if (snapshot.framesAnalisadosJanela !== void 0) this.framesAnalisadosJanela = snapshot.framesAnalisadosJanela;
    if (snapshot.resultScreenDetectedAtTimestamp !== void 0) this.resultScreenDetectedAtTimestamp = snapshot.resultScreenDetectedAtTimestamp;
    if (snapshot.metrics) this.metrics = { ...snapshot.metrics };
  }
  getUltimoResultadoConfirmado() {
    return {
      objeto: this.ultimoObjetoConfirmado,
      horario: this.horarioUltimaConfirmacao,
      confianca: this.confiancaUltimaConfirmacao,
      eventId: this.currentEventId
    };
  }
  calculateWheelPhase(state) {
    switch (state) {
      case "IDLE":
      case "RODA_NORMAL":
        return "DETEC\xC7\xC3O";
      case "TELA_RESULTADO_DETECTADA":
      case "LEITURA_RESULTADO":
        return "ESTABILIZA\xC7\xC3O";
      case "RESULTADO_CONFIRMADO":
        return "RESULTADO";
      case "RODA_EM_TRANSICAO":
      case "AGUARDANDO_PROXIMA_RODADA":
      default:
        return "TRANSI\xC7\xC3O";
    }
  }
  calculateSceneStability(state, tempoEstavelMs, confianca) {
    if (state === "RESULTADO_CONFIRMADO") {
      return { score: 98, state: "EST\xC1VEL" };
    }
    if (state === "LEITURA_RESULTADO" || state === "TELA_RESULTADO_DETECTADA") {
      return { score: Math.round(70 + confianca / 100 * 25), state: "TRANSI\xC7\xC3O" };
    }
    if (state === "RODA_NORMAL") {
      return { score: 80, state: "EST\xC1VEL" };
    }
    return { score: 40, state: "TRANSI\xC7\xC3O" };
  }
  /**
   * Processa detecção considerando a TELA DE RESULTADO como condição obrigatória para confirmações.
   */
  processarDeteccao(rawObjeto, confiancaRaw, resultadoScreenDetected = false, resultScreenConfidence = 0, sessionId, currentFrameId, timestampOverride) {
    this.metrics.totalFramesProcessados++;
    const timestamp = timestampOverride !== void 0 ? timestampOverride : Date.now();
    const objetoNormalizado = rawObjeto ? rawObjeto.trim().toLowerCase() : null;
    this.resultadoScreenDetected = resultadoScreenDetected;
    this.resultScreenConfidence = resultScreenConfidence;
    if (!resultadoScreenDetected) {
      if (this.currentState === "TELA_RESULTADO_DETECTADA" || this.currentState === "LEITURA_RESULTADO" || this.currentState === "RESULTADO_CONFIRMADO") {
        logger.info("[RESULT-SCREEN] Tela de resultado encerrada");
        this.currentState = "AGUARDANDO_PROXIMA_RODADA";
        this.candidateResult = null;
        this.confirmacoesConsecutivas = 0;
        this.framesAnalisadosJanela = 0;
        this.resultScreenDetectedAtTimestamp = null;
      } else if (this.currentState === "AGUARDANDO_PROXIMA_RODADA" || this.currentState === "IDLE") {
        this.currentState = "RODA_NORMAL";
      }
      const tempoDesdeDeteccaoMs2 = 0;
      const resultScreenInfo2 = {
        resultadoScreenDetected: false,
        confidence: resultScreenConfidence,
        estadoAtual: this.currentState,
        tempoDesdeDeteccaoMs: tempoDesdeDeteccaoMs2,
        framesAnalisadosJanela: 0,
        candidatoAtual: null,
        confirmacoesConsecutivas: 0,
        resultadoConfirmado: this.ultimoObjetoConfirmado,
        eventId: this.currentEventId
      };
      const sceneStability2 = this.calculateSceneStability(this.currentState, 0, confiancaRaw);
      const wheelPhase2 = this.calculateWheelPhase(this.currentState);
      return {
        objeto: objetoNormalizado || "n\xE3o identificado",
        confianca: confiancaRaw,
        timestamp,
        eventId: void 0,
        // NUNCA criar eventId se fora da tela de resultado
        status: "descartado_fora_de_tela_resultado",
        state: this.currentState,
        confirmedNow: false,
        wheelPhase: wheelPhase2,
        sceneStability: sceneStability2,
        tempoEstavelMs: 0,
        resultScreenInfo: resultScreenInfo2,
        candidateResult: {
          candidato: null,
          confirmacoesConsecutivas: 0,
          confirmacoesNecessarias: this.minimumConfirmations,
          primeiraDeteccaoTimestamp: null,
          ultimaDeteccaoTimestamp: null,
          lastConfidence: 0,
          tempoEstavelMs: 0
        },
        ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
        motivoDescarte: "Fora da Tela de Resultado (Resultado Bloqueado)"
      };
    }
    if (this.currentState === "IDLE" || this.currentState === "RODA_NORMAL" || this.currentState === "RODA_EM_TRANSICAO" || this.currentState === "AGUARDANDO_PROXIMA_RODADA") {
      logger.info("[RESULT-SCREEN] Tela de resultado detectada");
      logger.info(`[RESULT-SCREEN] Confian\xE7a: ${Math.round(resultScreenConfidence * 100)}%`);
      logger.info("[RESULT-SCREEN] Iniciando janela de leitura");
      this.currentState = "TELA_RESULTADO_DETECTADA";
      this.resultScreenDetectedAtTimestamp = timestamp;
      this.framesAnalisadosJanela = 0;
      this.candidateResult = null;
      this.confirmacoesConsecutivas = 0;
      this.currentState = "LEITURA_RESULTADO";
    }
    const tempoDesdeDeteccaoMs = this.resultScreenDetectedAtTimestamp ? Math.max(0, timestamp - this.resultScreenDetectedAtTimestamp) : 0;
    if (this.currentState === "RESULTADO_CONFIRMADO") {
      this.metrics.totalDuplicacoesBloqueadas++;
      const resultScreenInfo2 = {
        resultadoScreenDetected: true,
        confidence: resultScreenConfidence,
        estadoAtual: "RESULTADO_CONFIRMADO",
        tempoDesdeDeteccaoMs,
        framesAnalisadosJanela: this.framesAnalisadosJanela,
        candidatoAtual: this.candidateResult,
        confirmacoesConsecutivas: this.confirmacoesConsecutivas,
        resultadoConfirmado: this.ultimoObjetoConfirmado,
        eventId: this.currentEventId
      };
      const sceneStability2 = this.calculateSceneStability("RESULTADO_CONFIRMADO", tempoDesdeDeteccaoMs, confiancaRaw);
      const wheelPhase2 = this.calculateWheelPhase("RESULTADO_CONFIRMADO");
      return {
        objeto: objetoNormalizado || "n\xE3o identificado",
        confianca: confiancaRaw,
        timestamp,
        eventId: this.currentEventId || void 0,
        status: "duplicado",
        state: "RESULTADO_CONFIRMADO",
        confirmedNow: false,
        wheelPhase: wheelPhase2,
        sceneStability: sceneStability2,
        tempoEstavelMs: tempoDesdeDeteccaoMs,
        resultScreenInfo: resultScreenInfo2,
        candidateResult: {
          candidato: this.candidateResult,
          confirmacoesConsecutivas: this.confirmacoesConsecutivas,
          confirmacoesNecessarias: this.minimumConfirmations,
          primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
          ultimaDeteccaoTimestamp: this.ultimaDeteccaoTimestamp,
          lastConfidence: this.lastConfidence,
          tempoEstavelMs: tempoDesdeDeteccaoMs
        },
        ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
        motivoDescarte: "Resultado j\xE1 confirmado nesta Tela de Resultado"
      };
    }
    this.framesAnalisadosJanela++;
    const ehPermitido = objetoNormalizado && OBJETOS_RODA_PERMITIDOS.includes(objetoNormalizado);
    if (ehPermitido && confiancaRaw >= this.minConfidence) {
      const objetoValido = objetoNormalizado;
      logger.info(`[RESULT-SCREEN] Candidato: ${objetoValido.toUpperCase()} ${confiancaRaw}%`);
      if (this.candidateResult === objetoValido) {
        this.confirmacoesConsecutivas++;
      } else {
        this.candidateResult = objetoValido;
        this.confirmacoesConsecutivas = 1;
        this.primeiraDeteccaoTimestamp = timestamp;
      }
      logger.info(`[RESULT-SCREEN] Confirma\xE7\xE3o ${this.confirmacoesConsecutivas}/${this.minimumConfirmations}`);
      if (this.confirmacoesConsecutivas >= this.minimumConfirmations) {
        this.currentState = "RESULTADO_CONFIRMADO";
        this.roundSequenceCounter++;
        this.currentEventId = `LIVE_EVT_${timestamp}_R${String(this.roundSequenceCounter).padStart(3, "0")}`;
        this.ultimoObjetoConfirmado = objetoValido;
        this.horarioUltimaConfirmacao = timestamp;
        this.confiancaUltimaConfirmacao = confiancaRaw;
        logger.info(`[RESULT-SCREEN] RESULTADO CONFIRMADO: ${objetoValido.toUpperCase()}`);
        this.metrics.totalConfirmados++;
        const resultScreenInfo2 = {
          resultadoScreenDetected: true,
          confidence: resultScreenConfidence,
          estadoAtual: "RESULTADO_CONFIRMADO",
          tempoDesdeDeteccaoMs,
          framesAnalisadosJanela: this.framesAnalisadosJanela,
          candidatoAtual: objetoValido,
          confirmacoesConsecutivas: this.confirmacoesConsecutivas,
          resultadoConfirmado: objetoValido,
          eventId: this.currentEventId
        };
        const sceneStability2 = this.calculateSceneStability("RESULTADO_CONFIRMADO", tempoDesdeDeteccaoMs, confiancaRaw);
        const wheelPhase2 = this.calculateWheelPhase("RESULTADO_CONFIRMADO");
        return {
          objeto: objetoValido,
          confianca: confiancaRaw,
          timestamp,
          eventId: this.currentEventId,
          status: "confirmado",
          state: "RESULTADO_CONFIRMADO",
          confirmedNow: true,
          wheelPhase: wheelPhase2,
          sceneStability: sceneStability2,
          tempoEstavelMs: tempoDesdeDeteccaoMs,
          resultScreenInfo: resultScreenInfo2,
          candidateResult: {
            candidato: objetoValido,
            confirmacoesConsecutivas: this.confirmacoesConsecutivas,
            confirmacoesNecessarias: this.minimumConfirmations,
            primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
            ultimaDeteccaoTimestamp: timestamp,
            lastConfidence: confiancaRaw,
            tempoEstavelMs: tempoDesdeDeteccaoMs
          },
          ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado(),
          objetoPadraoParaBanco: {
            resultado: objetoValido,
            confianca: confiancaRaw,
            origem: "gemini_live",
            criado_em: new Date(timestamp).toISOString(),
            eventId: this.currentEventId
          }
        };
      }
    } else {
      this.candidateResult = null;
      this.confirmacoesConsecutivas = 0;
    }
    const resultScreenInfo = {
      resultadoScreenDetected: true,
      confidence: resultScreenConfidence,
      estadoAtual: "LEITURA_RESULTADO",
      tempoDesdeDeteccaoMs,
      framesAnalisadosJanela: this.framesAnalisadosJanela,
      candidatoAtual: this.candidateResult,
      confirmacoesConsecutivas: this.confirmacoesConsecutivas,
      resultadoConfirmado: this.ultimoObjetoConfirmado,
      eventId: this.currentEventId
    };
    const sceneStability = this.calculateSceneStability("LEITURA_RESULTADO", tempoDesdeDeteccaoMs, confiancaRaw);
    const wheelPhase = this.calculateWheelPhase("LEITURA_RESULTADO");
    return {
      objeto: objetoNormalizado || "n\xE3o identificado",
      confianca: confiancaRaw,
      timestamp,
      eventId: void 0,
      status: "em_analise",
      state: "LEITURA_RESULTADO",
      confirmedNow: false,
      wheelPhase,
      sceneStability,
      tempoEstavelMs: tempoDesdeDeteccaoMs,
      resultScreenInfo,
      candidateResult: {
        candidato: this.candidateResult,
        confirmacoesConsecutivas: this.confirmacoesConsecutivas,
        confirmacoesNecessarias: this.minimumConfirmations,
        primeiraDeteccaoTimestamp: this.primeiraDeteccaoTimestamp,
        ultimaDeteccaoTimestamp: timestamp,
        lastConfidence: confiancaRaw,
        tempoEstavelMs: tempoDesdeDeteccaoMs
      },
      ultimoResultadoConfirmado: this.getUltimoResultadoConfirmado()
    };
  }
};

// src/services/WheelRegionDetector.ts
var WheelRegionDetector = class _WheelRegionDetector {
  static {
    /**
     * Imagem de referência oficial da Roda do Farm Fishing
     */
    this.REFERENCE_IMAGE_URL = "https://ik.imagekit.io/kqrijzbci/e15a5299-58cf-4b33-94a4-1fb66dfcfec1.jpg?updatedAt=1785981176909";
  }
  static {
    /**
     * Limiar mínimo de confiança para considerar a Roda localizada com segurança
     */
    this.MIN_LOCATION_CONFIDENCE = 50;
  }
  /**
   * Localiza dinamicamente a região da Roda no frame fornecido sem coordenadas pixel estáticas.
   * Adapta-se automaticamente a redimensionamentos do scrcpy, proporções de tela e variações de resolução.
   */
  static detectWheelRegion(input) {
    const originalWidth = input.width || 640;
    const originalHeight = input.height || 480;
    if (input.isBlackOrEmpty || originalWidth <= 0 || originalHeight <= 0) {
      return {
        found: false,
        confidence: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        relX: 0,
        relY: 0,
        relWidth: 0,
        relHeight: 0,
        originalWidth,
        originalHeight,
        status: "RODA N\xC3O LOCALIZADA",
        reason: "WHEEL_REGION_NOT_FOUND"
      };
    }
    let contentConfidence = 95;
    if (input.imageData) {
      const data = input.imageData.data;
      let totalPixelSum = 0;
      const step = Math.max(1, Math.floor(data.length / (4 * 2e3)));
      let samplesCount = 0;
      for (let i = 0; i < data.length; i += 4 * step) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        totalPixelSum += brightness;
        samplesCount++;
      }
      const meanBrightness = totalPixelSum / (samplesCount || 1);
      if (meanBrightness < 8) {
        return {
          found: false,
          confidence: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          relX: 0,
          relY: 0,
          relWidth: 0,
          relHeight: 0,
          originalWidth,
          originalHeight,
          status: "RODA N\xC3O LOCALIZADA",
          reason: "WHEEL_REGION_NOT_FOUND"
        };
      }
      contentConfidence = Math.min(98, Math.max(88, Math.round(80 + meanBrightness / 3)));
    }
    if (contentConfidence < _WheelRegionDetector.MIN_LOCATION_CONFIDENCE) {
      return {
        found: false,
        confidence: contentConfidence,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        relX: 0,
        relY: 0,
        relWidth: 0,
        relHeight: 0,
        originalWidth,
        originalHeight,
        status: "RODA N\xC3O LOCALIZADA",
        reason: "WHEEL_REGION_NOT_FOUND"
      };
    }
    const isPortrait = originalHeight >= originalWidth;
    let relWidth;
    let relHeight;
    let relX;
    let relY;
    if (isPortrait) {
      relWidth = 0.82;
      relHeight = relWidth * originalWidth / originalHeight;
      relX = (1 - relWidth) / 2;
      relY = 0.35;
    } else {
      relHeight = 0.7;
      relWidth = relHeight * originalHeight / originalWidth;
      relX = (1 - relWidth) / 2;
      relY = 0.22;
    }
    let x = Math.round(relX * originalWidth);
    let y = Math.round(relY * originalHeight);
    let width = Math.round(relWidth * originalWidth);
    let height = Math.round(relHeight * originalHeight);
    x = Math.max(0, Math.min(x, originalWidth - 10));
    y = Math.max(0, Math.min(y, originalHeight - 10));
    width = Math.min(width, originalWidth - x);
    height = Math.min(height, originalHeight - y);
    return {
      found: true,
      confidence: contentConfidence,
      x,
      y,
      width,
      height,
      relX,
      relY,
      relWidth,
      relHeight,
      originalWidth,
      originalHeight,
      status: "RODA LOCALIZADA"
    };
  }
  /**
   * Recorta exclusivamente a ROI da Roda a partir de um Canvas HTML e retorna a imagem em Base64 Data URL.
   */
  static cropROIFromCanvas(sourceCanvas, roi, jpegQuality = 0.85) {
    if (!roi.found || roi.width <= 0 || roi.height <= 0) {
      return null;
    }
    try {
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = roi.width;
      cropCanvas.height = roi.height;
      const ctx = cropCanvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(
        sourceCanvas,
        roi.x,
        roi.y,
        roi.width,
        roi.height,
        0,
        0,
        roi.width,
        roi.height
      );
      return cropCanvas.toDataURL("image/jpeg", jpegQuality);
    } catch (err) {
      console.error("[WHEEL-DETECTOR] Erro ao recortar ROI do canvas:", err);
      return null;
    }
  }
};

// src/services/WheelResultScreenDetector.ts
var WheelResultScreenDetector = class _WheelResultScreenDetector {
  static {
    this.MIN_RESULT_SCREEN_CONFIDENCE = 0.8;
  }
  // 80%
  /**
   * Avalia o frame e determina se a Tela de Resultado está presente.
   */
  static detectResultScreen(input) {
    const { width: originalWidth, height: originalHeight, isBlackOrEmpty } = input;
    if (isBlackOrEmpty || !originalWidth || !originalHeight) {
      return {
        resultadoScreenDetected: false,
        confidence: 0,
        reason: "FRAME_EMPTY_OR_BLACK"
      };
    }
    const isPortrait = originalHeight >= originalWidth;
    let relWidth;
    let relHeight;
    let relX;
    let relY;
    if (isPortrait) {
      relWidth = 0.42;
      relHeight = relWidth * originalWidth / originalHeight;
      relX = (1 - relWidth) / 2;
      relY = 0.62;
    } else {
      relHeight = 0.4;
      relWidth = relHeight * originalHeight / originalWidth;
      relX = (1 - relWidth) / 2;
      relY = 0.58;
    }
    const x = Math.round(relX * originalWidth);
    const y = Math.round(relY * originalHeight);
    const width = Math.round(relWidth * originalWidth);
    const height = Math.round(relHeight * originalHeight);
    let confidence = 0.92;
    if (input.imageData) {
      const data = input.imageData.data;
      const totalPixels = data.length / 4;
      const step = Math.max(1, Math.floor(totalPixels / 2e3));
      let totalBrightness = 0;
      let modalCenterBrightness = 0;
      let modalCenterCount = 0;
      let outerBrightness = 0;
      let outerCount = 0;
      for (let i = 0; i < data.length; i += 4 * step) {
        const pixelIdx = i / 4;
        const pxX = pixelIdx % originalWidth;
        const pxY = Math.floor(pixelIdx / originalWidth);
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += brightness;
        if (pxX >= x && pxX <= x + width && pxY >= y && pxY <= y + height) {
          modalCenterBrightness += brightness;
          modalCenterCount++;
        } else {
          outerBrightness += brightness;
          outerCount++;
        }
      }
      const meanTotal = totalBrightness / (totalPixels / step || 1);
      const meanModal = modalCenterBrightness / (modalCenterCount || 1);
      const meanOuter = outerBrightness / (outerCount || 1);
      if (meanTotal < 10) {
        return {
          resultadoScreenDetected: false,
          confidence: 0,
          reason: "DARK_FRAME"
        };
      }
      const modalContrastRatio = meanModal / (meanOuter || 1);
      if (modalContrastRatio >= 1.15 || meanModal > 75 && meanOuter < 65) {
        confidence = Math.min(0.98, Math.max(0.85, 0.85 + (modalContrastRatio - 1) * 0.15));
      } else {
        confidence = Math.max(0.2, Math.min(0.7, meanModal / 100));
      }
    }
    const detected = confidence >= _WheelResultScreenDetector.MIN_RESULT_SCREEN_CONFIDENCE;
    return {
      resultadoScreenDetected: detected,
      confidence: Math.round(confidence * 100) / 100,
      // ex: 0.96
      roi: {
        x,
        y,
        width,
        height,
        posicaoVertical: "INFERIOR (CORRETA)"
      },
      reason: detected ? "RESULT_SCREEN_DETECTED" : "NOT_RESULT_SCREEN"
    };
  }
};

// src/config/wheelObjectReferences.ts
var WHEEL_OBJECT_REFERENCES = {
  sorvete: {
    name: "sorvete",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/a28a5e96-7a9e-4926-a5e1-be9dfe9fceb9.jpg?updatedAt=1785981142978"
  },
  boia: {
    name: "boia",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/b5e74581-d193-43ae-bde5-0643bd37660d.jpg?updatedAt=1785981175896"
  },
  balao: {
    name: "balao",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/586cbaf9-499e-4202-a3c4-fba5c7d8c067.jpg?updatedAt=1785981175615"
  },
  soco: {
    name: "soco",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/87ed6c84-9d44-48b9-add4-150b9c23976e.jpg?updatedAt=1785981175684"
  },
  tedy: {
    name: "tedy",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/0253770e-7ab4-4214-a3ab-12ffebbbb15e.jpg?updatedAt=1785981176021"
  },
  princesa: {
    name: "princesa",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/be25ace8-836f-4b0f-afa2-0d900e78bbeb.jpg?updatedAt=1785981175998"
  },
  camera: {
    name: "camera",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/218e3281-d9b7-4ca5-b556-6259df680fe5.jpg?updatedAt=1785981175931"
  },
  coroa: {
    name: "coroa",
    imageUrl: "https://ik.imagekit.io/kqrijzbci/6126fb22-1ea1-4e23-84d0-4621868af1d4.jpg?updatedAt=1785981176281"
  }
};
var ALLOWED_WHEEL_OBJECTS = [
  "sorvete",
  "boia",
  "balao",
  "soco",
  "tedy",
  "princesa",
  "camera",
  "coroa"
];
function isAllowedWheelObject(name) {
  if (!name) return false;
  const clean = name.toLowerCase().trim();
  return ALLOWED_WHEEL_OBJECTS.includes(clean);
}

// src/services/WheelObjectVisualMatcher.ts
var WheelObjectVisualMatcher = class {
  static {
    this.MIN_VISUAL_COMPATIBILITY_SCORE = 60;
  }
  // 60% mínimo de compatibilidade visual
  /**
   * Avalia a compatibilidade visual entre a ROI do objeto e o candidato indicado pela Gemini.
   */
  static matchObject(rawCandidate, geminiConfidence, base64OrDataUrl) {
    if (!rawCandidate || !isAllowedWheelObject(rawCandidate)) {
      return {
        isValid: false,
        score: 0,
        matchedObject: null,
        referenceUrl: null,
        reason: "Objeto n\xE3o pertence ao cat\xE1logo dos 8 objetos permitidos."
      };
    }
    const cleanCandidate = rawCandidate.toLowerCase().trim();
    const reference = WHEEL_OBJECT_REFERENCES[cleanCandidate];
    if (geminiConfidence < 85) {
      return {
        isValid: false,
        score: Math.round(geminiConfidence * 0.7),
        matchedObject: cleanCandidate,
        referenceUrl: reference.imageUrl,
        reason: `Confian\xE7a Gemini abaixo do limiar de 85% (${geminiConfidence}%).`
      };
    }
    let visualScore = geminiConfidence;
    if (base64OrDataUrl) {
      const colorCheck = this.verifyColorSignature(cleanCandidate, base64OrDataUrl);
      if (!colorCheck.isCompatible) {
        return {
          isValid: false,
          score: Math.round(colorCheck.compatibilityScore),
          matchedObject: cleanCandidate,
          referenceUrl: reference.imageUrl,
          reason: `Incompatibilidade visual com a refer\xEAncia de "${cleanCandidate}": ${colorCheck.reason}`
        };
      }
      visualScore = Math.round(geminiConfidence * 0.5 + colorCheck.compatibilityScore * 0.5);
    }
    const isValid = visualScore >= this.MIN_VISUAL_COMPATIBILITY_SCORE;
    return {
      isValid,
      score: visualScore,
      matchedObject: cleanCandidate,
      referenceUrl: reference.imageUrl,
      reason: isValid ? `Compat\xEDvel com a refer\xEAncia oficial de ${cleanCandidate}.` : `Score visual insuficiente (${visualScore}% < ${this.MIN_VISUAL_COMPATIBILITY_SCORE}%).`
    };
  }
  /**
   * Amostragem de assinatura de cor/luminância do base64 para detectar divergências visuais
   */
  static verifyColorSignature(candidate, base64Data) {
    try {
      const clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const rawBuffer = typeof Buffer !== "undefined" ? Buffer.from(clean, "base64") : null;
      if (!rawBuffer || rawBuffer.length < 50) {
        return { isCompatible: true, compatibilityScore: 85, reason: "Sem dados de buffer suficientes para amostragem" };
      }
      let sumR = 0, sumG = 0, sumB = 0;
      const step = Math.max(1, Math.floor(rawBuffer.length / 500));
      let count = 0;
      for (let i = 0; i < rawBuffer.length; i += step) {
        const val = rawBuffer[i];
        if (i % 3 === 0) sumR += val;
        else if (i % 3 === 1) sumG += val;
        else sumB += val;
        count++;
      }
      const avgR = sumR / (count / 3 || 1);
      const avgG = sumG / (count / 3 || 1);
      const avgB = sumB / (count / 3 || 1);
      switch (candidate) {
        case "soco": {
          if (avgR > avgB * 1.6 && avgG > avgB * 1.4) {
            return {
              isCompatible: false,
              compatibilityScore: 20,
              reason: 'Predomin\xE2ncia amarela/laranja incompat\xEDvel com o objeto "soco" (azul).'
            };
          }
          break;
        }
        case "coroa": {
          if (avgB > avgR * 1.5 && avgB > avgG) {
            return {
              isCompatible: false,
              compatibilityScore: 25,
              reason: 'Predomin\xE2ncia azul incompat\xEDvel com o objeto "coroa" (amarelo/dourado).'
            };
          }
          break;
        }
        case "camera": {
          const avgLum = (avgR + avgG + avgB) / 3;
          if (avgLum > 215 && avgR > 190 && avgG > 190) {
            return {
              isCompatible: false,
              compatibilityScore: 30,
              reason: 'Luminosidade excessivamente clara incompat\xEDvel com "camera" (escura).'
            };
          }
          break;
        }
        case "boia": {
          if (avgB > avgR * 1.8) {
            return {
              isCompatible: false,
              compatibilityScore: 20,
              reason: 'Predomin\xE2ncia azul incompat\xEDvel com "boia" (laranja/vermelho).'
            };
          }
          break;
        }
        default:
          break;
      }
      return { isCompatible: true, compatibilityScore: 90, reason: "Assinatura visual compat\xEDvel" };
    } catch (e) {
      return { isCompatible: true, compatibilityScore: 85, reason: "Valida\xE7\xE3o ignorada por exce\xE7\xE3o" };
    }
  }
};

// src/services/backendLiveService.ts
var activeSessionStatesMap = /* @__PURE__ */ new Map();
var userToSessionMap = /* @__PURE__ */ new Map();
function getSessaoPorUsuario(usuarioId) {
  const sessionId = userToSessionMap.get(usuarioId);
  if (sessionId) {
    return activeSessionStatesMap.get(sessionId);
  }
  return void 0;
}
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("A chave GEMINI_API_KEY n\xE3o est\xE1 configurada no servidor.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function generateContentWithFallback(ai, params) {
  const candidateModels = [
    params.model,
    "gemini-flash-latest",
    "gemini-2.5-pro",
    "gemini-2.0-flash"
  ].filter(Boolean);
  const modelsToTry = Array.from(new Set(candidateModels));
  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model: modelName
      });
      return { response, modelUsed: modelName };
    } catch (err) {
      lastError = err;
      const isRecoverableError = err?.status === 429 || err?.code === 429 || err?.status === 404 || err?.code === 404 || err?.message && (err.message.includes("429") || err.message.includes("404") || err.message.includes("not found") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED"));
      if (isRecoverableError) {
        logger.warn(
          `[GEMINI FALLBACK] Modelo ${modelName} falhou (${err?.message || err?.status}). Tentando pr\xF3ximo modelo...`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
var BackendLiveService = class {
  /**
   * Inicia uma sessão Live real com a Gemini Live API no backend.
   * Se já existir uma sessão lógica para o usuário, REAPROVEITA o estado e reconecta a Gemini API,
   * garantindo que reconexão NUNCA zere a máquina de estados nem crie uma nova rodada.
   */
  static async iniciarSessao(usuarioId = "default_user", config) {
    const sessaoExistente = getSessaoPorUsuario(usuarioId);
    if (sessaoExistente && !config?.forceNewSession) {
      logger.info(
        `[LIVE BACKEND] [REAPROVEITANDO SESS\xC3O EXISTENTE] Reutilizando sessionId ${sessaoExistente.sessionId} para o usu\xE1rio ${usuarioId}...`
      );
      return this.reconectar(usuarioId);
    }
    if (sessaoExistente && config?.forceNewSession) {
      logger.info(
        `[LIVE BACKEND] Encerrando sess\xE3o anterior (${sessaoExistente.sessionId}) para abrir nova sess\xE3o zerada...`
      );
      await this.encerrarSessao(usuarioId, "Substitu\xEDda por nova sess\xE3o expl\xEDcita");
    }
    const reqConfirmations = config?.consecutiveConfirmationsRequired || 3;
    const reqConfidence = config?.minConfidenceRequired || 85;
    const modelTarget = config?.model || "gemini-flash-latest";
    const sessionId = config?.sessionId || `LIVE_SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const connectionId = `GEMINI_CONN_${Date.now()}_1`;
    const agora = /* @__PURE__ */ new Date();
    const novaSessao = {
      sessionId,
      connectionId,
      usuarioId,
      estado: "conectando",
      conectadoEm: agora,
      model: modelTarget,
      totalFrames: 0,
      tentativasReconexao: 0,
      lastResetAt: null,
      // Analisador Visual Especializado (PROMPT LIVE 009)
      visionAnalyzer: new WheelVisionAnalyzer(
        reqConfirmations,
        reqConfidence,
        VISION_ANALYZER_CONFIG.STABILITY_WINDOW_MS
      ),
      // Estabilização
      consecutiveConfirmationsRequired: reqConfirmations,
      minConfidenceRequired: reqConfidence,
      candidatoAtual: null,
      confirmacoesConsecutivas: 0,
      ultimoObjetoConfirmado: null,
      horarioUltimaConfirmacao: null,
      confiancaUltimaConfirmacao: null,
      totalRodadasDetectadasSessao: 0,
      // Telemetria & Diagnóstico
      totalDetectados: 0,
      totalDescartes: 0,
      totalAguardando: 0,
      totalSemResposta: 0,
      totalErrosParser: 0,
      somaLatenciaMs: 0,
      contadorLatencias: 0,
      ultimoTempoRespostaMs: 0,
      // Anti-Duplicação
      tentativasPersistencia: 0,
      registrosCriados: 0,
      duplicacoesBloqueadas: 0,
      // Históricos Rastreamento
      recentFrameTraces: [],
      confirmedRoundsHistory: []
    };
    activeSessionStatesMap.set(sessionId, novaSessao);
    userToSessionMap.set(usuarioId, sessionId);
    logger.info(
      `[LIVE BACKEND] [IN\xCDCIO DE SESS\xC3O L\xD3GICA] Session ID: ${sessionId} | Connection ID: ${connectionId} | Usu\xE1rio: ${usuarioId} | Model: ${modelTarget} | Estabiliza\xE7\xE3o: ${reqConfirmations} frames @ ${reqConfidence}% conf.`
    );
    try {
      getGenAIClient();
      novaSessao.estado = "conectado";
      novaSessao.mensagemErro = void 0;
      logger.info(
        `[LIVE BACKEND] [CONECTADO] Sess\xE3o ${sessionId} (Conn: ${connectionId}) conectada com sucesso \xE0 Gemini Live API.`
      );
      return this.obterStatusStatusSessao(novaSessao);
    } catch (err) {
      const msgErro = err?.message || "Erro ao conectar \xE0 Gemini Live API.";
      logger.error(`[LIVE BACKEND] [FALHA CONEX\xC3O] Erro ao iniciar sess\xE3o ${sessionId}:`, msgErro);
      novaSessao.estado = "erro";
      novaSessao.mensagemErro = msgErro;
      return this.obterStatusStatusSessao(novaSessao);
    }
  }
  /**
   * Encerra a sessão Live ativa do usuário, liberando recursos e calculando a duração.
   */
  static async encerrarSessao(usuarioId = "default_user", motivo = "Solicita\xE7\xE3o do usu\xE1rio") {
    const sessao = getSessaoPorUsuario(usuarioId);
    if (!sessao) {
      logger.info(`[LIVE BACKEND] Nenhuma sess\xE3o ativa encontrada para o usu\xE1rio ${usuarioId}.`);
      return {
        estado: "desconectado",
        sessionId: null,
        connectionId: null,
        mensagemErro: null,
        conectadoEm: null,
        tentativasReconexao: 0,
        totalFramesEnviados: 0,
        ultimoResultadoAt: null
      };
    }
    const agora = /* @__PURE__ */ new Date();
    const duracaoMs = agora.getTime() - sessao.conectadoEm.getTime();
    const duracaoSegundos = Math.round(duracaoMs / 1e3);
    sessao.estado = "desconectado";
    sessao.desconectadoEm = agora;
    sessao.motivoDesconexao = motivo;
    sessao.lastResetAt = agora.getTime();
    logger.info(
      `[LIVE BACKEND] [ENCERRAMENTO DEFINITIVO DE SESS\xC3O] Session ID: ${sessao.sessionId} | Connection ID: ${sessao.connectionId} | Dura\xE7\xE3o: ${duracaoSegundos}s | Motivo: ${motivo} | Total Frames: ${sessao.totalFrames} | Rodadas Confirmadas: ${sessao.totalRodadasDetectadasSessao}`
    );
    activeSessionStatesMap.delete(sessao.sessionId);
    userToSessionMap.delete(usuarioId);
    return {
      estado: "desconectado",
      sessionId: sessao.sessionId,
      connectionId: sessao.connectionId,
      mensagemErro: null,
      conectadoEm: sessao.conectadoEm.toISOString(),
      duracaoSegundos,
      motivoDesconexao: motivo,
      tentativasReconexao: sessao.tentativasReconexao,
      totalFramesEnviados: sessao.totalFrames,
      ultimoResultadoAt: sessao.ultimoResultadoAt || null,
      modelUtilizado: sessao.model,
      ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
      horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
      totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
      lastResetAt: sessao.lastResetAt
    };
  }
  /**
   * Tenta reconectar automaticamente mantendo integralmente o LiveSessionState e WheelVisionAnalyzer intactos.
   */
  static async reconectar(usuarioId = "default_user") {
    const sessao = getSessaoPorUsuario(usuarioId);
    if (!sessao) {
      logger.info(
        `[LIVE BACKEND] Nenhum LiveSessionState ativo encontrado para ${usuarioId}. Criando nova sess\xE3o...`
      );
      return this.iniciarSessao(usuarioId);
    }
    const oldConnectionId = sessao.connectionId;
    const newConnectionId = `GEMINI_CONN_${Date.now()}_${sessao.tentativasReconexao + 1}`;
    const analyzerStateBefore = sessao.visionAnalyzer.getCurrentState();
    const currentEventIdBefore = sessao.visionAnalyzer.getCurrentEventId();
    const lastConfirmedObjectBefore = sessao.visionAnalyzer.getUltimoObjetoConfirmado();
    const lastConfirmedAtBefore = sessao.horarioUltimaConfirmacao;
    sessao.connectionId = newConnectionId;
    sessao.tentativasReconexao++;
    sessao.estado = "reconectando";
    try {
      getGenAIClient();
      sessao.estado = "conectado";
      sessao.mensagemErro = void 0;
      const analyzerStateAfter = sessao.visionAnalyzer.getCurrentState();
      logger.info(
        `[SESSION-RECONNECT]
\u2022 sessionId: ${sessao.sessionId}
\u2022 oldConnectionId: ${oldConnectionId}
\u2022 newConnectionId: ${newConnectionId}
\u2022 analyzerStateBefore: ${analyzerStateBefore}
\u2022 analyzerStateAfter: ${analyzerStateAfter}
\u2022 currentEventId: ${currentEventIdBefore || "N/A"}
\u2022 lastConfirmedObject: ${lastConfirmedObjectBefore || "N/A"}
\u2022 lastConfirmedAt: ${lastConfirmedAtBefore ? new Date(lastConfirmedAtBefore).toISOString() : "N/A"}`
      );
      return this.obterStatusStatusSessao(sessao);
    } catch (err) {
      const msgErro = err?.message || "Falha ao reconectar com Gemini Live API.";
      logger.error(
        `[LIVE BACKEND] [FALHA RECONEX\xC3O #${sessao.tentativasReconexao}] Session ID: ${sessao.sessionId}:`,
        msgErro
      );
      sessao.estado = "erro";
      sessao.mensagemErro = msgErro;
      return this.obterStatusStatusSessao(sessao);
    }
  }
  /**
   * Processa um frame de vídeo/imagem transmitido pela Live API sem salvar imagens em armazenamento.
   * Diagnostica a resposta BRUTA da Gemini e a integridade visual do frame.
   */
  static async processarFrame(usuarioId = "default_user", framePayload) {
    let sessao = getSessaoPorUsuario(usuarioId);
    if (!sessao || sessao.estado !== "conectado") {
      logger.info(
        `[LIVE BACKEND] Sess\xE3o n\xE3o encontrada ou desconectada para ${usuarioId}. Auto-inicializando sess\xE3o...`
      );
      await this.iniciarSessao(usuarioId);
      sessao = getSessaoPorUsuario(usuarioId);
    }
    if (!sessao) {
      logger.warn(`[LIVE BACKEND] N\xE3o foi poss\xEDvel obter ou criar sess\xE3o ativa para usu\xE1rio ${usuarioId}.`);
      return null;
    }
    sessao.totalFrames++;
    const cleanBase64 = framePayload.base64Data.replace(/^data:image\/\w+;base64,/, "");
    const largura = framePayload.width || 640;
    const altura = framePayload.height || 480;
    const mimeType = framePayload.mimeType || "image/jpeg";
    const tamanhoBytes = Math.round(cleanBase64.length * 3 / 4);
    const tamanhoKB = (tamanhoBytes / 1024).toFixed(1) + " KB";
    const fonte = framePayload.source || "SCREEN_CAPTURE";
    const conteudoVisual = tamanhoBytes > 3e3;
    const detalhesVisual = conteudoVisual ? `Frame v\xE1lido com conte\xFAdo visual (${tamanhoKB}, ${largura}x${altura})` : `ALERTA: Tamanho do JPEG extremamente reduzido (${tamanhoKB}), poss\xEDvel tela preta, vazia ou congelada.`;
    let roi;
    if (framePayload.metadata?.roi) {
      roi = framePayload.metadata.roi;
    } else {
      roi = WheelRegionDetector.detectWheelRegion({
        width: largura,
        height: altura,
        base64Data: cleanBase64,
        isBlackOrEmpty: !conteudoVisual
      });
    }
    let resScreenDetection;
    if (framePayload.metadata?.resultadoScreenDetected !== void 0) {
      resScreenDetection = {
        resultadoScreenDetected: !!framePayload.metadata.resultadoScreenDetected,
        confidence: framePayload.metadata.resultScreenConfidence || 0,
        roi: framePayload.metadata.resultScreenRoi
      };
    } else {
      resScreenDetection = WheelResultScreenDetector.detectResultScreen({
        width: largura,
        height: altura,
        base64Data: cleanBase64,
        isBlackOrEmpty: !conteudoVisual
      });
    }
    const resultScreenDiagnostico = {
      resultadoScreenDetected: resScreenDetection.resultadoScreenDetected,
      confidence: resScreenDetection.confidence,
      estadoAtual: sessao.visionAnalyzer.getCurrentState(),
      tempoDesdeDeteccaoMs: sessao.visionAnalyzer.getCandidateState().tempoEstavelMs,
      framesAnalisadosJanela: sessao.visionAnalyzer.getCandidateState().framesAnalisadosJanela || 0,
      candidatoAtual: sessao.visionAnalyzer.getCandidateState().candidato,
      confirmacoesConsecutivas: sessao.visionAnalyzer.getCandidateState().confirmacoesConsecutivas,
      resultadoConfirmado: sessao.visionAnalyzer.getUltimoObjetoConfirmado(),
      eventId: sessao.visionAnalyzer.getCurrentEventId(),
      roiX: resScreenDetection.roi?.x,
      roiY: resScreenDetection.roi?.y,
      roiWidth: resScreenDetection.roi?.width,
      roiHeight: resScreenDetection.roi?.height,
      posicaoVertical: resScreenDetection.roi?.posicaoVertical || "INFERIOR DA RODA",
      roiValida: resScreenDetection.resultadoScreenDetected && !!resScreenDetection.roi,
      objetoGemini: null,
      confiancaGemini: 0,
      referenciaComparada: null,
      scoreVisual: 0,
      objetoFinal: null,
      confiancaFinal: 0,
      croppedDataUrl: resScreenDetection.roi?.croppedDataUrl || framePayload.metadata?.resultScreenCroppedDataUrl,
      originalDataUrl: framePayload.metadata?.previewUrl || framePayload.base64Data
    };
    const roiDiagnostico = {
      roiFound: roi.found,
      roiConfidence: roi.confidence,
      roiX: roi.x,
      roiY: roi.y,
      roiWidth: roi.width,
      roiHeight: roi.height,
      originalWidth: largura,
      originalHeight: altura,
      status: roi.status,
      croppedDataUrl: roi.croppedDataUrl || framePayload.metadata?.croppedDataUrl,
      originalDataUrl: framePayload.metadata?.previewUrl || framePayload.base64Data,
      reason: roi.reason
    };
    const statusCongelamento = framePayload.metadata?.statusCongelamento;
    const qualidadeJpeg = framePayload.metadata?.qualidadeJpeg;
    const mediaStreamInfo = framePayload.metadata?.mediaStreamInfo;
    const frameDiagnostico = {
      largura,
      altura,
      mimeType,
      tamanhoBytes,
      tamanhoKB,
      timestamp: framePayload.timestamp || Date.now(),
      fonte,
      conteudoVisual,
      detalhesVisual,
      statusCongelamento,
      qualidadeJpeg,
      previewUrl: framePayload.metadata?.previewUrl || framePayload.base64Data,
      mediaStreamInfo,
      roiDiagnostico,
      resultScreenDiagnostico
    };
    sessao.ultimoFrameDiagnostico = frameDiagnostico;
    if (!roi.found && !resScreenDetection.resultadoScreenDetected) {
      logger.warn(
        `[ROI-DIAGNOSTIC]
WHEEL_REGION_NOT_FOUND
frameId: FRAME_${String(sessao.totalFrames).padStart(6, "0")}
roiFound: false
roiConfidence: ${roi.confidence}
resultScreenDetected: false
originalWidth: ${largura}
originalHeight: ${altura}
geminiObject: null
geminiConfidence: 0
analyzerState: ${sessao.visionAnalyzer.getCurrentState()}
confirmedNow: false`
      );
      return {
        objetoDetectado: null,
        confianca: 0,
        rawText: "WHEEL_REGION_NOT_FOUND",
        geminiEstadoLog: "GEMINI_NO_RESPONSE",
        frameDiagnostico,
        timestamp: Date.now()
      };
    }
    try {
      const ai = getGenAIClient();
      let imageToSend = cleanBase64;
      if (resScreenDetection.resultadoScreenDetected && framePayload.metadata?.resultScreenCroppedBase64) {
        imageToSend = framePayload.metadata.resultScreenCroppedBase64.replace(/^data:image\/\w+;base64,/, "");
      } else if (framePayload.metadata?.croppedBase64) {
        imageToSend = framePayload.metadata.croppedBase64.replace(/^data:image\/\w+;base64,/, "");
      }
      const prompt = `Voc\xEA \xE9 o Farm Fishing Gemini Live Visual Engine. Sua \xDANICA fun\xE7\xE3o \xE9 analisar A REGI\xC3O DO S\xCDMBOLO VENCEDOR DA TELA DE RESULTADO do jogo e identificar QUAL dos 8 s\xEDmbolos da Roda Gigante foi o vencedor oficial.

Os 8 s\xEDmbolos permitidos s\xE3o ESTRITAMENTE:
1. sorvete
2. boia
3. balao
4. soco
5. tedy
6. princesa
7. camera
8. coroa

INSTRU\xC7\xD5ES CR\xCDTICAS DE DETEC\xC7\xC3O:
- Analise SOMENTE a regi\xE3o do s\xEDmbolo vencedor na tela de resultado.
- Identifique SOMENTE um dos 8 s\xEDmbolos permitidos acima.
- Ignore textos, bot\xF5es e elementos da interface.
- Responda SEMPRE em formato JSON estrito: {"objetoDetectado": "nome_do_simbolo", "confianca": 95}
- Se nenhum s\xEDmbolo puder ser identificado com seguran\xE7a, responda: {"objetoDetectado": null, "confianca": 0}`;
      const timestampFrameCapturado = framePayload.timestamp || Date.now();
      const timestampFrameEnviado = Date.now();
      const tStart = Date.now();
      logger.info(`[GEMINI] Processando ROI da Roda no frame #${sessao.totalFrames} (${roi.width}x${roi.height}, ROI conf: ${roi.confidence}%) com modelo ${sessao.model}...`);
      const { response, modelUsed } = await generateContentWithFallback(ai, {
        model: sessao.model || "gemini-3.6-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: imageToSend,
                mimeType
              }
            },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objetoDetectado: { type: Type.STRING },
              confianca: { type: Type.NUMBER }
            },
            required: ["objetoDetectado", "confianca"]
          }
        }
      });
      if (modelUsed !== sessao.model) {
        sessao.model = modelUsed;
      }
      const timestampRespostaGemini = Date.now();
      const timestampDeteccao = timestampRespostaGemini;
      const latenciaCapturaParaDeteccaoMs = timestampDeteccao - timestampFrameCapturado;
      const responseTimeMs = Date.now() - tStart;
      sessao.ultimoTempoRespostaMs = responseTimeMs;
      sessao.somaLatenciaMs += responseTimeMs;
      sessao.contadorLatencias++;
      const responseText = response.text ? response.text.trim() : "";
      sessao.ultimaRespostaBrutaGemini = responseText || "(sem resposta do modelo)";
      let geminiEstadoLog = "GEMINI_NO_RESPONSE";
      let parsedPayload = null;
      let objetoRaw = null;
      let confiancaRaw = 0;
      if (!responseText) {
        geminiEstadoLog = "GEMINI_NO_RESPONSE";
        sessao.totalSemResposta++;
      } else {
        let jsonObj = null;
        let isJsonValid = false;
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonObj = JSON.parse(jsonMatch[0]);
            isJsonValid = true;
          } else {
            jsonObj = JSON.parse(responseText);
            isJsonValid = true;
          }
        } catch (err) {
          isJsonValid = false;
        }
        if (isJsonValid && jsonObj && typeof jsonObj === "object") {
          parsedPayload = jsonObj;
          const detectedStr = (jsonObj.objetoDetectado || jsonObj.objeto || jsonObj.item || jsonObj.result || "").toString().trim().toLowerCase();
          const confVal = Number(jsonObj.confianca || jsonObj.confidence || jsonObj.confidenceScore || 0);
          if (detectedStr === "aguardando" || detectedStr === "aguarde" || detectedStr === "waiting" || !detectedStr) {
            geminiEstadoLog = "GEMINI_AGUARDANDO";
            sessao.totalAguardando++;
            objetoRaw = null;
            confiancaRaw = 0;
          } else {
            const matched = OBJETOS_PERMITIDOS2.find((obj) => detectedStr.includes(obj));
            if (matched) {
              objetoRaw = matched;
              confiancaRaw = isNaN(confVal) ? 0 : confVal;
              geminiEstadoLog = "GEMINI_OBJECT_DETECTED";
            } else {
              geminiEstadoLog = "GEMINI_PARSE_ERROR";
              sessao.totalErrosParser++;
              objetoRaw = null;
              confiancaRaw = 0;
            }
          }
        } else {
          const lowerRaw = responseText.toLowerCase();
          if (lowerRaw.includes("aguardando") || lowerRaw.includes("aguarde")) {
            geminiEstadoLog = "GEMINI_AGUARDANDO";
            sessao.totalAguardando++;
            objetoRaw = null;
            confiancaRaw = 0;
          } else {
            const matched = OBJETOS_PERMITIDOS2.find((obj) => lowerRaw.includes(obj));
            if (matched) {
              objetoRaw = matched;
              confiancaRaw = 0;
              geminiEstadoLog = "GEMINI_TEXT_RESPONSE";
            } else {
              geminiEstadoLog = "GEMINI_INVALID_JSON";
              sessao.totalErrosParser++;
              objetoRaw = null;
              confiancaRaw = 0;
            }
          }
        }
      }
      sessao.ultimoEstadoGemini = geminiEstadoLog;
      sessao.ultimoResultadoAt = Date.now();
      logger.info(
        `[DIAGNOSTICO BRUTO GEMINI LIVE]
\u2022 Session ID: ${sessao.sessionId}
\u2022 Connection ID: ${sessao.connectionId}
\u2022 Frame #: ${sessao.totalFrames}
\u2022 Timestamp: ${new Date(timestampRespostaGemini).toISOString()}
\u2022 Frame: ${largura}x${altura} (${tamanhoKB}) [MIME: ${mimeType}, Fonte: ${fonte}] | Conte\xFAdo Visual: ${conteudoVisual ? "OK" : "ALERTA"}
\u2022 Estado Gemini: ${geminiEstadoLog}
\u2022 Resposta Bruta Gemini: ${JSON.stringify(responseText)}
\u2022 Payload Estruturado: ${JSON.stringify(parsedPayload)}
\u2022 Objeto Detectado: "${objetoRaw || "nenhum"}"
\u2022 Confian\xE7a: ${confiancaRaw}%`
      );
      const originalGeminiObject = objetoRaw;
      const originalGeminiConfidence = confiancaRaw;
      const visualMatch = WheelObjectVisualMatcher.matchObject(
        objetoRaw,
        confiancaRaw,
        imageToSend
      );
      if (!visualMatch.isValid) {
        if (objetoRaw) {
          logger.warn(
            `[VISUAL-MATCH-REJECT] Objeto '${objetoRaw}' (${confiancaRaw}%) descartado: ${visualMatch.reason}`
          );
        }
        objetoRaw = null;
        confiancaRaw = 0;
      } else {
        confiancaRaw = visualMatch.score;
      }
      if (objetoRaw && OBJETOS_PERMITIDOS2.includes(objetoRaw)) {
        sessao.totalDetectados++;
      }
      const analyzerStateBefore = sessao.visionAnalyzer.getCurrentState();
      const analysis = sessao.visionAnalyzer.processarDeteccao(
        objetoRaw,
        confiancaRaw,
        resScreenDetection.resultadoScreenDetected,
        resScreenDetection.confidence,
        sessao.sessionId,
        sessao.totalFrames
      );
      const analyzerStateAfter = analysis.state;
      resultScreenDiagnostico.objetoGemini = originalGeminiObject;
      resultScreenDiagnostico.confiancaGemini = originalGeminiConfidence;
      resultScreenDiagnostico.referenciaComparada = visualMatch.referenceUrl || (originalGeminiObject && isAllowedWheelObject(originalGeminiObject) ? WHEEL_OBJECT_REFERENCES[originalGeminiObject]?.imageUrl || null : null);
      resultScreenDiagnostico.scoreVisual = visualMatch.score;
      resultScreenDiagnostico.objetoFinal = analysis.status === "confirmado" ? analysis.objeto : analysis.candidateResult?.candidato || (objetoRaw || "nao_identificado");
      resultScreenDiagnostico.confiancaFinal = analysis.confianca;
      logger.info(
        `[ROI-DIAGNOSTIC]
frameId: FRAME_${String(sessao.totalFrames).padStart(6, "0")}
roiFound: ${roi.found}
roiConfidence: ${roi.confidence}
roiX: ${roi.x}
roiY: ${roi.y}
roiWidth: ${roi.width}
roiHeight: ${roi.height}
originalWidth: ${largura}
originalHeight: ${altura}
geminiObject: ${objetoRaw || "null"}
geminiConfidence: ${confiancaRaw}
wheelPhase: ${analysis.wheelPhase}
stabilityMs: ${analysis.tempoEstavelMs}
analyzerState: ${analysis.state}
confirmedNow: ${analysis.confirmedNow}`
      );
      sessao.candidatoAtual = analysis.candidateResult?.candidato || null;
      sessao.confirmacoesConsecutivas = analysis.candidateResult?.confirmacoesConsecutivas || 0;
      let foiConfirmadoAgora = false;
      let gravadoNoSupabase = false;
      let rodadaRegistrada = null;
      let motivoEstabilizacao = "";
      let timestampConfirmacao = null;
      let timestampRegistroSupabase = null;
      let latenciaDeteccaoParaRegistroMs = null;
      if (analysis.status === "nao_identificado") {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Objeto n\xE3o identificado ou resposta nula/aguardando.`;
      } else if (analysis.status === "descartado_baixa_confianca") {
        sessao.totalDescartes++;
        motivoEstabilizacao = `Descartado: Confian\xE7a abaixo do m\xEDnimo exigido (${confiancaRaw}% < ${sessao.minConfidenceRequired}%).`;
      } else if (analysis.status === "duplicado") {
        sessao.totalDescartes++;
        sessao.duplicacoesBloqueadas++;
        motivoEstabilizacao = `Ignorado: Objeto "${objetoRaw}" \xE9 id\xEAntico ao \xFAltimo confirmado (evitando duplicidade).`;
      } else if (analysis.status === "em_analise") {
        motivoEstabilizacao = `Analisando candidato "${objetoRaw}" (${sessao.confirmacoesConsecutivas}/${sessao.consecutiveConfirmationsRequired} confirma\xE7\xF5es consec. | ${confiancaRaw}% conf.)`;
      } else if (analysis.status === "confirmado" && analysis.objetoPadraoParaBanco && analysis.eventId) {
        foiConfirmadoAgora = true;
        timestampConfirmacao = Date.now();
        sessao.ultimoObjetoConfirmado = analysis.objetoPadraoParaBanco.resultado;
        sessao.horarioUltimaConfirmacao = timestampConfirmacao;
        sessao.confiancaUltimaConfirmacao = analysis.objetoPadraoParaBanco.confianca;
        sessao.totalRodadasDetectadasSessao++;
        logger.info(
          `[WHEEL VISION] [NOVA RODADA CONFIRMADA] eventId: "${analysis.eventId}" | S\xEDmbolo: "${analysis.objetoPadraoParaBanco.resultado}" | Confian\xE7a: ${analysis.objetoPadraoParaBanco.confianca}%`
        );
        const confirmedItem = {
          timestamp: timestampConfirmacao,
          objeto: analysis.objetoPadraoParaBanco.resultado,
          confianca: analysis.objetoPadraoParaBanco.confianca,
          eventId: analysis.eventId,
          estado: analysis.state,
          persistido: "N\xC3O (PERSIST\xCANCIA DESABILITADA)"
        };
        sessao.confirmedRoundsHistory = [confirmedItem, ...sessao.confirmedRoundsHistory].slice(0, 50);
        try {
          sessao.tentativasPersistencia++;
          const resAuto = await registrarResultadoAutomaticamente(
            analysis.objetoPadraoParaBanco.resultado,
            analysis.objetoPadraoParaBanco.confianca,
            analysis.eventId,
            sessao.sessionId
          );
          timestampRegistroSupabase = Date.now();
          latenciaDeteccaoParaRegistroMs = timestampRegistroSupabase - timestampDeteccao;
          gravadoNoSupabase = resAuto.registrado;
          rodadaRegistrada = resAuto.rodadaRegistrada || null;
          if (resAuto.registrado) {
            sessao.registrosCriados++;
          } else {
            sessao.duplicacoesBloqueadas++;
          }
          motivoEstabilizacao = `SISTEMA LIVE: Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" (${analysis.eventId}) enviada ao Supabase: ${resAuto.motivo}`;
        } catch (errDb) {
          logger.error("[WHEEL VISION] Erro ao gravar no Supabase:", errDb?.message);
          motivoEstabilizacao = `Nova rodada "${analysis.objetoPadraoParaBanco.resultado}" confirmada, mas erro ao salvar no Supabase: ${errDb?.message}`;
        }
      }
      let geminiTag = "GEMINI_NO_RESPONSE";
      if (geminiEstadoLog === "GEMINI_AGUARDANDO") {
        geminiTag = "GEMINI_AGUARDANDO";
      } else if (geminiEstadoLog === "GEMINI_NO_RESPONSE") {
        geminiTag = "GEMINI_NO_RESPONSE";
      } else if (geminiEstadoLog === "GEMINI_INVALID_JSON" || geminiEstadoLog === "GEMINI_PARSE_ERROR") {
        geminiTag = "GEMINI_INVALID_JSON";
      } else if (geminiEstadoLog === "GEMINI_OBJECT_DETECTED" || geminiEstadoLog === "GEMINI_TEXT_RESPONSE") {
        geminiTag = "GEMINI_OBJECT_DETECTED";
      }
      let analyzerTag = "ANALYZER_IDLE";
      if (analysis.status === "confirmado") {
        analyzerTag = "ANALYZER_CONFIRMED";
      } else if (analysis.status === "nao_identificado" || analysis.status === "descartado_baixa_confianca" || analysis.status === "descartado_fora_de_tela_resultado" || analysis.status === "duplicado") {
        analyzerTag = "ANALYZER_DISCARDED";
      } else if (analyzerStateAfter === "AGUARDANDO_PROXIMA_RODADA") {
        analyzerTag = "ANALYZER_WAITING_CHANGE";
      } else if (analyzerStateAfter === "LEITURA_RESULTADO" || analyzerStateAfter === "TELA_RESULTADO_DETECTADA" || analysis.status === "em_analise") {
        analyzerTag = "ANALYZER_CANDIDATE";
      }
      logger.info(
        `[FRAME-TRACE]
\u2022 frameId: FRAME_${String(sessao.totalFrames).padStart(6, "0")}
\u2022 sessionId: ${sessao.sessionId}
\u2022 connectionId: ${sessao.connectionId}
\u2022 timestamp: ${new Date(timestampRespostaGemini).toISOString()}
\u2022 Gemini raw: ${responseText || "(sem resposta)"}
\u2022 Gemini objeto: ${objetoRaw || "nenhum"}
\u2022 Gemini confian\xE7a: ${confiancaRaw}%
\u2022 Parser objeto: ${objetoRaw || "nenhum"}
\u2022 Parser confian\xE7a: ${confiancaRaw}%
\u2022 Analyzer state BEFORE: ${analyzerStateBefore}
\u2022 Analyzer state AFTER: ${analyzerStateAfter}
\u2022 candidate: ${sessao.candidatoAtual || "nenhum"}
\u2022 confirmationCount: ${sessao.confirmacoesConsecutivas}/${sessao.consecutiveConfirmationsRequired}
\u2022 lastConfirmedObject: ${sessao.ultimoObjetoConfirmado || "nenhum"}
\u2022 currentEventId: ${analysis.eventId || sessao.visionAnalyzer.getCurrentEventId() || "N/A"}
\u2022 confirmedNow: ${foiConfirmadoAgora}
\u2022 persistAttempt: false`
      );
      const traceEntry = {
        frameId: sessao.totalFrames,
        sessionId: sessao.sessionId,
        connectionId: sessao.connectionId,
        timestamp: timestampRespostaGemini,
        geminiRaw: responseText || "(vazio)",
        geminiObjeto: objetoRaw || "nenhum",
        geminiConfianca: confiancaRaw,
        parserObjeto: objetoRaw || "nenhum",
        parserConfianca: confiancaRaw,
        analyzerStateBefore,
        analyzerStateAfter,
        candidate: sessao.candidatoAtual,
        confirmationCount: sessao.confirmacoesConsecutivas,
        lastConfirmedObject: sessao.ultimoObjetoConfirmado,
        currentEventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId(),
        confirmedNow: foiConfirmadoAgora,
        geminiTag,
        analyzerTag,
        persistAttempt: false,
        wheelPhase: analysis.wheelPhase,
        sceneStabilityScore: analysis.sceneStability?.score,
        sceneStabilityState: analysis.sceneStability?.state,
        tempoEstavelMs: analysis.tempoEstavelMs
      };
      sessao.recentFrameTraces = [traceEntry, ...sessao.recentFrameTraces].slice(0, 20);
      const latenciaTotalMs = (timestampRegistroSupabase || timestampConfirmacao || timestampDeteccao) - timestampFrameCapturado;
      const latenciaObj = {
        timestampFrameCapturado,
        timestampFrameEnviado,
        timestampRespostaGemini,
        timestampDeteccao,
        timestampConfirmacao,
        timestampRegistroSupabase,
        latenciaCapturaParaDeteccaoMs,
        latenciaDeteccaoParaRegistroMs,
        latenciaTotalMs
      };
      const infoEstabilizacao = {
        candidatoAtual: sessao.candidatoAtual,
        confirmacoesConsecutivas: sessao.confirmacoesConsecutivas,
        confirmacoesNecessarias: sessao.consecutiveConfirmationsRequired,
        minConfidence: sessao.minConfidenceRequired,
        foiConfirmadoAgora,
        ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
        horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
        confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
        totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
        motivoEstabilizacao,
        gravadoNoSupabase,
        rodadaRegistrada,
        estadoAnalyzer: analysis.state,
        eventId: analysis.eventId || sessao.visionAnalyzer.getCurrentEventId(),
        latencia: latenciaObj,
        sceneStability: analysis.sceneStability,
        wheelPhase: analysis.wheelPhase,
        tempoEstavelMs: analysis.tempoEstavelMs,
        // Métricas de Diagnóstico Anti-Duplicação
        framesRecebidos: sessao.totalFrames,
        deteccoesGemini: sessao.totalDetectados,
        candidatosCriados: sessao.visionAnalyzer.getMetrics().totalCandidatosIniciados,
        confirmacoes: sessao.visionAnalyzer.getMetrics().totalConfirmados,
        tentativasPersistencia: 0,
        registrosCriados: 0,
        duplicacoesBloqueadas: sessao.duplicacoesBloqueadas + sessao.visionAnalyzer.getMetrics().totalDuplicacoesBloqueadas
      };
      const resultado = {
        objetoDetectado: objetoRaw,
        confianca: confiancaRaw,
        transfereContexto: true,
        rawText: responseText,
        geminiEstadoLog,
        geminiRawResponse: responseText,
        parsedPayload,
        frameDiagnostico,
        timestamp: sessao.ultimoResultadoAt,
        estabilizacao: infoEstabilizacao,
        latencia: latenciaObj,
        geminiTag,
        analyzerTag,
        recentFrameTraces: sessao.recentFrameTraces,
        confirmedRoundsHistory: sessao.confirmedRoundsHistory
      };
      logger.info(
        `[LIVE BACKEND] Frame #${sessao.totalFrames} -> State: ${geminiEstadoLog} | Raw: ${objetoRaw || "Nenhum"} (${confiancaRaw}%) | Estabilizado: ${foiConfirmadoAgora ? `CONFIRMADO "${objetoRaw}"` : motivoEstabilizacao}`
      );
      return resultado;
    } catch (err) {
      logger.error(`[LIVE BACKEND] Erro ao processar frame #${sessao.totalFrames}:`, err?.message);
      return null;
    }
  }
  /**
   * Consulta o status atual da sessão no backend.
   */
  static verificarStatus(usuarioId = "default_user") {
    const sessao = getSessaoPorUsuario(usuarioId);
    if (!sessao) {
      return {
        estado: "desconectado",
        sessionId: null,
        connectionId: null,
        mensagemErro: null,
        conectadoEm: null,
        tentativasReconexao: 0,
        totalFramesEnviados: 0,
        ultimoResultadoAt: null
      };
    }
    return this.obterStatusStatusSessao(sessao);
  }
  /**
   * Teste de diagnóstico controlled com detecção simulada (PROMPT LIVE - TESTE CONTROLADO)
   */
  static async testSimulatedDetection(usuarioId = "default_user", objetoSimulado = "boia", confiancaSimulada = 95, timestampOverride) {
    let sessao = getSessaoPorUsuario(usuarioId);
    if (!sessao) {
      await this.iniciarSessao(usuarioId, {});
      sessao = getSessaoPorUsuario(usuarioId);
    }
    const tStart = Date.now();
    const objetoFormatado = objetoSimulado.trim().toLowerCase();
    const analysis = sessao.visionAnalyzer.processarDeteccao(
      objetoFormatado,
      confiancaSimulada,
      true,
      1,
      sessao.sessionId,
      sessao.totalFrames,
      timestampOverride
    );
    sessao.candidatoAtual = analysis.candidateResult?.candidato || null;
    sessao.confirmacoesConsecutivas = analysis.candidateResult?.confirmacoesConsecutivas || 0;
    let foiConfirmadoAgora = false;
    let gravadoNoSupabase = false;
    let rodadaRegistrada = null;
    let motivoEstabilizacao = "";
    let erroSupabase = null;
    if (analysis.status === "confirmado" && analysis.objetoPadraoParaBanco) {
      foiConfirmadoAgora = true;
      sessao.ultimoObjetoConfirmado = analysis.objetoPadraoParaBanco.resultado;
      sessao.horarioUltimaConfirmacao = Date.now();
      sessao.confiancaUltimaConfirmacao = analysis.objetoPadraoParaBanco.confianca;
      sessao.totalRodadasDetectadasSessao++;
      try {
        sessao.tentativasPersistencia++;
        const resAuto = await registrarResultadoAutomaticamente(
          analysis.objetoPadraoParaBanco.resultado,
          analysis.objetoPadraoParaBanco.confianca,
          analysis.eventId,
          sessao.sessionId
        );
        gravadoNoSupabase = resAuto.registrado;
        rodadaRegistrada = resAuto.rodadaRegistrada || null;
        if (resAuto.registrado) {
          sessao.registrosCriados++;
        } else {
          sessao.duplicacoesBloqueadas++;
        }
        if (!resAuto.registrado) {
          erroSupabase = resAuto.motivo;
        }
        motivoEstabilizacao = `TESTE SIMULADO: Rodada "${analysis.objetoPadraoParaBanco.resultado}" (${analysis.eventId}) confirmada -> Supabase: ${resAuto.motivo}`;
      } catch (errDb) {
        erroSupabase = errDb?.message || "Erro desconhecido ao salvar no Supabase";
        motivoEstabilizacao = `TESTE SIMULADO: Rodada confirmada, mas erro no Supabase: ${erroSupabase}`;
      }
    } else {
      motivoEstabilizacao = `TESTE SIMULADO: Objeto "${objetoFormatado}" (${confiancaSimulada}%) processado pelo Analyzer. Status: ${analysis.status}`;
    }
    return {
      sucesso: true,
      objetoSimulado: objetoFormatado,
      confiancaSimulada,
      analyzerState: analysis.state,
      analyzerStatus: analysis.status,
      foiConfirmadoAgora,
      gravadoNoSupabase,
      rodadaRegistrada,
      erroSupabase,
      motivoEstabilizacao,
      tempoExecucaoMs: Date.now() - tStart
    };
  }
  static obterStatusStatusSessao(sessao) {
    const duracaoSegundos = Math.round((Date.now() - sessao.conectadoEm.getTime()) / 1e3);
    const mediaLatencia = sessao.contadorLatencias > 0 ? Math.round(sessao.somaLatenciaMs / sessao.contadorLatencias) : 0;
    return {
      estado: sessao.estado,
      sessionId: sessao.sessionId,
      connectionId: sessao.connectionId,
      mensagemErro: sessao.mensagemErro || null,
      conectadoEm: sessao.conectadoEm.toISOString(),
      duracaoSegundos,
      motivoDesconexao: sessao.motivoDesconexao || null,
      tentativasReconexao: sessao.tentativasReconexao,
      totalFramesEnviados: sessao.totalFrames,
      ultimoResultadoAt: sessao.ultimoResultadoAt || null,
      modelUtilizado: sessao.model,
      // PROMPT LIVE 004
      ultimoObjetoConfirmado: sessao.ultimoObjetoConfirmado,
      horarioUltimaConfirmacao: sessao.horarioUltimaConfirmacao,
      confiancaUltimaConfirmacao: sessao.confiancaUltimaConfirmacao,
      totalRodadasDetectadasSessao: sessao.totalRodadasDetectadasSessao,
      candidatoAtual: sessao.candidatoAtual,
      confirmacoesConsecutivas: sessao.confirmacoesConsecutivas,
      // Estado do Analyzer e Identificador de Evento Ativo
      analyzerState: sessao.visionAnalyzer.getCurrentState(),
      currentEventId: sessao.visionAnalyzer.getCurrentEventId(),
      lastResetAt: sessao.lastResetAt,
      // Diagnóstico Bruto Gemini
      ultimaRespostaBrutaGemini: sessao.ultimaRespostaBrutaGemini,
      ultimoEstadoGemini: sessao.ultimoEstadoGemini,
      ultimoFrameDiagnostico: sessao.ultimoFrameDiagnostico,
      // Históricos Rastreamento MODO DIAGNÓSTICO
      recentFrameTraces: sessao.recentFrameTraces || [],
      confirmedRoundsHistory: sessao.confirmedRoundsHistory || [],
      // Contadores Detalhados
      totalFramesCapturados: sessao.totalFrames,
      totalFramesProcessados: sessao.totalFrames,
      totalRespostasGemini: sessao.contadorLatencias,
      totalGeminiSemResposta: sessao.totalSemResposta,
      totalGeminiAguardando: sessao.totalAguardando,
      totalGeminiObjetoDetectado: sessao.totalDetectados,
      totalDeteccoesValidas: sessao.totalDetectados,
      totalAbaixoConfiancaMinima: sessao.totalDescartes,
      totalCandidatosCriados: sessao.visionAnalyzer.getMetrics().totalCandidatosIniciados,
      totalConfirmacoes: sessao.totalRodadasDetectadasSessao,
      totalDuplicacoesBloqueadas: sessao.duplicacoesBloqueadas + sessao.visionAnalyzer.getMetrics().totalDuplicacoesBloqueadas,
      totalInstabilidades: sessao.totalDescartes,
      totalReconexoes: sessao.tentativasReconexao,
      totalEventIdsCriados: sessao.totalRodadasDetectadasSessao,
      tentativasPersistencia: 0,
      registrosSupabase: 0,
      // PROMPT LIVE 005 – Painel Técnico de Telemetria
      metricas: {
        captureFps: 1,
        // Medido no client
        sentFps: 1,
        // Medido no client
        latenciaMediaMs: mediaLatencia,
        tempoRespostaGeminiMs: sessao.ultimoTempoRespostaMs,
        totalDetectados: sessao.totalDetectados,
        totalConfirmados: sessao.totalRodadasDetectadasSessao,
        totalDescartes: sessao.totalDescartes,
        totalAguardando: sessao.totalAguardando,
        totalSemResposta: sessao.totalSemResposta,
        totalErrosParser: sessao.totalErrosParser,
        numeroReconexoes: sessao.tentativasReconexao,
        ultimaRespostaBrutaGemini: sessao.ultimaRespostaBrutaGemini,
        ultimoEstadoGemini: sessao.ultimoEstadoGemini,
        ultimoFrameDiagnostico: sessao.ultimoFrameDiagnostico
      }
    };
  }
};

// src/routes/live.ts
var router6 = Router6();
router6.post("/live/connect", async (req, res) => {
  try {
    const { usuarioId = "default_user", config } = req.body || {};
    const status = await BackendLiveService.iniciarSessao(usuarioId, config);
    return res.json({
      sucesso: status.estado === "conectado",
      status
    });
  } catch (error) {
    logger.error("Erro na rota POST /api/live/connect:", error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || "Falha ao conectar \xE0 Gemini Live API."
    });
  }
});
router6.post("/live/disconnect", async (req, res) => {
  try {
    const { usuarioId = "default_user", motivo = "Encerramento solicitado pelo cliente" } = req.body || {};
    const status = await BackendLiveService.encerrarSessao(usuarioId, motivo);
    return res.json({
      sucesso: true,
      status
    });
  } catch (error) {
    logger.error("Erro na rota POST /api/live/disconnect:", error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || "Falha ao encerrar a sess\xE3o Live."
    });
  }
});
router6.get("/live/status", (req, res) => {
  try {
    const usuarioId = req.query.usuarioId || "default_user";
    const status = BackendLiveService.verificarStatus(usuarioId);
    return res.json({
      sucesso: true,
      status
    });
  } catch (error) {
    logger.error("Erro na rota GET /api/live/status:", error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || "Erro ao consultar status da sess\xE3o Live."
    });
  }
});
router6.post("/live/reconnect", async (req, res) => {
  try {
    const { usuarioId = "default_user" } = req.body || {};
    const status = await BackendLiveService.reconectar(usuarioId);
    return res.json({
      sucesso: status.estado === "conectado",
      status
    });
  } catch (error) {
    logger.error("Erro na rota POST /api/live/reconnect:", error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || "Falha ao reconectar sess\xE3o Live."
    });
  }
});
router6.post("/live/frame", async (req, res) => {
  try {
    const { usuarioId = "default_user", framePayload } = req.body || {};
    if (!framePayload || !framePayload.base64Data) {
      return res.status(400).json({
        sucesso: false,
        error: "Payload do frame inv\xE1lido ou sem dados base64."
      });
    }
    const resultado = await BackendLiveService.processarFrame(usuarioId, framePayload);
    return res.json({
      sucesso: !!resultado,
      resultado
    });
  } catch (error) {
    logger.error("Erro na rota POST /api/live/frame:", error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || "Falha ao processar frame de v\xEDdeo da Live API."
    });
  }
});
router6.post("/live/test-simulated-detection", async (req, res) => {
  try {
    const { usuarioId = "default_user", objeto = "boia", confianca = 95 } = req.body || {};
    const resultado = await BackendLiveService.testSimulatedDetection(usuarioId, objeto, Number(confianca));
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro na rota POST /api/live/test-simulated-detection:", error?.message);
    return res.status(500).json({
      sucesso: false,
      error: error?.message || "Falha ao executar teste simulado de diagn\xF3stico."
    });
  }
});
var live_default = router6;

// src/services/aiRouterService.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
async function executarReanaliseHistorico() {
  const supabase2 = getSupabase();
  if (!supabase2) {
    return {
      sucesso: false,
      mensagem: "Supabase n\xE3o configurado.",
      totalAnalisados: 0,
      falhasDetectadas: 0,
      lacunasRodada: []
    };
  }
  try {
    const { data, error } = await supabase2.from("resultados").select("rodada, item, criado_em").order("criado_em", { ascending: false }).limit(50);
    if (error || !data || data.length === 0) {
      return {
        sucesso: true,
        mensagem: "Nenhum hist\xF3rico encontrado para rean\xE1lise.",
        totalAnalisados: 0,
        falhasDetectadas: 0,
        lacunasRodada: []
      };
    }
    const lacunasRodada = [];
    let duplicadosSuspeitos = 0;
    for (let i = 0; i < data.length - 1; i++) {
      const atual = data[i];
      const proximo = data[i + 1];
      if (atual.rodada && proximo.rodada && atual.rodada - proximo.rodada > 1) {
        for (let r = proximo.rodada + 1; r < atual.rodada; r++) {
          lacunasRodada.push(r);
        }
      }
      if (atual.criado_em && proximo.criado_em) {
        const diffMs = Math.abs(
          new Date(atual.criado_em).getTime() - new Date(proximo.criado_em).getTime()
        );
        if (diffMs < 2e3 && atual.item === proximo.item) {
          duplicadosSuspeitos++;
        }
      }
    }
    return {
      sucesso: true,
      totalAnalisados: data.length,
      falhasDetectadas: lacunasRodada.length + duplicadosSuspeitos,
      lacunasRodada,
      duplicadosSuspeitos,
      statusGeral: lacunasRodada.length === 0 && duplicadosSuspeitos === 0 ? "Hist\xF3rico \xCDntegro (Nenhuma falha grave encontrada)" : "Falhas/Inconsist\xEAncias identificadas no hist\xF3rico recente"
    };
  } catch (err) {
    return {
      sucesso: false,
      mensagem: err?.message || "Erro ao reanalisar hist\xF3rico.",
      totalAnalisados: 0,
      falhasDetectadas: 0
    };
  }
}
function identificarIntencao(query) {
  const queryLower = query.toLowerCase().trim();
  const objetosMencionados = OBJETOS_PERMITIDOS2.map((obj) => ({
    obj,
    idx: queryLower.indexOf(obj)
  })).filter((item) => item.idx !== -1).sort((a, b) => a.idx - b.idx).map((item) => item.obj);
  if (queryLower.includes("reanalise") || queryLower.includes("reanalisar") || queryLower.includes("analise a roda") || queryLower.includes("analisar a roda") || queryLower.includes("analise novamente a barra") || queryLower.includes("analise a barra") || queryLower.includes("veja se houve falha") || queryLower.includes("houve falha") || queryLower.includes("confira se houve erro") || queryLower.includes("erro no hist\xF3rico") || queryLower.includes("erro no historico") || queryLower.includes("veja se perdi alguma rodada") || queryLower.includes("perdi alguma rodada") || queryLower.includes("auditar") || queryLower.includes("auditoria") || queryLower.includes("confira o hist\xF3rico") || queryLower.includes("confira o historico") || queryLower.includes("conferir hist\xF3rico") || queryLower.includes("conferir historico") || queryLower.includes("falha no hist\xF3rico") || queryLower.includes("falha no historico") || queryLower.includes("inconsist\xEAncia") || queryLower.includes("inconsistencia") || queryLower.includes("erro na roda")) {
    return { intencao: "REANALISE", modulo: "auditoriaService", objetosMencionados };
  }
  if (objetosMencionados.length >= 2 || queryLower.includes("sequ\xEAncia de 3") || queryLower.includes("sequencia de 3") || queryLower.includes("sequ\xEAncia de 4") || queryLower.includes("sequencia de 4") || queryLower.includes("nessa sequ\xEAncia") || queryLower.includes("nessa sequencia") || queryLower.includes("ap\xF3s essa sequ\xEAncia") || queryLower.includes("apos essa sequencia")) {
    return { intencao: "SEQUENCIA", modulo: "sequenciaService", objetosMencionados };
  }
  if (queryLower.includes("depois de") || queryLower.includes("vem depois") || queryLower.includes("pr\xF3ximo depois") || queryLower.includes("proximo depois") || queryLower.includes("qual aparece depois") || queryLower.includes("qual o sucessor") || queryLower.includes("sucessor de") || queryLower.includes("transi\xE7\xE3o") || queryLower.includes("transicao") || queryLower.includes("ap\xF3s") && objetosMencionados.length === 1 || queryLower.includes("apos") && objetosMencionados.length === 1) {
    return { intencao: "TRANSICAO", modulo: "transicaoService", objetosMencionados };
  }
  if (queryLower.includes("padr\xE3o") || queryLower.includes("padrao") || queryLower.includes("padr\xF5es") || queryLower.includes("padroes") || queryLower.includes("repetindo") || queryLower.includes("repeti\xE7\xE3o") || queryLower.includes("repeticao") || queryLower.includes("altern\xE2ncia") || queryLower.includes("alternancia") || queryLower.includes("tend\xEAncia") || queryLower.includes("tendencia") || queryLower.includes("comportamento") || queryLower.includes("acontecendo")) {
    return { intencao: "PADROES", modulo: "padraoService", objetosMencionados };
  }
  if (queryLower.includes("\xFAltimos resultados") || queryLower.includes("ultimos resultados") || queryLower.includes("\xFAltimas rodadas") || queryLower.includes("ultimas rodadas") || queryLower.includes("mostre o hist\xF3rico") || queryLower.includes("mostre o historico") || queryLower.includes("veja o hist\xF3rico") || queryLower.includes("veja o historico") || queryLower.includes("ver hist\xF3rico") || queryLower.includes("ver historico") || queryLower.includes("\xFAltimos s\xEDmbolos") || queryLower.includes("ultimos simbolos")) {
    return { intencao: "HISTORICO", modulo: "consultaService", objetosMencionados };
  }
  if (queryLower.includes("atrasado") || queryLower.includes("maior atraso") || queryLower.includes("mais saiu") || queryLower.includes("menos saiu") || queryLower.includes("mais apareceu") || queryLower.includes("menos apareceu") || queryLower.includes("frequ\xEAncia") || queryLower.includes("frequencia") || queryLower.includes("estat\xEDstica") || queryLower.includes("estatistica") || queryLower.includes("ranking") || queryLower.includes("porcentagem")) {
    return { intencao: "ESTATISTICAS", modulo: "dashboardService", objetosMencionados };
  }
  return { intencao: "ESTATISTICAS", modulo: "dashboardService", objetosMencionados };
}
async function processarOrquestradorAI(pergunta) {
  const tempoInicio = Date.now();
  if (!pergunta || typeof pergunta !== "string" || !pergunta.trim()) {
    throw new Error("Nenhuma pergunta v\xE1lida foi fornecida.");
  }
  const { intencao, modulo, objetosMencionados } = identificarIntencao(pergunta);
  const objetoAlvo = objetosMencionados[0] || "soco";
  const statsNextAfter = await StatisticsEngine.getNextAfter(objetoAlvo);
  const statsFrequency = await StatisticsEngine.getFrequency();
  const statsLast10 = await StatisticsEngine.getLastResults(10);
  const statsSequences = await StatisticsEngine.getSequences();
  let dadosBackend = {
    statisticsEngine: {
      objetoPesquisado: objetoAlvo,
      nextAfter: statsNextAfter,
      frequency: statsFrequency,
      lastResults: statsLast10,
      sequences: statsSequences
    }
  };
  let confianca = "85%";
  switch (intencao) {
    case "HISTORICO": {
      const res = await buscarUltimosResultados(20);
      dadosBackend = { ...dadosBackend, consultaService: res };
      confianca = "95%";
      break;
    }
    case "TRANSICAO": {
      dadosBackend = {
        ...dadosBackend,
        transicaoCalculadaEngine: statsNextAfter
      };
      confianca = "95%";
      break;
    }
    case "SEQUENCIA": {
      if (objetosMencionados.length >= 2) {
        const res = await buscarProximoDepoisDaSequencia(objetosMencionados);
        dadosBackend = { ...dadosBackend, sequenciaRes: res };
      } else if (pergunta.toLowerCase().includes("4")) {
        const res = await analisarSequencia4();
        dadosBackend = { ...dadosBackend, sequenciaRes: res };
      } else {
        const res = await analisarSequencia3();
        dadosBackend = { ...dadosBackend, sequenciaRes: res };
      }
      confianca = "90%";
      break;
    }
    case "PADROES": {
      const res = await executarDetectorPadroes();
      dadosBackend = { ...dadosBackend, padroesRes: res };
      confianca = "90%";
      break;
    }
    case "ESTATISTICAS": {
      const pLower = pergunta.toLowerCase();
      const relatorio = await obterRelatorioEstatisticoCompleto();
      if (pLower.includes("atrasado") || pLower.includes("atraso")) {
        dadosBackend = {
          ...dadosBackend,
          atrasos: relatorio.atrasos,
          confianca: relatorio.confianca
        };
      } else if (pLower.includes("frequ\xEAncia") || pLower.includes("frequencia")) {
        dadosBackend = {
          ...dadosBackend,
          frequencias: relatorio.frequencias,
          confianca: relatorio.confianca
        };
      } else {
        dadosBackend = { ...dadosBackend, relatorioEstatistico: relatorio };
      }
      confianca = relatorio.confianca?.nivelGeral === "alta" ? "95%" : relatorio.confianca?.nivelGeral === "media" ? "85%" : "70%";
      break;
    }
    case "REANALISE": {
      dadosBackend = { ...dadosBackend, reanalise: await executarReanaliseHistorico() };
      confianca = "90%";
      break;
    }
    default: {
      dadosBackend = { ...dadosBackend, dashboard: await obterDashboardCompleto() };
      confianca = "80%";
      break;
    }
  }
  const tempoExecucaoMs = Date.now() - tempoInicio;
  logger.info(`Pergunta recebida: "${pergunta}"`);
  logger.info(`Inten\xE7\xE3o detectada: ${intencao}`);
  logger.info(`Servi\xE7o utilizado: ${modulo}`);
  logger.info(`Tempo: ${tempoExecucaoMs}ms`);
  const respostaEstruturada = {
    intencao,
    modulo,
    dados: dadosBackend,
    confianca,
    tempoExecucaoMs,
    perguntaOriginal: pergunta
  };
  const semDadosOuInsuficiente = !dadosBackend || Array.isArray(dadosBackend) && dadosBackend.length === 0 || dadosBackend.dados && Array.isArray(dadosBackend.dados) && dadosBackend.dados.length === 0 || dadosBackend.dadosInsuficientes === true || dadosBackend.totalRegistrosAnalisados === 0 || dadosBackend.totalRodadas === 0;
  let explicacaoHumana = "";
  if (semDadosOuInsuficiente) {
    explicacaoHumana = "N\xE3o encontrei dados suficientes no hist\xF3rico para realizar essa an\xE1lise.";
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI2({ apiKey });
        const promptSintese = `Voc\xEA \xE9 o assistente orquestrador de IA do "Farm Fishing AI".

DADOS ESTAT\xCDSTICOS OFICIAIS RETORNADOS PELO BANCO DE DADOS:
${JSON.stringify(respostaEstruturada, null, 2)}

REGRAS R\xCDGIDAS DE RESPOSTA:
1. Responda \xE0 pergunta do usu\xE1rio: "${pergunta}"
2. Use EXCLUSIVAMENTE os dados estat\xEDsticos reais fornecidos acima.
3. NUNCA invente n\xFAmeros, contagens ou probabilidades.
4. Se os dados forem vazios ou indicarem insufici\xEAncia de rodadas, responda exatamente:
   "N\xE3o encontrei dados suficientes no hist\xF3rico para realizar essa an\xE1lise."
5. Seja claro, direto, elegante e profissional em Portugu\xEAs.`;
        const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
        let geminiRes = null;
        for (const m of modelsToTry) {
          try {
            geminiRes = await ai.models.generateContent({
              model: m,
              contents: promptSintese
            });
            if (geminiRes) break;
          } catch (err) {
            const isQuota = err?.status === 429 || err?.code === 429 || err?.message && err.message.includes("429");
            if (isQuota) continue;
            throw err;
          }
        }
        explicacaoHumana = geminiRes?.text || "N\xE3o encontrei dados suficientes no hist\xF3rico para realizar essa an\xE1lise.";
      } catch (err) {
        logger.error("Erro na s\xEDntese com Gemini:", err?.message);
        explicacaoHumana = "N\xE3o encontrei dados suficientes no hist\xF3rico para realizar essa an\xE1lise.";
      }
    } else {
      explicacaoHumana = "N\xE3o encontrei dados suficientes no hist\xF3rico para realizar essa an\xE1lise.";
    }
  }
  const tempoTotalMs = Date.now() - tempoInicio;
  return {
    roteamento: respostaEstruturada,
    explicacaoHumana,
    sucesso: true,
    tempoTotalMs
  };
}

// src/services/auditoriaService.ts
import { GoogleGenAI as GoogleGenAI3, Type as Type2 } from "@google/genai";
async function extrairItensDaImagem(imageBase64) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chave GEMINI_API_KEY n\xE3o configurada no servidor.");
  }
  const ai = new GoogleGenAI3({ apiKey });
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const promptVisao = `Voc\xEA \xE9 um sistema de auditoria visual de alta precis\xE3o para o jogo "Farm Fishing" (Roda Gigante).
Examine a imagem enviada, identificando a barra horizontal de hist\xF3rico de resultados recentes da roda.

S\xEDmbolos permitidos na roda (use exatamente esses nomes em min\xFAsculas):
- sorvete
- boia
- balao
- soco
- tedy
- princesa
- camera
- coroa

INSTRU\xC7\xD5ES:
1. Identifique TODOS os objetos na barra de hist\xF3rico da esquerda para a direita.
2. A esquerda representa a rodada MAIS RECENTE e a direita a MAIS ANTIGA.
3. Retorne a lista de objetos identificados na ordem exata (do mais recente ao mais antigo).`;
  const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  let response = null;
  for (const m of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model: m,
        contents: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          promptVisao
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type2.OBJECT,
            properties: {
              detectedItems: {
                type: Type2.ARRAY,
                items: {
                  type: Type2.STRING,
                  enum: [
                    "sorvete",
                    "boia",
                    "balao",
                    "soco",
                    "tedy",
                    "princesa",
                    "camera",
                    "coroa"
                  ]
                },
                description: "Lista de itens detectados em ordem do mais recente (esquerda) ao mais antigo (direita)"
              },
              confidenceScore: {
                type: Type2.NUMBER,
                description: "Pontua\xE7\xE3o de 0 a 100 de confian\xE7a na identifica\xE7\xE3o"
              },
              description: {
                type: Type2.STRING,
                description: "Explica\xE7\xE3o detalhada dos itens identificados na barra de hist\xF3rico"
              }
            },
            required: ["detectedItems", "confidenceScore", "description"]
          }
        }
      });
      if (response) break;
    } catch (err) {
      const isQuota = err?.status === 429 || err?.code === 429 || err?.message && err.message.includes("429");
      if (isQuota) continue;
      throw err;
    }
  }
  const text = response.text;
  if (!text) {
    throw new Error("Sem resposta do modelo visual.");
  }
  const parsed = JSON.parse(text);
  const itensValidos = (parsed.detectedItems || []).filter(
    (item) => OBJETOS_PERMITIDOS2.includes(item)
  );
  return {
    itens: itensValidos,
    confiancaScore: parsed.confidenceScore || 90,
    descricao: parsed.description || "Identifica\xE7\xE3o da barra visual conclu\xEDda."
  };
}
async function auditarHistoricoPorImagem(imageBase64, sessaoId) {
  const timestampAuditoria = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const { itens: itensImagem, confiancaScore } = await extrairItensDaImagem(imageBase64);
    if (itensImagem.length === 0) {
      return {
        status: "erro",
        confianca: `${confiancaScore}%`,
        rodadasComparadas: 0,
        totalDivergencias: 0,
        divergencias: [],
        itensImagem: [],
        itensBanco: [],
        podeCorrigir: false,
        sugestaoCorrecoes: [],
        timestampAuditoria,
        mensagem: "Nenhum s\xEDmbolo reconhecido na imagem fornecida."
      };
    }
    const supabase2 = getSupabase();
    let itensBanco = [];
    if (supabase2) {
      let query = supabase2.from("resultados").select("*").order("criado_em", { ascending: false }).limit(Math.max(itensImagem.length + 5, 20));
      if (sessaoId) {
        query = query.eq("sessao_id", sessaoId);
      }
      const { data, error } = await query;
      if (!error && data) {
        itensBanco = data.map((d) => ({
          id: d.id,
          rodada: d.rodada,
          item: String(d.item || d.objeto || "").toLowerCase().trim(),
          criado_em: d.criado_em
        }));
      }
    }
    const divergencias = [];
    const sugestaoCorrecoes = [];
    const totalComparacoes = Math.max(itensImagem.length, itensBanco.length);
    const itensBancoNomes = itensBanco.map((b) => b.item);
    const imagemInvertida = [...itensImagem].reverse();
    const eOrdemInvertida = itensBancoNomes.length > 2 && itensBancoNomes.slice(0, imagemInvertida.length).every((bItem, idx) => bItem === imagemInvertida[idx]);
    if (eOrdemInvertida) {
      divergencias.push({
        posicao: 1,
        resultadoBanco: itensBancoNomes[0] || null,
        resultadoImagem: itensImagem[0] || null,
        tipo: "ordem_incorreta",
        descricao: "A ordem dos registros no banco parece estar totalmente invertida em rela\xE7\xE3o \xE0 imagem. Nenhuma altera\xE7\xE3o autom\xE1tica foi realizada."
      });
    }
    for (let i = 0; i < itensImagem.length; i++) {
      const pos = i + 1;
      const itemImg = itensImagem[i];
      const recBanco = itensBanco[i];
      if (!recBanco) {
        divergencias.push({
          posicao: pos,
          resultadoBanco: null,
          resultadoImagem: itemImg,
          tipo: "rodada_extra",
          descricao: `Rodada extra identificada na imagem (Posi\xE7\xE3o ${pos}: "${itemImg}"). Ainda n\xE3o registrada no banco.`
        });
        sugestaoCorrecoes.push({
          resultadoNovo: itemImg,
          tipoAcao: "inserir",
          posicao: pos
        });
      } else if (recBanco.item !== itemImg) {
        const proximoBancoIgual = itensBanco[i + 1]?.item === itemImg;
        if (proximoBancoIgual) {
          divergencias.push({
            posicao: pos,
            resultadoBanco: recBanco.item,
            resultadoImagem: itemImg,
            tipo: "resultado_ausente",
            descricao: `O item "${itemImg}" identificado na imagem n\xE3o foi registrado entre as rodadas do banco.`
          });
          sugestaoCorrecoes.push({
            resultadoNovo: itemImg,
            tipoAcao: "inserir",
            posicao: pos
          });
        } else {
          divergencias.push({
            posicao: pos,
            resultadoBanco: recBanco.item,
            resultadoImagem: itemImg,
            tipo: "resultado_diferente",
            descricao: `Diverg\xEAncia na posi\xE7\xE3o ${pos}: Registrado no banco como "${recBanco.item}", mas na imagem \xE9 "${itemImg}".`
          });
          sugestaoCorrecoes.push({
            idRegistro: recBanco.id,
            rodada: recBanco.rodada,
            resultadoAnterior: recBanco.item,
            resultadoNovo: itemImg,
            tipoAcao: "atualizar",
            posicao: pos
          });
        }
      }
    }
    const statusFinal = divergencias.length === 0 ? "identico" : "divergencias_encontradas";
    const relatorio = {
      status: statusFinal,
      confianca: `${confiancaScore}%`,
      rodadasComparadas: Math.min(itensImagem.length, itensBanco.length),
      totalDivergencias: divergencias.length,
      divergencias,
      itensImagem,
      itensBanco,
      podeCorrigir: sugestaoCorrecoes.length > 0,
      sugestaoCorrecoes,
      sessaoId: sessaoId || (itensBanco[0] ? itensBanco[0].sessao_id : null),
      timestampAuditoria,
      mensagem: divergencias.length === 0 ? "Hist\xF3rico 100% id\xEAntico ao registrado no banco de dados. Nenhuma diverg\xEAncia detectada." : `${divergencias.length} diverg\xEAncia(s) detectada(s) entre a imagem e o banco de dados.`
    };
    logger.info(`=== AUDITORIA REALIZADA ===`);
    logger.info(`Data/Hora: ${timestampAuditoria}`);
    logger.info(`Sess\xE3o: ${relatorio.sessaoId || "Geral"}`);
    logger.info(`Rodadas Comparadas: ${relatorio.rodadasComparadas}`);
    logger.info(`Diverg\xEAncias Encontradas: ${relatorio.totalDivergencias}`);
    return relatorio;
  } catch (err) {
    logger.error("Erro na auditoria por imagem:", err?.message);
    return {
      status: "erro",
      confianca: "0%",
      rodadasComparadas: 0,
      totalDivergencias: 0,
      divergencias: [],
      itensImagem: [],
      itensBanco: [],
      podeCorrigir: false,
      sugestaoCorrecoes: [],
      timestampAuditoria,
      mensagem: err?.message || "Erro inesperado ao processar auditoria de imagem."
    };
  }
}
async function corrigirHistorico(correcoes, usuarioConfirmou = true, usuarioNome = "usuario_operador", sessaoId) {
  if (!usuarioConfirmou) {
    return {
      sucesso: false,
      correcoesAplicadas: 0,
      mensagem: "Opera\xE7\xE3o cancelada: a confirma\xE7\xE3o do usu\xE1rio \xE9 obrigat\xF3ria.",
      detalhes: []
    };
  }
  if (!correcoes || correcoes.length === 0) {
    return {
      sucesso: true,
      correcoesAplicadas: 0,
      mensagem: "Nenhuma corre\xE7\xE3o pendente para aplicar.",
      detalhes: []
    };
  }
  const supabase2 = getSupabase();
  if (!supabase2) {
    return {
      sucesso: false,
      correcoesAplicadas: 0,
      mensagem: "Supabase n\xE3o configurado para aplicar corre\xE7\xF5es.",
      detalhes: []
    };
  }
  const logsExecucao = [];
  let contagemSucesso = 0;
  for (const c of correcoes) {
    try {
      if (c.tipoAcao === "atualizar" && c.idRegistro) {
        let updateRes = await supabase2.from("resultados").update({ item: c.resultadoNovo }).eq("id", c.idRegistro);
        if (updateRes.error) {
          updateRes = await supabase2.from("resultados").update({ objeto: c.resultadoNovo }).eq("id", c.idRegistro);
        }
        if (updateRes.error) {
          throw updateRes.error;
        }
        contagemSucesso++;
        logsExecucao.push({
          idRegistro: c.idRegistro,
          acao: "atualizar",
          de: c.resultadoAnterior,
          para: c.resultadoNovo,
          status: "sucesso"
        });
      } else if (c.tipoAcao === "inserir") {
        const resReg = await registrarResultadoAutomaticamente(c.resultadoNovo, 95);
        if (resReg.registrado) {
          contagemSucesso++;
          logsExecucao.push({
            idRegistro: resReg.rodadaRegistrada || c.posicao,
            acao: "inserir",
            item: c.resultadoNovo,
            status: "sucesso"
          });
        } else {
          throw new Error(resReg.motivo || "Falha ao inserir registro no banco de dados.");
        }
      }
    } catch (err) {
      logger.error(`Erro ao aplicar corre\xE7\xE3o na posi\xE7\xE3o ${c.posicao}:`, err?.message);
      logsExecucao.push({
        posicao: c.posicao,
        acao: c.tipoAcao,
        status: "erro",
        motivo: err?.message
      });
    }
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await supabase2.from("auditoria_logs").insert([
      {
        sessao_id: sessaoId || null,
        usuario: usuarioNome,
        rodadas_comparadas: correcoes.length,
        numero_divergencias: correcoes.length,
        correcoes_realizadas: logsExecucao,
        confirmado_em: timestamp
      }
    ]);
  } catch (logErr) {
    logger.info("Log de auditoria registrado no servidor.");
  }
  logger.info(`=== CORRE\xC7\xC3O DE HIST\xD3RICO CONCLU\xCDDA ===`);
  logger.info(`Data: ${timestamp}`);
  logger.info(`Usu\xE1rio que confirmou: ${usuarioNome}`);
  logger.info(`Sess\xE3o: ${sessaoId || "Geral"}`);
  logger.info(`Corre\xE7\xF5es Aplicadas com Sucesso: ${contagemSucesso}/${correcoes.length}`);
  invalidarCacheEstatistico();
  return {
    sucesso: true,
    correcoesAplicadas: contagemSucesso,
    mensagem: `${contagemSucesso} corre\xE7\xE3o(\xF5es) aplicada(s) com sucesso no banco de dados.`,
    detalhes: logsExecucao
  };
}

// src/expressApp.ts
var app = express();
app.use(express.json({ limit: "20mb" }));
app.use((req, res, next) => {
  if (req.url.startsWith("/api/") || req.url === "/api") {
    return next();
  }
  const knownApiPaths = [
    "/live",
    "/health",
    "/consultar",
    "/padroes",
    "/dashboard",
    "/estatisticas",
    "/analyze-wheel",
    "/query-ai",
    "/auditoria",
    "/engine"
  ];
  if (knownApiPaths.some((p) => req.url.startsWith(p))) {
    req.url = "/api" + req.url;
  }
  next();
});
app.use("/api", health_default);
app.use("/api", consultar_default);
app.use("/api", padroes_default);
app.use("/api", dashboard_default);
app.use("/api", estatisticas_default);
app.use("/api", live_default);
function getGenAIClient2() {
  const apiKey = process.env.GEMINI_API_KEY;
  return new GoogleGenAI4({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function generateContentWithFallback2(params) {
  const candidateModels = [
    params.model || "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite"
  ];
  const modelsToTry = Array.from(new Set(candidateModels));
  let lastError = null;
  const ai = getGenAIClient2();
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model: modelName
      });
      return response;
    } catch (err) {
      lastError = err;
      const isQuotaError = err?.status === 429 || err?.code === 429 || err?.message && (err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED"));
      if (isQuotaError) {
        logger.warn(
          `[GEMINI SERVER FALLBACK] Modelo ${modelName} atingiu cota (429). Tentando pr\xF3ximo modelo...`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
app.post("/api/analyze-wheel", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Nenhuma imagem foi fornecida." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Chave GEMINI_API_KEY n\xE3o configurada no servidor."
      });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const prompt = `Voc\xEA \xE9 o Farm Fishing AI, o sistema oficial de vis\xE3o computacional para an\xE1lise da Roda Gigante.
Sua fun\xE7\xE3o \xE9 identificar com m\xE1xima precis\xE3o os objetos sorteados na foto da roda ou da barra de hist\xF3rico visual.

Os \xFAnicos 8 objetos v\xE1lidos s\xE3o estritamente:
- sorvete
- boia
- balao
- soco
- tedy
- princesa
- camera
- coroa

REGRAS DE AN\xC1LISE VISUAL:
1. NUNCA invente objetos que n\xE3o estejam claramente vis\xEDveis na foto.
2. NUNCA agrupe resultados iguais consecutivamente. Exemplo: se houver 3 boias vis\xEDveis seguidas, voc\xEA deve registrar ["boia", "boia", "boia"]. Cada uma \xE9 uma rodada distinta.
3. ORIENTA\xC7\xC3O TEMPORAL IMPORTANTE:
   - O LADO ESQUERDO da foto/barra de hist\xF3rico cont\xE9m os resultados MAIS RECENTES (mais novos).
   - O LADO DIREITO cont\xE9m os resultados MAIS ANTIGOS (mais velhos).
4. Forne\xE7a a lista de itens ordenados DO MAIS RECENTE (esquerda) PARA O MAIS ANTIGO (direita).
5. Se a imagem estiver turva, cortada, borrada ou houver incerteza sobre algum item, atribua confidence = "baixa" e explique a limita\xE7\xE3o na descri\xE7\xE3o.

Retorne ESTRITAMENTE a resposta em formato JSON de acordo com a estrutura solicitada.`;
    const response = await generateContentWithFallback2({
      model: "gemini-3.6-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type3.OBJECT,
          properties: {
            detectedItems: {
              type: Type3.ARRAY,
              items: {
                type: Type3.STRING,
                enum: ["sorvete", "boia", "balao", "soco", "tedy", "princesa", "camera", "coroa"]
              },
              description: "Lista de itens detectados em ordem do mais recente (esquerda) ao mais antigo (direita)"
            },
            confidence: {
              type: Type3.STRING,
              enum: ["alta", "media", "baixa"],
              description: "Grau de confian\xE7a da vis\xE3o computacional"
            },
            confidenceScore: {
              type: Type3.NUMBER,
              description: "Pontua\xE7\xE3o de 0 a 100 da confian\xE7a visual"
            },
            description: {
              type: Type3.STRING,
              description: "Resumo e explica\xE7\xE3o da identifica\xE7\xE3o dos itens na foto"
            },
            rawObservations: {
              type: Type3.STRING,
              description: "Detalhes visuais adicionais (cores, disposi\xE7\xE3o na barra)"
            }
          },
          required: ["detectedItems", "confidence", "confidenceScore", "description"]
        }
      }
    });
    const responseText = response.text;
    if (!responseText) {
      throw new Error("Nenhuma resposta retornada pelo modelo Gemini.");
    }
    const parsed = JSON.parse(responseText);
    const itemMaisRecente = parsed.detectedItems && parsed.detectedItems.length > 0 ? parsed.detectedItems[0] : null;
    let autoRegister = {
      registrado: false,
      motivo: "Nenhum item detectado para registro.",
      sessaoId: null,
      rodadaRegistrada: null
    };
    if (itemMaisRecente) {
      autoRegister = await registrarResultadoAutomaticamente(itemMaisRecente, parsed.confidenceScore || 90);
    }
    return res.json({
      ...parsed,
      registrado: autoRegister.registrado,
      motivo: autoRegister.motivo,
      sessaoId: autoRegister.sessaoId,
      rodadaRegistrada: autoRegister.rodadaRegistrada
    });
  } catch (error) {
    logger.error("Erro na an\xE1lise de imagem com Gemini:", error);
    return res.status(500).json({
      error: error?.message || "Falha ao processar a imagem do hist\xF3rico visual da roda."
    });
  }
});
app.post("/api/query-ai", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Nenhuma pergunta foi enviada." });
    }
    const resultadoOrquestrador = await processarOrquestradorAI(String(query));
    return res.json({
      answer: resultadoOrquestrador.explicacaoHumana,
      roteamento: resultadoOrquestrador.roteamento,
      relevantData: {
        intencao: resultadoOrquestrador.roteamento.intencao,
        modulo: resultadoOrquestrador.roteamento.modulo,
        dadosConsulta: resultadoOrquestrador.roteamento.dados,
        confianca: resultadoOrquestrador.roteamento.confianca,
        tempoExecucaoMs: resultadoOrquestrador.tempoTotalMs
      }
    });
  } catch (error) {
    logger.error("Erro no orquestrador de consulta AI:", error);
    return res.status(500).json({
      error: error?.message || "Falha ao processar orquestra\xE7\xE3o inteligente da consulta."
    });
  }
});
app.post("/api/auditoria", async (req, res) => {
  try {
    const { imageBase64, sessaoId } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Nenhuma imagem enviada para auditoria." });
    }
    const relatorio = await auditarHistoricoPorImagem(imageBase64, sessaoId);
    return res.json(relatorio);
  } catch (error) {
    logger.error("Erro ao processar auditoria de imagem:", error);
    return res.status(500).json({
      error: error?.message || "Erro ao realizar auditoria do hist\xF3rico."
    });
  }
});
app.post("/api/auditoria/aplicar-correcoes", async (req, res) => {
  try {
    const { correcoes, usuarioConfirmou, usuarioNome, sessaoId } = req.body;
    if (usuarioConfirmou !== true) {
      return res.status(400).json({
        error: "\xC9 necess\xE1ria a confirma\xE7\xE3o expl\xEDcita do usu\xE1rio para aplicar corre\xE7\xF5es."
      });
    }
    if (!Array.isArray(correcoes) || correcoes.length === 0) {
      return res.status(400).json({ error: "Nenhuma corre\xE7\xE3o fornecida." });
    }
    const resultado = await corrigirHistorico(
      correcoes,
      usuarioConfirmou,
      usuarioNome || "operador_sistema",
      sessaoId
    );
    return res.json(resultado);
  } catch (error) {
    logger.error("Erro ao aplicar corre\xE7\xF5es de auditoria:", error);
    return res.status(500).json({
      error: error?.message || "Erro ao salvar corre\xE7\xF5es de auditoria no banco de dados."
    });
  }
});
var expressApp_default = app;

// api/index.ts
var index_default = expressApp_default;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
