const https = require('https');
https.get('https://fullnode.testnet.aptoslabs.com/v1/accounts/0x661876bd653ebf7fb12ad8f3dc330caff7c6ceb0ee9bc64e48b898124239d547/resources', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const j = JSON.parse(data);
            if (Array.isArray(j)) {
                console.log("Total resources:", j.length);
                const types = j.map(r => r.type);
                console.log(types);
                const coinStore = j.find(r => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>");
                console.log("CoinStore<AptosCoin> present:", !!coinStore);
                if (coinStore) console.log("Value:", coinStore.data.coin.value);
            } else {
                console.log(j);
            }
        } catch(e) { console.log(e.message); }
    });
}).on('error', console.error);
