// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMossBurnToken is IERC20 { function burn(uint256 amount) external; }
interface IWrappedNative is IERC20 { function deposit() external payable; }
interface IMossSwapRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}
interface IMossPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @notice Shared 5% royalty receiver. MOSS is burned; other receipts wait for an authorized buy-and-burn.
contract MossvaleBuyBurn is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
    // Constructor-only configuration, with no withdrawal or arbitrary-call function.
    address public swapRouter;
    address public wrappedNative;
    address public permit2;
    uint256 public totalMossBurned;

    event MossBurned(uint256 amount);
    event BoughtAndBurned(address indexed tokenIn, uint256 amountIn, uint256 mossBurned);

    constructor(address operator, address router, address weth, address tokenPermit2) Ownable(operator) {
        require(block.chainid == 4663, "Wrong chain");
        require(paymentToken.code.length > 0 && router.code.length > 0 && weth.code.length > 0
            && tokenPermit2.code.length > 0, "Missing token or router");
        require(weth != paymentToken, "Invalid wrapped token");
        swapRouter = router;
        wrappedNative = weth;
        permit2 = tokenPermit2;
    }

    receive() external payable {}

    function burnMoss(uint256 amount) external nonReentrant { _burn(amount); }

    /// @dev Owner supplies an independently priced quote. A public caller must never choose the slippage bound.
    /// The trusted operator must quote fair value off-chain; this contract is not a price oracle.
    function buyAndBurn(address tokenIn, uint256 amountIn, uint256 minMossOut, uint256 deadline, bytes calldata commands, bytes[] calldata inputs)
        external onlyOwner nonReentrant
    {
        require(amountIn > 0 && amountIn <= type(uint160).max && minMossOut > 0 && tokenIn != paymentToken, "Invalid quote");
        require(deadline >= block.timestamp && deadline <= block.timestamp + 5 minutes, "Invalid deadline");
        require(commands.length > 0 && commands.length == inputs.length, "Invalid router commands");
        address input = tokenIn == address(0) ? wrappedNative : tokenIn;
        require(input.code.length > 0, "Missing input token");
        if (tokenIn == address(0)) {
            require(address(this).balance >= amountIn, "Insufficient native fees");
            uint256 wrappedBefore = IERC20(input).balanceOf(address(this));
            IWrappedNative(input).deposit{value: amountIn}();
            require(IERC20(input).balanceOf(address(this)) == wrappedBefore + amountIn, "Incorrect wrapping");
        }
        IERC20 inputToken = IERC20(input);
        uint256 inputBefore = inputToken.balanceOf(address(this));
        uint256 mossBefore = IERC20(paymentToken).balanceOf(address(this));
        require(inputBefore >= amountIn, "Insufficient collected fees");
        inputToken.forceApprove(permit2, amountIn);
        IMossPermit2(permit2).approve(input, swapRouter, uint160(amountIn), uint48(deadline));
        IMossSwapRouter(swapRouter).execute(commands, inputs, deadline);
        IMossPermit2(permit2).approve(input, swapRouter, 0, 0);
        inputToken.forceApprove(permit2, 0);
        require(inputToken.balanceOf(address(this)) == inputBefore - amountIn, "Incorrect swap input");
        uint256 bought = IERC20(paymentToken).balanceOf(address(this)) - mossBefore;
        require(bought >= minMossOut, "Insufficient MOSS output");
        _burn(bought);
        emit BoughtAndBurned(tokenIn, amountIn, bought);
    }

    function _burn(uint256 amount) private {
        IMossBurnToken token = IMossBurnToken(paymentToken);
        uint256 balance = token.balanceOf(address(this));
        uint256 supply = token.totalSupply();
        require(amount > 0 && balance >= amount && supply >= amount, "Invalid burn amount");
        token.burn(amount);
        require(token.balanceOf(address(this)) == balance - amount && token.totalSupply() == supply - amount, "Incorrect MOSS burn");
        totalMossBurned += amount;
        emit MossBurned(amount);
    }
}
