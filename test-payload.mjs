import { ShelbyBlobClient } from '@shelby-protocol/sdk/browser';

const payload = ShelbyBlobClient.createRegisterBlobPayload({
    account: '0x1',
    blobName: 'name',
    blobMerkleRoot: "010203",  // The SDK uses Hex.fromHexString, so string is required
    numChunksets: 1,
    expirationMicros: ((Date.now() + 1000*60*60*24*30) * 1000).toString(),
    blobSize: "100",
    encoding: 0
});

console.log("PAYLOAD arguments:", payload.functionArguments || payload.arguments);
console.log("Types:", (payload.functionArguments || payload.arguments).map(x => typeof x + (x && x.constructor ? ' (' + x.constructor.name + ')' : '')));
