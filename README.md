# Net Protocol Upvote Bot

A Node.js bot that monitors Net Protocol upvotes for any token and automatically awards NFTs when users submit exactly the required number of upvotes in a single transaction.

## What it does

- **Watches** the Net Protocol Upvote App for `Upvoted` events
- **Filters** for exactly the required number of upvotes on your tracked token
- **Awards** NFTs from your dispenser contract when conditions are met
- **Logs** all dispenser actions with transaction links
- **Handles** inventory depletion gracefully
- **Provides** health monitoring via PM2 logs

## Quick Start

### Prerequisites

- Node.js 18+ 
- A Base mainnet RPC URL (Alchemy, Infura, etc.)
- A private key with ETH for gas fees
- PM2 (for production deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/net-protocol-upvote-bot.git
cd net-protocol-upvote-bot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Configuration

**Important**: You must create a `.env` file before running the bot!

1. **Copy the example file:**
```bash
cp .env.example .env
```

2. **Edit the `.env` file with your settings:**
```env
# Required: Base mainnet RPC URL (get from Alchemy, Infura, etc.)
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Required: Private key for dispenser transactions (no 0x prefix)
PRIVATE_KEY=your_private_key_here

# Required: Your dispenser contract address
DISPENSER_ADDRESS=0xYourDispenserContractAddress

# Required: Token address to track for upvotes
TRACKED_TOKEN_ADDRESS=0xYourTokenAddress

# Required: Net Protocol Upvote App contract address
UPVOTE_APP_ADDRESS=0x0ada882Dbbdc12388a1F9CA85d2d847088F747df

# Required: NFT contract address
NFT_CONTRACT_ADDRESS=0xYourNFTContractAddress

# Optional: Contract name for deployment (default: MegapurrDispenser)
CONTRACT_NAME=YourCustomDispenser

# Optional: Number of upvotes required to trigger NFT award (default: 420)
REQUIRED_UPVOTES=420

# Optional: Polling interval in milliseconds (default: 15000)
POLL_MS=15000

# Optional: Rescue recipient address (for emergency NFT recovery)
RESCUE_RECIPIENT_ADDRESS=0xYourRescueAddress

# Optional: Specific token ID to rescue (for rescue-nft script)
RESCUE_TOKEN_ID=123
```

**Note**: The bot will show a helpful error message if any required variables are missing.

### Local Development

```bash
# Setup and check configuration
npm run setup

# Start the bot
npm run listener

# View logs
npm run logs

# Check status
npm run status
```

## Production Deployment

### DigitalOcean Droplet Setup

1. **Create a droplet** (Ubuntu 22.04 LTS recommended)

2. **SSH into your droplet** and install dependencies:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt install git -y
```

3. **Clone and setup the bot**:
```bash
# Clone repository
git clone https://github.com/yourusername/net-protocol-upvote-bot.git
cd net-protocol-upvote-bot

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env  # Edit with your settings
```

4. **Start with PM2**:
```bash
# Start the bot
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

5. **Monitor the bot**:
```bash
# View logs
pm2 logs net-protocol-upvote-bot

# Check status
pm2 status

# Restart if needed
pm2 restart net-protocol-upvote-bot
```

## Monitoring

### Health Monitoring

The bot provides comprehensive health monitoring through PM2 logs:

```bash
# View real-time logs
pm2 logs net-protocol-upvote-bot

# View dispenser-specific logs
tail -f logs/dispenser-actions.jsonl

# Check PM2 status
pm2 status
```

### Log Files

The bot creates several log files:

- **Console logs**: PM2 captures these with timestamps
- **Daily logs**: `logs/YYYY-MM-DD.jsonl` (rotated, kept 7 days)
- **Dispenser actions**: `logs/dispenser-actions.jsonl` (all NFT awards, config changes, etc.)

### Key Events

- `[DISPENSER] NFT awarded to 0x...` - Successful NFT award
- `[DISPENSER] Out of NFTs!` - Inventory depleted
- `[CONFIG] Upvotes required changed to: 420` - Threshold updated
- `[BOT] Net Protocol Upvote Bot is now running!` - Startup complete

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_MAINNET_RPC_URL` | Yes | - | Your Base mainnet RPC endpoint |
| `PRIVATE_KEY` | Yes | - | Private key for dispenser transactions |
| `DISPENSER_ADDRESS` | Yes | - | Your deployed MegapurrDispenser contract |
| `TRACKED_TOKEN_ADDRESS` | Yes | - | Token address to track for upvotes |
| `UPVOTE_APP_ADDRESS` | Yes | - | Net Protocol Upvote App address |
| `NFT_CONTRACT_ADDRESS` | Yes | - | Your NFT contract address |
| `CONTRACT_NAME` | No | MegapurrDispenser | Contract name for deployment |
| `REQUIRED_UPVOTES` | No | 420 | Upvotes required to trigger NFT award |
| `POLL_MS` | No | 15000 | Polling interval in milliseconds |
| `RESCUE_RECIPIENT_ADDRESS` | No | - | Address to rescue NFTs to |
| `RESCUE_TOKEN_ID` | No | - | Specific token ID to rescue |

### Smart Contract Deployment

To deploy your own dispenser contract:

```bash
# Compile the contract
npm run compile

# Deploy to Base mainnet
npm run deploy

# Verify on BaseScan
npm run verify
```

The deployment script will:
- Read configuration from your `.env` file
- Deploy the contract with your custom name
- Save deployment info to `deployment-info.json`
- Provide BaseScan links and next steps

## Development

### Project Structure

```
net-protocol-upvote-bot/
├── contracts/           # Smart contracts
│   └── MegapurrDispenser.sol
├── scripts/            # Bot scripts
│   ├── net-listener.js
│   ├── deploy.js
│   └── verify.js
├── logs/              # Log files
├── .env.example       # Environment template
├── package.json       # Dependencies
└── README.md         # This file
```

### Available Scripts

```bash
npm run setup         # Check configuration and setup
npm run compile       # Compile contracts
npm run deploy        # Deploy contract (reads from .env)
npm run verify        # Verify contract (reads from deployment-info.json)
npm run listener      # Start the bot
npm run check-nfts    # Check queued NFTs in dispenser
npm run rescue-all    # Rescue all NFTs (requires RESCUE_RECIPIENT_ADDRESS)
npm run rescue-nft    # Rescue specific NFT (requires RESCUE_TOKEN_ID)
npm run logs          # View PM2 logs
npm run status        # Check PM2 status
npm run restart       # Restart bot
npm run stop          # Stop bot
```

## License

CC0 License - see LICENSE file for details

## Support

If you encounter issues:

1. Check the logs: `pm2 logs net-protocol-upvote-bot`
2. Verify your `.env` configuration
3. Ensure your contract is deployed and verified
4. Check that your RPC endpoint is working

## Links

- [Base Mainnet](https://basescan.org/)
- [Net Protocol](https://netprotocol.xyz/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)