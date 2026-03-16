import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

async function prove() {
    const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
    const addr = "0x661876bd653ebf7fb12ad8f3dc330caff7c6ceb0ee9bc64e48b898124239d547";
    
    console.log("=== PROOF 1: APT BALANCE ===");
    console.log("Checking address:", addr);
    try {
        const rawBalance = await aptos.getAccountCoinAmount({ accountAddress: addr, coinType: "0x1::aptos_coin::AptosCoin" });
        const balance = rawBalance / 100000000;
        console.log(`TS-SDK getAccountCoinAmount returned: ${rawBalance} (${balance} APT)`);
    } catch(e) {
        console.log("TS-SDK Error:", e.message);
    }
}

prove();
