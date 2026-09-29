// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

interface IERC20 {
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function burn(uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice MOSS settlement for items escrowed by the Mossvale game server.
/// @dev One fixed token on Robinhood mainnet; token transfer fees, rebases, and native payments are unsupported.
contract MossvaleTokenAuction {
    struct Order {
        bytes32 listingId;
        address buyer;
        address seller;
        uint256 priceWei;
        uint64 deadline;
        address referrer;
        uint16 referralBps;
    }

    bytes32 private constant ORDER_TYPEHASH = keccak256("Order(bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline,address referrer,uint16 referralBps)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    address public constant devTeam = 0x6D96b833C760774175Cc6E2c4F7424122EA3798f;
    uint256 public constant TAX_BPS = 500;
    address public authority;
    address public treasury;
    mapping(bytes32 => bytes32) public paidOrders;
    mapping(address => uint256) public proceeds;
    bool private entered;

    event Purchased(bytes32 indexed listingId, bytes32 indexed orderHash, address indexed buyer, address seller, uint256 priceWei);
    event TaxPaid(bytes32 indexed listingId, address indexed treasury, address indexed devTeam, uint256 burned, uint256 treasuryAmount, uint256 devAmount);
    event ReferralPaid(bytes32 indexed listingId, address indexed referrer, uint256 amount, uint16 referralBps);
    event Withdrawn(address indexed seller, address indexed recipient, uint256 amount);

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

    function orderHash(Order calldata order) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleTokenAuction"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(ORDER_TYPEHASH, order.listingId, order.buyer, order.seller, order.priceWei, order.deadline, order.referrer, order.referralBps));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function buy(Order calldata order, bytes calldata signature) external nonReentrant {
        require(order.listingId != bytes32(0) && paidOrders[order.listingId] == bytes32(0), "Listing paid or invalid");
        require(msg.sender == order.buyer && order.seller != address(0) && order.seller != order.buyer, "Wrong buyer or seller");
        require(order.priceWei > 0, "Wrong amount");
        require(order.referralBps == 0 ? order.referrer == address(0)
            : (order.referralBps == 10 || order.referralBps == 25 || order.referralBps == 50 || order.referralBps == 75 || order.referralBps == 100) && order.referrer != address(0)
                && order.referrer != order.buyer && order.referrer != order.seller && order.referrer != address(this), "Invalid referral");
        require(block.timestamp <= order.deadline, "Order expired");
        require(signature.length == 65, "Invalid signature");
        bytes32 digest = orderHash(order);
        {
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 && (v == 27 || v == 28), "Invalid signature");
        require(ecrecover(digest, v, r, s) == authority, "Unauthorized order");
        }
        paidOrders[order.listingId] = digest;
        uint256 tax = order.priceWei / 20; // Fixed 5%, rounded down to the smallest MOSS unit without multiplication overflow.
        proceeds[order.seller] += order.priceWei - tax;
        IERC20 token = IERC20(paymentToken);
        {
        uint256 buyerBefore = token.balanceOf(order.buyer);
        uint256 escrowBefore = token.balanceOf(address(this));
        require(token.transferFrom(order.buyer, address(this), order.priceWei), "Transfer failed");
        require(buyerBefore >= order.priceWei && token.balanceOf(order.buyer) == buyerBefore - order.priceWei
            && token.balanceOf(address(this)) == escrowBefore + order.priceWei, "Wrong token amount");
        }
        uint256 share = tax / 4;
        uint256 burned = tax - 2 * share; // Half the fee burns before referrals; indivisible tax remainder burns too.
        if (order.referralBps > 0) {
            uint256 reward = order.priceWei / 10000 * order.referralBps
                + (order.priceWei % 10000) * order.referralBps / 10000; // Basis points of the full price, rounded down without overflow.
            burned -= reward;
            proceeds[order.referrer] += reward;
            emit ReferralPaid(order.listingId, order.referrer, reward, order.referralBps);
        }
        if (burned > 0) {
            uint256 escrowBefore = token.balanceOf(address(this));
            uint256 supplyBefore = token.totalSupply();
            token.burn(burned);
            require(escrowBefore >= burned && supplyBefore >= burned
                && token.balanceOf(address(this)) == escrowBefore - burned
                && token.totalSupply() == supplyBefore - burned, "Wrong burn amount");
        }
        if (share > 0) {
            transferExact(token, treasury, share);
            transferExact(token, devTeam, share);
        }
        emit TaxPaid(order.listingId, treasury, devTeam, burned, share, share);
        emit Purchased(order.listingId, digest, order.buyer, order.seller, order.priceWei);
    }

    /// @notice Sellers and referrers withdraw their own proceeds, to a recipient they choose.
    function withdraw(address recipient) external nonReentrant {
        require(recipient != address(0) && recipient != address(this), "Invalid withdrawal");
        uint256 amount = proceeds[msg.sender];
        require(amount > 0, "No proceeds");
        proceeds[msg.sender] = 0;
        transferExact(IERC20(paymentToken), recipient, amount);
        emit Withdrawn(msg.sender, recipient, amount);
    }

    function transferExact(IERC20 token, address recipient, uint256 amount) private {
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        require(token.transfer(recipient, amount), "Transfer failed");
        require(escrowBefore >= amount && token.balanceOf(address(this)) == escrowBefore - amount
            && token.balanceOf(recipient) == recipientBefore + amount, "Wrong token amount");
    }
}
