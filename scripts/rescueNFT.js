import pkg from 'hardhat';
const { ethers } = pkg;
import 'dotenv/config';

async function main() {
  const dispenserAddress = process.env.DISPENSER_ADDRESS;
  const recipientAddress = process.env.RESCUE_RECIPIENT_ADDRESS;
  const tokenId = process.env.RESCUE_TOKEN_ID;
  
  if (!dispenserAddress) {
    console.error('Error: DISPENSER_ADDRESS is required in .env file');
    process.exit(1);
  }
  
  if (!recipientAddress) {
    console.error('Error: RESCUE_RECIPIENT_ADDRESS is required in .env file');
    console.error('Add RESCUE_RECIPIENT_ADDRESS=0xYourAddress to your .env file');
    process.exit(1);
  }
  
  if (!tokenId) {
    console.error('Error: RESCUE_TOKEN_ID is required in .env file');
    console.error('Add RESCUE_TOKEN_ID=123 to your .env file (the token ID to rescue)');
    process.exit(1);
  }

  console.log('Rescuing NFT from dispenser:', dispenserAddress);
  console.log('Token ID:', tokenId);
  console.log('Recipient address:', recipientAddress);

  const dispenser = await ethers.getContractAt("MegapurrDispenser", dispenserAddress);
  const tx = await dispenser.rescueNFT(recipientAddress, tokenId);
  await tx.wait();

  console.log(`✅ Rescued token ID ${tokenId} to address ${recipientAddress}`);
  console.log("Transaction hash:", tx.hash);
  console.log("BaseScan:", `https://basescan.org/tx/${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});