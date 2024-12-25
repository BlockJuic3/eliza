import { z } from "zod";
import { Address } from "viem";
import { Chain } from "viem/chains";
import { ERC20Info, ChainAddress } from "../common/types";

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

// TODO: cache mechanism
export class DefillamaService {
    private baseUrl: string;
    private pricesUrl: string;

    constructor() {
        this.baseUrl = `https://coins.llama.fi`;
        this.pricesUrl = `${this.baseUrl}/prices/current/`;
    }

    public async getTokenInfoFromChain(
        chain: Chain,
        tokens: Set<Address>
    ): Promise<ERC20Info> {
        const tokenParams = Array.from(tokens).map((token) => ({
            address: token,
            chain,
        }));
        return this.getTokenInfoFromDefillama(tokenParams);
    }

    public async getTokenInfoFromDefillama(
        tokens: ChainAddress[]
    ): Promise<ERC20Info> {
        try {
            const fullUrl = `${this.pricesUrl}${tokens
                .map(
                    (token) =>
                        `${token.chain.name.toLowerCase()}:${token.address}`
                )
                .join(",")}`;
            const response = await fetch(fullUrl);
            const rawData = await response.json();
            const data = DefillamaResponseSchema.parse(rawData);
            const tokenMap: ERC20Info = new Map();
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
            throw error;
        }
    }
}
