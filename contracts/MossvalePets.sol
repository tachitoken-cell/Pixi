// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MossvaleNFT, ICreatorToken, INFTTransferValidator, IMossFeeReceiver} from "MossvaleNFT.sol";

/// @notice Expandable pet claims and optional one-for-one migration of the original collection.
contract MossvalePets is ERC721Royalty, Ownable2Step, ReentrancyGuard, ICreatorToken {
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
    bytes32 private constant LEGACY_RUNTIME_HASH = 0xa1da5810984c46ad9b417b6a75ac28104036abb3dfe65d21a154a58ddbb1295f;
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    uint96 public constant royaltyBps = 500;
    bool public constant houseCollection = false;
    // Constructor-only storage keeps the reviewed runtime identical across deployments.
    address public legacyCollection;
    address public authority;
    address public feeReceiver;
    string public contractURI;
    string private metadataBaseURI;
    address private transferValidator;
    mapping(bytes32 => bytes32) public claimedOrders;
    mapping(uint256 => uint256) public assets;
    mapping(address => mapping(uint256 => uint256)) public assetBalance;

    event Minted(bytes32 indexed orderId, bytes32 indexed mintHash, address indexed buyer, uint256 tokenId, uint256 assetId, uint256 amountWei);
    event Migrated(address indexed owner, uint256 indexed tokenId, uint256 indexed assetId);

    constructor(address legacy, address gameAuthority, address royaltyReceiver,
        string memory baseURI, string memory collectionURI)
        ERC721("Mossvale Pets", "MVPETS") Ownable(msg.sender)
    {
        require(block.chainid == 4663, "Wrong chain");
        require(legacy.codehash == LEGACY_RUNTIME_HASH, "Wrong legacy contract");
        MossvaleNFT original = MossvaleNFT(legacy);
        require(!original.houseCollection() && original.paymentToken() == paymentToken
            && keccak256(bytes(original.name())) == keccak256("Mossvale Pets"), "Wrong legacy collection");
        require(gameAuthority != address(0) && original.authority() == gameAuthority, "Wrong authority");
        require(paymentToken.code.length > 0 && royaltyReceiver.code.length > 0
            && original.feeReceiver() == royaltyReceiver
            && IMossFeeReceiver(royaltyReceiver).paymentToken() == paymentToken, "Wrong fee receiver");
        require(bytes(baseURI).length > 0 && bytes(collectionURI).length > 0, "Missing metadata");
        legacyCollection = legacy;
        authority = gameAuthority;
        feeReceiver = royaltyReceiver;
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
        require(order.orderId != bytes32(0) && claimedOrders[order.orderId] == bytes32(0), "Order claimed or invalid");
        require(msg.sender == order.buyer && order.buyer != address(0), "Wrong buyer");
        require(block.timestamp <= order.deadline, "Order expired");
        // The game authority signs the species catalog; adding species never needs a new contract.
        require(order.assetId > 0, "Unknown asset");
        require(order.tokenId == uint256(order.orderId) && order.amountWei == 0, "Invalid pet terms");
        require(_ownerOf(order.tokenId) == address(0) && MossvaleNFT(legacyCollection).assets(order.tokenId) == 0, "Asset already minted");
        bytes32 digest = mintHash(order);
        require(ECDSA.recover(digest, signature) == authority, "Unauthorized mint");
        claimedOrders[order.orderId] = digest;
        assets[order.tokenId] = order.assetId;
        _safeMint(order.buyer, order.tokenId);
        emit Minted(order.orderId, digest, order.buyer, order.tokenId, order.assetId, order.amountWei);
    }

    /// @notice Approve this contract for this token first. The original stays locked here permanently.
    function migrate(uint256 tokenId) external nonReentrant {
        MossvaleNFT original = MossvaleNFT(legacyCollection);
        require(original.ownerOf(tokenId) == msg.sender, "Not legacy owner");
        require(original.getApproved(tokenId) == address(this), "Approve this token");
        require(_ownerOf(tokenId) == address(0), "Asset already minted");
        uint256 assetId = original.assets(tokenId);
        require(assetId > 0 && assetId <= 8, "Unknown legacy asset");
        assets[tokenId] = assetId;
        original.transferFrom(msg.sender, address(this), tokenId);
        _safeMint(msg.sender, tokenId);
        emit Migrated(msg.sender, tokenId, assetId);
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
