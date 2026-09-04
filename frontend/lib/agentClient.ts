// frontend/lib/agentClient.ts

// ============================================
// TYPES - Matches backend events exactly
// ============================================

interface ToolCall {
  id: string;
  name: string;
  label: string;
  status: 'running' | 'done';
  summary: string | null;
  durationMs: number | null;
}

interface NavigationOffer {
  page: string;
  section: string;
  label: string;
  reason: string;
}

interface Provenance {
  computedAt: string;
  snapshotAt: string;
  source: 'live' | 'graph';
  inputs: Record<string, unknown>;
  graphLoadedAt?: string;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  providerCalls: number;
  toolIterations: number;
}

export type AgentEvent =
  | { type: 'ready'; conversationId: string; snapshotAt: string }
  | { type: 'token'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_done'; id: string; name: string; summary: string; durationMs: number }
  | { type: 'warning'; code: string; message: string }
  | { type: 'done'; text: string; toolTrace: ToolCall[]; navigationOffer: NavigationOffer | null; provenance: Provenance; usage: Usage; validatorStatus: 'clean' | 'repaired' | 'flagged' }
  | { type: 'error'; code: string; message: string; retryable: boolean };

// ============================================
// SSE PARSER - Handles heartbeats and partial events
// ============================================

function parseSSEEvents(buffer: string): { events: { data: string }[]; remaining: string } {
  const events: { data: string }[] = [];
  const lines = buffer.split('\n');
  
  let currentEvent: { data: string } | null = null;
  let remaining = '';

  for (const line of lines) {
    // Heartbeat (: comment) - ignore
    if (line.startsWith(':')) {
      continue;
    }

    // Data line
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (currentEvent) {
        currentEvent.data += '\n' + data;
      } else {
        currentEvent = { data };
      }
      continue;
    }

    // Empty line ends the event
    if (line === '' && currentEvent) {
      events.push(currentEvent);
      currentEvent = null;
    }
  }

  // Keep partial event for next chunk
  if (currentEvent) {
    remaining = `data: ${currentEvent.data}\n\n`;
  }

  return { events, remaining };
}

// ============================================
// MAIN STREAM FUNCTION
// ============================================

/**
 * Stream a conversation turn from the agent
 * 
 * Returns an async generator that yields typed events
 * 
 * @param message - User's message
 * @param token - Authentication token (from AuthContext)
 * @param conversationId - Existing conversation ID, or undefined for new
 * @param signal - AbortSignal for cancellation
 */
export async function* streamAgent(
  message: string,
  token: string,
  conversationId?: string,
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  // Validate token - matches authHeader() pattern from api.ts
  if (!token) {
    throw new Error('Not authenticated - no token provided');
  }

  // Build the request - matches api.ts pattern
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      conversationId: conversationId ?? null,
    }),
    signal,
  });

  // Handle non-200 responses
  if (!response.ok) {
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`Rate limited: ${data.message || 'Too many requests'}`);
    }
    if (response.status === 401) {
      throw new Error('Unauthorized - please log in again');
    }
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  // Get the response body stream
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body - server did not return a stream');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      // End of stream
      if (done) break;

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Parse complete events from the buffer
      const result = parseSSEEvents(buffer);
      
      // Yield each complete event
      for (const event of result.events) {
        try {
          yield JSON.parse(event.data);
        } catch (parseError) {
          // Log parse error but continue - don't crash the stream
          console.warn('Failed to parse SSE event:', event.data, parseError);
        }
      }

      // Keep any partial event for the next chunk
      buffer = result.remaining;
    }
  } catch (error) {
    // Check if this was an intentional abort
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      // Normal cancellation - don't treat as error
      return;
    }
    // Re-throw other errors
    throw error;
  } finally {
    // Release the reader lock
    try {
      reader.releaseLock();
    } catch {
      // Ignore errors on release - stream is already closed
    }
  }
}