// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

contract MegapurrDispenser is IERC721Receiver {
    address public owner;
    address public nftContract;
    address public trackedToken;
    uint256 public upvotesRequired = 420;
    
    uint256[] public queuedNFTs;
    mapping(address => uint256) public userUpvotes;
    
    event NFTQueued(uint256 tokenId);
    event NFTClaimed(address indexed user, uint256 tokenId);
    event UpvotesAdded(address indexed user, uint256 count);
    event NFTRescued(address indexed to, uint256 tokenId);
    event AllNFTsRescued(address indexed to, uint256 count);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _nftContract, address _trackedToken) {
        owner = msg.sender;
        nftContract = _nftContract;
        trackedToken = _trackedToken;
    }
    
    // Gas-optimized: minimal operations, no complex logic
    function addUpvotes(address user, uint256 numVotes) external onlyOwner {
        userUpvotes[user] += numVotes;
        emit UpvotesAdded(user, numVotes);
        
        // Simple check: if user has enough upvotes and we have NFTs, give them one
        if (userUpvotes[user] >= upvotesRequired && queuedNFTs.length > 0) {
            uint256 tokenId = queuedNFTs[queuedNFTs.length - 1];
            queuedNFTs.pop();
            userUpvotes[user] -= upvotesRequired;
            IERC721(nftContract).safeTransferFrom(address(this), user, tokenId);
            emit NFTClaimed(user, tokenId);
        }
    }
    
    function queueNFT(uint256 tokenId) external {
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not owner");
        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);
        queuedNFTs.push(tokenId);
        emit NFTQueued(tokenId);
    }
    
    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external override returns (bytes4) {
        require(msg.sender == nftContract, "Only accepted NFTs");
        queuedNFTs.push(tokenId);
        emit NFTQueued(tokenId);
        return this.onERC721Received.selector;
    }
    
    receive() external payable {}
    fallback() external payable {}
    
    // Admin functions
    function setUpvotesRequired(uint256 newThreshold) external onlyOwner {
        upvotesRequired = newThreshold;
    }
    
    function setTrackedToken(address newToken) external onlyOwner {
        trackedToken = newToken;
    }
    
    function setNftContract(address newNftContract) external onlyOwner {
        nftContract = newNftContract;
    }
    
    // Rescue functions
    function rescueNFT(address to, uint256 tokenId) external onlyOwner {
        IERC721(nftContract).safeTransferFrom(address(this), to, tokenId);
        emit NFTRescued(to, tokenId);
    }
    
    function rescueAllNFTs(address to) external onlyOwner {
        uint256 count = queuedNFTs.length;
        for (uint256 i = 0; i < count; i++) {
            IERC721(nftContract).safeTransferFrom(address(this), to, queuedNFTs[i]);
        }
        delete queuedNFTs;
        emit AllNFTsRescued(to, count);
    }
    
    // View functions
    function getQueuedNFTs() external view returns (uint256[] memory) {
        return queuedNFTs;
    }
}