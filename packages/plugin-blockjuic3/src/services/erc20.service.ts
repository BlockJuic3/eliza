import { Address, Chain, createPublicClient, erc20Abi, http } from "viem";
// import { base } from "viem/chains";
import { DefillamaService } from "./defillama.service";
import { ERC20Token, ERC20Info, ChainAddress } from "../common/types";

const baseRpcUrl =
    "https://api-base-mainnet-archive.dwellir.com/d0c11bc1-a53d-4ec0-bd33-0cc796ace5e3";

// export const chainClients = {
//     [base.id]: createPublicClient({
//         chain: base,
//         transport: http(baseRpcUrl),
//     }),
// } as const;

export class ERC20Service {
    constructor(private defillamaService: DefillamaService) {}
    public async getErc20Info(tokens: ChainAddress[]): Promise<ERC20Info> {
        const defillamaResponse =
            await this.defillamaService.getTokenInfoFromDefillama(tokens);
        // Check all tokens are present
        const defillamaTokens = new Set(defillamaResponse.keys());
        const tokensSet = new Set(tokens.map((token) => token.address));
        if (defillamaTokens.size == tokensSet.size) {
            return defillamaResponse;
        }
        const missingTokens = await this.getMissingTokens(
            tokens,
            defillamaResponse
        );
        const missingTokensInfo = await this.fetchMissingTokens(missingTokens);
        return missingTokensInfo.reduce((map, token) => {
            map.set(token.address, token);
            return map;
        }, new Map<Address, ERC20Token>(defillamaResponse));
    }

    public async getErc20InfoFromChain(
        chain: Chain,
        tokens: Set<Address>
    ): Promise<ERC20Info> {
        const tokensInfo = await this.getErc20Info(
            Array.from(tokens).map((token) => ({
                address: token,
                chain,
            }))
        );
        return tokensInfo;
    }

    protected async getMissingTokens(
        requestedTokens: ChainAddress[],
        defillamaTokens: ERC20Info
    ): Promise<ChainAddress[]> {
        const defillamaTokensSet = new Set(defillamaTokens.keys());
        // Group requested tokens by chain
        const tokensByChain: Record<number, ChainAddress[]> =
            requestedTokens.reduce((acc, token) => {
                if (!acc[token.chain.id]) {
                    acc[token.chain.id] = [];
                }
                acc[token.chain.id].push(token);
                return acc;
            }, {});
        // Find missing tokens per chain
        const missingTokens = Object.values(tokensByChain).flatMap(
            (chainTokens) => {
                return chainTokens.filter(
                    (token) => !defillamaTokensSet.has(token.address)
                );
            }
        );
        return missingTokens;
    }
    protected async fetchMissingTokens(
        missingTokens: ChainAddress[]
    ): Promise<ERC20Token[]> {
        // Group tokens by chain for batch processing
        const tokensByChain = missingTokens.reduce(
            (acc, token) => {
                if (!acc[token.chain.id]) {
                    acc[token.chain.id] = [];
                }
                acc[token.chain.id].push(token);
                return acc;
            },
            {} as Record<number, ChainAddress[]>
        );
        const results: ERC20Token[] = [];
        // Process each chain's tokens
        for (const chainTokens of Object.values(tokensByChain)) {
            if (chainTokens.length === 0) continue;
            const chain = chainTokens[0].chain;
            const client = this.getClient(chain);
            const multicallResults = await client.multicall({
                // @ts-ignore
                contracts: chainTokens.flatMap((token) => [
                    {
                        address: token.address,
                        abi: erc20Abi,
                        functionName: "symbol",
                    },
                    {
                        address: token.address,
                        abi: erc20Abi,
                        functionName: "decimals",
                    },
                ]),
            });
            // Process results in pairs (symbol, decimals)
            for (let i = 0; i < chainTokens.length; i++) {
                const symbolResult = multicallResults[i * 2];
                const decimalsResult = multicallResults[i * 2 + 1];
                if (
                    symbolResult.status === "success" &&
                    decimalsResult.status === "success"
                ) {
                    results.push({
                        address: chainTokens[i].address,
                        symbol: symbolResult.result as string,
                        decimals: Number(decimalsResult.result),
                        price: 0, // Default price since we can't fetch it from the contract
                    });
                }
            }
        }
        return results;
    }
    private getClient(chain: Chain) {
        return createPublicClient({
            chain,
            transport: http(baseRpcUrl),
        });
    }
}
