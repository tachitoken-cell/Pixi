// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICreatorToken {
    event TransferValidatorUpdated(address oldValidator, address newValidator);
    function getTransferValidator() external view returns (address);
    function getTransferValidationFunction() external view returns (bytes4, bool);
    function setTransferValidator(address validator) external;
}

interface INFTTransferValidator {
    function validateTransfer(address caller, address from, address to, uint256 tokenId) external view;
}

interface IMossFeeReceiver {
    function paymentToken() external view returns (address);
}

interface IBurnableMoss is IERC20 {
    function burn(uint256 amount) external;
}

/// @notice Deploy once for Mossvale Pets and once for Mossvale Houses. Game access follows ownerOf.
contract MossvaleNFT is ERC721Royalty, Ownable2Step, ReentrancyGuard, ICreatorToken {
    using SafeERC20 for IERC20;

    struct Mint {
        bytes32 orderId;
        uint256 tokenId;
        uint256 assetId;
        address buyer;
        uint256 amountWei;
        uint64 deadline;
    }

    struct HouseAuction {
        address highestBidder;
        uint256 highestBidWei;
        bool settled;
    }

    bytes32 private constant MINT_TYPEHASH = keccak256("Mint(bytes32 orderId,uint256 tokenId,uint256 assetId,address buyer,uint256 amountWei,uint64 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    uint96 public constant royaltyBps = 500;
    // Constructor-only storage preserves one verifiable runtime hash for both collections.
    address public authority;
    address public feeReceiver;
    bool public houseCollection;
    string public contractURI;
    string private metadataBaseURI;
    address private transferValidator;
    mapping(bytes32 => bytes32) public claimedOrders;
    mapping(uint256 => uint256) public assets;
    mapping(address => mapping(uint256 => uint256)) public assetBalance;
    uint64 public auctionsOpenedAt;
    uint64 public auctionEndsAt;
    uint256 public auctionReserveWei;
    mapping(uint256 => HouseAuction) public houseAuctions;
    mapping(address => uint256) public refunds;

    event Minted(bytes32 indexed orderId, bytes32 indexed mintHash, address indexed buyer, uint256 tokenId, uint256 assetId, uint256 amountWei);
    event AuctionsOpened(uint256 reserveWei, uint64 openedAt, uint64 endsAt);
    event HouseBid(uint256 indexed assetId, address indexed bidder, uint256 amountWei);
    event HouseSettled(uint256 indexed assetId, address indexed winner, uint256 amountBurned);
    event RefundWithdrawn(address indexed bidder, uint256 amountWei);

    constructor(bool houses, address gameAuthority, address royaltyReceiver,
        string memory baseURI, string memory collectionURI)
        ERC721(houses ? "Mossvale Houses" : "Mossvale Pets", houses ? "MVHOUSES" : "MVPETS") Ownable(msg.sender)
    {
        require(block.chainid == 4663, "Wrong chain");
        require(gameAuthority != address(0), "Missing authority");
        require(paymentToken.code.length > 0 && royaltyReceiver.code.length > 0, "Missing token or receiver");
        require(IMossFeeReceiver(royaltyReceiver).paymentToken() == paymentToken, "Wrong fee token");
        require(bytes(baseURI).length > 0 && bytes(collectionURI).length > 0, "Missing metadata");
        authority = gameAuthority;
        feeReceiver = royaltyReceiver;
        houseCollection = houses;
        metadataBaseURI = baseURI;
        contractURI = collectionURI;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    function mintHash(Mint calldata order) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleNFT"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(MINT_TYPEHASH, order.orderId, order.tokenId, order.assetId, order.buyer, order.amountWei, order.deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function mint(Mint calldata order, bytes calldata signature) external nonReentrant {
        require(!houseCollection, "Houses are auctioned");
        require(order.orderId != bytes32(0) && claimedOrders[order.orderId] == bytes32(0), "Order claimed or invalid");
        require(msg.sender == order.buyer && order.buyer != address(0), "Wrong buyer");
        require(block.timestamp <= order.deadline, "Order expired");
        require(order.assetId > 0 && order.assetId <= 8, "Unknown asset");
        require(order.tokenId == uint256(order.orderId) && order.amountWei == 0, "Invalid pet terms");
        require(_ownerOf(order.tokenId) == address(0), "Asset already minted");
        bytes32 digest = mintHash(order);
        require(ECDSA.recover(digest, signature) == authority, "Unauthorized mint");
        claimedOrders[order.orderId] = digest;
        assets[order.tokenId] = order.assetId;
        _safeMint(order.buyer, order.tokenId);
        emit Minted(order.orderId, digest, order.buyer, order.tokenId, order.assetId, order.amountWei);
    }

    /// @notice The owner fixes the opening MOSS reserve once, after obtaining the USD quote.
    function openAuctions(uint256 reserveWei) external onlyOwner {
        require(houseCollection && auctionsOpenedAt == 0, "Auctions unavailable");
        require(reserveWei > 0, "Missing reserve");
        auctionsOpenedAt = uint64(block.timestamp);
        auctionEndsAt = uint64(block.timestamp + 4 hours);
        auctionReserveWei = reserveWei;
        emit AuctionsOpened(reserveWei, auctionsOpenedAt, auctionEndsAt);
    }

    /// @notice amountWei is the total bid; the current leader only pays the increase.
    function bidHouse(uint256 assetId, uint256 amountWei, uint256 paymentWei) external nonReentrant {
        require(houseCollection && assetId > 0 && assetId <= 4, "Unknown house");
        require(auctionsOpenedAt != 0 && block.timestamp < auctionEndsAt, "Bidding closed");
        HouseAuction storage auction = houseAuctions[assetId];
        require(!auction.settled && amountWei >= auctionReserveWei && amountWei > auction.highestBidWei, "Bid too low");
        uint256 payment = amountWei;
        if (auction.highestBidder == msg.sender) {
            payment -= auction.highestBidWei;
        } else if (auction.highestBidder != address(0)) {
            refunds[auction.highestBidder] += auction.highestBidWei;
        }
        require(payment == paymentWei, "Bid payment changed");
        auction.highestBidder = msg.sender;
        auction.highestBidWei = amountWei;
        IERC20 token = IERC20(paymentToken);
        uint256 bidderBefore = token.balanceOf(msg.sender);
        uint256 escrowBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), payment);
        require(bidderBefore >= payment && token.balanceOf(msg.sender) == bidderBefore - payment
            && token.balanceOf(address(this)) == escrowBefore + payment, "Incorrect bid payment");
        emit HouseBid(assetId, msg.sender, amountWei);
    }

    /// @notice Only displaced bids are refundable. Leading bids remain locked for settlement.
    function withdrawRefund() external nonReentrant {
        uint256 amount = refunds[msg.sender];
        require(amount > 0, "No refund");
        refunds[msg.sender] = 0;
        IERC20 token = IERC20(paymentToken);
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 bidderBefore = token.balanceOf(msg.sender);
        token.safeTransfer(msg.sender, amount);
        require(escrowBefore >= amount && token.balanceOf(address(this)) == escrowBefore - amount
            && token.balanceOf(msg.sender) == bidderBefore + amount, "Incorrect refund");
        emit RefundWithdrawn(msg.sender, amount);
    }

    /// @notice Anyone may finalize. The winner receives the deed and the entire winning MOSS bid burns.
    function settleHouse(uint256 assetId) external nonReentrant {
        require(houseCollection && assetId > 0 && assetId <= 4, "Unknown house");
        require(auctionsOpenedAt != 0 && block.timestamp >= auctionEndsAt, "Auction not ended");
        HouseAuction storage auction = houseAuctions[assetId];
        require(!auction.settled, "House settled");
        auction.settled = true;
        address winner = auction.highestBidder;
        uint256 amount = auction.highestBidWei;
        if (winner != address(0)) {
            IBurnableMoss token = IBurnableMoss(paymentToken);
            uint256 escrowBefore = token.balanceOf(address(this));
            uint256 supplyBefore = token.totalSupply();
            token.burn(amount);
            require(escrowBefore >= amount && token.balanceOf(address(this)) == escrowBefore - amount
                && supplyBefore >= amount && token.totalSupply() == supplyBefore - amount, "Incorrect house burn");
            assets[assetId] = assetId;
            // The bidder opts into owning the deed. No receiver callback can block finalization.
            _mint(winner, assetId);
        }
        emit HouseSettled(assetId, winner, amount);
    }

    function houseOwner(uint256 assetId) external view returns (address) {
        return houseCollection && assetId > 0 && assetId <= 4 ? _ownerOf(assetId) : address(0);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(metadataBaseURI, Strings.toString(assets[tokenId]), ".json");
    }

    /// @dev OpenSea's documented ICreatorToken hook. Enforcement requires a configured validator and Seaport zone.
    function setTransferValidator(address validator) external onlyOwner {
        require(validator == address(0) || validator.code.length > 0, "Validator has no code");
        emit TransferValidatorUpdated(transferValidator, validator);
        transferValidator = validator;
    }

    function getTransferValidator() external view returns (address) { return transferValidator; }

    function getTransferValidationFunction() external pure returns (bytes4, bool) {
        return (INFTTransferValidator.validateTransfer.selector, true);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(ICreatorToken).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && transferValidator != address(0)) {
            INFTTransferValidator(transferValidator).validateTransfer(_msgSender(), from, to, tokenId);
        }
        address previousOwner = super._update(to, tokenId, auth);
        uint256 assetId = assets[tokenId];
        if (previousOwner != address(0)) assetBalance[previousOwner][assetId] -= 1;
        if (to != address(0)) assetBalance[to][assetId] += 1;
        return previousOwner;
    }
}
