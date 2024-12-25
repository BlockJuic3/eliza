import { Address, Chain } from "viem";

export interface FormatOutput<T> {
    format: (events: T[]) => string;
}

export interface ERC20Token {
    address: Address;
    symbol: string;
    decimals: number;
    price: number;
}

export type ERC20Info = Map<Address, ERC20Token | undefined>;

export interface ChainAddress {
    chain: Chain;
    address: Address;
}
