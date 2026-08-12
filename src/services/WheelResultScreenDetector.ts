import { logger } from '../utils/logger';

export interface ResultScreenROI {
  // Métricas do Modal da Tela de Resultado (RESULT_SCREEN = modal inteiro)
  resultScreenX: number;
  resultScreenY: number;
  resultScreenWidth: number;
  resultScreenHeight: number;
  resultScreenCenterX: number;
  resultScreenCenterY: number;

  // Métricas da Sub-zona do Símbolo Vencedor (WINNING_SYMBOL_ZONE / WINNER_MATCH_ZONE)
  symbolCropX: number;
  symbolCropY: number;
  symbolCropWidth: number;
  symbolCropHeight: number;
  symbolCropCenterX: number;
  symbolCropCenterY: number;
  symbolCropValid: boolean;
  distanciaCentroModalParaCentroCrop: number;
  misaligned: boolean;

  // Coordenadas relativas à RESULT_ZONE (WINNER_MATCH_ZONE)
  winnerMatchZoneX: number;
  winnerMatchZoneY: number;
  winnerMatchZoneWidth: number;
  winnerMatchZoneHeight: number;

  // Aliases de compatibilidade
  x: number;
  y: number;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  centerX: number;
  centerY: number;
  absCropX: number;
  absCropY: number;
  absCropWidth: number;
  absCropHeight: number;
  xPct?: number;
  yPct?: number;
  wPct?: number;
  hPct?: number;
  isCustomConfig?: boolean;
  croppedBase64?: string;
  croppedDataUrl?: string;
  posicaoVertical?: string;
}

export interface ResultZoneConfig {
  enabled: boolean;
  xPct: number; // 0.0 - 100.0
  yPct: number; // 0.0 - 100.0
  wPct: number; // 0.0 - 100.0
  hPct: number; // 0.0 - 100.0
}

export interface ResultScreenDetection {
  resultadoScreenDetected: boolean;
  confidence: number; // 0.0 a 1.0 (ou 0-100)
  roi?: ResultScreenROI;
  reason?: string;
}

export interface ResultScreenDetectorInput {
  width: number;
  height: number;
  imageData?: ImageData | { data: Uint8ClampedArray; width: number; height: number };
  base64Data?: string;
  isBlackOrEmpty?: boolean;
}

/**
 * WheelResultScreenDetector
 * Serviço responsável por detectar se a captura atual exibe a TELA DE RESULTADO (Modal / Popup da Vitória da Farm Fishing)
 * e localizar proporcionalmente a região do SÍMBOLO VENCEDOR (Winner Symbol ROI).
 *
 * Imagem de Referência da Tela de Resultado:
 * https://ik.imagekit.io/kqrijzbci/e15a5299-58cf-4b33-94a4-1fb66dfcfec1.jpg
 *
 * Características da Tela de Resultado:
 * 1. Modal/Popup Centralizado cobrindo a roda (~20%-80% largura, ~25%-75% altura).
 * 2. Região do Símbolo Vencedor: fica no centro do modal de resultado.
 * 3. Proporcional à resolução da captura (sem coordenadas fixas de pixels).
 */
export class WheelResultScreenDetector {
  public static readonly MIN_RESULT_SCREEN_CONFIDENCE = 0.85; // 85%
  public static readonly RESULT_SCREEN_THRESHOLD = 0.85; // 85%

  private static customConfig: ResultZoneConfig | null = null;
  public static symbolCenterOffsetX = 0;
  public static symbolCenterOffsetY = 0;
  public static winnerMatchZoneScale = 0.60;

  public static getResultZoneConfig(): ResultZoneConfig {
    if (!this.customConfig && typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem('FARM_FISHING_RESULT_ZONE_CONFIG');
        if (saved) {
          this.customConfig = JSON.parse(saved);
        }
      } catch {
        // ignore
      }
    }
    return this.customConfig || {
      enabled: false,
      xPct: 34.0,
      yPct: 32.0,
      wPct: 32.0,
      hPct: 22.0,
    };
  }

  public static setResultZoneConfig(config: ResultZoneConfig): void {
    this.customConfig = config;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('FARM_FISHING_RESULT_ZONE_CONFIG', JSON.stringify(config));
      } catch {
        // ignore
      }
    }
  }

  public static resetResultZoneConfig(): void {
    this.customConfig = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem('FARM_FISHING_RESULT_ZONE_CONFIG');
      } catch {
        // ignore
      }
    }
  }

  /**
   * Avalia o frame e determina se a Tela de Resultado está presente.
   */
  public static detectResultScreen(input: ResultScreenDetectorInput): ResultScreenDetection {
    const { width: originalWidth, height: originalHeight, isBlackOrEmpty } = input;

    // Se o frame for preto, vazio ou sem dimensões válidas
    if (isBlackOrEmpty || !originalWidth || !originalHeight) {
      return {
        resultadoScreenDetected: false,
        confidence: 0,
        reason: 'FRAME_EMPTY_OR_BLACK',
      };
    }

    const isPortrait = originalHeight >= originalWidth;

    // 1. Localizar o Bounding Box e Centro Real do Modal da Tela de Resultado (RESULT_SCREEN)
    let resultScreenWidth: number;
    let resultScreenHeight: number;
    let resultScreenX: number;
    let resultScreenY: number;

    if (isPortrait) {
      // Retrato (ex: 478x1038, 1080x1920)
      resultScreenWidth = Math.round(originalWidth * 0.58);
      resultScreenHeight = Math.round(originalHeight * 0.40);
      resultScreenX = Math.round((originalWidth - resultScreenWidth) / 2);
      resultScreenY = Math.round(originalHeight * 0.28);
    } else {
      // Paisagem (ex: 1280x720, 1920x1080)
      resultScreenHeight = Math.round(originalHeight * 0.55);
      resultScreenWidth = Math.round(originalWidth * 0.38);
      resultScreenX = Math.round((originalWidth - resultScreenWidth) / 2);
      resultScreenY = Math.round((originalHeight - resultScreenHeight) / 2);
    }

    const resultScreenCenterX = resultScreenX + Math.round(resultScreenWidth / 2);
    const resultScreenCenterY = resultScreenY + Math.round(resultScreenHeight / 2);

    // 2. Gerar ROI QUADRADA Centralizada para o Símbolo Vencedor (SYMBOL_CROP)
    // REGRA OBRIGATÓRIA: O centro do recorte deve ser calculado DIRETAMENTE a partir do centro da Tela de Resultado.
    // cropCenterX = resultScreenCenterX
    // cropCenterY = resultScreenCenterY
    const cfg = this.getResultZoneConfig();
    let symbolCropX: number;
    let symbolCropY: number;
    let symbolCropWidth: number;
    let symbolCropHeight: number;
    let symbolCropCenterX: number;
    let symbolCropCenterY: number;
    let isCustom = false;

    if (cfg && cfg.enabled && typeof cfg.xPct === 'number' && typeof cfg.yPct === 'number') {
      const customX = Math.round((cfg.xPct / 100) * originalWidth);
      const customY = Math.round((cfg.yPct / 100) * originalHeight);
      const customW = Math.round(((cfg.wPct || 32) / 100) * originalWidth);
      const customH = Math.round(((cfg.hPct || 22) / 100) * originalHeight);
      
      // Forçar dimensão quadrada baseada na menor medida do enquadramento customizado
      const squareSide = Math.max(40, Math.min(customW, customH));
      symbolCropWidth = squareSide;
      symbolCropHeight = squareSide;
      symbolCropX = customX + Math.round((customW - squareSide) / 2);
      symbolCropY = customY + Math.round((customH - squareSide) / 2);
      symbolCropCenterX = symbolCropX + Math.round(squareSide / 2);
      symbolCropCenterY = symbolCropY + Math.round(squareSide / 2);
      isCustom = true;
    } else {
      // OBRIGATÓRIO: cropCenterX = resultScreenCenterX e cropCenterY = resultScreenCenterY
      const cropCenterX = resultScreenCenterX + (WheelResultScreenDetector.symbolCenterOffsetX || 0);
      const cropCenterY = resultScreenCenterY + (WheelResultScreenDetector.symbolCenterOffsetY || 0);

      // Tamanho do lado do quadrado proporcional ao modal para capturar o símbolo vencedor (~65% da menor dimensão do modal)
      const scale = Math.max(0.40, Math.min(0.85, WheelResultScreenDetector.winnerMatchZoneScale || 0.65));
      const cropSide = Math.max(60, Math.round(Math.min(resultScreenWidth, resultScreenHeight) * scale));
      symbolCropWidth = cropSide;
      symbolCropHeight = cropSide;

      // cropX = cropCenterX - cropWidth / 2
      // cropY = cropCenterY - cropHeight / 2
      symbolCropX = Math.round(cropCenterX - cropSide / 2);
      symbolCropY = Math.round(cropCenterY - cropSide / 2);

      // Sempre aplicar clamp para impedir que o crop saia dos limites da imagem
      symbolCropX = Math.max(0, Math.min(symbolCropX, originalWidth - cropSide));
      symbolCropY = Math.max(0, Math.min(symbolCropY, originalHeight - cropSide));

      // Recalcular os centros exatos do crop
      symbolCropCenterX = symbolCropX + Math.round(symbolCropWidth / 2);
      symbolCropCenterY = symbolCropY + Math.round(symbolCropHeight / 2);
    }

    // Coordenadas relativas da WINNER_MATCH_ZONE em relação à RESULT_ZONE
    const winnerMatchZoneX = symbolCropX - resultScreenX;
    const winnerMatchZoneY = symbolCropY - resultScreenY;
    const winnerMatchZoneWidth = symbolCropWidth;
    const winnerMatchZoneHeight = symbolCropHeight;

    // Calcular Distância do Centro do Modal para o Centro do Crop
    const distX = Math.abs(symbolCropCenterX - resultScreenCenterX);
    const distY = Math.abs(symbolCropCenterY - resultScreenCenterY);
    const distanciaCentroModalParaCentroCrop = Math.round(Math.sqrt(distX * distX + distY * distY));
    const isAligned = distX <= 20 && distY <= 20;

    // 3. Análise de características visuais se ImageData for fornecido
    let confidence = 0.92;

    if (input.isBlackOrEmpty) {
      return {
        resultadoScreenDetected: false,
        confidence: 0,
        reason: 'FRAME_EMPTY_OR_BLACK',
      };
    }

    if (input.imageData) {
      const data = input.imageData.data;
      const totalPixels = data.length / 4;
      const step = Math.max(1, Math.floor(totalPixels / 2000));

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

        if (pxX >= resultScreenX && pxX <= resultScreenX + resultScreenWidth && pxY >= resultScreenY && pxY <= resultScreenY + resultScreenHeight) {
          modalCenterBrightness += brightness;
          modalCenterCount++;
        } else {
          outerBrightness += brightness;
          outerCount++;
        }
      }

      const meanTotal = totalBrightness / ((totalPixels / step) || 1);
      const meanModal = modalCenterBrightness / (modalCenterCount || 1);
      const meanOuter = outerBrightness / (outerCount || 1);

      if (meanTotal < 10) {
        return {
          resultadoScreenDetected: false,
          confidence: 0,
          reason: 'DARK_FRAME',
        };
      }

      const modalContrastRatio = meanModal / (meanOuter || 1);

      if (modalContrastRatio >= 1.20 || (meanModal > 80 && meanOuter < 65)) {
        confidence = Math.min(0.98, Math.max(0.85, 0.85 + (modalContrastRatio - 1.0) * 0.15));
      } else {
        confidence = Math.max(0.10, Math.min(0.65, meanModal / 150));
      }
    }

    const detected = confidence >= WheelResultScreenDetector.RESULT_SCREEN_THRESHOLD;

    // Validação estrita do Recorte do Símbolo (SYMBOL_CROP_VALID)
    const isSquare = symbolCropWidth > 0 && symbolCropHeight > 0 && symbolCropWidth === symbolCropHeight;
    const isCenterInModal =
      symbolCropCenterX >= resultScreenX &&
      symbolCropCenterX <= resultScreenX + resultScreenWidth &&
      symbolCropCenterY >= resultScreenY &&
      symbolCropCenterY <= resultScreenY + resultScreenHeight;

    const symbolCropValid = detected && isSquare && isCenterInModal && isAligned;

    return {
      resultadoScreenDetected: detected,
      confidence: Math.round(confidence * 100) / 100,
      roi: {
        resultScreenX,
        resultScreenY,
        resultScreenWidth,
        resultScreenHeight,
        resultScreenCenterX,
        resultScreenCenterY,

        symbolCropX,
        symbolCropY,
        symbolCropWidth,
        symbolCropHeight,
        symbolCropCenterX,
        symbolCropCenterY,
        symbolCropValid,
        distanciaCentroModalParaCentroCrop,
        misaligned: !isAligned,

        // Coordenadas relativas da WINNER_MATCH_ZONE em relação à RESULT_ZONE
        winnerMatchZoneX,
        winnerMatchZoneY,
        winnerMatchZoneWidth,
        winnerMatchZoneHeight,

        // Compatibilidade com aliases
        x: resultScreenX,
        y: resultScreenY,
        width: resultScreenWidth,
        height: resultScreenHeight,
        cropX: symbolCropX - resultScreenX,
        cropY: symbolCropY - resultScreenY,
        cropWidth: symbolCropWidth,
        cropHeight: symbolCropHeight,
        centerX: resultScreenCenterX,
        centerY: resultScreenCenterY,
        absCropX: symbolCropX,
        absCropY: symbolCropY,
        absCropWidth: symbolCropWidth,
        absCropHeight: symbolCropHeight,
        xPct: Math.round((symbolCropX / originalWidth) * 1000) / 10,
        yPct: Math.round((symbolCropY / originalHeight) * 1000) / 10,
        wPct: Math.round((symbolCropWidth / originalWidth) * 1000) / 10,
        hPct: Math.round((symbolCropHeight / originalHeight) * 1000) / 10,
        isCustomConfig: isCustom,
        posicaoVertical: isCustom
          ? 'RESULT_ZONE (CUSTOMIZADA QUADRADA)'
          : `RESULT_ZONE (QUADRADA ${symbolCropWidth}x${symbolCropHeight}px - CENTRALIZADA NO MODAL)`,
      },
      reason: detected
        ? symbolCropValid
          ? 'RESULT_SCREEN_DETECTED'
          : !isAligned
          ? 'SYMBOL_CROP_MISALIGNED'
          : 'SYMBOL_CROP_INVALID'
        : 'NOT_RESULT_SCREEN',
    };
  }

  /**
   * Avalia rigorosamente se a tela atual é uma Tela de Resultado Válida.
   */
  public static isResultScreenValid(input: ResultScreenDetectorInput): {
    valid: boolean;
    score: number;
    reason: string;
  } {
    const result = this.detectResultScreen(input);
    return {
      valid: result.resultadoScreenDetected,
      score: result.confidence,
      reason: result.reason || (result.resultadoScreenDetected ? 'RESULT_SCREEN_CONFIRMED' : 'RESULT_SCREEN_NOT_DETECTED'),
    };
  }
}
