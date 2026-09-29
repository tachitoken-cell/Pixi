// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

interface IArenaToken {
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function burn(uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Equal, wallet-funded MOSS stakes. A signed game result pays the winner;
/// a draw or permissionless timeout returns stakes without tax. No owner withdrawals.
contract MossvaleArena {
    struct Match {
        bytes32 matchId;
        address playerA;
        address playerB;
        uint256 stakeWei;
        uint64 fundingDeadline;
        uint64 refundAfter;
    }
    struct State {
        bytes32 termsHash;
        uint8 funded;
        bool closed;
    }

    bytes32 private constant MATCH_TYPEHASH = keccak256("Match(bytes32 matchId,address playerA,address playerB,uint256 stakeWei,uint64 fundingDeadline,uint64 refundAfter)");
    bytes32 private constant RESULT_TYPEHASH = keccak256("Result(bytes32 matchId,bytes32 termsHash,address winner)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    address public constant devTeam = 0x6D96b833C760774175Cc6E2c4F7424122EA3798f;
    uint256 public constant TAX_BPS = 500;
    address public authority;
    address public treasury;
    mapping(bytes32 => State) public matches;
    bool private entered;

    event Funded(bytes32 indexed matchId, bytes32 indexed termsHash, address indexed player, uint256 stakeWei);
    event Settled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 burned, uint256 treasuryAmount, uint256 devAmount);
    event Refunded(bytes32 indexed matchId, uint8 funded, uint256 stakeWei);

    constructor(address gameAuthority, address treasuryRecipient) {
        require(block.chainid == 4663, "Wrong chain");
        require(gameAuthority != address(0), "Missing authority");
        require(treasuryRecipient != address(0) && treasuryRecipient != address(this), "Invalid treasury");
        require(paymentToken.code.length > 0, "Missing MOSS token");
        authority = gameAuthority;
        treasury = treasuryRecipient;
    }

    modifier nonReentrant() {
        require(!entered, "Reentrant call");
        entered = true;
        _;
        entered = false;
    }

    function typedHash(bytes32 data) private view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleArena"), keccak256("1"), block.chainid, address(this)));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function matchHash(Match calldata terms) public view returns (bytes32) {
        return typedHash(keccak256(abi.encode(MATCH_TYPEHASH, terms.matchId, terms.playerA, terms.playerB, terms.stakeWei, terms.fundingDeadline, terms.refundAfter)));
    }

    function authorize(bytes32 digest, bytes calldata signature) private view {
        require(signature.length == 65, "Invalid signature");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 && (v == 27 || v == 28), "Invalid signature");
        require(ecrecover(digest, v, r, s) == authority, "Unauthorized match");
    }

    function checkedHash(Match calldata terms) private view returns (bytes32 digest) {
        require(terms.matchId != bytes32(0) && terms.playerA != address(0) && terms.playerB != address(0)
            && terms.playerA != terms.playerB && terms.playerA != address(this) && terms.playerB != address(this), "Invalid players");
        require(terms.stakeWei > 0 && terms.stakeWei <= type(uint256).max / 2, "Invalid stake");
        require(terms.fundingDeadline > 0 && terms.fundingDeadline < terms.refundAfter, "Invalid deadlines");
        digest = matchHash(terms);
        State storage state = matches[terms.matchId];
        require(!state.closed && (state.termsHash == bytes32(0) || state.termsHash == digest), "Match closed or changed");
    }

    function fund(Match calldata terms, bytes calldata signature) external nonReentrant {
        bytes32 digest = checkedHash(terms);
        require(block.timestamp <= terms.fundingDeadline, "Funding expired");
        require(msg.sender == terms.playerA || msg.sender == terms.playerB, "Wrong player");
        authorize(digest, signature);
        State storage state = matches[terms.matchId];
        uint8 side = msg.sender == terms.playerA ? 1 : 2;
        require(state.funded & side == 0, "Stake already funded");
        state.termsHash = digest;
        state.funded |= side;
        IArenaToken token = IArenaToken(paymentToken);
        uint256 playerBefore = token.balanceOf(msg.sender);
        uint256 escrowBefore = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), terms.stakeWei), "Transfer failed");
        require(playerBefore >= terms.stakeWei && token.balanceOf(msg.sender) == playerBefore - terms.stakeWei
            && token.balanceOf(address(this)) == escrowBefore + terms.stakeWei, "Wrong token amount");
        emit Funded(terms.matchId, digest, msg.sender, terms.stakeWei);
    }

    function settle(Match calldata terms, address winner, bytes calldata resultSignature) external nonReentrant {
        bytes32 digest = checkedHash(terms);
        require(block.timestamp < terms.refundAfter, "Result expired");
        require(winner == address(0) || winner == terms.playerA || winner == terms.playerB, "Invalid winner");
        authorize(typedHash(keccak256(abi.encode(RESULT_TYPEHASH, terms.matchId, digest, winner))), resultSignature);
        State storage state = matches[terms.matchId];
        state.termsHash = digest;
        state.closed = true;
        if (winner == address(0)) { returnStakes(terms, state.funded); return; }
        require(state.funded == 3, "Both stakes required");
        uint256 pot = terms.stakeWei * 2;
        uint256 tax = pot / 20;
        uint256 share = tax / 10;
        uint256 burned = tax - share * 2;
        IArenaToken token = IArenaToken(paymentToken);
        if (burned > 0) {
            uint256 escrowBefore = token.balanceOf(address(this));
            uint256 supplyBefore = token.totalSupply();
            token.burn(burned);
            require(escrowBefore >= burned && supplyBefore >= burned
                && token.balanceOf(address(this)) == escrowBefore - burned
                && token.totalSupply() == supplyBefore - burned, "Wrong burn amount");
        }
        if (share > 0) {
            transferExact(treasury, share);
            transferExact(devTeam, share);
        }
        transferExact(winner, pot - tax);
        emit Settled(terms.matchId, winner, pot - tax, burned, share, share);
    }

    function refund(Match calldata terms) external nonReentrant {
        checkedHash(terms);
        State storage state = matches[terms.matchId];
        require(state.termsHash != bytes32(0), "Match not funded");
        require(block.timestamp >= terms.refundAfter || state.funded != 3 && block.timestamp > terms.fundingDeadline, "Refund not ready");
        state.closed = true;
        returnStakes(terms, state.funded);
    }

    function returnStakes(Match calldata terms, uint8 funded) private {
        if (funded & 1 != 0) transferExact(terms.playerA, terms.stakeWei);
        if (funded & 2 != 0) transferExact(terms.playerB, terms.stakeWei);
        emit Refunded(terms.matchId, funded, terms.stakeWei);
    }

    function transferExact(address recipient, uint256 amount) private {
        IArenaToken token = IArenaToken(paymentToken);
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        require(token.transfer(recipient, amount), "Transfer failed");
        require(escrowBefore >= amount && token.balanceOf(address(this)) == escrowBefore - amount
            && token.balanceOf(recipient) == recipientBefore + amount, "Wrong token amount");
    }
}
