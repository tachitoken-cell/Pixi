// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

interface ISpecialistFeeReceiver { function paymentToken() external view returns (address); }

/// @notice Sealed cards are transferable. Active cards are locked to one character until the game authorizes resealing.
contract MossvaleSpecialists is ERC721Royalty, ReentrancyGuard {
    using SafeERC20 for IERC20;
    struct Progress { uint8 classId; uint32 jobXp; uint8 upgrade; bool broken; uint64 attempts; }
    struct Card { Progress progress; uint64 revision; bytes32 character; bool active; }
    struct TokenView { uint256 tokenId; address owner; Card card; uint256 price; }
    struct Order {
        bytes32 orderId; uint8 action; uint256 tokenId; uint64 revision; address wallet;
        bytes32 character; Progress progress; uint64 deadline;
    }
    bytes32 private constant PROGRESS_TYPEHASH = keccak256("Progress(uint8 classId,uint32 jobXp,uint8 upgrade,bool broken,uint64 attempts)");
    bytes32 private constant ORDER_TYPEHASH = keccak256("Order(bytes32 orderId,uint8 action,uint256 tokenId,uint64 revision,address wallet,bytes32 character,Progress progress,uint64 deadline)Progress(uint8 classId,uint32 jobXp,uint8 upgrade,bool broken,uint64 attempts)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    uint96 public constant royaltyBps = 500;
    // Storage keeps the reviewed runtime identical across deployments.
    address public authority;
    address public feeReceiver;
    mapping(uint256 => Card) public cards;
    mapping(bytes32 => bytes32) public claimedOrders;
    mapping(uint256 => uint256) public prices;
    uint256[] public tokens;
    event Transition(bytes32 indexed orderId, uint256 indexed tokenId, uint8 action, uint64 revision, bytes32 character);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 amountWei);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 amountWei);

    constructor(address gameAuthority, address royaltyReceiver) ERC721("Mossvale Specialists", "MVSP") {
        require(block.chainid == 4663, "Wrong chain");
        require(gameAuthority != address(0) && royaltyReceiver.code.length > 0 && paymentToken.code.length > 0, "Invalid deployment");
        require(ISpecialistFeeReceiver(royaltyReceiver).paymentToken() == paymentToken, "Wrong fee receiver");
        authority = gameAuthority; feeReceiver = royaltyReceiver;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }
    function progressHash(Progress memory progress) public pure returns (bytes32) {
        return keccak256(abi.encode(PROGRESS_TYPEHASH, progress.classId, progress.jobXp, progress.upgrade, progress.broken, progress.attempts));
    }
    function orderHash(Order calldata order) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleSpecialists"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(ORDER_TYPEHASH, order.orderId, order.action, order.tokenId, order.revision, order.wallet, order.character, progressHash(order.progress), order.deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }
    function transition(Order calldata order, bytes calldata signature) external nonReentrant {
        require(order.orderId != bytes32(0) && claimedOrders[order.orderId] == bytes32(0), "Order already used");
        require(order.wallet == msg.sender && order.character != bytes32(0) && order.tokenId != 0, "Wrong owner");
        require(block.timestamp <= order.deadline, "Order expired");
        require(order.progress.classId < 4 && order.progress.jobXp <= 180500 && order.progress.upgrade <= 15 && order.progress.attempts <= 9007199254740991, "Invalid progress");
        bytes32 digest = orderHash(order);
        require(ECDSA.recover(digest, signature) == authority, "Unauthorized order");
        Card storage card = cards[order.tokenId];
        require(card.revision == order.revision, "Stale revision");
        if (order.action == 0) {
            require(_ownerOf(order.tokenId) == address(0) && order.revision == 0, "Already minted");
            card.progress = order.progress;
            card.revision = 1;
            tokens.push(order.tokenId);
        } else {
            require(ownerOf(order.tokenId) == msg.sender, "Not owner");
            if (order.action == 1) {
                require(!card.active && progressHash(card.progress) == progressHash(order.progress), "Card unavailable");
                card.active = true; card.character = order.character;
            } else {
                require(order.action == 2 && card.active && card.character == order.character, "Wrong character");
                require(order.progress.classId == card.progress.classId && order.progress.jobXp >= card.progress.jobXp && order.progress.upgrade >= card.progress.upgrade && order.progress.attempts >= card.progress.attempts, "Progress decreased");
                card.progress = order.progress; card.active = false; card.character = bytes32(0);
            }
            card.revision++;
        }
        claimedOrders[order.orderId] = digest;
        delete prices[order.tokenId];
        if (order.action == 0) _safeMint(order.wallet, order.tokenId);
        emit Transition(order.orderId, order.tokenId, order.action, card.revision, order.character);
    }
    function list(uint256 tokenId, uint256 amountWei) external {
        require(ownerOf(tokenId) == msg.sender && !cards[tokenId].active, "Seal your card first");
        prices[tokenId] = amountWei;
        emit Listed(tokenId, msg.sender, amountWei);
    }
    function buy(uint256 tokenId, address seller, uint64 revision, uint256 amountWei) external nonReentrant {
        require(amountWei > 0 && prices[tokenId] == amountWei && ownerOf(tokenId) == seller && seller != msg.sender && cards[tokenId].revision == revision && !cards[tokenId].active, "Listing changed");
        delete prices[tokenId];
        uint256 royalty = amountWei / 10000 * royaltyBps + amountWei % 10000 * royaltyBps / 10000;
        IERC20(paymentToken).safeTransferFrom(msg.sender, feeReceiver, royalty);
        IERC20(paymentToken).safeTransferFrom(msg.sender, seller, amountWei - royalty);
        _safeTransfer(seller, msg.sender, tokenId);
        emit Sold(tokenId, seller, msg.sender, amountWei);
    }
    function totalSupply() external view returns (uint256) { return tokens.length; }
    function page(uint256 offset) external view returns (TokenView[] memory result) {
        uint256 count = offset >= tokens.length ? 0 : tokens.length - offset;
        if (count > 20) count = 20;
        result = new TokenView[](count);
        for (uint256 i; i < count; ++i) { uint256 tokenId = tokens[offset + i]; result[i] = TokenView(tokenId, ownerOf(tokenId), cards[tokenId], prices[tokenId]); }
    }
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId); Card memory card = cards[tokenId];
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"Mossvale Specialist +', Strings.toString(card.progress.upgrade), '","description":"A transferable specialist card. Active cards are locked to their character; broken cards retain all progression.","attributes":[{"trait_type":"Class","value":', Strings.toString(card.progress.classId),
            '},{"trait_type":"Job XP","value":', Strings.toString(card.progress.jobXp), '},{"trait_type":"Upgrade","value":', Strings.toString(card.progress.upgrade),
            '},{"trait_type":"Attempts","value":', Strings.toString(card.progress.attempts), '},{"trait_type":"Broken","value":"', card.progress.broken ? "Yes" : "No", '"}]}'))));
    }
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        require(!cards[tokenId].active, "Active specialist is locked");
        delete prices[tokenId];
        return super._update(to, tokenId, auth);
    }
}
