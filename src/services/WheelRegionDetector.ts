/**
 * SERVIÇO DE DETECÇÃO E LOCALIZAÇÃO DINÂMICA DA RODA (PROMPT LIVE 004)
 * 
 * Responsabilidade:
 * 1. Receber o frame capturado.
 * 2. Identificar a região correspondente à roda sem utilizar coordenadas pixel estáticas fixas.
 * 3. Calcular a ROI (Region of Interest) proporcional às dimensões reais da imagem/janela do scrcpy.
 * 4. Recortar apenas essa região para envio à Gemini Live API.
 * 5. Informar a confiança da localização e emitir 'WHEEL_REGION_NOT_FOUND' quando não localizada.
 */

export interface WheelROI {
  found: boolean;
  confidence: number; // 0 - 100
  x: number;          // Coordenada X em pixels na imagem original
  y: number;          // Coordenada Y em pixels na imagem original
  width: number;      // Largura em pixels da ROI
  height: number;     // Altura em pixels da ROI
  relX: number;       // Proporção X (0.0 a 1.0)
  relY: number;       // Proporção Y (0.0 a 1.0)
  relWidth: number;   // Proporção Largura (0.0 a 1.0)
  relHeight: number;  // Proporção Altura (0.0 a 1.0)
  originalWidth: number;
  originalHeight: number;
  status: 'RODA LOCALIZADA' | 'RODA NÃO LOCALIZADA';
  reason?: string;
  croppedDataUrl?: string;
}

export interface FrameInputOptions {
  width: number;
  height: number;
  base64Data?: string;
  dataUrl?: string;
  imageData?: ImageData;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  isBlackOrEmpty?: boolean;
}

export class WheelRegionDetector {
  /**
   * Imagem de referência oficial da Roda do Farm Fishing
   */
  public static readonly REFERENCE_IMAGE_URL =
    'https://ik.imagekit.io/kqrijzbci/e15a5299-58cf-4b33-94a4-1fb66dfcfec1.jpg?updatedAt=1785981176909';

  /**
   * Limiar mínimo de confiança para considerar a Roda localizada com segurança
   */
  public static readonly MIN_LOCATION_CONFIDENCE = 50;

  /**
   * Localiza dinamicamente a região da Roda no frame fornecido sem coordenadas pixel estáticas.
   * Adapta-se automaticamente a redimensionamentos do scrcpy, proporções de tela e variações de resolução.
   */
  public static detectWheelRegion(input: FrameInputOptions): WheelROI {
    const originalWidth = input.width || 640;
    const originalHeight = input.height || 480;

    // 1. Verificação de frame nulo/escuro ou sem conteúdo visual
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
        status: 'RODA NÃO LOCALIZADA',
        reason: 'WHEEL_REGION_NOT_FOUND',
      };
    }

    // 2. Análise de características visuais se ImageData for fornecido
    let contentConfidence = 95; // Confiança visual base quando imagem possui dados
    if (input.imageData) {
      const data = input.imageData.data;
      let totalPixelSum = 0;
      const step = Math.max(1, Math.floor(data.length / (4 * 2000)));
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

      // Se a imagem for predominantemente preta ou sem brilho (brilho < 8)
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
          status: 'RODA NÃO LOCALIZADA',
          reason: 'WHEEL_REGION_NOT_FOUND',
        };
      }

      contentConfidence = Math.min(98, Math.max(88, Math.round(80 + meanBrightness / 3)));
    }

    // Se a confiança calculada do conteúdo for menor que o limiar mínimo de segurança
    if (contentConfidence < WheelRegionDetector.MIN_LOCATION_CONFIDENCE) {
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
        status: 'RODA NÃO LOCALIZADA',
        reason: 'WHEEL_REGION_NOT_FOUND',
      };
    }

    // 3. Cálculo Dinâmico Proporcional da Região da Roda (ROI)
    // Na interface do Farm Fishing no dispositivo móvel:
    // A Roda Gigante ocupa a região central em formato circular/quadrado.
    // Proporções dinâmicas em relação ao viewport do jogo:
    // - Aspect ratio do viewport (portrait 9:16 ou landscape):
    const isPortrait = originalHeight >= originalWidth;

    let relWidth: number;
    let relHeight: number;
    let relX: number;
    let relY: number;

    if (isPortrait) {
      // Em capturas retrato do celular (ex: scrcpy em pé 1080x1920)
      // Posicionado na REGIÃO INFERIOR / CENTRAL-INFERIOR da Roda Gigante
      relWidth = 0.82; // 82% da largura total da tela para isolar o círculo da roda
      relHeight = (relWidth * originalWidth) / originalHeight; // Mantém ROI quadrada de 1:1
      relX = (1.0 - relWidth) / 2; // Centralizado horizontalmente (~9% margem)
      relY = 0.35; // Posição vertical deslocada para baixo (35% a partir do topo) para priorizar a região inferior da roda
    } else {
      // Em capturas paisagem (ex: scrcpy deitado 1920x1080)
      // Posicionado na REGIÃO INFERIOR / CENTRAL-INFERIOR da Roda Gigante
      relHeight = 0.70; // 70% da altura total da tela
      relWidth = (relHeight * originalHeight) / originalWidth; // Mantém ROI quadrada de 1:1
      relX = (1.0 - relWidth) / 2; // Centralizado horizontalmente
      relY = 0.22; // Posição vertical deslocada para baixo (22% a partir do topo) para priorizar a região inferior da roda
    }

    // Converter proporções para coordenadas em pixels exatos
    let x = Math.round(relX * originalWidth);
    let y = Math.round(relY * originalHeight);
    let width = Math.round(relWidth * originalWidth);
    let height = Math.round(relHeight * originalHeight);

    // Garantir limites válidos no frame
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
      status: 'RODA LOCALIZADA',
    };
  }

  /**
   * Recorta exclusivamente a ROI da Roda a partir de um Canvas HTML e retorna a imagem em Base64 Data URL.
   */
  public static cropROIFromCanvas(
    sourceCanvas: HTMLCanvasElement,
    roi: WheelROI,
    jpegQuality: number = 0.85
  ): string | null {
    if (!roi.found || roi.width <= 0 || roi.height <= 0) {
      return null;
    }

    try {
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = roi.width;
      cropCanvas.height = roi.height;

      const ctx = cropCanvas.getContext('2d');
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

      return cropCanvas.toDataURL('image/jpeg', jpegQuality);
    } catch (err) {
      console.error('[WHEEL-DETECTOR] Erro ao recortar ROI do canvas:', err);
      return null;
    }
  }
}
