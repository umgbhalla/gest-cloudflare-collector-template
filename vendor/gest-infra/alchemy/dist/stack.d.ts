import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import type { Output } from "alchemy";
import { DISCORD_GATEWAY_DO_BINDING, DISCORD_GATEWAY_DO_CLASS, LANE_DO_BINDING, LANE_DO_CLASS, RAW_BUCKET_BINDING, RAW_DB_BINDING, WORK_QUEUE_BINDING } from "./topology.js";
import { type EnabledPlatforms, type SecretBindingName } from "./secrets.js";
declare const WEBHOOK_ROUTES: {
    readonly slack: "/webhooks/slack";
    readonly github: "/webhooks/github";
    readonly discord: "/webhooks/discord";
    readonly telegram: "/webhooks/telegram";
};
type DeployString = string | Output<string> | Output<string | undefined>;
export interface GestCloudflareStackConfig {
    readonly name?: string;
    readonly main?: string;
    readonly collector?: {
        readonly id: string;
        readonly platforms?: EnabledPlatforms;
    };
    readonly extraBindings?: Record<string, unknown>;
    readonly slackOutbound?: boolean;
}
export interface CollectorDeploymentHandle {
    readonly collectorId: string;
    readonly worker: {
        readonly name: DeployString;
        readonly url: DeployString;
        readonly main: string;
    };
    readonly webhooks: Partial<Record<keyof typeof WEBHOOK_ROUTES, DeployString>>;
    readonly admin: {
        readonly discordGateway: {
            readonly url: DeployString;
            readonly authSecret: "DISCORD_GATEWAY_ADMIN_TOKEN";
        };
    };
    readonly bindings: {
        readonly RAW_BUCKET: {
            readonly binding: typeof RAW_BUCKET_BINDING;
            readonly bucketName: DeployString;
        };
        readonly RAW_DB: {
            readonly binding: typeof RAW_DB_BINDING;
            readonly databaseId: DeployString;
        };
        readonly WORK_QUEUE: {
            readonly binding: typeof WORK_QUEUE_BINDING;
            readonly queueId: DeployString;
        };
        readonly WORK_DEAD_LETTER_QUEUE: {
            readonly queueId: DeployString;
        };
        readonly LANE_DO: {
            readonly binding: typeof LANE_DO_BINDING;
            readonly className: typeof LANE_DO_CLASS;
        };
        readonly DISCORD_GATEWAY_DO: {
            readonly binding: typeof DISCORD_GATEWAY_DO_BINDING;
            readonly className: typeof DISCORD_GATEWAY_DO_CLASS;
        };
    };
    readonly secrets: {
        readonly required: readonly SecretBindingName[];
    };
}
/**
 * The real stack. `yield* Alchemy.Stack(...)` returns a CompiledStack carrying
 * the declared resources + bindings; `alchemy deploy` applies it. Resource
 * declarations are pure; the side-effecting provider create/update only runs when
 * the providers Layer is built against real credentials.
 */
export declare function defineGestCloudflareStack(config?: GestCloudflareStackConfig): Effect.Effect<Alchemy.CompiledStack<{
    collectorId: string;
    worker: {
        name: Alchemy.Output<string, never>;
        url: Alchemy.Output<string | undefined, never>;
        main: string;
    };
    webhooks: Partial<Record<"slack" | "github" | "discord" | "telegram", DeployString>>;
    admin: {
        discordGateway: {
            url: string;
            authSecret: "DISCORD_GATEWAY_ADMIN_TOKEN";
        };
    };
    bindings: {
        RAW_BUCKET: {
            binding: "RAW_BUCKET";
            bucketName: Alchemy.Output<string, never>;
        };
        RAW_DB: {
            binding: "RAW_DB";
            databaseId: Alchemy.Output<string, never>;
        };
        WORK_QUEUE: {
            binding: "WORK_QUEUE";
            queueId: Alchemy.Output<string, never>;
        };
        WORK_DEAD_LETTER_QUEUE: {
            queueId: Alchemy.Output<string, never>;
        };
        LANE_DO: {
            binding: "LANE_DO";
            className: "LaneDurableObject";
        };
        DISCORD_GATEWAY_DO: {
            binding: "DISCORD_GATEWAY_DO";
            className: "DiscordGatewayRunner";
        };
    };
    secrets: {
        required: readonly ("SLACK_SIGNING_SECRET" | "GITHUB_WEBHOOK_SECRET" | "DISCORD_PUBLIC_KEY" | "DISCORD_GATEWAY_ADMIN_TOKEN" | "TELEGRAM_SECRET_TOKEN" | "SLACK_BOT_TOKEN")[];
    };
    consumer: Alchemy.Output<string, never>;
}, any>, never, never>;
export declare const stack: Effect.Effect<Alchemy.CompiledStack<{
    collectorId: string;
    worker: {
        name: Alchemy.Output<string, never>;
        url: Alchemy.Output<string | undefined, never>;
        main: string;
    };
    webhooks: Partial<Record<"slack" | "github" | "discord" | "telegram", DeployString>>;
    admin: {
        discordGateway: {
            url: string;
            authSecret: "DISCORD_GATEWAY_ADMIN_TOKEN";
        };
    };
    bindings: {
        RAW_BUCKET: {
            binding: "RAW_BUCKET";
            bucketName: Alchemy.Output<string, never>;
        };
        RAW_DB: {
            binding: "RAW_DB";
            databaseId: Alchemy.Output<string, never>;
        };
        WORK_QUEUE: {
            binding: "WORK_QUEUE";
            queueId: Alchemy.Output<string, never>;
        };
        WORK_DEAD_LETTER_QUEUE: {
            queueId: Alchemy.Output<string, never>;
        };
        LANE_DO: {
            binding: "LANE_DO";
            className: "LaneDurableObject";
        };
        DISCORD_GATEWAY_DO: {
            binding: "DISCORD_GATEWAY_DO";
            className: "DiscordGatewayRunner";
        };
    };
    secrets: {
        required: readonly ("SLACK_SIGNING_SECRET" | "GITHUB_WEBHOOK_SECRET" | "DISCORD_PUBLIC_KEY" | "DISCORD_GATEWAY_ADMIN_TOKEN" | "TELEGRAM_SECRET_TOKEN" | "SLACK_BOT_TOKEN")[];
    };
    consumer: Alchemy.Output<string, never>;
}, any>, never, never>;
export default stack;
//# sourceMappingURL=stack.d.ts.map