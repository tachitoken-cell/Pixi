// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Fund by transferring MOSS here. Pays one-use, wallet-bound game claims.
/// The fixed owner can withdraw MOSS. Claims remain valid but may need a later top-up.
/// There is no upgrade, expiry, or authority replacement.
contract MossvaleTreasureTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Claim {
        bytes32 claimId;
        bytes32 characterId;
        address recipient;
        uint256 amountWei;
    }
    bytes32 private constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 claimId,bytes32 characterId,address recipient,uint256 amountWei)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    address public authority;
    address public owner;
    uint256 public totalPaid;
    mapping(bytes32 => bytes32) public paidClaims;
    event Withdrawn(address indexed owner, uint256 amountWei);
    event Claimed(bytes32 indexed claimId, bytes32 indexed claimHash, address indexed recipient, bytes32 characterId, uint256 amountWei);

    constructor(address gameAuthority, address treasuryOwner) {
        require(block.chainid == 4663, "Wrong chain");
        require(gameAuthority != address(0), "Missing authority");
        require(treasuryOwner != address(0), "Missing owner");
        require(paymentToken.code.length > 0, "Missing MOSS token");
        authority = gameAuthority;
        owner = treasuryOwner;
    }

    function withdraw(uint256 amountWei) external nonReentrant {
        require(msg.sender == owner, "Only owner");
        require(amountWei > 0, "Wrong amount");
        IERC20 token = IERC20(paymentToken);
        uint256 treasuryBefore = token.balanceOf(address(this));
        uint256 ownerBefore = token.balanceOf(owner);
        token.safeTransfer(owner, amountWei);
        require(token.balanceOf(address(this)) == treasuryBefore - amountWei
            && token.balanceOf(owner) == ownerBefore + amountWei, "Wrong withdrawal amount");
        emit Withdrawn(owner, amountWei);
    }

    function claimHash(Claim calldata reward) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleTreasureTreasury"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(CLAIM_TYPEHASH, reward.claimId, reward.characterId, reward.recipient, reward.amountWei));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function claim(Claim calldata reward, bytes calldata signature) external nonReentrant {
        require(reward.claimId != bytes32(0) && paidClaims[reward.claimId] == bytes32(0), "Claim paid or invalid");
        require(reward.characterId != bytes32(0) && reward.recipient != address(0) && msg.sender == reward.recipient, "Wrong recipient");
        require(reward.amountWei > 0, "Wrong amount");
        bytes32 digest = claimHash(reward);
        require(ECDSA.recover(digest, signature) == authority, "Unauthorized claim");
        paidClaims[reward.claimId] = digest;
        totalPaid += reward.amountWei;
        IERC20 token = IERC20(paymentToken);
        uint256 treasuryBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(reward.recipient);
        token.safeTransfer(reward.recipient, reward.amountWei);
        require(token.balanceOf(address(this)) == treasuryBefore - reward.amountWei
            && token.balanceOf(reward.recipient) == recipientBefore + reward.amountWei, "Wrong payout amount");
        emit Claimed(reward.claimId, digest, reward.recipient, reward.characterId, reward.amountWei);
    }
}
