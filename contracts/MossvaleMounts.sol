// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICreatorToken, INFTTransferValidator, IMossFeeReceiver} from "MossvaleNFT.sol";

/// @notice Expandable mount claims. Asset numbers are permanent and appended by the collection owner.
contract MossvaleMounts is ERC721Royalty, Ownable2Step, ReentrancyGuard, ICreatorToken {
    struct Mint {
        bytes32 orderId;
        uint256 tokenId;
        uint256 assetId;
        address buyer;
        uint256 amountWei;
        uint64 deadline;
    }

    bytes32 private constant MINT_TYPEHASH = keccak256("Mint(bytes32 orderId,uint256 tokenId,uint256 assetId,address buyer,uint256 amountWei,uint64 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    uint96 public constant royaltyBps = 500;
    bool public constant houseCollection = false;
    // Constructor-only storage keeps the reviewed runtime identical across deployments.
    uint256 public maxAssetId;
    address public authority;
    address public feeReceiver;
    string public contractURI;
    string private metadataBaseURI;
    address private transferValidator;
    mapping(bytes32 => bytes32) public claimedOrders;
    mapping(uint256 => uint256) public assets;
    mapping(address => mapping(uint256 => uint256)) public assetBalance;

    event Minted(bytes32 indexed orderId, bytes32 indexed mintHash, address indexed buyer, uint256 tokenId, uint256 assetId, uint256 amountWei);
    event CatalogExpanded(uint256 maxAssetId);
    event MetadataUpdated(string baseURI, string collectionURI);

    constructor(address gameAuthority, address royaltyReceiver, uint256 initialMaxAssetId,
        string memory baseURI, string memory collectionURI)
        ERC721("Mossvale Mounts", "MVMOUNTS") Ownable(msg.sender)
    {
        require(block.chainid == 4663, "Wrong chain");
        require(gameAuthority != address(0), "Wrong authority");
        require(paymentToken.code.length > 0 && royaltyReceiver.code.length > 0
            && IMossFeeReceiver(royaltyReceiver).paymentToken() == paymentToken, "Wrong fee receiver");
        require(initialMaxAssetId > 0, "Missing catalog");
        require(bytes(baseURI).length > 0 && bytes(collectionURI).length > 0, "Missing metadata");
        authority = gameAuthority;
        feeReceiver = royaltyReceiver;
        maxAssetId = initialMaxAssetId;
        metadataBaseURI = baseURI;
        contractURI = collectionURI;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    function expandCatalog(uint256 nextMaxAssetId) external onlyOwner {
        require(nextMaxAssetId > maxAssetId, "Catalog can only expand");
        maxAssetId = nextMaxAssetId;
        emit CatalogExpanded(nextMaxAssetId);
    }

    function setMetadata(string calldata baseURI, string calldata collectionURI) external onlyOwner {
        require(bytes(baseURI).length > 0 && bytes(collectionURI).length > 0, "Missing metadata");
        metadataBaseURI = baseURI;
        contractURI = collectionURI;
        emit MetadataUpdated(baseURI, collectionURI);
    }

    function mintHash(Mint calldata order) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleNFT"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(MINT_TYPEHASH, order.orderId, order.tokenId, order.assetId, order.buyer, order.amountWei, order.deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function mint(Mint calldata order, bytes calldata signature) external nonReentrant {
        require(order.orderId != bytes32(0) && claimedOrders[order.orderId] == bytes32(0), "Order claimed or invalid");
        require(msg.sender == order.buyer && order.buyer != address(0), "Wrong buyer");
        require(block.timestamp <= order.deadline, "Order expired");
        require(order.assetId > 0 && order.assetId <= maxAssetId, "Unknown asset");
        require(order.tokenId == uint256(order.orderId) && order.amountWei == 0, "Invalid mount terms");
        require(_ownerOf(order.tokenId) == address(0), "Asset already minted");
        bytes32 digest = mintHash(order);
        require(ECDSA.recover(digest, signature) == authority, "Unauthorized mint");
        claimedOrders[order.orderId] = digest;
        assets[order.tokenId] = order.assetId;
        _safeMint(order.buyer, order.tokenId);
        emit Minted(order.orderId, digest, order.buyer, order.tokenId, order.assetId, order.amountWei);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(metadataBaseURI, Strings.toString(assets[tokenId]), ".json");
    }

    function assetBalances(address wallet, uint256[] calldata assetIds) external view returns (uint256[] memory balances) {
        balances = new uint256[](assetIds.length);
        for (uint256 i; i < assetIds.length; ++i) balances[i] = assetBalance[wallet][assetIds[i]];
    }

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
