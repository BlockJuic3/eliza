import { AgentRuntime as IAgentRuntime } from "@ai16z/eliza";
import type { Memory, Provider, State } from "@ai16z/eliza";
import {
    Address,
    createPublicClient,
    decodeEventLog,
    erc20Abi,
    formatUnits,
    GetLogsReturnType,
    http,
    parseAbiItem,
} from "viem";
import { base } from "viem/chains";
import { ERC20Service } from "../services/erc20.service";
import { ChainAddress, ERC20Token } from "../common/types";

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

const transferEventAbi = parseAbiItem(
    "event Transfer(address, address indexed to, uint256 value)"
);

export type TransferLog = GetLogsReturnType<
    typeof transferEventAbi,
    undefined,
    undefined,
    "latest",
    "latest"
>[number];

export class ERC20EventsProvider implements Provider {
    constructor(
        protected readonly erc20Service: ERC20Service,
        protected readonly rpcUrl: string
    ) {}

    public async get(runtime: IAgentRuntime, _message: Memory, _state?: State) {
        const [blockNumber, transfers] = await Promise.all([
            this.getLatestBlockNumber(),
            this.getTransfersEvents(),
        ]);

        return this.formatOutput(
            transfers,
            blockNumber,
            runtime.character.name
        );
    }

    protected async getTransfersEvents(): Promise<ERC20Transfer[]> {
        try {
            const logs = await this.fetchRawTransfersFromLatestBlock();
            const transfers = logs
                .map((log) => this.decodeTransfer(log))
                .filter(Boolean);
            const addresses = this.aggregateTokenAddresses(transfers);

            // TODO: programatically get the chain
            let tokenData: Map<Address, ERC20Token>;
            const tokenInfoParams: ChainAddress[] = Array.from(addresses).map(
                (address) => ({
                    address,
                    chain: base,
                })
            );

            tokenData = await this.erc20Service.getErc20Info(tokenInfoParams);

            return this.enrichTransfersWithTokenInfo(transfers, tokenData);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    private get client() {
        return createPublicClient({
            chain: base,
            transport: http(this.rpcUrl),
        });
    }

    protected async getLatestBlockNumber() {
        const block = await this.client.getBlockNumber();
        return block;
    }

    protected async fetchRawTransfersFromLatestBlock(): Promise<TransferLog[]> {
        const logs = await this.client.getLogs({
            event: transferEventAbi,
            fromBlock: "latest",
            toBlock: "latest",
        });
        return logs;
    }

    protected decodeTransfer(log: TransferLog): RawERC20Transfer | null {
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
    }

    protected enrichTransfersWithTokenInfo(
        transfers: RawERC20Transfer[],
        tokenData: Map<Address, ERC20Token>
    ): ERC20Transfer[] {
        return transfers
            .map((transfer) => {
                const token = tokenData.get(transfer.token);
                if (!token) return null;

                const parsedAmount = formatUnits(
                    transfer.amount,
                    token?.decimals ?? 18
                );

                return {
                    ...transfer,
                    token,
                    parsedAmount,
                    amountUSD: Number(parsedAmount) * (token?.price ?? 0),
                };
            })
            .filter(Boolean);
    }

    protected aggregateTokenAddresses(
        transfers: RawERC20Transfer[]
    ): Set<Address> {
        return new Set(transfers.map((transfer) => transfer.token));
    }

    protected formatOutput(
        transfers: ERC20Transfer[],
        blockNumber: bigint,
        agentName: string
    ) {
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
    }
}
