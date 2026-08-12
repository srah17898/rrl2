import { logger } from '../utils/logger';

export type VideoSourceType = 'CAMERA' | 'SCREEN_CAPTURE';

export interface VideoSourceConfig {
  sourceType: VideoSourceType;
  captureFps: number;
  jpegQuality: number;
  maxWidth: number;
  maxHeight: number;
  facingMode?: 'environment' | 'user';
}

export const DEFAULT_VIDEO_SOURCE_CONFIG: VideoSourceConfig = {
  sourceType: 'CAMERA',
  captureFps: 1,
  jpegQuality: 0.75,
  maxWidth: 640,
  maxHeight: 480,
  facingMode: 'environment',
};

export class VideoSourceManager {
  private currentStream: MediaStream | null = null;
  private config: VideoSourceConfig;

  constructor(initialConfig?: Partial<VideoSourceConfig>) {
    this.config = { ...DEFAULT_VIDEO_SOURCE_CONFIG, ...initialConfig };
  }

  public getConfig(): VideoSourceConfig {
    return { ...this.config };
  }

  public setConfig(newConfig: Partial<VideoSourceConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getSourceType(): VideoSourceType {
    return this.config.sourceType;
  }

  public setSourceType(sourceType: VideoSourceType) {
    this.config.sourceType = sourceType;
  }

  /**
   * Obtém o MediaStream apropriado (Câmera do dispositivo ou Captura de Tela do Celular via DisplayMedia)
   */
  public async requestStream(
    onTrackEnded?: () => void
  ): Promise<{ stream: MediaStream; sourceType: VideoSourceType }> {
    this.stopCurrentStream();

    if (this.config.sourceType === 'SCREEN_CAPTURE') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Seu navegador não suporta captura de tela (getDisplayMedia).');
      }

      logger.info('Solicitando captura de tela/janela do celular (scrcpy)...');
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        // Handler para quando a captura for interrompida pelo usuário ou a janela for fechada
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            logger.warn('Captura de tela ou compartilhamento encerrado pelo usuário.');
            if (onTrackEnded) {
              onTrackEnded();
            }
          };
        });

        this.currentStream = stream;
        return { stream, sourceType: 'SCREEN_CAPTURE' };
      } catch (err: any) {
        logger.error('Erro ao iniciar captura de tela:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('Captura de tela não autorizada. Clique novamente em Conectar tela e permita o compartilhamento.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error('Nenhuma fonte de tela disponível.');
        } else if (err.name === 'AbortError') {
          throw new Error('Captura de tela cancelada.');
        }
        throw new Error('Não foi possível iniciar a captura de tela.');
      }
    } else {
      // Câmera do dispositivo (padrão)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não possui suporte para acesso à câmera (getUserMedia).');
      }

      logger.info('Solicitando acesso à câmera física do dispositivo...');
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: this.config.facingMode || 'environment' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            logger.warn('Sinal da câmera física perdido.');
            if (onTrackEnded) {
              onTrackEnded();
            }
          };
        });

        this.currentStream = stream;
        return { stream, sourceType: 'CAMERA' };
      } catch (err: any) {
        logger.error('Erro ao abrir câmera física:', err);
        let errMsg = 'Não foi possível acessar a câmera do dispositivo.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errMsg = 'Permissão de acesso à câmera foi negada no seu navegador.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errMsg = 'Nenhuma câmera encontrada no dispositivo.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errMsg = 'A câmera já está sendo utilizada por outro aplicativo.';
        }
        throw new Error(errMsg);
      }
    }
  }

  /**
   * Interrompe com segurança todas as faixas ativas de mídia.
   */
  public stopCurrentStream() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Erro ao parar track de vídeo:', e);
        }
      });
      this.currentStream = null;
    }
  }

  public isStreamActive(): boolean {
    if (!this.currentStream) return false;
    return this.currentStream.getTracks().some((track) => track.readyState === 'live');
  }
}

export const videoSourceManager = new VideoSourceManager();
