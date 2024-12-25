import { base } from "viem/chains";
import { DefillamaService } from "../../services";
import { beforeEach, describe, expect, it } from "vitest";
import { getAddress } from "viem";

describe("DefillamaService", () => {
    let defillamaService: DefillamaService;

    beforeEach(() => {
        defillamaService = new DefillamaService();
    });

    it("should fetch token info from defillama", async () => {
        const tokenInfoParams = [
            {
                tokenAddress: getAddress(
                    "0x4200000000000000000000000000000000000006"
                ),
                chain: base,
            },
            {
                tokenAddress: getAddress(
                    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
                ),
                chain: base,
            },
        ];

        const tokenInfo =
            await defillamaService.getTokenInfoFromDefillama(tokenInfoParams);
        expect(tokenInfo).toBeDefined();
    });
});
