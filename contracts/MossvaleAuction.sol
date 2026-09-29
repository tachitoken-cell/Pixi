// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice Native ETH settlement for items escrowed by the Mossvale game server.
/// @dev The game authority binds one buyer and seller to each unique listing.
/// Items remain in game escrow until payment or expiry is finalized on chain.
contract MossvaleAuction {
    struct Order {
        bytes32 listingId;
        address buyer;
        address seller;
        uint256 priceWei;
        uint64 deadline;
    }

    bytes32 private constant ORDER_TYPEHASH = keccak256("Order(bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public authority;
    mapping(bytes32 => bytes32) public paidOrders;
    mapping(address => uint256) public proceeds;
    bool private withdrawing;

    event Purchased(bytes32 indexed listingId, bytes32 indexed orderHash, address indexed buyer, address seller, uint256 priceWei);
    event Withdrawn(address indexed seller, address indexed recipient, uint256 amount);

    constructor(address gameAuthority) {
        require(block.chainid == 4663 || block.chainid == 46630, "Wrong chain");
        require(gameAuthority != address(0), "Missing authority");
        authority = gameAuthority;
    }

    function orderHash(Order calldata order) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleAuction"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(ORDER_TYPEHASH, order.listingId, order.buyer, order.seller, order.priceWei, order.deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function buy(Order calldata order, bytes calldata signature) external payable {
        require(order.listingId != bytes32(0) && paidOrders[order.listingId] == bytes32(0), "Listing paid or invalid");
        require(msg.sender == order.buyer && order.seller != address(0) && order.seller != order.buyer, "Wrong buyer or seller");
        require(order.priceWei > 0 && msg.value == order.priceWei, "Wrong amount");
        require(block.timestamp <= order.deadline, "Order expired");
        require(signature.length == 65, "Invalid signature");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 && (v == 27 || v == 28), "Invalid signature");
        bytes32 digest = orderHash(order);
        require(ecrecover(digest, v, r, s) == authority, "Unauthorized order");
        paidOrders[order.listingId] = digest;
        proceeds[order.seller] += msg.value;
        emit Purchased(order.listingId, digest, order.buyer, order.seller, msg.value);
    }

    /// @notice Sellers withdraw to a wallet they choose; no game key can take proceeds.
    function withdraw(address payable recipient) external {
        require(!withdrawing && recipient != address(0), "Invalid withdrawal");
        uint256 amount = proceeds[msg.sender];
        require(amount > 0, "No proceeds");
        withdrawing = true;
        proceeds[msg.sender] = 0;
        (bool sent,) = recipient.call{value: amount}("");
        require(sent, "Transfer failed");
        withdrawing = false;
        emit Withdrawn(msg.sender, recipient, amount);
    }
}
