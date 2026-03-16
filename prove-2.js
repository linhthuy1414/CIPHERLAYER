import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

async function prove() {
    const addr = "0x661876bd653ebf7fb12ad8f3dc330caff7c6ceb0ee9bc64e48b898124239d547";
    
    for (const p_network of [Network.MAINNET, Network.TESTNET, Network.DEVNET]) {
        console.log(`\n=== CHECKING ${p_network.toUpperCase()} ===`);
        const aptos = new Aptos(new AptosConfig({ network: p_network }));
        try {
            const rawBalance = await aptos.getAccountCoinAmount({ accountAddress: addr, coinType: "0x1::aptos_coin::AptosCoin" });
            const balance = rawBalance / 100000000;
            console.log(`Balance: ${balance} APT`);
        } catch(e) {
            console.log("Error:", e.message);
        }
    }
}
prove();
