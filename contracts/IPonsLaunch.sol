// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice Interfaces for the existing PONS v2 contracts on Robinhood Chain.
/// @dev The factory deploys the fixed-supply token; no separate ERC-20 is needed.
/// Sources: https://docs.ponsfamily.com/v2 and exact-match Sourcify chain 4663.
interface IPonsLaunchFactory {
    struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }
    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }
    struct LaunchConfig {
        uint256 supply;
        uint256 curveFeeBps;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        bool enabled;
    }
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }
    function launchFee() external view returns (uint256);
    function launchForwarder() external view returns (address);
    function canLaunch(address account) external view returns (bool);
    function getLaunchConfig(uint256 id) external view returns (LaunchConfig memory);
    function approvedPairTokens(address pairToken) external view returns (bool);
    function pairTokenEconomics(address pairToken) external view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals);
    function previewLaunchEconomics(uint256 id, address pairToken) external view returns (bytes32);
    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
    function launchToken(TokenParams calldata params, uint256 id, address pairToken) external payable returns (address token, address curve);
    event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold);
}

interface IPonsLaunchAndBuy {
    function factory() external view returns (address);
    function launchAndBuy(
        IPonsLaunchFactory.TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        uint256 quoteIn,
        uint256 minTokensOut,
        address recipient,
        address[] calldata snipeTaxExemptions
    ) external payable returns (address token, address curve, uint256 tokensOut);
    event Launched(address indexed token, address indexed curve, address indexed recipient, address launcher, uint256 quoteSpent, uint256 tokensReceived);
}

interface IPonsLaunchCurve {
    function pairToken() external view returns (address);
    function feeBps() external view returns (uint256);
    function creatorTaxBps() external view returns (uint256);
    function currentSnipeTaxBps(address recipient) external view returns (uint256);
    function getReserves() external view returns (uint256 quoteReserve, uint256 tokenReserve);
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256 tokensOut);
    event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax);
}

interface IPonsLaunchToken {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function launchFactory() external view returns (address);
    function curve() external view returns (address);
    function getTokenInfo() external view returns (address tokenDeployer, string memory tokenLogo, string memory tokenDescription, IPonsLaunchFactory.Socials memory tokenSocials);
}
