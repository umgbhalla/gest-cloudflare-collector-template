import { defineGestCloudflareStack } from "@gest/infra/alchemy";
import { fileURLToPath } from "node:url";

export default defineGestCloudflareStack({
  name: "gest-cloudflare-collector",
  collector: {
    id: "gest-cloudflare-collector",
    platforms: {
      slack: true,
      github: true,
      discord: { webhooks: true, gateway: false },
      telegram: true
    }
  },
  main: fileURLToPath(new URL("../dist/worker.js", import.meta.url))
});
