import { Plugin } from "@ai16z/eliza";
import { ERC20EventsProvider } from "./providers/erc20-events.provider";
import { Univ3EventsProvider } from "./providers/univ3-events.provider.ts";
import { ERC20Service } from "./services/erc20.service.ts";
import { DefillamaService } from "./services/defillama.service.ts";

const getProviders = () => {
    return [
        new ERC20EventsProvider(
            new ERC20Service(new DefillamaService()),
            "https://rpc.ankr.com/base"
        ),
        new Univ3EventsProvider(
            new ERC20Service(new DefillamaService()),
            "https://rpc.ankr.com/base"
        ),
    ];
};

export const blockjuic3Plugin: Plugin = {
    name: "blockjuic3",
    description: "Squeezing the fuck out of EVM blocks",
    providers: getProviders(),
};

export default blockjuic3Plugin;
