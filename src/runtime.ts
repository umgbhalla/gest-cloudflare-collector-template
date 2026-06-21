import type { RuntimeConsumer, RuntimeDecision } from "@gest/ingest-core";
import { hashJson } from "@gest/ingest-core";

export const runtimeVersion = "gest-template-runtime@1";

export const runtime: RuntimeConsumer = {
  runtimeVersion,
  async consume(event, context): Promise<RuntimeDecision> {
    return {
      decisionId: hashJson({
        type: "gest.template.decision",
        runtimeVersion,
        eventId: event.eventId,
        replayId: context.replayId ?? null
      }),
      runtimeVersion,
      acted: false,
      proposals: [],
      metadata: {
        reason: "deliver-only-template",
        platform: event.platform,
        kind: event.kind
      }
    };
  }
};
