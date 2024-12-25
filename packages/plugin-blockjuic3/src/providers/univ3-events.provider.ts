import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";
import { ERC20Service } from "../services/erc20.service";
import { ERC20Info, ERC20Token } from "../common/types";
import uniswapV3PoolAbi from "../assets/uni-v3-pool.abi.json";
import {
    createPublicClient,
    getAddress,
    GetLogsReturnType,
    http,
    parseAbiItem,
    Address,
    formatUnits,
} from "viem";
import { base } from "viem/chains";

const swapEventAbi = parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
);

export interface RawUniV3Swap {
    pool: Address;
    sender: Address;
    recipient: Address;
    amount0: bigint;
    amount1: bigint;
    sqrtPriceX96: bigint;
    liquidity: bigint;
    tick: number;
}

export interface SwapEvent extends RawUniV3Swap {
    inputToken: ERC20Token;
    outputToken: ERC20Token;
    parsedAmount0: string;
    parsedAmount1: string;
    parsedAmount0USD: number;
    parsedAmount1USD: number;
}

export type SwapLog = GetLogsReturnType<
    typeof swapEventAbi,
    [typeof swapEventAbi],
    undefined,
    "latest",
    "latest"
>[number];

type PoolTokenMap = Map<Address, { token0?: Address; token1?: Address }>;
type PoolTokenSet = Set<Address>;

interface GetPoolTokensReturn {
    poolTokenMap: PoolTokenMap;
    poolTokenSet: PoolTokenSet;
}

export type SwapArgs = SwapLog["args"];

export class Univ3EventsProvider implements Provider {
    constructor(
        protected readonly erc20Service: ERC20Service,
        protected readonly rpcUrl: string
    ) {}

    public async get(runtime: IAgentRuntime, _memory: Memory, _state?: State) {
        const [blockNumber, swaps] = await Promise.all([
            this.client.getBlockNumber(),
            this.getSwapEvents(),
        ]);

        if (swaps.length === 0) {
            return "No swaps found";
        }

        return this.formatOutput(swaps, blockNumber, runtime.character.name);
    }

    protected async getSwapEvents(): Promise<SwapEvent[]> {
        const events = await this.fetchSwapEvents();
        const rawSwaps = events.map((event) => this.getRawSwap(event));
        if (rawSwaps.length === 0) {
            return [];
        }
        const { poolTokenMap, poolTokenSet } =
            await this.getPoolTokens(rawSwaps);
        const tokenInfo = await this.erc20Service.getErc20InfoFromChain(
            base,
            poolTokenSet
        );
        const enrichedEvents = await this.enrichEventsWithTokenInfo(
            rawSwaps,
            poolTokenMap,
            tokenInfo
        );
        return enrichedEvents;
    }

    protected async fetchSwapEvents(): Promise<SwapLog[]> {
        const logs = await this.client.getLogs({
            event: swapEventAbi,
            fromBlock: "latest",
            toBlock: "latest",
        });
        return logs;
    }

    protected async getPoolTokens(
        rawSwaps: RawUniV3Swap[]
    ): Promise<GetPoolTokensReturn> {
        const poolTokenSet: PoolTokenSet = new Set();
        const poolTokenMap: PoolTokenMap = new Map();
        const contracts = rawSwaps.flatMap((swap) => [
            {
                address: swap.pool,
                abi: uniswapV3PoolAbi,
                functionName: "token0",
            },
            {
                address: swap.pool,
                abi: uniswapV3PoolAbi,
                functionName: "token1",
            },
        ]);

        // @ts-expect-error Type instantiation is excessively deep and possibly infinite.
        const results = await this.client.multicall({ contracts });
        for (let i = 0; i < results.length; i += 2) {
            const [token0Call] = contracts.slice(i, i + 2);
            const [token0Result, token1Result] = results.slice(i, i + 2);
            const poolAddress = token0Call.address;
            const poolData = poolTokenMap.get(poolAddress) ?? {};

            if (token0Result.status === "success") {
                poolData.token0 = getAddress(token0Result.result as string);
                poolTokenSet.add(poolData.token0);
            }

            if (token1Result.status === "success") {
                poolData.token1 = getAddress(token1Result.result as string);
                poolTokenSet.add(poolData.token1);
            }

            poolTokenMap.set(poolAddress, poolData);
        }

        return { poolTokenMap, poolTokenSet };
    }

    protected getRawSwap(swap: SwapLog): RawUniV3Swap {
        return {
            ...swap.args,
            pool: getAddress(swap.address),
            sender: getAddress(swap.args.sender),
            recipient: getAddress(swap.args.recipient),
        };
    }

    private get client() {
        return createPublicClient({
            chain: base,
            transport: http(this.rpcUrl),
        });
    }

    protected async enrichEventsWithTokenInfo(
        rawSwaps: RawUniV3Swap[],
        poolTokenMaps: PoolTokenMap,
        tokenInfo: ERC20Info
    ): Promise<SwapEvent[]> {
        const enrichedEvents = rawSwaps
            .map((swap) => {
                const { amount0 } = swap;
                const { token0, token1 } = poolTokenMaps.get(swap.pool);
                const [token0Info, token1Info] = [
                    tokenInfo.get(token0),
                    tokenInfo.get(token1),
                ];
                const parsedAmount0 = formatUnits(
                    swap.amount0,
                    token0Info.decimals
                );
                const parsedAmount1 = formatUnits(
                    swap.amount1,
                    token1Info.decimals
                );

                return {
                    ...swap,
                    inputToken: amount0 < 0 ? token0Info : token1Info,
                    outputToken: amount0 > 0 ? token0Info : token1Info,
                    parsedAmount0,
                    parsedAmount1,
                    parsedAmount0USD: Number(parsedAmount0) * token0Info.price,
                    parsedAmount1USD: Number(parsedAmount1) * token1Info.price,
                };
            })
            .filter((event) => event !== null);

        return enrichedEvents;
    }

    protected formatOutput(
        swaps: SwapEvent[],
        blockNumber: bigint,
        characterName: string
    ) {
        return `
            ${characterName} is aware of ${swaps.length} swaps in the block ${blockNumber} on chain ${base.name}.
            Here are the details:
            ${swaps
                .map(
                    (swap) => `
                - ${swap.inputToken.symbol} -> ${swap.outputToken.symbol}
                - Amount: ${swap.parsedAmount0} ${swap.inputToken.symbol}
                - Amount: ${swap.parsedAmount1} ${swap.outputToken.symbol}
                - Price: ${swap.parsedAmount0USD} USD
                - Price: ${swap.parsedAmount1USD} USD
            `
                )
                .join(" | ")}
        `;
    }
}
