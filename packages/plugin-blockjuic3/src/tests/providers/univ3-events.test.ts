import { beforeEach, describe, expect, it, vi } from "vitest";
import { SwapLog, SwapEvent, Univ3EventsProvider } from "../../providers";
import { ERC20Service } from "../../services";
import { Memory, IAgentRuntime } from "@ai16z/eliza";
import { base } from "viem/chains";
import { getAddress } from "viem";

describe("Univ3EventsProvider", () => {
    let provider: Univ3EventsProvider;
    let erc20Service: ERC20Service;

    const mockSwapLog: SwapLog = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        eventName: "Swap",
        topics: [
            "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" as `0x${string}`,
            ("0x000000000000000000000000" +
                "1111111111111111111111111111111111111111") as `0x${string}`,
            ("0x000000000000000000000000" +
                "2222222222222222222222222222222222222222") as `0x${string}`,
        ],
        args: {
            sender: "0x1111111111111111111111111111111111111111" as `0x${string}`,
            recipient:
                "0x2222222222222222222222222222222222222222" as `0x${string}`,
            amount0: BigInt("-1000000"),
            amount1: BigInt("2000000"),
            sqrtPriceX96: BigInt("1"),
            liquidity: BigInt("1000"),
            tick: 1,
        },
        blockHash:
            "0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234",
        blockNumber: 1234n,
        data: "0x",
        transactionHash: "0x123",
        transactionIndex: 0,
        logIndex: 0,
        removed: false,
    };

    const poolTokenMap = new Map([
        [
            getAddress(mockSwapLog.address),
            {
                token0: getAddress(
                    "0x1234567890123456789012345678901234567890"
                ),
                token1: getAddress(
                    "0x1234567890123456789012345678901234567890"
                ),
            },
        ],
    ]);

    const mockTokenInfo = new Map([
        [
            getAddress("0x1234567890123456789012345678901234567890"),
            {
                address:
                    "0x1234567890123456789012345678901234567890" as `0x${string}`,
                symbol: "TEST",
                decimals: 18,
                price: 1.5,
                name: "Test Token",
            },
        ],
    ]);

    beforeEach(() => {
        erc20Service = {
            getErc20InfoFromChain: vi.fn().mockResolvedValue(mockTokenInfo),
        } as unknown as ERC20Service;

        provider = new Univ3EventsProvider(
            erc20Service,
            "https://rpc.example.com"
        );

        vi.spyOn(provider as any, "client", "get").mockReturnValue({
            getBlockNumber: vi.fn().mockResolvedValue(BigInt(1234)),
            getLogs: vi.fn().mockResolvedValue([mockSwapLog]),
            multicall: vi.fn().mockResolvedValue([
                {
                    status: "success",
                    result: "0x1234567890123456789012345678901234567890",
                },
                {
                    status: "success",
                    result: "0x1234567890123456789012345678901234567890",
                },
            ]),
        });
    });

    it("should fetch and process swap events", async () => {
        const events = await provider["fetchSwapEvents"]();
        expect(events).toHaveLength(1);
        expect(events[0].address).toBe(mockSwapLog.address);
    });

    it("should get raw swap data", () => {
        const rawSwap = provider["getRawSwap"](mockSwapLog);
        expect(rawSwap).toEqual({
            pool: getAddress(mockSwapLog.address),
            sender: getAddress(mockSwapLog.args.sender),
            recipient: getAddress(mockSwapLog.args.recipient),
            ...mockSwapLog.args,
        });
    });

    it("should get pool tokens", async () => {
        const rawSwaps = [provider["getRawSwap"](mockSwapLog)];
        const { poolTokenSet } = await provider["getPoolTokens"](rawSwaps);

        expect(poolTokenSet.size).toBe(1);
        expect(
            poolTokenSet.has(
                getAddress("0x1234567890123456789012345678901234567890")
            )
        ).toBe(true);
    });

    it("should enrich events with token info", async () => {
        const rawSwaps = [provider["getRawSwap"](mockSwapLog)];
        const enrichedEvents = await provider["enrichEventsWithTokenInfo"](
            rawSwaps,
            poolTokenMap,
            mockTokenInfo
        );

        expect(enrichedEvents).toHaveLength(1);
        expect(enrichedEvents[0].inputToken).toBeDefined();
        expect(enrichedEvents[0].outputToken).toBeDefined();
        expect(enrichedEvents[0].parsedAmount0USD).toBeDefined();
        expect(enrichedEvents[0].parsedAmount1USD).toBeDefined();
    });

    it("should format output correctly", () => {
        const mockSwaps = [
            {
                inputToken: { symbol: "TOKEN1", decimals: 18 },
                outputToken: { symbol: "TOKEN2", decimals: 18 },
                parsedAmount0: "1.0",
                parsedAmount1: "2.0",
                parsedAmount0USD: 1.5,
                parsedAmount1USD: 3.0,
            },
        ] as SwapEvent[];

        const output = provider["formatOutput"](
            mockSwaps,
            BigInt(1234),
            "TestBot"
        );

        expect(output).toContain("TestBot is aware of 1 swaps");
        expect(output).toContain("TOKEN1 -> TOKEN2");
        expect(output).toContain("1.0 TOKEN1");
    });

    it("should get provider data", async () => {
        const runtime = {
            character: {
                name: "TestBot",
            },
        } as IAgentRuntime;

        const result = await provider.get(runtime, {} as Memory);

        expect(result).toContain("TestBot is aware of");
        expect(result).toContain(base.name);
    });
});
