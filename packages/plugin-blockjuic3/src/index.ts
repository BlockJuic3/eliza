import { Plugin } from "@ai16z/eliza";
import * as providers from "./providers/index.ts";

const dummyAction = {
    similes: ["analyze block", "inspect block", "examine block"],
    description:
        "Analyze an EVM block for interesting transactions and patterns",
    examples: [
        [
            {
                user: "user",
                content: { text: "What happened in block 12345?" },
            },
            {
                user: "assistant",
                content: { text: "Let me analyze that block for you..." },
            },
        ],
    ],
    handler: async (runtime, message) => {
        return "Block analysis coming soon...";
    },
    name: "analyzeBlock",
    validate: async () => true,
};

export const blockjuic3Plugin: Plugin = {
    name: "blockjuic3",
    description: "Squeezing the fuck out of EVM blocks",
    providers: [providers.erc20TransfersProvider],
    actions: [dummyAction],
};

export default blockjuic3Plugin;
