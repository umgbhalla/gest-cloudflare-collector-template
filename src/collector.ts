import { defineCollector, defineConsumer } from "@gest/infra";

import { runtime } from "./runtime.js";

export const collector = defineCollector({
  id: "gest-cloudflare-collector",
  platforms: {
    slack: true,
    github: true,
    discord: { webhooks: true, gateway: false },
    telegram: true
  },
  consumer: {
    consumers: {
      main: defineConsumer("main", runtime)
    },
    defaultKind: "main"
  },
  selector: () => "main"
});
