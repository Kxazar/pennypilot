// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title AgentExpenseCard
/// @notice Spend controls and audit receipts for AI agents buying sub-cent API facts.
/// @dev Use asset = address(0) for Arc native USDC, or an ERC20 address for token escrow.
contract AgentExpenseCard {
    enum FundingMode {
        PolicyOnly,
        Escrowed
    }

    enum SettlementRail {
        X402Gateway,
        VaultTransfer,
        ExternalRail
    }

    struct Provider {
        bool allowed;
        bool paused;
        uint256 totalRecorded;
        string metadataURI;
    }

    struct Task {
        address agent;
        FundingMode mode;
        uint128 budget;
        uint128 spent;
        uint128 maxPerCall;
        uint64 expiresAt;
        bool closed;
        bool requireProviderSignature;
        bytes32 purposeHash;
    }

    struct SpendReceiptInput {
        address provider;
        uint128 amount;
        SettlementRail rail;
        bytes32 requestHash;
        bytes32 receiptHash;
        bytes providerSignature;
    }

    bytes32 public constant RECEIPT_TYPEHASH = keccak256(
        "AgentExpenseReceipt(uint256 chainId,address card,uint256 taskId,address agent,address provider,uint128 amount,uint8 rail,bytes32 requestHash,bytes32 receiptHash)"
    );
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable asset;
    address public owner;
    bool public paused;
    uint256 public nextTaskId = 1;
    uint256 public escrowReserved;
    uint256 public totalRecordedSpend;

    mapping(address provider => Provider) public providers;
    mapping(uint256 taskId => Task) public tasks;
    mapping(uint256 taskId => mapping(address provider => uint256 amount)) public taskProviderSpend;
    mapping(uint256 taskId => mapping(bytes32 receiptHash => bool used)) public usedReceiptHashes;

    uint256 private locked = 1;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PausedSet(bool paused);
    event ProviderSet(address indexed provider, bool allowed, bool paused, string metadataURI);
    event TaskCreated(
        uint256 indexed taskId,
        address indexed agent,
        FundingMode mode,
        uint256 budget,
        uint256 maxPerCall,
        uint64 expiresAt,
        bytes32 indexed purposeHash,
        bool requireProviderSignature
    );
    event SpendRecorded(
        uint256 indexed taskId,
        address indexed agent,
        address indexed provider,
        uint256 amount,
        SettlementRail rail,
        bytes32 requestHash,
        bytes32 receiptHash,
        uint256 taskSpent,
        uint256 providerTotal
    );
    event TaskClosed(uint256 indexed taskId, address indexed refundTo, uint256 refundAmount);
    event UnassignedSwept(address indexed to, uint256 amount);

    error AmountZero();
    error BudgetExceeded();
    error EscrowFundingMismatch();
    error EscrowTransferFailed();
    error InvalidAgent();
    error InvalidBudget();
    error InvalidProvider();
    error InvalidReceipt();
    error InvalidRail();
    error InvalidSignature();
    error InvalidRecipient();
    error InvalidTokenTransfer();
    error NotAuthorized();
    error NotOwner();
    error Paused();
    error PerCallCapExceeded();
    error ProviderUnavailable();
    error ProviderSignatureRequired();
    error ReceiptAlreadyUsed();
    error Reentrancy();
    error TaskClosedOrMissing();
    error TaskExpired();
    error UnexpectedNativeAsset();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) {
            revert Reentrancy();
        }
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address asset_) {
        asset = asset_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    receive() external payable {
        if (asset != address(0)) {
            revert UnexpectedNativeAsset();
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidRecipient();
        }
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setProvider(
        address provider,
        bool allowed,
        bool providerPaused,
        string calldata metadataURI
    ) external onlyOwner {
        _setProvider(provider, allowed, providerPaused, metadataURI);
    }

    function setProviders(address[] calldata providerList) external onlyOwner {
        uint256 count = providerList.length;
        for (uint256 index = 0; index < count; index++) {
            _setProvider(providerList[index], true, false, "");
        }
    }

    function _setProvider(
        address provider,
        bool allowed,
        bool providerPaused,
        string memory metadataURI
    ) private {
        if (provider == address(0)) {
            revert InvalidProvider();
        }
        Provider storage stored = providers[provider];
        stored.allowed = allowed;
        stored.paused = providerPaused;
        stored.metadataURI = metadataURI;
        emit ProviderSet(provider, allowed, providerPaused, metadataURI);
    }

    function createPolicyTask(
        address agent,
        uint128 budget,
        uint128 maxPerCall,
        uint64 expiresAt,
        bytes32 purposeHash
    ) external onlyOwner returns (uint256 taskId) {
        taskId = _createTask(agent, FundingMode.PolicyOnly, budget, maxPerCall, expiresAt, purposeHash, false);
    }

    function createStrictPolicyTask(
        address agent,
        uint128 budget,
        uint128 maxPerCall,
        uint64 expiresAt,
        bytes32 purposeHash
    ) external onlyOwner returns (uint256 taskId) {
        taskId = _createTask(agent, FundingMode.PolicyOnly, budget, maxPerCall, expiresAt, purposeHash, true);
    }

    function fundEscrowTask(
        address agent,
        uint128 budget,
        uint128 maxPerCall,
        uint64 expiresAt,
        bytes32 purposeHash
    ) external payable onlyOwner nonReentrant returns (uint256 taskId) {
        if (asset == address(0)) {
            if (msg.value != budget) {
                revert EscrowFundingMismatch();
            }
        } else {
            if (msg.value != 0) {
                revert UnexpectedNativeAsset();
            }
            uint256 balanceBefore = IERC20Like(asset).balanceOf(address(this));
            _safeTransferFrom(asset, msg.sender, address(this), budget);
            uint256 balanceAfter = IERC20Like(asset).balanceOf(address(this));
            if (balanceAfter != balanceBefore + budget) {
                revert InvalidTokenTransfer();
            }
        }

        escrowReserved += budget;
        taskId = _createTask(agent, FundingMode.Escrowed, budget, maxPerCall, expiresAt, purposeHash, false);
    }

    function recordSpend(
        uint256 taskId,
        address provider,
        uint128 amount,
        SettlementRail rail,
        bytes32 requestHash,
        bytes32 receiptHash
    ) external nonReentrant {
        _recordSpend(taskId, provider, amount, rail, requestHash, receiptHash, false);
    }

    function recordSpendWithProviderSignature(
        uint256 taskId,
        address provider,
        uint128 amount,
        SettlementRail rail,
        bytes32 requestHash,
        bytes32 receiptHash,
        bytes calldata providerSignature
    ) external nonReentrant {
        address signer = _recoverSigner(
            receiptDigest(taskId, provider, amount, rail, requestHash, receiptHash),
            providerSignature
        );
        if (signer != provider) {
            revert InvalidSignature();
        }
        _recordSpend(taskId, provider, amount, rail, requestHash, receiptHash, true);
    }

    function recordSpendsWithProviderSignatures(
        uint256 taskId,
        SpendReceiptInput[] calldata receipts
    ) external nonReentrant {
        uint256 count = receipts.length;
        if (count == 0) {
            revert InvalidReceipt();
        }
        for (uint256 index = 0; index < count; index++) {
            SpendReceiptInput calldata receipt = receipts[index];
            address signer = _recoverSigner(
                receiptDigest(
                    taskId,
                    receipt.provider,
                    receipt.amount,
                    receipt.rail,
                    receipt.requestHash,
                    receipt.receiptHash
                ),
                receipt.providerSignature
            );
            if (signer != receipt.provider) {
                revert InvalidSignature();
            }
            _recordSpend(
                taskId,
                receipt.provider,
                receipt.amount,
                receipt.rail,
                receipt.requestHash,
                receipt.receiptHash,
                true
            );
        }
    }

    function receiptDigest(
        uint256 taskId,
        address provider,
        uint128 amount,
        SettlementRail rail,
        bytes32 requestHash,
        bytes32 receiptHash
    ) public view returns (bytes32) {
        return _toEthSignedMessageHash(
            receiptStructHash(taskId, provider, amount, rail, requestHash, receiptHash)
        );
    }

    function receiptStructHash(
        uint256 taskId,
        address provider,
        uint128 amount,
        SettlementRail rail,
        bytes32 requestHash,
        bytes32 receiptHash
    ) public view returns (bytes32) {
        Task storage task = tasks[taskId];
        return keccak256(
            abi.encode(
                RECEIPT_TYPEHASH,
                block.chainid,
                address(this),
                taskId,
                task.agent,
                provider,
                amount,
                uint8(rail),
                requestHash,
                receiptHash
            )
        );
    }

    function _recordSpend(
        uint256 taskId,
        address provider,
        uint128 amount,
        SettlementRail rail,
        bytes32 requestHash,
        bytes32 receiptHash,
        bool providerSigned
    ) private {
        if (paused) {
            revert Paused();
        }
        if (amount == 0) {
            revert AmountZero();
        }
        if (receiptHash == bytes32(0)) {
            revert InvalidReceipt();
        }

        Task storage task = tasks[taskId];
        if (task.agent == address(0) || task.closed) {
            revert TaskClosedOrMissing();
        }
        if (msg.sender != task.agent && msg.sender != owner) {
            revert NotAuthorized();
        }
        if (task.requireProviderSignature && !providerSigned) {
            revert ProviderSignatureRequired();
        }
        if (block.timestamp > task.expiresAt) {
            revert TaskExpired();
        }
        if (amount > task.maxPerCall) {
            revert PerCallCapExceeded();
        }
        if (uint256(task.spent) + amount > task.budget) {
            revert BudgetExceeded();
        }
        if (usedReceiptHashes[taskId][receiptHash]) {
            revert ReceiptAlreadyUsed();
        }

        Provider storage storedProvider = providers[provider];
        if (!storedProvider.allowed || storedProvider.paused) {
            revert ProviderUnavailable();
        }

        if (task.mode == FundingMode.Escrowed && rail != SettlementRail.VaultTransfer) {
            revert InvalidRail();
        }
        if (task.mode == FundingMode.PolicyOnly && rail == SettlementRail.VaultTransfer) {
            revert InvalidRail();
        }

        task.spent += amount;
        taskProviderSpend[taskId][provider] += amount;
        storedProvider.totalRecorded += amount;
        totalRecordedSpend += amount;
        usedReceiptHashes[taskId][receiptHash] = true;

        if (task.mode == FundingMode.Escrowed) {
            escrowReserved -= amount;
            _sendAsset(provider, amount);
        }

        emit SpendRecorded(
            taskId,
            task.agent,
            provider,
            amount,
            rail,
            requestHash,
            receiptHash,
            task.spent,
            storedProvider.totalRecorded
        );
    }

    function closeTask(uint256 taskId, address refundTo) external nonReentrant {
        Task storage task = tasks[taskId];
        if (task.agent == address(0) || task.closed) {
            revert TaskClosedOrMissing();
        }
        if (msg.sender != task.agent && msg.sender != owner) {
            revert NotAuthorized();
        }
        if (refundTo == address(0)) {
            revert InvalidRecipient();
        }

        task.closed = true;
        uint256 refundAmount;
        if (task.mode == FundingMode.Escrowed) {
            refundAmount = task.budget - task.spent;
            escrowReserved -= refundAmount;
            if (refundAmount != 0) {
                _sendAsset(refundTo, refundAmount);
            }
        }

        emit TaskClosed(taskId, refundTo, refundAmount);
    }

    function sweepUnassigned(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert AmountZero();
        }
        if (amount > unassignedBalance()) {
            revert BudgetExceeded();
        }
        _sendAsset(to, amount);
        emit UnassignedSwept(to, amount);
    }

    function taskRemaining(uint256 taskId) external view returns (uint256) {
        Task storage task = tasks[taskId];
        if (task.agent == address(0)) {
            return 0;
        }
        return task.budget - task.spent;
    }

    function unassignedBalance() public view returns (uint256) {
        uint256 balance = asset == address(0)
            ? address(this).balance
            : IERC20Like(asset).balanceOf(address(this));
        if (balance <= escrowReserved) {
            return 0;
        }
        return balance - escrowReserved;
    }

    function _createTask(
        address agent,
        FundingMode mode,
        uint128 budget,
        uint128 maxPerCall,
        uint64 expiresAt,
        bytes32 purposeHash,
        bool requireProviderSignature
    ) private returns (uint256 taskId) {
        if (agent == address(0)) {
            revert InvalidAgent();
        }
        if (budget == 0 || maxPerCall == 0 || maxPerCall > budget) {
            revert InvalidBudget();
        }
        if (expiresAt <= block.timestamp) {
            revert TaskExpired();
        }

        taskId = nextTaskId;
        nextTaskId += 1;
        tasks[taskId] = Task({
            agent: agent,
            mode: mode,
            budget: budget,
            spent: 0,
            maxPerCall: maxPerCall,
            expiresAt: expiresAt,
            closed: false,
            requireProviderSignature: requireProviderSignature,
            purposeHash: purposeHash
        });

        emit TaskCreated(taskId, agent, mode, budget, maxPerCall, expiresAt, purposeHash, requireProviderSignature);
    }

    function _sendAsset(address to, uint256 amount) private {
        if (asset == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            if (!success) {
                revert EscrowTransferFailed();
            }
        } else {
            _safeTransfer(asset, to, amount);
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Like.transfer.selector, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert InvalidTokenTransfer();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Like.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert InvalidTokenTransfer();
        }
    }

    function _toEthSignedMessageHash(bytes32 digest) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) {
            revert InvalidSignature();
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > SECP256K1N_HALF) {
            revert InvalidSignature();
        }
        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) {
            revert InvalidSignature();
        }

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) {
            revert InvalidSignature();
        }
    }
}
