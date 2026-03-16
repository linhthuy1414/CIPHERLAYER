import { ShelbyBlobClient, AccountAddress } from '@shelby-protocol/sdk/browser';

const blobClient = new ShelbyBlobClient({
  aptos: {
    network: 'testnet',
    clientConfig: {
      API_KEY: 'aptoslabs_hGbAA9Rbdx2_2PmQCLdtaLeB9Yf26cnGiZc2ttXszaUAc'
    }
  }
});

blobClient.getAccountBlobs({
  account: AccountAddress.fromString('0x66181b379e4dcdddfd42ccef6ce8e3d09a0665cc6cb3f90117b4c4faeef8d547')
}).then(b => console.log('Blobs:', b)).catch(e => console.error(e));
