import {
  WINNER_REFERENCE_IMAGES,
  WheelObjectName,
  isAllowedWheelObject,
  ALLOWED_WHEEL_OBJECTS,
} from '../config/wheelObjectReferences';

import { WheelObjectVisualMatcher } from './WheelObjectVisualMatcher';

export interface WinnerReferenceMatchResult {
  objeto: WheelObjectName | 'nenhum';
  confianca: number;
  referencia: string | null;

  status:
    | 'MATCH'
    | 'NO_MATCH'
    | 'DIVERGENCIA';

  segundoMelhor?: WheelObjectName | 'nenhum';
  scoreSegundoMelhor?: number;
  gap?: number;

  reason?: string | null;

  diagnostico?: {
    candidatosTestados: number;
    referenciaOficialEncontrada: boolean;
    scorePrincipal: number;
    scoreSegundo: number;
    gap: number;
    thresholdConfianca: number;
    thresholdGap: number;
  };
}

export interface ROIValidationResult {
  isValid: boolean;
  reason?: string;
  width?: number;
  height?: number;
}

/**
 * WinnerReferenceMatcher
 *
 * Responsável exclusivamente por:
 *
 * 1. Validar o SYMBOL_CROP.
 * 2. Comparar o crop contra o catálogo oficial de vitória.
 * 3. Garantir que o candidato pertence aos 8 objetos permitidos.
 * 4. Verificar confiança mínima.
 * 5. Verificar distância entre primeiro e segundo candidato.
 * 6. Recusar classificações ambíguas.
 *
 * IMPORTANTE:
 * Este serviço NÃO chama Gemini.
 *
 * Gemini deve ser tratado como camada opcional de confirmação.
 */
export class WinnerReferenceMatcher {
  /**
   * Confiança mínima absoluta.
   *
   * Abaixo disso o resultado é considerado inseguro.
   */
  public static readonly MIN_CONFIDENCE_THRESHOLD = 65;

  /**
   * Diferença mínima entre o primeiro e o segundo candidato.
   *
   * Exemplo:
   *
   * BALAO = 91
   * SORVETE = 72
   *
   * GAP = 19
   *
   * Resultado seguro.
   */
  public static readonly MIN_GAP_THRESHOLD = 10;

  /**
   * Quantidade esperada de objetos oficiais.
   */
  public static readonly EXPECTED_REFERENCE_COUNT = 8;

  /**
   * Validação básica do SYMBOL_CROP.
   */
  public static validateROI(
    roiInfo: {
      resultScreenWidth?: number;
      resultScreenHeight?: number;

      symbolCropWidth?: number;
      symbolCropHeight?: number;

      symbolCropValid?: boolean;

      croppedDataUrl?: string;
    } | null | undefined,

    base64Data?: string
  ): ROIValidationResult {
    if (!roiInfo) {
      return {
        isValid: false,
        reason: 'ROI não fornecida',
      };
    }

    const width =
      Number(roiInfo.symbolCropWidth) ||
      Number(roiInfo.resultScreenWidth) ||
      0;

    const height =
      Number(roiInfo.symbolCropHeight) ||
      Number(roiInfo.resultScreenHeight) ||
      0;

    if (width < 40 || height < 40) {
      return {
        isValid: false,
        reason:
          `SYMBOL_CROP muito pequeno: ${width}x${height}px. ` +
          `Mínimo permitido: 40x40px.`,
        width,
        height,
      };
    }

    if (roiInfo.symbolCropValid === false) {
      return {
        isValid: false,
        reason: 'SYMBOL_CROP marcado explicitamente como inválido',
        width,
        height,
      };
    }

    const imageData =
      base64Data ||
      roiInfo.croppedDataUrl ||
      '';

    if (!imageData || imageData.length < 100) {
      return {
        isValid: false,
        reason: 'Dados do SYMBOL_CROP ausentes ou vazios',
        width,
        height,
      };
    }

    /**
     * Verificação do formato.
     *
     * Aceita:
     *
     * data:image/jpeg;base64,...
     * data:image/png;base64,...
     *
     * ou base64 puro.
     */
    const cleanBase64 = imageData
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
      .trim();

    if (cleanBase64.length < 500) {
      return {
        isValid: false,
        reason:
          'Payload do SYMBOL_CROP muito pequeno para uma imagem válida',
        width,
        height,
      };
    }

    return {
      isValid: true,
      width,
      height,
    };
  }

  /**
   * Confere se o catálogo oficial possui exatamente
   * os objetos esperados.
   */
  public static validateReferenceCatalog(): {
    valid: boolean;
    count: number;
    missing: string[];
    invalid: string[];
  } {
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const objectName of ALLOWED_WHEEL_OBJECTS) {
      const reference = WINNER_REFERENCE_IMAGES[objectName];

      if (!reference) {
        missing.push(objectName);
        continue;
      }

      if (
        !reference.imageUrl ||
        typeof reference.imageUrl !== 'string'
      ) {
        invalid.push(objectName);
      }
    }

    return {
      valid:
        missing.length === 0 &&
        invalid.length === 0 &&
        ALLOWED_WHEEL_OBJECTS.length ===
          this.EXPECTED_REFERENCE_COUNT,

      count: ALLOWED_WHEEL_OBJECTS.length,

      missing,

      invalid,
    };
  }

  /**
   * Executa a classificação visual.
   *
   * IMPORTANTE:
   * Não chama Gemini.
   */
  public static match(
    base64OrDataUrl?: string
  ): WinnerReferenceMatchResult {
    if (!base64OrDataUrl) {
      return this.noMatch(
        'SYMBOL_CROP não fornecido'
      );
    }

    /**
     * Confere se o catálogo está corretamente carregado.
     */
    const catalog = this.validateReferenceCatalog();

    if (!catalog.valid) {
      return {
        ...this.noMatch(
          `Catálogo de referências inválido. ` +
          `Quantidade=${catalog.count}; ` +
          `faltando=${catalog.missing.join(',')}; ` +
          `inválidas=${catalog.invalid.join(',')}`
        ),
        diagnostico: {
          candidatosTestados: 0,
          referenciaOficialEncontrada: false,
          scorePrincipal: 0,
          scoreSegundo: 0,
          gap: 0,
          thresholdConfianca:
            this.MIN_CONFIDENCE_THRESHOLD,
          thresholdGap:
            this.MIN_GAP_THRESHOLD,
        },
      };
    }

    /**
     * Motor visual existente.
     */
    const visualResult =
      WheelObjectVisualMatcher.findBestVisualMatch(
        base64OrDataUrl
      );

    const rawCandidate =
      visualResult?.simboloCandidatoVisual;

    const primaryScore =
      Number(visualResult?.scoreVisual) || 0;

    const secondScore =
      Number(visualResult?.scoreSegundoMelhor) || 0;

    const secondCandidate =
      visualResult?.segundoMelhorCandidato ||
      'nenhum';

    /**
     * Nunca aceitar candidato desconhecido.
     */
    if (
      !rawCandidate ||
      rawCandidate === 'nenhum' ||
      !isAllowedWheelObject(rawCandidate)
    ) {
      return {
        ...this.noMatch(
          visualResult?.motivoDescarteVisual ||
          'Nenhum dos 8 objetos oficiais foi identificado'
        ),

        segundoMelhor:
          isAllowedWheelObject(secondCandidate)
            ? secondCandidate
            : 'nenhum',

        scoreSegundoMelhor: secondScore,

        gap: Math.max(
          0,
          primaryScore - secondScore
        ),

        diagnostico: {
          candidatosTestados:
            this.EXPECTED_REFERENCE_COUNT,

          referenciaOficialEncontrada: false,

          scorePrincipal: primaryScore,

          scoreSegundo: secondScore,

          gap: Math.max(
            0,
            primaryScore - secondScore
          ),

          thresholdConfianca:
            this.MIN_CONFIDENCE_THRESHOLD,

          thresholdGap:
            this.MIN_GAP_THRESHOLD,
        },
      };
    }

    const candidate =
      rawCandidate as WheelObjectName;

    /**
     * Confiança precisa ser suficiente.
     */
    if (
      primaryScore <
      this.MIN_CONFIDENCE_THRESHOLD
    ) {
      return {
        objeto: 'nenhum',

        confianca: primaryScore,

        referencia: null,

        status: 'NO_MATCH',

        segundoMelhor:
          isAllowedWheelObject(secondCandidate)
            ? secondCandidate
            : 'nenhum',

        scoreSegundoMelhor: secondScore,

        gap: Math.max(
          0,
          primaryScore - secondScore
        ),

        reason:
          `Confiança insuficiente: ` +
          `${primaryScore.toFixed(1)}% ` +
          `< ${this.MIN_CONFIDENCE_THRESHOLD}%`,

        diagnostico: {
          candidatosTestados:
            this.EXPECTED_REFERENCE_COUNT,

          referenciaOficialEncontrada: true,

          scorePrincipal: primaryScore,

          scoreSegundo: secondScore,

          gap: Math.max(
            0,
            primaryScore - secondScore
          ),

          thresholdConfianca:
            this.MIN_CONFIDENCE_THRESHOLD,

          thresholdGap:
            this.MIN_GAP_THRESHOLD,
        },
      };
    }

    /**
     * Calcula GAP de forma determinística.
     */
    const gap = Math.max(
      0,
      primaryScore - secondScore
    );

    /**
     * Se não existe segundo candidato,
     * não devemos fabricar um gap.
     */
    const hasSecondCandidate =
      secondCandidate &&
      secondCandidate !== 'nenhum' &&
      isAllowedWheelObject(secondCandidate);

    /**
     * Se existe segundo candidato e a diferença
     * é pequena, classificamos como divergência.
     */
    if (
      hasSecondCandidate &&
      gap < this.MIN_GAP_THRESHOLD
    ) {
      return {
        objeto: 'nenhum',

        confianca: primaryScore,

        referencia: null,

        status: 'DIVERGENCIA',

        segundoMelhor:
          secondCandidate as WheelObjectName,

        scoreSegundoMelhor: secondScore,

        gap,

        reason:
          `Classificação ambígua: ` +
          `${candidate}=${primaryScore.toFixed(1)}% ` +
          `vs ` +
          `${secondCandidate}=${secondScore.toFixed(1)}%. ` +
          `GAP=${gap.toFixed(1)}% ` +
          `< ${this.MIN_GAP_THRESHOLD}%`,

        diagnostico: {
          candidatosTestados:
            this.EXPECTED_REFERENCE_COUNT,

          referenciaOficialEncontrada: true,

          scorePrincipal: primaryScore,

          scoreSegundo: secondScore,

          gap,

          thresholdConfianca:
            this.MIN_CONFIDENCE_THRESHOLD,

          thresholdGap:
            this.MIN_GAP_THRESHOLD,
        },
      };
    }

    /**
     * Recupera a referência oficial correspondente.
     */
    const reference =
      WINNER_REFERENCE_IMAGES[candidate];

    if (
      !reference ||
      !reference.imageUrl
    ) {
      return {
        objeto: 'nenhum',

        confianca: primaryScore,

        referencia: null,

        status: 'NO_MATCH',

        segundoMelhor:
          hasSecondCandidate
            ? (secondCandidate as WheelObjectName)
            : 'nenhum',

        scoreSegundoMelhor: secondScore,

        gap,

        reason:
          `Candidato ${candidate} identificado, ` +
          `mas a referência oficial não foi encontrada no catálogo.`,

        diagnostico: {
          candidatosTestados:
            this.EXPECTED_REFERENCE_COUNT,

          referenciaOficialEncontrada: false,

          scorePrincipal: primaryScore,

          scoreSegundo: secondScore,

          gap,

          thresholdConfianca:
            this.MIN_CONFIDENCE_THRESHOLD,

          thresholdGap:
            this.MIN_GAP_THRESHOLD,
        },
      };
    }

    /**
     * MATCH FINAL.
     */
    return {
      objeto: candidate,

      confianca: primaryScore,

      referencia: reference.imageUrl,

      status: 'MATCH',

      segundoMelhor:
        hasSecondCandidate
          ? (secondCandidate as WheelObjectName)
          : 'nenhum',

      scoreSegundoMelhor: secondScore,

      gap,

      reason: null,

      diagnostico: {
        candidatosTestados:
          this.EXPECTED_REFERENCE_COUNT,

        referenciaOficialEncontrada: true,

        scorePrincipal: primaryScore,

        scoreSegundo: secondScore,

        gap,

        thresholdConfianca:
          this.MIN_CONFIDENCE_THRESHOLD,

        thresholdGap:
          this.MIN_GAP_THRESHOLD,
      },
    };
  }

  private static noMatch(
    reason: string
  ): WinnerReferenceMatchResult {
    return {
      objeto: 'nenhum',

      confianca: 0,

      referencia: null,

      status: 'NO_MATCH',

      segundoMelhor: 'nenhum',

      scoreSegundoMelhor: 0,

      gap: 0,

      reason,
    };
  }
}
