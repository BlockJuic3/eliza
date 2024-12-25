import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const baseRpcUrl =
    "https://api-base-mainnet-archive.dwellir.com/d0c11bc1-a53d-4ec0-bd33-0cc796ace5e3";

export const chainClients = {
    [base.id]: createPublicClient({
        chain: base,
        transport: http(baseRpcUrl),
    }),
} as const;
