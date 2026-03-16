(async () => {
    try {
        const sdk = await import('@shelby-protocol/sdk/browser');
        const payload = sdk.ShelbyBlobClient.createRegisterBlobPayload({
            account: '0x1',
            blobName: 'name',
            blobMerkleRoot: new Uint8Array([1,2,3]),
            numChunksets: 1,
            expirationMicros: 1000000000,
            blobSize: 100
        });
        console.log("PAYLOAD arguments:", payload.functionArguments || payload.arguments);
        console.log("Types:", (payload.functionArguments || payload.arguments).map(x => typeof x + (x && x.constructor ? ' (' + x.constructor.name + ')' : '')));
    } catch (e) {
        console.error(e);
    }
})();
