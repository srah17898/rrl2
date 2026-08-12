# Documentação Técnica — Integração Gemini Live API (Farm Fishing AI)

## 1. Visão Geral da Arquitetura
A integração da **Gemini Live API** no Farm Fishing AI permite o processamento contínuo em tempo real da câmera do dispositivo para identificação dos itens sorteados na Roda Gigante, estabilização anti-falsos positivos e gravação automática no Supabase.

```
[ Câmera Física (Navegador) ]
            │ (Capture & JPEG Base64 - Efêmero)
            ▼
[ Client LiveService / useLiveSession ]
            │ (HTTP REST / Streaming / API Routes)
            ▼
[ Backend Express (server.ts / liveRouter) ]
            │ (GoogleGenAI SDK - @google/genai)
            ▼
[ Gemini Live API (gemini-3.6-flash / Live Engine) ]
            │ (JSON Estrito: objetoDetectado + confianca)
            ▼
[ Estabilizador & Filtro Anti-Falsos Positivos ]
            │ (3 Confirmações Consecutivas @ ≥90% Confiança)
            ▼
[ Supabase Database (Tabela 'rodadas') ]
            │ (Broadcast & Eventos de Atualização)
            ▼
[ Dashboard + Estatísticas + IA + Auditoria ]
```

---

## 2. Fluxo Completo dos Dados

1. **Captura do Frame:**
   - A `LiveCamera` captura quadros do elemento `<video>` em um canvas offscreen comprimido (Max 640px, JPEG 0.75 quality).
   - O frame é descartável e armazenado estritamente em memória volátil.

2. **Transmissão para o Backend:**
   - O frame é enviado via `POST /api/live/frame` com o payload de Base64 e MIME type.

3. **Inspecção pela Gemini Live API:**
   - O `BackendLiveService` invoca a Gemini Live API usando o SDK oficial `@google/genai`.
   - O prompt restringe os resultados estritamente aos 8 símbolos permitidos (`sorvete`, `boia`, `balao`, `soco`, `tedy`, `princesa`, `camera`, `coroa`).

4. **Estabilização Anti-Falsos Positivos:**
   - Exige **3 confirmações consecutivas** do mesmo símbolo com **confiança ≥ 90%**.
   - Se o símbolo for o mesmo da última rodada confirmada, é ignorado para **evitar duplicidades**.
   - Se um novo símbolo atingir 3 confirmações consecutivas, é marcado como **Confirmado**.

5. **Gravação Automática no Supabase:**
   - O `resultadoService.registrarResultadoAutomaticamente()` insere a nova rodada no banco de dados.
   - O evento `RESULT_CONFIRMED` é emitido para atualizar a interface em tempo real.

---

## 3. Principais Componentes e Responsabilidades

| Componente / Arquivo | Responsabilidade |
| :--- | :--- |
| `src/components/LiveCamera.tsx` | Viewport de câmera do navegador, transmissão contínua de frames, controles de FPS e console de logs. |
| `src/components/LiveDevMetricsPanel.tsx` | Painel técnico de telemetria em tempo real (dev mode): FPS, latência, descarte, memória e reconexões. |
| `src/components/LiveStatusIndicator.tsx` | Indicador visual de status da sessão Live (conectado, reconectando, frames enviados). |
| `src/hooks/useLiveSession.ts` | Hook React que conecta a UI ao serviço `LiveService` e gerencia estados reativos. |
| `src/services/liveService.ts` | Gerenciador do lado do cliente para controle de sessão, envio efêmero e polling de saúde. |
| `src/services/backendLiveService.ts` | Serviço backend autoritativo com SDK `@google/genai`, validação estrita, métricas e gravação no Supabase. |
| `src/routes/live.ts` | Endpoints REST para `/api/live/iniciar`, `/api/live/encerrar`, `/api/live/status`, `/api/live/frame`. |
| `src/utils/logger.ts` | Utilitário de logging padronizado com níveis (`DEBUG`, `INFO`, `WARN`, `ERROR`). |

---

## 4. Ciclo de Vida da Sessão Live

### Iniciar uma Sessão
1. O usuário clica em **"▶ Iniciar Live"** na UI ou invoca `liveService.iniciarSessao({ fps: 1 })`.
2. O cliente solicita permissão de câmera ao navegador (`MediaDevices.getUserMedia`).
3. O client chama `POST /api/live/iniciar`. O servidor valida que apenas **1 sessão ativa por usuário** exista.
4. É executado o teste de handshake com a Gemini Live API.
5. O estado transiciona para `conectado` e o timer de envio de frames começa.

### Encerrar uma Sessão
1. O usuário clica em **"⏹ Encerrar Live"** ou invoca `liveService.encerrarSessao()`.
2. O intervalo de envio de quadros é interrompido (`clearInterval`).
3. As faixas da câmera física são paradas (`track.stop()`).
4. O servidor recebe `POST /api/live/encerrar`, calcula a duração da sessão e remove-a do mapa ativo.

---

## 5. Política de Reconexão e Resiliência

- **Queda de Internet ou Timeout:** Se uma requisição de frame falhar, o `liveService` tenta reconectar automaticamente com backoff exponencial.
- **Backgrounding (Troca de Aba / Celular em Espera):** O evento `visibilitychange` detecta quando a aba entra em segundo plano e pausa temporariamente o envio de quadros para poupar bateria e recursos. Ao retornar ao primeiro plano, a saúde da sessão é verificada e a reconexão é executada automaticamente.
- **Sessões Únicas:** Se uma nova sessão for iniciada para o mesmo `usuarioId`, a anterior é encerrada imediatamente pelo servidor sem vazamentos de memória.

---

## 6. Diagnóstico e Resolução de Problemas (Troubleshooting)

### Erro: "A chave GEMINI_API_KEY não está configurada"
- **Causa:** Variável de ambiente ausente no servidor.
- **Solução:** Configurar a variável `GEMINI_API_KEY` nas configurações de ambiente ou `.env`.

### Erro: "Câmera indisponível ou permissão negada"
- **Causa:** O navegador bloqueou o acesso à câmera física ou o dispositivo não possui câmera.
- **Solução:** Garantir que o site tenha permissão de Câmera habilitada nas configurações do navegador e que o contexto seja HTTPS ou localhost.

### Erro: "Frames ignorados ou descartados"
- **Causa:** O item detectado não pertence à lista de 8 símbolos permitidos, ou a confiança foi inferior a 90%, ou o item é idêntico à rodada anterior confirmada.
- **Solução:** Verificar as condições de iluminação da câmera ou abrir o **Painel Técnico de Monitoramento** para checar os contadores de descarte.

---

## 7. Diretrizes de Segurança e Privacidade
- **Nenhum frame armazenado:** Todos os quadros JPEG transmitidos são processados na memória RAM de forma efêmera e destruídos em seguida.
- **Segurança de API Keys:** A chave da Gemini API permanece estritamente no servidor (`process.env.GEMINI_API_KEY`) e jamais é exposta ao cliente.
