import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export async function test() {
    const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
    try {
        console.log("Checking coin...");
        const res = await aptos.getAccountCoinAmount({ accountAddress: "0x123", coinType: "0x1::aptos_coin::AptosCoin" });
        console.log(res);
    } catch (e) {
        console.error(e.message);
    }
}
test();
