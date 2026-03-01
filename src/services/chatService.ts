// ============================================================================
// CHAT SERVICE — Mistral-powered conversational video editing
// ============================================================================
// Takes user messages (text or voice transcript), sends to Mistral with a
// video-editing system prompt, and returns structured responses that contain
// both a conversational reply AND concrete editing operations.
// ============================================================================

import { MistralClient } from '../core/agents/mistralClient.js';
import type { MistralMessage } from '../core/agents/mistralClient.js';
import { appConfig } from '../config/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface EditOperation {
  type: string;
  startMs?: number;
  endMs?: number;
  params?: Record<string, any>;
  description?: string;
}

export interface ChatResponse {
  message: string;
  operations: EditOperation[];
  strategyName?: string;
}

// ---------------------------------------------------------------------------
// System prompt — teaches Mistral how to be a video editor
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are VIRCUT AI, a professional video editing assistant. You help creators edit their videos through natural conversation.

When a user asks you to make an edit, you MUST respond with valid JSON in this exact format:
{
  "message": "Your conversational response explaining what you did",
  "operations": [
    {
      "type": "operation_type",
      "startMs": 0,
      "endMs": 3000,
      "params": {},
      "description": "Human-readable description"
    }
  ],
  "strategyName": "Short name for this edit"
}

AVAILABLE OPERATION TYPES:
- "cut" — Remove a segment from the video. Params: none. Requires startMs and endMs.
- "trim_start" — Trim from the beginning. Params: none. Requires endMs (amount to trim).
- "trim_end" — Trim from the end. Params: none. Requires startMs (new end point).
- "zoom" — Apply zoom effect. Params: { "level": 1.5 } (zoom multiplier). Requires startMs, endMs.
- "speed" — Change playback speed. Params: { "factor": 2.0 } (speed multiplier). Requires startMs, endMs.
- "caption" — Add a caption/subtitle. Params: { "text": "Caption text", "style": "bold|minimal|dynamic" }. Requires startMs, endMs.
- "volume" — Adjust audio volume. Params: { "level": 0.5 } (0=mute, 1=normal, 2=boost). Requires startMs, endMs.
- "fade_in" — Fade in from black. Params: { "durationMs": 1000 }. startMs=0.
- "fade_out" — Fade out to black. Params: { "durationMs": 1000 }. endMs=video end.
- "color_grade" — Apply color grading. Params: { "preset": "warm|cool|vintage|cinematic|vibrant" }. startMs, endMs for range.
- "music" — Add background music. Params: { "mood": "upbeat|chill|dramatic|energetic", "volume": 0.3 }. startMs, endMs.
- "silence_remove" — Remove silent parts. Params: { "thresholdDb": -30 }. No startMs/endMs needed (applies to full video).
- "split" — Split the video at a point. Params: none. Requires startMs only.

RULES:
1. Times are in milliseconds. 1 second = 1000ms, 1 minute = 60000ms.
2. If the user says "first 3 seconds", that means startMs=0, endMs=3000.
3. If the user says "last 5 seconds" and video is 60s, that means startMs=55000, endMs=60000.
4. You can combine multiple operations in one response.
5. If the user asks a question that ISN'T about editing (like "how are you?"), return an empty operations array.
6. Always be helpful and concise.
7. If you're unsure about exact timing, ask the user to clarify.
8. The default video duration is 60 seconds (60000ms) unless told otherwise.
9. ALWAYS respond with valid JSON. No markdown, no code blocks, just pure JSON.
10. When the user says "cut", they mean REMOVE that segment. When they say "trim", they mean remove from the start or end.`;

// ---------------------------------------------------------------------------
// ChatService
// ---------------------------------------------------------------------------
export class ChatService {
  private client: MistralClient;
  private conversations: Map<string, ChatMessage[]> = new Map();

  constructor(client?: MistralClient) {
    this.client = client ?? new MistralClient(appConfig.mistral.apiKey, appConfig.mistral.baseUrl);
  }

  /**
   * Send a chat message and get a response with editing operations.
   */
  async chat(
    conversationId: string,
    userMessage: string,
    context?: { videoDurationMs?: number; platform?: string },
  ): Promise<ChatResponse> {
    // Get or create conversation history
    let history = this.conversations.get(conversationId);
    if (!history) {
      history = [];
      this.conversations.set(conversationId, history);
    }

    // Add context to system prompt if available
    let systemPrompt = SYSTEM_PROMPT;
    if (context?.videoDurationMs) {
      systemPrompt += `\n\nThe current video is ${context.videoDurationMs}ms (${(context.videoDurationMs / 1000).toFixed(1)} seconds) long.`;
    }
    if (context?.platform) {
      systemPrompt += `\nTarget platform: ${context.platform}.`;
    }

    // Add user message to history
    history.push({ role: 'user', content: userMessage });

    // Build messages for Mistral API
    const messages: MistralMessage[] = [
      { role: 'system', content: systemPrompt },
      // Include last 20 messages of history for context
      ...history.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    try {
      const response = await this.client.chatCompletion({
        model: appConfig.mistral.models.intent,  // ministral-8b-latest
        messages,
        temperature: 0.3,
        maxTokens: 2048,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error('Empty response from Mistral');
      }

      // Parse JSON response
      let parsed: ChatResponse;
      try {
        parsed = JSON.parse(content);
      } catch {
        // If Mistral didn't return valid JSON, treat as plain text
        parsed = {
          message: content,
          operations: [],
        };
      }

      // Ensure structure
      const result: ChatResponse = {
        message: parsed.message ?? content,
        operations: Array.isArray(parsed.operations) ? parsed.operations : [],
        strategyName: parsed.strategyName,
      };

      // Add assistant response to history
      history.push({ role: 'assistant', content: result.message });

      // Keep history bounded
      if (history.length > 50) {
        history.splice(0, history.length - 40);
      }

      return result;
    } catch (error: any) {
      // If Mistral API fails (e.g. no key), fall back to a helpful error
      const fallbackMsg = `I couldn't process that right now: ${error.message}. Please check that MISTRAL_API_KEY is set correctly.`;
      history.push({ role: 'assistant', content: fallbackMsg });
      return {
        message: fallbackMsg,
        operations: [],
      };
    }
  }

  /**
   * Clear conversation history.
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}
