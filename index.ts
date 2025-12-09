import { type Address, createWalletClient, decodeFunctionData, encodeFunctionData, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// Stargate send() function ABI
const STARGATE_SEND_ABI = [
	{
		type: "function",
		name: "send",
		inputs: [
			{
				name: "_sendParam",
				type: "tuple",
				components: [
					{ name: "dstEid", type: "uint32" },
					{ name: "to", type: "bytes32" },
					{ name: "amountLD", type: "uint256" },
					{ name: "minAmountLD", type: "uint256" },
					{ name: "extraOptions", type: "bytes" },
					{ name: "composeMsg", type: "bytes" },
					{ name: "oftCmd", type: "bytes" },
				],
			},
			{
				name: "_fee",
				type: "tuple",
				components: [
					{ name: "nativeFee", type: "uint256" },
					{ name: "lzTokenFee", type: "uint256" },
				],
			},
			{ name: "_refundAddress", type: "address" },
		],
		outputs: [
			{
				name: "",
				type: "tuple",
				components: [
					{ name: "guid", type: "bytes32" },
					{ name: "nonce", type: "uint64" },
					{
						name: "fee",
						type: "tuple",
						components: [
							{ name: "nativeFee", type: "uint256" },
							{ name: "lzTokenFee", type: "uint256" },
						],
					},
				],
			},
			{
				name: "",
				type: "tuple",
				components: [
					{ name: "amountDebitedLD", type: "uint256" },
					{ name: "amountCreditedLD", type: "uint256" },
				],
			},
		],
		stateMutability: "payable",
	},
] as const;

interface StargateQuote {
	route: string;
	error: string | null;
	srcAmount: string;
	dstAmount: string;
	srcToken: string;
	dstToken: string;
	srcAddress: string;
	dstAddress: string;
	srcChainKey: string;
	dstChainKey: string;
	fees: Array<{
		token: string;
		chainKey: string;
		amount: string;
		type: string;
	}>;
	steps: Array<{
		type: string;
		sender: string;
		chainKey: string;
		transaction: {
			data: string;
			to: string;
			value: string;
			from: string;
		};
	}>;
}

interface QuoteResponse {
	quotes: StargateQuote[];
}

/**
 * Fetches a quote from Stargate API
 */
async function getStargateQuote({
	srcToken,
	srcChainKey,
	dstToken,
	dstChainKey,
	srcAddress,
	dstAddress,
	srcAmount,
	dstAmountMin,
}: {
	srcToken: string;
	srcChainKey: string;
	dstToken: string;
	dstChainKey: string;
	srcAddress: string;
	dstAddress: string;
	srcAmount: string;
	dstAmountMin: string;
}): Promise<QuoteResponse> {
	const params = new URLSearchParams({
		srcToken,
		srcChainKey,
		dstToken,
		dstChainKey,
		srcAddress,
		dstAddress,
		srcAmount,
		dstAmountMin,
	});

	const url = `https://stargate.finance/api/v1/quotes?${params.toString()}`;
	console.log("🌐 Fetching Stargate quote...");
	console.log("  - URL:", url);

	const response = await fetch(url);
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Failed to fetch Stargate quote: ${response.status} ${response.statusText}\n${errorText}`,
		);
	}

	const data = (await response.json()) as QuoteResponse;
	console.log("✅ Quote received");
	console.log(`  - Found ${data.quotes.length} route(s)`);

	return data;
}

/**
 * Decodes Stargate send() calldata
 */
function decodeStargateCalldata(calldata: `0x${string}`) {
	try {
		const decoded = decodeFunctionData({
			abi: STARGATE_SEND_ABI,
			data: calldata,
		});

		return {
			sendParam: decoded.args[0] as {
				dstEid: bigint;
				to: `0x${string}`;
				amountLD: bigint;
				minAmountLD: bigint;
				extraOptions: `0x${string}`;
				composeMsg: `0x${string}`;
				oftCmd: `0x${string}`;
			},
			fee: decoded.args[1] as {
				nativeFee: bigint;
				lzTokenFee: bigint;
			},
			refundAddress: decoded.args[2] as Address,
		};
	} catch (error) {
		throw new Error(
			`Failed to decode calldata: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Encodes Stargate send() calldata with custom refund address
 */
function encodeStargateCalldata(
	sendParam: {
		dstEid: bigint;
		to: `0x${string}`;
		amountLD: bigint;
		minAmountLD: bigint;
		extraOptions: `0x${string}`;
		composeMsg: `0x${string}`;
		oftCmd: `0x${string}`;
	},
	fee: {
		nativeFee: bigint;
		lzTokenFee: bigint;
	},
	refundAddress: Address,
): `0x${string}` {
	return encodeFunctionData({
		abi: STARGATE_SEND_ABI,
		functionName: "send",
		args: [sendParam, fee, refundAddress],
	});
}

/**
 * Main execution
 */
async function main() {
	try {
		console.log("\n🚀 Stargate RefundAddress Override Demo\n");

		// Load private key from environment
		const privateKey = process.env.TEST_PRIVATE_KEY;
		if (!privateKey) {
			throw new Error("TEST_PRIVATE_KEY not found in environment variables");
		}

		const account = privateKeyToAccount(privateKey as `0x${string}`);
		console.log("🔑 Wallet loaded");
		console.log("  - Address:", account.address);

		// Hardcoded refund address for simplicity
		const customRefundAddress = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Address;
		console.log("  - Refund Address:", customRefundAddress, "(hardcoded)");

		// Create wallet client for sending transactions
		const client = createWalletClient({
			account,
			chain: base,
			transport: http(),
		}).extend(publicActions);

		// Configuration: Base USDC to Arbitrum USDC
		const srcToken = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
		const srcChainKey = "base";
		const dstToken = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
		const dstChainKey = "arbitrum";
		const srcAddress = account.address;
		const dstAddress = account.address;
		const srcAmount = "1000000"; // 1 USDC (6 decimals)
		const dstAmountMin = "950000"; // 0.95 USDC (5% slippage)

		console.log("\n📋 Quote Parameters:");
		console.log("  - Source Chain:", srcChainKey);
		console.log("  - Source Token:", srcToken, "(Base USDC)");
		console.log("  - Destination Chain:", dstChainKey);
		console.log("  - Destination Token:", dstToken, "(Arbitrum USDC)");
		console.log(
			"  - Source Amount:",
			srcAmount,
			"units (",
			parseFloat(srcAmount) / 1e6,
			"USDC)",
		);
		console.log(
			"  - Min Destination Amount:",
			dstAmountMin,
			"units (",
			parseFloat(dstAmountMin) / 1e6,
			"USDC)",
		);

		// Fetch quote from Stargate
		const quoteResponse = await getStargateQuote({
			srcToken,
			srcChainKey,
			dstToken,
			dstChainKey,
			srcAddress,
			dstAddress,
			srcAmount,
			dstAmountMin,
		});

		// Filter for Stargate routes only (ignore other routes like "auri")
		const stargateQuotes = quoteResponse.quotes.filter((q) =>
			q.route.startsWith("stargate/"),
		);
		if (stargateQuotes.length === 0) {
			throw new Error("No Stargate routes found in quote response");
		}

		console.log(`\n📊 Found ${stargateQuotes.length} Stargate route(s)`);

		// Process each Stargate route
		for (const quote of stargateQuotes) {
			console.log(`\n🔄 Processing route: ${quote.route}`);
			console.log(`  - Total steps: ${quote.steps.length}`);

			// Find approval and send steps
			// The first step might be an approval (0x095ea7b3), so we need to handle both
			let approvalStep = null;
			let sendStep = null;
			let sendStepIndex = -1;
			for (let i = 0; i < quote.steps.length; i++) {
				const step = quote.steps[i];
				const txData = step.transaction?.data;
				if (txData) {
					const functionSelector = txData.substring(0, 10);
					console.log(`  - Step ${i}: type=${step.type}, selector=${functionSelector}`);
					if (functionSelector === "0x095ea7b3") {
						approvalStep = step;
					} else if (functionSelector === "0xc7c7f5b3") {
						sendStep = step;
						sendStepIndex = i;
					}
				}
			}

			// Handle approval if needed
			if (approvalStep) {
				console.log("\n🔐 Approval step found - sending approval transaction first...");
				console.log("  - To:", approvalStep.transaction.to);
				console.log("  - Data:", approvalStep.transaction.data.substring(0, 66) + "...");
				
				const approvalHash = await client.sendTransaction({
					to: approvalStep.transaction.to as Address,
					data: approvalStep.transaction.data as `0x${string}`,
				});
				console.log("  - Approval hash:", approvalHash);
				console.log("  - Waiting for approval confirmation...");
				
				// Wait for approval to be confirmed
				await client.waitForTransactionReceipt({ hash: approvalHash });
				console.log("  - ✅ Approval confirmed!");
			}

			if (!sendStep) {
				console.warn("  ⚠️  No send() transaction found in steps, skipping...");
				console.log("  - Available steps:", quote.steps.map((s, i) => ({
					index: i,
					type: s.type,
					calldataPrefix: s.transaction?.data?.substring(0, 10),
				})));
				continue;
			}

			console.log(`  - Using step ${sendStepIndex} for send() transaction`);

			const txData = sendStep.transaction.data;
			console.log("  - Found send() transaction in step");
			console.log("  - Original calldata:", `${txData.substring(0, 66)}...`);

			// Decode the original calldata
			const decoded = decodeStargateCalldata(txData as `0x${string}`);
			console.log("\n📖 Decoded Parameters:");
			console.log("  - dstEid:", decoded.sendParam.dstEid.toString());
			console.log("  - to:", decoded.sendParam.to);
			console.log("  - amountLD:", decoded.sendParam.amountLD.toString());
			console.log("  - minAmountLD:", decoded.sendParam.minAmountLD.toString());
			console.log("  - nativeFee:", decoded.fee.nativeFee.toString());
			console.log("  - lzTokenFee:", decoded.fee.lzTokenFee.toString());
			console.log("  - Original refundAddress:", decoded.refundAddress);

			// Override refund address with custom address
			const newRefundAddress = customRefundAddress as Address;
			console.log("\n🔧 Overriding refundAddress...");
			console.log("  - Original refundAddress:", decoded.refundAddress);
			console.log("  - New refundAddress:", newRefundAddress);
			
			// Check if we're actually changing it
			if (decoded.refundAddress.toLowerCase() === newRefundAddress.toLowerCase()) {
				console.warn("  ⚠️  Warning: New refund address is the same as original!");
			}

			// Re-encode with new refund address
			const newCalldata = encodeStargateCalldata(
				decoded.sendParam,
				decoded.fee,
				newRefundAddress,
			);
			console.log("\n✨ Re-encoded calldata:");
			console.log("  - New calldata:", `${newCalldata.substring(0, 66)}...`);
			console.log("  - Calldata length:", newCalldata.length, "characters");

			// Verify the refund address was changed
			const verifyDecoded = decodeStargateCalldata(newCalldata);
			console.log("\n✅ Verification:");
			console.log("  - Verified refundAddress:", verifyDecoded.refundAddress);
			console.log(
				"  - Match:",
				verifyDecoded.refundAddress.toLowerCase() ===
					newRefundAddress.toLowerCase()
					? "✅"
					: "❌",
			);

			// Display transaction details
			const txValue = BigInt(sendStep.transaction.value);
			console.log("\n📤 Transaction Details:");
			console.log("  - To:", sendStep.transaction.to);
			console.log(
				"  - Value:",
				txValue.toString(),
				"wei (",
				parseFloat(txValue.toString()) / 1e18,
				"ETH for gas)",
			);
			console.log("  - Data (new):", newCalldata);

			// Send the transaction with overridden refund address
			console.log("\n⏳ Sending transaction...");
			try {
				const hash = await client.sendTransaction({
					to: sendStep.transaction.to as Address,
					value: txValue,
					data: newCalldata,
				});
				console.log("\n✅ Transaction sent!");
				console.log("  - Hash:", hash);
				console.log("  - Explorer:", `https://basescan.org/tx/${hash}`);
				
				// Wait for confirmation
				console.log("  - Waiting for confirmation...");
				const receipt = await client.waitForTransactionReceipt({ hash });
				console.log("  - ✅ Transaction confirmed!");
				console.log("  - Status:", receipt.status === "success" ? "✅ Success" : "❌ Failed");
				
				// After successful transaction, skip remaining routes (same amount already sent)
				console.log("\n⚠️  Skipping remaining routes (transaction already sent)");
				break;
			} catch (txError: unknown) {
				console.error("\n❌ Transaction failed:");
				if (txError instanceof Error) {
					console.error("  - Error:", txError.message);
					// Try to get more details if available
					if ("data" in txError && txError.data) {
						console.error("  - Error data:", txError.data);
					}
				}
				// Continue to next route instead of throwing
				console.error("  - Continuing to next route...");
				continue;
			}
		}

		console.log("\n✨ Demo completed successfully!\n");
	} catch (error) {
		console.error("\n❌ Error occurred:");
		console.error(
			"  - Message:",
			error instanceof Error ? error.message : String(error),
		);
		if (error instanceof Error && error.stack) {
			console.error("  - Stack:", error.stack);
		}
		process.exit(1);
	}
}

// Run the demo
main();
