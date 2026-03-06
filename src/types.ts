/**
 * Minimal plugin context shape (matches OpenCode plugin API).
 * Full types from @opencode-ai/plugin when available.
 */
export type PluginContext = {
  client: {
    session: {
      create: (args: {
        body: { title?: string };
      }) => Promise<{ data?: { id?: string }; id?: string }>;
      prompt: (args: {
        path: { id: string };
        body: {
          agent?: string;
          parts: Array<{ type: string; text: string }>;
        };
      }) => Promise<unknown>;
      messages: (args: {
        path: { id: string };
      }) => Promise<{
        data?: Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>;
      }>;
    };
    event: {
      subscribe: () => Promise<{
        stream: {
          on: (event: string, fn: (chunk: unknown) => void) => void;
          off?: (event: string, fn: (chunk: unknown) => void) => void;
        };
      }>;
    };
    app?: {
      log?: (args: {
        body: {
          service: string;
          level: string;
          message: string;
          extra?: Record<string, unknown>;
        };
      }) => Promise<unknown>;
    };
    tui?: {
      showToast?: (args: {
        body: { message: string; variant?: string };
      }) => Promise<unknown>;
    };
  };
  directory: string;
  $?: unknown;
  project?: unknown;
}
