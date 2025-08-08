import pkg from 'hardhat';
const { ethers } = pkg;
import 'dotenv/config';

async function main() {
  const dispenserAddress = process.env.DISPENSER_ADDRESS;
  
  if (!dispenserAddress) {
    console.error('Error: DISPENSER_ADDRESS is required in .env file');
    process.exit(1);
  }

  console.log('Checking queued NFTs for dispenser:', dispenserAddress);
  
  const dispenser = await ethers.getContractAt("MegapurrDispenser", dispenserAddress);

  const nfts = await dispenser.getQueuedNFTs();
  console.log("🧊 Queued NFTs:", nfts.map(n => n.toString()));
  console.log("📊 Total queued:", nfts.length);
}

main().catch(console.error);