export type WheelItem = 
  | 'sorvete'
  | 'boia'
  | 'balao'
  | 'soco'
  | 'tedy'
  | 'princesa'
  | 'camera'
  | 'coroa';

export interface RoundEntry {
  id: string;
  item: WheelItem;
  timestamp: number;
  note?: string;
  source?: 'manual' | 'ai_vision' | 'sample';
}

export interface ItemConfig {
  id: WheelItem;
  label: string;
  shortLabel: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export interface TransitionStat {
  item: WheelItem;
  count: number;
  percentage: number;
}

export interface ItemDelayStat {
  item: WheelItem;
  roundsSinceLast: number;
  totalOccurrences: number;
  overallPercentage: number;
}

export interface PredictionResult {
  targetItem: WheelItem;
  totalFollowers: number;
  transitions: TransitionStat[];
  topRecommendation: WheelItem | null;
  confidence: number;
  reasoning: string;
}

export interface AIVisionResult {
  detectedItems: WheelItem[];
  confidence: 'alta' | 'media' | 'baixa';
  confidenceScore: number;
  description: string;
  rawObservations?: string;
}

export interface AIQueryResponse {
  answer: string;
  relevantData: {
    totalRounds: number;
    lastTen: WheelItem[];
    predictions?: Record<string, number>;
  };
}

export type TipoDivergencia =
  | 'resultado_ausente'
  | 'resultado_diferente'
  | 'rodada_extra'
  | 'ordem_incorreta';

export interface DivergenciaAuditoria {
  posicao: number;
  resultadoBanco: string | null;
  resultadoImagem: string | null;
  tipo: TipoDivergencia;
  descricao: string;
}

export interface CorrecaoAuditoriaItem {
  idRegistro?: string | number;
  rodada?: number;
  resultadoAnterior?: string | null;
  resultadoNovo: string;
  tipoAcao: 'inserir' | 'atualizar';
  posicao: number;
}

export interface RegistroBancoAuditoria {
  id?: string | number;
  rodada?: number;
  item: string;
  criado_em?: string;
}

export interface RelatorioAuditoria {
  status: 'identico' | 'divergencias_encontradas' | 'erro';
  confianca: string;
  rodadasComparadas: number;
  totalDivergencias: number;
  divergencias: DivergenciaAuditoria[];
  itensImagem: string[];
  itensBanco: RegistroBancoAuditoria[];
  podeCorrigir: boolean;
  sugestaoCorrecoes: CorrecaoAuditoriaItem[];
  sessaoId?: string | number | null;
  timestampAuditoria: string;
  mensagem?: string;
}

