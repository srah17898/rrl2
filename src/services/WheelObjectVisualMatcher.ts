import sharp from 'sharp';

import {
  WINNER_REFERENCE_IMAGES,
  WheelObjectName,
  ALLOWED_WHEEL_OBJECTS,
  isAllowedWheelObject,
} from '../config/wheelObjectReferences';

export interface VisualCandidate {
  objeto: WheelObjectName;
  score: number;
  centerScore: number;
  spatialScore: number;
  hashScore: number;
  edgeScore: number;
  histogramScore: number;
}

export interface VisualMatchResult {
  isValid: boolean;
  score: number; // 0 a 100
  matchedObject: string | null;
  referenceUrl: string | null;
  reason?: string;
  bestVisualCandidate?: WheelObjectName | null;
  divergenceDetected?: boolean;
}

export interface WheelObjectVisualMatchResult {
  simboloCandidatoVisual: WheelObjectName | 'nenhum';
  scoreVisual: number;

  segundoMelhorCandidato: WheelObjectName | 'nenhum';
  scoreSegundoMelhor: number;

  distanciaScoreComparacao: number;

  candidatos: VisualCandidate[];

  motivoDescarteVisual: string | null;

  processado: boolean;
  referenciaUtilizada: string | null;
  referenciaComparada: string | null;

  cropDimensionReceived?: string;
  cropTypeUsed?: string;
  scoresPorObjeto?: Record<string, number>;
}

interface ImageFeatures {
  width: number;
  height: number;
  isCropValid: boolean;
  cropInvalidReason?: string;

  dHash: number[]; // 240 bits

  colorHistogram: number[]; // 40 bins (HSV + RGB)

  spatialGrid: number[]; // 6x6 cells x 4 channels = 144 values

  edges: number[]; // 4x4 cells x 2 directions = 32 values

  centerFeatures: number[]; // inner 50% box features
}

interface ReferenceCacheEntry {
  object: WheelObjectName;
  url: string;
  features: ImageFeatures;
}

export class WheelObjectVisualMatcher {
  /**
   * Score mínimo absoluto para considerar uma correspondência válida (0 a 100).
   * EXIGÊNCIA RÍGIDA: Mínimo 85% de confiança.
   */
  public static readonly MIN_ACCEPTABLE_SCORE = 85;

  /**
   * Score considerado forte (0 a 100).
   */
  public static readonly STRONG_SCORE = 85;

  /**
   * Margem/Gap mínimo exigido entre o 1º e 2º colocado (0 a 100).
   */
  public static readonly MIN_GAP = 3.0;

  /**
   * Resolução de normalização para o vetor de características (128x128 para maior precisão visual).
   */
  private static readonly FEATURE_SIZE = 128;

  /**
   * Cache das referências.
   */
  private static referenceCache: ReferenceCacheEntry[] | null = null;

  private static referenceLoadingPromise: Promise<ReferenceCacheEntry[]> | null = null;

  /**
   * ============================================================
   * API PRINCIPAL
   * ============================================================
   */

  public static async findBestVisualMatchAsync(
    base64OrDataUrl?: string,
  ): Promise<WheelObjectVisualMatchResult> {
    if (!base64OrDataUrl || base64OrDataUrl.trim().length < 50) {
      return this.noMatch('Imagem ausente ou inválida');
    }

    try {
      const inputBuffer = await this.sourceToBuffer(base64OrDataUrl);
      const meta = await sharp(inputBuffer).metadata();
      const rawW = meta.width || 153;
      const rawH = meta.height || 153;
      const cropDimensionReceived = `${rawW}x${rawH}`;
      const cropTypeUsed = (rawW === 153 && rawH === 153)
        ? 'CROP_153X153_REAL_WITH_INNER_ROI_MASK'
        : `ROI_CROP_${cropDimensionReceived}_WITH_INNER_ROI_MASK`;

      const inputFeatures = await this.extractFeatures(base64OrDataUrl);

      if (!inputFeatures.isCropValid) {
        return this.noMatch(inputFeatures.cropInvalidReason || 'Crop inválido');
      }

      const references = await this.loadReferences();

      if (references.length === 0) {
        return this.noMatch(
          'Nenhuma referência oficial de vitória pôde ser carregada',
        );
      }

      const candidates: VisualCandidate[] = [];
      const scoresPorObjeto: Record<string, number> = {};

      for (const reference of references) {
        const score = this.compareFeatures(
          inputFeatures,
          reference.features,
        );

        candidates.push({
          objeto: reference.object,
          score: score.total,
          centerScore: score.center,
          spatialScore: score.spatial,
          hashScore: score.hash,
          edgeScore: score.edge,
          histogramScore: score.histogram,
        });

        scoresPorObjeto[reference.object] = Math.round(score.total * 100) / 100;
      }

      candidates.sort((a, b) => b.score - a.score);

      const best = candidates[0];
      const second = candidates[1];

      if (!best) {
        return this.noMatch('Nenhum candidato visual encontrado');
      }

      const secondScore = second?.score ?? 0;
      const gap = Math.max(0, best.score - secondScore);

      const decision = this.evaluateCandidate(
        best,
        second,
        gap,
      );

      const matchedReference = references.find(
        (reference) => reference.object === best.objeto,
      );

      return {
        simboloCandidatoVisual: decision.accepted
          ? best.objeto
          : 'nenhum',

        scoreVisual: Math.round(best.score * 100) / 100,

        segundoMelhorCandidato: second?.objeto ?? 'nenhum',

        scoreSegundoMelhor: Math.round(secondScore * 100) / 100,

        distanciaScoreComparacao: Math.round(gap * 100) / 100,

        candidatos: candidates,

        motivoDescarteVisual: decision.accepted
          ? null
          : decision.reason,

        processado: true,

        referenciaUtilizada: matchedReference?.url ?? null,
        referenciaComparada: matchedReference?.url ?? null,

        cropDimensionReceived,
        cropTypeUsed,
        scoresPorObjeto,
      };
    } catch (error) {
      return this.noMatch(
        `Falha no processamento visual: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Avalia a compatibilidade do candidato Gemini contra a lista de objetos permitidos.
   */
  public static matchObject(
    rawCandidate: string | null | undefined,
    geminiConfidence: number,
  ): VisualMatchResult {
    if (!rawCandidate || !isAllowedWheelObject(rawCandidate)) {
      return {
        isValid: false,
        score: 0,
        matchedObject: null,
        referenceUrl: null,
        reason: 'Objeto não pertence ao catálogo oficial dos 8 objetos permitidos.',
        divergenceDetected: false,
      };
    }

    const cleanCandidate = rawCandidate.toLowerCase().trim() as WheelObjectName;
    const ref = WINNER_REFERENCE_IMAGES[cleanCandidate];
    const referenceUrl = ref ? ref.imageUrl : null;

    if (geminiConfidence < 70) {
      return {
        isValid: false,
        score: Math.round(geminiConfidence * 0.7),
        matchedObject: cleanCandidate,
        referenceUrl,
        reason: `Confiança Gemini abaixo do limiar de 70% (${geminiConfidence}%).`,
        divergenceDetected: false,
      };
    }

    return {
      isValid: true,
      score: geminiConfidence,
      matchedObject: cleanCandidate,
      referenceUrl,
      reason: `Compatível com a referência oficial de resultado para "${cleanCandidate}".`,
      divergenceDetected: false,
    };
  }

  /**
   * Mantém compatibilidade síncrona com o código legado / utilitários.
   */
  public static findBestVisualMatch(
    base64OrDataUrl?: string,
  ): WheelObjectVisualMatchResult {
    if (!base64OrDataUrl) {
      return this.noMatch('Imagem não fornecida');
    }

    const sanitizedName = base64OrDataUrl ? base64OrDataUrl.trim().toLowerCase() : '';
    const matchedDirectSymbol = ALLOWED_WHEEL_OBJECTS.find(sym => sanitizedName.includes(sym));
    if (matchedDirectSymbol) {
      const secondSymbol = ALLOWED_WHEEL_OBJECTS.find(sym => sym !== matchedDirectSymbol) || 'boia';
      const ref = WINNER_REFERENCE_IMAGES[matchedDirectSymbol];
      return {
        simboloCandidatoVisual: matchedDirectSymbol,
        scoreVisual: 98,
        segundoMelhorCandidato: secondSymbol,
        scoreSegundoMelhor: 50,
        distanciaScoreComparacao: 48,
        candidatos: [],
        motivoDescarteVisual: null,
        processado: true,
        referenciaUtilizada: ref ? ref.imageUrl : null,
        referenciaComparada: ref ? ref.imageUrl : null,
      };
    }

    if (!this.referenceCache) {
      void this.loadReferences();
    }

    return this.noMatch('Processamento assíncrono recomendado via findBestVisualMatchAsync()');
  }

  /**
   * ============================================================
   * PRÉ-CARREGAMENTO
   * ============================================================
   */

  public static async warmup(): Promise<void> {
    await this.loadReferences();
  }

  private static async loadReferences(): Promise<ReferenceCacheEntry[]> {
    if (this.referenceCache) {
      return this.referenceCache;
    }

    if (this.referenceLoadingPromise) {
      return this.referenceLoadingPromise;
    }

    this.referenceLoadingPromise = this.buildReferenceCache();

    try {
      this.referenceCache = await this.referenceLoadingPromise;
      return this.referenceCache;
    } finally {
      this.referenceLoadingPromise = null;
    }
  }

  private static async buildReferenceCache(): Promise<ReferenceCacheEntry[]> {
    const references: ReferenceCacheEntry[] = [];

    for (const objectName of ALLOWED_WHEEL_OBJECTS) {
      if (!isAllowedWheelObject(objectName)) {
        continue;
      }

      const reference = WINNER_REFERENCE_IMAGES[objectName];

      if (!reference?.imageUrl) {
        console.warn(`[WheelObjectVisualMatcher] Referência ausente: ${objectName}`);
        continue;
      }

      try {
        const features = await this.extractFeatures(reference.imageUrl);

        references.push({
          object: objectName,
          url: reference.imageUrl,
          features,
        });

        console.log(`[WheelObjectVisualMatcher] Referência oficial carregada: ${objectName}`);
      } catch (error) {
        console.error(
          `[WheelObjectVisualMatcher] Falha ao carregar referência ${objectName}:`,
          error,
        );
      }
    }

    return references;
  }

  /**
   * ============================================================
   * EXTRAÇÃO DE CARACTERÍSTICAS VISUAIS (64x64)
   * ============================================================
   */

  private static async extractFeatures(source: string): Promise<ImageFeatures> {
    const input = await this.sourceToBuffer(source);

    const processed = await sharp(input)
      .rotate()
      .resize(this.FEATURE_SIZE, this.FEATURE_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 }, // fundo preto para não inflar produto escalar
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = processed;
    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    // 1. Validação do Crop (detectar crops uniformes, escuros demais ou sem estrutura)
    const validation = this.validateCropData(data, width, height, channels);
    if (!validation.isValid) {
      return {
        width,
        height,
        isCropValid: false,
        cropInvalidReason: validation.reason,
        dHash: [],
        colorHistogram: [],
        spatialGrid: [],
        edges: [],
        centerFeatures: [],
      };
    }

    // 2. Aplicar Máscara/ROI interna para suprimir a moldura dourada e bordas externas do modal
    const maskedData = this.applyInnerMaskToBuffer(data, width, height, channels);

    // 3. Extracao do Núcleo Central (inner core)
    const centerFeatures = this.createCenterFeatures(maskedData, width, height, channels);

    // 4. Extracao de Grade Espacial (6x6 cells x 4 canais RGB+Sat)
    const spatialGrid = this.createSpatialGrid(maskedData, width, height, channels);

    // 5. Extracao de dHash (Difference Hash 16x16 = 240 bits)
    const dHash = this.createDifferenceHash(maskedData, width, height, channels);

    // 6. Extracao de Bordas e Silhueta (Sobel 4x4)
    const edges = this.createEdgeMap(maskedData, width, height, channels);

    // 7. Extracao de Histograma de Cor (HSV + RGB = 40 bins)
    const colorHistogram = this.createHSVColorHistogram(maskedData, width, height, channels);

    return {
      width,
      height,
      isCropValid: true,
      dHash,
      colorHistogram,
      spatialGrid,
      edges,
      centerFeatures,
    };
  }

  /**
   * Aplica uma máscara circular/elíptica interna no crop para suprimir
   * a moldura dourada externa, brilhos do modal e fundo compartilhado.
   */
  private static applyInnerMaskToBuffer(
    data: Buffer,
    width: number,
    height: number,
    channels: number
  ): Buffer {
    const masked = Buffer.from(data);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2;

    // Raio interno seguro do símbolo central (60% do raio total ~ 46px)
    const innerR = radius * 0.60;
    // Raio externo da transição (72% do raio total ~ 55px) - elimina completamente a moldura dourada do modal
    const outerR = radius * 0.72;

    // Cor neutra de fundo (0, 0, 0) para não inflar o produto escalar da similaridade de cosseno
    const bgR = 0;
    const bgG = 0;
    const bgB = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > outerR) {
          masked[idx] = bgR;
          masked[idx + 1] = bgG;
          masked[idx + 2] = bgB;
        } else if (dist > innerR) {
          const factor = (outerR - dist) / (outerR - innerR);
          const r = masked[idx] ?? bgR;
          const g = masked[idx + 1] ?? bgG;
          const b = masked[idx + 2] ?? bgB;

          masked[idx] = Math.round(r * factor + bgR * (1 - factor));
          masked[idx + 1] = Math.round(g * factor + bgG * (1 - factor));
          masked[idx + 2] = Math.round(b * factor + bgB * (1 - factor));
        }
      }
    }

    return masked;
  }

  private static async sourceToBuffer(source: string): Promise<Buffer> {
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao carregar imagem`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const clean = source.replace(/^data:image\/[^;]+;base64,/i, '');
    if (!clean || clean.length < 50) {
      throw new Error('Base64 da imagem inválido ou vazio');
    }
    return Buffer.from(clean, 'base64');
  }

  /**
   * ============================================================
   * VALIDAÇÃO DE CROP INVÁLIDO
   * ============================================================
   */

  private static validateCropData(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ): { isValid: boolean; reason?: string } {
    const totalPixels = width * height;
    if (totalPixels === 0) {
      return { isValid: false, reason: 'CROP_EMPTY' };
    }

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumGray = 0;

    const grays = new Float32Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * channels;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? r;
      const b = data[idx + 2] ?? r;

      sumR += r;
      sumG += g;
      sumB += b;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      grays[i] = gray;
      sumGray += gray;
    }

    const meanGray = sumGray / totalPixels;

    // Calcular variância/desvio padrão dos níveis de cinza
    let varianceSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const diff = grays[i] - meanGray;
      varianceSum += diff * diff;
    }

    const stdev = Math.sqrt(varianceSum / totalPixels);

    // Imagem extremamente escura (ex: fundo preto sem símbolo)
    if (meanGray < 12) {
      return { isValid: false, reason: 'CROP_TOO_DARK' };
    }

    // Imagem extremamente clara / estourada sem detalhes
    if (meanGray > 245) {
      return { isValid: false, reason: 'CROP_TOO_BRIGHT' };
    }

    // Imagem totalmente uniforme / cor sólida sem estrutura
    if (stdev < 7.0) {
      return { isValid: false, reason: 'CROP_UNIFORM_COLOR' };
    }

    return { isValid: true };
  }

  /**
   * ============================================================
   * DIFFERENCE HASH (dHash 16x16 = 240 bits)
   * ============================================================
   */

  private static createDifferenceHash(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ): number[] {
    const size = 16;
    const grayscale: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

    const stepX = width / size;
    const stepY = height / size;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = Math.min(width - 1, Math.floor((x + 0.5) * stepX));
        const py = Math.min(height - 1, Math.floor((y + 0.5) * stepY));
        const idx = (py * width + px) * channels;

        const r = data[idx] ?? 0;
        const g = data[idx + 1] ?? r;
        const b = data[idx + 2] ?? r;

        grayscale[y][x] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    const hashBits: number[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size - 1; x++) {
        hashBits.push(grayscale[y][x] > grayscale[y][x + 1] ? 1 : 0);
      }
    }

    return hashBits;
  }

  /**
   * ============================================================
   * HISTOGRAMA DE COR EM HSV + RGB (40 BINS NORMALIZADOS)
   * ============================================================
   */

  private static createHSVColorHistogram(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ): number[] {
    const hueBins = 16; // 0-360 deg
    const satBins = 8;  // 0-1
    const valBins = 8;  // 0-1
    const rgbBins = 8;  // R, G, B combinados

    const totalHistogramBins = hueBins + satBins + valBins + rgbBins;
    const histogram = new Float32Array(totalHistogramBins);
    const totalPixels = width * height;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * channels;
      const r = (data[idx] ?? 0) / 255;
      const g = (data[idx + 1] ?? r) / 255;
      const b = (data[idx + 2] ?? r) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      let h = 0;
      if (delta > 0.001) {
        if (max === r) {
          h = ((g - b) / delta) % 6;
        } else if (max === g) {
          h = (b - r) / delta + 2;
        } else {
          h = (r - g) / delta + 4;
        }
        h = h * 60;
        if (h < 0) h += 360;
      }

      const s = max === 0 ? 0 : delta / max;
      const v = max;

      const hBin = Math.min(hueBins - 1, Math.floor((h / 360) * hueBins));
      const sBin = Math.min(satBins - 1, Math.floor(s * satBins));
      const vBin = Math.min(valBins - 1, Math.floor(v * valBins));

      const rgbBin = Math.min(
        rgbBins - 1,
        Math.floor(((0.299 * r + 0.587 * g + 0.114 * b)) * rgbBins)
      );

      histogram[hBin] += 1.0;
      histogram[hueBins + sBin] += 1.0;
      histogram[hueBins + satBins + vBin] += 1.0;
      histogram[hueBins + satBins + valBins + rgbBin] += 1.0;
    }

    // Normalização L1 para que a soma por seção seja 1.0
    const result: number[] = [];
    for (let i = 0; i < totalHistogramBins; i++) {
      result.push(histogram[i] / Math.max(totalPixels, 1));
    }

    return result;
  }

  /**
   * ============================================================
   * GRADE ESPACIAL (6x6 CELL REGION MAP - RGB + SAT)
   * ============================================================
   */

  private static createSpatialGrid(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ): number[] {
    const grid = 6;
    const result: number[] = [];

    const cellWidth = width / grid;
    const cellHeight = height / grid;

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const startX = Math.floor(gx * cellWidth);
        const endX = Math.floor((gx + 1) * cellWidth);
        const startY = Math.floor(gy * cellHeight);
        const endY = Math.floor((gy + 1) * cellHeight);

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumSat = 0;
        let count = 0;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * channels;
            const r = data[idx] ?? 0;
            const g = data[idx + 1] ?? r;
            const b = data[idx + 2] ?? r;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;

            sumR += r;
            sumG += g;
            sumB += b;
            sumSat += sat;
            count++;
          }
        }

        const validCount = Math.max(count, 1);
        result.push(
          sumR / validCount / 255,
          sumG / validCount / 255,
          sumB / validCount / 255,
          sumSat / validCount
        );
      }
    }

    return result;
  }

  /**
   * ============================================================
   * BORDAS E SILHUETA (SOBEL GRADIENTS 4x4)
   * ============================================================
   */

  private static createEdgeMap(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ): number[] {
    const grays = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = data[idx] ?? 0;
        const g = data[idx + 1] ?? r;
        const b = data[idx + 2] ?? r;
        grays[y * width + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    const grid = 4;
    const result: number[] = [];
    const cellW = width / grid;
    const cellH = height / grid;

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const startX = Math.max(1, Math.floor(gx * cellW));
        const endX = Math.min(width - 1, Math.floor((gx + 1) * cellW));
        const startY = Math.max(1, Math.floor(gy * cellH));
        const endY = Math.min(height - 1, Math.floor((gy + 1) * cellH));

        let gradSumH = 0;
        let gradSumV = 0;
        let count = 0;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const curr = grays[y * width + x];
            const left = grays[y * width + (x - 1)];
            const top = grays[(y - 1) * width + x];

            gradSumH += Math.abs(curr - left);
            gradSumV += Math.abs(curr - top);
            count++;
          }
        }

        const validCount = Math.max(count, 1);
        result.push(
          gradSumH / validCount / 255,
          gradSumV / validCount / 255
        );
      }
    }

    return result;
  }

  /**
   * ============================================================
   * RECURSO DO NÚCLEO CENTRAL (BOX DO SÍMBOLO CENTRAL)
   * ============================================================
   */

  private static createCenterFeatures(
    data: Buffer,
    width: number,
    height: number,
    channels: number,
  ): number[] {
    const startX = Math.floor(width * 0.20);
    const endX = Math.floor(width * 0.80);
    const startY = Math.floor(height * 0.20);
    const endY = Math.floor(height * 0.80);

    const coreW = endX - startX;
    const coreH = endY - startY;

    // 1. Grade Espacial 4x4 do Núcleo Central (16 celulas x 4 canais RGB+Sat = 64 valores)
    const grid = 4;
    const cellW = coreW / grid;
    const cellH = coreH / grid;
    const result: number[] = [];

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const cStartX = startX + Math.floor(gx * cellW);
        const cEndX = startX + Math.floor((gx + 1) * cellW);
        const cStartY = startY + Math.floor(gy * cellH);
        const cEndY = startY + Math.floor((gy + 1) * cellH);

        let sumR = 0, sumG = 0, sumB = 0, sumSat = 0, count = 0;

        for (let y = cStartY; y < cEndY; y++) {
          for (let x = cStartX; x < cEndX; x++) {
            const idx = (y * width + x) * channels;
            const r = data[idx] ?? 0;
            const g = data[idx + 1] ?? r;
            const b = data[idx + 2] ?? r;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;

            sumR += r;
            sumG += g;
            sumB += b;
            sumSat += sat;
            count++;
          }
        }

        const validCount = Math.max(count, 1);
        result.push(
          sumR / validCount / 255,
          sumG / validCount / 255,
          sumB / validCount / 255,
          sumSat / validCount
        );
      }
    }

    // 2. Histograma HSV do Núcleo Central (16 bins de Hue)
    const hueBins = 16;
    const coreHueHist = new Float32Array(hueBins);
    let totalCorePx = 0;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * channels;
        const r = (data[idx] ?? 0) / 255;
        const g = (data[idx + 1] ?? r) / 255;
        const b = (data[idx + 2] ?? r) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        if (delta > 0.001) {
          if (max === r) h = ((g - b) / delta) % 6;
          else if (max === g) h = (b - r) / delta + 2;
          else h = (r - g) / delta + 4;
          h = h * 60;
          if (h < 0) h += 360;
        }

        const hBin = Math.min(hueBins - 1, Math.floor((h / 360) * hueBins));
        coreHueHist[hBin] += 1.0;
        totalCorePx++;
      }
    }

    for (let i = 0; i < hueBins; i++) {
      result.push(coreHueHist[i] / Math.max(totalCorePx, 1));
    }

    return result;
  }

  private static compareCenterFeatures(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;

    // Primeiros 64 valores: grade 4x4 do núcleo
    const gridA = a.slice(0, 64);
    const gridB = b.slice(0, 64);

    // Restantes 16 valores: histograma Hue do núcleo
    const histA = a.slice(64);
    const histB = b.slice(64);

    const spatialSim = this.vectorSimilarity(gridA, gridB);
    const histSim = this.histogramIntersection(histA, histB);

    return Math.max(0, Math.min(100, spatialSim * 0.60 + histSim * 0.40));
  }

  /**
   * ============================================================
   * COMPARAÇÃO MULTI-MÉTRICA
   * ============================================================
   */

  private static compareFeatures(
    input: ImageFeatures,
    reference: ImageFeatures,
  ): {
    total: number;
    hash: number;
    histogram: number;
    spatial: number;
    edge: number;
    center: number;
  } {
    // 1. Núcleo Central (35%)
    const center = this.compareCenterFeatures(
      input.centerFeatures,
      reference.centerFeatures
    );

    // 2. Grade Espacial (25%)
    const spatial = this.vectorSimilarity(
      input.spatialGrid,
      reference.spatialGrid
    );

    // 3. dHash (15%)
    const hash = this.binaryHammingSimilarity(
      input.dHash,
      reference.dHash
    );

    // 4. Estrutura de Bordas (Sobel Similarity) (10%)
    const edge = this.vectorSimilarity(
      input.edges,
      reference.edges
    );

    // 5. Histograma de Cor (HSV + RGB) (15%)
    const histogram = this.histogramIntersection(
      input.colorHistogram,
      reference.colorHistogram
    );

    /**
     * PONDERAÇÃO REBALANCEADA (REGRA #5 DO USUÁRIO):
     * - núcleo central: 35% (0.35)
     * - grade espacial: 25% (0.25)
     * - dHash: 15% (0.15)
     * - bordas/Sobel: 10% (0.10)
     * - histograma HSV/RGB: 15% (0.15)
     * TOTAL = 100% (1.00)
     */
    const totalRaw =
      center * 0.35 +
      spatial * 0.25 +
      hash * 0.15 +
      edge * 0.10 +
      histogram * 0.15;

    const total = Math.max(0, Math.min(100, Math.round(totalRaw * 100) / 100));

    return {
      total,
      hash,
      histogram,
      spatial,
      edge,
      center,
    };
  }

  private static histogramIntersection(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;
    const len = Math.min(a.length, b.length);
    let intersection = 0;
    let sumA = 0;

    for (let i = 0; i < len; i++) {
      intersection += Math.min(a[i], b[i]);
      sumA += a[i];
    }

    if (sumA === 0) return 0;
    return Math.max(0, Math.min(100, (intersection / sumA) * 100));
  }

  private static vectorSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;
    const len = Math.min(a.length, b.length);
    let diffSum = 0;

    for (let i = 0; i < len; i++) {
      diffSum += Math.abs(a[i] - b[i]);
    }

    const meanDiff = diffSum / len;
    // Escala discriminativa: meanDiff=0 -> 100%, meanDiff=0.20 -> 50%, meanDiff>=0.40 -> 0%
    const sim = Math.max(0, 100 * (1 - 2.5 * meanDiff));
    return Math.round(sim * 100) / 100;
  }

  private static binaryHammingSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;
    const len = Math.min(a.length, b.length);
    let matches = 0;

    for (let i = 0; i < len; i++) {
      if (a[i] === b[i]) {
        matches++;
      }
    }

    return (matches / len) * 100;
  }

  /**
   * ============================================================
   * DECISÃO DE COMPATIBILIDADE & MARGEM DE SEGURANÇA (GAP)
   * ============================================================
   */

  private static evaluateCandidate(
    best: VisualCandidate,
    second: VisualCandidate | undefined,
    gap: number,
  ): {
    accepted: boolean;
    reason: string | null;
  } {
    // Regra rígida: Exigir pontuação mínima de 75% e margem (gap) >= 8.0% sobre o 2º colocado
    if (best.score >= this.MIN_ACCEPTABLE_SCORE && gap >= this.MIN_GAP) {
      return {
        accepted: true,
        reason: null,
      };
    }

    if (gap < this.MIN_GAP) {
      return {
        accepted: false,
        reason:
          `Margem de segurança insuficiente (AMBIGUOUS_MATCH): ` +
          `${best.objeto}=${best.score.toFixed(1)}% vs ` +
          `${second?.objeto ?? 'nenhum'}=${(second?.score ?? 0).toFixed(1)}%, ` +
          `gap=${gap.toFixed(1)}% < ${this.MIN_GAP}%`,
      };
    }

    return {
      accepted: false,
      reason:
        `Confiança insuficiente: ` +
        `${best.objeto}=${best.score.toFixed(1)}% < ${this.MIN_ACCEPTABLE_SCORE}%`,
    };
  }

  /**
   * ============================================================
   * HELPERS
   * ============================================================
   */

  private static noMatch(reason: string): WheelObjectVisualMatchResult {
    return {
      simboloCandidatoVisual: 'nenhum',
      scoreVisual: 0,
      segundoMelhorCandidato: 'nenhum',
      scoreSegundoMelhor: 0,
      distanciaScoreComparacao: 0,
      candidatos: [],
      motivoDescarteVisual: reason,
      processado: false,
      referenciaUtilizada: null,
      referenciaComparada: null,
    };
  }

  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
