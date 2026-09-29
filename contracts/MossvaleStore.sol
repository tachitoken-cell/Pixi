// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

interface IMossBurnable {
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function burnFrom(address owner, uint256 amount) external;
}

/// @notice Burns MOSS for a server-authorized character reward. Holds no funds.
contract MossvaleStore {
    struct Order {
        bytes32 orderId;
        bytes32 productId;
        bytes32 characterId;
        address buyer;
        uint256 amountWei;
        uint256 usdCents;
        uint64 deadline;
    }
    bytes32 private constant ORDER_TYPEHASH = keccak256("Order(bytes32 orderId,bytes32 productId,bytes32 characterId,address buyer,uint256 amountWei,uint256 usdCents,uint64 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    address public authority;
    mapping(bytes32 => bytes32) public paidOrders;
    bool private entered;
    event Purchased(bytes32 indexed orderId, bytes32 indexed orderHash, address indexed buyer, bytes32 productId, bytes32 characterId, uint256 amountWei, uint256 usdCents);

    constructor(address gameAuthority) {
        require(block.chainid == 4663, "Wrong chain");
        require(gameAuthority != address(0), "Missing authority");
        require(paymentToken.code.length > 0, "Missing MOSS token");
        authority = gameAuthority;
    }

    function orderHash(Order calldata order) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("MossvaleStore"), keccak256("1"), block.chainid, address(this)));
        bytes32 data = keccak256(abi.encode(ORDER_TYPEHASH, order.orderId, order.productId, order.characterId, order.buyer, order.amountWei, order.usdCents, order.deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, data));
    }

    function buy(Order calldata order, bytes calldata signature) external {
        require(!entered, "Reentrant call");
        entered = true;
        require(order.orderId != bytes32(0) && paidOrders[order.orderId] == bytes32(0), "Order paid or invalid");
        require(order.productId != bytes32(0) && order.characterId != bytes32(0) && msg.sender == order.buyer, "Wrong reward or buyer");
        require(order.amountWei > 0 && (order.usdCents == 200 || order.usdCents == 500 || order.usdCents == 2000 || order.usdCents == 4000 || order.usdCents == 5000 || order.usdCents == 10000), "Wrong amount");
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
        paidOrders[order.orderId] = digest;
        {
        IMossBurnable token = IMossBurnable(paymentToken);
        uint256 balance = token.balanceOf(order.buyer);
        uint256 supply = token.totalSupply();
        token.burnFrom(order.buyer, order.amountWei);
        require(balance >= order.amountWei && supply >= order.amountWei
            && token.balanceOf(order.buyer) == balance - order.amountWei
            && token.totalSupply() == supply - order.amountWei, "Wrong burn amount");
        }
        emit Purchased(order.orderId, digest, order.buyer, order.productId, order.characterId, order.amountWei, order.usdCents);
        entered = false;
    }
}
