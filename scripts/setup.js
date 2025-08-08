import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Net Protocol Upvote Bot Setup');
  console.log('=====================================\n');

  // Check if .env exists
  const envPath = '.env';
  if (fs.existsSync(envPath)) {
    console.log('✅ .env file already exists');
  } else {
    console.log('❌ .env file not found');
    console.log('Please create a .env file with your configuration:');
    console.log('cp .env.example .env');
    console.log('Then edit .env with your values\n');
    process.exit(1);
  }

  // Check required environment variables
  const requiredVars = [
    'BASE_MAINNET_RPC_URL',
    'PRIVATE_KEY',
    'NFT_CONTRACT_ADDRESS',
    'TRACKED_TOKEN_ADDRESS'
  ];

  console.log('Checking required environment variables...');
  
  const missingVars = [];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    console.log('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.log(`  - ${varName}`));
    console.log('\nPlease add these to your .env file and try again.\n');
    process.exit(1);
  }

  console.log('✅ All required environment variables are set\n');

  // Check if contract is already deployed
  const deploymentInfoPath = 'deployment-info.json';
  if (fs.existsSync(deploymentInfoPath)) {
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
    console.log('✅ Contract already deployed:');
    console.log(`   Address: ${deploymentInfo.contractAddress}`);
    console.log(`   Name: ${deploymentInfo.contractName}`);
    console.log(`   BaseScan: https://basescan.org/address/${deploymentInfo.contractAddress}\n`);
    
    // Check rescue configuration
    const rescueRecipient = process.env.RESCUE_RECIPIENT_ADDRESS;
    if (rescueRecipient) {
      console.log('✅ Rescue recipient configured:', rescueRecipient);
    } else {
      console.log('⚠️  No rescue recipient configured');
      console.log('   Add RESCUE_RECIPIENT_ADDRESS to .env for emergency NFT recovery');
    }
    
    console.log('\nNext steps:');
    console.log('1. Update DISPENSER_ADDRESS in your .env file');
    console.log('2. Start the bot: npm run listener');
    console.log('3. Check NFTs: npm run check-nfts');
  } else {
    console.log('📋 No deployment found. Ready to deploy your contract!\n');
    
    console.log('To deploy your contract:');
    console.log('1. npm run compile');
    console.log('2. npm run deploy');
    console.log('3. npm run verify');
    console.log('4. Update DISPENSER_ADDRESS in your .env file');
    console.log('5. Start the bot: npm run listener\n');
  }

  console.log('✅ Setup complete!');
}

main().catch((error) => {
  console.error('Setup failed:', error.message);
  process.exit(1);
});
