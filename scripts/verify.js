import pkg from 'hardhat';
const { ethers } = pkg;
import 'dotenv/config';
import fs from 'fs';

async function main() {
  try {
    // Read deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('deployment-info.json', 'utf8'));
    
    const contractAddress = deploymentInfo.contractAddress;
    const nftContract = deploymentInfo.nftContract;
    const trackedToken = deploymentInfo.trackedToken;
    
    console.log('Verification Configuration:');
    console.log('  Contract Address:', contractAddress);
    console.log('  NFT Contract:', nftContract);
    console.log('  Tracked Token:', trackedToken);
    console.log('');

    console.log('Verifying contract on BaseScan...');
    
    // Run the verification command
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const verifyCommand = `npx hardhat verify --network base ${contractAddress} "${nftContract}" "${trackedToken}"`;
    
    console.log('Running:', verifyCommand);
    console.log('');
    
    const { stdout, stderr } = await execAsync(verifyCommand);
    
    if (stdout) {
      console.log('Verification Output:');
      console.log(stdout);
    }
    
    if (stderr) {
      console.log('Verification Errors:');
      console.log(stderr);
    }
    
    console.log('\nVerification completed!');
    console.log('View your contract on BaseScan:');
    console.log(`https://basescan.org/address/${contractAddress}`);
    
  } catch (error) {
    console.error('Error during verification:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('\nNo deployment-info.json found. Please deploy the contract first:');
      console.error('npx hardhat run scripts/deploy.js --network base');
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
