import pkg from 'hardhat';
const { ethers } = pkg;
import 'dotenv/config';

async function main() {
  // Read configuration from environment variables
  const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
  const TRACKED_TOKEN_ADDRESS = process.env.TRACKED_TOKEN_ADDRESS;
  const CONTRACT_NAME = process.env.CONTRACT_NAME || 'MegapurrDispenser';

  // Validate required environment variables
  if (!NFT_CONTRACT_ADDRESS) {
    console.error('Error: NFT_CONTRACT_ADDRESS is required in .env file');
    process.exit(1);
  }

  if (!TRACKED_TOKEN_ADDRESS) {
    console.error('Error: TRACKED_TOKEN_ADDRESS is required in .env file');
    process.exit(1);
  }

  console.log('Deployment Configuration:');
  console.log('  Contract Name:', CONTRACT_NAME);
  console.log('  NFT Contract:', NFT_CONTRACT_ADDRESS);
  console.log('  Tracked Token:', TRACKED_TOKEN_ADDRESS);
  console.log('');

  console.log(`Deploying ${CONTRACT_NAME}...`);

  const Dispenser = await ethers.getContractFactory(CONTRACT_NAME);
  const dispenser = await Dispenser.deploy(NFT_CONTRACT_ADDRESS, TRACKED_TOKEN_ADDRESS);
  await dispenser.waitForDeployment();

  const deployedAddress = await dispenser.getAddress();
  console.log(`${CONTRACT_NAME} deployed to:`, deployedAddress);
  console.log('BaseScan:', `https://basescan.org/address/${deployedAddress}`);

  // Save deployment info
  const deploymentInfo = {
    contractName: CONTRACT_NAME,
    contractAddress: deployedAddress,
    nftContract: NFT_CONTRACT_ADDRESS,
    trackedToken: TRACKED_TOKEN_ADDRESS,
    deploymentTx: dispenser.deploymentTransaction().hash,
    deploymentTime: new Date().toISOString(),
    network: 'base-mainnet'
  };

  const fs = await import('fs');
  fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
  console.log('\nDeployment info saved to deployment-info.json');

  console.log('\nNext steps:');
  console.log('1. Update your .env file with the new contract address');
  console.log('2. Verify the contract on BaseScan');
  console.log('3. Test the functionality');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
