import 'dotenv/config';
import fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  webSocket,
  getAddress,
  zeroAddress,
  encodeAbiParameters,
  parseAbiItem,
  parseAbi,
  toHex,
  encodePacked,
  padHex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// ---------------------- CONFIG ----------------------
const BASE_MAINNET_RPC_URL = process.env.BASE_MAINNET_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DISPENSER_ADDRESS = process.env.DISPENSER_ADDRESS;
const TRACKED_TOKEN_ADDRESS = process.env.TRACKED_TOKEN_ADDRESS;
const UPVOTE_APP_ADDRESS = process.env.UPVOTE_APP_ADDRESS;
const REQUIRED_UPVOTES = process.env.REQUIRED_UPVOTES ? BigInt(process.env.REQUIRED_UPVOTES) : BigInt(420);
const POLL_MS = process.env.POLL_MS ? parseInt(process.env.POLL_MS) : 15000;
const CACHE_TTL_MS = 60 * 1000; // cache configs for 60s
const LOG_DIR = './logs';
const DISPENSER_LOG_FILE = `${LOG_DIR}/dispenser-actions.jsonl`;

// ---------------------- VALIDATION ----------------------
function validateConfig() {
  const errors = [];
  
  if (!BASE_MAINNET_RPC_URL) {
    errors.push('BASE_MAINNET_RPC_URL is required');
  }
  
  if (!PRIVATE_KEY) {
    errors.push('PRIVATE_KEY is required');
  }
  
  if (!DISPENSER_ADDRESS) {
    errors.push('DISPENSER_ADDRESS is required');
  }
  
  if (!TRACKED_TOKEN_ADDRESS) {
    errors.push('TRACKED_TOKEN_ADDRESS is required');
  }
  
  if (!UPVOTE_APP_ADDRESS) {
    errors.push('UPVOTE_APP_ADDRESS is required');
  }
  
  if (errors.length > 0) {
    console.error('\n[CONFIG ERROR] Missing required environment variables:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease create a .env file with the required variables:');
    console.error('  cp .env.example .env');
    console.error('  # Then edit .env with your values');
    console.error('\nRequired variables:');
    console.error('  BASE_MAINNET_RPC_URL - Your Base mainnet RPC endpoint');
    console.error('  PRIVATE_KEY - Your private key (no 0x prefix)');
    console.error('  DISPENSER_ADDRESS - Your dispenser contract address');
    console.error('  TRACKED_TOKEN_ADDRESS - Token address to track');
    console.error('  UPVOTE_APP_ADDRESS - Net Protocol Upvote App address');
    console.error('\nExample:');
    console.error('  BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY');
    console.error('  PRIVATE_KEY=your_private_key_here');
    console.error('  DISPENSER_ADDRESS=0xYourDispenserContractAddress');
    console.error('  TRACKED_TOKEN_ADDRESS=0xYourTokenAddress');
    console.error('  UPVOTE_APP_ADDRESS=0x0ada882Dbbdc12388a1F9CA85d2d847088F747df');
    process.exit(1);
  }
  
  // Normalize addresses to checksum format
  try {
    global.NORMALIZED_DISPENSER_ADDRESS = getAddress(DISPENSER_ADDRESS);
    global.NORMALIZED_TRACKED_TOKEN_ADDRESS = getAddress(TRACKED_TOKEN_ADDRESS);
    global.NORMALIZED_UPVOTE_APP_ADDRESS = getAddress(UPVOTE_APP_ADDRESS);
  } catch (err) {
    console.error('\n[CONFIG ERROR] Invalid address format:');
    console.error('  - DISPENSER_ADDRESS:', DISPENSER_ADDRESS);
    console.error('  - TRACKED_TOKEN_ADDRESS:', TRACKED_TOKEN_ADDRESS);
    console.error('  - UPVOTE_APP_ADDRESS:', UPVOTE_APP_ADDRESS);
    console.error('\nPlease ensure all addresses are valid Ethereum addresses');
    process.exit(1);
  }
  
  console.log('[CONFIG] All required environment variables are set');
  console.log('[CONFIG] Normalized addresses:');
  console.log('  - Dispenser:', global.NORMALIZED_DISPENSER_ADDRESS);
  console.log('  - Token:', global.NORMALIZED_TRACKED_TOKEN_ADDRESS);
  console.log('  - Upvote App:', global.NORMALIZED_UPVOTE_APP_ADDRESS);
}

// Net Protocol contract details
const NET_PROTOCOL_ADDRESS = '0x00000000B24D62781dB359b07880a105cD0b64e6';

// Net Protocol ABI (only what we need)
const NET_PROTOCOL_ABI = parseAbi([
  'event MessageSentViaApp(address indexed app, address indexed sender, string indexed topic, uint256 messagesLength)',
  'function getMessage(uint256 idx) view returns ((address app, address sender, uint256 timestamp, bytes data, string text, string topic))',
  'function getMessagesInRangeForApp(address app, uint256 startIdx, uint256 endIdx) view returns ((address app, address sender, uint256 timestamp, bytes data, string text, string topic)[])',
  'function getTotalMessagesForAppCount(address app) view returns (uint256)'
]);

// Upvote App ABI (authoritative event we care about)
const UPVOTE_APP_ABI = parseAbi([
  'event Upvoted(address indexed user, address indexed token, uint256 numUpvotes)'
]);

// MegapurrDispenser ABI (only what we need)
const DISPENSER_ABI = parseAbi([
  'function addUpvotes(address user, uint256 numVotes) external',
  'function upvotesRequired() external view returns (uint256)',
  'function getQueuedNFTs() external view returns (uint256[])',
  'function userUpvotes(address) external view returns (uint256)'
]);

// ---------------------- CLIENTS ----------------------
const publicClient = createPublicClient({
  chain: base,
  transport: viemHttp(BASE_MAINNET_RPC_URL)
});

// Create account from private key
const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);

const walletClient = createWalletClient({
  chain: base,
  transport: viemHttp(BASE_MAINNET_RPC_URL),
  account
});

// ---------------------- STATE ----------------------
let lastProcessed = 0;
let configCache = {};

// Idempotency store for processed logs
let processedLogIds = new Set(); // `${txHash}:${logIndex}`
let lastProcessedBlock = 0n;

// Ensure logs dir exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

// Ensure dispenser log file exists
if (!fs.existsSync(DISPENSER_LOG_FILE)) {
  fs.writeFileSync(DISPENSER_LOG_FILE, '');
}

// Load last processed state
try {
  const stateFile = fs.readFileSync('net_state.json');
  const state = JSON.parse(stateFile);
  // Restore processed logs & last processed block if present
  if (state.processed && Array.isArray(state.processed)) {
    processedLogIds = new Set(state.processed);
  }
  if (state.lastProcessedBlock) {
    lastProcessedBlock = BigInt(state.lastProcessedBlock);
  }
  // For previous versions, keep app-specific message index at 0
  lastProcessed = BigInt(0);
  console.log(`Starting from app message index: ${lastProcessed} (block ${lastProcessedBlock.toString()})`);
} catch (err) {
  console.log('No state file found, starting from 0');
  lastProcessed = BigInt(0);
}

// ---------------------- DISPENSER LOGGING ----------------------
function logDispenserAction(action, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ...data
  };
  
  try {
    fs.appendFileSync(DISPENSER_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Error writing to dispenser log:', err);
  }
}

// ---------------------- FUNCTIONS ----------------------
async function getConfig() {
  const now = Date.now();
  if (configCache.timestamp && now - configCache.timestamp < CACHE_TTL_MS) {
    return configCache.data;
  }

  try {
    // Read all contract settings in parallel
    const [upvotesRequired, queuedNFTs] = await Promise.all([
      publicClient.readContract({
        address: global.NORMALIZED_DISPENSER_ADDRESS,
        abi: DISPENSER_ABI,
        functionName: 'upvotesRequired'
      }),
      publicClient.readContract({
        address: global.NORMALIZED_DISPENSER_ADDRESS,
        abi: DISPENSER_ABI,
        functionName: 'getQueuedNFTs'
      })
    ]);

    const config = {
      upvotesRequired: upvotesRequired.toString(),
      queuedNFTCount: queuedNFTs.length,
      queuedNFTs: queuedNFTs.map(id => id.toString()),
      lastUpdated: now
    };

    // Log config updates
    logInfo('config_updated', config);
    
    // Log dispenser config changes
    logDispenserAction('config_updated', {
      upvotesRequired: upvotesRequired.toString(),
      queuedNFTCount: queuedNFTs.length,
      queuedNFTs: queuedNFTs.map(id => id.toString())
    });

    configCache = {
      timestamp: now,
      data: config
    };

    return configCache.data;
  } catch (err) {
    console.error('[CONFIG_ERROR] Failed to fetch dispenser config:', err.message);
    logError('config_fetch_error', err, {
      dispenserAddress: global.NORMALIZED_DISPENSER_ADDRESS
    });
    
    // If we have cached data, use it
    if (configCache.data) {
      console.log('Using cached config data');
      return configCache.data;
    }
    
    // Otherwise return defaults
    return {
      upvotesRequired: '200',
      queuedNFTCount: 0,
      queuedNFTs: [],
      lastUpdated: 0
    };
  }
}



async function getCurrentTip() {
  try {
    return await publicClient.readContract({
      address: NET_PROTOCOL_ADDRESS,
      abi: NET_PROTOCOL_ABI,
      functionName: 'getTotalMessagesForAppCount',
      args: [global.NORMALIZED_UPVOTE_APP_ADDRESS]
    });
  } catch (err) {
    console.error('[NET_PROTOCOL_ERROR] Failed to get message count:', err.message);
    logError('net_protocol_error', err, {
      netProtocolAddress: NET_PROTOCOL_ADDRESS,
      upvoteAppAddress: global.NORMALIZED_UPVOTE_APP_ADDRESS
    });
    return BigInt(0);
  }
}

async function getMessages(startIndex, endIndex) {
  try {
    return await publicClient.readContract({
      address: NET_PROTOCOL_ADDRESS,
      abi: NET_PROTOCOL_ABI,
      functionName: 'getMessagesInRangeForApp',
      args: [global.NORMALIZED_UPVOTE_APP_ADDRESS, startIndex, endIndex]
    });
  } catch (err) {
    console.error(`Error getting messages from ${startIndex} to ${endIndex}:`, err);
    return [];
  }
}

// Watch Upvoted events directly from the Upvote App
async function watchUpvotes() {
  try {
    const unwatch = await publicClient.watchEvent({
      address: global.NORMALIZED_UPVOTE_APP_ADDRESS,
      event: UPVOTE_APP_ABI[0],
      onLogs: async (logs) => {
        for (const log of logs) {
          const id = `${log.transactionHash}:${log.logIndex}`;
          if (processedLogIds.has(id)) continue;

          const user = log.args.user;
          const token = (log.args.token || '').toLowerCase();
          const numUpvotes = BigInt(log.args.numUpvotes);

          // Only tracked token and exactly required upvotes in a single tx
          if (token !== global.NORMALIZED_TRACKED_TOKEN_ADDRESS.toLowerCase()) continue;
          if (numUpvotes !== REQUIRED_UPVOTES) continue;

          // Mark processed preemptively to avoid re-entry
          processedLogIds.add(id);

          logInfo('upvote_event_seen', {
            user,
            token,
            numUpvotes: numUpvotes.toString(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber?.toString(),
            basescanTx: `https://basescan.org/tx/${log.transactionHash}`
          });

          // Check inventory
          const { queuedNFTCount } = await getConfig();
          if (!queuedNFTCount || queuedNFTCount === 0) {
            console.log(`[DISPENSER] Out of NFTs! User ${user} upvoted ${REQUIRED_UPVOTES.toString()} times but no inventory available.`);
            logWarning('dispenser_depleted', {
              user,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber?.toString()
            });
            logDispenserAction('inventory_depleted', {
              user,
              sourceTx: log.transactionHash,
              sourceBasescan: `https://basescan.org/tx/${log.transactionHash}`,
              note: `User upvoted ${REQUIRED_UPVOTES.toString()} times but no NFTs available`
            });
            continue;
          }

          // Award exactly required upvotes for this tx
          const awardHash = await addUpvotesToDispenser(user, REQUIRED_UPVOTES);
          if (awardHash) {
            console.log(`[DISPENSER] NFT awarded to ${user}! Transaction: https://basescan.org/tx/${awardHash}`);
            logInfo('award_success', {
              user,
              amount: REQUIRED_UPVOTES.toString(),
              sourceTx: log.transactionHash,
              dispenserTx: awardHash,
              sourceBasescan: `https://basescan.org/tx/${log.transactionHash}`,
              dispenserBasescan: `https://basescan.org/tx/${awardHash}`
            });
            logDispenserAction('nft_awarded', {
              user,
              amount: REQUIRED_UPVOTES.toString(),
              sourceTx: log.transactionHash,
              dispenserTx: awardHash,
              sourceBasescan: `https://basescan.org/tx/${log.transactionHash}`,
              dispenserBasescan: `https://basescan.org/tx/${awardHash}`,
              inventoryBefore: queuedNFTCount.toString()
            });
          } else {
            console.log(`[DISPENSER] Failed to award NFT to ${user}. Check logs for details.`);
            logWarning('award_failed', {
              user,
              amount: REQUIRED_UPVOTES.toString(),
              sourceTx: log.transactionHash
            });
            logDispenserAction('award_failed', {
              user,
              amount: REQUIRED_UPVOTES.toString(),
              sourceTx: log.transactionHash,
              sourceBasescan: `https://basescan.org/tx/${log.transactionHash}`,
              error: 'Transaction failed'
            });
          }

          // Track last processed block
          if (log.blockNumber && BigInt(log.blockNumber) > lastProcessedBlock) {
            lastProcessedBlock = BigInt(log.blockNumber);
          }
        }
      }
    });

    console.log('Started watching Upvoted events');
    console.log('[BOT] Net Protocol Upvote Bot is now running!');
    console.log('[BOT] Watching for', REQUIRED_UPVOTES.toString(), 'upvotes on tracked token');
    console.log('[BOT] Dispenser address:', global.NORMALIZED_DISPENSER_ADDRESS);
    console.log('[BOT] PM2 monitoring: pm2 logs net-protocol-upvote-bot');
    return unwatch;
  } catch (err) {
    console.error('[WATCH_ERROR] Failed to set up event watcher:', err.message);
    logError('watch_setup_error', err, {
      upvoteAppAddress: global.NORMALIZED_UPVOTE_APP_ADDRESS,
      trackedTokenAddress: global.NORMALIZED_TRACKED_TOKEN_ADDRESS
    });
    return null;
  }
}

// Removed batching logic: awards are per single tx with exactly 420 upvotes

async function isUpvoteMessage(data) {
  try {
    // The first 4 bytes of the data will be the function selector for upvote(address,uint256)
    const upvoteSelector = '0x' + data.slice(2, 10);
    const expectedSelector = '0x' + encodeAbiParameters(
      parseAbi(['function upvote(address token, uint256 amount)'])[0],
      []
    ).slice(2, 10);
    
    return upvoteSelector === expectedSelector;
  } catch (err) {
    console.error('Error checking upvote message:', err);
    return false;
  }
}

async function decodeUpvoteData(data) {
  try {
    // The upvote function selector is 0x2d4ba917 (upvote(address,uint256))
    const upvoteSelector = '0x2d4ba917';
    
    // Check if this is an upvote call
    if (!data.startsWith(upvoteSelector)) {
      console.log(`[DECODE] Not an upvote call, selector: ${data.slice(0, 10)}`);
      return null;
    }
    
    // Remove function selector (first 4 bytes)
    const params = data.slice(10);
    
    // First parameter is the token address (32 bytes, padded)
    const token = '0x' + params.slice(24, 64); // Take last 20 bytes of the 32 byte field
    
    // Second parameter is the amount (32 bytes)
    const amount = BigInt('0x' + params.slice(64, 96));
    
    console.log(`[DECODE] Decoded upvote: token=${token}, amount=${amount}`);
    
    return { token, amount };
  } catch (err) {
    console.error('Error decoding upvote data:', err);
    return null;
  }
}

async function decodeUpvoteFromText(text) {
  try {
    // Try to parse JSON from the text field
    const parsed = JSON.parse(text);
    
    // Look for upvote-related fields
    if (parsed.token && parsed.amount) {
      console.log(`[DECODE_TEXT] Found upvote data: token=${parsed.token}, amount=${parsed.amount}`);
      return {
        token: parsed.token,
        amount: BigInt(parsed.amount)
      };
    }
    
    // Try alternative field names
    if (parsed.upvotes && parsed.token) {
      console.log(`[DECODE_TEXT] Found upvote data: token=${parsed.token}, amount=${parsed.upvotes}`);
      return {
        token: parsed.token,
        amount: BigInt(parsed.upvotes)
      };
    }
    
    console.log(`[DECODE_TEXT] No upvote data found in text: ${text}`);
    return null;
  } catch (err) {
    console.log(`[DECODE_TEXT] Failed to parse text as JSON: ${text}`);
    return null;
  }
}

async function addUpvotesToDispenser(user, amount) {
  try {
    // Get current gas price and increase it slightly to avoid replacement issues
    const gasPrice = await publicClient.getGasPrice();
    const adjustedGasPrice = gasPrice * BigInt(120) / BigInt(100); // 20% increase

    const { request } = await publicClient.simulateContract({
      address: global.NORMALIZED_DISPENSER_ADDRESS,
      abi: DISPENSER_ABI,
      functionName: 'addUpvotes',
      args: [user, amount],
      account,
      gasPrice: adjustedGasPrice
    });

    const hash = await walletClient.writeContract(request);
    
    logInfo('dispenser_call', {
      hash,
      user,
      amount: amount.toString()
    });

    console.log(`[DISPENSER] Called addUpvotes for ${user} with ${amount} votes. Hash: ${hash}`);
    
    return hash;
  } catch (err) {
    console.error('[DISPENSER_ERROR] Failed to call addUpvotes:', err.message);
    logError('dispenser_call_error', err, {
      user,
      amount: amount.toString(),
      dispenserAddress: global.NORMALIZED_DISPENSER_ADDRESS
    });
    return null;
  }
}

async function processMessage(message, index) {
  if (!message) return;
  
  const { from, to, value, data } = message;
  
      // Log the message for debugging
    logInfo('message_processed', {
      index,
      from,
      to,
      value: value.toString(),
      data
    });

  // Check if this is an upvote message
  if (await isUpvoteMessage(data)) {
    const upvoteData = await decodeUpvoteData(data);
    
    if (upvoteData && upvoteData.token.toLowerCase() === PURR_TOKEN_ADDRESS.toLowerCase()) {
      console.log(`[UPVOTE] Found upvote for $PURR from ${from}, amount: ${upvoteData.amount}`);
      
      // Log the upvote
      logInfo('purr_upvote', {
        index,
        from,
        amount: upvoteData.amount.toString()
      });
      
      // Call the dispenser contract
      const hash = await addUpvotesToDispenser(from, upvoteData.amount);
      
      if (!hash) {
        console.error(`Failed to add upvotes for ${from}`);
      }
    }
  }
}

async function checkUserUpvotes(userAddress) {
  try {
    const upvotes = await publicClient.readContract({
      address: global.NORMALIZED_DISPENSER_ADDRESS,
      abi: DISPENSER_ABI,
      functionName: 'userUpvotes',
      args: [userAddress]
    });
    return upvotes;
  } catch (err) {
    console.error('Error checking user upvotes:', err);
    return BigInt(0);
  }
}

let heartbeatCount = 0;
const HEARTBEAT_INTERVAL = 10; // Log heartbeat every 10 ticks (2.5 minutes)

async function tick() {
  try {
    const { upvotesRequired, queuedNFTCount } = await getConfig();
    const currentTip = await getCurrentTip();

    // Persist state (cap processed log ids to last 500 for file size)
    const processed = Array.from(processedLogIds);
    const trimmed = processed.slice(Math.max(0, processed.length - 500));
    const state = {
      lastProcessed: currentTip.toString(),
      tip: currentTip.toString(),
      lastProcessedBlock: lastProcessedBlock.toString(),
      processed: trimmed
    };
    fs.writeFileSync('net_state.json', JSON.stringify(state, null, 2));

    // Increment heartbeat counter
    heartbeatCount++;
    
    // Log heartbeat every HEARTBEAT_INTERVAL ticks (less frequent)
    if (heartbeatCount % HEARTBEAT_INTERVAL === 0) {
      console.log(`[HEARTBEAT] Bot healthy - Required: ${upvotesRequired.toString()}, NFTs: ${queuedNFTCount}, Tip: ${currentTip.toString()}, Block: ${lastProcessedBlock.toString()}, Processed: ${processedLogIds.size}`);
    }
    
    // Log threshold changes (always log these)
    if (configCache.data && configCache.data.upvotesRequired !== upvotesRequired.toString()) {
      console.log(`[CONFIG] Upvotes required changed to: ${upvotesRequired.toString()}`);
      logDispenserAction('threshold_changed', {
        oldValue: configCache.data.upvotesRequired,
        newValue: upvotesRequired.toString()
      });
    }
  } catch (err) {
    console.error('[TICK_ERROR] Failed to update bot state:', err.message);
    logError('tick_error', err, {
      heartbeatCount: heartbeatCount.toString(),
      lastProcessedBlock: lastProcessedBlock.toString()
    });
  }
}

// Keep track of current log file
let currentLogFile = null;
let currentLogDate = null;

function getLogFile() {
  const today = new Date().toISOString().split('T')[0];
  
  // If we already have a log file for today, return it
  if (currentLogFile && currentLogDate === today) {
    return currentLogFile;
  }
  
  // Otherwise create a new log file for today
  const logFile = `${LOG_DIR}/${today}.jsonl`;
  
  // Clean up old log files (keep last 7 days)
  try {
    const files = fs.readdirSync(LOG_DIR);
    const oldFiles = files
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .slice(0, -7);
    
    for (const file of oldFiles) {
      fs.unlinkSync(`${LOG_DIR}/${file}`);
      console.log(`Cleaned up old log file: ${file}`);
    }
  } catch (err) {
    console.error('Error cleaning up old logs:', err);
  }
  
  currentLogFile = logFile;
  currentLogDate = today;
  
  return logFile;
}

function logToFile(msg) {
  try {
    // Ensure msg has required fields
    const logEntry = {
      ...msg,
      timestamp: msg.timestamp || Date.now(),
      level: msg.level || 'info'
    };
    
    // Add the log entry to today's log file
    const logFile = getLogFile();
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

// Helper functions for different log levels
function logInfo(type, data) {
  logToFile({ type, level: 'info', ...data });
}

function logError(type, error, data = {}) {
  logToFile({
    type,
    level: 'error',
    error: error.message,
    stack: error.stack,
    ...data
  });
}

function logWarning(type, data) {
  logToFile({ type, level: 'warn', ...data });
}



// ---------------------- MAIN LOOP ----------------------
console.log('[STARTUP] Starting Net Protocol Upvote Bot...');

// Validate configuration first
validateConfig();



// Start the event watcher for real-time upvotes
const unwatch = await watchUpvotes();
if (!unwatch) {
  console.error('[STARTUP_ERROR] Failed to start event watcher. Bot cannot function properly.');
  logError('startup_error', new Error('Event watcher failed to start'), {
    upvoteAppAddress: global.NORMALIZED_UPVOTE_APP_ADDRESS
  });
  process.exit(1);
}

// Start the polling for config updates
setInterval(tick, POLL_MS);

// Log successful startup
console.log('[STARTUP_SUCCESS] Bot started successfully and is monitoring for upvotes');
logInfo('startup_success', {
  trackedToken: global.NORMALIZED_TRACKED_TOKEN_ADDRESS,
  requiredUpvotes: REQUIRED_UPVOTES.toString(),
  dispenserAddress: global.NORMALIZED_DISPENSER_ADDRESS
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Received SIGINT, shutting down gracefully...');
  logInfo('shutdown', { reason: 'SIGINT', processedEvents: processedLogIds.size.toString() });
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Received SIGTERM, shutting down gracefully...');
  logInfo('shutdown', { reason: 'SIGTERM', processedEvents: processedLogIds.size.toString() });
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[FATAL_ERROR] Uncaught exception:', err.message);
  logError('fatal_error', err, {
    processedEvents: processedLogIds.size.toString(),
    lastProcessedBlock: lastProcessedBlock.toString()
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL_ERROR] Unhandled promise rejection:', reason);
  logError('fatal_error', new Error(reason), {
    processedEvents: processedLogIds.size.toString(),
    lastProcessedBlock: lastProcessedBlock.toString()
  });
  process.exit(1);
});