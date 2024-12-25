import { describe, it, expect, beforeEach } from "vitest";
import {
    ERC20Token,
    RawERC20Transfer,
    TransferLog,
    ERC20EventsProvider,
} from "../../providers";
import { Address } from "viem";
import { DefillamaService } from "../../services";

class TestableERC20EventsProvider extends ERC20EventsProvider {
    public exposedDecodeTransfer(log: TransferLog) {
        return this.decodeTransfer(log);
    }

    public exposedAggregateTokenAddresses(transfers: RawERC20Transfer[]) {
        return this.aggregateTokenAddresses(transfers);
    }

    public exposedEnrichTransfersWithTokenInfo(
        transfers: RawERC20Transfer[],
        tokenData: Map<Address, ERC20Token>
    ) {
        return this.enrichTransfersWithTokenInfo(transfers, tokenData);
    }

    public exposedFetchRawTransfersFromLatestBlock() {
        return this.fetchRawTransfersFromLatestBlock();
    }
}

describe("ERC20EventsProvider", () => {
    let provider: TestableERC20EventsProvider;

    beforeEach(() => {
        provider = new TestableERC20EventsProvider(
            new DefillamaService(),
            "https://rpc.ankr.com/eth_sepolia"
        );
    });

    it("should fetch raw transfers from latest block", async () => {
        const logs = await provider.exposedFetchRawTransfersFromLatestBlock();
        expect(logs).toBeDefined();
        expect(Array.isArray(logs)).toBe(true);
        expect(logs[0]).toMatchObject({
            eventName: "Transfer",
            args: expect.any(Array),
            address: expect.any(String),
            topics: expect.any(Array),
            data: expect.any(String),
            blockHash: expect.any(String),
            blockNumber: expect.any(BigInt),
            transactionHash: expect.any(String),
            transactionIndex: expect.any(Number),
            logIndex: expect.any(Number),
            removed: expect.any(Boolean),
        });
    });

    it("should decode transfer log", async () => {
        const mockedLog: TransferLog = {
            eventName: "Transfer",
            args: [
                "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
                "0x566e8b2606cf26335bf476e4476e5f634add829c",
                BigInt(1000000000000000000),
            ],
            address: "0x4200000000000000000000000000000000000006",
            topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                "0x0000000000000000000000004752ba5dbc23f44d87826276bf6fd6b1c372ad24",
                "0x000000000000000000000000566e8b2606cf26335bf476e4476e5f634add829c",
            ],
            data: "0x00000000000000000000000000000000000000000000000000b1a2bc2ec50000",
            blockHash:
                "0x4dfb52cdc878529791feb26be60002cf7979728d5a1e4ba6cbda2437f0234781",
            blockNumber: 23758531n,
            transactionHash:
                "0x3f750f04b3beb5c3d85fb87cfd42441992f3acd2927ca11646921479e4155f48",
            transactionIndex: 71,
            logIndex: 252,
            removed: false,
        };

        const decoded = provider.exposedDecodeTransfer(mockedLog);
        expect(decoded).toMatchObject({
            from: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
            to: "0x566e8b2606CF26335Bf476E4476e5F634adD829C",
            amount: BigInt(50000000000000000),
            token: "0x4200000000000000000000000000000000000006",
        });
    });

    it("should aggregate token addresses", async () => {
        const transfers: RawERC20Transfer[] = [
            {
                from: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
                to: "0x566e8b2606CF26335Bf476E4476e5F634adD829C",
                amount: BigInt(50000000000000000),
                token: "0x4200000000000000000000000000000000000006",
            },
            {
                from: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
                to: "0x566e8b2606CF26335Bf476E4476e5F634adD829C",
                amount: BigInt(50000000000000000),
                token: "0x4200000000000000000000000000000000000006",
            },
        ];
        const addresses = provider.exposedAggregateTokenAddresses(transfers);
        expect(addresses).toContain(
            "0x4200000000000000000000000000000000000006"
        );
    });

    it("should enrich transfers with token info", async () => {
        const transfers: RawERC20Transfer[] = [
            {
                from: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
                to: "0x566e8b2606CF26335Bf476E4476e5F634adD829C",
                amount: BigInt(50000000000000000),
                token: "0x4200000000000000000000000000000000000006",
            },
        ];

        const tokenData: Map<Address, ERC20Token> = new Map([
            [
                "0x4200000000000000000000000000000000000006",
                {
                    address: "0x4200000000000000000000000000000000000006",
                    symbol: "WETH",
                    decimals: 18,
                    price: 1800,
                },
            ],
        ]);

        const enrichedTransfers = provider.exposedEnrichTransfersWithTokenInfo(
            transfers,
            tokenData
        );

        expect(enrichedTransfers).toEqual([
            {
                ...transfers[0],
                amountUSD: 90,
                parsedAmount: "0.05",
                token: tokenData.get(
                    "0x4200000000000000000000000000000000000006"
                ),
            },
        ]);
    });
});
