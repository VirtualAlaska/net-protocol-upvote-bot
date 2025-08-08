// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ==================== INTERFACES ====================

/**
 * @dev Interface for ERC721 token functions
 */
interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @dev Interface for ERC721 receiver
 */
interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

/**
 * @title MegapurrDispenser
 * @dev A smart contract that dispenses NFTs to users who reach a required upvote threshold
 * on the Net Protocol. Users can queue NFTs, and the contract automatically awards them
 * when users accumulate enough upvotes.
 */
contract MegapurrDispenser is IERC721Receiver {
    // ==================== STATE VARIABLES ====================
    
    /// @dev The owner of the contract who can call admin functions
    address public owner;
    
    /// @dev The NFT contract address whose tokens can be queued and dispensed
    address public nftContract;
    
    /// @dev The token address that is tracked for upvotes (e.g., $PURR token)
    address public trackedToken;
    
    /// @dev The number of upvotes required to claim an NFT (default: 200)
    uint256 public upvotesRequired = 200;

    /// @dev Array of token IDs that are queued and available for claiming
    uint256[] public queuedNFTs;
    
    /// @dev Mapping from user address to their current upvote count
    mapping(address => uint256) public userUpvotes;

    // ==================== EVENTS ====================
    
    /// @dev Emitted when an NFT is queued in the dispenser
    event NFTQueued(uint256 tokenId);
    
    /// @dev Emitted when a user claims an NFT
    event NFTClaimed(address indexed user, uint256 tokenId);
    
    /// @dev Emitted when upvotes are added to a user's count
    event UpvotesAdded(address indexed user, uint256 count);
    
    /// @dev Emitted when an NFT is rescued by the owner
    event NFTRescued(address indexed to, uint256 tokenId);
    
    /// @dev Emitted when all NFTs are rescued by the owner
    event AllNFTsRescued(address indexed to, uint256 count);
    
    /// @dev Emitted when the NFT contract address is updated
    event NFTContractUpdated(address indexed newNftContract);
    
    /// @dev Emitted when multiple NFTs are queued in bulk
    event BulkNFTsQueued(uint256[] tokenIds);

    // ==================== MODIFIERS ====================
    
    /// @dev Restricts function access to the contract owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ==================== CONSTRUCTOR ====================
    
    /**
     * @dev Initializes the contract with the NFT contract and tracked token addresses
     * @param _nftContract The address of the NFT contract
     * @param _trackedToken The address of the token to track for upvotes
     */
    constructor(address _nftContract, address _trackedToken) {
        owner = msg.sender;
        nftContract = _nftContract;
        trackedToken = _trackedToken;
    }

    // ==================== CORE FUNCTIONS ====================
    
    /**
     * @dev Adds upvotes to a user's count and awards an NFT if they reach the threshold
     * @param user The address of the user to add upvotes to
     * @param numVotes The number of upvotes to add
     */
    function addUpvotes(address user, uint256 numVotes) external onlyOwner {
        require(numVotes > 0, "No votes");
        userUpvotes[user] += numVotes;

        emit UpvotesAdded(user, numVotes);

        // Check if user has enough upvotes and there are NFTs available
        if (userUpvotes[user] >= upvotesRequired && queuedNFTs.length > 0) {
            // Get the last NFT in the queue (LIFO - Last In, First Out)
            uint256 tokenId = queuedNFTs[queuedNFTs.length - 1];
            queuedNFTs.pop();

            // Deduct the required upvotes from user's count
            userUpvotes[user] -= upvotesRequired;

            // Transfer the NFT to the user
            IERC721(nftContract).safeTransferFrom(address(this), user, tokenId);
            emit NFTClaimed(user, tokenId);
        }
    }

    /**
     * @dev Allows users to queue their NFTs in the dispenser
     * @param tokenId The ID of the NFT to queue
     */
    function queueNFT(uint256 tokenId) external {
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not NFT owner");

        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);
        queuedNFTs.push(tokenId);

        emit NFTQueued(tokenId);
    }

    /**
     * @dev Handles bulk NFT transfers from OpenSea or other marketplaces
     * @param tokenIds Array of token IDs to queue
     */
    function bulkQueueNFTs(uint256[] calldata tokenIds) external {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not NFT owner");
            
            IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);
            queuedNFTs.push(tokenId);
            
            emit NFTQueued(tokenId);
        }
        
        emit BulkNFTsQueued(tokenIds);
    }

    // ==================== ERC721 RECEIVER ====================
    
    /**
     * @dev Handles incoming NFT transfers via safeTransferFrom
     * @param tokenId The ID of the NFT being transferred
     * @return The function selector to confirm receipt
     */
    function onERC721Received(address /* operator */, address /* from */, uint256 tokenId, bytes calldata /* data */) external override returns (bytes4) {
        require(msg.sender == nftContract, "Only Megapurrs accepted");
        
        // Check if NFT is already queued to prevent duplicates
        bool alreadyQueued = false;
        for (uint256 i = 0; i < queuedNFTs.length; i++) {
            if (queuedNFTs[i] == tokenId) {
                alreadyQueued = true;
                break;
            }
        }
        
        if (!alreadyQueued) {
            queuedNFTs.push(tokenId);
            emit NFTQueued(tokenId);
        }
        
        return this.onERC721Received.selector;
    }

    // ==================== FALLBACK FUNCTIONS ====================
    
    /**
     * @dev Handles ETH sent to the contract
     */
    receive() external payable {
        // Accept any ETH sent to the contract
    }

    /**
     * @dev Handles any calls to the contract that don't match other functions
     */
    fallback() external payable {
        // Accept any calls to the contract
    }

    // ==================== ADMIN FUNCTIONS ====================
    
    /**
     * @dev Updates the required number of upvotes to claim an NFT
     * @param newThreshold The new upvote threshold
     */
    function setUpvotesRequired(uint256 newThreshold) external onlyOwner {
        upvotesRequired = newThreshold;
    }

    /**
     * @dev Updates the tracked token address
     * @param newToken The new token address to track
     */
    function setTrackedToken(address newToken) external onlyOwner {
        trackedToken = newToken;
    }

    /**
     * @dev Updates the NFT contract address
     * @param newNftContract The new NFT contract address
     */
    function setNftContract(address newNftContract) external onlyOwner {
        nftContract = newNftContract;
        emit NFTContractUpdated(newNftContract);
    }

    // ==================== RESCUE FUNCTIONS ====================
    
    /**
     * @dev Allows the owner to rescue a specific NFT from the contract
     * @param to The address to send the NFT to
     * @param tokenId The ID of the NFT to rescue
     */
    function rescueNFT(address to, uint256 tokenId) external onlyOwner {
        IERC721(nftContract).safeTransferFrom(address(this), to, tokenId);
        emit NFTRescued(to, tokenId);
    }

    /**
     * @dev Allows the owner to rescue all NFTs from the contract
     * @param to The address to send all NFTs to
     */
    function rescueAllNFTs(address to) external onlyOwner {
        uint256 count = queuedNFTs.length;
        for (uint256 i = 0; i < count; i++) {
            IERC721(nftContract).safeTransferFrom(address(this), to, queuedNFTs[i]);
        }
        delete queuedNFTs;
        emit AllNFTsRescued(to, count);
    }

    // ==================== VIEW FUNCTIONS ====================
    
    /**
     * @dev Returns the array of queued NFT token IDs
     * @return Array of token IDs currently queued in the dispenser
     */
    function getQueuedNFTs() external view returns (uint256[] memory) {
        return queuedNFTs;
    }

    // ==================== EMERGENCY FUNCTIONS ====================
    
    /**
     * @dev Allows the owner to withdraw any ETH sent to the contract
     */
    function withdrawETH() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}