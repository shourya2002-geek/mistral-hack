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
const SYSTEM_PROMPT = `You are EditOS AI — a decisive, expert video editor. You edit videos instantly when asked. You NEVER hedge, apologize, or say you can't see the video. You make confident creative decisions like a top-tier editor.

PERSONALITY:
- You are DECISIVE. When asked to edit, you DO IT immediately with concrete operations.
- You are CREATIVE. Make smart editorial choices — pick the best pacing, add dramatic effects, create compelling cuts.
- You are CONCISE. Short punchy messages. No filler like "I'll assume" or "If this isn't right".
- You NEVER say "I don't have visual/audio data" or "Since I can't see the video". Just make the edit.
- You ALWAYS produce operations. If a user asks for an edit, you MUST return operations. Never return an empty array when editing was requested.

RESPONSE FORMAT — ALWAYS respond with valid JSON, no markdown, no code blocks:
{
  "message": "Brief confirmation of what you did",
  "operations": [ { "type": "...", "startMs": 0, "endMs": 3000, "params": {}, "description": "..." } ],
  "strategyName": "short_name"
}

AVAILABLE OPERATIONS:
- "cut" — Remove a segment. Requires startMs, endMs.
- "trim_start" — Trim from the beginning. Params: none. startMs=0, endMs=trim amount in ms.
- "trim_end" — Trim from the end. Params: none. startMs=new end point, endMs=video duration.
- "zoom" — Zoom effect. Params: { "level": 1.5 }. Requires startMs, endMs.
- "speed" — Playback speed. Params: { "factor": 2.0 }. startMs=0, endMs=video duration for whole video, or specific range.
- "caption" — Add caption. Params: { "text": "...", "style": "bold|minimal|dynamic" }. Requires startMs, endMs.
- "volume" — Adjust volume. Params: { "level": 0.5 } (0=mute, 1=normal, 2=boost). Requires startMs, endMs.
- "fade_in" — Fade in. Params: { "durationMs": 1000 }. startMs=0, endMs=durationMs.
- "fade_out" — Fade out. Params: { "durationMs": 1000 }. startMs=video_end - durationMs, endMs=video_end.
- "color_grade" — Color grading. Params: { "preset": "warm|cool|vintage|cinematic|vibrant" }. startMs, endMs.
- "music" — Background music. Params: { "mood": "upbeat|chill|dramatic|energetic", "volume": 0.3 }. startMs, endMs.
- "silence_remove" — Remove silence. Params: { "thresholdDb": -30 }. startMs=0, endMs=video duration.
- "split" — Split at a point. Requires startMs only.
- "reset_all" — Clear all edits. No params, no startMs/endMs.

CRITICAL RULES:
1. ALL times in milliseconds. 1s=1000ms. 1min=60000ms.
2. NEVER use timestamps beyond the video duration. If video is 60s (60000ms), max endMs is 60000.
3. "first 3 seconds" = startMs=0, endMs=3000. "last 5 seconds" of 60s video = startMs=55000, endMs=60000.
4. Combine multiple operations freely for complex edits.
5. For non-editing questions ("how are you?"), return empty operations array.
6. ALWAYS include BOTH startMs AND endMs for every operation (except split which only needs startMs, and reset_all which needs neither).
7. When user says "cut" they mean REMOVE that segment. "trim" means remove from start or end.
8. For "reset/clear/start over", include {"type": "reset_all"} in operations.
9. For "pick the best parts" or "highlights": keep the opening hook (first 3-5s), a strong middle section, and a punchy ending. Cut filler/transitions.
10. For "make it cinematic": combine color_grade cinematic + zoom on key moments + music dramatic + fade_in + fade_out.
11. For "make it viral" / "TikTok style": speed up slow parts (1.5x), zoom on key moments (1.3x), add bold captions, cut dead space.
12. When applying effects to the whole video, always use startMs=0 and endMs=full video duration.

DURATION TARGETING (MOST IMPORTANT!):
When the user requests a specific output duration (e.g. "30 second video", "1 minute clip", "15s short"):
- FIRST: Calculate exactly how much content to REMOVE. Formula: removeMs = videoDurationMs - targetDurationMs.
- SECOND: Create CUT operations whose durations add up to EXACTLY removeMs. Verify: sum of all (endMs - startMs) for every cut = removeMs.
- THIRD: Double-check your math before responding. The kept content MUST equal the target duration.
- Example: 208000ms video, user wants 30s (30000ms) → must cut exactly 178000ms. You could cut [0-45000] (45s) + [60000-120000] (60s) + [135000-180000] (45s) + [195000-208000] (13s) + [180000-195000] (15s) = 178000ms removed. Kept = 30000ms. ✓
- NEVER produce cuts that leave more or less than the target. Do the arithmetic.
- Prefer keeping: opening hook (first few seconds), climactic/interesting middle, strong closing.
- Space the kept segments across the video for variety — don't just keep the first N seconds.`;

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
    const videoDur = context?.videoDurationMs ?? 30000;
    systemPrompt += `\n\nThe current video is ${videoDur}ms (${(videoDur / 1000).toFixed(1)} seconds) long. ALL timestamps MUST be between 0 and ${videoDur}. NEVER exceed ${videoDur}ms.`;
    systemPrompt += `\nIMPORTANT: The final edited video MUST always be at most 30 seconds (30000ms) long. If the video is longer than 30s, you MUST include cut operations to bring it down to exactly 30s. This is a hard requirement.`;
    if (context?.platform) {
      systemPrompt += `\nTarget platform: ${context.platform}. Optimize edits for this platform's style and audience.`;
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

      // ------------------------------------------------------------------
      // Post-process: enforce exact target duration when user asks for one
      // ------------------------------------------------------------------
      const targetMatch = userMessage.match(/(\d+)\s*(?:second|sec|s\b)/i);
      if (targetMatch && result.operations.length > 0) {
        const targetMs = parseInt(targetMatch[1], 10) * 1000;
        if (targetMs > 0 && targetMs < videoDur) {
          result.operations = this.enforceTargetDuration(result.operations, videoDur, targetMs);
        }
      }

      // Always enforce 30s cap: if video is longer and no cuts bring it down, auto-trim
      if (videoDur > 30000 && result.operations.length > 0) {
        const cutMs = result.operations
          .filter((op: any) => op.type === 'cut' || op.type === 'trim_start' || op.type === 'trim_end')
          .reduce((sum: number, op: any) => sum + ((op.endMs ?? 0) - (op.startMs ?? 0)), 0);
        const remaining = videoDur - cutMs;
        if (remaining > 30000) {
          result.operations = this.enforceTargetDuration(result.operations, videoDur, 30000);
        }
      }

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

  /**
   * Adjust cut operations so the kept duration exactly equals targetMs.
   * Merges overlapping cuts, then either extends the last cut or adds a new
   * one if there's too much kept content, or shrinks the last cut if too little.
   */
  private enforceTargetDuration(
    operations: EditOperation[],
    videoDur: number,
    targetMs: number,
  ): EditOperation[] {
    // Separate cut/trim ops from other ops
    const cutOps = operations.filter(op =>
      op.type === 'cut' || op.type === 'trim_start' || op.type === 'trim_end',
    );
    const otherOps = operations.filter(op =>
      op.type !== 'cut' && op.type !== 'trim_start' && op.type !== 'trim_end',
    );

    if (cutOps.length === 0) return operations;

    // Normalize to [start, end] intervals
    const intervals: [number, number][] = cutOps.map(op => {
      const s = Math.max(0, Math.min(op.startMs ?? 0, videoDur));
      const e = Math.max(s, Math.min(op.endMs ?? videoDur, videoDur));
      return [s, e];
    });

    // Merge overlapping
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [s, e] of intervals) {
      if (merged.length > 0 && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else {
        merged.push([s, e]);
      }
    }

    // Current removed & kept
    const totalRemoved = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
    const currentKept = videoDur - totalRemoved;
    const needToRemove = videoDur - targetMs;
    const diff = needToRemove - totalRemoved; // positive = need to cut more

    if (Math.abs(diff) < 500) {
      // Close enough (within 0.5s) — rebuild cut ops from merged
    } else if (diff > 0) {
      // Need to cut MORE content — extend the last cut or add a new one
      // Find the largest kept gap and cut into it
      const kept: [number, number][] = [];
      let pos = 0;
      for (const [s, e] of merged) {
        if (pos < s) kept.push([pos, s]);
        pos = e;
      }
      if (pos < videoDur) kept.push([pos, videoDur]);

      // Sort kept segments by duration (largest first) and cut from the largest
      let remaining = diff;
      const keptSorted = [...kept].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
      for (const seg of keptSorted) {
        if (remaining <= 0) break;
        const segLen = seg[1] - seg[0];
        const cutAmount = Math.min(remaining, segLen - 1000); // keep at least 1s per segment
        if (cutAmount <= 0) continue;
        // Cut from the end of this kept segment
        merged.push([seg[1] - cutAmount, seg[1]]);
        remaining -= cutAmount;
      }
      // Re-merge
      merged.sort((a, b) => a[0] - b[0]);
      const reMerged: [number, number][] = [];
      for (const [s, e] of merged) {
        if (reMerged.length > 0 && s <= reMerged[reMerged.length - 1][1]) {
          reMerged[reMerged.length - 1][1] = Math.max(reMerged[reMerged.length - 1][1], e);
        } else {
          reMerged.push([s, e]);
        }
      }
      merged.length = 0;
      merged.push(...reMerged);
    } else {
      // Need to cut LESS — shrink the last cut
      let toRestore = -diff;
      for (let i = merged.length - 1; i >= 0 && toRestore > 0; i--) {
        const [s, e] = merged[i];
        const segLen = e - s;
        if (segLen <= toRestore) {
          merged.splice(i, 1); // remove entire cut
          toRestore -= segLen;
        } else {
          merged[i][1] = e - toRestore; // shrink the cut
          toRestore = 0;
        }
      }
    }

    // Convert merged intervals back to cut operations
    const newCutOps: EditOperation[] = merged.map(([s, e]) => ({
      type: 'cut',
      startMs: s,
      endMs: e,
      description: `Cut ${(s / 1000).toFixed(1)}s–${(e / 1000).toFixed(1)}s`,
    }));

    return [...newCutOps, ...otherOps];
  }
}
