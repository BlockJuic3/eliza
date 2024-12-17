import { AgentRuntime as IAgentRuntime } from "@ai16z/eliza";
import type { Memory, Provider, State } from "@ai16z/eliza";
import {
    Address,
    Chain,
    createPublicClient,
    decodeEventLog,
    erc20Abi,
    formatUnits,
    http,
    Log,
    parseAbiItem,
} from "viem";
import { base } from "viem/chains";
import { z } from "zod";

export interface ERC20Token {
    address: Address;
    symbol: string;
    decimals: number;
    price: number;
}

export interface RawERC20Transfer {
    from: Address;
    to: Address;
    amount: bigint;
    token: Address;
}

export interface ERC20Transfer extends Omit<RawERC20Transfer, "token"> {
    parsedAmount: string;
    amountUSD: number;
    token: ERC20Token;
}

export const erc20TransfersProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        return getTransfersEvents(runtime.character.name);
    },
};

export const getTransfersEvents = async (characterName: string) => {
    const logs = await fetchRawTransfersFromLatestBlock();
    const transfers = logs.map((log) => decodeTransfer(log)).filter(Boolean);
    const blockNumber = await getLatestBlockNumber();
    const addresses = aggregateTokenAddresses(transfers);
    // TODO: programatically get the chain
    let tokenData: Map<Address, ERC20Token>;
    try {
        tokenData = await getTokenInfoFromDefillama(
            Array.from(addresses),
            base
        );
    } catch (error) {
        console.error(error);
        tokenData = new Map();
    }
    const enrichedTransfers = enrichTransfersWithTokenInfo(
        transfers,
        tokenData
    );
    return formatOutput(enrichedTransfers, blockNumber, characterName);
};

const RPC_URL = process.env.BASE_RPC_URL;

const getClient = () => {
    return createPublicClient({
        chain: base,
        transport: http(),
    });
};

const client = getClient();

export type TransferLog = Awaited<
    ReturnType<typeof fetchRawTransfersFromLatestBlock>
>[number];

export const getLatestBlockNumber = async () => {
    const block = await client.getBlockNumber();
    return block;
};

export const fetchRawTransfersFromLatestBlock = async () => {
    const logs = await client.getLogs({
        event: parseAbiItem(
            "event Transfer(address, address indexed to, uint256 value)"
        ),
        fromBlock: "latest",
        toBlock: "latest",
    });

    return logs;
};

export const decodeTransfer = (log: TransferLog): RawERC20Transfer | null => {
    if (log.data === "0x") {
        return null;
    }

    const {
        // @ts-expect-error TODO: fix this
        args: { from, to, value },
    } = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
    });

    return {
        from,
        to,
        amount: value,
        token: log.address,
    };
};

export const aggregateTokenAddresses = (
    transfers: RawERC20Transfer[]
): Set<Address> => new Set(transfers.map((transfer) => transfer.token));

export const enrichTransfersWithTokenInfo = (
    transfers: RawERC20Transfer[],
    tokenData: Map<Address, ERC20Token>
): ERC20Transfer[] => {
    return transfers
        .map((transfer) => {
            const token = tokenData.get(transfer.token);

            if (!token) {
                return null;
            }

            const parsedAmount = formatUnits(
                transfer.amount,
                token?.decimals ?? 18
            );

            return {
                ...transfer,
                token,
                parsedAmount,
                amountUSD: Number(parsedAmount) * token?.price ?? 0,
            };
        })
        .filter(Boolean);
};

const DefillamaCoinSchema = z.object({
    decimals: z.number(),
    symbol: z.string(),
    price: z.number().optional(),
    timestamp: z.number().optional(),
    confidence: z.number(),
});

const DefillamaResponseSchema = z.object({
    coins: z.record(z.string(), DefillamaCoinSchema.optional()),
});

export const getTokenInfoFromDefillama = async (
    tokenAddress: Address[],
    chain: Chain
): Promise<Map<Address, ERC20Token>> => {
    try {
        const url = "https://coins.llama.fi/prices/current/";
        const fullUrl =
            url +
            tokenAddress
                .map((address) => `${chain.name.toLowerCase()}:${address}`)
                .join(",");

        const response = await fetch(fullUrl);
        const rawData = await response.json();

        // Validate the response
        const data = DefillamaResponseSchema.parse(rawData);

        const tokenMap = new Map<Address, ERC20Token | undefined>();
        Object.entries(data.coins).forEach(([key, value]) => {
            const address = key.split(":")[1] as Address;
            tokenMap.set(address, {
                address,
                symbol: value.symbol,
                decimals: value.decimals,
                price: value.price,
            });
        });

        return tokenMap;
    } catch (error) {
        console.error("Error fetching token info from Defillama:", error);
        return new Map<Address, ERC20Token>();
    }
};

export const formatOutput = (
    transfers: ERC20Transfer[],
    blockNumber: bigint,
    agentName: string
) => {
    return "{{agentName}} knows the following onchain transfers for block on base {{blockNumber}}: {{transfers}}"
        .replace("{{blockNumber}}", blockNumber.toString())
        .replace("{{agentName}}", agentName)
        .replace(
            "{{transfers}}",
            transfers
                .map(
                    (transfer) =>
                        `${transfer.parsedAmount} ${transfer.token.symbol} transferred from ${transfer.from} to ${transfer.to} for a total amount USD of ${transfer.amountUSD}`
                )
                .join(" | ")
        );
};

// export const batchGetTokenInfo = async (
//     tokenAddresses: Set<Address>
// ): Promise<Map<Address, ERC20Token>> => {
//     const tokenMap = new Map<Address, ERC20Token>();

//     const tokenMulticalls = [...tokenAddresses].map(async (address) => {
//         const [nameCall, symbolCall, decimalsCall] = await client.multicall({
//             // @ts-expect-error TODO: fix this
//             contracts: [
//                 {
//                     address,
//                     abi: erc20Abi,
//                     functionName: "name",
//                 },
//                 {
//                     address,
//                     abi: erc20Abi,
//                     functionName: "symbol",
//                 },
//                 {
//                     address,
//                     abi: erc20Abi,
//                     functionName: "decimals",
//                 },
//             ],
//         });

//         tokenMap.set(address, {
//             address,
//             symbol: symbolCall.result as string,
//             decimals: decimalsCall.result as number,
//         });
//     });

//     await Promise.all(tokenMulticalls);

//     return tokenMap;
// };
