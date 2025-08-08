import pkg from 'hardhat';
const { ethers } = pkg;
import 'dotenv/config';

async function main() {
  const dispenserAddress = process.env.DISPENSER_ADDRESS;
  const recipientAddress = process.env.RESCUE_RECIPIENT_ADDRESS;
  
  if (!dispenserAddress) {
    console.error('Error: DISPENSER_ADDRESS is required in .env file');
    process.exit(1);
  }
  
  if (!recipientAddress) {
    console.error('Error: RESCUE_RECIPIENT_ADDRESS is required in .env file');
    console.error('Add RESCUE_RECIPIENT_ADDRESS=0xYourAddress to your .env file');
    process.exit(1);
  }

  console.log('Rescuing all NFTs from dispenser:', dispenserAddress);
  console.log('Recipient address:', recipientAddress);

  const dispenser = await ethers.getContractAt("MegapurrDispenser", dispenserAddress);

  const tx = await dispenser.rescueAllNFTs(recipientAddress);
  await tx.wait();

  console.log("✅ Rescued all NFTs to", recipientAddress);
  console.log("Transaction hash:", tx.hash);
  console.log("BaseScan:", `https://basescan.org/tx/${tx.hash}`);
}

main().catch(console.error);